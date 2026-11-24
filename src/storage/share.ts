import LZString from 'lz-string';
import { parseProject } from '../state/schema';
import { DRUM_ROWS, type Project } from '../state/types';

const PREFIX = '#b=';

/**
 * Encode a project into a compact URL-safe string.
 * Imported samples live only in this browser, so they're swapped for the built-in kit.
 */
export function encodeProject(p: Project): { hash: string; replacedSamples: number } {
  const copy: Project = structuredClone(p);
  let replacedSamples = 0;
  for (const row of DRUM_ROWS) {
    if (copy.drums[row].sound.kind === 'user') {
      copy.drums[row].sound = { kind: 'synth', id: 'dusty' };
      replacedSamples++;
    }
  }
  // Trim step arrays to the bars actually used to keep links short.
  const used = copy.bars * 16;
  const compact = {
    ...copy,
    drums: Object.fromEntries(
      DRUM_ROWS.map((r) => [r, { ...copy.drums[r], steps: copy.drums[r].steps.slice(0, used) }]),
    ),
    bass: { ...copy.bass, steps: copy.bass.steps.slice(0, used) },
    chords: { ...copy.chords, steps: copy.chords.steps.slice(0, used).map((b) => (b ? 1 : 0)) },
    melody: { ...copy.melody, notes: copy.melody.notes.filter((n) => n.s < used) },
  };
  return { hash: PREFIX + LZString.compressToEncodedURIComponent(JSON.stringify(compact)), replacedSamples };
}

export function decodeProject(hash: string): Project | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(hash.slice(PREFIX.length));
    if (!json) return null;
    const raw = JSON.parse(json);
    const p = parseProject(raw);
    if (!p) return null;
    // Step arrays were trimmed to `bars` when encoding; repeat them to fill the full 64 steps.
    const used = p.bars * 16;
    for (const r of DRUM_ROWS) {
      const s = p.drums[r].steps.slice(0, used);
      p.drums[r].steps = p.drums[r].steps.map((_, i) => s[i % used]);
    }
    const b = p.bass.steps.slice(0, used);
    p.bass.steps = p.bass.steps.map((_, i) => b[i % used]);
    const c = p.chords.steps.slice(0, used);
    p.chords.steps = p.chords.steps.map((_, i) => c[i % used]);
    return p;
  } catch {
    return null;
  }
}

/** A beat as a small JSON file (imported samples swapped for the built-in kit, like share links). */
export function projectToFile(p: Project): { json: string; replacedSamples: number } {
  const copy: Project = structuredClone(p);
  let replacedSamples = 0;
  for (const row of DRUM_ROWS) {
    if (copy.drums[row].sound.kind === 'user') {
      copy.drums[row].sound = { kind: 'synth', id: 'dusty' };
      replacedSamples++;
    }
  }
  return { json: JSON.stringify({ app: 'BeatSwitch', ...copy }), replacedSamples };
}

/** Read a beat file back. Returns null when it isn't a BeatSwitch beat. */
export function projectFromFile(text: string): Project | null {
  try {
    return parseProject(JSON.parse(text));
  } catch {
    return null;
  }
}

export function shareUrl(p: Project): { url: string; replacedSamples: number } {
  const { hash, replacedSamples } = encodeProject(p);
  const url = window.location.href.split('#')[0] + hash;
  return { url, replacedSamples };
}
