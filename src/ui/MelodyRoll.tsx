import { useEffect, useRef, useState } from 'react';
import { Note } from 'tonal';
import { ensureAudio, previewNote } from '../audio/engine';
import { degreeNote, melodyPitch, slotNotes } from '../music/chords';
import { slotLength } from '../music/patterns';
import { useProject, useUi, withUndo } from '../state/project';
import { allMelodies, MAIN_MELODY, melodyColor, melodyName, melodyTrack } from '../state/tracks';
import { MAX_EXTRA_MELODIES, MELODY_ROWS, STEPS_PER_BAR, type MelodyNote } from '../state/types';
import { EditorHeader, ICON_BTN, TOOL_BTN } from './EditorHeader';
import { MELODY_LABEL, MelodySoundControls } from './SoundControls';
import { TipsButton } from './TipsButton';

// rows share the editor's height: at least 14px (short laptops), at most 30px (big screens)
const ROWS_TEMPLATE = `repeat(${MELODY_ROWS}, minmax(14px, 30px))`;

type Key = { s: number; d: number };
const same = (a: Key, b: Key) => a.s === b.s && a.d === b.d;
type Drag =
  | { mode: 'resize'; s: number; d: number; l: number }
  | { mode: 'move'; col: number; row: number; keys: Key[]; moved: boolean; click: { s: number; d: number; l: number; grab: number } }
  | { mode: 'box'; x0: number; y0: number; add: Key[] };

/** Notes copied with Ctrl+C / Ctrl+X, kept for the whole session so they can be pasted into any melody. */
let clipboard: MelodyNote[] = [];

const k = (t: string) => <b className="text-cream-100">{t}</b>;

/** "How to edit", at the top of the Melody editor's ? panel. */
const MELODY_HOW_TO: React.ReactNode[] = [
  <>{k('Click')} to add a note, and drag right to hold it longer.</>,
  <>{k('Drag a note')} to move it.</>,
  <>Hover between two steps of a long note and {k('click the line')} to split it.</>,
  <>Press a note's {k('✕')} (or {k('right-click')} it) to remove it.</>,
  <>
    {k('Hold Alt and drag')} to pick several notes, then use {k('Ctrl+C')}, {k('Ctrl+X')}, {k('Ctrl+V')} or {k('Delete')}.
  </>,
  <>Only notes from the key are shown.</>,
  <>
    <b className="text-chord">Blue squares</b> are in the chord playing at that moment, so they always fit.
  </>,
  <>Outlines are your other melodies.</>,
];

