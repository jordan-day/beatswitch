import { useEffect, useMemo, useState } from 'react';
import { previewDraftChords, previewDraftDemo, previewDraftKit, restoreAudio, stop } from '../audio/engine';
import { keyLabel, MOOD_INFO, PROGRESSIONS, progressionChords, TONICS } from '../music/chords';
import { lofiMacro } from '../music/patterns';
import { emptyProject } from '../music/presets';
import { BPM_MAX, BPM_MIN, DRUM_ROWS, FULL_KITS, KEYS_SOUNDS, MOODS, type KeysSound, type Mood, type Project, type SynthKit } from '../state/types';
import { Slider } from './common';
import { describeLofi } from './LofiPanel';
import { Select } from './Select';
import { KEYS_LABEL, KIT_LABEL } from './SoundControls';

/** Mood-flavoured defaults, so picking a mood already moves tempo, swing and vibe toward it. */
const MOOD_DEFAULTS: Record<Mood, { bpm: number; swing: number; lofi: number; keys: KeysSound }> = {
  chill: { bpm: 82, swing: 35, lofi: 0.45, keys: 'rhodes' },
  dreamy: { bpm: 76, swing: 30, lofi: 0.55, keys: 'pad' },
  sad: { bpm: 72, swing: 40, lofi: 0.6, keys: 'piano' },
  jazzy: { bpm: 88, swing: 50, lofi: 0.35, keys: 'rhodes' },
};

const STEPS = ['Name', 'Mood & key', 'Chords', 'Vibe', 'Sounds'] as const;

const choice = (on: boolean) =>
  'rounded-xl border-2 px-3 py-2 text-left transition ' + (on ? 'border-cream-100 bg-ink-600' : 'border-ink-600 bg-ink-900/60 hover:bg-ink-700');

function Heading(props: { title: string; hint: string }) {
  return (
    <div>
      <h3 className="text-lg font-extrabold">{props.title}</h3>
      <p className="text-sm text-cream-500">{props.hint}</p>
    </div>
  );
}

interface Settings {
  name: string;
  mood: Mood;
  tonic: string;
  progression: number;
  withChords: boolean;
  bpm: number;
  swing: number;
  lofi: number;
  keys: KeysSound;
  kit: SynthKit;
}

const chordsFor = (c: Settings) => progressionChords(c.tonic, PROGRESSIONS[c.mood][c.progression] ?? PROGRESSIONS[c.mood][0]);

/** The beat these settings describe. `withChords: true` fills in the progression (for previews, even when starting empty). */
function buildProject(c: Settings, withChords: boolean): Project {
  const p = emptyProject(withChords);
  p.name = c.name.trim().slice(0, 60) || 'Untitled beat';
  p.tonic = c.tonic;
  p.mood = c.mood;
  p.bpm = c.bpm;
  p.swing = c.swing;
  p.fx = { lofi: c.lofi, ...lofiMacro(c.lofi) };
  p.chords.sound = c.keys;
  for (const r of DRUM_ROWS) p.drums[r].sound = { kind: 'synth', id: c.kit };
  if (withChords) p.chords.slots = chordsFor(c).map((symbol) => ({ symbol }));
  return p;
}

/**
 * "New beat" wizard: a few short pages to set what the song should feel like (mood, key, chords,
 * vibe, sounds) before starting. Back goes to any earlier page; page one can skip it all.
 */
