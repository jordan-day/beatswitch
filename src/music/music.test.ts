import { Chord, Note } from 'tonal';
import { describe, expect, it } from 'vitest';
import { MOODS } from '../state/types';
import { bassNote, chordRoot, degreeToChord, fittingChords, PROGRESSIONS, progressionChords, scaleNotes, TONICS, voiceChord } from './chords';
import { chordHits, extendSteps, lofiMacro, nextLoopStep, parsePattern, randomDrums, slotLength } from './patterns';
import { buildPreset, PRESET_LIST } from './presets';

describe('chords', () => {
  it('turns roman numerals into the right chord', () => {
    expect(degreeToChord('C', ['VI', 'm7'])).toBe('Am7');
    expect(degreeToChord('C', ['V', '7'])).toBe('G7');
    expect(degreeToChord('A', ['bVII', '7'])).toBe('G7');
    expect(degreeToChord('A', ['bIII', 'maj7'])).toBe('Cmaj7');
    expect(degreeToChord('Eb', ['II', 'm9'])).toBe('Fm9');
  });

  it('every progression in every key is made of real chords', () => {
    for (const tonic of TONICS)
      for (const mood of MOODS)
        for (const prog of PROGRESSIONS[mood])
          for (const sym of progressionChords(tonic, prog)) {
            expect(Chord.get(sym).empty, `${sym} (${tonic} ${mood} ${prog.name})`).toBe(false);
            expect(voiceChord(sym).length).toBeGreaterThanOrEqual(3);
          }
  });

  it('"fitting" chords have their root in the key', () => {
    for (const tonic of TONICS)
      for (const mood of MOODS) {
        const scale = scaleNotes(tonic, mood).map((n) => Note.chroma(n));
        for (const sym of fittingChords(tonic, mood)) expect(scale).toContain(Note.chroma(chordRoot(sym)!));
      }
  });

  it('voicings stay in a warm mid range', () => {
    for (const tonic of TONICS)
      for (const sym of fittingChords(tonic, 'jazzy'))
        for (const n of voiceChord(sym)) {
          const m = Note.midi(n)!;
          expect(m).toBeGreaterThanOrEqual(36);
          expect(m).toBeLessThanOrEqual(72);
        }
  });

  it('bass notes are low', () => {
    for (const t of TONICS) {
      const m = Note.midi(bassNote(t + 'm7')!)!;
      expect(m).toBeGreaterThanOrEqual(24);
      expect(m).toBeLessThanOrEqual(43);
    }
  });
});

