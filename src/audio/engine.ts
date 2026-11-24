import * as Tone from 'tone';
import { useProject, useUi } from '../state/project';
import { DRUM_ROWS, STEPS_PER_BAR, type ChordSlot, type Project } from '../state/types';
import { getCachedBuffer, loadSample } from '../storage/samples';
import { Graph, toToneSwing } from './graph';

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

/** Load any imported samples this project uses, then re-apply so they replace the fallback. */
function ensureSamples(p: Project) {
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

export async function play() {
  const g = await ensureAudio();
  const t = Tone.getTransport();
  if (t.state === 'started') return;
  counter = 0;
  if (repeatId !== null) t.clear(repeatId);
  repeatId = t.scheduleRepeat((time) => {
    const p = useProject.getState().project;
    const step = counter % (p.bars * STEPS_PER_BAR);
    counter++;
    g.scheduleStep(step, time, p);
    Tone.getDraw().schedule(() => {
      const ui = useUi.getState();
      if (ui.playing) ui.set({ step });
    }, time);
  }, '16n');
  t.position = 0;
  t.start('+0.05');
  useUi.getState().set({ playing: true });
}

export function stop() {
  const t = Tone.getTransport();
  t.stop();
  if (repeatId !== null) t.clear(repeatId);
  repeatId = null;
  graph?.silence();
  useUi.getState().set({ playing: false, step: -1 });
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
