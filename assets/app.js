/* ═══════════════════════════════════════════════════════════════
   FLOWDECK — Now / Next / Someday / Checking task board
   dependency-free, localStorage-first, GitHub Gist sync
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ───────────────────────────────────────────────────────────────
   1. constants
   ─────────────────────────────────────────────────────────────── */
const APP       = 'flowdeck';
const SCHEMA    = 1;
const LS_STATE  = 'flowdeck.state.v1';
const LS_SYNC   = 'flowdeck.sync.v1';
const LS_UI     = 'flowdeck.ui.v1';
const GIST_FILE = 'flowdeck-data.json';

const PHASE = {
  now: {
    id:'now', label:'Now', jp:'いま動かす',
    ph:'いま動かすことを追加',
    emptyT:'いま動かすものはゼロ',
    emptyS:'Next から引き上げるか、思いついたことをここに直接足しましょう。'
  },
  next: {
    id:'next', label:'Next', jp:'次に着手',
    ph:'次に着手することを追加',
    emptyT:'次の弾がありません',
    emptyS:'Now が空いたときに迷わないよう、着手順の候補を並べておきます。'
  },
  someday: {
    id:'someday', label:'Someday', jp:'いつかやる',
    ph:'いつかやることを追加',
    emptyT:'温めているものはありません',
    emptyS:'すぐやらないが忘れたくないことを、期限つきで寝かせておけます。'
  },
  checking: {
    id:'checking', label:'Checking', jp:'確認・待ち',
    ph:'確認待ちを追加',
    emptyT:'待ちはありません',
    emptyS:'ボールが相手にあるタスクと、自分の最終確認待ちをここに置きます。'
  }
};
const PHASE_IDS_DEFAULT = ['now','next','someday','checking'];

const PALETTE = [
  '#ff6a4d','#f2789a','#f472b6','#a78bfa','#7c9cff','#60a5fa',
  '#3fc0b4','#4ade80','#b7d34a','#f2b03d','#d98b5f','#8b98ae'
];

const DEFAULT_LABELS = [
  ['プロダクト',        '#60a5fa'],
  ['カスタマーサクセス','#3fc0b4'],
  ['マネジメント',      '#a78bfa'],
  ['社内調整',          '#f2b03d'],
  ['学習・インプット',  '#b7d34a'],
  ['プライベート',      '#8b98ae']
];

const WDAY = ['日','月','火','水','木','金','土'];

/* ───────────────────────────────────────────────────────────────
   2. tiny dom helpers
   ─────────────────────────────────────────────────────────────── */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

function h(tag, props) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'dataset') { for (const d in v) if (v[d] != null) e.dataset[d] = v[d]; }
    else if (k === 'style') { for (const s in v) v[s] != null && e.style.setProperty(s, v[s]); }
    else if (k.slice(0,2) === 'on') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) e.setAttribute(k, '');   /* boolean 属性のみ。draggable のような enumerated 属性は 'true'/'false' の文字列で渡すこと */
    else e.setAttribute(k, v);
  }
  for (let i = 2; i < arguments.length; i++) app(e, arguments[i]);
  return e;
}
/** app(parent, child, child, …) — 配列もネストして受け付ける */
function app(parent) {
  for (let i = 1; i < arguments.length; i++) {
    const k = arguments[i];
    if (k == null || k === false || k === '') continue;
    if (Array.isArray(k)) { k.forEach(x => app(parent, x)); continue; }
    parent.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
/** IME 変換中の keydown（日本語入力の確定 Enter を誤検知しないため） */
const isComposing = e => !!(e.isComposing || e.keyCode === 229);

/* ── icon set (stroke, 24×24) ─────────────────────────────── */
const I = {
  check:   '<path d="M4.5 12.5l4.8 4.8L19.5 7"/>',
  plus:    '<path d="M12 5.5v13M5.5 12h13"/>',
  x:       '<path d="M6 6l12 12M18 6L6 18"/>',
  dots:    '<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  clock:   '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.9"/>',
  cal:     '<rect x="3.6" y="5.2" width="16.8" height="15.2" rx="2.4"/><path d="M3.6 10h16.8M8.4 3.4v3.4M15.6 3.4v3.4"/>',
  hourglass:'<path d="M7 3.6h10M7 20.4h10M8 3.6v3.2c0 2.3 4 3.6 4 5.2 0 1.6-4 2.9-4 5.2v3.2M16 3.6v3.2c0 2.3-4 3.6-4 5.2 0 1.6 4 2.9 4 5.2v3.2"/>',
  user:    '<circle cx="12" cy="8.4" r="3.6"/><path d="M4.8 20c.8-3.7 3.7-5.6 7.2-5.6s6.4 1.9 7.2 5.6"/>',
  eye:     '<path d="M2.6 12s3.6-6.2 9.4-6.2S21.4 12 21.4 12s-3.6 6.2-9.4 6.2S2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.5"/>',
  send:    '<path d="M4 12.6l15.6-7-5.2 15.6-3.1-6.6z"/><path d="M11.3 14.6L19.6 5.6"/>',
  trash:   '<path d="M4.6 7h14.8M9 7V5.4A1.4 1.4 0 0110.4 4h3.2A1.4 1.4 0 0115 5.4V7M6.4 7l.8 11.8A1.6 1.6 0 008.8 20.3h6.4a1.6 1.6 0 001.6-1.5L17.6 7"/>',
  copy:    '<rect x="8.6" y="8.6" width="11" height="11" rx="2.2"/><path d="M15.4 5.4H6.6A2.2 2.2 0 004.4 7.6v8.8"/>',
  gear:    '<circle cx="12" cy="12" r="2.9"/><path d="M12 3.6v2.1M12 18.3v2.1M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M3.6 12h2.1M18.3 12h2.1M5.2 18.8l1.5-1.5M17.3 6.7l1.5-1.5"/>',
  refresh: '<path d="M20 11.4A8 8 0 006.4 6.8L4 9.2"/><path d="M4 4.8v4.4h4.4"/><path d="M4 12.6A8 8 0 0017.6 17.2L20 14.8"/><path d="M20 19.2v-4.4h-4.4"/>',
  cloud:   '<path d="M6.8 18.4a4.2 4.2 0 01-.5-8.4 5.6 5.6 0 0110.9-1.6 3.9 3.9 0 01.6 7.8"/><path d="M12 12.4v7.2M9.4 17l2.6 2.6L14.6 17"/>',
  undo:    '<path d="M4.6 9.6h7.6a5.4 5.4 0 110 10.8H7"/><path d="M8 5.4L4.4 9.6 8 13.8"/>',
  alert:   '<path d="M12 4.6l8.4 14.6H3.6z"/><path d="M12 9.8v4.2"/><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>',
  inbox:   '<path d="M3.6 13.4h4l1.4 2.6h6l1.4-2.6h4"/><path d="M3.6 13.4L6 5.8h12l2.4 7.6v4.4a1.8 1.8 0 01-1.8 1.8H5.4a1.8 1.8 0 01-1.8-1.8z"/>',
  arrowR:  '<path d="M5 12h13M13 6.8l5.2 5.2-5.2 5.2"/>',
  arrowL:  '<path d="M19 12H6M11 6.8L5.8 12l5.2 5.2"/>',
  chevD:   '<path d="M6.4 9.6l5.6 5.2 5.6-5.2"/>',
  down:    '<path d="M12 4.6v12M6.8 11.4l5.2 5.2 5.2-5.2M4.6 20h14.8"/>',
  up:      '<path d="M12 19.4v-12M6.8 12.6L12 7.4l5.2 5.2M4.6 4h14.8"/>',
  ext:     '<path d="M14 5h5v5M19 5l-7.4 7.4"/><path d="M18 14.4v3.4a2.2 2.2 0 01-2.2 2.2H6.2A2.2 2.2 0 014 17.8V8.2A2.2 2.2 0 016.2 6h3.4"/>',
  tag:     '<path d="M11 4.6H6.4A1.8 1.8 0 004.6 6.4V11l8.6 8.6a1.8 1.8 0 002.5 0l4.1-4.1a1.8 1.8 0 000-2.5z"/><circle cx="8.6" cy="8.6" r="1.1" fill="currentColor" stroke="none"/>',
  spark:   '<path d="M12 3.4l1.9 5.3 5.3 1.9-5.3 1.9L12 17.8l-1.9-5.3L4.8 10.6l5.3-1.9z"/>',
  note:    '<path d="M6 4.6h12a1.4 1.4 0 011.4 1.4v12a1.4 1.4 0 01-1.4 1.4H6A1.4 1.4 0 014.6 18V6A1.4 1.4 0 016 4.6z"/><path d="M8 9h8M8 12.6h8M8 16.2h4.6"/>',
  archive: '<path d="M3.6 7.4h16.8M5.4 7.4v11.2A1.4 1.4 0 006.8 20h10.4a1.4 1.4 0 001.4-1.4V7.4M8 7.4V5.4A1.4 1.4 0 019.4 4h5.2A1.4 1.4 0 0116 5.4v2M10 12h4"/>',
  flame:   '<path d="M12 3.4c3 3.4 5.6 5.4 5.6 9.2A5.6 5.6 0 016.4 12.6c0-1.5.6-2.8 1.6-4 .3 1.3 1.1 2 2 2 0-3 1-5.2 2-7.2z"/>',
  filter:  '<path d="M4 6.4h16M7 12h10M10 17.6h4"/>',
  sort:    '<path d="M4 6.6h9M4 12h6.5M4 17.4h4"/><path d="M17.4 7.6v9.6M14.2 14.2l3.2 3.2 3.2-3.2"/>',
  checklist:'<path d="M4 7.2l1.9 1.9 3.1-3.4M4 16.2l1.9 1.9 3.1-3.4M12.6 7.4h7.4M12.6 16.6h7.4"/>',
  cycle:   '<path d="M4.6 10.2A7.6 7.6 0 0118 7.1"/><path d="M19.4 13.8A7.6 7.6 0 016 16.9"/><path d="M4.2 6.2v4.2h4.2M19.8 17.8v-4.2h-4.2"/>',
  layers:  '<path d="M12 3.6l8.4 4.3-8.4 4.3L3.6 7.9z"/><path d="M3.6 12.3l8.4 4.3 8.4-4.3"/><path d="M3.6 16.3l8.4 4.1 8.4-4.1"/>',
  bell:    '<path d="M6.9 9.8a5.1 5.1 0 1110.2 0c0 3.9 1.6 5.5 1.6 5.5H5.3s1.6-1.6 1.6-5.5z"/><path d="M10.2 18.6a2 2 0 003.6 0"/>',
  cmd:     '<rect x="3.4" y="4.8" width="17.2" height="14.4" rx="2.4"/><path d="M7.4 9.6l2.4 2.6-2.4 2.6M12.4 15h4.4"/>'
};
function svg(name, cls) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  e.setAttribute('viewBox', '0 0 24 24');
  e.setAttribute('class', cls || 'ico');
  e.setAttribute('aria-hidden', 'true');
  e.innerHTML = I[name] || '';
  return e;
}

/* ───────────────────────────────────────────────────────────────
   3. date utils
   ─────────────────────────────────────────────────────────────── */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2]-1, +m[3]) : null;
}
function addDays(s, n) { const d = parseYmd(s) || new Date(); d.setDate(d.getDate()+n); return ymd(d); }
function dayDiff(from, to) {
  const a = parseYmd(from), b = parseYmd(to);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}
