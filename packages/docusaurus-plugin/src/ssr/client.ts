// `relvista-ssr-files` in the browser bundle (src/index.ts aliases it): nothing is rendered at build
// time there, and the client fetches files as before.
import type { SsrBackend } from './types.js';

export default function relvistaSsr(): SsrBackend | null {
  return null;
}
