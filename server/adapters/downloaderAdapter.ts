import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { JobManager, JobRecord } from '../state/jobManager.ts';
import { CredentialVault } from '../security/vault.ts';
import { ClientStore } from '../storage/clientStore.ts';

export class DownloaderAdapter {
  private jobManager: JobManager;
  private vault: CredentialVault;
  private clientStore: ClientStore;
  private rootDir: string;

  constructor(jobManager: JobManager, vault: CredentialVault, clientStore: ClientStore, rootDir: string) {
    this.jobManager = jobManager;
    this.vault = vault;
    this.clientStore = clientStore;
    this.rootDir = rootDir;
  }

  public async executeJob(jobId: string) {
    const job = this.jobManager.getJob(jobId);
    if (!job) return;

    this.jobManager.updateJobStatus(jobId, 'RUNNING', { currentStepMessage: 'Starting downloader orchestration' });

    if (job.mode === 'REAL') {
      await this.runRealDownloader(job);
    } else {
      await this.runSimulatedDownloader(job);
    }
  }

  /**
   * REAL Execution Mode:
   * Calls the actual 1_downloader.js script. Fails visibly if script is absent or fails.
   */
  private async runRealDownloader(job: JobRecord) {
    const scriptPath = path.join(this.rootDir, '1_downloader.js');

    this.jobManager.addLog(job.id, 'info', `[REAL MODE] Inspecting integration script at: ${scriptPath}`);

    if (!fs.existsSync(scriptPath)) {
      const errMsg = 'REAL mode error: 1_downloader.js is not present in the application root directory. Place your Playwright automation script at the project root or switch to DEMO mode.';
      this.jobManager.addLog(job.id, 'error', `[REAL MODE FAILURE] ${errMsg}`);
      this.jobManager.updateJobStatus(job.id, 'FAILED', {
        error: errMsg,
        currentStepMessage: 'Failed: 1_downloader.js missing'
      });
      return;
    }

    const client = this.clientStore.getClient(job.clientId);
    if (!client) {
      this.jobManager.updateJobStatus(job.id, 'FAILED', { error: `Client ${job.clientId} not found` });
      return;
    }

    const portal = job.portal || 'INCOME_TAX';
    const credentials = this.vault.getCredential(job.clientId, portal);

    if (!credentials) {
      const errMsg = `No credentials found in encrypted vault for client ${job.clientId} on portal ${portal}. Configure credentials first.`;
      this.jobManager.addLog(job.id, 'error', `[AUTH ERROR] ${errMsg}`);
      this.jobManager.updateJobStatus(job.id, 'FAILED', { error: errMsg });
      return;
    }

    const downloadDir = path.resolve(this.rootDir, client.downloadDirectory);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    this.jobManager.addLog(job.id, 'info', `[SPAWN] Spawning 1_downloader.js with Node runtime for client ${client.name}...`);

    try {
      // Spawn child process with isolated environment
      const env = {
        ...process.env,
        CLIENT_ID: client.id,
        CLIENT_NAME: client.name,
        PAN: client.pan,
        GSTIN: client.gstin,
        PORTAL: portal,
        PORTAL_USERNAME: credentials.username,
        PORTAL_PASSWORD: credentials.password,
        DOCUMENTS_REQUESTED: (job.documentsRequested || []).join(','),
        FINANCIAL_YEAR: job.financialYear || '2025-26',
        ASSESSMENT_YEAR: job.assessmentYear || '2026-27',
        DOWNLOAD_DIR: downloadDir
      };

      const child = spawn('node', [scriptPath], {
        cwd: this.rootDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      child.stdout.on('data', async (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

        for (const line of lines) {
          // Detect OTP / CAPTCHA prompt indicators in script stdout
          if (/waiting[_\s-]?for[_\s-]?otp/i.test(line) || /enter[_\s-]?otp/i.test(line)) {
            this.jobManager.addLog(job.id, 'otp', line);
            const userOtp = await this.jobManager.requestHumanInput(job.id, 'OTP', 'Portal requested authentication OTP. Enter code:');
            child.stdin.write(`${userOtp}\n`);
          } else if (/waiting[_\s-]?for[_\s-]?captcha/i.test(line) || /enter[_\s-]?captcha/i.test(line)) {
            this.jobManager.addLog(job.id, 'otp', line);
            const userCaptcha = await this.jobManager.requestHumanInput(job.id, 'CAPTCHA', 'Portal requested CAPTCHA text. Enter code:');
            child.stdin.write(`${userCaptcha}\n`);
          } else {
            this.jobManager.addLog(job.id, 'info', line);
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.jobManager.addLog(job.id, 'warn', `[STDERR] ${text}`);
      });

      child.on('error', (err) => {
        this.jobManager.addLog(job.id, 'error', `[PROCESS ERROR] Subprocess spawn failed: ${err.message}`);
        this.jobManager.updateJobStatus(job.id, 'FAILED', { error: err.message });
      });

      child.on('close', (code) => {
        if (code === 0) {
          // Output verification
          const files = fs.readdirSync(downloadDir);
          if (files.length === 0) {
            this.jobManager.updateJobStatus(job.id, 'FAILED', {
              error: 'Downloader script exited with status 0, but no downloaded files were found in destination directory.'
            });
            this.jobManager.addLog(job.id, 'error', '[VERIFICATION FAILED] No output files detected.');
          } else {
            this.jobManager.updateJobStatus(job.id, 'COMPLETED', {
              progress: 100,
              currentStepMessage: `Download completed successfully. ${files.length} document(s) verified on disk.`,
              outputFiles: files.map((f) => path.join(client.downloadDirectory, f)),
              documentsCompleted: job.documentsRequested
            });
            this.jobManager.addLog(job.id, 'success', `[SUCCESS] Download verified. Found ${files.length} document(s).`);
          }
        } else {
          this.jobManager.updateJobStatus(job.id, 'FAILED', {
            error: `1_downloader.js exited with non-zero code ${code}`
          });
          this.jobManager.addLog(job.id, 'error', `[FAILED] Script exited with code ${code}.`);
        }
      });
    } catch (err: any) {
      this.jobManager.updateJobStatus(job.id, 'FAILED', { error: err.message });
    }
  }

  /**
   * DEMO Execution Mode:
   * Accurately emulates portal steps, Human-in-the-Loop OTP verification, and synthetic file generation.
   * Every log is stamped with [SIMULATED].
   */
  private async runSimulatedDownloader(job: JobRecord) {
    const client = this.clientStore.getClient(job.clientId);
    if (!client) {
      this.jobManager.updateJobStatus(job.id, 'FAILED', { error: `Client ${job.clientId} not found` });
      return;
    }

    const docs = job.documentsRequested || ['AIS', '26AS'];
    const portal = job.portal || 'INCOME_TAX';
    const portalUrl = portal === 'INCOME_TAX' ? 'https://eportal.incometax.gov.in' : 'https://services.gst.gov.in';

    this.jobManager.addLog(job.id, 'info', `[SIMULATED] Initializing Playwright browser driver: Chromium v126 (desktop viewport 1440x900)`);
    await this.delay(600);

    this.jobManager.updateProgress(job.id, 10, 'Navigating to portal');
    this.jobManager.addLog(job.id, 'info', `[SIMULATED] Navigating to ${portalUrl} ... HTTP 200 OK`);
    await this.delay(700);

    this.jobManager.updateProgress(job.id, 25, 'Submitting client credentials');
    const maskedRef = this.vault.getMaskedRef(client.id, portal);
    this.jobManager.addLog(
      job.id,
      'info',
      `[SIMULATED] Entering portal username [${client.portalUsernameIncomeTax || client.pan}] and credentials [${maskedRef.ref || '••••••••'}]`
    );
    await this.delay(800);

    // Human-in-the-loop OTP pause
    this.jobManager.updateProgress(job.id, 35, 'Waiting for human OTP input');
    this.jobManager.addLog(
      job.id,
      'otp',
      `[SIMULATED] Portal returned 2-Factor Authentication challenge: 6-digit OTP sent to registered mobile/email.`
    );

    const receivedOtp = await this.jobManager.requestHumanInput(
      job.id,
      'OTP',
      `2FA OTP Required: Enter the 6-digit verification code sent for client ${client.name} (Simulation: enter any 6 digits):`
    );

    this.jobManager.addLog(job.id, 'info', `[SIMULATED] Submitting 2FA OTP verification code to portal ... Session verified!`);
    await this.delay(600);

    // Iterate through requested documents
    const downloadDir = path.resolve(this.rootDir, client.downloadDirectory);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const completedDocs: string[] = [];
    const generatedFilePaths: string[] = [];

    const baseProgress = 40;
    const progressPerDoc = 50 / Math.max(1, docs.length);

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const currentProg = Math.round(baseProgress + (i + 0.5) * progressPerDoc);
      this.jobManager.updateProgress(job.id, currentProg, `Downloading ${doc}`);
      this.jobManager.addLog(job.id, 'info', `[SIMULATED] Navigating to ${doc} repository for FY ${job.financialYear || '2025-26'}...`);
      await this.delay(800);

      // Generate a realistic synthetic document on disk
      const filename = `${client.pan}_${doc}_${(job.financialYear || '2025-26').replace('-', '_')}_${Date.now()}.pdf`;
      const filePath = path.join(downloadDir, filename);

      const syntheticHeader = `%PDF-1.4\n%CA_TAX_SUITE_SIMULATED_DOCUMENT\nClient: ${client.name}\nPAN: ${client.pan}\nDoc: ${doc}\nTimestamp: ${new Date().toISOString()}\n%%EOF\n`;
      fs.writeFileSync(filePath, syntheticHeader, 'utf-8');

      completedDocs.push(doc);
      generatedFilePaths.push(path.join(client.downloadDirectory, filename));
      this.jobManager.addLog(job.id, 'success', `[SIMULATED] Successfully retrieved and saved: ${filename}`);
      await this.delay(400);
    }

    // Verify output files exist
    const verifiedFiles = generatedFilePaths.filter((fp) => fs.existsSync(path.resolve(this.rootDir, fp)));
    if (verifiedFiles.length !== generatedFilePaths.length) {
      this.jobManager.updateJobStatus(job.id, 'FAILED', {
        error: 'Output verification failed: Some expected documents were missing on local disk.'
      });
      return;
    }

    this.jobManager.updateJobStatus(job.id, 'COMPLETED', {
      progress: 100,
      currentStepMessage: `Download process finished. ${verifiedFiles.length} document(s) verified on disk.`,
      documentsCompleted: completedDocs,
      outputFiles: verifiedFiles
    });
    this.jobManager.addLog(
      job.id,
      'success',
      `[SIMULATED COMPLETE] All ${verifiedFiles.length} requested document(s) downloaded and verified in ${client.downloadDirectory}.`
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
