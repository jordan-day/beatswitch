import * as Tone from 'tone';
import { DRUM_ROWS, STEPS_PER_BAR, type Project } from '../state/types';
import { getCachedBuffer, loadSample } from '../storage/samples';
import { Graph, loadProjectBuiltins, stepSeconds, toToneSwing } from './graph';
import { encodeWav } from './wav';
import { zipSingleFile } from './zip';
import { safeName } from '../platform';

export const TAIL_SECONDS = 2.5;

export function exportDuration(p: Project, loops: number) {
  return loops * p.bars * STEPS_PER_BAR * stepSeconds(p.bpm);
}

/** Render `loops` repeats of the beat offline (faster than real time) and return a WAV blob. */
export async function renderWav(p: Project, loops = 4): Promise<Blob> {
  await loadProjectBuiltins(p);
  await Promise.all(
    DRUM_ROWS.map((r) => p.drums[r].sound).flatMap((s) => (s.kind === 'user' ? [loadSample(s.id)] : [])),
  );
  const totalSteps = p.bars * STEPS_PER_BAR * loops;
  const loopSteps = p.bars * STEPS_PER_BAR;
  const seconds = exportDuration(p, loops) + TAIL_SECONDS;

  const rendered = await Tone.Offline(
    async (ctx) => {
      const g = new Graph(getCachedBuffer);
      g.apply(p);
      await g.ready();
      const t = ctx.transport;
      t.bpm.value = p.bpm;
      t.swing = toToneSwing(p.swing);
      t.swingSubdivision = '16n';
      let counter = 0;
      t.scheduleRepeat((time) => {
        if (counter < totalSteps) g.scheduleStep(counter % loopSteps, time, p);
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

/**
 * The exported file. On the web: the WAV itself. In a Claude artifact, .wav isn't an allowed
 * download type, so the same WAV goes inside an uncompressed .zip (no quality lost).
 */
export async function exportFile(p: Project, loops = 4, asZip = false): Promise<{ blob: Blob; filename: string }> {
  const wav = await renderWav(p, loops);
  const base = safeName(p.name);
  if (!asZip) return { blob: wav, filename: `${base}.wav` };
  const zipped = zipSingleFile(`${base}.wav`, new Uint8Array(await wav.arrayBuffer()));
  return { blob: new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), filename: `${base}.zip` };
}
