import { useEffect, useRef, useState } from 'react';
import { Note } from 'tonal';
import { ensureAudio, previewChord, previewNote, previewProgression } from '../audio/engine';
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
import { useProject, useUi, withUndo } from '../state/project';
import { STEPS_PER_BAR, type ChordRhythm, type ChordSlot } from '../state/types';
import { EditorHeader } from './EditorHeader';
import { MiniKeyboard } from './MiniKeyboard';

/** The Chords editor: chord slots + the selected chord's notes on the left, "what to play" ideas on the right. */
export function ChordPanel() {
  const p = useProject((s) => s.project);
  const setChordCount = useProject((s) => s.setChordCount);
  const { step, selectedSlot, set } = useUi();
  const viewBar = Math.min(useUi((s) => s.viewBar), p.bars - 1);
  const count = p.chords.slots.length;
  const perBar = count / p.bars; // chords per bar: 1, 2, 4 or 8
  const activeSlot = step >= 0 ? Math.min(count - 1, Math.floor(step / slotLength(p.bars, count))) : -1;
  const sel = Math.min(selectedSlot, count - 1);

  return (
    <>
      <EditorHeader>
        <RhythmPicker />
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
        {/* one column per bar, with a divider between bars; chords (and custom hits) line up under each bar */}
        <div className="overflow-x-auto -mx-1 px-1 mb-2">
          <div className="flex" style={{ minWidth: count * 64 }}>
            {Array.from({ length: p.bars }, (_, b) => {
              const first = b * perBar;
              const playing = step >= 0 && Math.floor(step / STEPS_PER_BAR) === b;
              return (
                <div key={b} className={'flex-1 min-w-0 flex flex-col gap-1 ' + (b > 0 ? 'border-l-2 border-ink-600 pl-2 ml-2' : '')}>
                  <button
                    className={
                      'self-start text-[11px] font-bold uppercase tracking-wider rounded px-1 -ml-1 flex items-center gap-1 ' +
                      (b === viewBar ? 'text-cream-100' : 'text-cream-500 hover:text-cream-100')
                    }
                    onClick={() => set({ viewBar: b })}
                    title={`Bar ${b + 1}`}
                  >
                    Bar {b + 1}
                    {playing && <span className="w-1.5 h-1.5 rounded-full bg-kick" aria-label="playing" />}
                  </button>
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${perBar}, minmax(0, 1fr))` }}>
                    {p.chords.slots.slice(first, first + perBar).map((c, k) => {
                      const i = first + k;
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            set({ selectedSlot: i });
                            if (c) previewChord(c);
                          }}
                          aria-pressed={i === sel}
                          aria-label={`Chord ${i + 1}: ${c ? c.symbol : 'silent'}`}
                          className={
                            'rounded-xl px-2.5 py-1 border-2 text-left transition min-w-0 flex items-baseline gap-2 ' +
                            (i === sel ? 'border-cream-100 ' : activeSlot === i ? 'border-chord ' : 'border-ink-600 ') +
                            (activeSlot === i ? 'bg-chord/20' : 'bg-ink-700/40 hover:bg-ink-700')
                          }
                          title={c ? `${c.symbol}: ${c.notes ? 'custom notes' : chordFeel(c.symbol, p.tonic, p.mood)}` : 'Silent: no chord plays here'}
                        >
                          <span className="font-extrabold truncate text-base shrink-0">{c ? c.symbol : '–'}</span>
                          {perBar === 1 && (
                            <span className="text-[11px] text-cream-500 truncate">
                              {c ? (c.notes ? '✏️ custom' : chordFeel(c.symbol, p.tonic, p.mood)) : 'silent'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {p.chords.rhythm === 'custom' && <ChordHitsBar bar={b} />}
                </div>
              );
            })}
          </div>
        </div>

        {p.chords.rhythm === 'custom' && <ChordHitsCaption />}

        <ChordEditor index={sel} />
      </div>
    </>
  );
}

const RHYTHM_LABEL: Record<ChordRhythm, { label: string; hint: string }> = {
  whole: { label: 'Long', hint: 'Each chord rings out' },
  half: { label: 'Twice', hint: 'Each chord plays two times' },
  stab: { label: 'Bouncy', hint: 'Short rhythmic hits' },
  custom: { label: '✏️ Custom', hint: 'Draw exactly when the chords play' },
};

/** How the chords are played: ready-made rhythms, or Custom to draw your own hits. */
function RhythmPicker() {
  const rhythm = useProject((s) => s.project.chords.rhythm);
  const setRhythm = useProject((s) => s.setRhythm);
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Chord rhythm">
      <span className="label hidden xl:inline">Rhythm</span>
      <div className="flex rounded-lg bg-ink-700 p-0.5">
        {(Object.keys(RHYTHM_LABEL) as ChordRhythm[]).map((r) => (
          <button
            key={r}
            className={
              'px-2.5 py-1 rounded-md text-xs font-bold transition ' + (rhythm === r ? 'bg-cream-100 text-ink-950' : 'text-cream-300 hover:text-cream-100')
            }
            title={RHYTHM_LABEL[r].hint}
            aria-pressed={rhythm === r}
            onClick={() => setRhythm(r)}
          >
            {RHYTHM_LABEL[r].label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The custom rhythm grid for one bar: a square per 16th note, under that bar's chords.
 * A hit plays the chord of that moment and lets it ring until the next hit (or the next chord).
 */
function ChordHitsBar({ bar }: { bar: number }) {
  const p = useProject((s) => s.project);
  const toggleChordStep = useProject((s) => s.toggleChordStep);
  const step = useUi((s) => s.step);
  const len = slotLength(p.bars, p.chords.slots.length);
  return (
    <div className="grid gap-px h-7" style={{ gridTemplateColumns: `repeat(${STEPS_PER_BAR}, minmax(0, 1fr))` }}>
      {Array.from({ length: STEPS_PER_BAR }, (_, k) => {
        const i = bar * STEPS_PER_BAR + k;
        const on = p.chords.steps[i];
        return (
          <button
            key={i}
            onClick={() => {
              ensureAudio();
              toggleChordStep(i);
            }}
            aria-label={`Chord hit, bar ${bar + 1} step ${k + 1}${on ? ' on' : ''}`}
            aria-pressed={on}
            className={
              'cell rounded-[3px] ' +
              (on ? 'bg-chord ' : k % 4 === 0 ? 'bg-ink-600 ' : 'bg-ink-700 ') +
              (i % len === 0 && k > 0 ? 'ml-1 ' : '') + // a gap where the next chord starts inside the bar
              (step === i ? 'ring-2 ring-cream-100' : '')
            }
          />
        );
      })}
    </div>
  );
}

function ChordHitsCaption() {
  const clearRow = useProject((s) => s.clearRow);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 -mt-1 mb-2">
      <span className="label">↑ Chord hits</span>
      <span className="text-[11px] text-cream-500">Click squares to choose when the chords play. Each hit rings until the next one.</span>
      <button
        className="text-[11px] text-cream-500 hover:text-cream-100 ml-auto rounded"
        onClick={() => withUndo('Chord hits cleared', () => clearRow('chords'))}
      >
        ✕ Clear hits
      </button>
    </div>
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
        <div className="absolute right-0 top-full mt-2 z-30 card !bg-ink-800 shadow-2xl p-2 w-[min(20rem,calc(100vw-2rem))] flex flex-col gap-1">
          <div className="label px-2 py-1">
            {MOOD_INFO[p.mood].emoji} {MOOD_INFO[p.mood].label} progressions in {keyLabel(p.tonic, p.mood)}
          </div>
          {PROGRESSIONS[p.mood].map((pr) => {
            const chords = progressionChords(p.tonic, pr);
            const per = p.chords.slots.length / chords.length;
            const selected = p.chords.slots.every((s, i) => s && !s.notes && s.symbol === chords[Math.floor(i / per)]);
            return (
              <div key={pr.name} className={'flex items-center gap-2 rounded-lg px-2 py-1.5 ' + (selected ? 'bg-chord/20' : 'hover:bg-ink-700')}>
                <button
                  className="flex-1 text-left"
                  onClick={() => {
                    // keep the chord count you chose: with 8 chords, each one plays twice
                    update((d) => {
                      const per = d.chords.slots.length / chords.length;
                      d.chords.slots = chords.flatMap((symbol) => Array.from({ length: per }, () => ({ symbol })));
                    });
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
            <span className="text-xl font-black leading-tight">{slot ? slot.symbol : 'Silent'}</span>
            <span className="text-xs text-cream-500 truncate">
              {slot ? `feels: ${chordFeel(slot.symbol, p.tonic, p.mood)}` : 'nothing plays here: pick a chord'}
            </span>
          </div>
          {slot && (
            <div className="flex gap-1 ml-auto">
              <button className="btn text-xs" onClick={() => previewChord(slot)}>
                ▶ Hear it
              </button>
              <button
                className="btn text-xs"
                onClick={() => withUndo(`Chord ${index + 1} is now silent`, () => setSlot(index, null))}
                title="No chord plays here (a rest)"
              >
                🔇 Silence
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
