import * as Tone from 'tone';
import type { DrumRow, SampledInstrument, SynthKit } from '../state/types';

/**
 * Recorded instruments that ship with the app (VCSL by Versilian Studios, CC0 public domain),
 * processed by scripts/process-samples.mjs into public/samples. Each set is fetched and decoded
 * the first time it's used, so the app starts fast and only downloads what a beat needs.
 */
interface Manifest {
  source: string;
  sets: Record<string, Record<string, string>>;
}

const BASE = 'samples/'; // relative: works on GitHub Pages subpaths and inside a Claude artifact

let manifest: Promise<Manifest | null> | null = null;
const buffers = new Map<string, AudioBuffer>(); // path -> decoded audio
const pending = new Map<string, Promise<AudioBuffer | null>>();

function getManifest(): Promise<Manifest | null> {
  return (manifest ??= fetch(BASE + 'manifest.json')
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null));
}

function loadPath(path: string): Promise<AudioBuffer | null> {
  const hit = buffers.get(path);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(path);
  if (!p) {
    p = fetch(BASE + path)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((bytes) => Tone.getContext().rawContext.decodeAudioData(bytes))
      .then((audio) => {
        buffers.set(path, audio);
        return audio;
      })
      .catch(() => null)
      .finally(() => pending.delete(path));
    pending.set(path, p);
  }
  return p;
}

/** Which recorded file a drum row plays for a built-in kit (null = it's a synthesized kit). */
export function kitSamplePath(row: DrumRow, kit: SynthKit): string | null {
  if (kit === 'dusty' || kit === 'soft') return null;
  if (kit === 'acoustic') return `kit/${row === 'perc' ? 'clap' : row}.wav`;
  return `kit/${kit}.wav`;
}

export const getKitBuffer = (path: string) => buffers.get(path);

/** Decoded notes of a pitched set ({ "A4": AudioBuffer, ... }), or undefined until it has loaded. */
const instrumentCache = new Map<SampledInstrument, Record<string, AudioBuffer>>();
export const getInstrument = (name: SampledInstrument) => instrumentCache.get(name);

/** Make sure the given drum files and instruments are decoded. Resolves when done (failures resolve too). */
export async function loadBuiltins(kitPaths: string[], instruments: SampledInstrument[]): Promise<void> {
  const m = await getManifest();
  if (!m) return;
  await Promise.all([
    ...kitPaths.map(loadPath),
    ...instruments
      .filter((name) => !instrumentCache.has(name) && m.sets[name])
      .map(async (name) => {
        const entries = Object.entries(m.sets[name]);
        const decoded = await Promise.all(entries.map(([, path]) => loadPath(path)));
        const notes: Record<string, AudioBuffer> = {};
        entries.forEach(([note], i) => decoded[i] && (notes[note] = decoded[i]!));
        if (Object.keys(notes).length) instrumentCache.set(name, notes);
      }),
  ]);
}
