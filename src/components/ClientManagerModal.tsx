import React, { useState, useEffect } from 'react';
import { X, Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { ClientProfile } from '../types/index.ts';

interface ClientManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  client?: ClientProfile | null;
  onSave: (clientData: any) => Promise<void>;
}

export const ClientManagerModal: React.FC<ClientManagerModalProps> = ({
  isOpen,
  onClose,
  client,
  onSave
}) => {
  const [name, setName] = useState('');
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [dob, setDob] = useState('');
  const [portalUsernameIncomeTax, setPortalUsernameIncomeTax] = useState('');
  const [portalPasswordIncomeTax, setPortalPasswordIncomeTax] = useState('');
  const [portalUsernameGst, setPortalUsernameGst] = useState('');
  const [portalPasswordGst, setPortalPasswordGst] = useState('');
  const [enabledPortals, setEnabledPortals] = useState<('INCOME_TAX' | 'GST')[]>(['INCOME_TAX', 'GST']);
  const [documentPreferences, setDocumentPreferences] = useState<string[]>(['AIS', 'TIS', '26AS', 'ITR_V', 'GSTR_1', 'GSTR_3B']);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (client) {
      setName(client.name || '');
      setPan(client.pan || '');
      setGstin(client.gstin || '');
      setDob(client.dob || '');
      setPortalUsernameIncomeTax(client.portalUsernameIncomeTax || '');
      setPortalUsernameGst(client.portalUsernameGst || '');
      setPortalPasswordIncomeTax(''); // Never populate plaintext password
      setPortalPasswordGst('');
      setEnabledPortals(client.enabledPortals || ['INCOME_TAX']);
      setDocumentPreferences(client.documentPreferences || ['AIS', '26AS']);
    } else {
      setName('');
      setPan('');
      setGstin('');
      setDob('');
      setPortalUsernameIncomeTax('');
      setPortalPasswordIncomeTax('');
      setPortalUsernameGst('');
      setPortalPasswordGst('');
      setEnabledPortals(['INCOME_TAX', 'GST']);
      setDocumentPreferences(['AIS', 'TIS', '26AS', 'ITR_V', 'GSTR_1', 'GSTR_3B']);
    }
    setError(null);
  }, [client, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Client name is required');
      return;
    }

    const cleanPan = pan.toUpperCase().trim();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
      setError('Invalid PAN format. Must be 10 characters (e.g. AABCA1234F)');
      return;
    }

    const cleanGstin = gstin.toUpperCase().trim();
    if (cleanGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleanGstin)) {
      setError('Invalid GSTIN format. Must be 15 characters (e.g. 27AABCA1234F1Z5)');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        id: client?.id,
        name: name.trim(),
        pan: cleanPan,
        gstin: cleanGstin,
        dob,
        portalUsernameIncomeTax: portalUsernameIncomeTax.trim(),
        portalPasswordIncomeTax: portalPasswordIncomeTax ? portalPasswordIncomeTax.trim() : undefined,
        portalUsernameGst: portalUsernameGst.trim(),
        portalPasswordGst: portalPasswordGst ? portalPasswordGst.trim() : undefined,
        enabledPortals,
        documentPreferences
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save client');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-xl w-full p-6 space-y-5 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {client ? `Edit Client: ${client.name}` : 'Create Practice Client Profile'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Non-secret profile stored locally in JSON; portal passwords encrypted into local AES-256 vault.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* General Information */}
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Client Full Legal Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Reliance Logistics Pvt Ltd or Ravi Sharma"
                className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Permanent Account Number (PAN) *</label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={pan}
                  onChange={(e) => setPan(e.target.value)}
                  placeholder="AABCA1234F"
                  className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 focus:bg-white focus:outline-hidden font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">GSTIN (Optional for Individuals)</label>
                <input
                  type="text"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="27AABCA1234F1Z5"
                  className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 focus:bg-white focus:outline-hidden font-mono uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Date of Birth / Incorporation</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-md bg-slate-50 focus:bg-white focus:outline-hidden font-mono"
              />
            </div>
          </div>

          {/* Secure Credential Vault Inputs */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="flex items-center gap-1.5 text-slate-900 font-bold">
              <Lock className="w-3.5 h-3.5 text-slate-700" />
              <span>Portal Credentials (Stored in Local Encrypted Vault)</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Passwords are encrypted immediately upon submission with AES-256-GCM. Plaintext is never logged or returned by API.
            </p>

            {/* Income Tax Credentials */}
            <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-2">
              <div className="font-semibold text-slate-800">Income Tax e-Filing Portal</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Username / User ID</label>
                  <input
                    type="text"
                    value={portalUsernameIncomeTax}
                    onChange={(e) => setPortalUsernameIncomeTax(e.target.value)}
                    placeholder="PAN or User ID"
                    className="w-full p-1.5 border border-slate-300 rounded bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Password {client?.credentialRefs?.incomeTax?.exists ? '(Leave blank to retain current)' : ''}
                  </label>
                  <input
                    type="password"
                    value={portalPasswordIncomeTax}
                    onChange={(e) => setPortalPasswordIncomeTax(e.target.value)}
                    placeholder={client?.credentialRefs?.incomeTax?.exists ? '••••••••' : 'Enter portal password'}
                    className="w-full p-1.5 border border-slate-300 rounded bg-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* GST Portal Credentials */}
            <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-2">
              <div className="font-semibold text-slate-800">GST Portal (services.gst.gov.in)</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Username</label>
                  <input
                    type="text"
                    value={portalUsernameGst}
                    onChange={(e) => setPortalUsernameGst(e.target.value)}
                    placeholder="GST Portal Username"
                    className="w-full p-1.5 border border-slate-300 rounded bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Password {client?.credentialRefs?.gst?.exists ? '(Leave blank to retain current)' : ''}
                  </label>
                  <input
                    type="password"
                    value={portalPasswordGst}
                    onChange={(e) => setPortalPasswordGst(e.target.value)}
                    placeholder={client?.credentialRefs?.gst?.exists ? '••••••••' : 'Enter GST password'}
                    className="w-full p-1.5 border border-slate-300 rounded bg-white font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-md transition-colors shadow-xs"
            >
              {isSubmitting ? 'Saving Profile...' : client ? 'Update Client' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
