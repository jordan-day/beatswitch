import { emptyProject } from '../music/presets';
import {
  BASS_SOUNDS,
  BPM_MAX,
  BPM_MIN,
  DRUM_ROWS,
  KEYS_SOUNDS,
  MAX_EXTRA_DRUMS,
  MAX_EXTRA_MELODIES,
  MAX_STEPS,
  MELODY_ROWS,
  MELODY_SOUNDS,
  MOODS,
  SYNTH_KITS,
  type BassStep,
  type ChordSlot,
  type ExtraDrum,
  type ExtraMelody,
  type MelodyNote,
  type MelodyTone,
  type MelodyTrack,
  type Project,
  type SoundRef,
  type Step,
} from './types';
import { TONICS } from '../music/chords';
import { extractPatterns, MAX_REPEATS, newId, PARTS, type Part, type Section, type SectionPatterns } from './song';

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

/** Melody notes; notes outside the grid are dropped rather than squashed onto its edge. */
function melodyNotes(v: unknown): MelodyNote[] {
  const notes = Array.isArray(v) ? v.slice(0, 512) : [];
  return notes
    .filter(isObj)
    .filter((n) => isInt(n.s, 0, MAX_STEPS - 1) && isInt(n.d, 0, MELODY_ROWS - 1))
    .map((n) => ({
      s: n.s as number,
      d: n.d as number,
      l: Math.round(num(n.l, 1, MAX_STEPS, 1)),
      ...(n.x === 1 || n.x === -1 ? { x: n.x as 1 | -1 } : {}),
    }));
}

/** Instrument shaping: all four sliders, each clamped to 0..1, or nothing. */
function melodyTone(v: unknown): MelodyTone | undefined {
  if (!isObj(v)) return undefined;
  const t = { soft: num(v.soft, 0, 1, -1), fade: num(v.fade, 0, 1, -1), vibrato: num(v.vibrato, 0, 1, -1), bright: num(v.bright, 0, 1, -1) };
  return Object.values(t).some((x) => x < 0) ? undefined : t;
}

function melodyTrack(m: Record<string, unknown>, base: MelodyTrack): MelodyTrack {
  const tone = melodyTone(m.tone);
  return {
    ...(tone ? { tone } : {}),
    sound: oneOf(m.sound, MELODY_SOUNDS, base.sound),
    octave: Math.round(num(m.octave, 3, 5, 4)),
    notes: melodyNotes(m.notes),
    volume: num(m.volume, 0, 1, base.volume),
    mute: m.mute === true,
  };
}

const ID_RE = /^[a-z0-9]{1,16}$/i;
/** Ids of added tracks: never a built-in row name, so they can't be mistaken for one. */
const trackId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v) && !(DRUM_ROWS as readonly string[]).includes(v) && v !== 'main';

function extraDrums(v: unknown): ExtraDrum[] {
  const out: ExtraDrum[] = [];
  for (const d of Array.isArray(v) ? v : []) {
    if (out.length >= MAX_EXTRA_DRUMS) break;
    if (!isObj(d) || !trackId(d.id) || out.some((x) => x.id === d.id)) continue;
    out.push({
      id: d.id,
      voice: oneOf(d.voice, DRUM_ROWS, 'perc'),
      sound: sound(d.sound),
      steps: steps(d.steps, Array.from({ length: MAX_STEPS }, () => 0 as Step)),
      volume: num(d.volume, 0, 1, 0.6),
      mute: d.mute === true,
    });
  }
  return out;
}

function extraMelodies(v: unknown, base: MelodyTrack): ExtraMelody[] {
  const out: ExtraMelody[] = [];
  for (const m of Array.isArray(v) ? v : []) {
    if (out.length >= MAX_EXTRA_MELODIES) break;
    if (!isObj(m) || !trackId(m.id) || out.some((x) => x.id === m.id)) continue;
    out.push({ id: m.id, ...melodyTrack(m, base) });
  }
  return out;
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
    extraDrums: [],
    extraMelodies: [],
    fx: base.fx,
    sections: base.sections,
    activeSection: base.activeSection,
    song: base.song,
    fadeIn: base.fadeIn,
    fadeOut: base.fadeOut,
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
  if (isObj(data.melody)) p.melody = melodyTrack(data.melody, { ...base.melody, sound: 'musicbox' });
  p.extraDrums = extraDrums(data.extraDrums);
  p.extraMelodies = extraMelodies(data.extraMelodies, base.melody);
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
  parseSong(data, p);
  return p;
}

