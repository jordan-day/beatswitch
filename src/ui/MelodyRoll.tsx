import { useEffect, useRef } from 'react';
import { Note } from 'tonal';
import { ensureAudio, previewNote } from '../audio/engine';
import { degreeNote, slotNotes } from '../music/chords';
import { slotLength } from '../music/patterns';
import { useProject, useUi, withUndo } from '../state/project';
import { allMelodies, MAIN_MELODY, melodyColor, melodyName, melodyTrack } from '../state/tracks';
import { MAX_EXTRA_MELODIES, MELODY_ROWS, STEPS_PER_BAR } from '../state/types';
import { EditorHeader } from './EditorHeader';
import { MELODY_LABEL, MelodySoundControls } from './SoundControls';

// rows share the editor's height: at least 14px (short laptops), at most 30px (big screens)
const ROWS_TEMPLATE = `repeat(${MELODY_ROWS}, minmax(14px, 30px))`;

export function MelodyRoll() {
  const p = useProject((s) => s.project);
  const { addNote, resizeNote, removeNote, clearMelody, randomizeMelody } = useProject();
  const { viewBar, step: playStep } = useUi();
  const bar = Math.min(viewBar, p.bars - 1);
  const offset = bar * STEPS_PER_BAR;
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ s: number; d: number; l: number } | null>(null);
  // the melody being edited (back to the first one if it was removed)
  const picked = useUi((s) => s.melodyId);
  const id = melodyTrack(p, picked) ? picked : MAIN_MELODY;
  const m = melodyTrack(p, id)!;
  const color = melodyColor(p, id);
  const name = melodyName(p, id);

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
    addNote({ s, l: 1, d }, id);
    previewNote(noteName(d), 'melody', id);
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
      <EditorHeader>
        <MelodySoundControls />
        {m.mute && <span className="text-xs font-bold text-kick">🔇 {name} is muted</span>}
        <button
          className="btn text-base px-2.5 py-1"
          onClick={() => withUndo(`New ${name.toLowerCase()} 🎲`, () => randomizeMelody(id))}
          title={`Surprise me: make a random, gentle ${name.toLowerCase()}`}
          aria-label="Random melody"
        >
          🎲
        </button>
        <button
          className="btn text-xs"
          onClick={() => withUndo(`${name} cleared`, () => clearMelody(id))}
          title={`Remove all of ${name}'s notes (every bar)`}
          disabled={m.notes.length === 0}
        >
          ✕ Clear {name.toLowerCase()}
        </button>
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
                      onPointerDown={(e) => startNew(e, d)}
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
                  className="relative z-10 rounded-md shadow-md flex items-center cursor-pointer hover:brightness-110"
                  style={{
                    gridColumn: `${n.from + 1} / ${n.to + 1}`,
                    gridRow: MELODY_ROWS - n.d,
                    background: color,
                    opacity: m.mute ? 0.4 : 1,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    removeNote(n.s, n.d, id);
                  }}
                  title={`${noteName(n.d)}: click to delete, drag the right edge to make longer/shorter`}
                >
                  <span className="text-xs font-extrabold text-ink-950 pl-1 truncate pointer-events-none">
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
        {allMelodies(p).length > 1 && ' Outlines are your other melodies.'}
      </p>
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
