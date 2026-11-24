import * as Tone from 'tone';
import type { BassSound, DrumRow, KeysSound, MelodySound, SynthKit } from '../state/types';

export interface DrumVoice {
  output: Tone.ToneAudioNode;
  trigger(time: number, velocity: number): void;
  dispose(): void;
}

/** Wrap a set of nodes as a voice whose output is a Gain. */
function voice(nodes: { dispose(): void }[], out: Tone.Gain, trigger: DrumVoice['trigger']): DrumVoice {
  return {
    output: out,
    trigger,
    dispose: () => {
      nodes.forEach((n) => n.dispose());
      out.dispose();
    },
  };
}

function noiseHit(opts: {
  type: 'white' | 'pink' | 'brown';
  decay: number;
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  gain?: number;
}): DrumVoice {
  const out = new Tone.Gain(opts.gain ?? 1);
  const filter = new Tone.Filter({ type: opts.filter, frequency: opts.freq, Q: opts.q ?? 1 }).connect(out);
  const n = new Tone.NoiseSynth({
    noise: { type: opts.type },
    envelope: { attack: 0.001, decay: opts.decay, sustain: 0, release: 0.02 },
  }).connect(filter);
  return voice([n, filter], out, (time, vel) => n.triggerAttackRelease(opts.decay, time, vel));
}

export function makeSynthDrum(row: DrumRow, kit: SynthKit): DrumVoice {
  const soft = kit === 'soft';
  switch (row) {
    case 'kick': {
      const out = new Tone.Gain(1.1);
      const k = new Tone.MembraneSynth({
        pitchDecay: soft ? 0.06 : 0.035,
        octaves: soft ? 4 : 5.5,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: soft ? 0.3 : 0.45, sustain: 0, release: 0.1 },
      }).connect(out);
      return voice([k], out, (t, v) => k.triggerAttackRelease(soft ? 'D1' : 'C1', 0.3, t, v));
    }
    case 'snare': {
      const out = new Tone.Gain(0.9);
      const body = new Tone.MembraneSynth({
        pitchDecay: 0.01,
        octaves: 1.5,
        envelope: { attack: 0.001, decay: 0.09, sustain: 0 },
        volume: -10,
      }).connect(out);
      const noise = noiseHit(
        soft
          ? { type: 'pink', decay: 0.14, filter: 'lowpass', freq: 3200 }
          : { type: 'white', decay: 0.2, filter: 'bandpass', freq: 2000, q: 0.7, gain: 0.8 },
      );
      noise.output.connect(out);
      return voice([body, noise], out, (t, v) => {
        body.triggerAttackRelease('G2', 0.08, t, v);
        noise.trigger(t, v);
      });
    }
    case 'hat':
      return noiseHit(
        soft
          ? { type: 'white', decay: 0.035, filter: 'highpass', freq: 9000, gain: 0.5 }
          : { type: 'white', decay: 0.05, filter: 'highpass', freq: 7000, gain: 0.6 },
      );
    case 'openhat':
      return noiseHit({ type: 'white', decay: soft ? 0.25 : 0.38, filter: 'highpass', freq: soft ? 8000 : 6500, gain: 0.45 });
    case 'perc': {
      if (soft) return noiseHit({ type: 'pink', decay: 0.12, filter: 'bandpass', freq: 1400, q: 1.5, gain: 1.2 });
      const out = new Tone.Gain(0.6);
      const rim = new Tone.MembraneSynth({
        pitchDecay: 0.005,
        octaves: 1.2,
        envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
      }).connect(out);
      return voice([rim], out, (t, v) => rim.triggerAttackRelease('D5', 0.04, t, v));
    }
  }
}

export function makeSampleDrum(buffer: AudioBuffer): DrumVoice {
  const out = new Tone.Gain(1);
  const toneBuf = new Tone.ToneAudioBuffer(buffer);
  const sources = new Set<Tone.ToneBufferSource>();
  return {
    output: out,
    trigger: (time, vel) => {
      // A fresh source per hit, so hits can overlap and retrigger cleanly.
      const src = new Tone.ToneBufferSource(toneBuf);
      const g = new Tone.Gain(vel).connect(out);
      src.connect(g);
      src.onended = () => {
        sources.delete(src);
        src.dispose();
        g.dispose();
      };
      sources.add(src);
      src.start(time);
    },
    dispose: () => {
      sources.forEach((s) => s.dispose());
      out.dispose();
    },
  };
}

export interface KeysVoice {
  output: Tone.ToneAudioNode;
  play(notes: string[], duration: number, time: number, velocity?: number): void;
  releaseAll(): void;
  dispose(): void;
}

export function makeKeys(sound: KeysSound | MelodySound): KeysVoice {
  let synth: Tone.PolySynth;
  if (sound === 'flute') {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.06, decay: 0.2, sustain: 0.75, release: 0.35 },
      volume: -10,
    });
  } else if (sound === 'lead') {
    synth = new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: 'square' },
      filter: { type: 'lowpass', Q: 1, rolloff: -24 },
      filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.3, baseFrequency: 500, octaves: 2.5 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3 },
      volume: -20,
    });
  } else if (sound === 'rhodes') {
    synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3,
      modulationIndex: 1.6,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.005, decay: 1.6, sustain: 0.25, release: 1.4 },
      modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0.1, release: 0.6 },
      volume: -11,
    });
  } else if (sound === 'pad') {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fattriangle', count: 3, spread: 18 },
      envelope: { attack: 0.35, decay: 0.6, sustain: 0.7, release: 2 },
      volume: -18,
    });
  } else {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0.9, sustain: 0, release: 0.8 },
      volume: -12,
    });
  }
  synth.maxPolyphony = 32;
  return {
    output: synth,
    play: (notes, dur, time, vel = 0.8) => {
      if (notes.length) synth.triggerAttackRelease(notes, dur, time, vel);
    },
    releaseAll: () => synth.releaseAll(),
    dispose: () => synth.dispose(),
  };
}

export function makeBass(sound: BassSound = 'round'): Tone.MonoSynth {
  if (sound === 'sub') {
    return new Tone.MonoSynth({
      oscillator: { type: 'sine' },
      filter: { Q: 0.5, type: 'lowpass' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.85, release: 0.3 },
      filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.3, baseFrequency: 400, octaves: 0 },
      volume: -3,
    });
  }
  if (sound === 'pluck') {
    return new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { Q: 2, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.005, decay: 0.35, sustain: 0.15, release: 0.2 },
      filterEnvelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.2, baseFrequency: 90, octaves: 3.2 },
      volume: -9,
    });
  }
  return new Tone.MonoSynth({
    oscillator: { type: 'triangle' },
    filter: { Q: 1, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.25 },
    filterEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.3, baseFrequency: 120, octaves: 2.2 },
    volume: -6,
  });
}

/** Procedural vinyl crackle: soft brown hiss plus random pops. */
export function makeCrackleBuffer(seconds = 4, sampleRate = 44100): Tone.ToneAudioBuffer {
  const len = Math.floor(seconds * sampleRate);
  const data = new Float32Array(len);
  let brown = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    data[i] = brown * 0.6;
    if (Math.random() < 0.0009) {
      // a pop: short decaying click
      const amp = 0.2 + Math.random() * 0.5;
      const sign = Math.random() < 0.5 ? -1 : 1;
      for (let j = 0; j < 60 && i + j < len; j++) data[i + j] += sign * amp * Math.exp(-j / 8) * (Math.random() * 0.5 + 0.5);
    }
  }
  return Tone.ToneAudioBuffer.fromArray(data);
}
