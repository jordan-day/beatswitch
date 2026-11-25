import { useState } from 'react';
import { useProject } from '../state/project';
import type { FxSettings } from '../state/types';
import { Slider } from './common';

function describe(v: number) {
  if (v < 0.15) return 'Crisp & clean';
  if (v < 0.35) return 'A little dusty';
  if (v < 0.55) return 'Cozy cassette';
  if (v < 0.75) return 'Old vinyl';
  if (v < 0.9) return 'Worn-out tape';
  return 'Broken radio';
}

const FINE: { key: keyof Omit<FxSettings, 'lofi'>; label: string; hint: string }[] = [
  { key: 'crackle', label: 'Vinyl crackle', hint: 'Record-player pops and hiss' },
  { key: 'wobble', label: 'Tape wobble', hint: 'Makes the keys gently warble, like an old tape' },
  { key: 'muffle', label: 'Muffle', hint: 'Takes off the sharp highs, like sound through a wall' },
  { key: 'crunch', label: 'Crunch', hint: 'Gritty, low-quality "bitcrushed" sound' },
  { key: 'space', label: 'Room', hint: 'Reverb: how big the room sounds' },
];

/** The big "Lo-fi-ness" knob, with optional fine-tuning. Lives in the settings column. */
export function LofiPanel() {
  const fx = useProject((s) => s.project.fx);
  const { setLofi, setFx } = useProject();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-extrabold">📼 Lo-fi-ness</span>
        <span className="text-xs font-bold text-snare">{describe(fx.lofi)}</span>
      </div>
      <input
        type="range"
        className="big w-full"
        min={0}
        max={1}
        step={0.01}
        value={fx.lofi}
        onChange={(e) => setLofi(Number(e.target.value))}
        aria-label="Lo-fi-ness"
        title="One knob to make everything sound older and warmer"
      />
      <div className="flex justify-between text-xs text-cream-500 -mt-1">
        <span>Clean</span>
        <span>Dusty</span>
      </div>

      <button className="text-xs text-cream-500 hover:text-cream-100 self-start" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '▾' : '▸'} Fine-tune
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {FINE.map((f) => (
            <Slider
              key={f.key}
              label={f.label}
              hint={f.hint}
              value={fx[f.key]}
              display={`${Math.round(fx[f.key] * 100)}`}
              onChange={(v) => setFx(f.key, v)}
            />
          ))}
          <p className="text-xs text-cream-500">Moving the big knob again resets these.</p>
        </div>
      )}
    </div>
  );
}
