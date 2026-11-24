import { useEffect, useRef, useState } from 'react';
import { Note } from 'tonal';
import { previewChord, previewNote, previewProgression } from '../audio/engine';
import {
  chordFeel,
  chordFlavors,
  chordRoles,
  chordRoot,
  detectChord,
  fittingChords,
  invert,
  keyLabel,
  MOOD_INFO,
  PROGRESSIONS,
  progressionChords,
  renameForNotes,
  slotNotes,
  sortNotes,
  suggestNext,
} from '../music/chords';
import { slotLength } from '../music/patterns';
import { useProject, useUi } from '../state/project';
import type { ChordSlot } from '../state/types';
import { EditorHeader } from './EditorHeader';
import { MiniKeyboard } from './MiniKeyboard';

/** The Chords editor: chord slots + the selected chord's notes on the left, "what to play" ideas on the right. */
export function ChordPanel() {
  const p = useProject((s) => s.project);
  const setChordCount = useProject((s) => s.setChordCount);
  const { step, selectedSlot, set } = useUi();
  const count = p.chords.slots.length;
  const activeSlot = step >= 0 ? Math.min(count - 1, Math.floor(step / slotLength(p.bars, count))) : -1;
  const sel = Math.min(selectedSlot, count - 1);

  return (
    <>
      <EditorHeader>
        <ProgressionPicker />
        <div className="flex rounded-lg bg-ink-700 p-0.5" title="How many chord changes per loop">
          {([4, 8] as const).map((n) => (
            <button
              key={n}
              className={'px-2.5 py-1 rounded-md text-xs font-bold transition ' + (count === n ? 'bg-cream-100 text-ink-950' : 'text-cream-300 hover:text-cream-100')}
              onClick={() => setChordCount(n)}
              aria-pressed={count === n}
            >
              {n} chords
            </button>
          ))}
        </div>
      </EditorHeader>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        <div className={'grid gap-1.5 mb-2 ' + (count === 8 ? 'grid-cols-4 md:grid-cols-8' : 'grid-cols-2 sm:grid-cols-4')}>
          {p.chords.slots.map((c, i) => (
            <button
              key={i}
              onClick={() => {
                set({ selectedSlot: i });
                if (c) previewChord(c);
              }}
              aria-pressed={i === sel}
              className={
                'rounded-xl px-2.5 py-1 border-2 text-left transition min-w-0 flex items-baseline gap-2 ' +
                (i === sel ? 'border-cream-100 ' : activeSlot === i ? 'border-chord ' : 'border-ink-600 ') +
                (activeSlot === i ? 'bg-chord/20' : 'bg-ink-700/40 hover:bg-ink-700')
              }
              title={c ? `${c.symbol}: ${c.notes ? 'custom notes' : chordFeel(c.symbol, p.tonic, p.mood)}` : 'Rest'}
            >
              <span className="font-extrabold truncate text-base shrink-0">{c ? c.symbol : '–'}</span>
              {count === 4 && (
                <span className="text-[11px] text-cream-500 truncate">
                  {c ? (c.notes ? '✏️ custom' : chordFeel(c.symbol, p.tonic, p.mood)) : 'rest'}
                </span>
              )}
            </button>
          ))}
        </div>

        <ChordEditor index={sel} />
      </div>
    </>
  );
}

/** Ready-made progressions for the current mood, in a dropdown so they don't take up room. */
function ProgressionPicker() {
  const p = useProject((s) => s.project);
  const update = useProject((s) => s.update);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button className="btn text-xs" onClick={() => setOpen(!open)} aria-expanded={open} title="Fill all chords with a ready-made progression">
        ✨ Progressions ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 card p-2 w-80 flex flex-col gap-1">
          <div className="label px-2 py-1">
            {MOOD_INFO[p.mood].emoji} {MOOD_INFO[p.mood].label} progressions in {keyLabel(p.tonic, p.mood)}
          </div>
          {PROGRESSIONS[p.mood].map((pr) => {
            const chords = progressionChords(p.tonic, pr);
            const selected = p.chords.slots.length === 4 && p.chords.slots.every((s, i) => s && !s.notes && s.symbol === chords[i]);
            return (
              <div key={pr.name} className={'flex items-center gap-2 rounded-lg px-2 py-1.5 ' + (selected ? 'bg-chord/20' : 'hover:bg-ink-700')}>
                <button
                  className="flex-1 text-left"
                  onClick={() => {
                    update((d) => void (d.chords.slots = chords.map((symbol) => ({ symbol }))));
                    setOpen(false);
                  }}
                >
                  <div className="font-bold text-sm">{pr.name}</div>
                  <div className="text-xs text-cream-500">{chords.join(' → ')}</div>
                </button>
                <button
                  className="w-7 h-7 shrink-0 rounded-full bg-ink-600 hover:bg-chord hover:text-ink-950 text-xs"
                  onClick={() => previewProgression(chords)}
                  title="Listen"
                  aria-label={`Listen to ${pr.name}`}
                >
                  ▶
                </button>
              </div>
            );
          })}
          <p className="text-[11px] text-cream-500 px-2 pt-1">Change the mood in the settings on the right for different progressions.</p>
        </div>
      )}
    </div>
  );
}