export function MelodyRoll() {
  const p = useProject((s) => s.project);
  const { addNote, resizeNote, removeNotes, moveNotes, pasteNotes, splitNote, clearMelody, randomizeMelody, copyMelodyBarToAll } = useProject();
  const { viewBar, step: playStep } = useUi();
  const bar = Math.min(viewBar, p.bars - 1);
  const offset = bar * STEPS_PER_BAR;
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // the picked notes (Alt+drag a box, Shift+click to add), and the box being drawn (pixels inside the roll)
  const [selection, setSelection] = useState<Key[]>([]);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const lastCol = useRef(0); // the step the pointer was last over, where pasted notes land
  // the melody being edited (back to the first one if it was removed)
  const picked = useUi((s) => s.melodyId);
  const id = melodyTrack(p, picked) ? picked : MAIN_MELODY;
  const m = melodyTrack(p, id)!;
  const color = melodyColor(p, id);
  const name = melodyName(p, id);

  // picked notes belong to the bar and melody they were picked in; a new bar starts clean, and paste lands at its start
  useEffect(() => {
    setSelection([]);
    lastCol.current = offset;
  }, [bar, id, p.activeSection]);

  // Which pitch classes belong to the chord playing at each visible column.
  const len = slotLength(p.bars, p.chords.slots.length);
  const chordAt = (step: number) => p.chords.slots[Math.min(p.chords.slots.length - 1, Math.floor(step / len))];
  const colChroma = Array.from({ length: STEPS_PER_BAR }, (_, i) => {
    const c = chordAt(offset + i);
    return new Set(c ? slotNotes(c).map((n) => Note.chroma(n)) : []);
  });
  // chord names across the top, one label per chord change
  const chordLabels: { col: number; span: number; name: string }[] = [];
  for (let i = 0; i < STEPS_PER_BAR; i++) {
    const c = chordAt(offset + i);
    const prev = chordLabels[chordLabels.length - 1];
    const slotStart = (offset + i) % len === 0;
    if (!prev || slotStart) chordLabels.push({ col: i, span: 1, name: c?.symbol ?? 'rest' });
    else prev.span++;
  }

  const rows = Array.from({ length: MELODY_ROWS }, (_, i) => MELODY_ROWS - 1 - i); // top = highest
  const noteName = (d: number) => degreeNote(p.tonic, p.mood, m.octave, d);
  /** What a placed note really sounds like (its row's note, plus any accidental). */
  const pitchOf = (n: { d: number; x?: -1 | 1 }) => melodyPitch(p.tonic, p.mood, m.octave, n.d, n.x ?? 0);

  const rowFromEvent = (e: React.PointerEvent) => {
    const r = gridRef.current!.getBoundingClientRect();
    const row = Math.max(0, Math.min(MELODY_ROWS - 1, Math.floor(((e.clientY - r.top) / r.height) * MELODY_ROWS)));
    return MELODY_ROWS - 1 - row; // top row = highest pitch
  };

  const colFromEvent = (e: React.PointerEvent) => {
    const r = gridRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(STEPS_PER_BAR - 1, Math.floor(((e.clientX - r.left) / r.width) * STEPS_PER_BAR)));
  };

  useEffect(() => {
    const end = () => {
      drag.current = null;
      setBox(null);
    };
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, []);

  // the picked notes that still exist
  const sel = selection.filter((k) => m.notes.some((n) => same(n, k)));
  const isSel = (n: Key) => sel.some((k) => same(k, n));
  const total = p.bars * STEPS_PER_BAR;

  /** Can these notes move together by (ds, dd) without leaving the grid or landing on another note? */
  const canMove = (keys: Key[], ds: number, dd: number) =>
    m.notes
      .filter((n) => keys.some((k) => same(k, n)))
      .every((n) => {
        const s2 = n.s + ds;
        const d2 = n.d + dd;
        return (
          s2 >= 0 &&
          s2 + n.l <= total &&
          d2 >= 0 &&
          d2 < MELODY_ROWS &&
          !m.notes.some((x) => !keys.some((k) => same(k, x)) && x.d === d2 && x.s < s2 + n.l && x.s + x.l > s2)
        );
      });

  // keyboard: Ctrl+A select all, Ctrl+C / X / V copy, cut, paste, Delete, arrows nudge, Esc deselect
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      if (document.querySelector('[role=dialog][aria-modal=true]')) return;
      const notify = useUi.getState().notify;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const chosen = m.notes.filter(isSel);

      if (mod && key === 'a') {
        e.preventDefault();
        setSelection(m.notes.map((n) => ({ s: n.s, d: n.d })));
      } else if (mod && (key === 'c' || key === 'x') && chosen.length) {
        e.preventDefault();
        const first = Math.min(...chosen.map((n) => n.s));
        clipboard = chosen.map((n) => ({ s: n.s - first, l: n.l, d: n.d, ...(n.x ? { x: n.x } : {}) }));
        if (key === 'x') {
          removeNotes(chosen, id);
          setSelection([]);
        }
        notify(`${key === 'x' ? 'Cut' : 'Copied'} ${chosen.length} note${chosen.length > 1 ? 's' : ''}`);
      } else if (mod && key === 'v' && clipboard.length) {
        e.preventDefault();
        // paste where the pointer last was in the roll (or the start of this bar); notes past the loop's end are clipped
        const at = lastCol.current;
        const pasted = clipboard
          .map((n) => ({ ...n, s: n.s + at }))
          .filter((n) => n.s < total)
          .map((n) => ({ ...n, l: Math.min(n.l, total - n.s) }));
        if (!pasted.length) return;
        pasteNotes(pasted, id);
        setSelection(pasted.map((n) => ({ s: n.s, d: n.d })));
        notify(`Pasted ${pasted.length} note${pasted.length > 1 ? 's' : ''}`);
      } else if (mod || e.altKey) {
        return;
      } else if (!chosen.length) {
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeNotes(chosen, id);
        setSelection([]);
      } else if (e.key === 'Escape') {
        setSelection([]);
      } else {
        const ds = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        const dd = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
        if (!ds && !dd) return;
        e.preventDefault();
        if (!canMove(chosen, ds, dd)) return;
        moveNotes(chosen, ds, dd, id);
        setSelection(chosen.map((n) => ({ s: n.s + ds, d: n.d + dd })));
        if (dd) previewNote(noteName(chosen[0].d + dd), 'melody', id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const startBox = (e: React.PointerEvent) => {
    const r = gridRef.current!.getBoundingClientRect();
    const x0 = e.clientX - r.left;
    const y0 = e.clientY - r.top;
    drag.current = { mode: 'box', x0, y0, add: e.shiftKey ? sel : [] };
    setBox({ x0, y0, x1: x0, y1: y0 });
    if (!e.shiftKey) setSelection([]);
    gridRef.current?.setPointerCapture(e.pointerId);
  };

  const startNew = (e: React.PointerEvent, d: number) => {
    ensureAudio();
    const s = offset + colFromEvent(e);
    addNote({ s, l: 1, d }, id);
    previewNote(noteName(d), 'melody', id);
    setSelection([{ s, d }]);
    drag.current = { mode: 'resize', s, d, l: 1 };
    gridRef.current?.setPointerCapture(e.pointerId);
  };

  const startNote = (e: React.PointerEvent, n: { s: number; d: number; l: number }) => {
    if (e.button !== 0) return; // right-click is handled separately
    e.stopPropagation();
    if (e.altKey) return startBox(e);
    if (e.shiftKey) {
      setSelection(isSel(n) ? sel.filter((k) => !same(k, n)) : [...sel, { s: n.s, d: n.d }]);
      return;
    }
    ensureAudio();
    previewNote(pitchOf(n), 'melody', id);
    // dragging one of several picked notes moves them all; otherwise just this one
    const keys = isSel(n) && sel.length > 1 ? sel : [{ s: n.s, d: n.d }];
    setSelection(keys);
    const col = offset + colFromEvent(e);
    drag.current = { mode: 'move', col, row: rowFromEvent(e), keys, moved: false, click: { s: n.s, d: n.d, l: n.l, grab: col - n.s } };
    gridRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const col = offset + colFromEvent(e);
    lastCol.current = col;
    const dr = drag.current;
    if (!dr) return;
    if (dr.mode === 'box') {
      const r = gridRef.current!.getBoundingClientRect();
      const x1 = Math.max(0, Math.min(r.width, e.clientX - r.left));
      const y1 = Math.max(0, Math.min(r.height, e.clientY - r.top));
      setBox({ x0: dr.x0, y0: dr.y0, x1, y1 });
      // pick every note the box touches
      const left = r.left + Math.min(dr.x0, x1);
      const right = r.left + Math.max(dr.x0, x1);
      const top = r.top + Math.min(dr.y0, y1);
      const bottom = r.top + Math.max(dr.y0, y1);
      const hit: Key[] = [];
      gridRef.current!.querySelectorAll<HTMLElement>('[data-note]').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.left < right && b.right > left && b.top < bottom && b.bottom > top) {
          const [s, d] = el.dataset.note!.split(':').map(Number);
          hit.push({ s, d });
        }
      });
      setSelection([...dr.add, ...hit.filter((k) => !dr.add.some((a) => same(a, k)))]);
      return;
    }
    if (dr.mode === 'move') {
      const ds = col - dr.col;
      const dd = rowFromEvent(e) - dr.row;
      if (!ds && !dd) return;
      if (!canMove(dr.keys, ds, dd)) return; // blocked: stay put, and try again from here on the next move
      moveNotes(dr.keys, ds, dd, id);
      dr.keys = dr.keys.map((k) => ({ s: k.s + ds, d: k.d + dd }));
      dr.col += ds;
      dr.row += dd;
      dr.click = { ...dr.click, s: dr.click.s + ds, d: dr.click.d + dd };
      dr.moved = true;
      setSelection(dr.keys);
      if (dd) previewNote(noteName(dr.click.d), 'melody', id);
      return;
    }
    const l = Math.max(1, col - dr.s + 1);
    if (l === dr.l) return;
    dr.l = l;
    resizeNote(dr.s, dr.d, l, id);
  };

  const inBar = (n: { s: number; l: number }) => n.s < offset + STEPS_PER_BAR && n.s + n.l > offset;
  const clip = <T extends { s: number; l: number }>(n: T) => ({
    ...n,
    from: Math.max(n.s, offset) - offset,
    to: Math.min(n.s + n.l, offset + STEPS_PER_BAR) - offset,
  });
  const visible = m.notes.filter((n) => inBar(n) && n.d < MELODY_ROWS).map(clip);
  // the other melodies, drawn faintly at the pitch they sound (their octave may differ from this one's)
  const others = allMelodies(p)
    .filter((o) => o.id !== id)
    .flatMap((o) =>
      o.track.notes
        .map((n) => ({ ...n, d: n.d + (o.track.octave - m.octave) * 7, color: melodyColor(p, o.id) }))
        .filter((n) => inBar(n) && n.d >= 0 && n.d < MELODY_ROWS)
        .map(clip),
    );

  return (
    <>
      <EditorHeader sound={<MelodySoundControls />}>
        {p.bars > 1 && (
          <button
            className={TOOL_BTN}
            onClick={() => withUndo(`Copied bar ${bar + 1} of ${name.toLowerCase()} into every bar`, () => copyMelodyBarToAll(bar, id))}
            disabled={!m.notes.some((n) => n.s < offset + STEPS_PER_BAR && n.s + n.l > offset)}
            title="Copy this bar's notes into every other bar (replaces what is there)"
          >
            ⧉ Copy bar to all
          </button>
        )}
        <button
          className={ICON_BTN}
          onClick={() => withUndo(`New ${name.toLowerCase()} 🎲`, () => randomizeMelody(id))}
          title={`Surprise me: make a random, gentle ${name.toLowerCase()}`}
          aria-label="Random melody"
        >
          🎲
        </button>
        <button
          className={TOOL_BTN}
          onClick={() => withUndo(`${name} cleared`, () => clearMelody(id))}
          title={`Remove all of ${name}'s notes (every bar)`}
          disabled={m.notes.length === 0}
        >
          ✕ Clear {name.toLowerCase()}
        </button>
        <TipsButton
          title="Tips for a nice melody"
          tips={[
            <>
              <b className="text-cream-100">Start simple.</b> A few notes per bar sounds better than a busy line.
            </>,
            <>
              <b className="text-cream-100">Use the blue squares</b> on the big beats. They belong to the chord playing, so they always fit.
            </>,
            <>
              <b className="text-cream-100">Move by small steps</b> to the next note, with a bigger jump now and then for interest.
            </>,
            <>
              <b className="text-cream-100">Leave gaps.</b> Silence is part of the melody, and it makes the notes stand out.
            </>,
            <>
              <b className="text-cream-100">Repeat an idea,</b> then change the ending. Repeating makes it catchy.
            </>,
            <>
              <b className="text-cream-100">Finish on a long note</b> that fits the last chord. The ★ rows are the key note, the most "home" sound.
            </>,
            <>
              <b className="text-cream-100">Stuck?</b> Press 🎲 for a fresh idea and tweak it.
            </>,
          ]}
          before={[{ title: 'How to edit', tips: MELODY_HOW_TO }]}
        />
      </EditorHeader>
      <MelodyPicker current={id} />

      <div className="overflow-auto -mx-1 px-1 flex-1 min-h-0">
        <div className="min-w-[720px] h-full flex flex-col">
          {/* chord names above the grid */}
          <div className="flex gap-2 mb-1 shrink-0">
            <div className="w-16 shrink-0" />
            <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: `repeat(${STEPS_PER_BAR}, minmax(0, 1fr))` }}>
              {chordLabels.map((c) => (
                <div
                  key={c.col}
                  className="text-xs font-extrabold text-chord truncate border-l-2 border-chord/50 pl-1"
                  style={{ gridColumn: `${c.col + 1} / span ${c.span}` }}
                >
                  {c.name}
                </div>
              ))}
              {/* beat numbers, so you can count along */}
              {Array.from({ length: STEPS_PER_BAR }, (_, i) => (
                <div
                  key={'beat' + i}
                  aria-hidden="true"
                  className={
                    'row-start-2 text-center leading-none ' +
                    (i % 4 === 0 ? 'text-xs font-extrabold ' : 'text-xs ') +
                    (playStep >= offset && Math.floor((playStep - offset) / 4) === Math.floor(i / 4) ? 'text-cream-100' : 'text-cream-500')
                  }
                  style={{ gridColumn: i + 1 }}
                >
                  {i % 4 === 0 ? i / 4 + 1 : '·'}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 flex-1 min-h-0">
            {/* note names */}
            <div className="w-16 shrink-0 grid gap-y-px" style={{ gridTemplateRows: ROWS_TEMPLATE }}>
              {rows.map((d) => {
                const name = noteName(d);
                return (
                  <button
                    key={d}
                    className={
                      'text-xs font-bold rounded px-1 text-right leading-none hover:bg-ink-600 ' +
                      (d % 7 === 0 ? 'text-cream-100 bg-ink-700' : 'text-cream-500')
                    }
                    onClick={() => previewNote(name, 'melody', id)}
                    title={d % 7 === 0 ? 'The key note: melodies love to end here' : 'Click to hear'}
                  >
                    {d % 7 === 0 && '★ '}
                    {name}
                  </button>
                );
              })}
            </div>

            {/* the roll */}
            <div
              ref={gridRef}
              className="relative grid flex-1 gap-x-0.5 gap-y-px touch-none select-none"
              style={{
                gridTemplateColumns: `repeat(${STEPS_PER_BAR}, minmax(0, 1fr))`,
                gridTemplateRows: ROWS_TEMPLATE,
              }}
              onPointerMove={onMove}
            >
              {rows.map((d, r) =>
                Array.from({ length: STEPS_PER_BAR }, (_, i) => {
                  const chroma = Note.chroma(noteName(d));
                  const inChord = colChroma[i].has(chroma);
                  return (
                    <div
                      key={`${d}-${i}`}
                      onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    if (e.altKey) startBox(e);
                    else startNew(e, d);
                  }}
                      className={
                        'cell rounded-sm ' +
                        (inChord ? 'bg-chord/45 ' : i % 4 === 0 ? 'bg-ink-600/80 ' : 'bg-ink-700 ')
                      }
                      style={{ gridColumn: i + 1, gridRow: r + 1 }}
                      title={`${noteName(d)}${inChord ? ' (in the chord: always sounds good)' : ''}`}
                    />
                  );
                }),
              )}
              {/* playhead: a line running across the roll (16 columns, 15 gaps of 2px) */}
              {playStep >= offset && playStep < offset + STEPS_PER_BAR && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 -ml-px rounded-full bg-cream-100 shadow-[0_0_8px_rgba(243,233,220,0.8)]"
                  style={{
                    left: `calc((100% - 30px) * ${(playStep - offset + 0.5) / STEPS_PER_BAR} + ${(playStep - offset) * 2}px)`,
                  }}
                />
              )}
              {/* the other melodies, as faint outlines (not clickable) so you can write around them */}
              {others.map((n, k) => (
                <div
                  key={`ghost-${k}`}
                  aria-hidden="true"
                  className="pointer-events-none rounded-md border-2"
                  style={{
                    gridColumn: `${n.from + 1} / ${n.to + 1}`,
                    gridRow: MELODY_ROWS - n.d,
                    borderColor: n.color,
                    opacity: 0.45,
                  }}
                />
              ))}
              {visible.map((n) => (
                <div
                  key={`${n.s}-${n.d}`}
                  data-note={`${n.s}:${n.d}`}
                  className={
                    'relative z-10 rounded-md shadow-md flex items-center cursor-grab active:cursor-grabbing hover:brightness-110 ' +
                    (isSel(n) ? 'ring-2 ring-cream-100' : '')
                  }
                  style={{
                    gridColumn: `${n.from + 1} / ${n.to + 1}`,
                    gridRow: MELODY_ROWS - n.d,
                    background: color,
                    opacity: m.mute ? 0.4 : 1,
                  }}
                  onPointerDown={(e) => startNote(e, n)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    removeNotes(isSel(n) && sel.length > 1 ? sel : [n], id);
                    setSelection([]);
                  }}
                  title={`${noteName(n.d)}: drag to move, drag its right edge to resize, right-click to delete. Alt+drag to pick several notes`}
                >
                  <span className="text-xs font-extrabold text-ink-950 pl-1 truncate pointer-events-none">
                    {n.s >= offset ? Note.pitchClass(pitchOf(n)) : ''}
                  </span>
                  {sel.length === 1 && isSel(n) && (
                    <button
                      className="absolute right-2.5 top-0 bottom-0 px-1 text-xs font-extrabold text-ink-950/70 hover:text-ink-950"
                      aria-label="Delete note"
                      title="Delete this note"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNotes([n], id);
                        setSelection([]);
                      }}
                    >
                      ✕
                    </button>
                  )}
                  {/* thin split lines between the steps inside the note: hover to see one, click it to cut the note there */}
                  {Array.from({ length: n.to - n.from - 1 }, (_, j) => j + 1).map((j) => (
                    <div
                      key={`split-${j}`}
                      className="group/split absolute top-0 bottom-0 z-20 w-2 -ml-1 cursor-pointer"
                      style={{ left: `calc(${j} / ${n.to - n.from} * (100% + 2px) - 1px)` }}
                      title="Click to split the note here"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const at = offset + n.from + j;
                        splitNote(n.s, n.d, at, id);
                        setSelection([{ s: at, d: n.d }]);
                      }}
                    >
                      <div className="pointer-events-none absolute inset-y-0.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-cream-100/80 opacity-0 group-hover/split:opacity-100" />
                    </div>
                  ))}
                  {n.s + n.l <= offset + STEPS_PER_BAR && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-r-md hover:bg-ink-950/40"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.altKey) return startBox(e);
                        setSelection([{ s: n.s, d: n.d }]);
                        drag.current = { mode: 'resize', s: n.s, d: n.d, l: n.l };
                        gridRef.current?.setPointerCapture(e.pointerId);
                      }}
                    />
                  )}
                </div>
              ))}
              {/* the selection box drawn with Alt+drag */}
              {box && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute z-30 rounded-sm border-2 border-cream-100/90 bg-cream-100/10"
                  style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The melodies in this beat, one tab each with its instrument, plus "Add melody".
 * Every melody has its own instrument, octave and volume (set on the right).
 */
function MelodyPicker({ current }: { current: string }) {
  const p = useProject((s) => s.project);
  const { addMelody, removeMelody } = useProject();
  const set = useUi((s) => s.set);
  const melodies = allMelodies(p);
  const canAdd = p.extraMelodies.length < MAX_EXTRA_MELODIES;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2 shrink-0" role="tablist" aria-label="Melodies">
      {melodies.map(({ id, track }) => {
        const on = id === current;
        const name = melodyName(p, id);
        return (
          <div
            key={id}
            className={'flex items-center rounded-lg border-2 transition ' + (on ? 'bg-ink-600 border-cream-100' : 'border-ink-600 hover:border-cream-500')}
          >
            <button
              role="tab"
              aria-selected={on}
              onClick={() => set({ melodyId: id })}
              className={'flex items-center gap-1.5 pl-2 pr-2 py-1 text-xs font-bold ' + (on ? 'text-cream-100' : 'text-cream-500 hover:text-cream-100')}
              title={`Edit ${name}`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: melodyColor(p, id) }} />
              {name}
              <span className="font-normal text-cream-500">{MELODY_LABEL[track.sound]}</span>
              {track.mute && <span aria-label="muted">🔇</span>}
            </button>
            {id !== MAIN_MELODY && on && (
              <button
                className="px-1.5 py-1 text-xs text-cream-500 hover:text-cream-100"
                onClick={() => {
                  withUndo(`Removed ${name}`, () => removeMelody(id));
                  set({ melodyId: MAIN_MELODY });
                }}
                title={`Remove ${name} (its notes in every section)`}
                aria-label={`Remove ${name}`}
              >
                🗑
              </button>
            )}
          </div>
        );
      })}
      <button
        className="rounded-lg border-2 border-dashed border-ink-600 px-2.5 py-1 text-xs font-bold text-cream-500 hover:text-cream-100 hover:border-cream-500 disabled:opacity-40 disabled:pointer-events-none"
        onClick={() => {
          const id = addMelody();
          if (id) set({ melodyId: id });
        }}
        disabled={!canAdd}
        title={canAdd ? 'Add another melody with its own instrument' : `Up to ${MAX_EXTRA_MELODIES + 1} melodies`}
      >
        ＋ Add melody
      </button>
    </div>
  );
}
