import { useState } from 'react';
import { cutPreviews, previewDraftDemo, restoreAudio } from '../audio/engine';
import { buildPreset } from '../music/presets';

/** Three steps, from nothing to a whole song. */
const STEPS: { icon: string; title: string; text: string }[] = [
  { icon: '🌙', title: 'Pick a vibe', text: 'Chill, dreamy, sad or jazzy.' },
  { icon: '🥁', title: 'Make a loop', text: 'Tap a beat, pick chords, roll a melody.' },
  { icon: '🎼', title: 'Get a whole song', text: 'Intro, breakdown and outro, made for you.' },
];

/** A small picture of the app: a play button, a drum pad, chords and a melody line. */
function MiniApp() {
  const rows: [string, number[]][] = [
    ['#e8916b', [0, 7, 10]],
    ['#e6c27a', [4, 12]],
    ['#9ccf9a', [0, 2, 4, 6, 8, 10, 11, 12, 14]],
    ['#e58fae', [0, 10]],
  ];
  const melody = [[2, 10, 40], [14, 7, 26], [24, 10, 14], [36, 14, 30], [53, 9, 20], [65, 12, 34], [80, 14, 22]];
  return (
    <div className="rounded-3xl bg-ink-800 border-2 border-ink-600 p-4 shadow-[0_20px_40px_rgba(0,0,0,0.45)] -rotate-2" aria-hidden="true">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-full bg-kick grid place-items-center text-ink-950 text-lg">▶</div>
        <div>
          <div className="font-extrabold leading-tight">Rainy Window</div>
          <div className="text-xs text-cream-500">72 BPM · chill</div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {rows.map(([color, on], r) => (
          <div key={r} className="grid gap-1" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className={'h-3.5 rounded-[3px] ' + (on.includes(i) ? '' : i % 4 === 0 ? 'bg-ink-600' : 'bg-ink-700')} style={on.includes(i) ? { background: color } : undefined} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-1 my-2.5">
        {['Am7', 'Dm7', 'G7', 'Cmaj7'].map((c, i) => (
          <span key={c} className={'flex-1 text-center text-xs font-black py-1 rounded-md ' + (i === 1 ? 'bg-chord text-ink-950' : 'bg-chord/25')}>
            {c}
          </span>
        ))}
      </div>
      <div className="relative h-10 rounded-md bg-ink-900">
        {melody.map(([l, w, b], i) => (
          <span key={i} className="absolute h-1.5 rounded-sm bg-[#f2a65a]" style={{ left: `${l}%`, width: `${w}%`, bottom: `${b}%` }} />
        ))}
      </div>
    </div>
  );
}

/**
 * The welcome page, the first time BeatSwitch opens on a phone: what it is, how it works in three
 * steps, a short example to hear, and a big button into the mobile wizard.
 */
export function MobileLanding({ onStart }: { onStart: () => void }) {
  const [hearing, setHearing] = useState(false);

  const hearExample = async () => {
    setHearing(true);
    // a two-bar taste of a starter beat; nothing is created or changed
    await previewDraftDemo(buildPreset(0));
    setTimeout(() => setHearing(false), 2600);
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-[radial-gradient(120%_70%_at_20%_0%,#2a2430_0%,#1a171e_55%,#121015_100%)] text-cream-100">
      <main className="flex-1 min-h-0 overflow-y-auto px-6 pt-7 pb-3 flex flex-col">
        <div className="flex items-center gap-3 text-4xl font-black tracking-tight">
          <span aria-hidden="true">📼</span>
          <h1>
            Beat<span className="text-kick">Switch</span>
          </h1>
        </div>
        <p className="mt-4 text-2xl font-extrabold leading-tight">Make a lo-fi song on your phone</p>
        <p className="mt-2 text-cream-500">Drums, chords and a melody that fit together. Free, nothing to install.</p>

        <div className="my-6 px-2">
          <MiniApp />
        </div>

        <ol className="flex flex-col gap-2.5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-center gap-3">
              <span className="w-11 h-11 shrink-0 rounded-2xl bg-ink-800 border border-ink-600 grid place-items-center text-xl" aria-hidden="true">
                {s.icon}
              </span>
              <div>
                <div className="font-extrabold">
                  <span className="text-cream-500 mr-1.5">{i + 1}</span>
                  {s.title}
                </div>
                <div className="text-sm text-cream-500">{s.text}</div>
              </div>
            </li>
          ))}
        </ol>
      </main>

      <div className="shrink-0 px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-2">
        <button
          className="h-14 rounded-2xl bg-kick text-ink-950 text-lg font-extrabold active:scale-[0.98] transition"
          onClick={() => {
            cutPreviews();
            restoreAudio(); // back to the sounds of the song being made
            onStart();
          }}
        >
          Make your first song →
        </button>
        <button className="h-12 rounded-2xl bg-ink-800 border border-ink-600 font-bold active:scale-[0.98] transition" onClick={hearExample} disabled={hearing}>
          {hearing ? '♪ Playing…' : '▶ Hear an example'}
        </button>
      </div>
    </div>
  );
}
