import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import { CredentialVault } from './server/security/vault.ts';
import { FilesystemSandbox } from './server/security/sandbox.ts';
import { ClientStore } from './server/storage/clientStore.ts';
import { JobManager } from './server/state/jobManager.ts';
import { DownloaderAdapter } from './server/adapters/downloaderAdapter.ts';
import { SummaryAdapter } from './server/adapters/summaryAdapter.ts';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
let executionMode: 'DEMO' | 'REAL' = (process.env.EXECUTION_MODE as 'DEMO' | 'REAL') || 'DEMO';

// Initialize Core Subsystems
const vault = new CredentialVault(DATA_DIR, process.env.VAULT_MASTER_KEY, process.env.VAULT_SALT);
const clientStore = new ClientStore(DATA_DIR, vault);
const jobManager = new JobManager(DATA_DIR);
const downloaderAdapter = new DownloaderAdapter(jobManager, vault, clientStore, process.cwd());
const summaryAdapter = new SummaryAdapter(jobManager, clientStore, process.cwd());

app.use(express.json());

/**
 * Local API Protection Middleware:
 * Validates Origin/Host headers on mutating methods to prevent cross-origin drive-by abuse.
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && origin) {
    try {
      const url = new URL(origin);
      const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.run.app');
      if (!isLoopback) {
        return res.status(403).json({ error: 'Access Denied: Cross-Origin mutating requests prohibited on local suite.' });
      }
    } catch (e) {
      return res.status(403).json({ error: 'Access Denied: Invalid Origin header.' });
    }
  }
  next();
});

// ----------------------------------------------------
// REST API ROUTES
// ----------------------------------------------------

/**
 * GET /api/health - System health and script integration detection
 */
app.get('/api/health', (req: Request, res: Response) => {
  const downloaderScript = path.resolve(process.cwd(), '1_downloader.js');
  const summaryScript = path.resolve(process.cwd(), '2_summary_preparer.js');

  res.json({
    status: 'ok',
    suiteName: 'Tax & GST Automation Suite',
    mode: executionMode,
    timestamp: new Date().toISOString(),
    integrationScripts: {
      downloader: {
        filename: '1_downloader.js',
        exists: fs.existsSync(downloaderScript),
        path: downloaderScript
      },
      summaryPreparer: {
        filename: '2_summary_preparer.js',
        exists: fs.existsSync(summaryScript),
        path: summaryScript
      }
    },
    metrics: {
      clientsCount: clientStore.getAllClients().length,
      jobsCount: jobManager.getAllJobs().length
    }
  });
});

/**
 * Execution Mode Management (DEMO vs REAL)
 */
app.get('/api/mode', (req: Request, res: Response) => {
  res.json({ mode: executionMode });
});

app.post('/api/mode', (req: Request, res: Response) => {
  const { mode } = req.body;
  if (mode !== 'DEMO' && mode !== 'REAL') {
    return res.status(400).json({ error: 'Mode must be either DEMO or REAL' });
  }
  executionMode = mode;
  res.json({ mode: executionMode, message: `System execution mode switched to ${executionMode}` });
});

/**
 * Client Management Endpoints
 */
app.get('/api/clients', (req: Request, res: Response) => {
  const clients = clientStore.getAllClients();
  res.json(clients);
});

app.get('/api/clients/:id', (req: Request, res: Response) => {
  const client = clientStore.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

app.post('/api/clients', (req: Request, res: Response) => {
  const { name, pan, gstin, dob, portalUsernameIncomeTax, portalPasswordIncomeTax, portalUsernameGst, portalPasswordGst, enabledPortals, documentPreferences } = req.body;

  if (!name || !pan) {
    return res.status(400).json({ error: 'Client name and PAN are required' });
  }

  // Validate PAN format (5 letters, 4 digits, 1 letter)
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(pan)) {
    return res.status(400).json({ error: 'Invalid PAN format. Must be 10 characters (e.g. ABCDE1234F)' });
  }

  // Validate GSTIN format if provided (2 digits, 10 char PAN, 1 entity code, Z, 1 checksum)
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(gstin)) {
    return res.status(400).json({ error: 'Invalid GSTIN format. Must be 15 alphanumeric characters.' });
  }

  const client = clientStore.saveClient({
    name,
    pan,
    gstin,
    dob,
    portalUsernameIncomeTax,
    portalUsernameGst,
    enabledPortals,
    documentPreferences
  });

  // Securely store credentials in AES-256-GCM vault if submitted
  if (portalPasswordIncomeTax && portalUsernameIncomeTax) {
    vault.storeCredential(client.id, 'INCOME_TAX', portalUsernameIncomeTax, portalPasswordIncomeTax);
  }
  if (portalPasswordGst && portalUsernameGst) {
    vault.storeCredential(client.id, 'GST', portalUsernameGst, portalPasswordGst);
  }

  res.status(201).json(clientStore.getClient(client.id));
});

