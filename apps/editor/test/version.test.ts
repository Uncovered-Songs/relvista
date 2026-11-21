import { version } from '@relvista/core/package.json';
import { describe, expect, it } from 'vitest';
import { editorVersionLabel } from '../src/version.js';

describe('editorVersionLabel', () => {
  it('shows the released version', () => {
    expect(editorVersionLabel('1.0.0')).toBe('editor 1.0.0');
    expect(editorVersionLabel('1.2.3-next.1')).toBe('editor 1.2.3-next.1');
  });

  it('never shows the 0.0.0 placeholder', () => {
    expect(editorVersionLabel('0.0.0')).toBe('editor');
    expect(editorVersionLabel()).not.toContain('0.0.0');
  });

  it('defaults to the @relvista/core version', () => {
    expect(editorVersionLabel()).toBe(version === '0.0.0' ? 'editor' : `editor ${version}`);
  });
});
