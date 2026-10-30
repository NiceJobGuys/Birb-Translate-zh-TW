const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { readAssets, sha256 } = require('./assets.cjs');
const manifest = require('../manifest.json');
const supplement = require('../translations/zh-tw-supplement.json');
const { patchUi, replaceOnce } = require('./ui-patch.cjs');

function patchBuffer(original) {
  assert.equal(sha256(original), manifest.originalSha256, 'Unsupported game version; no files changed');
  assert.equal(Object.keys(supplement).length, manifest.supplementEntries);
  assert(Object.values(supplement).every(value => typeof value === 'string'));
  const { assets } = readAssets(original);
  const binary = Buffer.from(original);
  const sources = {}, allowed = [], changedAssets = [];
  for (const kind of ['editors', 'game', 'main']) {
    const asset = assets.find(a => a.name === manifest.assets[kind]);
    assert(asset, `Expected ${kind} asset is missing`);
    let code = zlib.brotliDecompressSync(original.subarray(asset.offset, asset.offset + asset.length)).toString('utf8');
    if (kind === 'editors') {
      code = replaceOnce(code, 'const t=Bn(la(sa(i,e),e),e);return Do[e]=t,t',
        'const t=Bn(la(sa(i,e),e),e);return Do[e]="zh"===e?jt(t,Object.entries(' + JSON.stringify(supplement) + ')):t,Do[e]');
      code = replaceOnce(code, 'function Wt(e){return"pt"===e?"Lago da Mina":"Mine Pond"}',
        'function Wt(e){return"zh"===e?"礦坑池塘":"pt"===e?"Lago da Mina":"Mine Pond"}');
    }
    code = patchUi(kind, code);
    const compressed = zlib.brotliCompressSync(Buffer.from(code), {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
    });
    assert(compressed.length <= asset.length, `${kind} exceeds reserved space`);
    binary.fill(0, asset.offset, asset.offset + asset.length);
    compressed.copy(binary, asset.offset);
    binary.writeBigUInt64LE(BigInt(compressed.length), asset.record + 24);
    assert.equal(zlib.brotliDecompressSync(binary.subarray(asset.offset, asset.offset + compressed.length)).toString('utf8'), code);
    allowed.push([asset.offset, asset.offset + asset.length], [asset.record + 24, asset.record + 32]);
    sources[kind] = code;
    changedAssets.push({ name: asset.name, before: asset.length, after: compressed.length });
  }
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== binary[i]) assert(allowed.some(([a, b]) => i >= a && i < b), `Unexpected change at ${i}`);
  }
  return { binary, code: sources.editors, sources, report: { ...manifest, changedAssets, patchedSha256: sha256(binary), runtime: process.version } };
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
