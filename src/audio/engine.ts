import * as Tone from 'tone';
import { useProject, useUi } from '../state/project';
import { STEPS_PER_BAR, type ChordSlot, type Project } from '../state/types';
import { allDrums } from '../state/tracks';
import { getCachedBuffer, loadSample } from '../storage/samples';
import { Graph, loadProjectBuiltins, stepSeconds, toToneSwing } from './graph';
import { songSteps } from '../state/song';
import { nextLoopStep, slotLength } from '../music/patterns';

/**
 * Live playback. The UI only edits the store; the engine subscribes and keeps the
 * audio graph in sync, reading the latest pattern on every 16th note so edits are heard instantly.
 */
let graph: Graph | null = null;
let booting: Promise<Graph> | null = null;
let repeatId: number | null = null;
let counter = 0;
// last bar / chord the editors were moved to, so following only happens when playback moves on
let followBar = -1;
let followSlot = -1;

/**
 * Show the playhead, and make the editors follow along: when playback reaches a new bar the
 * editors switch to it, and when it reaches a new chord that chord becomes the selected one.
 * Only on changes, so clicking another bar or chord mid-bar isn't instantly undone.
 */
function showPlayhead(step: number, p: Project, extra: { songStep?: number } = {}) {
  const ui = useUi.getState();
  if (!ui.playing) return;
  const patch: Parameters<typeof ui.set>[0] = { ...extra, step };
  if (step >= 0) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    if (bar !== followBar) patch.viewBar = followBar = bar;
    const count = p.chords.slots.length;
    const slot = Math.min(count - 1, Math.floor(step / slotLength(p.bars, count)));
    if (slot !== followSlot) patch.selectedSlot = followSlot = slot;
  } else {
    followBar = followSlot = -1;
  }
  ui.set(patch);
}

function syncTransport(p: Project) {
  const t = Tone.getTransport();
  t.bpm.value = p.bpm;
  t.swing = toToneSwing(p.swing);
  t.swingSubdivision = '16n';
}

/** Load any recorded or imported sounds this project uses, then re-apply so they replace the stand-ins. */
function ensureSamples(p: Project) {
  loadProjectBuiltins(p).then(() => graph?.apply(useProject.getState().project));
  for (const { track } of allDrums(p)) {
    const s = track.sound;
    if (s.kind === 'user' && !getCachedBuffer(s.id)) {
      loadSample(s.id).then((buf) => {
        if (buf && graph) graph.apply(useProject.getState().project);
      });
    }
  }
}

/** Browsers only allow audio after a click/keypress, so call this from event handlers. */
export function ensureAudio(): Promise<Graph> {
  if (graph) return Promise.resolve(graph);
  if (!booting) {
    booting = (async () => {
      await Tone.start();
      Tone.getContext().lookAhead = 0.08;
      const g = new Graph(getCachedBuffer);
      g.onMissingSample = (name) =>
        useUi.getState().notify(`The "${name}" sample isn't saved in this browser, so the built-in sound is playing instead.`);
      const p = useProject.getState().project;
      g.apply(p);
      syncTransport(p);
      await g.ready();
      graph = g;
      ensureSamples(p);
      useProject.subscribe((s, prev) => {
        if (s.project === prev.project) return;
        g.apply(s.project);
        syncTransport(s.project);
        ensureSamples(s.project);
      });
      return g;
    })();
  }
  return booting;
}

/**
 * Start playback: in 'section' mode the section being edited loops; in 'song' mode the whole
 * arrangement plays once (with its fades) and stops at the end.
 */
export async function play() {
  const g = await ensureAudio();
  const t = Tone.getTransport();
  if (t.state === 'started') return;
  const songMode = useUi.getState().playMode === 'song';
  const startP = useProject.getState().project;
  if (songMode && songSteps(startP) === 0) {
    useUi.getState().notify('The song is empty. Open the Song tab and use "Add to song" on a section.');
    return;
  }
  counter = 0;
  followBar = followSlot = -1;
  let lastStep = -1;
  let ended = false;
  if (repeatId !== null) t.clear(repeatId);
  const startAt = Tone.now() + 0.05;
  g.resetFades();
  if (songMode) g.scheduleFades(startP, startAt, songSteps(startP) * stepSeconds(startP.bpm));

  repeatId = t.scheduleRepeat((time) => {
    const p = useProject.getState().project;
    if (!songMode) {
      const { loopBar, viewBar } = useUi.getState();
      const step = nextLoopStep(lastStep, p.bars, loopBar ? viewBar : null);
      lastStep = step;
      counter++;
      g.scheduleStep(step, time, p);
      Tone.getDraw().schedule(() => showPlayhead(step, p), time);
      return;
    }
    const songStep = counter++;
    const at = g.scheduleSongStep(songStep, time, p);
    if (!at) {
      // end of the song: let the last notes ring out, then stop
      if (!ended) {
        ended = true;
        Tone.getDraw().schedule(() => stop(), time + 1.5);
      }
      return;
    }
    // In the section editor the view follows the song: when playback moves into another section, that
    // section opens (and the editor starts following its bars and chords from the top).
    Tone.getDraw().schedule(() => {
      const id = at.seg.block.section;
      if (useUi.getState().view === 'editor' && id !== useProject.getState().project.activeSection) {
        useProject.getState().followSection(id);
        followBar = followSlot = -1;
      }
      const now = useProject.getState().project;
      showPlayhead(id === now.activeSection ? at.local : -1, now, { songStep });
    }, time);
  }, '16n');
  t.position = 0;
  t.start(startAt);
  useUi.getState().set({ playing: true });
}

