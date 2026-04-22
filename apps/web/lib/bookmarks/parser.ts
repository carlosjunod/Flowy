export interface ParsedBookmark {
  url: string;
  title: string;
  folder_path: string[];
  /** ISO string derived from Netscape `ADD_DATE` (unix seconds). */
  add_date?: string;
}

/**
 * Parse a Netscape-format bookmark HTML export (Chrome / Safari / Firefox / Edge).
 *
 * Implementation note: the format is consistent enough across browsers that a
 * small tokenizer beats pulling in a DOM lib. We scan sequentially and track a
 * folder stack: <H3> pushes, </DL> pops, <A> emits a bookmark with the current
 * stack as its folder_path. Malformed HTML with missing close tags still
 * produces useful output because unrecognized bytes are simply skipped.
 */
export function parseNetscapeBookmarks(html: string): ParsedBookmark[] {
  if (typeof html !== 'string' || html.length === 0) return [];

  const out: ParsedBookmark[] = [];
  const folderStack: string[] = [];
  let i = 0;

  // Pre-scan: map every <DL...> open to the offset of its matching </DL>, so
  // folder headers (H3 followed by a DL sibling) know their range. We count
  // nesting depth to handle nested folders correctly.
  const dlRanges = buildDlRanges(html);
  // Stack of DL end offsets so we know when to pop the folder stack.
  const dlCloseStack: number[] = [];
  // Pending folder name to be pushed when the *next* DL opens (H3 ... <DL>).
  let pendingFolder: string | null = null;

  while (i < html.length) {
    // Pop folders whose DL range has ended.
    while (dlCloseStack.length > 0 && i >= (dlCloseStack[dlCloseStack.length - 1] ?? 0)) {
      dlCloseStack.pop();
      folderStack.pop();
    }

    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    const gt = html.indexOf('>', lt + 1);
    if (gt < 0) break;
    const tagRaw = html.slice(lt + 1, gt);
    const tagName = (tagRaw.match(/^\/?[a-zA-Z0-9]+/) ?? [''])[0].toLowerCase();
    i = gt + 1;

    if (tagName === 'a') {
      const endIdx = html.toLowerCase().indexOf('</a>', i);
      const inner = endIdx >= 0 ? html.slice(i, endIdx) : html.slice(i, i + 200);
      const href = extractAttr(tagRaw, 'href');
      if (href) {
        const addRaw = extractAttr(tagRaw, 'add_date');
        const addSeconds = addRaw ? Number(addRaw) : NaN;
        const addIso =
          Number.isFinite(addSeconds) && addSeconds > 0
            ? new Date(addSeconds * 1000).toISOString()
            : undefined;
        const title = stripTagsAndDecode(inner).trim() || href;
        out.push({
          url: href,
          title,
          folder_path: [...folderStack],
          add_date: addIso,
        });
      }
      if (endIdx >= 0) i = endIdx + 4;
      continue;
    }

    if (tagName === 'h3') {
      const endIdx = html.toLowerCase().indexOf('</h3>', i);
      const inner = endIdx >= 0 ? html.slice(i, endIdx) : '';
      pendingFolder = stripTagsAndDecode(inner).trim();
      if (endIdx >= 0) i = endIdx + 5;
      continue;
    }

    if (tagName === 'dl') {
      if (pendingFolder !== null) {
        folderStack.push(pendingFolder);
        const close = dlRanges.get(lt) ?? html.length;
        dlCloseStack.push(close);
        pendingFolder = null;
      }
      continue;
    }
    // `</dl>`, `<dt>`, etc. are handled implicitly.
  }

  return out;
}

function buildDlRanges(html: string): Map<number, number> {
  const ranges = new Map<number, number>();
  const re = /<\/?dl\b[^>]*>/gi;
  const openStack: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const isClose = m[0].startsWith('</');
    if (isClose) {
      const open = openStack.pop();
      if (open !== undefined) ranges.set(open, m.index);
    } else {
      openStack.push(m.index);
    }
  }
  // Any still-open DL tags extend to the end of input — be forgiving of
  // malformed exports with a missing </DL>.
  while (openStack.length > 0) {
    const open = openStack.pop()!;
    ranges.set(open, html.length);
  }
  return ranges;
}

function extractAttr(tagInner: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"|${name}\\s*=\\s*'([^']*)'|${name}\\s*=\\s*([^\\s>]+)`, 'i');
  const m = tagInner.match(re);
  if (!m) return null;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? '');
}

function stripTagsAndDecode(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ''));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
