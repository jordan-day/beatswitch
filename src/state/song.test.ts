import { describe, expect, it } from 'vitest';
import { songDuration } from '../audio/export';
import { buildPreset, emptyProject } from '../music/presets';
import { decodeProject, encodeProject } from '../storage/share';
import { useProject } from './project';
import { parseProject } from './schema';
import { buildTimeline, locate, sectionView, songBars } from './song';

const store = () => useProject.getState();
const p = () => store().project;
const fresh = (project = emptyProject(true)) => useProject.setState({ project, past: [], future: [] });

describe('sections', () => {
  it('a new section starts as a copy of the current one, joins the song and opens', () => {
    fresh(buildPreset(0));
    const before = p();
    store().addSection();
    expect(p().sections).toHaveLength(2);
    expect(p().activeSection).toBe(p().sections[1].id);
    expect(p().drums.kick.steps).toEqual(before.drums.kick.steps);
    expect(p().song.at(-1)!.section).toBe(p().activeSection);
  });

  it('switching sections keeps each one\'s own patterns', () => {
    fresh(buildPreset(0));
    const verse = p().activeSection;
    store().addSection(); // now editing the copy
    const chorus = p().activeSection;
    store().update((d) => void (d.drums.kick.steps = d.drums.kick.steps.map(() => 2))); // chorus: kick on every step
    store().setBars(2);
    store().switchSection(verse);
    expect(p().bars).toBe(4);
    expect(p().drums.kick.steps.every((s) => s === 2)).toBe(false);
    store().switchSection(chorus);
    expect(p().bars).toBe(2);
    expect(p().drums.kick.steps.slice(0, 32).every((s) => s === 2)).toBe(true);
  });

  it('sounds, key and tempo are shared by every section', () => {
    fresh(buildPreset(0));
    const verse = p().activeSection;
    store().addSection();
    store().update((d) => {
      d.bpm = 90;
      d.chords.sound = 'vibes';
    });
    store().switchSection(verse);
    expect(p().bpm).toBe(90);
    expect(p().chords.sound).toBe('vibes');
  });

  it('deleting a section removes its blocks; the last section cannot be deleted', () => {
    fresh(buildPreset(0));
    const first = p().activeSection;
    store().addSection();
    const second = p().activeSection;
    store().deleteSection(second);
    expect(p().sections.map((s) => s.id)).toEqual([first]);
    expect(p().song.every((b) => b.section === first)).toBe(true);
    store().deleteSection(first);
    expect(p().sections).toHaveLength(1);
  });
});

describe('arrangement timeline', () => {
  it('lays blocks out with repeats and each section\'s own length', () => {
    fresh(emptyProject(true)); // one 4-bar section x4
    store().addSection();
    store().setBars(1); // new section: 1 bar, x2 (added by addSection)
    const t = buildTimeline(p());
    expect(t.map((s) => s.steps)).toEqual([4 * 64, 2 * 16]);
    expect(t[1].start).toBe(256);
    expect(songBars(p())).toBe(18);
  });

  it('fills only play on the last beat of the block\'s final pass', () => {
    fresh(emptyProject(true));
    store().toggleFill(0);
    const t = buildTimeline(p());
    expect(locate(t, 63)!.fillNow).toBe(false); // end of pass 1 of 4
    expect(locate(t, 251)!.fillNow).toBe(false);
    expect(locate(t, 252)!.fillNow).toBe(true);
    expect(locate(t, 255)!.fillNow).toBe(true);
    expect(locate(t, 256)).toBeNull(); // past the end
  });

  it('block part mutes are kept per block', () => {
    fresh(emptyProject(true));
    store().addBlock(p().activeSection);
    store().toggleBlockMute(1, 'drums');
    expect(p().song[0].mute.drums).toBe(false);
    expect(p().song[1].mute.drums).toBe(true);
  });

  it('moving and removing blocks', () => {
    fresh(buildPreset(0));
    const ids = p().song.map((b) => b.id);
    store().moveBlock(0, 1);
    expect(p().song.map((b) => b.id).slice(0, 2)).toEqual([ids[1], ids[0]]);
    store().removeBlock(0);
    expect(p().song).toHaveLength(ids.length - 1);
  });

  it('section views hold that section\'s patterns with the song-wide sounds', () => {
    fresh(buildPreset(0));
    const verse = p().activeSection;
    store().addSection();
    store().clearRow('kick');
    const v = sectionView(p(), verse);
    expect(v.drums.kick.steps.some(Boolean)).toBe(true);
    expect(v.drums.kick.sound).toEqual(p().drums.kick.sound);
  });

  it('song length in seconds follows bars, repeats and tempo', () => {
    fresh(emptyProject(true)); // 4 bars x4 = 16 bars at 82 bpm
    expect(songDuration(p())).toBeCloseTo((16 * 4 * 60) / p().bpm);
  });
});

describe('saving songs', () => {
  it('a song survives save/load with every section and block', () => {
    fresh(buildPreset(2));
    store().addSection();
    store().update((d) => void (d.melody.notes = [{ s: 0, l: 4, d: 7 }]));
    const saved = JSON.parse(JSON.stringify(p()));
    expect(parseProject(saved)).toEqual(p());
  });

  it('share links carry the whole song', () => {
    fresh(buildPreset(2));
    store().addSection();
    store().toggleFill(1);
    const back = decodeProject(encodeProject(p()).hash)!;
    expect(back.sections.map((s) => s.name)).toEqual(p().sections.map((s) => s.name));
    expect(back.song).toEqual(p().song);
    expect(buildTimeline(back).map((s) => s.steps)).toEqual(buildTimeline(p()).map((s) => s.steps));
  });

  it('beats saved before songs existed load as a one-section song', () => {
    const old = JSON.parse(JSON.stringify(buildPreset(1))) as Record<string, unknown>;
    delete old.sections;
    delete old.activeSection;
    delete old.song;
    const loaded = parseProject(old)!;
    expect(loaded.sections).toHaveLength(1);
    expect(loaded.song).toHaveLength(1);
    expect(loaded.song[0].section).toBe(loaded.activeSection);
  });

  it('rejects song data that points at missing sections', () => {
    const raw = JSON.parse(JSON.stringify(buildPreset(1)));
    raw.song.push({ id: 'zzz', section: 'nope', repeats: 99, mute: {}, fill: 'yes' });
    raw.song[0].repeats = 99;
    const loaded = parseProject(raw)!;
    expect(loaded.song.every((b) => loaded.sections.some((s) => s.id === b.section))).toBe(true);
    expect(loaded.song[0].repeats).toBe(8);
  });
});
