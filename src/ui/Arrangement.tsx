import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useProject, useUi, withUndo } from '../state/project';
import { buildTimeline, MAX_REPEATS, PARTS, sectionColor, type Part } from '../state/song';

/**
 * Everything that used to be on the Song page, folded into the editor page:
 * - the section chips (pick a section; right-click for Rename, Duplicate, Delete; drag one into the song)
 * - the song row's pieces: each block's popover, and the ＋ that adds a section to the song
 *   (the blocks themselves are drawn by SongTimeline)
 */

export const PART_ICON: Record<Part, { icon: string; label: string }> = {
  drums: { icon: '🥁', label: 'Drums' },
  bass: { icon: '🎸', label: 'Bass' },
  chords: { icon: '🎹', label: 'Chords' },
  melody: { icon: '🎵', label: 'Melody' },
  sample: { icon: '💿', label: 'Sample' },
};

/**
 * What is being dragged: a section chip (to add it to the song) or a block card (to reorder it).
 * Kept here rather than in dataTransfer, which can't be read during dragover.
 */
export type Dragged = { kind: 'section'; id: string } | { kind: 'block'; index: number };
let dragged: Dragged | null = null;
export const getDragged = () => dragged;
/** Also tells the UI (the Song row lights up and previews the result while something is dragged). */
export const setDragged = (d: Dragged | null) => {
  dragged = d;
  if (!d) look = null;
  useUi.getState().set({ dragging: d });
};

/** How the lifted card under the pointer looks, and where on it the pointer grabbed it. */
interface DragLook {
  label: string;
  sub?: string;
  color: string;
  width: number;
  height: number;
  offX: number;
  offY: number;
}
let look: DragLook | null = null;

// an empty image, so the browser doesn't draw its own see-through copy (the lifted card is drawn instead)
const blank = typeof Image === 'undefined' ? null : Object.assign(new Image(), { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' });

/** Pick up a section chip or song block: it lifts off and follows the pointer as a card. */
export function startDrag(e: React.DragEvent, d: Dragged, card: { label: string; sub?: string; color: string }) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const width = Math.max(90, Math.min(260, r.width));
  look = { ...card, width, height: Math.max(28, r.height), offX: Math.min(Math.max(8, e.clientX - r.left), width - 8), offY: Math.max(4, e.clientY - r.top) };
  if (blank) e.dataTransfer.setDragImage(blank, 0, 0);
  setDragged(d);
}

/** The picked-up card: follows the pointer while a section or block is dragged. */
export function DragLayer() {
  const dragging = useUi((s) => s.dragging);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!dragging) return setPos(null);
    const move = (e: DragEvent) => (e.clientX || e.clientY) && setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('dragover', move, true);
    window.addEventListener('drag', move, true);
    return () => {
      window.removeEventListener('dragover', move, true);
      window.removeEventListener('drag', move, true);
    };
  }, [dragging]);
  if (!dragging || !look || !pos) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[70] rounded-md border-l-4 flex items-center gap-1 px-2 shadow-[0_12px_30px_rgba(0,0,0,0.55)] ring-1 ring-cream-100/60"
      style={{
        left: pos.x - look.offX,
        top: pos.y - look.offY,
        width: look.width,
        height: look.height,
        borderColor: look.color,
        background: `color-mix(in srgb, ${look.color} 35%, #24202a)`,
        transform: 'rotate(-2deg) scale(1.06)',
      }}
    >
      <span className="text-xs font-extrabold truncate text-cream-100">{look.label}</span>
      {look.sub && <span className="text-xs text-cream-300 shrink-0">{look.sub}</span>}
    </div>
  );
}
// a drag that ends anywhere (dropped or cancelled) is over
if (typeof window !== 'undefined') window.addEventListener('dragend', () => dragged && setDragged(null));

