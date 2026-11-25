import { Note } from 'tonal';

const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * A small clickable piano. Highlighted keys are the notes being played;
 * clicking a key toggles it. `lowOct`..`highOct` sets the visible range.
 */
export function MiniKeyboard(props: {
  notes: string[];
  rootPc?: string | null;
  lowOct?: number;
  highOct?: number;
  color?: string;
  onToggle?: (note: string) => void;
  className?: string;
}) {
  const { lowOct = 2, highOct = 4, color = '#8fb3e5' } = props;
  // midi -> the spelling used in the chord (so F# shows as F#, not Gb)
  const on = new Map(props.notes.map((n) => [Note.midi(n), Note.pitchClass(n)]));
  const rootChroma = props.rootPc ? Note.chroma(props.rootPc) : null;
  const start = (lowOct + 1) * 12;
  const end = (highOct + 2) * 12; // include the C above
  const keys = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const whites = keys.filter((m) => !BLACK.has(m % 12));
  const wPct = 100 / whites.length;

  return (
    <div className={'relative select-none ' + (props.className ?? 'h-24')} role="group" aria-label="Chord notes keyboard">
      <div className="flex h-full">
        {whites.map((m) => {
          const name = Note.fromMidi(m);
          const active = on.has(m);
          return (
            <button
              key={m}
              className="relative flex-1 border border-ink-900 rounded-b-md bg-cream-100 hover:bg-cream-300 flex flex-col justify-end items-center pb-1"
              style={active ? { background: color } : undefined}
              onClick={() => props.onToggle?.(name)}
              title={name}
              aria-pressed={active}
              aria-label={name}
            >
              {active ? (
                <span className="text-xs font-extrabold text-ink-950 leading-none">
                  {on.get(m)}
                  {m % 12 === rootChroma && <span className="block text-[8px]">root</span>}
                </span>
              ) : (
                m % 12 === 0 && <span className="text-xs text-ink-600 font-bold">{name}</span>
              )}
            </button>
          );
        })}
      </div>
      {keys
        .filter((m) => BLACK.has(m % 12))
        .map((m) => {
          const whiteIndex = whites.filter((w) => w < m).length;
          const active = on.has(m);
          const name = Note.fromMidi(m);
          return (
            <button
              key={m}
              className="absolute top-0 h-[60%] rounded-b-md bg-ink-950 hover:bg-ink-600 border border-ink-900 z-10 flex items-end justify-center pb-1"
              style={{
                left: `calc(${whiteIndex * wPct}% - ${wPct * 0.3}%)`,
                width: `${wPct * 0.6}%`,
                ...(active ? { background: color } : {}),
              }}
              onClick={() => props.onToggle?.(name)}
              title={name}
              aria-pressed={active}
              aria-label={name}
            >
              {active && <span className="text-xs font-extrabold text-ink-950 leading-none">{on.get(m)}</span>}
            </button>
          );
        })}
    </div>
  );
}
