/* =========================================================================
   饮食引擎 —— 纯函数实现，不依赖 DOM，可被 Node 测试脚本直接加载。
   热量按 Mifflin-St Jeor 估算；配餐按目标热量与蛋白需求从食物库组合。
   ========================================================================= */
(function () {
  'use strict';

  /* 每 100g（ml）的营养值；tags: vegetarian=纯素可用, lacto_ovo=蛋奶素可用 */
  function F(id, name, cat, unit, kcal, p, c, f, tags, bf) {
    return { id: id, name: name, cat: cat, unit: unit, kcal: kcal, p: p, c: c, f: f,
      tags: tags || [], bf: !!bf };
  }
  var V = ['vegetarian', 'lacto_ovo'];
  var LO = ['lacto_ovo'];

  var FOODS = [
    /* ---------------- 主食 ---------------- */
    F('st-rice', '米饭（熟）', 'staple', 'g', 116, 2.6, 25.9, 0.3, V),
    F('st-brown', '糙米饭（熟）', 'staple', 'g', 112, 2.6, 23, 0.9, V),
    F('st-oats', '燕麦片（干）', 'staple', 'g', 380, 13, 67, 6.7, V, true),
    F('st-bread', '全麦面包', 'staple', 'g', 246, 9, 41, 3.4, V, true),
    F('st-sweetpotato', '红薯（蒸）', 'staple', 'g', 90, 2, 21, 0.2, V, true),
    F('st-potato', '土豆（蒸）', 'staple', 'g', 81, 2, 17.8, 0.2, V),
    F('st-corn', '玉米（煮）', 'staple', 'g', 112, 4, 22.8, 1.2, V, true),
    F('st-millet', '小米粥', 'staple', 'g', 46, 1.4, 8.4, 0.7, V, true),
    F('st-noodle', '面条（煮）', 'staple', 'g', 110, 3.6, 22, 0.4, V),
    F('st-buckwheat', '荞麦面（煮）', 'staple', 'g', 99, 5.1, 21.4, 0.1, V),
    F('st-mantou', '馒头', 'staple', 'g', 223, 7, 47, 1.1, V),
    F('st-pasta', '意大利面（煮）', 'staple', 'g', 131, 5, 25, 1.1, V),
    F('st-quinoa', '藜麦（熟）', 'staple', 'g', 120, 4.4, 21.3, 1.9, V),

    /* ---------------- 蛋白质 ---------------- */
    F('pr-chicken', '鸡胸肉', 'protein', 'g', 133, 24.6, 0.6, 2.5, [], true),
    F('pr-chickenthigh', '鸡腿肉（去皮）', 'protein', 'g', 146, 20, 0, 7.2, []),
    F('pr-egg', '鸡蛋', 'protein', 'g', 144, 13.3, 2.8, 8.8, LO, true),
    F('pr-beef', '牛里脊', 'protein', 'g', 107, 22.2, 2.4, 0.9, ['beef']),
    F('pr-beefshank', '卤牛腱', 'protein', 'g', 150, 25, 1, 5, ['beef']),
    F('pr-pork', '猪里脊', 'protein', 'g', 155, 20.2, 0.7, 7.9, ['pork']),
    F('pr-shrimp', '虾仁', 'protein', 'g', 93, 18.6, 2.8, 0.8, ['seafood']),
    F('pr-salmon', '三文鱼', 'protein', 'g', 139, 17.2, 0, 7.8, ['seafood']),
    F('pr-bass', '鲈鱼', 'protein', 'g', 105, 18.6, 0, 3.4, ['seafood']),
    F('pr-tuna', '金枪鱼（水浸）', 'protein', 'g', 116, 25.5, 0, 0.8, ['seafood']),
    F('pr-tofu', '北豆腐', 'protein', 'g', 116, 12.2, 3.8, 6.7, V, true),
    F('pr-tofusilk', '南豆腐', 'protein', 'g', 87, 6.2, 3.9, 5.8, V),
    F('pr-tofudry', '豆干', 'protein', 'g', 140, 16.2, 4.5, 7.2, V),
    F('pr-edamame', '毛豆', 'protein', 'g', 131, 13.1, 10.5, 5, V),
    F('pr-greekyogurt', '无糖希腊酸奶', 'protein', 'g', 59, 10, 3.6, 0.4, LO, true),
    F('pr-milk', '低脂牛奶', 'protein', 'ml', 43, 3.4, 5, 1, LO, true),
    F('pr-soymilk', '无糖豆浆', 'protein', 'ml', 31, 3, 1.2, 1.6, V, true),
    F('pr-whey', '乳清蛋白粉', 'protein', 'g', 380, 80, 8, 4, LO, true),
    F('pr-tempeh', '天贝', 'protein', 'g', 193, 19, 9, 11, V),

    /* ---------------- 蔬菜 ---------------- */
    F('vg-broccoli', '西兰花', 'veg', 'g', 34, 2.8, 6.6, 0.4, V),
    F('vg-spinach', '菠菜', 'veg', 'g', 28, 2.6, 4.5, 0.3, V),
    F('vg-lettuce', '生菜', 'veg', 'g', 15, 1.4, 2.9, 0.2, V),
    F('vg-tomato', '番茄', 'veg', 'g', 20, 0.9, 4, 0.2, V),
    F('vg-cucumber', '黄瓜', 'veg', 'g', 16, 0.8, 2.9, 0.2, V),
    F('vg-carrot', '胡萝卜', 'veg', 'g', 39, 1, 8.8, 0.2, V),
    F('vg-pepper', '青椒', 'veg', 'g', 22, 1, 5.4, 0.2, V),
    F('vg-asparagus', '芦笋', 'veg', 'g', 22, 2.4, 4.1, 0.1, V),
    F('vg-mushroom', '蘑菇', 'veg', 'g', 24, 2.7, 4.1, 0.1, V),
    F('vg-cabbage', '白菜', 'veg', 'g', 17, 1.5, 3.2, 0.1, V),
    F('vg-okra', '秋葵', 'veg', 'g', 33, 1.9, 7.5, 0.2, V),
    F('vg-bean', '豆角', 'veg', 'g', 30, 2.5, 5.7, 0.2, V),
    F('vg-kimchi', '韩式泡菜', 'veg', 'g', 24, 1.7, 4, 0.5, V.concat(['spicy'])),

    /* ---------------- 水果 ---------------- */
    F('fr-apple', '苹果', 'fruit', 'g', 53, 0.3, 13.1, 0.2, V),
    F('fr-banana', '香蕉', 'fruit', 'g', 93, 1.4, 22, 0.2, V),
    F('fr-blueberry', '蓝莓', 'fruit', 'g', 57, 0.7, 14, 0.3, V),
    F('fr-orange', '橙子', 'fruit', 'g', 48, 0.8, 11.1, 0.2, V),
    F('fr-kiwi', '猕猴桃', 'fruit', 'g', 61, 0.8, 14.5, 0.6, V),
    F('fr-watermelon', '西瓜', 'fruit', 'g', 31, 0.6, 7.9, 0.1, V),
    F('fr-strawberry', '草莓', 'fruit', 'g', 32, 1, 7.1, 0.2, V),
    F('fr-grape', '葡萄', 'fruit', 'g', 45, 0.5, 10.3, 0.2, V),

    /* ---------------- 乳制品 ---------------- */
    F('dy-yogurt', '无糖酸奶', 'dairy', 'g', 59, 3.2, 5, 3, LO.concat(['dairy']), true),
    F('dy-cheese', '切达奶酪', 'dairy', 'g', 403, 25, 1.3, 33, LO.concat(['dairy'])),

    /* ---------------- 坚果 ---------------- */
    F('nt-almond', '杏仁', 'nut', 'g', 578, 21, 22, 50, V.concat(['nut'])),
    F('nt-walnut', '核桃', 'nut', 'g', 654, 15, 14, 65, V.concat(['nut'])),
    F('nt-cashew', '腰果', 'nut', 'g', 553, 18, 30, 44, V.concat(['nut'])),
    F('nt-peanut', '花生', 'nut', 'g', 567, 26, 16, 49, V.concat(['nut'])),
    F('nt-pumpkin', '南瓜籽', 'nut', 'g', 559, 30, 11, 49, V.concat(['nut'])),
    F('nt-flax', '亚麻籽', 'nut', 'g', 534, 18, 29, 42, V.concat(['nut'])),
    F('nt-peanutbutter', '无糖花生酱', 'nut', 'g', 588, 25, 20, 50, V.concat(['nut'])),

    /* ---------------- 加餐 / 其他 ---------------- */
    F('ex-darkchoco', '黑巧克力（70%）', 'extra', 'g', 598, 7.8, 46, 43, V),
    F('ex-bar', '蛋白棒', 'extra', 'g', 350, 30, 40, 8, LO.concat(['dairy'])),
    F('ex-cracker', '全麦饼干', 'extra', 'g', 430, 9, 66, 14, V),
    F('ex-honey', '蜂蜜', 'extra', 'g', 321, 0.4, 75, 0, V),
    F('ex-oliveoil', '橄榄油', 'extra', 'g', 899, 0, 0, 100, V)
  ];

  var GOAL_FACTOR = { fat_loss: 0.80, muscle_gain: 1.12, recomp: 0.95, strength: 1.05 };
  var PROTEIN_PER_KG = { fat_loss: 1.9, muscle_gain: 1.7, recomp: 1.8, strength: 1.7 };
  var FAT_RATIO = { fat_loss: 0.25, muscle_gain: 0.25, recomp: 0.27, strength: 0.28 };

  /* 主蛋白来源要求蛋白密度够高，否则份量再大也补不上目标 */
  function isDense(food) { return food.p >= 12; }

  var MEAL_SPLITS = {
    3: [
      { key: 'breakfast', name: '早餐', share: 0.30, main: true },
      { key: 'lunch', name: '午餐', share: 0.40, main: true },
      { key: 'dinner', name: '晚餐', share: 0.30, main: true }
    ],
    5: [
      { key: 'breakfast', name: '早餐', share: 0.25, main: true },
      { key: 'snack1', name: '上午加餐', share: 0.10, main: false },
      { key: 'lunch', name: '午餐', share: 0.30, main: true },
      { key: 'snack2', name: '下午加餐', share: 0.10, main: false },
      { key: 'dinner', name: '晚餐', share: 0.25, main: true }
    ]
  };

  /* ------------------------------------------------------------------ 基础换算 */
  function bmr(profile) {
    var base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
    return profile.sex === 'female' ? base - 161 : base + 5;
  }
  function activityFactor(daysPerWeek) {
    if (daysPerWeek <= 2) return 1.375;
    if (daysPerWeek <= 4) return 1.55;
    if (daysPerWeek <= 6) return 1.725;
    return 1.9;
  }
  function tdee(profile) {
    return bmr(profile) * activityFactor(profile.daysPerWeek);
  }
  /* 训练日 +8%、休息日 −6%（相对差约 15%）；每周训练 ≥6 天时不做波动 */
  function targetCalories(profile, isTrainingDay) {
    var b = bmr(profile);
    var base = tdee(profile) * GOAL_FACTOR[profile.goal];
    if (profile.daysPerWeek >= 6) return { kcal: Math.round(base), wavy: false };
    var wavy = base * (isTrainingDay ? 1.08 : 0.94);
    /* 下限保护要放在波动之后，保证休息日也不会低于基础代谢的 1.1 倍 */
    return { kcal: Math.round(Math.max(wavy, b * 1.10)), wavy: true };
  }
  /* BMI ≥ 30 时改用矫正体重，避免蛋白目标失真 */
  function proteinWeight(profile) {
    var m = profile.heightCm / 100;
    var val = profile.weightKg / (m * m);
    if (val < 30) return profile.weightKg;
    var ideal = 22 * m * m;
    return ideal + 0.25 * (profile.weightKg - ideal);
  }
  function macroTarget(profile, kcal) {
    var pw = proteinWeight(profile);
    var protein = PROTEIN_PER_KG[profile.goal] * pw;
    var fat = kcal * FAT_RATIO[profile.goal] / 9;
    var carb = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
    return { kcal: kcal, protein: protein, fat: fat, carb: carb };
  }

  /* ------------------------------------------------------------------ 选材 */
  function allowed(food, profile) {
    if (profile.dietPattern === 'vegetarian' && food.tags.indexOf('vegetarian') < 0) return false;
    if (profile.dietPattern === 'lacto_ovo' && food.tags.indexOf('lacto_ovo') < 0) return false;
    for (var i = 0; i < (profile.exclusions || []).length; i++) {
      if (food.tags.indexOf(profile.exclusions[i]) >= 0) return false;
    }
    return true;
  }
  function pool(cat, profile, breakfastOnly) {
    return FOODS.filter(function (f) {
      if (f.cat !== cat) return false;
      if (breakfastOnly && !f.bf) return false;
      return allowed(f, profile);
    });
  }
  function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h;
  }
  function pick(list, seed) {
    if (!list.length) return null;
    return list[((seed % list.length) + list.length) % list.length];
  }
  function roundStep(x, step) { return Math.round(x / step) * step; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function nutrients(food, grams) {
    var k = grams / 100;
    return { kcal: food.kcal * k, p: food.p * k, c: food.c * k, f: food.f * k };
  }
  function item(food, grams) {
    var n = nutrients(food, grams);
    return { id: food.id, name: food.name, grams: Math.round(grams), unit: food.unit,
      kcal: Math.round(n.kcal), p: +n.p.toFixed(1), c: +n.c.toFixed(1), f: +n.f.toFixed(1) };
  }
  function sumItems(items) {
    return items.reduce(function (a, it) {
      a.kcal += it.kcal; a.p += it.p; a.c += it.c; a.f += it.f; return a;
    }, { kcal: 0, p: 0, c: 0, f: 0 });
  }
  function adj(grams, food, deltaKcal) {
    if (!food.kcal) return grams;
    return grams + deltaKcal / (food.kcal / 100);
  }

  /* ------------------------------------------------------------------ 单餐配餐 */
  function buildMainMeal(split, plan, profile, seedBase) {
    var targetK = plan.kcal * split.share;
    /* 蛋白只摊到正餐：加餐（水果/坚果/乳制品）天然补不了多少蛋白 */
    var targetP = plan.protein * (split.share / plan.mainShare);
    var bf = split.key === 'breakfast';

    /* 高热量餐次必须选热量密度够的主食，否则 400g 上限也撑不到目标 */
    var staplePool = pool('staple', profile, bf).filter(function (f) {
      return targetK < 550 || f.kcal >= 100;
    });
    if (!staplePool.length) staplePool = pool('staple', profile, false);
    var staple = pick(staplePool, seedBase);
    /* 只用完整食物做正餐蛋白来源，不推荐蛋白粉当正餐 */
    var proteinPool = pool('protein', profile, bf).filter(function (f) {
      return isDense(f) && f.id !== 'pr-whey';
    });
    var protein = pick(proteinPool, seedBase + 7);
    var veg = pick(pool('veg', profile, false), seedBase + 13);
    if (!staple) staple = pick(pool('staple', profile, false), seedBase);
    if (!protein) protein = pick(pool('protein', profile, false).filter(function (f) { return isDense(f) && f.id !== 'pr-whey'; }), seedBase + 7);
    if (!veg) veg = pick(pool('veg', profile, false), seedBase + 13);

    /* 第四项为“热量调节项”：优先用纯油脂（不含蛋白），避免补热量时把蛋白一起顶上去 */
    var oil = FOODS.filter(function (f) { return f.id === 'ex-oliveoil' && allowed(f, profile); });
    var fatPool = oil.length ? oil : pool('nut', profile, false);
    var fat = pick(fatPool, seedBase + 23);

    var sG = clamp(roundStep(targetK * 0.40 / (staple.kcal / 100), 10), 30, 400);
    var vG = 180;
    var pG = clamp(roundStep(Math.max(targetP - nutrients(staple, sG).p - nutrients(veg, vG).p, 0) / (protein.p / 100), 10), 60, 400);
    /* 蛋白食材的份量上限：不超过本餐蛋白目标的 1.1 倍，避免整体超标 */
    var pCap = clamp(roundStep(targetP * 1.2 / (protein.p / 100), 10), 60, 400);
    if (pG > pCap) pG = pCap;
    var fG = 0;

    var items = [item(staple, sG), item(protein, pG), item(veg, vG)];
    /* 先按脂肪目标预置一部分油脂，避免蛋白被迫承担补热量的角色 */
    var targetF = plan.fat * split.share;
    if (fat && targetF > 0) {
      fG = clamp(roundStep(targetF * 0.6 / (fat.kcal / 100), 5), 0, 45);
      if (fG > 0) items.push(item(fat, fG));
    }
    for (var i = 0; i < 8; i++) {
      var t = sumItems(items);
      /* 1) 优先把蛋白补足 */
      var dP = targetP - t.p;
      if (dP > targetP * 0.05 && pG < pCap) {
        pG = clamp(roundStep(pG + dP / (protein.p / 100), 10), 60, pCap);
        items[1] = item(protein, pG);
        continue;
      }
      var dK = targetK - t.kcal;
      if (Math.abs(dK) <= targetK * 0.03) break;
      var step = dK > 0 ? 1 : -1;
      var moved = false;
      /* 2) 用油/坚果微调热量（密度最高，先动它） */
      if (fat) {
        var capF = dK > 0 ? 60 : 0;
        /* 用 1g 粒度：5g 油就是 45 kcal，比 3% 容差还粗，会造成来回振荡 */
        var nextF = clamp(Math.round(fG + dK / (fat.kcal / 100)), 0, capF);
        if (nextF !== fG) {
          fG = nextF;
          if (fG > 0) {
            var fi = items.findIndex(function (x) { return x.id === fat.id; });
            if (fi >= 0) items[fi] = item(fat, fG); else items.push(item(fat, fG));
          } else {
            items = items.filter(function (x) { return x.id !== fat.id; });
          }
          moved = true;
        }
      }
      if (!moved) {
        /* 3) 再调主食，最后调蛋白 */
        if (step > 0 && sG < 400) {
          sG = clamp(roundStep(adj(sG, staple, dK), 10), 30, 400); items[0] = item(staple, sG);
        } else if (step < 0 && sG > 30) {
          sG = clamp(roundStep(adj(sG, staple, dK), 10), 30, 400); items[0] = item(staple, sG);
        } else if (step > 0 && pG < pCap) {
          pG = clamp(roundStep(adj(pG, protein, dK), 10), 60, pCap); items[1] = item(protein, pG);
        } else if (step < 0 && pG > 60) {
          pG = clamp(roundStep(adj(pG, protein, dK), 10), 60, 400); items[1] = item(protein, pG);
        } else if (step < 0 && vG > 100) {
          vG = clamp(roundStep(adj(vG, veg, dK), 10), 100, 250); items[2] = item(veg, vG);
        } else break;
      }
    }
    /* 收尾：蛋白必须达标（热量从油脂项里扣回来，尽量不破坏总量） */
    var t2 = sumItems(items);
    var needP = targetP * 0.95 - t2.p;
    if (needP > 0 && protein.p > 0) {
      var oldP = pG;
      pG = clamp(roundStep(oldP + needP / (protein.p / 100), 10), 60, 400);
      var extraK = (pG - oldP) * protein.kcal / 100;
      items[1] = item(protein, pG);
      if (fat && fG > 0 && extraK > 0) {
        var cut = Math.min(fG, Math.round(extraK / (fat.kcal / 100)));
        if (cut > 0) {
          fG -= cut;
          var fi2 = items.findIndex(function (x) { return x.id === fat.id; });
          if (fi2 >= 0) { if (fG > 0) items[fi2] = item(fat, fG); else items.splice(fi2, 1); }
        }
      }
    }
    var total = sumItems(items);
    return { key: split.key, name: split.name, main: true, items: items,
      kcal: Math.round(total.kcal), protein: +total.p.toFixed(1),
      carb: +total.c.toFixed(1), fat: +total.f.toFixed(1) };
  }

  function buildSnack(split, plan, profile, seedBase) {
    var targetK = plan.kcal * split.share;
    var fruit = pick(pool('fruit', profile, false), seedBase);
    var extraPool = pool('nut', profile, false).concat(pool('dairy', profile, false));
    var extra = pick(extraPool, seedBase + 5);
    if (!extra) extra = pick(pool('extra', profile, false), seedBase + 5);
    var items = [];
    if (fruit) {
      var fG = clamp(roundStep(targetK * 0.6 / (fruit.kcal / 100), 10), 80, 320);
      items.push(item(fruit, fG));
    }
    if (extra) {
      var eG = clamp(roundStep(targetK * 0.4 / (extra.kcal / 100), 5), 15, 250);
      items.push(item(extra, eG));
    }
    if (!items.length) return { key: split.key, name: split.name, main: false, items: [],
      kcal: 0, protein: 0, carb: 0, fat: 0 };
    var t = sumItems(items);
    if (fruit) {
      var dK = targetK - t.kcal;
      var g2 = clamp(roundStep(adj(items[0].grams, fruit, dK), 10), 80, 320);
      items[0] = item(fruit, g2);
    }
    var total = sumItems(items);
    return { key: split.key, name: split.name, main: false, items: items,
      kcal: Math.round(total.kcal), protein: +total.p.toFixed(1),
      carb: +total.c.toFixed(1), fat: +total.f.toFixed(1) };
  }

  /* ------------------------------------------------------------------ 每日方案 */
  function dailyPlan(profileRaw, dateISO, isTrainingDay, salt) {
    var profile = globalThis.PlanEngine.normalizeProfile(profileRaw);
    var tc = targetCalories(profile, isTrainingDay);
    var macros = macroTarget(profile, tc.kcal);
    var splits = MEAL_SPLITS[profile.mealsPerDay] || MEAL_SPLITS[3];
    var macrosForMeals = {
      kcal: macros.kcal, protein: macros.protein, fat: macros.fat, carb: macros.carb,
      mainShare: splits.reduce(function (a, s) { return a + (s.main ? s.share : 0); }, 0)
    };
    var seedBase = hashStr([
      profile.heightCm, profile.weightKg, profile.age, profile.sex, profile.goal,
      profile.dietPattern, (profile.exclusions || []).join('-'), profile.mealsPerDay,
      dateISO, salt || ''
    ].join('|'));

    var meals = splits.map(function (sp, i) {
      return sp.main
        ? buildMainMeal(sp, macrosForMeals, profile, seedBase + i * 31)
        : buildSnack(sp, macrosForMeals, profile, seedBase + i * 31);
    });

    /* 日级收尾：个别选材组合单餐已到边界，这里按整日偏差再微调一轮正餐主食 */
    function recompute(meal) {
      var s = sumItems(meal.items);
      meal.kcal = Math.round(s.kcal);
      meal.protein = +s.p.toFixed(1);
      meal.carb = +s.c.toFixed(1);
      meal.fat = +s.f.toFixed(1);
    }
    function dayKcal() {
      return meals.reduce(function (a, m) { return a + m.kcal; }, 0);
    }
    function byId(id) {
      for (var i = 0; i < FOODS.length; i++) if (FOODS[i].id === id) return FOODS[i];
      return null;
    }
    function bounds(food, idx) {
      if (food.id === 'ex-oliveoil') return [0, 45];
      if (food.cat === 'nut') return [0, 60];
      if (food.cat === 'veg') return [100, 250];
      if (food.cat === 'staple' && idx === 0) return [30, 450];
      if (food.cat === 'protein') return [60, 420];
      return [Math.min(20, food.unit === 'ml' ? 100 : 20), 400];
    }
    /* 按热量密度从高到低尝试：油脂改动最小，最容易把总量拉回目标 */
    /* allowProtein=false 时跳过蛋白食材：补热量优先用主食与油脂，避免把蛋白顶上去 */
    function adjustMeal(m, deltaKcal, allowProtein) {
      var order = m.items.map(function (x, i) { return i; }).sort(function (a, b) {
        return (m.items[b].kcal / Math.max(1, m.items[b].grams)) - (m.items[a].kcal / Math.max(1, m.items[a].grams));
      });
      for (var k = 0; k < order.length; k++) {
        var i = order[k], it = m.items[i], food = byId(it.id);
        if (!food || !food.kcal) continue;
        if (!allowProtein && food.cat === 'protein') continue;
        var bd = bounds(food, i);
        var g = clamp(roundStep(it.grams + deltaKcal / (food.kcal / 100), 5), bd[0], bd[1]);
        if (g !== it.grams) { m.items[i] = item(food, g); recompute(m); return true; }
      }
      return false;
    }
    for (var pass = 0; pass < 6; pass++) {
      var diff = tc.kcal - dayKcal();
      if (Math.abs(diff) <= tc.kcal * 0.04) break;
      var mains2 = meals.filter(function (m) { return m.main && m.items.length; });
      if (!mains2.length) break;
      var per = diff / mains2.length;
      var moved = false;
      for (var mi = 0; mi < mains2.length; mi++) {
        if (adjustMeal(mains2[mi], per, false)) moved = true;
      }
      if (!moved) {
        for (var mj = 0; mj < mains2.length; mj++) {
          if (adjustMeal(mains2[mj], per, true)) moved = true;
        }
      }
      if (!moved) break;
    }

    var totals = sumItems(meals.reduce(function (a, m) { return a.concat(m.items); }, []));
    var notes = [];
    if (tc.wavy) notes.push(isTrainingDay ? '今天是训练日，热量比休息日高约 15%' : '今天是休息日，热量按恢复需求下调');
    notes.push('蛋白质目标 ' + Math.round(macros.protein) + ' g（按 ' +
      (proteinWeight(profile) === profile.weightKg ? '实际体重' : '矫正体重') + ' ' + proteinWeight(profile).toFixed(1) + ' kg 计算）');
    if (profile.dietPattern !== 'normal') notes.push('已按「' + globalThis.PlanEngine.DIET_PATTERNS[profile.dietPattern] + '」筛选食材');
    if ((profile.exclusions || []).length) {
      notes.push('已避开：' + profile.exclusions.map(function (t) { return globalThis.PlanEngine.DIET_TAGS_CN[t] || t; }).join('、'));
    }
    if (profile.exclusions && profile.exclusions.indexOf('spicy') >= 0) {
      notes.push('辛辣忌口只过滤标注为辛辣的食材，调味请自行控制辣椒、花椒等');
    }

    return {
      date: dateISO, isTrainingDay: !!isTrainingDay, salt: salt || '',
      bmr: Math.round(bmr(profile)),
      tdee: Math.round(tdee(profile)),
      kcal: tc.kcal,
      target: { kcal: tc.kcal, protein: Math.round(macros.protein),
        carb: Math.round(macros.carb), fat: Math.round(macros.fat) },
      meals: meals,
      totals: { kcal: Math.round(totals.kcal), protein: +totals.p.toFixed(1),
        carb: +totals.c.toFixed(1), fat: +totals.f.toFixed(1) },
      accuracy: +(Math.abs(totals.kcal - tc.kcal) / tc.kcal).toFixed(4),
      notes: notes
    };
  }

  var DietEngine = {
    FOODS: FOODS, MEAL_SPLITS: MEAL_SPLITS,
    GOAL_FACTOR: GOAL_FACTOR, PROTEIN_PER_KG: PROTEIN_PER_KG, FAT_RATIO: FAT_RATIO,
    bmr: bmr, tdee: tdee, activityFactor: activityFactor, targetCalories: targetCalories,
    proteinWeight: proteinWeight, macroTarget: macroTarget,
    allowed: allowed, dailyPlan: dailyPlan, hashStr: hashStr
  };
  if (typeof globalThis !== 'undefined') globalThis.DietEngine = DietEngine;
})();
