# CA Tax & GST Automation Suite

A desktop-first web automation and offline financial analytics platform built for Chartered Accountancy practices. The suite orchestrates government portal extractions (Income Tax & GST) using Playwright and prepares local audit workbooks using ExcelJS with **Zero-Loss Dynamic Filtering**.

---

## 1. System Architecture & Features

```
┌────────────────────────────────────────────────────────────────────────┐
│             CA Tax & GST Automation Suite — Desktop UI (React)         │
│  ┌───────────────┬────────────────────────────┬─────────────────────┐  │
│  │ Practice Nav  │ Global Dashboard & Clients │ Active Job Terminal │  │
│  │ & Mode Toggle │ Tool 1: Playwright Extract │ & Human OTP Modal   │  │
│  │ (DEMO / REAL) │ Tool 2: ExcelJS Summary    │                     │  │
│  └───────┬───────┴─────────────┬──────────────┴──────────┬──────────┘  │
└──────────┼─────────────────────┼─────────────────────────┼─────────────┘
           │ REST API (JSON)     │ Server-Sent Events (SSE)│
           ▼                     ▼                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│              Express.js Backend (127.0.0.1:3000 / Localhost)           │
│  ┌───────────────────────┬───────────────────────────┬──────────────┐  │
│  │ Origin / CSRF Shield  │ Client Mutex Lock Manager │ State Engine │  │
│  │ Request Schema Valid. │ Server Restart Recovery   │ SSE Broker   │  │
│  └───────────┬───────────┴─────────────┬─────────────┴───────┬──────┘  │
│              │                         │                     │         │
│              ▼                         ▼                     ▼         │
│  ┌────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │ AES-256-GCM Vault      │  │ Execution Router (DEMO vs REAL)      │  │
│  │ PBKDF2 Key Derivation  │  │  - DEMO: Synthetic generator         │  │
│  │ Masked Credential Ref  │  │  - REAL: 1_downloader / 2_summary    │  │
│  └────────────────────────┘  └──────────────────┬───────────────────┘  │
└─────────────────────────────────────────────────┼──────────────────────┘
                                                  │
              ┌───────────────────────────────────┴────────────────────┐
              ▼                                                        ▼
┌───────────────────────────────────────────┐ ┌───────────────────────────────────────────┐
│     Downloader Adapter (Playwright)       │ │    Summary Preparer Adapter (ExcelJS)     │
│ - Mode: REAL (invokes 1_downloader.js)    │ │ - Mode: REAL (invokes 2_summary_prep.js)  │
│ - Mode: DEMO (simulated portal flow)      │ │ - Mode: DEMO (synthetic ledger build)     │
│ - Safe OTP / CAPTCHA Human Pause Hook     │ │ - Safe ZIP Unpack (Zip-Slip shield)       │
│ - Output verification before COMPLETED    │ │ - Zero-Loss Blank Row/Col Trim  │  │
│                                           │ │ - Manifest & Transformation Audit Logger  │
└─────────────────────┬─────────────────────┘ └─────────────────────┬─────────────────────┘
                      │                                             │
                      ▼                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           Sandboxed Local Filesystem Storage                            │
│   • /data/clients.json (sanitized profiles)    • /data/jobs.json (persisted state)      │
│   • /data/vault.enc (AES-256-GCM ciphertext)   • /data/clients/{id}/inputs (read-only)  │
│   • /data/clients/{id}/downloads (verified)    • /data/clients/{id}/outputs (manifests) │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Windows Installation & Startup

### Prerequisites
- Windows 10/11 or Windows Server.
- [Node.js](https://nodejs.org/) v18.0.0 or higher (LTS recommended).
- Git for Windows or PowerShell 5.1+.

### Step-by-Step Setup
1. **Open PowerShell as Administrator** or standard user and navigate to your desired directory:
   ```powershell
   cd C:\PracticeAutomations\ca-tax-suite
   ```

2. **Install Node.js dependencies**:
   ```powershell
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the `.env.example` file to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
   Open `.env` in Notepad or VS Code and review the defaults:
   - `PORT=3000` (Default desktop web port)
   - `HOST=127.0.0.1` (Strict loopback binding)
   - `EXECUTION_MODE=DEMO` (Can be toggled in the UI or set to `REAL`)
   - `VAULT_MASTER_KEY` (Your practice master vault passphrase)

4. **Start the Application**:
   ```powershell
   npm run dev
   ```
   Or for production mode:
   ```powershell
   npm run build
   npm start
   ```

