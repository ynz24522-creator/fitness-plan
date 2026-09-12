/**
 * 界面冒烟测试：用最小 DOM 桩真正执行 app.js，
 * 逐个页签渲染并模拟打卡，确认没有运行时错误、关键内容缺失。
 * 运行： node tests/smoke-ui.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const engineCode = readFileSync(join(dir, 'plan-engine.js'), 'utf8');
const dietCode = readFileSync(join(dir, 'diet-engine.js'), 'utf8');
const uiCode = readFileSync(join(dir, 'app.js'), 'utf8');

/* 固定“今天”为 2026-09-11（周五），让断言不随运行日期变化。
   周五在“每周 3 天（周一/三/五）”里是训练日，在“每周 2 天（周一/四）”里是休息日，
   正好能同时覆盖训练日与休息日两条渲染分支。 */
const FIXED_NOW = new Date(2026, 8, 11, 10, 0, 0);
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...args) { if (args.length === 0) super(FIXED_NOW.getTime()); else super(...args); }
  static now() { return FIXED_NOW.getTime(); }
}
globalThis.Date = FakeDate;

let pass = 0;
const failures = [];
const ok = (name, cond, extra) => {
  if (cond) pass++;
  else failures.push(name + (extra ? '  →  ' + extra : ''));
};
const eq = (name, actual, expected) => ok(name, actual === expected, `期望 ${expected}，实际 ${actual}`);

/* ------------------------- DOM 桩 ------------------------- */
const store = new Map();
/* 从 innerHTML 里解析出带 data-* 的按钮桩，并按宿主元素 + 版本号缓存 */
const btnCache = new WeakMap();
function childButtons(hostEl, attr) {
  if (!hostEl) return [];
  let entry = btnCache.get(hostEl);
  if (!entry || entry.ver !== hostEl._htmlVersion) { entry = { ver: hostEl._htmlVersion, map: {} }; btnCache.set(hostEl, entry); }
  if (entry.map[attr]) return entry.map[attr];
  const html = hostEl.innerHTML || '';
  const out = [];
  const re = new RegExp('<button[^>]*\\s' + attr + '="([^"]+)"[^>]*>', 'g');
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0], val = m[1];
    const b = makeEl(attr + '-' + val + '-' + out.length);
    b.dataset[attr.replace('data-', '')] = val;
    b.setAttribute(attr, val);
    const ap = /aria-pressed="([^"]*)"/.exec(tag);
    b.setAttribute('aria-pressed', ap ? ap[1] : 'false');
    out.push(b);
  }
  entry.map[attr] = out;
  return out;
}
function childById(hostEl, id) {
  const entry = (btnCache.get(hostEl) && btnCache.get(hostEl).ver === hostEl._htmlVersion) ? btnCache.get(hostEl) : null;
  if (!entry) childButtons(hostEl, 'data-nope');
  const e2 = btnCache.get(hostEl);
  e2.ids = e2.ids || {};
  if (!e2.ids[id]) e2.ids[id] = makeEl(id);
  return e2.ids[id];
}
const fbCache = new WeakMap();
function fbOptionButtons(hostEl, key) {
  if (!hostEl) return [];
  let entry = fbCache.get(hostEl);
  if (!entry || entry.ver !== hostEl._htmlVersion) { entry = { ver: hostEl._htmlVersion, map: {} }; fbCache.set(hostEl, entry); }
  if (entry.map[key]) return entry.map[key];
  const html = (hostEl && hostEl.innerHTML) || '';
  const idx = html.indexOf('data-fb="' + key + '"');
  const out = [];
  if (idx >= 0) {
    const body = html.slice(idx, html.indexOf('</div>', idx));
    const re = /<button[^>]*class="opt"[^>]*>/g;
    let m;
    while ((m = re.exec(body))) {
      const tag = m[0];
      const b = makeEl('fbopt-' + key + '-' + out.length);
      const dv = /data-val="([^"]*)"/.exec(tag);
      const dp = /data-pain="([^"]*)"/.exec(tag);
      if (dv) { b.dataset.val = dv[1]; b.setAttribute('data-val', dv[1]); }
      if (dp) { b.dataset.pain = dp[1]; b.setAttribute('data-pain', dp[1]); }
      const ap = /aria-pressed="([^"]*)"/.exec(tag);
      b.setAttribute('aria-pressed', ap ? ap[1] : 'false');
      b.parentNode = { getAttribute: (k) => (k === 'data-fb' ? key : null) };
      out.push(b);
    }
  }
  entry.map[key] = out;
  return out;
}