export function stop() {
  const t = Tone.getTransport();
  t.stop();
  if (repeatId !== null) t.clear(repeatId);
  repeatId = null;
  graph?.silence();
  graph?.resetFades();
  useUi.getState().set({ playing: false, step: -1, songStep: -1 });
}

/** Switch between looping the section and playing the song (restarts if playing). */
export async function setPlayMode(mode: 'section' | 'song') {
  const wasPlaying = useUi.getState().playing;
  if (wasPlaying) stop();
  useUi.getState().set({ playMode: mode });
  if (wasPlaying) await play();
}

/** What the play button plays: one bar on repeat, the section on repeat, or the whole song once. */
export type LoopMode = 'bar' | 'section' | 'song';

export const loopModeOf = (s: { playMode: 'section' | 'song'; loopBar: boolean }): LoopMode =>
  s.playMode === 'song' ? 'song' : s.loopBar ? 'bar' : 'section';

/** Change what the play button plays (restarts playback when switching to or from the whole song). */
export async function setLoopMode(mode: LoopMode) {
  const ui = useUi.getState();
  if (mode === 'song') return setPlayMode('song');
  if (ui.playMode === 'song') await setPlayMode('section');
  useUi.getState().set({ loopBar: mode === 'bar' });
}

/** Switch between the section editor and the song arrangement. */
export function showView(view: 'editor' | 'song') {
  useUi.getState().set({ view });
}

export async function togglePlay() {
  if (useUi.getState().playing) stop();
  else await play();
}

export async function previewChord(chord: ChordSlot | string) {
  const g = await ensureAudio();
  g.preview(chord);
}

export async function previewProgression(chords: (ChordSlot | string | null)[]) {
  const g = await ensureAudio();
  const now = Tone.now() + 0.05;
  chords.forEach((c, i) => c && g.preview(c, now + i * 0.75, 0.7));
}

/**
 * Hear a sound right after changing it (key, kit, instrument). Waits a beat so the audio graph
 * has swapped to the new sound (recorded instruments and kits load in the background).
 */
async function previewSoon(play: (g: Graph, p: Project) => void) {
  const g = await ensureAudio();
  await new Promise((r) => setTimeout(r, 140));
  play(g, useProject.getState().project);
}

export const previewKit = () => previewSoon((g) => g.previewKit());
export const previewBass = () => previewSoon((g, p) => g.previewBass(p));
export const previewMelody = (melodyId: string) => previewSoon((g, p) => g.previewMelody(p, melodyId));
/** Hear the key: the first few chords of the progression. */
export const previewKey = () =>
  previewSoon((g, p) => {
    const now = Tone.now() + 0.03;
    p.chords.slots
      .filter((c): c is ChordSlot => !!c)
      .slice(0, 4)
      .forEach((c, i) => g.preview(c, now + i * 0.55, 0.6));
  });
/** Hear the chord instrument: the first chord. */
export const previewChordSound = () =>
  previewSoon((g, p) => {
    const c = p.chords.slots.find((s) => s);
    if (c) g.preview(c);
  });

/**
 * New-beat wizard previews: hear a draft beat's sounds without touching the open beat.
 * The audio graph is switched to the draft for a moment; `restoreAudio` puts the open beat's sounds back.
 */
let auditioningDraft = false;
async function withDraft(draft: Project, play: (g: Graph) => void) {
  const g = await ensureAudio();
  auditioningDraft = true;
  await loadProjectBuiltins(draft);
  g.apply(draft);
  await new Promise((r) => setTimeout(r, 60));
  play(g);
}
export const previewDraftChords = (draft: Project) =>
  withDraft(draft, (g) => {
    const now = Tone.now() + 0.03;
    draft.chords.slots.filter((c): c is ChordSlot => !!c).slice(0, 4).forEach((c, i) => g.preview(c, now + i * 0.55, 0.6));
  });
export const previewDraftKit = (draft: Project) => withDraft(draft, (g) => g.previewKit());
export const previewDraftDemo = (draft: Project) => withDraft(draft, (g) => g.previewDemo(draft));
export function restoreAudio() {
  if (!graph || !auditioningDraft) return;
  auditioningDraft = false;
  graph.apply(useProject.getState().project);
}

/** Hear a single note (piano roll / chord keyboard). */
export async function previewNote(note: string, kind: 'melody' | 'keys' = 'melody', melodyId?: string) {
  const g = await ensureAudio();
  g.previewNote(note, kind, undefined, melodyId);
}
