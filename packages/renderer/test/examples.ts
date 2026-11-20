// Loads every project in examples/ (top-level .dbml files and multi-file folders).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CompileInput } from '@relvista/core';

// Path-based (jsdom replaces the global URL, which node:url rejects).
const examplesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples');

function collectDbml(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.dbml')) {
        files[relative(dir, full).split(sep).join('/')] = readFileSync(full, 'utf8');
      }
    }
  };
  walk(dir);
  return files;
}

export function loadExamples(): [string, CompileInput][] {
  const examples: [string, CompileInput][] = [];
  for (const name of readdirSync(examplesDir).sort()) {
    const full = join(examplesDir, name);
    if (statSync(full).isDirectory()) {
      examples.push([`${name}/`, { files: collectDbml(full), entry: 'main.dbml' }]);
    } else if (name.endsWith('.dbml')) {
      examples.push([name, readFileSync(full, 'utf8')]);
    }
  }
  return examples;
}
