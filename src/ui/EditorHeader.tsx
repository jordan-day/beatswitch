import { useUi, type Track } from '../state/project';

const TABS: { id: Track; label: string; icon: string }[] = [
  { id: 'beat', label: 'Beat', icon: '🥁' },
  { id: 'chords', label: 'Chords', icon: '🎹' },
  { id: 'melody', label: 'Melody', icon: '🎵' },
];

/**
 * Tabs to switch editor, and the editor's own actions on the right.
 * (Which bar you're editing is picked in the "Bar n" row of the section overview above.)
 */
export function EditorHeader(props: { children?: React.ReactNode }) {
  const { track, set } = useUi();
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div role="tablist" aria-label="Editor" className="flex rounded-xl bg-ink-900/70 p-1">
        {TABS.map((t) => (
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 ml-auto">{props.children}</div>
    </div>
  );
}
