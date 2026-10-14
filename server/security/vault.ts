import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface VaultEntry {
  clientId: string;
  portal: string;
  username: string;
  iv: string; // hex
  authTag: string; // hex
  ciphertext: string; // hex
  ref: string; // masked reference hash (e.g. c8f1)
  updatedAt: string;
}

interface VaultData {
  version: number;
  salt: string; // hex
  entries: Record<string, VaultEntry>; // key is `${clientId}:${portal}`
}

export class CredentialVault {
  private vaultPath: string;
  private derivedKey: Buffer | null = null;
  private data: VaultData = { version: 1, salt: '', entries: {} };

  constructor(dataDir: string, masterPassphrase?: string, saltStr?: string) {
    this.vaultPath = path.join(dataDir, 'vault.enc');
    this.init(dataDir, masterPassphrase, saltStr);
  }

  private init(dataDir: string, masterPassphrase?: string, saltStr?: string) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const passphrase = masterPassphrase || process.env.VAULT_MASTER_KEY || 'default_local_ca_vault_secret_2026';
    let salt: Buffer;

    if (fs.existsSync(this.vaultPath)) {
      try {
        const raw = fs.readFileSync(this.vaultPath, 'utf-8');
        this.data = JSON.parse(raw);
        salt = Buffer.from(this.data.salt, 'hex');
      } catch (err) {
        console.error('[Vault] Error loading existing vault, initializing fresh container:', err);
        salt = crypto.randomBytes(16);
        this.data = { version: 1, salt: salt.toString('hex'), entries: {} };
      }
    } else {
      salt = saltStr ? Buffer.from(saltStr, 'utf-8') : crypto.randomBytes(16);
      this.data = { version: 1, salt: salt.toString('hex'), entries: {} };
      this.saveVault();
    }

    // PBKDF2 derivation with 100,000 iterations and SHA-512
    this.derivedKey = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha512');
  }

  private saveVault() {
    fs.writeFileSync(this.vaultPath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  private getEntryKey(clientId: string, portal: string): string {
    return `${clientId}:${portal.toLowerCase()}`;
  }

  public storeCredential(clientId: string, portal: string, username: string, password: string): string {
    if (!this.derivedKey) throw new Error('Vault not initialized with derived key');

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.derivedKey, iv);
    
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    const refHash = crypto.createHash('sha256').update(`${clientId}:${portal}:${username}`).digest('hex').substring(0, 8);
    const entryKey = this.getEntryKey(clientId, portal);

    this.data.entries[entryKey] = {
      clientId,
      portal: portal.toLowerCase(),
      username,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext: encrypted,
      ref: `ref_${refHash}`,
      updatedAt: new Date().toISOString()
    };

    this.saveVault();
    return `ref_${refHash}`;
  }

  public getCredential(clientId: string, portal: string): { username: string; password: string } | null {
    if (!this.derivedKey) throw new Error('Vault not initialized');
    const entryKey = this.getEntryKey(clientId, portal);
    const entry = this.data.entries[entryKey];
    if (!entry) return null;

    try {
      const iv = Buffer.from(entry.iv, 'hex');
      const authTag = Buffer.from(entry.authTag, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.derivedKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(entry.ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return {
        username: entry.username,
        password: decrypted
      };
    } catch (err) {
      console.error(`[Vault] Authenticated decryption failed for ${clientId}:${portal}`, err);
      return null;
    }
  }

  public hasCredential(clientId: string, portal: string): boolean {
    const entryKey = this.getEntryKey(clientId, portal);
    return Boolean(this.data.entries[entryKey]);
  }

  public getMaskedRef(clientId: string, portal: string): { exists: boolean; username?: string; ref?: string } {
    const entryKey = this.getEntryKey(clientId, portal);
    const entry = this.data.entries[entryKey];
    if (!entry) return { exists: false };
    return {
      exists: true,
      username: entry.username,
      ref: `•••••••• (${entry.ref})`
    };
  }

  public removeCredential(clientId: string, portal: string): boolean {
    const entryKey = this.getEntryKey(clientId, portal);
    if (this.data.entries[entryKey]) {
      delete this.data.entries[entryKey];
      this.saveVault();
      return true;
    }
    return false;
  }
}
