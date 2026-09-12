/**
 * 从 index.html 抽出 <script id="plan-engine"> 引擎代码，
 * 在 Node 中加载并断言计划生成规则。
 * 运行： node tests/test-engine.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, '..', 'index.html');
const html = readFileSync(htmlPath, 'utf8');

const m = html.match(/<script id="plan-engine">([\s\S]*?)<\/script>/);
if (!m) {
  console.error('找不到 <script id="plan-engine"> 代码块');
  process.exit(1);
}
const engineCode = m[1];
if (/<\/script>/i.test(engineCode)) {
  console.error('引擎代码块内含非法的结束标签');
  process.exit(1);
}

const factory = new Function(engineCode + '\nreturn globalThis.PlanEngine;');
const E = factory();

let pass = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { failures.push(name + (extra ? '  →  ' + extra : '')); }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `期望 ${expected}，实际 ${actual}`);
}

/* ------------------------------------------------------------------ 1. BMI 分档边界 */
eq('BMI 18.4 → 偏瘦', E.bodyClassFromBmi(18.4), 'under');
eq('BMI 18.5 → 正常', E.bodyClassFromBmi(18.5), 'normal');
eq('BMI 23.9 → 正常', E.bodyClassFromBmi(23.9), 'normal');
eq('BMI 24.0 → 超重', E.bodyClassFromBmi(24.0), 'over');
eq('BMI 27.9 → 超重', E.bodyClassFromBmi(27.9), 'over');
eq('BMI 28.0 → 肥胖', E.bodyClassFromBmi(28.0), 'obese');

/* BMI 与身高体重联动：170cm / 65kg → 22.5 */
eq('bmi(170,65) 约 22.5', E.bmi(170, 65).toFixed(1), '22.5');
const range = E.healthyWeightRange(170);
ok('健康体重区间 170cm ≈ 53.5–69.1', range.min === 53.5 && range.max === 69.1, JSON.stringify(range));

/* 身高分档 */
eq('164cm → 偏矮', E.heightClass(164), 'compact');
eq('165cm → 中等', E.heightClass(165), 'average');
eq('180cm → 中等', E.heightClass(180), 'average');
eq('181cm → 偏高', E.heightClass(181), 'tall');

/* ------------------------------------------------------------------ 2. 每周排布 */
const expectWeekdays = {
  2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5]
};
for (const d of [2, 3, 4, 5, 6]) {
  const wd = E.trainingWeekdays(d);
  eq(`每周 ${d} 天：训练日数量`, wd.length, d);
  ok(`每周 ${d} 天：训练日排布正确`, JSON.stringify(wd) === JSON.stringify(expectWeekdays[d]), JSON.stringify(wd));
  ok(`每周 ${d} 天：休息日数量 ${7 - d}`, 7 - wd.length === 7 - d);
}

/* 连续 30 天里，训练日数量应等于 按周分布 */
{
  const prof = { heightCm: 175, weightKg: 80, goal: 'recomp', daysPerWeek: 4, experience: 'intermediate', venue: 'gym', startDate: '2026-01-05' };
  const tl = E.buildTimeline(prof, { logs: {} }, '2026-01-05', '2026-02-03');
  const days = Object.values(tl);
  eq('30 天排期天数', days.length, 30);
  const trainCount = days.filter(d => d.training).length;
  ok('30 天训练日数量合理（17 或 18）', trainCount === 17 || trainCount === 18, String(trainCount));
}

