import React, { useState, useEffect, useRef } from 'react';
import { TopBar } from './components/TopBar.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DownloaderTool } from './components/DownloaderTool.tsx';
import { SummaryTool } from './components/SummaryTool.tsx';
import { ClientDirectoryView } from './components/ClientDirectoryView.tsx';
import { ClientManagerModal } from './components/ClientManagerModal.tsx';
import { LogViewerModal } from './components/LogViewerModal.tsx';
import { ClientProfile, JobRecord, SystemHealth, ExecutionMode } from './types/index.ts';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'downloader' | 'summary' | 'clients'>('dashboard');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [mode, setMode] = useState<ExecutionMode>('DEMO');
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Modals
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientProfile | null>(null);
  const [viewingLogJob, setViewingLogJob] = useState<JobRecord | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<{ id: string; type: 'success' | 'error' | 'info'; message: string }[]>([]);

  const addNotification = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 6000);
  };

  // 1. Fetch practice health, clients, and jobs
  const fetchAllData = async () => {
    try {
      const [healthRes, clientsRes, jobsRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/clients'),
        fetch('/api/jobs')
      ]);

      if (healthRes.ok) {
        const hData = await healthRes.json();
        setHealth(hData);
        setMode(hData.mode);
      }

      if (clientsRes.ok) {
        const cData = await clientsRes.json();
        setClients(cData);
        if (cData.length > 0 && !selectedClientId) {
          setSelectedClientId(cData[0].id);
        }
      }

      if (jobsRes.ok) {
        const jData = await jobsRes.json();
        setJobs(jData);

        // Find current in-flight job if any
        const active = jData.find((j: JobRecord) =>
          ['QUEUED', 'RUNNING', 'WAITING_FOR_OTP', 'WAITING_FOR_CAPTCHA'].includes(j.status)
        );
        if (active && (!activeJobId || active.id !== activeJobId)) {
          setActiveJobId(active.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch initial application data:', err);
    }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 6000);
    return () => clearInterval(interval);
  }, []);

  // 2. SSE Subscription for Active Job
  useEffect(() => {
    if (!activeJobId) return;

    const eventSource = new EventSource(`/api/jobs/${activeJobId}/events`);

    eventSource.addEventListener('snapshot', (e: MessageEvent) => {
      const job: JobRecord = JSON.parse(e.data);
      updateJobInState(job);
    });

    eventSource.addEventListener('status_change', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setJobs((prev) =>
        prev.map((j) => (j.id === data.id ? { ...j, status: data.status, progress: data.progress, currentStepMessage: data.currentStepMessage, error: data.error, prompt: data.prompt } : j))
      );
      if (['COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(data.status)) {
        if (data.status === 'COMPLETED') {
          addNotification('success', `Job #${data.id.slice(-6)} completed successfully.`);
        } else if (data.status === 'FAILED') {
          addNotification('error', `Job #${data.id.slice(-6)} failed: ${data.error || 'Execution error'}`);
        }
      }
    });

    eventSource.addEventListener('progress', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setJobs((prev) =>
        prev.map((j) => (j.id === activeJobId ? { ...j, progress: data.progress, currentStepMessage: data.currentStepMessage } : j))
      );
    });

    eventSource.addEventListener('log', (e: MessageEvent) => {
      const log = JSON.parse(e.data);
      setJobs((prev) =>
        prev.map((j) => (j.id === activeJobId ? { ...j, logs: [...j.logs, log] } : j))
      );
    });

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [activeJobId]);

  const updateJobInState = (job: JobRecord) => {
    setJobs((prev) => {
      const exists = prev.find((j) => j.id === job.id);
      if (exists) {
        return prev.map((j) => (j.id === job.id ? job : j));
      }
      return [job, ...prev];
    });
  };

  // 3. Execution Mode Switch
  const handleToggleMode = async (newMode: ExecutionMode) => {
    try {
      const res = await fetch('/api/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });
      if (res.ok) {
        const data = await res.json();
        setMode(data.mode);
        addNotification('info', `Switched to ${data.mode} mode.`);
        fetchAllData();
      }
    } catch (err: any) {
      addNotification('error', `Failed to switch mode: ${err.message}`);
    }
  };

  // 4. Downloader Actions
  const handleStartDownloaderJob = async (params: {
    clientId: string;
    portal: 'INCOME_TAX' | 'GST';
    documentsRequested: string[];
    financialYear: string;
    assessmentYear: string;
  }) => {
    try {
      const res = await fetch('/api/downloader/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start downloader job');
      }
      setActiveJobId(data.id);
      updateJobInState(data);
      addNotification('info', `Downloader job #${data.id.slice(-6)} started.`);
    } catch (err: any) {
      addNotification('error', err.message);
      throw err;
    }
  };

  // 5. Summary Preparer Actions
  const handleStartSummaryJob = async (params: {
    clientId: string;
    pruneEmptyRows: boolean;
    pruneEmptyColumns: boolean;
  }) => {
    try {
      const res = await fetch('/api/summary/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start summary job');
      }
      setActiveJobId(data.id);
      updateJobInState(data);
      addNotification('info', `Summary preparation job #${data.id.slice(-6)} started.`);
    } catch (err: any) {
      addNotification('error', err.message);
      throw err;
    }
  };

  // 6. Job Controls: cancel, retry, input
  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        updateJobInState(data.job);
        addNotification('info', `Job #${jobId.slice(-6)} cancelled.`);
      }
    } catch (err: any) {
      addNotification('error', err.message);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setActiveJobId(data.id);
        updateJobInState(data);
        addNotification('info', `Retrying job as #${data.id.slice(-6)}.`);
      } else {
        addNotification('error', data.error);
      }
    } catch (err: any) {
      addNotification('error', err.message);
    }
  };

  const handleSubmitOtp = async (jobId: string, otp: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: otp })
      });
      if (res.ok) {
        addNotification('success', 'Verification code submitted. Automation resumed.');
      }
    } catch (err: any) {
      addNotification('error', err.message);
    }
  };

  // 7. Client Management Save & Archive
  const handleSaveClient = async (clientData: any) => {
    const isEdit = Boolean(clientData.id);
    const url = isEdit ? `/api/clients/${clientData.id}` : '/api/clients';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientData)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save client');

    addNotification('success', `Client ${data.name} saved successfully.`);
    await fetchAllData();
  };

  const handleArchiveClient = async (id: string) => {
    try {
      const res = await fetch(`/api/clients/${id}/archive`, { method: 'POST' });
      if (res.ok) {
        addNotification('info', 'Client profile archive status updated.');
        await fetchAllData();
      }
    } catch (err: any) {
      addNotification('error', err.message);
    }
  };

  const selectedClient = clients.find((c) => c.id === selectedClientId) || clients[0] || null;
  const activeJob = jobs.find((j) => j.id === activeJobId) || null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Bar Component */}
      <TopBar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        mode={mode}
        onToggleMode={handleToggleMode}
        health={health}
        clients={clients}
        selectedClientId={selectedClientId}
        onSelectClient={setSelectedClientId}
        onRefresh={fetchAllData}
      />

      {/* Persistent Notification Toast Area */}
      {notifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm pointer-events-none">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-3 rounded-md text-xs shadow-lg font-medium border pointer-events-auto transition-all ${
                n.type === 'success'
                  ? 'bg-emerald-950 text-emerald-100 border-emerald-800'
                  : n.type === 'error'
                  ? 'bg-rose-950 text-rose-100 border-rose-800'
                  : 'bg-slate-900 text-slate-100 border-slate-800'
              }`}
            >
              {n.message}
            </div>
          ))}
        </div>
      )}

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'dashboard' && (
          <DashboardView
            clients={clients}
            jobs={jobs}
            health={health}
            selectedClient={selectedClient}
            onSelectClient={setSelectedClientId}
            onNavigateToTool={(tool, clientId) => {
              if (clientId) setSelectedClientId(clientId);
              setCurrentTab(tool);
            }}
            onOpenClientModal={(c) => {
              setEditingClient(c || null);
              setIsClientModalOpen(true);
            }}
            onViewLogs={(job) => setViewingLogJob(job)}
          />
        )}

        {currentTab === 'downloader' && (
          <DownloaderTool
            clients={clients}
            selectedClient={selectedClient}
            onSelectClient={setSelectedClientId}
            activeJob={activeJob?.type === 'DOWNLOADER' ? activeJob : null}
            jobs={jobs}
            mode={mode}
            onStartJob={handleStartDownloaderJob}
            onCancelJob={handleCancelJob}
            onRetryJob={handleRetryJob}
            onSubmitOtp={handleSubmitOtp}
          />
        )}

        {currentTab === 'summary' && (
          <SummaryTool
            clients={clients}
            selectedClient={selectedClient}
            onSelectClient={setSelectedClientId}
            activeJob={activeJob?.type === 'SUMMARY_PREPARER' ? activeJob : null}
            jobs={jobs}
            mode={mode}
            onStartSummaryJob={handleStartSummaryJob}
            onCancelJob={handleCancelJob}
            onRetryJob={handleRetryJob}
          />
        )}

        {currentTab === 'clients' && (
          <ClientDirectoryView
            clients={clients}
            onOpenModal={(c) => {
              setEditingClient(c || null);
              setIsClientModalOpen(true);
            }}
            onArchive={handleArchiveClient}
            onSelectClient={setSelectedClientId}
            onNavigateToTool={(tool, clientId) => {
              if (clientId) setSelectedClientId(clientId);
              setCurrentTab(tool);
            }}
          />
        )}
      </main>

      {/* Modals */}
      <ClientManagerModal
        isOpen={isClientModalOpen}
        onClose={() => {
          setIsClientModalOpen(false);
          setEditingClient(null);
        }}
        client={editingClient}
        onSave={handleSaveClient}
      />

      <LogViewerModal
        isOpen={Boolean(viewingLogJob)}
        onClose={() => setViewingLogJob(null)}
        job={viewingLogJob}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Tax & GST Automation Suite · Chartered Accountancy Financial Operations Console</span>
          <span className="font-mono text-[11px] text-slate-400">
            Node.js + Express + Playwright + ExcelJS · Air-Gapped Local Processing
          </span>
        </div>
      </footer>
    </div>
  );
}
