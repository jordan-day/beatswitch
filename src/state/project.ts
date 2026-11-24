import { create } from 'zustand';
import { PROGRESSIONS, progressionChords, transposeSlot } from '../music/chords';
import { buildPreset } from '../music/presets';
import { extendMelody, extendSteps, lofiMacro, randomDrums, rhythmToSteps } from '../music/patterns';
import { parseProject } from './schema';
import type { BassStep, ChordRhythm, ChordSlot, DrumRow, FxSettings, MelodyNote, Mood, Project, Step } from './types';

const AUTOSAVE_KEY = 'beatswitch:autosave';
const HISTORY_LIMIT = 100;

interface ProjectStore {
  project: Project;
  past: Project[];
  future: Project[];
  /** Apply an edit. Edits with the same `coalesceKey` within 600ms merge into one undo step (for sliders). */
  update: (fn: (p: Project) => void, coalesceKey?: string) => void;
  load: (p: Project) => void;
  undo: () => void;
  redo: () => void;

  toggleStep: (row: DrumRow, index: number) => void;
  toggleBass: (index: number) => void;
  toggleChordStep: (index: number) => void;
  clearRow: (row: DrumRow | 'bass' | 'chords' | 'melody') => void;
  setSlot: (i: number, slot: ChordSlot | null) => void;
  setChordCount: (n: 4 | 8) => void;
  setRhythm: (r: ChordRhythm) => void;
  setKeyMood: (tonic: string, mood: Mood) => void;
  addNote: (n: MelodyNote) => void;
  resizeNote: (s: number, d: number, l: number) => void;
  removeNote: (s: number, d: number) => void;
  randomize: () => void;
  setBars: (bars: 1 | 2 | 4) => void;
  setLofi: (v: number) => void;
  setFx: (key: keyof Omit<FxSettings, 'lofi'>, v: number) => void;
}