/* ------------------------------------------------------------------ 2b. 自定义训练周几 */
{
  /* 旧档案迁移：只有 daysPerWeek 时按预设还原 */
  const legacy = E.normalizeProfile({ daysPerWeek: 3 });
  ok('旧档案迁移出训练日数组', JSON.stringify(legacy.trainingWeekdays) === JSON.stringify([0, 2, 4]),
    JSON.stringify(legacy.trainingWeekdays));
  eq('旧档案迁移后天数一致', legacy.daysPerWeek, 3);
  const legacy5 = E.normalizeProfile({ daysPerWeek: 5 });
  ok('旧档案 5 天迁移正确', JSON.stringify(legacy5.trainingWeekdays) === JSON.stringify([0, 1, 2, 4, 5]),
    JSON.stringify(legacy5.trainingWeekdays));

  /* 天数由数组长度派生 */
  const custom = E.normalizeProfile({ trainingWeekdays: [1, 3, 5] });
  eq('天数由数组长度派生', custom.daysPerWeek, 3);
  ok('自定义星期被保留', JSON.stringify(custom.trainingWeekdays) === JSON.stringify([1, 3, 5]),
    JSON.stringify(custom.trainingWeekdays));

  /* 脏数据过滤 */
  const dirty = E.normalizeProfile({ trainingWeekdays: [6, 0, 0, 9, -1, 2, 2, '1'] });
  ok('脏数据被过滤、去重、升序', JSON.stringify(dirty.trainingWeekdays) === JSON.stringify([0, 1, 2, 6]),
    JSON.stringify(dirty.trainingWeekdays));
  const empt = E.normalizeProfile({ trainingWeekdays: [], daysPerWeek: 4 });
  ok('空数组回落到预设', JSON.stringify(empt.trainingWeekdays) === JSON.stringify([0, 1, 3, 4]),
    JSON.stringify(empt.trainingWeekdays));
  const allBad = E.normalizeProfile({ trainingWeekdays: ['x', 99, -3] });
  ok('全部非法时回落到默认 3 天', JSON.stringify(allBad.trainingWeekdays) === JSON.stringify([0, 2, 4]),
    JSON.stringify(allBad.trainingWeekdays));

  /* 预设覆盖 1–7 天 */
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    const preset = E.trainingWeekdays(n);
    eq(`预设 ${n} 天长度`, preset.length, n);
    ok(`预设 ${n} 天升序且在 0–6 内`, preset.every((v, i) => v >= 0 && v <= 6 && (i === 0 || v > preset[i - 1])),
      JSON.stringify(preset));
  }
  ok('1 天预设是周三', E.trainingWeekdays(1).join(',') === '2', JSON.stringify(E.trainingWeekdays(1)));
  ok('7 天预设是周一至周日', E.trainingWeekdays(7).join(',') === '0,1,2,3,4,5,6', JSON.stringify(E.trainingWeekdays(7)));
  ok('传 profile 返回它自己的训练日',
    E.trainingWeekdays({ trainingWeekdays: [5, 1] }).join(',') === '1,5');

  /* 时间轴严格按自定义星期排期 */
  {
    const prof = { heightCm: 175, weightKg: 80, goal: 'recomp', trainingWeekdays: [1, 3, 5], experience: 'beginner', venue: 'gym', startDate: '2026-01-05' };
    const tl = E.buildTimeline(prof, { logs: {} }, '2026-01-05', '2026-01-11', '2026-01-05');
    const training = Object.values(tl).filter(d => d.training).map(d => d.date);
    ok('自定义周二/四/六只在这三天排训练',
      JSON.stringify(training) === JSON.stringify(['2026-01-06', '2026-01-08', '2026-01-10']),
      JSON.stringify(training));
    eq('自定义排期下训练日数量', training.length, 3);
    eq('自定义排期下周一为休息日', tl['2026-01-05'].training, false);
    eq('自定义排期下周二为第 1 天', tl['2026-01-06'].sessionIndex, 1);
    eq('自定义排期下周四为第 2 天', tl['2026-01-08'].sessionIndex, 2);
    eq('自定义排期下周六为第 3 天', tl['2026-01-10'].sessionIndex, 3);
    eq('isTrainingDate 跟随自定义星期', E.isTrainingDate('2026-01-07', prof), false);
    eq('isTrainingDate 命中自定义星期', E.isTrainingDate('2026-01-08', prof), true);

    /* 顺延在自定义星期下同样成立 */
    const logs = { '2026-01-06': { status: 'done' } };
    const tl2 = E.buildTimeline(prof, { logs }, '2026-01-10', '2026-01-10');
    eq('自定义星期下漏练仍顺延', tl2['2026-01-10'].sessionIndex, 2);
    eq('自定义星期下连击计算正确', E.computeStreak(logs, '2026-01-06'), 1);
    eq('自定义星期下断签归零', E.computeStreak(logs, '2026-01-08'), 0);
  }

  /* 单周只练 1 天 */
  {
    const prof = { heightCm: 170, weightKg: 68, goal: 'recomp', trainingWeekdays: [6], experience: 'beginner', venue: 'home_bodyweight', startDate: '2026-01-05' };
    eq('1 天档案天数', E.normalizeProfile(prof).daysPerWeek, 1);
    const tl = E.buildTimeline(prof, { logs: {} }, '2026-01-05', '2026-01-18', '2026-01-05');
    const training = Object.values(tl).filter(d => d.training).map(d => d.date);
    ok('每周只排周日', training.every(d => E.weekdayMon0(d) === 6), JSON.stringify(training));
    eq('两周共 2 次训练', training.length, 2);
    const s = E.sessionFor(prof, 2);
    eq('每周 1 天时第 2 次属第 2 周', s.week, 2);
    ok('1 天分化只有一个模板', E.splitFor(1, 'advanced').length === 1);
    ok('1 天训练内容完整', s.exercises.length >= 5, String(s.exercises.length));
  }

  /* 每周 7 天：第 7 天是低强度恢复日 */
  {
    const prof = { heightCm: 175, weightKg: 75, goal: 'muscle_gain', trainingWeekdays: [0, 1, 2, 3, 4, 5, 6], experience: 'advanced', venue: 'gym', startDate: '2026-01-05' };
    const split = E.splitFor(7, 'advanced');
    eq('7 天共 7 个分化', split.length, 7);
    eq('第 7 个分化是恢复日', split[6].recovery, true);
    const rec = E.sessionFor(prof, 7);
    eq('第 7 天标记为恢复日', rec.isRecovery, true);
    ok('恢复日标题含“恢复”', rec.title.includes('恢复'), rec.title);
    ok('恢复日所有动作不超过 2 组', rec.exercises.every(e => e.sets <= 2),
      rec.exercises.map(e => e.name + ':' + e.sets).join(','));
    ok('恢复日必有低强度有氧收尾', !!rec.finisher && rec.finisher.isJump === false, JSON.stringify(rec.finisher && rec.finisher.name));
    ok('恢复日给出无完整休息日的提示', rec.warnings.join('').includes('没有完整休息日'), rec.warnings.join(' | '));
    const day1 = E.sessionFor(prof, 1);
    eq('第 1 天不是恢复日', day1.isRecovery, false);
    eq('7 天时第 7 天仍属第 1 周', rec.week, 1);
    eq('7 天时第 8 天属第 2 周', E.sessionFor(prof, 8).week, 2);
    /* 恢复日的组数不受经验等级影响 */
    const recBeg = E.sessionFor({ ...prof, experience: 'beginner' }, 7);
    ok('新手恢复日同样压到 2 组', recBeg.exercises.every(e => e.sets <= 2));
  }

  /* 校验：至少 1 天 */
  ok('空训练日集合报错', E.validateProfile({ heightCm: 170, weightKg: 70, trainingWeekdays: [] }).length > 0);
  ok('合法训练日集合通过', E.validateProfile({ heightCm: 170, weightKg: 70, trainingWeekdays: [0, 2] }).length === 0);
  ok('越界训练日被过滤后仍有 1 天即可通过',
    E.validateProfile({ heightCm: 170, weightKg: 70, trainingWeekdays: [9, 3] }).length === 0);
}

