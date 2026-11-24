import { DRUM_ROWS, MAX_STEPS, STEPS_PER_BAR, type BassStep, type ChordSlot, type DrumRow, type MelodyNote, type Project, type Step } from './types';

/**
 * A song is a list of sections (Intro, Verse, Chorus...) arranged in blocks.
 *
 * Each section owns its *patterns*: drums, bass, chord progression and rhythm, melody and loop
 * length. Sounds, volumes, key, mood, tempo and effects are song-wide.
 *
 * The section being edited lives in the project's top-level fields (so every editor works exactly
 * as before); the other sections keep their patterns in `sections[i].patterns`. Switching section
 * swaps them. `sectionView` gives any section as a full Project for playback.
 */
export interface SectionPatterns {
  bars: 1 | 2 | 4;
  drums: Record<DrumRow, Step[]>;
  bass: BassStep[];
  chords: { slots: (ChordSlot | null)[]; rhythm: Project['chords']['rhythm']; steps: boolean[]; hidden8?: (ChordSlot | null)[] };
  melody: MelodyNote[];
  /** Hits of the added drum rows, by row id (a row added later is empty here until you fill it). */
  extraDrums?: Record<string, Step[]>;
  /** Notes of the added melodies, by melody id. */
  extraMelodies?: Record<string, MelodyNote[]>;
}

export interface Section {
  id: string;
  name: string;
  /** Patterns of a section that isn't being edited. Absent for the active section (its patterns are top-level). */
  patterns?: SectionPatterns;
}

export type Part = 'drums' | 'bass' | 'chords' | 'melody';
export const PARTS: Part[] = ['drums', 'bass', 'chords', 'melody'];

export interface SongBlock {
  id: string;
  section: string; // Section id
  repeats: number; // 1..8
  mute: Record<Part, boolean>;
  /** Drum fill on the last beat of the block, leading into the next one. */
  fill: boolean;
}

export const SECTION_NAMES = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'];
export const SECTION_COLORS = ['#8fb3e5', '#e8916b', '#e6c27a', '#9ccf9a', '#b6a2e0', '#e58fae', '#7fc4c9'];
export const MAX_REPEATS = 8;
export const FADE_IN_BARS = 2;
export const FADE_OUT_BARS = 4;

export const newId = () => Math.random().toString(36).slice(2, 10);
export const noMutes = (): Record<Part, boolean> => ({ drums: false, bass: false, chords: false, melody: false });

export function extractPatterns(p: Project): SectionPatterns {
  return structuredClone({
    bars: p.bars,
    drums: Object.fromEntries(DRUM_ROWS.map((r) => [r, p.drums[r].steps])) as Record<DrumRow, Step[]>,
    bass: p.bass.steps,
    chords: { slots: p.chords.slots, rhythm: p.chords.rhythm, steps: p.chords.steps, hidden8: p.chords.hidden8 },
    melody: p.melody.notes,
    extraDrums: Object.fromEntries(p.extraDrums.map((d) => [d.id, d.steps])),
    extraMelodies: Object.fromEntries(p.extraMelodies.map((m) => [m.id, m.notes])),
  });
}

const emptySteps = (): Step[] => Array.from({ length: MAX_STEPS }, () => 0 as Step);

/** Write a section's patterns into a project (in place). */
export function applyPatterns(p: Project, s: SectionPatterns) {
  const c = structuredClone(s);
  p.bars = c.bars;
  for (const r of DRUM_ROWS) p.drums[r].steps = c.drums[r];
  p.bass.steps = c.bass;
  p.chords.slots = c.chords.slots;
  p.chords.rhythm = c.chords.rhythm;
  p.chords.steps = c.chords.steps;
  if (c.chords.hidden8) p.chords.hidden8 = c.chords.hidden8;
  else delete p.chords.hidden8;
  p.melody.notes = c.melody;
  for (const d of p.extraDrums) d.steps = c.extraDrums?.[d.id] ?? emptySteps();
  for (const m of p.extraMelodies) m.notes = c.extraMelodies?.[m.id] ?? [];
}

