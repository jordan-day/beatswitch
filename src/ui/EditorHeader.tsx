import { useProject, useUi, type Track } from '../state/project';
import { STEPS_PER_BAR } from '../state/types';

const TABS: { id: Track; label: string; icon: string }[] = [
  { id: 'beat', label: 'Beat', icon: '🥁' },
  { id: 'chords', label: 'Chords', icon: '🎹' },
  { id: 'melody', label: 'Melody', icon: '🎵' },
];

/** Tabs to switch editor, an optional bar picker, and the editor's own actions on the right. */
export function EditorHeader(props: { barPicker?: boolean; children?: React.ReactNode }) {
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
      {props.barPicker && <BarPicker />}
      <div className="flex flex-wrap items-center gap-1.5 ml-auto">{props.children}</div>
    </div>
  );
}

function BarPicker() {
  const bars = useProject((s) => s.project.bars);
  const { viewBar, step, set } = useUi();
  if (bars <= 1) return null;
  const bar = Math.min(viewBar, bars - 1);
  const playingBar = step >= 0 ? Math.floor(step / STEPS_PER_BAR) : -1;
  return (
    <div className="flex items-center gap-1" aria-label="Bar to edit">
      {Array.from({ length: bars }, (_, b) => (
        <button
          key={b}
          className={'chip text-xs py-1 px-2.5 relative ' + (b === bar ? 'chip-on' : '')}
          onClick={() => set({ viewBar: b })}
          aria-pressed={b === bar}
          title={`Edit bar ${b + 1}`}
        >
          Bar {b + 1}
          {playingBar === b && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-kick" />}
        </button>
      ))}
    </div>
  );
}
