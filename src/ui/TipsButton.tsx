import { useId } from 'react';

/** A small ? that shows a panel of tips on hover or keyboard focus. */
export function TipsButton(props: { title: string; tips: React.ReactNode[]; label?: string }) {
  const id = useId();
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
        className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute right-0 top-full mt-2 z-40 w-80 max-w-[calc(100vw-2rem)] card !bg-ink-800 !p-4 shadow-2xl text-left"
      >
        <div className="font-extrabold mb-2">{props.title}</div>
        <ul className="flex flex-col gap-2 text-sm text-cream-300">
          {props.tips.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-kick shrink-0">•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
