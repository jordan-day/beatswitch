import { emptyProject } from '../music/presets';
import {
  BASS_SOUNDS,
  BPM_MAX,
  BPM_MIN,
  DRUM_ROWS,
  KEYS_SOUNDS,
  MAX_STEPS,
  MELODY_ROWS,
  MELODY_SOUNDS,
  MOODS,
  SYNTH_KITS,
  type BassStep,
  type ChordSlot,
  type Project,
  type SoundRef,
  type Step,
} from './types';
import { TONICS } from '../music/chords';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
const isInt = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const oneOf =<T extends string>(v: unknown, list: readonly T[], dflt: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : dflt;

function steps(v: unknown, dflt: Step[]): Step[] {
  if (!Array.isArray(v)) return dflt;
  return Array.from({ length: MAX_STEPS }, (_, i) => {
    const s = v[i];
    return s === 2 ? 2 : s === 1 || s === true ? 1 : 0;
  });
}

const SYMBOL_RE = /^[A-G][#b]?[\w#+()]{0,12}(\/[A-G][#b]?)?$/;
const NOTE_RE = /^[A-G][#b]{0,2}[0-8]$/;

/** Accepts the old format (a plain chord name string) and the new {symbol, notes} slot. */
function chordSlot(v: unknown): ChordSlot | null {
  if (typeof v === 'string') return SYMBOL_RE.test(v) ? { symbol: v } : null;
  if (!isObj(v) || typeof v.symbol !== 'string' || !SYMBOL_RE.test(v.symbol)) return null;
  const notes = Array.isArray(v.notes)
    ? v.notes.filter((n): n is string => typeof n === 'string' && NOTE_RE.test(n)).slice(0, 10)
    : [];
  return notes.length ? { symbol: v.symbol, notes } : { symbol: v.symbol };
}

function sound(v: unknown): SoundRef {
  if (isObj(v) && v.kind === 'user' && typeof v.id === 'string' && /^[a-f0-9]{8,64}$/.test(v.id)) {
    return { kind: 'user', id: v.id, name: typeof v.name === 'string' ? v.name.slice(0, 80) : 'Sample' };
  }
  return { kind: 'synth', id: isObj(v) ? oneOf(v.id, SYNTH_KITS, 'dusty') : 'dusty' };
}

/**
 * Validate untrusted data (share links, saved files) into a well-formed Project.
 * Returns null when the data is clearly not a BeatSwitch project.
 */
export function parseProject(data: unknown): Project | null {
  if (!isObj(data) || data.version !== 1 || !isObj(data.drums)) return null;
  const base = emptyProject();
  const p: Project = {
    version: 1,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.slice(0, 60) : base.name,
    bpm: Math.round(num(data.bpm, BPM_MIN, BPM_MAX, base.bpm)),
    swing: num(data.swing, 0, 100, base.swing),
    bars: data.bars === 1 || data.bars === 2 || data.bars === 4 ? data.bars : 4,
    tonic: oneOf(data.tonic, TONICS, 'C'),
    mood: oneOf(data.mood, MOODS, 'chill'),
    drums: base.drums,
    chords: base.chords,
    bass: base.bass,
    melody: base.melody,
    fx: base.fx,
  };
  for (const row of DRUM_ROWS) {
    const d = data.drums[row];
    if (!isObj(d)) continue;
    p.drums[row] = {
      sound: sound(d.sound),
      steps: steps(d.steps, base.drums[row].steps),
      volume: num(d.volume, 0, 1, base.drums[row].volume),
      mute: d.mute === true,
    };
  }
  if (isObj(data.chords)) {
    const c = data.chords;
    const slots = Array.isArray(c.slots) ? c.slots : [];
    const count = slots.length > 4 ? 8 : 4;
    p.chords = {
      sound: oneOf(c.sound, KEYS_SOUNDS, 'rhodes'),
      slots: Array.from({ length: count }, (_, i) => chordSlot(slots[i])),
      rhythm: oneOf(c.rhythm, ['whole', 'half', 'stab', 'custom'] as const, 'whole'),
      steps: Array.isArray(c.steps)
        ? Array.from({ length: MAX_STEPS }, (_, i) => c.steps instanceof Array && !!c.steps[i])
        : base.chords.steps,
      volume: num(c.volume, 0, 1, base.chords.volume),
    };
  }
  if (isObj(data.bass)) {
    const raw = Array.isArray(data.bass.steps) ? data.bass.steps : [];
    p.bass = {
      enabled: data.bass.enabled !== false,
      sound: oneOf(data.bass.sound, BASS_SOUNDS, 'round'),
      // older saves stored booleans (true = root)
      steps: Array.from({ length: MAX_STEPS }, (_, i) => {
        const v = raw[i];
        return v === true ? 1 : v === 1 || v === 2 || v === 3 ? v : 0;
      }) as BassStep[],
      volume: num(data.bass.volume, 0, 1, base.bass.volume),
    };
  }
  if (isObj(data.melody)) {
    const m = data.melody;
    const notes = Array.isArray(m.notes) ? m.notes.slice(0, 512) : [];
    p.melody = {
      sound: oneOf(m.sound, MELODY_SOUNDS, 'musicbox'),
      octave: Math.round(num(m.octave, 3, 5, 4)),
      // notes outside the grid are dropped rather than squashed onto its edge
      notes: notes
        .filter(isObj)
        .filter((n) => isInt(n.s, 0, MAX_STEPS - 1) && isInt(n.d, 0, MELODY_ROWS - 1))
        .map((n) => ({ s: n.s as number, d: n.d as number, l: Math.round(num(n.l, 1, MAX_STEPS, 1)) })),
      volume: num(m.volume, 0, 1, base.melody.volume),
      mute: m.mute === true,
    };
  }
  if (isObj(data.fx)) {
    const f = data.fx;
    p.fx = {
      lofi: num(f.lofi, 0, 1, base.fx.lofi),
      crackle: num(f.crackle, 0, 1, base.fx.crackle),
      wobble: num(f.wobble, 0, 1, base.fx.wobble),
      muffle: num(f.muffle, 0, 1, base.fx.muffle),
      crunch: num(f.crunch, 0, 1, base.fx.crunch),
      space: num(f.space, 0, 1, base.fx.space),
    };
  }
  return p;
}
