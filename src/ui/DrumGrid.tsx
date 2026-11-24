import { useRef, useState } from 'react';
import { ensureAudio } from '../audio/engine';
import { useProject, useUi } from '../state/project';
import { DRUM_ROWS, STEPS_PER_BAR, SYNTH_KITS, type DrumRow } from '../state/types';
import { useSamples } from './common';
import { EditorHeader } from './EditorHeader';

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

const KIT_LABEL: Record<string, string> = { dusty: 'Dusty kit', soft: 'Soft kit' };

export function DrumGrid() {
  const project = useProject((s) => s.project);
  const { toggleStep, toggleBass, toggleChordStep, clearRow, randomize } = useProject();
  const { viewBar, step: playStep } = useUi();
  const bar = Math.min(viewBar, project.bars - 1);
  const offset = bar * STEPS_PER_BAR;

  const copyToAll = () =>
    useProject.getState().update((p) => {
      for (const r of DRUM_ROWS) {
        const src = p.drums[r].steps.slice(offset, offset + STEPS_PER_BAR);
        for (let b = 0; b < p.bars; b++) for (let i = 0; i < STEPS_PER_BAR; i++) p.drums[r].steps[b * STEPS_PER_BAR + i] = src[i];
      }
      const bsrc = p.bass.steps.slice(offset, offset + STEPS_PER_BAR);
      for (let b = 0; b < p.bars; b++) for (let i = 0; i < STEPS_PER_BAR; i++) p.bass.steps[b * STEPS_PER_BAR + i] = bsrc[i];
    });

  return (
    <>
      <EditorHeader barPicker>
        {project.bars > 1 && (
          <button className="btn text-xs" onClick={copyToAll} title="Copy this bar into every other bar">
            ⧉ Copy bar to all
          </button>
        )}
        <button className="btn text-xs" onClick={randomize} title="Make a random (but musical) drum pattern">
          🎲 Surprise me
        </button>
      </EditorHeader>

      {/* rows stretch to fill the editor on tall screens and shrink (to a minimum) on short ones */}
      <div className="overflow-auto -mx-1 px-1 flex-1 min-h-0">
        <div className="min-w-[720px] h-full flex flex-col gap-1.5">
          {DRUM_ROWS.map((row) => (
            <Row
              key={row}
              row={row}
              steps={project.drums[row].steps.slice(offset, offset + STEPS_PER_BAR).map((s) => s)}
              playStep={playStep - offset}
              onToggle={(i) => {
                ensureAudio();
                toggleStep(row, offset + i);
              }}
              onClear={() => clearRow(row)}
            />
          ))}
          <div className="border-t border-ink-600/60 shrink-0" />
          <Row
            row="bass"
            steps={project.bass.steps.slice(offset, offset + STEPS_PER_BAR)}
            playStep={playStep - offset}
            label={(s) => BASS_LABEL[s]}
            onToggle={(i) => {
              ensureAudio();
              toggleBass(offset + i);
            }}
            onClear={() => clearRow('bass')}
          />
          {project.chords.rhythm === 'custom' && (
            <Row
              row="chords"
              steps={project.chords.steps.slice(offset, offset + STEPS_PER_BAR).map((b) => (b ? 2 : 0))}
              playStep={playStep - offset}
              onToggle={(i) => {
                ensureAudio();
                toggleChordStep(offset + i);
              }}
              onClear={() => clearRow('chords')}
            />
          )}
          <p className="text-xs text-cream-500 mt-1 shrink-0 sticky left-0 max-w-[calc(100vw-3.5rem)]">
            Click a square to add a hit, again for a <b className="text-cream-300">louder</b> hit, again to remove. Bass cycles{' '}
            <b className="text-cream-300">R</b> root → <b className="text-cream-300">5</b> fifth → <b className="text-cream-300">8</b> octave →
            off. Drop a .wav/.mp3 on a drum name to use your own sound.
          </p>
        </div>
      </div>
    </>
  );
}

