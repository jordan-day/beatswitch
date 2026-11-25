import { emptyProject } from '../music/presets';
import { newId, noMutes, type Part, type SongBlock } from '../state/song';
import { DRUM_ROWS, STEPS_PER_BAR, type Project } from '../state/types';

/**
 * The one song shape of the mobile version. You make the loop; the app builds the rest from it by
 * switching parts off, with drum fills leading into the breakdown and the outro, and fades:
 *   Intro → Loop → Loop → Breakdown → Loop → Outro
 */
export const MOBILE_SHAPE: { name: string; hint: string; mute: Partial<Record<Part, boolean>>; fill: boolean }[] = [
  { name: 'Intro', hint: 'Just the chords, fading in', mute: { drums: true, bass: true, melody: true }, fill: false },
  { name: 'Loop', hint: 'Your loop', mute: {}, fill: false },
  { name: 'Loop', hint: 'Your loop, with a drum fill at the end', mute: {}, fill: true },
  { name: 'Breakdown', hint: 'No drums: a breather', mute: { drums: true }, fill: false },
  { name: 'Loop', hint: 'Your loop, with a drum fill at the end', mute: {}, fill: true },
  { name: 'Outro', hint: 'Chords and melody, fading out', mute: { drums: true, bass: true }, fill: false },
];

const blocksFor = (section: string): SongBlock[] =>
  MOBILE_SHAPE.map((b) => ({ id: newId(), section, repeats: 1, mute: { ...noMutes(), ...b.mute }, fill: b.fill }));

/**
 * Give a project the mobile song shape (in place): only the section being edited is kept (the
 * loop), and the song becomes the six blocks above, with fades on.
 */
export function applyMobileShape(p: Project) {
  p.sections = p.sections.filter((s) => s.id === p.activeSection);
  p.song = blocksFor(p.activeSection);
  p.fadeIn = true;
  p.fadeOut = true;
}

/** Whether a song is in the mobile shape (a song arranged on a computer may not be). */
export function hasMobileShape(p: Project): boolean {
  return (
    p.sections.length === 1 &&
    p.song.length === MOBILE_SHAPE.length &&
    p.song.every(
      (b, i) =>
        b.section === p.activeSection &&
        b.repeats === 1 &&
        b.fill === MOBILE_SHAPE[i].fill &&
        (['drums', 'bass', 'chords', 'melody'] as Part[]).every((part) => b.mute[part] === !!MOBILE_SHAPE[i].mute[part]),
    )
  );
}

/** A fresh song for the mobile wizard: a 4-bar loop with a starter chord progression and nothing else yet. */
export function newMobileSong(): Project {
  const p = emptyProject(true);
  p.name = 'My lo-fi song';
  applyMobileShape(p);
  return p;
}

/**
 * The mobile beat is one bar that repeats: copy bar 1 of the drums and bass into every bar
 * (in place). The open hat and percussion rows aren't on the mobile pad, so they're cleared to keep
 * what you hear the same as what you see.
 */
export function oneBarBeat(p: Project) {
  for (const r of DRUM_ROWS) {
    const t = p.drums[r];
    if (r === 'openhat' || r === 'perc') t.steps = t.steps.map(() => 0);
    else t.steps = t.steps.map((_, i) => t.steps[i % STEPS_PER_BAR]);
  }
  p.bass.steps = p.bass.steps.map((_, i) => p.bass.steps[i % STEPS_PER_BAR]);
}
