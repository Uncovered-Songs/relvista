/** Fallbacks for browsers without File System Access: `<input type=file>` and downloads. */
import { downloadBlob } from '@relvista/renderer';

/** Opens a file input and resolves with the chosen files ([] on cancel). */
export function pickWithInput(options: {
  multiple?: boolean;
  accept?: string;
  directory?: boolean;
}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.multiple) input.multiple = true;
    if (options.accept) input.accept = options.accept;
    if (options.directory) input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    let done = false;
    const finish = (files: File[]) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish([...(input.files ?? [])]));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

/** Downloads exact bytes (octet-stream so the browser does not re-encode text). */
export function downloadBytes(
  bytes: Uint8Array | string,
  filename: string,
  type = 'application/octet-stream',
): void {
  const part = typeof bytes === 'string' ? bytes : (bytes as Uint8Array<ArrayBuffer>);
  downloadBlob(new Blob([part], { type }), filename);
}
