import { Chord, Interval, Note, RomanNumeral, Scale } from 'tonal';
import type { ChordSlot, Mood } from '../state/types';

export const TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export const MOOD_INFO: Record<Mood, { label: string; emoji: string; scale: 'major' | 'minor'; blurb: string }> = {
  chill: { label: 'Chill', emoji: '☕', scale: 'major', blurb: 'Warm and easy' },
  dreamy: { label: 'Dreamy', emoji: '🌙', scale: 'major', blurb: 'Floaty and soft' },
  sad: { label: 'Sad', emoji: '🌧️', scale: 'minor', blurb: 'Rainy-day feels' },
  jazzy: { label: 'Jazzy', emoji: '🎷', scale: 'major', blurb: 'Smoky, extra notes' },
};

/** [roman numeral root, chord quality] */
type Degree = [string, string];
export interface Progression {
  name: string;
  degrees: Degree[];
}

export const PROGRESSIONS: Record<Mood, Progression[]> = {
  chill: [
    { name: 'Classic Lo-fi', degrees: [['I', 'maj7'], ['VI', 'm7'], ['II', 'm7'], ['V', '7']] },
    { name: 'Sunday Walk', degrees: [['IV', 'maj7'], ['III', 'm7'], ['II', 'm7'], ['I', 'maj7']] },
    { name: 'Easy Loop', degrees: [['I', 'maj7'], ['III', 'm7'], ['VI', 'm7'], ['IV', 'maj7']] },
    { name: 'Home Again', degrees: [['II', 'm7'], ['V', '7'], ['I', 'maj7'], ['I', 'maj7']] },
  ],
  dreamy: [
    { name: 'Floating', degrees: [['I', 'maj7'], ['IV', 'maj7'], ['I', 'maj7'], ['IV', 'maj7']] },
    { name: 'Stargazing', degrees: [['I', 'maj9'], ['II', 'm9'], ['III', 'm7'], ['IV', 'maj7']] },
    { name: 'Bittersweet', degrees: [['IV', 'maj7'], ['IV', 'm7'], ['I', 'maj7'], ['I', 'maj7']] },
    { name: 'Clouds', degrees: [['VI', 'm9'], ['IV', 'maj9'], ['I', 'maj9'], ['V', 'sus4']] },
  ],
  sad: [
    { name: 'Rainy Window', degrees: [['I', 'm7'], ['IV', 'm7'], ['bVII', '7'], ['bIII', 'maj7']] },
    { name: 'Missing You', degrees: [['I', 'm9'], ['bVI', 'maj7'], ['bIII', 'maj7'], ['bVII', '7']] },
    { name: 'Late Night', degrees: [['I', 'm7'], ['V', 'm7'], ['bVI', 'maj7'], ['IV', 'm7']] },
    { name: 'Lonely Street', degrees: [['II', 'm7b5'], ['V', '7b9'], ['I', 'm7'], ['I', 'm7']] },
  ],
  jazzy: [
    { name: 'Coffee Shop', degrees: [['I', 'maj9'], ['VI', '7'], ['II', 'm9'], ['V', '13']] },
    { name: 'Turnaround', degrees: [['III', 'm7'], ['VI', '7'], ['II', 'm9'], ['V', '9']] },
    { name: 'Smoke', degrees: [['II', 'm9'], ['V', '13'], ['I', 'maj9'], ['IV', 'maj9']] },
    { name: 'Neo Soul', degrees: [['IV', 'maj9'], ['III', 'm9'], ['VI', 'm9'], ['II', '9']] },
  ],
};

/** The 7 chords built on each note of the scale (as 7th chords), plus some richer extras. */
const DIATONIC: Record<'major' | 'minor', Degree[]> = {
  major: [
    ['I', 'maj7'], ['II', 'm7'], ['III', 'm7'], ['IV', 'maj7'], ['V', '7'], ['VI', 'm7'], ['VII', 'm7b5'],
    ['I', 'maj9'], ['II', 'm9'], ['IV', 'maj9'], ['V', '9'], ['VI', 'm9'],
  ],
  minor: [
    ['I', 'm7'], ['II', 'm7b5'], ['bIII', 'maj7'], ['IV', 'm7'], ['V', 'm7'], ['bVI', 'maj7'], ['bVII', '7'],
    ['I', 'm9'], ['IV', 'm9'], ['bVI', 'maj9'], ['V', '7'],
  ],
};