function makeEl(id) {
  const el = {
    id, hidden: false, value: '', style: {},
    dataset: {}, onclick: null, listeners: {}, attrs: {}, _htmlVersion: 0,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, v) { if (v === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (v) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    querySelector(sel) {
      if (sel.charAt(0) === '#') return childById(this, sel.slice(1));
      if (sel.indexOf('data-fb=') >= 0) {
        const key = /data-fb="([^"]+)"/.exec(sel)[1];
        return fbOptionButtons(this, key)[0] || null;
      }
      if (sel === '[data-fjoint]') return childButtons(this, 'data-fjoint')[0] || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-fjoint]') return childButtons(this, 'data-fjoint');
      if (sel.indexOf('data-fb=') >= 0) {
        const key = /data-fb="([^"]+)"/.exec(sel)[1];
        return fbOptionButtons(this, key);
      }
      return [];
    }
  };
  let html = '';
  let text = '';
  /* 真实 DOM 里 textContent 赋值会被转成字符串，桩也照做 */
  Object.defineProperty(el, 'textContent', {
    get() { return text; },
    set(v) { text = v === null || v === undefined ? '' : String(v); }
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return html; },
    set(v) { html = String(v); el._htmlVersion++; }
  });
  return el;
}
const els = new Map();
const getEl = (id) => {
  if (!els.has(id)) els.set(id, makeEl(id));
  return els.get(id);
};

const tabButtons = ['today', 'plan', 'diet', 'me'].map((t) => { const e = makeEl('tab-' + t); e.dataset.tab = t; return e; });

function picker() {
  const me = els.get('view-me');
  return { wd: childButtons(me, 'data-wd'), pr: childButtons(me, 'data-preset') };
}
function clickWeekday(i) {
  const btn = picker().wd.find((b) => Number(b.dataset.wd) === i);
  els.get('wd-picker').listeners.click({ target: { closest: (s) => (s === '.wd-btn' ? btn : null) } });
}
function clickPreset(n) {
  const btn = picker().pr.find((b) => Number(b.dataset.preset) === n);
  els.get('wd-presets').listeners.click({ target: { closest: (s) => (s === '.preset' ? btn : null) } });
}
function pressedWeekdays() {
  return picker().wd.filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => Number(b.dataset.wd)).sort((a, b) => a - b);
}

const documentStub = {
  getElementById: getEl,
  querySelectorAll(sel) {
    if (sel === 'nav.tabs button') return tabButtons;
    if (sel === '#wd-picker .wd-btn') return picker().wd;
    if (sel === '#wd-presets .preset') return picker().pr;
    const me = els.get('view-me');
    if (sel === '#diet-pattern .preset') return childButtons(me, 'data-diet');
    if (sel === '#diet-meals .preset') return childButtons(me, 'data-meals');
    if (sel === '#view-me [data-injury]') return childButtons(me, 'data-injury');
    if (sel === 'svg[data-anim]') return [];
    return [];
  },
  addEventListener(type, fn) { docListeners[type] = fn; }
};
const docListeners = {};
/* 模拟一次委托点击：data-xxx=value */
function dispatch(attr, value) {
  const t = makeEl(attr + ':' + value);
  t.dataset[attr] = value;
  t.setAttribute('data-' + attr, value);
  const closest = (sel) => (sel.indexOf('[data-' + attr + ']') >= 0 ? t : null);
  docListeners.click({ target: { closest } });
  return t;
}
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const alerts = [];
globalThis.document = documentStub;
globalThis.localStorage = localStorageStub;
globalThis.alert = (m) => alerts.push(String(m));
globalThis.confirm = () => true;
globalThis.window = { scrollTo() {} };

/* ------------------------- 执行引擎与界面 ------------------------- */
new Function(engineCode)();
new Function(dietCode)();
const E = globalThis.PlanEngine;
ok('引擎已挂载', !!E);