let lastCoalesce = { key: '', at: 0 };

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
  past: [],
  future: [],

  update: (fn, coalesceKey) => {
    const { project, past } = get();
    const next = structuredClone(project);
    fn(next);
    const now = Date.now();
    const merge = coalesceKey && lastCoalesce.key === coalesceKey && now - lastCoalesce.at < 600;
    lastCoalesce = { key: coalesceKey ?? '', at: now };
    set({
      project: next,
      past: merge ? past : [...past, project].slice(-HISTORY_LIMIT),
      future: [],
    });
  },

  load: (p) => {
    const { project, past } = get();
    set({ project: p, past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
  },

  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
  },

  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1) });
  },

  toggleStep: (row, i) =>
    get().update((p) => {
      // off -> on -> accent -> off
      const cur = p.drums[row].steps[i];
      p.drums[row].steps[i] = ((cur + 1) % 3) as Step;
    }),

  // off -> root -> fifth -> octave -> off
  toggleBass: (i) => get().update((p) => void (p.bass.steps[i] = ((p.bass.steps[i] + 1) % 4) as BassStep)),

  toggleChordStep: (i) => get().update((p) => void (p.chords.steps[i] = !p.chords.steps[i])),

  clearRow: (row) =>
    get().update((p) => {
      const n = p.bars * 16;
      if (row === 'melody') p.melody.notes = p.melody.notes.filter((x) => x.s >= n);
      else if (row === 'bass') for (let i = 0; i < n; i++) p.bass.steps[i] = 0;
      else if (row === 'chords') for (let i = 0; i < n; i++) p.chords.steps[i] = false;
      else for (let i = 0; i < n; i++) p.drums[row].steps[i] = 0;
    }),

  randomize: () =>
    get().update((p) => {
      const r = randomDrums();
      for (const row of Object.keys(r) as DrumRow[]) p.drums[row].steps = r[row];
      // bass follows the kick, mostly roots with the odd fifth
      p.bass.steps = r.kick.map((s, i) => (s ? (i % 16 >= 8 && Math.random() < 0.4 ? 2 : 1) : 0));
    }),

  setBars: (bars) =>
    get().update((p) => {
      const old = p.bars;
      for (const row of Object.keys(p.drums) as DrumRow[]) {
        p.drums[row].steps = extendSteps(p.drums[row].steps, old, bars);
      }
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
      // 4 -> 8: each chord twice (sounds the same); 8 -> 4: keep every other one
      p.chords.slots = n > cur.length ? cur.flatMap((s) => [s, s && structuredClone(s)]) : cur.filter((_, i) => i % 2 === 0);
    }),

  setRhythm: (r) =>
    get().update((p) => {
      if (r === 'custom' && p.chords.rhythm !== 'custom') {
        // start the custom pattern from whatever the current rhythm sounds like
        p.chords.steps = rhythmToSteps(p.chords.rhythm, p.bars, p.chords.slots.length);
      }
      p.chords.rhythm = r;
    }),

  setKeyMood: (tonic, mood) =>
    get().update((p) => {
      const key = (s: (ChordSlot | null)[]) => s.map((x) => (x ? x.symbol + (x.notes ? '*' : '') : '-')).join();
      const cur = key(p.chords.slots);
      const idx = PROGRESSIONS[p.mood].findIndex((pr) => key(progressionChords(p.tonic, pr).map((symbol) => ({ symbol }))) === cur);
      if (idx >= 0 && p.chords.slots.length === 4) {
        // still one of the ready-made progressions: swap to the same one in the new key/mood
        p.chords.slots = progressionChords(tonic, PROGRESSIONS[mood][idx]).map((symbol) => ({ symbol }));
      } else if (tonic !== p.tonic) {
        // hand-made chords: move them to the new key
        p.chords.slots = p.chords.slots.map((s) => s && transposeSlot(s, p.tonic, tonic));
      }
      p.tonic = tonic;
      p.mood = mood;
    }),

  addNote: (n) =>
    get().update((p) => {
      // a new note replaces anything it overlaps on the same row
      p.melody.notes = p.melody.notes.filter((x) => x.d !== n.d || x.s + x.l <= n.s || x.s >= n.s + n.l);
      p.melody.notes.push(n);
    }),

  resizeNote: (s, d, l) =>
    get().update((p) => {
      const note = p.melody.notes.find((x) => x.s === s && x.d === d);
      if (!note) return;
      note.l = Math.max(1, Math.min(l, p.bars * 16 - s));
      p.melody.notes = p.melody.notes.filter((x) => x === note || x.d !== d || x.s < s || x.s >= s + note.l);
    }, `melody-resize:${s}:${d}`),

  removeNote: (s, d) => get().update((p) => void (p.melody.notes = p.melody.notes.filter((x) => !(x.s === s && x.d === d)))),

  setLofi: (v) =>
    get().update((p) => {
      p.fx = { lofi: v, ...lofiMacro(v) };
    }, 'lofi'),

  setFx: (key, v) => get().update((p) => void (p.fx[key] = v), 'fx:' + key),
}));

// Autosave (debounced) to localStorage.
let saveTimer: number | undefined;
useProject.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(s.project));
    } catch {
      /* storage full or blocked */
    }
  }, 400);
});

export type Track = 'beat' | 'chords' | 'melody';

/** Small UI-only state that shouldn't go into undo history or saves. */
interface UiStore {
  playing: boolean;
  step: number; // current playhead step, -1 when stopped
  viewBar: number; // which bar the grid shows
  selectedSlot: number; // chord being edited
  track: Track; // which editor is open
  helpOpen: boolean;
  toast: { id: number; text: string } | null;
  set: (s: Partial<Omit<UiStore, 'set' | 'notify'>>) => void;
  notify: (text: string) => void;
}

export const useUi = create<UiStore>((set) => ({
  playing: false,
  step: -1,
  viewBar: 0,
  selectedSlot: 0,
  track: 'beat',
  helpOpen: false,
  toast: null,
  set: (s) => set(s),
  notify: (text) => set({ toast: { id: Date.now(), text } }),
}));
