/* =========================================================================
   计划引擎 —— 纯函数实现，不依赖 DOM / localStorage，可被 Node 测试脚本直接加载。
   ========================================================================= */
(function () {
  'use strict';

  var BW = ['home_bodyweight', 'home_dumbbell', 'gym'];
  var DBV = ['home_dumbbell', 'gym'];

  var GOALS = {
    fat_loss:    { label: '减脂', reps: '12-15', rest: 45 },
    muscle_gain: { label: '增肌', reps: '8-12',  rest: 75 },
    recomp:      { label: '塑形', reps: '10-12', rest: 60 },
    strength:    { label: '增力', primary: { reps: '4-6', rest: 120 }, accessory: { reps: '8-10', rest: 90 } }
  };

  var EXPERIENCE = {
    beginner:     { label: '新手', tierCap: 1, loadScale: 0.85, sets: [2, 3, 3, 2] },
    intermediate: { label: '中级', tierCap: 2, loadScale: 1.00, sets: [3, 3, 4, 2] },
    advanced:     { label: '进阶', tierCap: 3, loadScale: 1.15, sets: [4, 4, 5, 3] }
  };

  var VENUES = {
    home_bodyweight: '居家徒手',
    home_dumbbell:   '居家哑铃',
    gym:             '健身房'
  };

  /* 推荐预设：仅用于「推荐排布」快捷按钮与旧数据迁移；实际排期以 profile.trainingWeekdays 为准 */
  var WEEKDAY_PRESETS = {
    1: [2],
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6]
  };

  var WEEKDAY_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  var WEEKDAY_SHORT = ['一', '二', '三', '四', '五', '六', '日'];

  var DB_SIZES = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22.5, 25, 27.5, 30, 32.5, 35];

  var PATTERN_LABEL = {
    squat: '深蹲类', hinge: '髋铰链类', lunge: '弓步类',
    horizontal_push: '水平推', vertical_push: '垂直推',
    horizontal_pull: '水平拉', vertical_pull: '垂直拉',
    glute: '臀部孤立', core: '核心', calf: '小腿',
    biceps: '肱二头肌', triceps: '肱三头肌', lateral_raise: '肩部孤立',
    cardio: '有氧收尾'
  };

  var ISOLATION = { biceps: 1, triceps: 1, lateral_raise: 1, calf: 1, glute: 1, core: 1 };

  var PATTERN_FALLBACK = {
    vertical_pull: 'horizontal_pull',
    lateral_raise: 'vertical_push',
    biceps: 'horizontal_pull',
    triceps: 'horizontal_push'
  };

  /* ------------------------------------------------------------------ 伤病：部位与动作的对应关系 */
  var JOINTS = ['neck', 'shoulder', 'elbow', 'wrist', 'lower_back', 'hip', 'knee', 'ankle_foot'];
  var DIET_TAGS = ['seafood', 'nut', 'dairy', 'beef', 'pork', 'spicy'];
  var DIET_TAGS_CN = { seafood: '海鲜', nut: '坚果', dairy: '乳制品', beef: '牛肉', pork: '猪肉', spicy: '辛辣' };
  var DIET_PATTERNS = { normal: '普通', vegetarian: '纯素', lacto_ovo: '蛋奶素' };
  var JOINT_CN = {
    neck: '颈', shoulder: '肩', elbow: '肘', wrist: '腕',
    lower_back: '腰', hip: '髋', knee: '膝', ankle_foot: '踝足'
  };
  /* 每个动作模式默认涉及的部位 */
  var PATTERN_JOINTS = {
    squat: ['knee', 'hip', 'lower_back'],
    hinge: ['lower_back', 'hip', 'knee'],
    lunge: ['knee', 'hip', 'ankle_foot'],
    horizontal_push: ['shoulder', 'elbow', 'wrist'],
    vertical_push: ['shoulder', 'elbow', 'wrist', 'lower_back'],
    horizontal_pull: ['shoulder', 'elbow', 'lower_back'],
    vertical_pull: ['shoulder', 'elbow', 'wrist'],
    glute: ['hip', 'knee'],
    core: ['lower_back', 'neck'],
    calf: ['ankle_foot'],
    biceps: ['elbow', 'wrist'],
    triceps: ['elbow', 'shoulder'],
    lateral_raise: ['shoulder'],
    cardio: ['knee', 'ankle_foot']
  };
  /* 条目级覆盖：比模式默认更精确的部位 */
  var EXERCISE_JOINT_OVERRIDE = {
    'sq-wall': ['knee', 'hip'],
    'sq-single': ['knee', 'hip', 'ankle_foot'],
    'sq-bulgarian': ['knee', 'hip'],
    'sq-legpress': ['knee', 'hip'],
    'hg-bridge': ['hip', 'knee'],
    'hg-single-bridge': ['hip', 'knee'],
    'hg-legcurl': ['knee'],
    'ln-db': ['knee', 'hip'],
    'ln-bar': ['knee', 'hip', 'lower_back'],
    'ln-walking': ['knee', 'hip', 'ankle_foot'],
    'hp-incline': ['shoulder', 'elbow', 'wrist'],
    'hp-knee': ['shoulder', 'elbow', 'wrist'],
    'hp-pushup': ['shoulder', 'elbow', 'wrist', 'lower_back'],
    'hp-decline': ['shoulder', 'elbow', 'wrist', 'lower_back'],
    'vp-pike-knee': ['shoulder', 'elbow', 'wrist'],
    'vp-pike': ['shoulder', 'elbow', 'wrist', 'lower_back'],
    'vp-wall': ['shoulder', 'elbow', 'wrist', 'neck'],
    'vp-bar': ['shoulder', 'elbow', 'wrist', 'lower_back'],
    'vr-pullup': ['shoulder', 'elbow', 'wrist'],
    'vr-assisted': ['shoulder', 'elbow', 'wrist'],
    'vr-lat': ['shoulder', 'elbow', 'wrist'],
    'hr-inverted': ['shoulder', 'elbow', 'lower_back'],
    'gl-clam': ['hip'],
    'gl-donkey': ['hip', 'wrist'],
    'gl-abduct': ['hip'],
    'co-plank': ['shoulder', 'wrist', 'lower_back'],
    'co-deadbug': ['lower_back'],
    'co-crunch': ['neck', 'lower_back'],
    'co-russian': ['lower_back', 'neck'],
    'co-hanging': ['shoulder', 'elbow', 'wrist', 'lower_back'],
    'cd-jack': ['knee', 'ankle_foot'],
    'cd-rope': ['knee', 'ankle_foot'],
    'cd-burpee': ['knee', 'ankle_foot', 'wrist', 'lower_back', 'shoulder']
  };
  /* 某模式因伤病被全部剔除时的安全建议 */
  var PATTERN_SAFE_ADVICE = {
    squat: '先做靠墙静蹲或臀桥维持下肢刺激，避免负重下蹲；疼痛缓解后再从箱式深蹲逐步恢复。',
    hinge: '改用臀桥、蚌式开合等髋主导的低负荷动作，暂时不做硬拉与早安式体前屈。',
    lunge: '改为双腿对称的臀桥或靠墙静蹲，避免单腿承重带来的额外剪切力。',
    horizontal_push: '先做肩胛稳定与俯卧 Y 提拉，避免卧推与俯卧撑；必要时用弹力带做小幅度推。',
    vertical_push: '暂停过顶推举，改为低位的前平举或肩胛下沉练习，避免手臂举过头顶。',
    horizontal_pull: '改为坐姿挺胸的肩胛后收练习，或先做俯卧超人式，避免负重划船。',
    vertical_pull: '暂停下拉与引体类动作，改为弹力带辅助的肩胛下沉，避免手臂高举过头。',
    glute: '先做静态臀桥保持（不发力顶峰收缩），必要时改为侧卧髋外展。',
    core: '改为死虫式或侧卧支撑等对腰椎压力更小的核心练习，避免卷腹与转体。',
    calf: '暂停提踵类动作，改为踝关节绕环与坐姿勾脚，等疼痛消退再负重。',
    biceps: '暂停弯举类动作，改为等长收缩（屈肘 90 度保持 10 秒），不加重。',
    triceps: '暂停下压与臂屈伸，改为轻阻力的等长伸展练习。',
    lateral_raise: '暂停负重侧平举，改为徒手慢速小幅度的肩部绕环。',
    cardio: '改为快走或原地踏步等零冲击形式，避免跳跃与跑动。'
  };

  function jointsOf(ex) {
    return EXERCISE_JOINT_OVERRIDE[ex.id] || PATTERN_JOINTS[ex.pattern] || [];
  }
  function jointLabel(list) {
    var arr = list || [];
    return arr.map(function (j) { return JOINT_CN[j] || j; }).join('、');
  }

  function E(id, pattern, name, muscle, tier, venues, o) {
    var base = {
      id: id, pattern: pattern, name: name, muscle: muscle, tier: tier, venues: venues,
      /* 器材等级：三场地可用 = 徒手；哑铃/健身房两场地 = 哑铃；仅健身房 = 器械 */
      equip: venues.length === 3 ? 'bw' : (venues.length === 2 ? 'db' : 'gym'),
      weighted: false, ratio: 0, isJump: false, isTime: false, timeReps: '', perHand: false,
      loadType: null, minLoad: 0, cues: '', note: ''
    };
    if (o) { for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) base[k] = o[k]; } }
    return base;
  }

  var EXERCISES = [
    /* ---------------- 深蹲类 ---------------- */
    E('sq-bw', 'squat', '自重深蹲', '股四头肌 · 臀大肌', 1, BW, {
      cues: '双脚与肩同宽、脚尖略外展，屈髋屈膝下蹲至大腿接近平行，膝盖与脚尖同向，脚跟发力起身。' }),
    E('sq-box', 'squat', '箱式深蹲', '股四头肌 · 臀大肌', 1, BW, {
      cues: '身后放椅子或箱子，臀部向后坐至轻触箱面，保持小腿接近垂直再站起；控制不好深蹲深度的人优先用它。' }),
    E('sq-wall', 'squat', '靠墙静蹲', '股四头肌', 1, BW, {
      isTime: true, timeReps: '45 秒',
      cues: '背贴墙、双脚前移一步，屈膝下蹲至大腿与地面约 45–60 度，膝盖不超过脚尖，均匀呼吸。' }),
    E('sq-single', 'squat', '单腿箱式深蹲', '股四头肌 · 臀大肌', 3, BW, {
      cues: '单脚站立、另一腿前伸，臀部向后坐至箱面再单腿站起，全程保持膝盖稳定不内扣。' }),
    E('sq-goblet', 'squat', '哑铃高脚杯深蹲', '股四头肌 · 臀大肌', 1, DBV, {
      weighted: true, ratio: 0.20, loadType: 'dumbbell',
      cues: '双手捧一只哑铃于胸前，挺胸下蹲至大腿平行，肘部落在两腿内侧，起身时呼气。' }),
    E('sq-sumo', 'squat', '哑铃相扑深蹲', '臀大肌 · 内收肌', 2, DBV, {
      weighted: true, ratio: 0.22, loadType: 'dumbbell',
      cues: '双脚比肩宽、脚尖外展约 30 度，双手持哑铃置于两腿之间，垂直下蹲，起身时臀部收紧。' }),
    E('sq-bulgarian', 'squat', '哑铃保加利亚分腿蹲', '股四头肌 · 臀大肌', 3, DBV, {
      weighted: true, ratio: 0.12, perHand: true, loadType: 'dumbbell',
      cues: '后脚搭在椅面上、前脚向前一步，重心垂直下沉至前腿大腿接近平行，膝盖对准脚尖。' }),
    E('sq-legpress', 'squat', '腿举', '股四头肌 · 臀大肌', 1, ['gym'], {
      weighted: true, ratio: 0.90, loadType: 'machine', minLoad: 10,
      cues: '调整座椅使膝盖弯曲约 90 度，双脚与肩同宽踩实，推到膝盖接近伸直但不锁死，缓慢回落。' }),
    E('sq-backsquat', 'squat', '杠铃后蹲', '股四头肌 · 臀大肌 · 核心', 2, ['gym'], {
      weighted: true, ratio: 0.45, loadType: 'barbell', minLoad: 20,
      cues: '杠铃置于斜方肌上，挺胸收腹，屈髋屈膝下蹲至大腿平行，躯干保持直立，脚跟发力起身。' }),

    /* ---------------- 髋铰链类 ---------------- */
    E('hg-bridge', 'hinge', '臀桥', '臀大肌 · 腘绳肌', 1, BW, {
      cues: '仰卧屈膝、脚跟距臀部约一掌，收紧臀部把髋顶起至肩-髋-膝成直线，顶点停 1 秒。' }),
    E('hg-single-bridge', 'hinge', '单腿臀桥', '臀大肌 · 腘绳肌', 2, BW, {
      cues: '一腿屈膝踩地、另一腿伸直抬起，单侧顶髋至躯干成直线，避免腰部代偿。' }),
    E('hg-goodmorning', 'hinge', '徒手早安式体前屈', '腘绳肌 · 臀大肌 · 下背', 1, BW, {
      cues: '双手抱头或交叉胸前，微屈膝，髋部向后推使躯干前倾至接近水平，背部保持中立再起身。' }),
    E('hg-rdl-db', 'hinge', '哑铃罗马尼亚硬拉', '腘绳肌 · 臀大肌', 2, DBV, {
      weighted: true, ratio: 0.25, perHand: true, loadType: 'dumbbell',
      cues: '双手持哑铃垂于体前，微屈膝，髋向后推、躯干前倾，哑铃贴着腿下滑至小腿中段，臀腿发力站起。' }),
    E('hg-single-rdl', 'hinge', '哑铃单腿硬拉', '腘绳肌 · 臀大肌 · 平衡', 2, DBV, {
      weighted: true, ratio: 0.18, perHand: true, loadType: 'dumbbell',
      cues: '单脚支撑、另一腿向后延伸，髋部后推使躯干前倾，支撑侧臀腿发力回到直立。' }),
    E('hg-deadlift', 'hinge', '杠铃硬拉', '臀大肌 · 腘绳肌 · 背部', 3, ['gym'], {
      weighted: true, ratio: 0.60, loadType: 'barbell', minLoad: 20,
      cues: '杠铃贴近小腿，屈髋屈膝握杠，挺胸收腹，脚蹬地的同时伸髋伸膝站起，全程背部中立。' }),
    E('hg-rdl-bar', 'hinge', '杠铃罗马尼亚硬拉', '腘绳肌 · 臀大肌', 2, ['gym'], {
      weighted: true, ratio: 0.45, loadType: 'barbell', minLoad: 20,
      cues: '站直握杠、微屈膝，髋向后推使杠铃贴腿下降至膝下，感受腘绳肌拉伸后顶髋站起。' }),
    E('hg-legcurl', 'hinge', '器械俯卧腿弯举', '腘绳肌', 1, ['gym'], {
      weighted: true, ratio: 0.30, loadType: 'machine', minLoad: 5,
      cues: '俯卧于器械，脚踝勾住护垫，屈膝把重量拉向臀部，顶点停 1 秒后缓慢还原。' }),

    /* ---------------- 弓步类 ---------------- */
    E('ln-lunge', 'lunge', '原地弓步', '股四头肌 · 臀大肌', 1, BW, {
      cues: '一腿向前迈一大步，双膝弯曲至后膝接近地面，前膝对准脚尖，前脚发力回到站姿。' }),
    E('ln-reverse', 'lunge', '后撤步弓步', '股四头肌 · 臀大肌', 1, BW, {
      cues: '一腿向后撤一大步，身体垂直下沉，前腿发力把身体推回，对膝盖压力更小。' }),
    E('ln-walking', 'lunge', '行走弓步', '股四头肌 · 臀大肌', 2, BW, {
      cues: '交替向前迈步成弓步，躯干直立、核心收紧，每一步都控制下沉再起身。' }),
    E('ln-db', 'lunge', '哑铃弓步', '股四头肌 · 臀大肌', 2, DBV, {
      weighted: true, ratio: 0.14, perHand: true, loadType: 'dumbbell',
      cues: '双手持哑铃垂于体侧，向前或向后迈步成弓步，躯干保持直立，前脚发力返回。' }),
    E('ln-bar', 'lunge', '杠铃箭步蹲', '股四头肌 · 臀大肌', 3, ['gym'], {
      weighted: true, ratio: 0.22, loadType: 'barbell', minLoad: 20,
      cues: '杠铃置于斜方肌上，后撤步下蹲至后膝接近地面，前腿发力站起，核心全程收紧。' }),

    /* ---------------- 水平推 ---------------- */
    E('hp-incline', 'horizontal_push', '上斜俯卧撑', '胸大肌 · 肱三头肌', 1, BW, {
      cues: '双手撑在稳固的桌面或台阶上，身体成一条直线，屈肘下降至胸部接近支撑面再推起。' }),
    E('hp-knee', 'horizontal_push', '跪姿俯卧撑', '胸大肌 · 肱三头肌', 1, BW, {
      cues: '膝盖着地、双手略宽于肩，从头到膝成一条直线，屈肘下降至胸部接近地面再推起。' }),
    E('hp-pushup', 'horizontal_push', '标准俯卧撑', '胸大肌 · 肱三头肌 · 核心', 2, BW, {
      cues: '双手略宽于肩，身体成一条直线，屈肘下降至肘部约 90 度，推起时肩胛保持稳定。' }),
    E('hp-decline', 'horizontal_push', '下斜俯卧撑', '胸大肌上部 · 肱三头肌', 3, BW, {
      cues: '双脚垫高、双手撑地，身体成直线下降至胸部接近地面再推起，核心不塌腰。' }),
    E('hp-dbbench', 'horizontal_push', '哑铃卧推', '胸大肌 · 肱三头肌', 1, DBV, {
      weighted: true, ratio: 0.15, perHand: true, loadType: 'dumbbell',
      cues: '仰卧于地面或凳上，哑铃位于胸部两侧，向上推至手臂接近伸直，缓慢回落至肘部与地面平行。' }),
    E('hp-bench', 'horizontal_push', '杠铃卧推', '胸大肌 · 肱三头肌', 2, ['gym'], {
      weighted: true, ratio: 0.35, loadType: 'barbell', minLoad: 20,
      cues: '握距略宽于肩，肩胛后收下沉，杠铃下降至胸部中段轻触，沿弧线推起，双脚踩实。' }),
    E('hp-incline-db', 'horizontal_push', '哑铃上斜卧推', '胸大肌上部', 2, ['gym'], {
      weighted: true, ratio: 0.14, perHand: true, loadType: 'dumbbell',
      cues: '椅背调至 30–45 度，哑铃从胸部两侧推向上方，肘部约 45 度夹角，肩部不适时减小幅度。' }),
    E('hp-machine', 'horizontal_push', '坐姿推胸器械', '胸大肌', 1, ['gym'], {
      weighted: true, ratio: 0.40, loadType: 'machine', minLoad: 5,
      cues: '调整座椅使握把与胸部中段齐平，推至手臂接近伸直，缓慢回位并保持肩胛稳定。' }),

    /* ---------------- 垂直推 ---------------- */
    E('vp-pike-knee', 'vertical_push', '跪姿派克俯卧撑', '三角肌前束 · 肱三头肌', 1, BW, {
      cues: '跪姿、臀部抬高，双手撑地让躯干接近垂直，屈肘让头部向地面靠近再推起。' }),
    E('vp-pike', 'vertical_push', '派克俯卧撑', '三角肌前束 · 肱三头肌', 2, BW, {
      cues: '臀部高抬成倒 V 形、双手撑地，屈肘让头顶接近地面，再推起回到起始位置。' }),
    E('vp-wall', 'vertical_push', '靠墙倒立撑', '三角肌 · 肱三头肌', 3, BW, {
      cues: '面墙或背墙倒立，屈肘下降至头部接近地面再推起；先在有人保护或垫软垫的情况下练习。' }),
    E('vp-dbpress', 'vertical_push', '哑铃肩上推举', '三角肌 · 肱三头肌', 1, DBV, {
      weighted: true, ratio: 0.10, perHand: true, loadType: 'dumbbell',
      cues: '坐姿或站姿，哑铃置于耳侧，向上推至手臂接近伸直，避免耸肩与腰部过度反弓。' }),
    E('vp-bar', 'vertical_push', '杠铃站姿推举', '三角肌 · 肱三头肌 · 核心', 2, ['gym'], {
      weighted: true, ratio: 0.22, loadType: 'barbell', minLoad: 20,
      cues: '杠铃置于锁骨前，核心收紧，向上推过头顶至手臂伸直，头部略后让杠铃通过。' }),
    E('vp-machine', 'vertical_push', '坐姿肩推器械', '三角肌', 1, ['gym'], {
      weighted: true, ratio: 0.25, loadType: 'machine', minLoad: 5,
      cues: '背部贴紧靠垫，握把置于肩部高度，向上推起至手臂接近伸直，缓慢回落。' }),

    /* ---------------- 水平拉 ---------------- */
    E('hr-y', 'horizontal_pull', '俯卧 Y 提拉', '后三角肌 · 斜方肌', 1, BW, {
      cues: '俯卧于垫上，双臂伸成 Y 形、拇指朝上，肩胛发力把手臂抬离地面，顶点停 1 秒。' }),
    E('hr-inverted', 'horizontal_pull', '反向划船', '背阔肌 · 肱二头肌', 2, BW, {
      cues: '握住稳固的低杠或结实桌沿，身体悬于下方成直线，肩胛后收把胸部拉向横杆，再控制下放。' }),
    E('hr-onearm', 'horizontal_pull', '单臂哑铃划船', '背阔肌 · 菱形肌', 1, DBV, {
      weighted: true, ratio: 0.15, perHand: true, loadType: 'dumbbell',
      cues: '一手撑凳、躯干接近水平，哑铃自然下垂，肘部贴近身体向后上方拉起，顶点挤压肩胛。' }),
    E('hr-bentrow', 'horizontal_pull', '哑铃俯身划船', '背阔肌 · 斜方肌', 2, DBV, {
      weighted: true, ratio: 0.15, perHand: true, loadType: 'dumbbell',
      cues: '屈髋前倾约 45 度，双手持哑铃垂于体前，肘部贴身后拉，背部保持中立不弓背。' }),
    E('hr-cable', 'horizontal_pull', '坐姿绳索划船', '背阔肌 · 菱形肌', 1, ['gym'], {
      weighted: true, ratio: 0.40, loadType: 'machine', minLoad: 5,
      cues: '坐姿挺胸，握把拉向腹部，肘部贴身、肩胛后收，缓慢伸臂还原且不耸肩。' }),
    E('hr-bar', 'horizontal_pull', '杠铃俯身划船', '背阔肌 · 斜方肌', 2, ['gym'], {
      weighted: true, ratio: 0.30, loadType: 'barbell', minLoad: 20,
      cues: '屈髋前倾、背部中立，杠铃拉向肚脐位置，顶点挤压肩胛，控制下放。' }),

    /* ---------------- 垂直拉 ---------------- */
    E('vr-superman', 'vertical_pull', '俯卧超人式', '竖脊肌 · 臀大肌', 1, BW, {
      cues: '俯卧、双臂前伸，同时抬起手臂、胸部与双腿，顶点停 1 秒后缓慢放下，颈部保持中立。' }),
    E('vr-towel', 'vertical_pull', '毛巾下拉（自阻力）', '背阔肌', 2, BW, {
      cues: '双手拉紧毛巾两端，一手向上、一手向下相互对抗发力，模拟下拉动作，躯干保持稳定。' }),
    E('vr-lat', 'vertical_pull', '高位下拉', '背阔肌 · 肱二头肌', 1, ['gym'], {
      weighted: true, ratio: 0.40, loadType: 'machine', minLoad: 5,
      cues: '握距略宽于肩，挺胸微微后仰，把横杆拉向锁骨上方，肩胛下沉后收，缓慢还原。' }),
    E('vr-pullup', 'vertical_pull', '引体向上', '背阔肌 · 肱二头肌', 3, ['gym'], {
      cues: '正握单杠略宽于肩，肩胛下沉后收，把身体拉起至下巴过杠，控制下放至手臂伸直。' }),
    E('vr-assisted', 'vertical_pull', '辅助引体向上', '背阔肌 · 肱二头肌', 1, ['gym'], {
      cues: '使用弹力带或辅助器械减重，保持与引体向上相同的动作轨迹，逐步减少辅助。' }),
    E('vr-pullover', 'vertical_pull', '哑铃单臂上拉', '背阔肌', 2, DBV, {
      weighted: true, ratio: 0.13, perHand: true, loadType: 'dumbbell',
      cues: '仰卧，单手举哑铃于胸上方，手臂微屈沿弧线向头后下放至拉伸感明显，再拉回。' }),
    E('vr-lat-db', 'vertical_pull', '哑铃俯身直臂下拉', '背阔肌', 1, DBV, {
      weighted: true, ratio: 0.10, perHand: true, loadType: 'dumbbell',
      cues: '屈髋前倾约 45 度，双手持哑铃垂于体前、手臂微屈，用背部发力把哑铃沿弧线拉向髋部，再控制还原。' }),

    /* ---------------- 臀部孤立 ---------------- */
    E('gl-clam', 'glute', '蚌式开合', '臀中肌', 1, BW, {
      cues: '侧卧屈膝约 90 度、脚跟并拢，上侧膝盖向上打开，骨盆保持稳定不后倒，顶点停 1 秒。' }),
    E('gl-donkey', 'glute', '跪姿后踢腿', '臀大肌', 1, BW, {
      cues: '四点跪姿、收腹，一腿屈膝向后上方蹬起至大腿与躯干成直线，顶点挤压臀部后回落。' }),
    E('gl-hipthrust-db', 'glute', '哑铃臀推', '臀大肌', 2, DBV, {
      weighted: true, ratio: 0.45, loadType: 'dumbbell',
      cues: '上背靠凳，哑铃置于髋部，脚跟发力顶髋至躯干成直线，顶点收臀停 1 秒。' }),
    E('gl-hipthrust-bar', 'glute', '杠铃臀推', '臀大肌', 2, ['gym'], {
      weighted: true, ratio: 0.60, loadType: 'barbell', minLoad: 20,
      cues: '上背靠凳，杠铃加护垫置于髋部，顶髋至肩-髋-膝成直线，下巴微收，避免腰部代偿。' }),
    E('gl-abduct', 'glute', '髋外展器械', '臀中肌', 1, ['gym'], {
      weighted: true, ratio: 0.30, loadType: 'machine', minLoad: 5,
      cues: '坐姿，双腿向外打开至最大幅度，顶点停 1 秒，控制回收，躯干保持稳定。' }),

    /* ---------------- 核心 ---------------- */
    E('co-plank', 'core', '平板支撑', '核心 · 腹横肌', 1, BW, {
      isTime: true, timeReps: '40 秒',
      cues: '肘部与脚尖支撑，身体成一条直线，收紧腹部与臀部，不塌腰不耸肩，均匀呼吸。' }),
    E('co-deadbug', 'core', '死虫式', '腹直肌 · 腹横肌', 1, BW, {
      cues: '仰卧、四肢抬起，下背贴地，对侧手脚缓慢下放至接近地面再收回，腰部全程不离开地面。' }),
    E('co-crunch', 'core', '卷腹', '腹直肌', 1, BW, {
      cues: '仰卧屈膝、双手抱头但不用力拉颈，用腹部把肩胛卷离地面，顶点呼气，缓慢还原。' }),
    E('co-russian', 'core', '俄罗斯转体', '腹斜肌', 2, BW, {
      cues: '坐姿身体后倾、双脚可抬起，双手交握左右转体，保持背部挺直、动作有控制。' }),
    E('co-hanging', 'core', '悬垂举腿', '腹直肌下部', 3, ['gym'], {
      cues: '悬挂于单杠，收紧腹部把腿抬至与地面平行或更高，控制下放，避免摆动借力。' }),

    /* ---------------- 小腿 ---------------- */
    E('cf-stand', 'calf', '站姿提踵', '腓肠肌', 1, BW, {
      cues: '双脚与髋同宽站立，脚跟缓慢抬起至最高点停 1 秒，再缓慢降到最低，感受小腿拉伸。' }),
    E('cf-single', 'calf', '单腿提踵', '腓肠肌 · 比目鱼肌', 2, BW, {
      cues: '单脚站立、可扶墙保持平衡，脚跟抬起至最高点停 1 秒，缓慢下放。' }),
    E('cf-db', 'calf', '哑铃提踵', '腓肠肌', 2, DBV, {
      weighted: true, ratio: 0.20, perHand: true, loadType: 'dumbbell',
      cues: '双手持哑铃垂于体侧，前脚掌踩在台阶边缘，脚跟下沉后尽量抬高，动作缓慢有控制。' }),
    E('cf-machine', 'calf', '器械提踵', '腓肠肌 · 比目鱼肌', 1, ['gym'], {
      weighted: true, ratio: 0.40, loadType: 'machine', minLoad: 5,
      cues: '前脚掌踩在踏板上、肩部顶住护垫，脚跟尽量下沉再抬高至最大幅度，顶点停 1 秒。' }),

    /* ---------------- 肱二头肌 ---------------- */
    E('bi-self', 'biceps', '自阻力弯举', '肱二头肌', 1, BW, {
      cues: '一手握拳，另一手向下施加阻力，屈肘对抗发力完成弯举，控制还原，两侧交替。' }),
    E('bi-towel', 'biceps', '毛巾弯举', '肱二头肌', 2, BW, {
      cues: '脚踩毛巾一端、双手握住另一端，屈肘对抗阻力向上发力，肘部固定在体侧。' }),
    E('bi-curl', 'biceps', '哑铃弯举', '肱二头肌', 1, DBV, {
      weighted: true, ratio: 0.08, perHand: true, loadType: 'dumbbell',
      cues: '肘部固定于体侧，前臂向上弯曲至肱二头肌完全收缩，缓慢下放，避免身体摆动借力。' }),
    E('bi-hammer', 'biceps', '哑铃锤式弯举', '肱二头肌 · 肱桡肌', 2, DBV, {
      weighted: true, ratio: 0.08, perHand: true, loadType: 'dumbbell',
      cues: '掌心相对握哑铃，肘部贴身，屈肘上举至肩前，控制还原。' }),
    E('bi-bar', 'biceps', '杠铃弯举', '肱二头肌', 2, ['gym'], {
      weighted: true, ratio: 0.17, loadType: 'barbell', minLoad: 10,
      cues: '与肩同宽反握杠铃，肘部固定，屈肘上举至胸前，缓慢下放至手臂接近伸直。' }),

    /* ---------------- 肱三头肌 ---------------- */
    E('tr-bench-dip', 'triceps', '凳上臂屈伸', '肱三头肌', 1, BW, {
      cues: '双手撑于稳固凳沿、臀部落于凳前，屈肘下降至肘部约 90 度再撑起，肩部远离耳朵。' }),
    E('tr-diamond', 'triceps', '窄距俯卧撑', '肱三头肌 · 胸大肌', 2, BW, {
      cues: '双手在胸口下方靠拢成三角形，身体成直线屈肘下降再推起，肘部贴近身体。' }),
    E('tr-overhead', 'triceps', '哑铃颈后臂屈伸', '肱三头肌', 1, DBV, {
      weighted: true, ratio: 0.08, loadType: 'dumbbell',
      cues: '双手捧一只哑铃举过头顶，肘部朝前固定，前臂下放至头后再伸直至手臂伸直。' }),
    E('tr-pushdown', 'triceps', '绳索下压', '肱三头肌', 1, ['gym'], {
      weighted: true, ratio: 0.25, loadType: 'machine', minLoad: 5,
      cues: '站在绳索前，肘部贴身固定，前臂向下伸直至完全收紧，缓慢还原。' }),
    E('tr-cgbench', 'triceps', '窄距卧推', '肱三头肌 · 胸大肌', 2, ['gym'], {
      weighted: true, ratio: 0.25, loadType: 'barbell', minLoad: 20,
      cues: '握距与肩同宽，杠铃下降至胸部中段，肘部贴近身体，推起时肱三头肌发力。' }),

    /* ---------------- 肩部孤立 ---------------- */
    E('lr-bw', 'lateral_raise', '徒手慢速侧平举', '三角肌中束', 1, BW, {
      cues: '双臂垂于体侧、肘部微屈，用 3 秒把手臂缓慢抬至与肩同高，再用 3 秒缓慢放下，全程不耸肩。' }),
    E('lr-db', 'lateral_raise', '哑铃侧平举', '三角肌中束', 1, DBV, {
      weighted: true, ratio: 0.045, perHand: true, loadType: 'dumbbell',
      cues: '双手持哑铃垂于体侧、肘部微屈，向两侧举至与肩同高，缓慢下放，避免耸肩。' }),
    E('lr-front', 'lateral_raise', '哑铃前平举', '三角肌前束', 2, DBV, {
      weighted: true, ratio: 0.045, perHand: true, loadType: 'dumbbell',
      cues: '双手持哑铃置于体前、肘部微屈，向前举至与肩同高，控制下放。' }),
    E('lr-cable', 'lateral_raise', '绳索侧平举', '三角肌中束', 2, ['gym'], {
      weighted: true, ratio: 0.05, loadType: 'machine', minLoad: 2.5,
      cues: '侧身站立握低位绳索，手臂微屈向侧上方举至肩高，缓慢还原，保持躯干稳定。' }),

    /* ---------------- 有氧收尾 ---------------- */
    E('cd-walk', 'cardio', '快走', '心肺', 1, BW, {
      cues: '以能正常说话但略微喘气的速度持续快走，全程保持挺胸收腹、自然摆臂。' }),
    E('cd-march', 'cardio', '原地踏步', '心肺', 1, BW, {
      cues: '原地交替抬腿踏步，膝盖抬至舒适高度，手臂自然摆动，落地轻缓无冲击。' }),
    E('cd-jack', 'cardio', '开合跳', '心肺 · 全身', 2, BW, {
      isJump: true,
      cues: '双脚向外跳开同时双臂上举，再跳回起始位置，落地时膝盖微屈缓冲。' }),
    E('cd-rope', 'cardio', '跳绳', '心肺 · 小腿', 2, BW, {
      isJump: true,
      cues: '手腕摇绳、前脚掌轻跳，跳跃幅度越小越省力，落地保持弹性。' }),
    E('cd-burpee', 'cardio', '波比跳', '全身 · 心肺', 3, BW, {
      isJump: true,
      cues: '下蹲撑地、双脚跳回或走出成平板，再收腿站起向上跳，动作连贯但不过度追求速度。' })
  ];

  /* ------------------------------------------------------------------ 日期工具 */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function fromISO(iso) {
    var p = String(iso).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function addDays(iso, n) {
    var d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }
  function diffDays(aISO, bISO) {
    return Math.round((fromISO(bISO) - fromISO(aISO)) / 86400000);
  }
  function weekdayMon0(iso) {
    return (fromISO(iso).getDay() + 6) % 7;
  }
  function weekdayName(iso) {
    return WEEKDAY_CN[weekdayMon0(iso)];
  }
  function formatCN(iso) {
    var d = fromISO(iso);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEKDAY_CN[(d.getDay() + 6) % 7];
  }

  /* ------------------------------------------------------------------ 身体分档 */
  function bmi(heightCm, weightKg) {
    var m = Number(heightCm) / 100;
    if (!m) return 0;
    return Number(weightKg) / (m * m);
  }
  function bodyClassFromBmi(value) {
    if (value < 18.5) return 'under';
    if (value < 24) return 'normal';
    if (value < 28) return 'over';
    return 'obese';
  }
  function bodyClassLabel(c) {
    return { under: '偏瘦', normal: '正常', over: '超重', obese: '肥胖' }[c] || c;
  }
  function healthyWeightRange(heightCm) {
    var m = Number(heightCm) / 100;
    return { min: +(18.5 * m * m).toFixed(1), max: +(23.9 * m * m).toFixed(1) };
  }
  function heightClass(heightCm) {
    var h = Number(heightCm);
    if (h < 165) return 'compact';
    if (h > 180) return 'tall';
    return 'average';
  }
  function heightClassLabel(c) {
    return { compact: '偏矮', average: '中等', tall: '偏高' }[c] || c;
  }

  /* ------------------------------------------------------------------ 配置规范化 */
  /* 把任意输入整理成合法的星期集合：只保留 0–6 的整数，去重并升序 */
  function normalizeWeekdays(list) {
    var out = [], seen = {};
    if (Object.prototype.toString.call(list) === '[object Array]') {
      for (var i = 0; i < list.length; i++) {
        var v = Math.round(Number(list[i]));
        if (isFinite(v) && v >= 0 && v <= 6 && !seen[v]) { seen[v] = 1; out.push(v); }
      }
    }
    return out.sort(function (a, b) { return a - b; });
  }
  /* 预设排布，接受 1–7 天（用于「推荐排布」按钮与默认值） */
  function presetWeekdays(count) {
    var c = Math.round(Number(count));
    if (!isFinite(c)) c = 3;
    c = Math.min(7, Math.max(1, c));
    return WEEKDAY_PRESETS[c].slice();
  }
  /* 旧字段 daysPerWeek 的迁移语义与历史版本保持一致（2–6 天） */
  function legacyDays(days) {
    var d = Math.min(6, Math.max(2, Math.round(Number(days) || 3)));
    if (!WEEKDAY_PRESETS[d]) d = 3;
    return d;
  }

  function normalizeProfile(raw) {
    var p = raw || {};
    var weekdays = p.trainingWeekdays != null
      ? normalizeWeekdays(p.trainingWeekdays)
      : WEEKDAY_PRESETS[legacyDays(p.daysPerWeek)].slice();
    if (!weekdays.length) {
      weekdays = p.daysPerWeek != null
        ? WEEKDAY_PRESETS[legacyDays(p.daysPerWeek)].slice()
        : WEEKDAY_PRESETS[3].slice();
    }
    if (!weekdays.length) weekdays = WEEKDAY_PRESETS[3].slice();
    var inj = [];
    if (Object.prototype.toString.call(p.injuries) === '[object Array]') {
      for (var i = 0; i < p.injuries.length; i++) {
        if (JOINTS.indexOf(p.injuries[i]) >= 0 && inj.indexOf(p.injuries[i]) < 0) inj.push(p.injuries[i]);
      }
    }
    var exclusions = [];
    if (Object.prototype.toString.call(p.exclusions) === '[object Array]') {
      for (var k = 0; k < p.exclusions.length; k++) {
        if (DIET_TAGS.indexOf(p.exclusions[k]) >= 0 && exclusions.indexOf(p.exclusions[k]) < 0) exclusions.push(p.exclusions[k]);
      }
    }
    var ageNum = Math.round(Number(p.age));
    if (!isFinite(ageNum)) ageNum = 28;
    ageNum = Math.min(90, Math.max(14, ageNum));
    return {
      heightCm: Number(p.heightCm) || 170,
      weightKg: Number(p.weightKg) || 65,
      goal: GOALS[p.goal] ? p.goal : 'recomp',
      trainingWeekdays: weekdays,
      daysPerWeek: weekdays.length,
      experience: EXPERIENCE[p.experience] ? p.experience : 'beginner',
      venue: VENUES[p.venue] ? p.venue : 'home_bodyweight',
      age: ageNum,
      sex: p.sex === 'female' ? 'female' : 'male',
      injuries: inj,
      dietPattern: DIET_PATTERNS[p.dietPattern] ? p.dietPattern : 'normal',
      exclusions: exclusions,
      mealsPerDay: Number(p.mealsPerDay) === 5 ? 5 : 3,
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(p.startDate || '')) ? p.startDate : toISO(new Date())
    };
  }
  function validateProfile(raw) {
    var errs = [];
    var h = Number(raw && raw.heightCm), w = Number(raw && raw.weightKg);
    if (!(h >= 100 && h <= 250)) errs.push('身高需在 100–250 cm 之间');
    if (!(w >= 30 && w <= 250)) errs.push('体重需在 30–250 kg 之间');
    if (raw && raw.trainingWeekdays != null) {
      if (!normalizeWeekdays(raw.trainingWeekdays).length) errs.push('请至少选择 1 个训练日');
    } else if (raw && raw.daysPerWeek != null && !WEEKDAY_PRESETS[Number(raw.daysPerWeek)]) {
      errs.push('每周训练天数需在 1–7 天之间');
    }
    if (raw && raw.age != null) {
      var a = Number(raw.age);
      if (!(a >= 14 && a <= 90)) errs.push('年龄需在 14–90 岁之间');
    }
    return errs;
  }

  /* ------------------------------------------------------------------ 分化模板 */
  function splitFor(daysPerWeek, experience) {
    var d = Math.round(Number(daysPerWeek));
    if (!isFinite(d) || d < 1) d = 3;
    if (d > 7) d = 7;
    var adv = experience === 'intermediate' || experience === 'advanced';
    if (d === 1) {
      return [
        { name: '全身综合', focus: '蹲 · 推 · 拉 · 髋 · 臀 · 核心',
          slots: ['squat', 'horizontal_push', 'horizontal_pull', 'hinge', 'glute', 'core'] }
      ];
    }
    if (d === 2) {
      return [
        { name: '全身 A', focus: '下肢 · 推 · 拉', slots: ['squat', 'horizontal_push', 'horizontal_pull', 'hinge', 'core'] },
        { name: '全身 B', focus: '下肢 · 肩 · 背', slots: ['lunge', 'vertical_push', 'vertical_pull', 'glute', 'core'] }
      ];
    }
    if (d === 3) {
      if (adv) {
        return [
          { name: '推（胸 · 肩 · 三头）', focus: '上肢推', slots: ['horizontal_push', 'vertical_push', 'triceps', 'lateral_raise', 'core'] },
          { name: '拉（背 · 二头）', focus: '上肢拉', slots: ['vertical_pull', 'horizontal_pull', 'horizontal_pull', 'biceps', 'core'] },
          { name: '腿（下肢）', focus: '下肢', slots: ['squat', 'hinge', 'lunge', 'glute', 'calf', 'core'] }
        ];
      }
      return [
        { name: '全身 A', focus: '蹲 · 推 · 拉 · 小腿', slots: ['squat', 'horizontal_push', 'horizontal_pull', 'calf', 'core'] },
        { name: '全身 B', focus: '髋 · 肩 · 背 · 臀', slots: ['hinge', 'vertical_push', 'vertical_pull', 'glute', 'core'] },
        { name: '全身 C', focus: '弓步 · 推 · 拉 · 臀', slots: ['lunge', 'horizontal_push', 'horizontal_pull', 'glute', 'core'] }
      ];
    }
    if (d === 4) {
      return [
        { name: '上肢 A', focus: '推为主', slots: ['horizontal_push', 'horizontal_pull', 'vertical_push', 'biceps', 'triceps'] },
        { name: '下肢 A', focus: '蹲为主', slots: ['squat', 'hinge', 'glute', 'calf', 'core'] },
        { name: '上肢 B', focus: '拉为主', slots: ['vertical_pull', 'horizontal_push', 'horizontal_pull', 'lateral_raise', 'core'] },
        { name: '下肢 B', focus: '弓步与髋', slots: ['lunge', 'hinge', 'glute', 'calf', 'core'] }
      ];
    }
    if (d === 5) {
      return [
        { name: '推（胸 · 肩 · 三头）', focus: '上肢推', slots: ['horizontal_push', 'vertical_push', 'triceps', 'lateral_raise', 'core'] },
        { name: '拉（背 · 二头）', focus: '上肢拉', slots: ['vertical_pull', 'horizontal_pull', 'biceps', 'core'] },
        { name: '腿（下肢）', focus: '下肢', slots: ['squat', 'hinge', 'lunge', 'glute', 'calf', 'core'] },
        { name: '上肢（推拉组合）', focus: '上肢综合', slots: ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'lateral_raise'] },
        { name: '下肢（后链为主）', focus: '下肢', slots: ['hinge', 'lunge', 'glute', 'calf', 'core'] }
      ];
    }
    var sixDay = [
      { name: '推 A', focus: '胸 · 肩 · 三头', slots: ['horizontal_push', 'vertical_push', 'triceps', 'lateral_raise'] },
      { name: '拉 A', focus: '背 · 二头', slots: ['vertical_pull', 'horizontal_pull', 'biceps', 'core'] },
      { name: '腿 A', focus: '下肢', slots: ['squat', 'hinge', 'glute', 'calf'] },
      { name: '推 B', focus: '胸 · 肩 · 三头', slots: ['horizontal_push', 'vertical_push', 'triceps', 'lateral_raise'] },
      { name: '拉 B', focus: '背 · 二头', slots: ['vertical_pull', 'horizontal_pull', 'biceps', 'core'] },
      { name: '腿 B', focus: '下肢', slots: ['lunge', 'hinge', 'glute', 'calf'] }
    ];
    if (d === 6) return sixDay;
    /* 7 天：第 7 天固定为低强度恢复日，避免完全没有休息日 */
    return sixDay.concat([
      { name: '恢复日（低强度）', focus: '臀 · 核心 · 小腿 · 有氧', recovery: true,
        slots: ['glute', 'core', 'calf'] }
    ]);
  }

  /* ------------------------------------------------------------------ 动作挑选 */
  /* 场地 → 器材优先顺序：健身房先用器械/杠铃，居家哑铃先用哑铃，再退到徒手 */
  function equipOrder(venue) {
    if (venue === 'home_bodyweight') return ['bw'];
    if (venue === 'home_dumbbell') return ['db', 'bw'];
    return ['gym', 'db', 'bw'];
  }
  function pickExercise(pattern, ctx) {
    var venue = ctx.venue, cap = ctx.tierCap, noJump = ctx.excludeJumps, offset = ctx.offset || 0;
    var banned = ctx.excludeIds || [];
    var avoid = ctx.avoidJoints || [];
    var ok = function (e) {
      if (e.venues.indexOf(venue) < 0) return false;
      if (noJump && e.isJump) return false;
      if (banned.indexOf(e.id) >= 0) return false;
      /* 涉及任一受限部位的动作一律剔除 */
      var j = jointsOf(e);
      for (var i = 0; i < avoid.length; i++) if (j.indexOf(avoid[i]) >= 0) return false;
      return true;
    };

    function collect(pat) {
      var all = EXERCISES.filter(function (e) { return e.pattern === pat && ok(e); });
      var order = equipOrder(venue);
      for (var i = 0; i < order.length; i++) {
        var same = all.filter(function (e) { return e.equip === order[i]; });
        var within = same.filter(function (e) { return e.tier <= cap; });
        if (within.length) return within;
      }
      return all;
    }

    var cands = collect(pattern);
    if (!cands.length && PATTERN_FALLBACK[pattern]) cands = collect(PATTERN_FALLBACK[pattern]);
    /* 最后一个兜底也必须遵守伤病限制，否则会绕过用户设置 */
    if (!cands.length) cands = EXERCISES.filter(function (e) { return e.pattern === pattern && ok(e); });
    if (!cands.length) return null;
    cands = cands.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    var exact = cands.filter(function (e) { return e.tier === cap; });
    var pool = exact.length ? exact : (function () {
      var mx = Math.max.apply(null, cands.map(function (e) { return e.tier; }));
      return cands.filter(function (e) { return e.tier === mx; });
    })();
    var idx = ((offset % pool.length) + pool.length) % pool.length;
    return pool[idx];
  }

  /* ------------------------------------------------------------------ 负荷建议 */
  function roundToStep(x, step, min) {
    var v = Math.round(x / step) * step;
    v = Math.round(v * 100) / 100;
    return Math.max(min || step, v);
  }
  function nearestFrom(sizes, x) {
    var best = sizes[0], bestD = Infinity;
    for (var i = 0; i < sizes.length; i++) {
      var d = Math.abs(sizes[i] - x);
      if (d < bestD) { bestD = d; best = sizes[i]; }
    }
    return best;
  }
  function prescribeLoad(ex, profile, ctx) {
    if (!ex.weighted) {
      return { raw: 0, weight: 0, text: '自重', unit: null };
    }
    var expScale = EXPERIENCE[profile.experience].loadScale;
    var tallScale = (ctx.heightClass === 'tall' && (ex.pattern === 'squat' || ex.pattern === 'hinge')) ? 0.9 : 1;
    var raw = profile.weightKg * ex.ratio * expScale * ctx.progressionFactor * (ctx.isDeload ? 0.9 : 1) * tallScale;
    var weight;
    if (ex.loadType === 'dumbbell') {
      weight = nearestFrom(DB_SIZES, raw);
    } else {
      weight = roundToStep(raw, 2.5, ex.minLoad || 2.5);
    }
    var unit = ex.loadType === 'dumbbell' ? '哑铃' : (ex.loadType === 'barbell' ? '杠铃总重' : '器械');
    var text = (ex.perHand ? '每手 ' : '') + weight + ' kg';
    return { raw: raw, weight: weight, text: text, unit: unit };
  }

  function bumpReps(rangeStr) {
    var m = /^(\d+)-(\d+)$/.exec(rangeStr);
    if (!m) return rangeStr;
    return m[1] + '-' + (Number(m[2]) + 1);
  }

  /* ------------------------------------------------------------------ 单次训练 */
  /* ------------------------------------------------------------------ 反馈自适应 */
  var COMPLETION_SCORE = { all: 1, most: 0.7, some: 0.3 };

  function uniq(arr) {
    var out = [];
    for (var i = 0; i < (arr || []).length; i++) if (out.indexOf(arr[i]) < 0) out.push(arr[i]);
    return out;
  }
  function clampNum(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* 只看「上周」（训练日序号区间）的反馈，返回单周调整量 */
  function singleWeekAdaptation(profile, progress, week, idxToDate) {
    var hold = { applied: false, loadFactor: 1, setDelta: 0, restDelta: 0, reason: '', painJoints: [] };
    if (week <= 1) return hold;
    var d = profile.trainingWeekdays.length;
    var from = (week - 2) * d + 1, to = (week - 1) * d;
    var fb = (progress && progress.feedback) || {};
    var logs = (progress && progress.logs) || {};
    var list = [], doneCount = 0;
    for (var i = from; i <= to; i++) {
      var dt = idxToDate[i];
      if (!dt) continue;
      if (logs[dt] && logs[dt].status === 'done') doneCount++;
      if (fb[dt]) list.push(fb[dt]);
    }
    if (!list.length) return hold;

    var sumRpe = 0, sumComp = 0, pain = [], allDone = true;
    for (var k = 0; k < list.length; k++) {
      var f = list[k];
      sumRpe += Number(f.rpe) || 7;
      var sc = COMPLETION_SCORE[f.completion];
      if (sc === undefined) sc = 1;
      sumComp += sc;
      if (sc < 1) allDone = false;
      if (f.pain && f.pain.has) pain = pain.concat(f.pain.joints || []);
    }
    var avgRpe = sumRpe / list.length, avgComp = sumComp / list.length;

    if (pain.length) {
      return { applied: true, loadFactor: 0.9, setDelta: -1, restDelta: 15,
        reason: '上周有疼痛反馈，本周主动降量', painJoints: uniq(pain) };
    }
    if (avgRpe >= 8.5 || avgComp < 0.8) {
      return { applied: true, loadFactor: 0.92, setDelta: -1, restDelta: 10,
        reason: '上周主观强度偏高或完成度不足，本周小幅降量', painJoints: [] };
    }
    if (to - from + 1 > 0 && doneCount / (to - from + 1) < 0.6) return hold;
    if (avgRpe <= 5.5 && allDone) {
      return { applied: true, loadFactor: 1.05, setDelta: 1, restDelta: -5,
        reason: '上周自评偏轻松且全部完成，本周加量', painJoints: [] };
    }
    return hold;
  }

  /**
   * 累积到第 week 周的自适应结果。
   * 逐周结算并累乘/累加，负重系数限制在 0.7–1.15，组数增量限制在 −2~+2。
   */
  function adaptationFor(profileRaw, progress, week, todayISO) {
    var p = normalizeProfile(profileRaw);
    var out = { applied: false, loadFactor: 1, setDelta: 0, restDelta: 0, reasons: [], painJoints: [] };
    if (week <= 1 || !progress) return out;
    var today = todayISO || toISO(new Date());
    var tl = buildTimeline(p, progress, today, today, p.startDate);
    var idxToDate = {};
    for (var dt in tl) if (tl[dt] && tl[dt].training) idxToDate[tl[dt].sessionIndex] = dt;

    var load = 1, sd = 0, rd = 0;
    for (var w = 2; w <= week; w++) {
      var a = singleWeekAdaptation(p, progress, w, idxToDate);
      if (!a.applied) continue;
      out.applied = true;
      load = clampNum(load * a.loadFactor, 0.7, 1.15);
      sd = clampNum(sd + a.setDelta, -2, 2);
      rd = clampNum(rd + a.restDelta, -10, 30);
      out.reasons.push({ week: w, reason: a.reason });
      out.painJoints = uniq(out.painJoints.concat(a.painJoints));
    }
    out.loadFactor = load; out.setDelta = sd; out.restDelta = rd;
    return out;
  }

  /* ------------------------------------------------------------------ 单次训练 */
  function sessionFor(profileRaw, index, opts) {
    opts = opts || {};
    var p = normalizeProfile(profileRaw);
    var idx = Math.max(1, Math.round(index));
    var d = p.daysPerWeek;
    var week = Math.ceil(idx / d);
    var block = Math.ceil(week / 4);
    var weekInBlock = ((week - 1) % 4) + 1;
    var isDeload = weekInBlock === 4;
    var progressionFactor = 1 + 0.03 * (block - 1);
    var limited = uniq((p.injuries || []).concat(opts.extraJoints || []));
    var adaptation = opts.adaptation ||
      (opts.progress ? adaptationFor(p, opts.progress, week, opts.todayISO) : null);
    var adaptLoad = adaptation ? adaptation.loadFactor : 1;
    var adaptSets = adaptation ? adaptation.setDelta : 0;
    var adaptRest = adaptation ? adaptation.restDelta : 0;
    var skippedPatterns = [];

    var bmiVal = bmi(p.heightCm, p.weightKg);
    var bClass = bodyClassFromBmi(bmiVal);
    var hClass = heightClass(p.heightCm);
    var excludeJumps = bClass === 'obese' || bClass === 'over';
    var exp = EXPERIENCE[p.experience];
    var goal = GOALS[p.goal];
    var split = splitFor(p.daysPerWeek, p.experience);
    var tpl = split[(idx - 1) % split.length];
    var isRecovery = !!tpl.recovery;
    var cycleOffset = block - 1;
    var setsBase = exp.sets[weekInBlock - 1];
    var bwSetBonus = Math.min(2, Math.floor((block - 1) / 2));
    var occurrence = {};

    var exercises = tpl.slots.map(function (pattern, i) {
      occurrence[pattern] = (occurrence[pattern] || 0) + 1;
      var offset = cycleOffset + occurrence[pattern] - 1;
      var ex = pickExercise(pattern, {
        venue: p.venue, tierCap: exp.tierCap, excludeJumps: excludeJumps, offset: offset,
        excludeIds: hClass === 'tall' ? ['vr-pullup'] : [],
        avoidJoints: limited
      });

      if (!ex) {
        skippedPatterns.push(pattern);
        return {
          id: 'skipped-' + pattern, pattern: pattern, patternLabel: PATTERN_LABEL[pattern] || pattern,
          name: '今日跳过：' + (PATTERN_LABEL[pattern] || pattern), muscle: '受限部位保护',
          tier: 0, sets: 0, reps: '—', repsIsTime: false, restSec: 0,
          loadText: '—', loadRaw: 0, loadWeight: 0, loadUnit: null, weighted: false, isJump: false,
          skipped: true, isPrimary: false,
          cues: PATTERN_SAFE_ADVICE[pattern] || '先做不涉及该部位的替代动作，等不适消退再恢复。',
          notes: ['所有' + (PATTERN_LABEL[pattern] || pattern) + '动作都会用到你标记的受限部位（' +
            jointLabel(limited) + '），今天先跳过这一项；这一天仍然是有效训练日。'],
          reason: '涉及受限部位：' + jointLabel(limited)
        };
      }

      var sets = setsBase + (ex.weighted ? 0 : bwSetBonus);
      if (isRecovery) sets = Math.min(sets, 2);
      sets = clampNum(sets + adaptSets, 2, 6);
      var reps, rest, isPrimary = false;
      if (p.goal === 'strength') {
        isPrimary = (i === 0 && !ISOLATION[pattern]) || pattern === 'squat' || pattern === 'hinge' || pattern === 'horizontal_push';
        var rule = isPrimary ? goal.primary : goal.accessory;
        reps = rule.reps; rest = rule.rest;
      } else {
        reps = goal.reps; rest = goal.rest;
      }
      if (ex.isTime) reps = ex.timeReps;
      /* 偏矮体型行程短，用 +1 次补足刺激；增力目标的主项保持原次数区间，避免改变训练性质 */
      else if (hClass === 'compact' && !(p.goal === 'strength' && isPrimary)) reps = bumpReps(reps);

      var load = prescribeLoad(ex, p, {
        progressionFactor: progressionFactor * adaptLoad, isDeload: isDeload, heightClass: hClass
      });
      if (rest) rest = Math.max(20, rest + adaptRest);

      var notes = [];
      if (hClass === 'tall' && (pattern === 'squat' || pattern === 'hinge')) {
        notes.push('长行程体型：起始重量下调约 10%，先用箱式深蹲 / 架上硬拉把动作幅度练稳。');
      }
      if (hClass === 'tall' && pattern === 'vertical_pull') {
        notes.push('偏高体型做引体向上难度更大，已改为高位下拉 / 划船类动作，先用它们积累背部和握力。');
      }
      if (hClass === 'compact' && !ex.isTime && !(p.goal === 'strength' && isPrimary)) {
        notes.push('行程偏短：在可控范围内多完成 1–2 次，或放慢下放速度来补足刺激。');
      }
      if (bClass === 'obese') {
        if (pattern === 'lunge' || pattern === 'squat' || pattern === 'cardio') {
          notes.push('大体重保护：动作放慢、幅度以无痛为准，避免任何跳跃与落地冲击。');
        }
        if (ex.isTime) notes.push('静力动作以能保持标准姿势为准，支撑不住就先结束这一组。');
      } else if (bClass === 'over') {
        if (pattern === 'lunge' || pattern === 'squat') {
          notes.push('膝关节控制在舒适角度，下蹲到能保持膝盖对准脚尖的深度即可。');
        }
      } else if (bClass === 'under') {
        if (ex.isTime) notes.push('偏瘦体型优先保证力量训练质量，静力动作组间休息可以略微加长。');
      }
      if (isDeload) notes.push('本周为减载周：组数与重量主动下调，目的是让身体恢复、下周继续进步。');
      if (ex.note) notes.push(ex.note);

      return {
        id: ex.id, pattern: pattern, patternLabel: PATTERN_LABEL[pattern] || pattern,
        name: ex.name, muscle: ex.muscle, tier: ex.tier,
        sets: sets, reps: reps, repsIsTime: !!ex.isTime, restSec: rest,
        loadText: load.text, loadRaw: load.raw, loadWeight: load.weight, loadUnit: load.unit,
        weighted: ex.weighted, isJump: !!ex.isJump, cues: ex.cues, notes: notes, isPrimary: isPrimary
      };
    });

    /* 热身 */
    var warmup = (bClass === 'obese' || bClass === 'over')
      ? '快走或原地踏步 5 分钟（微微发热即可）+ 关节活动：踝、髋、肩绕环各 8 次/方向'
      : '原地开合跳或高抬腿 3 分钟 + 动态拉伸：弓步转体、前后摆腿各 8 次/侧';

    /* 有氧收尾 */
    var finisher = null;
    if (isRecovery) {
      var rcd = pickExercise('cardio', {
        venue: p.venue, tierCap: Math.min(2, exp.tierCap), excludeJumps: true, offset: cycleOffset
      });
      finisher = {
        id: rcd.id, pattern: 'cardio', patternLabel: '有氧收尾',
        name: rcd.name, muscle: rcd.muscle, sets: 1, reps: '15–20 分钟（低强度）', repsIsTime: true,
        restSec: 0, loadText: '自重', loadRaw: 0, loadWeight: 0, loadUnit: null,
        weighted: false, isJump: !!rcd.isJump,
        cues: rcd.cues + '（恢复日强度以轻松为准，全程能正常说话，结束后再做 5 分钟拉伸）',
        notes: [], isPrimary: false
      };
    } else if (p.goal === 'fat_loss') {
      if (bClass === 'under') {
        finisher = {
          id: 'cd-stretch', pattern: 'cardio', patternLabel: '恢复',
          name: '训练后拉伸与呼吸放松', muscle: '全身', sets: 1, reps: '5–10 分钟',
          repsIsTime: true, restSec: 0, loadText: '自重', loadRaw: 0, loadWeight: 0, loadUnit: null,
          weighted: false, isJump: false,
          cues: '偏瘦体型不建议在力量训练后再做长时间有氧，把热量留给肌肉增长；用拉伸和腹式呼吸收尾即可。',
          notes: [], isPrimary: false
        };
      } else {
        var cd = pickExercise('cardio', {
          venue: p.venue === 'home_bodyweight' ? 'home_bodyweight' : p.venue,
          tierCap: p.venue === 'home_bodyweight' ? Math.min(2, exp.tierCap) : exp.tierCap,
          excludeJumps: excludeJumps, offset: cycleOffset
        });
        var minutes = bClass === 'obese' ? '20–30 分钟（可分段完成）' : '8–12 分钟';
        finisher = {
          id: cd.id, pattern: 'cardio', patternLabel: '有氧收尾',
          name: cd.name, muscle: cd.muscle, sets: 1, reps: minutes, repsIsTime: true,
          restSec: 0, loadText: '自重', loadRaw: 0, loadWeight: 0, loadUnit: null,
          weighted: false, isJump: !!cd.isJump,
          cues: cd.cues + '（强度控制在还能说短句的程度，做完直接进入拉伸）',
          notes: bClass === 'obese' ? ['大体重保护：只做走 / 踏步类零冲击形式，不要跳跃。'] : [],
          isPrimary: false
        };
      }
    }

    /* 提示 */
    var warnings = [];
    if (p.experience === 'beginner' && p.daysPerWeek >= 5) {
      warnings.push('新手每周 ' + p.daysPerWeek + ' 天恢复压力较大，建议前期把其中 1–2 天降为轻强度，重点保证动作质量。');
    }
    if (isRecovery) warnings.push('这是低强度恢复日：组数已压到 2 组，目的是促进恢复，不要练到力竭。');
    if (p.trainingWeekdays.length >= 7) warnings.push('你选择了每周 7 天，没有完整休息日。第 7 天已自动安排为低强度恢复日；如果疲劳感持续或睡眠变差，建议减到 5–6 天。');
    if (skippedPatterns.length) {
      warnings.push('有 ' + skippedPatterns.length + ' 项因受限部位（' + jointLabel(limited) +
        '）被跳过，今天仍然是有效训练日，照常打卡即可，计划不会中断。');
    }
    if (adaptation && adaptation.applied) {
      var last = adaptation.reasons[adaptation.reasons.length - 1];
      warnings.push('本周已按你的反馈调整：' + (last ? last.reason : '') + '（负重 ×' + adaptLoad.toFixed(2) +
        '，组数 ' + (adaptSets >= 0 ? '+' : '') + adaptSets + '）');
    }
    if (isDeload) warnings.push('本周是第 ' + block + ' 个中周期的减载周，训练量主动降低，恢复优先。');
    if (bClass === 'obese') warnings.push('当前 BMI ' + bmiVal.toFixed(1) + '，计划已自动剔除全部跳跃冲击动作，并优先选用关节友好的替代方案。');
    if (bClass === 'under') warnings.push('当前 BMI ' + bmiVal.toFixed(1) + '，计划侧重力量与增肌，不安排长时间有氧。');

    return {
      index: idx, week: week, block: block, weekInBlock: weekInBlock, isDeload: isDeload,
      progressionFactor: progressionFactor,
      title: tpl.name, focus: tpl.focus,
      bodyClass: bClass, heightClass: hClass, bmi: bmiVal,
      goal: p.goal, goalLabel: goal.label, venue: p.venue, venueLabel: VENUES[p.venue],
      experience: p.experience, experienceLabel: exp.label, daysPerWeek: p.daysPerWeek,
      trainingWeekdays: p.trainingWeekdays,
      isRecovery: isRecovery,
      limitedJoints: limited,
      skippedPatterns: skippedPatterns,
      skippedCount: skippedPatterns.length,
      adaptation: adaptation,
      warmup: warmup, exercises: exercises, finisher: finisher,
      cooldown: '训练后全身拉伸 5 分钟，重点拉伸当日训练的肌群，配合缓慢呼吸。',
      warnings: warnings
    };
  }

  /* ------------------------------------------------------------------ 日历排布 */
  function isTrainingDate(iso, profileRaw) {
    var p = normalizeProfile(profileRaw);
    return p.trainingWeekdays.indexOf(weekdayMon0(iso)) >= 0;
  }
  /* 传 profile（或含 trainingWeekdays 的对象）返回它自己的训练日；传数字返回对应的推荐预设 */
  function trainingWeekdays(input) {
    if (input && typeof input === 'object') return normalizeProfile(input).trainingWeekdays;
    return presetWeekdays(input);
  }
  /* 紧凑写法：周 3 天 → 周一/三/五 */
  function weekdaySummary(list) {
    var wd = normalizeWeekdays(list);
    if (!wd.length) return '未选择';
    return '周' + wd.map(function (d) { return WEEKDAY_SHORT[d]; }).join('/');
  }

  /**
   * 生成 [fromISO .. endISO] 每一天的排期（fromISO 省略时只输出今天及以后）。
   * 规则：训练日序数只在「该日打卡完成」或「该日尚未到来」时前进；
   *       过去的未完成训练日不推进序号 —— 这就是漏练自动顺延。
   */
  function buildTimeline(profileRaw, progressRaw, todayISO, endISO, fromISO) {
    var p = normalizeProfile(profileRaw);
    var progress = progressRaw || {};
    var logs = progress.logs || {};
    var out = {};
    var end = endISO && diffDays(todayISO, endISO) > 0 ? endISO : todayISO;
    var from = fromISO && diffDays(fromISO, todayISO) > 0 ? fromISO : todayISO;
    if (diffDays(p.startDate, end) < 0) return out;

    var idx = 1;
    var cursor = p.startDate;
    var guard = 0;
    while (diffDays(cursor, end) >= 0 && guard++ < 7300) {
      var training = p.trainingWeekdays.indexOf(weekdayMon0(cursor)) >= 0;
      var log = logs[cursor] || null;
      var isPast = diffDays(cursor, todayISO) > 0;
      var isToday = !isPast && diffDays(todayISO, cursor) === 0;
      var done = !!(log && (log.status === 'done'));
      var restDone = !!(log && log.status === 'rest_done');
      var missed = !!(log && log.status === 'missed');

      if (diffDays(from, cursor) >= 0) {
        out[cursor] = {
          date: cursor,
          weekday: weekdayName(cursor),
          training: training,
          sessionIndex: idx,
          completed: training ? done : restDone,
          missed: missed,
          isPast: isPast,
          isToday: isToday,
          skipped: missed
        };
      }

      if (training && (!isPast || done)) idx++;
      cursor = addDays(cursor, 1);
    }
    return out;
  }

  function computeStreak(logs, todayISO) {
    var ok = function (iso) {
      var l = logs[iso];
      return !!(l && (l.status === 'done' || l.status === 'rest_done'));
    };
    var cursor = ok(todayISO) ? todayISO : addDays(todayISO, -1);
    var n = 0;
    while (ok(cursor) && n < 3650) { n++; cursor = addDays(cursor, -1); }
    return n;
  }

  function completedTrainingDays(progress) {
    var logs = (progress && progress.logs) || {};
    var n = 0;
    for (var k in logs) {
      if (Object.prototype.hasOwnProperty.call(logs, k) && logs[k] && logs[k].status === 'done') n++;
    }
    return n;
  }

  function weekRangeOf(todayISO) {
    var back = weekdayMon0(todayISO);
    var monday = addDays(todayISO, -back);
    var out = [];
    for (var i = 0; i < 7; i++) out.push(addDays(monday, i));
    return out;
  }

  var PlanEngine = {
    VERSION: 'v1',
    GOALS: GOALS, EXPERIENCE: EXPERIENCE, VENUES: VENUES,
    WEEKDAY_PRESETS: WEEKDAY_PRESETS, WEEKDAY_CN: WEEKDAY_CN, WEEKDAY_SHORT: WEEKDAY_SHORT,
    DB_SIZES: DB_SIZES, EXERCISES: EXERCISES, PATTERN_FALLBACK: PATTERN_FALLBACK,
    pad2: pad2, toISO: toISO, fromISO: fromISO, addDays: addDays, diffDays: diffDays,
    weekdayMon0: weekdayMon0, weekdayName: weekdayName, formatCN: formatCN,
    normalizeWeekdays: normalizeWeekdays, presetWeekdays: presetWeekdays, weekdaySummary: weekdaySummary,
    JOINTS: JOINTS, JOINT_CN: JOINT_CN, PATTERN_JOINTS: PATTERN_JOINTS,
    EXERCISE_JOINT_OVERRIDE: EXERCISE_JOINT_OVERRIDE, PATTERN_SAFE_ADVICE: PATTERN_SAFE_ADVICE,
    jointsOf: jointsOf, jointLabel: jointLabel,
    DIET_TAGS: DIET_TAGS, DIET_TAGS_CN: DIET_TAGS_CN, DIET_PATTERNS: DIET_PATTERNS,
    adaptationFor: adaptationFor, singleWeekAdaptation: singleWeekAdaptation, uniq: uniq, clampNum: clampNum,
    bmi: bmi, bodyClassFromBmi: bodyClassFromBmi, bodyClassLabel: bodyClassLabel,
    healthyWeightRange: healthyWeightRange, heightClass: heightClass, heightClassLabel: heightClassLabel,
    normalizeProfile: normalizeProfile, validateProfile: validateProfile,
    splitFor: splitFor, pickExercise: pickExercise,
    roundToStep: roundToStep, nearestFrom: nearestFrom, prescribeLoad: prescribeLoad, bumpReps: bumpReps,
    sessionFor: sessionFor, isTrainingDate: isTrainingDate, trainingWeekdays: trainingWeekdays,
    buildTimeline: buildTimeline, computeStreak: computeStreak,
    completedTrainingDays: completedTrainingDays, weekRangeOf: weekRangeOf
  };

  if (typeof globalThis !== 'undefined') globalThis.PlanEngine = PlanEngine;
})();
