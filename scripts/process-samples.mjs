// Turns raw studio WAVs (VCSL, CC0) into small, web-friendly one-shots for BeatSwitch:
// mono, 22.05 kHz, 16-bit, trimmed, faded, normalized, and (for pitched sets) tuned to exact
// semitones with their real pitch measured from the audio rather than trusted from the filename.
//
// usage: node scripts/process-samples.mjs <raw dir> <out dir>
//   raw dir holds <set>/<name>.wav as written by the download step (see scripts/vcsl-files.txt)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [rawDir, outDir] = process.argv.slice(2);
if (!rawDir || !outDir) throw new Error('usage: node scripts/process-samples.mjs <raw dir> <out dir>');

const OUT_RATE = 22050;
// max length (seconds) per set or per drum
const MAX_LEN = {
  kick: 0.8, snare: 0.6, hat: 0.3, openhat: 1.2, clap: 0.6, shaker: 0.4, tambourine: 0.8,
  piano: 3.2, vibes: 3.0, kalimba: 2.5, glock: 2.2, ocarina: 2.6,
};
const PITCHED = new Set(['piano', 'vibes', 'kalimba', 'glock', 'ocarina']);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi) => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
const fileSafe = (n) => n.replace('#', 's');

function readWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV');
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(off + 8);
      if (format === 0xfffe) format = buf.readUInt16LE(off + 8 + 24); // WAVE_FORMAT_EXTENSIBLE sub-format
      fmt = { format, channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    } else if (id === 'data') data = buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('missing fmt/data chunk');
  const bps = fmt.bits / 8;
  const frames = Math.floor(data.length / (bps * fmt.channels));
  const mono = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const p = (i * fmt.channels + c) * bps;
      let v;
      if (fmt.format === 3 && fmt.bits === 32) v = data.readFloatLE(p);
      else if (fmt.bits === 16) v = data.readInt16LE(p) / 32768;
      else if (fmt.bits === 24) v = data.readIntLE(p, 3) / 8388608;
      else if (fmt.bits === 32) v = data.readInt32LE(p) / 2147483648;
      else throw new Error(`unsupported ${fmt.bits}-bit format ${fmt.format}`);
      sum += v;
    }
    mono[i] = sum / fmt.channels;
  }
  return { rate: fmt.rate, samples: mono, info: `${fmt.bits}-bit ${fmt.channels}ch ${fmt.rate} Hz` };
}

/** RBJ biquad low-pass, applied in place. */
function lowpass(x, rate, freq, q = 0.707) {
  const w = (2 * Math.PI * freq) / rate, a = Math.sin(w) / (2 * q), cw = Math.cos(w);
  const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = b0, a0 = 1 + a, a1 = -2 * cw, a2 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
}

/** Fundamental frequency by normalized autocorrelation over a steady part of the note. */
function detectPitch(x, rate) {
  const start = Math.floor(rate * 0.08);
  const len = Math.min(Math.floor(rate * 0.25), x.length - start - 1);
  const minLag = Math.floor(rate / 4500), maxLag = Math.floor(rate / 45);
  let best = -1, bestLag = 0;
  const corr = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < len - lag; i++) {
      const a = x[start + i], b = x[start + i + lag];
      s += a * b; e1 += a * a; e2 += b * b;
    }
    corr[lag] = s / Math.sqrt(e1 * e2 + 1e-12);
  }
  // first peak that is close to the global best (avoids picking a sub-octave)
  for (let lag = minLag; lag <= maxLag; lag++) if (corr[lag] > best) best = corr[lag];
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] >= 0.9 * best && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) { bestLag = lag; break; }
  }
  if (!bestLag) return null;
  const [a, b, c] = [corr[bestLag - 1], corr[bestLag], corr[bestLag + 1]];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return { freq: rate / (bestLag + shift), clarity: best };
}

function resample(x, inRate, outRate, ratio = 1) {
  // ratio > 1 raises pitch (reads the source faster)
  const step = (inRate / outRate) * ratio;
  const n = Math.floor((x.length - 1) / step);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * step, k = Math.floor(p), f = p - k;
    out[i] = x[k] * (1 - f) + x[k + 1] * f;
  }
  return out;
}

