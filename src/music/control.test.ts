import { Chord, Note } from 'tonal';
import { describe, expect, it } from 'vitest';
import { parseProject } from '../state/schema';
import { MOODS } from '../state/types';
import {
  bassNote,
  chordFlavors,
  chordRoles,
  degreeNote,
  detectChord,
  fittingChords,
  invert,
  renameForNotes,
  scaleNotes,
  slotNotes,
  suggestNext,
  TONICS,
  transposeSlot,
} from './chords';
import { extendMelody, rhythmToSteps } from './patterns';
import { buildPreset, emptyProject } from './presets';

describe('chord suggestions', () => {
  it('only suggests real chords rooted in the key', () => {
    for (const tonic of TONICS)
      for (const mood of MOODS) {
        const scale = scaleNotes(tonic, mood).map((n) => Note.chroma(n));
        for (const prev of [null, ...fittingChords(tonic, mood)]) {
          const s = suggestNext(prev, tonic, mood);
          expect(s.length).toBeGreaterThanOrEqual(2);
          for (const { symbol, why } of s) {
            expect(Chord.get(symbol).empty, symbol).toBe(false);
            expect(scale).toContain(Note.chroma(Chord.get(symbol).tonic!));
            expect(why).toBeTruthy();
          }
        }
      }
  });

  it('after the V chord, suggests going home first', () => {
    expect(suggestNext('G7', 'C', 'chill')[0].symbol).toBe('Cmaj7');
  });
});

describe('chord notes', () => {
  it('names hand-picked notes', () => {
    expect(detectChord(['A2', 'C3', 'E3', 'G3'])).toBe('Am7');
    expect(detectChord(['C3', 'E3', 'G3'])).toBe('C');
    expect(detectChord(['C3'])).toBeNull();
  });

  it('keeps the chord name when only the voicing changes', () => {
    const up = invert(['A2', 'C#3', 'E3', 'G#3', 'B3'], 1);
    expect(renameForNotes('Amaj9', up)).toBe('Amaj9');
    // removing the 9th really changes the chord, and the root is kept when possible
    expect(renameForNotes('Amaj9', ['A2', 'C#3', 'E3', 'G#3'])).toBe('Amaj7');
    expect(renameForNotes('Am7', ['A2', 'C3', 'E3', 'G3', 'B3'])).toBe('Am9');
  });

  it('labels each note with its job', () => {
    const roles = chordRoles({ symbol: 'Am7' }).map((r) => r.role);
    expect(roles).toEqual(['root', '3rd', '5th', '7th']);
    expect(chordRoles({ symbol: 'Dm9' }).map((r) => r.role)).toContain('9th');
  });

  it('custom notes override the automatic voicing', () => {
    expect(slotNotes({ symbol: 'Am7', notes: ['C3', 'E3', 'G3', 'A3'] })).toEqual(['C3', 'E3', 'G3', 'A3']);
  });

  it('inversions keep the same notes, moved by an octave', () => {
    const up = invert(['A2', 'C3', 'E3', 'G3'], 1);
    expect(up).toEqual(['C3', 'E3', 'G3', 'A3']);
    expect(invert(up, -1)).toEqual(['A2', 'C3', 'E3', 'G3']);
  });

  it('every flavor is a valid chord with the same root', () => {
    for (const sym of ['C', 'Cmaj7', 'Am7', 'G7', 'Bm7b5', 'Dm9', 'E13']) {
      const root = Chord.get(sym).tonic;
      for (const f of chordFlavors(sym)) {
        expect(Chord.get(f.symbol).empty, f.symbol).toBe(false);
        expect(Chord.get(f.symbol).tonic).toBe(root);
      }
    }
  });

  it('bass can play root, fifth or octave', () => {
    expect(bassNote({ symbol: 'Am7' }, 1)).toBe('A1');
    expect(bassNote({ symbol: 'Am7' }, 2)).toBe('E2');
    expect(bassNote({ symbol: 'Am7' }, 3)).toBe('A2');
    expect(bassNote({ symbol: 'C/E' })).toBe('E2');
  });

  it('transposes hand-made chords to a new key', () => {
    expect(transposeSlot({ symbol: 'Am7' }, 'C', 'D')).toEqual({ symbol: 'Bm7' });
    expect(transposeSlot({ symbol: 'C/E', notes: ['E2', 'C3', 'G3'] }, 'C', 'F')).toEqual({
      symbol: 'F/A',
      notes: ['A2', 'F3', 'C4'],
    });
    // big jumps go down instead of up
    expect(transposeSlot({ symbol: 'C', notes: ['C3'] }, 'C', 'A').notes).toEqual(['A2']);
  });
});

