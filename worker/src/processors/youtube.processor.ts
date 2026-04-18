import { updateItem } from '../lib/pocketbase.js';
import type { ItemRecord } from '../lib/pocketbase.js';

export async function processYoutube(item: ItemRecord): Promise<void> {
  await updateItem(item.id, { status: 'ready' });
}
