import React from 'react';
import { X, Terminal, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { JobRecord } from '../types/index.ts';

interface LogViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: JobRecord | null;
}

export const LogViewerModal: React.FC<LogViewerModalProps> = ({ isOpen, onClose, job }) => {
  if (!isOpen || !job) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-3xl w-full flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-md">
              <Terminal className="w-4 h-4 text-slate-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Job #{job.id} — {job.clientName}
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                <span>Type: {job.type}</span>
                <span>·</span>
                <span>Status: {job.status}</span>
                <span>·</span>
                <span>Mode: {job.mode}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Terminal Body */}
        <div className="p-5 flex-1 overflow-y-auto bg-slate-950 text-slate-200 font-mono text-xs space-y-1 terminal-scroll">
          {job.logs.map((log, idx) => {
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

          {job.logs.length === 0 && (
            <div className="text-slate-500 italic py-8 text-center">No log events recorded for this job.</div>
          )}
        </div>

        {/* Output Artifacts Footer */}
        {job.outputFiles.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs">
            <div className="font-semibold text-slate-900 mb-2">Verified Output Artifacts:</div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {job.outputFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white p-2 rounded border border-slate-200 font-mono text-[11px]">
                  <span className="text-slate-800 truncate mr-3">{file}</span>
                  <a
                    href={`/api/files/download?path=${encodeURIComponent(file)}`}
                    className="text-slate-900 font-sans font-semibold hover:underline flex items-center gap-1"
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
    </div>
  );
};
