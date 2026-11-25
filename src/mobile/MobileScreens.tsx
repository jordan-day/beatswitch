import { useEffect, useRef, useState } from 'react';
import { Note } from 'tonal';
import {
  ensureAudio,
  previewChord,
  previewChordSound,
  previewKey,
  previewKit,
  previewMelody,
  previewMelodyBar,
  previewNote,
  previewProgression,
  setLoopMode,
  play,
} from '../audio/engine';
import { stepSeconds } from '../audio/graph';
import { chordFeel, degreeNote, fittingChords, slotNotes, keyLabel, MOOD_INFO, PROGRESSIONS, progressionChords, TONICS } from '../music/chords';
import { randomDrums, slotLength } from '../music/patterns';
import { useProject, useUi, withUndo } from '../state/project';
import { buildTimeline, formatTime, songSteps } from '../state/song';
import { MAIN_MELODY } from '../state/tracks';
import {
  BPM_MAX,
  BPM_MIN,
  FULL_KITS,
  KEYS_SOUNDS,
  MELODY_ROWS,
  MELODY_SOUNDS,
  MOODS,
  STEPS_PER_BAR,
  type DrumRow,
  type KeysSound,
  type MelodyNote,
  type MelodySound,
  type SynthKit,
} from '../state/types';
import { describeLofi } from '../ui/LofiPanel';
import { Select } from '../ui/Select';
import { KEYS_LABEL, KIT_LABEL, MELODY_LABEL } from '../ui/SoundControls';
import { applyMobileShape, hasMobileShape, MOBILE_SHAPE, oneBarBeat } from './shape';

/** The mobile screens: one part each, big tap targets, only the essentials. */

function Heading(props: { title: string; hint: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-xl font-extrabold">{props.title}</h2>
      <p className="text-sm text-cream-500">{props.hint}</p>
    </div>
  );
}

function Card(props: { children: React.ReactNode; className?: string }) {
  return <div className={'rounded-2xl bg-ink-800 border border-ink-600/60 p-3 ' + (props.className ?? '')}>{props.children}</div>;
}

const BIG_BTN = 'h-12 rounded-xl px-4 font-extrabold text-base active:scale-[0.98] transition';

// ---------------------------------------------------------------- vibe