function fmtDate(s, withWday) {
  const d = parseYmd(s); if (!d) return '';
  const base = `${d.getFullYear() === new Date().getFullYear() ? '' : d.getFullYear()+'/'}${d.getMonth()+1}/${d.getDate()}`;
  return withWday === false ? base : `${base}(${WDAY[d.getDay()]})`;
}
function fmtStamp(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const y = d.getFullYear() === new Date().getFullYear() ? '' : d.getFullYear() + '/';
  return `${y}${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtAgo(ms) {
  if (!ms) return 'まだ同期していません';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'たった今';
  if (s < 3600) return `${Math.floor(s/60)}分前`;
  if (s < 86400) return `${Math.floor(s/3600)}時間前`;
  return `${Math.floor(s/86400)}日前`;
}
/** 期限の相対表現 */
function dueInfo(due) {
  const d = dayDiff(today(), due);
  if (d == null) return null;
  if (d < 0)   return { d, txt:`${-d}日超過`, cls:'sub-danger', level:3 };
  if (d === 0) return { d, txt:'今日',        cls:'sub-danger', level:3 };
  if (d === 1) return { d, txt:'明日',        cls:'sub-warn',   level:2 };
  if (d <= 7)  return { d, txt:`あと${d}日`,  cls:'sub-warn',   level:1 };
  if (d <= 30) return { d, txt:`あと${d}日`,  cls:'sub-rel',    level:0 };
  return { d, txt:`あと${d}日`, cls:'sub-rel', level:0 };
}

/* ───────────────────────────────────────────────────────────────
   4. store
   ─────────────────────────────────────────────────────────────── */
const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

let state = null;
let cfg   = { token:'', gistId:'', auto:true, lastSyncAt:0, notify:{ enabled:false, hour:9, lastDate:'' } };
let ui    = { activePhase:'now', labelFilter:[], overdueOnly:false, archDays:60 };

function blankState() {
  const s = { schema:SCHEMA, app:APP, labels:{}, tasks:{}, templates:{},
              settings:{ phaseOrder:PHASE_IDS_DEFAULT.slice(), updatedAt:Date.now() },
              meta:{ deviceId:uid() } };
  DEFAULT_LABELS.forEach(([name, color], i) => {
    const id = uid();
    s.labels[id] = { id, name, color, order:i, updatedAt:Date.now() };
  });
  return s;
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_STATE);
    state = raw ? normalize(JSON.parse(raw)) : blankState();
  } catch (e) { console.warn('state load failed', e); state = blankState(); }
  try { const c = localStorage.getItem(LS_SYNC); if (c) Object.assign(cfg, JSON.parse(c)); } catch (e) {}
  try { const u = localStorage.getItem(LS_UI);   if (u) Object.assign(ui,  JSON.parse(u)); } catch (e) {}
  if (!state.settings.phaseOrder || state.settings.phaseOrder.length !== 4) {
    state.settings.phaseOrder = PHASE_IDS_DEFAULT.slice();
  }
  if (!PHASE[ui.activePhase]) ui.activePhase = 'now';
}
function normalize(s) {
  s = s || {};
  s.schema = SCHEMA; s.app = APP;
  s.tasks = s.tasks || {}; s.labels = s.labels || {}; s.templates = s.templates || {};
  s.settings = Object.assign({ phaseOrder:PHASE_IDS_DEFAULT.slice(), updatedAt:0 }, s.settings || {});
  s.meta = Object.assign({ deviceId:uid() }, s.meta || {});
  for (const id in s.tasks) {
    const t = s.tasks[id];
    t.id = id;
    t.phase = PHASE[t.phase] ? t.phase : 'next';
    t.title = String(t.title == null ? '' : t.title);
    t.note = t.note == null ? '' : String(t.note);
    t.order = Number.isFinite(t.order) ? t.order : 0;
    t.updatedAt = t.updatedAt || t.createdAt || Date.now();
    t.createdAt = t.createdAt || t.updatedAt;
    t.done = !!t.done;
    if (t.done && !t.doneAt) t.doneAt = t.updatedAt;
    if (!t.done) t.doneAt = null;
    t.p1 = !!t.p1;
    if (t.labelId && !s.labels[t.labelId]) t.labelId = null;
    t.subs = normSubs(t.subs);
    t.repeat = normRepeat(t.repeat);
    if (t.spawnedFrom == null) t.spawnedFrom = null;
  }
  const po = s.settings.phaseOrder;
  if (!Array.isArray(po) || po.length !== 4 || PHASE_IDS_DEFAULT.some(p => po.indexOf(p) < 0)) {
    s.settings.phaseOrder = PHASE_IDS_DEFAULT.slice();
  }
  for (const id in s.labels) { const l = s.labels[id]; l.id = id; l.order = Number.isFinite(l.order) ? l.order : 0; l.updatedAt = l.updatedAt || Date.now(); }
  for (const id in s.templates) {
    const tp = s.templates[id];
    tp.id = id;
    tp.name = String(tp.name == null ? 'テンプレート' : tp.name);
    tp.order = Number.isFinite(tp.order) ? tp.order : 0;
    tp.updatedAt = tp.updatedAt || Date.now();
    tp.items = Array.isArray(tp.items) ? tp.items.filter(it => it && it.title).map(it => ({
      title:     String(it.title),
      phase:     PHASE[it.phase] ? it.phase : 'next',
      labelId:   (it.labelId && s.labels[it.labelId]) ? it.labelId : null,
      dueOffset: Number.isFinite(it.dueOffset) ? it.dueOffset : null,
      note:      it.note == null ? '' : String(it.note),
      p1:        !!it.p1,
      subs:      Array.isArray(it.subs) ? it.subs.map(x => String(x)).filter(Boolean) : []
    })) : [];
  }
  return s;
}
/** サブタスク配列の正規化 */
function normSubs(v) {
  if (!Array.isArray(v)) return [];
  return v.filter(x => x && x.text != null)
          .map(x => ({ id:x.id || uid(), text:String(x.text), done:!!x.done }));
}
/** 繰り返し設定の正規化。不正なら null（= 繰り返しなし） */
function normRepeat(r) {
  if (!r || typeof r !== 'object') return null;
  const kind = ['daily','weekdays','weekly','monthly'].indexOf(r.kind) >= 0 ? r.kind : null;
  if (!kind) return null;
  const out = { kind, base: r.base === 'done' ? 'done' : 'due' };
  out.interval = Math.min(99, Math.max(1, parseInt(r.interval, 10) || 1));
  if (kind === 'weekly') {
    const w = Array.isArray(r.wdays) ? r.wdays.map(n => parseInt(n, 10)).filter(n => n >= 0 && n <= 6) : [];
    out.wdays = w.length ? Array.from(new Set(w)).sort() : [new Date().getDay()];
  }
  if (kind === 'monthly') {
    out.monthDay = r.monthDay === 'last' ? 'last' : Math.min(31, Math.max(1, parseInt(r.monthDay, 10) || 1));
  }
  return out;
}
let saveTimer = null, savePending = false;
function saveLocal(now) {
  clearTimeout(saveTimer);
  const write = () => {
    savePending = false;
    try { localStorage.setItem(LS_STATE, JSON.stringify(state)); }
    catch (e) { toast('保存に失敗しました（容量超過の可能性）', { type:'danger' }); }
  };
  if (now) return write();
  savePending = true;
  saveTimer = setTimeout(write, 180);
}
const saveCfg = () => { try { localStorage.setItem(LS_SYNC, JSON.stringify(cfg)); } catch (e) {} };
const saveUi  = () => {
  try {
    const keep = { activePhase:ui.activePhase, labelFilter:ui.labelFilter, overdueOnly:ui.overdueOnly };
    localStorage.setItem(LS_UI, JSON.stringify(keep));
  } catch (e) {}
};

/** すべての変更はこれを通す */
function touch(opts) {
  saveLocal();
  scheduleSync();
  if (!opts || opts.render !== false) renderAll();
}

/* ── selectors ─────────────────────────────────────────────── */
const labelsSorted = () => Object.values(state.labels).filter(l => !l.deleted)
  .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, 'ja'));
const labelOf = t => (t.labelId && state.labels[t.labelId] && !state.labels[t.labelId].deleted) ? state.labels[t.labelId] : null;
const colorOf = t => { const l = labelOf(t); return l ? l.color : null; };

/** 完了していない・削除されていない、フェーズ内の全タスク（フィルタ非適用） */
const activeOf = ph => Object.values(state.tasks)
  .filter(t => !t.deleted && !t.done && t.phase === ph)
  .sort((a, b) => (a.order - b.order) || (b.createdAt - a.createdAt));

const archived = () => Object.values(state.tasks)
  .filter(t => !t.deleted && t.done)
  .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

function matchFilter(t) {
  if (ui.labelFilter.length && !ui.labelFilter.includes(t.labelId || '_none')) return false;
  if (ui.overdueOnly) { const di = dueInfo(t.due); if (!di || di.d > 0) return false; }
  const q = (ui.q || '').trim().toLowerCase();
  if (q) {
    const l = labelOf(t);
    const hay = [t.title, t.note, t.waitingFor, l ? l.name : ''].join(' ').toLowerCase();
    if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}
const visibleOf = ph => activeOf(ph).filter(matchFilter);

/* ── mutations ─────────────────────────────────────────────── */
function addTask(phase, raw, opts) {
  const p = parseQuick(raw);
  if (!p.title) return null;
  const list = activeOf(phase);
  const t = {
    id: uid(), title: p.title, phase,
    labelId: p.labelId || (opts && opts.labelId) || null,
    due: p.due || (opts && opts.due) || null, note: '',
    p1: p.p1 || false,
    order: (list.length ? list[0].order : 0) - 1,
    createdAt: Date.now(), updatedAt: Date.now(),
    done: false, doneAt: null
  };
  if (phase === 'checking') {
    t.checkKind    = 'other';
    t.waitingFor   = p.waitingFor || '';
    t.waitingSince = today();
  } else if (p.waitingFor) {
    t.waitingFor = p.waitingFor;
  }
  state.tasks[t.id] = t;
  touch();
  return t;
}
function patch(id, fields, opts) {
  const t = state.tasks[id]; if (!t) return;
  Object.assign(t, fields);
  t.updatedAt = Date.now();
  touch(opts);
}
function setPhase(id, phase) {
  const t = state.tasks[id]; if (!t || t.phase === phase) return;
  const list = activeOf(phase);
  t.phase = phase;
  t.order = (list.length ? list[0].order : 0) - 1;
  if (phase === 'checking') {
    if (!t.checkKind) t.checkKind = 'other';
    if (!t.waitingSince) t.waitingSince = today();
  }
  t.updatedAt = Date.now();
  touch();
}
/** beforeId の直前（null なら末尾）へ移動 */
function moveBefore(id, phase, beforeId) {
  const t = state.tasks[id]; if (!t) return;
  const list = activeOf(phase).filter(x => x.id !== id);
  let idx = beforeId ? list.findIndex(x => x.id === beforeId) : list.length;
  if (idx < 0) idx = list.length;
  list.splice(idx, 0, t);
  const phaseChanged = t.phase !== phase;
  t.phase = phase;
  if (phaseChanged && phase === 'checking') {
    if (!t.checkKind) t.checkKind = 'other';
    if (!t.waitingSince) t.waitingSince = today();
  }
  const now = Date.now();
  list.forEach((x, i) => { if (x.order !== i) { x.order = i; x.updatedAt = now; } });
  t.updatedAt = now;
  touch();
}
/** 列をジャンル順に並べ替える。ジャンルの並び（ジャンル管理の順）に従い、
    同じジャンルの中は「重要 → 期限が近い → 元の順」。ジャンルなしは最後。 */
function sortByLabel(pid) {
  const list = activeOf(pid);
  if (list.length < 2) {
    toast('並べ替えるタスクがありません', { type:'info', icon:'note', ms:1600 });
    return;
  }
  const before = list.map(t => ({ id:t.id, order:t.order }));
  const rank = {};
  labelsSorted().forEach((l, i) => { rank[l.id] = i; });
  const keyOf = t => { const l = labelOf(t); return l ? rank[l.id] : 9999; };

  const sorted = list.slice().sort((a, b) => {
    const d = keyOf(a) - keyOf(b);
    if (d) return d;
    if (!!b.p1 !== !!a.p1) return b.p1 ? 1 : -1;          /* 重要を先に */
    const da = a.due ? dayDiff(today(), a.due) : 99999;
    const db = b.due ? dayDiff(today(), b.due) : 99999;
    if (da !== db) return da - db;                        /* 期限が近い順 */
    return a.order - b.order;                             /* それ以外は元の順 */
  });

  /* 既にこの順なら何もしない（押しても無反応に見えないよう伝える） */
  if (sorted.every((t, i) => t.id === list[i].id)) {
    toast('すでにジャンル順です', { type:'info', icon:'sort', ms:1600 });
    return;
  }
  const now = Date.now();
  sorted.forEach((t, i) => { if (t.order !== i) { t.order = i; t.updatedAt = now; } });
  touch();
  toast(`${PHASE[pid].label} をジャンル順に並べ替えました`, { icon:'sort',
    action:{ label:'元に戻す', fn:() => {
      const n2 = Date.now();
      before.forEach(s => { const t = state.tasks[s.id]; if (t) { t.order = s.order; t.updatedAt = n2; } });
      touch(); toast('戻しました', { icon:'undo' });
    } } });
}

function nudge(id, dir) {
  const t = state.tasks[id]; if (!t) return;
  const list = activeOf(t.phase);
  const i = list.findIndex(x => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  moveBefore(id, t.phase, dir < 0 ? list[j].id : (list[j + 1] ? list[j + 1].id : null));
}
function complete(id) {
  const t = state.tasks[id]; if (!t || t.done) return;
  t.done = true; t.doneAt = Date.now(); t.updatedAt = Date.now();
  const spawned = spawnNext(t);
  if (openId === id) closeDrawer();
  saveLocal(); scheduleSync(); renderAll();
  const short = t.title.length > 24 ? t.title.slice(0, 24) + '…' : t.title;
  toast(spawned && spawned.due ? `完了。次回は ${fmtDate(spawned.due)}`
        : spawned ? `完了。次回分を作りました` : `完了：${short}`, {
    icon: spawned ? 'cycle' : 'check',
    action:{ label:'元に戻す', fn:() => {
      /* 次回分も一緒に取り消す（放っておくと重複して残る） */
      if (spawned && state.tasks[spawned.id]) {
        state.tasks[spawned.id].deleted = true;
        state.tasks[spawned.id].updatedAt = Date.now();
      }
      patch(id, { done:false, doneAt:null });
      toast('戻しました', { icon:'undo' });
    } }
  });
}
function uncomplete(id) { patch(id, { done:false, doneAt:null }); }
function removeTask(id) {
  const t = state.tasks[id]; if (!t) return;
  const snap = JSON.parse(JSON.stringify(t));
  t.deleted = true; t.updatedAt = Date.now();
  if (openId === id) closeDrawer();
  touch();
  toast('削除しました', { icon:'trash', type:'danger',
    action:{ label:'元に戻す', fn:() => { state.tasks[id] = Object.assign(snap, { deleted:false, updatedAt:Date.now() }); touch(); } } });
}
function duplicate(id) {
  const t = state.tasks[id]; if (!t) return null;
  const c = JSON.parse(JSON.stringify(t));
  c.id = uid(); c.createdAt = c.updatedAt = Date.now();
  c.subs = (c.subs || []).map(s => ({ id:uid(), text:s.text, done:false }));
  c.spawnedFrom = null;
  c.order = t.order - 0.5; c.done = false; c.doneAt = null; c.deleted = false;
  state.tasks[c.id] = c;
  touch();
  return c;
}

/* ── labels ────────────────────────────────────────────────── */
function addLabel(name, color) {
  const id = uid();
  const list = labelsSorted();
  const used = new Set(list.map(l => String(l.color).toLowerCase()));
  const free = PALETTE.find(c => !used.has(c.toLowerCase()));
  state.labels[id] = { id, name: name || '新しいジャンル',
    color: color || free || PALETTE[list.length % PALETTE.length],
    order: list.length ? list[list.length-1].order + 1 : 0, updatedAt: Date.now() };
  touch();
  return state.labels[id];
}
function patchLabel(id, fields) {
  const l = state.labels[id]; if (!l) return;
  Object.assign(l, fields); l.updatedAt = Date.now();
  saveLocal(); scheduleSync();
}
function removeLabel(id) {
  const l = state.labels[id]; if (!l) return;
  l.deleted = true; l.updatedAt = Date.now();
  const now = Date.now();
  Object.values(state.tasks).forEach(t => { if (t.labelId === id) { t.labelId = null; t.updatedAt = now; } });
  ui.labelFilter = ui.labelFilter.filter(x => x !== id); saveUi();
  touch();
}
const labelUsage = id => Object.values(state.tasks).filter(t => !t.deleted && !t.done && t.labelId === id).length;

/* ── subtasks ──────────────────────────────────────────────── */
const subCount = t => (t.subs || []).length;
const subDone  = t => (t.subs || []).filter(s => s.done).length;
/** サブタスク更新は板の進捗バッジだけ描き直す（統計は変わらないので renderAll は不要） */
function subTouch() { saveLocal(); scheduleSync(); renderBoard(); }

function addSub(id, text) {
  const t = state.tasks[id]; if (!t) return null;
  const v = String(text == null ? '' : text).trim(); if (!v) return null;
  const s = { id:uid(), text:v, done:false };
  t.subs = (t.subs || []).concat([s]);
  t.updatedAt = Date.now();
  subTouch();
  return s;
}
function toggleSub(id, subId) {
  const t = state.tasks[id]; if (!t) return;
  const s = (t.subs || []).find(x => x.id === subId); if (!s) return;
  s.done = !s.done;
  t.updatedAt = Date.now();
  subTouch();
  if (s.done && t.subs.length && t.subs.every(x => x.done)) {
    toast('手順がすべて完了しました', { icon:'checklist',
      action:{ label:'タスクも完了にする', fn:() => complete(id) } });
  }
}
function patchSub(id, subId, text) {
  const t = state.tasks[id]; if (!t) return;
  const s = (t.subs || []).find(x => x.id === subId); if (!s) return;
  s.text = String(text);
  t.updatedAt = Date.now();
  saveLocal(); scheduleSync();
}
function removeSub(id, subId) {
  const t = state.tasks[id]; if (!t) return;
  t.subs = (t.subs || []).filter(x => x.id !== subId);
  t.updatedAt = Date.now();
  subTouch();
}

/* ── repeat（繰り返し） ────────────────────────────────────── */
function repeatLabel(r) {
  if (!r) return 'なし';
  const iv = r.interval > 1 ? r.interval : 0;
  if (r.kind === 'daily')    return iv ? `${iv}日ごと` : '毎日';
  if (r.kind === 'weekdays') return '平日（月〜金）';
  if (r.kind === 'weekly')   return (iv ? `${iv}週ごと ` : '毎週') + (r.wdays || []).map(w => WDAY[w]).join('・');
  if (r.kind === 'monthly')  return (iv ? `${iv}か月ごと ` : '毎月') +
                                    (r.monthDay === 'last' ? '月末' : `${r.monthDay}日`);
  return 'なし';
}
/** 次回の期限。base='due' なら前回の期限起点、'done' なら今日起点 */
function nextRepeatDate(t) {
  const r = t.repeat; if (!r) return null;
  const from = (r.base === 'due' && t.due) ? t.due : today();
  const iv = Math.max(1, r.interval || 1);
  if (r.kind === 'daily') return addDays(from, iv);
  if (r.kind === 'weekdays') {
    let d = addDays(from, 1);
    while ([0, 6].indexOf(parseYmd(d).getDay()) >= 0) d = addDays(d, 1);
    return d;
  }
  if (r.kind === 'weekly') {
    const want = (r.wdays && r.wdays.length) ? r.wdays.slice().sort((x, y) => x - y)
                                            : [parseYmd(from).getDay()];
    const cur = parseYmd(from).getDay();
    const inWeek = want.filter(w => w > cur)[0];
    if (inWeek != null) return addDays(from, inWeek - cur);
    return addDays(from, (7 - cur + want[0]) + (iv - 1) * 7);
  }
  if (r.kind === 'monthly') {
    const d = parseYmd(from) || new Date();
    const y = d.getFullYear(), m = d.getMonth() + iv;
    const last = new Date(y, m + 1, 0).getDate();
    const day = r.monthDay === 'last' ? last : Math.min(r.monthDay || d.getDate(), last);
    return ymd(new Date(y, m, day));
  }
  return null;
}
/** 完了時に次回分を1枚だけ生やす。同じ完了が別端末から同期されても増えないよう
    spawnedFrom で重複を弾く。state に足すだけで、保存と再描画は呼び出し側に任せる */
function spawnNext(t) {
  if (!t.repeat) return null;
  if (Object.values(state.tasks).some(x => !x.deleted && x.spawnedFrom === t.id)) return null;
  const n = {
    id: uid(), title: t.title, phase: t.phase,
    labelId: t.labelId || null, due: nextRepeatDate(t), note: t.note || '',
    p1: !!t.p1, order: t.order,
    subs: (t.subs || []).map(s => ({ id:uid(), text:s.text, done:false })),
    repeat: JSON.parse(JSON.stringify(t.repeat)),
    spawnedFrom: t.id,
    createdAt: Date.now(), updatedAt: Date.now(), done: false, doneAt: null
  };
  if (t.phase === 'checking') {
    n.checkKind = t.checkKind || 'other';
    n.waitingFor = t.waitingFor || '';
    n.waitingSince = today();
  }
  state.tasks[n.id] = n;
  return n;
}
/* ── templates ─────────────────────────────────────────────── */
const templatesSorted = () => Object.values(state.templates).filter(t => !t.deleted)
  .sort((a, b) => (a.order - b.order) || String(a.name).localeCompare(String(b.name), 'ja'));

function createTemplateFromTasks(name, tasks) {
  const id = uid();
  const list = templatesSorted();
  state.templates[id] = {
    id, name: name || '新しいテンプレート',
    order: list.length ? list[list.length - 1].order + 1 : 0,
    updatedAt: Date.now(),
    items: tasks.map(t => ({
      title:     t.title,
      phase:     t.phase,
      labelId:   t.labelId || null,
      dueOffset: t.due ? dayDiff(today(), t.due) : null,
      note:      t.note || '',
      p1:        !!t.p1,
      subs:      (t.subs || []).map(s => s.text)
    }))
  };
  touch();
  return state.templates[id];
}
function patchTemplate(id, f) {
  const tp = state.templates[id]; if (!tp) return;
  Object.assign(tp, f); tp.updatedAt = Date.now();
  saveLocal(); scheduleSync();
}
function removeTemplate(id) {
  const tp = state.templates[id]; if (!tp) return;
  tp.deleted = true; tp.updatedAt = Date.now(); touch();
}
function removeTemplateItem(id, idx) {
  const tp = state.templates[id]; if (!tp) return;
  tp.items = tp.items.filter((_, i) => i !== idx);
  tp.updatedAt = Date.now(); touch();
}
/** テンプレートを流し込む。dueOffset は「投入日からの日数」 */
function applyTemplate(id) {
  const tp = state.templates[id];
  if (!tp || !tp.items.length) return [];
  const now = Date.now(), heads = {}, created = [];
  tp.items.forEach(it => {
    if (heads[it.phase] == null) {
      const a = activeOf(it.phase);
      heads[it.phase] = (a.length ? a[0].order : 0) - 1;
    }
    const t = {
      id: uid(), title: it.title, phase: it.phase, labelId: it.labelId || null,
      due: it.dueOffset != null ? addDays(today(), it.dueOffset) : null,
      note: it.note || '', p1: !!it.p1, order: heads[it.phase]--,
      subs: (it.subs || []).map(x => ({ id:uid(), text:x, done:false })),
      repeat: null, spawnedFrom: null,
      createdAt: now, updatedAt: now, done: false, doneAt: null
    };
    if (it.phase === 'checking') { t.checkKind = 'other'; t.waitingFor = ''; t.waitingSince = today(); }
    state.tasks[t.id] = t; created.push(t.id);
  });
  touch();
  toast(`「${tp.name}」から ${created.length}件を追加`, { icon:'layers',
    action:{ label:'元に戻す', fn:() => {
      const n2 = Date.now();
      created.forEach(cid => { const x = state.tasks[cid]; if (x) { x.deleted = true; x.updatedAt = n2; } });
      touch(); toast('戻しました', { icon:'undo' });
    } } });
  return created;
}

/* ── 複数選択（一括操作） ──────────────────────────────────── */
let multi = new Set();      /* 永続化しない。リロードで消えるのが正しい */
let multiAnchor = null;

const multiTasks = () => Array.from(multi).map(id => state.tasks[id])
  .filter(t => t && !t.deleted && !t.done);
function clearMultiSilent() { multi.clear(); multiAnchor = null; }
function clearMulti() { clearMultiSilent(); renderBoard(); renderBulk(); }
function toggleMulti(id) {
  if (!state.tasks[id]) return;
  multi.has(id) ? multi.delete(id) : multi.add(id);
  multiAnchor = id;
  renderBoard(); renderBulk();
}
/** アンカーから id までを同じ列の中でまとめて選択 */
function rangeMulti(id) {
  const card = $(`.card[data-id="${id}"]`);
  const col = card && card.closest('.column');
  if (!col) return toggleMulti(id);
  const list = visibleOf(col.dataset.phase).map(t => t.id);
  const a = list.indexOf(multiAnchor), b = list.indexOf(id);
  if (a < 0 || b < 0) return toggleMulti(id);
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) multi.add(list[i]);
  renderBoard(); renderBulk();
}
function selectAllVisible() {
  phaseOrder().forEach(pid => visibleOf(pid).forEach(t => multi.add(t.id)));
  renderBoard(); renderBulk();
}

/* まとめて1回だけ touch() する。1件ずつ既存関数を回すと再描画と push が n 回走る */
function bulkPhase(pid) {
  const list = multiTasks(); if (!list.length) return;
  const now = Date.now(), head = activeOf(pid);
  let ord = (head.length ? head[0].order : 0) - list.length;
  list.forEach(t => {
    t.phase = pid; t.order = ord++;
    if (pid === 'checking') {
      if (!t.checkKind) t.checkKind = 'other';
      if (!t.waitingSince) t.waitingSince = today();
    }
    t.updatedAt = now;
  });
  clearMultiSilent(); touch();
  toast(`${list.length}件を ${PHASE[pid].label} へ移動`, { icon:'arrowR' });
}
function bulkComplete() {
  const list = multiTasks(); if (!list.length) return;
  const now = Date.now(), ids = list.map(t => t.id), spawned = [];
  list.forEach(t => {
    t.done = true; t.doneAt = now; t.updatedAt = now;
    const sp = spawnNext(t); if (sp) spawned.push(sp.id);
  });
  if (openId && ids.indexOf(openId) >= 0) closeDrawer();
  clearMultiSilent(); touch();
  toast(`${ids.length}件を完了`, { icon:'check',
    action:{ label:'元に戻す', fn:() => {
      const n2 = Date.now();
      spawned.forEach(sid => { const x = state.tasks[sid]; if (x) { x.deleted = true; x.updatedAt = n2; } });
      ids.forEach(sid => { const x = state.tasks[sid]; if (x) { x.done = false; x.doneAt = null; x.updatedAt = n2; } });
      touch(); toast('戻しました', { icon:'undo' });
    } } });
}
async function bulkRemove() {
  const list = multiTasks(); if (!list.length) return;
  const n = list.length;
  if (!await confirmDialog('まとめて削除', `${n}件のタスクを削除します。直後に「元に戻す」で復元できます。`,
      { danger:true, ok:`${n}件を削除する` })) return;
  const snap = list.map(t => JSON.parse(JSON.stringify(t)));
  const now = Date.now();
  list.forEach(t => { t.deleted = true; t.updatedAt = now; });
  if (openId && snap.some(s => s.id === openId)) closeDrawer();
  clearMultiSilent(); touch();
  toast(`${n}件を削除`, { icon:'trash', type:'danger',
    action:{ label:'元に戻す', fn:() => {
      const n2 = Date.now();
      snap.forEach(s => { state.tasks[s.id] = Object.assign(s, { deleted:false, updatedAt:n2 }); });
      touch(); toast('戻しました', { icon:'undo' });
    } } });
}
function bulkSetLabel(labelId) {
  const list = multiTasks(); if (!list.length) return;
  const now = Date.now();
  list.forEach(t => { t.labelId = labelId; t.updatedAt = now; });
  touch(); renderBulk();
  toast(`${list.length}件のジャンルを変更`, { icon:'tag' });
}
function bulkSetDue(due) {
  const list = multiTasks(); if (!list.length) return;
  const now = Date.now();
  list.forEach(t => { t.due = due; t.updatedAt = now; });
  touch(); renderBulk();
  toast(due ? `${list.length}件の期限を ${fmtDate(due)} に` : `${list.length}件の期限をクリア`,
        { icon:'hourglass' });
}
async function bulkTemplate() {
  const list = multiTasks(); if (!list.length) return;
  const name = await promptDialog('テンプレートを作成',
    `選択中の ${list.length}件を、いつでも投入できるテンプレートとして保存します。期限は「投入日からの日数」に変換されます。`,
    '例：新規顧客オンボーディング');
  if (!name) return;
  const tp = createTemplateFromTasks(name, list);
  clearMulti();
  toast(`「${tp.name}」を保存（${tp.items.length}件）`, { icon:'layers' });
}


/* ───────────────────────────────────────────────────────────────
   5. quick-input parser   例: 「見積を送る #社内調整 !明日 @山田 !!」
   ─────────────────────────────────────────────────────────────── */
function parseDateToken(tok) {
  const t = tok.trim();
  if (!t) return null;
  const T = today();
  const rel = { '今日':0,'きょう':0,'today':0,'明日':1,'あした':1,'あす':1,'tomorrow':1,'tmr':1,
                '明後日':2,'あさって':2,'昨日':-1,'来週':7,'翌週':7,'来月':30 };
  if (t in rel) return addDays(T, rel[t]);
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t)))
    return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  if ((m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(t))) {
    const y = new Date().getFullYear();
    let s = `${y}-${pad(+m[1])}-${pad(+m[2])}`;
    if (dayDiff(T, s) < -180) s = `${y+1}-${pad(+m[1])}-${pad(+m[2])}`;
    return parseYmd(s) ? s : null;
  }
  if ((m = /^\+?(\d{1,3})(d|日|日後)$/.exec(t))) return addDays(T, +m[1]);
  if ((m = /^\+?(\d{1,2})(w|週|週間後)$/.exec(t))) return addDays(T, +m[1] * 7);
  if (/^(今週末|週末|weekend)$/.test(t)) { const d = new Date(); return addDays(T, (6 - d.getDay() + 7) % 7 || 7); }
  if (/^(月末)$/.test(t)) { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth()+1, 0)); }
  if ((m = /^(日|月|火|水|木|金|土)(曜|曜日)?$/.exec(t))) {
    const want = WDAY.indexOf(m[1]), cur = new Date().getDay();
    return addDays(T, ((want - cur + 7) % 7) || 7);
  }
  return null;
}
function findLabelByName(name) {
  const n = name.toLowerCase();
  const list = labelsSorted();
  return list.find(l => l.name.toLowerCase() === n)
      || list.find(l => l.name.toLowerCase().startsWith(n))
      || list.find(l => l.name.toLowerCase().includes(n)) || null;
}
function parseQuick(raw) {
  let s = ' ' + String(raw || '');
  const out = { title:'', labelId:null, due:null, waitingFor:null, p1:false };
  s = s.replace(/\s!!(?=\s|$)/g, () => { out.p1 = true; return ' '; });
  s = s.replace(/\s#([^\s#!@]+)/g, (m, n) => { const l = findLabelByName(n); if (l) { out.labelId = l.id; return ' '; } return m; });
  s = s.replace(/\s@([^\s#!@]+)/g,  (m, w) => { out.waitingFor = w; return ' '; });
  s = s.replace(/\s!([^\s#!@]+)/g,  (m, d) => { const v = parseDateToken(d); if (v) { out.due = v; return ' '; } return m; });
  out.title = s.replace(/\s+/g, ' ').trim();
  return out;
}

/* ───────────────────────────────────────────────────────────────
   6. sync — GitHub Gist
   ─────────────────────────────────────────────────────────────── */
let syncState = 'off', syncMsg = '', syncing = false, syncQueued = false, syncTimer = null, dirty = false;

function exportState() {
  return { schema:SCHEMA, app:APP, exportedAt:Date.now(),
           tasks:state.tasks, labels:state.labels,
           templates:state.templates, settings:state.settings };
}
function digest(s) {
  const n = o => Object.keys(o || {}).sort()
    .map(k => k + ':' + ((o[k] && o[k].updatedAt) || 0) + (o[k] && o[k].deleted ? 'D' : '')).join('|');
  return n(s.tasks) + '#' + n(s.labels) + '#' + n(s.templates)
       + '#' + ((s.settings && s.settings.updatedAt) || 0);
}
function mergeState(a, b) {
  const out = { schema:SCHEMA, app:APP, tasks:{}, labels:{}, templates:{}, settings:null,
                meta:a.meta || { deviceId:uid() } };
  ['tasks','labels','templates'].forEach(k => {
    const ids = new Set([...Object.keys(a[k] || {}), ...Object.keys(b[k] || {})]);
    ids.forEach(id => {
      const x = (a[k] || {})[id], y = (b[k] || {})[id];
      out[k][id] = !x ? y : !y ? x : (((y.updatedAt || 0) > (x.updatedAt || 0)) ? y : x);
    });
  });
  const sa = a.settings || { updatedAt:0 }, sb = b.settings || { updatedAt:0 };
  out.settings = ((sb.updatedAt || 0) > (sa.updatedAt || 0)) ? sb : sa;
  return normalize(out);
}
async function gh(path, opts) {
  opts = opts || {};
  const headers = {
    'Accept':'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'Authorization':'Bearer ' + cfg.token
  };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const res = await fetch('https://api.github.com' + path, { method:opts.method || 'GET', headers, body:opts.body });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j.message) msg = j.message; } catch (e) {}
    if (res.status === 401) msg = 'トークンが無効です（権限 gist を確認）';
    if (res.status === 404) msg = 'Gist が見つかりません（IDを確認）';
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return res.json();
}
async function gistPull() {
  if (!cfg.gistId) return null;
  const g = await gh('/gists/' + cfg.gistId);
  const f = g.files && g.files[GIST_FILE];
  if (!f) return null;
  let text = f.content;
  if (f.truncated || text == null) text = await (await fetch(f.raw_url)).text();
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !data.tasks) throw new Error('Gist のデータ形式が不正です');
  return normalize(data);
}
async function gistPush() {
  const files = {}; files[GIST_FILE] = { content: JSON.stringify(exportState(), null, 1) };
  if (cfg.gistId) {
    await gh('/gists/' + cfg.gistId, { method:'PATCH', body: JSON.stringify({ files }) });
  } else {
    const g = await gh('/gists', { method:'POST', body: JSON.stringify({
      description:'FLOWDECK task data (private)', public:false, files }) });
    cfg.gistId = g.id; saveCfg();
  }
}
function setSync(s, msg) { syncState = s; syncMsg = msg || ''; renderSyncChip(); }

async function sync(opts) {
  opts = opts || {};
  if (!cfg.token) { setSync('off'); return; }
  if (!navigator.onLine) { setSync('error', 'オフライン'); return; }
  if (syncing) { syncQueued = true; return; }
  syncing = true; setSync('syncing');
  try {
    const remote = await gistPull();
    if (remote) {
      /* 2台目の初回同期。ローカルは初期ジャンルだけの手つかず状態なので、
         マージすると初期ジャンルが二重になる。リモートをそのまま採用する。 */
      const untouched = !cfg.lastSyncAt && !Object.keys(state.tasks).length;
      const merged = untouched ? remote : mergeState(state, remote);
      const before = digest(state);
      state = merged; saveLocal(true);
      if (digest(state) !== before) { renderAll(); if (openId) openDrawer(openId); }
      if (digest(state) !== digest(remote)) await gistPush();
    } else {
      await gistPush();
    }
    dirty = false; cfg.lastSyncAt = Date.now(); saveCfg();
    setSync('ok');
    if (opts.loud) toast('同期しました', { icon:'cloud' });
  } catch (e) {
    console.warn(e);
    setSync('error', e.message);
    if (opts.loud) toast('同期エラー: ' + e.message, { type:'danger', icon:'alert', ms:6000 });
  } finally {
    syncing = false;
    if (syncQueued) { syncQueued = false; setTimeout(() => sync({}), 500); }
  }
}
function scheduleSync() {
  if (!cfg.token) return;
  dirty = true;
  if (syncState !== 'syncing') setSync('dirty');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => cfg.auto && sync({}), 3200);
}
/* ───────────────────────────────────────────────────────────────
   6b. リマインド通知
   ─────────────────────────────────────────────────────────────── */
const notifyOk = () => typeof Notification !== 'undefined';

/** 通知の対象件数。設定画面のプレビューにも使う */
function reminderCounts() {
  let over = 0, dueToday = 0, stale = 0;
  Object.values(state.tasks).filter(t => !t.deleted && !t.done).forEach(t => {
    const di = dueInfo(t.due);
    if (di) { if (di.d < 0) over++; else if (di.d === 0) dueToday++; }
    if (t.phase === 'checking' && t.waitingSince) {
      const d = dayDiff(t.waitingSince, today());
      if (d != null && d >= 7) stale++;
    }
  });
  return { over, dueToday, stale, total:over + dueToday + stale };
}
function reminderText(c) {
  const p = [];
  if (c.over)     p.push(`期限切れ ${c.over}件`);
  if (c.dueToday) p.push(`今日が期限 ${c.dueToday}件`);
  if (c.stale)    p.push(`7日以上待ち ${c.stale}件`);
  return p.join('・');
}
/** 1日1回だけ、指定時刻を過ぎた最初のチェックで通知する */
function checkReminders() {
  const n = cfg.notify || {};
  if (!n.enabled || !notifyOk() || Notification.permission !== 'granted') return;
  if (n.lastDate === today()) return;
  if (new Date().getHours() < (n.hour == null ? 9 : n.hour)) return;
  const c = reminderCounts();
  cfg.notify.lastDate = today(); saveCfg();     /* 対象0でも当日は再チェックしない */
  if (!c.total) return;
  try {
    const nt = new Notification('FLOWDECK', {
      body: reminderText(c), icon:'assets/icon.svg', tag:'flowdeck-daily'
    });
    nt.onclick = () => { window.focus(); nt.close(); };
  } catch (e) { console.warn('notification failed', e); }
}


/* ───────────────────────────────────────────────────────────────
   7. render — board
   ─────────────────────────────────────────────────────────────── */
const board = $('#board'), tabsEl = $('#phaseTabs');
let cols = {};      /* phase -> {el, body, count, over} */
let builtOrder = '';

function phaseOrder() { return state.settings.phaseOrder.filter(p => PHASE[p]); }

/* クイック追加の「下書き」。列ごとにジャンルと期限を持たせておき、
   追加したタスクに引き継ぐ。連続で足すとき毎回選ばなくていいように残す。 */
const qaDraft = {};

function buildBoard() {
  clear(board); cols = {};
  phaseOrder().forEach(pid => {
    const p = PHASE[pid];
    const count = h('span', { class:'col-count num' }, '0');
    const over  = h('span', { class:'col-overdue', hidden:true });
    const body  = h('div',  { class:'col-body', dataset:{ body:pid } });
    const input = h('input', { type:'text', placeholder:p.ph, autocomplete:'off',
                               spellcheck:'false', enterkeyhint:'done', dataset:{ qa:pid } });
    const chips = h('div', { class:'qa-chips', dataset:{ chips:pid }, hidden:true });
    const el = h('section', { class:'column', dataset:{ phase:pid }, style:{ '--pc':`var(--${pid})` } },
      h('div', { class:'col-head' },
        h('div', { class:'col-title' },
          h('span', { class:'col-dot' }),
          h('span', { class:'col-name' }, p.label),
          h('span', { class:'col-jp' }, p.jp),
          over, count,
          h('button', { class:'col-sort', type:'button', dataset:{ sort:pid },
                        title:'ジャンルごとに並べ替え', 'aria-label':'ジャンルごとに並べ替え' }, svg('sort'))
        ),
        h('div', { class:'qa' },
          h('button', { class:'qa-plus-btn', type:'button', tabindex:'-1',
                        'aria-label':'入力欄へ', onClick:() => input.focus() }, svg('plus','ico qa-plus')),
          input,
          h('button', { class:'qa-btn', type:'button', dataset:{ qaLabel:pid },
                        title:'ジャンルを選ぶ', 'aria-label':'ジャンルを選ぶ' }, svg('tag')),
          h('button', { class:'qa-btn', type:'button', dataset:{ qaDue:pid },
                        title:'期限を選ぶ', 'aria-label':'期限を選ぶ' }, svg('hourglass'))),
        chips
      ),
      body
    );
    cols[pid] = { el, body, count, over, input, chips };
    board.append(el);
  });
  builtOrder = phaseOrder().join(',');
  phaseOrder().forEach(renderQaChips);
}

/** 下書きのジャンル・期限をチップとして出す */
function renderQaChips(pid) {
  const c = cols[pid]; if (!c) return;
  const d = qaDraft[pid] || {};
  const lab = d.labelId && state.labels[d.labelId] && !state.labels[d.labelId].deleted
            ? state.labels[d.labelId] : null;
  if (!lab && !d.due) { delete qaDraft[pid]; }
  clear(c.chips);
  if (!lab && !d.due) { c.chips.hidden = true; }
  else {
    c.chips.hidden = false;
    if (lab) c.chips.append(h('button', {
      class:'qa-chip', type:'button', style:{ '--lc':lab.color }, title:'このジャンルを外す',
      onClick:() => { if (qaDraft[pid]) delete qaDraft[pid].labelId; renderQaChips(pid); } },
      h('span', { class:'tag-dot' }), lab.name, svg('x','ico ico-sm')));
    if (d.due) {
      const di = dueInfo(d.due);
      c.chips.append(h('button', {
        class:'qa-chip qa-chip-due', type:'button', title:'この期限を外す',
        onClick:() => { if (qaDraft[pid]) delete qaDraft[pid].due; renderQaChips(pid); } },
        svg('hourglass','ico ico-sm'), fmtDate(d.due),
        di ? h('span', { class:'qa-chip-rel' }, di.txt) : null, svg('x','ico ico-sm')));
    }
  }
  /* ボタンの点灯 */
  const lb = c.el.querySelector('[data-qa-label]'), db = c.el.querySelector('[data-qa-due]');
  if (lb) lb.classList.toggle('is-on', !!lab);
  if (db) db.classList.toggle('is-on', !!d.due);
}

function openQaLabelPop(anchor, pid) {
  openPop(anchor, p => {
    app(p, h('div', { class:'pop-title' }, 'これから追加するタスクのジャンル'));
    labelsSorted().forEach(l => app(p, popItem(null, l.name, () => {
      qaDraft[pid] = Object.assign({}, qaDraft[pid], { labelId:l.id });
      renderQaChips(pid); cols[pid].input.focus();
    }, { swatch:l.color, on:(qaDraft[pid] || {}).labelId === l.id, check:true })));
    app(p, h('div', { class:'pop-sep' }));
    app(p, popItem('x', '指定しない', () => {
      if (qaDraft[pid]) delete qaDraft[pid].labelId;
      renderQaChips(pid); cols[pid].input.focus();
    }, { on:!(qaDraft[pid] || {}).labelId }));
    app(p, popItem('gear', 'ジャンルを管理', openLabelManager));
  }, { align:'right' });
}

function openQaDuePop(anchor, pid) {
  openPop(anchor, p => {
    app(p, h('div', { class:'pop-title' }, 'これから追加するタスクの期限'));
    [['今日',0], ['明日',1], ['明後日',2], ['今週末',null], ['1週間後',7], ['月末',null], ['来月',30]]
      .forEach(([lbl, n]) => app(p, popItem('cal', lbl, () => {
        const v = n != null ? addDays(today(), n) : parseDateToken(lbl);
        qaDraft[pid] = Object.assign({}, qaDraft[pid], { due:v });
        renderQaChips(pid); cols[pid].input.focus();
      })));
    app(p, h('div', { class:'pop-sep' }));
    const di = h('input', { class:'inp', type:'date', value:(qaDraft[pid] || {}).due || '' });
    di.addEventListener('change', () => {
      qaDraft[pid] = Object.assign({}, qaDraft[pid], { due:di.value || null });
      renderQaChips(pid); closePop();
    });
    app(p, h('div', { style:{ padding:'2px 4px 4px' } }, di));
    if ((qaDraft[pid] || {}).due) app(p, popItem('x', '期限を指定しない', () => {
      delete qaDraft[pid].due; renderQaChips(pid); cols[pid].input.focus();
    }));
  }, { align:'right' });
}

let seenCardIds = new Set();   /* 前回の描画に居たカード。新入りだけアニメーションさせる */

function renderBoard() {
  if (builtOrder !== phaseOrder().join(',') || !Object.keys(cols).length) buildBoard();
  const nextSeen = new Set();

  phaseOrder().forEach(pid => {
    const c = cols[pid];
    const all = activeOf(pid), list = all.filter(matchFilter);
    c.el.classList.toggle('is-active', pid === ui.activePhase);
    c.count.textContent = (ui.q || ui.labelFilter.length || ui.overdueOnly) ? `${list.length}/${all.length}` : String(all.length);
    const overWip = pid === 'now' && all.length > 6;
    c.count.classList.toggle('is-warn', overWip);
    c.count.title = overWip ? 'Now が多すぎます。Next に戻すか、今日やるものだけに絞りましょう。' : '';
    const od = all.filter(t => { const i = dueInfo(t.due); return i && i.d <= 0; }).length;
    c.over.hidden = !od;
    if (od) { clear(c.over); app(c.over, [svg('alert','ico ico-sm'), String(od)]); }

    const keepScroll = c.body.scrollTop;   /* 描き直しでスクロール位置が戻らないように */
    clear(c.body);
    if (!list.length) {
      const filtered = all.length > 0;
      c.body.append(h('div', { class:'col-empty' },
        svg(filtered ? 'filter' : 'inbox', 'ico'),
        h('div', { class:'col-empty-t' }, filtered ? '条件に合うタスクがありません' : PHASE[pid].emptyT),
        h('div', { class:'col-empty-s' }, filtered ? '検索やジャンルの絞り込みを解除してください。' : PHASE[pid].emptyS)));
    } else {
      list.forEach(t => {
        nextSeen.add(t.id);
        const el = cardEl(t);
        if (!seenCardIds.has(t.id)) {
          el.classList.add('is-new');
          /* 一度流れたらクラスを外す（列の表示切替などで再生されないように） */
          el.addEventListener('animationend', () => el.classList.remove('is-new'), { once:true });
        }
        c.body.append(el);
      });
    }
    c.body.scrollTop = keepScroll;
  });
  seenCardIds = nextSeen;
  renderTabs();
}

function cardEl(t) {
  const color = colorOf(t) || 'var(--text-4)';
  const lab = labelOf(t);
  const di = dueInfo(t.due);

  const chk = h('button', { class:'check', type:'button', title:'クリックで完了',
                            'aria-label':'完了にする', dataset:{ act:'done' } }, svg('check'));
  const main = h('div', { class:'card-main' }, h('div', { class:'card-title' }, t.title));

  /* --- sub line ------------------------------------------------ */
  if (t.phase === 'someday') {
    const sub = h('div', { class:'card-sub' });
    if (t.due) {
      app(sub, [ svg('hourglass','ico'),
        h('button', { class:'sub-btn sub-set', type:'button', dataset:{ act:'due' }, title:'期限を変更' },
          h('span', {}, fmtDate(t.due))),
        h('span', { class:'sub-dot' }),
        h('span', { class:di.cls }, di.txt) ]);
    } else {
      app(sub, [ svg('hourglass','ico'),
        h('button', { class:'sub-btn', type:'button', dataset:{ act:'due' } }, '期限を設定') ]);
    }
    main.append(sub);
  } else if (t.phase === 'checking') {
    const sub = h('div', { class:'card-sub' });
    if (t.checkKind === 'self') {
      app(sub, [ svg('eye','ico'), h('span', { class:'sub-ok' }, '自分で最終確認') ]);
    } else {
      app(sub, svg('send','ico'));
      if (t.waitingFor) app(sub, h('span', { class:'wait-who' }, t.waitingFor + ' 待ち'));
      else app(sub, h('button', { class:'sub-btn', type:'button', dataset:{ act:'wait' } }, '待ち先を設定'));
    }
    const since = t.waitingSince && dayDiff(t.waitingSince, today());
    if (since != null && since >= 1) {
      app(sub, [ h('span', { class:'sub-dot' }),
        h('span', { class: since >= 7 ? 'sub-danger' : since >= 3 ? 'sub-warn' : 'sub-rel' }, `${since}日経過`) ]);
    }
    main.append(sub);
  }

  /* --- tags ---------------------------------------------------- */
  const tags = h('div', { class:'card-tags' });
  if (lab) tags.append(h('span', { class:'tag' }, h('span', { class:'tag-dot' }), lab.name));
  if (t.p1) tags.append(h('span', { class:'badge badge-p1' }, svg('flame','ico'), '重要'));
  if (t.phase !== 'someday' && di && di.d <= 0) {
    tags.append(h('span', { class:'badge ' + (di.d < 0 ? 'badge-danger' : 'badge-warn') },
      svg('alert','ico'), di.d < 0 ? `期限${-di.d}日超過` : '期限は今日'));
  }
  if (t.phase !== 'someday' && di && di.d > 0 && di.d <= 2) {
    tags.append(h('span', { class:'badge badge-mute' }, svg('cal','ico'), di.txt));
  }
  const stc = subCount(t), sdc = subDone(t);
  if (stc) tags.append(h('span', { class:'badge ' + (sdc === stc ? 'badge-ok' : 'badge-mute'),
    title:`手順 ${sdc}/${stc} 完了` }, svg('checklist','ico'), `${sdc}/${stc}`));
  if (t.repeat) tags.append(h('span', { class:'badge badge-mute',
    title:'繰り返し: ' + repeatLabel(t.repeat) }, svg('cycle','ico')));
  if (t.note) tags.append(h('span', { class:'badge badge-note', title:t.note.slice(0,120) }, svg('note','ico')));
  if (tags.children.length) main.append(tags);
  if (stc) main.append(h('div', { class:'card-progress', style:{ '--p':Math.round(sdc / stc * 100) + '%' } }));

  /* --- side actions -------------------------------------------- */
  const side = h('div', { class:'card-side' },
    h('button', { class:'card-btn', type:'button', dataset:{ act:'menu' }, title:'メニュー', 'aria-label':'メニュー' }, svg('dots')));

  const card = h('article', {
    class:'card' + (t.p1 ? ' is-p1' : '') + (openId === t.id ? ' is-open' : '')
           + (sel === t.id ? ' is-sel' : '') + (multi.has(t.id) ? ' is-checked' : ''),
    dataset:{ id:t.id }, draggable:'false', style:{ '--lc':color }, tabindex:'-1'
  }, chk, main, side);
  return card;
}

function renderTabs() {
  clear(tabsEl);
  phaseOrder().forEach(pid => {
    const all = activeOf(pid);
    tabsEl.append(h('button', {
      class:'ptab' + (pid === ui.activePhase ? ' is-on' : ''), type:'button',
      dataset:{ tab:pid }, style:{ '--pc':`var(--${pid})` }
    }, h('span', { class:'ptab-dot' }), PHASE[pid].label, h('span', { class:'ptab-n' }, String(all.length))));
  });
}

/* ── statusbar ─────────────────────────────────────────────── */
function renderStatus() {
  const g1 = clear($('#statPhases')), g2 = clear($('#statDone'));
  phaseOrder().forEach(pid => {
    g1.append(h('button', { class:'stat stat-btn', type:'button', dataset:{ jump:pid },
      style:{ '--pc':`var(--${pid})` }, title:`${PHASE[pid].label} に移動` },
      h('span', { class:'stat-dot' }), PHASE[pid].label, h('b', {}, String(activeOf(pid).length))));
  });
  const od = Object.values(state.tasks).filter(t => !t.deleted && !t.done)
    .filter(t => { const i = dueInfo(t.due); return i && i.d <= 0; }).length;
  if (od) g1.append(h('button', { class:'stat stat-btn stat-alert', type:'button', dataset:{ act:'overdue' },
    title:'期限切れ・当日のみ表示' }, svg('alert','ico ico-sm'), '期限', h('b', {}, String(od))));

  const done = archived();
  const t0 = new Date(); t0.setHours(0,0,0,0);
  const dToday = done.filter(t => t.doneAt >= t0.getTime()).length;
  const w0 = new Date(t0); w0.setDate(w0.getDate() - ((w0.getDay() + 6) % 7));
  const dWeek = done.filter(t => t.doneAt >= w0.getTime()).length;

  const spark = h('div', { class:'spark', title:'直近7日の完了数' });
  const counts = [];
  for (let i = 6; i >= 0; i--) {
    const s = new Date(t0); s.setDate(s.getDate() - i);
    const e = new Date(s); e.setDate(e.getDate() + 1);
    counts.push(done.filter(t => t.doneAt >= s.getTime() && t.doneAt < e.getTime()).length);
  }
  const mx = Math.max(1, ...counts);
  counts.forEach((n, i) => spark.append(h('i', { class:i === 6 ? 'is-today' : '',
    style:{ '--h':`${Math.round(n / mx * 12)}px` }, title:`${n}件` })));

  g2.append(
    h('span', { class:'stat' }, svg('check','ico ico-sm'), '今日', h('b', {}, String(dToday))),
    h('span', { class:'stat' }, '今週', h('b', {}, String(dWeek))),
    spark,
    h('button', { class:'stat stat-btn', type:'button', dataset:{ act:'archive' } }, '振り返り', svg('arrowR','ico ico-sm'))
  );
}

/* ── 一括操作バー ──────────────────────────────────────────── */
function renderBulk() {
  const bar = $('#bulkbar');
  const list = multiTasks();
  /* 完了・削除で消えた分を掃除 */
  if (multi.size && list.length !== multi.size) {
    multi = new Set(list.map(t => t.id));
  }
  if (!list.length) {
    bar.hidden = true; clear(bar);
    document.body.classList.remove('has-bulk');
    return;
  }
  document.body.classList.add('has-bulk');
  bar.hidden = false; clear(bar);
  app(bar,
    h('span', { class:'bulk-n' }, h('b', {}, String(list.length)), '件を選択'),
    h('span', { class:'bulk-sep' }),
    phaseOrder().map(pid => h('button', {
      class:'btn btn-sm bulk-ph', type:'button', style:{ '--pc':`var(--${pid})` },
      title:`${PHASE[pid].label}（${PHASE[pid].jp}）へ移動`,
      onClick:() => bulkPhase(pid) }, h('span', { class:'stat-dot' }), PHASE[pid].label)),
    h('span', { class:'bulk-sep' }),
    h('button', { class:'btn btn-sm', type:'button', title:'ジャンルをまとめて変更',
      onClick:e => openBulkLabelPop(e.currentTarget) }, svg('tag','ico ico-sm')),
    h('button', { class:'btn btn-sm', type:'button', title:'期限をまとめて設定',
      onClick:e => openBulkDuePop(e.currentTarget) }, svg('hourglass','ico ico-sm')),
    h('button', { class:'btn btn-sm', type:'button', title:'選択中のタスクからテンプレートを作る',
      onClick:bulkTemplate }, svg('layers','ico ico-sm')),
    h('span', { class:'bulk-sep' }),
    h('button', { class:'btn btn-sm btn-primary', type:'button',
      onClick:bulkComplete }, svg('check','ico ico-sm'), '完了'),
    h('button', { class:'btn btn-sm btn-danger', type:'button', title:'まとめて削除',
      onClick:bulkRemove }, svg('trash','ico ico-sm')),
    h('button', { class:'btn btn-sm btn-ghost', type:'button', title:'選択を解除 (Esc)',
      onClick:clearMulti }, svg('x','ico ico-sm'))
  );
}
function openBulkLabelPop(anchor) {
  openPop(anchor, p => {
    app(p, h('div', { class:'pop-title' }, 'ジャンルをまとめて変更'));
    labelsSorted().forEach(l => app(p, popItem(null, l.name, () => bulkSetLabel(l.id), { swatch:l.color })));
    app(p, h('div', { class:'pop-sep' }));
    app(p, popItem('x', 'ジャンルなし', () => bulkSetLabel(null)));
  });
}
function openBulkDuePop(anchor) {
  openPop(anchor, p => {
    app(p, h('div', { class:'pop-title' }, '期限をまとめて設定'));
    [['今日',0], ['明日',1], ['明後日',2], ['今週末',null], ['1週間後',7], ['月末',null], ['来月',30]]
      .forEach(([lbl, n]) => app(p, popItem('cal', lbl, () => {
        bulkSetDue(n != null ? addDays(today(), n) : parseDateToken(lbl));
      })));
    app(p, h('div', { class:'pop-sep' }));
    const di = h('input', { class:'inp', type:'date' });
    di.addEventListener('change', () => { bulkSetDue(di.value || null); closePop(); });
    app(p, h('div', { style:{ padding:'2px 4px 4px' } }, di));
    app(p, popItem('x', '期限をクリア', () => bulkSetDue(null)));
  });
}

function renderSyncChip() {
  const chip = $('#btnSync'), txt = $('#syncTxt');
  const label = { off:'ローカル', ok:'同期済み', syncing:'同期中', error:'同期エラー', dirty:'未同期' }[syncState] || '—';
  chip.dataset.state = syncState;
  txt.textContent = label;
  chip.title = syncState === 'off'
    ? 'クリックして GitHub Gist 同期を設定'
    : `${label}${syncMsg ? ' — ' + syncMsg : ''}\n最終同期: ${fmtAgo(cfg.lastSyncAt)}`;
}
function renderChrome() {
  const n = ui.labelFilter.length;
  $('#filterCount').hidden = !n;
  $('#filterCount').textContent = String(n);
  $('#btnFilter').classList.toggle('is-on', !!n || ui.overdueOnly);
  $('#qClear').hidden = !ui.q;
  const d = new Date();
  clear($('#today'));
  app($('#today'), [h('b', {}, `${d.getMonth()+1}/${d.getDate()}`), ` ${WDAY[d.getDay()]}`]);
}
function renderAll() { renderBoard(); renderStatus(); renderChrome(); renderSyncChip(); renderBulk(); }

/* ───────────────────────────────────────────────────────────────
   8. toast
   ─────────────────────────────────────────────────────────────── */
function toast(text, o) {
  o = o || {};
  const host = $('#toasts');
  const el = h('div', { class:'toast' },
    h('span', { class:'toast-ico' + (o.type === 'danger' ? ' is-danger' : o.type === 'info' ? ' is-info' : '') },
      svg(o.icon || (o.type === 'danger' ? 'alert' : 'check'))),
    h('span', { class:'toast-txt', title:text }, text));
  const kill = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 220); };
  if (o.action) el.append(h('button', { class:'toast-btn', type:'button',
    onClick:() => { o.action.fn(); kill(); } }, o.action.label));
  el.append(h('button', { class:'toast-x', type:'button', 'aria-label':'閉じる', onClick:kill }, svg('x')));
  host.append(el);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(kill, o.ms || (o.action ? 6000 : 2600));
}

/* ───────────────────────────────────────────────────────────────
   9. popover
   ─────────────────────────────────────────────────────────────── */
const popEl = $('#pop');
let popCloser = null;
function openPop(anchor, build, opts) {
  closePop();
  opts = opts || {};
  clear(popEl); popEl.hidden = false;
  build(popEl);
  const r = anchor.getBoundingClientRect();
  const pw = popEl.offsetWidth, ph = popEl.offsetHeight;
  let left = opts.align === 'right' ? r.right - pw : r.left;
  left = Math.max(8, Math.min(left, innerWidth - pw - 8));
  let top = r.bottom + 6;
  if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  popEl.style.left = left + 'px'; popEl.style.top = top + 'px';
  popCloser = e => {
    if (e && popEl.contains(e.target)) return;
    if (e && anchor.contains(e.target)) return;
    closePop();
  };
  setTimeout(() => document.addEventListener('pointerdown', popCloser, true), 0);
}
function closePop() {
  if (popCloser) document.removeEventListener('pointerdown', popCloser, true);
  popCloser = null; popEl.hidden = true; clear(popEl);
}
const popItem = (icon, text, onClick, o) => {
  o = o || {};
  return h('button', { class:'pop-item' + (o.on ? ' is-on' : '') + (o.danger ? ' is-danger' : ''),
    type:'button', onClick:e => { if (!o.keepOpen) closePop(); onClick(e); } },
    icon ? svg(icon) : (o.swatch ? h('span', { class:'pop-swatch', style:{ '--c':o.swatch } }) : null),
    h('span', {}, text),
    o.kbd ? h('span', { class:'pop-item-k' }, o.kbd) : null,
    o.check ? h('span', { class:'pop-check' }, svg('check','ico ico-sm')) : null);
};

/* ───────────────────────────────────────────────────────────────
   10. modal
   ─────────────────────────────────────────────────────────────── */
const modalHost = $('#modalHost'), scrim = $('#scrim');
let modalOpen = false;
function openModal(build, opts) {
  opts = opts || {};
  closeModal();
  const m = h('div', { class:'modal', style:{ '--w':(opts.width || 560) + 'px' },
    role:'dialog', 'aria-modal':'true' });
  build(m);
  clear(modalHost); modalHost.append(m); modalHost.hidden = false;
  scrim.hidden = false; modalOpen = true;
  const first = m.querySelector('input:not([type=hidden]),textarea,button.btn-primary');
  if (first && !opts.noFocus) setTimeout(() => first.focus(), 60);
  return m;
}
function closeModal() {
  modalHost.hidden = true; clear(modalHost); modalOpen = false;
  if (!archOpen && !drawerScrim()) scrim.hidden = true;
}
function modalHead(title, sub) {
  return h('div', { class:'modal-head' },
    h('div', {}, h('div', { class:'modal-title' }, title), sub ? h('div', { class:'modal-sub' }, sub) : null),
    h('button', { class:'modal-x', type:'button', 'aria-label':'閉じる', onClick:closeModal }, svg('x')));
}
function confirmDialog(title, msg, o) {
  o = o || {};
  return new Promise(res => {
    const m = openModal(m => {
      app(m, modalHead(title));
      app(m, h('div', { class:'modal-body' }, h('div', { class:'callout' + (o.danger ? ' callout-warn' : '') },
        svg(o.danger ? 'alert' : 'note'), h('div', {}, msg))));
      app(m, h('div', { class:'modal-foot' },
        h('span', { class:'grow' }),
        h('button', { class:'btn btn-ghost', type:'button', onClick:() => { closeModal(); res(false); } }, 'キャンセル'),
        h('button', { class:'btn ' + (o.danger ? 'btn-danger' : 'btn-primary'), type:'button',
          onClick:() => { closeModal(); res(true); } }, o.ok || 'OK')));
    }, { width:430 });
    m.querySelector('.btn-danger,.btn-primary').focus();
  });
}
/** 名前などを1つ入力させる。キャンセルは null を返す */
function promptDialog(title, msg, placeholder, initial) {
  return new Promise(res => {
    const inp = h('input', { class:'inp', type:'text',
                             placeholder:placeholder || '', value:initial || '' });
    const done = ok => { const v = inp.value.trim(); closeModal(); res(ok && v ? v : null); };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !isComposing(e)) { e.preventDefault(); done(true); }
    });
    openModal(m => {
      app(m, modalHead(title));
      app(m, h('div', { class:'modal-body' },
        msg ? h('div', { class:'hint', style:{ 'margin':'0 0 10px' } }, msg) : null, inp));
      app(m, h('div', { class:'modal-foot' },
        h('span', { class:'grow', style:{ flex:'1' } }),
        h('button', { class:'btn btn-ghost', type:'button', onClick:() => done(false) }, 'キャンセル'),
        h('button', { class:'btn btn-primary', type:'button', onClick:() => done(true) }, '保存')));
    }, { width:450, noFocus:true });
    setTimeout(() => inp.focus(), 60);
  });
}


/* ───────────────────────────────────────────────────────────────
   11. drawer — task detail
   ─────────────────────────────────────────────────────────────── */
const drawer = $('#drawer');
let openId = null;
const drawerScrim = () => openId && window.matchMedia('(max-width:800px)').matches;

/** 開いているカードの枠だけ塗り替える。renderBoard() を呼ぶとカードが全部作り直されて板が瞬く */
function markOpenCard(id) {
  $$('.card.is-open').forEach(el => el.classList.remove('is-open'));
  if (!id) return;
  const el = $(`.card[data-id="${id}"]`);
  if (el) el.classList.add('is-open');
}
function closeDrawer() {
  openId = null;
  drawer.hidden = true; drawer.setAttribute('aria-hidden','true'); clear(drawer);
  if (!modalOpen && !archOpen) scrim.hidden = true;
  markOpenCard(null);
}
function openDrawer(id) {
  const t = state.tasks[id];
  if (!t || t.deleted) return closeDrawer();
  openId = id;
  drawer.hidden = false; drawer.setAttribute('aria-hidden','false');
  if (drawerScrim()) scrim.hidden = false;
  clear(drawer);

  const p = PHASE[t.phase];
  /* head */
  app(drawer, h('div', { class:'drawer-head', style:{ '--pc':`var(--${t.phase})` } },
    h('div', {},
      h('div', { class:'drawer-eyebrow' },
        h('span', { class:'col-dot', style:{ '--pc':`var(--${t.phase})` } }), p.label,
        h('span', { style:{ color:'var(--text-4)', 'letter-spacing':'0' } }, '／ ' + p.jp))),
    h('span', { style:{ flex:'1' } }),
    h('button', { class:'card-btn', type:'button', title:'完了 (X)', onClick:() => { complete(id); closeDrawer(); } }, svg('check')),
    h('button', { class:'modal-x', type:'button', 'aria-label':'閉じる', onClick:closeDrawer }, svg('x'))));

  const body = h('div', { class:'drawer-body' });
  app(drawer, body);

  /* title */
  const ta = h('textarea', { class:'title-input', rows:'1', placeholder:'タスク名', spellcheck:'false' });
  ta.value = t.title;
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.max(44, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', () => { fit(); debouncePatch(id, { title:ta.value }); });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing(e)) { e.preventDefault(); ta.blur(); }
  });
  app(body, h('div', { class:'field' }, ta));
  setTimeout(fit, 0);

  /* meta */
  app(body, h('div', { class:'field meta-line' },
    `作成 ${fmtStamp(t.createdAt)}`, h('span', { class:'sub-dot' }), `更新 ${fmtStamp(t.updatedAt)}`,
    h('span', { style:{ flex:'1' } }),
    h('button', { class:'sub-btn' + (t.p1 ? ' sub-warn' : ''), type:'button',
      onClick:() => { patch(id, { p1:!t.p1 }); openDrawer(id); } },
      svg('flame','ico ico-sm'), t.p1 ? '重要マークを外す' : '重要にする')));

  /* phase */
  const seg = h('div', { class:'seg' });
  phaseOrder().forEach(pid => {
    seg.append(h('button', { class:'seg-btn' + (pid === t.phase ? ' is-on' : ''), type:'button',
      style:{ '--pc':`var(--${pid})` }, onClick:() => { setPhase(id, pid); openDrawer(id); } },
      PHASE[pid].label, h('small', {}, PHASE[pid].jp)));
  });
  app(body, h('div', { class:'field' }, h('div', { class:'label' }, svg('arrowR','ico'), 'フェーズ'), seg));

  /* label */
  const lp = h('div', { class:'label-picker' });
  labelsSorted().forEach(l => lp.append(h('button', {
    class:'lp' + (t.labelId === l.id ? ' is-on' : ''), type:'button', style:{ '--c':l.color },
    onClick:() => { patch(id, { labelId:t.labelId === l.id ? null : l.id }); openDrawer(id); } },
    h('span', { class:'lp-dot' }), l.name)));
  lp.append(h('button', { class:'lp', type:'button', onClick:openLabelManager },
    svg('gear','ico ico-sm'), 'ジャンルを管理'));
  app(body, h('div', { class:'field' }, h('div', { class:'label' }, svg('tag','ico'), 'ジャンル'), lp));

  /* due */
  const dueInp = h('input', { class:'inp', type:'date', value:t.due || '', style:{ 'max-width':'190px' } });
  dueInp.addEventListener('change', () => { patch(id, { due:dueInp.value || null }); openDrawer(id); });
  const di = dueInfo(t.due);
  app(body, h('div', { class:'field' },
    h('div', { class:'label' }, svg('hourglass','ico'), '期限',
      di ? h('span', { class:di.cls, style:{ 'letter-spacing':'0', 'text-transform':'none', 'font-weight':'600' } }, di.txt) : null),
    h('div', { class:'row' }, dueInp,
      t.due ? h('button', { class:'btn btn-sm btn-ghost', type:'button',
        onClick:() => { patch(id, { due:null }); openDrawer(id); } }, svg('x','ico ico-sm'), 'クリア') : null),
    h('div', { class:'quick-dates' },
      [['今日',0],['明日',1],['明後日',2],['1週間後',7],['今週末',null],['月末',null],['来月',30]].map(([lbl, n]) =>
        h('button', { class:'qd', type:'button', onClick:() => {
          const v = n != null ? addDays(today(), n) : parseDateToken(lbl === '今週末' ? '今週末' : '月末');
          patch(id, { due:v }); openDrawer(id);
        } }, lbl))),
    t.phase !== 'someday' ? h('div', { class:'hint' }, 'カード上では Someday だけ期限を常に表示します。他のフェーズは期限切れ・当日のみバッジが出ます。') : null));

  /* checking detail */
  if (t.phase === 'checking') {
    const kseg = h('div', { class:'seg seg-2', style:{ '--pc':'var(--checking)' } },
      h('button', { class:'seg-btn' + (t.checkKind !== 'self' ? ' is-on' : ''), type:'button',
        style:{ '--pc':'var(--checking)' }, onClick:() => { patch(id, { checkKind:'other' }); openDrawer(id); } },
        '相手待ち', h('small', {}, 'ボールは相手')),
      h('button', { class:'seg-btn' + (t.checkKind === 'self' ? ' is-on' : ''), type:'button',
        style:{ '--pc':'var(--checking)' }, onClick:() => { patch(id, { checkKind:'self' }); openDrawer(id); } },
        '自分で確認', h('small', {}, '最終チェック待ち')));
    const who = h('input', { class:'inp', type:'text', placeholder:'例：山田さん／A社／情シス', value:t.waitingFor || '' });
    who.addEventListener('input', () => debouncePatch(id, { waitingFor:who.value }, { render:false }));
    const since = h('input', { class:'inp', type:'date', value:t.waitingSince || '', style:{ 'max-width':'190px' } });
    since.addEventListener('change', () => { patch(id, { waitingSince:since.value || null }); openDrawer(id); });
    const elapsed = t.waitingSince && dayDiff(t.waitingSince, today());
    app(body, h('div', { class:'field' },
      h('div', { class:'label' }, svg('eye','ico'), '確認の種類'), kseg,
      t.checkKind !== 'self' ? h('div', { style:{ 'margin-top':'10px' } },
        h('div', { class:'label' }, svg('user','ico'), '誰・どこ待ち'), who) : null,
      h('div', { style:{ 'margin-top':'10px' } },
        h('div', { class:'label' }, svg('clock','ico'), '待ち始めた日',
          elapsed != null && elapsed >= 1 ? h('span', { class:elapsed >= 7 ? 'sub-danger' : elapsed >= 3 ? 'sub-warn' : 'sub-rel',
            style:{ 'letter-spacing':'0','text-transform':'none','font-weight':'600' } }, `${elapsed}日経過`) : null),
        since)));
  }

  /* subtasks（手順） */
  const subsWrap = h('div', { class:'subs' });
  const subCnt   = h('span', { class:'sub-count' });
  const newSub   = h('input', { class:'sub-text', type:'text',
                                placeholder:'手順を追加（Enter で続けて追加）', spellcheck:'false' });
  const refreshCnt = () => {
    const t2 = state.tasks[id]; if (!t2) return;
    subCnt.textContent = subCount(t2) ? `${subDone(t2)} / ${subCount(t2)}` : '';
  };
  const drawSubs = () => {
    clear(subsWrap);
    const t2 = state.tasks[id]; if (!t2) return;
    (t2.subs || []).forEach(s => {
      const box = h('button', { class:'sub-box' + (s.done ? ' is-on' : ''), type:'button',
        'aria-label':'手順の完了を切り替え',
        onClick:() => { toggleSub(id, s.id); drawSubs(); refreshCnt(); } }, svg('check','ico ico-sm'));
      const txt = h('input', { class:'sub-text' + (s.done ? ' is-done' : ''), type:'text',
        value:s.text, spellcheck:'false' });
      txt.addEventListener('input', () => patchSub(id, s.id, txt.value));
      txt.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !isComposing(e)) { e.preventDefault(); newSub.focus(); }
      });
      subsWrap.append(h('div', { class:'sub-row' }, box, txt,
        h('button', { class:'card-btn', type:'button', title:'この手順を削除',
          onClick:() => { removeSub(id, s.id); drawSubs(); refreshCnt(); } }, svg('trash'))));
    });
    subsWrap.append(h('div', { class:'sub-row sub-new' }, svg('plus','ico ico-sm qa-plus'), newSub));
  };
  newSub.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || isComposing(e)) return;
    e.preventDefault();
    if (!addSub(id, newSub.value)) return;
    newSub.value = ''; drawSubs(); refreshCnt(); newSub.focus();
  });
  drawSubs(); refreshCnt();
  app(body, h('div', { class:'field' },
    h('div', { class:'label' }, svg('checklist','ico'), '手順', subCnt), subsWrap));

  /* repeat（繰り返し） */
  const rp = t.repeat;
  const rseg = h('div', { class:'seg seg-rep' });
  [['','なし'], ['daily','毎日'], ['weekdays','平日'], ['weekly','毎週'], ['monthly','毎月']]
    .forEach(([k, lbl]) => rseg.append(h('button', {
      class:'seg-btn' + ((rp ? rp.kind : '') === k ? ' is-on' : ''), type:'button',
      style:{ '--pc':`var(--${t.phase})` },
      onClick:() => {
        if (!k) patch(id, { repeat:null });
        else {
          const seed = { kind:k, interval:1, base:t.due ? 'due' : 'done' };
          const ref = parseYmd(t.due) || new Date();
          if (k === 'weekly')  seed.wdays = [ref.getDay()];
          if (k === 'monthly') seed.monthDay = ref.getDate();
          patch(id, { repeat:normRepeat(seed) });
        }
        openDrawer(id);
      } }, lbl)));

  const rdetail = h('div', {});
  if (rp) {
    const rows = [];
    const unit = { daily:'日ごと', weekdays:'', weekly:'週ごと', monthly:'か月ごと' }[rp.kind];
    if (unit) {
      const ivInp = h('input', { class:'inp', type:'number', min:'1', max:'99',
                                 value:String(rp.interval), style:{ 'max-width':'78px' } });
      ivInp.addEventListener('change', () => {
        patch(id, { repeat:normRepeat(Object.assign({}, rp, { interval:ivInp.value })) });
        openDrawer(id);
      });
      rows.push(h('div', { class:'row', style:{ 'margin-top':'9px' } }, ivInp,
        h('span', { style:{ 'font-size':'12.5px', color:'var(--text-3)' } }, unit)));
    }
    if (rp.kind === 'weekly') {
      const wrow = h('div', { class:'wdays' });
      WDAY.forEach((w, i) => wrow.append(h('button', {
        class:'wday' + ((rp.wdays || []).indexOf(i) >= 0 ? ' is-on' : ''), type:'button',
        onClick:() => {
          const set = new Set(rp.wdays || []);
          set.has(i) ? set.delete(i) : set.add(i);
          patch(id, { repeat:normRepeat(Object.assign({}, rp, { wdays:Array.from(set) })) });
          openDrawer(id);
        } }, w)));
      rows.push(wrow);
    }
    if (rp.kind === 'monthly') {
      const dsel = h('select', { class:'inp inp-sel', style:{ 'max-width':'120px' } });
      for (let d = 1; d <= 31; d++)
        dsel.append(h('option', { value:String(d), selected:String(rp.monthDay) === String(d) }, `${d}日`));
      dsel.append(h('option', { value:'last', selected:rp.monthDay === 'last' }, '月末'));
      dsel.addEventListener('change', () => {
        patch(id, { repeat:normRepeat(Object.assign({}, rp, { monthDay:dsel.value })) });
        openDrawer(id);
      });
      rows.push(h('div', { class:'row', style:{ 'margin-top':'9px' } }, dsel));
    }
    rows.push(h('div', { class:'seg seg-2', style:{ 'margin-top':'9px' } },
      h('button', { class:'seg-btn' + (rp.base === 'due' ? ' is-on' : ''), type:'button',
        style:{ '--pc':`var(--${t.phase})` },
        onClick:() => { patch(id, { repeat:normRepeat(Object.assign({}, rp, { base:'due' })) }); openDrawer(id); } },
        '期限から', h('small', {}, '前回の期限を起点')),
      h('button', { class:'seg-btn' + (rp.base === 'done' ? ' is-on' : ''), type:'button',
        style:{ '--pc':`var(--${t.phase})` },
        onClick:() => { patch(id, { repeat:normRepeat(Object.assign({}, rp, { base:'done' })) }); openDrawer(id); } },
        '完了日から', h('small', {}, '完了した日を起点'))));
    rows.push(h('div', { class:'hint' },
      `いま完了すると、次回分は ${fmtDate(nextRepeatDate(t)) || '—'} の期限で作られます。`));
    app(rdetail, rows);
  }
  app(body, h('div', { class:'field' },
    h('div', { class:'label' }, svg('cycle','ico'), '繰り返し',
      rp ? h('span', { class:'label-val' }, repeatLabel(rp)) : null),
    rseg, rdetail));

  /* note */
  const note = h('textarea', { class:'inp', placeholder:'背景・次の一手・リンクなど', rows:'4' });
  note.value = t.note || '';
  note.addEventListener('input', () => debouncePatch(id, { note:note.value }, { render:false }));
  app(body, h('div', { class:'field' }, h('div', { class:'label' }, svg('note','ico'), 'メモ'), note));

  /* foot */
  app(drawer, h('div', { class:'drawer-foot' },
    h('button', { class:'btn btn-primary', type:'button',
      onClick:() => { complete(id); closeDrawer(); } }, svg('check','ico ico-sm'), '完了にする'),
    h('button', { class:'btn', type:'button', title:'複製',
      onClick:() => { const c = duplicate(id); if (c) openDrawer(c.id); } }, svg('copy','ico ico-sm')),
    h('span', { class:'grow', style:{ flex:'1' } }),
    h('button', { class:'btn btn-danger', type:'button', onClick:async () => {
      if (await confirmDialog('タスクを削除', 'このタスクを削除します。直後に「元に戻す」で復元できます。',
        { danger:true, ok:'削除する' })) removeTask(id);
    } }, svg('trash','ico ico-sm'))));

  markOpenCard(id);
}
const debTimers = {};
function debouncePatch(id, fields, opts) {
  const k = id + Object.keys(fields).join(',');
  clearTimeout(debTimers[k]);
  debTimers[k] = setTimeout(() => patch(id, fields, opts), 320);
}

/* ───────────────────────────────────────────────────────────────
   12. label manager
   ─────────────────────────────────────────────────────────────── */
function openLabelManager() {
  const m = openModal(m => {
    app(m, modalHead('ジャンル', '色とジャンル名は自由に変更できます。タスクの左端バーとタグに反映されます。'));
    const bodyEl = h('div', { class:'modal-body' });
    const list = h('div', {});
    const redraw = () => {
      clear(list);
      const ls = labelsSorted();
      if (!ls.length) list.append(h('div', { class:'pop-empty' }, 'ジャンルがありません'));
      ls.forEach((l, i) => {
        const sw = h('button', { class:'lab-swatch', type:'button', style:{ '--c':l.color }, title:'色を変更' });
        sw.addEventListener('click', () => openPop(sw, p => {
          app(p, h('div', { class:'pop-title' }, '色を選ぶ'));
          const grid = h('div', { class:'palette' });
          PALETTE.forEach(c => grid.append(h('button', {
            class:'pal' + (c.toLowerCase() === String(l.color).toLowerCase() ? ' is-on' : ''),
            type:'button', style:{ '--c':c }, onClick:() => { patchLabel(l.id, { color:c }); closePop(); redraw(); renderAll(); } })));
          app(p, grid);
          const ci = h('input', { class:'inp', type:'color', value:l.color, style:{ 'margin-top':'6px', height:'32px', padding:'2px' } });
          ci.addEventListener('input', () => { patchLabel(l.id, { color:ci.value }); redraw(); renderAll(); });
          app(p, ci);
        }));
        const name = h('input', { class:'lab-name', type:'text', value:l.name, placeholder:'ジャンル名' });
        name.addEventListener('input', () => { patchLabel(l.id, { name:name.value }); renderAll(); });
        const used = labelUsage(l.id);
        list.append(h('div', { class:'lab-row' }, sw, name,
          h('span', { class:'lab-used', title:'このジャンルの未完了タスク数' }, String(used)),
          h('div', { class:'lab-acts' },
            h('button', { class:'card-btn', type:'button', title:'上へ', disabled:i === 0,
              onClick:() => { const prev = ls[i-1]; if (!prev) return; const a = l.order, b = prev.order;
                patchLabel(l.id, { order:b }); patchLabel(prev.id, { order:a === b ? b + 1 : a }); redraw(); renderAll(); } }, svg('up')),
            h('button', { class:'card-btn', type:'button', title:'下へ', disabled:i === ls.length-1,
              onClick:() => { const nx = ls[i+1]; if (!nx) return; const a = l.order, b = nx.order;
                patchLabel(l.id, { order:b }); patchLabel(nx.id, { order:a === b ? b - 1 : a }); redraw(); renderAll(); } }, svg('down')),
            h('button', { class:'card-btn', type:'button', title:'削除', onClick:async () => {
              if (await confirmDialog('ジャンルを削除',
                used ? `「${l.name}」を削除します。使用中の ${used} 件のタスクはジャンル未設定になります（タスクは消えません）。`
                     : `「${l.name}」を削除します。`, { danger:true, ok:'削除する' })) { removeLabel(l.id); redraw(); }
            } }, svg('trash'))
          )));
      });
    };
    redraw();
    app(bodyEl, list);
    app(bodyEl, h('button', { class:'btn btn-block', type:'button', style:{ 'margin-top':'12px' },
      onClick:() => { addLabel(); redraw(); } }, svg('plus','ico ico-sm'), 'ジャンルを追加'));
    app(bodyEl, h('div', { class:'hint' }, 'クイック追加欄で ', h('code', {}, '#ジャンル名'),
      ' と打つと、そのジャンルでタスクを作れます（前方一致でOK）。'));
    app(m, bodyEl);
    app(m, h('div', { class:'modal-foot' }, h('span', { class:'grow' }),
      h('button', { class:'btn btn-primary', type:'button', onClick:closeModal }, '閉じる')));
  }, { width:520 });
  return m;
}
/* ───────────────────────────────────────────────────────────────
   12b. templates
   ─────────────────────────────────────────────────────────────── */
function openTemplates() {
  openModal(m => {
    app(m, modalHead('テンプレート', '定型のタスク群を保存して、1クリックで投入します。'));
    const b = h('div', { class:'modal-body' });
    const list = h('div', {});
    const redraw = () => {
      clear(list);
      const tps = templatesSorted();
      if (!tps.length) {
        list.append(h('div', { class:'col-empty', style:{ margin:'4px 0' } },
          svg('layers','ico'),
          h('div', { class:'col-empty-t' }, 'まだテンプレートがありません'),
          h('div', { class:'col-empty-s' },
            'ボードでタスクを Ctrl+クリックで複数選び、下に出るバーの重ねアイコンから保存できます。')));
        return;
      }
      tps.forEach(tp => {
        const nameInp = h('input', { class:'lab-name', type:'text', value:tp.name, placeholder:'テンプレート名' });
        nameInp.addEventListener('input', () => patchTemplate(tp.id, { name:nameInp.value }));
        const items = h('div', { class:'tpl-items' });
        tp.items.forEach((it, i) => {
          const lab = it.labelId && state.labels[it.labelId] ? state.labels[it.labelId] : null;
          items.append(h('div', { class:'tpl-item' },
            h('span', { class:'tpl-phase', style:{ '--pc':`var(--${it.phase})` } }, PHASE[it.phase].label),
            h('span', { class:'tpl-title' }, it.title),
            lab ? h('span', { class:'tag', style:{ '--lc':lab.color } },
                    h('span', { class:'tag-dot' }), lab.name) : null,
            it.subs.length ? h('span', { class:'lab-used' }, `手順${it.subs.length}`) : null,
            it.dueOffset != null ? h('span', { class:'tpl-off' },
              it.dueOffset === 0 ? '当日' : it.dueOffset > 0 ? `+${it.dueOffset}日` : `${it.dueOffset}日`) : null,
            h('button', { class:'card-btn', type:'button', title:'この項目を外す',
              onClick:() => { removeTemplateItem(tp.id, i); redraw(); } }, svg('x'))));
        });
        list.append(h('div', { class:'tpl-row' },
          h('div', { class:'tpl-head' },
            svg('layers','ico'), nameInp,
            h('span', { class:'lab-used' }, `${tp.items.length}件`),
            h('button', { class:'btn btn-sm btn-primary', type:'button',
              onClick:() => { applyTemplate(tp.id); closeModal(); } }, svg('plus','ico ico-sm'), '投入'),
            h('button', { class:'card-btn', type:'button', title:'テンプレートを削除',
              onClick:async () => {
                if (await confirmDialog('テンプレートを削除', `「${tp.name}」を削除します。`,
                    { danger:true, ok:'削除する' })) { removeTemplate(tp.id); redraw(); }
              } }, svg('trash'))),
          items));
      });
    };
    redraw();
    app(b, list);
    app(b, h('div', { class:'hint' },
      '期限は「投入日からの日数」で保存されます（作成時に3日後だった項目は、投入日の3日後になります）。'));
    app(m, b);
    app(m, h('div', { class:'modal-foot' },
      h('span', { class:'grow', style:{ flex:'1' } }),
      h('button', { class:'btn btn-primary', type:'button', onClick:closeModal }, '閉じる')));
  }, { width:620, noFocus:true });
}

/* ───────────────────────────────────────────────────────────────
   12c. command palette (Ctrl+K)
   ─────────────────────────────────────────────────────────────── */
const palEl = $('#palette');
let palOpen = false, palItems = [], palIdx = 0;

/** 連続一致を上位にする軽いスコア。0 は不一致 */
function fuzzyScore(hay, needle) {
  if (!needle) return 1;
  const H = String(hay).toLowerCase(), N = needle.toLowerCase();
  const direct = H.indexOf(N);
  if (direct >= 0) return 1000 - direct * 2;
  let i = 0, score = 0, streak = 0;
  for (const ch of N) {
    const at = H.indexOf(ch, i);
    if (at < 0) return 0;
    streak = at === i ? streak + 1 : 0;
    score += 10 + streak * 4 - Math.min(8, at - i);
    i = at + 1;
  }
  return Math.max(1, score);
}

function paletteCommands() {
  const cmds = [];
  phaseOrder().forEach(pid => cmds.push({ kind:'cmd', icon:'plus',
    label:`${PHASE[pid].label} に新規追加`, hint:PHASE[pid].jp,
    run:() => { setActivePhase(pid); const c = cols[pid]; if (c) c.input.focus(); } }));
  phaseOrder().forEach(pid => cmds.push({ kind:'cmd', icon:'arrowR',
    label:`${PHASE[pid].label} を表示`, hint:'列へ移動', run:() => setActivePhase(pid) }));
  templatesSorted().forEach(tp => cmds.push({ kind:'cmd', icon:'layers',
    label:`テンプレート：${tp.name} を投入`, hint:`${tp.items.length}件`,
    run:() => applyTemplate(tp.id) }));
  cmds.push(
    { kind:'cmd', icon:'layers',    label:'テンプレートを管理',     hint:'T',       run:openTemplates },
    { kind:'cmd', icon:'archive',   label:'振り返り（アーカイブ）', hint:'A',       run:openArchive },
    { kind:'cmd', icon:'tag',       label:'ジャンルを管理',         hint:'',        run:openLabelManager },
    { kind:'cmd', icon:'refresh',   label:'いま同期する',           hint:'Shift+S', run:() => sync({ loud:true }) },
    { kind:'cmd', icon:'gear',      label:'設定を開く',             hint:'',        run:openSettings },
    { kind:'cmd', icon:'spark',     label:'ショートカット一覧',     hint:'?',       run:openHelp },
    { kind:'cmd', icon:'down',      label:'JSONで書き出し',         hint:'',        run:doExport },
    { kind:'cmd', icon:'checklist', label:'表示中のタスクを全選択', hint:'Ctrl+A',  run:selectAllVisible }
  );
  if (ui.q || ui.labelFilter.length || ui.overdueOnly) cmds.push({ kind:'cmd', icon:'x',
    label:'絞り込みを解除', hint:'',
    run:() => { ui.q = ''; $('#q').value = ''; ui.labelFilter = []; ui.overdueOnly = false; saveUi(); renderAll(); } });
  return cmds;
}

function palSearch(q) {
  const out = [];
  Object.values(state.tasks).filter(t => !t.deleted && !t.done).forEach(t => {
    const l = labelOf(t);
    const hay = [t.title, t.note, t.waitingFor, l ? l.name : ''].filter(Boolean).join(' ');
    const sc = fuzzyScore(hay, q);
    if (sc > 0) out.push({ kind:'task', id:t.id, label:t.title, phase:t.phase, task:t,
      score:sc + (t.p1 ? 40 : 0) + (t.phase === 'now' ? 30 : 0) });
  });
  paletteCommands().forEach(c => {
    const sc = fuzzyScore(c.label + ' ' + (c.hint || ''), q);
    if (sc > 0) out.push(Object.assign({}, c, { score:sc }));
  });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 40);
}

function drawPalette(q) {
  const listEl = $('#palList');
  palItems = palSearch(q);
  palIdx = 0;
  clear(listEl);
  if (!palItems.length) {
    listEl.append(h('div', { class:'pal-empty' }, '一致するものがありません'));
    return;
  }
  let lastKind = null;
  palItems.forEach((it, i) => {
    if (it.kind !== lastKind) {
      lastKind = it.kind;
      listEl.append(h('div', { class:'pal-group' }, it.kind === 'task' ? 'タスク' : 'コマンド'));
    }
    const row = h('button', { class:'pal-item' + (i === 0 ? ' is-on' : ''), type:'button',
      dataset:{ i:String(i) }, onClick:() => runPalette(i) });
    if (it.kind === 'task') {
      const lab = labelOf(it.task);
      app(row, h('span', { class:'pal-dot', style:{ '--pc':`var(--${it.phase})` } }),
        h('span', { class:'pal-label' }, it.label),
        lab ? h('span', { class:'tag', style:{ '--lc':lab.color } },
                h('span', { class:'tag-dot' }), lab.name) : null,
        h('span', { class:'pal-hint' }, PHASE[it.phase].label));
    } else {
      app(row, svg(it.icon || 'arrowR', 'ico'),
        h('span', { class:'pal-label' }, it.label),
        it.hint ? h('span', { class:'pal-hint mono' }, it.hint) : null);
    }
    listEl.append(row);
  });
}
function movePalette(d) {
  if (!palItems.length) return;
  palIdx = (palIdx + d + palItems.length) % palItems.length;
  $$('.pal-item', palEl).forEach(el => el.classList.toggle('is-on', +el.dataset.i === palIdx));
  const on = palEl.querySelector('.pal-item.is-on');
  if (on) on.scrollIntoView({ block:'nearest' });
}
function runPalette(i, alt) {
  const it = palItems[i == null ? palIdx : i];
  if (!it) return;
  closePalette();
  if (it.kind === 'task') {
    if (alt) { complete(it.id); return; }
    const t = state.tasks[it.id];
    if (t) { setActivePhase(t.phase); selectCard(it.id, true); openDrawer(it.id); }
  } else if (it.run) it.run();
}
function openPalette() {
  if (palOpen) return;
  palOpen = true;
  palEl.hidden = false;
  document.body.classList.add('has-palette');
  const inp = $('#palInput');
  inp.value = '';
  drawPalette('');
  setTimeout(() => inp.focus(), 20);
}
function closePalette() {
  palOpen = false;
  palEl.hidden = true;
  document.body.classList.remove('has-palette');
  clear($('#palList'));
}


/* ───────────────────────────────────────────────────────────────
   13. archive sheet
   ─────────────────────────────────────────────────────────────── */
const archHost = $('#archiveHost');
let archOpen = false;
function closeArchive() {
  archOpen = false; archHost.hidden = true; clear(archHost);
  if (!modalOpen && !drawerScrim()) scrim.hidden = true;
}
function openArchive() {
  archOpen = true; scrim.hidden = false;
  clear(archHost); archHost.hidden = false;
  const sheet = h('div', { class:'sheet', role:'dialog', 'aria-modal':'true' });

  const q = h('input', { class:'inp', type:'text', placeholder:'完了タスクを検索', style:{ 'max-width':'220px' } });
  app(sheet, h('div', { class:'modal-head' },
    h('div', {}, h('div', { class:'modal-title' }, '振り返り'),
      h('div', { class:'modal-sub' }, '完了したタスクは日付ごとに残ります。戻すこともできます。')),
    h('span', { style:{ flex:'1' } }), q,
    h('button', { class:'modal-x', type:'button', 'aria-label':'閉じる', onClick:closeArchive }, svg('x'))));

  const stats = h('div', { class:'arch-stats' });
  const body  = h('div', { class:'arch-body' });
  app(sheet, stats, body);
  app(sheet, h('div', { class:'modal-foot' },
    h('button', { class:'btn btn-sm btn-ghost', type:'button', onClick:async () => {
      const old = archived().filter(t => (Date.now() - t.doneAt) > 90 * 86400000);
      if (!old.length) return toast('90日より古い完了タスクはありません', { type:'info', icon:'note' });
      if (await confirmDialog('古い記録を整理', `完了から90日以上たった ${old.length} 件を完全に削除します。`,
        { danger:true, ok:'削除する' })) {
        const now = Date.now();
        old.forEach(t => { t.deleted = true; t.updatedAt = now; });
        touch(); draw(); toast(`${old.length} 件を整理しました`, { icon:'archive' });
      }
    } }, svg('trash','ico ico-sm'), '90日より古い記録を整理'),
    h('span', { class:'grow', style:{ flex:'1' } }),
    h('button', { class:'btn btn-primary', type:'button', onClick:closeArchive }, '閉じる')));

  function draw() {
    const kw = q.value.trim().toLowerCase();
    let list = archived();
    if (kw) list = list.filter(t => (t.title + ' ' + (t.note || '')).toLowerCase().includes(kw));

    const t0 = new Date(); t0.setHours(0,0,0,0);
    const w0 = new Date(t0); w0.setDate(w0.getDate() - ((w0.getDay() + 6) % 7));
    const m0 = new Date(t0.getFullYear(), t0.getMonth(), 1);
    const all = archived();
    clear(stats);
    [['今日', all.filter(t => t.doneAt >= t0.getTime()).length],
     ['今週', all.filter(t => t.doneAt >= w0.getTime()).length],
     ['今月', all.filter(t => t.doneAt >= m0.getTime()).length],
     ['累計', all.length]].forEach(([l, n]) =>
      stats.append(h('div', { class:'arch-stat' }, h('div', { class:'arch-stat-n' }, String(n)), h('div', { class:'arch-stat-l' }, l))));

    clear(body);
    if (!list.length) {
      body.append(h('div', { class:'col-empty', style:{ margin:'26px 0' } }, svg('archive','ico'),
        h('div', { class:'col-empty-t' }, kw ? '見つかりませんでした' : 'まだ完了記録がありません'),
        h('div', { class:'col-empty-s' }, kw ? 'キーワードを変えてみてください。' : 'カード左の丸をクリックすると、ここに積み上がっていきます。')));
      return;
    }
    let curKey = '';
    list.forEach(t => {
      const d = new Date(t.doneAt);
      const key = ymd(d);
      if (key !== curKey) {
        curKey = key;
        const diff = dayDiff(key, today());
        const label = diff === 0 ? '今日' : diff === 1 ? '昨日' : `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} (${WDAY[d.getDay()]})`;
        const dayCount = list.filter(x => ymd(new Date(x.doneAt)) === key).length;
        body.append(h('div', { class:'arch-day' }, label, h('span', { class:'lab-used' }, `${dayCount}件`)));
      }
      const lab = labelOf(t);
      body.append(h('div', { class:'arch-row', style:{ '--lc':(lab ? lab.color : 'var(--text-4)') } },
        h('span', { class:'arch-check' }, svg('check')),
        h('span', { class:'arch-t' }, h('s', {}, t.title)),
        lab ? h('span', { class:'tag', style:{ '--lc':lab.color } }, h('span', { class:'tag-dot' }), lab.name) : null,
        h('span', { class:'arch-time mono' }, `${pad(d.getHours())}:${pad(d.getMinutes())}`),
        h('div', { class:'arch-acts' },
          h('button', { class:'card-btn', type:'button', title:'未完了に戻す',
            onClick:() => { uncomplete(t.id); draw(); toast('戻しました', { icon:'undo' }); } }, svg('undo')),
          h('button', { class:'card-btn', type:'button', title:'完全に削除',
            onClick:async () => { if (await confirmDialog('記録を削除', 'この完了記録を削除します。', { danger:true, ok:'削除する' })) {
              state.tasks[t.id].deleted = true; state.tasks[t.id].updatedAt = Date.now(); touch(); draw(); } } }, svg('trash')))));
    });
  }
  q.addEventListener('input', draw);
  draw();
  archHost.append(sheet);
  setTimeout(() => q.focus(), 60);
}

/* ───────────────────────────────────────────────────────────────
   14. settings
   ─────────────────────────────────────────────────────────────── */
function openSettings() {
  openModal(m => {
    app(m, modalHead('設定', '同期・並び順・データ管理'));
    const b = h('div', { class:'modal-body' });

    /* --- sync --- */
    app(b, h('div', { class:'label' }, svg('cloud','ico'), '端末間の同期（GitHub Gist）'));
    const tok = h('input', { class:'inp', type:'password', placeholder:'ghp_… / github_pat_…',
      value:cfg.token, autocomplete:'off', spellcheck:'false' });
    const gid = h('input', { class:'inp', type:'text', placeholder:'（初回同期で自動作成されます）',
      value:cfg.gistId, autocomplete:'off', spellcheck:'false' });
    const stateLine = h('div', { class:'hint' });
    const refreshLine = () => {
      clear(stateLine);
      const label = { off:'未設定', ok:'同期済み', syncing:'同期中…', error:'エラー', dirty:'未同期の変更あり' }[syncState];
      app(stateLine, [`状態: ${label}`, syncMsg ? ` — ${syncMsg}` : '', ` ／ 最終同期: ${fmtAgo(cfg.lastSyncAt)}`]);
    };
    refreshLine();

    app(b, h('div', { class:'field' },
      h('div', { class:'row' }, tok,
        h('button', { class:'btn', type:'button', onClick:async () => {
          cfg.token = tok.value.trim(); cfg.gistId = gid.value.trim(); saveCfg();
          if (!cfg.token) { setSync('off'); return toast('トークンを空にしました（ローカル保存のみ）', { type:'info', icon:'note' }); }
          await sync({ loud:true }); gid.value = cfg.gistId; refreshLine();
        } }, svg('refresh','ico ico-sm'), 'いま同期')),
      h('div', { class:'hint' }, 'Personal Access Token（権限は ', h('code', {}, 'gist'), ' のみでOK）'),
      h('div', { class:'row', style:{ 'margin-top':'8px' } }, gid,
        h('button', { class:'btn btn-sm', type:'button', disabled:!cfg.gistId,
          onClick:() => cfg.gistId && window.open('https://gist.github.com/' + cfg.gistId, '_blank', 'noopener') },
          svg('ext','ico ico-sm'))),
      h('div', { class:'hint' }, 'Gist ID（別の端末では、ここに同じIDを貼ると同じデータにつながります）'),
      stateLine));

    const autoSw = h('input', { type:'checkbox', checked:cfg.auto });
    autoSw.addEventListener('change', () => { cfg.auto = autoSw.checked; saveCfg(); if (cfg.auto && dirty) sync({}); });
    app(b, h('div', { class:'field' },
      h('label', { class:'switch' }, autoSw, h('span', { class:'switch-track' }),
        h('span', {}, h('div', { class:'switch-txt' }, '自動同期'),
          h('div', { class:'switch-sub' }, '変更の数秒後・タブに戻ったとき・90秒ごとに同期します')))));

    app(b, h('div', { class:'callout callout-warn', style:{ 'margin-bottom':'15px' } }, svg('alert'),
      h('div', {}, h('b', {}, 'トークンの取り扱い'),
        h('div', {}, 'トークンはこのブラウザの localStorage にのみ保存され、GitHub 以外へは送信されません。共有PCや他人が触る端末では設定しないでください。'),
        h('div', { style:{ 'margin-top':'5px' } }, '発行: ',
          h('a', { href:'https://github.com/settings/tokens/new?scopes=gist&description=FLOWDECK', target:'_blank', rel:'noopener' },
            'github.com/settings/tokens'), ' → Generate new token (classic) → ', h('code', {}, 'gist'), ' にチェック'))));

    /* --- 通知 --- */
    app(b, h('div', { class:'label' }, svg('bell','ico'), 'リマインド通知'));
    const nSw = h('input', { type:'checkbox', checked:!!(cfg.notify && cfg.notify.enabled) });
    nSw.addEventListener('change', async () => {
      if (nSw.checked) {
        if (!notifyOk()) { nSw.checked = false; return toast('このブラウザは通知に対応していません', { type:'danger' }); }
        const p = await Notification.requestPermission();
        if (p !== 'granted') { nSw.checked = false; return toast('通知が許可されませんでした', { type:'danger', icon:'bell' }); }
      }
      cfg.notify = Object.assign({ hour:9, lastDate:'' }, cfg.notify, { enabled:nSw.checked });
      saveCfg();
      toast(nSw.checked ? '通知をオンにしました' : '通知をオフにしました', { icon:'bell' });
    });
    const hSel = h('select', { class:'inp inp-sel', style:{ 'max-width':'104px' } });
    for (let hh = 5; hh <= 23; hh++) hSel.append(h('option', {
      value:String(hh), selected:((cfg.notify && cfg.notify.hour) == null ? 9 : cfg.notify.hour) === hh }, `${hh}:00`));
    hSel.addEventListener('change', () => {
      cfg.notify = Object.assign({ enabled:false, lastDate:'' }, cfg.notify, { hour:+hSel.value });
      saveCfg();
    });
    const rc = reminderCounts();
    app(b, h('div', { class:'field' },
      h('label', { class:'switch' }, nSw, h('span', { class:'switch-track' }),
        h('span', {}, h('div', { class:'switch-txt' }, '毎日1回まとめて知らせる'),
          h('div', { class:'switch-sub' }, '期限切れ・今日が期限・7日以上待ちの件数'))),
      h('div', { class:'row', style:{ 'margin-top':'10px' } },
        h('span', { style:{ 'font-size':'12.5px', color:'var(--text-3)' } }, '通知する時刻'), hSel,
        h('button', { class:'btn btn-sm', type:'button', onClick:() => {
          const c = reminderCounts();
          toast(c.total ? reminderText(c) : 'いま知らせることはありません', { icon:'bell', ms:4000 });
        } }, 'いまの内容を確認')),
      h('div', { class:'hint' }, rc.total
        ? `いまの対象：${reminderText(rc)}`
        : 'いまは対象がありません（期限切れ・今日が期限・長期の待ちが無い状態）'),
      h('div', { class:'callout callout-warn', style:{ 'margin-top':'10px' } }, svg('alert'),
        h('div', {}, h('b', {}, '届く条件'),
          h('div', {}, 'ブラウザ（またはホーム画面に追加した FLOWDECK）が起動している間だけ届きます。閉じている時刻に鳴らすことはできないので、確実な定時通知の代わりにはなりません。')))));

    /* --- phase order --- */
    app(b, h('div', { class:'label' }, svg('arrowR','ico'), 'フェーズの並び順'));
    const ord = h('div', { class:'field' });
    const drawOrd = () => {
      clear(ord);
      phaseOrder().forEach((pid, i) => {
        ord.append(h('div', { class:'lab-row', style:{ '--pc':`var(--${pid})` } },
          h('span', { class:'col-dot', style:{ '--pc':`var(--${pid})` } }),
          h('span', { style:{ flex:'1', 'font-size':'13px' } }, `${PHASE[pid].label}　`,
            h('span', { style:{ color:'var(--text-4)', 'font-size':'11.5px' } }, PHASE[pid].jp)),
          h('div', { class:'lab-acts' },
            h('button', { class:'card-btn', type:'button', title:'左へ', disabled:i === 0, onClick:() => {
              const a = state.settings.phaseOrder.slice(); [a[i-1], a[i]] = [a[i], a[i-1]];
              state.settings.phaseOrder = a; state.settings.updatedAt = Date.now(); touch(); drawOrd();
            } }, svg('arrowL')),
            h('button', { class:'card-btn', type:'button', title:'右へ', disabled:i === 3, onClick:() => {
              const a = state.settings.phaseOrder.slice(); [a[i+1], a[i]] = [a[i], a[i+1]];
              state.settings.phaseOrder = a; state.settings.updatedAt = Date.now(); touch(); drawOrd();
            } }, svg('arrowR')))));
      });
    };
    drawOrd();
    app(b, ord);

    /* --- data --- */
    app(b, h('div', { class:'label' }, svg('archive','ico'), 'データ'));
    app(b, h('div', { class:'field row row-wrap' },
      h('button', { class:'btn', type:'button', onClick:doExport }, svg('down','ico ico-sm'), 'JSONで書き出し'),
      h('button', { class:'btn', type:'button', onClick:doImport }, svg('up','ico ico-sm'), '読み込み'),
      h('button', { class:'btn btn-danger', type:'button', onClick:async () => {
        if (await confirmDialog('すべて消去', 'この端末のタスク・ジャンル・設定をすべて削除します。同期が有効な場合、他の端末にも空の状態が反映されることがあります。',
          { danger:true, ok:'消去する' })) {
          state = blankState(); saveLocal(true); closeModal(); renderAll();
          toast('初期化しました', { icon:'refresh' });
        }
      } }, svg('trash','ico ico-sm'), 'すべて消去')));
    app(b, h('div', { class:'hint' }, `タスク ${Object.values(state.tasks).filter(t => !t.deleted && !t.done).length} 件（未完了） ／ 完了 ${archived().length} 件 ／ ジャンル ${labelsSorted().length} 件`));

    app(m, b);
    app(m, h('div', { class:'modal-foot' },
      h('button', { class:'btn btn-ghost', type:'button', onClick:openHelp }, svg('spark','ico ico-sm'), 'ショートカット'),
      h('span', { class:'grow', style:{ flex:'1' } }),
      h('button', { class:'btn btn-primary', type:'button', onClick:() => {
        cfg.token = tok.value.trim(); cfg.gistId = gid.value.trim(); saveCfg();
        closeModal(); if (cfg.token) sync({ loud:true }); else setSync('off');
      } }, '保存して閉じる')));
  }, { width:580, noFocus:true });
}

function doExport() {
  const blob = new Blob([JSON.stringify(exportState(), null, 2)], { type:'application/json' });
  const a = h('a', { href:URL.createObjectURL(blob), download:`flowdeck-${today()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('書き出しました', { icon:'down' });
}
function doImport() {
  const inp = h('input', { type:'file', accept:'.json,application/json', style:{ display:'none' } });
  document.body.append(inp);
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; inp.remove();
    if (!f) return;
    try {
      const data = normalize(JSON.parse(await f.text()));
      const n = Object.keys(data.tasks).length;
      if (await confirmDialog('読み込み', `${f.name} から ${n} 件を読み込みます。既存データとマージし、同じタスクは更新日時が新しい方を残します。`, { ok:'マージする' })) {
        state = mergeState(state, data); saveLocal(true); renderAll(); scheduleSync();
        toast(`${n} 件をマージしました`, { icon:'up' });
      }
    } catch (e) { toast('読み込みに失敗しました: ' + e.message, { type:'danger' }); }
  });
  inp.click();
}

