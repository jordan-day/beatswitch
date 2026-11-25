import { create } from 'zustand';
import { importSample, listSamples, type SampleMeta } from '../storage/samples';
import { useUi } from '../state/project';

export function Slider(props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  display?: string;
  color?: string;
  hint?: string;
  className?: string;
  /** Label beside the slider instead of above it (for toolbars). */
  inline?: boolean;
}) {
  const { min = 0, max = 1, step = 0.01 } = props;
  return (
    <label className={(props.inline ? 'flex items-center gap-2 ' : 'flex flex-col gap-1 ') + (props.className ?? '')} title={props.hint}>
      <span className={props.inline ? 'text-xs font-bold text-cream-500' : 'flex justify-between label'}>
        <span>{props.label}</span>
        {props.display !== undefined && <span className="text-cream-300 normal-case tracking-normal">{props.display}</span>}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={props.value}
        style={props.color ? ({ '--thumb': props.color } as React.CSSProperties) : undefined}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** Imported samples available in this browser. */
interface SampleStore {
  samples: SampleMeta[];
  refresh: () => Promise<void>;
  importFile: (file: File) => Promise<SampleMeta | null>;
}

export const useSamples = create<SampleStore>((set) => ({
  samples: [],
  refresh: async () => {
    try {
      set({ samples: await listSamples() });
    } catch {
      set({ samples: [] }); // storage blocked (private window, artifact preview): no saved samples
    }
  },
  importFile: async (file) => {
    try {
      const meta = await importSample(file);
      set({ samples: await listSamples() });
      useUi.getState().notify(`Imported "${meta.name}" 🎉`);
      return meta;
    } catch (e) {
      useUi.getState().notify(e instanceof Error ? e.message : 'Import failed');
      return null;
    }
  },
}));