export function VibeScreen() {
  const p = useProject((s) => s.project);
  const { setKeyMood, setLofi, update } = useProject();
  return (
    <div className="flex flex-col gap-4">
      <Heading title="Vibe" hint="How your song feels. You can change this any time." />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mood">
        {MOODS.map((m) => {
          const on = p.mood === m;
          return (
            <button
              key={m}
              role="radio"
              aria-checked={on}
              className={'rounded-2xl border-2 p-3 text-left transition active:scale-[0.98] ' + (on ? 'border-cream-100 bg-ink-600' : 'border-ink-600 bg-ink-800')}
              onClick={() => {
                setKeyMood(p.tonic, m);
                void previewKey();
              }}
            >
              <div className="text-2xl">{MOOD_INFO[m].emoji}</div>
              <div className="font-extrabold">{MOOD_INFO[m].label}</div>
              <div className="text-xs text-cream-500 leading-snug">{MOOD_INFO[m].blurb}</div>
            </button>
          );
        })}
      </div>
      <Card className="flex flex-col gap-4">
        <label className="flex items-center justify-between gap-3">
          <span className="font-bold">Key</span>
          <Select
            aria-label="Key"
            value={p.tonic}
            items={TONICS.map((t) => ({ value: t, label: keyLabel(t, p.mood) }))}
            onChange={(v) => {
              setKeyMood(v, p.mood);
              void previewKey();
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between font-bold">
            Speed <span className="text-cream-300 font-normal">{p.bpm} BPM</span>
          </span>
          <input type="range" className="w-full" min={BPM_MIN} max={BPM_MAX} step={1} value={p.bpm} onChange={(e) => update((d) => void (d.bpm = Number(e.target.value)), 'bpm')} aria-label="Speed" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between font-bold">
            📼 Lo-fi-ness <span className="text-snare font-normal text-sm">{describeLofi(p.fx.lofi)}</span>
          </span>
          <input type="range" className="big w-full" min={0} max={1} step={0.01} value={p.fx.lofi} onChange={(e) => setLofi(Number(e.target.value))} aria-label="Lo-fi-ness" />
          <span className="flex justify-between text-xs text-cream-500">
            <span>Clean</span>
            <span>Dusty</span>
          </span>
        </label>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- beat

const PAD_ROWS: { key: DrumRow | 'bass'; label: string; color: string }[] = [
  { key: 'kick', label: 'Kick', color: '#e8916b' },
  { key: 'snare', label: 'Snare', color: '#e6c27a' },
  { key: 'hat', label: 'Hi-hat', color: '#9ccf9a' },
  { key: 'bass', label: 'Bass', color: '#e58fae' },
];

/** One bar that repeats: tap a square to add or remove a hit (in every bar). */
export function BeatScreen({ autoFill }: { autoFill?: boolean }) {
  const p = useProject((s) => s.project);
  const { update } = useProject();
  const step = useUi((s) => s.step);
  const now = step >= 0 ? step % STEPS_PER_BAR : -1;
  const value = (row: DrumRow | 'bass', i: number) => (row === 'bass' ? p.bass.steps[i] : p.drums[row].steps[i]);
  const hasHits = PAD_ROWS.some((r) => Array.from({ length: STEPS_PER_BAR }, (_, i) => value(r.key, i)).some(Boolean));
  // in the wizard, start from a beat rather than an empty pad
  useEffect(() => {
    if (autoFill && !hasHits) surpriseBeat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (row: DrumRow | 'bass', i: number) => {
    ensureAudio();
    update((d) => {
      const on = row === 'bass' ? d.bass.steps[i] : d.drums[row].steps[i];
      for (let b = 0; b < 4; b++) {
        const k = b * STEPS_PER_BAR + i;
        if (row === 'bass') d.bass.steps[k] = on ? 0 : 1;
        else d.drums[row].steps[k] = on ? 0 : 1;
      }
    });
  };
  const kit = FULL_KITS.find((k) => p.drums.kick.sound.kind === 'synth' && p.drums.kick.sound.id === k) ?? '';

  return (
    <div className="flex flex-col gap-4">
      <Heading title="Beat" hint="Tap squares to add hits. This bar repeats through your loop." />
      <div className="flex gap-2">
        <button className={BIG_BTN + ' flex-1 bg-kick text-ink-950'} onClick={() => withUndo('New beat 🎲', surpriseBeat)}>
          🎲 New beat
        </button>
        <Select
          aria-label="Drum kit"
          placeholder="Mixed"
          className="h-12"
          value={kit}
          items={FULL_KITS.map((k) => ({ value: k, label: KIT_LABEL[k] }))}
          onChange={(v) => {
            update((d) => {
              for (const r of ['kick', 'snare', 'hat', 'openhat', 'perc'] as DrumRow[]) if (d.drums[r].sound.kind === 'synth') d.drums[r].sound = { kind: 'synth', id: v as SynthKit };
            });
            void previewKit();
          }}
        />
      </div>
      {PAD_ROWS.map((r) => (
        <div key={r.key}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
            <span className="font-bold">{r.label}</span>
            {r.key === 'bass' && <span className="text-xs text-cream-500">follows the chords</span>}
          </div>
          {/* 16 steps as two rows of 8, a beat (4 squares) per group */}
          <div className="grid grid-cols-8 gap-1.5">
            {Array.from({ length: STEPS_PER_BAR }, (_, i) => {
              const on = !!value(r.key, i);
              return (
                <button
                  key={i}
                  onClick={() => toggle(r.key, i)}
                  aria-label={`${r.label} step ${i + 1}${on ? ' on' : ''}`}
                  aria-pressed={on}
                  className={'h-10 rounded-lg transition active:scale-95 ' + (on ? '' : i % 4 === 0 ? 'bg-ink-600' : 'bg-ink-700') + (now === i ? ' ring-2 ring-cream-100/70' : '')}
                  style={on ? { background: r.color } : undefined}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  /** A new random (but musical) beat, as one undo step: drums, a bass that follows the kick, one repeating bar. */
  function surpriseBeat() {
    useProject.getState().update((d) => {
      const r = randomDrums();
      for (const row of Object.keys(r) as DrumRow[]) d.drums[row].steps = r[row];
      d.bass.steps = r.kick.map((s) => (s ? 1 : 0));
      oneBarBeat(d);
    });
  }
}

// ---------------------------------------------------------------- chords

/** Pick a ready-made progression, then tap a chord to swap it for another that fits. */
export function ChordsScreen() {
  const p = useProject((s) => s.project);
  const { setSlot, setChordCount, update } = useProject();
  const [picking, setPicking] = useState<number | null>(null);
  const [flash, setFlash] = useState(0); // bumps when a progression is picked, to replay the "it changed" pulse
  const progressions = PROGRESSIONS[p.mood];
  const count = p.chords.slots.length;

  /** Whether the chords are exactly this progression (each chord held for the same length, no hand-picked notes). */
  const isCurrent = (chords: string[]) => {
    const per = count / chords.length;
    return p.chords.slots.every((s, i) => s && !s.notes && s.symbol === chords[Math.floor(i / per)]);
  };

  const useProgression = (chords: string[]) => {
    withUndo('New chords', () =>
      update((d) => {
        const per = d.chords.slots.length / chords.length;
        d.chords.slots = d.chords.slots.map((_, i) => ({ symbol: chords[Math.floor(i / per)] }));
      }),
    );
    setPicking(null);
    setFlash((n) => n + 1);
    void previewProgression(chords);
  };

  return (
    <div className="flex flex-col gap-4">
      <Heading title="Chords" hint="Pick a progression to start, then tap a chord below to change it." />

      {/* ready-made progressions first: one tap picks it and plays it */}
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Ready-made progressions">
        {progressions.map((pr) => {
          const chords = progressionChords(p.tonic, pr);
          const on = isCurrent(chords);
          return (
            <div
              key={pr.name + (on ? flash : '')}
              className={
                'flex items-center gap-2 rounded-2xl border-2 p-2 pl-3 transition ' +
                (on ? 'border-cream-100 bg-ink-600 shadow-[0_0_0_3px_rgba(243,233,220,0.12)] flash-in' : 'border-ink-600/60 bg-ink-800 active:bg-ink-700')
              }
            >
              <button role="radio" aria-checked={on} className="flex-1 min-w-0 text-left py-1" onClick={() => useProgression(chords)}>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold">{pr.name}</span>
                  {on && <span className="text-[11px] font-extrabold text-ink-950 bg-cream-100 rounded-full px-2 py-0.5">✓ In use</span>}
                </div>
                <div className={'text-sm truncate ' + (on ? 'text-cream-100 font-bold' : 'text-cream-500')}>{chords.join(' · ')}</div>
              </button>
              <button
                className="w-11 h-11 rounded-full bg-ink-700 shrink-0 active:scale-95"
                onClick={() => previewProgression(chords)}
                aria-label={`Listen to ${pr.name} (without using it)`}
                title="Listen without using it"
              >
                ▶
              </button>
            </div>
          );
        })}
      </div>

      {/* the chords in your loop: tap one to swap it */}
      <div>
        <div className="label mb-2">Your chords</div>
        <div key={flash} className={'grid gap-2 ' + (count > 4 ? 'grid-cols-4' : 'grid-cols-2') + (flash ? ' flash-in' : '')}>
          {p.chords.slots.map((c, i) => (
            <button
              key={i}
              className={'rounded-2xl border-2 p-3 text-left transition active:scale-[0.98] ' + (picking === i ? 'border-cream-100 bg-ink-600' : 'border-ink-600 bg-ink-800')}
              onClick={() => {
                setPicking(picking === i ? null : i);
                if (c) void previewChord(c);
              }}
            >
              <div className="text-xs text-cream-500">Bar {Math.floor((i * p.bars) / count) + 1}</div>
              <div className="text-xl font-black">{c ? c.symbol : '–'}</div>
              {c && count <= 4 && <div className="text-xs text-cream-500 truncate">{chordFeel(c.symbol, p.tonic, p.mood)}</div>}
            </button>
          ))}
        </div>
      </div>
      {picking !== null && (
        <Card>
          <div className="font-bold mb-2">Swap chord {picking + 1} for…</div>
          <div className="flex flex-wrap gap-2">
            {fittingChords(p.tonic, p.mood).map((sym) => (
              <button
                key={sym}
                className={'h-11 px-3 rounded-xl font-extrabold border ' + (p.chords.slots[picking]?.symbol === sym ? 'bg-chord text-ink-950 border-chord' : 'bg-ink-700 border-ink-600')}
                onClick={() => {
                  setSlot(picking, { symbol: sym });
                  void previewChord(sym);
                }}
              >
                {sym}
              </button>
            ))}
          </div>
        </Card>
      )}
      <label className="flex items-center justify-between gap-3">
        <span className="font-bold">Chord sound</span>
        <Select
          aria-label="Chord sound"
          value={p.chords.sound}
          items={KEYS_SOUNDS.map((k) => ({ value: k, label: KEYS_LABEL[k] }))}
          onChange={(v) => {
            update((d) => void (d.chords.sound = v as KeysSound));
            void previewChordSound();
          }}
        />
      </label>
      {count !== 4 && (
        <button className="text-sm text-cream-500 underline self-start" onClick={() => setChordCount(4)}>
          Use 4 chords (one per bar)
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- melody

/**
 * 🎲 for a melody that fits the chords, then edit it on the roll, one bar at a time:
 * tap an empty square to add a short note, tap a note to remove it, drag a note to move it, or
 * long-press an empty square and slide sideways to draw a note as long as the slide.
 * Blue squares are notes of the chord playing at that moment (they always fit).
 */
type Gesture =
  | { kind: 'tapNote'; note: MelodyNote; grab: number; x0: number; y0: number }
  | { kind: 'move'; note: MelodyNote; grab: number }
  | { kind: 'tapEmpty'; d: number; col: number; x0: number; y0: number; timer: number }
  | { kind: 'draw'; d: number; col0: number }
  | { kind: 'none' };
const MOVE_PX = 8; // further than this, a touch is a drag rather than a tap
const HOLD_MS = 320; // a long press

export function MelodyScreen({ autoFill }: { autoFill?: boolean }) {
  const p = useProject((s) => s.project);
  const { addNote, removeNote, moveNote, randomizeMelody, update } = useProject();
  const step = useUi((s) => s.step);
  const [bar, setBar] = useState(0);
  const [ghost, setGhost] = useState<{ s: number; l: number; d: number; moving?: MelodyNote } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const g = useRef<Gesture>({ kind: 'none' });
  const m = p.melody;
  const offset = bar * STEPS_PER_BAR;
  const rows = Array.from({ length: MELODY_ROWS }, (_, i) => MELODY_ROWS - 1 - i); // top = highest
  const name = (d: number) => degreeNote(p.tonic, p.mood, m.octave, d);

  useEffect(() => {
    if (autoFill && m.notes.length === 0) randomizeMelody(MAIN_MELODY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the chord playing at each column of this bar: its notes tint the roll blue, its name goes on top
  const len = slotLength(p.bars, p.chords.slots.length);
  const chordAt = (s: number) => p.chords.slots[Math.min(p.chords.slots.length - 1, Math.floor(s / len))];
  const colChroma = Array.from({ length: STEPS_PER_BAR }, (_, i) => {
    const c = chordAt(offset + i);
    return new Set(c ? slotNotes(c).map((n) => Note.chroma(n)) : []);
  });
  const chordLabels: { col: number; span: number; name: string }[] = [];
  for (let i = 0; i < STEPS_PER_BAR; i++) {
    const prev = chordLabels[chordLabels.length - 1];
    if (!prev || (offset + i) % len === 0) chordLabels.push({ col: i, span: 1, name: chordAt(offset + i)?.symbol ?? 'rest' });
    else prev.span++;
  }

  const noteAt = (d: number, s: number) => m.notes.find((n) => n.d === d && s >= n.s && s < n.s + n.l);
  /** The square under a pointer: its row's scale degree and its column in this bar. */
  const cellAt = (e: { clientX: number; clientY: number }) => {
    const r = gridRef.current!.getBoundingClientRect();
    const col = Math.max(0, Math.min(STEPS_PER_BAR - 1, Math.floor(((e.clientX - r.left) / r.width) * STEPS_PER_BAR)));
    const row = Math.max(0, Math.min(MELODY_ROWS - 1, Math.floor(((e.clientY - r.top) / r.height) * MELODY_ROWS)));
    return { col, d: MELODY_ROWS - 1 - row };
  };
  const hear = (d: number) => void previewNote(name(d), 'melody');
  const end = () => {
    const cur = g.current;
    if (cur.kind === 'tapEmpty') clearTimeout(cur.timer);
    g.current = { kind: 'none' };
    setGhost(null);
  };

  const onDown = (e: React.PointerEvent) => {
    ensureAudio();
    try {
      gridRef.current!.setPointerCapture(e.pointerId); // keep getting moves when the finger leaves the roll
    } catch {
      /* not a live pointer (e.g. a synthetic event): fine without capture */
    }
    const { col, d } = cellAt(e);
    const note = noteAt(d, offset + col);
    if (note) {
      g.current = { kind: 'tapNote', note, grab: offset + col - note.s, x0: e.clientX, y0: e.clientY };
      return;
    }
    // a long press starts drawing a note from this square
    const timer = window.setTimeout(() => {
      const cur = g.current;
      if (cur.kind !== 'tapEmpty') return;
      g.current = { kind: 'draw', d: cur.d, col0: cur.col };
      setGhost({ s: offset + cur.col, l: 1, d: cur.d });
      navigator.vibrate?.(12);
      hear(cur.d);
    }, HOLD_MS);
    g.current = { kind: 'tapEmpty', d, col, x0: e.clientX, y0: e.clientY, timer };
  };

  const onMove = (e: React.PointerEvent) => {
    const cur = g.current;
    const far = 'x0' in cur && Math.hypot(e.clientX - cur.x0, e.clientY - cur.y0) > MOVE_PX;
    if (cur.kind === 'tapNote' && far) g.current = { kind: 'move', note: cur.note, grab: cur.grab };
    if (cur.kind === 'tapEmpty' && far) return end(); // a swipe before the long press: not a note
    const now = g.current;
    const { col, d } = cellAt(e);
    if (now.kind === 'move') {
      const l = Math.min(now.note.l, STEPS_PER_BAR);
      const s = Math.max(offset, Math.min(offset + STEPS_PER_BAR - l, offset + col - now.grab));
      if (!ghost || ghost.s !== s || ghost.d !== d) {
        if (ghost && ghost.d !== d) hear(d);
        setGhost({ s, l: now.note.l, d, moving: now.note });
      }
    } else if (now.kind === 'draw') {
      const l = Math.max(1, col - now.col0 + 1);
      if (!ghost || ghost.l !== l) setGhost({ s: offset + now.col0, l, d: now.d });
    }
  };

  const onUp = () => {
    const cur = g.current;
    if (cur.kind === 'tapNote') removeNote(cur.note.s, cur.note.d);
    else if (cur.kind === 'tapEmpty') {
      const s = offset + cur.col;
      addNote({ s, l: Math.min(2, offset + STEPS_PER_BAR - s), d: cur.d });
      hear(cur.d);
    } else if (cur.kind === 'move' && ghost) {
      if (ghost.s !== cur.note.s || ghost.d !== cur.note.d) moveNote(cur.note.s, cur.note.d, ghost.s, ghost.d);
      hear(ghost.d);
    } else if (cur.kind === 'draw' && ghost) addNote({ s: ghost.s, l: ghost.l, d: ghost.d });
    end();
  };

  // notes in this bar (a note from the bar before is shown from the bar's start)
  const visible = m.notes
    .filter((n) => n.s < offset + STEPS_PER_BAR && n.s + n.l > offset && n.d < MELODY_ROWS)
    .map((n) => ({ n, from: Math.max(n.s, offset) - offset, to: Math.min(n.s + n.l, offset + STEPS_PER_BAR) - offset }));
  const local = step >= offset && step < offset + STEPS_PER_BAR ? step - offset : -1;
  const ROW_H = '1.5rem';
  const cols = { gridTemplateColumns: `repeat(${STEPS_PER_BAR}, minmax(0, 1fr))` };

  return (
    <div className="flex flex-col gap-4">
      <Heading title="Melody" hint="Roll the dice for an idea that fits your chords, then tweak it on the roll." />
      <div className="flex gap-2">
        <button
          className={BIG_BTN + ' flex-1 bg-[#f2a65a] text-ink-950'}
          onClick={() => {
            withUndo('New melody 🎲', () => randomizeMelody(MAIN_MELODY));
            void previewMelodyBar(MAIN_MELODY); // hear the new melody itself (its first bar)
          }}
        >
          🎲 New melody
        </button>
        <Select
          aria-label="Melody sound"
          className="h-12"
          value={m.sound}
          items={MELODY_SOUNDS.map((s) => ({ value: s, label: MELODY_LABEL[s] }))}
          onChange={(v) => {
            update((d) => {
              d.melody.sound = v as MelodySound;
              delete d.melody.tone;
            });
            void previewMelody(MAIN_MELODY);
          }}
        />
      </div>
      <div className="flex rounded-xl bg-ink-800 p-1" role="tablist" aria-label="Bar">
        {Array.from({ length: p.bars }, (_, b) => (
          <button
            key={b}
            role="tab"
            aria-selected={bar === b}
            className={'flex-1 h-9 rounded-lg text-sm font-bold ' + (bar === b ? 'bg-ink-600 text-cream-100' : 'text-cream-500')}
            onClick={() => setBar(b)}
          >
            Bar {b + 1}
            {step >= 0 && Math.floor(step / STEPS_PER_BAR) === b && <span className="inline-block w-1.5 h-1.5 rounded-full bg-kick ml-1.5 align-middle" />}
          </button>
        ))}
      </div>

      <div>
        {/* chord names over the columns they play in */}
        <div className="flex gap-1 mb-1">
          <div className="w-9 shrink-0" />
          <div className="grid flex-1 min-w-0 gap-px" style={cols}>
            {chordLabels.map((c) => (
              <div key={c.col} className="text-[11px] font-extrabold text-chord truncate border-l-2 border-chord/50 pl-1" style={{ gridColumn: `${c.col + 1} / span ${c.span}` }}>
                {c.name}
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          {/* note names, ★ on the key note */}
          <div className="grid gap-px w-9 shrink-0" style={{ gridTemplateRows: `repeat(${MELODY_ROWS}, ${ROW_H})` }}>
            {rows.map((d) => (
              <div key={d} className={'text-[10px] font-bold flex items-center justify-end pr-1 ' + (d % 7 === 0 ? 'text-cream-100' : 'text-cream-500')}>
                {d % 7 === 0 && '★'}
                {name(d).replace(/\d/, '')}
              </div>
            ))}
          </div>
          <div
            ref={gridRef}
            className="relative flex-1 min-w-0 grid gap-px touch-none select-none"
            style={{ ...cols, gridTemplateRows: `repeat(${MELODY_ROWS}, ${ROW_H})` }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={end}
            onContextMenu={(e) => e.preventDefault()} // a long press shouldn't open the phone's menu
            role="grid"
            aria-label="Melody roll: tap to add or remove a note, drag a note to move it, long-press and slide to draw a longer note"
          >
            {rows.map((d, r) =>
              Array.from({ length: STEPS_PER_BAR }, (_, k) => {
                const inChord = colChroma[k].has(Note.chroma(name(d)));
                return (
                  <div
                    key={`${d}-${k}`}
                    className={(inChord ? 'bg-chord/45' : k % 4 === 0 ? 'bg-ink-600/80' : 'bg-ink-700') + (local === k ? ' ring-1 ring-cream-100/60' : '')}
                    style={{ gridColumn: k + 1, gridRow: r + 1 }}
                  />
                );
              }),
            )}
            {visible.map(({ n, from, to }) => (
              <div
                key={`${n.s}-${n.d}`}
                className="rounded-md pointer-events-none z-10 transition-opacity"
                style={{ gridColumn: `${from + 1} / ${to + 1}`, gridRow: MELODY_ROWS - n.d, background: '#f2a65a', opacity: ghost?.moving === n ? 0.3 : 1 }}
              />
            ))}
            {/* the note being moved or drawn */}
            {ghost && (
              <div
                className="rounded-md pointer-events-none z-20 ring-2 ring-cream-100 shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                style={{
                  gridColumn: `${ghost.s - offset + 1} / ${Math.min(ghost.s - offset + ghost.l, STEPS_PER_BAR) + 1}`,
                  gridRow: MELODY_ROWS - ghost.d,
                  background: '#f2a65a',
                }}
              />
            )}
          </div>
        </div>
        <p className="text-xs text-cream-500 mt-2">
          Tap to add or remove a note · drag a note to move it · hold and slide to draw a long note. <span className="text-chord font-bold">Blue</span> notes always fit the chord.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- song

/** The song: Intro, Loop, Loop, Breakdown, Loop, Outro, made from your loop. Fades on or off. */
export function SongScreen() {
  const p = useProject((s) => s.project);
  const { setFade, update } = useProject();
  const { playing, playMode, songStep } = useUi();
  const shaped = hasMobileShape(p);
  const seconds = songSteps(p) * stepSeconds(p.bpm);
  const timeline = buildTimeline(p);

  return (
    <div className="flex flex-col gap-4">
      <Heading title="Song" hint="Your loop becomes a full song: the intro, breakdown and outro are made for you." />
      {!shaped && (
        <Card className="flex flex-col gap-2 border-kick/40">
          <div className="text-sm">This song was arranged on a computer, so it plays as it was made there.</div>
          <button className={BIG_BTN + ' bg-ink-600'} onClick={() => withUndo('Arranged as Intro · Loop · Loop · Breakdown · Loop · Outro', () => update((d) => applyMobileShape(d)))}>
            Use the mobile song shape
          </button>
        </Card>
      )}
      {shaped && (
        <ol className="flex flex-col gap-2">
          {MOBILE_SHAPE.map((b, i) => {
            const seg = timeline[i];
            const live = playing && playMode === 'song' && seg && songStep >= seg.start && songStep < seg.start + seg.steps;
            const parts = (['drums', 'bass', 'chords', 'melody'] as const).filter((part) => !b.mute[part]);
            return (
              <li key={i} className={'flex items-center gap-3 rounded-xl border-2 p-3 transition ' + (live ? 'border-cream-100 bg-ink-600' : b.name === 'Loop' ? 'border-ink-600 bg-ink-800' : 'border-ink-600/50 bg-ink-900/60')}>
                <span className="w-6 text-center text-cream-500 font-bold">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold">{b.name}</div>
                  <div className="text-xs text-cream-500">{b.hint}</div>
                </div>
                <div className="text-base" aria-label={`Plays: ${parts.join(', ')}`}>
                  {parts.map((part) => ({ drums: '🥁', bass: '🎸', chords: '🎹', melody: '🎵' })[part]).join('')}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Card className="flex items-center gap-3">
        <span className="font-bold flex-1">Length {formatTime(seconds)}</span>
        {(['fadeIn', 'fadeOut'] as const).map((f) => (
          <button
            key={f}
            className={'h-10 px-3 rounded-xl text-sm font-bold border ' + (p[f] ? 'bg-cream-100 text-ink-950 border-cream-100' : 'border-ink-600 text-cream-500')}
            onClick={() => setFade(f, !p[f])}
            aria-pressed={p[f]}
          >
            {p[f] ? '✓ ' : ''}
            {f === 'fadeIn' ? 'Fade in' : 'Fade out'}
          </button>
        ))}
      </Card>
      <button
        className={BIG_BTN + ' bg-kick text-ink-950'}
        onClick={async () => {
          await setLoopMode('song');
          if (!useUi.getState().playing) await play();
        }}
      >
        ▶ Play the whole song
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- how to edit (the wizard's last page)

const HOW_TO: { icon: string; title: string; text: string }[] = [
  { icon: '🎼', title: "It's a whole song", text: 'Your loop plays with an intro, a breakdown and an outro made for you, and it fades in and out.' },
  { icon: '⬇️', title: 'Change any part', text: 'The tabs at the bottom open the vibe, beat, chords and melody. Changes are heard straight away.' },
  { icon: '▶', title: 'Listen as you go', text: 'Play loops the part you’re making. On the Song tab it plays the whole song.' },
  { icon: '👆', title: 'Edit the melody', text: 'Tap to add or remove a note, drag a note to move it, hold and slide to draw a long one.' },
  { icon: '🎲', title: 'Stuck?', text: 'Roll the dice for a new beat or melody, then tweak it.' },
  { icon: '☰', title: 'Save and share', text: 'Your song saves by itself. The menu exports it as an MP3, or starts a new song.' },
];

/** The wizard's last page: the song is made; here's how to keep shaping it. */
export function HowToScreen() {
  return (
    <div className="flex flex-col gap-4">
      <Heading title="Your song is ready 🎉" hint="Here's how to keep shaping it." />
      <button
        className={BIG_BTN + ' bg-kick text-ink-950'}
        onClick={async () => {
          await setLoopMode('song');
          if (!useUi.getState().playing) await play();
        }}
      >
        ▶ Hear your whole song
      </button>
      <ul className="flex flex-col gap-2">
        {HOW_TO.map((h) => (
          <li key={h.title} className="flex gap-3 rounded-xl bg-ink-800 border border-ink-600/60 p-3">
            <span className="w-14 shrink-0 text-center text-lg leading-6" aria-hidden="true">
              {h.icon}
            </span>
            <div className="min-w-0">
              <div className="font-extrabold">{h.title}</div>
              <div className="text-sm text-cream-500">{h.text}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
