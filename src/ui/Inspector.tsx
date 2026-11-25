import { useEffect, useRef, useState } from 'react';
import { keyLabel, MOOD_INFO, TONICS } from '../music/chords';
import { previewKey } from '../audio/engine';
import { useProject } from '../state/project';
import { MOODS } from '../state/types';
import { LofiPanel } from './LofiPanel';
import { Select } from './Select';

function Group(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-ink-600/60 pt-3 first:border-0 first:pt-0">
      <h3 className="label">{props.title}</h3>
      {props.children}
    </div>
  );
}

/** The song-wide settings: key, mood and lo-fi. (Each part's sounds live in its own editor tab.) */
function SettingsContent() {
  const p = useProject((s) => s.project);
  const { setKeyMood, setFade } = useProject();

  return (
    <div className="flex flex-col gap-4">
      <Group title="Key & mood">
        <div className="grid grid-cols-2 gap-1">
          {MOODS.map((m) => (
            <button
              key={m}
              className={'chip text-xs px-2 ' + (p.mood === m ? 'chip-on' : '')}
              onClick={() => {
                setKeyMood(p.tonic, m);
                void previewKey();
              }}
              title={MOOD_INFO[m].blurb}
            >
              {MOOD_INFO[m].emoji} {MOOD_INFO[m].label}
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-2" title="How high or low the whole song sits. Any key sounds fine!">
          <span className="text-sm font-bold">Key</span>
          <Select
            aria-label="Key"
            value={p.tonic}
            items={TONICS.map((t) => ({ value: t, label: keyLabel(t, p.mood) }))}
            onChange={(v) => {
              setKeyMood(v, p.mood);
              void previewKey();
            }}
          />
        </label>
      </Group>

      <Group title="Vibe">
        <LofiPanel />
      </Group>

      <Group title="Song">
        <div className="grid grid-cols-2 gap-1">
          <button
            className={'chip text-xs px-2 ' + (p.fadeIn ? 'chip-on' : '')}
            onClick={() => setFade('fadeIn', !p.fadeIn)}
            aria-pressed={p.fadeIn}
            title="The whole song fades in over its first 2 bars"
          >
            {p.fadeIn ? '✓ ' : ''}Fade in
          </button>
          <button
            className={'chip text-xs px-2 ' + (p.fadeOut ? 'chip-on' : '')}
            onClick={() => setFade('fadeOut', !p.fadeOut)}
            aria-pressed={p.fadeOut}
            title="The whole song fades out over its last 4 bars"
          >
            {p.fadeOut ? '✓ ' : ''}Fade out
          </button>
        </div>
      </Group>
    </div>
  );
}

/** Header button + dropdown panel holding the song-wide settings. */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button className={'btn w-9 h-9 rounded-full p-0 ' + (open ? 'bg-ink-600' : '')} onClick={() => setOpen(!open)} aria-label="Song settings" aria-expanded={open} aria-haspopup="dialog" title="Song settings: key, mood and lo-fi">
        ⚙
      </button>
      {open && (
        <div role="dialog" aria-label="Song settings" className="absolute right-0 top-full mt-2 z-40 card !bg-ink-800 w-[19rem] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-6rem)] overflow-y-auto shadow-2xl">
          <SettingsContent />
        </div>
      )}
    </div>
  );
}
