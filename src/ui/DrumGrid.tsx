import { useRef, useState } from 'react';
import { ensureAudio } from '../audio/engine';
import { useProject, useUi, withUndo } from '../state/project';
import { drumTrack, EXTRA_DRUM_COLORS, isDrumRow } from '../state/tracks';
import { DRUM_ROWS, MAX_EXTRA_DRUMS, STEPS_PER_BAR, SYNTH_KITS, type DrumRow, type ExtraDrum, type Project, type SynthKit } from '../state/types';
import { useSamples } from './common';
import { EditorHeader } from './EditorHeader';
import { BeatSoundControls } from './SoundControls';

type RowId = DrumRow | 'bass' | 'chords';
const BASS_LABEL = ['', 'R', '5', '8'];

const ROW_INFO: Record<RowId, { label: string; hint: string; color: string; bg: string }> = {
  kick: { label: 'Kick', hint: 'The deep "boom". Try it on the 1st beat.', color: '#e8916b', bg: 'bg-kick' },
  snare: { label: 'Snare', hint: 'The "clap/crack". Usually on beats 2 and 4.', color: '#e6c27a', bg: 'bg-snare' },
  hat: { label: 'Hi-hat', hint: 'The "tss tss" that keeps time.', color: '#9ccf9a', bg: 'bg-hat' },
  openhat: { label: 'Open hat', hint: 'A longer "tssss" for little lifts.', color: '#7fc4c9', bg: 'bg-openhat' },
  perc: { label: 'Perc', hint: 'Rimshots & claps for extra flavour.', color: '#b6a2e0', bg: 'bg-perc' },
  bass: {
    label: 'Bass',
    hint: 'Follows the chords automatically. Click a square: R = root note, 5 = fifth (higher, brighter), 8 = octave up, then off.',
    color: '#e58fae',
    bg: 'bg-bass',
  },
  chords: { label: 'Chords', hint: 'When the chords play. Each hit rings until the next one.', color: '#8fb3e5', bg: 'bg-chord' },
};

// 🎙 = recorded sound (VCSL, public domain); the others are synthesized.
const KIT_LABEL: Record<SynthKit, string> = {
  acoustic: '🎙 Acoustic kit',
  dusty: 'Dusty kit',
  soft: 'Soft kit',
  clap: '🎙 Clap',
  shaker: '🎙 Shaker',
  tambourine: '🎙 Tambourine',
};

type RowInfo = { label: string; hint: string; color: string };

/** The recorded one-shots sound the same on any row; the full kits have a sound per kind of drum. */
const ONE_SHOTS: SynthKit[] = ['clap', 'shaker', 'tambourine'];
const FULL_KIT_NAMES: Partial<Record<SynthKit, string>> = { acoustic: '🎙 Acoustic', dusty: 'Dusty', soft: 'Soft' };

/** Name and colour of a drum row you added: its sound (e.g. "🎙 Shaker", "Soft snare", or your sample's name). */
function extraInfo(p: Project, d: ExtraDrum): RowInfo {
  const color = EXTRA_DRUM_COLORS[Math.max(0, p.extraDrums.indexOf(d)) % EXTRA_DRUM_COLORS.length];
  const s = d.sound;
  const label =
    s.kind === 'user'
      ? s.name
      : ONE_SHOTS.includes(s.id)
        ? KIT_LABEL[s.id]
        : `${FULL_KIT_NAMES[s.id] ?? ''} ${ROW_INFO[d.voice].label.toLowerCase()}`.trim();
  return { label, color, hint: 'A drum you added. Pick its sound below, or drop a .wav/.mp3 on it.' };
}

