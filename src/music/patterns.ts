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

/**
 * The next step to play when looping a section of `bars` bars. `loopBar` is the bar to loop on
 * its own, or null to loop every bar. Changing it takes effect at the next bar line, so the beat
 * never jumps mid-bar. `last` is the step just played (-1 before the first one).
 */
export function nextLoopStep(last: number, bars: number, loopBar: number | null): number {
  const total = bars * STEPS_PER_BAR;
  const next = last + 1;
  if (last >= 0 && next % STEPS_PER_BAR !== 0) return next % total; // mid-bar: carry on
  if (loopBar !== null) return Math.max(0, Math.min(loopBar, bars - 1)) * STEPS_PER_BAR; // back to the looped bar
  return last < 0 ? 0 : next % total;
}

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

/**
 * When the loop grows. Shortening a loop only hides the later bars, so if the bars coming back
 * still hold anything, they return exactly as they were. If they're empty, the existing bars are
 * repeated into them so the beat keeps going.
 */
export function extendSteps<T>(steps: T[], oldBars: number, newBars: number): T[] {
  if (newBars <= oldBars) return steps.slice();
  const oldLen = oldBars * STEPS_PER_BAR;
  const newLen = newBars * STEPS_PER_BAR;
  if (steps.slice(oldLen, newLen).some(Boolean)) return steps.slice();
  const out = steps.slice();
  for (let i = oldLen; i < newLen; i++) out[i] = steps[i % oldLen];
  return out;
}

/** A boolean step pattern of the hits a chord rhythm makes (used to seed the 'custom' rhythm). */
export function rhythmToSteps(rhythm: Exclude<ChordRhythm, 'custom'>, bars: number, count: number): boolean[] {
  const len = slotLength(bars, count);
  const out = Array.from({ length: MAX_STEPS }, () => false);
  for (let slot = 0; slot < count; slot++) for (const h of chordHits(rhythm, len)) out[slot * len + h.offset] = true;
  return extendSteps(out, bars, MAX_BARS);
}

/**
 * Melody version of {@link extendSteps}: notes in the bars coming back are kept as they were;
 * only if those bars are empty is the existing melody repeated into them. Never drops a note.
 */
export function extendMelody<T extends { s: number }>(notes: T[], oldBars: number, newBars: number): T[] {
  if (newBars <= oldBars) return notes.slice();
  const oldLen = oldBars * STEPS_PER_BAR;
  const newLen = newBars * STEPS_PER_BAR;
  if (notes.some((n) => n.s >= oldLen && n.s < newLen)) return notes.slice();
  const base = notes.filter((n) => n.s < oldLen);
  const out = notes.slice();
  for (let off = oldLen; off < newLen; off += oldLen) out.push(...base.map((n) => ({ ...n, s: n.s + off })));
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

/** Kick patterns for one bar (the kick on beat 1 is always there): from sparse to busy. */
const KICKS: number[][] = [[0, 10], [0, 7, 10], [0, 8, 10], [0, 6, 10, 13], [0, 3, 10], [0, 10, 11], [0, 7, 14], [0, 9, 10], [0, 2, 10, 14], [0, 11]];

/** Hi-hat styles for one bar: each gives the hit (0, 1 or 2 = louder) at step i. */
const HATS: ((i: number) => Step)[] = [
  (i) => (i % 2 === 0 ? (i % 4 === 0 ? 2 : 1) : 0), // straight 8ths
  (i) => (i % 4 === 0 ? 2 : 1), // busy 16ths
  (i) => (i % 2 === 0 ? (i % 4 === 0 ? 2 : 1) : rnd(0.3) ? 1 : 0), // skippy: 8ths with stray 16ths
  (i) => (i % 4 === 0 ? 1 : 0), // sparse quarters
  (i) => (i % 4 === 2 ? 2 : 0), // only the "ands"
  (i) => (i % 4 === 0 || i % 4 === 3 ? 1 : 0), // lazy shuffle
];

/**
 * A random (but musical) one-bar drum pattern, repeated to fill all steps. Lo-fi keeps its
 * backbeat (kick on 1, snare on 2 and 4), and around it picks one of several kick patterns and
 * hi-hat styles, with optional ghost snares, an open hat and percussion. Pass the current drums as
 * `avoid` to always get something that sounds different from them.
 */
export function randomDrums(avoid?: Partial<Record<DrumRow, Step[]>>): Record<DrumRow, Step[]> {
  const bar = (fn: (i: number) => Step): Step[] => Array.from({ length: STEPS_PER_BAR }, (_, i) => fn(i));
  const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
  const same = (a?: Step[], b?: Step[]) => !!a && !!b && a.slice(0, STEPS_PER_BAR).every((v, i) => !!v === !!b[i]);
  let rows: Record<DrumRow, Step[]>;
  for (let tries = 0; ; tries++) {
    const kicks = pick(KICKS);
    const hatStyle = pick(HATS);
    const ghosts = rnd(0.4) ? [pick([7, 9, 15]), ...(rnd(0.4) ? [pick([3, 11, 14])] : [])] : [];
    const kick = bar((i) => (i === 0 ? 2 : kicks.includes(i) ? 1 : 0));
    const snare = bar((i) => (i === 4 || i === 12 ? 2 : ghosts.includes(i) ? 1 : 0));
    const openAt = rnd(0.5) ? pick([6, 14, 10]) : -1;
    const hat = bar((i) => (i === openAt ? 0 : hatStyle(i)));
    const openhat = bar((i) => (i === openAt ? 1 : 0));
    const percAt = rnd(0.5) ? pick([[3, 11], [6], [7, 15], [10]]) : [];
    const perc = bar((i) => (percAt.includes(i) ? 1 : 0));
    rows = { kick, snare, hat, openhat, perc };
    // something you'll hear as new: a different kick or hi-hat than the beat being replaced
    if (!avoid || tries >= 12 || !(same(kick, avoid.kick) && same(hat, avoid.hat))) break;
  }
  const out = {} as Record<DrumRow, Step[]>;
  for (const r of DRUM_ROWS) out[r] = Array.from({ length: MAX_STEPS }, (_, i) => rows[r][i % STEPS_PER_BAR]);
  return out;
}