function Row(props: {
  row: RowId;
  steps: number[];
  playStep: number;
  label?: (s: number) => string;
  onToggle: (i: number) => void;
  onClear: () => void;
}) {
  const info = ROW_INFO[props.row];
  const [drag, setDrag] = useState(false);
  const isDrum = props.row !== 'bass' && props.row !== 'chords';
  const importFile = useSamples((s) => s.importFile);
  const update = useProject((s) => s.update);

  const assign = async (file: File) => {
    const meta = await importFile(file);
    if (meta && isDrum) update((p) => void (p.drums[props.row as DrumRow].sound = { kind: 'user', id: meta.id, name: meta.name }));
  };

  return (
    <div className="flex items-stretch gap-2 flex-1 min-h-[28px] max-h-[60px]">
      <div
        className={
          'w-48 shrink-0 flex items-center gap-2 rounded-xl px-2 transition ' +
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
        <span className={'w-2.5 h-2.5 rounded-full shrink-0 ' + info.bg} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-bold text-sm leading-tight">{info.label}</span>
          {isDrum ? (
            <RowSettings row={props.row as DrumRow} onPickFile={assign} />
          ) : props.row === 'bass' ? (
            <BassSettings />
          ) : (
            <span className="text-xs text-cream-500">custom rhythm</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-16 gap-1 flex-1" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
        {props.steps.map((s, i) => {
          const isNow = props.playStep === i;
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
                (s ? 'border-transparent ' : beatStart ? 'bg-ink-600 border-ink-600 ' : 'bg-ink-700 border-ink-700 ') +
                (isNow ? 'ring-2 ring-cream-100' : '')
              }
              style={s ? { background: info.color, opacity: props.label ? 0.55 + s * 0.15 : s === 2 ? 1 : 0.6 } : undefined}
            >
              {s > 0 && props.label && <span className="text-xs font-black text-ink-950">{props.label(s)}</span>}
            </button>
          );
        })}
      </div>

      <button className="text-cream-500 hover:text-cream-100 text-xs px-1" onClick={props.onClear} title={`Clear ${info.label}`}>
        ✕
      </button>
    </div>
  );
}

function RowSettings({ row, onPickFile }: { row: DrumRow; onPickFile: (f: File) => void }) {
  const track = useProject((s) => s.project.drums[row]);
  const update = useProject((s) => s.update);
  const samples = useSamples((s) => s.samples);
  const fileRef = useRef<HTMLInputElement>(null);
  const value = track.sound.kind === 'synth' ? 'synth:' + track.sound.id : 'user:' + track.sound.id;

  return (
    <div className="flex items-center gap-1">
      <select
        className="bg-transparent text-xs text-cream-500 hover:text-cream-100 max-w-[92px] truncate focus:outline-none cursor-pointer"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'import') return fileRef.current?.click();
          const [kind, id] = v.split(':');
          update((p) => {
            if (kind === 'synth') p.drums[row].sound = { kind: 'synth', id: id as (typeof SYNTH_KITS)[number] };
            else {
              const meta = samples.find((s) => s.id === id);
              p.drums[row].sound = { kind: 'user', id, name: meta?.name ?? 'Sample' };
            }
          });
        }}
      >
        {SYNTH_KITS.map((k) => (
          <option key={k} value={'synth:' + k}>
            {KIT_LABEL[k]}
          </option>
        ))}
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
      <button
        className={'text-[10px] font-bold px-1 rounded ' + (track.mute ? 'bg-kick text-ink-950' : 'text-cream-500 hover:text-cream-100')}
        onClick={() => update((p) => void (p.drums[row].mute = !p.drums[row].mute))}
        title="Mute"
      >
        M
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={track.volume}
        className="w-12 !h-4"
        title="Volume"
        onChange={(e) => update((p) => void (p.drums[row].volume = Number(e.target.value)), 'vol:' + row)}
      />
    </div>
  );
}

function BassSettings() {
  const bass = useProject((s) => s.project.bass);
  const update = useProject((s) => s.update);
  return (
    <div className="flex items-center gap-1">
      <button
        className={'text-[10px] font-bold px-1 rounded ' + (!bass.enabled ? 'bg-kick text-ink-950' : 'text-cream-500 hover:text-cream-100')}
        onClick={() => update((p) => void (p.bass.enabled = !p.bass.enabled))}
        title="Mute"
      >
        M
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={bass.volume}
        className="w-12 !h-4"
        title="Volume"
        onChange={(e) => update((p) => void (p.bass.volume = Number(e.target.value)), 'vol:bass')}
      />
      <span className="text-xs text-cream-500">follows chords</span>
    </div>
  );
}
