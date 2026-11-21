/** Size and count limits for opening files (design §4.4). */
export const LIMITS = {
  /** One file (DBML or layout JSON). */
  maxFileBytes: 5 * 1024 * 1024,
  /** Files read from one folder. */
  maxFolderFiles: 200,
  /** Total bytes read from one folder. */
  maxFolderBytes: 10 * 1024 * 1024,
  /** Folder depth below the chosen folder. */
  maxFolderDepth: 4,
  /** Recent handles kept (Chromium). */
  maxRecent: 8,
} as const;

export class LimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LimitError';
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
