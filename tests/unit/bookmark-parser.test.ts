import { describe, it, expect } from 'vitest';
import { parseNetscapeBookmarks } from '../../apps/web/lib/bookmarks/parser.js';

const CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com/hello" ADD_DATE="1514764800">Hello</A>
    <DT><H3 ADD_DATE="1514764800">Recipes</H3>
    <DL><p>
        <DT><A HREF="https://example.com/pasta" ADD_DATE="1600000000">Pasta recipe</A>
        <DT><H3>Italian</H3>
        <DL><p>
            <DT><A HREF="https://example.com/carbonara">Carbonara</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="chrome://extensions/">Extensions</A>
</DL><p>`;

describe('parseNetscapeBookmarks', () => {
  it('empty string → []', () => {
    expect(parseNetscapeBookmarks('')).toEqual([]);
  });

  it('non-html garbage → []', () => {
    expect(parseNetscapeBookmarks('not html at all')).toEqual([]);
  });

  it('parses flat + nested folder structure', () => {
    const out = parseNetscapeBookmarks(CHROME_EXPORT);
    expect(out).toHaveLength(4);

    const byUrl = new Map(out.map((b) => [b.url, b]));

    expect(byUrl.get('https://example.com/hello')?.folder_path).toEqual([]);
    expect(byUrl.get('https://example.com/hello')?.title).toBe('Hello');

    expect(byUrl.get('https://example.com/pasta')?.folder_path).toEqual(['Recipes']);
    expect(byUrl.get('https://example.com/carbonara')?.folder_path).toEqual([
      'Recipes',
      'Italian',
    ]);

    // chrome:// entries are left to the filter stage — parser keeps them
    expect(byUrl.has('chrome://extensions/')).toBe(true);
  });

  it('converts ADD_DATE (unix seconds) to ISO', () => {
    const out = parseNetscapeBookmarks(CHROME_EXPORT);
    const hello = out.find((b) => b.url === 'https://example.com/hello');
    expect(hello?.add_date).toBe('2018-01-01T00:00:00.000Z');
  });

  it('falls back title to URL when missing', () => {
    const html = `<DL><p><DT><A HREF="https://example.com/x"></A></DL>`;
    const out = parseNetscapeBookmarks(html);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('https://example.com/x');
  });

  it('skips DT without HREF', () => {
    const html = `<DL><p><DT><A>no href</A><DT><A HREF="https://ok.com/">OK</A></DL>`;
    const out = parseNetscapeBookmarks(html);
    expect(out.map((b) => b.url)).toEqual(['https://ok.com/']);
  });

  it('handles deep nesting (Recipes/Italian/Pasta)', () => {
    const html = `
      <DL><p>
        <DT><H3>A</H3>
        <DL><p>
          <DT><H3>B</H3>
          <DL><p>
            <DT><H3>C</H3>
            <DL><p>
              <DT><A HREF="https://deep.com/">deep</A>
            </DL><p>
          </DL><p>
        </DL><p>
      </DL><p>`;
    const out = parseNetscapeBookmarks(html);
    expect(out).toHaveLength(1);
    expect(out[0]?.folder_path).toEqual(['A', 'B', 'C']);
  });

  it('is resilient to malformed (unclosed) HTML', () => {
    const html = `<DL><DT><A HREF="https://a.com/">a<DT><A HREF="https://b.com/">b</DL>`;
    const out = parseNetscapeBookmarks(html);
    const urls = out.map((b) => b.url).sort();
    expect(urls).toContain('https://a.com/');
    expect(urls).toContain('https://b.com/');
  });
});