/* ───────────────────────────────────────────────────────────────
   15. help
   ─────────────────────────────────────────────────────────────── */
function openHelp() {
  openModal(m => {
    app(m, modalHead('使い方とショートカット'));
    const b = h('div', { class:'modal-body' });
    const sec = (title, rows) => {
      const d = h('div', {}, h('div', { class:'kb-sec-t' }, title));
      rows.forEach(([k, t]) => d.append(h('div', { class:'kb-row' }, h('span', {}, t),
        ...String(k).split(' ').map(x => h('kbd', { class:'kb' }, x)))));
      return d;
    };
    app(b, h('div', { class:'kb-grid' },
      sec('基本', [
        ['click',  'カード左の丸 → 1クリックで完了'],
        ['click',  'カード本体 → 詳細を開く'],
        ['drag',   'ドラッグでフェーズ移動・並び替え'],
        ['click',  '列見出しの並べ替えボタン → ジャンル順に整列'],
        ['Ctrl K', 'コマンドパレット（何でもここから）'],
        ['N',      '選択中の列に新規追加'],
        ['/',      '検索'],
        ['T',      'テンプレート'],
        ['A',      '振り返り（アーカイブ）'],
        ['?',      'このヘルプ'],
        ['Esc',    '閉じる・選択解除']
      ]),
      sec('カード選択中', [
        ['J K',       '下・上のカードへ'],
        ['H L',       '左・右の列へ'],
        ['Enter',     '詳細を開く'],
        ['X',         '完了'],
        ['1 2 3 4',   'フェーズを変更'],
        ['D',         '期限を設定'],
        ['C',         'ジャンルを設定'],
        ['M',         '選択に加える（複数選択）'],
        ['Shift J',   '下へ移動'],
        ['Shift K',   '上へ移動'],
        ['Del',       '削除']
      ]),
      sec('複数選択（一括操作）', [
        ['Ctrl click',  '1件ずつ選択に加える'],
        ['Shift click', '範囲で選択'],
        ['Ctrl A',      '表示中を全選択'],
        ['X',           'まとめて完了'],
        ['1 2 3 4',     'まとめてフェーズ変更'],
        ['Del',         'まとめて削除'],
        ['Esc',         '選択を解除']
      ])));

    app(b, h('div', { style:{ 'margin-top':'18px' } },
      h('div', { class:'kb-sec-t' }, 'クイック追加（ジャンル・期限をボタンで選ぶ）'),
      h('div', { class:'callout' }, svg('tag'), h('div', {},
        h('div', {}, '入力欄の右にある ', h('b', {}, 'タグ'), ' と ', h('b', {}, '砂時計'),
                     ' のボタンから、これから追加するタスクのジャンルと期限を選べます。'),
        h('div', {}, '選んだ内容は入力欄の下にチップで出て、', h('b', {}, '続けて追加するときもそのまま効きます'),
                     '（チップを押すと外れます）。同じジャンルのタスクをまとめて入れるときに楽です。')))));

    app(b, h('div', { style:{ 'margin-top':'16px' } },
      h('div', { class:'kb-sec-t' }, 'クイック追加（打って指定する）'),
      h('div', { class:'callout' }, svg('spark'), h('div', {},
        h('div', {}, h('code', {}, '#社内調整'), ' ジャンルを指定（前方一致でOK）'),
        h('div', {}, h('code', {}, '!明日'), ' ', h('code', {}, '!9/30'), ' ', h('code', {}, '!金'), ' ',
                     h('code', {}, '!3日後'), ' ', h('code', {}, '!月末'), ' 期限'),
        h('div', {}, h('code', {}, '@山田'), ' 待ち先（Checking 列で活躍）'),
        h('div', {}, h('code', {}, '!!'), ' 重要マーク'),
        h('div', { style:{ 'margin-top':'6px', color:'var(--text-4)' } },
          '例）', h('code', {}, '見積の最終確認 #社内調整 !金 !!'))))));

    app(b, h('div', { style:{ 'margin-top':'16px' } },
      h('div', { class:'kb-sec-t' }, '手順・繰り返し・テンプレート'),
      h('div', { class:'callout' }, svg('checklist'), h('div', {},
        h('div', {}, h('b', {}, '手順'),
          '　詳細パネルでチェックリストを作れます。カードには ', h('code', {}, '2/5'), ' と進捗バーが出ます。'),
        h('div', {}, h('b', {}, '繰り返し'),
          '　毎日／平日／毎週／毎月を設定すると、完了した瞬間に次回分が1枚生まれます。次回日は「期限から」か「完了日から」を選べます。'),
        h('div', {}, h('b', {}, 'テンプレート'),
          '　複数選択して重ねアイコンを押すと保存。期限は「投入日からの日数」で覚えるので、いつ投入しても日付がずれません。'),
        h('div', {}, h('b', {}, '通知'),
          '　設定から有効にすると、1日1回だけ期限切れ・当日・長く待っている件数をまとめて知らせます（ブラウザが起動している間のみ）。')))));

    app(b, h('div', { style:{ 'margin-top':'16px' } },
      h('div', { class:'kb-sec-t' }, '4つのフェーズの使い分け'),
      h('div', { class:'callout' }, svg('note'), h('div', {},
        h('div', {}, h('b', {}, 'Now'), '　今日〜数日で自分が手を動かすもの。6件を超えると件数が警告色になります。'),
        h('div', {}, h('b', {}, 'Next'), '　Now が空いたら着手する順番待ち。'),
        h('div', {}, h('b', {}, 'Someday'), '　すぐやらないが忘れたくないもの。期限を入れて寝かせる。'),
        h('div', {}, h('b', {}, 'Checking'), '　相手にボールがある／自分の最終確認待ち。経過日数で放置を検知。')))));

    app(b, h('div', { style:{ 'margin-top':'16px' } },
      h('div', { class:'kb-sec-t' }, 'スマホ'),
      h('div', { class:'callout' }, svg('arrowR'), h('div', {},
        h('div', {}, 'カードを長押しすると持ち上がります。そのまま動かして並び替え、上のタブに落とすとフェーズ移動です。'),
        h('div', {}, '長押しする前に指を動かせば、ふつうのスクロールになります。')))));

    app(m, b);
    app(m, h('div', { class:'modal-foot' }, h('span', { class:'grow', style:{ flex:'1' } }),
      h('button', { class:'btn btn-primary', type:'button', onClick:closeModal }, '閉じる')));
  }, { width:660, noFocus:true });
}