export function DrumGrid() {
  const project = useProject((s) => s.project);
  const { toggleStep, toggleBass, clearRow, randomize, addDrum, removeDrum } = useProject();
  const { viewBar, step: playStep } = useUi();
  const bar = Math.min(viewBar, project.bars - 1);
  const offset = bar * STEPS_PER_BAR;

  const copyToAll = () =>
    withUndo(`Copied bar ${bar + 1} into every bar`, () => useProject.getState().update((p) => {
      for (const t of [...DRUM_ROWS.map((r) => p.drums[r]), ...p.extraDrums]) {
        const src = t.steps.slice(offset, offset + STEPS_PER_BAR);
        for (let b = 0; b < p.bars; b++) for (let i = 0; i < STEPS_PER_BAR; i++) t.steps[b * STEPS_PER_BAR + i] = src[i];
      }
      const bsrc = p.bass.steps.slice(offset, offset + STEPS_PER_BAR);
      for (let b = 0; b < p.bars; b++) for (let i = 0; i < STEPS_PER_BAR; i++) p.bass.steps[b * STEPS_PER_BAR + i] = bsrc[i];
    }));

  const clear = (row: string, label: string) => withUndo(`Cleared ${label.toLowerCase()}`, () => clearRow(row));
  const canAdd = project.extraDrums.length < MAX_EXTRA_DRUMS;

  return (
    <>
      <EditorHeader>
        <BeatSoundControls />
        {project.bars > 1 && (
          <button className="btn text-xs" onClick={copyToAll} title="Copy this bar into every other bar">
            ⧉ Copy bar to all
          </button>
        )}
        <button
          className="btn text-xs"
          onClick={() => withUndo('New drum pattern 🎲', randomize)}
          title="Make a random (but musical) drum pattern"
        >
          🎲 Surprise me
        </button>
      </EditorHeader>

      {/* rows stretch to fill the editor on tall screens and shrink (to a minimum) on short ones */}
      <div className="overflow-auto -mx-1 px-1 flex-1 min-h-0">
        <div className="min-w-[520px] sm:min-w-[720px] h-full flex flex-col gap-1.5">
          <div className="relative flex-1 min-h-0 flex flex-col gap-1.5">
          <BeatRuler bar={bar} playStep={playStep - offset} />
          {DRUM_ROWS.map((row) => (
            <Row
              key={row}
              row={row}
              info={ROW_INFO[row]}
              steps={project.drums[row].steps.slice(offset, offset + STEPS_PER_BAR)}
              onToggle={(i) => {
                ensureAudio();
                toggleStep(row, offset + i);
              }}
              onClear={() => clear(row, ROW_INFO[row].label)}
            />
          ))}
          {project.extraDrums.map((d) => {
            const info = extraInfo(project, d);
            return (
              <Row
                key={d.id}
                row={d.id}
                info={info}
                steps={d.steps.slice(offset, offset + STEPS_PER_BAR)}
                onToggle={(i) => {
                  ensureAudio();
                  toggleStep(d.id, offset + i);
                }}
                onClear={() => clear(d.id, info.label)}
                onRemove={() => withUndo(`Removed ${info.label}`, () => removeDrum(d.id))}
              />
            );
          })}
          <button
            className="btn shrink-0 self-start w-36 sm:w-48 h-3.5 p-0 text-xs leading-none opacity-40 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            onClick={() => {
              ensureAudio();
              addDrum();
            }}
            disabled={!canAdd}
            aria-label="Add drum"
            title={canAdd ? 'Add another drum sound to the pad' : `Up to ${MAX_EXTRA_DRUMS} added drums`}
          >
            ＋
          </button>
          <div className="border-t border-ink-600/60 shrink-0" />
          <Row
            row="bass"
            info={ROW_INFO.bass}
            steps={project.bass.steps.slice(offset, offset + STEPS_PER_BAR)}
            label={(s) => BASS_LABEL[s]}
            onToggle={(i) => {
              ensureAudio();
              toggleBass(offset + i);
            }}
            onClear={() => clear('bass', ROW_INFO.bass.label)}
          />
          <Playhead local={playStep - offset} />
          </div>
          <p className="text-xs text-cream-500 mt-1 shrink-0 sticky left-0 max-w-[calc(100vw-3.5rem)]">
            Click a square to add a hit, again for a <b className="text-cream-300">louder</b> hit, again to remove. Bass cycles{' '}
            <b className="text-cream-300">R</b> root → <b className="text-cream-300">5</b> fifth → <b className="text-cream-300">8</b> octave →
            off. Drop a .wav/.mp3 on a drum name to use your own sound, or press <b className="text-cream-300">＋</b> under the drums for another row.
          </p>
        </div>
      </div>
    </>
  );
}

