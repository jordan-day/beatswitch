import * as Tone from 'tone';
import { songSteps } from '../state/song';
import { DRUM_ROWS, STEPS_PER_BAR, type Project } from '../state/types';
import { getCachedBuffer, loadSample } from '../storage/samples';
import { Graph, loadProjectBuiltins, stepSeconds, toToneSwing } from './graph';
import { encodeWav } from './wav';
import { zipSingleFile } from './zip';
import { safeName } from '../platform';

export const TAIL_SECONDS = 2.5;

/** Length (seconds, without the reverb tail) of `loops` passes of the section being edited. */
export function exportDuration(p: Project, loops: number) {
  return loops * p.bars * STEPS_PER_BAR * stepSeconds(p.bpm);
}

/** Length (seconds, without the tail) of the whole arrangement. */
export const songDuration = (p: Project) => songSteps(p) * stepSeconds(p.bpm);

/** Render offline (faster than real time): `steps` 16th notes, each played by `play`. */
async function render(p: Project, steps: number, play: (g: Graph, step: number, time: number) => void, fades: boolean) {
  await loadProjectBuiltins(p);
  await Promise.all(DRUM_ROWS.map((r) => p.drums[r].sound).flatMap((s) => (s.kind === 'user' ? [loadSample(s.id)] : [])));
  const seconds = steps * stepSeconds(p.bpm) + TAIL_SECONDS;

  const rendered = await Tone.Offline(
    async (ctx) => {
      const g = new Graph(getCachedBuffer);
      g.apply(p);
      await g.ready();
      if (fades) g.scheduleFades(p, 0, steps * stepSeconds(p.bpm));
      const t = ctx.transport;
      t.bpm.value = p.bpm;
      t.swing = toToneSwing(p.swing);
      t.swingSubdivision = '16n';
      let counter = 0;
      t.scheduleRepeat((time) => {
        if (counter < steps) play(g, counter, time);
        counter++;
      }, '16n');
      t.start(0);
    },
    seconds,
    2,
    44100,
  );
  const audio = rendered.get();
  if (!audio) throw new Error('Rendering failed');
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  return new Blob([encodeWav(channels, audio.sampleRate)], { type: 'audio/wav' });
}

/** `loops` passes of the section being edited, as a WAV. */
export function renderWav(p: Project, loops = 4): Promise<Blob> {
  const loopSteps = p.bars * STEPS_PER_BAR;
  return render(p, loopSteps * loops, (g, step, time) => g.scheduleStep(step % loopSteps, time, p), false);
}

/** The whole song (arrangement, fills, part mutes and fades), as a WAV. */
export function renderSong(p: Project): Promise<Blob> {
  return render(p, songSteps(p), (g, step, time) => void g.scheduleSongStep(step, time, p), true);
}

/**
 * The exported file: the whole song (or, with `loops`, just the section being edited).
 * On the web: the WAV itself. In a Claude artifact, .wav isn't an allowed download type,
 * so the same WAV goes inside an uncompressed .zip (no quality lost).
 */
export async function exportFile(p: Project, opts: { loops?: number; asZip?: boolean } = {}): Promise<{ blob: Blob; filename: string }> {
  const wav = opts.loops || songSteps(p) === 0 ? await renderWav(p, opts.loops ?? 4) : await renderSong(p);
  const base = safeName(p.name);
  if (!opts.asZip) return { blob: wav, filename: `${base}.wav` };
  const zipped = zipSingleFile(`${base}.wav`, new Uint8Array(await wav.arrayBuffer()));
  return { blob: new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), filename: `${base}.zip` };
}