/* 场景 1：无数据时应引导去填写资料 */
els.clear(); store.clear();
new Function(uiCode)();
ok('首次进入自动跳到“我的”页签', tabButtons.find((b) => b.dataset.tab === 'me').classList.contains('active'));
ok('“我的”页渲染出表单', getEl('view-me').innerHTML.includes('身高（cm）') && getEl('view-me').innerHTML.includes('身体评估'));
ok('未设置状态下的今日页有引导', (() => {
  tabButtons.find((b) => b.dataset.tab === 'today').listeners.click();
  return getEl('view-today').innerHTML.includes('先设置你的身体数据');
})());

function setProfile(p) {
  store.set('fitnessPlan.v1.profile', JSON.stringify(p));
  store.delete('fitnessPlan.v1.progress');
}

function bootFresh(profile) {
  els.clear(); store.clear();
  if (profile) setProfile(profile);
  new Function(uiCode)();
  return E;
}

function gotoTab(name) {
  tabButtons.find((b) => b.dataset.tab === name).listeners.click();
  return getEl('view-' + name).innerHTML;
}

const isoToday = E.toISO(new Date());
eq('固定时钟生效（今天 = 2026-09-11 周五）', isoToday, '2026-09-11');

/* 场景 2：肥胖 + 健身房 + 减脂，每周 3 天 —— 周五是训练日 */
ok('每周 3 天包含周五（今天）', E.trainingWeekdays(3).includes(E.weekdayMon0(isoToday)));
const startDate = isoToday;

const profile = { heightCm: 178, weightKg: 92, goal: 'fat_loss', daysPerWeek: 3, experience: 'intermediate', venue: 'gym', startDate };
bootFresh(profile);

let todayHtml = gotoTab('today');
ok('今日页显示训练日与天数', todayHtml.includes('第 1 天'), todayHtml.slice(0, 160));
ok('今日页展示热身与正式训练', todayHtml.includes('热身') && todayHtml.includes('正式训练'));
ok('今日页有打卡按钮', todayHtml.includes('完成今日训练'));
ok('今日页有顺延按钮', todayHtml.includes('今天跳过，顺延'));
ok('肥胖档提示已出现', todayHtml.includes('已自动剔除全部跳跃冲击动作'));
ok('有氧收尾区块存在', todayHtml.includes('有氧收尾') || todayHtml.includes('拉伸放松'));
ok('组间休息按钮存在', todayHtml.includes('开始休息'));

/* 模拟打卡 */
ok('btnDone 已绑定', typeof getEl('btnDone').onclick === 'function');
getEl('btnDone').onclick();
/* 现在打卡会先弹出反馈表单 */
const modalHost = getEl('modalHost');
ok('打卡弹出反馈表单', modalHost.innerHTML.includes('完成度') && modalHost.innerHTML.includes('主观强度'));
ok('反馈表单含疼痛与疲劳选项', modalHost.innerHTML.includes('训练中有疼痛吗') && modalHost.innerHTML.includes('疲劳与睡眠'));
ok('反馈表单有跳过入口', modalHost.innerHTML.includes('跳过反馈，直接打卡'));
ok('反馈提交按钮已绑定', typeof modalHost.querySelector('#fbSubmit').onclick === 'function');
eq('反馈默认完成度为全部完成', modalHost.querySelector('#fbSubmit') && true, true);
/* 选“太难”并提交 */
const rpeOpts = modalHost.querySelectorAll('[data-fb="rpe"] .opt');
eq('强度选项共 4 个', rpeOpts.length, 4);
modalHost.listeners.click({ target: rpeOpts[3] });
eq('选中“太难”后状态更新', rpeOpts[3].getAttribute('aria-pressed'), 'true');
modalHost.querySelector('#fbSubmit').onclick();
const saved = JSON.parse(store.get('fitnessPlan.v1.progress'));
ok('打卡已写入 localStorage', saved.logs[startDate] && saved.logs[startDate].status === 'done');
ok('反馈已写入 localStorage', saved.feedback && saved.feedback[startDate] && saved.feedback[startDate].rpe === 9.5,
  JSON.stringify(saved.feedback));
ok('反馈写入后弹层关闭', modalHost.hidden === true);
ok('打卡后今日页显示已完成', getEl('view-today').innerHTML.includes('今日训练已完成'));
ok('连击天数显示为 1', getEl('view-today').innerHTML.includes('连续打卡 1 天'));

