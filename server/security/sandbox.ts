import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';

export class FilesystemSandbox {
  /**
   * Resolves a target path within an allowed directory root, preventing directory traversal.
   * Throws an error if the resolved path escapes allowedRoot.
   */
  public static resolveSecurePath(allowedRoot: string, untrustedPath: string): string {
    const rootResolved = path.resolve(allowedRoot);
    // Disallow null bytes
    if (untrustedPath.indexOf('\0') !== -1) {
      throw new Error('Path traversal detected: null byte in path');
    }

    const resolved = path.resolve(allowedRoot, untrustedPath);

    // Check if resolved path is within allowedRoot
    const relative = path.relative(rootResolved, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Security Violation: Path [${untrustedPath}] escapes authorized sandbox boundary`);
    }

    return resolved;
  }

  /**
   * Safely extracts a ZIP archive into a destination directory with zip-slip and decompression bomb protection.
   */
  public static async extractZipSafely(
    zipFilePath: string,
    destDir: string,
    maxEntries = 500,
    maxTotalBytes = 50 * 1024 * 1024 // 50MB limit
  ): Promise<{ extractedCount: number; extractedFiles: string[] }> {
    const secureDestDir = path.resolve(destDir);
    if (!fs.existsSync(secureDestDir)) {
      fs.mkdirSync(secureDestDir, { recursive: true });
    }

    const zip = new AdmZip(zipFilePath);
    const zipEntries = zip.getEntries();

    if (zipEntries.length > maxEntries) {
      throw new Error(`ZIP archive exceeds maximum entry limit of ${maxEntries} files`);
    }

    let totalDecompressedSize = 0;
    const extractedFiles: string[] = [];

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      totalDecompressedSize += entry.header.size;
      if (totalDecompressedSize > maxTotalBytes) {
        throw new Error(`ZIP archive exceeds maximum decompressed size limit of ${maxTotalBytes / (1024 * 1024)}MB`);
      }

      // Zip-slip prevention:
      const rawName = entry.entryName;
      if (rawName.includes('..') || rawName.startsWith('/') || rawName.startsWith('\\')) {
        throw new Error(`Malicious ZIP entry detected (Zip-Slip attempt): ${entry.entryName}`);
      }

      const entryDestPath = path.resolve(secureDestDir, entry.entryName);
      const relative = path.relative(secureDestDir, entryDestPath);

      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Malicious ZIP entry detected (Zip-Slip attempt): ${entry.entryName}`);
      }

      // Ensure directory exists
      const entryDir = path.dirname(entryDestPath);
      if (!fs.existsSync(entryDir)) {
        fs.mkdirSync(entryDir, { recursive: true });
      }

      fs.writeFileSync(entryDestPath, entry.getData());
      extractedFiles.push(entryDestPath);
    }

    return { extractedCount: extractedFiles.length, extractedFiles };
  }

  /**
   * Redacts sensitive tax identifiers, passwords, and OTPs from log lines.
   */
  public static redactSensitive(text: string): string {
    return text
      // Redact OTPs (6-digit patterns in log context)
      .replace(/(otp[:\s=]+)(\d{4,8})/gi, '$1[REDACTED_OTP]')
      // Redact passwords
      .replace(/(password[:\s=]+)([^\s,;]+)/gi, '$1[REDACTED_SECRET]')
      // Mask full PAN to show only first 2 and last 2 characters in sensitive log output
      .replace(/\b([A-Z]{2})[A-Z]{3}[0-9]{4}([A-Z]{1})\b/g, '$1***$2');
  }
}
