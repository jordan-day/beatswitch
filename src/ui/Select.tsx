import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectGroup = { group: string; options: SelectOption[] };
export type SelectItem = SelectOption | SelectGroup;

const isGroup = (i: SelectItem): i is SelectGroup => 'group' in i;

/**
 * A dropdown that looks like the rest of the app (the browser's own <select> opens a plain
 * system list that can't be styled). Same rounded field when closed; when open, a dark card like
 * the app's menus, with group headings and a ✓ on the current choice.
 * Keyboard: ↑/↓ to move, Enter/Space to pick, Esc to close, Home/End, and typing a letter jumps
 * to the next option starting with it.
 */
export function Select(props: {
  value: string;
  onChange: (value: string) => void;
  items: SelectItem[];
  /** Shown when no option matches the value (e.g. "Mixed"). */
  placeholder?: string;
  'aria-label'?: string;
  title?: string;
  size?: 'sm' | 'md';
  /** Extra classes for the closed field (e.g. a width). */
  className?: string;
  /** Show the closed field as plain text (for selects that sit inside a label, like the drum rows). */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const flat = props.items.flatMap((i) => (isGroup(i) ? i.options : [i]));
  const current = flat.find((o) => o.value === props.value);
  const enabled = (i: number) => i >= 0 && i < flat.length && !flat[i].disabled;

  // close on an outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  // open upwards when there isn't room below, and keep the active option in view
  useLayoutEffect(() => {
    if (!open || !ref.current || !listRef.current) return;
    const r = ref.current.getBoundingClientRect();
    const h = listRef.current.offsetHeight;
    setUp(r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0);
  }, [open]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const show = () => {
    setActive(flat.findIndex((o) => o.value === props.value));
    setOpen(true);
  };
  const pick = (i: number) => {
    if (!enabled(i)) return;
    setOpen(false);
    if (flat[i].value !== props.value) props.onChange(flat[i].value);
  };
  const step = (from: number, by: 1 | -1) => {
    for (let i = from + by; i >= 0 && i < flat.length; i += by) if (enabled(i)) return i;
    return from;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => step(a, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => step(a, -1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(step(-1, 1));
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(step(flat.length, -1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // jump to the next option starting with that letter
      const ch = e.key.toLowerCase();
      for (let k = 1; k <= flat.length; k++) {
        const i = (active + k) % flat.length;
        if (enabled(i) && flat[i].label.trim().toLowerCase().startsWith(ch)) {
          setActive(i);
          break;
        }
      }
    }
  };

  const sm = (props.size ?? 'md') === 'sm';
  const field = props.bare
    ? 'text-xs text-cream-500 hover:text-cream-100 min-w-0 max-w-full'
    : 'rounded-lg bg-ink-700 border border-ink-600 hover:border-cream-500/60 font-semibold ' + (sm ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm');
  let n = -1; // running option index across groups

  const option = (o: SelectOption) => {
    const i = ++n;
    const selected = o.value === props.value;
    return (
      <div
        key={o.value}
        id={`${listId}-${i}`}
        data-i={i}
        role="option"
        aria-selected={selected}
        aria-disabled={o.disabled || undefined}
        onPointerEnter={() => enabled(i) && setActive(i)}
        onClick={() => pick(i)}
        className={
          'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm cursor-pointer select-none ' +
          (o.disabled ? 'opacity-40 cursor-default ' : '') +
          (i === active ? 'bg-ink-600 ' : '') +
          (selected ? 'text-cream-100 font-bold' : 'text-cream-300')
        }
      >
        <span className="flex-1 truncate">{o.label}</span>
        {selected && <span className="text-kick text-xs" aria-hidden="true">✓</span>}
      </div>
    );
  };

  return (
    <div ref={ref} className={'relative inline-flex ' + (props.bare ? 'min-w-0 max-w-full' : '')}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={props['aria-label']}
        title={props.title}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={
          'flex items-center gap-1.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-kick/60 ' +
          field +
          ' ' +
          (props.className ?? '')
        }
      >
        <span className="flex-1 truncate">{current?.label ?? props.placeholder ?? ''}</span>
        <span className={'text-[10px] opacity-60 transition-transform ' + (open ? 'rotate-180' : '')} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={props['aria-label']}
          className={
            'absolute left-0 z-50 card !bg-ink-800 !p-1.5 shadow-2xl min-w-full w-max max-w-[min(18rem,calc(100vw-2rem))] max-h-72 overflow-y-auto flex flex-col gap-0.5 ' +
            (up ? 'bottom-full mb-1.5' : 'top-full mt-1.5')
          }
        >
          {props.items.map((item) =>
            isGroup(item) ? (
              <div key={'g:' + item.group} role="group" aria-label={item.group} className="flex flex-col gap-0.5">
                <div className="label px-2.5 pt-2 pb-0.5">{item.group}</div>
                {item.options.map(option)}
              </div>
            ) : (
              option(item)
            ),
          )}
        </div>
      )}
    </div>
  );
}
