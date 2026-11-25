import * as Tone from 'tone';
import { songSteps } from '../state/song';
import { allDrums } from '../state/tracks';
import { STEPS_PER_BAR, type Project } from '../state/types';
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
  await Promise.all([
    ...allDrums(p).map((d) => d.track.sound).flatMap((s) => (s.kind === 'user' ? [loadSample(s.id)] : [])),
    ...(p.sample ? [loadSample(p.sample.id)] : []),
  ]);
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
  return { channels, sampleRate: audio.sampleRate };
}

export type AudioFormat = 'wav' | 'mp3';
type Rendered = Awaited<ReturnType<typeof render>>;

async function encode(r: Rendered, format: AudioFormat): Promise<Blob> {
  if (format === 'mp3') return (await import('./mp3')).encodeMp3(r.channels, r.sampleRate);
  return new Blob([encodeWav(r.channels, r.sampleRate)], { type: 'audio/wav' });
}

/** `loops` passes of the section being edited. */
export function renderLoop(p: Project, loops = 4): Promise<Rendered> {
  const loopSteps = p.bars * STEPS_PER_BAR;
  return render(p, loopSteps * loops, (g, step, time) => g.scheduleStep(step % loopSteps, time, p), false);
}

/** The whole song (arrangement, fills, part mutes and fades). */
export function renderSong(p: Project): Promise<Rendered> {
  return render(p, songSteps(p), (g, step, time) => void g.scheduleSongStep(step, time, p), true);
}

/**
 * The exported file: the whole song (or, with `loops`, just the section being edited), as a WAV or MP3.
 * On the web: the audio file itself. In a Claude artifact, .wav/.mp3 aren't allowed download types,
 * so the same audio goes inside an uncompressed .zip (no quality lost).
 */
export async function exportFile(
  p: Project,
  opts: { format?: AudioFormat; loops?: number; asZip?: boolean } = {},
): Promise<{ blob: Blob; filename: string }> {
  const format = opts.format ?? 'wav';
  const rendered = opts.loops || songSteps(p) === 0 ? await renderLoop(p, opts.loops ?? 4) : await renderSong(p);
  const audio = await encode(rendered, format);
  const base = safeName(p.name);
  if (!opts.asZip) return { blob: audio, filename: `${base}.${format}` };
  const zipped = zipSingleFile(`${base}.${format}`, new Uint8Array(await audio.arrayBuffer()));
  return { blob: new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), filename: `${base}.zip` };
}
