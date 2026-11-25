import { useRef, useState } from 'react';
import { ensureAudio, previewSample } from '../audio/engine';
import { useProject, useUi, withUndo } from '../state/project';
import { SAMPLE_COLOR, sampleClips } from '../state/tracks';
import { MAX_SAMPLE_SECONDS, STEPS_PER_BAR } from '../state/types';
import { Slider, useSamples } from './common';
import { EditorHeader, ICON_BTN, TOOL_BTN } from './EditorHeader';
import { useSampleBuffer, Wave } from './SampleWave';
import { useAudioFilePicker, useSampleFile } from './SampleImport';
import { Select } from './Select';
import { TipsButton } from './TipsButton';

const b = (t: string) => <b className="text-cream-100">{t}</b>;

/** What's behind the Sample editor's ? button. */
const SAMPLE_TIPS: React.ReactNode[] = [
  <>{b('Drag the edges')} of the highlighted part of the waveform to choose what plays, or drag the middle to move it.</>,
  <>{b('Click a square')} to start the sample there. It plays until its end, the next hit, or the end of the loop.</>,
  <>{b('Pitch')} moves it up or down like a record: higher is also faster and shorter.</>,
  <>Your sample is kept in this browser. Use only sounds you made or royalty-free ones.</>,
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** The Sample editor: which file and how it sounds, the part of it that plays, and where it plays. */
export function SampleEditor() {
  const p = useProject((s) => s.project);
  const sm = p.sample!;
  const viewBar = Math.min(useUi((s) => s.viewBar), p.bars - 1);
  const offset = viewBar * STEPS_PER_BAR;
  const buf = useSampleBuffer(sm.id);
  const { addFile } = useSampleFile();
  const picker = useAudioFilePicker((f) => void addFile(f));

  const copyToAll = () =>
    withUndo(`Copied bar ${viewBar + 1} of the sample into every bar`, () =>
      useProject.getState().update((d) => {
        if (!d.sample) return;
        const src = d.sample.steps.slice(offset, offset + STEPS_PER_BAR);
        for (let bar = 0; bar < d.bars; bar++) for (let i = 0; i < STEPS_PER_BAR; i++) d.sample.steps[bar * STEPS_PER_BAR + i] = src[i];
      }),
    );
  const clear = () => withUndo('Sample hits cleared', () => useProject.getState().update((d) => void (d.sample && (d.sample.steps = d.sample.steps.map(() => false)))));

  return (
    <>
      <EditorHeader sound={<SampleSoundControls onChooseFile={picker.open} />}>
        {p.bars > 1 && (
          <button className={TOOL_BTN} onClick={copyToAll} title="Copy this bar's hits into every other bar">
            ⧉ Copy bar to all
          </button>
        )}
        <button className={TOOL_BTN} onClick={clear} disabled={!sm.steps.some(Boolean)} title="Remove every hit (every bar). The sample itself stays.">
          ✕ Clear sample
        </button>
        <TipsButton title="Using the sample editor" label="Sample editor help" tips={SAMPLE_TIPS} />
      </EditorHeader>
      {picker.input}

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 flex flex-col gap-4">
        {buf === null ? (
          <div className="rounded-xl border border-kick/40 bg-kick/10 p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[14rem]">
              <div className="font-bold">"{sm.name}" isn't saved in this browser</div>
              <div className="text-sm text-cream-500">Choose the file again to hear it. Your hits are kept.</div>
            </div>
            <button className={TOOL_BTN} onClick={picker.open}>
              Choose file…
            </button>
          </div>
        ) : (
          <TrimStrip buf={buf} />
        )}
        <SampleHits bar={viewBar} />
      </div>
    </>
  );
}

/** File, pitch, volume, mute and remove: the Sound box. */
function SampleSoundControls({ onChooseFile }: { onChooseFile: () => void }) {
  const p = useProject((s) => s.project);
  const sm = p.sample!;
  const { update, removeSample } = useProject();
  const set = useUi((s) => s.set);
  const samples = useSamples((s) => s.samples);
  const { addStored } = useSampleFile();
  const edit = (fn: (s: NonNullable<typeof p.sample>) => void, key?: string) => update((d) => void (d.sample && fn(d.sample)), key);

  const items = [
    ...samples.map((s) => ({ value: s.id, label: s.name })),
    ...(samples.some((s) => s.id === sm.id) ? [] : [{ value: sm.id, label: sm.name }]),
    { value: 'choose', label: '＋ Choose another file…' },
  ];

  return (
    <>
      <label className="flex items-center gap-1.5">
        <span className="text-xs font-bold text-cream-500">Sample</span>
        <Select
          size="sm"
          aria-label="Sample file"
          className="max-w-[12rem]"
          value={sm.id}
          items={items}
          onChange={(v) => {
            if (v === 'choose') return onChooseFile();
            const meta = samples.find((s) => s.id === v);
            if (meta) void addStored(meta);
          }}
        />
      </label>
      <div className="flex items-center gap-1" title="Up or down in semitones. Like a record: higher is also faster.">
        <span className="text-xs font-bold text-cream-500">Pitch</span>
        <button className="btn h-7 w-7 p-0 text-xs grid place-items-center" disabled={sm.pitch <= -12} onClick={() => edit((s) => void (s.pitch -= 1), 'sample-pitch')} aria-label="Pitch down">
          −
        </button>
        <span className="text-xs font-bold w-6 text-center">{sm.pitch > 0 ? `+${sm.pitch}` : sm.pitch}</span>
        <button className="btn h-7 w-7 p-0 text-xs grid place-items-center" disabled={sm.pitch >= 12} onClick={() => edit((s) => void (s.pitch += 1), 'sample-pitch')} aria-label="Pitch up">
          +
        </button>
      </div>
      <Slider inline className="w-36" label="Volume" value={sm.volume} color={SAMPLE_COLOR} onChange={(v) => edit((s) => void (s.volume = v), 'vol:sample')} />
      <button
        className={ICON_BTN + ' text-sm ' + (sm.mute ? 'bg-kick text-ink-950 hover:bg-kick' : '')}
        onClick={() => edit((s) => void (s.mute = !s.mute))}
        title={sm.mute ? 'Unmute' : 'Mute'}
        aria-pressed={sm.mute}
      >
        {sm.mute ? '🔇' : '🔈'}
      </button>
      <button
        className={ICON_BTN + ' text-sm'}
        onClick={() => {
          withUndo(`Removed the sample "${sm.name}"`, removeSample);
          set({ track: 'beat' });
        }}
        title="Remove the sample from the song (its hits in every section too)"
        aria-label="Remove sample"
      >
        🗑
      </button>
    </>
  );
}

/**
 * The whole file as a waveform, with the part that plays highlighted. Drag an edge to move it,
 * or the middle to slide the whole part; letting go plays it.
 */
function TrimStrip({ buf }: { buf: AudioBuffer | undefined }) {
  const sm = useProject((s) => s.project.sample!);
  const setSampleTrim = useProject((s) => s.setSampleTrim);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'start' | 'end' | 'move'; x0: number; start: number; length: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dur = buf?.duration ?? Math.max(sm.start + sm.length, 1);
  const left = (sm.start / dur) * 100;
  const width = (Math.min(sm.length, dur - sm.start) / dur) * 100;

  const onDown = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const a = (sm.start / dur) * r.width;
    const z = ((sm.start + sm.length) / dur) * r.width;
    // within 10px of an edge grabs that edge; inside moves; outside jumps the nearer edge there
    const mode = Math.abs(x - a) < 10 ? 'start' : Math.abs(x - z) < 10 ? 'end' : x > a && x < z ? 'move' : x < a ? 'start' : 'end';
    drag.current = { mode, x0: x, start: sm.start, length: sm.length };
    ref.current!.setPointerCapture(e.pointerId);
    setDragging(true);
    onMove(e);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur));
    const end = d.start + d.length;
    if (d.mode === 'start') {
      const start = Math.max(0, Math.max(end - MAX_SAMPLE_SECONDS, Math.min(t, end - 0.05)));
      setSampleTrim(start, end - start);
    } else if (d.mode === 'end') {
      const stop = Math.min(dur, d.start + MAX_SAMPLE_SECONDS, Math.max(t, d.start + 0.05));
      setSampleTrim(d.start, stop - d.start);
    } else {
      const shift = (((e.clientX - r.left) - d.x0) / r.width) * dur;
      setSampleTrim(Math.max(0, Math.min(dur - d.length, d.start + shift)), d.length);
    }
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    void previewSample(); // hear the new part
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5">
        <span className="label">Trim</span>
        <span className="text-xs text-cream-500">
          Start <b className="text-cream-100">{fmt(sm.start)}</b> · Length <b className="text-cream-100">{sm.length.toFixed(1)} s</b>
          {buf && <> · of {fmt(buf.duration)}</>}
        </span>
        <button
          className={TOOL_BTN + ' ml-auto'}
          onClick={() => {
            ensureAudio();
            void previewSample();
          }}
        >
          ▶ Preview
        </button>
      </div>
      <div
        ref={ref}
        className={'relative h-20 rounded-xl bg-ink-900 overflow-hidden touch-none select-none ' + (dragging ? 'cursor-grabbing' : 'cursor-pointer')}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="group"
        aria-label={`Trim: from ${fmt(sm.start)} for ${sm.length.toFixed(1)} seconds`}
      >
        {buf ? <Wave buf={buf} bars={240} color="#a8998a" className="absolute inset-0 w-full h-full" /> : <div className="absolute inset-0 grid place-items-center text-xs text-cream-500">Loading…</div>}
        {/* the part that doesn't play is dimmed; the part that does is tinted, with an edge handle each side */}
        <div className="absolute inset-y-0 left-0 bg-ink-950/70 pointer-events-none" style={{ width: `${left}%` }} />
        <div className="absolute inset-y-0 right-0 bg-ink-950/70 pointer-events-none" style={{ left: `${left + width}%` }} />
        <div
          className="absolute inset-y-0 pointer-events-none border-x-[3px] cursor-grab"
          style={{ left: `${left}%`, width: `${width}%`, borderColor: SAMPLE_COLOR, background: SAMPLE_COLOR + '26' }}
        />
      </div>
    </div>
  );
}

