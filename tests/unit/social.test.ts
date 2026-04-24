import { describe, it, expect } from 'vitest';
import { parseOgMetadata, resolveImageUrl } from '../../worker/src/lib/social.js';

describe('parseOgMetadata', () => {
  it('extracts og:title / og:description / og:image / og:site_name', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="A Great Thing" />
        <meta property="og:description" content="This is a description." />
        <meta property="og:image" content="https://example.com/img.jpg" />
        <meta property="og:site_name" content="Example" />
      </head></html>`;
    const meta = parseOgMetadata(html);
    expect(meta.title).toBe('A Great Thing');
    expect(meta.description).toBe('This is a description.');
    expect(meta.image).toBe('https://example.com/img.jpg');
    expect(meta.siteName).toBe('Example');
  });

  it('falls back to twitter:* tags', () => {
    const html = `
      <meta name="twitter:title" content="Tweet-style title" />
      <meta name="twitter:description" content="desc" />
      <meta name="twitter:image" content="https://example.com/t.png" />`;
    const meta = parseOgMetadata(html);
    expect(meta.title).toBe('Tweet-style title');
    expect(meta.description).toBe('desc');
    expect(meta.image).toBe('https://example.com/t.png');
  });

  it('falls back to <title> and <meta name="description">', () => {
    const html = `
      <html><head>
        <title>Page Title</title>
        <meta name="description" content="meta desc" />
      </head></html>`;
    const meta = parseOgMetadata(html);
    expect(meta.title).toBe('Page Title');
    expect(meta.description).toBe('meta desc');
  });

  it('handles html entities in extracted strings', () => {
    const html = `<meta property="og:title" content="Cats &amp; Dogs" />`;
    const meta = parseOgMetadata(html);
    expect(meta.title).toBe('Cats & Dogs');
  });

  it('returns undefined fields when tags missing', () => {
    const meta = parseOgMetadata('<html></html>');
    expect(meta.title).toBeUndefined();
    expect(meta.description).toBeUndefined();
    expect(meta.image).toBeUndefined();
  });

  it('supports attribute order with content before property', () => {
    const html = `<meta content="order-swap" property="og:title" />`;
    const meta = parseOgMetadata(html);
    expect(meta.title).toBe('order-swap');
  });
});

describe('resolveImageUrl', () => {
  it('leaves absolute URLs alone', () => {
    expect(resolveImageUrl('https://cdn.example.com/a.jpg', 'https://site.com/page')).toBe(
      'https://cdn.example.com/a.jpg',
    );
  });
  it('resolves relative to page URL', () => {
    expect(resolveImageUrl('/images/a.jpg', 'https://site.com/page/')).toBe(
      'https://site.com/images/a.jpg',
    );
  });
  it('returns input on parse failure', () => {
    expect(resolveImageUrl('not a url', 'also not a url')).toBe('not a url');
  });
});