/* ───────────────────────────────────────────────────────────────
   16. card menu / due popover
   ─────────────────────────────────────────────────────────────── */
function openCardMenu(anchor, id) {
  const t = state.tasks[id]; if (!t) return;
  openPop(anchor, p => {
    app(p, h('div', { class:'pop-title' }, 'フェーズを変更'));
    phaseOrder().forEach((pid, i) => app(p, popItem(null, `${PHASE[pid].label}　${PHASE[pid].jp}`,
      () => setPhase(id, pid), { on:t.phase === pid, kbd:String(i+1), check:true, swatch:`var(--${pid})` })));
    app(p, h('div', { class:'pop-sep' }));
    app(p, popItem('hourglass', t.due ? `期限：${fmtDate(t.due)}` : '期限を設定', () => openDuePop(anchor, id), { kbd:'D' }));
    app(p, popItem('tag', 'ジャンルを選ぶ', () => openLabelPop(anchor, id)));
    app(p, popItem('flame', t.p1 ? '重要マークを外す' : '重要にする', () => patch(id, { p1:!t.p1 })));
    app(p, h('div', { class:'pop-sep' }));
    app(p, popItem('up', '上へ移動', () => nudge(id, -1), { kbd:'⇧K' }));
    app(p, popItem('down', '下へ移動', () => nudge(id, 1), { kbd:'⇧J' }));
    app(p, popItem('copy', '複製', () => duplicate(id)));
    app(p, h('div', { class:'pop-sep' }));
    app(p, popItem('check', '完了にする', () => complete(id), { kbd:'X' }));
    app(p, popItem('trash', '削除', async () => {
      if (await confirmDialog('タスクを削除', 'このタスクを削除します。直後に「元に戻す」で復元できます。', { danger:true, ok:'削除する' })) removeTask(id);
    }, { danger:true }));
  }, { align:'right' });
}
function openDuePop(anchor, id) {
  const t = state.tasks[id]; if (!t) return;
  openPop(anchor, p => {
    app(p, h('div', { class:'pop-title' }, '期限'));
    [['今日', 0], ['明日', 1], ['明後日', 2], ['今週末', null], ['1週間後', 7], ['月末', null], ['来月', 30]]
      .forEach(([lbl, n]) => app(p, popItem('cal', lbl, () => {
        const v = n != null ? addDays(today(), n) : parseDateToken(lbl);
        patch(id, { due:v });
      })));
    app(p, h('div', { class:'pop-sep' }));
    const di = h('input', { class:'inp', type:'date', value:t.due || '' });
    di.addEventListener('change', () => { patch(id, { due:di.value || null }); closePop(); });
    app(p, h('div', { style:{ padding:'2px 4px 4px' } }, di));
    if (t.due) app(p, popItem('x', '期限をクリア', () => patch(id, { due:null })));
  }, { align:'right' });
  setTimeout(() => { const d = popEl.querySelector('input[type=date]'); d && d.focus(); }, 40);
}
function openLabelPop(anchor, id) {
  const t = state.tasks[id]; if (!t) return;
  openPop(anchor, p => {
    app(p, h('div', { class:'pop-title' }, 'ジャンル'));
    labelsSorted().forEach(l => app(p, popItem(null, l.name, () => patch(id, { labelId:t.labelId === l.id ? null : l.id }),
      { swatch:l.color, on:t.labelId === l.id, check:true })));
    app(p, h('div', { class:'pop-sep' }));
    app(p, popItem('x', 'ジャンルなし', () => patch(id, { labelId:null }), { on:!t.labelId }));
    app(p, popItem('gear', 'ジャンルを管理', openLabelManager));
  }, { align:'right' });
}
function openFilterPop(anchor) {
  openPop(anchor, p => {
    app(p, h('div', { class:'pop-title' }, 'ジャンルで絞り込む'));
    labelsSorted().forEach(l => app(p, popItem(null, `${l.name}（${labelUsage(l.id)}）`, () => {
      const i = ui.labelFilter.indexOf(l.id);
      i < 0 ? ui.labelFilter.push(l.id) : ui.labelFilter.splice(i, 1);
      saveUi(); renderAll(); openFilterPop(anchor);
    }, { swatch:l.color, on:ui.labelFilter.includes(l.id), check:true, keepOpen:true })));
    app(p, popItem(null, 'ジャンルなし', () => {
      const i = ui.labelFilter.indexOf('_none');
      i < 0 ? ui.labelFilter.push('_none') : ui.labelFilter.splice(i, 1);
      saveUi(); renderAll(); openFilterPop(anchor);
    }, { swatch:'var(--text-4)', on:ui.labelFilter.includes('_none'), check:true, keepOpen:true }));
    app(p, h('div', { class:'pop-sep' }));
    app(p, popItem('alert', '期限切れ・当日のみ', () => {
      ui.overdueOnly = !ui.overdueOnly; saveUi(); renderAll(); openFilterPop(anchor);
    }, { on:ui.overdueOnly, check:true, keepOpen:true }));
    if (ui.labelFilter.length || ui.overdueOnly || ui.q) {
      app(p, h('div', { class:'pop-sep' }));
      app(p, popItem('x', '絞り込みを解除', () => {
        ui.labelFilter = []; ui.overdueOnly = false; ui.q = ''; $('#q').value = ''; saveUi(); renderAll();
      }));
    }
    app(p, h('div', { class:'pop-sep' }));
    app(p, popItem('gear', 'ジャンルを管理', openLabelManager));
  }, { align:'right' });
}

