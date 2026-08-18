import rehypeShiki from '@shikijs/rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { withBase } from '@moldea.ai/website-ui/site';

const BASE_PATH = import.meta.env.BASE_URL;

export interface IRenderedMarkdownHeading {
  depth: 2 | 3;
  id: string;
  text: string;
}

export interface IRenderedMarkdown {
  headings: IRenderedMarkdownHeading[];
  html: string;
}

const stripTags = (value: string): string => value.replaceAll(/<[^>]+>/g, '');

const prefixInternalLinks = (html: string): string => {
  return html.replaceAll(/href="\/(?!\/)/g, `href="${withBase('/', BASE_PATH)}`);
};

const markExternalLinks = (html: string): string => {
  return html.replaceAll(
    /<a href="((?:https?:)?\/\/[^" ]+)"/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer"',
  );
};

const wrapTables = (html: string): string => {
  return html.replaceAll(
    /<table>([\s\S]*?)<\/table>/g,
    '<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable table"><table>$1</table></div>',
  );
};

const getHeadings = (html: string): IRenderedMarkdownHeading[] => {
  return [...html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)].map(
    (match): IRenderedMarkdownHeading => ({
      depth: Number(match[1]) as 2 | 3,
      id: match[2],
      text: stripTags(match[3]),
    }),
  );
};

/**
 * Renders authored package Markdown through a raw-HTML-disabled and sanitized pipeline.
 * @param markdown Package-owned Markdown source.
 * @param hasDocumentTitle Whether to remove the first level-one heading owned by page chrome.
 * @returns Sanitized highlighted HTML and stable level-two/three headings.
 */
export const renderMarkdown = async (
  markdown: string,
  hasDocumentTitle = true,
): Promise<IRenderedMarkdown> => {
  const source = hasDocumentTitle ? markdown.replace(/^# .+\n+/u, '') : markdown;
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeSanitize, { ...defaultSchema, clobberPrefix: '' })
    .use(rehypeShiki, {
      defaultColor: false,
      themes: {
        dark: 'github-dark-default',
        light: 'github-light-default',
      },
    })
    .use(rehypeStringify)
    .process(source);
  const html = wrapTables(markExternalLinks(prefixInternalLinks(String(file))));

  return { headings: getHeadings(html), html };
};
