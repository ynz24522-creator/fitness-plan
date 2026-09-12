/**
 * 饮食引擎断言：代谢计算、目标热量、宏量分配、忌口过滤、配餐精度与确定性。
 * 运行： node tests/test-diet.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
new Function(readFileSync(join(dir, 'plan-engine.js'), 'utf8'))();
new Function(readFileSync(join(dir, 'diet-engine.js'), 'utf8'))();
const E = globalThis.PlanEngine;
const D = globalThis.DietEngine;

let pass = 0;
const failures = [];
const ok = (name, cond, extra) => {
  if (cond) pass++;
  else failures.push(name + (extra ? '  →  ' + extra : ''));
};
const eq = (name, a, b) => ok(name, a === b, `期望 ${b}，实际 ${a}`);

/* ------------------------------------------------------------------ 1. 基础代谢 */
{
  /* Mifflin-St Jeor：男 10W+6.25H−5A+5；女 10W+6.25H−5A−161 */
  const male = E.normalizeProfile({ heightCm: 178, weightKg: 80, age: 30, sex: 'male' });
  const female = E.normalizeProfile({ heightCm: 165, weightKg: 60, age: 30, sex: 'female' });
  eq('男性基础代谢', Math.round(D.bmr(male)), Math.round(10 * 80 + 6.25 * 178 - 5 * 30 + 5));
  eq('女性基础代谢', Math.round(D.bmr(female)), Math.round(10 * 60 + 6.25 * 165 - 5 * 30 - 161));
  ok('同身高体重下男性代谢高于女性', D.bmr(male) > D.bmr(female));

  /* 活动系数按每周训练天数 */
  eq('每周 1 天活动系数', D.activityFactor(1), 1.375);
  eq('每周 2 天活动系数', D.activityFactor(2), 1.375);
  eq('每周 3 天活动系数', D.activityFactor(3), 1.55);
  eq('每周 4 天活动系数', D.activityFactor(4), 1.55);
  eq('每周 5 天活动系数', D.activityFactor(5), 1.725);
  eq('每周 6 天活动系数', D.activityFactor(6), 1.725);
  eq('每周 7 天活动系数', D.activityFactor(7), 1.9);
}

/* ------------------------------------------------------------------ 2. 目标热量与宏量 */
{
  const base = { heightCm: 175, weightKg: 75, age: 30, sex: 'male', trainingWeekdays: [0, 2, 4] };
  const fat = E.normalizeProfile({ ...base, goal: 'fat_loss' });
  const gain = E.normalizeProfile({ ...base, goal: 'muscle_gain' });
  ok('减脂热量低于增肌', D.targetCalories(fat, true).kcal < D.targetCalories(gain, true).kcal);
  /* 减脂目标不得低于基础代谢的 1.1 倍 */
  const tiny = E.normalizeProfile({ heightCm: 150, weightKg: 40, age: 60, sex: 'female', goal: 'fat_loss', trainingWeekdays: [0] });
  ok('减脂有热量下限保护', D.targetCalories(tiny, false).kcal >= Math.round(D.bmr(tiny) * 1.10) - 1,
    `${D.targetCalories(tiny, false).kcal} vs ${Math.round(D.bmr(tiny) * 1.10)}`);
  /* 训练日高于休息日 */
  const tr = D.targetCalories(fat, true).kcal, rest = D.targetCalories(fat, false).kcal;
  ok('训练日热量高于休息日', tr > rest, `${tr} vs ${rest}`);
  ok('训练日/休息日相对差约 15%', Math.abs(tr / rest - 1.15) < 0.03, String(tr / rest));
  const seven = E.normalizeProfile({ ...base, goal: 'recomp', trainingWeekdays: [0, 1, 2, 3, 4, 5, 6] });
  eq('每周 7 天不做训练日/休息日波动', D.targetCalories(seven, true).kcal, D.targetCalories(seven, false).kcal);

  /* 蛋白目标：BMI ≥ 30 用矫正体重 */
  const obese = E.normalizeProfile({ heightCm: 170, weightKg: 100, age: 35, sex: 'male', goal: 'fat_loss' });
  const m = 1.7, ideal = 22 * m * m;
  eq('BMI ≥30 使用矫正体重', +D.proteinWeight(obese).toFixed(3), +(ideal + 0.25 * (100 - ideal)).toFixed(3));
  ok('矫正体重小于实际体重', D.proteinWeight(obese) < 100);
  eq('BMI <30 直接用实际体重', D.proteinWeight(fat), 75);

  const mac = D.macroTarget(fat, 2000);
  eq('宏量热量与目标一致', Math.round(mac.protein * 4 + mac.carb * 4 + mac.fat * 9), 2000);
  ok('蛋白目标在 1.7–1.9 g/kg 之间',
    mac.protein / 75 >= 1.7 - 1e-9 && mac.protein / 75 <= 1.95 + 1e-9, String(mac.protein / 75));
}

