import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Play,
  RotateCcw,
  XCircle,
  FileText,
  ShieldAlert,
  FolderOpen,
  Terminal,
  CheckCircle2,
  Clock,
  KeyRound
} from 'lucide-react';
import { ClientProfile, JobRecord, ExecutionMode, LogEntry } from '../types/index.ts';

interface DownloaderToolProps {
  clients: ClientProfile[];
  selectedClient: ClientProfile | null;
  onSelectClient: (id: string) => void;
  activeJob: JobRecord | null;
  jobs: JobRecord[];
  mode: ExecutionMode;
  onStartJob: (params: {
    clientId: string;
    portal: 'INCOME_TAX' | 'GST';
    documentsRequested: string[];
    financialYear: string;
    assessmentYear: string;
  }) => Promise<void>;
  onCancelJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onSubmitOtp: (jobId: string, otp: string) => void;
}

const ALL_DOCUMENTS = [
  { id: 'AIS', name: 'Annual Information Statement (AIS)', portal: 'INCOME_TAX' },
  { id: 'TIS', name: 'Taxpayer Information Summary (TIS)', portal: 'INCOME_TAX' },
  { id: '26AS', name: 'Form 26AS (Tax Credit Statement)', portal: 'INCOME_TAX' },
  { id: 'ITR_V', name: 'ITR-V (Income Tax Acknowledgement)', portal: 'INCOME_TAX' },
  { id: 'GSTR_1', name: 'GSTR-1 (Outward Supplies Return)', portal: 'GST' },
  { id: 'GSTR_3B', name: 'GSTR-3B (Summary Return & Tax Paid)', portal: 'GST' }
];