/** The song structure every new project starts with: one section, played 4 times. */
export function defaultSong(): Pick<Project, 'sections' | 'activeSection' | 'song' | 'fadeIn' | 'fadeOut'> {
  const id = newId();
  return {
    sections: [{ id, name: 'Verse' }],
    activeSection: id,
    song: [{ id: newId(), section: id, repeats: 4, mute: noMutes(), fill: false }],
    fadeIn: false,
    fadeOut: true,
  };
}

/** Any section as a complete Project (song-wide settings + that section's patterns). */
export function sectionView(p: Project, sectionId: string): Project {
  if (sectionId === p.activeSection) return p;
  const s = p.sections.find((x) => x.id === sectionId);
  if (!s?.patterns) return p;
  const view = { ...p, drums: { ...p.drums }, bass: { ...p.bass }, chords: { ...p.chords }, melody: { ...p.melody } };
  view.bars = s.patterns.bars;
  for (const r of DRUM_ROWS) view.drums[r] = { ...p.drums[r], steps: s.patterns.drums[r] };
  view.bass.steps = s.patterns.bass;
  view.chords.slots = s.patterns.chords.slots;
  view.chords.rhythm = s.patterns.chords.rhythm;
  view.chords.steps = s.patterns.chords.steps;
  view.melody.notes = s.patterns.melody;
  const pt = s.patterns;
  view.extraDrums = p.extraDrums.map((d) => ({ ...d, steps: pt.extraDrums?.[d.id] ?? emptySteps() }));
  view.extraMelodies = p.extraMelodies.map((m) => ({ ...m, notes: pt.extraMelodies?.[m.id] ?? [] }));
  return view;
}

export const sectionColor = (p: Project, sectionId: string) =>
  SECTION_COLORS[Math.max(0, p.sections.findIndex((s) => s.id === sectionId)) % SECTION_COLORS.length];

export const sectionBars = (p: Project, sectionId: string) =>
  sectionId === p.activeSection ? p.bars : (p.sections.find((s) => s.id === sectionId)?.patterns?.bars ?? p.bars);

/** One block of the arrangement, laid out in time. */
export interface Segment {
  index: number; // block index in p.song
  block: SongBlock;
  view: Project; // what plays
  loopSteps: number; // steps in one pass of the section
  start: number; // first step of the block in the whole song
  steps: number; // loopSteps * repeats
}

const timelineCache = new WeakMap<Project, Segment[]>();

/** The arrangement laid out in steps (cached per project version, so it's cheap to call every 16th note). */
export function buildTimeline(p: Project): Segment[] {
  const hit = timelineCache.get(p);
  if (hit) return hit;
  let start = 0;
  const out: Segment[] = [];
  p.song.forEach((block, index) => {
    if (!p.sections.some((s) => s.id === block.section)) return;
    const view = sectionView(p, block.section);
    const loopSteps = view.bars * STEPS_PER_BAR;
    const steps = loopSteps * block.repeats;
    out.push({ index, block, view, loopSteps, start, steps });
    start += steps;
  });
  timelineCache.set(p, out);
  return out;
}

export const songSteps = (p: Project) => buildTimeline(p).reduce((n, s) => n + s.steps, 0);
export const songBars = (p: Project) => songSteps(p) / STEPS_PER_BAR;

/** Where a step of the whole song falls: which block, which step of its section loop, and whether a fill plays. */
export function locate(timeline: Segment[], step: number) {
  const seg = timeline.find((s) => step >= s.start && step < s.start + s.steps);
  if (!seg) return null;
  const into = step - seg.start;
  const local = into % seg.loopSteps;
  // a fill plays on the last beat of the block's final pass
  const fillNow = seg.block.fill && into >= seg.steps - 4;
  return { seg, local, fillNow, pass: Math.floor(into / seg.loopSteps) };
}

/** "2:14" for a number of seconds. */
export const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** A name for a new section: the next unused of Intro/Verse/Chorus/Bridge/Outro, else "Section N". */
export function nextSectionName(p: Project): string {
  const used = new Set(p.sections.map((s) => s.name));
  return SECTION_NAMES.find((n) => !used.has(n)) ?? `Section ${p.sections.length + 1}`;
}
