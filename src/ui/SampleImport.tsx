import { useEffect, useRef, useState } from 'react';
import { ensureAudio, previewSample } from '../audio/engine';
import { useProject, useUi, withUndo } from '../state/project';
import { getCachedBuffer, loadSample } from '../storage/samples';
import { STEPS_PER_BAR } from '../state/types';
import { useSamples } from './common';

/**
 * Use an audio file as the song's sample (a new one, or a different file for the one there is),
 * then open the Sample tab and play the clip so you hear what you picked.
 */
export function useSampleFile() {
  const importFile = useSamples((s) => s.importFile);
  const { setSample, placeSample } = useProject();
  const set = useUi((s) => s.set);

  /**
   * Use a sample already stored in this browser. With `step`, also add a hit there (a file
   * dropped on the page lands at the start of the bar being edited).
   */
  const addStored = async (meta: { id: string; name: string }, step?: number) => {
    await ensureAudio();
    const buf = getCachedBuffer(meta.id) ?? (await loadSample(meta.id));
    if (!buf) return useUi.getState().notify(`Couldn't load "${meta.name}". Try choosing its file again.`);
    const cur = useProject.getState().project.sample;
    if (step === undefined) {
      withUndo(!cur ? `Added the sample "${meta.name}"` : `Switched the sample to "${meta.name}"`, () => setSample(meta, buf.duration));
    } else {
      const where = `bar ${Math.floor(step / STEPS_PER_BAR) + 1}`;
      const what = !cur ? `Added the sample "${meta.name}"` : cur.id === meta.id ? `Added "${meta.name}"` : `Switched the sample to "${meta.name}" and added it`;
      withUndo(`${what} to ${where}`, () => placeSample(meta, buf.duration, step));
    }
    set({ track: 'sample', view: 'editor' });
    void previewSample();
  };

  /** Import a file from the computer, then use it (with `step`: at that step, see above). */
  const addFile = async (file: File, step?: number) => {
    await ensureAudio(); // decoding needs the audio context
    const meta = await importFile(file);
    if (meta) await addStored(meta, step);
  };

  return { addFile, addStored };
}

/** A hidden file input and a function that opens it. Render `input` somewhere in the component. */
export function useAudioFilePicker(onFile: (f: File) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = '';
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

/**
 * "＋ Sample", quietly after the editor tabs: picks an audio file and adds it as the song's sample.
 * Shown only while the song has no sample (after that, the Sample tab takes its place).
 */
export function AddSampleButton() {
  const { addFile } = useSampleFile();
  const picker = useAudioFilePicker((f) => void addFile(f));
  return (
    <>
      <button
        className="h-8 px-3 rounded-lg border-2 border-dashed border-ink-600 text-xs font-bold text-cream-500 hover:text-cream-100 hover:border-cream-500 transition whitespace-nowrap"
        onClick={picker.open}
        title="Add a sample: a clip from an audio file (.wav, .mp3) that plays where you put it"
      >
        ＋ Sample
      </button>
      {picker.input}
    </>
  );
}

const isAudio = (f: File) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac|aiff?)$/i.test(f.name);

/**
 * Drop an audio file anywhere on the page to add it as the sample, at the start of the bar being
 * edited. While a file is dragged over the page, an overlay says where it will go. (Dropping it on
 * a drum's name still makes it that drum's sound: that drop is handled there first.)
 */
export function SampleDropZone() {
  const { addFile } = useSampleFile();
  const addRef = useRef(addFile);
  addRef.current = addFile;
  const [over, setOver] = useState(false);
  const depth = useRef(0); // dragenter/leave fire for every element crossed; count to know when it truly leaves
  const p = useProject((s) => s.project);
  const viewBar = useUi((s) => s.viewBar);
  const bar = Math.min(viewBar, p.bars - 1);
  const section = p.sections.find((s) => s.id === p.activeSection)?.name ?? '';

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const overPage = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // accept the drop (otherwise the browser would open the file)
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const drop = (e: DragEvent) => {
      depth.current = 0;
      setOver(false);
      if (!hasFiles(e)) return;
      // a drop the page already handled (a drum's name takes a file as that drum's sound)
      if (e.defaultPrevented) return;
      e.preventDefault();
      const file = [...(e.dataTransfer?.files ?? [])].find(isAudio);
      if (!file) return useUi.getState().notify("That isn't an audio file. Drop a .wav or .mp3.");
      const { project } = useProject.getState();
      const step = Math.min(useUi.getState().viewBar, project.bars - 1) * STEPS_PER_BAR;
      void addRef.current(file, step);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overPage);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overPage);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!over) return null;
  return (
    <div className="pointer-events-none fixed inset-2 z-[60] rounded-2xl border-4 border-dashed border-[#a7b5ff] bg-ink-950/60 grid place-items-center" aria-hidden="true">
      <div className="card !bg-ink-800 text-center px-6 py-4 shadow-2xl">
        <div className="text-lg font-extrabold">Drop to add the sample to bar {bar + 1}</div>
        <div className="text-sm text-cream-500">
          {section && <>of {section} · </>}or drop it on a drum's name to use it as that drum's sound
        </div>
      </div>
    </div>
  );
}