describe('patterns', () => {
  it('parses and repeats patterns to 64 steps', () => {
    const p = parsePattern('X...x...');
    expect(p).toHaveLength(64);
    expect(p.slice(0, 8)).toEqual([2, 0, 0, 0, 1, 0, 0, 0]);
    expect(p[56]).toBe(2);
  });

  it('spreads four chords evenly over the loop', () => {
    expect(slotLength(4)).toBe(16);
    expect(slotLength(2)).toBe(8);
    expect(slotLength(1)).toBe(4);
  });

  it('chord rhythms fit inside a slot', () => {
    for (const len of [4, 8, 16])
      for (const r of ['whole', 'half', 'stab'] as const)
        for (const h of chordHits(r, len)) {
          expect(h.offset).toBeGreaterThanOrEqual(0);
          expect(h.offset + h.length).toBeLessThanOrEqual(len);
        }
    expect(chordHits('stab', 16).map((h) => h.offset)).toEqual([0, 6, 10]);
  });

  it('repeats existing bars into empty ones when the loop grows', () => {
    const s = Array.from({ length: 64 }, (_, i) => (i < 16 ? i % 3 : 0));
    const out = extendSteps(s, 1, 4);
    expect(out.slice(16, 32)).toEqual(s.slice(0, 16));
    expect(out.slice(48, 64)).toEqual(s.slice(0, 16));
  });

  it('brings hidden bars back untouched when they still have something in them', () => {
    const s = Array.from({ length: 64 }, (_, i) => (i === 40 ? 2 : 0));
    expect(extendSteps(s, 1, 4)).toEqual(s);
  });

  it('the lo-fi knob moves every effect within 0..1', () => {
    for (let t = 0; t <= 1; t += 0.1) for (const v of Object.values(lofiMacro(t))) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    expect(lofiMacro(1).muffle).toBeGreaterThan(lofiMacro(0).muffle);
    expect(lofiMacro(0).crunch).toBe(0);
  });

  it('random drums always keep the backbone', () => {
    for (let i = 0; i < 20; i++) {
      const d = randomDrums();
      expect(d.kick[0]).toBe(2);
      expect(d.snare[4]).toBe(2);
      expect(d.snare[12]).toBe(2);
    }
  });

  it('random beats really vary, and never repeat the beat they replace', () => {
    const kicks = new Set<string>();
    const hats = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const d = randomDrums();
      kicks.add(d.kick.slice(0, 16).join(''));
      hats.add(d.hat.slice(0, 16).map(Boolean).join());
      // still lo-fi: kick on 1, snare on 2 and 4, one bar repeated
      expect([d.kick[0], d.snare[4], d.snare[12]]).toEqual([2, 2, 2]);
      expect(d.hat.slice(48)).toEqual(d.hat.slice(0, 16));
    }
    expect(kicks.size).toBeGreaterThanOrEqual(6);
    expect(hats.size).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < 50; i++) {
      const old = randomDrums();
      const next = randomDrums({ kick: old.kick, hat: old.hat });
      const same = (a: number[], b: number[]) => a.slice(0, 16).every((v, k) => !!v === !!b[k]);
      expect(same(next.kick, old.kick) && same(next.hat, old.hat)).toBe(false);
    }
  });

  it('presets build', () => {
    for (const pr of PRESET_LIST) {
      const p = buildPreset(pr.index);
      expect(p.chords.slots.every(Boolean)).toBe(true);
      expect(p.drums.kick.steps).toHaveLength(64);
    }
  });
});

describe('loop range', () => {
  /** Play `n` steps from the start and return them. */
  const run = (n: number, bars: number, loopBar: () => number | null) => {
    const out: number[] = [];
    let last = -1;
    for (let i = 0; i < n; i++) out.push((last = nextLoopStep(last, bars, loopBar())));
    return out;
  };

  it('loops every bar of the section', () => {
    const steps = run(64 + 3, 4, () => null);
    expect(steps.slice(0, 64)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    expect(steps.slice(64)).toEqual([0, 1, 2]);
  });

  it('loops only the selected bar', () => {
    const steps = run(32, 4, () => 2);
    expect(steps).toEqual([...Array.from({ length: 16 }, (_, i) => 32 + i), ...Array.from({ length: 16 }, (_, i) => 32 + i)]);
  });

  it('switches bars at the next bar line, not mid-bar', () => {
    let bar = 1;
    let last = -1;
    const steps: number[] = [];
    for (let i = 0; i < 24; i++) {
      if (i === 5) bar = 3; // picked another bar part-way through
      steps.push((last = nextLoopStep(last, 4, bar)));
    }
    expect(steps.slice(0, 16)).toEqual(Array.from({ length: 16 }, (_, i) => 16 + i)); // bar 2 finishes
    expect(steps.slice(16)).toEqual(Array.from({ length: 8 }, (_, i) => 48 + i)); // then bar 4
  });

  it('turning the one-bar loop off carries on into the next bar', () => {
    expect(nextLoopStep(31, 4, null)).toBe(32);
    expect(nextLoopStep(63, 4, null)).toBe(0);
  });

  it('keeps the looped bar inside the section', () => {
    expect(nextLoopStep(-1, 2, 3)).toBe(16);
  });
});
