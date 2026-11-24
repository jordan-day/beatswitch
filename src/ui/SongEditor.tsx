import { useState } from 'react';
import { stepSeconds } from '../audio/graph';
import { play, setPlayMode } from '../audio/engine';
import { useProject, useUi, withUndo } from '../state/project';
import {
  buildTimeline,
  formatTime,
  MAX_REPEATS,
  PARTS,
  sectionBars,
  sectionColor,
  songBars,
  songSteps,
  type Part,
} from '../state/song';

const PART_ICON: Record<Part, { icon: string; label: string }> = {
  drums: { icon: '🥁', label: 'Drums' },
  bass: { icon: '🎸', label: 'Bass' },
  chords: { icon: '🎹', label: 'Chords' },
  melody: { icon: '🎵', label: 'Melody' },
};

/** The Song view: your sections, and the arrangement that strings them into a song. */
export function SongEditor() {
  const p = useProject((s) => s.project);
  const addSection = useProject((s) => s.addSection);
  const setFade = useProject((s) => s.setFade);
  const seconds = songSteps(p) * stepSeconds(p.bpm);

  return (
    <section className="card p-3 sm:p-4 flex flex-col min-h-0 lg:flex-1" aria-label="Song arrangement">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-lg font-extrabold mr-2">🎼 Song</h2>
        <span className="text-xs text-cream-500" title="Total length of the arrangement">
          <b className="text-cream-100">{formatTime(seconds)}</b> · {songBars(p)} bars
        </span>
        <Toggle on={p.fadeIn} onClick={() => setFade('fadeIn', !p.fadeIn)} title="Fade in over the first 2 bars">
          Fade in
        </Toggle>
        <Toggle on={p.fadeOut} onClick={() => setFade('fadeOut', !p.fadeOut)} title="Fade out over the last 4 bars">
          Fade out
        </Toggle>
        <button
          className="btn text-xs"
          onClick={async () => {
            await setPlayMode('song');
            if (!useUi.getState().playing) await play();
          }}
          title="Play the whole arrangement from the start"
        >
          ▶ Play song
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 flex flex-col gap-3">
        {/* ---- sections ---- */}
        <div>
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="label">Sections</span>
            <span className="text-[11px] text-cream-500">Each section is its own loop. ✏️ Edit opens its beat, chords and melody.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.sections.map((s) => (
              <SectionCard key={s.id} id={s.id} />
            ))}
            <button
              className="rounded-xl border-2 border-dashed border-ink-600 px-4 py-2 text-sm font-bold text-cream-500 hover:text-cream-100 hover:border-cream-500"
              onClick={() => withUndo('New section added (a copy of the one you were on)', addSection)}
              title="Add a section: it starts as a copy of the section you're editing"
            >
              ＋ New section
            </button>
          </div>
        </div>

        {/* ---- arrangement ---- */}
        <div>
          <div className="flex flex-wrap items-baseline gap-2 mb-1.5">
            <span className="label">Arrangement</span>
            <span className="text-[11px] text-cream-500">Plays left to right. Switch parts off per block for intros, breakdowns and outros.</span>
          </div>
          {p.song.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-ink-600 p-4 text-sm text-cream-500">
              Your song is empty. Use <b className="text-cream-300">＋ Add to song</b> on a section above.
            </div>
          ) : (
            <Arrangement />
          )}
        </div>
      </div>
    </section>
  );
}

function Toggle(props: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button className={'chip text-xs ' + (props.on ? 'chip-on' : '')} onClick={props.onClick} aria-pressed={props.on} title={props.title}>
      {props.on ? '✓ ' : ''}
      {props.children}
    </button>
  );
}

