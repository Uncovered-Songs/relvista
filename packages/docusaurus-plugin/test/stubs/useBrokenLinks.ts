// `@docusaurus/useBrokenLinks` in tests: records what components collect.
export const collected: { anchors: string[]; links: string[] } = { anchors: [], links: [] };

export default function useBrokenLinks() {
  return {
    collectAnchor(anchor: string | undefined) {
      if (anchor) collected.anchors.push(anchor);
    },
    collectLink(link: string | undefined) {
      if (link) collected.links.push(link);
    },
  };
}