/* ------------------------------------------------------------------ 3. 中周期递进与减载 */
{
  const prof = { heightCm: 175, weightKg: 80, goal: 'muscle_gain', daysPerWeek: 3, experience: 'intermediate', venue: 'gym', startDate: '2026-01-05' };
  const w1 = E.sessionFor(prof, 1);            // week 1
  const w3 = E.sessionFor(prof, 7);            // week 3
  const w4 = E.sessionFor(prof, 10);           // week 4（减载）
  eq('第 1 个中周期 week1', w1.weekInBlock, 1);
  eq('第 1 个中周期 week3.block', w3.block, 1);
  eq('第 4 周识别为减载周', w4.isDeload, true);
  eq('第 3 周不是减载', w3.isDeload, false);
  ok('减载周组数少于第 3 周', w4.exercises[0].sets < w3.exercises[0].sets,
    `w3=${w3.exercises[0].sets} w4=${w4.exercises[0].sets}`);

  // 同一下降逻辑要覆盖所有经验等级
  for (const expName of ['beginner', 'intermediate', 'advanced']) {
    const p = { ...prof, experience: expName };
    const s3 = E.sessionFor(p, 7), s4 = E.sessionFor(p, 10);
    ok(`${expName}：减载周组数下降`, s4.exercises[0].sets < s3.exercises[0].sets,
      `${s3.exercises[0].sets} → ${s4.exercises[0].sets}`);
  }

  // 减载周负重系数 ×0.9
  const ex3 = w3.exercises.find(e => e.weighted);
  const ex4 = w4.exercises.find(e => e.id === ex3.id) || w4.exercises.find(e => e.weighted);
  ok('减载周负重量低于第 3 周', ex4.loadRaw < ex3.loadRaw, `${ex3.loadRaw} vs ${ex4.loadRaw}`);
  const ratio = ex4.loadRaw / ex3.loadRaw;
  ok('减载负重系数 ≈ 0.9', Math.abs(ratio - 0.9) < 1e-9, String(ratio));

  // 中周期之间 3% 递增
  const factors = [];
  for (let b = 1; b <= 12; b++) factors.push(E.sessionFor(prof, (b - 1) * 12 + 1).progressionFactor);
  ok('progressionFactor 随中周期单调递增', factors.every((v, i) => i === 0 || v > factors[i - 1]), factors.join(','));
  ok('第 2 个中周期比第 1 个高 3%', Math.abs(factors[1] / factors[0] - 1.03) < 1e-9, String(factors[1] / factors[0]));
}

