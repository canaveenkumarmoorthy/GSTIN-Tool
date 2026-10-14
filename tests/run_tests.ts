import fs from 'fs';
import path from 'path';
import assert from 'assert';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';

import { FilesystemSandbox } from '../server/security/sandbox.ts';
import { CredentialVault } from '../server/security/vault.ts';
import { JobManager } from '../server/state/jobManager.ts';
import { SummaryAdapter } from '../server/adapters/summaryAdapter.ts';
import { ClientStore } from '../server/storage/clientStore.ts';
import { DownloaderAdapter } from '../server/adapters/downloaderAdapter.ts';

const TEST_DATA_DIR = path.resolve(process.cwd(), 'data/test_run');

async function runAllTests() {
  console.log('\n======================================================');
  console.log('  RUNNING CA TAX & GST AUTOMATION SUITE TEST SUITE');
  console.log('======================================================\n');

  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // TEST 1: Filesystem Sandbox & Path Traversal Defense
  await test('FilesystemSandbox rejects path traversal attempts', () => {
    const sandboxRoot = path.join(TEST_DATA_DIR, 'sandbox_client');
    fs.mkdirSync(sandboxRoot, { recursive: true });

    // Valid inside path
    const valid = FilesystemSandbox.resolveSecurePath(sandboxRoot, 'reports/2026.xlsx');
    assert.strictEqual(valid, path.join(sandboxRoot, 'reports/2026.xlsx'));

    // Malicious traversal attempts
    assert.throws(() => {
      FilesystemSandbox.resolveSecurePath(sandboxRoot, '../../etc/passwd');
    }, /escapes authorized sandbox boundary/);

    assert.throws(() => {
      FilesystemSandbox.resolveSecurePath(sandboxRoot, 'sub/../../outside.txt');
    }, /escapes authorized sandbox boundary/);

    assert.throws(() => {
      FilesystemSandbox.resolveSecurePath(sandboxRoot, 'null\0byte.txt');
    }, /null byte in path/);
  });

  // TEST 2: Zip-Slip Vulnerability Prevention
  await test('FilesystemSandbox prevents Zip-Slip extraction attacks', async () => {
    const zipDest = path.join(TEST_DATA_DIR, 'zip_dest');
    fs.mkdirSync(zipDest, { recursive: true });

    const zip = new AdmZip();
    zip.addFile('safe_file.txt', Buffer.from('hello'));
    zip.addFile('escape.txt', Buffer.from('exploit'));
    // Force malicious path on the second entry header to test zip-slip detection
    zip.getEntries()[1].entryName = '../malicious_escape.txt';

    const maliciousZipPath = path.join(TEST_DATA_DIR, 'malicious.zip');
    zip.writeZip(maliciousZipPath);

    await assert.rejects(async () => {
      await FilesystemSandbox.extractZipSafely(maliciousZipPath, zipDest);
    }, /Zip-Slip attempt/);

    // Verify escape file was NOT created outside
    const outsideFile = path.resolve(zipDest, '../malicious_escape.txt');
    assert.strictEqual(fs.existsSync(outsideFile), false);
  });

  // TEST 3: Authenticated AES-256-GCM Vault
  await test('CredentialVault encrypts and decrypts with AES-256-GCM and PBKDF2', () => {
    const vault = new CredentialVault(TEST_DATA_DIR, 'test_master_passphrase', 'test_salt_123');

    const ref = vault.storeCredential('client_001', 'INCOME_TAX', 'user_john', 'SuperSecretPass@2026');
    assert.ok(ref.startsWith('ref_'), 'Reference token generated');

    // Retrieve credential internally
    const cred = vault.getCredential('client_001', 'INCOME_TAX');
    assert.ok(cred, 'Credential retrieved');
    assert.strictEqual(cred?.username, 'user_john');
    assert.strictEqual(cred?.password, 'SuperSecretPass@2026');

    // Verify masked ref does not expose password
    const masked = vault.getMaskedRef('client_001', 'INCOME_TAX');
    assert.strictEqual(masked.exists, true);
    assert.strictEqual(masked.username, 'user_john');
    assert.ok(masked.ref?.includes('••••••••'));
    assert.ok(!JSON.stringify(masked).includes('SuperSecretPass@2026'));
  });

  // TEST 4: Zero-Loss Dynamic Filtering (Cell Blankness Precision)
  await test('Zero-Loss filtering strictly preserves 0, false, formulas, dates, and GSTIN/PAN', async () => {
    const vault = new CredentialVault(TEST_DATA_DIR);
    const clientStore = new ClientStore(TEST_DATA_DIR, vault);
    const jobManager = new JobManager(TEST_DATA_DIR);
    const summaryAdapter = new SummaryAdapter(jobManager, clientStore, process.cwd());

    // Create test workbook
    const testWb = new ExcelJS.Workbook();
    const ws = testWb.addWorksheet('TaxTest');

    ws.addRow(['Description', 'Amount', 'Tax Rate', 'Formula Result', 'Date', 'Identifier', 'Flag']);
    
    // Non-blank with zero and formula
    ws.addRow(['Exempt Sales', 0, 0, { formula: 'B2*C2', result: 0 }, new Date('2026-04-01'), '27AABCA1234F1Z5', false]);

    // Completely blank row (should be pruned)
    ws.addRow([null, null, '', null, undefined, '', null]);

    // Another non-blank row with PAN
    ws.addRow(['Professional Fees', 50000, 0.18, { formula: 'B4*C4', result: 9000 }, new Date('2026-04-05'), 'AABCA1234F', true]);

    // Completely blank row (spaces only, should be pruned)
    ws.addRow(['   ', '  ', '', null, undefined, '', '   ']);

    const inputWbPath = path.join(TEST_DATA_DIR, 'input_test_raw.xlsx');
    await testWb.xlsx.writeFile(inputWbPath);

    const outputDir = path.join(TEST_DATA_DIR, 'output_test');
    fs.mkdirSync(outputDir, { recursive: true });

    const stats = await summaryAdapter.processSingleWorkbook(inputWbPath, outputDir, {
      pruneEmptyRows: true,
      pruneEmptyColumns: false
    });

    assert.strictEqual(stats.totalInputRows, 5, '5 input rows scanned');
    assert.strictEqual(stats.blankRowsRemoved, 2, 'Exactly 2 completely blank rows pruned');
    assert.strictEqual(stats.preservedRows, 3, 'Header + 2 non-blank data rows preserved');
    assert.ok(stats.zeroValuesPreserved >= 2, 'Numeric zeros preserved');
    assert.ok(stats.formulasPreserved >= 2, 'Formulas preserved');
    assert.ok(stats.datesPreserved >= 2, 'Dates preserved');
    assert.ok(stats.taxIdentifiersPreserved >= 2, 'GSTIN and PAN preserved');

    // Read back generated workbook to verify contents
    const outputWb = new ExcelJS.Workbook();
    await outputWb.xlsx.readFile(stats.outputWorkbookPath);
    const outSheet = outputWb.getWorksheet('TaxTest')!;
    assert.strictEqual(outSheet.rowCount, 3, 'Output worksheet has exactly 3 rows');
    
    // Check row 2 (zero value row)
    const row2 = outSheet.getRow(2);
    assert.strictEqual(row2.getCell(2).value, 0, 'Cell with 0 value preserved intact');
    assert.strictEqual(row2.getCell(7).value, false, 'Cell with boolean false preserved intact');
  });

  // TEST 5: Legacy .xls Handling
  await test('Legacy .xls files are recorded as unsupported without corruption', async () => {
    const vault = new CredentialVault(TEST_DATA_DIR);
    const clientStore = new ClientStore(TEST_DATA_DIR, vault);
    const client = clientStore.getAllClients()[0];
    const jobManager = new JobManager(TEST_DATA_DIR);
    const summaryAdapter = new SummaryAdapter(jobManager, clientStore, process.cwd());

    const clientInputDir = path.resolve(process.cwd(), client.inputDirectory);
    fs.mkdirSync(clientInputDir, { recursive: true });

    const mockXls = path.join(clientInputDir, 'legacy_ledger.xls');
    fs.writeFileSync(mockXls, 'MOCK_BIFF8_CONTENT_SAMPLE', 'utf-8');

    const job = jobManager.createJob({
      type: 'SUMMARY_PREPARER',
      clientId: client.id,
      clientName: client.name,
      mode: 'DEMO'
    });

    await summaryAdapter.executeJob(job.id, { pruneEmptyRows: true });

    const finishedJob = jobManager.getJob(job.id)!;
    assert.strictEqual(finishedJob.status, 'COMPLETED');
    assert.ok(finishedJob.manifest, 'Manifest produced');
    
    const unsupported = finishedJob.manifest?.unsupportedFiles || [];
    const foundXls = unsupported.find((u: any) => u.filename === 'legacy_ledger.xls');
    assert.ok(foundXls, 'Legacy .xls detected in unsupportedFiles list');
    assert.strictEqual(foundXls.actionTaken, 'PRESERVED_UNMODIFIED');

    // Verify source file content was NOT mutated
    assert.strictEqual(fs.readFileSync(mockXls, 'utf-8'), 'MOCK_BIFF8_CONTENT_SAMPLE');
  });

  // TEST 6: Job Mutex Lock (No simultaneous conflicting jobs for same client)
  await test('JobManager enforces per-client mutex lock', () => {
    const jobManager = new JobManager(TEST_DATA_DIR);

    const job1 = jobManager.createJob({
      type: 'DOWNLOADER',
      clientId: 'client_lock_test',
      clientName: 'Lock Test Client',
      mode: 'DEMO'
    });
    assert.ok(job1.id);

    // Second job for same client must throw conflict error
    assert.throws(() => {
      jobManager.createJob({
        type: 'SUMMARY_PREPARER',
        clientId: 'client_lock_test',
        clientName: 'Lock Test Client',
        mode: 'DEMO'
      });
    }, /Conflict: Client already has an active job in progress/);

    // After job1 finishes, second job can proceed
    jobManager.updateJobStatus(job1.id, 'COMPLETED');
    const job2 = jobManager.createJob({
      type: 'SUMMARY_PREPARER',
      clientId: 'client_lock_test',
      clientName: 'Lock Test Client',
      mode: 'DEMO'
    });
    assert.ok(job2.id);
  });

  // TEST 7: Server Restart Recovery (in-flight jobs marked INTERRUPTED)
  await test('JobManager marks in-flight jobs as INTERRUPTED on restart', () => {
    const jobManager1 = new JobManager(TEST_DATA_DIR);
    const job = jobManager1.createJob({
      type: 'DOWNLOADER',
      clientId: 'restart_client',
      clientName: 'Restart Client',
      mode: 'DEMO'
    });
    jobManager1.updateJobStatus(job.id, 'RUNNING');

    // Simulate server crash and restart: create fresh JobManager instance reading same jobs.json
    const jobManagerRestarted = new JobManager(TEST_DATA_DIR);
    const recoveredJob = jobManagerRestarted.getJob(job.id)!;
    assert.strictEqual(recoveredJob.status, 'INTERRUPTED');
    assert.ok(recoveredJob.error?.includes('interrupted by server restart'));
  });

  // TEST 8: Strict REAL mode isolation (visibly fails if script missing)
  await test('REAL mode fails visibly when 1_downloader.js or 2_summary_preparer.js is missing', async () => {
    const vault = new CredentialVault(TEST_DATA_DIR);
    const clientStore = new ClientStore(TEST_DATA_DIR, vault);
    const client = clientStore.getAllClients()[0];
    const jobManager = new JobManager(TEST_DATA_DIR);
    const downloaderAdapter = new DownloaderAdapter(jobManager, vault, clientStore, process.cwd());
    const summaryAdapter = new SummaryAdapter(jobManager, clientStore, process.cwd());

    // REAL Downloader Job
    const realDownloaderJob = jobManager.createJob({
      type: 'DOWNLOADER',
      clientId: client.id,
      clientName: client.name,
      mode: 'REAL'
    });

    await downloaderAdapter.executeJob(realDownloaderJob.id);
    const finishedDownloaderJob = jobManager.getJob(realDownloaderJob.id)!;
    assert.strictEqual(finishedDownloaderJob.status, 'FAILED');
    assert.ok(finishedDownloaderJob.error?.includes('1_downloader.js is not present'));

    // REAL Summary Job
    const realSummaryJob = jobManager.createJob({
      type: 'SUMMARY_PREPARER',
      clientId: client.id,
      clientName: client.name,
      mode: 'REAL'
    });

    await summaryAdapter.executeJob(realSummaryJob.id);
    const finishedSummaryJob = jobManager.getJob(realSummaryJob.id)!;
    assert.strictEqual(finishedSummaryJob.status, 'FAILED');
    assert.ok(finishedSummaryJob.error?.includes('2_summary_preparer.js is not present'));
  });

  console.log(`\n======================================================`);
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
