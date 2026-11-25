import { describe, expect, it } from 'vitest';
import { Note } from 'tonal';
import { MELODY_ROWS, STEPS_PER_BAR } from '../state/types';
import { degreeNote, slotNotes } from './chords';
import { generateMelody } from './melody';
import { buildPreset } from './presets';

describe('generateMelody', () => {
  const p = buildPreset(0);

  it('makes valid, non-overlapping notes inside the loop', () => {
    for (let run = 0; run < 100; run++) {
      const notes = generateMelody(p);
      expect(notes.length).toBeGreaterThan(3);
      const sorted = [...notes].sort((a, b) => a.s - b.s);
      sorted.forEach((n, i) => {
        expect(n.d).toBeGreaterThanOrEqual(0);
        expect(n.d).toBeLessThan(MELODY_ROWS);
        expect(n.l).toBeGreaterThan(0);
        expect(n.s + n.l).toBeLessThanOrEqual(p.bars * STEPS_PER_BAR);
        if (i) expect(sorted[i - 1].s + sorted[i - 1].l).toBeLessThanOrEqual(n.s);
      });
    }
  });

  it('opens on a chord tone and settles on the tonic or a chord tone', () => {
    for (let run = 0; run < 100; run++) {
      const notes = generateMelody(p).sort((a, b) => a.s - b.s);
      const chroma = (step: number) =>
        new Set(slotNotes(p.chords.slots[Math.floor(step / (p.bars * STEPS_PER_BAR / p.chords.slots.length))]!).map((n) => Note.chroma(n)));
      const inChord = (n: { s: number; d: number }) => chroma(n.s).has(Note.chroma(degreeNote(p.tonic, p.mood, 4, n.d)));
      expect(inChord(notes[0])).toBe(true);
      expect(inChord(notes[notes.length - 1])).toBe(true);
    }
  });
});