/* ------------------------------------------------------------------ 3. 忌口与荤素过滤 */
{
  const vegan = E.normalizeProfile({ dietPattern: 'vegetarian' });
  const lacto = E.normalizeProfile({ dietPattern: 'lacto_ovo' });
  const normal = E.normalizeProfile({});
  const meat = D.FOODS.filter((f) => ['pr-chicken', 'pr-beef', 'pr-shrimp'].indexOf(f.id) >= 0);
  ok('纯素过滤掉所有肉蛋奶', meat.every((f) => !D.allowed(f, vegan)));
  ok('蛋奶素过滤掉肉类', meat.every((f) => !D.allowed(f, lacto)));
  ok('普通饮食允许肉类', meat.every((f) => D.allowed(f, normal)));
  const egg = D.FOODS.filter((f) => f.id === 'pr-egg')[0];
  ok('纯素不允许鸡蛋', !D.allowed(egg, vegan));
  ok('蛋奶素允许鸡蛋', D.allowed(egg, lacto));

  const noSeafood = E.normalizeProfile({ exclusions: ['seafood'] });
  ok('海鲜忌口生效', D.FOODS.filter((f) => f.tags.indexOf('seafood') >= 0).every((f) => !D.allowed(f, noSeafood)));
  ok('无忌口时海鲜可用', D.allowed(D.FOODS.filter((f) => f.id === 'pr-shrimp')[0], normal));
  const noNut = E.normalizeProfile({ exclusions: ['nut'] });
  ok('坚果忌口生效', D.FOODS.filter((f) => f.tags.indexOf('nut') >= 0).every((f) => !D.allowed(f, noNut)));
  eq('忌口去重与未知标签过滤', E.normalizeProfile({ exclusions: ['nut', 'nut', 'zzz'] }).exclusions.length, 1);
}

/* ------------------------------------------------------------------ 4. 配餐精度与结构 */
{
  const cases = [
    { heightCm: 178, weightKg: 92, age: 32, sex: 'male', goal: 'fat_loss', trainingWeekdays: [0, 2, 4] },
    { heightCm: 165, weightKg: 55, age: 26, sex: 'female', goal: 'muscle_gain', trainingWeekdays: [0, 1, 3, 4] },
    { heightCm: 180, weightKg: 70, age: 45, sex: 'male', goal: 'recomp', trainingWeekdays: [0, 1, 2, 4, 5] },
    { heightCm: 158, weightKg: 48, age: 22, sex: 'female', goal: 'strength', trainingWeekdays: [0, 1, 2, 3, 4, 5, 6] },
    { heightCm: 172, weightKg: 68, age: 35, sex: 'male', goal: 'fat_loss', trainingWeekdays: [0], dietPattern: 'vegetarian', exclusions: ['nut', 'dairy'], mealsPerDay: 5 },
    { heightCm: 168, weightKg: 58, age: 29, sex: 'female', goal: 'recomp', trainingWeekdays: [0, 3], dietPattern: 'lacto_ovo', exclusions: ['seafood', 'spicy'] }
  ];
  let worstK = 0, worstP = 1;
  for (const c of cases) {
    const p = E.normalizeProfile(c);
    for (const tr of [true, false]) {
      const plan = D.dailyPlan(p, '2026-09-14', tr, '');
      worstK = Math.max(worstK, plan.accuracy);
      worstP = Math.min(worstP, plan.totals.protein / plan.target.protein);
      ok(`配餐热量误差 ≤8%（${c.goal}/${p.mealsPerDay}餐/${tr ? '训练' : '休息'}）`,
        plan.accuracy <= 0.08, (plan.accuracy * 100).toFixed(1) + '%');
      ok(`配餐蛋白达标 ≥90%（${c.goal}）`, plan.totals.protein >= plan.target.protein * 0.9,
        `${plan.totals.protein} / ${plan.target.protein}`);
      ok(`蛋白不超过目标 2 倍（${c.goal}）`, plan.totals.protein <= plan.target.protein * 2,
        `${plan.totals.protein} / ${plan.target.protein}`);
      eq(`餐数正确（${p.mealsPerDay}）`, plan.meals.length, p.mealsPerDay);
      ok('每餐都有食材', plan.meals.every((mm) => mm.items.length > 0));
      ok('所有食材份量为正', plan.meals.every((mm) => mm.items.every((it) => it.grams > 0)));
      ok('日总量等于各餐之和', Math.abs(plan.totals.kcal - plan.meals.reduce((a, mm) => a + mm.kcal, 0)) <= 1);
    }
  }
  ok('全部样本热量误差在 8% 以内', worstK <= 0.08, (worstK * 100).toFixed(1) + '%');
  ok('全部样本蛋白达标 ≥90%', worstP >= 0.9, (worstP * 100).toFixed(1) + '%');
}

