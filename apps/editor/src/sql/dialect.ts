/**
 * Guesses the SQL dialect of a DDL text for the import dialog (design phase3 §6.3); the user can
 * change it. Comments and string literals are ignored, then the first rule that matches wins:
 *
 * 0. a first-line comment naming "Snowflake DDL" (relvista's own export) → Snowflake
 * 1. `AUTO_INCREMENT` or backtick identifiers → MySQL
 * 2. `VARIANT`, `AUTOINCREMENT`, `TIMESTAMP_NTZ` / `_LTZ` / `_TZ`, `CREATE OR REPLACE TABLE` →
 *    Snowflake (checked before SQL Server and Oracle: Snowflake also has `IDENTITY` and `NUMBER(`)
 * 3. `NUMBER(`, `VARCHAR2`, `NVARCHAR2`, `CLOB`, `NO AUTHENTICATION` / `QUOTA UNLIMITED` (the
 *    `CREATE USER` of a schema), a bare `GENERATED AS IDENTITY` or `ON NULL AS IDENTITY`
 *    (PostgreSQL requires ALWAYS or BY DEFAULT, without ON NULL) → Oracle
 * 4. `GENERATED ALWAYS|BY DEFAULT AS IDENTITY` (the standard clause PostgreSQL 10+ and the
 *    @dbml/core exporters write) → PostgreSQL
 * 5. `IDENTITY(` (SQL Server's form), `[bracketed]` identifiers, `NVARCHAR(`, a `GO` line → SQL
 *    Server
 * 6. otherwise PostgreSQL
 */
import type { ImportFormat } from './sql.worker.js';

/** The text without `--` / `#` / `/* … *\/` comments and with string literals emptied. */
export function stripSqlNoise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
    .replace(/--[^\n]*/g, ' ')
    .replace(/^\s*#[^\n]*/gm, ' ');
}

export function guessDialect(sql: string): ImportFormat {
  // relvista's own Snowflake export says so in its first line; it may have no other marker.
  if (/^\s*--[^\n]*\bSnowflake DDL\b/i.test(sql)) return 'snowflake';
  const s = stripSqlNoise(sql);
  if (/\bAUTO_INCREMENT\b/i.test(s) || /`[^`\n]+`/.test(s)) return 'mysql';
  if (
    /\bVARIANT\b/i.test(s) ||
    /\bAUTOINCREMENT\b/i.test(s) ||
    /\bTIMESTAMP_(NTZ|LTZ|TZ)\b/i.test(s) ||
    /\bCREATE\s+OR\s+REPLACE\s+(TRANSIENT\s+)?TABLE\b/i.test(s)
  )
    return 'snowflake';
  if (
    /\bNUMBER\s*\(/i.test(s) ||
    /\bN?VARCHAR2\b/i.test(s) ||
    /\bN?CLOB\b/i.test(s) ||
    /\bNO\s+AUTHENTICATION\b/i.test(s) ||
    /\bQUOTA\s+UNLIMITED\b/i.test(s) ||
    // Bare `GENERATED AS IDENTITY` is Oracle; PostgreSQL requires ALWAYS or BY DEFAULT.
    /\bGENERATED\s+AS\s+IDENTITY\b/i.test(s) ||
    /\bON\s+NULL\s+AS\s+IDENTITY\b/i.test(s)
  )
    return 'oracle';
  if (/\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(s)) return 'postgres';
  if (
    /\bIDENTITY\s*\(/i.test(s) ||
    /\[[A-Za-z_][\w ]*\]/.test(s) ||
    /\bNVARCHAR\s*\(/i.test(s) ||
    /^\s*GO\s*$/im.test(s)
  )
    return 'mssql';
  return 'postgres';
}

/** True for file names the editor opens as SQL (the import dialog). */
export function isSqlName(name: string): boolean {
  return /\.(sql|ddl)$/i.test(name);
}
