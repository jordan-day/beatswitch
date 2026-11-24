import { setPlayMode, togglePlay } from '../audio/engine';
import { useProject, useUi } from '../state/project';
import { BPM_MAX, BPM_MIN } from '../state/types';
import { Slider } from './common';

/**
 * What the Play button plays: the section you're editing, looping, or the whole song once.
 * Worded "Loop / Whole song" so it isn't confused with the Section / Song view tabs.
 */
function PlayMode() {
  const mode = useUi((s) => s.playMode);
  const opts = [
    { id: 'section' as const, label: '🔁 Loop', hint: 'Play button loops the section you are editing' },
    { id: 'song' as const, label: '🎼 Whole song', hint: 'Play button plays the whole song once, start to finish' },
  ];
  return (
    <div className="flex flex-col gap-0.5 -ml-2" role="radiogroup" aria-label="Play button plays">
      {opts.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={mode === o.id}
          title={o.hint}
          onClick={() => setPlayMode(o.id)}
          className={
            'text-[11px] font-bold rounded-md px-2 py-0.5 text-left transition ' +
            (mode === o.id ? 'bg-cream-100 text-ink-950' : 'text-cream-500 hover:text-cream-100 hover:bg-ink-700')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Play button, tempo, swing, loop length and undo/redo: compact, for the top bar. */
export function Transport() {
  const playing = useUi((s) => s.playing);
  const wholeSong = useUi((s) => s.playMode === 'song');
  const { bpm, swing, bars } = useProject((s) => s.project);
  const update = useProject((s) => s.update);
  const setBars = useProject((s) => s.setBars);
  const { undo, redo, past, future } = useProject();

  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <button
        onClick={() => togglePlay()}
        className={
          'w-12 h-12 shrink-0 rounded-full text-xl font-black grid place-items-center transition active:scale-95 shadow-lg ' +
          (playing ? 'bg-cream-100 text-ink-950' : 'bg-kick text-ink-950 hover:brightness-110')
        }
        title={`${playing ? 'Stop' : wholeSong ? 'Play the whole song' : 'Play the loop'} (Space)`}
        aria-label={playing ? 'Stop' : 'Play'}
      >
        {playing ? '■' : '▶'}
      </button>
      <PlayMode />

      <Slider
        className="w-[88px]"
        label="Tempo"
        display={`${bpm}`}
        min={BPM_MIN}
        max={BPM_MAX}
        step={1}
        value={bpm}
        hint="How fast the beat goes (BPM). Lo-fi usually sits between 70 and 90."
        onChange={(v) => update((p) => void (p.bpm = v), 'bpm')}
      />
      <Slider
        className="w-[88px]"
        label="Swing"
        display={`${Math.round(swing)}%`}
        min={0}
        max={100}
        step={1}
        value={swing}
        hint="Makes the beat lazy and bouncy instead of robotic."
        onChange={(v) => update((p) => void (p.swing = v), 'swing')}
      />

      <div className="flex flex-col gap-1" title="How many bars the section's loop is before it repeats.">
        <span className="label">Bars</span>
        <div className="flex rounded-lg bg-ink-700 p-0.5">
          {([1, 2, 4] as const).map((b) => (
            <button
              key={b}
              className={'w-7 py-0.5 rounded-md text-xs font-bold transition ' + (bars === b ? 'bg-cream-100 text-ink-950' : 'text-cream-300 hover:text-cream-100')}
              onClick={() => setBars(b)}
              aria-pressed={bars === b}
              aria-label={`${b} bar${b > 1 ? 's' : ''}`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1">
        <button className="btn px-2.5" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)" aria-label="Undo">
          ↶
        </button>
        <button className="btn px-2.5" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          ↷
        </button>
      </div>
    </div>
  );
}
