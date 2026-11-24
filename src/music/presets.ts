import { defaultSong, newId, noMutes, type Part, type SongBlock } from '../state/song';
import type { BassStep, MelodyNote, Mood, Project, SynthKit } from '../state/types';
import { MAX_STEPS } from '../state/types';
import { PROGRESSIONS, progressionChords } from './chords';
import { lofiMacro, parsePattern, rhythmToSteps } from './patterns';

interface PresetDef {
  name: string;
  blurb: string;
  bpm: number;
  swing: number;
  tonic: string;
  mood: Mood;
  progression: number;
  keys: Project['chords']['sound'];
  rhythm: Exclude<Project['chords']['rhythm'], 'custom'>;
  lofi: number;
  kick: string;
  snare: string;
  hat: string;
  openhat: string;
  perc: string;
  /** x = root, 5 = fifth, 8 = octave up */
  bass: string;
  /** [start step, length, scale degree] */
  melody?: [number, number, number][];
  melodySound?: Project['melody']['sound'];
  kit?: SynthKit;
}

const PRESETS: PresetDef[] = [
  {
    name: 'Rainy Window',
    blurb: 'Sad & slow: real piano, drums and kalimba',
    bpm: 72, swing: 40, tonic: 'A', mood: 'sad', progression: 0, keys: 'piano', rhythm: 'whole', lofi: 0.6, kit: 'acoustic',
    kick:    'X.........x.....',
    snare:   '....X.......X...',
    hat:     'x.x.x.x.x.xxx.x.',
    openhat: '..............x.',
    perc:    '................',
    bass:    'x.........5.....',
    melody: [
      [2, 2, 4], [4, 2, 6], [6, 6, 7],
      [18, 2, 9], [20, 2, 7], [22, 8, 5],
      [34, 2, 8], [36, 2, 6], [38, 6, 5],
      [50, 2, 6], [52, 2, 4], [54, 8, 2],
    ],
    melodySound: 'kalimba',
  },
  {
    name: 'Late Night Study',
    blurb: 'Chill, steady, cozy',
    bpm: 82, swing: 35, tonic: 'F', mood: 'chill', progression: 0, keys: 'rhodes', rhythm: 'half', lofi: 0.45,
    kick:    'X......x..x.....',
    snare:   '....X.......X...',
    hat:     'X.x.X.x.X.x.X.xx',
    openhat: '................',
    perc:    '......x.........',
    bass:    'x......x..8.....',
  },
  {
    name: 'Sunday Coffee',
    blurb: 'Jazzy chords, bouncy, ocarina melody',
    bpm: 88, swing: 50, tonic: 'Eb', mood: 'jazzy', progression: 0, keys: 'rhodes', rhythm: 'stab', lofi: 0.35,
    kick:    'X.....x...x..x..',
    snare:   '....X.......X..x',
    hat:     'x.xxx.x.x.xxx.x.',
    openhat: '......x.........',
    perc:    '...x.......x....',
    bass:    'x.....5...x..8..',
    melody: [
      [0, 2, 6], [3, 2, 4], [6, 4, 2],
      [16, 2, 5], [19, 2, 4], [22, 4, 2],
      [32, 2, 3], [35, 2, 5], [38, 4, 7],
      [48, 2, 6], [51, 2, 4], [54, 6, 1],
    ],
    melodySound: 'ocarina',
  },
  {
    name: 'Dream Sequence',
    blurb: 'Floaty vibraphone, lots of space',
    bpm: 68, swing: 25, tonic: 'D', mood: 'dreamy', progression: 1, keys: 'vibes', rhythm: 'whole', lofi: 0.7,
    kick:    'X.......X.......',
    snare:   '....X.......X...',
    hat:     '..x...x...x...x.',
    openhat: '................',
    perc:    '..........x.....',
    bass:    'x.......x.......',
  },
];

export const PRESET_LIST = PRESETS.map((p, i) => ({ index: i, name: p.name, blurb: p.blurb }));

export function parseBass(s: string): BassStep[] {
  return Array.from({ length: MAX_STEPS }, (_, i) => {
    const ch = s[i % s.length];
    return ch === 'x' || ch === 'X' ? 1 : ch === '5' ? 2 : ch === '8' ? 3 : 0;
  });
}

export function buildPreset(index: number): Project {
  const p = PRESETS[index] ?? PRESETS[0];
  const synth = { kind: 'synth' as const, id: p.kit ?? ('dusty' as const) };
  const melody: MelodyNote[] = (p.melody ?? []).map(([s, l, d]) => ({ s, l, d }));
  return {
    version: 1,
    name: p.name,
    bpm: p.bpm,
    swing: p.swing,
    bars: 4,
    tonic: p.tonic,
    mood: p.mood,
    drums: {
      kick: { sound: synth, steps: parsePattern(p.kick), volume: 0.9, mute: false },
      snare: { sound: synth, steps: parsePattern(p.snare), volume: 0.7, mute: false },
      hat: { sound: synth, steps: parsePattern(p.hat), volume: 0.5, mute: false },
      openhat: { sound: synth, steps: parsePattern(p.openhat), volume: 0.45, mute: false },
      perc: { sound: synth, steps: parsePattern(p.perc), volume: 0.5, mute: false },
    },
    chords: {
      sound: p.keys,
      slots: progressionChords(p.tonic, PROGRESSIONS[p.mood][p.progression]).map((symbol) => ({ symbol })),
      rhythm: p.rhythm,
      steps: rhythmToSteps(p.rhythm, 4, 4),
      volume: 0.75,
    },
    bass: { enabled: true, sound: 'round', steps: parseBass(p.bass), volume: 0.7 },
    melody: { sound: p.melodySound ?? 'musicbox', octave: 4, notes: melody, volume: 0.6, mute: false },
    fx: { lofi: p.lofi, ...lofiMacro(p.lofi) },
    ...demoSong(),
  };
}

/**
 * Starter beats come as a short song made from their one section, using block mutes:
 * chords-only intro, the full loop, a breakdown without drums, the loop again with a fill, outro.
 */
function demoSong(): Pick<Project, 'sections' | 'activeSection' | 'song' | 'fadeIn' | 'fadeOut'> {
  const id = newId();
  const block = (repeats: number, mute: Partial<Record<Part, boolean>> = {}, fill = false): SongBlock => ({
    id: newId(),
    section: id,
    repeats,
    mute: { ...noMutes(), ...mute },
    fill,
  });
  return {
    sections: [{ id, name: 'Main' }],
    activeSection: id,
    song: [
      block(1, { drums: true, bass: true, melody: true }), // intro: just the chords
      block(2, {}, true),
      block(1, { drums: true }), // breakdown
      block(2, {}, true),
      block(1, { drums: true, bass: true }), // outro
    ],
    fadeIn: true,
    fadeOut: true,
  };
}

/**
 * A blank beat: no drums, bass or melody. With `withChords`, a starter chord progression is
 * already in place (so the bass and melody have something to follow); without, every chord is a rest.
 */
export function emptyProject(withChords = true): Project {
  const p = buildPreset(1);
  p.name = 'Untitled beat';
  for (const row of Object.values(p.drums)) row.steps = row.steps.map(() => 0);
  p.bass.steps = p.bass.steps.map(() => 0);
  p.melody.notes = [];
  if (!withChords) p.chords.slots = p.chords.slots.map(() => null);
  // a blank beat gets a plain one-section song (one block, 4 repeats)
  Object.assign(p, defaultSong());
  return p;
}
