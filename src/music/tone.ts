import type { MelodySound, MelodyTone } from '../state/types';

/**
 * How each instrument naturally starts and ends a note (seconds). These are the instrument's own
 * feel; the "Shape the sound" sliders move away from them.
 */
export const FEEL: Record<string, { attack: number; release: number }> = {
  piano: { attack: 0, release: 1.0 },
  vibes: { attack: 0, release: 1.4 },
  kalimba: { attack: 0, release: 0.9 },
  glock: { attack: 0, release: 1.4 },
  // breath-like onset and a soft tail, so held notes sound played rather than plucked
  ocarina: { attack: 0.08, release: 0.55 },
  flute: { attack: 0.06, release: 0.35 },
  lead: { attack: 0.01, release: 0.3 },
  rhodes: { attack: 0.005, release: 1.4 },
  pad: { attack: 0.35, release: 2 },
  musicbox: { attack: 0.002, release: 0.8 },
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// slider position (0..1) <-> sound
export const softToAttack = (soft: number) => 0.002 + clamp01(soft) * 0.3; // 0 = instant, 1 = a slow swell
export const fadeToRelease = (fade: number) => 0.1 + clamp01(fade) * 1.9; // 0 = short, 1 = rings for ~2 s
export const vibratoToDepth = (v: number) => clamp01(v) * 0.25;
export const brightToCutoff = (b: number) => 600 * Math.pow(30, clamp01(b)); // 600 Hz (dark) to 18 kHz (open)

const attackToSoft = (a: number) => clamp01((a - 0.002) / 0.3);
const releaseToFade = (r: number) => clamp01((r - 0.1) / 1.9);

/** The sliders' resting positions for an instrument: what it sounds like with no shaping. */
export function defaultTone(sound: MelodySound): MelodyTone {
  const f = FEEL[sound] ?? FEEL.musicbox;
  return {
    soft: attackToSoft(f.attack),
    fade: releaseToFade(f.release),
    vibrato: sound === 'ocarina' ? 0.3 : 0, // a player's gentle breath vibrato
    bright: 1,
  };
}

/** The shaping in effect: the melody's own settings, or the instrument's defaults. */
export const resolveTone = (sound: MelodySound, tone?: MelodyTone): MelodyTone => ({ ...defaultTone(sound), ...tone });
