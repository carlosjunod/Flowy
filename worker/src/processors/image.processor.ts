import { updateItem } from '../lib/pocketbase.js';
import type { ItemRecord } from '../lib/pocketbase.js';

export async function processImage(item: ItemRecord, _rawImageBase64: string): Promise<void> {
  await updateItem(item.id, { status: 'ready' });
}
