/// <reference lib="webworker" />
/**
 * SQL import/export in a module worker. `@dbml/core` (2.6 MB gzip, all SQL parsers) is imported
 * the first time a message arrives, so users who never touch SQL never download it.
 */
export type ExportFormat = 'postgres' | 'mysql' | 'mssql' | 'oracle';
export type ImportFormat = 'postgres' | 'mysql' | 'mssql' | 'snowflake' | 'oracle';

export type SqlRequest =
  | { id: number; op: 'export'; dbml: string; format: ExportFormat }
  | { id: number; op: 'import'; sql: string; format: ImportFormat };

export type SqlResponse =
  { id: number; ok: true; text: string } | { id: number; ok: false; error: string };

let core: Promise<{
  exporter: { export(dbml: string, format: ExportFormat): string };
  importer: { import(sql: string, format: ImportFormat): string };
}> | null = null;

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  // @dbml/core throws CompilerDiagnostics: { diags: [{ message, location }] }
  const diags = (
    e as {
      diags?: Array<{
        message?: string;
        location?: { start?: { line?: number; column?: number } };
      }>;
    }
  )?.diags;
  if (Array.isArray(diags) && diags.length) {
    return diags
      .slice(0, 5)
      .map((d) => {
        const at = d.location?.start;
        return at ? `Line ${at.line}, column ${at.column}: ${d.message}` : String(d.message);
      })
      .join('\n');
  }
  return String(e);
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (ev: MessageEvent<SqlRequest>) => {
  const msg = ev.data;
  try {
    core ??= import('@dbml/core');
    const { exporter, importer } = await core;
    const text =
      msg.op === 'export'
        ? exporter.export(msg.dbml, msg.format)
        : importer.import(msg.sql, msg.format);
    scope.postMessage({ id: msg.id, ok: true, text } satisfies SqlResponse);
  } catch (e) {
    scope.postMessage({ id: msg.id, ok: false, error: errorText(e) } satisfies SqlResponse);
  }
};
