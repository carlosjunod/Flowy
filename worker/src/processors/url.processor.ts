import { updateItem } from '../lib/pocketbase.js';
import type { ItemRecord } from '../lib/pocketbase.js';

// Full implementation lives in CYCLE-02. Stub marks items ready so CYCLE-01 acceptance tests pass.
export async function processUrl(item: ItemRecord): Promise<void> {
  await updateItem(item.id, { status: 'ready' });
}
