import * as Tone from 'tone';
import { bassNote, degreeNote, slotNotes } from '../music/chords';
import { chordHits, slotLength } from '../music/patterns';
import { DRUM_ROWS, MELODY_ROWS, STEPS_PER_BAR, type ChordSlot, type DrumRow, type FxSettings, type Project } from '../state/types';

const toDb = (v: number) => (v <= 0.001 ? -Infinity : Tone.gainToDb(v));
import { makeBass, makeCrackleBuffer, makeKeys, makeSampleDrum, makeSynthDrum, type DrumVoice, type KeysVoice } from './instruments';

export type BufferLookup = (id: string) => AudioBuffer | undefined;

/** Maps UI swing (0..100) to Tone's transport swing amount. */
export const toToneSwing = (swing: number) => (swing / 100) * 0.7;

export const stepSeconds = (bpm: number) => 60 / bpm / 4;

/** Low-pass cutoff in Hz for the "muffle" amount (0 = open, 1 = very muffled). */
export const muffleToHz = (m: number) => 18000 * Math.pow(900 / 18000, m);

function crushCurve(amount: number): (x: number) => number {
  if (amount <= 0.001) return (x) => x;
  const bits = 16 - amount * 12; // 16 bits -> 4 bits
  const levels = Math.pow(2, bits) / 2;
  return (x) => Math.round(x * levels) / levels;
}

/**
 * The whole sound engine for one project: instruments -> lo-fi FX -> destination.
 * Used both for live playback and for offline WAV rendering (in an OfflineContext).
 */