/** One row of the pad. `row` is a built-in row name, 'bass', 'chords', or an added drum row's id. */
function Row(props: {
  row: string;
  info: RowInfo;
  steps: number[];
  label?: (s: number) => string;
  onToggle: (i: number) => void;
  onClear: () => void;
  /** Only for drum rows you added. */
  onRemove?: () => void;
}) {
  const info = props.info;
  const [drag, setDrag] = useState(false);
  const isDrum = props.row !== 'bass' && props.row !== 'chords';
  const importFile = useSamples((s) => s.importFile);
  const update = useProject((s) => s.update);

  const assign = async (file: File) => {
    const meta = await importFile(file);
    if (!meta || !isDrum) return;
    update((p) => {
      const t = drumTrack(p, props.row);
      if (t) t.sound = { kind: 'user', id: meta.id, name: meta.name };
    });
  };

  return (
    <div className="flex items-stretch gap-2 flex-1 min-h-[22px] max-h-[60px]">
      <div
        className={
          // narrower on phones so more of the grid fits; the volume slider hides there too
          'w-36 sm:w-48 shrink-0 flex flex-col justify-center rounded-xl px-2 transition ' +
          (drag ? 'bg-ink-600 ring-2 ring-kick' : '')
        }
        onDragOver={(e) => {
          if (!isDrum) return;
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f && isDrum) assign(f);
        }}
        title={info.hint}
      >
        {/* line 1: name, mute, volume */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: info.color }} />
          <span className="font-bold text-sm leading-tight flex-1 truncate">{info.label}</span>
          {props.row !== 'chords' && <RowMixer row={props.row} name={info.label} />}
        </div>
        {/* line 2: which sound */}
        <div className="pl-4 min-w-0 flex items-center gap-1">
          {isDrum ? (
            <>
              <KitSelect row={props.row} name={info.label} onPickFile={assign} />
              {props.onRemove && (
                <button
                  className="shrink-0 text-xs text-cream-500 hover:text-cream-100 rounded px-0.5"
                  onClick={props.onRemove}
                  title={`Remove ${info.label} from the pad (in every section)`}
                  aria-label={`Remove ${info.label}`}
                >
                  🗑
                </button>
              )}
            </>
          ) : (
            <span className="text-xs text-cream-500">{props.row === 'bass' ? 'follows the chords' : 'custom chord rhythm'}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-16 gap-1 flex-1" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
        {props.steps.map((s, i) => {
          const beatStart = i % 4 === 0;
          return (
            <button
              key={i}
              onClick={() => props.onToggle(i)}
              aria-label={`${info.label} step ${i + 1}${
                !s ? '' : props.row === 'bass' ? ' ' + ['', 'root', 'fifth', 'octave'][s] : props.row === 'chords' ? ' hit' : s === 2 ? ' accent' : ' on'
              }`}
              className={
                'cell h-full rounded-md border ' +
                (s ? 'border-transparent ' : beatStart ? 'bg-ink-600 border-ink-600 ' : 'bg-ink-700 border-ink-700 ')
              }
              style={s ? { background: info.color, opacity: props.label ? 0.55 + s * 0.15 : s === 2 ? 1 : 0.6 } : undefined}
            >
              {s > 0 && props.label && <span className="text-xs font-black text-ink-950">{props.label(s)}</span>}
            </button>
          );
        })}
      </div>

      <button
        className="w-6 shrink-0 text-cream-500 hover:text-cream-100 text-xs rounded"
        onClick={props.onClear}
        title={`Clear ${info.label} (all bars)`}
        aria-label={`Clear ${info.label}`}
      >
        ✕
      </button>
    </div>
  );
}

/**
 * A line running across the beat grid while it plays. It sits over the 16 step columns, which are
 * laid out like each Row: name column (w-36 / sm:w-48), gap-2, the grid (gap-1), gap-2, clear button (w-6).
 */
function Playhead({ local }: { local: number }) {
  if (local < 0 || local >= STEPS_PER_BAR) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex gap-2" aria-hidden="true">
      <div className="w-36 sm:w-48 shrink-0" />
      <div className="relative flex-1">
        <div
          className="absolute top-0 bottom-0 w-0.5 -ml-px rounded-full bg-cream-100 shadow-[0_0_8px_rgba(243,233,220,0.8)]"
          // centre of column `local`: 16 columns share the width minus 15 gaps of 4px
          style={{ left: `calc((100% - 60px) * ${(local + 0.5) / STEPS_PER_BAR} + ${local * 4}px)` }}
        />
      </div>
      <div className="w-6 shrink-0" />
    </div>
  );
}

/** Beat numbers above the grid (1 2 3 4 of the bar shown), so you can count along. */
function BeatRuler({ bar, playStep }: { bar: number; playStep: number }) {
  return (
    <div className="flex items-end gap-2 shrink-0 h-4" aria-hidden="true">
      <div className="w-36 sm:w-48 shrink-0 text-xs font-bold text-cream-500 pl-2 uppercase tracking-wider">Bar {bar + 1}</div>
      <div className="grid gap-1 flex-1" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
        {Array.from({ length: 16 }, (_, i) => (
          <div
            key={i}
            className={
              'text-center leading-none ' +
              (i % 4 === 0 ? 'text-xs font-extrabold ' : 'text-xs ') +
              (Math.floor(playStep / 4) === Math.floor(i / 4) && playStep >= 0 ? 'text-cream-100' : 'text-cream-500')
            }
          >
            {i % 4 === 0 ? i / 4 + 1 : '·'}
          </div>
        ))}
      </div>
      <div className="w-6 shrink-0" />
    </div>
  );
}

