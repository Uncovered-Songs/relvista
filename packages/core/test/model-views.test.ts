import { describe, expect, it } from 'vitest';
import { compileDbml, selectView, type DiagramModel } from '../src/model/index.js';

const SRC = `Table users {
  id int [pk]
}
Table posts {
  id int [pk]
  user_id int [ref: > users.id]
}
Table tags {
  id int [pk]
  post_id int [ref: > posts.id]
}
Table audit.log {
  id int [pk]
  user_id int [ref: > users.id]
}
Table audit.trail {
  id int
}
TableGroup content [color: #123456] {
  posts
  tags
}
TableGroup people {
  users
}
Note intro {
  'Start here'
}
Note todo {
  'later'
}
Records tags(id, post_id) {
  1, 1
}
Records users(id) {
  1
  2
}

DiagramView everything {
  *
}
DiagramView just_users {
  Tables {
    users
  }
}
DiagramView content_view {
  TableGroups {
    content
  }
  Notes {
    intro
  }
}
DiagramView audit_and_users {
  Tables {
    users
  }
  Schemas {
    audit
  }
  Notes {
    *
  }
}
DiagramView all_groups {
  TableGroups {
    *
  }
}
DiagramView all_tables_no_notes {
  Tables {
    *
  }
}
DiagramView empty_view {
}
`;

function model(): DiagramModel {
  const { model, diagnostics } = compileDbml(SRC);
  expect(diagnostics).toEqual([]);
  return model as DiagramModel;
}

describe('DiagramView resolution', () => {
  const m = model();
  const view = (name: string) => m.views.find((v) => v.name === name);

  it('resolves * to everything', () => {
    expect(view('everything')).toMatchObject({
      tableIds: ['public.users', 'public.posts', 'public.tags', 'audit.log', 'audit.trail'],
      noteIds: ['note:intro', 'note:todo'],
      groupIds: ['group:content', 'group:people'],
      allTables: true,
      allNotes: true,
    });
  });

  it('lists only the named tables, and no notes when Notes is not mentioned', () => {
    expect(view('just_users')).toMatchObject({
      tableIds: ['public.users'],
      noteIds: [],
      groupIds: ['group:people'],
      allTables: false,
      allNotes: false,
    });
  });

  it('expands TableGroups to their tables', () => {
    expect(view('content_view')).toMatchObject({
      tableIds: ['public.posts', 'public.tags'],
      noteIds: ['note:intro'],
      groupIds: ['group:content'],
    });
  });

  it('unions Tables and Schemas', () => {
    expect(view('audit_and_users')).toMatchObject({
      tableIds: ['public.users', 'audit.log', 'audit.trail'],
      noteIds: ['note:intro', 'note:todo'],
      allNotes: true,
    });
  });

  it('expands TableGroups { * } to every group', () => {
    expect(view('all_groups')).toMatchObject({
      tableIds: ['public.users', 'public.posts', 'public.tags'],
      groupIds: ['group:content', 'group:people'],
      allTables: false,
    });
  });

  it('Tables { * } shows all tables but no notes', () => {
    expect(view('all_tables_no_notes')).toMatchObject({
      allTables: true,
      allNotes: false,
      noteIds: [],
    });
    expect(view('all_tables_no_notes')?.tableIds).toHaveLength(5);
  });

  it('an empty view shows nothing', () => {
    expect(view('empty_view')).toMatchObject({ tableIds: [], noteIds: [], groupIds: [] });
  });

  it('keeps a source span', () => {
    expect(view('just_users')?.span.start.line).toBe(
      SRC.split('\n').findIndex((l) => l.includes('just_users')) + 1,
    );
  });
});

describe('selectView', () => {
  const m = model();

  it('filters tables, refs, groups, notes and records', () => {
    const v = selectView(m, 'audit_and_users');
    expect(v?.tables.map((t) => t.id)).toEqual(['public.users', 'audit.log', 'audit.trail']);
    expect(v?.refs.map((r) => r.id)).toEqual(['ref:public.users(id)<audit.log(user_id)']);
    expect(v?.groups.map((g) => [g.id, g.tableIds])).toEqual([['group:people', ['public.users']]]);
    expect(v?.stickyNotes.map((n) => n.id)).toEqual(['note:intro', 'note:todo']);
    expect(v?.records).toEqual({ 'public.users': 2 });
    expect(v?.enums).toBe(m.enums);
  });

  it('trims group members to visible tables', () => {
    const just = selectView(m, 'just_users');
    expect(just?.groups).toEqual([
      expect.objectContaining({ id: 'group:people', tableIds: ['public.users'] }),
    ]);
    expect(just?.refs).toEqual([]);
    // isFk stays as computed on the full model.
    expect(
      selectView(m, 'content_view')?.tables[0]?.columns.find((c) => c.name === 'user_id')?.isFk,
    ).toBe(true);
  });

  it('returns null for an unknown view and leaves the model untouched', () => {
    expect(selectView(m, 'nope')).toBeNull();
    expect(m.tables).toHaveLength(5);
    expect(m.groups.find((g) => g.id === 'group:content')?.tableIds).toEqual([
      'public.posts',
      'public.tags',
    ]);
  });
});