export function NewBeatDialog({ onCreate, onClose }: { onCreate: (p: Project) => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState<Settings>({
    name: 'Untitled beat',
    mood: 'chill',
    tonic: 'F',
    progression: 0,
    withChords: true,
    ...MOOD_DEFAULTS.chill,
    kit: 'dusty',
  });
  const { name, mood, tonic, progression, withChords, bpm, swing, lofi, keys, kit } = cfg;

  // while the wizard is open the open beat stays quiet; its sounds come back when the wizard closes
  useEffect(() => {
    stop();
    return restoreAudio;
  }, []);

  /** Change settings and, when asked, play what they sound like (using the new values, not the stale ones). */
  const change = (patch: Partial<Settings>, hear?: 'chords' | 'kit' | 'demo') => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    if (!hear) return;
    const draft = buildProject(next, true);
    void (hear === 'chords' ? previewDraftChords(draft) : hear === 'kit' ? previewDraftKit(draft) : previewDraftDemo(draft));
  };

  const pickMood = (m: Mood) => change({ mood: m, progression: 0, ...MOOD_DEFAULTS[m] }, 'chords');
  const chords = useMemo(() => chordsFor(cfg), [cfg]);
  const cleanName = name.trim().slice(0, 60) || 'Untitled beat';

  const create = () => onCreate(buildProject(cfg, withChords));

  /** Skip the wizard: a completely empty beat with the default feel. */
  const skip = () => {
    const p = emptyProject(false);
    p.name = cleanName;
    onCreate(p);
  };

  const last = step === STEPS.length - 1;
  const next = () => (last ? create() : setStep(step + 1));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-beat-title"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="card max-w-xl w-full max-h-[92vh] flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        {/* header: title + where you are */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="new-beat-title" className="text-xl font-extrabold">
              ✨ New beat
            </h2>
            <p className="text-xs text-cream-500">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </p>
          </div>
          <button className="text-cream-500 hover:text-cream-100 px-2 text-lg leading-none" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="Progress">
          {STEPS.map((s, i) => (
            <button
              key={s}
              className={'h-1.5 flex-1 rounded-full transition ' + (i <= step ? 'bg-kick' : 'bg-ink-600 hover:bg-ink-500')}
              onClick={() => i < step && setStep(i)}
              disabled={i >= step}
              aria-label={i < step ? `Back to ${s}` : s}
              title={i < step ? `Back to ${s}` : s}
            />
          ))}
        </div>

        {/* the page */}
        <div className="flex flex-col gap-4 overflow-y-auto min-h-[19rem] px-0.5 py-1">
          {step === 0 && (
            <>
              <Heading title="What's your beat called?" hint="A few quick choices will set how it feels. You can change everything later." />
              <input
                className="select w-full text-lg font-bold"
                value={name}
                maxLength={60}
                onChange={(e) => change({ name: e.target.value })}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => e.key === 'Enter' && next()}
                aria-label="Beat name"
                autoFocus
              />
              <div className="rounded-xl border border-ink-600 bg-ink-900/50 p-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[12rem]">
                  <div className="font-bold">In a hurry?</div>
                  <div className="text-xs text-cream-500">Skip the questions and start with a completely empty beat.</div>
                </div>
                <button className="btn" onClick={skip}>
                  Skip &amp; create empty beat
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Heading title="How should it feel?" hint="The mood sets the colour of the chords, and nudges tempo and vibe." />
              <div className="grid grid-cols-2 gap-2">
                {MOODS.map((m) => (
                  <button key={m} className={choice(mood === m)} onClick={() => pickMood(m)} aria-pressed={mood === m}>
                    <div className="font-extrabold">
                      {MOOD_INFO[m].emoji} {MOOD_INFO[m].label}
                    </div>
                    <div className="text-xs text-cream-500">{MOOD_INFO[m].blurb}</div>
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-3" title="How high or low the song sits. Any key sounds fine!">
                <span>
                  <span className="font-bold">Key</span>
                  <span className="block text-xs text-cream-500">How high or low it sits. Any key sounds fine!</span>
                </span>
                <Select
                  aria-label="Key"
                  value={tonic}
                  items={TONICS.map((t) => ({ value: t, label: keyLabel(t, mood) }))}
                  onChange={(v) => change({ tonic: v }, 'chords')}
                />
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <Heading title="Start with some chords?" hint="Chords are the backbone. Pick a ready-made progression, or start from nothing." />
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Start with">
                <button role="radio" aria-checked={withChords} className={choice(withChords)} onClick={() => change({ withChords: true }, 'chords')}>
                  <div className="font-extrabold">🎹 A progression</div>
                  <div className="text-xs text-cream-500">Chords ready to build on</div>
                </button>
                <button role="radio" aria-checked={!withChords} className={choice(!withChords)} onClick={() => change({ withChords: false })}>
                  <div className="font-extrabold">⬜ Nothing</div>
                  <div className="text-xs text-cream-500">Pick every chord yourself</div>
                </button>
              </div>
              {withChords && (
                <div className="flex flex-col gap-2">
                  {PROGRESSIONS[mood].map((pr, i) => (
                    <button key={pr.name} className={choice(progression === i)} onClick={() => change({ progression: i }, 'chords')} aria-pressed={progression === i}>
                      <div className="text-sm font-extrabold">{pr.name}</div>
                      <div className="text-xs text-cream-500">{progressionChords(tonic, pr).join(' · ')}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Heading title="Set the vibe" hint="How worn-out, how fast and how lazy it should sound." />
              {/* sliders play a short demo when you let go of them */}
              <div
                className="flex flex-col gap-4"
                onPointerUp={() => change({}, 'demo')}
                onKeyUp={(e) => e.key.startsWith('Arrow') && change({}, 'demo')}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between">
                    <span className="font-extrabold">📼 Lo-fi-ness</span>
                    <span className="text-xs font-bold text-snare">{describeLofi(lofi)}</span>
                  </div>
                  <input type="range" className="big w-full" min={0} max={1} step={0.01} value={lofi} onChange={(e) => change({ lofi: Number(e.target.value) })} aria-label="Lo-fi-ness" />
                  <div className="flex justify-between text-xs text-cream-500">
                    <span>Clean</span>
                    <span>Dusty</span>
                  </div>
                </div>
                <Slider label="Tempo" display={`${bpm} BPM`} min={BPM_MIN} max={BPM_MAX} step={1} value={bpm} hint="Lo-fi usually sits between 70 and 90." onChange={(v) => change({ bpm: v })} />
                <Slider label="Swing" display={`${Math.round(swing)}%`} min={0} max={100} step={1} value={swing} hint="Makes the beat lazy and bouncy instead of robotic." onChange={(v) => change({ swing: v })} />
              </div>
              <button className="btn self-start" onClick={() => change({}, 'demo')}>
                ▶ Hear it
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <Heading title="Pick your sounds" hint="The chord instrument and the drum kit. You can swap them any time." />
              <label className="flex items-center justify-between gap-3">
                <span className="font-bold">Chord sound</span>
                <Select
                  aria-label="Chord sound"
                  value={keys}
                  items={KEYS_SOUNDS.map((k) => ({ value: k, label: KEYS_LABEL[k] }))}
                  onChange={(v) => change({ keys: v as KeysSound }, 'chords')}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="font-bold">Drum kit</span>
                <Select
                  aria-label="Drum kit"
                  value={kit}
                  items={FULL_KITS.map((k) => ({ value: k, label: KIT_LABEL[k] }))}
                  onChange={(v) => change({ kit: v as SynthKit }, 'kit')}
                />
              </label>
              <button className="btn self-start" onClick={() => change({}, 'demo')}>
                ▶ Hear it
              </button>
              <div className="rounded-xl border border-ink-600 bg-ink-900/50 p-3 text-sm">
                <div className="label mb-1">Your beat</div>
                <div className="font-extrabold">{cleanName}</div>
                <div className="text-cream-300">
                  {MOOD_INFO[mood].emoji} {MOOD_INFO[mood].label} · {keyLabel(tonic, mood)} · {bpm} BPM · {describeLofi(lofi)}
                </div>
                <div className="text-xs text-cream-500">{withChords ? chords.join(' · ') : 'Starting with no chords'}</div>
              </div>
            </>
          )}
        </div>

        {/* navigation */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {step > 0 ? (
            <button className="btn" onClick={() => setStep(step - 1)}>
              ← Back
            </button>
          ) : (
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
          )}
          <button className="btn-primary" onClick={next}>
            {last ? 'Create beat ✨' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