function ChordEditor({ index }: { index: number }) {
  const p = useProject((s) => s.project);
  const setSlot = useProject((s) => s.setSlot);
  const slot = p.chords.slots[index];
  const count = p.chords.slots.length;
  // the chord before this one (wrapping around), for "what comes next" suggestions
  let prev: ChordSlot | null = null;
  for (let k = 1; k < count && !prev; k++) prev = p.chords.slots[(index - k + count) % count];
  const suggestions = suggestNext(prev?.symbol ?? null, p.tonic, p.mood);
  const inKey = fittingChords(p.tonic, p.mood);

  const choose = (symbol: string) => {
    const next = { symbol };
    setSlot(index, next);
    previewChord(next);
  };

  const editNotes = (notes: string[]) => {
    const sorted = sortNotes(notes);
    const next: ChordSlot = {
      symbol: slot ? renameForNotes(slot.symbol, sorted) : detectChord(sorted) ?? Note.pitchClass(sorted[0]),
      notes: sorted,
    };
    setSlot(index, next);
    return next;
  };

  const toggleNote = (note: string) => {
    const current = slot ? slotNotes(slot) : [];
    const midi = Note.midi(note);
    const has = current.some((n) => Note.midi(n) === midi);
    if (has && current.length <= 1) return;
    const notes = has ? current.filter((n) => Note.midi(n) !== midi) : [...current, note];
    editNotes(notes);
    if (!has) previewNote(note, 'keys');
  };

  const notes = slot ? slotNotes(slot) : [];
  const roles = slot ? chordRoles(slot) : [];
  const lowOct = Math.min(2, ...notes.map((n) => Note.octave(n) ?? 2));
  const highOct = Math.max(lowOct + 2, ...notes.map((n) => Note.octave(n) ?? 4));

  return (
    <div className="grid lg:grid-cols-2 gap-2">
      {/* left: this chord */}
      <div className="rounded-2xl bg-ink-900/60 border border-ink-600/60 p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="label shrink-0">Chord {index + 1}</span>
            <span className="text-xl font-black leading-tight">{slot ? slot.symbol : 'Rest'}</span>
            <span className="text-xs text-cream-500 truncate">
              {slot ? `feels: ${chordFeel(slot.symbol, p.tonic, p.mood)}` : 'nothing plays here: pick a chord'}
            </span>
          </div>
          {slot && (
            <div className="flex gap-1 ml-auto">
              <button className="btn text-xs" onClick={() => previewChord(slot)}>
                ▶ Hear it
              </button>
              <button className="btn text-xs" onClick={() => setSlot(index, null)} title="Make this chord silent">
                Rest
              </button>
            </div>
          )}
        </div>

        {slot && (
          <>
            <div>
              <div className="flex flex-wrap items-baseline gap-2 mb-1">
                <span className="label">Notes in this chord</span>
                <span className="text-[11px] text-cream-500">click keys to add or remove notes</span>
              </div>
              <MiniKeyboard
                notes={notes}
                rootPc={chordRoot(slot.symbol)}
                lowOct={lowOct}
                highOct={highOct}
                onToggle={toggleNote}
                className="h-16 2xl:h-20"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {roles.map((r) => (
                  <span key={r.note} className="rounded-md bg-chord/15 border border-chord/40 px-1.5 py-0.5 text-[11px]">
                    <b>{Note.pitchClass(r.note)}</b>
                    {r.role && <span className="text-cream-500"> · {r.role}</span>}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* right: change this chord, or swap it for another */}
      <div className="rounded-2xl bg-ink-900/60 border border-ink-600/60 p-3 flex flex-col gap-2.5">
        {slot && (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <div>
                <div className="label mb-1">Flavor</div>
                <div className="flex flex-wrap gap-1">
                  {chordFlavors(slot.symbol).map((f) => (
                    <button
                      key={f.symbol}
                      className={'chip text-xs px-2 py-1 ' + (!slot.notes && f.symbol === slot.symbol ? 'chip-on' : '')}
                      title={f.hint}
                      onClick={() => choose(f.symbol)}
                    >
                      {f.label} <span className="opacity-60">{f.symbol}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="label mb-1">Voicing</div>
                <div className="flex gap-1">
                  <button className="chip text-xs px-2 py-1" title="Same chord, lower notes" onClick={() => previewChord(editNotes(invert(notes, -1)))}>
                    ⬇ Lower
                  </button>
                  <button className="chip text-xs px-2 py-1" title="Same chord, higher notes" onClick={() => previewChord(editNotes(invert(notes, 1)))}>
                    ⬆ Higher
                  </button>
                  {slot.notes && (
                    <button className="chip text-xs px-2 py-1" title="Back to the automatic voicing" onClick={() => choose(slot.symbol)}>
                      ↺ Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
        )}
        <div>
          <div className="label mb-1.5">
            {prev ? (
              <>
                Sounds good after <span className="text-cream-100">{prev.symbol}</span>
              </>
            ) : (
              'Good places to start'
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button
                key={s.symbol}
                className={
                  'rounded-lg border px-2 py-1 text-left text-xs transition ' +
                  (slot?.symbol === s.symbol ? 'border-cream-100 bg-ink-600' : 'border-chord/50 bg-chord/10 hover:bg-chord/25')
                }
                onClick={() => choose(s.symbol)}
                title={`${s.symbol}: ${s.why}`}
              >
                <b>⭐ {s.symbol}</b> <span className="text-cream-500">{s.why}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-1.5">All chords in {keyLabel(p.tonic, p.mood)}</div>
          <div className="flex flex-wrap gap-1">
            {inKey.map((c) => (
              <button key={c} className={'chip text-xs px-2 py-1 ' + (slot?.symbol === c ? 'chip-on' : '')} onClick={() => choose(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
