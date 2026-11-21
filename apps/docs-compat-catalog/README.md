# docs-compat-catalog

Content for the `relvista-docs-compat` test fixture (`apps/docs-compat`), kept **outside** that
site's directory on purpose. The fixture registers it as a second
`@docusaurus/plugin-content-docs` instance (`id: 'catalog'`, `path: '../docs-compat-catalog/docs'`,
routes under `/catalog`), the layout of a data catalog whose sheets live in another repository
folder. The pages are CommonMark `.md` files (the fixture sets `markdown.format: 'detect'`) with
front matter holding nested objects that have their own `id` keys, and one of them has a `dbml`
code fence. The fixture's e2e checks that these pages render with relvista registered and that the
fence becomes a diagram.

This folder has no `package.json`: it is content, not a workspace package. Keep it a real folder,
not a symlink: webpack resolves symlinks, and Docusaurus then compiles a symlinked content folder's
pages with its fallback MDX loader, which drops their metadata (with or without relvista).
