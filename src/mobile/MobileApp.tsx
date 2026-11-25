import { useEffect, useState } from 'react';
import { cutPreviews, play, setLoopMode, stop, togglePlay } from '../audio/engine';
import { Toast } from '../App';
import { useProject, useUi } from '../state/project';
import { BeatName, ProjectMenu } from '../ui/ProjectMenu';
import { BeatScreen, ChordsScreen, HowToScreen, MelodyScreen, SongScreen, VibeScreen } from './MobileScreens';
import { MobileLanding } from './MobileLanding';
import { newMobileSong } from './shape';

/**
 * The phone version: a trimmed-down BeatSwitch for making a whole lo-fi song with your thumbs.
 * A new song starts with the mobile wizard (Vibe → Beat → Chords → Melody, then a page on how to
 * keep editing); after that the parts are tabs at the bottom, plus Song. Songs are the same as on a
 * computer, just with fewer knobs.
 */

type Screen = 'vibe' | 'beat' | 'chords' | 'melody' | 'song' | 'howto';
/** The bottom tabs. */
const SCREENS: { id: Screen; label: string; icon: string }[] = [
  { id: 'vibe', label: 'Vibe', icon: '🌙' },
  { id: 'beat', label: 'Beat', icon: '🥁' },
  { id: 'chords', label: 'Chords', icon: '🎹' },
  { id: 'melody', label: 'Melody', icon: '🎵' },
  { id: 'song', label: 'Song', icon: '🎼' },
];
/** The mobile wizard's steps: the four parts, then how to keep editing (the song is made for you). */
const WIZARD: { id: Screen; label: string }[] = [
  { id: 'vibe', label: 'Vibe' },
  { id: 'beat', label: 'Beat' },
  { id: 'chords', label: 'Chords' },
  { id: 'melody', label: 'Melody' },
  { id: 'howto', label: 'Your song' },
];
const SETUP_KEY = 'beatswitch:mobile-setup-done';
/** The wizard step you're on, while the wizard is open (so a reload resumes it, with your song). */
const STEP_KEY = 'beatswitch:mobile-wizard-step';

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage blocked: nothing is remembered between visits */
    }
  },
};

/**
 * Where to open: a wizard that was in progress resumes at its step (with the song you were making);
 * the very first visit opens the welcome page (its button starts the wizard with a fresh song);
 * otherwise the tabs, with your last song.
 */
function openingStep(): { step: number | null; welcome: boolean } {
  const saved = Number(store.get(STEP_KEY));
  if (store.get(STEP_KEY) !== null && saved >= 0 && saved < WIZARD.length) return { step: saved, welcome: false };
  if (!store.get(SETUP_KEY)) return { step: null, welcome: true };
  return { step: null, welcome: false };
}

