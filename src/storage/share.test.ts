import LZString from 'lz-string';
import { describe, expect, it } from 'vitest';
import { buildPreset } from '../music/presets';
import { parseProject } from '../state/schema';
import { decodeProject, encodeProject, projectFromFile, projectToFile } from './share';
import { crc32, zipSingleFile } from '../audio/zip';
import { encodeWav } from '../audio/wav';
import { exportDuration } from '../audio/export';

describe('share links', () => {
  it('round-trips a project', () => {
    const p = buildPreset(2);
    p.drums.kick.steps[5] = 2;
    const back = decodeProject(encodeProject(p).hash);
    expect(back).toEqual(p);
  });

  it('round-trips shorter loops', () => {
    const p = buildPreset(0);
    p.bars = 2;
    const back = decodeProject(encodeProject(p).hash)!;
    expect(back.bars).toBe(2);
    expect(back.drums.hat.steps.slice(0, 32)).toEqual(p.drums.hat.steps.slice(0, 32));
    expect(back.drums.hat.steps.slice(32)).toEqual(p.drums.hat.steps.slice(0, 32));
  });

  it('swaps imported samples for the built-in kit', () => {
    const p = buildPreset(0);
    p.drums.snare.sound = { kind: 'user', id: 'abcdef0123456789', name: 'my snare' };
    const { hash, replacedSamples } = encodeProject(p);
    expect(replacedSamples).toBe(1);
    expect(decodeProject(hash)!.drums.snare.sound).toEqual({ kind: 'synth', id: 'dusty' });
  });

  it('keeps links reasonably short', () => {
    // a starter beat is a 5-block song now; links still fit comfortably in a chat message
    expect(encodeProject(buildPreset(0)).hash.length).toBeLessThan(1600);
  });

  it('rejects garbage', () => {
    expect(decodeProject('#b=not-a-real-link')).toBeNull();
    expect(decodeProject('#x=whatever')).toBeNull();
    expect(decodeProject('#b=' + LZString.compressToEncodedURIComponent('{"hello":1}'))).toBeNull();
  });

  it('clamps out-of-range values from untrusted data', () => {
    const p = parseProject({ version: 1, drums: {}, bpm: 9999, swing: -5, tonic: '<script>', bars: 3, chords: { slots: ['Am7', '<b>x</b>'] } })!;
    expect(p.bpm).toBe(95);
    expect(p.swing).toBe(0);
    expect(p.tonic).toBe('C');
    expect(p.bars).toBe(4);
    expect(p.chords.slots).toEqual([{ symbol: 'Am7' }, null, null, null]);
  });
});

describe('beat files', () => {
  it('round-trips a beat through a .json file, minus imported samples', () => {
    const p = buildPreset(0);
    p.drums.snare.sound = { kind: 'user', id: 'abcdef0123456789', name: 'my snare' };
    const { json, replacedSamples } = projectToFile(p);
    expect(replacedSamples).toBe(1);
    const back = projectFromFile(json)!;
    expect(back.chords).toEqual(p.chords);
    expect(back.melody).toEqual(p.melody);
    expect(back.drums.snare.sound).toEqual({ kind: 'synth', id: 'dusty' });
  });

  it('rejects files that are not beats', () => {
    expect(projectFromFile('not json')).toBeNull();
    expect(projectFromFile('{"hello": 1}')).toBeNull();
  });
});

describe('zip', () => {
  it('matches the standard CRC-32 and writes a valid single-file archive', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const z = zipSingleFile('beat.wav', data);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50);
    // stored data sits right after the 30-byte header and the name
    expect([...z.slice(30 + 8, 30 + 8 + 5)]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('export', () => {
  it('writes a valid WAV header', () => {
    const buf = encodeWav([new Float32Array(100), new Float32Array(100)], 44100);
    const v = new DataView(buf);
    expect(buf.byteLength).toBe(44 + 400);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(44100);
  });

  it('export length = loops x bars x 4 beats x 60/bpm', () => {
    const p = buildPreset(0);
    p.bpm = 80;
    p.bars = 4;
    expect(exportDuration(p, 4)).toBeCloseTo(4 * 4 * 4 * (60 / 80));
  });
});
