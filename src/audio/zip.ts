/**
 * A minimal, uncompressed ("stored") .zip writer for a single file.
 * Used where .wav can't be saved directly (Claude artifacts only allow certain file types,
 * .zip among them), so the WAV inside stays full quality.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipSingleFile(filename: string, data: Uint8Array, date = new Date()): Uint8Array {
  const name = new TextEncoder().encode(filename);
  const crc = crc32(data);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true); // local file header
  local.setUint16(4, 20, true); // version needed
  local.setUint16(6, 0x0800, true); // UTF-8 names
  local.setUint16(8, 0, true); // stored, no compression
  local.setUint16(10, dosTime, true);
  local.setUint16(12, dosDate, true);
  local.setUint32(14, crc, true);
  local.setUint32(18, data.length, true);
  local.setUint32(22, data.length, true);
  local.setUint16(26, name.length, true);
  local.setUint16(28, 0, true);

  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true); // central directory header
  central.setUint16(4, 20, true);
  central.setUint16(6, 20, true);
  central.setUint16(8, 0x0800, true);
  central.setUint16(10, 0, true);
  central.setUint16(12, dosTime, true);
  central.setUint16(14, dosDate, true);
  central.setUint32(16, crc, true);
  central.setUint32(20, data.length, true);
  central.setUint32(24, data.length, true);
  central.setUint16(28, name.length, true);
  central.setUint32(42, 0, true); // offset of local header

  const centralOffset = 30 + name.length + data.length;
  const centralSize = 46 + name.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(8, 1, true);
  end.setUint16(10, 1, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);

  const out = new Uint8Array(centralOffset + centralSize + 22);
  let o = 0;
  for (const part of [new Uint8Array(local.buffer), name, data, new Uint8Array(central.buffer), name, new Uint8Array(end.buffer)]) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}
