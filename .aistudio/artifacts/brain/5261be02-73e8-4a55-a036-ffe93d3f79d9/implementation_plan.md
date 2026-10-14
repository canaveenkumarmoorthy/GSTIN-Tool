# CA Tax & GST Automation Suite — Enterprise Architecture

A secure, desktop-first automation, document extraction, and offline financial analytics platform designed specifically for Chartered Accountancy practices. The system coordinates Playwright for portal downloads and ExcelJS for local, air-gapped ledger and audit summary preparation.

### User Review & Critical Decisions

> [!IMPORTANT]
> The architecture has been revised to incorporate all 10 mandatory engineering requirements:
> 1. **Strict DEMO vs. REAL Mode Separation**: Explicit operational mode toggle in UI and backend configuration (`EXECUTION_MODE=DEMO|REAL`). DEMO mode creates synthetic documents and simulation logs explicitly flagged as `[SIMULATED]`. REAL mode attempts actual script execution and fails immediately with visible diagnostic errors if `1_downloader.js` or `2_summary_preparer.js` are missing. No silent fallbacks.
> 2. **Excel Compatibility Boundaries**: ExcelJS operates exclusively on `.xlsx` and `.csv`. Legacy binary `.xls` (BIFF8) files are reported as unsupported in the audit manifest without modifying source files.
> 3. **True Zero-Loss Processing Engine**: Blankness is evaluated strictly against cell data types. Numeric zeros (`0`, `0.00`), boolean `false`, formulas, error objects, dates, rich text, and tax identifiers (PAN, GSTIN) are never pruned. Empty columns require explicit user policy toggle. Manifest logs every row transformation.
> 4. **Authenticated Credential Vault**: Local AES-256-GCM encryption with PBKDF2 (100k iterations) key derivation, unique 16-byte initialization vectors (IVs), and 16-byte authentication tags. Keys are kept strictly separate from the vault store, and secrets are excluded from logs, API payloads, and git.
> 5. **Reliable Job State Machine & Recovery**: States include `QUEUED`, `RUNNING`, `WAITING_FOR_OTP`, `WAITING_FOR_CAPTCHA`, `COMPLETED`, `FAILED`, `CANCELLED`, and `INTERRUPTED`. Server restart detection identifies in-flight jobs and marks them `INTERRUPTED` with safe retry triggers. Per-client locking prevents simultaneous conflicting executions.
> 6. **Sandbox Filesystem Security**: All client read/write operations are sandboxed within `<storage_root>/clients/<client_id>/`. Path resolution validates against path traversal (`..`), symbolic link dereferencing, ZIP-slip attacks, maximum file size (50MB), and compression ratio limits (100:1).
> 7. **Local Loopback API Protection**: Server binds to `127.0.0.1` by default. Mutating API routes check `Origin` and `Host` headers to prevent cross-origin drive-by attacks from rogue browser tabs. Sensitive data is redacted from terminal and console logs.

---

### 1. Overview & Core Concept

- **What It Does**: Automates compliance workflows for Indian Chartered Accountants across Income Tax (AIS, TIS, Form 26AS, ITR-V) and GST (GSTR-1, GSTR-3B) portals. Coordinates Playwright browser automation for document retrieval and ExcelJS for local, air-gapped ledger and audit summary preparation.
- **Target Audience**: Chartered Accountants, audit managers, and tax associates handling bulk compliance filings, year-end audits, and reconciliation across dozens of corporate and individual clients.
- **Key Value**: Eliminates repetitive manual portal logins and download steps, pauses safely for legitimate OTP/CAPTCHA verification without evading security controls, and produces clean audit workbooks locally without uploading sensitive client financial documents to external cloud services.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Mode Selection & Practice Health**: Header displays current mode badge (`DEMO (Simulated)` vs `REAL (Live Automation)`) with a toggle switch, backend connection status, active client selector, and persistent toast notification center.
2. **Client Management**: Searchable client directory with cards showing Name, Client ID, masked PAN/GSTIN, portal usernames, and credential reference IDs. Modal dialogs for client creation, editing, and archiving with client-specific input/output folder configuration.
3. **TOOL 1 — Extractor & Downloader (Playwright)**:
   - Portal selection: Income Tax or GST Portal.
   - Multi-select document checklist: AIS, TIS, Form 26AS, ITR-V, GSTR-1, GSTR-3B with "Select All" / "Clear Selection".
   - Financial Year and Assessment Year inputs.
   - Controls: Start, Pause, Resume, Cancel, and Retry.
   - Real-time Server-Sent Events (SSE) terminal streaming color-coded logs, document-level progress meters, and downloaded file counters.
   - OTP and CAPTCHA Human-in-the-Loop dialog: When portal demands verification, automation safely pauses in `WAITING_FOR_OTP` or `WAITING_FOR_CAPTCHA` until the operator submits the code through the UI.
4. **TOOL 2 — Offline Summary Preparer (ExcelJS)**:
   - Prominent air-gap declaration: *"LOCAL PROCESSING ONLY — source documents are processed on this computer and are not uploaded to a cloud service by this module."*
   - Directory scan button discovering `.xlsx` and `.csv` files safely (and reporting unsupported `.xls` without modification).
   - Dynamic Filtering policy options: "Prune completely empty rows", "Prune empty structural columns (optional)".
   - "Generate Audit Dashboards" action with live progress bar and manifest inspection showing total rows removed, preserved identifiers, and direct link to download the generated workbook.
5. **Client Processing Cards & Audit History**: High-density grid summarizing client status, last downloader execution, last summary preparation, document counts, and historical audit manifests.