/** What each scale degree "feels" like, in plain words. */
const DEGREE_FEEL: Record<'major' | 'minor', string[]> = {
  major: ['home', 'gentle move', 'soft & wistful', 'drifting away', 'tension: wants to go home', 'a bit sad', 'unstable'],
  minor: ['home', 'tense & dark', 'brighter lift', 'drifting away', 'moody pull home', 'warm & bittersweet', 'lifts up'],
};

/** Where a chord on each scale degree likes to go next (indexes into the first 7 DIATONIC entries). */
const NEXT: Record<'major' | 'minor', number[][]> = {
  major: [[3, 5, 1, 4], [4, 6, 3], [5, 3, 1], [4, 0, 1, 2], [0, 5, 3], [1, 3, 4, 2], [0, 2]],
  minor: [[3, 5, 6, 4], [4, 0], [5, 3, 6], [6, 4, 0, 5], [0, 5, 3], [6, 2, 3, 4], [0, 2, 5]],
};

/** Turn a roman numeral + quality into a chord symbol in the given key, e.g. ('C', ['VI','m7']) -> 'Am7'. */
export function degreeToChord(tonic: string, [roman, quality]: Degree): string {
  const interval = RomanNumeral.get(roman).interval ?? '1P';
  const root = Note.simplify(Note.transpose(tonic, interval));
  return root + quality;
}

export function progressionChords(tonic: string, prog: Progression): string[] {
  return prog.degrees.map((d) => degreeToChord(tonic, d));
}

export function fittingChords(tonic: string, mood: Mood): string[] {
  const list = DIATONIC[MOOD_INFO[mood].scale].map((d) => degreeToChord(tonic, d));
  return Array.from(new Set(list));
}

export function scaleNotes(tonic: string, mood: Mood): string[] {
  return Scale.get(`${tonic} ${MOOD_INFO[mood].scale}`).notes;
}

export function keyLabel(tonic: string, mood: Mood): string {
  return `${tonic} ${MOOD_INFO[mood].scale}`;
}

/** Root pitch class of a chord symbol ("Am7" -> "A"). */
export function chordRoot(symbol: string): string | null {
  const c = Chord.get(symbol);
  return c.empty ? null : c.tonic;
}

/** Which scale degree (0..6) a chord's root sits on, or -1 if it's outside the key. */
export function chordDegree(symbol: string, tonic: string, mood: Mood): number {
  const root = chordRoot(symbol);
  if (!root) return -1;
  return scaleNotes(tonic, mood).findIndex((n) => Note.chroma(n) === Note.chroma(root));
}

/**
 * A compact, warm voicing in the C3..C5 range. Lo-fi keys sound best close together,
 * so we stack the chord tones upward from the root at octave 3 (or 2 for high roots).
 */
export function voiceChord(symbol: string): string[] {
  const c = Chord.get(symbol);
  if (c.empty || !c.tonic) return [];
  const rootMidi = Note.midi(c.tonic + '3')!;
  const base = rootMidi > 55 ? c.tonic + '2' : c.tonic + '3';
  let notes = c.intervals.map((iv) => Note.transpose(base, iv));
  // For big chords (9ths/13ths) drop the 5th to keep things clear.
  if (notes.length > 4) notes = notes.filter((_, i) => c.intervals[i] !== '5P');
  // A slash chord ("C/E") puts its bass note at the bottom.
  if (c.bass) {
    const bassPc = Note.chroma(c.bass);
    notes = notes.filter((n) => Note.chroma(n) !== bassPc);
    let b = c.bass + '2';
    while (Note.midi(b)! < 40) b = Note.transpose(b, '8P');
    notes.unshift(b);
  }
  // Fold anything above C5 down an octave.
  return sortNotes(notes.map((n) => (Note.midi(n)! > 72 ? Note.transpose(n, '-8P') : n)));
}

