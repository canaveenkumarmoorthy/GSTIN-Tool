import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { FilesystemSandbox } from '../security/sandbox.ts';

export type JobType = 'DOWNLOADER' | 'SUMMARY_PREPARER';

export type JobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_FOR_OTP'
  | 'WAITING_FOR_CAPTCHA'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'INTERRUPTED';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'otp';
  message: string;
  simulated?: boolean;
}

export interface JobRecord {
  id: string;
  type: JobType;
  clientId: string;
  clientName: string;
  status: JobStatus;
  mode: 'DEMO' | 'REAL';
  portal?: 'INCOME_TAX' | 'GST';
  documentsRequested?: string[];
  documentsCompleted?: string[];
  financialYear?: string;
  assessmentYear?: string;
  progress: number; // 0 - 100
  currentStepMessage?: string;
  logs: LogEntry[];
  prompt?: {
    type: 'OTP' | 'CAPTCHA';
    message: string;
    submittedValue?: string;
    requiredAt?: string;
  };
  outputFiles: string[];
  manifest?: Record<string, any>;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export class JobManager {
  private dataDir: string;
  private jobsFilePath: string;
  private jobs: Map<string, JobRecord> = new Map();
  // Active client locks: clientId -> jobId
  private clientLocks: Map<string, string> = new Map();
  // SSE Subscribers: jobId -> Set<Response>
  private sseSubscribers: Map<string, Set<Response>> = new Map();
  // Wait resolvers for OTP/CAPTCHA: jobId -> (val: string) => void
  private inputResolvers: Map<string, (val: string) => void> = new Map();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.jobsFilePath = path.join(dataDir, 'jobs.json');
    this.init();
  }