/* ------------------------------------------------------------------ 4. 连续 400 天可生成且内容有效 */
{
  const profileMatrix = [];
  for (const venue of ['home_bodyweight', 'home_dumbbell', 'gym'])
    for (const goal of ['fat_loss', 'muscle_gain', 'recomp', 'strength'])
      for (const ex of ['beginner', 'intermediate', 'advanced'])
        for (const d of [1, 2, 3, 4, 5, 6, 7])
          profileMatrix.push({ heightCm: 172, weightKg: 78, goal, daysPerWeek: d, experience: ex, venue, startDate: '2026-01-05' });

  let generated = 0, empty = 0;
  for (const prof of profileMatrix) {
    for (let i = 1; i <= 400; i++) {
      const s = E.sessionFor(prof, i);
      generated++;
      if (!s.exercises.length || s.exercises.some(e => !e.name || !e.cues || !(e.sets > 0) || !e.reps)) empty++;
    }
  }
  eq('组合矩阵下 400 天全部生成动作', empty, 0);
  eq('组合矩阵规模 = 252 组 × 400 天', generated, 252 * 400);

  // 单组合 400 天细查
  const prof = { heightCm: 172, weightKg: 78, goal: 'recomp', daysPerWeek: 4, experience: 'intermediate', venue: 'home_dumbbell', startDate: '2026-01-05' };
  const seen = new Set();
  for (let i = 1; i <= 400; i++) {
    const s = E.sessionFor(prof, i);
    seen.add(s.title);
    if (s.exercises.some(e => e.sets < 1 || e.restSec <= 0)) empty++;
  }
  eq('400 天组数与休息时间合法', empty, 0);
  eq('每周 4 天共用 4 种分化', seen.size, 4);
}

