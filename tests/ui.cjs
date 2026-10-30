const vm = require('node:vm');
const assert = require('node:assert/strict');
const acorn = require('acorn');
const walk = require('acorn-walk');
const ui = require('../translations/ui-zh-tw.json');
const plain = value => JSON.parse(JSON.stringify(value));
const flatten = value => typeof value === 'string' ? [value] : Object.values(value).flatMap(flatten);

function index(source) {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const functions = new Map(), variables = new Map();
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration') functions.set(node.id.name, source.slice(node.start, node.end));
    if (node.type === 'VariableDeclaration') for (const d of node.declarations) {
      if (d.init) variables.set(d.id.name, source.slice(d.init.start, d.init.end));
    }
  }
  return { source, ast, functions, variables };
}
function context(globals = {}) {
  return vm.createContext(globals, { codeGeneration: { strings: false, wasm: false } });
}
function run(code, ctx) { return vm.runInContext(code, ctx, { timeout: 5000 }); }
function evaluateTable(parsed, name, language, dependencies = []) {
  const ctx = context({ p: () => language, Qo: () => language });
  run(dependencies.map(d => 'const '+d+'='+parsed.variables.get(d)+';').join('') + parsed.functions.get(name), ctx);
  return plain(run(name+'('+JSON.stringify(language)+')', ctx));
}
function fakeDocument() {
  const created = [];
  class Element {
    constructor(tag) { this.tag = tag; this.style = {}; this.dataset = {}; this.listeners = {}; this.children = []; this.isConnected = true; }
    setAttribute(k, v) { this[k] = v; }
    addEventListener(k, v) { this.listeners[k] = v; }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.append(item); }
    focus() {} select() {} remove() {}
    querySelector() { return new Element('button'); }
  }
  const document = {
    documentElement: { lang: 'zh-Hant' },
    body: new Element('body'), activeElement: null,
    getElementById: () => null,
    createElement: tag => { const node = new Element(tag); created.push(node); return node; },
  };
  return { document, HTMLElement: Element, created };
}