#### Visual Identity & Theme
- **Color Discipline (60-30-10)**:
  - 60% Neutral Canvas: Clean slate-50 background (`#F8FAFC`).
  - 30% Structural Surfaces: Pure white card surfaces (`#FFFFFF`) with 1px hairline slate borders (`border-slate-200`) and deep navy typography (`#0F172A`).
  - 10% Intent Accents: Emerald (`#059669`) for verified completions, amber (`#D97706`) for OTP/CAPTCHA human verification, blue (`#2563EB`) for active processing, and crimson (`#DC2626`) for diagnostic failures.
- **Typography**: Clean neo-grotesque sans (`Plus Jakarta Sans` / `Manrope`) paired with tabular monospace figures (`JetBrains Mono` / `tabular-nums`) for timestamps, PANs, GSTINs, and file counts.
- **Anti-Slop Restraint**: Zero decorative pulsing dots, zero candy pill badges for static metadata, no fake sci-fi telemetry tickers, and clean natural title-case labels.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Strict Isolation between DEMO and REAL Execution**
  - *Chosen Approach*: `ExecutionMode` is an explicit system-level parameter. In `REAL` mode, the backend attempts to load/spawn `1_downloader.js` and `2_summary_preparer.js`. If they are not found or exit with errors, the job immediately enters `FAILED` state with clear diagnostic troubleshooting instructions. No silent downgrade to simulation. In `DEMO` mode, synthetic documents and simulated step sequences run with visible `[SIMULATION]` tags on every log message.
  - *Why*: Prevents misleading the user into believing real government portal filings or real client Excel summaries occurred when prerequisites were unmet.
- **Decision 2: Strict Excel Format Boundary (`.xlsx` and `.csv` Only)**
  - *Chosen Approach*: ExcelJS natively parses and generates OpenXML `.xlsx` and text `.csv`. Binary BIFF8 `.xls` files are detected via magic bytes or extension, left completely untouched, and explicitly cataloged in the manifest as `UNSUPPORTED_LEGACY_XLS`.
  - *Why*: ExcelJS corrupts or throws fatal unhandled exceptions when attempting to parse binary `.xls`. Flagging legacy files without modification preserves data integrity.
- **Decision 3: Authenticated Cryptographic Vault**
  - *Chosen Approach*: AES-256-GCM authenticated encryption. The master encryption key is derived via PBKDF2 (100,000 iterations, SHA-512) with a machine-specific or environment-provided salt. The vault file `vault.enc` stores only the ciphertext, IV, and auth tag. The master key is never stored in the vault file.
  - *Why*: Provides military-grade credential protection on local desktop environments without requiring unstable native C++ binary addons.
- **Decision 4: State Machine Recovery & Server-Side In-Flight Pruning**
  - *Chosen Approach*: On Express server boot, all jobs persisted in `jobs.json` with status `RUNNING`, `QUEUED`, `WAITING_FOR_OTP`, or `WAITING_FOR_CAPTCHA` are transitioned to `INTERRUPTED`. A client mutex table ensures no two active jobs can target the same client concurrently.
  - *Why*: Guarantees that server crashes or intentional restarts do not leave zombie jobs blocking client queues.

---

### 4. Technical Architecture & Data Strategy

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
│ - Output verification before COMPLETED    │ │ - Zero-Loss Row/Col Pruning Engine        │
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

#### Zero-Loss Dynamic Filtering Rules
A row is considered completely blank and eligible for pruning IF AND ONLY IF:
1. Every cell in the row has `cell.value === null || cell.value === undefined || cell.value === ''`.
2. Explicit exceptions:
   - Numeric `0` or `0.00` is **NEVER** blank.
   - Boolean `false` is **NEVER** blank.
   - Formulas (`cell.formula` or `cell.value.formula`) are **NEVER** blank.
   - Error values (`#N/A`, `#VALUE!`, `#REF!`) are **NEVER** blank.
   - Dates (`Date` objects or ISO strings) are **NEVER** blank.
   - Rich text or hyperlinks are **NEVER** blank.
   - Cells matching PAN (`[A-Z]{5}[0-9]{4}[A-Z]{1}`) or GSTIN (`[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}`) are **NEVER** blank.
3. Empty columns are **ONLY** pruned if the user explicitly enabled the "Prune empty columns" toggle in the summary configuration.
4. The original input file is never mutated; output is saved to a timestamped file: `<original_name>_processed_<timestamp>.xlsx`.
5. A `manifest.json` accompanies each run with counts of total rows, preserved rows, blank rows removed, and cell-type breakdown.

#### Automated Test Suite Plan
1. `tests/zero_loss.test.js`: Verifies numeric zero, boolean false, formulas, dates, and GSTIN strings are preserved, while 100% empty rows are pruned.
2. `tests/excel_compatibility.test.js`: Confirms `.xlsx` and `.csv` process correctly, and legacy `.xls` is flagged as unsupported without corruption.
3. `tests/filesystem_sandbox.test.js`: Tests path traversal rejection (`../../etc/passwd`), ZIP-slip containment, and file size limits.
4. `tests/job_lifecycle.test.js`: Tests state transitions (`QUEUED` -> `RUNNING` -> `WAITING_FOR_OTP` -> `COMPLETED`), client mutex locking, and server restart recovery (`INTERRUPTED`).
5. `tests/security_vault.test.js`: Tests AES-256-GCM encryption, decryption, invalid auth tag rejection, and masked credential references.
6. `tests/demo_real_isolation.test.js`: Verifies that `REAL` mode fails visibly with diagnostic errors when scripts are missing, and never falls back to simulation.