/* ------------------------------------------------------------------ 5. 肥胖档剔除跳跃动作 */
{
  let jumpHits = 0;
  for (const venue of ['home_bodyweight', 'home_dumbbell', 'gym'])
    for (const goal of ['fat_loss', 'muscle_gain', 'recomp', 'strength'])
      for (const ex of ['beginner', 'intermediate', 'advanced'])
        for (const d of [1, 2, 3, 4, 5, 6, 7]) {
          const prof = { heightCm: 170, weightKg: 95, goal, daysPerWeek: d, experience: ex, venue, startDate: '2026-01-05' };
          ok(`肥胖档判定（170/95）`, E.bodyClassFromBmi(E.bmi(170, 95)) === 'obese');
          for (let i = 1; i <= 60; i++) {
            const s = E.sessionFor(prof, i);
            for (const it of s.exercises.concat(s.finisher ? [s.finisher] : [])) if (it.isJump) jumpHits++;
          }
        }
  eq('肥胖档（BMI≥28）动作库与有氧收尾不含任何跳跃动作', jumpHits, 0);

  // 对照：正常体重 + 减脂在中级会出现跳跃类有氧，说明过滤是有效的
  let normalJump = 0;
  for (let i = 1; i <= 30; i++) {
    const s = E.sessionFor({ heightCm: 170, weightKg: 68, goal: 'fat_loss', daysPerWeek: 3, experience: 'intermediate', venue: 'gym', startDate: '2026-01-05' }, i);
    if (s.finisher && s.finisher.isJump) normalJump++;
  }
  ok('正常体重档仍可能保留跳跃类有氧（对照）', normalJump > 0, String(normalJump));
}

/* ------------------------------------------------------------------ 6. 身高校正 */
{
  const tall = { heightCm: 190, weightKg: 85, goal: 'muscle_gain', daysPerWeek: 3, experience: 'advanced', venue: 'gym', startDate: '2026-01-05' };
  const s = E.sessionFor(tall, 1);
  const all = s.exercises;
  ok('偏高体型：不安排引体向上', !all.some(e => e.id === 'vr-pullup'), all.map(e => e.id).join(','));
  /* 推 / 拉 / 腿 三天全部检查 */
  const tallAll = [1, 2, 3].flatMap(i => E.sessionFor(tall, i).exercises);
  ok('偏高体型：任何一天都不安排引体向上', !tallAll.some(e => e.id === 'vr-pullup'));
  ok('偏高体型：出现深蹲/硬拉的长行程提示', tallAll.some(e => e.notes.join('').includes('长行程')),
    tallAll.map(e => e.id + ':' + e.notes.join('|')).join(' || '));
  ok('偏高体型：垂直拉动作附带替代说明',
    tallAll.filter(e => e.pattern === 'vertical_pull').every(e => e.notes.join('').includes('偏高体型')));
  const avg = E.sessionFor({ ...tall, heightCm: 175 }, 1);
  ok('中等身高：不出现长行程提示', !avg.exercises.some(e => e.notes.join('').includes('长行程')));

  const short = E.sessionFor({ ...tall, heightCm: 160 }, 1);
  ok('偏矮体型：出现行程偏短提示', short.exercises.some(e => e.notes.join('').includes('行程偏短')));
  const shortReps = short.exercises.find(e => !e.repsIsTime).reps;
  const avgReps = avg.exercises.find(e => !e.repsIsTime).reps;
  ok('偏矮体型：次数上限 +1', Number(shortReps.split('-')[1]) === Number(avgReps.split('-')[1]) + 1,
    `${avgReps} → ${shortReps}`);

  /* 增力目标的主项不因偏矮而改变次数区间 */
  const strBase = { heightCm: 160, weightKg: 80, goal: 'strength', daysPerWeek: 3, experience: 'advanced', venue: 'gym', startDate: '2026-01-05' };
  const strShort = E.sessionFor(strBase, 1);
  const strAvg = E.sessionFor({ ...strBase, heightCm: 175 }, 1);
  eq('增力主项次数区间不受偏矮影响', strShort.exercises[0].reps, strAvg.exercises[0].reps);
  ok('增力辅助动作仍可 +1 次',
    strShort.exercises.some((e, i) => !e.repsIsTime && e.reps !== strAvg.exercises[i].reps),
    strShort.exercises.map(e => e.reps).join(','));

  // 偏高体型 squat/hinge 起始负重下调 10%（第 3 天是腿日）
  const tallLoad = E.sessionFor(tall, 3).exercises.find(e => e.pattern === 'squat' && e.weighted).loadRaw;
  const avgLoad = E.sessionFor({ ...tall, heightCm: 175 }, 3).exercises.find(e => e.pattern === 'squat' && e.weighted).loadRaw;
  ok('偏高体型 squat 起始负重为中等身高的 90%', Math.abs(tallLoad / avgLoad - 0.9) < 1e-9,
    `${tallLoad} / ${avgLoad}`);
}

