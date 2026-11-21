/**
 * Stand-in for jsPDF's optional dependencies (`html2canvas`, `canvg`, `dompurify`), aliased in
 * vite.config.ts so they are never bundled: relvista never calls jsPDF's `.html()` or
 * `addSvgAsImage()`, the only code paths that import them (design phase3 §2).
 */
export default {};
