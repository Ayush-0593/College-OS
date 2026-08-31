// §11 — Document Vault shared helpers.
//
// Kept thin: constants, validation, path helpers, and a small formatter.
// Routes import from here so the rules (allowed types, max size, file layout)
// live in one place.

import path from "node:path";
import { promises as fs } from "node:fs";

export const CATEGORIES = [
  "Notes",
  "PYQ",
  "Syllabus",
  "Marksheet",
  "Other",
] as const;
export type DocumentCategory = (typeof CATEGORIES)[number];

export const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const EXT_BY_MIME: Record<AllowedMime, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const MIME_BY_EXT: Record<string, AllowedMime> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Throw a clean error if the file doesn't meet our upload rules. */
export function assertUpload(file: { type: string; size: number; name?: string }): asserts file is {
  type: AllowedMime;
  size: number;
  name: string;
} {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    throw new UploadError(
      `Unsupported file type. Allowed: PDF, PNG, JPG, WEBP.`
    );
  }
  if (file.size <= 0) {
    throw new UploadError("File is empty.");
  }
  if (file.size > MAX_SIZE) {
    throw new UploadError(
      `File too large (${humanSize(file.size)}). Max ${humanSize(MAX_SIZE)}.`
    );
  }
}

export class UploadError extends Error {}

/** Resolve the on-disk extension for a file we just validated. */
export function pickExt(mime: AllowedMime): string {
  return EXT_BY_MIME[mime];
}

/** Resolve the MIME type from a stored extension (used by the stream route). */
export function mimeFromExt(ext: string): AllowedMime | null {
  return MIME_BY_EXT[ext.toLowerCase()] || null;
}

/** Absolute path to a user's document directory, creating it if needed. */
export async function userDir(userId: string): Promise<string> {
  const dir = path.join(process.cwd(), "uploads", userId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Absolute path to a stored file given the row's `storagePath`. */
export function absolutePath(storagePath: string): string {
  return path.join(process.cwd(), "uploads", storagePath);
}

/**
 * Best-effort delete. Swallows ENOENT so a missing file doesn't 500 the
 * delete endpoint. Any other error is rethrown.
 */
export async function deleteFileSafe(storagePath: string): Promise<void> {
  try {
    await fs.unlink(absolutePath(storagePath));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}

/** "2.4 MB" / "612 KB" / "9 B" — for the cards and viewer drawer. */
export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const fixed = n < 10 && i > 0 ? n.toFixed(1) : Math.round(n).toString();
  return `${fixed} ${units[i]}`;
}

/** "true" if the file is a PDF (so the viewer uses <iframe>). */
export function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}
