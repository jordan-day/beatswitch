import { create } from 'zustand';
import { PROGRESSIONS, progressionChords, transposeSlot } from '../music/chords';
import { generateMelody } from '../music/melody';
import { resolveTone } from '../music/tone';
import { buildPreset } from '../music/presets';
import { extendMelody, extendSteps, lofiMacro, randomDrums, rhythmToSteps } from '../music/patterns';
import { saveProject } from '../storage/local';
import { parseProject } from './schema';
import { applyPatterns, emptyHits, extractPatterns, MAX_REPEATS, newId, nextSectionName, noMutes, type Part } from './song';
import { drumTrack, isDrumRow, MAIN_MELODY, melodyTrack } from './tracks';
import {
  CHORD_COUNTS,
  MAX_EXTRA_DRUMS,
  MAX_EXTRA_MELODIES,
  MAX_STEPS,
  MELODY_ROWS,
  MAX_SAMPLE_SECONDS,
  MELODY_SOUNDS,
  type BassStep,
  type ChordRhythm,
  type ChordSlot,
  type DrumRow,
  type FxSettings,
  type MelodyNote,
  type MelodyTone,
  type Mood,
  type Project,
  type Step,
} from './types';

const AUTOSAVE_KEY = 'beatswitch:autosave';
const BEAT_ID_KEY = 'beatswitch:beat-id';
const HISTORY_LIMIT = 100;

interface ProjectStore {
  project: Project;
  /** Which entry of the beats library the current beat is autosaved to. */
  beatId: string;
  past: Project[];
  future: Project[];
  /** Apply an edit. Edits with the same `coalesceKey` within 600ms merge into one undo step (for sliders). */
  update: (fn: (p: Project) => void, coalesceKey?: string) => void;
  /** Replace the current beat. Pass `id` when opening a beat from the library; otherwise it becomes a new beat. */
  load: (p: Project, id?: string) => void;
  undo: () => void;
  redo: () => void;

  /** Cycle a drum hit. `row` is a built-in row name or an added row's id. */
  toggleStep: (row: string, index: number) => void;
  toggleBass: (index: number) => void;
  toggleChordStep: (index: number) => void;
  /** Clear a row in every bar: a drum row (name or added row id), the bass, the chord hits, or the first melody. */
  clearRow: (row: string) => void;
  setSlot: (i: number, slot: ChordSlot | null) => void;
  setChordCount: (n: 4 | 8) => void;
  setRhythm: (r: ChordRhythm) => void;
  setKeyMood: (tonic: string, mood: Mood) => void;
  /** Melody notes; `melody` is MAIN_MELODY (the default) or an added melody's id. */
  addNote: (n: MelodyNote, melody?: string) => void;
  resizeNote: (s: number, d: number, l: number, melody?: string) => void;
  removeNote: (s: number, d: number, melody?: string) => void;
  /** Move a note to a new start step and pitch row (kept inside the loop; refused if it would land on another note). */
  moveNote: (s: number, d: number, ns: number, nd: number, melody?: string) => void;
  /** Move several notes together by `ds` steps and `dd` pitch rows. All or nothing: refused if any would leave the grid or land on another note. */
  moveNotes: (keys: { s: number; d: number }[], ds: number, dd: number, melody?: string) => void;
  removeNotes: (keys: { s: number; d: number }[], melody?: string) => void;
  /** Make every bar of a melody a copy of bar `bar` (notes are cut at the bar's edges). */
  copyMelodyBarToAll: (bar: number, melody?: string) => void;
  /** Add notes (e.g. pasted ones), replacing any they overlap on the same row. */
  pasteNotes: (notes: MelodyNote[], melody?: string) => void;
  /** Shape a melody's instrument (soft start, fade out, vibrato, brightness). `null` goes back to the instrument's own sound. */
  setMelodyTone: (tone: Partial<MelodyTone> | null, melody?: string) => void;
  /** Cut a note in two at step `at` (it must fall inside the note, after its first step). */
  splitNote: (s: number, d: number, at: number, melody?: string) => void;
  clearMelody: (melody: string) => void;
  /** Add a drum row to the pad; returns its id ('' when the pad is full). */
  addDrum: () => string;
  removeDrum: (id: string) => void;
  /** Add a melody with its own instrument; returns its id ('' when there are already as many as allowed). */
  addMelody: () => string;
  removeMelody: (id: string) => void;
  /** Use an imported file (lasting `seconds`) as the song's sample, or swap the file of the one there is. */
  setSample: (file: { id: string; name: string }, seconds: number) => void;
  /**
   * A file dropped on the page: make it the sample (unless it already is) and add a hit at `step`
   * of the section being edited. A brand-new sample gets only that hit.
   */
  placeSample: (file: { id: string; name: string }, seconds: number, step: number) => void;
  removeSample: () => void;
  toggleSampleStep: (index: number) => void;
  /** The part of the file that plays: from `start`, for `length` seconds. */
  setSampleTrim: (start: number, length: number) => void;
  randomize: () => void;
  /** Replace a melody's notes with a new one that fits the key and chords. */
  randomizeMelody: (melody: string) => void;
  setBars: (bars: 1 | 2 | 4) => void;
  setLofi: (v: number) => void;
  setFx: (key: keyof Omit<FxSettings, 'lofi'>, v: number) => void;

