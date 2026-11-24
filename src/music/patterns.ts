import {
  DRUM_ROWS,
  MAX_STEPS,
  STEPS_PER_BAR,
  MAX_BARS,
  type ChordRhythm,
  type DrumRow,
  type FxSettings,
  type Step,
} from '../state/types';

/** Parse "x...X..." (x = on, X = accent, anything else = off) and repeat to fill all 64 steps. */
export function parsePattern(s: string): Step[] {
  const clean = s.replace(/\s|\|/g, '');
  return Array.from({ length: MAX_STEPS }, (_, i) => {
    const ch = clean[i % clean.length];
    return ch === 'X' ? 2 : ch === 'x' ? 1 : 0;
  });
}

export function parseBool(s: string): boolean[] {
  return parsePattern(s).map((v) => v > 0);
}

/** Length of one chord slot in steps (the chords are spread evenly over the loop). */
export function slotLength(bars: number, count = 4): number {
  return Math.max(1, Math.floor((bars * STEPS_PER_BAR) / count));
}

/** Offsets (in steps, within a chord slot) where the chord is played, and how long each hit lasts. */
export function chordHits(rhythm: Exclude<ChordRhythm, 'custom'>, len: number): { offset: number; length: number }[] {
  if (rhythm === 'whole' || len < 4) return [{ offset: 0, length: len }];
  if (rhythm === 'half') {
    const h = len / 2;
    return [
      { offset: 0, length: h },
      { offset: h, length: h },
    ];
  }
  // stab: short hits on the downbeat, the "and" of 2 and the 3rd quarter-ish, scaled to slot size
  const offs = Array.from(new Set([0, Math.round(len * 0.375), Math.round(len * 0.625)]));
  return offs.map((offset) => ({ offset, length: Math.max(1, Math.round(len / 8)) }));
}

/** When the loop grows, copy the existing bars into the new ones so the beat keeps going. */
export function extendSteps<T>(steps: T[], oldBars: number, newBars: number): T[] {
  if (newBars <= oldBars) return steps.slice();
  const out = steps.slice();
  const oldLen = oldBars * STEPS_PER_BAR;
  for (let i = oldLen; i < newBars * STEPS_PER_BAR; i++) out[i] = steps[i % oldLen];
  return out;
}

/** A boolean step pattern of the hits a chord rhythm makes (used to seed the 'custom' rhythm). */
export function rhythmToSteps(rhythm: Exclude<ChordRhythm, 'custom'>, bars: number, count: number): boolean[] {
  const len = slotLength(bars, count);
  const out = Array.from({ length: MAX_STEPS }, () => false);
  for (let slot = 0; slot < count; slot++) for (const h of chordHits(rhythm, len)) out[slot * len + h.offset] = true;
  return extendSteps(out, bars, MAX_BARS);
}

/** Repeat melody notes from the first `oldBars` into new bars when the loop grows. */
export function extendMelody<T extends { s: number }>(notes: T[], oldBars: number, newBars: number): T[] {
  if (newBars <= oldBars) return notes.slice();
  const oldLen = oldBars * STEPS_PER_BAR;
  const base = notes.filter((n) => n.s < oldLen);
  const out = base.slice();
  for (let off = oldLen; off < newBars * STEPS_PER_BAR; off += oldLen) out.push(...base.map((n) => ({ ...n, s: n.s + off })));
  return out;
}

/** The single "Lo-fi-ness" knob mapped onto all the individual effects. */
export function lofiMacro(t: number): Omit<FxSettings, 'lofi'> {
  const x = Math.min(1, Math.max(0, t));
  return {
    crackle: round(0.05 + 0.65 * x),
    wobble: round(0.05 + 0.6 * x),
    muffle: round(0.15 + 0.7 * x),
    crunch: round(x > 0.55 ? (x - 0.55) * 1.6 : 0),
    space: round(0.15 + 0.4 * x),
  };
}
const round = (v: number) => Math.round(v * 100) / 100;

const rnd = (p: number) => Math.random() < p;

/** Random but musical drum patterns (kick on 1, snare on 2 & 4, swung hats...). */
export function randomDrums(): Record<DrumRow, Step[]> {
  const bar = (fn: (i: number) => Step): Step[] => Array.from({ length: STEPS_PER_BAR }, (_, i) => fn(i));
  const kick = bar((i) => (i === 0 ? 2 : (i === 10 || i === 7 || i === 8) && rnd(0.45) ? 1 : i === 14 && rnd(0.2) ? 1 : 0));
  const snare = bar((i) => (i === 4 || i === 12 ? 2 : i === 15 && rnd(0.2) ? 1 : 0));
  const hat = bar((i) => (i % 2 === 0 ? (i % 4 === 0 ? 2 : 1) : rnd(0.25) ? 1 : 0));
  const openhat = bar((i) => (i === 14 && rnd(0.5) ? 1 : 0));
  const perc = bar((i) => ((i === 6 || i === 11 || i === 3) && rnd(0.3) ? 1 : 0));
  const rows = { kick, snare, hat, openhat, perc };
  const out = {} as Record<DrumRow, Step[]>;
  for (const r of DRUM_ROWS) out[r] = Array.from({ length: MAX_STEPS }, (_, i) => rows[r][i % STEPS_PER_BAR]);
  return out;
}
