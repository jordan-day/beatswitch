import { useEffect } from 'react';
import { showView, togglePlay } from './audio/engine';
import { useProject, useUi, type Track } from './state/project';
import { decodeProject } from './storage/share';
import { ChordPanel } from './ui/ChordPanel';
import { useSamples } from './ui/common';
import { DrumGrid } from './ui/DrumGrid';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { SettingsMenu } from './ui/Inspector';
import { MelodyRoll } from './ui/MelodyRoll';
import { Overview } from './ui/Overview';
import { ProjectMenu } from './ui/ProjectMenu';
import { SectionChips, SongEditor } from './ui/SongEditor';
import { Transport } from './ui/Transport';

const TOUR_KEY = 'beatswitch:tour-done';
const TRACK_KEYS: Record<string, Track> = { '1': 'beat', '2': 'chords', '3': 'melody' };

function closeHelp() {
  try {
    localStorage.setItem(TOUR_KEY, '1');
  } catch {
    /* ignore */
  }
  useUi.getState().set({ helpOpen: false });
}

/** First-visit guide (and the "?" button). A dialog, so it never pushes the workspace around. */
function HelpOverlay() {
  const { helpOpen, set } = useUi();
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) set({ helpOpen: true });
    } catch {
      /* storage blocked: skip the auto-open */
    }
  }, [set]);
  if (!helpOpen) return null;
  const close = closeHelp;
  const steps = [
    ['▶', 'Press play', 'A beat is already loaded. Just listen first (or press Space).'],
    ['🥁', 'Make a loop', 'Click squares for drums & bass, pick chords, or draw a melody. Changes play instantly.'],
    ['🎼', 'Build a song', 'Open the Song tab to add sections (Intro, Verse, Chorus…) and line them up. Set Loop to Song at the top and press ▶ to hear it all.'],
    ['📼', 'Set the vibe', 'Open ⚙ at the top to pick a mood and key and turn up the Lo-fi knob. Each editor tab has its own sound choices.'],
  ];
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <div className="card max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <h2 id="help-title" className="text-xl font-extrabold mb-4">
          👋 Make a beat in 4 steps
        </h2>
        <ol className="flex flex-col gap-3">
          {steps.map(([icon, title, text], i) => (
            <li key={i} className="flex gap-3">
              <span className="text-2xl w-8 text-center">{icon}</span>
              <div>
                <div className="font-bold">
                  {i + 1}. {title}
                </div>
                <div className="text-sm text-cream-500">{text}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="text-xs text-cream-500 mt-4">
          Shortcuts: <b>Space</b> play/stop · <b>1 2 3</b> beat/chords/melody · <b>4</b> song · <b>Ctrl+Z</b> undo. Everything saves in this browser automatically.
        </div>
        <button className="btn-primary mt-4 w-full" onClick={close} autoFocus>
          Let's go
        </button>
      </div>
    </div>
  );
}

function Toast() {
  const toast = useUi((s) => s.toast);
  const set = useUi((s) => s.set);
  useEffect(() => {
    if (!toast) return;
    // toasts with an Undo stay a little longer, so there's time to reach the button
    const t = setTimeout(() => set({ toast: null }), toast.action ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [toast, set]);
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] rounded-xl bg-cream-100 text-ink-950 font-bold pl-4 pr-2 py-2 shadow-2xl text-sm flex items-center gap-3 min-h-[44px]"
    >
      <span className="flex-1">{toast.text}</span>
      {toast.action && (
        <button
          className="rounded-lg px-3 py-1.5 bg-ink-900 text-cream-100 hover:bg-ink-700 font-extrabold"
          onClick={() => {
            toast.action!.run();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="px-2 text-ink-600 hover:text-ink-950" onClick={() => set({ toast: null })} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

/** Small screens scroll, so keep play/stop within thumb reach. */
function FloatingPlay() {
  const playing = useUi((s) => s.playing);
  return (
    <button
      onClick={() => togglePlay()}
      className={
        'lg:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full text-2xl font-black grid place-items-center shadow-2xl shadow-black/60 active:scale-95 ' +
        (playing ? 'bg-cream-100 text-ink-950' : 'bg-kick text-ink-950')
      }
      aria-label={playing ? 'Stop' : 'Play'}
    >
      {playing ? '■' : '▶'}
    </button>
  );
}

/** The toolbar under the header: switch between editing a section and arranging the song, and pick the section to edit. */
function Toolbar() {
  const view = useUi((s) => s.view);
  const tab = (active: boolean) =>
    'px-4 py-1.5 rounded-lg text-sm font-extrabold transition ' +
    (active ? 'bg-ink-600 text-cream-100 shadow' : 'text-cream-500 hover:text-cream-100');
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 shrink-0">
      <div role="tablist" aria-label="View" className="flex rounded-xl bg-ink-800/80 border border-ink-600/60 p-1 shrink-0">
        <button role="tab" aria-selected={view === 'editor'} className={tab(view === 'editor')} onClick={() => showView('editor')} title="Edit a section's beat, chords and melody">
          Section
        </button>
        <button
          role="tab"
          aria-selected={view === 'song'}
          className={tab(view === 'song')}
          onClick={() => showView('song')}
          title="Line up your sections into a full song (key 4)"
        >
          Song
        </button>
      </div>
      {view === 'editor' && <SectionChips />}
    </div>
  );
}

function Editor() {
  const track = useUi((s) => s.track);
  return (
    <section className="card p-3 sm:p-4 flex flex-col min-h-[26rem] lg:flex-1" aria-label="Editor">
      {/* keyed by tab, so switching tabs also clears a crashed editor */}
      <ErrorBoundary key={track} name={`${{ beat: 'Beat', chords: 'Chords', melody: 'Melody' }[track]} editor`}>
        {track === 'beat' && <DrumGrid />}
        {track === 'chords' && <ChordPanel />}
        {track === 'melody' && <MelodyRoll />}
      </ErrorBoundary>
    </section>
  );
}

export default function App() {
  const view = useUi((s) => s.view);
  // Load a shared beat from the URL (#b=...), once.
  useEffect(() => {
    if (window.location.hash.startsWith('#b=')) {
      const p = decodeProject(window.location.hash);
      history.replaceState(null, '', window.location.pathname + window.location.search);
      if (p) {
        useProject.getState().load(p);
        useUi.getState().notify(`Loaded shared beat "${p.name}". Press play! 🎧`);
      } else useUi.getState().notify("That share link looks broken, so here's a starter beat instead.");
    }
    useSamples.getState().refresh();
  }, []);

  // Keyboard: Space = play/stop, 1/2/3 = beat/chords/melody editors, 4 = song arrangement, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y = undo/redo, Esc closes help
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text';
      if (typing || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      const ui = useUi.getState();
      if (e.key === 'Escape' && ui.helpOpen) return closeHelp();
      if (ui.helpOpen || document.querySelector('[role=dialog][aria-modal=true]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && TRACK_KEYS[e.key]) {
        showView('editor');
        ui.set({ track: TRACK_KEYS[e.key] });
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '4') {
        showView('song');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? useProject.getState().redo() : useProject.getState().undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useProject.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    // Desktop: a one-screen workspace; short windows scroll the left column.
    <div className="lg:h-screen flex flex-col gap-2 p-2 pb-24 lg:pb-2 max-w-[1600px] mx-auto">
      <header className="card p-3 sm:p-3 shrink-0 flex flex-wrap items-center gap-x-2 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📼</span>
          <span className="text-xl font-black tracking-tight">
            Beat<span className="text-kick">Switch</span>
          </span>
        </div>
        <Transport />
        <div className="ml-auto flex items-center gap-1.5">
          <SettingsMenu />
          <ProjectMenu />
        </div>
      </header>

      <div className="flex-1 min-h-0 grid gap-2">
        <main className="flex flex-col gap-2 min-h-0 min-w-0 lg:overflow-y-auto">
          <Toolbar />
          {view === 'song' ? (
            <ErrorBoundary name="song arrangement">
              <SongEditor />
            </ErrorBoundary>
          ) : (
            <>
              <ErrorBoundary name="section overview">
                <Overview />
              </ErrorBoundary>
              <Editor />
            </>
          )}
        </main>
      </div>

      <FloatingPlay />
      <HelpOverlay />
      <Toast />
    </div>
  );
}
