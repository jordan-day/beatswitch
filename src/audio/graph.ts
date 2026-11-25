import * as Tone from 'tone';
import { bassNote, degreeNote, melodyPitch, slotNotes } from '../music/chords';
import { chordHits, slotLength } from '../music/patterns';
import { brightToCutoff, fadeToRelease, resolveTone, softToAttack, vibratoToDepth } from '../music/tone';
import {
  MELODY_ROWS,
  SAMPLED_INSTRUMENTS,
  STEPS_PER_BAR,
  type ChordSlot,
  type DrumRow,
  type FxSettings,
  type KeysSound,
  type MelodySound,
  type Project,
  type SampledInstrument,
} from '../state/types';
import { getInstrument, getKitBuffer, kitSamplePath, loadBuiltins } from './builtinSamples';
import { buildTimeline, FADE_IN_BARS, FADE_OUT_BARS, locate, type Part } from '../state/song';
import { allDrums, allMelodies, MAIN_MELODY } from '../state/tracks';

/** Playback speed for a pitch shift in semitones (like a record: higher is also faster). */
export const sampleRate = (semitones: number) => Math.pow(2, semitones / 12);

const toDb = (v: number) => (v <= 0.001 ? -Infinity : Tone.gainToDb(v));

/** Level of each recorded kit drum, so the acoustic kit sits at about the same loudness as the synth kits. */
const KIT_GAIN: Record<DrumRow, number> = { kick: 1, snare: 0.75, hat: 0.45, openhat: 0.4, perc: 0.6 };

const isSampled = (s: KeysSound | MelodySound): s is SampledInstrument =>
  (SAMPLED_INSTRUMENTS as readonly string[]).includes(s);

/** Identity of the voice a sound needs right now; changes once a recorded instrument finishes loading. */
const voiceKey = (s: KeysSound | MelodySound) => (isSampled(s) && !getInstrument(s) ? 'loading:' + s : s);

/** A recorded instrument when its notes are loaded; until then a similar synth stands in. */
function makeVoice(s: KeysSound | MelodySound): { voice: KeysVoice; key: string } {
  if (!isSampled(s)) return { voice: makeKeys(s), key: s };
  const notes = getInstrument(s);
  if (notes) return { voice: makeSampledKeys(s, notes), key: s };
  return { voice: makeKeys(s === 'piano' || s === 'vibes' ? 'rhodes' : s === 'ocarina' ? 'flute' : 'musicbox'), key: 'loading:' + s };
}
import {
  makeBass,
  makeCrackleBuffer,
  makeKeys,
  makeSampledKeys,
  makeSampleDrum,
  makeSynthDrum,
  type DrumVoice,
  type KeysVoice,
} from './instruments';