export const DownloaderTool: React.FC<DownloaderToolProps> = ({
  clients,
  selectedClient,
  onSelectClient,
  activeJob,
  jobs,
  mode,
  onStartJob,
  onCancelJob,
  onRetryJob,
  onSubmitOtp
}) => {
  const [selectedPortal, setSelectedPortal] = useState<'INCOME_TAX' | 'GST'>('INCOME_TAX');
  const [selectedDocs, setSelectedDocs] = useState<string[]>(['AIS', 'TIS', '26AS', 'ITR_V']);
  const [financialYear, setFinancialYear] = useState('2025-26');
  const [assessmentYear, setAssessmentYear] = useState('2026-27');
  const [otpInput, setOtpInput] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal logs to bottom
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeJob?.logs]);

  // Handle portal switch: auto-filter document selections
  const handlePortalSwitch = (portal: 'INCOME_TAX' | 'GST') => {
    setSelectedPortal(portal);
    if (portal === 'INCOME_TAX') {
      setSelectedDocs(['AIS', 'TIS', '26AS', 'ITR_V']);
    } else {
      setSelectedDocs(['GSTR_1', 'GSTR_3B']);
    }
  };

  const toggleDoc = (docId: string) => {
    if (selectedDocs.includes(docId)) {
      setSelectedDocs(selectedDocs.filter((d) => d !== docId));
    } else {
      setSelectedDocs([...selectedDocs, docId]);
    }
  };

  const selectAll = () => {
    const portalDocs = ALL_DOCUMENTS.filter((d) => d.portal === selectedPortal).map((d) => d.id);
    setSelectedDocs(portalDocs);
  };

  const clearSelection = () => {
    setSelectedDocs([]);
  };

  const handleStart = async () => {
    if (!selectedClient || selectedDocs.length === 0) return;
    setIsStarting(true);
    try {
      await onStartJob({
        clientId: selectedClient.id,
        portal: selectedPortal,
        documentsRequested: selectedDocs,
        financialYear,
        assessmentYear
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob || !otpInput.trim()) return;
    onSubmitOtp(activeJob.id, otpInput.trim());
    setOtpInput('');
  };

  // Filter client history for downloads
  const clientDownloads = jobs.filter(
    (j) => j.type === 'DOWNLOADER' && j.clientId === selectedClient?.id
  );

  return (
    <div className="space-y-6">
      {/* Module Title Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">Automation Engine</span>
              <span className="text-slate-300">·</span>
              <span className="text-xs font-mono text-slate-500">Playwright Chromium</span>
            </div>
            <h1 className="text-lg font-bold text-slate-900 mt-1">
              TOOL 1 — Extractor & Downloader | Playwright
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Securely orchestrate official government portal document retrieval with human-in-the-loop OTP/CAPTCHA checkpoints.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Mode:</span>
            <span
              className={`text-xs px-2.5 py-1 rounded-md font-semibold ${
                mode === 'DEMO' ? 'bg-slate-100 text-slate-800' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {mode === 'DEMO' ? 'DEMO (Simulated)' : 'REAL (Live Automation)'}
            </span>
          </div>
        </div>
      </div>

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Parameters */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Extraction Configuration</h3>

            {/* Client Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Client Profile</label>
              <select
                value={selectedClient?.id || ''}
                onChange={(e) => onSelectClient(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-md p-2 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900 font-medium"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — PAN: {c.pan}
                  </option>
                ))}
              </select>
            </div>

            {/* Portal Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Government Portal</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePortalSwitch('INCOME_TAX')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md border text-center transition-all ${
                    selectedPortal === 'INCOME_TAX'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  Income Tax e-Filing
                </button>
                <button
                  type="button"
                  onClick={() => handlePortalSwitch('GST')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md border text-center transition-all ${
                    selectedPortal === 'GST'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  GST Common Portal
                </button>
              </div>
            </div>

            {/* Period Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Financial Year</label>
                <select
                  value={financialYear}
                  onChange={(e) => setFinancialYear(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-md p-2 bg-slate-50 focus:outline-hidden font-mono"
                >
                  <option value="2025-26">FY 2025-26</option>
                  <option value="2024-25">FY 2024-25</option>
                  <option value="2023-24">FY 2023-24</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assessment Year</label>
                <select
                  value={assessmentYear}
                  onChange={(e) => setAssessmentYear(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-md p-2 bg-slate-50 focus:outline-hidden font-mono"
                >
                  <option value="2026-27">AY 2026-27</option>
                  <option value="2025-26">AY 2025-26</option>
                  <option value="2024-25">AY 2024-25</option>
                </select>
              </div>
            </div>

            {/* Document Checklist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700">Documents Checklist</label>
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={selectAll} className="text-blue-600 hover:underline">
                    Select All
                  </button>
                  <span className="text-slate-300">·</span>
                  <button onClick={clearSelection} className="text-slate-500 hover:underline">
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 border border-slate-200 rounded-md p-2.5 bg-slate-50 max-h-56 overflow-y-auto">
                {ALL_DOCUMENTS.filter((d) => d.portal === selectedPortal).map((doc) => (
                  <label
                    key={doc.id}
                    className="flex items-start gap-2.5 p-1.5 rounded hover:bg-white cursor-pointer transition-colors text-xs text-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocs.includes(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                      className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <div>
                      <div className="font-semibold text-slate-900">{doc.id}</div>
                      <div className="text-[11px] text-slate-500">{doc.name}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Trigger Button */}
            <button
              onClick={handleStart}
              disabled={
                isStarting ||
                selectedDocs.length === 0 ||
                ['RUNNING', 'WAITING_FOR_OTP', 'WAITING_FOR_CAPTCHA'].includes(activeJob?.status || '')
              }
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold rounded-md text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>{isStarting ? 'Initiating Job...' : 'Start Download Automation'}</span>
            </button>
          </div>

          {/* Client Destination Folder Info */}
          {selectedClient && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs space-y-2">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
                <span>Destination Folder:</span>
              </div>
              <div className="font-mono text-slate-600 bg-slate-50 p-2 rounded border border-slate-200 break-all text-[11px]">
                {selectedClient.downloadDirectory}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Execution Terminal & OTP Human Prompt */}
        <div className="lg:col-span-2 space-y-4">
          {/* Active Job Progress Bar & Status */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    activeJob?.status === 'COMPLETED'
                      ? 'bg-emerald-500'
                      : activeJob?.status === 'RUNNING'
                      ? 'bg-blue-500'
                      : activeJob?.status === 'WAITING_FOR_OTP' || activeJob?.status === 'WAITING_FOR_CAPTCHA'
                      ? 'bg-amber-500'
                      : activeJob?.status === 'FAILED'
                      ? 'bg-rose-500'
                      : 'bg-slate-400'
                  }`}
                />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {activeJob ? `Job #${activeJob.id.slice(-6)}: ${activeJob.clientName}` : 'No Active Downloader Job'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {activeJob?.currentStepMessage || 'Ready to trigger Playwright automated extraction'}
                  </p>
                </div>
              </div>

              {/* Action Controls: Pause, Resume, Cancel, Retry */}
              {activeJob && (
                <div className="flex items-center gap-2">
                  {['RUNNING', 'WAITING_FOR_OTP', 'WAITING_FOR_CAPTCHA'].includes(activeJob.status) && (
                    <button
                      onClick={() => onCancelJob(activeJob.id)}
                      className="px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors"
                    >
                      Cancel Job
                    </button>
                  )}
                  {['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(activeJob.status) && (
                    <button
                      onClick={() => onRetryJob(activeJob.id)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Overall Progress Meter */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>Overall Download Progress</span>
                <span className="font-mono tabular-nums font-semibold">{activeJob?.progress || 0}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    activeJob?.status === 'COMPLETED'
                      ? 'bg-emerald-600'
                      : activeJob?.status === 'FAILED'
                      ? 'bg-rose-600'
                      : 'bg-blue-600'
                  }`}
                  style={{ width: `${activeJob?.progress || 0}%` }}
                />
              </div>
            </div>

            {/* Human-In-The-Loop OTP / CAPTCHA Prompt Banner */}
            {(activeJob?.status === 'WAITING_FOR_OTP' || activeJob?.status === 'WAITING_FOR_CAPTCHA') && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <KeyRound className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                      Authentication Checkpoint: Human Verification Required
                    </h4>
                    <p className="text-xs text-amber-800 mt-0.5">
                      {activeJob.prompt?.message || 'Portal requires 2FA OTP code to authorize document download.'}
                    </p>

                    <form onSubmit={handleOtpSubmit} className="mt-3 flex items-center gap-2 max-w-sm">
                      <input
                        type="text"
                        placeholder="Enter 6-digit verification code..."
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value)}
                        autoFocus
                        className="flex-1 px-3 py-1.5 text-xs border border-amber-300 rounded-md bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono tracking-widest text-center"
                      />
                      <button
                        type="submit"
                        className="px-4 py-1.5 text-xs font-semibold bg-amber-700 hover:bg-amber-800 text-white rounded-md transition-colors shadow-xs"
                      >
                        Submit & Resume
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Timestamped Terminal-Style Logs */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-inner">
            <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <Terminal className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono font-medium">Live Terminal Stream (SSE)</span>
              </div>
              <span className="font-mono text-[11px] text-slate-500">
                {activeJob?.logs.length || 0} event(s) recorded
              </span>
            </div>

            <div className="p-4 font-mono text-xs text-slate-200 max-h-80 overflow-y-auto space-y-1 terminal-scroll">
              {activeJob?.logs.map((log, idx) => {
                let color = 'text-slate-300';
                if (log.level === 'warn') color = 'text-amber-400';
                if (log.level === 'error') color = 'text-rose-400';
                if (log.level === 'success') color = 'text-emerald-400';
                if (log.level === 'otp') color = 'text-cyan-400 font-semibold';

                const timeStr = new Date(log.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                });

                return (
                  <div key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-600 select-none shrink-0 tabular-nums">[{timeStr}]</span>
                    <span className={color}>{log.message}</span>
                  </div>
                );
              })}

              {(!activeJob || activeJob.logs.length === 0) && (
                <div className="text-slate-600 italic py-6 text-center">
                  Awaiting job initiation. Real-time portal output will stream here.
                </div>
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>

          {/* Downloaded Documents Manifest for this Client */}
          {activeJob?.status === 'COMPLETED' && activeJob.outputFiles.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs">
              <div className="flex items-center gap-2 text-emerald-900 font-bold mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>Verified Downloaded Documents ({activeJob.outputFiles.length})</span>
              </div>
              <ul className="space-y-1 text-emerald-800 font-mono text-[11px]">
                {activeJob.outputFiles.map((file, idx) => (
                  <li key={idx} className="flex items-center justify-between bg-white/60 px-2.5 py-1 rounded">
                    <span>{file}</span>
                    <a
                      href={`/api/files/download?path=${encodeURIComponent(file)}`}
                      className="text-emerald-700 font-sans font-semibold hover:underline"
                    >
                      Download File
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