/** Sort low→high and drop duplicates, keeping each note's spelling (C# stays C#). */
export const sortNotes = (notes: string[]) => {
  const byMidi = new Map<number, string>();
  for (const n of notes) {
    const m = Note.midi(n);
    if (m !== null && !byMidi.has(m)) byMidi.set(m, n);
  }
  return [...byMidi.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
};

/** The notes a chord slot actually plays. */
export function slotNotes(slot: ChordSlot): string[] {
  return slot.notes?.length ? slot.notes : voiceChord(slot.symbol);
}

/** Note the bass follows: the slash-bass if there is one, else the chord root. */
function bassPitchClass(slot: ChordSlot): string | null {
  const c = Chord.get(slot.symbol);
  if (!c.empty) return c.bass || c.tonic;
  return slot.notes?.length ? Note.pitchClass(slot.notes[0]) : null;
}

/** Bass note for a chord: root in octave 1/2. mode 1 = root, 2 = fifth, 3 = octave up. */
export function bassNote(slot: ChordSlot | string, mode: 1 | 2 | 3 = 1): string | null {
  const root = bassPitchClass(typeof slot === 'string' ? { symbol: slot } : slot);
  if (!root) return null;
  let n = root + '2';
  if (Note.midi(n)! > 43) n = root + '1';
  if (mode === 2) return Note.transpose(n, '5P');
  if (mode === 3) return Note.transpose(n, '8P');
  return n;
}

const ROLE_BY_NUM: Record<number, string> = { 1: 'root', 2: '9th', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 9: '9th', 11: '11th', 13: '13th' };

/** Each note of a chord with its job in the chord, e.g. [{note:'A', role:'root'}, {note:'C', role:'3rd'}...] */
export function chordRoles(slot: ChordSlot): { note: string; role: string }[] {
  const c = Chord.get(slot.symbol);
  const notes = slotNotes(slot);
  const root = c.empty ? null : c.tonic;
  return notes.map((n) => {
    const pc = Note.pitchClass(n);
    if (!root) return { note: n, role: '' };
    const semis = (((Note.chroma(pc) ?? 0) - (Note.chroma(root) ?? 0)) % 12 + 12) % 12;
    const iv = c.intervals.find((i) => ((Interval.semitones(i) ?? 0) % 12 + 12) % 12 === semis);
    const num = iv ? Math.abs(Interval.get(iv).num ?? 0) : 0;
    const role = ROLE_BY_NUM[num] ?? (iv ? iv : 'extra');
    return { note: n, role: semis === 0 ? 'root' : role };
  });
}

/** Name a set of hand-picked notes ("A2 C3 E3 G3" -> "Am7"). Names rooted on `preferRoot` win when possible. */
export function detectChord(notes: string[], preferRoot?: string | null): string | null {
  const pcs = Array.from(new Set(sortNotes(notes).map((n) => Note.pitchClass(n))));
  if (pcs.length < 2) return null;
  const names = Chord.detect(pcs);
  // Prefer names Tonal can parse back, the current root, and simple ones over slash chords.
  const valid = names.filter((n) => !Chord.get(n).empty);
  const sameRoot = preferRoot ? valid.filter((n) => Note.chroma(Chord.get(n).tonic ?? '') === Note.chroma(preferRoot)) : [];
  const pool = sameRoot.length ? sameRoot : valid;
  const best = pool.find((n) => !n.includes('/')) ?? pool[0] ?? null;
  // Tonal writes a plain major chord as "CM"; most people just write "C".
  return best ? best.replace(/^([A-G][#b]*)M(\/|$)/, '$1$2') : null;
}

type Family = 'major' | 'minor' | 'dominant' | 'diminished';

function family(symbol: string): Family {
  const c = Chord.get(symbol);
  const ivs = c.intervals;
  if (ivs.includes('5d')) return 'diminished';
  if (ivs.includes('3m')) return 'minor';
  if (ivs.includes('7m')) return 'dominant';
  return 'major';
}

/** "Flavors" of the same chord: simpler or richer versions with the same root. */
export function chordFlavors(symbol: string): { label: string; symbol: string; hint: string }[] {
  const root = chordRoot(symbol);
  if (!root) return [];
  const f = family(symbol);
  const q: Record<Family, [string, string, string, string]> = {
    major: ['', 'maj7', 'maj9', 'sus2'],
    minor: ['m', 'm7', 'm9', 'm11'],
    dominant: ['', '7', '9', '7sus4'],
    diminished: ['dim', 'm7b5', 'm7b5', 'dim7'],
  };
  const [simple, seventh, ninth, color] = q[f];
  const out = [
    { label: 'Simple', symbol: root + simple, hint: 'Just 3 notes, plain and clear' },
    { label: '7th', symbol: root + seventh, hint: 'Adds a 4th note: the classic lo-fi sound' },
    { label: '9th', symbol: root + ninth, hint: 'Even richer and jazzier' },
    { label: f === 'minor' ? '11th' : f === 'diminished' ? 'Dim 7' : 'Sus', symbol: root + color, hint: 'A floaty, unresolved color' },
  ];
  return out.filter((o, i) => !Chord.get(o.symbol).empty && out.findIndex((x) => x.symbol === o.symbol) === i);
}

/**
 * New name for a slot after its notes were edited: unchanged if it's still the same set of
 * note names (e.g. an inversion), otherwise re-detected.
 */
export function renameForNotes(symbol: string, notes: string[]): string {
  const chromas = (list: string[]) => [...new Set(list.map((n) => Note.chroma(n)))].sort().join();
  const c = Chord.get(symbol);
  if (!c.empty && chromas(c.notes) === chromas(notes)) return symbol;
  return detectChord(notes, c.tonic) ?? (c.empty ? Note.pitchClass(sortNotes(notes)[0]) : symbol);
}

/** Move the voicing up (lowest note goes up an octave) or down (highest goes down). */
export function invert(notes: string[], dir: 1 | -1): string[] {
  const s = sortNotes(notes);
  if (s.length < 2) return s;
  if (dir === 1) {
    const moved = Note.transpose(s[0], '8P');
    if (Note.midi(moved)! > 79) return s;
    return sortNotes([...s.slice(1), moved]);
  }
  const moved = Note.transpose(s[s.length - 1], '-8P');
  if (Note.midi(moved)! < 36) return s;
  return sortNotes([moved, ...s.slice(0, -1)]);
}

export interface Suggestion {
  symbol: string;
  why: string;
}

/** Good chords to put after `prev`, based on common movement in the key (or the "home" chords if nothing before). */
export function suggestNext(prev: string | null, tonic: string, mood: Mood): Suggestion[] {
  const scale = MOOD_INFO[mood].scale;
  const deg = prev ? chordDegree(prev, tonic, mood) : -1;
  const order = deg >= 0 ? NEXT[scale][deg] : scale === 'major' ? [0, 3, 5, 1] : [0, 5, 3, 6];
  const quality = mood === 'jazzy' || mood === 'dreamy';
  return order.map((i) => {
    let [roman, q] = DIATONIC[scale][i];
    if (quality) q = q.replace(/^maj7$/, 'maj9').replace(/^m7$/, 'm9').replace(/^7$/, '9');
    return { symbol: degreeToChord(tonic, [roman, q]), why: DEGREE_FEEL[scale][i] };
  });
}

/** Feel of a chord within the key, e.g. "home" or "tension". */
export function chordFeel(symbol: string, tonic: string, mood: Mood): string {
  const deg = chordDegree(symbol, tonic, mood);
  return deg >= 0 ? DEGREE_FEEL[MOOD_INFO[mood].scale][deg] : 'outside the key: spicy!';
}

/** Note for a melody row: scale degree `d` above the key note in `octave`. */
export function degreeNote(tonic: string, mood: Mood, octave: number, d: number): string {
  const notes = Scale.get(`${tonic}${octave} ${MOOD_INFO[mood].scale}`).notes;
  const n = notes[((d % 7) + 7) % 7];
  return Note.transpose(n, Interval.fromSemitones(12 * Math.floor(d / 7)));
}

/** The sounding note of a melody note: its scale degree, nudged by an optional accidental (+1 sharp / -1 flat). */
export function melodyPitch(tonic: string, mood: Mood, octave: number, d: number, x: 0 | 1 | -1 = 0): string {
  const n = degreeNote(tonic, mood, octave, d);
  return x ? Note.fromMidi(Note.midi(n)! + x) : n;
}

/** Shift every note/symbol by the interval between two keys (keeps hand-made chords when changing key). */
export function transposeSlot(slot: ChordSlot, from: string, to: string): ChordSlot {
  let iv = Interval.distance(from, to);
  // keep it within +/- 6 semitones so voicings don't wander off
  if ((Interval.semitones(iv) ?? 0) > 6) iv = Interval.subtract(iv, '8P') ?? iv;
  const m = /^([A-G][#b]*)(.*?)(?:\/([A-G][#b]*))?$/.exec(slot.symbol);
  const move = (pc: string) => Note.simplify(Note.transpose(pc, iv));
  const symbol = m ? move(m[1]) + m[2] + (m[3] ? '/' + move(m[3]) : '') : slot.symbol;
  return {
    symbol,
    ...(slot.notes ? { notes: slot.notes.map((n) => Note.simplify(Note.transpose(n, iv))) } : {}),
  };
}
