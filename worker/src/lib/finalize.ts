import {
  createSaveEvent,
  getItem,
  updateItem,
  type ItemRecord,
} from './pocketbase.js';
import { computeElementIdentity, recordElementSave } from './elements.js';
import { recordUserInterests } from './profiler.js';

export async function finalizeItem(itemId: string, patch: Partial<ItemRecord>): Promise<void> {
  await updateItem(itemId, { ...patch, status: 'ready' });

  try {
    const item = await getItem(itemId);
    await runAnalytics(item);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[finalize] analytics failed for item ${itemId}: ${msg}`);
  }
}

async function runAnalytics(item: ItemRecord): Promise<void> {
  const counted = await tryClaimSaveEvent(item);
  if (!counted) return;

  const tasks: Promise<unknown>[] = [
    recordUserInterests(item).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[finalize] profiler failed for item ${item.id}: ${msg}`);
    }),
  ];

  if (computeElementIdentity(item)) {
    tasks.push(
      recordElementSave(item).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[finalize] elements failed for item ${item.id}: ${msg}`);
      }),
    );
  }

  await Promise.all(tasks);
}

async function tryClaimSaveEvent(item: ItemRecord): Promise<boolean> {
  try {
    await createSaveEvent({
      item: item.id,
      user: item.user,
      counted_at: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    if (isDuplicate(err)) return false;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[finalize] save_events claim failed for item ${item.id}: ${msg}`);
    return false;
  }
}

function isDuplicate(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { status?: number; data?: { data?: Record<string, { code?: string }> } };
  if (anyErr.status === 400 || anyErr.status === 409) {
    const fields = anyErr.data?.data;
    if (fields && typeof fields === 'object') {
      for (const key of Object.keys(fields)) {
        const code = fields[key]?.code;
        if (typeof code === 'string' && code.toLowerCase().includes('unique')) return true;
      }
    }
  }
  const msg = err instanceof Error ? err.message : '';
  return /unique|already exists|duplicate/i.test(msg);
}
