import { useEffect, useRef, useState } from 'react';
import { previewMelody } from '../audio/engine';
import { resolveTone } from '../music/tone';
import { useProject } from '../state/project';
import { melodyName, melodyTrack } from '../state/tracks';
import type { MelodyTone } from '../state/types';
import { Slider } from './common';

/** A word for a slider position: `cuts` are where the first and second words end. */
const words = (v: number, cuts: [number, number], low: string, mid: string, high: string) => (v < cuts[0] ? low : v < cuts[1] ? mid : high);

const CONTROLS: { key: keyof MelodyTone; label: string; hint: string; say: (v: number) => string }[] = [
  { key: 'soft', label: 'Soft start', hint: 'How gently each note begins: a sharp pluck, or a breath that swells in', say: (v) => words(v, [0.08, 0.5], 'Sharp', 'Gentle', 'Breathy') },
  { key: 'fade', label: 'Fade out', hint: 'How long a note keeps ringing after it ends', say: (v) => words(v, [0.12, 0.55], 'Short', 'Medium', 'Long') },
  { key: 'vibrato', label: 'Vibrato', hint: 'A gentle wobble in the pitch, like a player breathing', say: (v) => words(v, [0.04, 0.5], 'None', 'Light', 'Wobbly') },
  { key: 'bright', label: 'Brightness', hint: 'Warm and muffled, or clear and bright', say: (v) => words(v, [0.35, 0.75], 'Warm', 'Balanced', 'Bright') },
];

/**
 * "Shape the sound": a small panel behind a button, so the Melody toolbar stays simple. Four
 * plain sliders change how the instrument starts, ends and sounds, for the melody being edited.
 */
export function ToneButton({ melodyId, instrument }: { melodyId: string; instrument: string }) {
  const p = useProject((s) => s.project);
  const setMelodyTone = useProject((s) => s.setMelodyTone);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const track = melodyTrack(p, melodyId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!track) return null;
  const tone = resolveTone(track.sound, track.tone);
  const changed = !!track.tone;
  const name = melodyName(p, melodyId);
  // after letting go of a slider, play a few notes so the change can be heard
  const hear = () => void previewMelody(melodyId);

  return (
    <div ref={ref} className="relative">
      <button
        className={'btn px-2.5 py-1 text-base ' + (open ? 'bg-ink-600' : '')}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Shape the sound"
        title="Shape the sound: softer, airier, warmer…"
      >
        🎛
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Shape the sound"
          className="absolute right-0 top-full mt-2 z-40 card !bg-ink-800 w-72 max-w-[calc(100vw-1.5rem)] shadow-2xl flex flex-col gap-4"
          onPointerUp={hear}
          onKeyUp={(e) => e.key.startsWith('Arrow') && hear()}
        >
          <div>
            <div className="font-extrabold">Shape the sound</div>
            <div className="text-xs text-cream-500">
              Make {name.toLowerCase()}’s {instrument.toLowerCase()} softer, airier or warmer.
            </div>
          </div>
          {CONTROLS.map((c) => (
            <Slider
              key={c.key}
              label={c.label}
              display={c.say(tone[c.key])}
              value={tone[c.key]}
              hint={c.hint}
              onChange={(v) => setMelodyTone({ [c.key]: v }, melodyId)}
            />
          ))}
          <button
            className="btn text-xs self-start"
            disabled={!changed}
            onClick={() => {
              setMelodyTone(null, melodyId);
              hear();
            }}
            title={`Go back to how the ${instrument.toLowerCase()} sounds on its own`}
          >
            ↺ Reset to the instrument’s own sound
          </button>
        </div>
      )}
    </div>
  );
}