export class Graph {
  private input = new Tone.Gain(1);
  private crushShaper = new Tone.WaveShaper((x) => x, 4096);
  private crushMix = new Tone.CrossFade(0);
  private filter = new Tone.Filter({ type: 'lowpass', frequency: 8000, Q: 0.5, rolloff: -12 });
  private reverb = new Tone.Reverb({ decay: 3.2, preDelay: 0.02, wet: 0.2 });
  private comp = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.2 });
  private limiter = new Tone.Limiter(-1.5);
  private master = new Tone.Volume(-4);
  private wobble = new Tone.Vibrato({ frequency: 0.6, depth: 0.1, wet: 1 });
  private crackle: Tone.Player;
  private crackleGain = new Tone.Gain(0);

  private drums = {} as Record<DrumRow, { voice: DrumVoice; vol: Tone.Volume; key: string }>;
  private keys: { voice: KeysVoice; key: string } | null = null;
  private keysVol = new Tone.Volume(0);
  private melody: { voice: KeysVoice; key: string } | null = null;
  private melodyVol = new Tone.Volume(0);
  private bass: Tone.MonoSynth | null = null;
  private bassKey = '';
  private bassVol = new Tone.Volume(0);
  private lastCrunch = -1;

  /** Called when a row's imported sample isn't available (it falls back to the built-in kit). */
  onMissingSample?: (row: DrumRow) => void;

  constructor(private getBuffer: BufferLookup) {
    // master chain: input -> [dry | crushed] -> lowpass -> reverb -> comp -> limiter -> out
    this.input.connect(this.crushMix.a);
    this.input.chain(this.crushShaper, this.crushMix.b);
    this.crushMix.chain(this.filter, this.reverb, this.comp, this.limiter, this.master, Tone.getDestination());

    // crackle sits on top of the mix, after the crusher/filter/reverb
    this.crackle = new Tone.Player({ url: makeCrackleBuffer(4, Tone.getContext().sampleRate), loop: true });
    this.crackle.chain(this.crackleGain, this.comp);
    this.crackle.sync().start(0);

    this.keysVol.chain(this.wobble, this.input);
    this.melodyVol.connect(this.wobble);
    this.bassVol.connect(this.input);
  }

  /** Wait for async setup (reverb impulse response). */
  async ready() {
    await this.reverb.ready;
  }

  /** Bring every node in line with the project. Cheap to call on every edit. */
  apply(p: Project) {
    for (const row of DRUM_ROWS) {
      const t = p.drums[row];
      const buf = t.sound.kind === 'user' ? this.getBuffer(t.sound.id) : undefined;
      const key =
        t.sound.kind === 'synth' ? 'synth:' + t.sound.id : buf ? 'user:' + t.sound.id : 'missing:' + t.sound.id;
      const cur = this.drums[row];
      if (!cur || cur.key !== key) {
        let v: DrumVoice;
        if (t.sound.kind === 'synth') v = makeSynthDrum(row, t.sound.id);
        else if (buf) v = makeSampleDrum(buf);
        else {
          v = makeSynthDrum(row, 'dusty');
          this.onMissingSample?.(row);
        }
        const vol = cur?.vol ?? new Tone.Volume(0).connect(this.input);
        cur?.voice.dispose();
        v.output.connect(vol);
        this.drums[row] = { voice: v, vol, key };
      }
      const d = this.drums[row];
      d.vol.volume.value = t.volume <= 0.001 ? -Infinity : Tone.gainToDb(t.volume);
      d.vol.mute = t.mute;
    }

    if (!this.keys || this.keys.key !== p.chords.sound) {
      this.keys?.voice.dispose();
      const voice = makeKeys(p.chords.sound);
      voice.output.connect(this.keysVol);
      this.keys = { voice, key: p.chords.sound };
    }
    this.keysVol.volume.value = toDb(p.chords.volume);

    if (!this.melody || this.melody.key !== p.melody.sound) {
      this.melody?.voice.dispose();
      const voice = makeKeys(p.melody.sound);
      voice.output.connect(this.melodyVol);
      this.melody = { voice, key: p.melody.sound };
    }
    // +5 dB: a single melody line needs to sit on top of the (multi-note) chords
    this.melodyVol.volume.value = p.melody.mute ? -Infinity : toDb(p.melody.volume) + 5;

    if (!this.bass || this.bassKey !== p.bass.sound) {
      this.bass?.dispose();
      this.bass = makeBass(p.bass.sound).connect(this.bassVol);
      this.bassKey = p.bass.sound;
    }
    this.bassVol.volume.value = !p.bass.enabled ? -Infinity : toDb(p.bass.volume);

    this.applyFx(p.fx);
  }

  private applyFx(fx: FxSettings) {
    this.filter.frequency.rampTo(muffleToHz(fx.muffle), 0.05);
    this.reverb.wet.rampTo(fx.space * 0.6, 0.05);
    this.wobble.depth.rampTo(fx.wobble * 0.35, 0.05);
    this.wobble.frequency.value = 0.4 + fx.wobble * 0.6;
    this.crackleGain.gain.rampTo(fx.crackle * 0.35, 0.05);
    if (Math.abs(fx.crunch - this.lastCrunch) > 0.01) {
      this.crushShaper.setMap(crushCurve(fx.crunch), 4096);
      this.lastCrunch = fx.crunch;
    }
    this.crushMix.fade.rampTo(Math.min(1, fx.crunch * 3), 0.05);
  }

  /** Schedule everything that happens at `step` (0..bars*16-1) at audio time `time`. */
  scheduleStep(step: number, time: number, p: Project) {
    const sd = stepSeconds(p.bpm);

    for (const row of DRUM_ROWS) {
      const s = p.drums[row].steps[step];
      // Little bit of human feel: random velocity wobble.
      if (s) this.drums[row]?.voice.trigger(time, (s === 2 ? 1 : 0.68) * (0.92 + Math.random() * 0.08));
    }

    const total = p.bars * STEPS_PER_BAR;
    const len = slotLength(p.bars, p.chords.slots.length);
    const slotIdx = Math.min(p.chords.slots.length - 1, Math.floor(step / len));
    const within = step - slotIdx * len;
    const chord = p.chords.slots[slotIdx];

    if (chord && this.keys) {
      let hitLen = 0;
      if (p.chords.rhythm === 'custom') {
        if (p.chords.steps[step]) {
          // hold until the next hit or the next chord change
          hitLen = 1;
          while (within + hitLen < len && !p.chords.steps[(step + hitLen) % total]) hitLen++;
        }
      } else {
        hitLen = chordHits(p.chords.rhythm, len).find((h) => h.offset === within)?.length ?? 0;
      }
      if (hitLen) {
        // tiny strum: each note a few ms later, like a real player
        slotNotes(chord).forEach((n, i) =>
          this.keys!.voice.play([n], hitLen * sd * 0.96, time + i * 0.012, 0.6 + Math.random() * 0.15),
        );
      }
    }

    const bassMode = p.bass.steps[step];
    if (p.bass.enabled && bassMode && chord && this.bass) {
      const note = bassNote(chord, bassMode as 1 | 2 | 3);
      if (note) {
        // hold until the next bass hit (max half a bar, or end of chord slot)
        let n = 1;
        while (n < 8 && !p.bass.steps[(step + n) % total] && within + n < len) n++;
        this.bass.triggerAttackRelease(note, n * sd * 0.9, time, 0.8);
      }
    }

    if (this.melody) {
      for (const m of p.melody.notes) {
        if (m.s !== step || m.d >= MELODY_ROWS) continue;
        const note = degreeNote(p.tonic, p.mood, p.melody.octave, m.d);
        const l = Math.min(m.l, total - m.s);
        this.melody.voice.play([note], l * sd * 0.92, time, 0.75 + Math.random() * 0.1);
      }
    }
  }

  /** Play a chord right now (chord picker previews). */
  preview(chord: ChordSlot | string, time = Tone.now(), dur = 1.2) {
    const slot = typeof chord === 'string' ? { symbol: chord } : chord;
    slotNotes(slot).forEach((n, i) => this.keys?.voice.play([n], dur, time + i * 0.015, 0.7));
    const b = bassNote(slot);
    if (b) this.bass?.triggerAttackRelease(b, dur, time, 0.6);
  }

  /** Play one melody note right now (piano roll / keyboard clicks). */
  previewNote(note: string, kind: 'melody' | 'keys' = 'melody', dur = 0.4) {
    const v = kind === 'melody' ? this.melody : this.keys;
    v?.voice.play([note], dur, Tone.now(), 0.75);
  }

  silence() {
    this.keys?.voice.releaseAll();
    this.melody?.voice.releaseAll();
    this.bass?.triggerRelease();
  }

  dispose() {
    for (const row of DRUM_ROWS) {
      this.drums[row]?.voice.dispose();
      this.drums[row]?.vol.dispose();
    }
    this.keys?.voice.dispose();
    this.melody?.voice.dispose();
    this.bass?.dispose();
    [this.input, this.crushShaper, this.crushMix, this.filter, this.reverb, this.comp, this.limiter, this.master,
      this.wobble, this.crackle, this.crackleGain, this.keysVol, this.melodyVol, this.bassVol].forEach((n) => n.dispose());
  }
}
