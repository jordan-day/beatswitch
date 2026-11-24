export const DRUM_ROWS = ['kick', 'snare', 'hat', 'openhat', 'perc'] as const;
export type DrumRow = (typeof DRUM_ROWS)[number];

export const MOODS = ['chill', 'dreamy', 'sad', 'jazzy'] as const;
export type Mood = (typeof MOODS)[number];

import type { Section, SongBlock } from './song';

/** Sampled (recorded) instruments, from VCSL (CC0); see public/samples. */
export const SAMPLED_INSTRUMENTS = ['piano', 'vibes', 'kalimba', 'glock', 'ocarina'] as const;
export type SampledInstrument = (typeof SAMPLED_INSTRUMENTS)[number];

export const KEYS_SOUNDS = ['rhodes', 'piano', 'vibes', 'kalimba', 'pad', 'musicbox'] as const;
export type KeysSound = (typeof KEYS_SOUNDS)[number];

export const MELODY_SOUNDS = ['musicbox', 'kalimba', 'glock', 'vibes', 'piano', 'ocarina', 'rhodes', 'flute', 'lead'] as const;
export type MelodySound = (typeof MELODY_SOUNDS)[number];

export const BASS_SOUNDS = ['round', 'sub', 'pluck'] as const;
export type BassSound = (typeof BASS_SOUNDS)[number];

/**
 * Built-in drum sounds. 'dusty' and 'soft' are synthesized; 'acoustic' is a recorded kit
 * (each row gets its own drum); 'clap', 'shaker' and 'tambourine' are recorded one-shots for any row.
 */
export const SYNTH_KITS = ['dusty', 'soft', 'acoustic', 'clap', 'shaker', 'tambourine'] as const;
export type SynthKit = (typeof SYNTH_KITS)[number];
/** The full kits (one sound per row), offered in the "Drum kit" switch. */
export const FULL_KITS = ['acoustic', 'dusty', 'soft'] as const;

export type ChordRhythm = 'whole' | 'half' | 'stab' | 'custom';

/** A sound is either a built-in synth kit, or a sample the user imported (stored in IndexedDB). */
export type SoundRef =
  | { kind: 'synth'; id: SynthKit }
  | { kind: 'user'; id: string; name: string };

/** 0 = off, 1 = on, 2 = accent (louder) */
export type Step = 0 | 1 | 2;

/** Bass step: 0 = off, 1 = root, 2 = fifth, 3 = octave up */
export type BassStep = 0 | 1 | 2 | 3;

/** Max loop length is 4 bars of 16 steps; only the first `bars * 16` steps are played. */
export const STEPS_PER_BAR = 16;
export const MAX_BARS = 4;
export const MAX_STEPS = STEPS_PER_BAR * MAX_BARS;
export const CHORD_COUNTS = [4, 8] as const;

export interface ChordSlot {
  /** Chord name, e.g. "Am7". Also decides the bass note. */
  symbol: string;
  /** Hand-picked notes (e.g. ["A2","C3","G3"]). When absent, an automatic voicing of `symbol` is used. */
  notes?: string[];
}

/** One melody note. `d` is a scale degree (0 = key note, 7 = key note an octave up), so it follows key changes. */
export interface MelodyNote {
  s: number; // start step 0..63
  l: number; // length in steps
  d: number; // scale degree 0..14
}
export const MELODY_ROWS = 15;

export interface DrumTrack {
  sound: SoundRef;
  steps: Step[];
  volume: number; // 0..1
  mute: boolean;
}

/** A drum row you added to the pad, on top of the five built-in rows. */
export interface ExtraDrum extends DrumTrack {
  id: string;
  /** Which kind of drum the built-in kits play on this row (e.g. a "snare" from the soft kit). */
  voice: DrumRow;
}

export interface MelodyTrack {
  sound: MelodySound;
  octave: number; // 3..5, octave of the bottom row
  notes: MelodyNote[];
  volume: number;
  mute: boolean;
}

/** A melody you added, on top of the first one, with its own instrument. */
export interface ExtraMelody extends MelodyTrack {
  id: string;
}

export const MAX_EXTRA_DRUMS = 4;
export const MAX_EXTRA_MELODIES = 3;

export interface FxSettings {
  lofi: number; // macro 0..1
  crackle: number; // 0..1
  wobble: number; // 0..1
  muffle: number; // 0..1 (0 = bright, 1 = very muffled)
  crunch: number; // 0..1 (bitcrush)
  space: number; // 0..1 (reverb)
}

export interface Project {
  version: 1;
  name: string;
  bpm: number;
  swing: number; // 0..100
  bars: 1 | 2 | 4;
  tonic: string; // e.g. "C", "Eb"
  mood: Mood;
  drums: Record<DrumRow, DrumTrack>;
  chords: {
    sound: KeysSound;
    /** 4 or 8 chords, spread evenly over the loop. null = rest. */
    slots: (ChordSlot | null)[];
    rhythm: ChordRhythm;
    /** Hit pattern used when rhythm is 'custom'. */
    steps: boolean[];
    volume: number;
    /** The 8 chords from before switching to 4, so switching back to 8 restores them. */
    hidden8?: (ChordSlot | null)[];
  };
  bass: {
    enabled: boolean;
    sound: BassSound;
    steps: BassStep[];
    volume: number;
  };
  melody: MelodyTrack;
  /** Drum rows added to the pad. Sound and volume are song-wide; each section has its own hits. */
  extraDrums: ExtraDrum[];
  /** More melodies, each with its own instrument. Sound and volume are song-wide; notes are per section. */
  extraMelodies: ExtraMelody[];
  fx: FxSettings;

  // ---- song arrangement (see state/song.ts) ----
  /** All sections. The active one's patterns are the top-level fields above. */
  sections: Section[];
  activeSection: string;
  /** The arrangement: sections in order, with repeats, part mutes and fills. */
  song: SongBlock[];
  fadeIn: boolean;
  fadeOut: boolean;
}

export const BPM_MIN = 60;
export const BPM_MAX = 95;
