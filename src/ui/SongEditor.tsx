import { Fragment, useEffect, useRef, useState } from 'react';
import { stepSeconds } from '../audio/graph';
import { useProject, useUi, withUndo } from '../state/project';
import {
  buildTimeline,
  formatTime,
  PARTS,
  sectionBars,
  sectionColor,
  songBars,
  songSteps,
  type Part,
} from '../state/song';

const PART_ICON: Record<Part, { icon: string; label: string }> = {
  drums: { icon: '🥁', label: 'Drums' },
  bass: { icon: '🎸', label: 'Bass' },
  chords: { icon: '🎹', label: 'Chords' },
  melody: { icon: '🎵', label: 'Melody' },
};

/**
 * What is being dragged: a section card (to add it to the song) or a block of the arrangement
 * (to reorder it). Kept here rather than in dataTransfer, which can't be read during dragover.
 */
type Dragged = { kind: 'section'; id: string } | { kind: 'block'; index: number };
let dragged: Dragged | null = null;

/** The Song view: your sections, and the arrangement that strings them into a song. */
export function SongEditor() {
  const p = useProject((s) => s.project);
  const addSection = useProject((s) => s.addSection);
  const setFade = useProject((s) => s.setFade);
  const seconds = songSteps(p) * stepSeconds(p.bpm);

  return (
    <section className="card p-4 flex flex-col gap-5 shrink-0" aria-label="Song arrangement">
      {/* ---- sections: click one to edit it ---- */}
      <div className="flex flex-col gap-2">
        <span className="label shrink-0" title="Click a section to edit it. Drag one into the arrangement to add it.">
          Sections
        </span>
        <div className="flex flex-wrap gap-2 min-w-0">
          {p.sections.map((s) => (
            <SectionCard key={s.id} id={s.id} />
          ))}
          <button
            className="rounded-xl border-2 border-dashed border-ink-600 px-4 py-2 text-sm font-bold text-cream-500 hover:text-cream-100 hover:border-cream-500"
            onClick={() => withUndo('New section added (a copy of the one you were on)', addSection)}
            title="Add a section: it starts as a copy of the section you're editing"
          >
            ＋ New section
          </button>
        </div>
      </div>

      {/* ---- arrangement ---- */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="label" title="Plays left to right. Drag blocks to reorder, or Copy one to repeat it.">
            Arrangement · plays left to right, drag to reorder
          </span>
          <span className="text-xs text-cream-500" title="Total length of the arrangement">
            <b className="text-cream-100">{formatTime(seconds)}</b> · {songBars(p)} bars
          </span>
          <Toggle on={p.fadeIn} onClick={() => setFade('fadeIn', !p.fadeIn)} title="Fade in over the first 2 bars">
            Fade in
          </Toggle>
          <Toggle on={p.fadeOut} onClick={() => setFade('fadeOut', !p.fadeOut)} title="Fade out over the last 4 bars">
            Fade out
          </Toggle>
        </div>
        <Arrangement />
      </div>
    </section>
  );
}

/** The editor view's slim section picker: click a section to edit it. */
export function SectionPicker() {
  const p = useProject((s) => s.project);
  const { switchSection, addSection } = useProject();
  const set = useUi((s) => s.set);
  return (
    <section className="card p-2 sm:p-2.5 shrink-0 flex items-center gap-2" aria-label="Sections">
      <span className="label shrink-0">Section</span>
      <div className="flex flex-wrap gap-1.5 min-w-0">
        {p.sections.map((s) => {
          const on = s.id === p.activeSection;
          return (
            <button
              key={s.id}
              className={'rounded-lg border-2 pl-3 pr-2.5 py-1 text-sm font-extrabold ' + (on ? 'border-cream-100 bg-ink-700' : 'border-ink-600 bg-ink-900/60 hover:bg-ink-700')}
              style={{ boxShadow: `inset 4px 0 0 ${sectionColor(p, s.id)}` }}
              aria-pressed={on}
              onClick={() => {
                switchSection(s.id);
                set({ viewBar: 0 });
              }}
              title={`Edit ${s.name}`}
            >
              {s.name}
            </button>
          );
        })}
        <button
          className="rounded-lg border-2 border-dashed border-ink-600 px-3 py-1 text-xs font-bold text-cream-500 hover:text-cream-100 hover:border-cream-500"
          onClick={() => withUndo('New section added (a copy of the one you were on)', addSection)}
          title="Add a section: it starts as a copy of the section you're editing"
        >
          ＋ New section
        </button>
      </div>
    </section>
  );
}

function Toggle(props: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button className={'chip text-xs py-0.5 ' + (props.on ? 'chip-on' : '')} onClick={props.onClick} aria-pressed={props.on} title={props.title}>
      {props.on ? '✓ ' : ''}
      {props.children}
    </button>
  );
}