  // song: sections + arrangement
  switchSection: (id: string) => void;
  /** Show another section while the song plays: like switchSection, but it is not an edit (no undo step, nothing to save). */
  followSection: (id: string) => void;
  addSection: () => void;
  duplicateSection: (id: string) => void;
  renameSection: (id: string, name: string) => void;
  deleteSection: (id: string) => void;
  /** Add a section to the song, at the end or before block `at`. */
  addBlock: (sectionId: string, at?: number) => void;
  removeBlock: (index: number) => void;
  moveBlock: (index: number, by: -1 | 1) => void;
  /** Move block `from` so it lands before the block currently at `to` (`to` = song length: the end). */
  moveBlockTo: (from: number, to: number) => void;
  duplicateBlock: (index: number) => void;
  setRepeats: (index: number, repeats: number) => void;
  toggleBlockMute: (index: number, part: Part) => void;
  toggleFill: (index: number) => void;
  setFade: (which: 'fadeIn' | 'fadeOut', on: boolean) => void;
}

/** Make `id` the section being edited: park the current patterns, bring in the target's. */
function switchTo(p: Project, id: string) {
  if (id === p.activeSection) return;
  const target = p.sections.find((s) => s.id === id);
  const current = p.sections.find((s) => s.id === p.activeSection);
  if (!target?.patterns || !current) return;
  current.patterns = extractPatterns(p);
  applyPatterns(p, target.patterns);
  delete target.patterns;
  p.activeSection = id;
}

/**
 * Make `file` the song's sample (in place). A new sample starts with a hit at `firstHit` (none if
 * null); a different file for an existing sample keeps its hits, pitch and volume and starts the
 * trim afresh; the same file again changes nothing.
 */
function applySampleFile(p: Project, file: { id: string; name: string }, seconds: number, firstHit: number | null) {
  const length = Math.max(0.05, Math.min(seconds, MAX_SAMPLE_SECONDS));
  if (p.sample) {
    if (p.sample.id !== file.id) Object.assign(p.sample, { id: file.id, name: file.name, start: 0, length });
    return;
  }
  p.sample = { id: file.id, name: file.name, start: 0, length, pitch: 0, volume: 0.8, mute: false, steps: emptyHits() };
  if (firstHit !== null) p.sample.steps[firstHit] = true;
  for (const s of p.sections) delete s.patterns?.sample;
}

let lastCoalesce = { key: '', at: 0 };

function initialBeatId(): string {
  try {
    const id = localStorage.getItem(BEAT_ID_KEY);
    if (id) return id;
  } catch {
    /* storage blocked */
  }
  return crypto.randomUUID();
}

/** True once the current beat has been edited since it was opened, so just opening a beat doesn't add it to the library. */
let edited = false;

/** Which library entry each project snapshot belongs to, so undo/redo across a "new beat" keeps ids straight. */
const ids = new WeakMap<Project, string>();

function initialProject(): Project {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) {
      const p = parseProject(JSON.parse(raw));
      if (p) return p;
    }
  } catch {
    /* ignore broken autosave */
  }
  return buildPreset(0);
}

