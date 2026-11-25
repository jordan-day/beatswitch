import { describe, expect, it } from 'vitest';
import { parseProject } from '../state/schema';
import { buildTimeline, sectionView, songSteps } from '../state/song';
import { MELODY_ROWS } from '../state/types';
import { buildPreset, PRESET_LIST } from './presets';

describe('Ocarina Dreams starter song', () => {
  const index = PRESET_LIST.find((p) => p.name === 'Ocarina Dreams')!.index;
  const p = buildPreset(index);

  it('is a full song with an ocarina melody, in a minor key, slow and dusty', () => {
    expect(p.melody.sound).toBe('ocarina');
    expect(p.mood).toBe('sad');
    expect(p.tonic).toBe('D');
    expect(p.bpm).toBeLessThan(75);
    expect(p.fx.lofi).toBeGreaterThan(0.5);
    expect(p.sections.map((s) => s.name)).toEqual(['Intro', 'Verse', 'Bridge']);
    expect(songSteps(p) / 16).toBeGreaterThan(30); // more than 30 bars
    expect(buildTimeline(p).length).toBe(p.song.length);
  });

  it('survives saving and loading', () => {
    const back = parseProject(JSON.parse(JSON.stringify(p)));
    expect(back).not.toBeNull();
    expect(back!.sections).toHaveLength(3);
    expect(back!.song).toHaveLength(p.song.length);
  });

  it('has clean melodies: in the grid, never overlapping, and every section plays a tune', () => {
    for (const s of p.sections) {
      const v = sectionView(p, s.id);
      const notes = [...v.melody.notes].sort((a, b) => a.s - b.s);
      expect(notes.length).toBeGreaterThan(2);
      notes.forEach((n, i) => {
        expect(n.d).toBeGreaterThanOrEqual(0);
        expect(n.d).toBeLessThan(MELODY_ROWS);
        expect(n.s + n.l).toBeLessThanOrEqual(v.bars * 16);
        if (i) expect(notes[i - 1].s + notes[i - 1].l).toBeLessThanOrEqual(n.s);
      });
      expect(v.chords.slots.every(Boolean)).toBe(true);
    }
  });
});