/* ───────────────────────────────────────────────────────────────
   17. events
   ─────────────────────────────────────────────────────────────── */
let sel = null;   /* selected task id (keyboard) */

function setActivePhase(pid) {
  if (!PHASE[pid] || pid === ui.activePhase) return;   /* 変化がなければ描き直さない */
  ui.activePhase = pid; saveUi(); renderBoard();
  const c = cols[pid];
  if (c && window.matchMedia('(max-width:1080px)').matches) c.el.scrollIntoView({ block:'nearest', behavior:'smooth' });
}
function selectCard(id, scroll) {
  sel = id;
  $$('.card').forEach(c => c.classList.toggle('is-sel', c.dataset.id === id));
  if (scroll !== false && id) {
    const el = $(`.card[data-id="${id}"]`);
    if (el) { el.scrollIntoView({ block:'nearest' }); el.focus({ preventScroll:true }); }
  }
}

/* ── board clicks ──────────────────────────────────────────── */
board.addEventListener('click', e => {
  if (suppressClick) { suppressClick = false; return; }   /* ドラッグ直後のクリックは無視 */
  const qaL = e.target.closest('[data-qa-label]');
  if (qaL) return openQaLabelPop(qaL, qaL.dataset.qaLabel);
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) return sortByLabel(sortBtn.dataset.sort);
  const qaD = e.target.closest('[data-qa-due]');
  if (qaD) return openQaDuePop(qaD, qaD.dataset.qaDue);
  const actBtn = e.target.closest('[data-act]');
  const card = e.target.closest('.card');
  if (actBtn && card) {
    const id = card.dataset.id, act = actBtn.dataset.act;
    e.stopPropagation();
    if (act === 'done') {
      actBtn.classList.add('is-checked');
      card.classList.add('is-leaving');
      setTimeout(() => complete(id), 260);
      return;
    }
    if (act === 'menu') return openCardMenu(actBtn, id);
    if (act === 'due')  return openDuePop(actBtn, id);
    if (act === 'wait') { openDrawer(id); setTimeout(() => { const w = drawer.querySelector('input[type=text]'); w && w.focus(); }, 80); return; }
  }
  if (card) {
    const id = card.dataset.id;
    if (e.ctrlKey || e.metaKey) return toggleMulti(id);      /* 複数選択 */
    if (e.shiftKey)              return rangeMulti(id);       /* 範囲選択 */
    if (multi.size) { clearMultiSilent(); renderBulk(); }
    selectCard(id, false);
    setActivePhase(card.closest('.column').dataset.phase);
    openDrawer(id);
  }
});