export const useProject = create<ProjectStore>((set, get) => ({
  project: initialProject(),
  beatId: initialBeatId(),
  past: [],
  future: [],

  update: (fn, coalesceKey) => {
    const { project, past } = get();
    edited = true;
    const next = structuredClone(project);
    fn(next);
    // a click that changes nothing (same mood, same rhythm...) shouldn't add an undo step
    if (JSON.stringify(next) === JSON.stringify(project)) return;
    const now = Date.now();
    const merge = coalesceKey && lastCoalesce.key === coalesceKey && now - lastCoalesce.at < 600;
    lastCoalesce = { key: coalesceKey ?? '', at: now };
    ids.set(next, get().beatId);
    set({
      project: next,
      past: merge ? past : [...past, project].slice(-HISTORY_LIMIT),
      future: [],
    });
  },

  load: (p, id) => {
    const { project, past } = get();
    edited = false;
    const beatId = id ?? crypto.randomUUID();
    ids.set(p, beatId);
    set({ project: p, beatId, past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
  },

  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    edited = true;
    const target = past[past.length - 1];
    set({ project: target, beatId: ids.get(target) ?? get().beatId, past: past.slice(0, -1), future: [project, ...future] });
  },

  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    edited = true;
    const target = future[0];
    set({ project: target, beatId: ids.get(target) ?? get().beatId, past: [...past, project], future: future.slice(1) });
  },

  toggleStep: (row, i) =>
    get().update((p) => {
      // off -> on -> accent -> off
      const t = drumTrack(p, row);
      if (t) t.steps[i] = ((t.steps[i] + 1) % 3) as Step;
    }),

  // off -> root -> fifth -> octave -> off
  toggleBass: (i) => get().update((p) => void (p.bass.steps[i] = ((p.bass.steps[i] + 1) % 4) as BassStep)),

  toggleChordStep: (i) => get().update((p) => void (p.chords.steps[i] = !p.chords.steps[i])),

  // Clears the whole row, including bars hidden by a shorter loop, so nothing comes back later.
  clearRow: (row) =>
    get().update((p) => {
      if (row === 'melody') p.melody.notes = [];
      else if (row === 'bass') p.bass.steps = p.bass.steps.map(() => 0);
      else if (row === 'chords') p.chords.steps = p.chords.steps.map(() => false);
      else {
        const t = drumTrack(p, row);
        if (t) t.steps = t.steps.map(() => 0);
      }
    }),

  randomize: () =>
    get().update((p) => {
      const r = randomDrums();
      for (const row of Object.keys(r) as DrumRow[]) p.drums[row].steps = r[row];
      // bass follows the kick, mostly roots with the odd fifth
      p.bass.steps = r.kick.map((s, i) => (s ? (i % 16 >= 8 && Math.random() < 0.4 ? 2 : 1) : 0));
    }),

  randomizeMelody: (melody) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      if (m) m.notes = generateMelody(p);
    }),

  setBars: (bars) =>
    bars !== get().project.bars &&
    get().update((p) => {
      const old = p.bars;
      for (const row of Object.keys(p.drums) as DrumRow[]) {
        p.drums[row].steps = extendSteps(p.drums[row].steps, old, bars);
      }
      for (const d of p.extraDrums) d.steps = extendSteps(d.steps, old, bars);
      for (const m of p.extraMelodies) m.notes = extendMelody(m.notes, old, bars);
      p.bass.steps = extendSteps(p.bass.steps, old, bars);
      p.chords.steps = extendSteps(p.chords.steps, old, bars);
      p.melody.notes = extendMelody(p.melody.notes, old, bars);
      p.bars = bars;
    }),

  setSlot: (i, slot) => get().update((p) => void (p.chords.slots[i] = slot)),

  setChordCount: (n) =>
    get().update((p) => {
      const cur = p.chords.slots;
      if (cur.length === n) return;
      if (n < cur.length) {
        // 8 -> 4: keep every other chord, and remember all 8 so switching back loses nothing
        p.chords.hidden8 = structuredClone(cur);
        p.chords.slots = cur.filter((_, i) => i % 2 === 0);
        return;
      }
      // 4 -> 8: bring the earlier 8 back if the 4 shown are still the ones they left;
      // otherwise play each chord twice (sounds the same as before)
      const saved = p.chords.hidden8;
      const unchanged = saved?.length === 8 && saved.filter((_, i) => i % 2 === 0).every((s, i) => JSON.stringify(s) === JSON.stringify(cur[i]));
      p.chords.slots = unchanged ? saved! : cur.flatMap((s) => [s, s && structuredClone(s)]);
      delete p.chords.hidden8;
    }),

  setRhythm: (r) =>
    get().update((p) => {
      if (r === 'custom' && p.chords.rhythm !== 'custom') {
        // Keep a pattern you drew before. Only when there's nothing of your own yet (empty, or one of
        // the ready-made rhythms) start from whatever the current rhythm sounds like.
        // "Ready-made" means for any chord count and loop length, not just the current ones: the
        // stored hits are left as they were when those changed (4 -> 8 chords), and a leftover
        // 4-chord pattern would otherwise be kept as if drawn, silencing every other chord.
        const pattern = JSON.stringify(p.chords.steps);
        const untouched =
          !p.chords.steps.some(Boolean) ||
          (['whole', 'half', 'stab'] as const).some((rh) =>
            CHORD_COUNTS.some((n) => ([1, 2, 4] as const).some((bars) => JSON.stringify(rhythmToSteps(rh, bars, n)) === pattern)),
          );
        if (untouched) p.chords.steps = rhythmToSteps(p.chords.rhythm, p.bars, p.chords.slots.length);
      }
      p.chords.rhythm = r;
    }),

  setKeyMood: (tonic, mood) =>
    get().update((p) => {
      const key = (s: (ChordSlot | null)[]) => s.map((x) => (x ? x.symbol + (x.notes ? '*' : '') : '-')).join();
      // a ready-made progression fills 4 chords, or 8 with each played twice
      const per = p.chords.slots.length / 4;
      const asSlots = (chords: string[]) => chords.flatMap((symbol) => Array.from({ length: per }, () => ({ symbol })));
      const cur = key(p.chords.slots);
      const idx = PROGRESSIONS[p.mood].findIndex((pr) => key(asSlots(progressionChords(p.tonic, pr))) === cur);
      if (idx >= 0) {
        // still one of the ready-made progressions: swap to the same one in the new key/mood
        p.chords.slots = asSlots(progressionChords(tonic, PROGRESSIONS[mood][idx]));
      } else if (tonic !== p.tonic) {
        // hand-made chords: move them to the new key
        p.chords.slots = p.chords.slots.map((s) => s && transposeSlot(s, p.tonic, tonic));
      }
      p.tonic = tonic;
      p.mood = mood;
    }),

  addNote: (n, melody = MAIN_MELODY) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      if (!m) return;
      // a new note replaces anything it overlaps on the same row
      m.notes = m.notes.filter((x) => x.d !== n.d || x.s + x.l <= n.s || x.s >= n.s + n.l);
      m.notes.push(n);
    }),

  resizeNote: (s, d, l, melody = MAIN_MELODY) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      const note = m?.notes.find((x) => x.s === s && x.d === d);
      if (!m || !note) return;
      note.l = Math.max(1, Math.min(l, p.bars * 16 - s));
      m.notes = m.notes.filter((x) => x === note || x.d !== d || x.s < s || x.s >= s + note.l);
    }, `melody-resize:${melody}:${s}:${d}`),

  moveNote: (s, d, ns, nd, melody = MAIN_MELODY) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      const note = m?.notes.find((x) => x.s === s && x.d === d);
      if (!m || !note) return;
      const s2 = Math.max(0, Math.min(ns, p.bars * 16 - note.l));
      const d2 = Math.max(0, Math.min(nd, MELODY_ROWS - 1));
      if (m.notes.some((x) => x !== note && x.d === d2 && x.s < s2 + note.l && x.s + x.l > s2)) return;
      note.s = s2;
      if (d2 !== note.d) delete note.x;
      note.d = d2;
    }, `melody-move:${melody}`),

  moveNotes: (keys, ds, dd, melody = MAIN_MELODY) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      if (!m) return;
      const is = (n: MelodyNote) => keys.some((k) => k.s === n.s && k.d === n.d);
      const moving = m.notes.filter(is);
      const total = p.bars * 16;
      const ok = moving.every((n) => {
        const s2 = n.s + ds;
        const d2 = n.d + dd;
        return (
          s2 >= 0 &&
          s2 + n.l <= total &&
          d2 >= 0 &&
          d2 < MELODY_ROWS &&
          !m.notes.some((x) => !is(x) && x.d === d2 && x.s < s2 + n.l && x.s + x.l > s2)
        );
      });
      if (!ok) return;
      for (const n of moving) {
        n.s += ds;
        n.d += dd;
        if (dd) delete n.x; // an accidental belongs to its scale degree
      }
    }, `melody-move:${melody}`),

  copyMelodyBarToAll: (bar, melody = MAIN_MELODY) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      if (!m) return;
      const from = bar * 16;
      const to = from + 16;
      const src = m.notes
        .filter((n) => n.s < to && n.s + n.l > from)
        .map((n) => ({ s: Math.max(n.s, from) - from, l: Math.min(n.s + n.l, to) - Math.max(n.s, from), d: n.d, ...(n.x ? { x: n.x } : {}) }));
      m.notes = Array.from({ length: p.bars }, (_, b) => src.map((n) => ({ ...n, s: n.s + b * 16 }))).flat();
    }),

  removeNotes: (keys, melody = MAIN_MELODY) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      if (m) m.notes = m.notes.filter((n) => !keys.some((k) => k.s === n.s && k.d === n.d));
    }),

  pasteNotes: (notes, melody = MAIN_MELODY) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      if (!m) return;
      for (const n of notes) m.notes = m.notes.filter((x) => x.d !== n.d || x.s + x.l <= n.s || x.s >= n.s + n.l);
      m.notes.push(...notes.map((n) => ({ ...n })));
    }),

  setMelodyTone: (tone, melody = MAIN_MELODY) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      if (!m) return;
      if (tone === null) delete m.tone;
      else m.tone = { ...resolveTone(m.sound, m.tone), ...tone };
    }, `melody-tone:${melody}`),

  splitNote: (s, d, at, melody = MAIN_MELODY) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      const note = m?.notes.find((x) => x.s === s && x.d === d);
      if (!m || !note || at <= note.s || at >= note.s + note.l) return;
      m.notes.push({ s: at, l: note.s + note.l - at, d, ...(note.x ? { x: note.x } : {}) });
      note.l = at - note.s;
    }),

  removeNote: (s, d, melody = MAIN_MELODY) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      if (m) m.notes = m.notes.filter((x) => !(x.s === s && x.d === d));
    }),

  clearMelody: (melody) =>
    get().update((p) => {
      const m = melodyTrack(p, melody);
      if (m) m.notes = [];
    }),

  addDrum: () => {
    if (get().project.extraDrums.length >= MAX_EXTRA_DRUMS) return '';
    const id = newId();
    get().update((p) => {
      // starts as a recorded shaker: a sound none of the built-in rows use
      p.extraDrums.push({ id, voice: 'perc', sound: { kind: 'synth', id: 'shaker' }, steps: Array.from({ length: MAX_STEPS }, () => 0 as Step), volume: 0.6, mute: false });
    });
    return id;
  },

  removeDrum: (id) =>
    get().update((p) => {
      if (isDrumRow(id)) return; // the built-in rows stay
      p.extraDrums = p.extraDrums.filter((d) => d.id !== id);
      for (const s of p.sections) delete s.patterns?.extraDrums?.[id];
    }),

  addMelody: () => {
    if (get().project.extraMelodies.length >= MAX_EXTRA_MELODIES) return '';
    const id = newId();
    get().update((p) => {
      // a different instrument from the melodies already there, so the new line stands out
      const used = new Set([p.melody.sound, ...p.extraMelodies.map((m) => m.sound)]);
      const sound = MELODY_SOUNDS.find((s) => !used.has(s)) ?? MELODY_SOUNDS[0];
      p.extraMelodies.push({ id, sound, octave: p.melody.octave, notes: [], volume: 0.6, mute: false });
    });
    return id;
  },

  removeMelody: (id) =>
    get().update((p) => {
      p.extraMelodies = p.extraMelodies.filter((m) => m.id !== id);
      for (const s of p.sections) delete s.patterns?.extraMelodies?.[id];
    }),

  setSample: (file, seconds) => get().update((p) => applySampleFile(p, file, seconds, 0)),

  placeSample: (file, seconds, step) =>
    get().update((p) => {
      applySampleFile(p, file, seconds, null);
      p.sample!.steps[Math.max(0, Math.min(step, p.sample!.steps.length - 1))] = true;
    }),

  removeSample: () =>
    get().update((p) => {
      p.sample = null;
      for (const s of p.sections) delete s.patterns?.sample;
      for (const b of p.song) b.mute.sample = false;
    }),

  toggleSampleStep: (i) =>
    get().update((p) => {
      if (p.sample) p.sample.steps[i] = !p.sample.steps[i];
    }),

  setSampleTrim: (start, length) =>
    get().update((p) => {
      if (!p.sample) return;
      p.sample.start = Math.max(0, start);
      p.sample.length = Math.max(0.05, Math.min(length, MAX_SAMPLE_SECONDS));
    }, 'sample-trim'),

  setLofi: (v) =>
    get().update((p) => {
      p.fx = { lofi: v, ...lofiMacro(v) };
    }, 'lofi'),

  setFx: (key, v) => get().update((p) => void (p.fx[key] = v), 'fx:' + key),

  switchSection: (id) => get().update((p) => switchTo(p, id)),

  followSection: (id) => {
    const { project, beatId } = get();
    if (project.activeSection === id) return;
    const next = structuredClone(project);
    switchTo(next, id);
    if (next.activeSection !== id) return;
    ids.set(next, beatId);
    set({ project: next });
  },

  // a new section starts as a copy of the one you're on, is added to the end of the song, and opens
  addSection: () =>
    get().update((p) => {
      const id = newId();
      p.sections.push({ id, name: nextSectionName(p), patterns: extractPatterns(p) });
      p.song.push({ id: newId(), section: id, repeats: 2, mute: noMutes(), fill: false });
      switchTo(p, id);
    }),

  duplicateSection: (id) =>
    get().update((p) => {
      const src = p.sections.find((s) => s.id === id);
      if (!src) return;
      const patterns = id === p.activeSection ? extractPatterns(p) : structuredClone(src.patterns!);
      const copy = { id: newId(), name: `${src.name} 2`.slice(0, 24), patterns };
      p.sections.splice(p.sections.indexOf(src) + 1, 0, copy);
    }),

  renameSection: (id, name) =>
    get().update((p) => {
      const s = p.sections.find((x) => x.id === id);
      if (s) s.name = name.slice(0, 24) || s.name;
    }, 'rename:' + id),

  deleteSection: (id) =>
    get().update((p) => {
      if (p.sections.length <= 1) return; // a song always has at least one section
      if (id === p.activeSection) switchTo(p, p.sections.find((s) => s.id !== id)!.id);
      p.sections = p.sections.filter((s) => s.id !== id);
      p.song = p.song.filter((b) => b.section !== id);
    }),

  addBlock: (sectionId, at) =>
    get().update((p) => {
      if (!p.sections.some((s) => s.id === sectionId)) return;
      const block = { id: newId(), section: sectionId, repeats: 1, mute: noMutes(), fill: false };
      p.song.splice(at === undefined ? p.song.length : Math.max(0, Math.min(at, p.song.length)), 0, block);
    }),

  removeBlock: (i) => get().update((p) => void p.song.splice(i, 1)),

  moveBlock: (i, by) =>
    get().update((p) => {
      const j = i + by;
      if (j < 0 || j >= p.song.length) return;
      [p.song[i], p.song[j]] = [p.song[j], p.song[i]];
    }),

  duplicateBlock: (i) =>
    get().update((p) => {
      const b = p.song[i];
      if (b) p.song.splice(i + 1, 0, { ...b, id: newId(), mute: { ...b.mute } });
    }),

  moveBlockTo: (from, to) =>
    get().update((p) => {
      if (from < 0 || from >= p.song.length) return;
      const dest = Math.max(0, Math.min(to, p.song.length));
      if (dest === from || dest === from + 1) return; // dropped where it already is
      const [block] = p.song.splice(from, 1);
      p.song.splice(dest > from ? dest - 1 : dest, 0, block);
    }),

  setRepeats: (i, n) => get().update((p) => void (p.song[i] && (p.song[i].repeats = Math.max(1, Math.min(MAX_REPEATS, n))))),

  toggleBlockMute: (i, part) => get().update((p) => void (p.song[i] && (p.song[i].mute[part] = !p.song[i].mute[part]))),

  toggleFill: (i) => get().update((p) => void (p.song[i] && (p.song[i].fill = !p.song[i].fill))),

  setFade: (which, on) => get().update((p) => void (p[which] = on)),
}));

