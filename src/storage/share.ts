import LZString from 'lz-string';
import { parseProject } from '../state/schema';
import { DRUM_ROWS, type Project } from '../state/types';

const PREFIX = '#b=';

/** Imported samples live only in this browser: swap them for a built-in sound. Returns how many. */
function replaceUserSamples(copy: Project): number {
  let n = 0;
  for (const t of [...DRUM_ROWS.map((r) => copy.drums[r]), ...copy.extraDrums]) {
    if (t.sound.kind === 'user') {
      t.sound = { kind: 'synth', id: 'dusty' };
      n++;
    }
  }
  // the song's sample has no built-in stand-in, so it's left out (with its hits in every section)
  if (copy.sample) {
    copy.sample = null;
    for (const s of copy.sections) delete s.patterns?.sample;
    n++;
  }
  return n;
}

/** Repeat the first `used` steps to fill the whole array (undoes the trimming done for links). */
const refill = <T,>(steps: T[], used: number): T[] => {
  const s = steps.slice(0, used);
  return steps.map((_, i) => s[i % used]);
};

/**
 * Encode a project into a compact URL-safe string.
 * Imported samples live only in this browser, so they're swapped for the built-in kit.
 */
export function encodeProject(p: Project): { hash: string; replacedSamples: number } {
  const copy: Project = structuredClone(p);
  const replacedSamples = replaceUserSamples(copy);
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
    extraDrums: copy.extraDrums.map((d) => ({ ...d, steps: d.steps.slice(0, used) })),
    extraMelodies: copy.extraMelodies.map((m) => ({ ...m, notes: m.notes.filter((n) => n.s < used) })),
    // other sections: the same trimming, to the bars each one uses
    sections: copy.sections.map((s) => {
      if (!s.patterns) return s;
      const n = s.patterns.bars * 16;
      const pt = s.patterns;
      return {
        ...s,
        patterns: {
          ...pt,
          drums: Object.fromEntries(DRUM_ROWS.map((r) => [r, pt.drums[r].slice(0, n)])),
          bass: pt.bass.slice(0, n),
          chords: { ...pt.chords, steps: pt.chords.steps.slice(0, n).map((b) => (b ? 1 : 0)), hidden8: undefined },
          melody: pt.melody.filter((m) => m.s < n),
          extraDrums: Object.fromEntries(Object.entries(pt.extraDrums ?? {}).map(([id, st]) => [id, st.slice(0, n)])),
          extraMelodies: Object.fromEntries(
            Object.entries(pt.extraMelodies ?? {}).map(([id, notes]) => [id, notes.filter((m) => m.s < n)]),
          ),
        },
      };
    }),
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
    for (const r of DRUM_ROWS) p.drums[r].steps = refill(p.drums[r].steps, used);
    for (const d of p.extraDrums) d.steps = refill(d.steps, used);
    p.bass.steps = refill(p.bass.steps, used);
    p.chords.steps = refill(p.chords.steps, used);
    return p;
  } catch {
    return null;
  }
}

/** A beat as a small JSON file (imported samples swapped for the built-in kit, like share links). */
export function projectToFile(p: Project): { json: string; replacedSamples: number } {
  const copy: Project = structuredClone(p);
  const replacedSamples = replaceUserSamples(copy);
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
