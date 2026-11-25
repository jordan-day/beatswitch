import { useEffect, useRef, useState } from 'react';
import { exportFile, songDuration, type AudioFormat } from '../audio/export';
import { formatTime } from '../state/song';
import { previewKey, stop } from '../audio/engine';
import { buildPreset, PRESET_LIST } from '../music/presets';
import { inArtifact, safeName, saveFile } from '../platform';
import { useProject, useUi, withUndo } from '../state/project';
import type { Project } from '../state/types';
import { deleteSaved, listSaved, loadSaved, type SavedMeta } from '../storage/local';
import { NewBeatDialog } from './NewBeatDialog';
import { projectFromFile, projectToFile, shareUrl } from '../storage/share';

const SAMPLES_NOTE = ' Imported samples stay on this computer, so those rows use the built-in kit.';

/** Beat name, the Beats menu (new / open), the ☰ file menu (save as JSON, export WAV or MP3, share) and Help. */
export function ProjectMenu() {
  const project = useProject((s) => s.project);
  const { update } = useProject();
  const notify = useUi((s) => s.notify);
  const [menu, setMenu] = useState<'beats' | 'file' | null>(null);
  const beatId = useProject((s) => s.beatId);
  const [exporting, setExporting] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // close the menu on an outside click or Escape
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  /** Replace the current beat, with an Undo in case it was a mis-click. */
  const open = (p: Project, message: string, id?: string) => {
    stop();
    withUndo(message, () => useProject.getState().load(p, id));
    setMenu(null);
  };

  /** Save the beat as a .json file anyone can open with "Open a beat file". */
  const saveBeatFile = async () => {
    const { json, replacedSamples } = projectToFile(project);
    const result = await saveFile(new Blob([json], { type: 'application/json' }), `${safeName(project.name)}.json`);
    if (result === 'saved') notify('Beat file saved ✨ Open it any time from 📂 Beats › Open a beat file.' + (replacedSamples ? SAMPLES_NOTE : ''));
    else if (result === 'unavailable') notify("Saving files isn't available in this view.");
  };

  const onShare = async () => {
    // Inside a Claude artifact, long share links don't survive, so share a beat file instead.
    if (inArtifact) return saveBeatFile();
    const { url, replacedSamples } = shareUrl(project);
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copied! Paste it to share this beat 🔗' + (replacedSamples ? SAMPLES_NOTE : ''));
    } catch {
      await saveBeatFile(); // clipboard blocked: share a file instead
    }
  };

  const onExport = async (format: AudioFormat) => {
    setMenu(null);
    setExporting(true);
    notify(`Rendering your beat… 🎛️`);
    try {
      const { blob, filename } = await exportFile(project, { format, asZip: inArtifact });
      const result = await saveFile(blob, filename);
      if (result === 'saved')
        notify(inArtifact ? `Exported ✨ Your .${format} is inside the .zip.` : `${format.toUpperCase()} exported ✨ (whole song, ${formatTime(songDuration(project))})`);
      else if (result === 'unavailable') notify("Saving files isn't available in this view.");
    } catch (e) {
      console.error(e);
      notify('Export failed. Try again?');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div ref={ref} className="flex flex-wrap items-center gap-2 relative">
      <div className="flex flex-col">
        <input
          id="beat-name"
          className="bg-transparent text-lg font-extrabold leading-tight border-b-2 border-transparent hover:border-ink-600 focus:border-kick focus:outline-none w-36 2xl:w-48"
          value={project.name}
          onChange={(e) => update((p) => void (p.name = e.target.value.slice(0, 60)), 'name')}
          aria-label="Beat name"
          title="Click to rename your beat"
        />
        <AutosaveStatus />
      </div>

      <button
        className="btn"
        onClick={() => setMenu(menu === 'beats' ? null : 'beats')}
        aria-expanded={menu === 'beats'}
        aria-haspopup="menu"
        title="Start a new beat, or open one"
      >
        📂 Beats <span className="text-xs opacity-70">▾</span>
      </button>
      <button
        className="btn w-9 h-9 rounded-full p-0 text-lg"
        onClick={() => setMenu(menu === 'file' ? null : 'file')}
        aria-expanded={menu === 'file'}
        aria-haspopup="menu"
        aria-label="Menu: save and export"
        title="Save as JSON, export WAV or MP3, share"
      >
        {exporting ? '⏳' : '☰'}
      </button>
      <button
        className="btn w-9 h-9 rounded-full p-0"
        onClick={() => useUi.getState().set({ helpOpen: true })}
        title="How does this work?"
        aria-label="Help"
      >
        ?
      </button>

      {menu === 'beats' && (
        <BeatsMenu
          currentId={beatId}
          onOpen={open}
          onNew={() => {
            setMenu(null);
            setNewOpen(true);
          }}
          onError={notify}
        />
      )}
      {menu === 'file' && (
        <FileMenu
          busy={exporting}
          onJson={() => {
            setMenu(null);
            void saveBeatFile();
          }}
          onExport={onExport}
          onShare={() => {
            setMenu(null);
            void onShare();
          }}
        />
      )}
      {newOpen && (
        <NewBeatDialog
          onClose={() => setNewOpen(false)}
          onCreate={(p) => {
            setNewOpen(false);
            const chords = p.chords.slots.some((s) => s);
            open(p, `Started "${p.name}" ✨`);
            useUi.getState().set({ view: 'editor', track: chords ? 'beat' : 'chords', selectedSlot: 0, viewBar: 0 });
            if (chords) void previewKey();
          }}
        />
      )}
    </div>
  );
}

