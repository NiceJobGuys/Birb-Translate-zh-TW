const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { readAssets, sha256 } = require('./assets.cjs');
const manifest = require('../manifest.json');
const supplement = require('../translations/zh-tw-supplement.json');

function patchBuffer(original) {
  assert.equal(sha256(original), manifest.originalSha256, 'Unsupported game version; no files changed');
  assert.equal(Object.keys(supplement).length, manifest.supplementEntries);
  assert(Object.values(supplement).every(value => typeof value === 'string'));
  const { assets } = readAssets(original);
  const asset = assets.find(a => a.name === '/assets/editors-BtXOynup.js');
  assert(asset, 'Expected script asset is missing');
  const source = zlib.brotliDecompressSync(original.subarray(asset.offset, asset.offset + asset.length)).toString('utf8');
  const loader = 'const t=Bn(la(oa(i,e),e),e);return Ds[e]=t,t';
  const pond = 'function Wt(e){return"pt"===e?"Lago da Mina":"Mine Pond"}';
  assert.equal(source.split(loader).length, 2, 'Unexpected language loader');
  assert.equal(source.split(pond).length, 2, 'Unexpected pond label');
  const code = source.replace(loader,
    'const t=Bn(la(oa(i,e),e),e);return Ds[e]="zh"===e?jt(t,Object.entries(' + JSON.stringify(supplement) + ')):t,Ds[e]')
    .replace(pond, 'function Wt(e){return"zh"===e?"礦坑池塘":"pt"===e?"Lago da Mina":"Mine Pond"}');
  const compressed = zlib.brotliCompressSync(Buffer.from(code), {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  });
  assert(compressed.length <= asset.length, 'Compressed script exceeds reserved space');
  const binary = Buffer.from(original);
  binary.fill(0, asset.offset, asset.offset + asset.length);
  compressed.copy(binary, asset.offset);
  binary.writeBigUInt64LE(BigInt(compressed.length), asset.record + 24);
  assert.equal(zlib.brotliDecompressSync(binary.subarray(asset.offset, asset.offset + compressed.length)).toString('utf8'), code);
  const allowed = [[asset.offset, asset.offset + asset.length], [asset.record + 24, asset.record + 32]];
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== binary[i]) assert(allowed.some(([a, b]) => i >= a && i < b), `Unexpected change at ${i}`);
  }
  return { binary, code, report: { ...manifest, patchedSha256: sha256(binary), runtime: process.version } };
}

module.exports = { patchBuffer };
if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  assert(input && output, 'Usage: node src/patch.cjs <original-birb.exe> <output-birb.exe>');
  assert.notEqual(path.resolve(input).toLowerCase(), path.resolve(output).toLowerCase(), 'Output must differ from input');
  const result = patchBuffer(fs.readFileSync(input));
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, result.binary);
  fs.writeFileSync(output + '.receipt.json', JSON.stringify(result.report, null, 2) + '\n');
  console.log(JSON.stringify(result.report));
}