/* ------------------------------------------------------------------ 5. 确定性与换一套 */
{
  const p = E.normalizeProfile({ heightCm: 175, weightKg: 75, age: 30, sex: 'male', goal: 'recomp', trainingWeekdays: [0, 2, 4] });
  const a = D.dailyPlan(p, '2026-09-14', true, '');
  const b = D.dailyPlan(p, '2026-09-14', true, '');
  ok('同一日期结果完全一致（确定性）', JSON.stringify(a.meals) === JSON.stringify(b.meals));
  const c = D.dailyPlan(p, '2026-09-14', true, 'shuffle-1');
  ok('换一套会得到不同组合', JSON.stringify(a.meals) !== JSON.stringify(c.meals));
  ok('换一套后热量仍然达标', c.accuracy <= 0.08, (c.accuracy * 100).toFixed(1) + '%');
  const d1 = D.dailyPlan(p, '2026-09-14', true, '');
  const d2 = D.dailyPlan(p, '2026-09-15', true, '');
  ok('相邻两天组合不同', JSON.stringify(d1.meals) !== JSON.stringify(d2.meals));
  /* 不同档案不应撞同一套 */
  const other = E.normalizeProfile({ heightCm: 160, weightKg: 50, age: 25, sex: 'female', goal: 'fat_loss', trainingWeekdays: [0, 2, 4] });
  ok('不同档案组合不同', JSON.stringify(D.dailyPlan(other, '2026-09-14', true, '').meals) !== JSON.stringify(a.meals));
}

/* ------------------------------------------------------------------ 6. 素食组合仍然可用 */
{
  const p = E.normalizeProfile({
    heightCm: 170, weightKg: 65, age: 28, sex: 'male', goal: 'muscle_gain',
    trainingWeekdays: [0, 2, 4], dietPattern: 'vegetarian', exclusions: ['nut']
  });
  const plan = D.dailyPlan(p, '2026-09-14', true, '');
  const ids = plan.meals.reduce((a, m) => a.concat(m.items.map((i) => i.id)), []);
  ok('素食方案不含肉类', !ids.some((id) => ['pr-chicken', 'pr-beef', 'pr-pork', 'pr-shrimp', 'pr-salmon', 'pr-bass', 'pr-tuna'].indexOf(id) >= 0), ids.join(','));
  ok('素食方案不含蛋奶', !ids.some((id) => ['pr-egg', 'pr-milk', 'pr-greekyogurt', 'dy-yogurt', 'dy-cheese'].indexOf(id) >= 0), ids.join(','));
  ok('素食方案避开坚果', !ids.some((id) => id.indexOf('nt-') === 0), ids.join(','));
  ok('素食方案热量达标', plan.accuracy <= 0.08, (plan.accuracy * 100).toFixed(1) + '%');
}

console.log(`\n通过 ${pass} 项${failures.length ? `，失败 ${failures.length} 项` : '，全部通过 ✅'}`);
if (failures.length) {
  failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
