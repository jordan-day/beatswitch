import { togglePlay } from '../audio/engine';
import { useProject, useUi } from '../state/project';
import { BPM_MAX, BPM_MIN } from '../state/types';
import { Slider } from './common';

/**
 * Loop the whole section, or just the bar you're looking at (to practise or polish one bar).
 * This only changes what plays; the section keeps all its bars.
 */
function LoopRange() {
  const bars = useProject((s) => s.project.bars);
  const { loopBar, viewBar, set } = useUi();
  const bar = Math.min(viewBar, bars - 1) + 1;
  const opts = [
    { on: false, label: bars > 1 ? `All ${bars} bars` : 'All', hint: 'Loop every bar of the section' },
    { on: true, label: `Bar ${bar}`, hint: 'Loop only the selected bar (pick a bar above the editor)' },
  ];
  return (
    <div className="flex flex-col gap-1">
      <span className="label">Loop</span>
      <div className="flex rounded-lg bg-ink-700 p-0.5" role="radiogroup" aria-label="What the loop plays">
        {opts.map((o) => (
          <button
            key={String(o.on)}
            role="radio"
            aria-checked={loopBar === o.on}
            title={o.hint}
            onClick={() => set({ loopBar: o.on })}
            className={
              'px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap transition ' +
              (loopBar === o.on ? 'bg-cream-100 text-ink-950' : 'text-cream-300 hover:text-cream-100')
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Play button, tempo, swing, loop range and undo/redo: compact, for the top bar. */
export function Transport() {
  const playing = useUi((s) => s.playing);
  const wholeSong = useUi((s) => s.playMode === 'song');
  const { bpm, swing } = useProject((s) => s.project);
  const update = useProject((s) => s.update);
  const { undo, redo, past, future } = useProject();

  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <button
        onClick={() => togglePlay()}
        className={
          'w-12 h-12 shrink-0 rounded-full text-xl font-black grid place-items-center transition active:scale-95 shadow-lg ' +
          (playing ? 'bg-cream-100 text-ink-950' : 'bg-kick text-ink-950 hover:brightness-110')
        }
        title={`${playing ? 'Stop' : wholeSong ? 'Play the whole song' : 'Loop this section'} (Space)`}
        aria-label={playing ? 'Stop' : 'Play'}
      >
        {playing ? '■' : '▶'}
      </button>

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

      {/* what the loop covers; only matters when looping a section, so it hides for whole-song playback */}
      {!wholeSong && <LoopRange />}

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
