// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import { renderMarkdown } from './markdown.ts';

// syntax highlighting is verified against the production artifact
vi.mock('@shikijs/rehype', () => ({ default: () => undefined }));

describe('renderMarkdown', () => {
  test('opens external links safely without changing internal navigation', async () => {
    const rendered = await renderMarkdown(
      '# Links\n\n[Source](https://example.com/source)\n\n[Packages](/packages/)',
    );

    expect(rendered.html).toContain(
      '<a href="https://example.com/source" target="_blank" rel="noopener noreferrer">Source</a>',
    );
    expect(rendered.html).toContain('<a href="/packages/">Packages</a>');
  });

  test('wraps wide tables in a keyboard-focusable labelled scroll region', async () => {
    const rendered = await renderMarkdown('| Name | Value |\n| --- | --- |\n| Core | Stable |');

    expect(rendered.html).toContain(
      '<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable table"><table>',
    );
  });
});
