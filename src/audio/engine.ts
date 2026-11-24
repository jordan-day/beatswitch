import * as Tone from 'tone';
import { useProject, useUi } from '../state/project';
import { DRUM_ROWS, STEPS_PER_BAR, type ChordSlot, type Project } from '../state/types';
import { getCachedBuffer, loadSample } from '../storage/samples';
import { Graph, loadProjectBuiltins, stepSeconds, toToneSwing } from './graph';
import { songSteps } from '../state/song';

/**
 * Live playback. The UI only edits the store; the engine subscribes and keeps the
 * audio graph in sync, reading the latest pattern on every 16th note so edits are heard instantly.
 */
let graph: Graph | null = null;
let booting: Promise<Graph> | null = null;
let repeatId: number | null = null;
let counter = 0;

function syncTransport(p: Project) {
  const t = Tone.getTransport();
  t.bpm.value = p.bpm;
  t.swing = toToneSwing(p.swing);
  t.swingSubdivision = '16n';
}

/** Load any recorded or imported sounds this project uses, then re-apply so they replace the stand-ins. */
function ensureSamples(p: Project) {
  loadProjectBuiltins(p).then(() => graph?.apply(useProject.getState().project));
  for (const r of DRUM_ROWS) {
    const s = p.drums[r].sound;
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
      g.onMissingSample = (row) =>
        useUi.getState().notify(`The "${row}" sample isn't saved in this browser, so the built-in sound is playing instead.`);
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
    useUi.getState().notify('The song is empty. Open 🎼 Song and use "Add to song" on a section.');
    return;
  }
  counter = 0;
  let ended = false;
  if (repeatId !== null) t.clear(repeatId);
  const startAt = Tone.now() + 0.05;
  g.resetFades();
  if (songMode) g.scheduleFades(startP, startAt, songSteps(startP) * stepSeconds(startP.bpm));

  repeatId = t.scheduleRepeat((time) => {
    const p = useProject.getState().project;
    if (!songMode) {
      const step = counter % (p.bars * STEPS_PER_BAR);
      counter++;
      g.scheduleStep(step, time, p);
      Tone.getDraw().schedule(() => {
        const ui = useUi.getState();
        if (ui.playing) ui.set({ step });
      }, time);
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
    Tone.getDraw().schedule(() => {
      const ui = useUi.getState();
      // the editors show the playhead only while the section being edited is the one playing
      if (ui.playing) ui.set({ songStep, step: at.seg.block.section === p.activeSection ? at.local : -1 });
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

/** Hear a single note (piano roll / chord keyboard). */
export async function previewNote(note: string, kind: 'melody' | 'keys' = 'melody') {
  const g = await ensureAudio();
  g.previewNote(note, kind);
}
