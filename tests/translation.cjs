const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { patchBuffer } = require('../src/patch.cjs');
const { readAssets, sha256 } = require('../src/assets.cjs');
const supplement = require('../translations/zh-tw-supplement.json');

function literal(source, at) {
  assert.equal(source[at], '{');
  let depth = 0, quote = '';
  for (let i = at; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if ('"\'`'.includes(c)) quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(at, i + 1);
  }
  throw new Error('Unterminated locale object');
}
function flatten(object, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(object)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[name] = value;
    else flatten(value, name, out);
  }
  return out;
}
async function evaluate(source, zhSource) {
  const prefix = source.slice(source.indexOf('const Tt='), source.indexOf('const ks='));
  const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(prefix, context, { timeout: 5000 });
  const start = zhSource.indexOf('}(e,') + 4;
  assert(start > 4);
  const local = literal(zhSource, start);
  // Use the game's own merge and final language-loader functions.
  const registry = source.indexOf(',Ds={');
  assert(registry > 0);
  vm.runInContext(`const ks={zh:async()=> $t(xs(Ts(function merge(a,b){const o={...a};for(const[k,v]of Object.entries(b))o[k]=v&&typeof v==="object"&&!Array.isArray(v)?merge(a[k]||{},v):v;return o}(Tt,${local})),"zh"),"zh")};const ` +
    source.slice(registry + 1, source.indexOf('function Ws(')), context, { timeout: 5000 });
  const before = vm.runInContext('JSON.stringify(Ds.en)', context);
  const result = await vm.runInContext('Ls("zh")', context, { timeout: 5000 });
  assert.equal(vm.runInContext('JSON.stringify(Ds.en)', context), before);
  assert.equal(vm.runInContext('Wt("en")', context), 'Mine Pond');
  return { strings: flatten(result), pond: vm.runInContext('Wt("zh")', context), english: before };
}
async function main() {
  assert(process.argv[2], 'Provide a compatible original executable');
  const original = fs.readFileSync(process.argv[2]);
  assert.throws(() => patchBuffer(Buffer.from('unsupported-version')), /Unsupported game version/);
  const result = patchBuffer(original);
  const assets = readAssets(original).assets;
  const nextAssets = readAssets(result.binary).assets;
  assert.equal(assets.length, nextAssets.length);
  const extract = (name, binary = original) => {
    const asset = (binary === original ? assets : nextAssets).find(a => a.name === name);
    return zlib.brotliDecompressSync(binary.subarray(asset.offset, asset.offset + asset.length)).toString('utf8');
  };
  let unchanged = 0;
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i], b = nextAssets[i];
    if (a.name === '/assets/editors-BtXOynup.js') continue;
    assert.equal(a.name, b.name);
    assert.equal(sha256(original.subarray(a.offset, a.offset + a.length)), sha256(result.binary.subarray(b.offset, b.offset + b.length)));
    unchanged++;
  }
  const zh = extract('/assets/zh-D7DQG91_.js');
  const before = await evaluate(extract('/assets/editors-BtXOynup.js'), zh);
  const after = await evaluate(result.code, zh);
  assert.equal(before.english, after.english);
  assert.deepEqual(Object.keys(before.strings), Object.keys(after.strings));
  assert.equal(after.pond, '礦坑池塘');
  const tokens = text => (text.match(/\{[^{}]+\}|<[^>]+>/g) || []).sort();
  for (const [key, value] of Object.entries(after.strings)) {
    if (key in supplement) {
      assert.equal(value, supplement[key], key);
      assert.deepEqual(tokens(value), tokens(before.strings[key]), key);
    } else assert.equal(value, before.strings[key], key);
    assert(!/rebirb/i.test(value), key);
  }
  console.log(`PASS: ${Object.keys(supplement).length} supplements, ${Object.keys(after.strings).length} locale paths, ${unchanged} unchanged assets, English untouched, invalid version refused`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