/* quick add — IME変換確定の Enter を拾わないよう isComposing を見る */
board.addEventListener('keydown', e => {
  const inp = e.target.closest('input[data-qa]');
  if (!inp) return;
  if (e.key === 'Enter' && !isComposing(e)) {
    e.preventDefault();
    const v = inp.value.trim(); if (!v) return inp.blur();
    const d = qaDraft[inp.dataset.qa] || {};
    const t = addTask(inp.dataset.qa, v, { labelId:d.labelId, due:d.due });
    inp.value = '';
    if (t) { toast('追加しました', { icon:'plus', ms:1400 }); selectCard(t.id, false); }
  } else if (e.key === 'Escape') { inp.value = ''; inp.blur(); }
});
board.addEventListener('focusin', e => {
  const inp = e.target.closest('input[data-qa]');
  if (inp) setActivePhase(inp.dataset.qa);
});

/* tabs */
tabsEl.addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (b) setActivePhase(b.dataset.tab);
});

/* statusbar */
$('.statusbar').addEventListener('click', e => {
  const j = e.target.closest('[data-jump]');
  if (j) return setActivePhase(j.dataset.jump);
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'archive') openArchive();
  if (a.dataset.act === 'overdue') { ui.overdueOnly = !ui.overdueOnly; saveUi(); renderAll(); }
});