function SectionCard({ id }: { id: string }) {
  const p = useProject((s) => s.project);
  const { switchSection, renameSection, duplicateSection, deleteSection, addBlock } = useProject();
  const set = useUi((s) => s.set);
  const [confirm, setConfirm] = useState(false);
  const s = p.sections.find((x) => x.id === id)!;
  const editing = id === p.activeSection;
  const uses = p.song.filter((b) => b.section === id).length;

  return (
    <div
      className={'rounded-xl border-2 bg-ink-900/60 p-2 flex flex-col gap-1.5 w-52 ' + (editing ? 'border-cream-100' : 'border-ink-600')}
      style={{ boxShadow: `inset 4px 0 0 ${sectionColor(p, id)}` }}
    >
      <div className="flex items-center gap-1 pl-1.5">
        <input
          className="bg-transparent font-extrabold text-sm flex-1 min-w-0 rounded px-1 -mx-1 hover:bg-ink-700 focus:bg-ink-700"
          value={s.name}
          onChange={(e) => renameSection(id, e.target.value)}
          aria-label="Section name"
          title="Click to rename"
        />
        <span className="text-[10px] text-cream-500 shrink-0" title={`${sectionBars(p, id)}-bar loop, used ${uses}× in the song`}>
          {sectionBars(p, id)} bar{sectionBars(p, id) > 1 ? 's' : ''} · {uses}×
        </span>
        {editing && <span className="text-[9px] font-bold text-ink-950 bg-cream-100 rounded px-1">EDITING</span>}
      </div>
      {confirm ? (
        <div className="flex items-center gap-1 pl-1.5" role="alertdialog" aria-label={`Delete ${s.name}?`}>
          <span className="text-xs flex-1">Delete it{uses ? ` and its ${uses} block${uses > 1 ? 's' : ''}` : ''}?</span>
          <button className="btn text-xs px-2 py-1" onClick={() => setConfirm(false)} autoFocus>
            Keep
          </button>
          <button
            className="btn text-xs px-2 py-1 bg-kick text-ink-950 hover:bg-kick"
            onClick={() => withUndo(`Deleted "${s.name}"`, () => deleteSection(id))}
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1 pl-1">
          <button
            className="btn text-xs px-2 py-1"
            onClick={() => {
              switchSection(id);
              set({ view: 'section', track: 'beat', viewBar: 0 });
            }}
            title="Edit this section's beat, chords and melody"
          >
            ✏️ Edit
          </button>
          <button className="btn text-xs px-2 py-1" onClick={() => addBlock(id)} title="Add this section to the end of the song">
            ＋ Add to song
          </button>
          <button className="btn text-xs px-2 py-1" onClick={() => duplicateSection(id)} title="Make a copy to create a variation" aria-label={`Duplicate ${s.name}`}>
            ⧉
          </button>
          <button
            className="btn text-xs px-2 py-1"
            onClick={() => setConfirm(true)}
            disabled={p.sections.length <= 1}
            title={p.sections.length <= 1 ? 'A song needs at least one section' : 'Delete this section'}
            aria-label={`Delete ${s.name}`}
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

function Arrangement() {
  const p = useProject((s) => s.project);
  const { removeBlock, moveBlock, setRepeats, toggleBlockMute, toggleFill, switchSection } = useProject();
  const { songStep, playMode, playing } = useUi();
  const timeline = buildTimeline(p);

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="flex gap-1.5 items-stretch">
        {timeline.map((seg, i) => {
          const b = seg.block;
          const section = p.sections.find((s) => s.id === b.section)!;
          const color = sectionColor(p, b.section);
          const live = playing && playMode === 'song' && songStep >= seg.start && songStep < seg.start + seg.steps;
          const progress = live ? (songStep - seg.start) / seg.steps : 0;
          return (
            <div
              key={b.id}
              className={'relative rounded-xl bg-ink-900/70 border-2 p-1.5 flex flex-col gap-1 shrink-0 ' + (live ? 'border-cream-100' : 'border-ink-600')}
              style={{ width: Math.max(150, Math.min(260, seg.steps * 1.6)) }}
              aria-label={`Block ${i + 1}: ${section.name} ×${b.repeats}`}
            >
              <div className="h-1.5 rounded-full" style={{ background: color }}>
                {live && <div className="h-full rounded-full bg-cream-100" style={{ width: `${progress * 100}%` }} />}
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="font-extrabold text-sm truncate flex-1 text-left rounded hover:underline"
                  onClick={() => { switchSection(b.section); useUi.getState().set({ view: 'section', viewBar: 0 }); }}
                  title={`Edit "${section.name}"`}
                >
                  {section.name}
                </button>
                <span className="text-[10px] text-cream-500">{(seg.steps / 16) | 0} bars</span>
              </div>

              {/* repeats + order */}
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-0.5" title="How many times this section plays here">
                  <button className="btn px-2 py-0 text-xs" onClick={() => setRepeats(i, b.repeats - 1)} disabled={b.repeats <= 1} aria-label="Fewer repeats">
                    −
                  </button>
                  <span className="text-xs font-bold w-7 text-center">×{b.repeats}</span>
                  <button
                    className="btn px-2 py-0 text-xs"
                    onClick={() => setRepeats(i, b.repeats + 1)}
                    disabled={b.repeats >= MAX_REPEATS}
                    aria-label="More repeats"
                  >
                    +
                  </button>
                </div>
                <div className="ml-auto flex gap-0.5">
                  <button className="btn px-1.5 py-0 text-xs" onClick={() => moveBlock(i, -1)} disabled={i === 0} aria-label="Move earlier" title="Move earlier">
                    ◀
                  </button>
                  <button
                    className="btn px-1.5 py-0 text-xs"
                    onClick={() => moveBlock(i, 1)}
                    disabled={i === timeline.length - 1}
                    aria-label="Move later"
                    title="Move later"
                  >
                    ▶
                  </button>
                  <button
                    className="btn px-1.5 py-0 text-xs"
                    onClick={() => withUndo(`Removed "${section.name}" from the song`, () => removeBlock(i))}
                    aria-label="Remove from song"
                    title="Remove this block from the song (the section itself stays)"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* parts on/off */}
              <div className="flex gap-0.5" role="group" aria-label="Parts playing in this block">
                {PARTS.map((part) => {
                  const off = b.mute[part];
                  return (
                    <button
                      key={part}
                      className={
                        'flex-1 rounded-md text-sm py-0.5 border ' +
                        (off ? 'border-ink-600 opacity-35 line-through' : 'border-transparent bg-ink-700 hover:bg-ink-600')
                      }
                      onClick={() => toggleBlockMute(i, part)}
                      aria-pressed={!off}
                      aria-label={`${PART_ICON[part].label} ${off ? 'off' : 'on'}`}
                      title={`${PART_ICON[part].label}: ${off ? 'off in this block (click to turn on)' : 'on (click to turn off for this block)'}`}
                    >
                      {PART_ICON[part].icon}
                    </button>
                  );
                })}
                <button
                  className={'rounded-md text-[10px] font-bold px-1.5 border ' + (b.fill ? 'bg-cream-100 text-ink-950 border-cream-100' : 'border-ink-600 text-cream-500 hover:text-cream-100')}
                  onClick={() => toggleFill(i)}
                  aria-pressed={b.fill}
                  title="Drum fill on the last beat, leading into the next block"
                >
                  Fill
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
