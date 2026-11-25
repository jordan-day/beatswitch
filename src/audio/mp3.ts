import { Mp3Encoder } from '@breezystack/lamejs';

const toInt16 = (f: Float32Array) => {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

/** Encode rendered audio as an MP3 (loaded on demand, so it doesn't weigh down the first page load). */
export function encodeMp3(channels: Float32Array[], sampleRate: number, kbps = 192): Blob {
  const encoder = new Mp3Encoder(Math.min(2, channels.length), sampleRate, kbps);
  const left = toInt16(channels[0]);
  const right = channels[1] ? toInt16(channels[1]) : undefined;
  const chunks: Uint8Array[] = [];
  const block = 1152 * 20;
  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block);
    const buf = right ? encoder.encodeBuffer(l, right.subarray(i, i + block)) : encoder.encodeBuffer(l);
    if (buf.length) chunks.push(buf);
  }
  const end = encoder.flush();
  if (end.length) chunks.push(end);
  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}