app.put('/api/clients/:id', (req: Request, res: Response) => {
  const existing = clientStore.getClient(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  const { name, pan, gstin, dob, portalUsernameIncomeTax, portalPasswordIncomeTax, portalUsernameGst, portalPasswordGst, enabledPortals, documentPreferences } = req.body;

  const updated = clientStore.saveClient({
    id: req.params.id,
    name: name || existing.name,
    pan: pan || existing.pan,
    gstin: gstin !== undefined ? gstin : existing.gstin,
    dob: dob !== undefined ? dob : existing.dob,
    portalUsernameIncomeTax: portalUsernameIncomeTax !== undefined ? portalUsernameIncomeTax : existing.portalUsernameIncomeTax,
    portalUsernameGst: portalUsernameGst !== undefined ? portalUsernameGst : existing.portalUsernameGst,
    enabledPortals: enabledPortals || existing.enabledPortals,
    documentPreferences: documentPreferences || existing.documentPreferences
  });

  if (portalPasswordIncomeTax) {
    vault.storeCredential(updated.id, 'INCOME_TAX', portalUsernameIncomeTax || updated.portalUsernameIncomeTax || '', portalPasswordIncomeTax);
  }
  if (portalPasswordGst) {
    vault.storeCredential(updated.id, 'GST', portalUsernameGst || updated.portalUsernameGst || '', portalPasswordGst);
  }

  res.json(clientStore.getClient(updated.id));
});

app.post('/api/clients/:id/archive', (req: Request, res: Response) => {
  const success = clientStore.archiveClient(req.params.id);
  if (!success) return res.status(404).json({ error: 'Client not found' });
  res.json({ success: true, client: clientStore.getClient(req.params.id) });
});

/**
 * Scan client folder for available input / download / output files
 */
app.get('/api/clients/:id/files', (req: Request, res: Response) => {
  const client = clientStore.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const scanDir = (relPath: string) => {
    const full = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(full)) return [];
    return fs.readdirSync(full, { withFileTypes: true }).map((d) => {
      const filePath = path.join(full, d.name);
      const stat = fs.statSync(filePath);
      return {
        name: d.name,
        relPath: path.join(relPath, d.name),
        isDirectory: d.isDirectory(),
        size: stat.size,
        updatedAt: stat.mtime.toISOString()
      };
    });
  };

  res.json({
    inputs: scanDir(client.inputDirectory),
    downloads: scanDir(client.downloadDirectory),
    outputs: scanDir(client.outputDirectory)
  });
});

/**
 * GET /api/clients/:id/history
 */
app.get('/api/clients/:id/history', (req: Request, res: Response) => {
  const history = jobManager.getClientHistory(req.params.id);
  res.json(history);
});

/**
 * Job Management Endpoints
 */
app.get('/api/jobs', (req: Request, res: Response) => {
  res.json(jobManager.getAllJobs());
});

