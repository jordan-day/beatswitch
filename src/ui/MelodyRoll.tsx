import { useEffect, useRef } from 'react';
import { Note } from 'tonal';
import { ensureAudio, previewNote } from '../audio/engine';
import { degreeNote, slotNotes } from '../music/chords';
import { slotLength } from '../music/patterns';
import { useProject, useUi, withUndo } from '../state/project';
import { MELODY_ROWS, STEPS_PER_BAR } from '../state/types';
import { EditorHeader } from './EditorHeader';

const COLOR = '#f2a65a';
// rows share the editor's height: at least 14px (short laptops), at most 30px (big screens)
const ROWS_TEMPLATE = `repeat(${MELODY_ROWS}, minmax(14px, 30px))`;

export function MelodyRoll() {
  const p = useProject((s) => s.project);
  const { addNote, resizeNote, removeNote, clearRow } = useProject();
  const { viewBar, step: playStep } = useUi();
  const bar = Math.min(viewBar, p.bars - 1);
  const offset = bar * STEPS_PER_BAR;
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ s: number; d: number; l: number } | null>(null);
  const m = p.melody;

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

  const colFromEvent = (e: React.PointerEvent) => {
    const r = gridRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(STEPS_PER_BAR - 1, Math.floor(((e.clientX - r.left) / r.width) * STEPS_PER_BAR)));
  };

  useEffect(() => {
    const end = () => (drag.current = null);
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, []);

  const startNew = (e: React.PointerEvent, d: number) => {
    ensureAudio();
    const s = offset + colFromEvent(e);
    addNote({ s, l: 1, d });
    previewNote(noteName(d));
    drag.current = { s, d, l: 1 };
    gridRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const dr = drag.current;
    if (!dr) return;
    const col = offset + colFromEvent(e);
    const l = Math.max(1, col - dr.s + 1);
    if (l === dr.l) return;
    dr.l = l;
    resizeNote(dr.s, dr.d, l);
  };

  const visible = m.notes
    .filter((n) => n.s < offset + STEPS_PER_BAR && n.s + n.l > offset && n.d < MELODY_ROWS)
    .map((n) => ({ ...n, from: Math.max(n.s, offset) - offset, to: Math.min(n.s + n.l, offset + STEPS_PER_BAR) - offset }));

  return (
    <>
      <EditorHeader barPicker>
        {m.mute && <span className="text-xs font-bold text-kick">🔇 Melody is muted</span>}
        <button
          className="btn text-xs"
          onClick={() => withUndo('Melody cleared', () => clearRow('melody'))}
          title="Remove all melody notes (every bar)"
          disabled={m.notes.length === 0}
        >
          ✕ Clear melody
        </button>
      </EditorHeader>

      <div className="overflow-auto -mx-1 px-1 flex-1 min-h-0">
        <div className="min-w-[720px] h-full flex flex-col">
          {/* chord names above the grid */}
          <div className="flex gap-2 mb-1 shrink-0">
            <div className="w-16 shrink-0" />
            <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: `repeat(${STEPS_PER_BAR}, minmax(0, 1fr))` }}>
              {chordLabels.map((c) => (
                <div
                  key={c.col}
                  className="text-[11px] font-extrabold text-chord truncate border-l-2 border-chord/50 pl-1"
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
                    (i % 4 === 0 ? 'text-[11px] font-extrabold ' : 'text-[9px] ') +
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
                      'text-[11px] font-bold rounded px-1 text-right leading-none hover:bg-ink-600 ' +
                      (d % 7 === 0 ? 'text-cream-100 bg-ink-700' : 'text-cream-500')
                    }
                    onClick={() => previewNote(name)}
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
                  const now = playStep - offset === i;
                  return (
                    <div
                      key={`${d}-${i}`}
                      onPointerDown={(e) => startNew(e, d)}
                      className={
                        'cell rounded-sm ' +
                        (inChord ? 'bg-chord/45 ' : i % 4 === 0 ? 'bg-ink-600/80 ' : 'bg-ink-700 ') +
                        (now ? 'ring-1 ring-cream-100/70' : '')
                      }
                      style={{ gridColumn: i + 1, gridRow: r + 1 }}
                      title={`${noteName(d)}${inChord ? ' (in the chord: always sounds good)' : ''}`}
                    />
                  );
                }),
              )}
              {visible.map((n) => (
                <div
                  key={`${n.s}-${n.d}`}
                  className="relative z-10 rounded-md shadow-md flex items-center cursor-pointer hover:brightness-110"
                  style={{
                    gridColumn: `${n.from + 1} / ${n.to + 1}`,
                    gridRow: MELODY_ROWS - n.d,
                    background: COLOR,
                    opacity: m.mute ? 0.4 : 1,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    removeNote(n.s, n.d);
                  }}
                  title={`${noteName(n.d)}: click to delete, drag the right edge to make longer/shorter`}
                >
                  <span className="text-[10px] font-extrabold text-ink-950 pl-1 truncate pointer-events-none">
                    {n.s >= offset ? Note.pitchClass(noteName(n.d)) : ''}
                  </span>
                  {n.s + n.l <= offset + STEPS_PER_BAR && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md bg-ink-950/25 hover:bg-ink-950/50"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        drag.current = { s: n.s, d: n.d, l: n.l };
                        gridRef.current?.setPointerCapture(e.pointerId);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-cream-500 mt-2 shrink-0">
        Click to add a note, drag right to hold it longer, click a note to delete it. Only notes from the key are shown.{' '}
        <span className="text-chord font-bold">Blue squares</span> are in the chord playing at that moment, so they always fit.
      </p>
    </>
  );
}