ids.set(useProject.getState().project, useProject.getState().beatId);

// Autosave (debounced): the current beat to localStorage (instant restore), and, once edited, into the beats library.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useProject.subscribe((s, prev) => {
  if (s.project === prev.project || typeof localStorage === 'undefined') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(s.project));
      localStorage.setItem(BEAT_ID_KEY, s.beatId);
    } catch {
      /* storage full or blocked */
    }
    if (edited) saveProject(s.project, s.beatId).catch(() => undefined);
  }, 400);
});

export type Track = 'beat' | 'chords' | 'melody' | 'sample';

/** Small UI-only state that shouldn't go into undo history or saves. */
interface UiStore {
  /** The page: there is one now (section chips, song timeline, overview and editors). */
  view: 'editor';
  /** A section chip or song block being dragged (the Song row previews where it will land). */
  dragging: { kind: 'section'; id: string } | { kind: 'block'; index: number } | null;
  playing: boolean;
  /** Play loops the section being edited, or plays the whole arrangement once. */
  playMode: 'section' | 'song';
  /** When looping the section: loop only the selected bar (viewBar) instead of every bar. */
  loopBar: boolean;
  step: number; // playhead step in the section being edited, -1 when it isn't the one playing
  songStep: number; // playhead step in the whole song (song mode), -1 otherwise
  songCursor: number; // where the song starts when you press Play (set by clicking the song timeline)
  viewBar: number; // which bar the grid shows
  selectedSlot: number; // chord being edited
  melodyId: string; // melody being edited (MAIN_MELODY or an added melody's id)
  track: Track; // which editor is open
  helpOpen: boolean;
  toast: { id: number; text: string; action?: { label: string; run: () => void } } | null;
  set: (s: Partial<Omit<UiStore, 'set' | 'notify'>>) => void;
  notify: (text: string, action?: { label: string; run: () => void }) => void;
}

