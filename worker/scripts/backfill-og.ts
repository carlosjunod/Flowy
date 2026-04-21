import '../src/env.js';
import { extract } from '@extractus/article-extractor';
import { pb, ensureAuth, type ItemRecord } from '../src/lib/pocketbase.js';

const THROTTLE_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Summary {
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
}

async function run(): Promise<Summary> {
  await ensureAuth();

  const items = await pb.collection('items').getFullList<ItemRecord>({
    filter: 'type = "url" && (og_image = "" || og_image = null)',
    sort: '-created',
  });

  const summary: Summary = { scanned: items.length, updated: 0, skipped: 0, failed: 0 };
  console.log(`[backfill-og] scanning ${items.length} url items`);

  for (const item of items) {
    const url = item.source_url ?? item.raw_url;
    if (!url) {
      summary.skipped += 1;
      console.log(`[backfill-og] skip ${item.id} (no url)`);
      continue;
    }

    try {
      const scraped = await extract(url);
      if (!scraped) {
        summary.failed += 1;
        console.log(`[backfill-og] fail ${item.id} (extract returned null)`);
        continue;
      }

      const patch: Partial<ItemRecord> = {};
      if (scraped.image) patch.og_image = scraped.image;
      if (scraped.description) patch.og_description = scraped.description.slice(0, 500);
      if (scraped.source) patch.site_name = scraped.source.slice(0, 100);

      if (Object.keys(patch).length === 0) {
        summary.skipped += 1;
        console.log(`[backfill-og] skip ${item.id} (no OG fields in response)`);
      } else {
        await pb.collection('items').update(item.id, patch);
        summary.updated += 1;
        console.log(`[backfill-og] updated ${item.id} ${Object.keys(patch).join(',')}`);
      }
    } catch (err) {
      summary.failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[backfill-og] fail ${item.id}: ${msg}`);
    }

    await sleep(THROTTLE_MS);
  }

  return summary;
}

run()
  .then((summary) => {
    console.log('[backfill-og] done', summary);
    process.exit(0);
  })
  .catch((err) => {
    console.error('[backfill-og] fatal', err);
    process.exit(1);
  });
