import { beforeEach, describe, expect, it } from 'vitest';
import { buildPreset } from '../music/presets';
import { useProject, useUi } from './project';

const ui = () => useUi.getState();

describe('bar and chord selection stay in sync', () => {
  beforeEach(() => {
    useProject.getState().load(buildPreset(0)); // 4 bars, one chord per bar
    ui().set({ viewBar: 0, selectedSlot: 0 });
  });

  it('picking a bar selects its first chord', () => {
    ui().set({ viewBar: 2 });
    expect(ui().selectedSlot).toBe(2);
  });

  it('picking a chord moves to its bar', () => {
    ui().set({ selectedSlot: 3 });
    expect(ui().viewBar).toBe(3);
  });

  it('with 8 chords, a bar holds two chords and keeps a chord that is already in it', () => {
    useProject.getState().setChordCount(8);
    ui().set({ viewBar: 1 });
    expect(ui().selectedSlot).toBe(2);
    ui().set({ selectedSlot: 3 });
    expect(ui().viewBar).toBe(1);
    ui().set({ viewBar: 1 });
    expect(ui().selectedSlot).toBe(3); // already inside bar 2, so it stays
  });

  it('changing the chord count keeps you on the same bar', () => {
    ui().set({ viewBar: 2 });
    useProject.getState().setChordCount(8);
    expect(ui().viewBar).toBe(2);
    expect(Math.floor(ui().selectedSlot / 2)).toBe(2);
  });

  it('clamps out-of-range values', () => {
    ui().set({ viewBar: 99 });
    expect(ui().viewBar).toBe(3);
    ui().set({ selectedSlot: -5 });
    expect(ui().viewBar).toBe(0);
  });
});
