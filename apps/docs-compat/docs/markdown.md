---
title: Markdown
---

# A plain Markdown page

The same fences in a `.md` file (CommonMark-flavoured MDX).

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
