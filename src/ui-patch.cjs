const assert = require('node:assert/strict');
const ui = require('../translations/ui-zh-tw.json');
const json = JSON.stringify;

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `UI patch anchor must occur once: ${before.slice(0, 90)}`);
  return source.replace(before, () => after);
}
function patchUi(kind, source) {
  const interpolation = text => '${__birbZhLabel(' + json(text) + ',' + json(ui.direct[text]) + ')}';
  const branch = (header, language, table) => {
    source = replaceOnce(source, header, header + `if("zh"===${language})return ${json(ui[table])};`);
  };
  if (kind === 'editors') {
    branch('function GA(e){', 'e', 'workshop');
    branch('function mo(e){', 'e', 'echoField');
    branch('function Lf(){', 'Qo()', 'witchHouse');
    source = replaceOnce(source, 'Power ${m}', interpolation('Power') + ' ${m}');
  } else if (kind === 'game') {
    branch('function mB(){', 'p()', 'nestFurniture');
    branch('function fU(){', 'p()', 'saveExport');
    branch('function bJ(){', 'p()', 'steamLink');
    branch('function wJ(){', 'p()', 'webLink');
    source = replaceOnce(source, 'function jY(){', `function jY(){if("zh"===p())return ${json(ui.goldOre)};`);
    source = replaceOnce(source, 'function CK(){return SK[p()]||SK.en}',
      `function CK(){const a=SK[p()]||SK.en;return"zh"===p()?[${json(ui.parrotCamera)},...a.slice(1)]:a}`);
    // Copy nested data: the base reaction dictionary is shared by other languages.
    source = replaceOnce(source, ';function WS(){',
      `;YS.zh={...YS.zh,reactions:{...YS.zh.reactions,...${json(ui.reactions)}}};function WS(){`);
    source = replaceOnce(source, 'function Nv(e){', `Bv.zh.parrot=${json(ui.parrot)};function Nv(e){`);
    for (const text of ['ARTIFACT CAUGHT!', 'RESET INSTINCTS', 'HP Regen is reduced to 50% while in combat.', 'Returns to 100% after 3s out of combat.']) {
      source = replaceOnce(source, text, interpolation(text));
    }
    assert.equal(source.split('} Moneta').length, 3, 'Expected two workshop currency suffixes');
    source = source.replaceAll('} Moneta', '} ' + interpolation('Moneta'));
    source = replaceOnce(source, 'title="Moneta ·', 'title="' + interpolation('Moneta') + ' ·');
  } else if (kind === 'main') {
    source = replaceOnce(source, 'function mn(){const e="pt"===t()?cn:on,',
      `function mn(){const e="zh"===t()?${json(ui.steamStartup)}:"pt"===t()?cn:on,`);
    source = replaceOnce(source, '="Parrot Cam"',
      `=(document.documentElement.lang==="zh-Hant"?${json(ui.parrotCamera)}:"Parrot Cam")`);
    const start = source.indexOf('function Y(e,t){');
    const end = source.indexOf('let X,Q=!1', start);
    assert(start >= 0 && end > start);
    let failure = source.slice(start, end);
    const isTraditional = '/^zh-(?:hant|tw|hk|mo)(?:-|$)/i.test(document.documentElement.lang||navigator.language)';
    for (const [english, chinese] of Object.entries(ui.runtimeFailure)) {
      failure = replaceOnce(failure, json(english), `(${isTraditional}?${json(chinese)}:${json(english)})`);
    }
    source = source.slice(0, start) + failure + source.slice(end);
    assert.equal(source.split('>INFUSION +').length, 3, 'Expected two infusion headings');
    source = source.replaceAll('>INFUSION +', '>' + interpolation('INFUSION') + ' +');
  }
  const accessor = { editors: 'Qo', game: 'p', main: 't' }[kind];
  assert(!source.includes('function __birbZhLabel('));
  return source + `\nfunction __birbZhLabel(en,zh){return"zh"===${accessor}()?zh:en}\n`;
}
module.exports = { patchUi, replaceOnce };