/* ------------------------------------------------------------------ 7. 打卡、连击与顺延 */
{
  const prof = { heightCm: 175, weightKg: 80, goal: 'recomp', daysPerWeek: 3, experience: 'beginner', venue: 'gym', startDate: '2026-01-05' };
  // 2026-01-05 是周一，训练日为 周一/周三/周五
  eq('起始日为训练日', E.isTrainingDate('2026-01-05', prof), true);
  eq('周二为休息日', E.isTrainingDate('2026-01-06', prof), false);

  /* 全部完成：训练日序数逐日推进 */
  {
    const logs = {
      '2026-01-05': { status: 'done', sessionIndex: 1 },
      '2026-01-06': { status: 'rest_done', sessionIndex: 1 },
      '2026-01-07': { status: 'done', sessionIndex: 2 },
      '2026-01-08': { status: 'rest_done', sessionIndex: 2 },
      '2026-01-09': { status: 'done', sessionIndex: 3 }
    };
    const tl = E.buildTimeline(prof, { logs }, '2026-01-09', '2026-01-09');
    eq('全部完成后今日序数 = 3', tl['2026-01-09'].sessionIndex, 3);
    eq('打卡完成状态', tl['2026-01-09'].completed, true);
    eq('连续打卡 5 天', E.computeStreak(logs, '2026-01-09'), 5);
    eq('累计完成训练 3 次', E.completedTrainingDays({ logs }), 3);
  }

  /* 漏练顺延：1/7 没练，1/9 依然是第 2 天 */
  {
    const logs = {
      '2026-01-05': { status: 'done', sessionIndex: 1 },
      '2026-01-06': { status: 'rest_done', sessionIndex: 1 },
      '2026-01-09': { status: 'rest_done', sessionIndex: 2 }
    };
    const tl = E.buildTimeline(prof, { logs }, '2026-01-09', '2026-01-09', '2026-01-05');
    eq('漏练后训练日序数不推进（仍为第 2 天）', tl['2026-01-09'].sessionIndex, 2);
    eq('1/7 未完成也算第 2 天（同一次训练）', tl['2026-01-07'].sessionIndex, 2);
    /* 1/7、1/8 漏签，连击在 1/8 中断；1/9 打卡后是新连击的第 1 天 */
    eq('漏练中断连击后重新从 1 开始', E.computeStreak(logs, '2026-01-09'), 1);
    eq('漏练当日尚未打卡时，连击显示到前一天', E.computeStreak(logs, '2026-01-07'), 2);
  }

  /* 连续多天漏练仍停在同一个训练日序号，完成后才推进 */
  {
    const logs = { '2026-01-05': { status: 'done', sessionIndex: 1 } };
    const tl = E.buildTimeline(prof, { logs }, '2026-01-16', '2026-01-16');
    eq('连续漏练后仍停在第 2 天', tl['2026-01-16'].sessionIndex, 2);

    logs['2026-01-16'] = { status: 'done', sessionIndex: 2 };
    const tl2 = E.buildTimeline(prof, { logs }, '2026-01-16', '2026-01-16');
    eq('完成后第 16 天序号仍为 2（当天已完成）', tl2['2026-01-16'].sessionIndex, 2);
    eq('当天完成后状态正确', tl2['2026-01-16'].completed, true);

    const tl3 = E.buildTimeline(prof, { logs }, '2026-01-16', '2026-01-19');
    eq('下一个训练日推进到第 3 天', tl3['2026-01-19'].sessionIndex, 3);
  }

  /* 显式跳过：不推进序号 */
  {
    const logs = {
      '2026-01-05': { status: 'done', sessionIndex: 1 },
      '2026-01-07': { status: 'missed', sessionIndex: 2 }
    };
    const tl = E.buildTimeline(prof, { logs }, '2026-01-09', '2026-01-09', '2026-01-05');
    eq('跳过不改变训练日序号', tl['2026-01-09'].sessionIndex, 2);
    eq('跳过标记被保留', tl['2026-01-07'].missed, true);
  }

  /* 顺延后分化顺序不乱：序号 1..N 与分化模板循环一致 */
  {
    const split = E.splitFor(3, 'beginner');
    for (let i = 1; i <= 12; i++) {
      const s = E.sessionFor(prof, i);
      eq(`第 ${i} 天分化循环`, s.title, split[(i - 1) % split.length].name);
    }
  }

  /* 休息日打卡也算连击 */
  {
    const logs = {
      '2026-01-10': { status: 'done' },
      '2026-01-11': { status: 'rest_done' },
      '2026-01-12': { status: 'done' }
    };
    eq('含休息日打卡的连击为 3 天', E.computeStreak(logs, '2026-01-12'), 3);
  }
}

