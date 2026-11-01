// 檢查 data/ 底下所有 JSON 的互相引用：道具、狀態、屬性、商店、樓層 id 打錯字，或動作名稱拼錯。
// 用法：node tools/check-data.js（有錯誤時結束碼為 1）
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

// 屬性與動作清單以 index.html 為準，避免兩邊不同步
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const STATS = [...html.match(/const STATS = \{([^}]*)\}/)[1].matchAll(/(\w+):/g)].map(m => m[1]);
const ACTIONS = new Set([...html.slice(html.indexOf('function run('), html.indexOf('// ---------- 場景')).matchAll(/\ba\.(\w+)/g)].map(m => m[1]));
for (const k of ['ok', 'fail', 'why', 'cls', 'then', 'else', 'text', 'dc']) ACTIONS.add(k); // 動作的附屬欄位
const LISTS = ['onClick', 'do', 'ok', 'fail', 'then', 'else', 'onRoom', 'onFail']; // 這些欄位的值是動作清單

const ITEMS = read('data/items.json'), STATUS = read('data/statuses.json'), CHARS = read('data/characters.json');
const LEVELS = Object.fromEntries(fs.readdirSync(path.join(root, 'data/levels')).filter(f => f.endsWith('.json')).map(f => [f.slice(0, -5), read(`data/levels/${f}`)]));
const errors = [], warnings = [], flagsSet = new Set(), flagsRead = [];
const err = (where, msg) => errors.push(`${where}：${msg}`);

const item = (where, id) => ITEMS[id] || err(where, `沒有道具「${id}」`);
const stat = (where, k) => STATS.includes(k) || err(where, `沒有屬性「${k}」（可用：${STATS.join(' ')}）`);
const statMap = (where, m) => m && typeof m === 'object' && Object.keys(m).forEach(k => stat(where, k));
const status = (where, id) => id === true || STATUS[id] || err(where, `沒有狀態「${id}」`);

// 走過任意資料，遇到認得的欄位就檢查；lv 是所在樓層（找商店用）
function walk(x, where, lv) {
  if (Array.isArray(x)) return x.forEach((v, i) => walk(v, `${where}[${i}]`, lv));
  if (!x || typeof x !== 'object') return;
  for (const [k, v] of Object.entries(x)) {
    const at = `${where}.${k}`;
    if (LISTS.includes(k) && Array.isArray(v))
      v.forEach((a, i) => a && typeof a === 'object' && Object.keys(a).forEach(ak => ACTIONS.has(ak) || err(`${at}[${i}]`, `不認得的動作「${ak}」`)));
    if (k === 'check' || k === 'haggle') stat(at, v);
    else if (['give', 'take', 'ifHas', 'need', 'get', 'pay', 'payCheap', 'startItems'].includes(k)) [].concat(v).forEach(id => item(at, id));
    else if (k === 'status' || k === 'cure') [].concat(v).forEach(id => status(at, id));
    else if (k === 'stats' || k === 'passive' || (k === 'dc' && typeof v === 'object')) statMap(at, v);
    else if (k === 'goto' && !LEVELS[v]) err(at, `沒有樓層檔 data/levels/${v}.json`);
    else if (k === 'shop' && typeof v === 'string' && !lv?.shops?.[v]) err(at, `這一層沒有商店「${v}」`);
    else if (k === 'rand' || k === 'events') [].concat(v).forEach((r, i) => (typeof r?.w !== 'number' || !Array.isArray(r.do)) && err(`${at}[${i}]`, '每一項要有數字 w 和動作清單 do'));
    else if (k === 'set') flagsSet.add(v);
    else if (k === 'ifFlag') flagsRead.push([at, v]);
    if (k === 'use' && v.stat) stat(`${at}.stat`, v.stat);
    walk(v, at, lv);
  }
}

for (const [id, lv] of Object.entries(LEVELS)) {
  if (lv.stub) { if (!lv.name) err(`levels/${id}`, '施工中樓層要有 name'); continue; }
  for (const k of ['name', 'stages', 'objects', 'exit']) if (lv[k] === undefined) err(`levels/${id}`, `缺少 ${k}`);
  walk(lv, `levels/${id}`, lv);
}
walk(ITEMS, 'items'); walk(STATUS, 'statuses'); walk(CHARS, 'characters');
for (const [at, f] of flagsRead) if (!flagsSet.has(f)) warnings.push(`${at}：旗標「${f}」沒有任何地方 set`);

for (const w of warnings) console.log('⚠ ' + w);
for (const e of errors) console.log('✖ ' + e);
console.log(errors.length ? `\n${errors.length} 個錯誤` : `資料檢查通過（${Object.keys(LEVELS).length} 個樓層、${Object.keys(ITEMS).length} 種道具、${Object.keys(STATUS).length} 種狀態）`);
process.exit(errors.length ? 1 : 0);
