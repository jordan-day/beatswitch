import { describe, expect, it } from 'vitest';
import { buildPreset } from '../music/presets';
import { decodeProject, encodeProject, projectFromFile, projectToFile } from '../storage/share';
import { useProject } from './project';
import { parseProject } from './schema';
import { sectionView } from './song';
import { allDrums, allMelodies, drumTrack, MAIN_MELODY, melodyTrack } from './tracks';
import { MAX_EXTRA_DRUMS, MAX_EXTRA_MELODIES } from './types';

const store = () => useProject.getState();
const p = () => store().project;
const fresh = (project = buildPreset(0)) => useProject.setState({ project, past: [], future: [] });

describe('added melodies', () => {
  it('a new melody gets its own instrument, different from the ones in use', () => {
    fresh();
    const id = store().addMelody();
    expect(id).not.toBe('');
    const m = melodyTrack(p(), id)!;
    expect(m.notes).toEqual([]);
    expect(m.sound).not.toBe(p().melody.sound);
    expect(allMelodies(p()).map((x) => x.id)).toEqual([MAIN_MELODY, id]);
  });

  it('notes go to the melody you are editing, not the first one', () => {
    fresh();
    const first = structuredClone(p().melody.notes);
    const id = store().addMelody();
    store().addNote({ s: 3, l: 2, d: 5 }, id);
    expect(melodyTrack(p(), id)!.notes).toEqual([{ s: 3, l: 2, d: 5 }]);
    expect(p().melody.notes).toEqual(first);
    store().resizeNote(3, 5, 4, id);
    expect(melodyTrack(p(), id)!.notes[0].l).toBe(4);
    store().removeNote(3, 5, id);
    expect(melodyTrack(p(), id)!.notes).toEqual([]);
  });

  it('stops at the limit', () => {
    fresh();
    for (let i = 0; i < MAX_EXTRA_MELODIES; i++) expect(store().addMelody()).not.toBe('');
    expect(store().addMelody()).toBe('');
    expect(p().extraMelodies).toHaveLength(MAX_EXTRA_MELODIES);
  });

  it('each section has its own notes for an added melody', () => {
    fresh();
    const id = store().addMelody();
    store().addNote({ s: 0, l: 1, d: 2 }, id);
    const verse = p().activeSection;
    store().addSection(); // starts as a copy
    expect(melodyTrack(p(), id)!.notes).toEqual([{ s: 0, l: 1, d: 2 }]);
    store().clearMelody(id);
    expect(melodyTrack(p(), id)!.notes).toEqual([]);
    // the first section still has its note, both when switched to and when played from the song
    expect(melodyTrack(sectionView(p(), verse), id)!.notes).toEqual([{ s: 0, l: 1, d: 2 }]);
    store().switchSection(verse);
    expect(melodyTrack(p(), id)!.notes).toEqual([{ s: 0, l: 1, d: 2 }]);
  });

  it('removing a melody removes it from every section', () => {
    fresh();
    const id = store().addMelody();
    store().addSection();
    store().removeMelody(id);
    expect(p().extraMelodies).toEqual([]);
    expect(p().sections.every((s) => !s.patterns?.extraMelodies?.[id])).toBe(true);
  });
});

describe('added drum rows', () => {
  it('a new row starts empty and its hits can be toggled and cleared', () => {
    fresh();
    const id = store().addDrum();
    const row = drumTrack(p(), id)!;
    expect(row.steps.every((s) => s === 0)).toBe(true);
    expect(row.sound).toEqual({ kind: 'synth', id: 'shaker' });
    store().toggleStep(id, 4);
    store().toggleStep(id, 4);
    expect(drumTrack(p(), id)!.steps[4]).toBe(2); // accent
    store().clearRow(id);
    expect(drumTrack(p(), id)!.steps[4]).toBe(0);
    expect(allDrums(p()).map((d) => d.key)).toEqual(['kick', 'snare', 'hat', 'openhat', 'perc', id]);
  });

  it('a section made before the row was added plays it silent', () => {
    fresh();
    const verse = p().activeSection;
    store().addSection();
    const id = store().addDrum();
    store().toggleStep(id, 0);
    expect(drumTrack(sectionView(p(), verse), id)!.steps.every((s) => s === 0)).toBe(true);
    store().switchSection(verse);
    expect(drumTrack(p(), id)!.steps.every((s) => s === 0)).toBe(true);
  });

  it('stops at the limit, and the built-in rows cannot be removed', () => {
    fresh();
    for (let i = 0; i < MAX_EXTRA_DRUMS; i++) store().addDrum();
    expect(store().addDrum()).toBe('');
    store().removeDrum('kick');
    expect(p().drums.kick).toBeDefined();
    store().removeDrum(p().extraDrums[0].id);
    expect(p().extraDrums).toHaveLength(MAX_EXTRA_DRUMS - 1);
  });
});

describe('saving added tracks', () => {
  const withExtras = () => {
    fresh();
    const m = store().addMelody();
    store().addNote({ s: 6, l: 3, d: 9 }, m);
    const d = store().addDrum();
    store().toggleStep(d, 2);
    store().addSection(); // a second section, so the first one's patterns are stored in it
    store().clearRow(d);
    return { m, d, project: p() };
  };

  it('round-trip through share links and beat files', () => {
    const { project } = withExtras();
    expect(decodeProject(encodeProject(project).hash)).toEqual(project);
    expect(projectFromFile(projectToFile(project).json)).toEqual(project);
  });

  it('imported samples on added rows are swapped for a built-in sound', () => {
    const { d, project } = withExtras();
    drumTrack(project, d)!.sound = { kind: 'user', id: 'abcdef0123456789', name: 'my clap' };
    const { hash, replacedSamples } = encodeProject(project);
    expect(replacedSamples).toBe(1);
    expect(drumTrack(decodeProject(hash)!, d)!.sound).toEqual({ kind: 'synth', id: 'dusty' });
  });

  it('older saves without added tracks still load', () => {
    const old = JSON.parse(JSON.stringify(buildPreset(1)));
    delete old.extraDrums;
    delete old.extraMelodies;
    const back = parseProject(old)!;
    expect(back.extraDrums).toEqual([]);
    expect(back.extraMelodies).toEqual([]);
  });

  it('bad data is cleaned up: built-in names as ids, duplicates, unknown sounds, patterns of missing tracks', () => {
    const { m, project } = withExtras();
    const raw = JSON.parse(JSON.stringify(project));
    raw.extraDrums.push({ id: 'kick', sound: { kind: 'synth', id: 'clap' }, steps: [] });
    raw.extraMelodies.push({ ...raw.extraMelodies[0] }); // duplicate id
    raw.extraMelodies[0].sound = 'kazoo';
    raw.sections[0].patterns.extraMelodies.gone = [{ s: 0, l: 1, d: 0 }];
    const back = parseProject(raw)!;
    expect(back.extraDrums.map((d) => d.id)).not.toContain('kick');
    expect(back.extraMelodies).toHaveLength(1);
    expect(melodyTrack(back, m)!.sound).toBe('musicbox');
    expect(back.sections[0].patterns!.extraMelodies).not.toHaveProperty('gone');
  });
});
