// Ambient types for sites using @relvista/docusaurus-theme. Add to a site's tsconfig:
//   "types": ["@relvista/docusaurus-theme/client"]   or   /// <reference types="@relvista/docusaurus-theme/client" />

/** `.dbml` files are imported as their source text (webpack `asset/source`). */
declare module '*.dbml' {
  const source: string;
  export default source;
}

/** A file imported with `?relvista-worker` is emitted as an asset; the import is its URL. */
declare module '*?relvista-worker' {
  const url: string;
  export default url;
}

declare module '@theme/DbmlDiagram' {
  import type { ReactNode } from 'react';
  import type { CompileInputFiles, DetailLevel, Layout } from '@relvista/core';
  import type { ToolbarItem } from '@relvista/renderer';

  export interface Props {
    /** DBML source, or `{ files, entry }` for a multi-file project. */
    readonly value?: string | CompileInputFiles;
    /** URL of a `.dbml` file served by the site (resolved with `useBaseUrl`). Used when `value` is absent. */
    readonly src?: string;
    /** Parsed layout file object, or the URL of a `*.layout.json` file served by the site. */
    readonly layout?: Layout | string | null;
    /** DiagramView name. Default: every table. */
    readonly view?: string;
    /** Viewer height (number = px). Default `themeConfig.dbml.height` (480). */
    readonly height?: number | string;
    readonly title?: string;
    /** Show "Diagram" / "Source" tabs. */
    readonly source?: boolean;
    readonly detailLevel?: DetailLevel;
    readonly toolbar?: ToolbarItem[];
    readonly editorUrl?: string;
    readonly className?: string;
  }

  export default function DbmlDiagram(props: Props): ReactNode;
}