export function MobileApp() {
  const load = useProject((s) => s.load);
  const [opening] = useState(openingStep);
  const [welcome, setWelcome] = useState(opening.welcome);
  const [wizard, setWizardState] = useState<number | null>(opening.step);
  const [tab, setTab] = useState<Screen>('beat');
  const screen: Screen = wizard !== null ? WIZARD[wizard].id : tab;
  const setWizard = (step: number | null) => {
    store.set(STEP_KEY, step === null ? null : String(step));
    setWizardState(step);
  };

  const startNewSong = () => {
    stop();
    load(newMobileSong());
    setWizard(0);
  };
  // No pop-ups during the wizard: they'd cover its Next button (and every step can simply be redone).
  // Any message is dropped as it comes in, so nothing old pops up when the wizard ends either.
  const toast = useUi((s) => s.toast);
  useEffect(() => {
    if (wizard !== null && toast) useUi.getState().set({ toast: null });
  }, [wizard, toast]);

  const finishSetup = () => {
    store.set(SETUP_KEY, '1');
    setWizard(null);
    setTab('beat');
  };

  // the Song screen plays the whole song; every other screen loops your loop.
  // A preview from the screen you left (a key, a kit…) stops rather than playing on.
  useEffect(() => {
    cutPreviews();
    const want = screen === 'song' || screen === 'howto' ? 'song' : 'section';
    if (useUi.getState().playMode !== want) void setLoopMode(want);
    useUi.getState().set({ loopBar: false });
  }, [screen]);

  if (welcome)
    return (
      <MobileLanding
        onStart={() => {
          setWelcome(false);
          startNewSong();
        }}
      />
    );

  return (
    <div className="h-[100dvh] flex flex-col bg-ink-950 text-cream-100">
      <header className="shrink-0 flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="text-xl" aria-hidden="true">
          📼
        </span>
        <div className="flex-1 min-w-0">
          <BeatName />
        </div>
        <HeaderPlay song={screen === 'song' || screen === 'howto'} />
        <ProjectMenu onNew={startNewSong} />
      </header>

      {wizard !== null && (
        <div className="shrink-0 px-4 pt-1 pb-2 flex items-center gap-2" aria-label={`Step ${wizard + 1} of ${WIZARD.length}`}>
          {WIZARD.map((s, i) => (
            <span key={s.id} className={'h-1.5 flex-1 rounded-full ' + (i <= wizard ? 'bg-kick' : 'bg-ink-700')} />
          ))}
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-6">
        {/* keyed, so each screen starts at the top and runs its own setup */}
        <div key={screen}>
          {screen === 'vibe' && <VibeScreen />}
          {screen === 'beat' && <BeatScreen autoFill={wizard !== null} />}
          {screen === 'chords' && <ChordsScreen />}
          {screen === 'melody' && <MelodyScreen autoFill={wizard !== null} />}
          {screen === 'song' && <SongScreen />}
          {screen === 'howto' && <HowToScreen />}
        </div>
      </main>

      {wizard !== null ? (
        <nav className="shrink-0 flex gap-2 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-ink-700 bg-ink-900">
          {wizard > 0 && (
            <button className="h-12 px-5 rounded-xl font-bold bg-ink-700" onClick={() => setWizard(wizard - 1)}>
              ← Back
            </button>
          )}
          {wizard < WIZARD.length - 1 ? (
            <button className="h-12 flex-1 rounded-xl font-extrabold bg-cream-100 text-ink-950" onClick={() => setWizard(wizard + 1)}>
              Next: {WIZARD[wizard + 1].label} →
            </button>
          ) : (
            <button className="h-12 flex-1 rounded-xl font-extrabold bg-kick text-ink-950" onClick={finishSetup}>
              Start editing →
            </button>
          )}
        </nav>
      ) : (
        <nav className="shrink-0 grid grid-cols-5 border-t border-ink-700 bg-ink-900 pb-[env(safe-area-inset-bottom)]" role="tablist" aria-label="Parts">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={tab === s.id}
              onClick={() => setTab(s.id)}
              className={'h-16 flex flex-col items-center justify-center gap-0.5 text-xs font-bold ' + (tab === s.id ? 'text-cream-100' : 'text-cream-500')}
            >
              <span className={'text-xl ' + (tab === s.id ? '' : 'opacity-60')} aria-hidden="true">
                {s.icon}
              </span>
              {s.label}
            </button>
          ))}
        </nav>
      )}
      {/* above the bottom tab bar, so it never covers the tabs; none during the wizard (see above) */}
      {wizard === null && <Toast bottom="calc(4.75rem + env(safe-area-inset-bottom))" />}
    </div>
  );
}

/**
 * The play button, in the header next to the menu (no separate bar, so more of each screen fits).
 * On the Song screen (and the wizard's last page) it plays the whole song; elsewhere it loops your loop.
 */
function HeaderPlay({ song }: { song: boolean }) {
  const playing = useUi((s) => s.playing);
  return (
    <button
      onClick={() => (playing ? stop() : song ? void setLoopMode('song').then(play) : void togglePlay())}
      className={'w-11 h-11 shrink-0 rounded-full text-lg font-black grid place-items-center active:scale-95 transition ' + (playing ? 'bg-cream-100 text-ink-950' : 'bg-kick text-ink-950')}
      aria-label={playing ? 'Stop' : song ? 'Play the whole song' : 'Play your loop'}
      title={playing ? 'Stop' : song ? 'Play the whole song' : 'Play your loop'}
    >
      {playing ? '■' : '▶'}
    </button>
  );
}