/** One stored section's patterns, validated by running them through the project parser. */
function parsePatterns(raw: unknown): SectionPatterns | undefined {
  if (!isObj(raw) || !isObj(raw.drums)) return undefined;
  const drums = raw.drums as Record<string, unknown>;
  const asProject = {
    version: 1,
    bars: raw.bars,
    drums: Object.fromEntries(DRUM_ROWS.map((r) => [r, { steps: drums[r] }])),
    bass: { steps: raw.bass },
    chords: raw.chords,
    melody: { notes: raw.melody },
  };
  const parsed = parseProject(asProject);
  if (!parsed) return undefined;
  const out = extractPatterns(parsed);
  // added tracks' hits and notes, by track id (tracks that no longer exist are dropped in parseSong)
  const xd = isObj(raw.extraDrums) ? raw.extraDrums : {};
  const xm = isObj(raw.extraMelodies) ? raw.extraMelodies : {};
  out.extraDrums = Object.fromEntries(
    Object.entries(xd).filter(([id]) => trackId(id)).slice(0, MAX_EXTRA_DRUMS).map(([id, v]) => [id, steps(v, Array.from({ length: MAX_STEPS }, () => 0 as Step))]),
  );
  out.extraMelodies = Object.fromEntries(
    Object.entries(xm).filter(([id]) => trackId(id)).slice(0, MAX_EXTRA_MELODIES).map(([id, v]) => [id, melodyNotes(v)]),
  );
  return out;
}

/**
 * The song arrangement. Projects saved before songs existed (no `sections`) keep the default:
 * their one loop becomes a single section played 4 times.
 */
function parseSong(data: Record<string, unknown>, p: Project) {
  if (!Array.isArray(data.sections) || !data.sections.length) return;
  const sections: Section[] = [];
  for (const s of data.sections.slice(0, 16)) {
    if (!isObj(s) || typeof s.id !== 'string' || !ID_RE.test(s.id) || sections.some((x) => x.id === s.id)) continue;
    const name = typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 24) : 'Section';
    sections.push({ id: s.id, name, patterns: parsePatterns(s.patterns) });
  }
  const active = sections.find((s) => s.id === data.activeSection) ?? sections[0];
  if (!active) return;
  // every section except the active one must carry its own patterns
  const valid = sections.filter((s) => s === active || s.patterns);
  delete active.patterns; // the active section's patterns are the top-level fields
  p.sections = valid;
  p.activeSection = active.id;
  p.song = (Array.isArray(data.song) ? data.song : [])
    .slice(0, 64)
    .filter(isObj)
    .filter((b) => typeof b.section === 'string' && valid.some((s) => s.id === b.section))
    .map((b) => {
      const mute = isObj(b.mute) ? b.mute : {};
      return {
        id: typeof b.id === 'string' && ID_RE.test(b.id) ? b.id : newId(),
        section: b.section as string,
        repeats: Math.round(num(b.repeats, 1, MAX_REPEATS, 1)),
        mute: Object.fromEntries(PARTS.map((part) => [part, mute[part] === true])) as Record<Part, boolean>,
        fill: b.fill === true,
      };
    });
  // keep only the added tracks' patterns for tracks the project still has
  const drumIds = new Set(p.extraDrums.map((d) => d.id));
  const melodyIds = new Set(p.extraMelodies.map((m) => m.id));
  for (const s of valid) {
    if (!s.patterns) continue;
    s.patterns.extraDrums = Object.fromEntries(Object.entries(s.patterns.extraDrums ?? {}).filter(([id]) => drumIds.has(id)));
    s.patterns.extraMelodies = Object.fromEntries(Object.entries(s.patterns.extraMelodies ?? {}).filter(([id]) => melodyIds.has(id)));
  }
  p.fadeIn = data.fadeIn === true;
  p.fadeOut = data.fadeOut !== false;
}
