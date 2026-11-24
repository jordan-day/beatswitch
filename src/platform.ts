/**
 * Where the app is running. As a Claude artifact the page sits in a locked-down frame:
 * it can't start downloads itself (it asks the viewer through the `downloads` capability,
 * which only allows certain file types), and long #hash share links don't survive.
 */
interface DownloadsNs {
  save(req: { filename: string; data: Blob | string }): Promise<{ status: 'saved' | 'delivered' }>;
}
interface ClaudeHost {
  use(name: 'downloads'): Promise<DownloadsNs | null>;
}

const host = typeof window === 'undefined' ? undefined : (window as unknown as { claude?: ClaudeHost }).claude;

/** True when running inside a Claude artifact viewer. */
export const inArtifact = typeof host?.use === 'function';

let downloads: Promise<DownloadsNs | null> | null = null;
const getDownloads = () => (downloads ??= host ? host.use('downloads').catch(() => null) : Promise.resolve(null));

export type SaveOutcome = 'saved' | 'declined' | 'unavailable';

/** Hand a file to the viewer: a normal browser download on the web, the viewer's save prompt in an artifact. */
export async function saveFile(blob: Blob, filename: string): Promise<SaveOutcome> {
  if (!inArtifact) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return 'saved';
  }
  const d = await getDownloads();
  if (!d) return 'unavailable';
  try {
    await d.save({ filename, data: blob });
    return 'saved';
  } catch (e) {
    return (e as { code?: string })?.code === 'declined' ? 'declined' : 'unavailable';
  }
}

/** A filesystem-safe version of the beat's name. */
export const safeName = (name: string) => name.replace(/[^\w\- ]+/g, '').trim() || 'beat';