/** Close a floating panel on an outside click or Escape. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, ref, close]);
}

// ---------------------------------------------------------------- section chips

/** Pick which section to edit. Right-click a chip for Rename, Duplicate and Delete; drag one into the song. */
export function SectionChips() {
  const p = useProject((s) => s.project);
  const { switchSection, addSection } = useProject();
  const set = useUi((s) => s.set);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2 min-w-0" role="group" aria-label="Section to edit">
      <span className="label shrink-0">Section</span>
      <div className="flex flex-wrap gap-1.5 min-w-0">
        {p.sections.map((s) => {
          const on = s.id === p.activeSection;
          const chip =
            'rounded-lg border pl-3.5 pr-3 py-1 text-sm font-extrabold transition ' +
            (on ? 'border-cream-100 bg-ink-600 text-cream-100' : 'border-ink-600 bg-ink-800/60 text-cream-300 hover:bg-ink-700 hover:text-cream-100');
          const style = { boxShadow: `inset 4px 0 0 ${sectionColor(p, s.id)}` };
          if (renaming === s.id) return <RenameChip key={s.id} id={s.id} className={chip} style={style} onDone={() => setRenaming(null)} />;
          return (
            <button
              key={s.id}
              className={chip + ' cursor-pointer'}
              style={style}
              aria-pressed={on}
              onClick={() => {
                switchSection(s.id);
                set({ viewBar: 0 });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                // from the keyboard (menu key / Shift+F10) there's no pointer position: use the chip's corner
                const r = e.currentTarget.getBoundingClientRect();
                setMenu({ id: s.id, x: e.clientX || r.left, y: e.clientY || r.bottom });
              }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', s.name);
                startDrag(e, { kind: 'section', id: s.id }, { label: s.name, color: sectionColor(p, s.id) });
              }}
              onDragEnd={() => setDragged(null)}
              title={`Edit ${s.name}. Right-click to rename, duplicate or delete; drag into the song to add it.`}
            >
              {s.name}
            </button>
          );
        })}
        <button
          className="rounded-lg border border-dashed border-ink-600 px-3 py-1 text-sm font-bold text-cream-500 hover:text-cream-100 hover:border-cream-500 transition"
          onClick={() => withUndo('New section added (a copy of the one you were on)', addSection)}
          title="Add a section: it starts as a copy of the section you're editing"
        >
          ＋ New
        </button>
      </div>
      {menu && (
        <SectionMenu
          id={menu.id}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={() => {
            setRenaming(menu.id);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

/** A chip turned into a text box: Enter or clicking away keeps the name, Esc cancels. */
function RenameChip(props: { id: string; className: string; style: React.CSSProperties; onDone: () => void }) {
  const p = useProject((s) => s.project);
  const renameSection = useProject((s) => s.renameSection);
  const current = p.sections.find((s) => s.id === props.id)?.name ?? '';
  const [draft, setDraft] = useState(current);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  const commit = () => {
    if (draft.trim() && draft.trim() !== current) renameSection(props.id, draft.trim());
    props.onDone();
  };
  return (
    <input
      ref={ref}
      autoFocus
      className={props.className + ' outline-none ring-2 ring-kick/60 bg-ink-900 w-32'}
      style={props.style}
      value={draft}
      maxLength={24}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') props.onDone();
        e.stopPropagation(); // typing letters and digits shouldn't trigger the app's shortcuts
      }}
      aria-label="Section name"
    />
  );
}

/** The right-click menu of a section chip. Delete asks first (inside the menu). */
function SectionMenu(props: { id: string; x: number; y: number; onClose: () => void; onRename: () => void }) {
  const p = useProject((s) => s.project);
  const { duplicateSection, deleteSection } = useProject();
  const ref = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [pos, setPos] = useState({ left: props.x, top: props.y });
  useDismiss(true, ref, props.onClose);
  // keep it on screen
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(props.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(props.y, window.innerHeight - r.height - 8)) });
  }, [props.x, props.y, confirm]);
  const s = p.sections.find((x) => x.id === props.id);
  if (!s) return null;
  const uses = p.song.filter((b) => b.section === s.id).length;
  const only = p.sections.length <= 1;
  const item = 'w-full text-left rounded-lg px-3 py-1.5 text-sm hover:bg-ink-700 disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div ref={ref} role="menu" aria-label={`${s.name} menu`} className="fixed z-50 card !bg-ink-800 !p-1.5 shadow-2xl w-56 flex flex-col gap-0.5" style={pos}>
      {confirm ? (
        <div role="alertdialog" aria-label={`Delete ${s.name}?`} className="p-2 flex flex-col gap-2">
          <div className="text-sm">
            Delete <b>{s.name}</b>
            {uses ? ` and its ${uses} block${uses > 1 ? 's' : ''} in the song` : ''}?
          </div>
          <div className="flex gap-1.5 justify-end">
            <button className="btn text-xs px-2.5 py-1" onClick={() => setConfirm(false)} autoFocus>
              Keep
            </button>
            <button
              className="btn text-xs px-2.5 py-1 bg-kick text-ink-950 hover:bg-kick"
              onClick={() => {
                withUndo(`Deleted "${s.name}"`, () => deleteSection(s.id));
                props.onClose();
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="label px-3 pt-1 pb-0.5 truncate">{s.name}</div>
          <button role="menuitem" className={item} onClick={props.onRename} autoFocus>
            Rename
          </button>
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              withUndo(`Copied "${s.name}"`, () => duplicateSection(s.id));
              props.onClose();
            }}
          >
            Duplicate
          </button>
          <button role="menuitem" className={item} onClick={() => setConfirm(true)} disabled={only} title={only ? 'A song needs at least one section' : undefined}>
            Delete…
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- song blocks

/** "＋": add a section to the end of the song. */
export function AddBlockButton() {
  const p = useProject((s) => s.project);
  const addBlock = useProject((s) => s.addBlock);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        className="h-7 w-7 shrink-0 rounded-lg border border-dashed border-ink-600 text-cream-500 hover:text-cream-100 hover:border-cream-500 text-sm font-bold"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Add a section to the song"
        title="Add a section to the end of the song"
      >
        ＋
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 z-40 card !bg-ink-800 !p-1.5 shadow-2xl w-48 flex flex-col gap-0.5">
          <div className="label px-2.5 pt-1 pb-0.5">Add to the song</div>
          {p.sections.map((s) => (
            <button
              key={s.id}
              role="menuitem"
              className="text-left rounded-lg px-2.5 py-1.5 text-sm hover:bg-ink-700 flex items-center gap-2"
              onClick={() => {
                withUndo(`Added "${s.name}" to the song`, () => addBlock(s.id));
                setOpen(false);
              }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sectionColor(p, s.id) }} />
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One block's settings: which parts play, the drum fill, how many times it repeats, copy, remove,
 * and a way to open its section in the editor. `className` places it (it's absolutely positioned).
 */
export function BlockPopover({ index, onClose, className }: { index: number; onClose: () => void; className: string }) {
  const p = useProject((s) => s.project);
  const { toggleBlockMute, toggleFill, setRepeats, duplicateBlock, removeBlock, switchSection } = useProject();
  const set = useUi((s) => s.set);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(true, ref, onClose);
  const b = p.song[index];
  if (!b) return null;
  const section = p.sections.find((s) => s.id === b.section);
  const seg = buildTimeline(p).find((s) => s.index === index);
  const bars = seg ? seg.loopSteps / 16 : 0;

  return (
    <div ref={ref} role="dialog" aria-label={`${section?.name} block`} className={'absolute z-40 card !bg-ink-800 !p-3 shadow-2xl w-80 max-w-[calc(100vw-2rem)] flex flex-col gap-3 ' + className}>
      <div className="flex items-baseline gap-2">
        <span className="font-extrabold">{section?.name}</span>
        <span className="text-xs text-cream-500">
          {bars} bar{bars > 1 ? 's' : ''} × {b.repeats}
        </span>
        {section && section.id !== p.activeSection && (
          <button
            className="ml-auto text-xs font-bold text-cream-500 hover:text-cream-100 rounded"
            onClick={() => {
              switchSection(section.id);
              set({ viewBar: 0 });
              onClose();
            }}
            title={`Open ${section.name} in the editor`}
          >
            ✏️ Edit section
          </button>
        )}
      </div>
      <div className="flex gap-1" role="group" aria-label="Parts playing in this block">
        {PARTS.filter((part) => part !== 'sample' || p.sample).map((part) => {
          const off = b.mute[part];
          return (
            <button
              key={part}
              className={'flex-1 h-9 rounded-md text-base border ' + (off ? 'border-ink-600 opacity-35 line-through' : 'border-transparent bg-ink-700 hover:bg-ink-600')}
              onClick={() => toggleBlockMute(index, part)}
              aria-pressed={!off}
              aria-label={`${PART_ICON[part].label} ${off ? 'off' : 'on'}`}
              title={`${PART_ICON[part].label}: ${off ? 'off in this block (click to turn on)' : 'on (click to turn off for this block)'}`}
            >
              {PART_ICON[part].icon}
            </button>
          );
        })}
        <button
          className={'h-9 rounded-md text-xs font-bold px-2.5 border ' + (b.fill ? 'bg-cream-100 text-ink-950 border-cream-100' : 'border-ink-600 text-cream-500 hover:text-cream-100')}
          onClick={() => toggleFill(index)}
          aria-pressed={b.fill}
          title="Drum fill on the last beat, leading into the next block"
        >
          Fill
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold text-cream-500">Plays</span>
        <button className="btn h-7 w-7 p-0 text-xs grid place-items-center" disabled={b.repeats <= 1} onClick={() => setRepeats(index, b.repeats - 1)} aria-label="Fewer repeats">
          −
        </button>
        <span className="text-sm font-bold w-7 text-center">×{b.repeats}</span>
        <button className="btn h-7 w-7 p-0 text-xs grid place-items-center" disabled={b.repeats >= MAX_REPEATS} onClick={() => setRepeats(index, b.repeats + 1)} aria-label="More repeats">
          +
        </button>
        <div className="ml-auto flex gap-1">
          <button
            className="btn h-7 px-2 text-xs whitespace-nowrap"
            onClick={() => {
              duplicateBlock(index);
              onClose();
            }}
            title="Copy this block and put the copy right after it"
          >
            ⧉ Copy
          </button>
          <button
            className="btn h-7 px-2 text-xs whitespace-nowrap"
            onClick={() => {
              withUndo(`Removed "${section?.name}" from the song`, () => removeBlock(index));
              onClose();
            }}
            title="Remove this block from the song (the section itself stays)"
          >
            ✕ Remove
          </button>
        </div>
      </div>
    </div>
  );
}
