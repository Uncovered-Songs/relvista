#!/usr/bin/env node
// Generates the parts of the docs site that come from elsewhere in the repo, so they never drift:
//   static/schemas/layout-1.json   copy of schemas/layout.schema.json (decision 0002)
//   static/dbml/01-minimal.dbml    copy of examples/01-minimal.dbml (loaded by URL in Usage)
//   docs/gallery/*.mdx             one page per project in examples/, plus the gallery index
// Everything written here is git-ignored. Run with --check to fail instead of writing when stale.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDbml, selectView } from '@relvista/core';

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(siteDir, '..', '..');
const examplesDir = join(repoRoot, 'examples');
const galleryDir = join(siteDir, 'docs', 'gallery');
const check = process.argv.includes('--check');

let stale = 0;
const written = new Set();
function write(file, content) {
  written.add(file);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === content) return;
  if (check) {
    console.error(`out of date: ${relative(siteDir, file)}`);
    stale++;
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

// --- layout schema ------------------------------------------------------------------------------
write(
  join(siteDir, 'static', 'schemas', 'layout-1.json'),
  readFileSync(join(repoRoot, 'schemas', 'layout.schema.json'), 'utf8'),
);

// --- a .dbml file served from static/ (Usage: `src` prop) -------------------------------------
write(
  join(siteDir, 'static', 'dbml', '01-minimal.dbml'),
  readFileSync(join(examplesDir, '01-minimal.dbml'), 'utf8'),
);

// --- gallery ------------------------------------------------------------------------------------
const TITLES = {
  ecommerce: 'E-commerce',
  'multi-schema': 'Multiple schemas',
  modules: 'Modules (multi-file)',
  'project-settings-and-metadata': 'Project settings and metadata',
  large: 'Large schema',
};

function titleOf(slug) {
  const words = slug.replace(/^\d+-/, '');
  if (TITLES[words]) return TITLES[words];
  const text = words.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The `Covers` column of examples/README.md, by file or folder name. */
function readCovers() {
  const covers = {};
  const readme = readFileSync(join(examplesDir, 'README.md'), 'utf8');
  for (const line of readme.split('\n')) {
    const m = /^\|\s*\[`([^`]+)`\]\([^)]*\)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (m) covers[m[1].replace(/\/$/, '')] = m[2];
  }
  return covers;
}

/** Leading `//` comment of a DBML file (after optional front matter), as one paragraph. */
function leadComment(source) {
  const lines = source.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
  const text = [];
  const bullets = [];
  for (const line of lines) {
    const m = /^\s*\/\/\s?(.*)$/.exec(line);
    if (!m) break;
    const content = m[1].trim();
    if (content.startsWith('- ')) bullets.push(content.slice(2).trim());
    else if (bullets.length) bullets[bullets.length - 1] += ` ${content}`;
    else text.push(content);
  }
  let out = text.join(' ').replace(/\s+/g, ' ').trim();
  if (bullets.length) out = `${out.replace(/[.:]$/, '')}: ${bullets.join('; ')}.`;
  return out;
}

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

/** Viewer height for a gallery page: tall enough that most examples open near 1:1. */
function heightFor(tables) {
  if (tables <= 2) return 380;
  if (tables <= 6) return 480;
  if (tables <= 12) return 620;
  return 720;
}

/** Escapes text for use inside MDX prose (outside code spans). */
function mdxText(text) {
  return text.replace(/([{}<>])/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Escapes MDX prose but leaves `code spans` alone. */
function mdxProse(text) {
  return text
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : mdxText(part)))
    .join('');
}

const covers = readCovers();
const projects = [];
for (const name of readdirSync(examplesDir).sort()) {
  const full = join(examplesDir, name);
  if (statSync(full).isFile() && name.endsWith('.dbml')) {
    const source = readFileSync(full, 'utf8');
    projects.push({ slug: name.replace(/\.dbml$/, ''), key: name, files: [name], input: source });
  } else if (statSync(full).isDirectory()) {
    const rels = listDbml(full);
    if (!rels.includes('main.dbml')) continue;
    const files = Object.fromEntries(rels.map((r) => [r, readFileSync(join(full, r), 'utf8')]));
    projects.push({
      slug: name,
      key: name,
      files: rels.map((r) => `${name}/${r}`),
      input: { files, entry: 'main.dbml' },
    });
  }
}

const cards = [];
projects.forEach((p, index) => {
  const { model, diagnostics } = compileDbml(p.input);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (!model || errors.length) {
    console.error(`examples/${p.key}: does not compile (${errors[0]?.message ?? 'no model'})`);
    process.exit(1);
  }
  const title = titleOf(p.slug);
  const multi = typeof p.input !== 'string';
  const entrySource = multi ? p.input.files[p.input.entry] : p.input;
  const lead = leadComment(entrySource);
  const tables = model.tables.length;
  const height = heightFor(tables);
  const views = model.views
    .map((v) => ({ name: v.name, tables: selectView(model, v.name)?.tables.length ?? 0 }))
    .filter((v) => v.tables > 0);
  const featured = views.find((v) => v.tables < tables) ?? null;

  const imports = p.files.map((f, i) => `import file${i} from '@site/../../examples/${f}';`);
  const value = multi
    ? `{{ entry: 'main.dbml', files: { ${p.files
        .map((f, i) => `'${f.slice(p.slug.length + 1)}': file${i}`)
        .join(', ')} } }}`
    : '{file0}';
  const counts = [
    `${tables} table${tables === 1 ? '' : 's'}`,
    model.refs.length ? `${model.refs.length} ref${model.refs.length === 1 ? '' : 's'}` : '',
    model.groups.length
      ? `${model.groups.length} group${model.groups.length === 1 ? '' : 's'}`
      : '',
    model.stickyNotes.length
      ? `${model.stickyNotes.length} sticky note${model.stickyNotes.length === 1 ? '' : 's'}`
      : '',
    model.views.length ? `${model.views.length} view${model.views.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean);

  const sourceBlocks = multi
    ? p.files
        .map(
          (f, i) =>
            `<CodeBlock language="dbml" title="examples/${f}" showLineNumbers>{file${i}}</CodeBlock>`,
        )
        .join('\n\n')
    : `<CodeBlock language="dbml" title="examples/${p.key}" showLineNumbers>{file0}</CodeBlock>`;

  const parts = [
    '---',
    `id: ${p.slug}`,
    `slug: ${p.slug}`,
    `title: ${JSON.stringify(title)}`,
    `sidebar_label: ${JSON.stringify(`${p.slug.slice(0, 2)} · ${title}`)}`,
    `sidebar_position: ${index + 1}`,
    // The page has one heading (Source); without the TOC column the diagram gets its width.
    'hide_table_of_contents: true',
    `description: ${JSON.stringify(lead || `The ${p.key} example rendered with relvista.`)}`,
    '---',
    '',
    `{/* GENERATED by scripts/sync-assets.mjs from examples/${p.key}. Do not edit. */}`,
    '',
    "import DbmlDiagram from '@theme/DbmlDiagram';",
    "import CodeBlock from '@theme/CodeBlock';",
    ...imports,
    '',
    lead ? mdxProse(lead) : '',
    '',
    covers[p.key] ? `**Covers:** ${mdxProse(covers[p.key])}` : '',
    '',
    `<p className="gallery-stats">${counts.join(' · ')}${
      multi
        ? ` · ${p.files.length} files, entry \`main.dbml\``.replace(/`([^`]+)`/g, '<code>$1</code>')
        : ''
    }</p>`,
    '',
    `<DbmlDiagram value=${value} title=${JSON.stringify(multi ? `${p.key}/main.dbml` : p.key)} height={${height}} />`,
    '',
  ];
  if (featured) {
    parts.push(
      `## View: \`${featured.name}\``,
      '',
      `A \`DiagramView\` shows a subset of the schema. Pass \`view="${featured.name}"\` (or pick it in the toolbar's view menu) to start there:`,
      '',
      `<DbmlDiagram value=${value} view=${JSON.stringify(featured.name)} title=${JSON.stringify(featured.name)} height={${heightFor(featured.tables)}} />`,
      '',
    );
  }
  parts.push(
    '## Source',
    '',
    '<details>',
    `<summary>${multi ? `${p.files.length} files in <code>examples/${p.key}/</code>` : `<code>examples/${p.key}</code>`}</summary>`,
    '',
    sourceBlocks,
    '',
    '</details>',
    '',
  );
  write(
    join(galleryDir, `${p.slug}.mdx`),
    parts.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n'),
  );
  cards.push({
    to: `/docs/gallery/${p.slug}`,
    number: p.slug.slice(0, 2),
    title,
    description: lead,
    stats: counts.join(' · '),
  });
});

write(
  join(galleryDir, '_category_.json'),
  `${JSON.stringify({ label: 'Gallery', position: 4, collapsed: false }, null, 2)}\n`,
);

write(
  join(galleryDir, 'index.mdx'),
  [
    '---',
    'title: Gallery',
    'sidebar_label: Overview',
    'sidebar_position: 0',
    'description: Every example schema in the relvista repository, rendered live.',
    'pagination_next: null',
    '---',
    '',
    '{/* GENERATED by scripts/sync-assets.mjs. Do not edit. */}',
    '',
    "import GalleryGrid from '@site/src/components/GalleryGrid';",
    '',
    "Every file in the repository's [`examples/`](https://github.com/Uncovered-Songs/relvista/tree/main/examples) folder, rendered by the theme exactly as your docs would render it. Each example focuses on one part of DBML; open one to explore the diagram and read its source.",
    '',
    `<GalleryGrid items={${JSON.stringify(cards, null, 2)}} />`,
    '',
  ].join('\n'),
);

// Remove pages of examples that no longer exist.
if (existsSync(galleryDir)) {
  for (const name of readdirSync(galleryDir)) {
    const file = join(galleryDir, name);
    if (!written.has(file)) {
      if (check) {
        console.error(`stale: ${relative(siteDir, file)}`);
        stale++;
      } else rmSync(file, { recursive: true });
    }
  }
}

if (stale) process.exit(1);
console.log(
  `${check ? 'checked' : 'synced'} layout-1.json and ${projects.length} gallery page(s) in ${relative(repoRoot, siteDir)}`,
);
