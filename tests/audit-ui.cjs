const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const zlib = require('node:zlib');
const { readAssets } = require('../src/assets.cjs');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node tests/audit-ui.cjs <birb.exe> <output-directory>');
const binary = fs.readFileSync(input);
const sources = readAssets(binary).assets.filter(a => /^\/assets\/(editors|game|main|maps|audio)-.*\.js$/.test(a.name)).map(a => [path.basename(a.name), zlib.brotliDecompressSync(binary.subarray(a.offset,a.offset+a.length)).toString('utf8')]);
fs.mkdirSync(output, { recursive: true });
const findings = [];
const tables = [];
const candidates = [];
const phrases = [];
const localeTables = [];
const templates = [];
let declarations=new Map(),cache=new Map();
function staticValue(node,seen=new Set()) {
  if (!node) return undefined;
  if (node.type === 'Literal') return node.value;
  if (node.type === 'Identifier') {
    if(cache.has(node.name))return cache.get(node.name);
    if(seen.has(node.name))return undefined;
    const next=new Set(seen);next.add(node.name);
    const value=staticValue(declarations.get(node.name),next);cache.set(node.name,value);return value;
  }
  if (node.type === 'ArrayExpression') return node.elements.map(n=>staticValue(n,seen));
  if (node.type === 'ObjectExpression') {
    const out={};
    for(const p of node.properties){
      if(p.type==='SpreadElement')Object.assign(out,staticValue(p.argument,seen));
      else out[p.key.name||p.key.value]=staticValue(p.value,seen);
    }
    return out;
  }
}
function flat(value, prefix = '', out = {}) {
  if (typeof value === 'string') out[prefix] = value;
  else if (value && typeof value === 'object') for (const [k,v] of Object.entries(value)) flat(v,prefix?`${prefix}.${k}`:k,out);
  return out;
}
for (const [file, source] of sources) {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  declarations=new Map(ast.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations.map(d=>[d.id.name,d.init])));cache=new Map();
  const functions = new Map();
  walk.fullAncestor(ast, (node, state, ancestors) => {
    const scope = [...ancestors].reverse().find(n => /Function/.test(n.type));
    const scopeName = scope?.id?.name || '(inline)';
    if (node.type === 'TemplateLiteral') {
      const chunks = node.quasis.map(q => q.value.cooked || q.value.raw);
      const text = chunks.join(' {EXPR} ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      const visible = chunks.join(' ¤ ').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
      if(chunks.some(c=>/<(?:div|span|label|p|h\d|button)\b/.test(c))&&/[A-Za-z]{3}/.test(visible))templates.push({file,start:node.start,end:node.end,text:visible});
      if (chunks.some(c => />\s*[A-Za-z][A-Za-z !?,:()/-]{2,}</.test(c))) candidates.push({file, start:node.start,end:node.end, scope:scopeName, kind:'html-text',text:text.slice(0,1800),source:source.slice(node.start,node.end)});
    }
    if (node.type === 'Literal' && typeof node.value === 'string' && /[A-Za-z]{3}/.test(node.value) && node.value.length < 1500) {
      const parent = ancestors.at(-2);
      const property = parent.type === 'Property' ? parent.key.name || parent.key.value : '';
      const assignment = ancestors.at(-2)?.type === 'AssignmentExpression' ? source.slice(parent.left.start,parent.left.end) : '';
      const call = ancestors.at(-2)?.type === 'CallExpression' ? source.slice(parent.callee.start,parent.callee.end) : '';
      if (/\.(textContent|innerText|placeholder|title)$/.test(assignment) || /(?:fillText|strokeText|alert|confirm|showToast)$/.test(call)) candidates.push({file,start:node.start,end:node.end,scope:scopeName,kind:'display-string',text:node.value,context:source.slice(node.start-100,node.end+100)});
      const central = file.startsWith('editors-') && node.start >= source.indexOf('const Tt=') && node.end < source.indexOf('function Wo(');
      if (!central && /^[A-Za-z0-9+{][^<>\n\r]{2,400}$/.test(node.value) && /[A-Za-z]{2} [A-Za-z]{2}/.test(node.value) && !/[\\/]|data:|https?:|rgb\(|font-|;/.test(node.value)) phrases.push({file,start:node.start,end:node.end,scope:scopeName,key:property,text:node.value,context:source.slice(node.start-90,node.end+90)});
    }
    if (node.type === 'VariableDeclarator' && ['Ff', 'hB', 'fJ', 'AJ', 'on'].includes(node.id.name) && node.init) {
      tables.push({ file, name: node.id.name, start: node.init.start, end: node.init.end, source: source.slice(node.init.start, node.init.end) });
    }
    if (node.type === 'ObjectExpression') {
      const keys = node.properties.map(p => p.key?.name || p.key?.value);
      if (keys.includes('en') && keys.some(k=>['pt','zh','ko','es'].includes(k))) {
        const value=staticValue(node), en=flat(value.en), zh=flat(value.zh);
        const missing=Object.fromEntries(Object.entries(en).filter(([k,v])=>!(k in zh)||v===zh[k]&&/[A-Za-z]{3}/.test(v)));
        localeTables.push({file,start:node.start,end:node.end,keys,englishCount:Object.keys(en).length,chineseCount:Object.keys(zh).length,missing});
      }
      if (keys.includes('en') && keys.includes('pt') && !keys.includes('zh')) findings.push({ file, kind: 'dictionary-no-zh', start: node.start, end: node.end, source: source.slice(node.start, node.end) });
    }
    if (node.type === 'Literal' && ['pt', 'en'].includes(node.value)) {
      const parent = ancestors.at(-2);
      if (parent.type !== 'BinaryExpression' && !(parent.type === 'CallExpression' && ['startsWith','includes'].includes(parent.callee.property?.name))) return;
      const fn = [...ancestors].reverse().find(n => /Function/.test(n.type) || n.type === 'MethodDefinition');
      if (!fn || functions.has(fn.start)) return;
      const name = fn.id?.name || ancestors.find(n => n.type === 'VariableDeclarator')?.id?.name || '(anonymous)';
      const code = source.slice(fn.start, fn.end);
      if (code.length < 100000) functions.set(fn.start, { file, kind: 'language-branch', name, start: fn.start, end: fn.end, source: code });
    }
  });
  findings.push(...functions.values());
}
fs.writeFileSync(path.join(output, 'branches.json'), JSON.stringify(findings, null, 2));
fs.writeFileSync(path.join(output, 'tables.json'), JSON.stringify(tables, null, 2));
fs.writeFileSync(path.join(output, 'candidates.json'), JSON.stringify(candidates, null, 2));
fs.writeFileSync(path.join(output, 'phrases.json'), JSON.stringify(phrases, null, 2));
fs.writeFileSync(path.join(output, 'locale-tables.json'), JSON.stringify(localeTables, null, 2));
fs.writeFileSync(path.join(output, 'templates.json'), JSON.stringify(templates, null, 2));
for (let i = 0; i < findings.length; i++) {
  const f = findings[i];
  console.log(i, f.file, f.kind, f.name || '', f.start, f.end - f.start, f.source.slice(0, 180));
}
console.log('UI CANDIDATES',candidates.length);
console.log('PHRASES',phrases.length);
