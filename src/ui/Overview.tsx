import { slotLength } from '../music/patterns';
import { useProject, useUi, type Track } from '../state/project';
import { sectionColor } from '../state/song';
import { allMelodies, melodyColor } from '../state/tracks';
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
 * Clicking a lane's name opens its editor; clicking a "Bar n" label jumps the editor to that bar.
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
  // The overview is a picture of the section. Its controls: the "Bar n" row picks the bar to edit,
  // and the lane names (Drums, Bass, Chords, Melody) open that part's editor.

  return (
    <section className="card p-3 sm:p-3 shrink-0" aria-label="Section overview">
      <div className="flex gap-2">
        {/* lane labels (the open editor's lanes are highlighted) */}
        <div className="w-24 shrink-0 flex flex-col gap-1">
          <SectionSwitcher />
          {LANES.map((l) => (
            <button
              key={l.id}
              onClick={() => set({ track: l.track })}
              aria-pressed={track === l.track}
              title={`Open the ${{ beat: 'Beat', chords: 'Chords', melody: 'Melody' }[l.track]} editor`}
              className={
                'h-6 rounded-lg px-2 text-sm font-bold flex items-center gap-1.5 text-left transition ' +
                (track === l.track ? 'bg-ink-600 text-cream-100' : 'text-cream-500 hover:text-cream-100 hover:bg-ink-700')
              }
            >
              <span aria-hidden="true">{l.icon}</span>
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
                onClick={() => set({ viewBar: b })}
                aria-pressed={b === bar}
                className={
                  'text-[11px] font-bold text-left pl-1.5 border-l-2 rounded-sm transition ' +
                  (b === bar ? 'border-cream-100 text-cream-100 bg-ink-600/60' : 'border-ink-600 text-cream-500 hover:text-cream-100')
                }
                title={`Edit bar ${b + 1}`}
              >
                Bar {b + 1}
                {step >= 0 && Math.floor(step / STEPS_PER_BAR) === b && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-kick ml-1.5 align-middle" aria-label="playing" />
                )}
              </button>
            ))}
          </div>

          {/* drums: a tiny version of the grid */}
          <Lane active={track === 'beat'}>
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
          <Lane active={track === 'beat'} dim={!p.bass.enabled}>
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
          <Lane active={track === 'chords'}>
            <div className="relative flex h-full gap-px">
              {/* custom rhythm: a tick under each chord hit */}
              {p.chords.rhythm === 'custom' &&
                p.chords.steps.slice(0, total).map((on, i) =>
                  on ? (
                    <div
                      key={'hit' + i}
                      className="absolute bottom-0.5 h-1 rounded-full bg-cream-100/80 pointer-events-none z-10"
                      style={{ left: `${(i / total) * 100}%`, width: `${100 / total}%` }}
                    />
                  ) : null,
                )}
              {p.chords.slots.map((c, i) => (
                <div
                  key={i}
                  className={
                    'flex-1 min-w-0 rounded-md px-1.5 text-xs font-extrabold truncate flex items-center ' +
                    (activeSlot === i ? 'bg-chord text-ink-950' : c ? 'bg-chord/25 text-cream-100' : 'bg-ink-700/50 text-cream-500')
                  }
                  title={c ? `${c.symbol}: chord ${i + 1}` : `Chord ${i + 1}: silent`}
                >
                  {c ? c.symbol : '–'}
                </div>
              ))}
            </div>
          </Lane>

          {/* melody: a tiny piano roll */}
          {/* every melody, each in its own colour (a muted one is faint) */}
          <Lane active={track === 'melody'} dim={allMelodies(p).every((m) => m.track.mute)}>
            <div className="relative h-full">
              {allMelodies(p).every((m) => m.track.notes.length === 0) && (
                <span className="absolute inset-0 flex items-center pl-2 text-[11px] text-cream-500">No melody yet</span>
              )}
              {allMelodies(p).flatMap(({ id, track: m }) =>
                m.notes
                  .filter((n) => n.s < total)
                  .map((n) => (
                    <div
                      key={`${id}-${n.s}-${n.d}`}
                      className="absolute rounded-[2px]"
                      style={{
                        left: `${(n.s / total) * 100}%`,
                        width: `${(Math.min(n.l, total - n.s) / total) * 100}%`,
                        bottom: `${(n.d / MELODY_ROWS) * 100}%`,
                        height: `${100 / MELODY_ROWS + 2}%`,
                        background: melodyColor(p, id),
                        opacity: m.mute ? 0.35 : 1,
                      }}
                    />
                  )),
              )}
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

/** Which section the editors are showing; pick another to edit it. */
function SectionSwitcher() {
  const p = useProject((s) => s.project);
  const switchSection = useProject((s) => s.switchSection);
  const playingOther = useUi((s) => s.playing && s.playMode === 'song' && s.step < 0);
  return (
    <div className="h-5 flex items-center gap-1" title={playingOther ? 'The song is playing another section right now' : 'Section you are editing'}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sectionColor(p, p.activeSection) }} />
      <select
        className="bg-transparent text-[11px] font-extrabold uppercase tracking-wide text-cream-100 min-w-0 w-full cursor-pointer rounded"
        value={p.activeSection}
        onChange={(e) => switchSection(e.target.value)}
        aria-label="Section you are editing"
      >
        {p.sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Lane(props: { active: boolean; dim?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={
        'h-6 rounded-lg px-0.5 border ' +
        (props.active ? 'bg-ink-900/70 border-ink-600' : 'bg-ink-900/40 border-transparent') +
        (props.dim ? ' opacity-40' : '')
      }
    >
      {props.children}
    </div>
  );
}
