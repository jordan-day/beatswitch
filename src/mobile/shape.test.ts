import { describe, expect, it } from 'vitest';
import { buildPreset } from '../music/presets';
import { buildTimeline, songSteps } from '../state/song';
import { applyMobileShape, hasMobileShape, MOBILE_SHAPE, newMobileSong, oneBarBeat } from './shape';

describe('the mobile song shape', () => {
  it('a new mobile song is one 4-bar loop arranged Intro, Loop, Loop, Breakdown, Loop, Outro', () => {
    const p = newMobileSong();
    expect(p.sections).toHaveLength(1);
    expect(p.bars).toBe(4);
    expect(p.song.map((b) => b.section)).toEqual(Array(6).fill(p.activeSection));
    expect(hasMobileShape(p)).toBe(true);
    expect(songSteps(p)).toBe(6 * 64);
    expect(p.fadeIn && p.fadeOut).toBe(true);
    // nothing but chords to start with: the wizard fills in the beat and melody
    expect(p.drums.kick.steps.some(Boolean)).toBe(false);
    expect(p.melody.notes).toEqual([]);
    expect(p.chords.slots.every(Boolean)).toBe(true);
  });

  it('the intro, breakdown and outro switch parts off; fills lead into the breakdown and outro', () => {
    const p = newMobileSong();
    const [intro, , loop2, breakdown, loop3, outro] = buildTimeline(p).map((s) => s.block);
    expect(intro.mute).toMatchObject({ drums: true, bass: true, chords: false, melody: true });
    expect(breakdown.mute).toMatchObject({ drums: true, bass: false, chords: false, melody: false });
    expect(outro.mute).toMatchObject({ drums: true, bass: true, chords: false, melody: false });
    expect([loop2.fill, loop3.fill]).toEqual([true, true]);
    expect(MOBILE_SHAPE.map((b) => b.name)).toEqual(['Intro', 'Loop', 'Loop', 'Breakdown', 'Loop', 'Outro']);
  });

  it('a song arranged on a computer is recognised, and can be given the shape (keeping the section being edited)', () => {
    const p = buildPreset(0);
    p.sections.push({ id: 'zzz', name: 'Chorus', patterns: structuredClone(p.sections[0].patterns) });
    expect(hasMobileShape(p)).toBe(false);
    applyMobileShape(p);
    expect(hasMobileShape(p)).toBe(true);
    expect(p.sections.map((s) => s.id)).toEqual([p.activeSection]);
  });

  it('the beat is one bar that repeats, and rows not on the mobile pad are cleared', () => {
    const p = buildPreset(0);
    p.drums.kick.steps[20] = 2; // something different in bar 2
    oneBarBeat(p);
    for (let b = 1; b < 4; b++) expect(p.drums.kick.steps.slice(b * 16, b * 16 + 16)).toEqual(p.drums.kick.steps.slice(0, 16));
    expect(p.bass.steps.slice(48)).toEqual(p.bass.steps.slice(0, 16));
    expect(p.drums.openhat.steps.some(Boolean) || p.drums.perc.steps.some(Boolean)).toBe(false);
  });
});