function SectionCard({ id }: { id: string }) {
  const p = useProject((s) => s.project);
  const { switchSection, renameSection, duplicateSection, deleteSection, addBlock } = useProject();
  const set = useUi((s) => s.set);
  const [confirm, setConfirm] = useState(false);
  const s = p.sections.find((x) => x.id === id)!;
  const editing = id === p.activeSection;
  const uses = p.song.filter((b) => b.section === id).length;
  // dragging starts anywhere on the card except the name box, so its text can still be selected
  const fromInput = useRef(false);

  return (
    <div
      className={
        'rounded-xl border-2 bg-ink-900/60 pl-4 pr-2 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing ' +
        (editing ? 'border-cream-100' : 'border-ink-600')
      }
      style={{ boxShadow: `inset 4px 0 0 ${sectionColor(p, id)}` }}
      draggable
      onClick={(e) => {
        // clicking the card (not its name box or buttons) picks it for editing
        if ((e.target as HTMLElement).closest('input,button') || editing) return;
        switchSection(id);
        set({ viewBar: 0 });
      }}
      onPointerDown={(e) => (fromInput.current = (e.target as HTMLElement).tagName === 'INPUT')}
      onDragStart={(e) => {
        if (fromInput.current) return e.preventDefault();
        dragged = { kind: 'section', id };
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', s.name);
      }}
      onDragEnd={() => (dragged = null)}
      aria-current={editing}
      title="Click to edit this section. Drag into the arrangement to add it to the song"
    >
      <input
        className="bg-transparent font-extrabold text-base w-28 min-w-0 rounded px-1 -mx-1 hover:bg-ink-700 focus:bg-ink-700"
        value={s.name}
        onChange={(e) => renameSection(id, e.target.value)}
        aria-label="Section name"
        title="Click to rename"
      />
      <span className="text-[10px] text-cream-500 shrink-0" title={`${sectionBars(p, id)}-bar loop, used ${uses}× in the song`}>
        {sectionBars(p, id)} bar{sectionBars(p, id) > 1 ? 's' : ''} · {uses}×
      </span>
      {editing && <span className="text-[9px] font-bold text-ink-950 bg-cream-100 rounded px-1">EDITING</span>}
      {confirm ? (
        <div className="flex items-center gap-1" role="alertdialog" aria-label={`Delete ${s.name}?`}>
          <span className="text-xs">Delete{uses ? ` + ${uses} block${uses > 1 ? 's' : ''}` : ''}?</span>
          <button className="btn text-xs px-2 py-0.5" onClick={() => setConfirm(false)} autoFocus>
            Keep
          </button>
          <button
            className="btn text-xs px-2 py-0.5 bg-kick text-ink-950 hover:bg-kick"
            onClick={() => withUndo(`Deleted "${s.name}"`, () => deleteSection(id))}
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="flex gap-0.5">
          <button className="btn text-xs px-1.5 py-0.5" onClick={() => addBlock(id)} title="Add this section to the end of the song" aria-label={`Add ${s.name} to song`}>
            ＋ Add to song
          </button>
          <button className="btn text-xs px-1.5 py-0.5" onClick={() => duplicateSection(id)} title="Make a copy to create a variation" aria-label={`Duplicate ${s.name}`}>
            ⧉
          </button>
          <button
            className="btn text-xs px-1.5 py-0.5"
            onClick={() => setConfirm(true)}
            disabled={p.sections.length <= 1}
            title={p.sections.length <= 1 ? 'A song needs at least one section' : 'Delete this section'}
            aria-label={`Delete ${s.name}`}
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

function Arrangement() {
  const p = useProject((s) => s.project);
  const { removeBlock, duplicateBlock, moveBlockTo, addBlock, toggleBlockMute, toggleFill } = useProject();
  const { songStep, playMode, playing } = useUi();
  const timeline = buildTimeline(p);
  const rowRef = useRef<HTMLDivElement>(null);
  // where a drop would land (before block n; song length = at the end), and which block is being dragged
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  useEffect(() => {
    const end = () => {
      setDropAt(null);
      setDragFrom(null);
    };
    window.addEventListener('dragend', end);
    return () => window.removeEventListener('dragend', end);
  }, []);

  /** The drop position under the pointer: before the first block whose middle is right of it. */
  const indexAt = (x: number, y: number) => {
    for (const el of rowRef.current?.querySelectorAll<HTMLElement>('[data-block]') ?? []) {
      const r = el.getBoundingClientRect();
      // blocks wrap into rows: above this row, or on it and left of this block's middle
      if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) return Number(el.dataset.block);
    }
    return p.song.length;
  };
  // a block dropped just before or after itself stays put, so no marker there
  const showMarker = (at: number) => dropAt === at && !(dragFrom !== null && (at === dragFrom || at === dragFrom + 1));

  const onDragOver = (e: React.DragEvent) => {
    if (!dragged) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragged.kind === 'section' ? 'copy' : 'move';
    const at = indexAt(e.clientX, e.clientY);
    if (at !== dropAt) setDropAt(at);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const d = dragged;
    const at = indexAt(e.clientX, e.clientY);
    dragged = null;
    setDropAt(null);
    setDragFrom(null);
    if (d?.kind === 'section') addBlock(d.id, at);
    else if (d?.kind === 'block') moveBlockTo(d.index, at);
  };
  const dropHandlers = { onDragOver, onDragLeave, onDrop };
  const marker = <div className="w-1 shrink-0 self-stretch rounded-full bg-cream-100 shadow-[0_0_8px_rgba(243,233,220,0.8)]" />;

  if (timeline.length === 0)
    return (
      <div
        {...dropHandlers}
        className={
          'rounded-xl border-2 border-dashed p-4 text-sm text-cream-500 transition ' +
          (dropAt !== null ? 'border-cream-100 bg-ink-700/50' : 'border-ink-600')
        }
      >
        Your song is empty. Drag a section here, or use <b className="text-cream-300">＋ Add to song</b> on a section.
      </div>
    );

  return (
    <div className="pb-1" {...dropHandlers}>
      <div ref={rowRef} className="flex flex-wrap gap-2 items-stretch">
        {timeline.map((seg, i) => {
          const b = seg.block;
          const section = p.sections.find((s) => s.id === b.section)!;
          const color = sectionColor(p, b.section);
          const live = playing && playMode === 'song' && songStep >= seg.start && songStep < seg.start + seg.steps;
          const progress = live ? (songStep - seg.start) / seg.steps : 0;
          return (
            <Fragment key={b.id}>
            {showMarker(seg.index) && marker}
            <div
              data-block={seg.index}
              draggable
              onDragStart={(e) => {
                dragged = { kind: 'block', index: seg.index };
                setDragFrom(seg.index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', section.name);
              }}
              className={
                'relative rounded-xl bg-ink-900/70 border-2 p-2 flex flex-col gap-1.5 shrink-0 cursor-grab active:cursor-grabbing transition-opacity ' +
                (live ? 'border-cream-100' : 'border-ink-600') +
                (dragFrom === seg.index ? ' opacity-40' : '')
              }
              style={{ width: Math.max(190, Math.min(300, seg.steps * 2)) }}
              aria-label={`Block ${i + 1}: ${section.name} ×${b.repeats}`}
              title="Drag to move this block"
            >
              <div className="h-1.5 rounded-full" style={{ background: color }}>
                {live && <div className="h-full rounded-full bg-cream-100" style={{ width: `${progress * 100}%` }} />}
              </div>
              <div className="flex items-center gap-1">
                <span className="font-extrabold text-sm truncate flex-1">{section.name}</span>
                <span className="text-[10px] text-cream-500">{(seg.steps / 16) | 0} bars</span>
                <button
                  className="btn px-1.5 py-0 text-xs"
                  onClick={() => duplicateBlock(i)}
                  aria-label="Copy block"
                  title="Copy this block and put the copy right after it"
                >
                  ⧉
                </button>
                <button
                  className="btn px-1.5 py-0 text-xs"
                  onClick={() => withUndo(`Removed "${section.name}" from the song`, () => removeBlock(i))}
                  aria-label="Remove from song"
                  title="Remove this block from the song (the section itself stays)"
                >
                  ✕
                </button>
              </div>

              {/* parts on/off */}
              <div className="flex gap-0.5" role="group" aria-label="Parts playing in this block">
                {PARTS.map((part) => {
                  const off = b.mute[part];
                  return (
                    <button
                      key={part}
                      className={
                        'flex-1 rounded-md text-sm py-1 border ' +
                        (off ? 'border-ink-600 opacity-35 line-through' : 'border-transparent bg-ink-700 hover:bg-ink-600')
                      }
                      onClick={() => toggleBlockMute(i, part)}
                      aria-pressed={!off}
                      aria-label={`${PART_ICON[part].label} ${off ? 'off' : 'on'}`}
                      title={`${PART_ICON[part].label}: ${off ? 'off in this block (click to turn on)' : 'on (click to turn off for this block)'}`}
                    >
                      {PART_ICON[part].icon}
                    </button>
                  );
                })}
                <button
                  className={'rounded-md text-[10px] font-bold px-1.5 border ' + (b.fill ? 'bg-cream-100 text-ink-950 border-cream-100' : 'border-ink-600 text-cream-500 hover:text-cream-100')}
                  onClick={() => toggleFill(i)}
                  aria-pressed={b.fill}
                  title="Drum fill on the last beat, leading into the next block"
                >
                  Fill
                </button>
              </div>
            </div>
            </Fragment>
          );
        })}
        {showMarker(p.song.length) && marker}
      </div>
    </div>
  );
}
