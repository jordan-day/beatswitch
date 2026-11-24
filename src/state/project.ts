import { create } from 'zustand';
import { PROGRESSIONS, progressionChords, transposeSlot } from '../music/chords';
import { buildPreset } from '../music/presets';
import { extendMelody, extendSteps, lofiMacro, randomDrums, rhythmToSteps } from '../music/patterns';
import { parseProject } from './schema';
import { applyPatterns, extractPatterns, MAX_REPEATS, newId, nextSectionName, noMutes, type Part } from './song';
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

  // song: sections + arrangement
  switchSection: (id: string) => void;
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
    // a click that changes nothing (same mood, same rhythm...) shouldn't add an undo step
    if (JSON.stringify(next) === JSON.stringify(project)) return;
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

  // Clears the whole row, including bars hidden by a shorter loop, so nothing comes back later.
  clearRow: (row) =>
    get().update((p) => {
      if (row === 'melody') p.melody.notes = [];
      else if (row === 'bass') p.bass.steps = p.bass.steps.map(() => 0);
      else if (row === 'chords') p.chords.steps = p.chords.steps.map(() => false);
      else p.drums[row].steps = p.drums[row].steps.map(() => 0);
    }),

  randomize: () =>
    get().update((p) => {
      const r = randomDrums();
      for (const row of Object.keys(r) as DrumRow[]) p.drums[row].steps = r[row];
      // bass follows the kick, mostly roots with the odd fifth
      p.bass.steps = r.kick.map((s, i) => (s ? (i % 16 >= 8 && Math.random() < 0.4 ? 2 : 1) : 0));
    }),

  setBars: (bars) =>
    bars !== get().project.bars &&
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
        const pattern = JSON.stringify(p.chords.steps);
        const untouched =
          !p.chords.steps.some(Boolean) ||
          (['whole', 'half', 'stab'] as const).some(
            (rh) => JSON.stringify(rhythmToSteps(rh, p.bars, p.chords.slots.length)) === pattern,
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

  switchSection: (id) => get().update((p) => switchTo(p, id)),

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

// Autosave (debounced) to localStorage.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useProject.subscribe((s, prev) => {
  if (s.project === prev.project || typeof localStorage === 'undefined') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
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
  /** Editing one section (overview + Beat/Chords/Melody), or arranging the whole song. */
  view: 'section' | 'song';
  playing: boolean;
  /** Play loops the section being edited, or plays the whole arrangement once. */
  playMode: 'section' | 'song';
  /** When looping the section: loop only the selected bar (viewBar) instead of every bar. */
  loopBar: boolean;
  step: number; // playhead step in the section being edited, -1 when it isn't the one playing
  songStep: number; // playhead step in the whole song (song mode), -1 otherwise
  viewBar: number; // which bar the grid shows
  selectedSlot: number; // chord being edited
  track: Track; // which editor is open
  helpOpen: boolean;
  toast: { id: number; text: string; action?: { label: string; run: () => void } } | null;
  set: (s: Partial<Omit<UiStore, 'set' | 'notify'>>) => void;
  notify: (text: string, action?: { label: string; run: () => void }) => void;
}

export const useUi = create<UiStore>((set) => ({
  view: 'section',
  playing: false,
  playMode: 'section',
  loopBar: false,
  step: -1,
  songStep: -1,
  viewBar: 0,
  selectedSlot: 0,
  track: 'beat',
  helpOpen: false,
  toast: null,
  set: (s) => set(s),
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