/** Load every recorded sound a project uses (kit drums + instruments). Resolves when ready. */
export function loadProjectBuiltins(p: Project): Promise<void> {
  const kit = allDrums(p).flatMap(({ voice, track }) => {
    const s = track.sound;
    const path = s.kind === 'synth' ? kitSamplePath(voice, s.id) : null;
    return path ? [path] : [];
  });
  const inst = [p.chords.sound, ...allMelodies(p).map((m) => m.track.sound)].filter((s): s is SampledInstrument =>
    (SAMPLED_INSTRUMENTS as readonly string[]).includes(s),
  );
  return loadBuiltins(kit, inst);
}

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
  /** Song-level volume, for fade in / fade out. */
  private songGain = new Tone.Gain(1);
  private wobble = new Tone.Vibrato({ frequency: 0.6, depth: 0.1, wet: 1 });
  private crackle: Tone.Player;
  private crackleGain = new Tone.Gain(0);

  /** Drum voices by row key (built-in row name or added row id). */
  private drums: Record<string, { voice: DrumVoice; vol: Tone.Volume; key: string }> = {};
  private keys: { voice: KeysVoice; key: string } | null = null;
  private keysVol = new Tone.Volume(0);
  /** Melody voices by melody id, each with its own volume. */
  private melodies = new Map<string, { voice: KeysVoice; key: string; vol: Tone.Volume; vib: Tone.Vibrato; lp: Tone.Filter }>();
  private bass: Tone.MonoSynth | null = null;
  private bassKey = '';
  private bassVol = new Tone.Volume(0);
  /** The song's sample: one player for the file, retriggered at each hit. */
  private sampler: Tone.Player | null = null;
  private samplerKey = '';
  private sampleVol = new Tone.Volume(0);
  private lastCrunch = -1;

  /** Called when a row's imported sample isn't available (it falls back to the built-in kit). */
  onMissingSample?: (name: string) => void;

  constructor(private getBuffer: BufferLookup) {
    // master chain: input -> [dry | crushed] -> lowpass -> reverb -> comp -> limiter -> out
    this.input.connect(this.crushMix.a);
    this.input.chain(this.crushShaper, this.crushMix.b);
    this.crushMix.chain(this.filter, this.reverb, this.comp, this.limiter, this.master, this.songGain, Tone.getDestination());

    // crackle sits on top of the mix, after the crusher/filter/reverb
    this.crackle = new Tone.Player({ url: makeCrackleBuffer(4, Tone.getContext().sampleRate), loop: true });
    this.crackle.chain(this.crackleGain, this.comp);
    this.crackle.sync().start(0);

    this.keysVol.chain(this.wobble, this.input);
    this.bassVol.connect(this.input);
    this.sampleVol.connect(this.input);
  }

  /** Wait for async setup (reverb impulse response). */
  async ready() {
    await this.reverb.ready;
  }

  /** Bring every node in line with the project. Cheap to call on every edit. */
  apply(p: Project) {
    const drums = allDrums(p);
    // rows that were removed
    for (const key of Object.keys(this.drums)) {
      if (drums.some((d) => d.key === key)) continue;
      this.drums[key].voice.dispose();
      this.drums[key].vol.dispose();
      delete this.drums[key];
    }
    for (const { key: row, voice: kind, track: t } of drums) {
      // built-in recorded kit sounds (or null for the synthesized kits)
      const kitPath = t.sound.kind === 'synth' ? kitSamplePath(kind, t.sound.id) : null;
      const kitBuf = kitPath ? getKitBuffer(kitPath) : undefined;
      const buf = t.sound.kind === 'user' ? this.getBuffer(t.sound.id) : undefined;
      const key =
        t.sound.kind === 'user'
          ? (buf ? 'user:' : 'missing:') + t.sound.id
          : kitPath
            ? (kitBuf ? 'kit:' : 'kit-loading:') + kitPath
            : 'synth:' + t.sound.id;
      const cur = this.drums[row];
      if (!cur || cur.key !== key) {
        let v: DrumVoice;
        if (kitBuf) v = makeSampleDrum(kitBuf, KIT_GAIN[kind]);
        else if (t.sound.kind === 'synth') v = makeSynthDrum(kind, kitPath ? 'dusty' : t.sound.id); // synth stands in while a kit loads
        else if (buf) v = makeSampleDrum(buf);
        else {
          v = makeSynthDrum(kind, 'dusty');
          this.onMissingSample?.(t.sound.name);
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

    if (!this.keys || this.keys.key !== voiceKey(p.chords.sound)) {
      this.keys?.voice.dispose();
      this.keys = makeVoice(p.chords.sound);
      this.keys.voice.output.connect(this.keysVol);
    }
    this.keysVol.volume.value = toDb(p.chords.volume);

    const melodies = allMelodies(p);
    for (const [id, m] of this.melodies) {
      if (melodies.some((x) => x.id === id)) continue;
      m.voice.dispose();
      m.vib.dispose();
      m.lp.dispose();
      m.vol.dispose();
      this.melodies.delete(id);
    }
    for (const { id, track } of melodies) {
      let m = this.melodies.get(id);
      if (!m || m.key !== voiceKey(track.sound)) {
        m?.voice.dispose();
        const vol = m?.vol ?? new Tone.Volume(0).connect(this.wobble);
        const lp = m?.lp ?? new Tone.Filter({ type: 'lowpass', frequency: 18000, Q: 0.4 }).connect(vol);
        const vib = m?.vib ?? new Tone.Vibrato({ frequency: 5, depth: 0, wet: 1 }).connect(lp);
        const made = makeVoice(track.sound);
        made.voice.output.connect(vib);
        m = { ...made, vol, vib, lp };
        this.melodies.set(id, m);
      }
      // the instrument's shaping: how a note starts and ends, vibrato, and brightness
      const tone = resolveTone(track.sound, track.tone);
      m.voice.setFeel(softToAttack(tone.soft), fadeToRelease(tone.fade));
      m.vib.depth.value = vibratoToDepth(tone.vibrato);
      m.lp.frequency.rampTo(brightToCutoff(tone.bright), 0.05);
      // +5 dB: a single melody line needs to sit on top of the (multi-note) chords
      m.vol.volume.value = track.mute ? -Infinity : toDb(track.volume) + 5;
    }

    if (!this.bass || this.bassKey !== p.bass.sound) {
      this.bass?.dispose();
      this.bass = makeBass(p.bass.sound).connect(this.bassVol);
      this.bassKey = p.bass.sound;
    }
    this.bassVol.volume.value = !p.bass.enabled ? -Infinity : toDb(p.bass.volume);

    // the sample: a new player when the file changes (or once it has loaded); none while it's missing
    const sm = p.sample;
    const buf = sm ? this.getBuffer(sm.id) : undefined;
    const key = sm && buf ? sm.id : '';
    if (key !== this.samplerKey) {
      this.sampler?.dispose();
      this.sampler = buf ? new Tone.Player({ url: new Tone.ToneAudioBuffer(buf), fadeIn: 0.004, fadeOut: 0.02 }).connect(this.sampleVol) : null;
      this.samplerKey = key;
    }
    if (sm && this.sampler) this.sampler.playbackRate = sampleRate(sm.pitch);
    this.sampleVol.volume.value = !sm || sm.mute ? -Infinity : toDb(sm.volume);

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

  /**
   * Schedule everything that happens at `step` (0..bars*16-1) at audio time `time`.
   * In a song, `opts.mute` silences parts for this block and `opts.fill` swaps in a drum fill.
   */
  scheduleStep(step: number, time: number, p: Project, opts: { mute?: Record<Part, boolean>; fill?: boolean } = {}) {
    const sd = stepSeconds(p.bpm);
    const mute = opts.mute;
    const total = p.bars * STEPS_PER_BAR;

    if (!mute?.drums) {
      if (opts.fill) {
        // Drum fill on the last beat: snare on every 16th, getting louder, kick on the first.
        // Hats keep going so the groove doesn't drop out.
        const k = step - (total - 4); // 0..3
        this.drums.snare?.voice.trigger(time, 0.45 + k * 0.18);
        if (k === 0) this.drums.kick?.voice.trigger(time, 0.9);
        if (k === 3) this.drums.openhat?.voice.trigger(time, 0.7);
        const hat = p.drums.hat.steps[step];
        if (hat) this.drums.hat?.voice.trigger(time, hat === 2 ? 0.9 : 0.6);
        // added rows keep playing through the fill, like the hats
        for (const d of p.extraDrums) {
          const s = d.steps[step];
          if (s) this.drums[d.id]?.voice.trigger(time, s === 2 ? 0.9 : 0.6);
        }
      } else {
        for (const { key, track } of allDrums(p)) {
          const s = track.steps[step];
          // Little bit of human feel: random velocity wobble.
          if (s) this.drums[key]?.voice.trigger(time, (s === 2 ? 1 : 0.68) * (0.92 + Math.random() * 0.08));
        }
      }
    }

    const len = slotLength(p.bars, p.chords.slots.length);
    const slotIdx = Math.min(p.chords.slots.length - 1, Math.floor(step / len));
    const within = step - slotIdx * len;
    const chord = p.chords.slots[slotIdx];

    if (chord && this.keys && !mute?.chords) {
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
    if (p.bass.enabled && bassMode && chord && this.bass && !mute?.bass) {
      const note = bassNote(chord, bassMode as 1 | 2 | 3);
      if (note) {
        // hold until the next bass hit (max half a bar, or end of chord slot)
        let n = 1;
        while (n < 8 && !p.bass.steps[(step + n) % total] && within + n < len) n++;
        this.bass.triggerAttackRelease(note, n * sd * 0.9, time, 0.8);
      }
    }

    if (!mute?.melody) {
      for (const { id, track } of allMelodies(p)) {
        const voice = this.melodies.get(id)?.voice;
        if (!voice) continue;
        for (const m of track.notes) {
          if (m.s !== step || m.d >= MELODY_ROWS) continue;
          const note = melodyPitch(p.tonic, p.mood, track.octave, m.d, m.x ?? 0);
          const l = Math.min(m.l, total - m.s);
          voice.play([note], l * sd * 0.92, time, 0.75 + Math.random() * 0.1);
        }
      }
    }

    // the sample: from each hit, its trimmed clip plays until it ends, the next hit, or the end of the loop
    const sm = p.sample;
    if (sm && this.sampler && !mute?.sample && sm.steps[step]) {
      let n = 1;
      while (step + n < total && !sm.steps[step + n]) n++;
      const seconds = Math.min(sm.length / sampleRate(sm.pitch), n * sd);
      this.playSample(sm.start, seconds, time);
    }
  }

  /** Start the sample's clip at `offset` (seconds into the file) and stop it `seconds` later. */
  private playSample(offset: number, seconds: number, time: number) {
    const s = this.sampler;
    if (!s?.loaded) return;
    s.start(time, Math.min(offset, Math.max(0, s.buffer.duration - 0.01)));
    s.stop(time + seconds);
  }

  /** Hear the sample's trimmed clip right now (the Sample editor's ▶ Preview). */
  previewSample(p: Project) {
    if (!p.sample) return;
    this.sampler?.stop();
    this.playSample(p.sample.start, p.sample.length / sampleRate(p.sample.pitch), Tone.now() + 0.02);
  }

  /**
   * Previews (hearing a key, a kit, a progression…) play several notes in a row. Their later notes
   * wait on timers rather than being fixed on the audio clock, so a new preview (or tapping again)
   * can cancel them: previews never pile up on top of each other.
   */
  private previewTimers: number[] = [];

  /** Stop the preview that's playing: its notes still to come, and what's still ringing (unless the song is playing). */
  cutPreviews() {
    this.previewTimers.forEach((t) => clearTimeout(t));
    this.previewTimers = [];
    if (Tone.getTransport().state !== 'started') this.silence();
  }

  /** Run `fn` with an audio time `offset` seconds from now, as part of the current preview. */
  private later(offset: number, fn: (time: number) => void) {
    if (offset <= 0.01) return fn(Tone.now() + 0.03);
    this.previewTimers.push(window.setTimeout(() => fn(Tone.now() + 0.01), offset * 1000));
  }

  /** Hear chords one after another, `gap` seconds apart (a progression, or the key). Replaces any preview playing. */
  previewChords(chords: (ChordSlot | string)[], gap: number, dur: number) {
    this.cutPreviews();
    chords.forEach((c, i) => this.later(i * gap, (t) => this.preview(c, t, dur)));
  }

  /** Hear one chord, replacing any preview playing. */
  previewChord(chord: ChordSlot | string) {
    this.cutPreviews();
    this.preview(chord, Tone.now() + 0.02);
  }

  /** Hear the first bar of a melody at the song's tempo (after making a new one, say). */
  previewMelodyBar(p: Project, melodyId: string) {
    const track = allMelodies(p).find((m) => m.id === melodyId)?.track;
    const voice = this.melodies.get(melodyId)?.voice;
    if (!track || !voice) return;
    this.cutPreviews();
    const sd = stepSeconds(p.bpm);
    for (const n of track.notes) {
      if (n.s >= STEPS_PER_BAR || n.d >= MELODY_ROWS) continue;
      const note = melodyPitch(p.tonic, p.mood, track.octave, n.d, n.x ?? 0);
      this.later(n.s * sd, (t) => voice.play([note], Math.min(n.l, STEPS_PER_BAR - n.s) * sd * 0.92, t, 0.75));
    }
  }

  /** Play a chord at `time` (the building block of the previews above; doesn't stop anything). */
  preview(chord: ChordSlot | string, time = Tone.now(), dur = 1.2) {
    const slot = typeof chord === 'string' ? { symbol: chord } : chord;
    slotNotes(slot).forEach((n, i) => this.keys?.voice.play([n], dur, time + i * 0.015, 0.7));
    const b = bassNote(slot);
    if (b) this.bass?.triggerAttackRelease(b, dur, time, 0.6);
  }

  /** Play one note right now (piano roll / keyboard clicks), on a melody's instrument or the chords'. */
  previewNote(note: string, kind: 'melody' | 'keys' = 'melody', dur = 0.4, melodyId = MAIN_MELODY) {
    const v = kind === 'melody' ? this.melodies.get(melodyId) : this.keys;
    v?.voice.play([note], dur, Tone.now(), 0.75);
  }

  /** A two-bar taste of a beat (chords + a simple groove) at its tempo and swing, for the new-beat wizard. */
  previewDemo(p: Project) {
    this.cutPreviews();
    const sd = stepSeconds(p.bpm);
    const late = (i: number) => (i % 2 === 1 ? sd * (p.swing / 100) * 0.5 : 0); // rough swing on the off-16ths
    const chords = p.chords.slots.filter((c): c is NonNullable<typeof c> => !!c);
    // one timer per beat (so it can be cancelled), with that beat's hits placed exactly on the audio clock
    for (let beat = 0; beat < 8; beat++) {
      this.later(beat * 4 * sd, (t0) => {
        const b = Math.floor(beat / 4);
        const chord = chords[b % Math.max(1, chords.length)];
        if (beat % 4 === 0 && chord) this.preview(chord, t0, 16 * sd * 0.95);
        for (let k = 0; k < 4; k++) {
          const i = beat * 4 + k;
          const s = i % 16;
          const t = t0 + k * sd + late(i);
          if (s === 0 || s === 10) this.drums.kick?.voice.trigger(t, s === 0 ? 0.95 : 0.7);
          if (s === 4 || s === 12) this.drums.snare?.voice.trigger(t, 0.85);
          if (s % 2 === 0) this.drums.hat?.voice.trigger(t, s % 4 === 0 ? 0.8 : 0.55);
        }
      });
    }
  }

  /** Hear the drum kit: kick, snare, then a couple of hats. */
  previewKit() {
    this.cutPreviews();
    this.later(0, (t) => this.drums.kick?.voice.trigger(t, 0.9));
    this.later(0.3, (t) => this.drums.snare?.voice.trigger(t, 0.8));
    this.later(0.6, (t) => {
      this.drums.hat?.voice.trigger(t, 0.7);
      this.drums.hat?.voice.trigger(t + 0.15, 0.55);
    });
  }

  /** Hear the bass sound: the first chord's root, then its fifth. */
  previewBass(p: Project) {
    const chord = p.chords.slots.find((s) => s);
    if (!chord) return;
    this.cutPreviews();
    const root = bassNote(chord, 1);
    const fifth = bassNote(chord, 2);
    if (root) this.later(0, (t) => this.bass?.triggerAttackRelease(root, 0.4, t, 0.8));
    if (fifth) this.later(0.45, (t) => this.bass?.triggerAttackRelease(fifth, 0.4, t, 0.8));
  }

  /** Hear a melody's instrument: three notes up its scale. */
  previewMelody(p: Project, melodyId: string) {
    const track = allMelodies(p).find((m) => m.id === melodyId)?.track;
    const voice = this.melodies.get(melodyId)?.voice;
    if (!track || !voice) return;
    this.cutPreviews();
    [0, 2, 4].forEach((d, i) => this.later(i * 0.22, (t) => voice.play([degreeNote(p.tonic, p.mood, track.octave, d)], 0.5, t, 0.75)));
  }

  /**
   * Play step `step` of the whole song (the arrangement) at `time`.
   * Returns where it fell, or null past the end of the song.
   */
  scheduleSongStep(step: number, time: number, p: Project) {
    const at = locate(buildTimeline(p), step);
    if (!at) return null;
    this.scheduleStep(at.local, time, at.seg.view, { mute: at.seg.block.mute, fill: at.fillNow });
    return at;
  }

  /** Song fades: set up from `start` (audio time) for a song of `seconds` length. */
  scheduleFades(p: Project, start: number, seconds: number) {
    const g = this.songGain.gain;
    const bar = stepSeconds(p.bpm) * STEPS_PER_BAR;
    g.cancelScheduledValues(start);
    g.setValueAtTime(p.fadeIn ? 0 : 1, start);
    if (p.fadeIn) g.linearRampToValueAtTime(1, start + Math.min(FADE_IN_BARS * bar, seconds / 3));
    if (p.fadeOut) {
      const len = Math.min(FADE_OUT_BARS * bar, seconds / 3);
      g.setValueAtTime(1, start + seconds - len);
      g.linearRampToValueAtTime(0, start + seconds);
    }
  }

  /** Back to full volume right away (stopping or switching to section playback). */
  resetFades() {
    const g = this.songGain.gain;
    g.cancelScheduledValues(0);
    g.value = 1;
  }

  silence() {
    this.keys?.voice.releaseAll();
    for (const m of this.melodies.values()) m.voice.releaseAll();
    this.bass?.triggerRelease();
    this.sampler?.stop();
  }

  dispose() {
    for (const d of Object.values(this.drums)) {
      d.voice.dispose();
      d.vol.dispose();
    }
    this.keys?.voice.dispose();
    for (const m of this.melodies.values()) {
      m.voice.dispose();
      m.vib.dispose();
      m.lp.dispose();
      m.vol.dispose();
    }
    this.bass?.dispose();
    this.sampler?.dispose();
    this.sampleVol.dispose();
    [this.input, this.crushShaper, this.crushMix, this.filter, this.reverb, this.comp, this.limiter, this.master, this.songGain,
      this.wobble, this.crackle, this.crackleGain, this.keysVol, this.bassVol].forEach((n) => n.dispose());
  }
}
