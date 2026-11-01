import Dexie from 'dexie';

/** The v0.1 database, still in the browser after an update to v2. */
export const V01_DB = 'chat2know';

/** Its knowledge-relevant tables as plain rows, or null when this browser never had v0.1. Read only. */
export async function readV01(): Promise<{ nodes: unknown[]; sources: unknown[] } | null> {
  if (!(await Dexie.exists(V01_DB))) return null;
  const db = new Dexie(V01_DB); // no versions declared: opens the existing schema as it is
  await db.open();
  try {
    return { nodes: await db.table('nodes').toArray(), sources: await db.table('sources').toArray() };
  } finally {
    db.close();
  }
}
