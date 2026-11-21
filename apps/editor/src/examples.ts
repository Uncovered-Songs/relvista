/** Bundled examples (repo `examples/`), loaded lazily as raw text. */

const loaders = import.meta.glob<string>('../../../examples/**/*.dbml', {
  query: '?raw',
  import: 'default',
});

export interface ExampleInfo {
  /** `02-ecommerce` or `12-modules`. */
  id: string;
  title: string;
  description: string;
  group: string;
  folder: boolean;
  /** Keys inside the example (`main.dbml`, `common/users.dbml`); single files: `<id>.dbml`. */
  files: string[];
}

const META: Record<string, { title: string; description: string; group: string }> = {
  '01-minimal': { title: 'Minimal', description: 'Two tables and one ref', group: 'Basics' },
  '02-ecommerce': {
    title: 'E-commerce',
    description: 'Every ref form and cardinality',
    group: 'Basics',
  },
  '03-enums-and-notes': {
    title: 'Enums and notes',
    description: 'Enums, notes, Markdown',
    group: 'Basics',
  },
  '04-indexes-and-checks': {
    title: 'Indexes and checks',
    description: 'Settings, defaults, indexes, checks',
    group: 'Basics',
  },
  '05-table-groups': {
    title: 'Table groups',
    description: 'Coloured TableGroups',
    group: 'Organising',
  },
  '06-header-colors': {
    title: 'Header colours',
    description: 'headercolor and ref colours',
    group: 'Organising',
  },
  '07-sticky-notes': {
    title: 'Sticky notes',
    description: 'Notes on the canvas',
    group: 'Organising',
  },
  '08-diagram-views': {
    title: 'Diagram views',
    description: 'Five DiagramView blocks',
    group: 'Organising',
  },
  '09-table-partials': {
    title: 'Table partials',
    description: 'TablePartial and ~injection',
    group: 'Advanced',
  },
  '10-records': { title: 'Records', description: 'Sample data rows', group: 'Advanced' },
  '11-multi-schema': {
    title: 'Multiple schemas',
    description: 'schema.table and aliases',
    group: 'Advanced',
  },
  '12-modules': {
    title: 'Modules (folder)',
    description: 'use / reuse across files',
    group: 'Advanced',
  },
  '13-project-settings-and-metadata': {
    title: 'Project settings and metadata',
    description: 'Front matter, Metadata blocks',
    group: 'Advanced',
  },
  '14-large': { title: 'Large SaaS schema', description: '61 tables, 94 refs', group: 'Large' },
};

const PREFIX = '../../../examples/';

function build(): ExampleInfo[] {
  const byId = new Map<string, ExampleInfo>();
  for (const path of Object.keys(loaders).sort()) {
    const rel = path.slice(PREFIX.length);
    const slash = rel.indexOf('/');
    const folder = slash >= 0;
    const id = folder ? rel.slice(0, slash) : rel.replace(/\.dbml$/, '');
    const key = folder ? rel.slice(slash + 1) : rel;
    const meta = META[id] ?? {
      title: id.replace(/^\d+-/, '').replace(/-/g, ' '),
      description: '',
      group: 'More',
    };
    const info = byId.get(id) ?? { id, ...meta, folder, files: [] };
    info.files.push(key);
    byId.set(id, info);
  }
  return [...byId.values()];
}

export const EXAMPLES: ExampleInfo[] = build();

export const EXAMPLE_GROUPS: string[] = [...new Set(EXAMPLES.map((e) => e.group))];

/** Loads an example's files: `{ files: key → text, entry }`. */
export async function loadExample(
  id: string,
): Promise<{ files: Record<string, string>; entry: string; info: ExampleInfo }> {
  const info = EXAMPLES.find((e) => e.id === id);
  if (!info) throw new Error(`Unknown example ${id}`);
  const files: Record<string, string> = {};
  await Promise.all(
    info.files.map(async (key) => {
      const path = info.folder ? `${PREFIX}${id}/${key}` : `${PREFIX}${key}`;
      files[key] = await loaders[path]!();
    }),
  );
  const entry = info.folder
    ? info.files.includes('main.dbml')
      ? 'main.dbml'
      : info.files[0]!
    : info.files[0]!;
  return { files, entry, info };
}