/* ------------------------------------------------------------------ 8. 配重档位与单调性 */
{
  const prof = { heightCm: 175, weightKg: 70, goal: 'muscle_gain', daysPerWeek: 4, experience: 'intermediate', venue: 'home_dumbbell', startDate: '2026-01-05' };
  const has = v => E.DB_SIZES.includes(v);
  for (let i = 1; i <= 48; i++) {
    const s = E.sessionFor(prof, i);
    for (const e of s.exercises) {
      if (!e.weighted) { if (e.loadWeight !== 0) ok('自重动作载重为 0', false, e.id); continue; }
      ok(`哑铃配重落在可用档位（${e.id}）`, has(e.loadWeight), String(e.loadWeight));
    }
  }

  /* 同一中周期内：第 1–3 周负重单调不减，减载周不高于第 3 周 */
  for (const venue of ['home_dumbbell', 'gym']) {
    const p = { ...prof, venue };
    for (let block = 1; block <= 6; block++) {
      const base = (block - 1) * 16;
      /* 第 W 周的训练日序号从 (W-1)*4+1 开始 */
      const w = [1, 2, 3, 4].map(k => E.sessionFor(p, base + (k - 1) * 4 + 1));
      const id = w[0].exercises.find(e => e.weighted).id;
      const loads = w.map(s => (s.exercises.find(e => e.id === id) || { loadRaw: 0 }).loadRaw);
      ok(`${venue} 中周期 ${block}：第 1–3 周负重单调不减`, loads[1] >= loads[0] && loads[2] >= loads[1], loads.map(x => x.toFixed(2)).join(','));
      ok(`${venue} 中周期 ${block}：减载周不高于第 3 周`, loads[3] <= loads[2], loads.map(x => x.toFixed(2)).join(','));
      ok(`${venue} 中周期 ${block}：减载周严格低于第 3 周`, loads[3] < loads[2], loads.map(x => x.toFixed(2)).join(','));
    }
  }

  /* 中周期之间负重上升 */
  {
    const p = { ...prof, venue: 'home_dumbbell' };
    /* 序号 1 与序号 33 属于同一分化模板（上肢 A），分别位于第 1、第 3 个中周期 */
    const s1 = E.sessionFor(p, 1), s2 = E.sessionFor(p, 33);
    eq('跨中周期比较的分化一致', s1.title, s2.title);
    const l1 = s1.exercises.find(e => e.weighted).loadWeight;
    const l2 = s2.exercises.find(e => e.weighted).loadWeight;
    ok('跨中周期配重不下降', l2 >= l1, `${l1} → ${l2}`);
  }
}

