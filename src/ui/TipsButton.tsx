import { useId } from 'react';

type TipGroup = { title: string; tips: React.ReactNode[] };

/**
 * A small ? that shows a panel of tips on hover or keyboard focus. `before` adds groups above the
 * main one (e.g. "How to edit" ahead of "Tips for a nice melody").
 */
export function TipsButton(props: { title: string; tips: React.ReactNode[]; label?: string; before?: TipGroup[] }) {
  const id = useId();
  const groups = [...(props.before ?? []), { title: props.title, tips: props.tips }];
  return (
    <div className="relative group">
      <button
        className="btn w-8 h-8 rounded-full p-0 text-sm"
        aria-label={props.label ?? props.title}
        aria-describedby={id}
        type="button"
      >
        ?
      </button>
      <div
        id={id}
        role="tooltip"
        className={
          'invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute right-0 top-full mt-2 z-40 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-10rem)] overflow-y-auto card !bg-ink-800 !p-4 shadow-2xl text-left ' +
          // several groups sit side by side, so the panel stays short enough to fit on screen
          (groups.length > 1 ? 'w-[40rem] grid sm:grid-cols-2 gap-x-6 gap-y-4' : 'w-80 flex flex-col gap-4')
        }
      >
        {groups.map((g, gi) => (
          <div key={gi}>
            <div className="font-extrabold mb-2">{g.title}</div>
            <ul className="flex flex-col gap-2 text-sm text-cream-300">
              {g.tips.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-kick shrink-0">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