/** Quiet confirmation that work is kept automatically, so nobody worries about losing a beat. */
function AutosaveStatus() {
  const project = useProject((s) => s.project);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setState('saving');
    const t = setTimeout(() => setState('saved'), 600); // autosave writes ~400 ms after an edit
    return () => clearTimeout(t);
  }, [project]);
  return (
    <span className="text-xs text-cream-500 h-3 leading-3" title="Your current beat is kept in this browser automatically" aria-live="polite">
      {state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Autosaved' : 'Autosaves as you go'}
    </span>
  );
}

function BeatsMenu({
  currentId,
  onOpen,
  onError,
  onNew,
}: {
  currentId: string;
  onOpen: (p: Project, message: string, id?: string) => void;
  onError: (text: string) => void;
  onNew: () => void;
}) {
  const [saved, setSaved] = useState<SavedMeta[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listSaved()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);

  const openBeatFile = async (file: File) => {
    const p = projectFromFile(await file.text());
    if (!p) return onError("That file isn't a BeatSwitch beat.");
    onOpen(p, `Opened "${p.name}" 🎧`);
  };

  const item = 'text-left rounded-lg px-3 py-2 hover:bg-ink-700 w-full';

  return (
    <div
      role="menu"
      className="absolute top-full right-0 mt-2 z-50 card !bg-ink-800 shadow-2xl w-[min(20rem,calc(100vw-2rem))] p-2 max-h-[70vh] overflow-y-auto flex flex-col gap-0.5"
    >
      <div className="label px-3 pt-1 pb-1">Starter beats</div>
      {PRESET_LIST.map((pr) => (
        <button key={pr.index} role="menuitem" className={item} onClick={() => onOpen(buildPreset(pr.index), `Loaded "${pr.name}". Press play!`)}>
          <div className="font-bold">{pr.name}</div>
          <div className="text-xs text-cream-500">{pr.blurb}</div>
        </button>
      ))}

      <div className="label px-3 pt-3 pb-1 border-t border-ink-600 mt-1">Start from scratch</div>
      <button role="menuitem" className={item} onClick={onNew}>
        <div className="font-bold">✨ New beat…</div>
        <div className="text-xs text-cream-500">Pick the mood, key, vibe and sounds first</div>
      </button>

      <div className="label px-3 pt-3 pb-1 border-t border-ink-600 mt-1">Your beats</div>
      {saved === null && <div className="text-sm text-cream-500 px-3 py-2">Loading…</div>}
      {saved?.length === 0 && <div className="text-sm text-cream-500 px-3 py-2">Nothing yet. Beats you edit are saved here automatically.</div>}
      {saved?.map((s) =>
        confirmDelete === s.id ? (
          // In-page confirmation (pop-up dialogs are blocked inside Claude artifacts)
          <div key={s.id} className="flex items-center gap-2 rounded-lg bg-kick/15 px-3 py-2" role="alertdialog" aria-label={`Delete ${s.name}?`}>
            <div className="flex-1 text-sm">
              Delete <b>{s.name}</b>? This can't be undone.
            </div>
            <button className="btn text-xs px-2 py-1" onClick={() => setConfirmDelete(null)} autoFocus>
              Keep
            </button>
            <button
              className="btn text-xs px-2 py-1 bg-kick text-ink-950 hover:bg-kick"
              onClick={async () => {
                try {
                  await deleteSaved(s.id);
                  setSaved(await listSaved());
                } catch {
                  onError("Couldn't delete that save.");
                }
                setConfirmDelete(null);
              }}
            >
              Delete
            </button>
          </div>
        ) : (
          <div key={s.id} className="flex items-center rounded-lg hover:bg-ink-700">
            <button
              role="menuitem"
              className="flex-1 text-left px-3 py-2"
              onClick={async () => {
                const p = await loadSaved(s.id).catch(() => null);
                if (p) onOpen(p, `Opened "${p.name}" 🎧`, s.id);
                else onError("Couldn't open that save.");
              }}
            >
              <div className="font-bold">
                {s.name}
                {s.id === currentId && <span className="ml-2 text-xs font-bold text-ink-950 bg-cream-100 rounded px-1.5 py-0.5 align-middle">Open now</span>}
              </div>
              <div className="text-xs text-cream-500">{new Date(s.savedAt).toLocaleString()}</div>
            </button>
            <button className="px-3 py-2 text-cream-500 hover:text-kick rounded" title="Delete this save" aria-label={`Delete ${s.name}`} onClick={() => setConfirmDelete(s.id)}>
              🗑
            </button>
          </div>
        ),
      )}
      <div className="border-t border-ink-600 mt-1" />
      <button role="menuitem" className={item} onClick={() => fileRef.current?.click()}>
        <div className="font-bold">📄 Open a beat file…</div>
        <div className="text-xs text-cream-500">A .json beat you saved or someone shared with you</div>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) openBeatFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** The ☰ menu: get your beat out of the app. */
function FileMenu(props: { busy: boolean; onJson: () => void; onExport: (f: AudioFormat) => void; onShare: () => void }) {
  const item = 'text-left rounded-lg px-3 py-2 hover:bg-ink-700 w-full disabled:opacity-40 disabled:pointer-events-none';
  return (
    <div role="menu" className="absolute top-full right-0 mt-2 z-50 card !bg-ink-800 shadow-2xl w-[min(20rem,calc(100vw-2rem))] p-2 flex flex-col gap-0.5">
      <div className="label px-3 pt-1 pb-1">Save &amp; export</div>
      <button role="menuitem" className={item} onClick={props.onJson}>
        <div className="font-bold">📄 Save as JSON</div>
        <div className="text-xs text-cream-500">A beat file you can reopen later or send to a friend</div>
      </button>
      <button role="menuitem" className={item} onClick={() => props.onExport('wav')} disabled={props.busy}>
        <div className="font-bold">🎧 Export WAV</div>
        <div className="text-xs text-cream-500">The whole song, full quality</div>
      </button>
      <button role="menuitem" className={item} onClick={() => props.onExport('mp3')} disabled={props.busy}>
        <div className="font-bold">🎧 Export MP3</div>
        <div className="text-xs text-cream-500">The whole song, a smaller file</div>
      </button>
      {!inArtifact && (
        <button role="menuitem" className={item + ' border-t border-ink-600 mt-1'} onClick={props.onShare}>
          <div className="font-bold">🔗 Copy share link</div>
          <div className="text-xs text-cream-500">Anyone with the link can open this beat</div>
        </button>
      )}
      <div className="text-xs text-cream-500 px-3 pt-2 pb-1">Your beats are also saved in this browser automatically.</div>
    </div>
  );
}
