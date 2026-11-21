/** Promise API over the SQL worker (created on first use). */
import type { ExportFormat, ImportFormat, SqlRequest, SqlResponse } from './sql.worker.js';

export type { ExportFormat, ImportFormat };

/** Every SQL export: the `@dbml/core` exporters (worker) and relvista's own Snowflake generator. */
export type SqlExportFormat = ExportFormat | 'snowflake';

export const EXPORT_FORMATS: Array<{ id: SqlExportFormat; label: string }> = [
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mssql', label: 'SQL Server' },
  { id: 'oracle', label: 'Oracle' },
  { id: 'snowflake', label: 'Snowflake' },
];

export const IMPORT_FORMATS: Array<{ id: ImportFormat; label: string }> = [
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mssql', label: 'SQL Server' },
  { id: 'snowflake', label: 'Snowflake' },
  { id: 'oracle', label: 'Oracle' },
];

let worker: Worker | null = null;
let nextId = 1;
let loaded = false;
const pending = new Map<number, { resolve(t: string): void; reject(e: Error): void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./sql.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<SqlResponse>) => {
    loaded = true;
    const p = pending.get(ev.data.id);
    if (!p) return;
    pending.delete(ev.data.id);
    if (ev.data.ok) p.resolve(ev.data.text);
    else p.reject(new Error(ev.data.error));
  };
  worker.onerror = (ev) => {
    for (const p of pending.values())
      p.reject(new Error(ev.message || 'SQL support failed to load'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Whether the 2.6 MB SQL bundle has already been loaded in this page. */
export function sqlLoaded(): boolean {
  return loaded;
}

type Unsent<T> = T extends unknown ? Omit<T, 'id'> : never;

function send(msg: Unsent<SqlRequest>): Promise<string> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...msg, id });
  });
}

export function exportSql(dbml: string, format: ExportFormat): Promise<string> {
  return send({ op: 'export', dbml, format });
}

export function importSql(sql: string, format: ImportFormat): Promise<string> {
  return send({ op: 'import', sql, format });
}
