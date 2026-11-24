import { get, set } from 'idb-keyval';
import * as Tone from 'tone';

/** Imported samples are stored in IndexedDB (never uploaded anywhere). */
export interface SampleMeta {
  id: string;
  name: string;
}

const INDEX_KEY = 'samples:index';
const dataKey = (id: string) => 'samples:data:' + id;
const MAX_BYTES = 15 * 1024 * 1024;

const cache = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

export const getCachedBuffer = (id: string) => cache.get(id);

export async function listSamples(): Promise<SampleMeta[]> {
  return ((await get(INDEX_KEY)) as SampleMeta[] | undefined) ?? [];
}

async function hashBytes(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  // slice: decodeAudioData detaches the buffer it's given
  return Tone.getContext().rawContext.decodeAudioData(bytes.slice(0));
}

/** Decode, store and register an audio file the user dropped in. */
export async function importSample(file: File): Promise<SampleMeta> {
  if (file.size > MAX_BYTES) throw new Error('That file is too big (max 15 MB). Short one-shot sounds work best.');
  const bytes = await file.arrayBuffer();
  let audio: AudioBuffer;
  try {
    audio = await decode(bytes);
  } catch {
    throw new Error("Couldn't read that file. Try a .wav or .mp3.");
  }
  const id = await hashBytes(bytes);
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Sample';
  cache.set(id, audio);
  await set(dataKey(id), bytes);
  const index = await listSamples();
  if (!index.some((s) => s.id === id)) await set(INDEX_KEY, [...index, { id, name }]);
  return { id, name };
}

/** Load a stored sample into memory. Resolves null if it isn't in this browser. */
export function loadSample(id: string): Promise<AudioBuffer | null> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  let p = loading.get(id);
  if (!p) {
    p = (async () => {
      try {
        const bytes = (await get(dataKey(id))) as ArrayBuffer | undefined;
        if (!bytes) return null;
        const audio = await decode(bytes);
        cache.set(id, audio);
        return audio;
      } catch {
        return null;
      } finally {
        loading.delete(id);
      }
    })();
    loading.set(id, p);
  }
  return p;
}
