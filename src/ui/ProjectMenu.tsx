import { useEffect, useRef, useState } from 'react';
import { exportFile } from '../audio/export';
import { stop } from '../audio/engine';
import { buildPreset, emptyProject, PRESET_LIST } from '../music/presets';
import { inArtifact, safeName, saveFile } from '../platform';
import { useProject, useUi } from '../state/project';
import { deleteSaved, listSaved, loadSaved, saveProject, type SavedMeta } from '../storage/local';
import { projectFromFile, projectToFile, shareUrl } from '../storage/share';

type Panel = null | 'presets' | 'load';

export function ProjectMenu() {
  const project = useProject((s) => s.project);
  const { update, load } = useProject();
  const notify = useUi((s) => s.notify);
  const [panel, setPanel] = useState<Panel>(null);
  const [saved, setSaved] = useState<SavedMeta[]>([]);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setPanel(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const SAMPLES_NOTE = ' Imported samples stay on this computer, so those rows use the built-in kit.';

  const openLoad = async () => {
    setConfirmDelete(null);
    try {
      setSaved(await listSaved());
    } catch {
      setSaved([]);
    }
    setPanel(panel === 'load' ? null : 'load');
  };

  const onSave = async () => {
    try {
      await saveProject(project);
      notify(`Saved "${project.name}" in this browser 💾`);
    } catch {
      notify("Couldn't save: this browser is blocking storage. Use 📤 to save a beat file instead.");
    }
  };

  /** Save the beat as a .json file anyone can open with "Open beat file". */
  const saveBeatFile = async () => {
    const { json, replacedSamples } = projectToFile(project);
    const result = await saveFile(new Blob([json], { type: 'application/json' }), `${safeName(project.name)}.json`);
    if (result === 'saved') notify('Beat file saved 📤 Send it to a friend; they open it with 📂 → Open beat file.' + (replacedSamples ? SAMPLES_NOTE : ''));
    else if (result === 'unavailable') notify("Saving files isn't available in this view.");
  };

  const onShare = async () => {
    // Inside a Claude artifact, long share links don't survive, so share a beat file instead.
    if (inArtifact) return saveBeatFile();
    const { url, replacedSamples } = shareUrl(project);
    try {
      await navigator.clipboard.writeText(url);
      notify('Share link copied! 🔗' + (replacedSamples ? SAMPLES_NOTE : ''));
    } catch {
      // clipboard blocked: fall back to a file
      await saveBeatFile();
    }
  };

  const openBeatFile = async (file: File) => {
    const p = projectFromFile(await file.text());
    if (!p) return notify("That file isn't a BeatSwitch beat.");
    stop();
    load(p);
    setPanel(null);
    notify(`Opened "${p.name}" 🎧`);
  };

  const onExport = async () => {
    setExporting(true);
    notify('Rendering your beat… 🎛️');
    try {
      const { blob, filename } = await exportFile(project, 4, inArtifact);
      const result = await saveFile(blob, filename);
      if (result === 'saved') notify(inArtifact ? 'Exported ✨ Your .wav is inside the .zip.' : 'WAV exported ✨');
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
      <input
        className="bg-transparent text-lg font-extrabold border-b-2 border-transparent hover:border-ink-600 focus:border-kick focus:outline-none w-36 2xl:w-48"
        value={project.name}
        onChange={(e) => update((p) => void (p.name = e.target.value.slice(0, 60)), 'name')}
        aria-label="Beat name"
        title="Name your beat"
      />
      <button className="btn" onClick={() => setPanel(panel === 'presets' ? null : 'presets')} title="Start from a ready-made beat" aria-label="Start from">
        ✨<span className="hidden 2xl:inline"> Start from…</span>
      </button>
      <button className="btn" onClick={onSave} title="Save in this browser" aria-label="Save">
        💾<span className="hidden 2xl:inline"> Save</span>
      </button>
      <button className="btn" onClick={openLoad} title="Open a saved beat" aria-label="Open">
        📂<span className="hidden 2xl:inline"> Open</span>
      </button>
      <button
        className="btn"
        onClick={onShare}
        title={inArtifact ? 'Save this beat as a file you can send to someone' : 'Copy a link to this beat'}
        aria-label="Share"
      >
        {inArtifact ? '📤' : '🔗'}
        <span className="hidden 2xl:inline"> Share</span>
      </button>
      <button
        className="btn-primary"
        onClick={onExport}
        disabled={exporting}
        title={inArtifact ? 'Save 4 loops as a .wav (inside a .zip)' : 'Download 4 loops as a .wav file'}
      >
        {exporting ? '⏳ Rendering…' : '⬇ Export WAV'}
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
      <button
        className="btn w-9 h-9 rounded-full p-0"
        onClick={() => useUi.getState().set({ helpOpen: true })}
        title="How does this work?"
        aria-label="Help"
      >
        ?
      </button>

      {panel === 'presets' && (
        <div className="absolute top-full right-0 mt-2 z-50 card w-72 flex flex-col gap-1 p-2">
          <div className="label px-3 pt-1">Starter beats</div>
          {PRESET_LIST.map((pr) => (
            <button
              key={pr.index}
              className="text-left rounded-lg px-3 py-2 hover:bg-ink-700"
              onClick={() => {
                stop();
                load(buildPreset(pr.index));
                setPanel(null);
              }}
            >
              <div className="font-bold">{pr.name}</div>
              <div className="text-xs text-cream-500">{pr.blurb}</div>
            </button>
          ))}
          <div className="label px-3 pt-2 mt-1 border-t border-ink-600">Start from scratch</div>
          <button
            className="text-left rounded-lg px-3 py-2 hover:bg-ink-700"
            onClick={() => {
              stop();
              load(emptyProject(true));
              useUi.getState().set({ track: 'beat', viewBar: 0 });
              setPanel(null);
            }}
          >
            <div className="font-bold">🎹 Blank with chords</div>
            <div className="text-xs text-cream-500">A chord progression to build on; no drums, bass or melody</div>
          </button>
          <button
            className="text-left rounded-lg px-3 py-2 hover:bg-ink-700"
            onClick={() => {
              stop();
              load(emptyProject(false));
              // open the chord editor on chord 1, where "good places to start" suggestions are shown
              useUi.getState().set({ track: 'chords', selectedSlot: 0, viewBar: 0 });
              setPanel(null);
            }}
          >
            <div className="font-bold">⬜ Completely empty</div>
            <div className="text-xs text-cream-500">Nothing at all: pick every chord and note yourself</div>
          </button>
        </div>
      )}

      {panel === 'load' && (
        <div className="absolute top-full right-0 mt-2 z-50 card w-72 flex flex-col gap-1 p-2 max-h-96 overflow-y-auto">
          <div className="label px-3 pt-1">Saved in this browser</div>
          {saved.length === 0 && <div className="text-sm text-cream-500 px-3 py-2">Nothing saved yet. Hit 💾 Save first.</div>}
          {saved.map((s) =>
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
                      notify("Couldn't delete that save.");
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
                  className="flex-1 text-left px-3 py-2"
                  onClick={async () => {
                    const p = await loadSaved(s.id).catch(() => null);
                    if (p) {
                      stop();
                      load(p);
                    } else notify("Couldn't open that save.");
                    setPanel(null);
                  }}
                >
                  <div className="font-bold">{s.name}</div>
                  <div className="text-xs text-cream-500">{new Date(s.savedAt).toLocaleString()}</div>
                </button>
                <button className="px-3 text-cream-500 hover:text-kick" title="Delete this save" aria-label={`Delete ${s.name}`} onClick={() => setConfirmDelete(s.id)}>
                  🗑
                </button>
              </div>
            ),
          )}
          <button className="text-left rounded-lg px-3 py-2 hover:bg-ink-700 border-t border-ink-600 mt-1" onClick={() => fileRef.current?.click()}>
            <div className="font-bold">📄 Open beat file…</div>
            <div className="text-xs text-cream-500">A .json beat someone shared with you (made with 📤 Share)</div>
          </button>
        </div>
      )}
    </div>
  );
}
