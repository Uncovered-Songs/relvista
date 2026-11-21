// @vitest-environment jsdom
// The MDX `code` wrapper: ```dbml fences become diagrams, everything else goes on unchanged.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MDXCode from '../src/theme/MDXComponents/Code/index.js';

afterEach(cleanup);

describe('MDXComponents/Code', () => {
  it('turns a dbml fence into a diagram with its meta', async () => {
    render(
      <MDXCode className="language-dbml" metastring='title="Shop" height=300 source'>
        {'Table a {\n  id int\n}\n'}
      </MDXCode>,
    );
    const d = await screen.findByTestId('diagram');
    expect(d.dataset['value']).toBe('Table a {\n  id int\n}');
    expect(d.dataset['title']).toBe('Shop');
    expect(d.dataset['height']).toBe('300');
    expect(d.dataset['source']).toBe('true');
  });

  it('passes every other fence, a static dbml fence and inline code to the original', () => {
    render(
      <>
        <MDXCode className="language-js">{'const a = 1;\n'}</MDXCode>
        <MDXCode className="language-dbml" metastring="static">
          {'Table a {\n}\n'}
        </MDXCode>
        <MDXCode>inline</MDXCode>
      </>,
    );
    expect(screen.queryByTestId('diagram')).toBeNull();
    expect(screen.getAllByTestId('mdx-code')).toHaveLength(3);
  });
});
