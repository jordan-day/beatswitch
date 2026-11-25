import { beforeEach, describe, expect, it } from 'vitest';
import { parseProject } from '../state/schema';
import { useProject } from '../state/project';
import { MAIN_MELODY } from '../state/tracks';
import { MELODY_SOUNDS } from '../state/types';
import { buildPreset } from './presets';
import { brightToCutoff, defaultTone, fadeToRelease, FEEL, resolveTone, softToAttack } from './tone';

describe('instrument shaping', () => {
  it('maps the sliders to sensible sound settings', () => {
    expect(softToAttack(0)).toBeLessThan(0.01);
    expect(softToAttack(1)).toBeGreaterThan(0.25);
    expect(fadeToRelease(1)).toBeGreaterThan(fadeToRelease(0));
    expect(brightToCutoff(0)).toBeLessThan(1000);
    expect(brightToCutoff(1)).toBeGreaterThan(15000);
  });

  it('starts from the instrument\'s own feel, so doing nothing changes nothing', () => {
    for (const sound of MELODY_SOUNDS) {
      const t = defaultTone(sound);
      expect(softToAttack(t.soft)).toBeCloseTo(Math.max(0.002, FEEL[sound].attack), 2);
      expect(fadeToRelease(t.fade)).toBeCloseTo(FEEL[sound].release, 1);
    }
    expect(defaultTone('ocarina').vibrato).toBeGreaterThan(0); // a player's breath
    expect(defaultTone('kalimba').vibrato).toBe(0);
  });

  it('fills in anything not set from the defaults', () => {
    const t = resolveTone('ocarina', { soft: 0.9 } as never);
    expect(t.soft).toBe(0.9);
    expect(t.bright).toBe(1);
  });
});

describe('shaping a melody in the store', () => {
  beforeEach(() => useProject.getState().load(buildPreset(0)));

  it('changes one slider, keeps the rest at their defaults, and resets', () => {
    useProject.getState().setMelodyTone({ vibrato: 0.8 }, MAIN_MELODY);
    const m = useProject.getState().project.melody;
    expect(m.tone!.vibrato).toBe(0.8);
    expect(m.tone!.bright).toBe(1);
    useProject.getState().setMelodyTone(null, MAIN_MELODY);
    expect(useProject.getState().project.melody.tone).toBeUndefined();
  });

  it('survives saving and loading, and ignores broken values', () => {
    useProject.getState().setMelodyTone({ fade: 0.7 }, MAIN_MELODY);
    const json = JSON.parse(JSON.stringify(useProject.getState().project));
    expect(parseProject(json)!.melody.tone!.fade).toBe(0.7);
    json.melody.tone = { soft: 'loud', fade: 2 };
    expect(parseProject(json)!.melody.tone).toBeUndefined();
  });
});