/* topbar */
$('#btnFilter').addEventListener('click', e => openFilterPop(e.currentTarget));
$('#btnArchive').addEventListener('click', openArchive);
$('#btnSettings').addEventListener('click', openSettings);
$('#btnHelp').addEventListener('click', openHelp);
$('#btnSync').addEventListener('click', () => { cfg.token ? sync({ loud:true }) : openSettings(); });
$('#btnSearch').addEventListener('click', () => {
  const on = document.body.classList.toggle('searching');
  if (on) setTimeout(() => { $('#q').focus(); $('#q').select(); }, 30);
  else { $('#q').value = ''; ui.q = ''; renderBoard(); renderChrome(); }
});

const qEl = $('#q');
let qTimer = null;
qEl.addEventListener('input', () => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { ui.q = qEl.value; renderBoard(); renderChrome(); }, 130);
});
qEl.addEventListener('keydown', e => {
  if (e.key === 'Escape') { qEl.value = ''; ui.q = ''; renderBoard(); renderChrome(); qEl.blur(); document.body.classList.remove('searching'); }
  if (e.key === 'Enter' && !isComposing(e)) {
    const first = $('.column.is-active .card') || $('.card');
    if (first) { selectCard(first.dataset.id); qEl.blur(); }
  }
});
$('#qClear').addEventListener('click', () => { qEl.value = ''; ui.q = ''; renderBoard(); renderChrome(); qEl.focus(); });

