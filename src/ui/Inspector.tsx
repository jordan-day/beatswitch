import { keyLabel, MOOD_INFO, TONICS } from '../music/chords';
import { useProject, useUi } from '../state/project';
import {
  BASS_SOUNDS,
  DRUM_ROWS,
  FULL_KITS,
  KEYS_SOUNDS,
  MELODY_SOUNDS,
  MOODS,
  type BassSound,
  type KeysSound,
  type MelodySound,
  type SynthKit,
} from '../state/types';
import { Slider } from './common';
import { LofiPanel } from './LofiPanel';

// "🎙" marks recorded (real) instruments; the rest are synthesized.
export const KEYS_LABEL: Record<KeysSound, string> = {
  rhodes: '🎹 Electric piano',
  piano: '🎙 Upright piano',
  vibes: '🎙 Vibraphone',
  kalimba: '🎙 Kalimba',
  pad: '☁️ Soft pad',
  musicbox: '🎐 Music box',
};
const MELODY_LABEL: Record<MelodySound, string> = {
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

function Group(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-ink-600/60 pt-3 first:border-0 first:pt-0">
      <h3 className="label">{props.title}</h3>
      {props.children}
    </div>
  );
}

/** Right-hand settings column: song-wide settings, the open part's sound settings, and the lo-fi knob. */
export function Inspector() {
  const p = useProject((s) => s.project);
  const { update, setKeyMood } = useProject();
  const track = useUi((s) => s.track);

  return (
    <aside className="card p-4 flex flex-col gap-4 lg:overflow-y-auto min-h-0" aria-label="Settings">
      <Group title="Key & mood">
        <div className="grid grid-cols-2 gap-1">
          {MOODS.map((m) => (
            <button
              key={m}
              className={'chip text-xs px-2 ' + (p.mood === m ? 'chip-on' : '')}
              onClick={() => setKeyMood(p.tonic, m)}
              title={MOOD_INFO[m].blurb}
            >
              {MOOD_INFO[m].emoji} {MOOD_INFO[m].label}
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-2" title="How high or low the whole song sits. Any key sounds fine!">
          <span className="text-sm font-bold">Key</span>
          <select className="select" value={p.tonic} onChange={(e) => setKeyMood(e.target.value, p.mood)}>
            {TONICS.map((t) => (
              <option key={t} value={t}>
                {keyLabel(t, p.mood)}
              </option>
            ))}
          </select>
        </label>
      </Group>

      {track === 'beat' && (
        <Group title="Beat sounds">
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">Drum kit</span>
            <select
              className="select"
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
              title="Switch every built-in drum at once (each row can also be changed on its own)"
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
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">Bass sound</span>
            <select className="select" value={p.bass.sound} onChange={(e) => update((d) => void (d.bass.sound = e.target.value as BassSound))}>
              {BASS_SOUNDS.map((s) => (
                <option key={s} value={s}>
                  {BASS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Slider
              className="flex-1"
              label="Bass volume"
              value={p.bass.volume}
              color="#e58fae"
              onChange={(v) => update((d) => void (d.bass.volume = v), 'vol:bass')}
            />
            <MuteButton muted={!p.bass.enabled} onClick={() => update((d) => void (d.bass.enabled = !d.bass.enabled))} />
          </div>
        </Group>
      )}

      {track === 'chords' && (
        <Group title="Chord sound">
          <select className="select" value={p.chords.sound} onChange={(e) => update((d) => void (d.chords.sound = e.target.value as KeysSound))}>
            {KEYS_SOUNDS.map((k) => (
              <option key={k} value={k}>
                {KEYS_LABEL[k]}
              </option>
            ))}
          </select>
          <Slider label="Volume" value={p.chords.volume} color="#8fb3e5" onChange={(v) => update((d) => void (d.chords.volume = v), 'vol:chords')} />
        </Group>
      )}

      {track === 'melody' && (
        <Group title="Melody sound">
          <select className="select" value={p.melody.sound} onChange={(e) => update((d) => void (d.melody.sound = e.target.value as MelodySound))}>
            {MELODY_SOUNDS.map((s) => (
              <option key={s} value={s}>
                {MELODY_LABEL[s]}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between" title="Move the whole melody up or down an octave">
            <span className="text-sm font-bold">Octave</span>
            <div className="flex items-center gap-1">
              <button className="btn px-2.5 py-1" disabled={p.melody.octave <= 3} onClick={() => update((d) => void (d.melody.octave -= 1))}>
                −
              </button>
              <span className="text-sm font-bold w-6 text-center">{p.melody.octave}</span>
              <button className="btn px-2.5 py-1" disabled={p.melody.octave >= 5} onClick={() => update((d) => void (d.melody.octave += 1))}>
                +
              </button>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Slider
              className="flex-1"
              label="Volume"
              value={p.melody.volume}
              color="#f2a65a"
              onChange={(v) => update((d) => void (d.melody.volume = v), 'vol:melody')}
            />
            <MuteButton muted={p.melody.mute} onClick={() => update((d) => void (d.melody.mute = !d.melody.mute))} />
          </div>
        </Group>
      )}

      <Group title="Vibe">
        <LofiPanel />
      </Group>
    </aside>
  );
}

function MuteButton(props: { muted: boolean; onClick: () => void }) {
  return (
    <button
      className={'btn px-2 py-1 text-xs ' + (props.muted ? 'bg-kick text-ink-950 hover:bg-kick' : '')}
      onClick={props.onClick}
      title={props.muted ? 'Unmute' : 'Mute'}
      aria-pressed={props.muted}
    >
      {props.muted ? '🔇' : '🔈'}
    </button>
  );
}
