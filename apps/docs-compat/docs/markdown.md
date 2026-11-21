---
title: Markdown
---

# A plain Markdown page

The same fences in a `.md` file (CommonMark: the site sets `markdown.format: 'detect'`).

```dbml
Table authors {
  id integer [pk]
}

Table books {
  id integer [pk]
  author_id integer [ref: > authors.id]
}
```

```js
const answer = 42;
```
