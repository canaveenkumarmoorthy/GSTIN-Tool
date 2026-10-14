import React from 'react';
import { ShieldCheck, HardDrive, RefreshCw } from 'lucide-react';
import { ExecutionMode, ClientProfile, SystemHealth } from '../types/index.ts';

interface TopBarProps {
  currentTab: 'dashboard' | 'downloader' | 'summary' | 'clients';
  onSelectTab: (tab: 'dashboard' | 'downloader' | 'summary' | 'clients') => void;
  mode: ExecutionMode;
  onToggleMode: (newMode: ExecutionMode) => void;
  health: SystemHealth | null;
  clients: ClientProfile[];
  selectedClientId: string;
  onSelectClient: (id: string) => void;
  onRefresh: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentTab,
  onSelectTab,
  mode,
  onToggleMode,
  health,
  clients,
  selectedClientId,
  onSelectClient,
  onRefresh
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Zone 1: Single text element wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-wider shadow-xs">
              CA
            </div>
            <a
              href="#dashboard"
              onClick={(e) => {
                e.preventDefault();
                onSelectTab('dashboard');
              }}
              className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap"
            >
              Tax & GST Automation Suite
            </a>
          </div>

          {/* Zone 2: 4 single-line text nav links */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => onSelectTab('dashboard')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                currentTab === 'dashboard'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Dashboard Overview
            </button>
            <button
              onClick={() => onSelectTab('downloader')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                currentTab === 'downloader'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Tool 1: Extractor & Downloader
            </button>
            <button
              onClick={() => onSelectTab('summary')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                currentTab === 'summary'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Tool 2: Offline Summary
            </button>
            <button
              onClick={() => onSelectTab('clients')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                currentTab === 'clients'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Client Directory & Vault
            </button>
          </nav>

          {/* Zone 3: Active Client Selector, Mode Toggle, and Server Status */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Client Quick Switcher */}
            <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1">
              <span className="text-slate-400 font-medium">Client:</span>
              <select
                value={selectedClientId}
                onChange={(e) => onSelectClient(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-hidden cursor-pointer max-w-[150px] truncate"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.pan})
                  </option>
                ))}
              </select>
            </div>

            {/* Execution Mode Toggle (DEMO vs REAL) */}
            <div className="flex items-center border border-slate-200 rounded-md p-0.5 bg-slate-100 text-xs">
              <button
                onClick={() => onToggleMode('DEMO')}
                className={`px-2.5 py-1 font-medium rounded-sm transition-all whitespace-nowrap ${
                  mode === 'DEMO'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Generates simulated portal steps & test documents"
              >
                DEMO Mode
              </button>
              <button
                onClick={() => onToggleMode('REAL')}
                className={`px-2.5 py-1 font-medium rounded-sm transition-all whitespace-nowrap ${
                  mode === 'REAL'
                    ? 'bg-white text-amber-900 shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Executes 1_downloader.js & 2_summary_preparer.js"
              >
                REAL Mode
              </button>
            </div>

            {/* Local Host & Loopback Status */}
            <div
              className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
              title={health ? `Server active on 127.0.0.1:3000 (Mode: ${health.mode})` : 'Connecting to local server...'}
            >
              <HardDrive className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden lg:inline tabular-nums">127.0.0.1:3000</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>

            <button
              onClick={onRefresh}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
              title="Refresh Practice Data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
