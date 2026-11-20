import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import type { Props } from '@theme/DbmlDiagram';
import type { Layout } from '@relvista/core';
import { DEFAULT_THEME_CONFIG, type DbmlThemeConfig } from '../../defaults.js';
import { sourceText } from '../../source.js';
// URL of ELK's Web Worker script (the theme's webpack rule emits it as an asset): auto-layout runs
// in a worker instead of blocking the page.
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?relvista-worker';
import styles from './styles.module.css';

// The viewer (React Flow, the DBML parser, ELK) loads only on pages that show a diagram.
const DbmlViewer = lazy(() =>
  import(/* webpackChunkName: "relvista-viewer" */ '@relvista/renderer').then((m) => ({
    default: m.DbmlViewer,
  })),
);

/**
 * The site's colour mode, read from `<html data-theme>`. Reading the DOM instead of
 * `useColorMode()` keeps the theme independent of which `@docusaurus/theme-common` copy a package
 * manager resolves for it (a second copy has its own, empty React context).
 */
function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
const readTheme = (): 'light' | 'dark' =>
  document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light';
const serverTheme = (): 'light' | 'dark' => 'light';

function useSiteColorMode(): 'light' | 'dark' {
  return useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
}

type Loaded<T> =
  { state: 'idle' } | { state: 'ok'; value: T } | { state: 'error'; message: string };

