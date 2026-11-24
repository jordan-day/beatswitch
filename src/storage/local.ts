import { del, get, set } from 'idb-keyval';
import { parseProject } from '../state/schema';
import type { Project } from '../state/types';

/** Named saves in IndexedDB (autosave of the current beat lives in localStorage, see state/project.ts). */
export interface SavedMeta {
  id: string;
  name: string;
  savedAt: number;
}

const INDEX = 'projects:index';
const key = (id: string) => 'projects:data:' + id;

export async function listSaved(): Promise<SavedMeta[]> {
  const list = ((await get(INDEX)) as SavedMeta[] | undefined) ?? [];
  return list.sort((a, b) => b.savedAt - a.savedAt);
}

/** Saving with a name that already exists overwrites that save. */
export async function saveProject(p: Project): Promise<SavedMeta> {
  const list = await listSaved();
  const existing = list.find((m) => m.name.toLowerCase() === p.name.toLowerCase());
  const meta: SavedMeta = { id: existing?.id ?? crypto.randomUUID(), name: p.name, savedAt: Date.now() };
  await set(key(meta.id), p);
  await set(INDEX, [meta, ...list.filter((m) => m.id !== meta.id)]);
  return meta;
}

export async function loadSaved(id: string): Promise<Project | null> {
  return parseProject(await get(key(id)));
}

export async function deleteSaved(id: string): Promise<void> {
  await del(key(id));
  await set(INDEX, (await listSaved()).filter((m) => m.id !== id));
}
