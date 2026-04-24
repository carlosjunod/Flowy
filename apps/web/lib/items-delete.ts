export type DeleteResult =
  | { ok: true }
  | { ok: false; code: 'ITEM_NOT_FOUND' | 'DELETE_FAILED'; message?: string };

interface PbLike {
  collection: (name: string) => {
    getOne: (id: string) => Promise<{ id: string; user: string }>;
    getFullList: (opts: { filter: string; fields: string }) => Promise<{ id: string }[]>;
    delete: (id: string) => Promise<unknown>;
  };
}

export async function deleteItemWithCascade(
  pb: unknown,
  id: string,
  userId: string,
): Promise<DeleteResult> {
  const client = pb as PbLike;
  let item: { id: string; user: string };
  try {
    item = await client.collection('items').getOne(id);
  } catch {
    return { ok: false, code: 'ITEM_NOT_FOUND' };
  }
  if (item.user !== userId) return { ok: false, code: 'ITEM_NOT_FOUND' };

  try {
    const embeddings = await client.collection('embeddings').getFullList({
      filter: `item = "${id}"`,
      fields: 'id',
    });
    await Promise.all(embeddings.map((e) => client.collection('embeddings').delete(e.id)));
    await client.collection('items').delete(id);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    return { ok: false, code: 'DELETE_FAILED', message };
  }
}
