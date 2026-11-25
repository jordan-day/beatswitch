import { useEffect, useMemo, useState } from 'react';
import { getCachedBuffer, loadSample } from '../storage/samples';

/** The audio of a stored sample: undefined while loading, null when it isn't in this browser. */
export function useSampleBuffer(id: string | undefined): AudioBuffer | null | undefined {
  const [buf, setBuf] = useState<AudioBuffer | null | undefined>(() => (id ? getCachedBuffer(id) : null));
  useEffect(() => {
    if (!id) return setBuf(null);
    const hit = getCachedBuffer(id);
    if (hit) return setBuf(hit);
    setBuf(undefined);
    let live = true;
    loadSample(id).then((b) => live && setBuf(b));
    return () => {
      live = false;
    };
  }, [id]);
  return buf;
}

/** Loudness (0..1) of `n` slices of the buffer from `start` for `length` seconds (whole file by default). */
export function peaks(buf: AudioBuffer, n: number, start = 0, length = buf.duration): number[] {
  const data = buf.getChannelData(0);
  const from = Math.max(0, Math.floor(start * buf.sampleRate));
  const to = Math.min(data.length, Math.floor((start + length) * buf.sampleRate));
  const per = Math.max(1, Math.floor((to - from) / n));
  const out: number[] = [];
  let max = 0;
  for (let i = 0; i < n; i++) {
    let peak = 0;
    // every 4th sample is plenty for a picture, and keeps long files quick
    for (let j = from + i * per; j < Math.min(to, from + (i + 1) * per); j += 4) peak = Math.max(peak, Math.abs(data[j]));
    out.push(peak);
    max = Math.max(max, peak);
  }
  return max > 0 ? out.map((v) => v / max) : out;
}

/** A waveform drawn as mirrored bars, stretched to fill its box. */
export function Wave(props: { buf: AudioBuffer; start?: number; length?: number; bars?: number; color: string; className?: string }) {
  const n = props.bars ?? 120;
  const values = useMemo(() => peaks(props.buf, n, props.start, props.length), [props.buf, n, props.start, props.length]);
  return (
    <svg viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" className={props.className} aria-hidden="true">
      {values.map((v, i) => {
        const h = Math.max(2, v * 92);
        return <rect key={i} x={i + 0.15} width={0.7} y={50 - h / 2} height={h} fill={props.color} />;
      })}
    </svg>
  );
}
