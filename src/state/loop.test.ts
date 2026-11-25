import { describe, expect, it } from 'vitest';
import { buildPreset } from '../music/presets';
import { useProject } from './project';

describe('custom chord rhythm', () => {
  const pattern = () => state().chords.steps.slice(0, 16).map((b) => (b ? '#' : '.')).join('');

  it('starts from the rhythm you had, so it sounds the same until you change it', () => {
    load(); // Rainy Window: 'whole' rhythm, 4 chords over 4 bars
    useProject.getState().setRhythm('custom');
    expect(state().chords.rhythm).toBe('custom');
    expect(pattern()).toBe('#...............');
  });

  it('keeps your own pattern when you try another rhythm and come back', () => {
    load();
    useProject.getState().setRhythm('custom');
    useProject.getState().update((p) => void (p.chords.steps = p.chords.steps.map((_, i) => i % 16 === 3 || i % 16 === 11)));
    useProject.getState().setRhythm('stab');
    useProject.getState().setRhythm('custom');
    expect(pattern()).toBe('...#.......#....');
  });

  it('after going from 4 to 8 chords, custom has a hit for every chord (not just every other one)', () => {
    load(); // 4 chords, so the stored hits fit 4 chords
    useProject.getState().setRhythm('stab');
    useProject.getState().setChordCount(8);
    useProject.getState().setRhythm('custom');
    // Bouncy with 8 chords: 8 steps per chord, hits at 0, 3 and 5 of each, so both chords in a bar play
    expect(pattern()).toBe('#..#.#..#..#.#..');
  });

  it('after going from 8 to 4 chords, custom follows the 4-chord rhythm', () => {
    load();
    useProject.getState().setChordCount(8);
    useProject.getState().setRhythm('half');
    useProject.getState().setRhythm('whole');
    useProject.getState().setChordCount(4);
    useProject.getState().setRhythm('custom');
    expect(pattern()).toBe('#...............');
  });

  it('a fresh custom pattern follows the rhythm you switch from', () => {
    load();
    useProject.getState().setRhythm('half');
    useProject.getState().setRhythm('custom');
    expect(pattern()).toBe('#.......#.......');
  });
});

describe('changing the number of chords keeps your chords', () => {
  const syms = () => state().chords.slots.map((s) => s?.symbol ?? '-');

  it('8 -> 4 -> 8 chords brings back all 8 hand-picked chords', () => {
    load();
    const eight = ['Am7', 'Em7', 'Dm7', 'G7', 'Fmaj7', 'E7', 'Am9', 'Am7'];
    useProject.getState().update((p) => void (p.chords.slots = eight.map((symbol) => ({ symbol }))));
    useProject.getState().setChordCount(4);
    expect(syms()).toEqual(['Am7', 'Dm7', 'Fmaj7', 'Am9']);
    useProject.getState().setChordCount(8);
    expect(syms()).toEqual(eight);
  });

  it('if you change the 4 chords in between, 8 plays each of them twice instead', () => {
    load();
    useProject.getState().setChordCount(8);
    useProject.getState().setChordCount(4);
    useProject.getState().setSlot(0, { symbol: 'Cmaj7' });
    useProject.getState().setChordCount(8);
    expect(syms().slice(0, 2)).toEqual(['Cmaj7', 'Cmaj7']);
  });

  it('a mood change with 8 chords still swaps to the matching progression', () => {
    load(); // Rainy Window: A sad, progression 0
    useProject.getState().setChordCount(8);
    useProject.getState().setKeyMood('A', 'chill'); // chill progression 0 = Classic Lo-fi: I VI II V
    expect(syms()).toEqual(['Amaj7', 'Amaj7', 'F#m7', 'F#m7', 'Bm7', 'Bm7', 'E7', 'E7']);
  });

  it('clicking the mood you already have adds no undo step', () => {
    load();
    useProject.getState().setKeyMood(state().tonic, state().mood);
    useProject.getState().setRhythm(state().chords.rhythm);
    expect(useProject.getState().past).toHaveLength(0);
  });
});

const load = (bars: 1 | 2 | 4 = 4) => {
  const p = buildPreset(0); // Rainy Window: 4 bars, a melody in every bar
  p.bars = bars;
  useProject.setState({ project: p, past: [], future: [] });
  return p;
};
const state = () => useProject.getState().project;

describe('changing the loop length keeps your work', () => {
  it('4 -> 1 -> 4 bars keeps the melody of every bar', () => {
    const before = structuredClone(load().melody.notes);
    useProject.getState().setBars(1);
    useProject.getState().setBars(4);
    expect(state().melody.notes).toEqual(before);
  });

  it('4 -> 2 -> 4 bars keeps drums, bass, chord hits and melody exactly', () => {
    const p = load();
    p.drums.kick.steps[50] = 2; // something unique in bar 4
    p.bass.steps[40] = 3;
    p.chords.steps[60] = true;
    useProject.setState({ project: structuredClone(p) });
    useProject.getState().setBars(2);
    useProject.getState().setBars(4);
    expect(state().drums).toEqual(p.drums);
    expect(state().bass.steps).toEqual(p.bass.steps);
    expect(state().chords.steps).toEqual(p.chords.steps);
    expect(state().melody.notes).toEqual(p.melody.notes);
  });

  it('growing into empty bars repeats what you have, so the beat keeps going', () => {
    const p = load(1);
    // a 1-bar beat with nothing written beyond bar 1
    for (const d of Object.values(p.drums)) d.steps = d.steps.map((s, i) => (i < 16 ? s : 0));
    p.melody.notes = [{ s: 2, l: 2, d: 4 }];
    useProject.setState({ project: structuredClone(p) });
    useProject.getState().setBars(4);
    expect(state().drums.snare.steps.slice(16, 32)).toEqual(p.drums.snare.steps.slice(0, 16));
    expect(state().melody.notes.map((n) => n.s)).toEqual([2, 18, 34, 50]);
  });

  it('choosing the length you already have changes nothing (no extra undo step)', () => {
    load();
    useProject.getState().setBars(4);
    expect(useProject.getState().past).toHaveLength(0);
  });

  it('clearing a row at 1 bar stays cleared when growing back to 4', () => {
    load();
    useProject.getState().setBars(1);
    useProject.getState().clearRow('melody');
    useProject.getState().clearRow('kick');
    useProject.getState().setBars(4);
    expect(state().melody.notes).toEqual([]);
    expect(state().drums.kick.steps.every((s) => s === 0)).toBe(true);
  });

  it('undo after a length change brings the old length back', () => {
    load();
    useProject.getState().setBars(1);
    useProject.getState().undo();
    expect(state().bars).toBe(4);
  });
});
