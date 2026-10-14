import React, { useState } from 'react';
import { Search, Plus, Edit2, Archive, Lock, FolderOpen, ExternalLink, ShieldCheck } from 'lucide-react';
import { ClientProfile } from '../types/index.ts';

interface ClientDirectoryViewProps {
  clients: ClientProfile[];
  onOpenModal: (client?: ClientProfile) => void;
  onArchive: (id: string) => void;
  onSelectClient: (id: string) => void;
  onNavigateToTool: (tool: 'downloader' | 'summary', clientId?: string) => void;
}

export const ClientDirectoryView: React.FC<ClientDirectoryViewProps> = ({
  clients,
  onOpenModal,
  onArchive,
  onSelectClient,
  onNavigateToTool
}) => {
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const filtered = clients.filter((c) => {
    if (!showArchived && c.archived) return false;
    if (showArchived && !c.archived) return false;

    const query = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(query) ||
      c.pan.toLowerCase().includes(query) ||
      c.gstin.toLowerCase().includes(query) ||
      c.id.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Practice Roster</span>
              <span className="text-slate-300">·</span>
              <span className="text-xs font-mono text-slate-500">AES-256 Vault Protected</span>
            </div>
            <h1 className="text-lg font-bold text-slate-900 mt-1">Client Profiles & Secret Vault</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage client compliance credentials, local sandboxed directories, and document extraction preferences.
            </p>
          </div>

          <button
            onClick={() => onOpenModal()}
            className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Client</span>
          </button>
        </div>
      </div>

      {/* Directory Table Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Filter by name, PAN, GSTIN, or Client ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900 w-64 sm:w-80"
            />
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>Show Archived Profiles</span>
            </label>
          </div>
        </div>

        {/* High-Density Data Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                <th className="py-2.5 px-3">Client Legal Name</th>
                <th className="py-2.5 px-3">PAN</th>
                <th className="py-2.5 px-3">GSTIN</th>
                <th className="py-2.5 px-3">Portals</th>
                <th className="py-2.5 px-3">Vault Status</th>
                <th className="py-2.5 px-3">Local Storage Directory</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((client) => {
                const hasItCred = client.credentialRefs?.incomeTax?.exists;
                const hasGstCred = client.credentialRefs?.gst?.exists;

                return (
                  <tr key={client.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{client.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{client.id}</div>
                    </td>

                    <td className="py-3 px-3 font-mono font-medium text-slate-800 tabular-nums">
                      {client.pan}
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-600 tabular-nums">
                      {client.gstin || '—'}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                        {client.enabledPortals.map((p) => (
                          <span key={p} className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {p === 'INCOME_TAX' ? 'IT Portal' : 'GST Portal'}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-0.5 text-[11px]">
                        {hasItCred && (
                          <span className="text-slate-700 font-mono">
                            IT: {client.credentialRefs?.incomeTax?.ref}
                          </span>
                        )}
                        {hasGstCred && (
                          <span className="text-slate-700 font-mono">
                            GST: {client.credentialRefs?.gst?.ref}
                          </span>
                        )}
                        {!hasItCred && !hasGstCred && (
                          <span className="text-slate-400 italic">No vault keys</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px] text-slate-500 max-w-xs truncate">
                      {client.inputDirectory}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            onSelectClient(client.id);
                            onNavigateToTool('downloader', client.id);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-[11px] font-medium transition-colors"
                        >
                          Extract
                        </button>

                        <button
                          onClick={() => {
                            onSelectClient(client.id);
                            onNavigateToTool('summary', client.id);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-[11px] font-medium transition-colors"
                        >
                          Summarize
                        </button>

                        <button
                          onClick={() => onOpenModal(client)}
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                          title="Edit Profile"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onArchive(client.id)}
                          className={`p-1 rounded ${
                            client.archived
                              ? 'text-emerald-600 hover:bg-emerald-50'
                              : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                          }`}
                          title={client.archived ? 'Restore Client' : 'Archive Client'}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs italic">
                    No client profiles found matching search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
