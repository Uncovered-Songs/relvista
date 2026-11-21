import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import type * as Renderer from '@relvista/renderer';
import type { DbmlViewerProps, DiagramTarget } from '@relvista/renderer';
import { anchorOfHash } from './anchor.js';

export interface LiveViewerProps extends Omit<
  DbmlViewerProps,
  'anchor' | 'target' | 'onTargetChange' | 'onLinkCopy'
> {
  /** The diagram's anchor on the page (`id` of its wrapper). */
  anchor: string;
  /** `location.hash` while it names this diagram, else null. */
  hash: string | null;
  /** Bumped on every navigation to this diagram, so the same link applies again. */
  hashTick: number;
}

/** What the live viewer needs from `@relvista/renderer` (passed in: the module loads lazily). */
export type LiveViewerRenderer = Pick<
  typeof Renderer,
  'DbmlViewer' | 'formatAnchoredTarget' | 'parseAnchoredTarget'
>;

/** Writes `hash` without a history entry. */
function replaceHash(hash: string): void {
  try {
    window.history.replaceState(window.history.state, '', hash);
  } catch {
    // Sandboxed frames may refuse; the diagram works without it.
  }
}

/**
 * The interactive viewer of a docs diagram with its deep link (docs/design/phase3-v1.md §5.2), for
 * the renderer module `r`: the target the location hash gives (`#<anchor>&table=…&view=…`) is
 * applied; the viewer's state goes back into the hash with `history.replaceState` (never a new
 * history entry) while the hash names this diagram, or after the toolbar's link button copied a
 * link to it. Other diagrams of the page never touch the URL.
 */
export function liveViewer(r: LiveViewerRenderer): ComponentType<LiveViewerProps> {
  const { DbmlViewer, formatAnchoredTarget, parseAnchoredTarget } = r;
  return function LiveViewer({ anchor, hash, hashTick, ...viewer }: LiveViewerProps): ReactNode {
    const [target, setTarget] = useState<DiagramTarget | null>(null);
    useEffect(() => {
      const next = hash ? (parseAnchoredTarget(hash)?.target ?? null) : null;
      // Through null first: the viewer applies a target when its keys change, so following the
      // same link again (after moving around) applies it again.
      setTarget(null);
      if (!next) return;
      const t = setTimeout(() => setTarget(next), 0);
      return () => clearTimeout(t);
    }, [hash, hashTick]);

    const onTargetChange = useCallback(
      (t: DiagramTarget) => {
        if (typeof window === 'undefined') return;
        if (anchorOfHash(window.location.hash) !== anchor) return;
        const next = `#${formatAnchoredTarget(anchor, t)}`;
        if (window.location.hash !== next) replaceHash(next);
      },
      [anchor],
    );
    const onLinkCopy = useCallback((href: string) => {
      const at = href.indexOf('#');
      // The link button makes this diagram the one the URL names.
      if (at >= 0 && typeof window !== 'undefined') replaceHash(href.slice(at));
    }, []);

    return (
      <DbmlViewer
        {...viewer}
        anchor={anchor}
        target={target}
        onTargetChange={onTargetChange}
        onLinkCopy={onLinkCopy}
      />
    );
  };
}
