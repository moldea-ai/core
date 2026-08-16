// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { renderMarkdown } from './markdown.ts';

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
});