async function testUi(original, patched) {
  const before = Object.fromEntries(Object.entries(original).map(([k,s]) => [k,index(s)]));
  const after = Object.fromEntries(Object.entries(patched).map(([k,s]) => [k,index(s)]));
  assert.equal(evaluateTable(before.editors,'GA','zh').title,'Abyssal Workshop', 'Original screenshot regression');
  const checks = [
    ['editors','GA','workshop',[]], ['editors','mo','echoField',[]],
    ['editors','Lf','witchHouse',['Of','Ff']], ['game','mB','nestFurniture',['pB','hB']],
    ['game','fU','saveExport',[]], ['game','bJ','steamLink',['yJ','fJ']],
    ['game','wJ','webLink',['vJ','AJ']],
  ];
  for (const [file,name,group,deps] of checks) {
    const en = evaluateTable(before[file],name,'en',deps);
    const zh = evaluateTable(after[file],name,'zh',deps);
    assert.deepEqual(zh,ui[group],group);
    const tokens = value => flatten(value).join('\n').match(/\{[^{}]+\}/g) || [];
    assert.deepEqual(tokens(zh).sort(),tokens(en).sort(),group + ' placeholders');
    assert.equal(flatten(zh).length,flatten(en).length,group + ' key coverage');
    for (const lang of ['en','pt','zh-CN','ko']) assert.deepEqual(evaluateTable(after[file],name,lang,deps),evaluateTable(before[file],name,lang,deps),group + ' ' + lang);
  }
  for(const lang of ['zh','en','pt']) {
    for(const kind of ['editors','game','main']) {
      const ctx=context({p:()=>lang,Qo:()=>lang,t:()=>lang});
      run(after[kind].functions.get('__birbZhLabel'),ctx);
      for(const [en,zh] of Object.entries(ui.direct)) assert.equal(run('__birbZhLabel('+JSON.stringify(en)+','+JSON.stringify(zh)+')',ctx),lang==='zh'?zh:en);
    }
  }
  for(const [name,key,wanted] of [['Bv','parrot',ui.parrot],['YS','reactions',ui.reactions]]) {
    const ctx=context();
    run('const QS='+after.game.variables.get('QS')+';const '+name+'='+after.game.variables.get(name)+';',ctx);
    const otherLanguages=run('JSON.stringify(Object.fromEntries(Object.entries('+name+').filter(([k])=>k!=="zh")))',ctx);
    const statement=after.game.ast.body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&patched.game.slice(n.start,n.end).startsWith(name+'.zh'));
    assert(statement,name+' override statement');
    run(patched.game.slice(statement.start,statement.end),ctx);
    assert.deepEqual(plain(run(name+'.zh.'+key,ctx)),wanted);
    assert.equal(run('JSON.stringify(Object.fromEntries(Object.entries('+name+').filter(([k])=>k!=="zh")))',ctx),otherLanguages);
  }
  const camera=context({p:()=> 'zh'});
  run('const SK='+after.game.variables.get('SK')+';'+after.game.functions.get('CK'),camera);
  assert.equal(run('CK()[0]',camera),ui.parrotCamera);

  // Run the game's exact workshop header and body renderers, not a rewritten UI.
  let opener, body;
  walk.fullAncestor(after.game.ast, (node, state, ancestors) => {
    if (node.type === 'Literal' && node.value === 'birb-hud-container aw-window') {
      const fn = [...ancestors].reverse().find(n => n.type === 'FunctionExpression');
      opener = patched.game.slice(fn.start, fn.end);
    }
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.left.object.name === 'w' && node.left.property.name === 'innerHTML' && ancestors.some(n => n.type === 'FunctionDeclaration' && n.id.name === 'mA')) {
      const fn = node.right.callee;
      assert.equal(fn.type,'FunctionExpression');
      body = patched.game.slice(fn.start,fn.end);
    }
  });
  assert(opener && body, 'Workshop renderer not found');
  for (const lang of ['zh','en']) {
    const dom = fakeDocument();
    let memoryUnlocked = true;
    const labels = evaluateTable(after.editors,'GA',lang);
    const ctx = context({ ...dom, p:()=>lang, b:()=>labels, s:(_state,key)=>key!=='memory'||memoryUnlocked,
      _b:state=>state.fishing.abyssalWorkshop, h:()=>({multiplier:1}), Qb:new Map([['test-fish',{id:'test-fish',icon:'fish'}]]),
      Ob:()=>'<span></span>', Ub:{}, Hb:String, Yb:()=>'', a:()=>true,
      c:{moneta:500,fish:[]}, g:()=>1000, f:()=>100, m:String, A:()=>true, zb:()=>lang==='zh'?'測試魚':'Test fish',
      uA:()=>{}, aA:()=>null, mA:()=>{}, cA:'workshop-test', sA:'memory',
      lA:'', oA:'', rA:null,
    });
    run(after.game.functions.get('__birbZhLabel'),ctx);
    const state = { fishing:{abyssalWorkshop:{memoryTargetId:null,memoryMisses:0,lensCrafted:false}},resources:{} };
    ctx.game={state};
    run('('+opener+')(game)',ctx);
    const header=dom.created.find(n=>n.tag==='section').innerHTML;
    assert(header.includes(labels.title) && header.includes(labels.memory) && header.includes(labels.bench));
    ctx.state=state;
    const render=tab=>run('('+body+')(state,'+JSON.stringify(tab)+',"")',ctx);
    const memory=render('memory');
    assert(memory.includes(labels.memoryEmpty) && memory.includes(labels.search) && memory.includes(labels.memoryGain));
    state.fishing.abyssalWorkshop.memoryTargetId='test-fish';
    const selected=render('memory');
    assert(selected.includes(labels.clear) && selected.includes(labels.rollWeight));
    state.fishing.abyssalWorkshop.memoryTargetId=null;
    state.fishing.abyssalWorkshop.lensCrafted=true;
    assert(render('memory').includes(labels.memoryLensGain));
    assert(render('bench').includes(labels.crafted));
    state.fishing.abyssalWorkshop.lensCrafted=false;
    const bench=render('bench');
    assert(bench.includes(labels.craft) && bench.includes(labels.lens) && bench.includes(labels.cost));
    assert(bench.includes(lang==='zh'?'莫內塔幣':'Moneta'));
    memoryUnlocked=false;
    assert(render('memory').includes(labels.memoryLocked));
    assert(render('bench').includes(labels.lensLocked));
    if(lang==='zh') for(const text of [header,memory,bench]) assert(!/Abyssal Workshop|Hook Memory|Choose a fish|Search fish|Workbench|Prismatic Lens/.test(text));
  }

  // Steam recovery dialog and error dialog: verify actual DOM text assignments.
  for (const lang of ['zh','en','pt']) {
    const dom=fakeDocument();let captured;
    const panel=new dom.HTMLElement('panel');
    const ctx=context({...dom,t:()=>lang,window:{location:{reload(){}}},hn:options=>{captured=options;return panel;}});
    run('const cn='+after.main.variables.get('cn')+',on='+after.main.variables.get('on')+';'+after.main.functions.get('mn'),ctx);
    run('mn()',ctx);
    const expected=lang==='zh'?ui.steamStartup:plain(run(lang==='pt'?'cn':'on',ctx));
    assert.equal(captured.title,expected.waitingTitle);
    assert.equal(captured.lines[0],expected.waiting);
  }
  const dom=fakeDocument();let copyWorks=true;
  const ctx=context({...dom,navigator:{language:'zh-TW'},H:()=>{},Z:async()=>copyWorks,window:{__TAURI_INTERNALS__:{},location:{reload(){}}}});
  run(after.main.functions.get('Y'),ctx);
  run('Y("test", "sample failure")',ctx);
  assert(dom.created.some(n=>n.textContent===ui.runtimeFailure['Birb needs to reload']));
  assert(dom.created.some(n=>n.textContent===ui.runtimeFailure['Unable to continue. Reload to try again from your last save.']));
  const copy=dom.created.find(n=>n.id==='runtime-failure-copy');
  await copy.listeners.click();
  assert(dom.created.some(n=>n.textContent===ui.runtimeFailure['Diagnostic copied.']));
  copyWorks=false;await copy.listeners.click();
  assert(dom.created.some(n=>n.textContent===ui.runtimeFailure['Could not copy automatically. Copy the text below manually.']));
  console.log('PASS: independent UI dictionaries, real workshop renderers (memory, lens, bench, locked), Steam dialogs, error-dialog DOM, other languages preserved');
}
module.exports = { testUi };
