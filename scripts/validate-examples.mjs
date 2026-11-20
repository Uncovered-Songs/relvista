#!/usr/bin/env node
// Compiles every example in examples/ with the official @dbml/parse and exits
// non-zero when any file reports a compile error.
//
//   node scripts/validate-examples.mjs            # all examples
//   node scripts/validate-examples.mjs 02 12      # only examples whose name contains "02" or "12"
//   node scripts/validate-examples.mjs --warnings # also fail on warnings
//
// Layout of examples/:
//   - every top-level *.dbml file is one single-file project (compiled as /main.dbml);
//   - every top-level directory is one multi-file project; all *.dbml files in it are
//     loaded into a MemoryProjectLayout at their relative paths and main.dbml is the entry.
//
// @dbml/parse is resolved from packages/core, which pins it exactly; this script has no
// dependencies of its own.

import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplesDir = join(repoRoot, 'examples');

const requireFromCore = createRequire(join(repoRoot, 'packages', 'core', 'package.json'));
const parsePkgEntry = requireFromCore.resolve('@dbml/parse');
// "exports" hides package.json, so read it from disk next to dist/.
const parsePkgDir = join(dirname(parsePkgEntry), '..');
const parsePkgJson = JSON.parse(readFileSync(join(parsePkgDir, 'package.json'), 'utf8'));
// Load the ESM build explicitly so we exercise the same code the browser bundles get.
const esmEntry = join(parsePkgDir, parsePkgJson.exports['.'].import);
const { Compiler, MemoryProjectLayout, Filepath } = await import(pathToFileURL(esmEntry).href);

const args = process.argv.slice(2);
const failOnWarnings = args.includes('--warnings');
const filters = args.filter((a) => !a.startsWith('--'));

const ENTRY = '/main.dbml';

/** Recursively lists *.dbml files under dir, as paths relative to dir with "/" separators. */
function listDbml(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.dbml')) out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

/** Discovers example projects: { name, files: Record<absPath, source>, origin: Record<absPath, diskPath> }. */
function discoverProjects() {
  const projects = [];
  for (const name of readdirSync(examplesDir).sort()) {
    const p = join(examplesDir, name);
    const st = statSync(p);
    if (st.isFile() && name.endsWith('.dbml')) {
      projects.push({
        name,
        files: { [ENTRY]: readFileSync(p, 'utf8') },
        origin: { [ENTRY]: relative(repoRoot, p) },
      });
    } else if (st.isDirectory()) {
      const rels = listDbml(p);
      if (rels.length === 0) continue;
      const files = {};
      const origin = {};
      for (const rel of rels) {
        files[`/${rel}`] = readFileSync(join(p, rel), 'utf8');
        origin[`/${rel}`] = relative(repoRoot, join(p, rel));
      }
      if (!(ENTRY in files)) {
        projects.push({ name: `${name}/`, files, origin, setupError: 'missing main.dbml entry' });
        continue;
      }
      projects.push({ name: `${name}/`, files, origin });
    }
  }
  return projects;
}

function lineCol(source, offset) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      col = 1;
    } else col++;
  }
  return `${line}:${col}`;
}

function diagFilepath(d, fallback) {
  try {
    return d.filepath?.absolute ?? fallback;
  } catch {
    return fallback;
  }
}

/** Compiles one project; returns { errors, warnings, summary }. */
function compileProject(project) {
  const layout = new MemoryProjectLayout(project.files);
  const compiler = new Compiler(layout);
  const errors = new Map();
  const warnings = new Map();
  const collect = (report, fallbackPath) => {
    if (!report) return;
    for (const [list, target] of [
      [report.getErrors(), errors],
      [report.getWarnings(), warnings],
    ]) {
      for (const d of list) {
        const file = diagFilepath(d, fallbackPath);
        const key = `${file}|${d.start}|${d.end}|${d.code}|${d.diagnostic}`;
        if (!target.has(key))
          target.set(key, {
            file,
            start: d.start,
            code: d.code,
            message: d.diagnostic ?? d.message,
          });
      }
    }
  };

  for (const abs of Object.keys(project.files)) {
    const fp = Filepath.from(abs);
    collect(compiler.parseFile(fp), abs);
    collect(compiler.validateFile(fp), abs);
    collect(compiler.bindFile(fp), abs);
  }
  const entry = Filepath.from(ENTRY);
  const interpreted = compiler.interpretFile(entry);
  collect(interpreted, ENTRY);
  // Interpret every non-entry file too, so a broken leaf module is reported even if
  // the entry only imports part of it.
  for (const abs of Object.keys(project.files)) {
    if (abs !== ENTRY) collect(compiler.interpretFile(Filepath.from(abs)), abs);
  }

  const db = interpreted.getValue();
  const summary = db
    ? [
        ['tables', db.tables?.length],
        ['refs', db.refs?.length],
        ['enums', db.enums?.length],
        ['groups', db.tableGroups?.length],
        ['notes', db.notes?.length],
        ['partials', db.tablePartials?.length],
        ['records', db.records?.length],
        ['views', db.diagramViews?.length],
      ]
        .filter(([, n]) => n)
        .map(([k, n]) => `${n} ${k}`)
        .join(', ')
    : '';
  return {
    errors: [...errors.values()],
    warnings: [...warnings.values()],
    summary,
    hasDb: Boolean(db),
  };
}

const projects = discoverProjects().filter(
  (p) => filters.length === 0 || filters.some((f) => p.name.includes(f)),
);
if (projects.length === 0) {
  console.error(`No examples found in ${relative(repoRoot, examplesDir) || examplesDir}`);
  process.exit(1);
}

console.log(`@dbml/parse ${parsePkgJson.version} — validating ${projects.length} example(s)\n`);

let failed = 0;
for (const project of projects) {
  if (project.setupError) {
    failed++;
    console.log(`FAIL ${project.name}: ${project.setupError}`);
    continue;
  }
  let result;
  try {
    result = compileProject(project);
  } catch (err) {
    failed++;
    console.log(`FAIL ${project.name}: compiler threw: ${err?.stack ?? err}`);
    continue;
  }
  const { errors, warnings, summary, hasDb } = result;
  const bad = errors.length > 0 || !hasDb || (failOnWarnings && warnings.length > 0);
  if (bad) failed++;
  const status = bad ? 'FAIL' : 'ok  ';
  const counts = [
    errors.length ? `${errors.length} error(s)` : '',
    warnings.length ? `${warnings.length} warning(s)` : '',
    !hasDb ? 'no database produced' : '',
  ]
    .filter(Boolean)
    .join(', ');
  console.log(
    `${status} ${project.name}${summary ? `  (${summary})` : ''}${counts ? `  — ${counts}` : ''}`,
  );
  for (const [label, list] of [
    ['error', errors],
    ['warning', warnings],
  ]) {
    for (const d of list) {
      const src = project.files[d.file] ?? '';
      const where = `${project.origin[d.file] ?? d.file}:${lineCol(src, d.start)}`;
      console.log(`     ${label} ${d.code} at ${where}: ${d.message}`);
    }
  }
}

console.log(`\n${projects.length - failed}/${projects.length} example(s) compiled cleanly`);
process.exit(failed ? 1 : 0);
