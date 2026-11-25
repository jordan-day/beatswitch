import { Note } from 'tonal';
import { MELODY_ROWS, STEPS_PER_BAR, type MelodyNote, type Project } from '../state/types';
import { degreeNote, slotNotes } from './chords';
import { slotLength } from './patterns';

/** [start step in the bar, length in steps]. Lo-fi melodies breathe, so every pattern leaves gaps. */
type Hit = [number, number];
const MOTIFS: Hit[][] = [
  [[0, 3], [4, 2], [6, 2], [8, 4], [12, 3]],
  [[2, 2], [4, 2], [8, 3], [12, 3]],
  [[0, 4], [6, 2], [8, 2], [10, 2], [12, 4]],
  [[0, 2], [3, 3], [6, 3], [10, 2], [13, 3]],
  [[0, 6], [8, 2], [10, 2], [12, 4]],
  [[4, 2], [6, 2], [8, 6], [14, 2]],
];
/** The last bar slows down and settles on a long note. */
const ENDINGS: Hit[][] = [
  [[0, 4], [6, 2], [8, 8]],
  [[2, 2], [4, 4], [8, 8]],
  [[0, 2], [4, 2], [8, 6]],
];

const LOW = 2;
const HIGH = 11;
const TONIC_TONES = [0, 2, 4, 7, 9, 11, 14];
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const clamp = (n: number) => Math.max(LOW, Math.min(HIGH, n));
const nearest = (xs: number[], to: number, from = to) =>
  xs.reduce((best, x) => {
    const d = Math.abs(x - to);
    const db = Math.abs(best - to);
    return d < db || (d === db && Math.abs(x - from) < Math.abs(best - from)) ? x : best;
  }, xs[0]);

/**
 * A short, singable melody that fits the project's key and chords: scale degrees (so it follows
 * key changes), chord tones on the strong beats, mostly stepwise motion in between, a motif that
 * repeats and answers itself, and a last note that settles on the tonic or the chord's root.
 */
export function generateMelody(p: Project): MelodyNote[] {
  const slots = p.chords.slots;
  const slotLen = slotLength(p.bars, slots.length);

  // which scale degrees belong to the chord playing at a given step
  const cache = new Map<string, number[]>();
  const chordTones = (step: number): number[] => {
    const slot = slots[Math.min(slots.length - 1, Math.floor(step / slotLen))];
    if (!slot) return TONIC_TONES;
    const key = slot.symbol + (slot.notes?.join() ?? '');
    let tones = cache.get(key);
    if (!tones) {
      const chroma = new Set(slotNotes(slot).map((n) => Note.chroma(n)));
      const all = Array.from({ length: MELODY_ROWS }, (_, d) => d).filter((d) => chroma.has(Note.chroma(degreeNote(p.tonic, p.mood, 4, d))));
      tones = all.filter((d) => d >= LOW && d <= HIGH);
      if (!tones.length) tones = TONIC_TONES;
      cache.set(key, tones);
    }
    return tones;
  };

  const motif = pick(MOTIFS);
  const ending = pick(ENDINGS);
  const moves = motif.map(() => pick([-2, -1, -1, 0, 1, 1, 2]));
  // the "answer" bar replays the motif's shape but turns the last move around
  const answer = moves.map((m, i) => (i === moves.length - 1 ? -m || 1 : m));

  const notes: MelodyNote[] = [];
  let prev = nearest(chordTones(0), 5);
  for (let bar = 0; bar < p.bars; bar++) {
    const last = bar === p.bars - 1;
    const hits = last ? ending : motif;
    const shape = bar % 2 === 1 ? answer : moves;
    hits.forEach(([offset, length], i) => {
      const step = bar * STEPS_PER_BAR + offset;
      const lastHit = last && i === hits.length - 1;
      let d: number;
      if (lastHit) {
        // settle: the tonic if the chord has it, otherwise the chord's closest tone to the tonic
        const tones = chordTones(step);
        d = nearest(tones.filter((t) => t % 7 === 0).length ? tones.filter((t) => t % 7 === 0) : tones, 7, prev);
      } else {
        let move = shape[i % shape.length] ?? 0;
        // drift back toward the middle instead of climbing or sinking out of range
        if ((prev >= 8 && move > 0) || (prev <= 3 && move < 0)) move = -move;
        d = clamp(prev + move);
        if (offset % 8 === 0 || i === 0) d = nearest(chordTones(step), d, prev); // strong beats land on the chord
      }
      // never sit on the same note three times in a row (notes that must be chord tones stay put)
      const n = notes.length;
      const free = !lastHit && offset % 8 !== 0 && i !== 0;
      if (free && n >= 2 && notes[n - 1].d === d && notes[n - 2].d === d) d = clamp(d + (d >= prev && d < HIGH ? 1 : -1));
      notes.push({ s: step, l: Math.min(length, p.bars * STEPS_PER_BAR - step), d });
      prev = d;
    });
  }
  return notes;
}
