import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { CredentialVault } from '../security/vault.ts';

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
  // Masked credential indicators (never plaintext passwords)
  credentialRefs?: {
    incomeTax?: { exists: boolean; username?: string; ref?: string };
    gst?: { exists: boolean; username?: string; ref?: string };
  };
}

export class ClientStore {
  private dataDir: string;
  private filePath: string;
  private clients: Map<string, ClientProfile> = new Map();
  private vault: CredentialVault;

  constructor(dataDir: string, vault: CredentialVault) {
    this.dataDir = dataDir;
    this.vault = vault;
    this.filePath = path.join(dataDir, 'clients.json');
    this.init();
  }

  private init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const list: ClientProfile[] = JSON.parse(raw);
        for (const c of list) {
          this.clients.set(c.id, c);
        }
      } catch (err) {
        console.error('[ClientStore] Failed to parse clients.json, seeding defaults:', err);
        this.seedDefaults();
      }
    } else {
      this.seedDefaults();
    }
  }

  private seedDefaults() {
    const defaultClients: ClientProfile[] = [
      {
        id: 'client_acme_corp',
        name: 'Acme Finserve Pvt Ltd',
        pan: 'AABCA1234F',
        gstin: '27AABCA1234F1Z5',
        dob: '2015-04-12',
        portalUsernameIncomeTax: 'ACME_IT_2026',
        portalUsernameGst: '27AABCA1234F1Z5',
        enabledPortals: ['INCOME_TAX', 'GST'],
        documentPreferences: ['AIS', 'TIS', '26AS', 'ITR_V', 'GSTR_1', 'GSTR_3B'],
        inputDirectory: 'data/clients/client_acme_corp/inputs',
        outputDirectory: 'data/clients/client_acme_corp/outputs',
        downloadDirectory: 'data/clients/client_acme_corp/downloads',
        archived: false,
        createdAt: new Date('2026-01-10').toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'client_textiles',
        name: 'Shri Ramakrishna Textiles',
        pan: 'BBKPR5678M',
        gstin: '33BBKPR5678M1Z8',
        dob: '2008-09-22',
        portalUsernameIncomeTax: 'RAMAKRISHNA_TEX',
        portalUsernameGst: '33BBKPR5678M1Z8',
        enabledPortals: ['GST'],
        documentPreferences: ['GSTR_1', 'GSTR_3B'],
        inputDirectory: 'data/clients/client_textiles/inputs',
        outputDirectory: 'data/clients/client_textiles/outputs',
        downloadDirectory: 'data/clients/client_textiles/downloads',
        archived: false,
        createdAt: new Date('2026-02-01').toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'client_dr_murthy',
        name: 'Dr. Aruna V. Murthy',
        pan: 'ARUPM9876C',
        gstin: '',
        dob: '1974-11-05',
        portalUsernameIncomeTax: 'ARUPM9876C',
        enabledPortals: ['INCOME_TAX'],
        documentPreferences: ['AIS', 'TIS', '26AS', 'ITR_V'],
        inputDirectory: 'data/clients/client_dr_murthy/inputs',
        outputDirectory: 'data/clients/client_dr_murthy/outputs',
        downloadDirectory: 'data/clients/client_dr_murthy/downloads',
        archived: false,
        createdAt: new Date('2026-03-15').toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    for (const c of defaultClients) {
      this.clients.set(c.id, c);
      this.ensureClientDirectories(c.id);

      // Store initial demo credentials in vault
      if (c.portalUsernameIncomeTax) {
        this.vault.storeCredential(c.id, 'INCOME_TAX', c.portalUsernameIncomeTax, 'Demo@TaxSecure#2026');
      }
      if (c.portalUsernameGst) {
        this.vault.storeCredential(c.id, 'GST', c.portalUsernameGst, 'Demo@GstPortal#2026');
      }
    }

    this.saveToFile();
    this.seedSampleSpreadsheets();
  }

  private saveToFile() {
    const list = Array.from(this.clients.values());
    fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8');
  }

  public ensureClientDirectories(clientId: string) {
    const clientDir = path.join(this.dataDir, 'clients', clientId);
    const dirs = ['inputs', 'outputs', 'downloads'];
    for (const d of dirs) {
      const target = path.join(clientDir, d);
      if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
      }
    }
  }

  /**
   * Generates a sample test workbook in Acme Finserve inputs folder with blank rows, 0 values, formulas, dates, etc.
   */
  private async seedSampleSpreadsheets() {
    try {
      const acmeInputsDir = path.join(this.dataDir, 'clients', 'client_acme_corp', 'inputs');
      if (!fs.existsSync(acmeInputsDir)) {
        fs.mkdirSync(acmeInputsDir, { recursive: true });
      }

      const sampleFilePath = path.join(acmeInputsDir, 'fy2025_26_sales_ledger_raw.xlsx');
      if (!fs.existsSync(sampleFilePath)) {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Sales Ledger');

        // Headers
        ws.addRow(['Invoice No', 'Invoice Date', 'Party GSTIN', 'Taxable Value', 'IGST (18%)', 'Total Invoice Value', 'Status']);
        
        // Row with normal values and date
        ws.addRow(['INV-2026-001', new Date('2026-04-02'), '27AABCA1234F1Z5', 100000, 18000, { formula: 'D2+E2', result: 118000 }, 'FILLED']);
        
        // Blank row to test pruning
        ws.addRow([null, null, '', null, undefined, null, '']);

        // Row with numeric ZERO and boolean FALSE (Must NOT be pruned!)
        ws.addRow(['INV-2026-002', new Date('2026-04-05'), '33BBKPR5678M1Z8', 0, 0, { formula: 'D4+E4', result: 0 }, 'EXEMPT']);

        // Another completely blank row
        ws.addRow(['', '', '', '', '', '', '']);

        // Row with large value and formula
        ws.addRow(['INV-2026-003', new Date('2026-04-10'), '29AADCS9012E1ZQ', 250000, 45000, { formula: 'D6+E6', result: 295000 }, 'ACTIVE']);

        await wb.xlsx.writeFile(sampleFilePath);
      }

      // Also create a sample CSV
      const sampleCsvPath = path.join(acmeInputsDir, 'gstr2b_purchase_raw.csv');
      if (!fs.existsSync(sampleCsvPath)) {
        const csvContent = 
`Invoice Number,Invoice Date,Supplier GSTIN,Taxable Amount,Integrated Tax,Central Tax,State Tax
INV-SUP-101,2026-04-01,27AAACC4132P1ZT,45000.00,8100.00,0.00,0.00
,,,,,,
INV-SUP-102,2026-04-03,33AAACR2211M1ZW,0.00,0.00,0.00,0.00
,,,,,,
INV-SUP-103,2026-04-08,24AABCS5544K1ZR,120000.00,0.00,10800.00,10800.00
`;
        fs.writeFileSync(sampleCsvPath, csvContent, 'utf-8');
      }

      // Create a mock legacy .xls file (plain text with .xls extension) to test unsupported detection
      const sampleLegacyXlsPath = path.join(acmeInputsDir, 'legacy_tally_dump_2021.xls');
      if (!fs.existsSync(sampleLegacyXlsPath)) {
        fs.writeFileSync(sampleLegacyXlsPath, 'BIFF8_LEGACY_MOCK_CONTENT_DO_NOT_CORRUPT', 'utf-8');
      }

    } catch (err) {
      console.error('[ClientStore] Error generating sample spreadsheets:', err);
    }
  }

  public getAllClients(): ClientProfile[] {
    const list: ClientProfile[] = [];
    for (const c of this.clients.values()) {
      const enriched = { ...c };
      enriched.credentialRefs = {
        incomeTax: this.vault.getMaskedRef(c.id, 'INCOME_TAX'),
        gst: this.vault.getMaskedRef(c.id, 'GST')
      };
      list.push(enriched);
    }
    return list;
  }

  public getClient(id: string): ClientProfile | null {
    const c = this.clients.get(id);
    if (!c) return null;
    const enriched = { ...c };
    enriched.credentialRefs = {
      incomeTax: this.vault.getMaskedRef(c.id, 'INCOME_TAX'),
      gst: this.vault.getMaskedRef(c.id, 'GST')
    };
    return enriched;
  }

  public saveClient(profile: Partial<ClientProfile> & { name: string; pan: string }): ClientProfile {
    const id = profile.id || `client_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const existing = this.clients.get(id);
    const newClient: ClientProfile = {
      id,
      name: profile.name.trim(),
      pan: (profile.pan || '').toUpperCase().trim(),
      gstin: (profile.gstin || '').toUpperCase().trim(),
      dob: profile.dob || existing?.dob || '',
      portalUsernameIncomeTax: profile.portalUsernameIncomeTax || existing?.portalUsernameIncomeTax || '',
      portalUsernameGst: profile.portalUsernameGst || existing?.portalUsernameGst || '',
      enabledPortals: profile.enabledPortals || existing?.enabledPortals || ['INCOME_TAX'],
      documentPreferences: profile.documentPreferences || existing?.documentPreferences || ['AIS', '26AS'],
      inputDirectory: `data/clients/${id}/inputs`,
      outputDirectory: `data/clients/${id}/outputs`,
      downloadDirectory: `data/clients/${id}/downloads`,
      archived: profile.archived ?? existing?.archived ?? false,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    this.clients.set(id, newClient);
    this.ensureClientDirectories(id);
    this.saveToFile();

    return this.getClient(id)!;
  }

  public archiveClient(id: string): boolean {
    const c = this.clients.get(id);
    if (!c) return false;
    c.archived = !c.archived;
    c.updatedAt = new Date().toISOString();
    this.saveToFile();
    return true;
  }
}
