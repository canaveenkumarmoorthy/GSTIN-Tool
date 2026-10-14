export type ExecutionMode = 'DEMO' | 'REAL';

export interface ClientProfile {
  id: string;
  name: string;
  pan: string;
  gstin: string;
  dob?: string;
  portalUsernameIncomeTax?: string;
  portalUsernameGst?: string;
  enabledPortals: ('INCOME_TAX' | 'GST')[];
  documentPreferences: string[];
  inputDirectory: string;
  outputDirectory: string;
  downloadDirectory: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  credentialRefs?: {
    incomeTax?: { exists: boolean; username?: string; ref?: string };
    gst?: { exists: boolean; username?: string; ref?: string };
  };
}

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
  type: 'DOWNLOADER' | 'SUMMARY_PREPARER';
  clientId: string;
  clientName: string;
  status: JobStatus;
  mode: ExecutionMode;
  portal?: 'INCOME_TAX' | 'GST';
  documentsRequested?: string[];
  documentsCompleted?: string[];
  financialYear?: string;
  assessmentYear?: string;
  progress: number;
  currentStepMessage?: string;
  logs: LogEntry[];
  prompt?: {
    type: 'OTP' | 'CAPTCHA';
    message: string;
    submittedValue?: string;
    requiredAt?: string;
  };
  outputFiles: string[];
  manifest?: {
    runTimestamp: string;
    clientId: string;
    clientName: string;
    processingPolicy: string;
    options: {
      pruneEmptyRows: boolean;
      pruneEmptyColumns: boolean;
    };
    filesProcessed: any[];
    unsupportedFiles: {
      filename: string;
      reason: string;
      actionTaken?: string;
    }[];
    totals: {
      totalFilesScanned: number;
      totalInputRows: number;
      blankRowsRemoved: number;
      preservedRows: number;
      zeroValuesPreserved: number;
      booleanFalsePreserved: number;
      formulasPreserved: number;
      datesPreserved: number;
      taxIdentifiersPreserved: number;
    };
  };
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SystemHealth {
  status: string;
  suiteName: string;
  mode: ExecutionMode;
  timestamp: string;
  integrationScripts: {
    downloader: { filename: string; exists: boolean; path: string };
    summaryPreparer: { filename: string; exists: boolean; path: string };
  };
  metrics: {
    clientsCount: number;
    jobsCount: number;
  };
}

export interface ClientFilesScan {
  inputs: { name: string; relPath: string; isDirectory: boolean; size: number; updatedAt: string }[];
  downloads: { name: string; relPath: string; isDirectory: boolean; size: number; updatedAt: string }[];
  outputs: { name: string; relPath: string; isDirectory: boolean; size: number; updatedAt: string }[];
}
