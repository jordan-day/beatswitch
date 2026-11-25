import { beforeEach, describe, expect, it } from 'vitest';
import { buildPreset } from '../music/presets';
import { useProject } from './project';
import { MAIN_MELODY } from './tracks';

const notes = () => [...useProject.getState().project.melody.notes].sort((a, b) => a.s - b.s || a.d - b.d);

describe('editing melody notes', () => {
  beforeEach(() => {
    const p = buildPreset(0);
    p.melody.notes = [
      { s: 0, l: 6, d: 5 },
      { s: 8, l: 2, d: 5 },
    ];
    useProject.getState().load(p);
  });

  it('splits a note in two at a step inside it', () => {
    useProject.getState().splitNote(0, 5, 3, MAIN_MELODY);
    expect(notes()).toEqual([
      { s: 0, l: 3, d: 5 },
      { s: 3, l: 3, d: 5 },
      { s: 8, l: 2, d: 5 },
    ]);
  });

  it('does not split at the note start or past its end', () => {
    useProject.getState().splitNote(0, 5, 0, MAIN_MELODY);
    useProject.getState().splitNote(0, 5, 6, MAIN_MELODY);
    expect(notes()).toHaveLength(2);
  });

  it('moves a note in time and pitch, keeping its length', () => {
    useProject.getState().moveNote(0, 5, 10, 7, MAIN_MELODY);
    expect(notes()).toContainEqual({ s: 10, l: 6, d: 7 });
  });

  it('keeps a moved note inside the loop and the grid', () => {
    const total = useProject.getState().project.bars * 16;
    useProject.getState().moveNote(0, 5, 999, 99, MAIN_MELODY);
    const moved = notes().find((n) => n.l === 6)!;
    expect(moved.s + moved.l).toBe(total);
    expect(moved.d).toBeLessThan(15);
  });

  it('refuses a move that would land on another note', () => {
    useProject.getState().moveNote(0, 5, 7, 5, MAIN_MELODY); // would overlap the note at step 8
    expect(notes()).toContainEqual({ s: 0, l: 6, d: 5 });
  });

  it('moves several notes together, all or nothing', () => {
    const keys = [
      { s: 0, d: 5 },
      { s: 8, d: 5 },
    ];
    useProject.getState().moveNotes(keys, 2, 1, MAIN_MELODY);
    expect(notes()).toEqual([
      { s: 2, l: 6, d: 6 },
      { s: 10, l: 2, d: 6 },
    ]);
    // pushing the group past the end of the loop moves nothing at all
    useProject.getState().moveNotes([{ s: 2, d: 6 }, { s: 10, d: 6 }], 60, 0, MAIN_MELODY);
    expect(notes()[0]).toEqual({ s: 2, l: 6, d: 6 });
  });

  it('removes several notes at once', () => {
    useProject.getState().removeNotes([{ s: 0, d: 5 }, { s: 8, d: 5 }], MAIN_MELODY);
    expect(notes()).toEqual([]);
  });

  it('pastes notes, replacing what they overlap on the same row', () => {
    useProject.getState().pasteNotes([{ s: 4, l: 3, d: 5 }, { s: 20, l: 2, d: 9 }], MAIN_MELODY);
    const n = notes();
    expect(n).toContainEqual({ s: 4, l: 3, d: 5 });
    expect(n).toContainEqual({ s: 20, l: 2, d: 9 });
    expect(n).not.toContainEqual({ s: 0, l: 6, d: 5 }); // overlapped, so replaced
    expect(n).toContainEqual({ s: 8, l: 2, d: 5 });
  });
});
