import { useProject, useUi, type Track } from '../state/project';
import { AddSampleButton } from './SampleImport';

const TABS: { id: Track; label: string; icon: string }[] = [
  { id: 'beat', label: 'Beat', icon: '🥁' },
  { id: 'chords', label: 'Chords', icon: '🎹' },
  { id: 'melody', label: 'Melody', icon: '🎵' },
];
const SAMPLE_TAB = { id: 'sample' as Track, label: 'Sample', icon: '💿' };

/**
 * The same toolbar layout in every editor, so Beat, Chords and Melody feel like one app:
 *   [Beat | Chords | Melody]  [ Sound: instrument, volume… ]        [ part options · ⧉ Copy · 🎲 · ✕ Clear · ? ]
 * `sound` is the part's sound settings, boxed together; `children` are the pattern tools on the
 * right, in that order, with the ? last. Use the shared button styles below so heights match.
 * The Sample tab appears once the song has a sample; until then a quiet "＋ Sample" sits after the tabs.
 */
export function EditorHeader(props: { sound?: React.ReactNode; children?: React.ReactNode }) {
  const { track, set } = useUi();
  const hasSample = useProject((s) => !!s.project.sample);
  const tabs = hasSample ? [...TABS, SAMPLE_TAB] : TABS;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div role="tablist" aria-label="Editor" className="flex rounded-xl bg-ink-900/70 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={track === t.id}
            onClick={() => set({ track: t.id })}
            className={
              'px-3 py-1.5 rounded-lg text-sm font-extrabold transition ' +
              (track === t.id ? 'bg-ink-600 text-cream-100 shadow' : 'text-cream-500 hover:text-cream-100')
            }
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {!hasSample && <AddSampleButton />}
      {props.sound && (
        <div
          role="group"
          aria-label="Sound"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-10 rounded-xl bg-ink-900/50 border border-ink-600/50 px-3 py-1"
        >
          {props.sound}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 ml-auto">{props.children}</div>
    </div>
  );
}

/** A text button in an editor toolbar (⧉ Copy bar to all, ✕ Clear…). */
export const TOOL_BTN = 'btn h-8 px-3 text-xs whitespace-nowrap';
/** An icon-only button in an editor toolbar (🎲, 🎛, mute). */
export const ICON_BTN = 'btn h-8 w-8 p-0 text-base grid place-items-center';
/** A row of mutually exclusive options (Long/Twice/Bouncy, 4/8 chords). */
export const SEGMENTED = 'flex h-8 items-center rounded-lg bg-ink-700 p-0.5';
export const segmentBtn = (on: boolean) =>
  'h-full px-2.5 rounded-md text-xs font-bold whitespace-nowrap transition ' + (on ? 'bg-cream-100 text-ink-950' : 'text-cream-300 hover:text-cream-100');

/** A thin divider between groups of toolbar buttons. */
export function ToolbarDivider() {
  return <span className="w-px h-5 bg-ink-600 mx-0.5" aria-hidden="true" />;
}
