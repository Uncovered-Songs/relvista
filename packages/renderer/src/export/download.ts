/** Saves a Blob as a file through a temporary `<a download>` (browser only). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves an SVG string as a `.svg` file (browser only). */
export function downloadSvg(svg: string, filename: string): void {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

/** A file-name-safe slug, e.g. for `diagram title` → `diagram-title`. */
export function fileSlug(name: string | null | undefined, fallback = 'diagram'): string {
  const s = (name ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return s || fallback;
}
