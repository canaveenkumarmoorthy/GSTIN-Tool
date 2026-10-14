import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  HardDrive,
  FolderOpen,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Download,
  Info,
  ShieldCheck,
  Search
} from 'lucide-react';
import { ClientProfile, JobRecord, ExecutionMode, ClientFilesScan } from '../types/index.ts';

interface SummaryToolProps {
  clients: ClientProfile[];
  selectedClient: ClientProfile | null;
  onSelectClient: (id: string) => void;
  activeJob: JobRecord | null;
  jobs: JobRecord[];
  mode: ExecutionMode;
  onStartSummaryJob: (params: {
    clientId: string;
    pruneEmptyRows: boolean;
    pruneEmptyColumns: boolean;
  }) => Promise<void>;
  onCancelJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
}

export const SummaryTool: React.FC<SummaryToolProps> = ({
  clients,
  selectedClient,
  onSelectClient,
  activeJob,
  jobs,
  mode,
  onStartSummaryJob,
  onCancelJob,
  onRetryJob
}) => {
  const [pruneEmptyRows, setPruneEmptyRows] = useState(true);
  const [pruneEmptyColumns, setPruneEmptyColumns] = useState(false);
  const [filesScan, setFilesScan] = useState<ClientFilesScan | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Fetch client files scan on client selection
  const scanClientFolder = async () => {
    if (!selectedClient) return;
    setIsScanning(true);
    try {
      const res = await fetch(`/api/clients/${selectedClient.id}/files`);
      if (res.ok) {
        const data = await res.json();
        setFilesScan(data);
      }
    } catch (err) {
      console.error('Failed to scan client folder:', err);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    scanClientFolder();
  }, [selectedClient?.id]);

  const handleStart = async () => {
    if (!selectedClient) return;
    setIsStarting(true);
    try {
      await onStartSummaryJob({
        clientId: selectedClient.id,
        pruneEmptyRows,
        pruneEmptyColumns
      });
    } finally {
      setIsStarting(false);
    }
  };

  // Filter summary history for selected client
  const clientSummaryJobs = jobs.filter(
    (j) => j.type === 'SUMMARY_PREPARER' && j.clientId === selectedClient?.id
  );

  return (
    <div className="space-y-6">
      {/* Prominent Local Processing Pledge Header */}
      <div className="bg-emerald-950 text-white rounded-lg p-5 border border-emerald-900 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-emerald-300">
              Air-Gapped Local Engine
            </span>
            <h1 className="text-lg font-bold mt-0.5">TOOL 2 — Offline Summary Preparer | ExcelJS</h1>
            <p className="text-xs text-emerald-200 mt-1 font-medium leading-relaxed">
              LOCAL PROCESSING ONLY — source documents are processed entirely on this computer and are not uploaded to a cloud service by this module.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Input Folders & Dynamic Filtering Policy */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Preparation Parameters</h3>

            {/* Client Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Client Profile</label>
              <select
                value={selectedClient?.id || ''}
                onChange={(e) => onSelectClient(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-md p-2 bg-slate-50 focus:bg-white focus:outline-hidden font-medium"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — PAN: {c.pan}
                  </option>
                ))}
              </select>
            </div>

            {/* Folder Scopes */}
            {selectedClient && (
              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-700">Source Input Directory:</span>
                  <div className="font-mono text-slate-600 bg-slate-50 p-2 rounded border border-slate-200 text-[11px] truncate mt-0.5">
                    {selectedClient.inputDirectory}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-slate-700">Output Summary Directory:</span>
                  <div className="font-mono text-slate-600 bg-slate-50 p-2 rounded border border-slate-200 text-[11px] truncate mt-0.5">
                    {selectedClient.outputDirectory}
                  </div>
                </div>
              </div>
            )}

            {/* Folder Scan Action */}
            <button
              onClick={scanClientFolder}
              disabled={isScanning}
              className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border border-slate-200"
            >
              <FolderOpen className="w-3.5 h-3.5 text-slate-600" />
              <span>{isScanning ? 'Scanning Directory...' : 'Rescan Input Folder'}</span>
            </button>

            {/* Zero-Loss Dynamic Filtering Policies */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <label className="text-xs font-bold text-slate-900 block">Zero-Loss Filtering Policy</label>

              <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={pruneEmptyRows}
                  onChange={(e) => setPruneEmptyRows(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <div>
                  <span className="font-medium text-slate-900">Prune 100% Blank Rows</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Preserves numeric 0, boolean false, formulas, dates, and GSTIN/PAN strings intact.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={pruneEmptyColumns}
                  onChange={(e) => setPruneEmptyColumns(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <div>
                  <span className="font-medium text-slate-900">Prune Empty Structural Columns</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Requires explicit activation. Deletes columns with no data across all rows.
                  </p>
                </div>
              </label>
            </div>

            {/* Trigger Button */}
            <button
              onClick={handleStart}
              disabled={
                isStarting ||
                ['RUNNING', 'WAITING_FOR_OTP', 'WAITING_FOR_CAPTCHA'].includes(activeJob?.status || '')
              }
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold rounded-md text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isStarting ? 'Initiating Pipeline...' : 'Generate Audit Dashboards'}</span>
            </button>
          </div>

          {/* Discovered Input Files Panel */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs space-y-2">
            <div className="flex items-center justify-between font-semibold text-slate-900 pb-2 border-b border-slate-100">
              <span>Discovered Input Files</span>
              <span className="text-slate-500 tabular-nums font-mono">{filesScan?.inputs.length || 0}</span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {filesScan?.inputs.map((file, idx) => {
                const isLegacy = file.name.toLowerCase().endsWith('.xls');
                return (
                  <div
                    key={idx}
                    className="p-2 bg-slate-50 border border-slate-200 rounded flex items-center justify-between text-[11px]"
                  >
                    <div className="truncate mr-2">
                      <div className="font-mono font-medium text-slate-800 truncate" title={file.name}>
                        {file.name}
                      </div>
                      <div className="text-slate-400 tabular-nums">
                        {(file.size / 1024).toFixed(1)} KB · {isLegacy ? 'Legacy .xls (read-only)' : 'OpenXML / CSV'}
                      </div>
                    </div>
                  </div>
                );
              })}

              {(!filesScan || filesScan.inputs.length === 0) && (
                <div className="text-slate-400 italic py-3 text-center">
                  No input files found in directory.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Active Job Stream & Transformation Audit Manifest */}
        <div className="lg:col-span-2 space-y-4">
          {/* Progress Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    activeJob?.status === 'COMPLETED'
                      ? 'bg-emerald-500'
                      : activeJob?.status === 'RUNNING'
                      ? 'bg-blue-500'
                      : activeJob?.status === 'FAILED'
                      ? 'bg-rose-500'
                      : 'bg-slate-400'
                  }`}
                />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {activeJob ? `Job #${activeJob.id.slice(-6)}: ${activeJob.clientName}` : 'No Active Summary Job'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {activeJob?.currentStepMessage || 'Ready to execute zero-loss dynamic filtering'}
                  </p>
                </div>
              </div>

              {activeJob && ['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(activeJob.status) && (
                <button
                  onClick={() => onRetryJob(activeJob.id)}
                  className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>Summary Preparation Progress</span>
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
          </div>

          {/* Transformation Audit Manifest Viewer */}
          {activeJob?.manifest && (
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">Transformation Audit Manifest</h3>
                </div>
                <span className="text-xs font-mono text-slate-500">Policy: Zero-Loss Dynamic Filtering</span>
              </div>

              {/* High-Precision Statistics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <div className="text-slate-500 font-medium">Scanned Input Rows</div>
                  <div className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-1">
                    {activeJob.manifest.totals.totalInputRows}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <div className="text-slate-500 font-medium">Pruned Blank Rows</div>
                  <div className="text-lg font-bold text-rose-600 font-mono tabular-nums mt-1">
                    {activeJob.manifest.totals.blankRowsRemoved}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <div className="text-slate-500 font-medium">Preserved Rows</div>
                  <div className="text-lg font-bold text-emerald-600 font-mono tabular-nums mt-1">
                    {activeJob.manifest.totals.preservedRows}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <div className="text-slate-500 font-medium">Zero Values Preserved</div>
                  <div className="text-lg font-bold text-blue-600 font-mono tabular-nums mt-1">
                    {activeJob.manifest.totals.zeroValuesPreserved}
                  </div>
                </div>
              </div>

              {/* Data Integrity Attestations */}
              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1.5">
                <div className="font-semibold text-slate-800">Verified Precision Guarantees:</div>
                <div className="grid grid-cols-2 gap-2 text-slate-600 text-[11px] font-mono">
                  <div>• Formulas Preserved: <strong className="text-slate-900">{activeJob.manifest.totals.formulasPreserved}</strong></div>
                  <div>• Dates Preserved: <strong className="text-slate-900">{activeJob.manifest.totals.datesPreserved}</strong></div>
                  <div>• Boolean False Preserved: <strong className="text-slate-900">{activeJob.manifest.totals.booleanFalsePreserved}</strong></div>
                  <div>• GSTIN/PAN Identifiers: <strong className="text-slate-900">{activeJob.manifest.totals.taxIdentifiersPreserved}</strong></div>
                </div>
              </div>

              {/* Unsupported Files Alert */}
              {activeJob.manifest.unsupportedFiles.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs space-y-1">
                  <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                    <span>Preserved Legacy Files (Read-Only)</span>
                  </div>
                  {activeJob.manifest.unsupportedFiles.map((u, idx) => (
                    <div key={idx} className="text-amber-800 text-[11px] font-mono">
                      {u.filename} — {u.reason}
                    </div>
                  ))}
                </div>
              )}

              {/* Generated Output Workbooks */}
              {activeJob.outputFiles.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-semibold text-slate-900 mb-2">Generated Output Workbooks:</div>
                  <div className="space-y-1.5">
                    {activeJob.outputFiles.map((f, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded text-xs"
                      >
                        <span className="font-mono text-slate-800 truncate mr-3">{f}</span>
                        <a
                          href={`/api/files/download?path=${encodeURIComponent(f)}`}
                          className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium transition-colors shrink-0 flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Past Summaries for this Client */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Historical Client Summaries ({selectedClient?.name})
            </h3>
            <div className="divide-y divide-slate-100 text-xs">
              {clientSummaryJobs.map((j) => (
                <div key={j.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-medium text-slate-900">Job #{j.id.slice(-6)}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="text-slate-600">{new Date(j.createdAt).toLocaleDateString('en-IN')}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="font-semibold text-slate-700">{j.status}</span>
                  </div>
                  {j.outputFiles.length > 0 && (
                    <span className="text-emerald-700 font-mono text-[11px]">
                      {j.outputFiles.length} file(s) generated
                    </span>
                  )}
                </div>
              ))}

              {clientSummaryJobs.length === 0 && (
                <div className="text-slate-400 italic py-4 text-center">
                  No summary preparation runs recorded for this client.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
