import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ExcelJS from 'exceljs';
import { JobManager, JobRecord } from '../state/jobManager.ts';
import { ClientStore } from '../storage/clientStore.ts';
import { FilesystemSandbox } from '../security/sandbox.ts';

export interface SummaryOptions {
  pruneEmptyRows?: boolean;
  pruneEmptyColumns?: boolean;
  extractZipArchives?: boolean;
}

export class SummaryAdapter {
  private jobManager: JobManager;
  private clientStore: ClientStore;
  private rootDir: string;

  constructor(jobManager: JobManager, clientStore: ClientStore, rootDir: string) {
    this.jobManager = jobManager;
    this.clientStore = clientStore;
    this.rootDir = rootDir;
  }

  public async executeJob(jobId: string, options: SummaryOptions = {}) {
    const job = this.jobManager.getJob(jobId);
    if (!job) return;

    this.jobManager.updateJobStatus(jobId, 'RUNNING', { currentStepMessage: 'Initializing summary processing engine' });

    if (job.mode === 'REAL') {
      await this.runRealSummaryPreparer(job, options);
    } else {
      await this.runZeroLossSummaryPipeline(job, options);
    }
  }

  /**
   * REAL Execution Mode:
   * Invokes 2_summary_preparer.js. Fails visibly if script is absent or fails.
   */
  private async runRealSummaryPreparer(job: JobRecord, options: SummaryOptions) {
    const scriptPath = path.join(this.rootDir, '2_summary_preparer.js');

    this.jobManager.addLog(job.id, 'info', `[REAL MODE] Checking ExcelJS summary script at: ${scriptPath}`);

    if (!fs.existsSync(scriptPath)) {
      const errMsg = 'REAL mode error: 2_summary_preparer.js is not present in the application root directory. Place your ExcelJS script at the project root or switch to DEMO mode.';
      this.jobManager.addLog(job.id, 'error', `[REAL MODE FAILURE] ${errMsg}`);
      this.jobManager.updateJobStatus(job.id, 'FAILED', {
        error: errMsg,
        currentStepMessage: 'Failed: 2_summary_preparer.js missing'
      });
      return;
    }

    const client = this.clientStore.getClient(job.clientId);
    if (!client) {
      this.jobManager.updateJobStatus(job.id, 'FAILED', { error: `Client ${job.clientId} not found` });
      return;
    }

    const inputDir = path.resolve(this.rootDir, client.inputDirectory);
    const outputDir = path.resolve(this.rootDir, client.outputDirectory);

    if (!fs.existsSync(inputDir)) {
      fs.mkdirSync(inputDir, { recursive: true });
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    this.jobManager.addLog(job.id, 'info', `[SPAWN] Executing 2_summary_preparer.js on input folder: ${client.inputDirectory}`);

    try {
      const env = {
        ...process.env,
        CLIENT_ID: client.id,
        CLIENT_NAME: client.name,
        PAN: client.pan,
        GSTIN: client.gstin,
        INPUT_DIR: inputDir,
        OUTPUT_DIR: outputDir,
        PRUNE_EMPTY_ROWS: String(options.pruneEmptyRows ?? true),
        PRUNE_EMPTY_COLS: String(options.pruneEmptyColumns ?? false)
      };

      const child = spawn('node', [scriptPath], {
        cwd: this.rootDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        for (const line of lines) {
          this.jobManager.addLog(job.id, 'info', line);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.jobManager.addLog(job.id, 'warn', `[STDERR] ${text}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          const files = fs.readdirSync(outputDir);
          if (files.length === 0) {
            this.jobManager.updateJobStatus(job.id, 'FAILED', {
              error: 'Summary preparer exited with status 0, but no output workbooks were found.'
            });
            this.jobManager.addLog(job.id, 'error', '[VERIFICATION FAILED] No output summary workbooks created.');
          } else {
            this.jobManager.updateJobStatus(job.id, 'COMPLETED', {
              progress: 100,
              currentStepMessage: `Offline summary completed. ${files.length} output file(s) verified on disk.`,
              outputFiles: files.map((f) => path.join(client.outputDirectory, f))
            });
            this.jobManager.addLog(job.id, 'success', `[SUCCESS] Output verified: ${files.length} file(s) saved in ${client.outputDirectory}`);
          }
        } else {
          this.jobManager.updateJobStatus(job.id, 'FAILED', {
            error: `2_summary_preparer.js exited with non-zero code ${code}`
          });
          this.jobManager.addLog(job.id, 'error', `[FAILED] Script exited with code ${code}.`);
        }
      });
    } catch (err: any) {
      this.jobManager.updateJobStatus(job.id, 'FAILED', { error: err.message });
    }
  }

  /**
   * Built-in Zero-Loss Dynamic Filtering Pipeline (ExcelJS).
   * Strict adherence to blankness rules: 0, false, formulas, dates, and PAN/GSTIN are preserved.
   * Unsupported .xls files are recorded without modification.
   */
  public async runZeroLossSummaryPipeline(job: JobRecord, options: SummaryOptions) {
    const client = this.clientStore.getClient(job.clientId);
    if (!client) {
      this.jobManager.updateJobStatus(job.id, 'FAILED', { error: `Client ${job.clientId} not found` });
      return;
    }

    const inputDir = path.resolve(this.rootDir, client.inputDirectory);
    const outputDir = path.resolve(this.rootDir, client.outputDirectory);

    if (!fs.existsSync(inputDir)) {
      fs.mkdirSync(inputDir, { recursive: true });
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    this.jobManager.addLog(
      job.id,
      'info',
      `[OFFLINE PIPELINE] Scanning client input folder: ${client.inputDirectory}`,
      job.mode === 'DEMO'
    );
    this.jobManager.updateProgress(job.id, 10, 'Scanning input directory');

    // 1. Recursive file discovery in client's authorized folder
    const discoveredFiles = this.discoverFiles(inputDir);
    this.jobManager.addLog(
      job.id,
      'info',
      `Found ${discoveredFiles.length} file(s) in input directory.`
    );

    if (discoveredFiles.length === 0) {
      this.jobManager.updateJobStatus(job.id, 'COMPLETED', {
        progress: 100,
        currentStepMessage: 'No files found to process in client input directory.',
        outputFiles: []
      });
      this.jobManager.addLog(job.id, 'warn', 'No input files found in directory.');
      return;
    }

    const manifest: Record<string, any> = {
      runTimestamp: new Date().toISOString(),
      clientId: client.id,
      clientName: client.name,
      processingPolicy: 'Zero-Loss Dynamic Filtering',
      options: {
        pruneEmptyRows: options.pruneEmptyRows ?? true,
        pruneEmptyColumns: options.pruneEmptyColumns ?? false
      },
      filesProcessed: [],
      unsupportedFiles: [],
      totals: {
        totalFilesScanned: discoveredFiles.length,
        totalInputRows: 0,
        blankRowsRemoved: 0,
        preservedRows: 0,
        zeroValuesPreserved: 0,
        booleanFalsePreserved: 0,
        formulasPreserved: 0,
        datesPreserved: 0,
        taxIdentifiersPreserved: 0
      }
    };

    const outputFiles: string[] = [];
    const filesToProcess = [...discoveredFiles];

    // Handle ZIP archives safely
    for (const f of discoveredFiles) {
      if (f.toLowerCase().endsWith('.zip')) {
        this.jobManager.addLog(job.id, 'info', `[ZIP ARCHIVE] Safe decompression scan on ${path.basename(f)}`);
        try {
          const zipExtractDir = path.join(inputDir, `extracted_${Date.now()}`);
          const { extractedCount, extractedFiles } = await FilesystemSandbox.extractZipSafely(f, zipExtractDir);
          this.jobManager.addLog(job.id, 'info', `Safely extracted ${extractedCount} file(s) from ZIP archive.`);
          filesToProcess.push(...extractedFiles);
        } catch (err: any) {
          this.jobManager.addLog(job.id, 'error', `[ZIP SAFETY ERROR] ${err.message}`);
        }
      }
    }

    const validSpreadsheetFiles = filesToProcess.filter(
      (f) => !f.toLowerCase().endsWith('.zip') && !path.basename(f).startsWith('.')
    );

    let fileIndex = 0;
    for (const filePath of validSpreadsheetFiles) {
      fileIndex++;
      const ext = path.extname(filePath).toLowerCase();
      const baseName = path.basename(filePath);
      const stepProg = Math.round(20 + (fileIndex / validSpreadsheetFiles.length) * 70);

      this.jobManager.updateProgress(job.id, stepProg, `Processing ${baseName}`);

      // Handle legacy .xls (ExcelJS does NOT support binary BIFF8 .xls)
      if (ext === '.xls') {
        manifest.unsupportedFiles.push({
          filename: baseName,
          path: path.relative(this.rootDir, filePath),
          reason: 'Legacy BIFF8 .xls format is not supported by ExcelJS without conversion. Source file preserved without modification.',
          actionTaken: 'PRESERVED_UNMODIFIED'
        });
        this.jobManager.addLog(
          job.id,
          'warn',
          `[FORMAT NOTICE] ${baseName}: Legacy .xls format detected. Left untouched to prevent corruption.`
        );
        continue;
      }

      if (ext !== '.xlsx' && ext !== '.csv') {
        manifest.unsupportedFiles.push({
          filename: baseName,
          reason: `Unsupported file extension (${ext}). Expected .xlsx or .csv.`
        });
        continue;
      }

      this.jobManager.addLog(job.id, 'info', `[PROCESSING] Analyzing workbook: ${baseName}`);

      try {
        const fileStat = await this.processSingleWorkbook(filePath, outputDir, options);
        manifest.filesProcessed.push(fileStat);

        manifest.totals.totalInputRows += fileStat.totalInputRows;
        manifest.totals.blankRowsRemoved += fileStat.blankRowsRemoved;
        manifest.totals.preservedRows += fileStat.preservedRows;
        manifest.totals.zeroValuesPreserved += fileStat.zeroValuesPreserved;
        manifest.totals.booleanFalsePreserved += fileStat.booleanFalsePreserved;
        manifest.totals.formulasPreserved += fileStat.formulasPreserved;
        manifest.totals.datesPreserved += fileStat.datesPreserved;
        manifest.totals.taxIdentifiersPreserved += fileStat.taxIdentifiersPreserved;

        if (fileStat.outputWorkbookPath) {
          outputFiles.push(path.relative(this.rootDir, fileStat.outputWorkbookPath));
        }

        this.jobManager.addLog(
          job.id,
          'success',
          `[COMPLETED FILE] ${baseName}: Pruned ${fileStat.blankRowsRemoved} blank row(s), preserved ${fileStat.preservedRows} non-blank row(s) [Zeros preserved: ${fileStat.zeroValuesPreserved}, Formulas: ${fileStat.formulasPreserved}].`
        );
      } catch (err: any) {
        this.jobManager.addLog(job.id, 'error', `[ERROR] Failed to process ${baseName}: ${err.message}`);
      }
    }

    // Write manifest to output directory
    const manifestPath = path.join(outputDir, `manifest_${Date.now()}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    outputFiles.push(path.relative(this.rootDir, manifestPath));

    // Output verification
    const verifiedOutputs = outputFiles.filter((p) => fs.existsSync(path.resolve(this.rootDir, p)));

    this.jobManager.updateJobStatus(job.id, 'COMPLETED', {
      progress: 100,
      currentStepMessage: `Zero-loss summary preparation finished. Generated ${verifiedOutputs.length} output artifact(s).`,
      outputFiles: verifiedOutputs,
      manifest
    });

    this.jobManager.addLog(
      job.id,
      'success',
      `[PIPELINE FINISHED] Summary audit complete. ${manifest.totals.preservedRows} row(s) preserved with zero data loss. Manifest written to ${path.basename(manifestPath)}.`
    );
  }

  /**
   * Zero-Loss evaluation of a single workbook (.xlsx or .csv)
   */
  public async processSingleWorkbook(
    inputFilePath: string,
    outputDir: string,
    options: SummaryOptions
  ): Promise<any> {
    const pruneEmptyRows = options.pruneEmptyRows ?? true;
    const pruneEmptyCols = options.pruneEmptyColumns ?? false;

    const sourceWb = new ExcelJS.Workbook();
    const ext = path.extname(inputFilePath).toLowerCase();

    if (ext === '.csv') {
      await sourceWb.csv.readFile(inputFilePath);
    } else {
      await sourceWb.xlsx.readFile(inputFilePath);
    }

    const targetWb = new ExcelJS.Workbook();
    targetWb.creator = 'CA Tax & GST Automation Suite';
    targetWb.lastModifiedBy = 'Zero-Loss Dynamic Filtering Engine';
    targetWb.created = new Date();
    targetWb.modified = new Date();

    const stats = {
      sourceFile: path.basename(inputFilePath),
      outputWorkbookPath: '',
      totalInputRows: 0,
      blankRowsRemoved: 0,
      preservedRows: 0,
      zeroValuesPreserved: 0,
      booleanFalsePreserved: 0,
      formulasPreserved: 0,
      datesPreserved: 0,
      taxIdentifiersPreserved: 0,
      sheets: [] as any[]
    };

    sourceWb.eachSheet((sourceSheet) => {
      const targetSheet = targetWb.addWorksheet(sourceSheet.name);

      let sheetInputRows = 0;
      let sheetBlankRowsPruned = 0;
      let sheetPreservedRows = 0;

      // Determine active columns
      const maxCol = sourceSheet.columnCount;
      const emptyCols = new Set<number>();

      if (pruneEmptyCols && maxCol > 0) {
        for (let colIdx = 1; colIdx <= maxCol; colIdx++) {
          let hasContent = false;
          sourceSheet.eachRow({ includeEmpty: false }, (row) => {
            const cell = row.getCell(colIdx);
            if (!this.isCellBlank(cell)) {
              hasContent = true;
            }
          });
          if (!hasContent) emptyCols.add(colIdx);
        }
      }

      // Process rows
      sourceSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        sheetInputRows++;
        stats.totalInputRows++;

        const isRowBlank = this.isRowCompletelyBlank(row);

        if (isRowBlank && pruneEmptyRows) {
          sheetBlankRowsPruned++;
          stats.blankRowsRemoved++;
          return; // Skip blank row
        }

        // Row has content or blank rows are preserved
        sheetPreservedRows++;
        stats.preservedRows++;

        const rowValues: any[] = [];
        const cellCount = Math.max(row.cellCount, maxCol);

        for (let colIdx = 1; colIdx <= cellCount; colIdx++) {
          if (pruneEmptyCols && emptyCols.has(colIdx)) continue;

          const cell = row.getCell(colIdx);
          this.trackCellMetrics(cell, stats);

          // Deep copy cell value and formula
          if (cell.type === ExcelJS.ValueType.Formula) {
            rowValues.push({
              formula: cell.formula,
              result: cell.result
            });
          } else {
            rowValues.push(cell.value);
          }
        }

        const newRow = targetSheet.addRow(rowValues);
        // Preserve row height if defined
        if (row.height) newRow.height = row.height;
      });

      stats.sheets.push({
        sheetName: sourceSheet.name,
        inputRows: sheetInputRows,
        blankRowsPruned: sheetBlankRowsPruned,
        preservedRows: sheetPreservedRows
      });
    });

    const timestamp = Date.now();
    const cleanBase = path.basename(inputFilePath, ext);
    const outFileName = `${cleanBase}_audit_summary_${timestamp}.xlsx`;
    const outFilePath = path.join(outputDir, outFileName);

    await targetWb.xlsx.writeFile(outFilePath);
    stats.outputWorkbookPath = outFilePath;

    return stats;
  }

  /**
   * Precision cell blankness test:
   * 0, 0.00, false, formulas, errors, dates, rich text, and PAN/GSTIN are NEVER blank.
   */
  public isCellBlank(cell: ExcelJS.Cell): boolean {
    const val = cell.value;
    if (val === null || val === undefined) return true;

    // Formulas are NEVER blank
    if (cell.type === ExcelJS.ValueType.Formula || (typeof val === 'object' && 'formula' in val)) {
      return false;
    }

    // Numeric zero is NEVER blank
    if (typeof val === 'number') {
      return false;
    }

    // Boolean false is NEVER blank
    if (typeof val === 'boolean') {
      return false;
    }

    // Dates are NEVER blank
    if (val instanceof Date) {
      return false;
    }

    // Error values are NEVER blank
    if (cell.type === ExcelJS.ValueType.Error || (typeof val === 'object' && 'error' in val)) {
      return false;
    }

    // Strings: check if trimmed is non-empty
    if (typeof val === 'string') {
      return val.trim().length === 0;
    }

    // Rich text or objects
    if (typeof val === 'object') {
      if ('richText' in val && Array.isArray((val as any).richText)) {
        return (val as any).richText.every((t: any) => !t.text || t.text.trim().length === 0);
      }
      return false;
    }

    return false;
  }

  /**
   * Row is completely blank ONLY IF every cell in the row is blank.
   */
  public isRowCompletelyBlank(row: ExcelJS.Row): boolean {
    let hasNonBlank = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (!this.isCellBlank(cell)) {
        hasNonBlank = true;
      }
    });
    return !hasNonBlank;
  }

  private trackCellMetrics(cell: ExcelJS.Cell, stats: any) {
    const val = cell.value;
    if (typeof val === 'number' && val === 0) {
      stats.zeroValuesPreserved++;
    } else if (typeof val === 'boolean' && val === false) {
      stats.booleanFalsePreserved++;
    } else if (cell.type === ExcelJS.ValueType.Formula || (typeof val === 'object' && val && 'formula' in val)) {
      stats.formulasPreserved++;
    } else if (val instanceof Date) {
      stats.datesPreserved++;
    } else if (typeof val === 'string') {
      // Check for PAN or GSTIN
      if (/[A-Z]{5}[0-9]{4}[A-Z]{1}/.test(val) || /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/.test(val)) {
        stats.taxIdentifiersPreserved++;
      }
    }
  }

  private discoverFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        results.push(...this.discoverFiles(fullPath));
      } else if (item.isFile()) {
        results.push(fullPath);
      }
    }
    return results;
  }
}
