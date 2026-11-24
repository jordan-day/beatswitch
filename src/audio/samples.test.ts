import { existsSync, readFileSync } from 'node:fs';
import { Note } from 'tonal';
import { describe, expect, it } from 'vitest';
import { DRUM_ROWS, KEYS_SOUNDS, MELODY_SOUNDS, SAMPLED_INSTRUMENTS, SYNTH_KITS } from '../state/types';
import { kitSamplePath } from './builtinSamples';

const DIR = 'public/samples/';
const manifest = JSON.parse(readFileSync(DIR + 'manifest.json', 'utf8')) as { sets: Record<string, Record<string, string>> };

describe('bundled samples', () => {
  it('every recorded instrument has several real notes, all on disk', () => {
    for (const name of SAMPLED_INSTRUMENTS) {
      const notes = manifest.sets[name];
      expect(notes, name).toBeDefined();
      expect(Object.keys(notes).length, name).toBeGreaterThanOrEqual(5);
      for (const [note, path] of Object.entries(notes)) {
        expect(Note.midi(note), `${name} ${note}`).not.toBeNull();
        expect(existsSync(DIR + path), path).toBe(true);
      }
    }
  });

  it('every recorded instrument is offered as a chord or melody sound', () => {
    for (const name of SAMPLED_INSTRUMENTS) {
      expect([...KEYS_SOUNDS, ...MELODY_SOUNDS] as string[]).toContain(name);
    }
  });

  it('every drum row has a file for every recorded kit sound', () => {
    for (const row of DRUM_ROWS)
      for (const kit of SYNTH_KITS) {
        const path = kitSamplePath(row, kit);
        if (kit === 'dusty' || kit === 'soft') expect(path).toBeNull();
        else expect(existsSync(DIR + path!), `${row}/${kit}: ${path}`).toBe(true);
      }
  });

  it('files are small, mono 22.05 kHz 16-bit WAVs', () => {
    for (const set of Object.values(manifest.sets))
      for (const path of Object.values(set)) {
        const b = readFileSync(DIR + path);
        expect(b.toString('ascii', 0, 4)).toBe('RIFF');
        expect(b.readUInt16LE(22)).toBe(1); // mono
        expect(b.readUInt32LE(24)).toBe(22050);
        expect(b.readUInt16LE(34)).toBe(16);
        expect(b.length).toBeLessThan(200 * 1024);
      }
  });
});