  private init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    if (fs.existsSync(this.jobsFilePath)) {
      try {
        const raw = fs.readFileSync(this.jobsFilePath, 'utf-8');
        const list: JobRecord[] = JSON.parse(raw);
        for (const job of list) {
          // Restart recovery: any in-flight job is marked INTERRUPTED
          if (['QUEUED', 'RUNNING', 'WAITING_FOR_OTP', 'WAITING_FOR_CAPTCHA'].includes(job.status)) {
            job.status = 'INTERRUPTED';
            job.error = 'Job interrupted by server restart. Use Retry to re-run safely.';
            job.logs.push({
              timestamp: new Date().toISOString(),
              level: 'warn',
              message: '[SYSTEM] Server restart detected. In-flight job marked INTERRUPTED.'
            });
          }
          this.jobs.set(job.id, job);
        }
        this.persist();
      } catch (err) {
        console.error('[JobManager] Error loading jobs.json:', err);
      }
    }
  }

  private persist() {
    try {
      const list = Array.from(this.jobs.values());
      fs.writeFileSync(this.jobsFilePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('[JobManager] Failed to persist jobs.json:', err);
    }
  }

  public getAllJobs(): JobRecord[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getJob(id: string): JobRecord | null {
    return this.jobs.get(id) || null;
  }

  public getClientHistory(clientId: string): JobRecord[] {
    return this.getAllJobs().filter((j) => j.clientId === clientId);
  }

  /**
   * Acquire per-client lock to prevent simultaneous conflicting executions.
   */
  public acquireClientLock(clientId: string, jobId: string): boolean {
    const existingJobId = this.clientLocks.get(clientId);
    if (existingJobId) {
      const existingJob = this.jobs.get(existingJobId);
      if (existingJob && ['QUEUED', 'RUNNING', 'WAITING_FOR_OTP', 'WAITING_FOR_CAPTCHA'].includes(existingJob.status)) {
        return false;
      }
    }
    this.clientLocks.set(clientId, jobId);
    return true;
  }

  public releaseClientLock(clientId: string, jobId: string) {
    if (this.clientLocks.get(clientId) === jobId) {
      this.clientLocks.delete(clientId);
    }
  }

  public createJob(params: {
    type: JobType;
    clientId: string;
    clientName: string;
    mode: 'DEMO' | 'REAL';
    portal?: 'INCOME_TAX' | 'GST';
    documentsRequested?: string[];
    financialYear?: string;
    assessmentYear?: string;
  }): JobRecord {
    const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Attempt to acquire client lock
    const locked = this.acquireClientLock(params.clientId, id);
    if (!locked) {
      const activeJobId = this.clientLocks.get(params.clientId);
      throw new Error(`Conflict: Client already has an active job in progress (${activeJobId}). Wait for it to finish or cancel it.`);
    }

    const job: JobRecord = {
      id,
      type: params.type,
      clientId: params.clientId,
      clientName: params.clientName,
      status: 'QUEUED',
      mode: params.mode,
      portal: params.portal,
      documentsRequested: params.documentsRequested || [],
      documentsCompleted: [],
      financialYear: params.financialYear,
      assessmentYear: params.assessmentYear,
      progress: 0,
      currentStepMessage: 'Job queued and awaiting execution dispatcher',
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Job initialized [Mode: ${params.mode}]. Client: ${params.clientName} (${params.clientId})`,
          simulated: params.mode === 'DEMO'
        }
      ],
      outputFiles: [],
      createdAt: new Date().toISOString()
    };

    this.jobs.set(id, job);
    this.persist();
    this.broadcastEvent(id, 'job_created', job);

    return job;
  }

  public updateJobStatus(id: string, status: JobStatus, updates: Partial<JobRecord> = {}) {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = status;
    Object.assign(job, updates);

    if (status === 'RUNNING' && !job.startedAt) {
      job.startedAt = new Date().toISOString();
    }

    if (['COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(status)) {
      job.completedAt = new Date().toISOString();
      this.releaseClientLock(job.clientId, id);
    }

    this.persist();
    this.broadcastEvent(id, 'status_change', {
      id: job.id,
      status: job.status,
      progress: job.progress,
      currentStepMessage: job.currentStepMessage,
      error: job.error,
      prompt: job.prompt
    });
  }

  public addLog(id: string, level: LogEntry['level'], rawMessage: string, simulated = false) {
    const job = this.jobs.get(id);
    if (!job) return;

    const message = FilesystemSandbox.redactSensitive(rawMessage);
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      simulated: simulated || job.mode === 'DEMO'
    };

    job.logs.push(entry);
    this.persist();
    this.broadcastEvent(id, 'log', entry);
  }

  public updateProgress(id: string, progress: number, currentStepMessage?: string) {
    const job = this.jobs.get(id);
    if (!job) return;

    job.progress = Math.min(100, Math.max(0, progress));
    if (currentStepMessage) {
      job.currentStepMessage = currentStepMessage;
    }
    this.persist();
    this.broadcastEvent(id, 'progress', {
      progress: job.progress,
      currentStepMessage: job.currentStepMessage
    });
  }

  /**
   * Request manual Human-in-the-Loop input for OTP or CAPTCHA.
   */
  public requestHumanInput(id: string, type: 'OTP' | 'CAPTCHA', message: string): Promise<string> {
    const job = this.jobs.get(id);
    if (!job) return Promise.reject(new Error(`Job ${id} not found`));

    const status = type === 'OTP' ? 'WAITING_FOR_OTP' : 'WAITING_FOR_CAPTCHA';
    job.prompt = {
      type,
      message,
      requiredAt: new Date().toISOString()
    };

    this.updateJobStatus(id, status, { currentStepMessage: `Awaiting human input: ${type}` });
    this.addLog(id, 'otp', `[AUTH PROMPT] ${message}`);

    return new Promise((resolve) => {
      this.inputResolvers.set(id, (value: string) => {
        if (job.prompt) {
          job.prompt.submittedValue = '******'; // Do not retain plaintext OTP in metadata
        }
        this.addLog(id, 'info', `[AUTH SUBMITTED] Human operator provided ${type} verification code.`);
        this.updateJobStatus(id, 'RUNNING', { currentStepMessage: `Resuming execution with provided ${type}` });
        this.inputResolvers.delete(id);
        resolve(value);
      });
    });
  }

  public submitHumanInput(id: string, value: string): boolean {
    const resolver = this.inputResolvers.get(id);
    if (!resolver) return false;
    resolver(value);
    return true;
  }

  public cancelJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) {
      return false;
    }

    this.updateJobStatus(id, 'CANCELLED', {
      currentStepMessage: 'Job cancelled by user request',
      error: 'Job cancelled by user request'
    });
    this.addLog(id, 'warn', '[CANCEL] Job cancelled by user.');
    return true;
  }

  /**
   * SSE Subscription management.
   */
  public registerSseClient(jobId: string, res: Response) {
    if (!this.sseSubscribers.has(jobId)) {
      this.sseSubscribers.set(jobId, new Set());
    }
    const set = this.sseSubscribers.get(jobId)!;
    set.add(res);

    res.on('close', () => {
      set.delete(res);
      if (set.size === 0) {
        this.sseSubscribers.delete(jobId);
      }
    });
  }

  private broadcastEvent(jobId: string, eventName: string, data: any) {
    const set = this.sseSubscribers.get(jobId);
    if (!set || set.size === 0) return;

    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      try {
        res.write(payload);
      } catch (err) {
        console.error(`[SSE] Broadcast error on job ${jobId}:`, err);
      }
    }
  }
}
