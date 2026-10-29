const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

function readAssets(binary) {
  const pe = binary.readUInt32LE(0x3c);
  assert.equal(binary.toString('ascii', pe, pe + 4), 'PE\0\0');
  const base = Number(binary.readBigUInt64LE(pe + 48));
  const sections = [];
  const first = pe + 24 + binary.readUInt16LE(pe + 20);
  for (let i = 0; i < binary.readUInt16LE(pe + 6); i++) {
    const offset = first + i * 40;
    sections.push({
      rva: binary.readUInt32LE(offset + 12),
      size: binary.readUInt32LE(offset + 16),
      raw: binary.readUInt32LE(offset + 20),
    });
  }
  const fileOffset = address => {
    const rva = address - base;
    const section = sections.find(s => rva >= s.rva && rva < s.rva + s.size);
    return section ? section.raw + rva - section.rva : -1;
  };
  const assets = [];
  for (const section of sections) {
    for (let at = section.raw; at + 32 <= section.raw + section.size; at += 8) {
      const nameAt = fileOffset(Number(binary.readBigUInt64LE(at)));
      if (nameAt < 0 || binary[nameAt] !== 47) continue;
      const nameLength = Number(binary.readBigUInt64LE(at + 8));
      if (nameLength < 2 || nameLength > 250) continue;
      const name = binary.toString('utf8', nameAt, nameAt + nameLength);
      if (!/^\/[a-zA-Z0-9_! /@.()\-]+\.[a-zA-Z0-9]+$/.test(name)) continue;
      const offset = fileOffset(Number(binary.readBigUInt64LE(at + 16)));
      const length = Number(binary.readBigUInt64LE(at + 24));
      if (offset < 0 || length <= 0 || offset + length > binary.length) continue;
      assets.push({ name, offset, length, record: at });
    }
  }
  assert(assets.length > 100, `Unexpected asset count: ${assets.length}`);
  assert.equal(new Set(assets.map(a => a.name)).size, assets.length);
  return { assets, sections, base };
}

module.exports = { readAssets, sha256 };