export const useUi = create<UiStore>((set) => ({
  view: 'editor',
  dragging: null,
  playing: false,
  playMode: 'section',
  loopBar: false,
  step: -1,
  songStep: -1,
  songCursor: 0,
  viewBar: 0,
  selectedSlot: 0,
  melodyId: MAIN_MELODY,
  track: 'beat',
  helpOpen: false,
  toast: null,
  // The bar you're looking at and the chord you're editing always agree: picking a bar selects its
  // first chord, and picking a chord moves to its bar (so the editors never show different bars).
  set: (patch) =>
    set(() => {
      const next = { ...patch };
      const p = useProject.getState().project;
      const count = p.chords.slots.length;
      const per = Math.max(1, count / p.bars);
      if ('viewBar' in patch && !('selectedSlot' in patch)) {
        const bar = Math.max(0, Math.min(patch.viewBar ?? 0, p.bars - 1));
        next.viewBar = bar;
        if (Math.floor(useUi.getState().selectedSlot / per) !== bar) next.selectedSlot = Math.min(count - 1, bar * per);
      } else if ('selectedSlot' in patch && !('viewBar' in patch)) {
        const slot = Math.max(0, Math.min(patch.selectedSlot ?? 0, count - 1));
        next.selectedSlot = slot;
        next.viewBar = Math.floor(slot / per);
      }
      return next;
    }),
  notify: (text, action) => set({ toast: { id: Date.now(), text, action } }),
}));

/**
 * Run a big or destructive edit (clear, randomize, load...) and offer a one-click Undo for it.
 * The Undo only applies while that edit is still the latest one, so it never undoes something else.
 */
export function withUndo(message: string, edit: () => void) {
  const projectBefore = useProject.getState().project;
  edit();
  const { past, project } = useProject.getState();
  if (project === projectBefore) return; // nothing changed, nothing to undo
  const depth = past.length;
  useUi.getState().notify(message, {
    label: 'Undo',
    run: () => {
      if (useProject.getState().past.length === depth) {
        useProject.getState().undo();
        useUi.getState().notify('Undone ↶');
      } else useUi.getState().notify('Other changes came after it. Use Ctrl+Z to step back.');
    },
  });
}

// Keep the bar/chord selection valid when the beat itself changes shape: a different loop length or
// chord count re-maps chords to bars, and switching section starts back at its first bar.
useProject.subscribe((s, prev) => {
  const a = s.project;
  const b = prev.project;
  if (a.activeSection !== b.activeSection) useUi.getState().set({ viewBar: 0 });
  else if (a.bars !== b.bars || a.chords.slots.length !== b.chords.slots.length) useUi.getState().set({ viewBar: useUi.getState().viewBar });
});
