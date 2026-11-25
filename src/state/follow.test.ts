import { describe, expect, it } from 'vitest';
import { loopModeOf } from '../audio/engine';
import { buildPreset, PRESET_LIST } from '../music/presets';
import { buildTimeline, locate, songSteps } from './song';
import { useProject } from './project';

describe('following a playing song', () => {
  it('swaps the open section without an undo step', () => {
    useProject.getState().load(buildPreset(0));
    useProject.getState().addSection(); // a second section, now open
    const { project } = useProject.getState();
    const first = project.sections[0].id;
    expect(project.activeSection).not.toBe(first);
    const undoDepth = useProject.getState().past.length;

    useProject.getState().followSection(first);
    expect(useProject.getState().project.activeSection).toBe(first);
    expect(useProject.getState().past.length).toBe(undoDepth); // not an edit
  });

  it('ignores an unknown section and the one already open', () => {
    const before = useProject.getState().project;
    useProject.getState().followSection('nope');
    useProject.getState().followSection(before.activeSection);
    expect(useProject.getState().project).toBe(before);
  });
});

describe('loop mode', () => {
  it('is bar, section or song from the play settings', () => {
    expect(loopModeOf({ playMode: 'section', loopBar: true })).toBe('bar');
    expect(loopModeOf({ playMode: 'section', loopBar: false })).toBe('section');
    expect(loopModeOf({ playMode: 'song', loopBar: true })).toBe('song');
  });
});

describe('song timeline while following sections', () => {
  it('keeps the same length and positions whichever section is open', () => {
    const idx = PRESET_LIST.find((p) => p.name === "Ocarina Dreams")!.index; // 3 sections, 7 blocks
    useProject.getState().load(buildPreset(idx));
    const start = useProject.getState().project;
    const total = songSteps(start);
    const base = buildTimeline(start).map((s) => [s.start, s.steps, s.block.section]);
    for (const sec of start.sections) {
      useProject.getState().followSection(sec.id);
      const p = useProject.getState().project;
      expect(start.sections).toHaveLength(3);
      expect(songSteps(p)).toBe(total);
      expect(buildTimeline(p).map((s) => [s.start, s.steps, s.block.section])).toEqual(base);
    }
    // every step still locates inside the song
    const p = useProject.getState().project;
    const tl = buildTimeline(p);
    for (let step = 0; step < total; step += 7) expect(locate(tl, step)).not.toBeNull();
  });
});
