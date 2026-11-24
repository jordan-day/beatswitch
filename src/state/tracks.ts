import { DRUM_ROWS, type DrumRow, type DrumTrack, type MelodyTrack, type Project } from './types';

/**
 * Helpers that treat the built-in tracks and the ones you add the same way.
 *
 * Drum rows are addressed by key: a built-in row name ("kick", "snare"...) or an added row's id.
 * Melodies are addressed by id: MAIN_MELODY for the first melody, or an added melody's id.
 */
export const MAIN_MELODY = 'main';

export const isDrumRow = (key: string): key is DrumRow => (DRUM_ROWS as readonly string[]).includes(key);

/** A drum row by key (built-in row name or added row id). */
export function drumTrack(p: Project, key: string): DrumTrack | undefined {
  return isDrumRow(key) ? p.drums[key] : p.extraDrums.find((d) => d.id === key);
}

/** Every drum row on the pad, built-in first: its key, the kind of drum it plays, and its track. */
export function allDrums(p: Project): { key: string; voice: DrumRow; track: DrumTrack }[] {
  return [
    ...DRUM_ROWS.map((r) => ({ key: r as string, voice: r, track: p.drums[r] })),
    ...p.extraDrums.map((d) => ({ key: d.id, voice: d.voice, track: d as DrumTrack })),
  ];
}

/** A melody by id (MAIN_MELODY or an added melody's id). */
export function melodyTrack(p: Project, id: string): MelodyTrack | undefined {
  return id === MAIN_MELODY ? p.melody : p.extraMelodies.find((m) => m.id === id);
}

/** Every melody, the first one first. */
export function allMelodies(p: Project): { id: string; track: MelodyTrack }[] {
  return [{ id: MAIN_MELODY, track: p.melody }, ...p.extraMelodies.map((m) => ({ id: m.id, track: m as MelodyTrack }))];
}

/** "Melody 1", "Melody 2"... in the order they were added. */
export const melodyName = (p: Project, id: string) => `Melody ${Math.max(0, allMelodies(p).findIndex((m) => m.id === id)) + 1}`;

/** Colours for added melodies (the first melody keeps its orange) and added drum rows. */
export const MELODY_COLORS = ['#f2a65a', '#e58fae', '#9ccf9a', '#b6a2e0'];
export const EXTRA_DRUM_COLORS = ['#f0b36b', '#d98ad9', '#8fd6b6', '#c9c97a'];

export const melodyColor = (p: Project, id: string) =>
  MELODY_COLORS[Math.max(0, allMelodies(p).findIndex((m) => m.id === id)) % MELODY_COLORS.length];
