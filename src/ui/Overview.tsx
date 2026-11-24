import { slotLength } from '../music/patterns';
import { useProject, useUi, type Track } from '../state/project';
import { DRUM_ROWS, MELODY_ROWS, STEPS_PER_BAR } from '../state/types';

const DRUM_COLORS = ['#e8916b', '#e6c27a', '#9ccf9a', '#7fc4c9', '#b6a2e0'];

const LANES: { id: 'drums' | 'bass' | 'chords' | 'melody'; track: Track; label: string; icon: string }[] = [
  { id: 'drums', track: 'beat', label: 'Drums', icon: '🥁' },
  { id: 'bass', track: 'beat', label: 'Bass', icon: '🎸' },
  { id: 'chords', track: 'chords', label: 'Chords', icon: '🎹' },
  { id: 'melody', track: 'melody', label: 'Melody', icon: '🎵' },
];

/**
 * The whole loop at a glance: one compact lane per part, with the playhead running across.
 * Clicking a lane opens its editor; clicking inside it also jumps the editor to that bar.
 */
export function Overview() {
  const p = useProject((s) => s.project);
  const { step, track, viewBar, set } = useUi();
  const total = p.bars * STEPS_PER_BAR;
  const bar = Math.min(viewBar, p.bars - 1);
  const cols = { gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` };
  const count = p.chords.slots.length;
  const len = slotLength(p.bars, count);
  const activeSlot = step >= 0 ? Math.min(count - 1, Math.floor(step / len)) : -1;
  const showBar = track !== 'chords';

  const open = (t: Track, e?: React.MouseEvent<HTMLElement>) => {
    const next: Partial<ReturnType<typeof useUi.getState>> = { track: t };
    if (e) {
      const r = e.currentTarget.getBoundingClientRect();
      next.viewBar = Math.min(p.bars - 1, Math.floor(((e.clientX - r.left) / r.width) * p.bars));
    }
    set(next);
  };

  return (
    <section className="card p-3 sm:p-3 shrink-0" aria-label="Song overview">
      <div className="flex gap-2">
        {/* lane labels */}
        <div className="w-24 shrink-0 flex flex-col gap-1">
          <div className="h-5 label leading-5">Song</div>
          {LANES.map((l) => (
            <button
              key={l.id}
              onClick={() => open(l.track)}
              className={
                'h-7 rounded-lg px-2 text-left text-sm font-bold flex items-center gap-1.5 transition ' +
                (track === l.track ? 'bg-ink-600 text-cream-100' : 'text-cream-500 hover:bg-ink-700 hover:text-cream-100')
              }
            >
              <span>{l.icon}</span>
              {l.label}
            </button>
          ))}
        </div>

        {/* lanes */}
        <div className="relative flex-1 min-w-0 flex flex-col gap-1">
          {/* bar ruler */}
          <div className="h-5 grid" style={{ gridTemplateColumns: `repeat(${p.bars}, minmax(0, 1fr))` }}>
            {Array.from({ length: p.bars }, (_, b) => (
              <button
                key={b}
                onClick={() => set({ viewBar: b, track: track === 'chords' ? 'beat' : track })}
                className={
                  'text-[11px] font-bold text-left pl-1.5 border-l-2 rounded-sm transition ' +
                  (showBar && b === bar ? 'border-cream-100 text-cream-100 bg-ink-600/60' : 'border-ink-600 text-cream-500 hover:text-cream-100')
                }
                title={`Edit bar ${b + 1}`}
              >
                Bar {b + 1}
              </button>
            ))}
          </div>

          {/* drums: a tiny version of the grid */}
          <Lane active={track === 'beat'} onClick={(e) => open('beat', e)}>
            <div className="grid h-full gap-px" style={cols}>
              {Array.from({ length: total }, (_, i) => (
                <div key={i} className={'flex flex-col justify-between py-0.5 ' + (i % 4 === 0 ? 'bg-ink-700/70' : '')}>
                  {DRUM_ROWS.map((r, ri) => (
                    <div
                      key={r}
                      className="h-[4px] rounded-[1px]"
                      style={{ background: p.drums[r].steps[i] && !p.drums[r].mute ? DRUM_COLORS[ri] : 'transparent' }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </Lane>

          {/* bass */}
          <Lane active={track === 'beat'} onClick={(e) => open('beat', e)} dim={!p.bass.enabled}>
            <div className="grid h-full gap-px" style={cols}>
              {Array.from({ length: total }, (_, i) => {
                const s = p.bass.steps[i];
                return (
                  <div key={i} className={'flex items-end ' + (i % 4 === 0 ? 'bg-ink-700/70' : '')}>
                    {s > 0 && <div className="w-full rounded-sm bg-bass" style={{ height: `${30 + s * 22}%` }} />}
                  </div>
                );
              })}
            </div>
          </Lane>

          {/* chords */}
          <Lane active={track === 'chords'} onClick={() => open('chords')}>
            <div className="flex h-full gap-px">
              {p.chords.slots.map((c, i) => (
                <button
                  key={i}
                  className={
                    'flex-1 min-w-0 rounded-md px-1.5 text-left text-xs font-extrabold truncate transition ' +
                    (activeSlot === i ? 'bg-chord text-ink-950' : c ? 'bg-chord/25 text-cream-100 hover:bg-chord/40' : 'bg-ink-700/50 text-cream-500')
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    set({ track: 'chords', selectedSlot: i });
                  }}
                  title={c ? `Edit ${c.symbol}` : 'Rest: click to add a chord'}
                >
                  {c ? c.symbol : '–'}
                </button>
              ))}
            </div>
          </Lane>

          {/* melody: a tiny piano roll */}
          <Lane active={track === 'melody'} onClick={(e) => open('melody', e)} dim={p.melody.mute}>
            <div className="relative h-full">
              {p.melody.notes.length === 0 && (
                <span className="absolute inset-0 flex items-center pl-2 text-[11px] text-cream-500">Empty: click to write a melody</span>
              )}
              {p.melody.notes
                .filter((n) => n.s < total)
                .map((n) => (
                  <div
                    key={`${n.s}-${n.d}`}
                    className="absolute rounded-[2px]"
                    style={{
                      left: `${(n.s / total) * 100}%`,
                      width: `${(Math.min(n.l, total - n.s) / total) * 100}%`,
                      bottom: `${(n.d / MELODY_ROWS) * 100}%`,
                      height: `${100 / MELODY_ROWS + 2}%`,
                      background: '#f2a65a',
                    }}
                  />
                ))}
            </div>
          </Lane>

          {/* bar lines + playhead */}
          <div className="pointer-events-none absolute left-0 right-0 top-6 bottom-0">
            {Array.from({ length: p.bars - 1 }, (_, b) => (
              <div key={b} className="absolute top-0 bottom-0 w-px bg-ink-600" style={{ left: `${((b + 1) / p.bars) * 100}%` }} />
            ))}
            {step >= 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-cream-100 shadow-[0_0_8px_rgba(243,233,220,0.8)]"
                style={{ left: `${((step + 0.5) / total) * 100}%` }}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Lane(props: { active: boolean; dim?: boolean; onClick: (e: React.MouseEvent<HTMLDivElement>) => void; children: React.ReactNode }) {
  return (
    <div
      onClick={props.onClick}
      className={
        'h-7 rounded-lg px-0.5 cursor-pointer transition border ' +
        (props.active ? 'bg-ink-900/70 border-ink-600' : 'bg-ink-900/40 border-transparent hover:border-ink-600') +
        (props.dim ? ' opacity-40' : '')
      }
    >
      {props.children}
    </div>
  );
}
