import { useEffect, useRef, useState } from 'react';
import { seekSong } from '../audio/engine';
import { stepSeconds } from '../audio/graph';
import { useProject, useUi, withUndo } from '../state/project';
import { buildTimeline, formatTime, noMutes, PARTS, sectionBars, sectionColor, songSteps, type SongBlock } from '../state/song';
import { STEPS_PER_BAR } from '../state/types';
import { AddBlockButton, BlockPopover, getDragged, PART_ICON, setDragged, startDrag } from './Arrangement';

/**
 * The song, in one slim row above the section overview, where it's also arranged:
 * - the thin time ruler on top moves playback when Loop is set to Song (click or drag; when stopped,
 *   that's where Play starts); otherwise it opens the section at that spot
 * - each block (in its section's colour, as wide as it plays): click for its settings, drag to move it
 * - drop a section chip on the row to add it there, or press ＋ to add one at the end
 */
export function SongTimeline() {
  const p = useProject((s) => s.project);
  const { moveBlockTo, addBlock } = useProject();
  const { playing, songStep, songCursor, playMode, dragging } = useUi();
  const areaRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const seeking = useRef(false);
  const last = useRef(-1); // the step last sought to, so dragging only seeks when it changes
  const [open, setOpen] = useState<string | null>(null); // block whose popover is open
  const [dropAt, setDropAt] = useState<number | null>(null); // where a dragged block or section would land
  const timeline = buildTimeline(p);
  const total = songSteps(p);
  const at = total ? (playing && songStep >= 0 ? songStep : Math.min(songCursor, total - 1)) : 0;
  const sd = stepSeconds(p.bpm);
  const songMode = playMode === 'song';
  const pct = (step: number) => (total ? (step / total) * 100 : 0);

  useEffect(() => {
    const end = () => setDropAt(null);
    window.addEventListener('dragend', end);
    return () => window.removeEventListener('dragend', end);
  }, []);

  // ---- the ruler: seek
  const seek = (clientX: number) => {
    if (!total) return;
    const r = rulerRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const s = Math.min(total - 1, Math.round((x * total) / 4) * 4); // to the nearest beat
    if (s === last.current) return;
    last.current = s;
    seekSong(s);
  };

  // ---- dragging blocks and section chips onto the row
  /** The drop position under the pointer: before the first block whose middle is right of it. */
  const indexAt = (clientX: number) => {
    const r = areaRef.current!.getBoundingClientRect();
    const step = ((clientX - r.left) / r.width) * total;
    const seg = timeline.find((s) => step < s.start + s.steps / 2);
    return seg ? seg.index : p.song.length;
  };
  /**
   * What the row shows: the song as it is, or (while something is dragged over it) as it will be
   * when dropped there. A dragged section appears as a dashed ghost block at the drop spot; a dragged
   * block moves to it. The other blocks slide aside (their position and width animate).
   */
  type Item = { key: string; block: SongBlock; index: number; steps: number; ghost?: boolean; moving?: boolean };
  let items: Item[] = timeline.map((seg) => ({ key: seg.block.id, block: seg.block, index: seg.index, steps: seg.steps }));
  if (dropAt !== null && dragging) {
    const pos = (list: Item[]) => {
      const k = list.findIndex((it) => it.index >= dropAt);
      return k < 0 ? list.length : k;
    };
    if (dragging.kind === 'section') {
      const block: SongBlock = { id: 'ghost', section: dragging.id, repeats: 1, mute: noMutes(), fill: false };
      const ghost: Item = { key: 'ghost', block, index: -1, steps: sectionBars(p, dragging.id) * STEPS_PER_BAR, ghost: true };
      items = [...items.slice(0, pos(items)), ghost, ...items.slice(pos(items))];
    } else {
      const moving = items.find((it) => it.index === dragging.index);
      if (moving) {
        const at = pos(items);
        const rest = items.filter((it) => it !== moving);
        const k = at > items.indexOf(moving) ? at - 1 : at;
        items = [...rest.slice(0, k), { ...moving, moving: true }, ...rest.slice(k)];
      }
    }
  } else if (dragging?.kind === 'block') {
    items = items.map((it) => (it.index === dragging.index ? { ...it, moving: true } : it));
  }
  const shownTotal = items.reduce((n, it) => n + it.steps, 0);
  const starts: number[] = [];
  items.reduce((n, it) => (starts.push(n), n + it.steps), 0);
  const pctShown = (step: number) => (shownTotal ? (step / shownTotal) * 100 : 0);
  const sectionDrag = dragging?.kind === 'section' ? p.sections.find((s) => s.id === dragging.id) : undefined;
  const drop = {
    onDragOver: (e: React.DragEvent) => {
      const d = getDragged();
      if (!d) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = d.kind === 'section' ? 'copy' : 'move';
      const i = indexAt(e.clientX);
      if (i !== dropAt) setDropAt(i);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
    },
    onDrop: (e: React.DragEvent) => {
      const d = getDragged();
      if (!d) return; // e.g. an audio file: the page takes it as the sample
      e.preventDefault();
      const i = indexAt(e.clientX);
      setDragged(null);
      setDropAt(null);
      if (d.kind === 'section') withUndo(`Added "${p.sections.find((s) => s.id === d.id)?.name}" to the song`, () => addBlock(d.id, i));
      else moveBlockTo(d.index, i);
    },
  };

  return (
    <section className={'card px-3 py-2 shrink-0 transition ' + (sectionDrag ? 'ring-2 ring-cream-100/50' : '')} aria-label="Song">
      <div className="flex items-center gap-2">
        <div className="w-24 shrink-0 flex items-baseline justify-between gap-1 px-2">
          <span className="text-sm font-bold">Song</span>
          {dragging ? (
            // while dragging: the new length of the song once dropped
            <span className="text-[11px] text-cream-100 tabular-nums">{formatTime(shownTotal * sd)}</span>
          ) : (
            <span className="text-[11px] text-cream-500 tabular-nums" title={songMode ? 'Where the playhead is, of the whole song' : 'Length of the whole song'}>
              {songMode && total ? formatTime(at * sd) : formatTime(total * sd)}
              {songMode && total > 0 && <span className="hidden xl:inline"> / {formatTime(total * sd)}</span>}
            </span>
          )}
        </div>

        <div ref={areaRef} className="relative flex-1 min-w-0" {...drop}>
          {/* time ruler: a tick every bar, taller every 4 */}
          <div
            ref={rulerRef}
            role="slider"
            tabIndex={0}
            aria-label="Song position"
            aria-valuemin={0}
            aria-valuemax={Math.round(total * sd)}
            aria-valuenow={Math.round(at * sd)}
            aria-valuetext={formatTime(at * sd)}
            title={songMode ? 'Click or drag to move playback' : 'Click to open the section at that spot'}
            className="relative h-3 mb-0.5 rounded cursor-pointer touch-none select-none hover:bg-ink-700/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-kick/60"
            onPointerDown={(e) => {
              seeking.current = true;
              last.current = -1;
              rulerRef.current!.setPointerCapture(e.pointerId);
              seek(e.clientX);
            }}
            onPointerMove={(e) => seeking.current && songMode && seek(e.clientX)}
            onPointerUp={() => (seeking.current = false)}
            onPointerCancel={() => (seeking.current = false)}
            onKeyDown={(e) => {
              if (!total) return;
              const by = e.shiftKey ? 4 : STEPS_PER_BAR; // arrows: a bar (Shift: a beat)
              const to = e.key === 'ArrowRight' ? at + by : e.key === 'ArrowLeft' ? at - by : e.key === 'Home' ? 0 : e.key === 'End' ? total - 1 : null;
              if (to === null) return;
              e.preventDefault();
              e.stopPropagation();
              seekSong(to);
            }}
          >
            {Array.from({ length: total / STEPS_PER_BAR + 1 }, (_, b) => (
              <span
                key={b}
                className={'absolute bottom-0 w-px ' + (b % 4 === 0 ? 'h-2.5 bg-cream-500/50' : 'h-1.5 bg-cream-500/25')}
                style={{ left: `${pct(b * STEPS_PER_BAR)}%` }}
              />
            ))}
          </div>

          {/* the blocks */}
          <div className={'relative h-7 rounded-lg transition ' + (sectionDrag && dropAt === null ? 'bg-ink-700/80 outline-dashed outline-2 outline-cream-500/50' : 'bg-ink-900/70')}>
            {sectionDrag && dropAt === null && (
              <span className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <span className="rounded-md bg-ink-950/90 px-2.5 py-0.5 text-xs font-bold text-cream-100 shadow">Drop on the song to add {sectionDrag.name}</span>
              </span>
            )}
            {shownTotal === 0 && !sectionDrag && (
              <span className="absolute inset-0 flex items-center px-2.5 text-xs text-cream-500">Your song is empty. Drag a section here, or press ＋.</span>
            )}
            {items.map((seg, k) => {
              const b = seg.block;
              if (seg.ghost) {
                const color = sectionColor(p, b.section);
                return (
                  <div
                    key="ghost"
                    // the empty slot it will drop into (the section itself is the card under the pointer)
                    className="absolute top-0.5 bottom-0.5 rounded-md border-2 border-dashed pointer-events-none transition-[left,width] duration-150"
                    style={{ left: `${pctShown(starts[k])}%`, width: `calc(${pctShown(seg.steps)}% - 2px)`, borderColor: color, background: color + '1a' }}
                  />
                );
              }
              const name = p.sections.find((s) => s.id === b.section)?.name ?? '';
              const color = sectionColor(p, b.section);
              const off = PARTS.filter((part) => b.mute[part] && (part !== 'sample' || p.sample));
              const isOpen = open === b.id;
              const editing = b.section === p.activeSection;
              return (
                <button
                  key={b.id}
                  draggable
                  onDragStart={(e) => {
                    setOpen(null);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', name);
                    startDrag(e, { kind: 'block', index: seg.index }, { label: name, sub: b.repeats > 1 ? `×${b.repeats}` : undefined, color });
                  }}
                  // clicking the open block closes it (without the popover's "outside click" reopening it)
                  onPointerDown={(e) => isOpen && e.stopPropagation()}
                  onClick={() => setOpen(isOpen ? null : b.id)}
                  aria-expanded={isOpen}
                  aria-label={`${name} ×${b.repeats}${off.length ? `, ${off.map((o) => PART_ICON[o].label).join(', ')} off` : ''}${b.fill ? ', fill' : ''}`}
                  title={`${name}: click for its settings, drag to move it${off.length ? ` (${off.map((o) => PART_ICON[o].label).join(', ')} off)` : ''}`}
                  className={
                    'absolute top-0.5 bottom-0.5 rounded-md flex items-center gap-1 pl-1.5 pr-1 overflow-hidden text-left cursor-pointer transition-[left,width,opacity] duration-150 ' +
                    // picked up: it leaves an empty dashed slot (where it came from, or where it will land)
                    (seg.moving ? 'border-2 border-dashed [&>*]:invisible ' : 'border-l-2 hover:brightness-125 ') +
                    (!seg.moving && (isOpen ? 'ring-2 ring-cream-100 z-10 ' : editing ? 'ring-1 ring-cream-100/40 ' : '')) +
                    (dragging && !seg.moving ? (sectionDrag && dropAt === null ? 'opacity-30' : 'opacity-80') : '')
                  }
                  style={{
                    left: `${pctShown(starts[k])}%`,
                    width: `calc(${pctShown(seg.steps)}% - 2px)`,
                    borderColor: color,
                    background: seg.moving ? color + '1a' : color + (editing ? '4d' : '30'),
                  }}
                >
                  <span className="text-[11px] font-bold truncate text-cream-100">
                    {name}
                    {b.repeats > 1 && <span className="font-normal text-cream-500"> ×{b.repeats}</span>}
                  </span>
                  {/* quiet marks: a part switched off here; a drum fill at the end */}
                  {off.length > 0 && <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-cream-500/70" aria-hidden="true" />}
                  {b.fill && <span className="ml-auto shrink-0 text-[9px] font-extrabold uppercase tracking-wide text-cream-500" aria-hidden="true">fill</span>}
                </button>
              );
            })}
          </div>

          {/* the playhead, across the ruler and the blocks (while stopped: where Play will start) */}
          {songMode && total > 0 && !dragging && (
            <div
              className={'pointer-events-none absolute top-0 bottom-0 w-0.5 -ml-px rounded-full z-10 ' + (playing ? 'bg-cream-100 shadow-[0_0_8px_rgba(243,233,220,0.8)]' : 'bg-cream-100/70')}
              style={{ left: `${pct(at + (playing ? 0.5 : 0))}%` }}
            />
          )}

          {/* the open block's settings, under it (towards the middle, so it stays on screen) */}
          {timeline.map((seg) =>
            open === seg.block.id ? (
              <div key={seg.block.id} className="absolute top-full" style={pct(seg.start) < 60 ? { left: `${pct(seg.start)}%` } : { right: `${100 - pct(seg.start + seg.steps)}%` }}>
                <BlockPopover index={seg.index} onClose={() => setOpen(null)} className={'mt-1.5 ' + (pct(seg.start) < 60 ? 'left-0' : 'right-0')} />
              </div>
            ) : null,
          )}
        </div>

        <AddBlockButton />
      </div>
    </section>
  );
}