$('#btnTpl').addEventListener('click', openTemplates);

/* ── command palette の入力 ────────────────────────────────── */
const palInp = $('#palInput');
let palTimer = null;
palInp.addEventListener('input', () => {
  clearTimeout(palTimer);
  palTimer = setTimeout(() => drawPalette(palInp.value.trim()), 80);
});
palInp.addEventListener('keydown', e => {
  if (e.key === 'Escape')    { e.preventDefault(); closePalette(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1);  return; }
  if (e.key === 'ArrowUp')   { e.preventDefault(); movePalette(-1); return; }
  if (e.key === 'Tab')       { e.preventDefault(); movePalette(e.shiftKey ? -1 : 1); return; }
  if (e.key === 'Enter' && !isComposing(e)) {
    e.preventDefault();
    runPalette(null, e.ctrlKey || e.metaKey);   /* Ctrl+Enter で完了 */
  }
});
palEl.addEventListener('pointerdown', e => { if (e.target === palEl) closePalette(); });

scrim.addEventListener('click', () => { closePop(); if (modalOpen) closeModal(); else if (archOpen) closeArchive(); else if (openId) closeDrawer(); });

/* オーバーレイの外側を押したら閉じる（✕ を探さなくていいように）
   モーダルは openModal 側でも見ているが、シートはここで受ける */
archHost.addEventListener('pointerdown', e => { if (e.target === archHost) closeArchive(); });
modalHost.addEventListener('pointerdown', e => { if (e.target === modalHost) closeModal(); });

/* 詳細パネルは「外のどこか」を押せば閉じる。
   除外するのは、閉じてしまうと操作が成立しないものだけ:
   パネル自身・メニュー・カード（別タスクを開く）・トースト（元に戻す）・一括操作バー。
   トップバーや列の余白を押した場合も閉じる。 */
document.addEventListener('pointerdown', e => {
  if (!openId || modalOpen || archOpen || palOpen) return;
  const t = e.target;
  if (drawer.contains(t) || popEl.contains(t)) return;
  if (t.closest('.card') || t.closest('.toast') || t.closest('.bulkbar')) return;
  closeDrawer();
}, true);

/* ═══════════════════════════════════════════════════════════════
   ドラッグ＆ドロップ（マウスもタッチも同じ実装）
   ・マウス … 4px 動いた時点で開始（掴んだ感じをすぐ返す）
   ・タッチ … 220ms 長押しで開始。それより前に動いたらスクロールに譲る
   ・列の上下端に近づくと自動スクロール
   ・タブ（スマホの1列表示）に落とすとフェーズ移動
   ネイティブの HTML5 DnD は使わない（ゴーストの見た目が制御できず、
   ブラウザ差も大きいため）。
   ═══════════════════════════════════════════════════════════════ */
let drag = null;          /* 進行中のドラッグ */
let dropLine = null;      /* 挿入位置のインジケータ */
let suppressClick = false; /* ドラッグ直後の click でカードが開かないように */

function dndCleanup() {
  if (drag) {
    clearTimeout(drag.timer);
    if (drag.ghost) drag.ghost.remove();
    if (drag.card) drag.card.classList.remove('is-lifted');
    if (drag.raf) cancelAnimationFrame(drag.raf);
  }
  $$('.card.is-lifted').forEach(c => c.classList.remove('is-lifted'));
  $$('.column.is-drop').forEach(c => c.classList.remove('is-drop'));
  $$('.ptab.is-droptarget').forEach(e => e.classList.remove('is-droptarget'));
  if (dropLine) { dropLine.remove(); dropLine = null; }
  document.body.classList.remove('dragging');
  drag = null;
}

/** 掴んだ状態にする */
function dragStart(card, x, y, pointerId) {
  const r = card.getBoundingClientRect();
  drag.active = true;
  drag.ox = x - r.left;
  drag.oy = y - r.top;
  const g = card.cloneNode(true);
  g.classList.add('drag-ghost');
  g.style.width = r.width + 'px';
  g.style.left  = r.left + 'px';
  g.style.top   = r.top + 'px';
  document.body.append(g);
  drag.ghost = g;
  card.classList.add('is-lifted');
  document.body.classList.add('dragging');
  if (drag.touch && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
  try { card.setPointerCapture(pointerId); } catch (e) {}
}

/** 列の端に近いとき、ゆっくり自動スクロール */
function dragAutoScroll() {
  if (!drag || !drag.active) return;
  const bodyEl = drag.overBody;
  if (bodyEl) {
    const r = bodyEl.getBoundingClientRect();
    const edge = 48;
    if (drag.y < r.top + edge)         bodyEl.scrollTop -= Math.max(2, (r.top + edge - drag.y) / 5);
    else if (drag.y > r.bottom - edge) bodyEl.scrollTop += Math.max(2, (drag.y - (r.bottom - edge)) / 5);
  }
  drag.raf = requestAnimationFrame(dragAutoScroll);
}

board.addEventListener('pointerdown', e => {
  if (e.button != null && e.button !== 0) return;         /* 右クリックは無視 */
  const card = e.target.closest('.card');
  if (!card) return;
  if (e.target.closest('button, input, textarea, select, a')) return;
  dndCleanup();
  drag = {
    id: card.dataset.id, card, x0:e.clientX, y0:e.clientY,
    x:e.clientX, y:e.clientY, active:false,
    touch: e.pointerType !== 'mouse'
  };
  if (drag.touch) {
    /* 指のときは長押しを待つ。待つ間に動いたらスクロール */
    drag.timer = setTimeout(() => { if (drag) dragStart(card, drag.x, drag.y, e.pointerId); }, 220);
  }
});

board.addEventListener('pointermove', e => {
  if (!drag) return;
  drag.x = e.clientX; drag.y = e.clientY;

  if (!drag.active) {
    const moved = Math.abs(e.clientX - drag.x0) > (drag.touch ? 8 : 4) ||
                  Math.abs(e.clientY - drag.y0) > (drag.touch ? 8 : 4);
    if (!moved) return;
    if (drag.touch) return dndCleanup();                  /* 長押し前に動いた＝スクロール */
    dragStart(drag.card, e.clientX, e.clientY, e.pointerId);
    drag.raf = requestAnimationFrame(dragAutoScroll);
  }
  e.preventDefault();

  drag.ghost.style.left = (e.clientX - drag.ox) + 'px';
  drag.ghost.style.top  = (e.clientY - drag.oy) + 'px';

  const el = document.elementFromPoint(e.clientX, e.clientY);
  $$('.ptab.is-droptarget').forEach(x => x.classList.remove('is-droptarget'));

  /* スマホのタブへのドロップ＝フェーズ移動 */
  const tab = el && el.closest('.ptab');
  if (tab) {
    tab.classList.add('is-droptarget');
    $$('.column.is-drop').forEach(c => c.classList.remove('is-drop'));
    if (dropLine) { dropLine.remove(); dropLine = null; }
    drag.dropTab = tab.dataset.tab; drag.dropPhase = null; drag.overBody = null;
    return;
  }
  drag.dropTab = null;

  const col = el && el.closest('.column');
  $$('.column.is-drop').forEach(c => { if (c !== col) c.classList.remove('is-drop'); });
  if (!col) { drag.overBody = null; return; }
  col.classList.add('is-drop');

  const bodyEl = col.querySelector('.col-body');
  drag.overBody = bodyEl;
  const cards = $$('.card', bodyEl).filter(c => c.dataset.id !== drag.id);
  let before = null;
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) { before = c; break; }
  }
  if (!dropLine) dropLine = h('div', { class:'drop-line' });
  before ? bodyEl.insertBefore(dropLine, before) : bodyEl.append(dropLine);
  drag.dropPhase = col.dataset.phase;
  drag.dropBefore = before ? before.dataset.id : null;
});

board.addEventListener('pointerup', () => {
  if (!drag) return;
  if (!drag.active) return dndCleanup();
  const id = drag.id, tab = drag.dropTab, ph = drag.dropPhase, before = drag.dropBefore;
  dndCleanup();
  suppressClick = true;                       /* この後の click でカードを開かない */
  setTimeout(() => { suppressClick = false; }, 320);
  if (tab) {
    setPhase(id, tab); setActivePhase(tab);
    toast(`${PHASE[tab].label} へ移動`, { icon:'arrowR', ms:1500 });
    return;
  }
  if (ph) {
    moveBefore(id, ph, before);
    selectCard(id, false);
    if (openId === id) openDrawer(id);
  }
});
board.addEventListener('pointercancel', dndCleanup);
window.addEventListener('blur', dndCleanup);


/* ── keyboard ──────────────────────────────────────────────── */
const isTyping = el => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

document.addEventListener('keydown', e => {
  if (isComposing(e)) return;               /* IME変換中は一切割り込まない */
  /* Esc は入力中でも効かせる */
  if (e.key === 'Escape') {
    if (palOpen) return closePalette();
    if (!popEl.hidden) return closePop();
    if (modalOpen) return closeModal();
    if (archOpen) return closeArchive();
    if (isTyping(document.activeElement)) { document.activeElement.blur(); document.body.classList.remove('searching'); return; }
    if (openId) return closeDrawer();
    if (multi.size) return clearMulti();
    if (sel) return selectCard(null);
    if (ui.q || ui.labelFilter.length || ui.overdueOnly) { ui.q = ''; qEl.value = ''; ui.labelFilter = []; ui.overdueOnly = false; saveUi(); renderAll(); }
    return;
  }
  if (isTyping(document.activeElement) || modalOpen || archOpen) return;
  /* Ctrl/⌘ 系はここで拾う（下で弾かれる前に） */
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const ck = e.key.toLowerCase();
    if (ck === 'k') { e.preventDefault(); openPalette(); return; }
    if (ck === 'a') { e.preventDefault(); selectAllVisible(); return; }
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const k = e.key;
  const order = phaseOrder();

  /* global */
  if (k === '/') { e.preventDefault(); document.body.classList.add('searching'); qEl.focus(); qEl.select(); return; }
  if (k === 'n' || k === 'N') { e.preventDefault(); const c = cols[ui.activePhase]; c && c.input.focus(); return; }
  if (k === 'a' || k === 'A') { e.preventDefault(); openArchive(); return; }
  if (k === 'm' || k === 'M') { e.preventDefault(); if (sel) toggleMulti(sel); return; }
  if (k === 't' || k === 'T') { e.preventDefault(); openTemplates(); return; }
  if (k === '?') { e.preventDefault(); openHelp(); return; }
  if ((k === 's' || k === 'S') && e.shiftKey) { e.preventDefault(); sync({ loud:true }); return; }

  /* selection movement */
  const list = visibleOf(ui.activePhase);
  const idx = sel ? list.findIndex(t => t.id === sel) : -1;

  if (k === 'j' || k === 'J' || k === 'ArrowDown') {
    e.preventDefault();
    if (e.shiftKey && sel) { nudge(sel, 1); selectCard(sel); return; }
    if (!list.length) return;
    selectCard(list[Math.min(list.length - 1, idx + 1)].id); return;
  }
  if (k === 'k' || k === 'K' || k === 'ArrowUp') {
    e.preventDefault();
    if (e.shiftKey && sel) { nudge(sel, -1); selectCard(sel); return; }
    if (!list.length) return;
    selectCard(list[idx <= 0 ? 0 : idx - 1].id); return;
  }
  if (k === 'h' || k === 'H' || k === 'ArrowLeft' || k === 'l' || k === 'L' || k === 'ArrowRight') {
    e.preventDefault();
    const dir = (k === 'h' || k === 'H' || k === 'ArrowLeft') ? -1 : 1;
    const i = order.indexOf(ui.activePhase);
    const nx = order[Math.max(0, Math.min(order.length - 1, i + dir))];
    setActivePhase(nx);
    const nl = visibleOf(nx);
    selectCard(nl.length ? nl[Math.min(nl.length - 1, Math.max(0, idx))].id : null);
    return;
  }

  /* 複数選択中は、そちらをまとめて処理する */
  if (multi.size) {
    if (k === 'x' || k === 'X') { e.preventDefault(); bulkComplete(); return; }
    if (k >= '1' && k <= '4') { e.preventDefault(); const bp = order[+k - 1]; if (bp) bulkPhase(bp); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); bulkRemove(); return; }
  }
  if (!sel || !state.tasks[sel]) return;

  if (k === 'Enter' || k === 'e' || k === 'E') { e.preventDefault(); openDrawer(sel); return; }
  if (k === 'x' || k === 'X' || k === ' ') {
    e.preventDefault();
    const card = $(`.card[data-id="${sel}"]`);
    const nextSel = list[idx + 1] ? list[idx + 1].id : (list[idx - 1] ? list[idx - 1].id : null);
    if (card) { card.querySelector('.check').classList.add('is-checked'); card.classList.add('is-leaving'); }
    const id = sel; sel = nextSel;
    setTimeout(() => { complete(id); selectCard(nextSel, false); }, 260);
    return;
  }
  if (k >= '1' && k <= '4') { e.preventDefault(); const pid = order[+k - 1]; if (pid) { setPhase(sel, pid); setActivePhase(pid); selectCard(sel); } return; }
  if (k === 'd' || k === 'D') { e.preventDefault(); const c = $(`.card[data-id="${sel}"]`); c && openDuePop(c.querySelector('[data-act=menu]') || c, sel); return; }
  if (k === 'c' || k === 'C') { e.preventDefault(); const c = $(`.card[data-id="${sel}"]`); c && openLabelPop(c.querySelector('[data-act=menu]') || c, sel); return; }
  if (k === 'Delete' || k === 'Backspace') {
    e.preventDefault();
    const id = sel;
    confirmDialog('タスクを削除', 'このタスクを削除します。直後に「元に戻す」で復元できます。', { danger:true, ok:'削除する' })
      .then(ok => ok && removeTask(id));
    return;
  }
});

/* ── lifecycle ─────────────────────────────────────────────── */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { renderStatus(); checkReminders(); if (cfg.auto) sync({}); }
});
window.addEventListener('online',  () => { setSync(dirty ? 'dirty' : (cfg.token ? 'ok' : 'off')); if (cfg.auto) sync({}); });
window.addEventListener('offline', () => setSync('error', 'オフライン'));
setInterval(() => { if (document.visibilityState === 'visible' && cfg.auto && !syncing) sync({}); }, 90000);
setInterval(() => { if (document.visibilityState === 'visible') checkReminders(); }, 1800000);
/* 日付が変わったら相対表示を更新 */
let lastDay = today();
setInterval(() => { if (today() !== lastDay) { lastDay = today(); renderAll(); } }, 60000);
let rzTimer = null;
window.addEventListener('resize', () => { clearTimeout(rzTimer); rzTimer = setTimeout(renderBoard, 180); });
/* 書き込み待ちがあるときだけ flush。無条件に保存すると、別タブが進めた状態を
   古いスナップショットで上書きしてしまう。 */
window.addEventListener('pagehide', () => { if (savePending) saveLocal(true); });

/* 同じブラウザの別タブでの変更を取り込む（タスク単位の更新日時でマージ） */
window.addEventListener('storage', e => {
  if (e.key !== LS_STATE || !e.newValue) return;
  try {
    const incoming = normalize(JSON.parse(e.newValue));
    const before = digest(state);
    state = mergeState(state, incoming);
    if (digest(state) !== before) { renderAll(); if (openId) openDrawer(openId); }
    /* こちらの方が新しい部分があれば書き戻して、他タブにも伝える */
    if (digest(state) !== digest(incoming)) saveLocal();
  } catch (err) { console.warn('cross-tab merge failed', err); }
});

/* ── service worker（オフライン起動） ───────────────────────── */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            toast('新しいバージョンがあります', { type:'info', icon:'refresh', ms:20000,
              action:{ label:'再読込', fn:() => location.reload() } });
          }
        });
      });
    }).catch(() => {});
  });
}

/* ───────────────────────────────────────────────────────────────
   18. boot
   ─────────────────────────────────────────────────────────────── */
loadLocal();
if (ui.q) { qEl.value = ui.q; }
buildBoard();
renderAll();
setSync(cfg.token ? 'dirty' : 'off');
if (cfg.token) sync({});
checkReminders();

/* 初回起動のヒント */
if (!Object.keys(state.tasks).length && !localStorage.getItem('flowdeck.seen')) {
  localStorage.setItem('flowdeck.seen', '1');
  setTimeout(() => toast('カード左の丸をクリックで完了。? でショートカット一覧', { type:'info', icon:'spark', ms:7000 }), 700);
}

/* デバッグ用 */
window.FLOWDECK = { get state() { return state; }, sync, exportState, toast,
                    normalize, mergeState, digest, nextRepeatDate, repeatLabel };

})();