/** Mute and volume for a row (volume hides on phones to give the grid room). */
function RowMixer({ row, name }: { row: string; name: string }) {
  const p = useProject((s) => s.project);
  const update = useProject((s) => s.update);
  const t = row === 'bass' ? undefined : drumTrack(p, row);
  const muted = row === 'bass' ? !p.bass.enabled : !!t?.mute;
  const volume = row === 'bass' ? p.bass.volume : (t?.volume ?? 0);
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        className={'w-6 h-6 grid place-items-center rounded-md text-xs ' + (muted ? 'bg-kick text-ink-950' : 'text-cream-500 hover:text-cream-100 hover:bg-ink-600')}
        onClick={() =>
          update((d) => {
            const dt = drumTrack(d, row);
            if (row === 'bass') d.bass.enabled = !d.bass.enabled;
            else if (dt) dt.mute = !dt.mute;
          })
        }
        title={muted ? `Unmute ${name}` : `Mute ${name}`}
        aria-label={muted ? `Unmute ${name}` : `Mute ${name}`}
        aria-pressed={muted}
      >
        {muted ? '🔇' : '🔈'}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        className="hidden sm:block w-12 !h-4"
        title={`${name} volume`}
        aria-label={`${name} volume`}
        onChange={(e) =>
          update((d) => {
            const dt = drumTrack(d, row);
            if (row === 'bass') d.bass.volume = Number(e.target.value);
            else if (dt) dt.volume = Number(e.target.value);
          }, 'vol:' + row)
        }
      />
    </div>
  );
}

/**
 * Which sound a drum row plays: built-in kits, recorded hits, your imported samples.
 * A built-in row plays its own kind of drum from the kit; a row you added can be any kind
 * ("synth:soft:snare" = the soft kit's snare), so its list offers every drum of every kit.
 */
function KitSelect({ row, name, onPickFile }: { row: string; name: string; onPickFile: (f: File) => void }) {
  const p = useProject((s) => s.project);
  const update = useProject((s) => s.update);
  const samples = useSamples((s) => s.samples);
  const fileRef = useRef<HTMLInputElement>(null);
  const extra = isDrumRow(row) ? undefined : p.extraDrums.find((d) => d.id === row);
  const track = drumTrack(p, row);
  if (!track) return null;
  const synthValue = (kit: SynthKit, voice?: DrumRow) => (extra && !ONE_SHOTS.includes(kit) ? `synth:${kit}:${voice}` : 'synth:' + kit);
  const value = track.sound.kind === 'synth' ? synthValue(track.sound.id, extra?.voice) : 'user:' + track.sound.id;

  return (
    <div className="flex items-center">
      <select
        aria-label={`${name} sound`}
        className="bg-transparent text-xs text-cream-500 hover:text-cream-100 w-full truncate cursor-pointer rounded"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'import') return fileRef.current?.click();
          const [kind, id, voice] = v.split(':');
          update((d) => {
            const t = drumTrack(d, row);
            if (!t) return;
            if (kind === 'synth') {
              t.sound = { kind: 'synth', id: id as SynthKit };
              const x = d.extraDrums.find((e) => e.id === row);
              if (x && voice) x.voice = voice as DrumRow;
            } else {
              const meta = samples.find((s) => s.id === id);
              t.sound = { kind: 'user', id, name: meta?.name ?? 'Sample' };
            }
          });
        }}
      >
        {extra ? (
          <>
            <optgroup label="Recorded hits">
              {ONE_SHOTS.map((k) => (
                <option key={k} value={synthValue(k)}>
                  {KIT_LABEL[k]}
                </option>
              ))}
            </optgroup>
            {SYNTH_KITS.filter((k) => !ONE_SHOTS.includes(k)).map((k) => (
              <optgroup key={k} label={KIT_LABEL[k]}>
                {DRUM_ROWS.map((r) => (
                  <option key={r} value={synthValue(k, r)}>
                    {FULL_KIT_NAMES[k]} {ROW_INFO[r].label.toLowerCase()}
                  </option>
                ))}
              </optgroup>
            ))}
          </>
        ) : (
          SYNTH_KITS.map((k) => (
            <option key={k} value={'synth:' + k}>
              {KIT_LABEL[k]}
            </option>
          ))
        )}
        {track.sound.kind === 'user' && !samples.some((s) => s.id === track.sound.id) && (
          <option value={value}>{(track.sound as { name: string }).name} (missing)</option>
        )}
        {samples.length > 0 && (
          <optgroup label="Your samples">
            {samples.map((s) => (
              <option key={s.id} value={'user:' + s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        )}
        <option value="import">＋ Import sample…</option>
      </select>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