function writeWav16(x, rate) {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + x.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  return buf;
}

const manifest = { source: 'VCSL by Versilian Studios (CC0 1.0) https://github.com/sgossner/VCSL', sets: {} };
let totalBytes = 0;

for (const set of readdirSync(rawDir)) {
  const files = readdirSync(join(rawDir, set)).filter((f) => f.endsWith('.wav'));
  mkdirSync(join(outDir, set), { recursive: true });
  manifest.sets[set] = {};
  for (const file of files) {
    const label = file.replace(/\.wav$/, '').replace(/s(\d)$/, '#$1');
    const { rate, samples, info } = readWav(readFileSync(join(rawDir, set, file)));
    const x = samples;

    // trim leading silence (keep 3 ms before the onset)
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    let onset = x.findIndex((v) => Math.abs(v) > peak * 0.02);
    onset = Math.max(0, onset - Math.floor(rate * 0.003));
    let body = x.slice(onset);

    // Tuning. VCSL names notes with middle C = C3, so the real note is the label + 1 octave
    // (measuring confirms this on every clear note). The measured pitch is used only to fine-tune
    // cents, and only when it agrees with the label: bell-like sounds (glockenspiel, low vibes)
    // have strong overtones that can fool pitch detection.
    let key = label, ratio = 1, report = '';
    if (PITCHED.has(set)) {
      const m = /^([A-G]#?)(-?\d)$/.exec(label);
      if (!m) throw new Error(`can't read note name from ${set}/${file}`);
      const expected = NAMES.indexOf(m[1]) + (Number(m[2]) + 1) * 12 + 12;
      key = noteName(expected);
      const p = detectPitch(body, rate);
      const heard = p ? 69 + 12 * Math.log2(p.freq / 440) : NaN;
      const off = heard - expected; // in semitones
      if (Math.abs(off) <= 0.6) {
        ratio = Math.pow(2, -off / 12);
        report = `-> ${key.padEnd(4)} tuned ${off >= 0 ? '-' : '+'}${Math.abs(Math.round(off * 100))}c`;
      } else {
        report = `-> ${key.padEnd(4)} kept as labelled (detector heard ${p ? noteName(Math.round(heard)) : 'nothing'}, overtone)`;
      }
    }

    // filter below the new Nyquist, then resample (with the tuning ratio)
    lowpass(body, rate, 9500);
    lowpass(body, rate, 9500);
    let y = resample(body, rate, OUT_RATE, ratio);

    // cut to length with a cosine fade over the last 20 %
    const max = Math.floor((MAX_LEN[set] ?? MAX_LEN[label] ?? 1) * OUT_RATE);
    if (y.length > max) y = y.slice(0, max);
    const fade = Math.floor(y.length * 0.2);
    for (let i = 0; i < fade; i++) y[y.length - fade + i] *= 0.5 * (1 + Math.cos((Math.PI * i) / fade));
    for (let i = 0; i < Math.min(32, y.length); i++) y[i] *= i / 32; // tiny fade-in, no click

    // normalize to -1 dBFS
    let p2 = 0;
    for (const v of y) p2 = Math.max(p2, Math.abs(v));
    const g = p2 > 0 ? 0.89 / p2 : 1;
    for (let i = 0; i < y.length; i++) y[i] *= g;

    const outName = `${fileSafe(key)}.wav`;
    const bytes = writeWav16(y, OUT_RATE);
    writeFileSync(join(outDir, set, outName), bytes);
    totalBytes += bytes.length;
    manifest.sets[set][key] = `${set}/${outName}`;
    console.log(`${set.padEnd(8)} ${file.padEnd(12)} ${info.padEnd(22)} -> ${outName.padEnd(9)} ${(bytes.length / 1024).toFixed(0).padStart(4)} KB ${report}`);
  }
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`total ${(totalBytes / 1048576).toFixed(2)} MB`);