5. **Access the Suite**:
   Open Google Chrome, Microsoft Edge, or Firefox and browse to:
   ```
   http://127.0.0.1:3000
   ```

---

## 3. Operational Modes: DEMO vs. REAL

The suite enforces **strict mode separation** and will **never silently fall back** from a failed real execution to a simulation:

### DEMO Mode
- Ideal for testing, staff training, and verification without connecting to live government tax servers.
- Generates realistic synthetic `.pdf` and `.xlsx` artifacts with valid structure in `data/clients/<clientId>/`.
- Emulates Playwright portal steps with a human-in-the-loop 2FA OTP prompt requiring actual operator input.
- Executes the full ExcelJS Zero-Loss dynamic filtering engine against sample client fixtures.
- Every log message is explicitly tagged `[SIMULATED]`.

### REAL Mode
- Invokes your existing scripts: `1_downloader.js` and `2_summary_preparer.js`.
- If the script is missing from the project root, the job **fails visibly** with an explicit diagnostic message.
- Securely retrieves credentials from the encrypted vault and passes them via child process environment variables (`PORTAL_USERNAME`, `PORTAL_PASSWORD`, etc.).
- Streams child process `stdout` and `stderr` line-by-line via Server-Sent Events (SSE).
- Pauses for manual human input when `waiting for otp` or `waiting for captcha` is detected in child process output.
- **Verification Guarantee**: A job is only marked `COMPLETED` when its output files exist and pass validation on disk.

---

## 4. Security Architecture

1. **Local AES-256-GCM Vault**:
   - Master encryption key derived via PBKDF2 (100,000 iterations, SHA-512) with a unique salt.
   - Encrypted with AES-256-GCM using unique 16-byte initialization vectors (IVs) and 16-byte authentication tags.
   - Zero plaintext passwords in responses, storage files, URLs, or browser localStorage.

2. **Sandbox Filesystem Security**:
   - All client reads/writes are restricted to `data/clients/<clientId>/`.
   - Protection against directory traversal (`..`) and null-byte injection.
   - Safe ZIP archive extraction with Zip-Slip defense and a 50MB decompression limit.

3. **Local Loopback API Protection**:
   - Server binds to `127.0.0.1` by default.
   - Mutating REST endpoints validate `Origin` and `Host` headers to prevent cross-origin drive-by attacks from malicious browser tabs.
   - Log redaction strips passwords, OTPs, and masks PAN numbers.

4. **Zero-Loss Dynamic Filtering Policy**:
   - Blankness is defined by underlying cell type: numeric `0`, boolean `false`, formulas, dates, error objects, and tax identifiers (PAN, GSTIN) are **never pruned**.
   - Completely blank rows (where every cell is empty) are pruned safely.
   - Empty columns are only removed if explicitly enabled in user settings.
   - Original source workbooks are never overwritten; outputs are written to timestamped files accompanied by a detailed `manifest.json`.
   - Legacy binary `.xls` (BIFF8) files are reported as unsupported in the manifest and left unmodified.

---

## 5. Automated Test Suite

Run the comprehensive test suite verifying all 8 security, compatibility, and data integrity guarantees:

```bash
npm test
```

The test suite validates:
1. `FilesystemSandbox` rejects path traversal (`../../etc/passwd`).
2. `FilesystemSandbox` prevents Zip-Slip extraction attacks.
3. `CredentialVault` authenticated encryption & decryption (AES-256-GCM + PBKDF2).
4. `Zero-Loss filtering` strictly preserves 0, false, formulas, dates, and GSTIN/PAN.
5. `Legacy .xls` files are cataloged as unsupported without corruption.
6. `JobManager` enforces per-client mutex locking.
7. `JobManager` recovers from server restarts and marks in-flight jobs as `INTERRUPTED`.
8. `REAL mode` fails visibly when scripts are missing, with zero silent fallbacks.

---

## 6. Troubleshooting

- **"REAL mode error: 1_downloader.js is not present"**:
  Copy your Playwright automation script to `1_downloader.js` in the application root, or toggle to **DEMO Mode** in the top navigation bar.
- **Port 3000 in use**:
  Set `PORT=3001` in `.env` and restart with `npm run dev`.
- **Interrupted Jobs**:
  If the application is closed while an automation is running, the server restart recovery engine automatically marks the job as `INTERRUPTED`. Click **Retry** on the job card to re-run safely.
