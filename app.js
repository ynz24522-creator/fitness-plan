/* =========================================================================
   界面层
   ========================================================================= */
(function () {
  'use strict';
  var E = globalThis.PlanEngine;
  var KEY_PROFILE = 'fitnessPlan.v1.profile';
  var KEY_PROGRESS = 'fitnessPlan.v1.progress';

  var state = { profile: null, progress: null, tab: 'today', timer: null };

  /* ---------------- 存储 ---------------- */
  function safeGet(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function loadState() {
    /* 历史档案可能只有 daysPerWeek，读出时立即规范化，保证 trainingWeekdays 一定存在 */
    var rawProfile = safeGet(KEY_PROFILE);
    state.profile = rawProfile ? E.normalizeProfile(rawProfile) : null;
    state.progress = safeGet(KEY_PROGRESS) || { logs: {} };
    if (!state.progress.logs) state.progress.logs = {};
  }
  function saveProfile() { safeSet(KEY_PROFILE, state.profile); }
  function saveProgress() { safeSet(KEY_PROGRESS, state.progress); }

  function todayISO() { return E.toISO(new Date()); }
  function esc(s) { return String(s == null ? '' : s); }
  function flip(list, v) {
    var out = (list || []).slice(), i = out.indexOf(v);
    if (i >= 0) out.splice(i, 1); else out.push(v);
    return out;
  }

  /* ---------------- 动作示意动画：JS 驱动的火柴人骨架 ----------------
     关键帧格式 [躯干前倾, 髋屈, 膝屈, 肩屈, 肘屈, 整体升降]（单位：度 / 像素） */
  var POSES = {
    squat:            [[5, 0, 0, 8, 12, 0], [24, 72, 96, 58, 28, 0], [5, 0, 0, 8, 12, 0]],
    hinge:            [[5, 0, 6, 4, 10, 0], [46, 24, 26, 16, 14, 0], [5, 0, 6, 4, 10, 0]],
    lunge:            [[5, 8, 14, 6, 10, 0], [8, 56, 72, 12, 16, 6], [5, 8, 14, 6, 10, 0]],
    horizontal_push:  [[4, 0, 4, 60, 84, 0], [4, 0, 4, 92, 18, 0], [4, 0, 4, 60, 84, 0]],
    vertical_push:    [[3, 0, 4, 22, 78, 0], [3, 0, 4, 166, 8, 0], [3, 0, 4, 22, 78, 0]],
    horizontal_pull:  [[12, 6, 12, 74, 66, 0], [12, 6, 12, 46, 122, 0], [12, 6, 12, 74, 66, 0]],
    vertical_pull:    [[3, 0, 4, 170, 8, 0], [3, 0, 4, 148, 72, 0], [3, 0, 4, 170, 8, 0]],
    glute:            [[12, 8, 18, 10, 10, 0], [16, 62, 58, 10, 10, 8], [12, 8, 18, 10, 10, 0]],
    core:             [[6, 4, 8, 20, 60, 0], [6, 4, 8, 20, 60, 2], [6, 4, 8, 20, 60, 0]],
    calf:             [[4, 0, 2, 6, 10, 0], [4, 0, 2, 6, 10, 7], [4, 0, 2, 6, 10, 0]],
    biceps:           [[5, 0, 4, 8, 122, 0], [5, 0, 4, 8, 36, 0], [5, 0, 4, 8, 122, 0]],
    triceps:          [[5, 0, 4, 82, 92, 0], [5, 0, 4, 82, 12, 0], [5, 0, 4, 82, 92, 0]],
    lateral_raise:    [[5, 0, 4, 4, 10, 0], [5, 0, 4, 86, 12, 0], [5, 0, 4, 4, 10, 0]],
    cardio:           [[5, 0, 0, 12, 22, 0], [5, 16, 22, 28, 38, 5], [5, 0, 0, 12, 22, 0]]
  };
  var animFrames = [], animHandle = null, animStart = 0;
  var ANIM_CYCLE = 2400;

  function animSvg(pattern, size, weighted) {
    return '<svg class="anim" width="' + size + '" height="' + size + '" viewBox="0 0 120 120" ' +
      'data-anim="' + pattern + '" data-weighted="' + (weighted ? '1' : '0') + '" aria-hidden="true">' +
      '<line class="p-torso"></line><line class="p-armu"></line><line class="p-armf"></line>' +
      '<line class="p-thigh"></line><line class="p-shin"></line>' +
      '<circle class="p-head"></circle><circle class="p-wt"></circle>' +
      '</svg>';
  }
  function up(x, y, len, a) { var r = a * Math.PI / 180; return [x - len * Math.sin(r), y - len * Math.cos(r)]; }
  function down(x, y, len, a) { var r = a * Math.PI / 180; return [x + len * Math.sin(r), y + len * Math.cos(r)]; }
  function setLine(el, a, b) {
    if (!el) return;
    el.setAttribute('x1', a[0].toFixed(1)); el.setAttribute('y1', a[1].toFixed(1));
    el.setAttribute('x2', b[0].toFixed(1)); el.setAttribute('y2', b[1].toFixed(1));
  }
  function setCircle(el, c, r) {
    if (!el) return;
    el.setAttribute('cx', c[0].toFixed(1)); el.setAttribute('cy', c[1].toFixed(1)); el.setAttribute('r', r);
  }
  function applyPose(parts, pose) {
    var lean = pose[0], hipF = pose[1], kneeF = pose[2], shF = pose[3], elF = pose[4], lift = pose[5] || 0;
    var hip = [58, 64 - lift];
    var sh = up(hip[0], hip[1], 26, lean);
    var head = up(sh[0], sh[1], 11, lean);
    var knee = down(hip[0], hip[1], 20, hipF);
    var ankle = down(knee[0], knee[1], 20, hipF - kneeF);
    var elbow = down(sh[0], sh[1], 16, shF);
    var wrist = down(elbow[0], elbow[1], 15, shF + elF);
    setLine(parts.torso, hip, sh);
    setLine(parts.armU, sh, elbow);
    setLine(parts.armF, elbow, wrist);
    setLine(parts.thigh, hip, knee);
    setLine(parts.shin, knee, ankle);
    setCircle(parts.head, head, 6);
    if (parts.wt && parts.weighted) setCircle(parts.wt, wrist, 3.2);
    else if (parts.wt) setCircle(parts.wt, [-20, -20], 0);
  }
  function poseAt(poses, t) {
    var n = poses.length, seg = 1 / (n - 1);
    var i = Math.min(n - 2, Math.floor(t / seg));
    var local = Math.min(1, Math.max(0, (t - i * seg) / seg));
    var e = local < 0.5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2;
    var a = poses[i], b = poses[i + 1], out = [];
    for (var k = 0; k < a.length; k++) out.push(a[k] + ((b[k] || 0) - a[k]) * e);
    return out;
  }
  function mountAnimations() {
    animFrames = [];
    if (!document.querySelectorAll) return;
    var nodes = document.querySelectorAll('svg[data-anim]');
    Array.prototype.forEach.call(nodes, function (svg) {
      if (!svg.querySelector) return;
      var parts = {
        torso: svg.querySelector('.p-torso'), head: svg.querySelector('.p-head'),
        armU: svg.querySelector('.p-armu'), armF: svg.querySelector('.p-armf'),
        thigh: svg.querySelector('.p-thigh'), shin: svg.querySelector('.p-shin'),
        wt: svg.querySelector('.p-wt'), weighted: svg.getAttribute('data-weighted') === '1'
      };
      if (!parts.torso) return;
      animFrames.push({ parts: parts, poses: POSES[svg.getAttribute('data-anim')] || POSES.core });
    });
    if (animFrames.length && !animHandle && typeof requestAnimationFrame === 'function') {
      animStart = 0;
      animHandle = requestAnimationFrame(animTick);
    }
  }
  function animTick(now) {
    if (!animStart) animStart = now;
    var t = ((now - animStart) % ANIM_CYCLE) / ANIM_CYCLE;
    for (var i = 0; i < animFrames.length; i++) {
      applyPose(animFrames[i].parts, poseAt(animFrames[i].poses, t));
    }
    if (animFrames.length) animHandle = requestAnimationFrame(animTick);
    else animHandle = null;
  }

  /* ---------------- 计时器 ---------------- */
  var timerRemain = 0, timerHandle = null, timerRunning = false;

  function fmtSec(s) {
    var m = Math.floor(s / 60), x = s % 60;
    return E.pad2(m) + ':' + E.pad2(x);
  }
  function beep() {
    try {
      var Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      [0, 0.22, 0.44].forEach(function (delay) {
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.value = 0.001;
        osc.connect(gain); gain.connect(ctx.destination);
        var t0 = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        osc.start(t0); osc.stop(t0 + 0.22);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1200);
    } catch (e) {}
  }
  function showTimer(sec, label) {
    timerRemain = sec;
    timerRunning = true;
    document.getElementById('timerLabel').textContent = label || '组间休息';
    document.getElementById('timerDisplay').textContent = fmtSec(timerRemain);
    document.getElementById('timerToggle').textContent = '暂停';
    document.getElementById('timerBar').classList.remove('hide');
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(tick, 1000);
  }
  function tick() {
    if (!timerRunning) return;
    timerRemain--;
    if (timerRemain <= 0) {
      timerRemain = 0;
      timerRunning = false;
      clearInterval(timerHandle); timerHandle = null;
      document.getElementById('timerDisplay').textContent = fmtSec(0);
      document.getElementById('timerToggle').textContent = '重新开始';
      document.getElementById('timerLabel').textContent = '完成！开始下一组';
      beep();
      return;
    }
    document.getElementById('timerDisplay').textContent = fmtSec(timerRemain);
  }
  function toggleTimer() {
    if (!timerHandle && timerRemain === 0) {
      document.getElementById('timerBar').classList.add('hide');
      return;
    }
    timerRunning = !timerRunning;
    document.getElementById('timerToggle').textContent = timerRunning ? '暂停' : '继续';
  }
  function resetTimer() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null; timerRunning = false; timerRemain = 0;
    document.getElementById('timerBar').classList.add('hide');
  }

  /* ---------------- 打卡 ---------------- */
  function checkIn(dateISO, status, sessionIndex) {
    state.progress.logs[dateISO] = { status: status, sessionIndex: sessionIndex, at: new Date().toISOString() };
    saveProgress();
    render();
  }
  function skipDay(dateISO, sessionIndex) {
    state.progress.logs[dateISO] = { status: 'missed', sessionIndex: sessionIndex, at: new Date().toISOString() };
    saveProgress();
    render();
  }
  function resetAll() {
    state.progress = { logs: {} };
    saveProgress();
    render();
  }

  /* ---------------- 伤病限制 ---------------- */
  function tempJoints(dateISO) {
    var t = (state.progress && state.progress.tempJoints) || {};
    return t[dateISO] || [];
  }
  function toggleTempJoint(joint) {
    if (!state.progress.tempJoints) state.progress.tempJoints = {};
    var d = todayISO();
    var cur = (state.progress.tempJoints[d] || []).slice();
    var i = cur.indexOf(joint);
    if (i >= 0) cur.splice(i, 1); else cur.push(joint);
    state.progress.tempJoints[d] = cur;
    saveProgress();
    render();
  }
  function jointButtons(active, perm, attr) {
    return E.JOINTS.map(function (j) {
      var on = active.indexOf(j) >= 0;
      return '<button type="button" class="joint' + (on ? ' on' : '') + (perm.indexOf(j) >= 0 ? ' perm' : '') +
        '" ' + attr + '="' + j + '" aria-pressed="' + on + '">' + E.JOINT_CN[j] +
        (perm.indexOf(j) >= 0 ? ' ·' : '') + '</button>';
    }).join('');
  }
  function injuryBar(p, dateISO, session) {
    var temp = tempJoints(dateISO);
    var all = E.uniq(p.injuries.concat(temp));
    return '<div class="card">' +
      '<div class="fb-label">今天有哪个部位不舒服？（只影响今天）</div>' +
      '<div class="joint-row">' + jointButtons(temp, p.injuries, 'data-joint') + '</div>' +
      (all.length
        ? '<div class="hint">正在规避：' + E.jointLabel(all) + '（带 · 的是「我的」里的常驻限制）' +
          (session && session.skippedCount ? '，本次已跳过 ' + session.skippedCount + ' 项' : '') + '</div>'
        : '<div class="hint">点一下即可让今天的计划自动避开该部位，计划照常继续。</div>') +
      '</div>';
  }

  /* ---------------- 训练反馈 ---------------- */
  function fbRow(key, label, opts, def) {
    return '<div class="fb-block"><div class="fb-label">' + label + '</div><div class="fb-opts" data-fb="' + key + '">' +
      opts.map(function (o) {
        return '<button type="button" class="opt" data-val="' + o[0] + '" aria-pressed="' + (o[0] === def) + '">' + o[1] + '</button>';
      }).join('') + '</div></div>';
  }
  function openFeedback(entry) {
    var host = document.getElementById('modalHost');
    var today = todayISO();
    if (!host) { checkIn(today, 'done', entry.sessionIndex); return; }
    var fb = { completion: 'all', rpe: '7', fatigue: 'ok', pain: false, joints: [] };
    host.innerHTML = '<div class="modal-card">' +
      '<div class="modal-head"><b>今天的训练感觉如何？</b><button class="modal-x" data-close="1">×</button></div>' +
      '<div class="hint">这些反馈会在下周结算时自动调整负重与组数；不想填可以直接打卡。</div>' +
      fbRow('completion', '完成度', [['all', '全部完成'], ['most', '大部分完成'], ['some', '只做了一部分']], 'all') +
      fbRow('rpe', '主观强度', [['5', '太轻松'], ['7', '刚好'], ['8', '有点难'], ['9.5', '太难']], '7') +
      fbRow('fatigue', '疲劳与睡眠', [['good', '好'], ['ok', '一般'], ['bad', '差']], 'ok') +
      '<div class="fb-block"><div class="fb-label">训练中有疼痛吗？</div>' +
        '<div class="fb-opts" data-fb="pain">' +
          '<button type="button" class="opt" data-pain="0" aria-pressed="true">没有</button>' +
          '<button type="button" class="opt" data-pain="1" aria-pressed="false">有</button>' +
        '</div>' +
        '<div class="joint-row" id="fb-joints" hidden>' + jointButtons([], [], 'data-fjoint') + '</div>' +
      '</div>' +
      '<button class="btn accent block" id="fbSubmit">提交反馈并打卡</button>' +
      '<button class="btn ghost block" id="fbSkipFeedback">跳过反馈，直接打卡</button>' +
      '</div>';
    host.hidden = false;

    function paintOpts(group, val) {
      Array.prototype.forEach.call(host.querySelectorAll('[data-fb="' + group + '"] .opt'), function (b) {
        var on = group === 'pain' ? b.getAttribute('data-pain') === String(val ? 1 : 0)
                                  : b.getAttribute('data-val') === String(val);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    function paintJoints() {
      Array.prototype.forEach.call(host.querySelectorAll('[data-fjoint]'), function (b) {
        b.setAttribute('aria-pressed', fb.joints.indexOf(b.getAttribute('data-fjoint')) >= 0 ? 'true' : 'false');
        b.classList.toggle('on', fb.joints.indexOf(b.getAttribute('data-fjoint')) >= 0);
      });
    }
    host.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-close')) { closeModal(); return; }
      var g = t.parentNode && t.parentNode.getAttribute ? t.parentNode.getAttribute('data-fb') : null;
      if (g === 'pain') {
        fb.pain = t.getAttribute('data-pain') === '1';
        paintOpts('pain', fb.pain);
        var row = host.querySelector('#fb-joints');
        if (row) row.hidden = !fb.pain;
        return;
      }
      if (g) { fb[g] = t.getAttribute('data-val'); paintOpts(g, fb[g]); return; }
      var fj = t.getAttribute('data-fjoint');
      if (fj) {
        var i = fb.joints.indexOf(fj);
        if (i >= 0) fb.joints.splice(i, 1); else fb.joints.push(fj);
        paintJoints();
      }
    });
    host.querySelector('#fbSubmit').onclick = function () {
      state.progress.feedback = state.progress.feedback || {};
      state.progress.feedback[today] = {
        completion: fb.completion, rpe: Number(fb.rpe), fatigue: fb.fatigue,
        pain: { has: fb.pain, joints: fb.pain ? fb.joints.slice() : [] },
        at: new Date().toISOString()
      };
      /* 反馈里报了疼痛，就把该部位加入下次训练的临时规避 */
      if (fb.pain && fb.joints.length) {
        state.progress.tempJoints = state.progress.tempJoints || {};
        var nx = E.addDays(today, 1);
        state.progress.tempJoints[nx] = E.uniq((state.progress.tempJoints[nx] || []).concat(fb.joints));
      }
      closeModal();
      checkIn(today, 'done', entry.sessionIndex);
    };
    host.querySelector('#fbSkipFeedback').onclick = function () {
      closeModal();
      checkIn(today, 'done', entry.sessionIndex);
    };
  }

  /* ---------------- 渲染：今日 ---------------- */
  function chipList(p) {
    var b = E.bmi(p.heightCm, p.weightKg);
    var bc = E.bodyClassFromBmi(b);
    return '<div class="chips">' +
      '<span class="chip">' + E.GOALS[p.goal].label + '</span>' +
      '<span class="chip">每周 ' + p.daysPerWeek + ' 天 · ' + E.weekdaySummary(p.trainingWeekdays) + '</span>' +
      '<span class="chip">' + E.EXPERIENCE[p.experience].label + '</span>' +
      '<span class="chip n">' + E.VENUES[p.venue] + '</span>' +
      '<span class="chip ' + (bc === 'normal' ? 'g' : 'y') + '">BMI ' + b.toFixed(1) + ' ' + E.bodyClassLabel(bc) + '</span>' +
      '</div>';
  }

  function exerciseCard(ex) {
    if (ex.skipped) {
      return '<div class="ex skipped">' +
        '<div class="row1"><div class="nm">' + esc(ex.name) + '</div><div class="mx">' + esc(ex.reason) + '</div></div>' +
        '<div class="cues">' + esc(ex.cues) + '</div>' +
        (ex.notes || []).map(function (n) { return '<div class="note">' + esc(n) + '</div>'; }).join('') +
        '</div>';
    }
    var spec = '<span>' + ex.sets + ' 组</span><span>× ' + ex.reps + '</span>' +
      '<span class="load">' + ex.loadText + (ex.loadUnit && ex.loadUnit !== '自重' && ex.weighted ? '（' + ex.loadUnit + '）' : '') + '</span>' +
      (ex.restSec ? '<span>休息 ' + ex.restSec + ' 秒</span>' : '');
    return '<div class="ex">' +
      '<div class="ex-grid">' +
        '<button class="anim-btn" data-demo="' + esc(ex.id) + '" title="点击放大动作示意">' +
          animSvg(ex.pattern, 72, ex.weighted) + '</button>' +
        '<div class="ex-body">' +
          '<div class="row1"><div class="nm">' + esc(ex.name) + '</div><div class="mx">' + esc(ex.muscle) + '</div></div>' +
          '<div class="spec">' + spec + '</div>' +
          '<div class="cues">' + esc(ex.cues) + '</div>' +
          (ex.notes || []).map(function (n) { return '<div class="note">' + esc(n) + '</div>'; }).join('') +
          (ex.restSec ? '<div class="foot"><button class="btn ghost" data-rest="' + ex.restSec + '">开始休息 ' + ex.restSec + 's</button></div>' : '') +
        '</div>' +
      '</div></div>';
  }
  function videoUrl(name) {
    return 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(name + ' 标准动作');
  }
  function findCurrentExercise(id) {
    var s = state.currentSession;
    if (!s) return null;
    var all = (s.exercises || []).concat(s.finisher ? [s.finisher] : []);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function openDemo(id) {
    var ex = findCurrentExercise(id);
    if (!ex) return;
    var host = document.getElementById('modalHost');
    if (!host) return;
    host.innerHTML = '<div class="modal-card">' +
      '<div class="modal-head"><b>' + esc(ex.name) + '</b><button class="modal-x" data-close="1">×</button></div>' +
      '<div class="modal-anim">' + animSvg(ex.pattern, 240, ex.weighted) + '</div>' +
      '<div class="mx center">' + esc(ex.muscle) + (ex.patternLabel ? ' · ' + esc(ex.patternLabel) : '') + '</div>' +
      (ex.skipped ? '' : '<div class="spec center"><span>' + ex.sets + ' 组 × ' + ex.reps + '</span><span class="load">' + esc(ex.loadText) + '</span>' +
        (ex.restSec ? '<span>休息 ' + ex.restSec + ' 秒</span>' : '') + '</div>') +
      '<div class="cues">' + esc(ex.cues) + '</div>' +
      (ex.notes || []).map(function (n) { return '<div class="note">' + esc(n) + '</div>'; }).join('') +
      '<a class="btn primary block link-btn" target="_blank" rel="noopener noreferrer" href="' + videoUrl(ex.name) + '">看真人示范（需联网）</a>' +
      '<div class="hint">动作示意只演示主要关节轨迹，细节以文字要领与真人视频为准。</div>' +
      '</div>';
    host.hidden = false;
    mountAnimations();
  }
  function closeModal() {
    var host = document.getElementById('modalHost');
    if (!host) return;
    host.hidden = true; host.innerHTML = '';
  }

  function renderToday() {
    var el = document.getElementById('view-today');
    if (!state.profile) {
      el.innerHTML = '<div class="card empty"><h3>先设置你的身体数据</h3>' +
        '<p>填写身高、体重、目标与训练条件，App 会为你生成精确到每一天、可以一直练下去的健身计划。</p>' +
        '<button class="btn primary block" data-goto="me">去填写资料</button></div>';
      return;
    }
    var p = state.profile;
    var today = todayISO();
    var tl = E.buildTimeline(p, state.progress, today, today);
    var entry = tl[today];
    var streak = E.computeStreak(state.progress.logs, today);

    if (!entry) {
      el.innerHTML = '<div class="card hero"><div class="d1">计划尚未开始</div>' +
        '<div class="d2">' + E.formatCN(p.startDate) + '</div>' +
        '<div class="d3">计划将从这一天开始，每天都有明确安排。</div></div>' +
        '<div class="card"><div class="kv"><span>起始日期</span><b>' + p.startDate + '</b></div>' +
        '<div class="kv"><span>每周训练</span><b>' + p.daysPerWeek + ' 天</b></div>' +
        '<div class="kv"><span>训练日</span><b>' + p.trainingWeekdays.map(function (d) { return E.WEEKDAY_CN[d]; }).join('、') + '</b></div></div>';
      return;
    }

    var html = '';
    if (entry.training) {
      var s = E.sessionFor(p, entry.sessionIndex, {
        progress: state.progress, todayISO: today, extraJoints: tempJoints(today)
      });
      state.currentSession = s;
      html += '<div class="card hero">' +
        '<div class="d1">' + E.formatCN(today) + '</div>' +
        '<div class="d2">第 ' + s.index + ' 天 · 第 ' + s.week + ' 周</div>' +
        '<div class="d3">第 ' + s.block + ' 个中周期 · ' + (s.isDeload ? '减载周' : '强化周') + ' ｜ ' + esc(s.title) + '</div>' +
        chipList(p) + '</div>';

      if (entry.completed) {
        html += '<div class="banner ok">今日训练已完成，连续打卡 ' + streak + ' 天。下一个训练日继续加油。</div>';
      } else if (entry.missed) {
        html += '<div class="banner warn">今天已标记为跳过，训练内容顺延到下一个训练日，计划不会中断。</div>';
      } else {
        html += '<div class="banner info">今天是训练日，当前连续打卡 ' + streak + ' 天。完成全部动作后记得打卡。</div>';
      }
      s.warnings.forEach(function (w) { html += '<div class="banner warn">' + esc(w) + '</div>'; });

      html += injuryBar(p, today, s);
      html += '<h2 class="sec">热身 · 约 5 分钟</h2><div class="card"><div class="cues">' + esc(s.warmup) + '</div></div>';
      var shown = s.exercises.length - s.skippedCount;
      html += '<h2 class="sec">正式训练 · ' + shown + ' 个动作' + (s.skippedCount ? '（跳过 ' + s.skippedCount + ' 项）' : '') + '</h2>';
      html += s.exercises.map(exerciseCard).join('');
      if (s.finisher) {
        html += '<h2 class="sec">有氧收尾</h2>' + exerciseCard(s.finisher);
      }
      html += '<h2 class="sec">拉伸放松</h2><div class="card"><div class="cues">' + esc(s.cooldown) + '</div></div>';

      if (!entry.completed && !entry.missed) {
        html += '<div class="actions"><button class="btn accent" id="btnDone">完成今日训练</button>' +
          '<button class="btn ghost" id="btnSkip">今天跳过，顺延</button></div>';
      } else if (entry.missed) {
        html += '<div class="actions"><button class="btn accent" id="btnDone">我练完了，撤销跳过</button></div>';
      } else {
        html += '<div class="actions"><button class="btn ghost" id="btnUndo">撤销今日打卡</button></div>';
      }
    } else {
      var next = E.buildTimeline(p, state.progress, today, E.addDays(today, 7));
      var nextTrain = null;
      for (var i = 1; i <= 7 && !nextTrain; i++) {
        var key = E.addDays(today, i);
        if (next[key] && next[key].training) nextTrain = next[key];
      }
      html += '<div class="card hero">' +
        '<div class="d1">' + E.formatCN(today) + '</div>' +
        '<div class="d2">今天是休息日</div>' +
        '<div class="d3">恢复同样重要，让肌肉在休息中变强。</div>' +
        chipList(p) + '</div>';
      if (entry.completed) html += '<div class="banner ok">今日恢复打卡已完成，连续打卡 ' + streak + ' 天。</div>';
      else html += '<div class="banner info">今天是休息日，当前连续打卡 ' + streak + ' 天。</div>';
      if (nextTrain) {
        var ns = E.sessionFor(p, nextTrain.sessionIndex);
        html += '<div class="card"><div class="kv"><span>下一次训练</span><b>' + E.formatCN(nextTrain.date) + ' 第 ' + ns.index + ' 天</b></div>' +
          '<div class="kv"><span>训练内容</span><b>' + esc(ns.title) + '</b></div>' +
          '<div class="kv"><span>重点</span><b>' + esc(ns.focus) + '</b></div></div>';
      }
      html += '<h2 class="sec">主动恢复建议</h2><div class="card">' +
        '<div class="cues">快走 20–30 分钟（能正常说话的速度）+ 全身拉伸 10 分钟。' +
        '如果昨天练得很累，也可以完全休息、保证睡眠。</div></div>';
      if (!entry.completed) {
        html += '<div class="actions"><button class="btn accent" id="btnRest">完成今日恢复打卡</button></div>';
      } else {
        html += '<div class="actions"><button class="btn ghost" id="btnRestUndo">撤销今日打卡</button></div>';
      }
    }
    el.innerHTML = html;

    var bd = document.getElementById('btnDone');
    if (bd) bd.onclick = function () { openFeedback(entry); };
    var bs = document.getElementById('btnSkip');
    if (bs) bs.onclick = function () { skipDay(today, entry.sessionIndex); };
    var bu = document.getElementById('btnUndo');
    if (bu) bu.onclick = function () { delete state.progress.logs[today]; saveProgress(); render(); };
    var br = document.getElementById('btnRest');
    if (br) br.onclick = function () { checkIn(today, 'rest_done', entry.sessionIndex); };
    var bru = document.getElementById('btnRestUndo');
    if (bru) bru.onclick = function () { delete state.progress.logs[today]; saveProgress(); render(); };
    mountAnimations();
  }

  /* ---------------- 渲染：计划 ---------------- */
  /* ---------------- 渲染：饮食 ---------------- */
  function renderDiet() {
    var el = document.getElementById('view-diet');
    if (!state.profile) {
      el.innerHTML = '<div class="card empty"><h3>还没有饮食方案</h3>' +
        '<p>先在「我的」里填写身高、体重、年龄与饮食偏好，App 会按你的目标生成每日配餐。</p>' +
        '<button class="btn primary block" data-goto="me">去填写资料</button></div>';
      return;
    }
    var p = state.profile;
    var today = todayISO();
    var isTraining = E.isTrainingDate(today, p);
    var plan = DietEngine.dailyPlan(p, today, isTraining, state.dietSalt || '');
    state.dietPlan = plan;
    var t = plan.totals, tg = plan.target;

    var html = '<div class="card hero">' +
      '<div class="d1">' + E.formatCN(today) + ' · ' + (isTraining ? '训练日' : '休息日') + '</div>' +
      '<div class="d2">' + tg.kcal + ' kcal</div>' +
      '<div class="d3">基础代谢 ' + plan.bmr + ' kcal · 每日消耗 ' + plan.tdee + ' kcal</div>' +
      '<div class="chips">' +
        '<span class="chip">蛋白 ' + tg.protein + ' g</span>' +
        '<span class="chip g">碳水 ' + tg.carb + ' g</span>' +
        '<span class="chip y">脂肪 ' + tg.fat + ' g</span>' +
      '</div></div>';

    html += '<div class="card">' +
      '<div class="kv"><span>配餐实际热量</span><b>' + t.kcal + ' kcal（偏差 ' + (plan.accuracy * 100).toFixed(1) + '%）</b></div>' +
      '<div class="kv"><span>实际蛋白</span><b>' + t.protein + ' g（目标 ' + tg.protein + ' g）</b></div>' +
      '<div class="kv"><span>实际碳水 / 脂肪</span><b>' + t.carb + ' / ' + t.fat + ' g</b></div>' +
      '</div>';
    html += '<div class="actions"><button class="btn primary" id="btnShuffle">换一套</button>' +
      '<button class="btn ghost" data-goto="me">调整饮食偏好</button></div>';

    plan.meals.forEach(function (m) {
      html += '<h2 class="sec">' + esc(m.name) + ' · ' + m.kcal + ' kcal</h2><div class="card">';
      m.items.forEach(function (it) {
        html += '<div class="food"><span class="fname">' + esc(it.name) + '</span>' +
          '<span class="famt">' + it.grams + ' ' + esc(it.unit) + '</span>' +
          '<span class="fkcal">' + it.kcal + ' kcal</span></div>';
      });
      html += '<div class="hint">蛋白 ' + m.protein + ' g · 碳水 ' + m.carb + ' g · 脂肪 ' + m.fat + ' g</div></div>';
    });

    if (plan.notes.length) {
      html += '<h2 class="sec">说明</h2><div class="card">' +
        plan.notes.map(function (n) { return '<div class="hint">· ' + esc(n) + '</div>'; }).join('') + '</div>';
    }
    html += '<div class="card"><div class="hint">配餐为通用营养参考，不构成医疗或营养处方。' +
      '如有糖尿病、肾病、孕期等特殊情况，请遵医嘱调整。</div></div>';
    el.innerHTML = html;

    var sh = document.getElementById('btnShuffle');
    if (sh) sh.onclick = function () { state.dietSalt = 's' + Date.now(); render(); };
  }

  /* ---------------- 渲染：计划 ---------------- */
  function renderPlan() {
    var el = document.getElementById('view-plan');
    if (!state.profile) {
      el.innerHTML = '<div class="card empty"><h3>还没有计划</h3><p>先在“我的”里填写资料，即可生成连续到每一天的训练安排。</p>' +
        '<button class="btn primary block" data-goto="me">去填写资料</button></div>';
      return;
    }
    var p = state.profile;
    var today = todayISO();
    var horizon = E.addDays(today, 6);
    var tl = E.buildTimeline(p, state.progress, today, horizon);
    var week = E.weekRangeOf(today);
    var weekTl = E.buildTimeline(p, state.progress, today, week[6], week[0]);

    var html = '<h2 class="sec">未来 7 天</h2>';
    for (var i = 0; i < 7; i++) {
      var d = E.addDays(today, i);
      var e = tl[d];
      if (!e) {
        html += '<div class="day"><div class="wd"><b>' + E.weekdayName(d) + '</b><i>' + d.slice(5) + '</i></div>' +
          '<div class="info"><b>计划开始前</b><p>计划将于 ' + p.startDate + ' 开始</p></div><div class="tag rs">未开始</div></div>';
        continue;
      }
      var s = E.sessionFor(p, e.sessionIndex);
      var tag, sub;
      if (e.training) {
        if (e.completed) { tag = '<div class="tag ok">已完成</div>'; }
        else if (e.missed) { tag = '<div class="tag ms">已跳过</div>'; }
        else { tag = '<div class="tag tr">' + (i === 0 ? '今天' : '训练') + '</div>'; }
        sub = '第 ' + s.index + ' 天 · ' + esc(s.title) + ' · ' + s.exercises.length + ' 个动作 · ' + s.exercises.reduce(function (a, x) { return a + x.sets; }, 0) + ' 组';
      } else {
        tag = e.completed ? '<div class="tag ok">已打卡</div>' : '<div class="tag rs">休息</div>';
        sub = '主动恢复：快走 20–30 分钟 + 全身拉伸 10 分钟';
      }
      var wd = E.WEEKDAY_CN[E.weekdayMon0(d)];
      html += '<div class="day' + (i === 0 ? ' today' : '') + '">' +
        '<div class="wd"><b>' + (i === 0 ? '今天' : wd) + '</b><i>' + d.slice(5) + '</i></div>' +
        '<div class="info"><b>' + (i === 0 ? E.formatCN(d) : wd + ' ' + d.slice(5)) + '</b><p>' + sub + '</p></div>' + tag + '</div>';
    }

    html += '<h2 class="sec">本周日历</h2><div class="card"><div class="week">';
    week.forEach(function (d) {
      var e = weekTl[d];
      var cls = 'cell', mark = '—';
      if (e) {
        if (d === today) cls += ' today';
        if (e.missed) { cls += ' miss'; mark = '跳过'; }
        else if (e.completed) { cls += ' done'; mark = '✓'; }
        else if (e.training) { cls += ' tr'; mark = '训练'; }
        else { cls += ' rs'; mark = '休息'; }
      }
      html += '<div class="' + cls + '"><div class="cd">' + E.WEEKDAY_CN[E.weekdayMon0(d)].slice(1) + '</div>' +
        '<div class="cn">' + Number(d.slice(8)) + '</div><div class="cm">' + mark + '</div></div>';
    });
    html += '</div></div>';

    var cur = E.sessionFor(p, (tl[today] ? tl[today].sessionIndex : 1));
    html += '<h2 class="sec">中周期概览（4 周一个周期）</h2><div class="card">' +
      '<div class="kv"><span>当前周期</span><b>第 ' + cur.block + ' 个中周期 · 第 ' + cur.weekInBlock + ' 周</b></div>' +
      '<div class="kv"><span>本周强度系数</span><b>' + cur.progressionFactor.toFixed(2) + '×</b></div>' +
      '<div class="bars">';
    var setsArr = E.EXPERIENCE[p.experience].sets;
    for (var w = 1; w <= 4; w++) {
      var h = Math.round(setsArr[w - 1] / 5 * 44);
      html += '<div class="bar' + (w === cur.weekInBlock ? ' now' : '') + (w === 4 ? ' deload' : '') + '">' +
        '<b>第 ' + w + ' 周</b><div class="stick"><i style="height:' + h + 'px"></i></div>' +
        '<small>' + (w === 4 ? '减载' : setsArr[w - 1] + ' 组') + '</small></div>';
    }
    html += '</div><div class="cues" style="margin-top:11px">第 1–3 周逐步加量，第 4 周主动减载恢复；' +
      '进入第 ' + (cur.block + 1) + ' 个中周期后，负重整体再提高约 3%，可持续长期推进。</div></div>';

    /* 反馈与自适应调整 */
    var fb = state.progress.feedback || {};
    var fbDates = Object.keys(fb).sort().slice(-6).reverse();
    var adapt = E.adaptationFor(p, state.progress, cur.week, today);
    html += '<h2 class="sec">反馈与调整</h2><div class="card">';
    if (adapt.applied) {
      html += '<div class="kv"><span>本周调整</span><b>负重 ×' + adapt.loadFactor.toFixed(2) +
        '，组数 ' + (adapt.setDelta >= 0 ? '+' : '') + adapt.setDelta + '，休息 ' +
        (adapt.restDelta >= 0 ? '+' : '') + adapt.restDelta + ' 秒</b></div>';
      adapt.reasons.slice(-2).forEach(function (r) {
        html += '<div class="hint">· 第 ' + r.week + ' 周：' + esc(r.reason) + '</div>';
      });
    } else {
      html += '<div class="hint">还没有触发自动调整。打卡时填写反馈，满一周后会自动结算。</div>';
    }
    if (fbDates.length) {
      html += '<div style="margin-top:10px"></div>';
      fbDates.forEach(function (d) {
        var f = fb[d];
        var rpeTxt = { 5: '太轻松', 7: '刚好', 8: '有点难', 9.5: '太难' }[f.rpe] || f.rpe;
        var compTxt = { all: '全部完成', most: '大部分完成', some: '只做了一部分' }[f.completion] || f.completion;
        html += '<div class="kv"><span>' + d.slice(5) + '</span><b>' + compTxt + ' · ' + rpeTxt +
          (f.pain && f.pain.has ? ' · 疼痛：' + E.jointLabel(f.pain.joints) : '') + '</b></div>';
      });
    } else {
      html += '<div class="kv"><span>暂无反馈记录</span><b>—</b></div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  /* ---------------- 渲染：我的 ---------------- */
  function renderMe() {
    var el = document.getElementById('view-me');
    var p = state.profile || E.normalizeProfile({
      heightCm: 170, weightKg: 65, goal: 'recomp', daysPerWeek: 3,
      experience: 'beginner', venue: 'home_bodyweight', startDate: todayISO()
    });
    var b = E.bmi(p.heightCm, p.weightKg);
    var bc = E.bodyClassFromBmi(b);
    var hc = E.heightClass(p.heightCm);
    var range = E.healthyWeightRange(p.heightCm);
    var hasLogs = state.progress && Object.keys(state.progress.logs).length > 0;

    el.innerHTML =
      '<h2 class="sec">身体与目标</h2>' +
      '<div class="card">' +
        '<div class="grid2">' +
          '<label class="f"><span>身高（cm）</span><input id="f-h" type="number" min="100" max="250" step="0.5" value="' + p.heightCm + '"></label>' +
          '<label class="f"><span>体重（kg）</span><input id="f-w" type="number" min="30" max="250" step="0.1" value="' + p.weightKg + '"></label>' +
        '</div>' +
        '<label class="f"><span>训练目标</span><select id="f-goal">' + Object.keys(E.GOALS).map(function (k) {
          return '<option value="' + k + '"' + (p.goal === k ? ' selected' : '') + '>' + E.GOALS[k].label + '</option>';
        }).join('') + '</select></label>' +
        '<div class="f"><span>每周训练日（已选 <b id="wd-count">' + p.trainingWeekdays.length + '</b> 天）</span>' +
          '<div class="preset-row" id="wd-presets">' + [1, 2, 3, 4, 5, 6, 7].map(function (n) {
            return '<button type="button" class="preset" data-preset="' + n + '" title="' +
              E.trainingWeekdays(n).map(function (d) { return E.WEEKDAY_CN[d]; }).join('、') + '">' + n + ' 天</button>';
          }).join('') + '</div>' +
          '<div class="wd-picker" id="wd-picker">' + [0, 1, 2, 3, 4, 5, 6].map(function (i) {
            return '<button type="button" class="wd-btn" data-wd="' + i + '" aria-pressed="' +
              (p.trainingWeekdays.indexOf(i) >= 0) + '" title="' + E.WEEKDAY_CN[i] + '">' + E.WEEKDAY_SHORT[i] + '</button>';
          }).join('') + '</div>' +
          '<div class="wd-hint" id="wd-hint"></div>' +
        '</div>' +
        '<label class="f"><span>训练经验</span><select id="f-exp">' +
          '<option value="beginner"' + (p.experience === 'beginner' ? ' selected' : '') + '>新手（6 个月以内）</option>' +
          '<option value="intermediate"' + (p.experience === 'intermediate' ? ' selected' : '') + '>中级（6 个月 – 2 年）</option>' +
          '<option value="advanced"' + (p.experience === 'advanced' ? ' selected' : '') + '>进阶（2 年以上）</option>' +
        '</select></label>' +
        '<label class="f"><span>训练场地</span><select id="f-venue">' +
          '<option value="home_bodyweight"' + (p.venue === 'home_bodyweight' ? ' selected' : '') + '>居家徒手</option>' +
          '<option value="home_dumbbell"' + (p.venue === 'home_dumbbell' ? ' selected' : '') + '>居家哑铃</option>' +
          '<option value="gym"' + (p.venue === 'gym' ? ' selected' : '') + '>健身房</option>' +
        '</select></label>' +
        '<label class="f"><span>起始日期</span><input id="f-date" type="date" value="' + p.startDate + '"></label>' +
        '<div class="grid2">' +
          '<label class="f"><span>年龄</span><input id="f-age" type="number" min="14" max="90" step="1" value="' + p.age + '"></label>' +
          '<label class="f"><span>性别</span><select id="f-sex">' +
            '<option value="male"' + (p.sex === 'male' ? ' selected' : '') + '>男</option>' +
            '<option value="female"' + (p.sex === 'female' ? ' selected' : '') + '>女</option>' +
          '</select></label>' +
        '</div>' +
        '<div class="f"><span>受限或受伤部位（常驻，可多选）</span>' +
          '<div class="joint-row">' + jointButtons(p.injuries, [], 'data-injury') + '</div>' +
          '<div class="hint">勾选后，涉及该部位的动作会自动跳过并给出安全替代建议，计划照常继续，不会中断。</div>' +
        '</div>' +
        '<div class="f"><span>饮食偏好</span>' +
          '<div class="preset-row" id="diet-pattern">' + Object.keys(E.DIET_PATTERNS).map(function (k) {
            return '<button type="button" class="preset" data-diet="' + k + '" aria-pressed="' + (p.dietPattern === k) + '">' +
              E.DIET_PATTERNS[k] + '</button>';
          }).join('') + '</div>' +
          '<div class="joint-row" id="diet-excl">' + E.DIET_TAGS.map(function (t) {
            return '<button type="button" class="joint" data-excl="' + t + '" aria-pressed="' +
              (p.exclusions.indexOf(t) >= 0) + '">忌' + E.DIET_TAGS_CN[t] + '</button>';
          }).join('') + '</div>' +
          '<div class="preset-row" id="diet-meals" style="margin-top:9px">' + [[3, '每日 3 餐'], [5, '每日 3 餐 + 2 次加餐']].map(function (o) {
            return '<button type="button" class="preset" data-meals="' + o[0] + '" aria-pressed="' + (p.mealsPerDay === o[0]) + '">' + o[1] + '</button>';
          }).join('') + '</div>' +
        '</div>' +
        '<button class="btn primary block" id="btnSave">保存并生成计划</button>' +
      '</div>' +

      '<h2 class="sec">身体评估</h2>' +
      '<div class="card">' +
        '<div class="kv"><span>BMI</span><b>' + b.toFixed(1) + ' · ' + E.bodyClassLabel(bc) + '</b></div>' +
        '<div class="kv"><span>健康体重区间</span><b>' + range.min + ' – ' + range.max + ' kg</b></div>' +
        '<div class="kv"><span>身高分档</span><b>' + E.heightClassLabel(hc) + '</b></div>' +
        '<div class="kv"><span>每周训练日</span><b>' + E.weekdaySummary(p.trainingWeekdays) + '（' + p.trainingWeekdays.length + ' 天）</b></div>' +
        '<div class="kv"><span>连续打卡</span><b>' + E.computeStreak(state.progress.logs, todayISO()) + ' 天</b></div>' +
        '<div class="kv"><span>累计完成训练</span><b>' + E.completedTrainingDays(state.progress) + ' 次</b></div>' +
        '<div class="cues" style="margin-top:10px">BMI 只用于判断动作冲击量与起始配重，计划同时依据你的目标、经验与场地调整。</div>' +
      '</div>' +

      '<h2 class="sec">数据</h2>' +
      '<div class="card">' +
        '<div class="cues" style="margin-bottom:11px">所有数据只保存在这台设备的浏览器里，不会上传到任何服务器。</div>' +
        '<button class="btn danger block" id="btnReset">' + (hasLogs ? '清除打卡记录' : '清除全部数据') + '</button>' +
      '</div>';

    /* 星期开关：只更新自身 DOM，避免重绘整个表单而清掉用户已填的身高体重 */
    var draftWd = p.trainingWeekdays.slice();
    var wdHintEl = document.getElementById('wd-hint');
    function paintWeekdays(msg) {
      var count = draftWd.length;
      document.getElementById('wd-count').textContent = count;
      Array.prototype.forEach.call(document.querySelectorAll('#wd-picker .wd-btn'), function (b) {
        b.setAttribute('aria-pressed', draftWd.indexOf(Number(b.dataset.wd)) >= 0 ? 'true' : 'false');
      });
      Array.prototype.forEach.call(document.querySelectorAll('#wd-presets .preset'), function (b) {
        var n = Number(b.dataset.preset);
        var hit = n === count && E.trainingWeekdays(n).join(',') === draftWd.join(',');
        b.setAttribute('aria-pressed', hit ? 'true' : 'false');
      });
      var warn = false;
      var text;
      if (msg) { text = msg; warn = true; }
      else if (count === 7) { text = '已选 7 天：没有完整休息日，第 7 天会自动安排为低强度恢复日。'; warn = true; }
      else { text = '已选：' + E.weekdaySummary(draftWd) + '，每周 ' + count + ' 天'; }
      wdHintEl.textContent = text;
      wdHintEl.classList.toggle('warn', warn);
    }
    document.getElementById('wd-picker').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.wd-btn') : null;
      if (!b) return;
      var v = Number(b.dataset.wd);
      var at = draftWd.indexOf(v);
      if (at >= 0) {
        if (draftWd.length === 1) { paintWeekdays('至少要保留 1 个训练日。'); return; }
        draftWd.splice(at, 1);
      } else {
        draftWd.push(v);
        draftWd.sort(function (a, c) { return a - c; });
      }
      paintWeekdays();
    });
    document.getElementById('wd-presets').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.preset') : null;
      if (!b) return;
      draftWd = E.trainingWeekdays(Number(b.dataset.preset));
      paintWeekdays();
    });
    paintWeekdays();

    /* 伤病、饮食偏好的草稿：只切换按钮状态，不重绘表单 */
    state.draftInjuries = p.injuries.slice();
    state.draftExclusions = p.exclusions.slice();
    state.draftDietPattern = p.dietPattern;
    state.draftMealsPerDay = p.mealsPerDay;

    document.getElementById('btnSave').onclick = function () {
      var next = {
        heightCm: Number(document.getElementById('f-h').value),
        weightKg: Number(document.getElementById('f-w').value),
        goal: document.getElementById('f-goal').value,
        trainingWeekdays: draftWd.slice(),
        experience: document.getElementById('f-exp').value,
        venue: document.getElementById('f-venue').value,
        age: Number(document.getElementById('f-age').value),
        sex: document.getElementById('f-sex').value,
        injuries: state.draftInjuries.slice(),
        dietPattern: state.draftDietPattern,
        exclusions: state.draftExclusions.slice(),
        mealsPerDay: state.draftMealsPerDay,
        startDate: document.getElementById('f-date').value || todayISO()
      };
      var errs = E.validateProfile(next);
      if (errs.length) { alert(errs.join('\n')); return; }
      var prev = state.profile;
      var prevWd = prev ? E.trainingWeekdays(prev).join(',') : '';
      var structChanged = !prev || prevWd !== next.trainingWeekdays.join(',') || prev.startDate !== next.startDate;
      if (structChanged && hasLogs) {
        if (!confirm('修改了每周训练日或起始日期，已有的打卡记录将不再对应新计划，是否重置打卡记录？\n（点击“取消”则保留记录，但计划日期会重新计算）')) {
          /* 保留记录 */
        } else {
          state.progress = { logs: {} };
          saveProgress();
        }
      }
      state.profile = E.normalizeProfile(next);
      state.dietSalt = '';                 /* 档案变了就重新配一套 */
      state.progress.tempJoints = {};      /* 临时伤病标记随新档案清空 */
      saveProfile();
      state.tab = 'today';
      syncTabs();
      render();
    };
    document.getElementById('btnReset').onclick = function () {
      if (!confirm('确定清除本机保存的全部数据吗？此操作不可撤销。')) return;
      try { localStorage.removeItem(KEY_PROFILE); localStorage.removeItem(KEY_PROGRESS); } catch (e) {}
      state.profile = null; state.progress = { logs: {} };
      resetTimer();
      render();
    };
  }

  /* ---------------- 总渲染 ---------------- */
  function syncTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('nav.tabs button'), function (b) {
      b.classList.toggle('active', b.dataset.tab === state.tab);
    });
    document.getElementById('view-today').hidden = state.tab !== 'today';
    document.getElementById('view-plan').hidden = state.tab !== 'plan';
    document.getElementById('view-diet').hidden = state.tab !== 'diet';
    document.getElementById('view-me').hidden = state.tab !== 'me';
  }
  function render() {
    syncTabs();
    if (state.tab === 'today') renderToday();
    else if (state.tab === 'plan') renderPlan();
    else if (state.tab === 'diet') renderDiet();
    else renderMe();
    if (state.profile) {
      var tb = document.getElementById('timerBar');
      if (!timerHandle && timerRemain === 0) tb.classList.add('hide');
    }
  }

  document.querySelectorAll('nav.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { state.tab = b.dataset.tab; render(); window.scrollTo(0, 0); });
  });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('[data-rest],[data-goto],[data-demo],[data-joint],[data-close]') : null;
    if (!t) return;
    if (t.dataset.rest) showTimer(Number(t.dataset.rest), '组间休息');
    if (t.dataset.goto) { state.tab = t.dataset.goto; render(); window.scrollTo(0, 0); }
    if (t.dataset.demo) openDemo(t.dataset.demo);
    if (t.dataset.joint) toggleTempJoint(t.dataset.joint);
    if (t.dataset.close) closeModal();
    if (t.dataset.injury) {
      state.draftInjuries = flip(state.draftInjuries || [], t.dataset.injury);
      t.setAttribute('aria-pressed', state.draftInjuries.indexOf(t.dataset.injury) >= 0 ? 'true' : 'false');
      t.classList.toggle('on', state.draftInjuries.indexOf(t.dataset.injury) >= 0);
    }
    if (t.dataset.excl) {
      state.draftExclusions = flip(state.draftExclusions || [], t.dataset.excl);
      t.setAttribute('aria-pressed', state.draftExclusions.indexOf(t.dataset.excl) >= 0 ? 'true' : 'false');
      t.classList.toggle('on', state.draftExclusions.indexOf(t.dataset.excl) >= 0);
    }
    if (t.dataset.diet) {
      state.draftDietPattern = t.dataset.diet;
      Array.prototype.forEach.call(document.querySelectorAll('#diet-pattern .preset'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-diet') === state.draftDietPattern ? 'true' : 'false');
      });
    }
    if (t.dataset.meals) {
      state.draftMealsPerDay = Number(t.dataset.meals);
      Array.prototype.forEach.call(document.querySelectorAll('#diet-meals .preset'), function (b) {
        b.setAttribute('aria-pressed', Number(b.getAttribute('data-meals')) === state.draftMealsPerDay ? 'true' : 'false');
      });
    }
  });
  document.getElementById('timerToggle').addEventListener('click', toggleTimer);
  document.getElementById('timerReset').addEventListener('click', resetTimer);

  loadState();
  if (!state.profile) state.tab = 'me';
  render();
})();
