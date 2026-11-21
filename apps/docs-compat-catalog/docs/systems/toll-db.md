---
id: toll-db
title: Toll database (PostgreSQL) - transactions of every toll plaza
entity:
  type: database
  id: toll-db
also:
  - type: schema
    id: toll-db.public
  - type: pipeline
    id: toll-ingest
owners:
  - data-platform
links:
  - title: Runbook
    url: https://example.com/runbook
---

# Toll database

A CommonMark page, not MDX: braces like {plaza_id} and a bare less-than as in id < 1000 would not parse as MDX.

```dbml title="toll.dbml"
Table plazas {
  id integer [pk]
  name varchar
}

Table transactions {
  id bigint [pk]
  plaza_id integer [ref: > plazas.id]
  amount decimal
}
```

## Contacts

- Data platform on-call