/* ------------------------------------------------------------------ 9. 目标决定次数与组间休息 */
{
  const base = { heightCm: 175, weightKg: 75, daysPerWeek: 3, experience: 'intermediate', venue: 'gym', startDate: '2026-01-05' };
  const fat = E.sessionFor({ ...base, goal: 'fat_loss' }, 1);
  const mus = E.sessionFor({ ...base, goal: 'muscle_gain' }, 1);
  const str = E.sessionFor({ ...base, goal: 'strength' }, 1);
  eq('减脂次数区间', fat.exercises[0].reps, '12-15');
  eq('减脂组间休息 45 秒', fat.exercises[0].restSec, 45);
  eq('增肌次数区间', mus.exercises[0].reps, '8-12');
  eq('增肌组间休息 75 秒', mus.exercises[0].restSec, 75);
  eq('增力主项次数区间', str.exercises[0].reps, '4-6');
  eq('增力主项休息 120 秒', str.exercises[0].restSec, 120);
  ok('增力辅助动作休息 90 秒', str.exercises.some(e => e.restSec === 90), str.exercises.map(e => e.restSec).join(','));
}

/* ------------------------------------------------------------------ 10. 方案校验与规范化 */
{
  /* 本周日历需要覆盖「今天之前的日期」 */
  const prof = { heightCm: 175, weightKg: 80, goal: 'recomp', daysPerWeek: 3, experience: 'beginner', venue: 'gym', startDate: '2026-03-02' };
  eq('2026-03-02 是周一', E.weekdayMon0('2026-03-02'), 0);
  eq('2026-03-12 是周四', E.weekdayMon0('2026-03-12'), 3);
  const monday = '2026-03-09', sunday = '2026-03-15';
  const weekTl = E.buildTimeline(prof, { logs: { '2026-03-09': { status: 'done' } } }, '2026-03-12', sunday, monday);
  eq('本周时间轴覆盖 7 天', Object.keys(weekTl).length, 7);
  eq('本周第一天存在', !!weekTl[monday], true);
  eq('本周已完成的训练日标记为完成', weekTl['2026-03-09'].completed, true);
  eq('本周未来日期存在', !!weekTl[sunday], true);
  ok('本周时间轴起点早于今天', E.diffDays(monday, '2026-03-12') > 0);

  /* 起始日之前不产生条目 */
  const tl = E.buildTimeline({ ...prof, startDate: '2026-03-11' }, { logs: {} }, '2026-03-12', sunday, monday);
  eq('起始日之前不生成条目', Object.keys(tl).length, 5);
  eq('时间轴不越过起始日', tl[monday], undefined);
}

/* ------------------------------------------------------------------ 11. 方案校验与规范化 */
{
  ok('身高越界报错', E.validateProfile({ heightCm: 90, weightKg: 70 }).length > 0);
  ok('体重越界报错', E.validateProfile({ heightCm: 170, weightKg: 20 }).length > 0);
  ok('正常资料无错误', E.validateProfile({ heightCm: 170, weightKg: 70 }).length === 0);
  const np = E.normalizeProfile({ daysPerWeek: 'abc', goal: 'x', venue: 'y', experience: 'z' });
  eq('非法天数回落到 3', np.daysPerWeek, 3);
  eq('超范围天数被截断到 6', E.normalizeProfile({ daysPerWeek: 99 }).daysPerWeek, 6);
  eq('低于范围天数被截断到 2', E.normalizeProfile({ daysPerWeek: -5 }).daysPerWeek, 2);
  eq('0 天视为无效并回落到 3', E.normalizeProfile({ daysPerWeek: 0 }).daysPerWeek, 3);
  eq('非法目标回落到 塑形', np.goal, 'recomp');
  eq('非法场地回落到 徒手', np.venue, 'home_bodyweight');
  eq('非法经验回落到 新手', np.experience, 'beginner');
}

/* ------------------------------------------------------------------ 汇总 */
console.log(`\n通过 ${pass} 项${failures.length ? `，失败 ${failures.length} 项` : '，全部通过 ✅'}`);
if (failures.length) {
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