describe('melody', () => {
  it('scale degrees map to key notes across octaves', () => {
    expect(degreeNote('C', 'chill', 4, 0)).toBe('C4');
    expect(degreeNote('C', 'chill', 4, 4)).toBe('G4');
    expect(degreeNote('C', 'chill', 4, 7)).toBe('C5');
    expect(degreeNote('A', 'sad', 4, 2)).toBe('C5');
    expect(degreeNote('A', 'sad', 4, 14)).toBe('A6');
  });

  it('repeats the melody when the loop grows', () => {
    const out = extendMelody([{ s: 2, l: 2, d: 4 }], 1, 4);
    expect(out.map((n) => n.s)).toEqual([2, 18, 34, 50]);
  });

  it('custom chord rhythm starts from the current rhythm', () => {
    const s = rhythmToSteps('half', 4, 4);
    expect(s.filter(Boolean)).toHaveLength(8);
    expect(s[0] && s[8] && s[16]).toBe(true);
  });
});

describe('blank starts', () => {
  it('"blank with chords" keeps a progression but nothing else', () => {
    const p = emptyProject(true);
    expect(p.chords.slots.every((s) => s && s.symbol)).toBe(true);
    expect(Object.values(p.drums).every((d) => d.steps.every((s) => s === 0))).toBe(true);
    expect(p.bass.steps.every((s) => s === 0)).toBe(true);
    expect(p.melody.notes).toEqual([]);
  });

  it('"completely empty" has no chords either, and survives a save/load', () => {
    const p = emptyProject(false);
    expect(p.chords.slots).toEqual([null, null, null, null]);
    expect(parseProject(JSON.parse(JSON.stringify(p)))!.chords.slots).toEqual([null, null, null, null]);
  });
});

describe('saved data from the first version still loads', () => {
  it('migrates string chord slots and boolean bass steps', () => {
    const old = JSON.parse(JSON.stringify(buildPreset(1))) as Record<string, any>;
    old.chords.slots = ['Fmaj7', 'Dm7', 'Gm7', 'C7'];
    delete old.chords.steps;
    old.bass = { enabled: true, steps: [true, false, true], volume: 0.5 };
    delete old.melody;
    const p = parseProject(old)!;
    expect(p.chords.slots[0]).toEqual({ symbol: 'Fmaj7' });
    expect(p.bass.steps.slice(0, 3)).toEqual([1, 0, 1]);
    expect(p.bass.sound).toBe('round');
    expect(p.melody.notes).toEqual([]);
    expect(p.chords.steps).toHaveLength(64);
  });

  it('rejects bad melody and chord data', () => {
    const p = parseProject({
      version: 1,
      drums: {},
      chords: { slots: [{ symbol: 'Am7', notes: ['A2', 'javascript:', 'C9x'] }, { symbol: '<img>' }, 'G7', null, 'C', 'F', 'G', 'Am', 'extra'] },
      melody: { notes: [{ s: 3, l: 2, d: 4 }, { s: -5, l: 1, d: 2 }, { s: 1, l: 1, d: 99 }, 'x'], octave: 9 },
    })!;
    expect(p.chords.slots).toHaveLength(8);
    expect(p.chords.slots[0]).toEqual({ symbol: 'Am7', notes: ['A2'] });
    expect(p.chords.slots[1]).toBeNull();
    expect(p.melody.notes).toEqual([{ s: 3, l: 2, d: 4 }]);
    expect(p.melody.octave).toBe(5);
  });
});