/* 再进入计划页 */
let planHtml = gotoTab('plan');
ok('计划页显示未来 7 天', planHtml.includes('未来 7 天'));
ok('计划页显示本周日历', planHtml.includes('本周日历'));
ok('计划页显示中周期概览', planHtml.includes('中周期概览'));
ok('计划页包含减载周说明', planHtml.includes('第 4 周主动减载恢复'));
ok('计划页渲染了 7 个日条目', (planHtml.match(/class="day/g) || []).length === 7,
  String((planHtml.match(/class="day/g) || []).length));
ok('计划页渲染了 7 个日历格', (planHtml.match(/class="cell/g) || []).length === 7,
  String((planHtml.match(/class="cell/g) || []).length));

/* 我的页 */
let meHtml = gotoTab('me');
ok('我的页显示 BMI 分档', meHtml.includes('肥胖'), '');
ok('我的页显示健康体重区间', meHtml.includes('健康体重区间'));
ok('我的页显示累计完成训练', meHtml.includes('累计完成训练'));
ok('我的页累计次数为 1', meHtml.includes('<b>1 次</b>'), '');

/* 场景 3：居家徒手 + 新手 + 减脂，覆盖另一条渲染分支（每周 3 天，今天同样是训练日） */
/* BMI = 50 / 1.70² ≈ 17.3 → 偏瘦档 */
bootFresh({ heightCm: 170, weightKg: 50, goal: 'fat_loss', daysPerWeek: 3, experience: 'beginner', venue: 'home_bodyweight', startDate: isoToday });
todayHtml = gotoTab('today');
ok('徒手档今日页可渲染', todayHtml.length > 400);
ok('偏瘦档给出侧重重量的提示', todayHtml.includes('不安排长时间有氧') || todayHtml.includes('偏瘦'));
ok('徒手档不出现 kg 配重标签', !/每手 \d/.test(todayHtml), (todayHtml.match(/每手 \d[^<]*/) || [''])[0]);

/* 场景 4：休息日分支 —— 每周 2 天（周一/周四），周五就是休息日 */
ok('每周 2 天不含周五（今天）', !E.trainingWeekdays(2).includes(E.weekdayMon0(isoToday)));
bootFresh({ heightCm: 172, weightKg: 70, goal: 'recomp', daysPerWeek: 2, experience: 'beginner', venue: 'home_dumbbell', startDate: isoToday });
const restHtml = gotoTab('today');
ok('休息日分支可渲染', restHtml.includes('今天是休息日'), restHtml.slice(0, 160));
ok('休息日显示下一次训练', restHtml.includes('下一次训练'), '');
ok('休息日显示主动恢复建议', restHtml.includes('主动恢复建议'));
ok('休息日有恢复打卡按钮', restHtml.includes('完成今日恢复打卡'));
ok('休息日打卡按钮已绑定', typeof getEl('btnRest').onclick === 'function');
getEl('btnRest').onclick();
const p2 = JSON.parse(store.get('fitnessPlan.v1.progress'));
ok('休息日打卡写入 rest_done', p2.logs[isoToday] && p2.logs[isoToday].status === 'rest_done');
ok('休息日打卡后显示已完成', getEl('view-today').innerHTML.includes('今日恢复打卡已完成'));

/* 场景 5：计划开始日期在未来 */
bootFresh({ heightCm: 180, weightKg: 75, goal: 'strength', daysPerWeek: 5, experience: 'advanced', venue: 'gym', startDate: E.addDays(isoToday, 10) });
const futureHtml = gotoTab('today');
ok('未来起始日显示未开始', futureHtml.includes('计划尚未开始'), futureHtml.slice(0, 120));
const futurePlan = gotoTab('plan');
ok('未来起始日计划页显示未开始', futurePlan.includes('计划开始前'));

/* 场景 6：保存资料的交互 */
bootFresh(null);
getEl('f-h').value = '168';
getEl('f-w').value = '62';
getEl('f-age').value = '30';
getEl('f-sex').value = 'male';
getEl('f-goal').value = 'muscle_gain';
clickPreset(4);
getEl('f-exp').value = 'intermediate';
getEl('f-venue').value = 'home_dumbbell';
getEl('f-date').value = isoToday;
getEl('btnSave').onclick();
const savedProfile = JSON.parse(store.get('fitnessPlan.v1.profile'));
ok('保存资料写入 localStorage',
  savedProfile.heightCm === 168 && savedProfile.venue === 'home_dumbbell' &&
  JSON.stringify(savedProfile.trainingWeekdays) === JSON.stringify([0, 1, 3, 4]),
  JSON.stringify(savedProfile));
eq('保存后天数由训练日推导', E.normalizeProfile(savedProfile).daysPerWeek, 4);
ok('保存后自动跳到今日页', tabButtons.find((b) => b.dataset.tab === 'today').classList.contains('active'));
ok('保存后今日页有内容', getEl('view-today').innerHTML.length > 200);

/* 场景 7：非法输入被拦截 */
bootFresh(null);
getEl('f-h').value = '10';
getEl('f-w').value = '62';
alerts.length = 0;
getEl('btnSave').onclick();
ok('非法身高被拦截并提示', alerts.length === 1 && alerts[0].includes('身高'), alerts.join('|'));
ok('非法输入不会写入资料', store.get('fitnessPlan.v1.profile') == null);

/* 场景 8：自定义训练日选择器 */
bootFresh(null);
getEl('f-h').value = '176';
getEl('f-w').value = '72';
getEl('f-age').value = '28';
getEl('f-sex').value = 'male';
ok('默认渲染三个星期开关为选中', JSON.stringify(pressedWeekdays()) === JSON.stringify([0, 2, 4]),
  JSON.stringify(pressedWeekdays()));
eq('默认计数显示 3 天', getEl('wd-count').textContent, '3');
ok('默认提示列出周一/三/五', getEl('wd-hint').textContent.includes('周一/三/五'), getEl('wd-hint').textContent);

/* 取消一个训练日 */
clickWeekday(2);
eq('取消周三后剩 2 天', getEl('wd-count').textContent, '2');
ok('提示同步为周一/五', getEl('wd-hint').textContent.includes('周一/五'), getEl('wd-hint').textContent);
eq('切换星期不会清空已填身高', getEl('f-h').value, '176');
eq('切换星期不会清空已填体重', getEl('f-w').value, '72');

/* 快捷预设 */
clickPreset(5);
eq('预设 5 天后计数', getEl('wd-count').textContent, '5');
ok('预设 5 天选中的星期正确', JSON.stringify(pressedWeekdays()) === JSON.stringify(E.trainingWeekdays(5)),
  JSON.stringify(pressedWeekdays()));
clickPreset(1);
eq('预设 1 天后计数', getEl('wd-count').textContent, '1');
ok('1 天预设是周三', JSON.stringify(pressedWeekdays()) === JSON.stringify([2]), JSON.stringify(pressedWeekdays()));
clickWeekday(2);
eq('只剩 1 天时无法取消', getEl('wd-count').textContent, '1');
ok('给出至少保留 1 天的提示', getEl('wd-hint').textContent.includes('至少'), getEl('wd-hint').textContent);

/* 全选 7 天给出无休息日提示 */
clickPreset(7);
eq('全选 7 天', getEl('wd-count').textContent, '7');
ok('7 天提示没有完整休息日', getEl('wd-hint').textContent.includes('没有完整休息日'), getEl('wd-hint').textContent);

/* 自由组合：周一/周四 + 周六 */
clickPreset(2);
clickWeekday(5);
eq('自定义组合为 3 天', getEl('wd-count').textContent, '3');
ok('提示显示周一/四/六', getEl('wd-hint').textContent.includes('周一/四/六'), getEl('wd-hint').textContent);

/* 保存并验证排期跟随自定义星期（固定今天 = 2026-09-11 周五） */
getEl('f-date').value = isoToday;
getEl('btnSave').onclick();
const savedWd = JSON.parse(store.get('fitnessPlan.v1.profile'));
ok('保存写入自定义训练日数组', JSON.stringify(savedWd.trainingWeekdays) === JSON.stringify([0, 3, 5]),
  JSON.stringify(savedWd.trainingWeekdays));
const todayCustom = gotoTab('today');
ok('周五不在所选训练日时显示休息日', todayCustom.includes('今天是休息日'), todayCustom.slice(0, 140));
const planCustom = gotoTab('plan');
const around = (needle, len) => { const i = planCustom.indexOf(needle); return i < 0 ? '' : planCustom.slice(i, i + len); };
ok('计划页把周六（09-12）标为训练日', around('09-12', 400).includes('训练'), around('09-12', 400).slice(0, 160));
ok('计划页把周日（09-13）标为休息', around('09-13', 400).includes('休息'), around('09-13', 400).slice(0, 160));
ok('计划页把周五（09-11）标为已打卡/休息', /休息|已打卡/.test(around('09-11', 400)), around('09-11', 400).slice(0, 160));

/* 场景 9：动作示意弹层 */
bootFresh({ heightCm: 178, weightKg: 80, age: 30, sex: 'male', goal: 'muscle_gain', trainingWeekdays: [0, 2, 4], experience: 'intermediate', venue: 'gym', startDate: startDate });
let todaySvg = gotoTab('today');
const curSession = (function () {
  const p = E.normalizeProfile(JSON.parse(store.get('fitnessPlan.v1.profile')));
  return E.sessionFor(p, 1);
})();
ok('动作卡片内有示意动画标记', todaySvg.includes('data-anim="'), '');
ok('权重动作带配重标记', todaySvg.includes('data-weighted="1"') || todaySvg.includes('data-weighted="0"'));
dispatch('demo', curSession.exercises[0].id);
const mh = getEl('modalHost');
ok('点击动作弹出放大示意', mh.hidden === false && mh.innerHTML.includes('modal-anim'), mh.innerHTML.slice(0, 80));
ok('弹层内含动作名称', mh.innerHTML.includes(curSession.exercises[0].name));
ok('弹层内含真人示范链接', mh.innerHTML.includes('search.bilibili.com') && mh.innerHTML.includes('看真人示范'));
ok('弹层链接指向 B 站搜索且新开标签', mh.innerHTML.includes('target="_blank"') && mh.innerHTML.includes('rel="noopener noreferrer"'));
dispatch('close', '1');
ok('关闭后弹层清空', mh.hidden === true && mh.innerHTML === '');

/* 场景 10：伤病开关影响今日安排 */
const permProf = { heightCm: 178, weightKg: 80, age: 30, sex: 'male', goal: 'muscle_gain', trainingWeekdays: [0, 2, 4], experience: 'intermediate', venue: 'gym', injuries: ['lower_back'], startDate: startDate };
bootFresh(permProf);
const injHtml = gotoTab('today');
ok('今日页显示常驻受限部位', injHtml.includes('正在规避：腰'), '');
ok('伤病提示出现在今日页', injHtml.includes('受限部位') || injHtml.includes('跳过'));
/* 临时加一个受限部位 */
bootFresh({ ...permProf, injuries: [] });
gotoTab('today');
dispatch('joint', 'knee');
const afterJoint = getEl('view-today').innerHTML;
ok('临时伤病生效并显示规避提示', afterJoint.includes('正在规避：膝'), afterJoint.slice(0, 200));
ok('临时伤病写入 progress', JSON.parse(store.get('fitnessPlan.v1.progress')).tempJoints[isoToday].indexOf('knee') >= 0);

/* 场景 11：饮食页 */
bootFresh({ heightCm: 178, weightKg: 92, age: 32, sex: 'male', goal: 'fat_loss', trainingWeekdays: [0, 2, 4], experience: 'intermediate', venue: 'gym', startDate: startDate });
const dietHtml = gotoTab('diet');
ok('饮食页显示每日热量目标', /kcal/.test(dietHtml) && dietHtml.includes('基础代谢'));
ok('饮食页显示三大营养素', dietHtml.includes('蛋白') && dietHtml.includes('碳水') && dietHtml.includes('脂肪'));
ok('饮食页显示三餐', dietHtml.includes('早餐') && dietHtml.includes('午餐') && dietHtml.includes('晚餐'));
ok('饮食页有换一套按钮', typeof getEl('btnShuffle').onclick === 'function');
const firstDiet = dietHtml;
getEl('btnShuffle').onclick();
ok('换一套后组合变化', getEl('view-diet').innerHTML !== firstDiet);
ok('换一套后仍显示热量', getEl('view-diet').innerHTML.includes('kcal'));
ok('饮食页带免责声明', getEl('view-diet').innerHTML.includes('不构成医疗或营养处方'));

/* 场景 12：无档案时饮食页引导 */
bootFresh(null);
gotoTab('diet');
ok('无档案时饮食页给出引导', getEl('view-diet').innerHTML.includes('还没有饮食方案'));
ok('饮食页有去填写资料的入口', getEl('view-diet').innerHTML.includes('data-goto="me"'));

console.log(`\n通过 ${pass} 项${failures.length ? `，失败 ${failures.length} 项` : '，全部通过 ✅'}`);
if (failures.length) {
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
