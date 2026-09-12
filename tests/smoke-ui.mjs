/**
 * 界面冒烟测试：用最小 DOM 桩真正执行 <script id="app-ui">，
 * 逐个页签渲染并模拟打卡，确认没有运行时错误、关键内容缺失。
 * 运行： node tests/smoke-ui.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

const engineCode = html.match(/<script id="plan-engine">([\s\S]*?)<\/script>/)[1];
const uiCode = html.match(/<script id="app-ui">([\s\S]*?)<\/script>/)[1];

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
function makeEl(id) {
  return {
    id, innerHTML: '', textContent: '', hidden: false, value: '', style: {},
    dataset: {}, onclick: null, listeners: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, v) { if (v === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (v) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    addEventListener(type, fn) { this.listeners[type] = fn; }
  };
}
const els = new Map();
const getEl = (id) => {
  if (!els.has(id)) els.set(id, makeEl(id));
  return els.get(id);
};

const tabButtons = ['today', 'plan', 'me'].map((t) => { const e = makeEl('tab-' + t); e.dataset.tab = t; return e; });

const documentStub = {
  getElementById: getEl,
  querySelectorAll(sel) {
    if (sel === 'nav.tabs button') return tabButtons;
    return [];
  },
  addEventListener() {}
};
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
const saved = JSON.parse(store.get('fitnessPlan.v1.progress'));
ok('打卡已写入 localStorage', saved.logs[startDate] && saved.logs[startDate].status === 'done');
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
getEl('f-goal').value = 'muscle_gain';
getEl('f-days').value = '4';
getEl('f-exp').value = 'intermediate';
getEl('f-venue').value = 'home_dumbbell';
getEl('f-date').value = isoToday;
getEl('btnSave').onclick();
const savedProfile = JSON.parse(store.get('fitnessPlan.v1.profile'));
ok('保存资料写入 localStorage', savedProfile.heightCm === 168 && savedProfile.daysPerWeek === 4 && savedProfile.venue === 'home_dumbbell');
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

console.log(`\n通过 ${pass} 项${failures.length ? `，失败 ${failures.length} 项` : '，全部通过 ✅'}`);
if (failures.length) {
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
