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

// "🎙" marks recorded (real) instruments; the rest are synthesized.
export const KEYS_LABEL: Record<KeysSound, string> = {
  rhodes: '🎹 Electric piano',
  piano: '🎙 Upright piano',
  vibes: '🎙 Vibraphone',
  kalimba: '🎙 Kalimba',
  pad: '☁️ Soft pad',
  musicbox: '🎐 Music box',
};
export const MELODY_LABEL: Record<MelodySound, string> = {
  musicbox: '🎐 Music box',
  kalimba: '🎙 Kalimba',
  glock: '🎙 Glockenspiel',
  vibes: '🎙 Vibraphone',
  piano: '🎙 Upright piano',
  ocarina: '🎙 Ocarina',
  rhodes: '🎹 Electric piano',
  flute: '🪈 Soft flute',
  lead: '📻 Retro lead',
};
const BASS_LABEL: Record<BassSound, string> = { round: 'Round', sub: 'Deep sub', pluck: 'Plucky' };
const KIT_LABEL: Record<(typeof FULL_KITS)[number], string> = { acoustic: '🎙 Acoustic', dusty: 'Dusty (synth)', soft: 'Soft (synth)' };

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
        <select
          className="select text-xs py-1"
          value={
            DRUM_ROWS.every((r) => p.drums[r].sound.kind === 'synth' && p.drums[r].sound.id === p.drums.kick.sound.id) &&
            (FULL_KITS as readonly string[]).includes(p.drums.kick.sound.id)
              ? p.drums.kick.sound.id
              : ''
          }
          onChange={(e) =>
            update((d) => {
              // only swaps built-in rows; imported samples stay put
              for (const r of DRUM_ROWS) if (d.drums[r].sound.kind === 'synth') d.drums[r].sound = { kind: 'synth', id: e.target.value as SynthKit };
            })
          }
        >
          <option value="" disabled>
            Mixed
          </option>
          {FULL_KITS.map((k) => (
            <option key={k} value={k}>
              {KIT_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      {/* bass mute and volume are on the Bass row in the grid, like every other row */}
      <Field label="Bass sound">
        <select className="select text-xs py-1" value={p.bass.sound} onChange={(e) => update((d) => void (d.bass.sound = e.target.value as BassSound))}>
          {BASS_SOUNDS.map((s) => (
            <option key={s} value={s}>
              {BASS_LABEL[s]}
            </option>
          ))}
        </select>
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
        <select className="select text-xs py-1" value={p.chords.sound} onChange={(e) => update((d) => void (d.chords.sound = e.target.value as KeysSound))}>
          {KEYS_SOUNDS.map((k) => (
            <option key={k} value={k}>
              {KEYS_LABEL[k]}
            </option>
          ))}
        </select>
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
        <select className="select text-xs py-1" value={mel.sound} onChange={(e) => editMelody((m) => void (m.sound = e.target.value as MelodySound))}>
          {MELODY_SOUNDS.map((s) => (
            <option key={s} value={s}>
              {MELODY_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex items-center gap-1" title="Move the whole melody up or down an octave">
        <span className="text-xs font-bold text-cream-500">Octave</span>
        <button className="btn px-2 py-0.5 text-xs" disabled={mel.octave <= 3} onClick={() => editMelody((m) => void (m.octave -= 1))} aria-label="Octave down">
          −
        </button>
        <span className="text-xs font-bold w-4 text-center">{mel.octave}</span>
        <button className="btn px-2 py-0.5 text-xs" disabled={mel.octave >= 5} onClick={() => editMelody((m) => void (m.octave += 1))} aria-label="Octave up">
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
        className={'btn px-2 py-1 text-xs ' + (mel.mute ? 'bg-kick text-ink-950 hover:bg-kick' : '')}
        onClick={() => editMelody((m) => void (m.mute = !m.mute))}
        title={mel.mute ? 'Unmute' : 'Mute'}
        aria-pressed={mel.mute}
      >
        {mel.mute ? '🔇' : '🔈'}
      </button>
    </>
  );
}
