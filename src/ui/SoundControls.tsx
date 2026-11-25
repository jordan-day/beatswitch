import { previewBass, previewChordSound, previewKit, previewMelody } from '../audio/engine';
import { useProject, useUi } from '../state/project';
import { MAIN_MELODY, melodyColor, melodyName, melodyTrack } from '../state/tracks';
import {
  BASS_SOUNDS,
  DRUM_ROWS,
  FULL_KITS,
  KEYS_SOUNDS,
  MELODY_SOUNDS,
  type BassSound,
  type KeysSound,
  type MelodySound,
  type SynthKit,
} from '../state/types';
import { Slider } from './common';
import { ICON_BTN } from './EditorHeader';
import { Select } from './Select';
import { ToneButton } from './ToneButton';

export const KEYS_LABEL: Record<KeysSound, string> = {
  rhodes: 'Electric piano',
  piano: 'Upright piano',
  vibes: 'Vibraphone',
  kalimba: 'Kalimba',
  pad: 'Soft pad',
  musicbox: 'Music box',
};
export const MELODY_LABEL: Record<MelodySound, string> = {
  musicbox: 'Music box',
  kalimba: 'Kalimba',
  glock: 'Glockenspiel',
  vibes: 'Vibraphone',
  piano: 'Upright piano',
  ocarina: 'Ocarina',
  rhodes: 'Electric piano',
  flute: 'Soft flute',
  lead: 'Retro lead',
};
const BASS_LABEL: Record<BassSound, string> = { round: 'Round', sub: 'Deep sub', pluck: 'Plucky' };
export const KIT_LABEL: Record<(typeof FULL_KITS)[number], string> = { acoustic: 'Acoustic', dusty: 'Dusty (synth)', soft: 'Soft (synth)' };

/** A record of labels as dropdown options, in the given order. */
const opts = <K extends string>(keys: readonly K[], labels: Record<K, string>) => keys.map((k) => ({ value: k, label: labels[k] }));

function Field(props: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <label className="flex items-center gap-1.5" title={props.title}>
      <span className="text-xs font-bold text-cream-500">{props.label}</span>
      {props.children}
    </label>
  );
}

/** Beat editor: drum kit and bass sound. (Each row's own volume and sound are in the grid.) */
export function BeatSoundControls() {
  const p = useProject((s) => s.project);
  const update = useProject((s) => s.update);
  return (
    <>
      <Field label="Drum kit" title="Switch every built-in drum at once (each row can also be changed on its own)">
        <Select
          size="sm"
          aria-label="Drum kit"
          placeholder="Mixed"
          value={
            DRUM_ROWS.every((r) => p.drums[r].sound.kind === 'synth' && p.drums[r].sound.id === p.drums.kick.sound.id) &&
            (FULL_KITS as readonly string[]).includes(p.drums.kick.sound.id)
              ? p.drums.kick.sound.id
              : ''
          }
          items={opts(FULL_KITS, KIT_LABEL)}
          onChange={(v) => {
            update((d) => {
              // only swaps built-in rows; imported samples stay put
              for (const r of DRUM_ROWS) if (d.drums[r].sound.kind === 'synth') d.drums[r].sound = { kind: 'synth', id: v as SynthKit };
            });
            void previewKit();
          }}
        />
      </Field>
      {/* bass mute and volume are on the Bass row in the grid, like every other row */}
      <Field label="Bass sound">
        <Select
          size="sm"
          aria-label="Bass sound"
          value={p.bass.sound}
          items={opts(BASS_SOUNDS, BASS_LABEL)}
          onChange={(v) => {
            update((d) => void (d.bass.sound = v as BassSound));
            void previewBass();
          }}
        />
      </Field>
    </>
  );
}

/** Chords editor: the chord instrument and its volume. */
export function ChordSoundControls() {
  const p = useProject((s) => s.project);
  const update = useProject((s) => s.update);
  return (
    <>
      <Field label="Chord sound">
        <Select
          size="sm"
          aria-label="Chord sound"
          value={p.chords.sound}
          items={opts(KEYS_SOUNDS, KEYS_LABEL)}
          onChange={(v) => {
            update((d) => void (d.chords.sound = v as KeysSound));
            void previewChordSound();
          }}
        />
      </Field>
      <Slider inline className="w-36" label="Volume" value={p.chords.volume} color="#8fb3e5" onChange={(v) => update((d) => void (d.chords.volume = v), 'vol:chords')} />
    </>
  );
}

/** Melody editor: sound, octave and volume of the melody being edited. */
export function MelodySoundControls() {
  const p = useProject((s) => s.project);
  const update = useProject((s) => s.update);
  // the melody being edited (the first one if the picked one was removed)
  const pickedMelody = useUi((s) => s.melodyId);
  const melodyId = melodyTrack(p, pickedMelody) ? pickedMelody : MAIN_MELODY;
  const mel = melodyTrack(p, melodyId)!;
  const editMelody = (fn: (m: NonNullable<ReturnType<typeof melodyTrack>>) => void, key?: string) =>
    update((d) => {
      const m = melodyTrack(d, melodyId);
      if (m) fn(m);
    }, key);
  return (
    <>
      <Field label={p.extraMelodies.length ? `${melodyName(p, melodyId)} sound` : 'Melody sound'}>
        <Select
          size="sm"
          aria-label="Melody sound"
          value={mel.sound}
          items={opts(MELODY_SOUNDS, MELODY_LABEL)}
          onChange={(v) => {
            // a new instrument starts from its own natural sound, so shaping set for the old one is dropped
            editMelody((m) => {
              m.sound = v as MelodySound;
              delete m.tone;
            });
            void previewMelody(melodyId);
          }}
        />
      </Field>
      <div className="flex items-center gap-1" title="Move the whole melody up or down an octave">
        <span className="text-xs font-bold text-cream-500">Octave</span>
        <button className="btn h-7 w-7 p-0 text-xs grid place-items-center" disabled={mel.octave <= 3} onClick={() => {
            editMelody((m) => void (m.octave -= 1));
            void previewMelody(melodyId);
          }} aria-label="Octave down">
          −
        </button>
        <span className="text-xs font-bold w-4 text-center">{mel.octave}</span>
        <button className="btn h-7 w-7 p-0 text-xs grid place-items-center" disabled={mel.octave >= 5} onClick={() => {
            editMelody((m) => void (m.octave += 1));
            void previewMelody(melodyId);
          }} aria-label="Octave up">
          +
        </button>
      </div>
      <Slider
        inline
        className="w-36"
        label="Volume"
        value={mel.volume}
        color={melodyColor(p, melodyId)}
        onChange={(v) => editMelody((m) => void (m.volume = v), 'vol:melody:' + melodyId)}
      />
      <button
        className={ICON_BTN + ' text-sm ' + (mel.mute ? 'bg-kick text-ink-950 hover:bg-kick' : '')}
        onClick={() => editMelody((m) => void (m.mute = !m.mute))}
        title={mel.mute ? 'Unmute' : 'Mute'}
        aria-pressed={mel.mute}
      >
        {mel.mute ? '🔇' : '🔈'}
      </button>
      <ToneButton melodyId={melodyId} instrument={MELODY_LABEL[mel.sound]} />
    </>
  );
}
