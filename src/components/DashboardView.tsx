import React, { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  RotateCcw,
  Search,
  Filter,
  ShieldCheck,
  FolderOpen,
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import { ClientProfile, JobRecord, SystemHealth } from '../types/index.ts';

interface DashboardViewProps {
  clients: ClientProfile[];
  jobs: JobRecord[];
  health: SystemHealth | null;
  selectedClient: ClientProfile | null;
  onSelectClient: (id: string) => void;
  onNavigateToTool: (tool: 'downloader' | 'summary', clientId?: string) => void;
  onOpenClientModal: (client?: ClientProfile) => void;
  onViewLogs: (job: JobRecord) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  clients,
  jobs,
  health,
  selectedClient,
  onSelectClient,
  onNavigateToTool,
  onOpenClientModal,
  onViewLogs
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'RUNNING' | 'FAILED'>('ALL');

  // Compute job metrics
  const runningCount = jobs.filter((j) => ['RUNNING', 'WAITING_FOR_OTP', 'WAITING_FOR_CAPTCHA'].includes(j.status)).length;
  const queuedCount = jobs.filter((j) => j.status === 'QUEUED').length;
  const completedCount = jobs.filter((j) => j.status === 'COMPLETED').length;
  const failedCount = jobs.filter((j) => ['FAILED', 'INTERRUPTED'].includes(j.status)).length;

  // Last successful processing date across practice
  const lastCompletedJob = jobs.find((j) => j.status === 'COMPLETED');
  const lastProcessingDate = lastCompletedJob
    ? new Date(lastCompletedJob.completedAt || lastCompletedJob.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'None yet';

  // Filter clients
  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.pan.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.gstin.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter !== 'ALL') {
      const clientJobs = jobs.filter((j) => j.clientId === c.id);
      const latestJob = clientJobs[0];
      if (!latestJob) return false;
      if (statusFilter === 'RUNNING') {
        return ['RUNNING', 'WAITING_FOR_OTP', 'WAITING_FOR_CAPTCHA', 'QUEUED'].includes(latestJob.status);
      }
      if (statusFilter === 'COMPLETED') return latestJob.status === 'COMPLETED';
      if (statusFilter === 'FAILED') return ['FAILED', 'INTERRUPTED'].includes(latestJob.status);
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Health Alert */}
      {health?.mode === 'REAL' && (!health.integrationScripts.downloader.exists || !health.integrationScripts.summaryPreparer.exists) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">REAL Mode Active — Required Scripts Missing</p>
              <p className="mt-1 text-amber-800">
                {!health.integrationScripts.downloader.exists && (
                  <span className="block">• 1_downloader.js is not present in root directory. Playwright downloads will fail visibly in REAL mode.</span>
                )}
                {!health.integrationScripts.summaryPreparer.exists && (
                  <span className="block">• 2_summary_preparer.js is not present in root directory. Summary preparation will fail visibly in REAL mode.</span>
                )}
              </p>
              <p className="mt-2 text-amber-700">
                You can copy your existing scripts to the project root, or switch back to <strong className="underline">DEMO Mode</strong> to test with synthetic data and simulated workflows.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">In Progress / Active</div>
          <div className="mt-2 text-2xl font-bold text-blue-600 tabular-nums">{runningCount}</div>
          <div className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span>{queuedCount} queued in pipeline</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Completed Successfully</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 tabular-nums">{completedCount}</div>
          <div className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Verified output records</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Failed / Interrupted</div>
          <div className="mt-2 text-2xl font-bold text-rose-600 tabular-nums">{failedCount}</div>
          <div className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
            <span>Safe recovery available</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Active Practice Clients</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{clients.length}</div>
          <div className="mt-1 text-xs text-slate-500 truncate">
            Last run: <span className="text-slate-700 font-medium">{lastProcessingDate}</span>
          </div>
        </div>
      </div>

      {/* Main Content: Client Processing Cards Grid */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        {/* Header & Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Client Processing Profiles</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review live compliance job states, document counts, and trigger extraction or offline summaries.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search name, PAN, GSTIN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900 w-48 sm:w-60"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md text-xs">
              {(['ALL', 'RUNNING', 'COMPLETED', 'FAILED'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 font-medium rounded-sm transition-colors ${
                    statusFilter === status ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => onOpenClientModal()}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shadow-xs"
            >
              + Add Client
            </button>
          </div>
        </div>

        {/* Client Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-5">
          {filteredClients.map((client) => {
            const clientJobs = jobs.filter((j) => j.clientId === client.id);
            const latestDownloader = clientJobs.find((j) => j.type === 'DOWNLOADER');
            const latestSummary = clientJobs.find((j) => j.type === 'SUMMARY_PREPARER');
            const latestJob = clientJobs[0];

            const isSelected = selectedClient?.id === client.id;

            // Status indicator color
            let statusBadge = (
              <span className="text-xs text-slate-500 font-medium">Pending</span>
            );
            if (latestJob) {
              if (latestJob.status === 'COMPLETED') {
                statusBadge = <span className="text-xs font-semibold text-emerald-700">Completed</span>;
              } else if (latestJob.status === 'RUNNING') {
                statusBadge = <span className="text-xs font-semibold text-blue-700">Running</span>;
              } else if (latestJob.status === 'WAITING_FOR_OTP' || latestJob.status === 'WAITING_FOR_CAPTCHA') {
                statusBadge = <span className="text-xs font-semibold text-amber-700">Awaiting 2FA</span>;
              } else if (latestJob.status === 'FAILED' || latestJob.status === 'INTERRUPTED') {
                statusBadge = <span className="text-xs font-semibold text-rose-700">Failed</span>;
              }
            }

            return (
              <div
                key={client.id}
                className={`border rounded-lg p-4 transition-all bg-white flex flex-col justify-between ${
                  isSelected ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Card Header: Client Name & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3
                        onClick={() => onSelectClient(client.id)}
                        className="text-sm font-bold text-slate-900 hover:text-blue-600 cursor-pointer truncate"
                        title={client.name}
                      >
                        {client.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                        <span>PAN: {client.pan}</span>
                        {client.gstin && (
                          <>
                            <span>·</span>
                            <span>GSTIN: {client.gstin}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div>{statusBadge}</div>
                  </div>

                  {/* Metadata & Last Runs */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">Last Downloader:</span>
                      <span className="font-medium text-slate-800">
                        {latestDownloader
                          ? `${new Date(latestDownloader.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short'
                            })} (${latestDownloader.status})`
                          : 'Never run'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">Last Summary Prep:</span>
                      <span className="font-medium text-slate-800">
                        {latestSummary
                          ? `${new Date(latestSummary.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short'
                            })} (${latestSummary.status})`
                          : 'Never run'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">Vault Credential:</span>
                      <span className="font-mono text-slate-700">
                        {client.credentialRefs?.incomeTax?.exists || client.credentialRefs?.gst?.exists
                          ? 'Encrypted (AES-256)'
                          : 'Not configured'}
                      </span>
                    </div>

                    {latestJob?.error && (
                      <div className="mt-2 p-2 bg-rose-50 border border-rose-100 rounded text-rose-800 text-[11px] truncate" title={latestJob.error}>
                        Error: {latestJob.error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      onSelectClient(client.id);
                      onNavigateToTool('downloader', client.id);
                    }}
                    className="flex-1 py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 rounded text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>Download</span>
                  </button>

                  <button
                    onClick={() => {
                      onSelectClient(client.id);
                      onNavigateToTool('summary', client.id);
                    }}
                    className="flex-1 py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 rounded text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
                    <span>Summary</span>
                  </button>

                  <button
                    onClick={() => onOpenClientModal(client)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    title="Edit Client Configuration"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredClients.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-xs">
            No client profiles match your current search or filter query.
          </div>
        )}
      </div>

      {/* Recent Practice Jobs Feed */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Recent Practice Automation Activity</h3>
        <div className="divide-y divide-slate-100">
          {jobs.slice(0, 6).map((job) => (
            <div key={job.id} className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    job.status === 'COMPLETED'
                      ? 'bg-emerald-500'
                      : job.status === 'RUNNING'
                      ? 'bg-blue-500'
                      : job.status === 'WAITING_FOR_OTP' || job.status === 'WAITING_FOR_CAPTCHA'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                />
                <div>
                  <span className="font-semibold text-slate-900">{job.clientName}</span>
                  <span className="text-slate-400 mx-1.5">·</span>
                  <span className="text-slate-600">
                    {job.type === 'DOWNLOADER' ? 'Tool 1 Playwright Downloader' : 'Tool 2 ExcelJS Offline Summary'}
                  </span>
                  <span className="text-slate-400 mx-1.5">·</span>
                  <span className="font-mono text-slate-500">{job.mode}</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-slate-400 tabular-nums">
                  {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  onClick={() => onViewLogs(job)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  View Terminal Logs
                </button>
              </div>
            </div>
          ))}

          {jobs.length === 0 && (
            <div className="text-center py-6 text-slate-400 text-xs">
              No jobs have been executed in this session. Start a download or summary workflow to see live events.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