/** One bar of hits: click a square to start the sample there; the tinted squares after a hit show how long it plays. */
function SampleHits({ bar }: { bar: number }) {
  const p = useProject((s) => s.project);
  const toggle = useProject((s) => s.toggleSampleStep);
  const playStep = useUi((s) => s.step);
  const offset = bar * STEPS_PER_BAR;
  const sm = p.sample!;
  // steps of this bar the sample is sounding in (after each hit)
  const ringing = new Set<number>();
  for (const c of sampleClips(p)) for (let i = c.s + 1; i < c.s + c.l; i++) ringing.add(i);
  const local = playStep - offset;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="label">Bar {bar + 1} · hits</span>
        <span className="text-xs text-cream-500">Pick the bar to edit in the overview above.</span>
      </div>
      <div className="relative">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${STEPS_PER_BAR}, minmax(0, 1fr))` }}>
          {Array.from({ length: STEPS_PER_BAR }, (_, k) => {
            const i = offset + k;
            const on = sm.steps[i];
            return (
              <button
                key={i}
                onClick={() => {
                  ensureAudio();
                  toggle(i);
                }}
                aria-label={`Sample hit, bar ${bar + 1} step ${k + 1}${on ? ' on' : ''}`}
                aria-pressed={on}
                className={'cell h-12 rounded-md ' + (on ? '' : ringing.has(i) ? '' : k % 4 === 0 ? 'bg-ink-600' : 'bg-ink-700')}
                style={on ? { background: SAMPLE_COLOR } : ringing.has(i) ? { background: SAMPLE_COLOR + '40' } : undefined}
              />
            );
          })}
        </div>
        {local >= 0 && local < STEPS_PER_BAR && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 w-0.5 -ml-px rounded-full bg-cream-100 shadow-[0_0_8px_rgba(243,233,220,0.8)]"
            style={{ left: `calc((100% - 60px) * ${(local + 0.5) / STEPS_PER_BAR} + ${local * 4}px)` }}
          />
        )}
      </div>
    </div>
  );
}
