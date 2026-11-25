import { del, get, set } from 'idb-keyval';
import { parseProject } from '../state/schema';
import type { Project } from '../state/types';

/**
 * The beats library in IndexedDB. Every beat you edit is saved here automatically under its own id
 * (the current beat is also mirrored in localStorage for an instant restore, see state/project.ts).
 */
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

/** Save (or update) the beat with this id; renaming a beat renames its entry. */
export async function saveProject(p: Project, id: string): Promise<SavedMeta> {
  const list = await listSaved();
  const meta: SavedMeta = { id, name: p.name, savedAt: Date.now() };
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