function useFetched<T>(url: string | null, parse: (text: string) => T): Loaded<T> {
  const [result, setResult] = useState<{ url: string; loaded: Loaded<T> } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText || 'error'}`);
        return parse(await res.text());
      })
      .then(
        (value) => alive && setResult({ url, loaded: { state: 'ok', value } }),
        (err: unknown) =>
          alive &&
          setResult({
            url,
            loaded: { state: 'error', message: `Could not load ${url}: ${messageOf(err)}` },
          }),
      );
    return () => {
      alive = false;
    };
    // `parse` is a module-level function; only the URL matters.
  }, [url]);
  if (!url) return { state: 'idle' };
  return result?.url === url ? result.loaded : { state: 'idle' };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const asText = (text: string) => text;
const asJson = (text: string): unknown => JSON.parse(text);

/**
 * The minimap would cover too much of a short diagram; otherwise the viewer decides ('auto':
 * larger diagrams in wide viewers only).
 */
function minimapFor(height: number | string): 'auto' | false {
  return typeof height !== 'number' || height >= 360 ? 'auto' : false;
}

function cssHeight(height: number | string): string {
  return typeof height === 'number' ? `${height}px` : height;
}

function Placeholder({
  height,
  title,
  children,
}: {
  height: number | string;
  title?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div
      className={`relvista-placeholder ${styles.placeholder}`}
      style={{ height: cssHeight(height) }}
      aria-busy={children ? undefined : true}
    >
      {title ? <div className={styles.placeholderTitle}>{title}</div> : null}
      {children ?? (
        <div className={styles.placeholderBody}>
          <span className={styles.spinner} aria-hidden="true" />
          Loading diagram…
        </div>
      )}
    </div>
  );
}

function Problem({ height, children }: { height: number | string; children: ReactNode }) {
  return (
    <Placeholder height={height}>
      <div className={`relvista-error ${styles.problem}`} role="alert">
        {children}
      </div>
    </Placeholder>
  );
}

interface BoundaryProps {
  height: number | string;
  children: ReactNode;
}

/** Keeps a broken diagram from taking the whole page down. */
class DiagramErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('relvista: diagram crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Problem height={this.props.height}>
        <strong>This diagram could not be rendered.</strong>
        <code>{error.message}</code>
        <button
          type="button"
          className="button button--sm button--secondary"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </Problem>
    );
  }
}

function ClientDiagram({
  value,
  src,
  layout,
  height,
  config,
  ...rest
}: Omit<Props, 'height' | 'source'> & {
  height: number | string;
  config: DbmlThemeConfig;
  srcUrl: string | null;
  layoutUrl: string | null;
}): ReactNode {
  const { srcUrl, layoutUrl, view, title, detailLevel, toolbar, editorUrl } = rest;
  const colorMode = useSiteColorMode();
  const fetchedSource = useFetched(value === undefined ? srcUrl : null, asText);
  const fetchedLayout = useFetched(typeof layout === 'string' ? layoutUrl : null, asJson);
  const [layoutParsed, setLayoutParsed] = useState<{
    input: unknown;
    result: { ok: true; layout: Layout } | { ok: false; message: string };
  } | null>(null);

  const layoutInput: unknown =
    typeof layout === 'string'
      ? fetchedLayout.state === 'ok'
        ? fetchedLayout.value
        : undefined
      : layout;

  // Validate the layout file with core's schema (core is loaded with the viewer chunk).
  useEffect(() => {
    if (layoutInput === undefined || layoutInput === null) return;
    let alive = true;
    void import(/* webpackChunkName: "relvista-viewer" */ '@relvista/core').then(
      ({ parseLayout }) => {
        if (!alive) return;
        const r = parseLayout(layoutInput);
        setLayoutParsed({
          input: layoutInput,
          result: r.ok
            ? { ok: true, layout: r.layout }
            : {
                ok: false,
                message: r.errors.map((e) => `${e.path || '/'} ${e.message}`).join('; '),
              },
        });
      },
    );
    return () => {
      alive = false;
    };
  }, [layoutInput]);

  if (value === undefined && !src) {
    return <Problem height={height}>DbmlDiagram needs a `value` or a `src`.</Problem>;
  }
  if (fetchedSource.state === 'error')
    return <Problem height={height}>{fetchedSource.message}</Problem>;
  if (fetchedLayout.state === 'error')
    return <Problem height={height}>{fetchedLayout.message}</Problem>;

  const source = value ?? (fetchedSource.state === 'ok' ? fetchedSource.value : undefined);
  const layoutReady =
    layoutInput === undefined || layoutInput === null
      ? typeof layout !== 'string'
      : layoutParsed?.input === layoutInput;
  if (source === undefined || !layoutReady) return <Placeholder height={height} title={title} />;
  if (layoutParsed && layoutParsed.input === layoutInput && !layoutParsed.result.ok) {
    return <Problem height={height}>Invalid layout file: {layoutParsed.result.message}</Problem>;
  }
  const parsedLayout =
    layoutParsed && layoutParsed.input === layoutInput && layoutParsed.result.ok
      ? layoutParsed.result.layout
      : null;

  const editor = editorUrl ?? config.editorUrl;
  const items = (toolbar ?? config.toolbar).filter((i) => i !== 'open-in-editor' || !!editor);
  return (
    <Suspense fallback={<Placeholder height={height} title={title} />}>
      <DbmlViewer
        source={source}
        layout={parsedLayout}
        view={view}
        height={height}
        title={title}
        colorMode={colorMode}
        detailLevel={detailLevel ?? parsedLayout?.settings?.detailLevel ?? config.detailLevel}
        toolbar={items}
        editorUrl={editor}
        minimap={minimapFor(height)}
        workerUrl={elkWorkerUrl}
        className="relvista-viewer"
      />
    </Suspense>
  );
}

/**
 * An interactive DBML diagram. Server rendering emits a placeholder of the final size; the viewer
 * loads in the browser.
 */
export default function DbmlDiagram(props: Props): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const themeConfig = siteConfig.themeConfig as { dbml?: Partial<DbmlThemeConfig> };
  const config: DbmlThemeConfig = { ...DEFAULT_THEME_CONFIG.dbml, ...themeConfig.dbml };
  const height = props.height ?? config.height;
  const srcUrl = useBaseUrl(props.src ?? '');
  const layoutUrl = useBaseUrl(typeof props.layout === 'string' ? props.layout : '');

  const diagram = (
    <BrowserOnly fallback={<Placeholder height={height} title={props.title} />}>
      {() => (
        <DiagramErrorBoundary height={height}>
          <ClientDiagram
            {...props}
            height={height}
            config={config}
            srcUrl={props.src ? srcUrl : null}
            layoutUrl={typeof props.layout === 'string' ? layoutUrl : null}
          />
        </DiagramErrorBoundary>
      )}
    </BrowserOnly>
  );

  const code = props.value !== undefined ? sourceText(props.value) : null;
  const wrapperClass = ['relvista-diagram', styles.wrapper, props.className]
    .filter(Boolean)
    .join(' ');
  const view = props.view ?? '*';
  if (!props.source || code === null)
    return (
      <div className={wrapperClass} data-rv-view={view}>
        {diagram}
      </div>
    );

  return (
    <div className={wrapperClass} data-rv-view={view}>
      <Tabs className={styles.tabs}>
        <TabItem value="diagram" label="Diagram" default>
          {diagram}
        </TabItem>
        <TabItem value="source" label="Source">
          <CodeBlock language="dbml" title={props.title}>
            {code}
          </CodeBlock>
        </TabItem>
      </Tabs>
    </div>
  );
}
