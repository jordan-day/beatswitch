import { describe, expect, it } from 'vitest';
import { buildPreset } from '../music/presets';
import { decodeProject, encodeProject, projectFromFile, projectToFile } from '../storage/share';
import { useProject } from './project';
import { parseProject } from './schema';
import { sectionView } from './song';
import { sampleClips } from './tracks';
import { MAX_SAMPLE_SECONDS } from './types';

const store = () => useProject.getState();
const p = () => store().project;
const fresh = (project = buildPreset(0)) => useProject.setState({ project, past: [], future: [] });
const FILE = { id: 'abcdef0123456789', name: 'rain' };
const hitsAt = () => p().sample!.steps.flatMap((on, i) => (on ? [i] : []));

describe('the song sample', () => {
  it('a new sample starts with one hit on the first beat, trimmed to the file (at most the limit)', () => {
    fresh();
    store().setSample(FILE, 3);
    expect(p().sample).toMatchObject({ id: FILE.id, name: 'rain', start: 0, length: 3, pitch: 0, mute: false });
    expect(hitsAt()).toEqual([0]);
    store().setSampleTrim(1, 1);
    store().setSample(FILE, 600); // the same file again changes nothing (keeps your trim)
    expect(p().sample).toMatchObject({ start: 1, length: 1 });
    store().setSample({ id: 'ffff0123456789ab', name: 'long' }, 600); // a long file: the clip is capped at the limit
    expect(p().sample!.length).toBe(MAX_SAMPLE_SECONDS);
  });

  it('a file dropped on the page goes into the current bar', () => {
    fresh();
    store().placeSample(FILE, 3, 32); // bar 3: only that hit, not the first beat
    expect(hitsAt()).toEqual([32]);
    store().setSampleTrim(0.5, 1);
    store().placeSample(FILE, 3, 48); // same file into bar 4: just another hit, trim kept
    expect(hitsAt()).toEqual([32, 48]);
    expect(p().sample).toMatchObject({ start: 0.5, length: 1 });
    const before = store().past.length;
    store().placeSample({ id: '0123456789abcdef', name: 'vinyl' }, 2, 0); // a different file: swapped, hits kept, one undo step
    expect(p().sample).toMatchObject({ id: '0123456789abcdef', start: 0, length: 2 });
    expect(hitsAt()).toEqual([0, 32, 48]);
    expect(store().past.length).toBe(before + 1);
  });

  it('switching the file keeps the hits, pitch and volume but starts the trim afresh', () => {
    fresh();
    store().setSample(FILE, 3);
    store().toggleSampleStep(8);
    store().update((d) => void (d.sample!.pitch = 2));
    store().setSampleTrim(1, 1.5);
    store().setSample({ id: '0123456789abcdef', name: 'vinyl' }, 120);
    expect(p().sample).toMatchObject({ id: '0123456789abcdef', name: 'vinyl', start: 0, length: MAX_SAMPLE_SECONDS, pitch: 2 });
    expect(hitsAt()).toEqual([0, 8]);
  });

  it('each section has its own hits', () => {
    fresh();
    store().setSample(FILE, 3);
    const first = p().activeSection;
    store().addSection(); // a copy: same hits
    store().toggleSampleStep(0);
    store().toggleSampleStep(4);
    expect(hitsAt()).toEqual([4]);
    expect(sectionView(p(), first).sample!.steps[0]).toBe(true);
    store().switchSection(first);
    expect(hitsAt()).toEqual([0]);
  });

  it('removing it takes it out of every section and every block', () => {
    fresh();
    store().setSample(FILE, 3);
    store().addSection();
    store().toggleBlockMute(0, 'sample');
    store().removeSample();
    expect(p().sample).toBeNull();
    expect(p().sections.every((s) => !s.patterns?.sample)).toBe(true);
    expect(p().song.every((b) => !b.mute.sample)).toBe(true);
  });

  it('trimming is kept within the limit', () => {
    fresh();
    store().setSample(FILE, 3);
    store().setSampleTrim(-2, 99);
    expect(p().sample).toMatchObject({ start: 0, length: MAX_SAMPLE_SECONDS });
  });
});

describe('where the sample plays', () => {
  it('a clip runs for its length, the next hit, or the end of the loop, whichever is first', () => {
    fresh();
    store().update((d) => void (d.bpm = 60)); // a 16th note is 0.25 s
    store().setSample(FILE, 1); // 1 s = 4 steps
    store().toggleSampleStep(10); // 6 steps after the first hit
    store().toggleSampleStep(62); // 2 steps before the end of the 4-bar loop
    expect(sampleClips(p())).toEqual([
      { s: 0, l: 4 },
      { s: 10, l: 4 },
      { s: 62, l: 2 },
    ]);
    store().toggleSampleStep(2); // now the next hit comes before the clip ends
    expect(sampleClips(p())[0]).toEqual({ s: 0, l: 2 });
  });

  it('pitching up makes it shorter, like a record', () => {
    fresh();
    store().update((d) => void (d.bpm = 60));
    store().setSample(FILE, 2); // 8 steps
    store().update((d) => void (d.sample!.pitch = 12)); // twice as fast
    expect(sampleClips(p())[0]).toEqual({ s: 0, l: 4 });
  });
});

describe('saving the sample', () => {
  const withSample = () => {
    fresh();
    store().setSample(FILE, 3);
    store().toggleSampleStep(8);
    store().addSection();
    return p();
  };

  it('it is kept in this browser\'s saves (autosave parses through the same code)', () => {
    const project = withSample();
    const back = parseProject(JSON.parse(JSON.stringify(project)))!;
    expect(back.sample).toEqual(project.sample);
    expect(back.sections[0].patterns!.sample).toEqual(project.sections[0].patterns!.sample);
  });

  it('share links and song files leave it out, since the audio stays on this computer', () => {
    const project = withSample();
    const link = encodeProject(project);
    expect(link.replacedSamples).toBe(1);
    const fromLink = decodeProject(link.hash)!;
    expect(fromLink.sample).toBeNull();
    expect(fromLink.sections.every((s) => !s.patterns?.sample)).toBe(true);
    expect(projectFromFile(projectToFile(project).json)!.sample).toBeNull();
  });

  it('older saves load without a sample, and with the sample part switched on in every block', () => {
    const old = JSON.parse(JSON.stringify(buildPreset(1)));
    delete old.sample;
    for (const b of old.song) delete b.mute.sample;
    const back = parseProject(old)!;
    expect(back.sample).toBeNull();
    expect(back.song.every((b) => b.mute.sample === false)).toBe(true);
  });

  it('bad sample data is dropped or clamped', () => {
    const raw = JSON.parse(JSON.stringify(withSample()));
    raw.sample.pitch = 99;
    raw.sample.length = -1;
    expect(parseProject(raw)!.sample).toMatchObject({ pitch: 12, length: 0.05 });
    raw.sample.id = '../../etc';
    expect(parseProject(raw)!.sample).toBeNull();
  });
});