app.get('/api/jobs/:id', (req: Request, res: Response) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

/**
 * POST /api/downloader/jobs - Start Playwright Downloader
 */
app.post('/api/downloader/jobs', async (req: Request, res: Response) => {
  const { clientId, portal, documentsRequested, financialYear, assessmentYear } = req.body;

  const client = clientStore.getClient(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  try {
    const job = jobManager.createJob({
      type: 'DOWNLOADER',
      clientId: client.id,
      clientName: client.name,
      mode: executionMode,
      portal: portal || 'INCOME_TAX',
      documentsRequested: documentsRequested || ['AIS', '26AS'],
      financialYear: financialYear || '2025-26',
      assessmentYear: assessmentYear || '2026-27'
    });

    // Run async in background without blocking response
    downloaderAdapter.executeJob(job.id).catch((err) => {
      console.error(`[Downloader] Execution error on job ${job.id}:`, err);
    });

    res.status(202).json(job);
  } catch (err: any) {
    res.status(409).json({ error: err.message });
  }
});

/**
 * POST /api/summary/jobs - Start ExcelJS Summary Preparer
 */
app.post('/api/summary/jobs', async (req: Request, res: Response) => {
  const { clientId, pruneEmptyRows, pruneEmptyColumns } = req.body;

  const client = clientStore.getClient(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  try {
    const job = jobManager.createJob({
      type: 'SUMMARY_PREPARER',
      clientId: client.id,
      clientName: client.name,
      mode: executionMode
    });

    // Run async in background
    summaryAdapter
      .executeJob(job.id, {
        pruneEmptyRows: pruneEmptyRows ?? true,
        pruneEmptyColumns: pruneEmptyColumns ?? false
      })
      .catch((err) => {
        console.error(`[Summary] Execution error on job ${job.id}:`, err);
      });

    res.status(202).json(job);
  } catch (err: any) {
    res.status(409).json({ error: err.message });
  }
});

/**
 * Job Controls: cancel, retry, input
 */
app.post('/api/jobs/:id/cancel', (req: Request, res: Response) => {
  const success = jobManager.cancelJob(req.params.id);
  if (!success) return res.status(400).json({ error: 'Job cannot be cancelled or is already finished' });
  res.json({ success: true, job: jobManager.getJob(req.params.id) });
});

app.post('/api/jobs/:id/retry', async (req: Request, res: Response) => {
  const oldJob = jobManager.getJob(req.params.id);
  if (!oldJob) return res.status(404).json({ error: 'Job not found' });

  try {
    const newJob = jobManager.createJob({
      type: oldJob.type,
      clientId: oldJob.clientId,
      clientName: oldJob.clientName,
      mode: executionMode,
      portal: oldJob.portal,
      documentsRequested: oldJob.documentsRequested,
      financialYear: oldJob.financialYear,
      assessmentYear: oldJob.assessmentYear
    });

    if (newJob.type === 'DOWNLOADER') {
      downloaderAdapter.executeJob(newJob.id).catch(console.error);
    } else {
      summaryAdapter.executeJob(newJob.id).catch(console.error);
    }

    res.status(202).json(newJob);
  } catch (err: any) {
    res.status(409).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/:id/input - Human-in-the-loop OTP/CAPTCHA response
 */
app.post('/api/jobs/:id/input', (req: Request, res: Response) => {
  const { value } = req.body;
  if (!value || typeof value !== 'string') {
    return res.status(400).json({ error: 'Value string required' });
  }

  const success = jobManager.submitHumanInput(req.params.id, value);
  if (!success) {
    return res.status(400).json({ error: 'Job is not currently awaiting human input' });
  }

  res.json({ success: true, message: 'Verification input accepted.' });
});

/**
 * GET /api/jobs/:id/events - Server-Sent Events (SSE)
 */
app.get('/api/jobs/:id/events', (req: Request, res: Response) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial state snapshot
  res.write(`event: snapshot\ndata: ${JSON.stringify(job)}\n\n`);

  jobManager.registerSseClient(job.id, res);
});

/**
 * GET /api/jobs/:id/logs
 */
app.get('/api/jobs/:id/logs', (req: Request, res: Response) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job.logs);
});

/**
 * GET /api/files/download - Secure sandboxed file download
 */
app.get('/api/files/download', (req: Request, res: Response) => {
  const targetRelPath = req.query.path as string;
  if (!targetRelPath) return res.status(400).json({ error: 'Path query param required' });

  try {
    const clientsRoot = path.resolve(process.cwd(), 'data/clients');
    const securePath = FilesystemSandbox.resolveSecurePath(clientsRoot, targetRelPath.replace(/^data\/clients\/?/, ''));

    if (!fs.existsSync(securePath) || fs.statSync(securePath).isDirectory()) {
      return res.status(404).json({ error: 'File not found on local disk' });
    }

    const filename = path.basename(securePath);
    res.download(securePath, filename);
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// ----------------------------------------------------
// FRONTEND VITE / STATIC INTEGRATION
// ----------------------------------------------------
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, HOST, () => {
    console.log(`\n======================================================`);
    console.log(`  CA TAX & GST AUTOMATION SUITE`);
    console.log(`  Running locally on: http://${HOST}:${PORT}`);
    console.log(`  Operational Mode:   ${executionMode}`);
    console.log(`  Storage Root:       ${DATA_DIR}`);
    console.log(`======================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup failure:', err);
  process.exit(1);
});
