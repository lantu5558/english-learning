/* ============================================================
   儿童英语学习平台 · 孩子端 kid.js
   ============================================================ */
(function () {
  'use strict';
  var S = window.Store;
  var m = location.search.match(/kid=(junior|teen)/);
  var KID = m ? m[1] : 'junior';
  document.body.classList.add(KID === 'junior' ? 'junior' : 'teen');

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtSec(s) { return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60); }
  function findV(id) { var r = null; S.all().videos.forEach(function (x) { if (x.id === id) r = x; }); return r; }

  /* ---------- 今日任务完成态（云端同步，存于各自进度 watched） ---------- */

  /* ---------- 提示 / 弹窗 ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  window.closeModal = function () { $('#modal').classList.remove('show'); };
  function showModal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.add('show'); }
  $('#modal').addEventListener('click', function (e) { if (e.target === this) window.closeModal(); });

  function badgeHtml(id) {
    var b = null; S.badges().forEach(function (x) { if (x.id === id) b = x; });
    return b ? '<div style="margin:6px 0"><span style="font-size:26px">' + b.icon + '</span> <b>' + esc(b.name) + '</b><br><small class="muted">' + esc(b.desc) + '</small></div>' : '';
  }
  function notifyBadges(ids) {
    var html = ids.map(badgeHtml).join('');
    showModal('<h3>🏅 解锁新徽章！</h3>' + html +
      '<div class="btns"><button class="btn" onclick="closeModal()">收下啦</button></div>');
  }
  function flushStudy(sec) {
    if (!sec || sec <= 0) return;
    var nb = S.addStudySeconds(KID, sec);
    renderHeader();
    if (nb && nb.length) notifyBadges(nb);
  }

  /* ---------- 播放器 + 计时器（防作弊：切走自动暂停） ---------- */
  var player = { playing: false, timer: null, sessionSec: 0, unsaved: 0, isBaidu: false };

  function openPlayer(video) {
    if (!video) return;
    var info = S.parseVideo(video.url);
    if (!info) { toast('这个视频链接无法识别，需要 B站 / 腾讯视频 / 百度网盘 链接'); return; }
    // 是否被嵌在别的窗口里（预览面板 / 分享页的沙箱会拦截第三方视频和弹窗）
    var nested = window.self !== window.top;
    player.sessionSec = 0; player.unsaved = 0; player.playing = false;
    player.isBaidu = info.platform === 'baidu';
    $('#playerTitle').textContent = video.title;
    var openBtn = $('#playerOpen');
    var hint = $('#playerHint');

    openBtn.style.display = '';
    openBtn.onclick = function () {
      var u = S.openUrl(video);
      if (!u) return;
      var w = window.open(u, '_blank');
      if (!w) {  // 弹窗被浏览器拦截时的兜底：直接给出可点击的链接
        hint.style.display = '';
        hint.innerHTML = '💡 浏览器拦截了新窗口，请直接点这个链接在视频网站观看：<br><a href="' + u + '" target="_blank" rel="noopener" style="color:#5b7cfa;word-break:break-all">' + u + '</a>';
      }
    };

    if (info.platform === 'baidu') {
      $('#playerFrame').src = 'about:blank';
      $('#playerFrameWrap').style.display = 'none';
      var fb = $('#playerFallback');
      fb.style.display = '';
      fb.innerHTML = '☁️ 这是 <b>百度网盘</b> 里的视频，网站里没法直接播放。<br>点下面按钮跳到百度网盘观看（需要登录你的网盘账号' +
        (video.pwd ? '，已自动填好提取码 <b>' + esc(video.pwd) + '</b>' : '，若视频设了提取码请手动输入') + '）。';
      openBtn.textContent = '↗ 在百度网盘打开';
      hint.style.display = '';
      hint.textContent = '💡 百度网盘免费账号播放大文件可能限速，建议在网盘 App 里看更流畅';
    } else if (nested) {
      // 嵌套/预览环境：站内 iframe 大概率被安全策略拦截，直接引导去原站最稳
      $('#playerFrameWrap').style.display = 'none';
      $('#playerFallback').style.display = '';
      $('#playerFallback').innerHTML = '🎬 这个页面被嵌在预览窗口里，视频没法直接在这里播放。<br>点上方「↗ 在视频网站打开」按钮，就会跳到 ' +
        (info.platform === 'qq' ? '腾讯视频' : 'B站') + ' 原站观看（请在已登录会员的账号下打开）。';
      openBtn.textContent = info.platform === 'qq' ? '↗ 在腾讯视频打开' : '↗ 在B站打开';
      hint.style.display = 'none';
    } else {
      $('#playerFrameWrap').style.display = '';
      $('#playerFallback').style.display = 'none';
      $('#playerFrame').src = info.embed;
      openBtn.textContent = info.platform === 'qq' ? '↗ 在腾讯视频打开' : '↗ 在B站打开';
      hint.style.display = info.platform === 'qq' ? '' : 'none';
      if (info.platform === 'qq') hint.textContent = '💡 腾讯会员专享视频内嵌可能放不了，点上方按钮跳到腾讯视频（在你已登录会员的账号下）即可观看';
    }
    $('#timerText').textContent = '00:00';
    $('#timerStatus').textContent = '点「开始计时」开始记录';
    $('#timerToggle').textContent = '▶ 开始计时';
    $('#playerOverlay').classList.add('show');
  }
  function closePlayer() {
    stopTimer(true);
    $('#playerOverlay').classList.remove('show');
    setTimeout(function () { $('#playerFrame').src = 'about:blank'; }, 200);
  }
  function startTimer() {
    if (player.playing) return;
    player.playing = true;
    $('#timerStatus').textContent = '⏱ 计时中…';
    $('#timerToggle').textContent = '⏸ 暂停';
    player.timer = setInterval(function () {
      player.sessionSec++; player.unsaved++;
      $('#timerText').textContent = fmtSec(player.sessionSec);
      if (player.unsaved >= 20) { var u = player.unsaved; player.unsaved = 0; flushStudy(u); }
    }, 1000);
  }
  function stopTimer(silent) {
    if (player.timer) { clearInterval(player.timer); player.timer = null; }
    var was = player.playing;
    player.playing = false;
    if (player.unsaved > 0) { var u = player.unsaved; player.unsaved = 0; flushStudy(u); }
    if (was) {
      $('#timerStatus').textContent = '已暂停';
      $('#timerToggle').textContent = '▶ 继续计时';
      if (!silent) toast('计时已暂停，回来继续吧 💪');
    }
  }
  $('#timerToggle').onclick = function () { if (player.playing) { stopTimer(false); } else { startTimer(); } };
  $('#playerClose').onclick = closePlayer;
  $('#playerOverlay').addEventListener('click', function (e) { if (e.target === this) closePlayer(); });
  document.addEventListener('visibilitychange', function () {
    // 百度网盘在另一个标签页播放，不因为切走而暂停计时
    if (document.hidden && player.playing && !player.isBaidu) stopTimer(true);
  });
  window.addEventListener('pagehide', function () {
    if (player.unsaved > 0) { var u = player.unsaved; player.unsaved = 0; S.addStudySeconds(KID, u); }
  });

  /* ---------- 渲染 ---------- */
  function renderHeader() {
    var k = S.getKid(KID), p = S.all().settings.kids[KID];
    $('#kidName').textContent = p.name + '（' + p.age + ' 岁）';
    $('#kidEmoji').textContent = KID === 'junior' ? '🚀' : '🎧';
    $('#pts').textContent = k.points;
    $('#streak').textContent = k.streak;
    var t = k.todayDate === S.today() ? Math.floor((k.todaySeconds || 0) / 60) : 0;
    $('#todayMin').textContent = t;
  }

  function videoCard(v, extraClass, buttonsHtml) {
    return '<div class="card video-card ' + (extraClass || '') + '">' +
      '<h3>' + esc(v.title) + '</h3>' +
      (v.category === 'reward' ? '<span class="tag reward">奖励视频</span>' : '<span class="tag">学习</span>') +
      '<div class="row">' + buttonsHtml + '</div></div>';
  }

  function renderTasks() {
    var tasks = S.todayTasks(KID);
    var html = '';
    if (!tasks.length) {
      html = '<div class="empty">今天没有安排任务 🎈<br>可以去「📚 书架」自由学习，也可以直接打卡</div>';
    } else {
      html = tasks.map(function (v) {
        var isDone = S.isWatched(KID, v.id);
        return videoCard(v, isDone ? 'done' : '',
          '<button class="btn small" data-play="' + v.id + '">' + (isDone ? '↺ 再看一遍' : '▶ 开始学习') + '</button>' +
          (isDone ? '' : ' <button class="btn small ghost" data-done="' + v.id + '">✔ 看完了</button>'));
      }).join('');
    }
    $('#taskList').innerHTML = html;
    renderCheckinBtn();
  }

  function renderCheckinBtn() {
    var tasks = S.todayTasks(KID);
    var checked = S.checkedInToday(KID);
    var allDone = !tasks.length || tasks.every(function (v) { return S.isWatched(KID, v.id); });
    var btn = $('#checkinBtn');
    if (checked) {
      btn.disabled = true; btn.textContent = '✅ 今天已经打过卡啦';
    } else if (allDone) {
      btn.disabled = false; btn.textContent = '🎉 打卡领积分';
    } else {
      var cnt = tasks.filter(function (v) { return done[v.id]; }).length;
      btn.disabled = true; btn.textContent = '⏳ 完成全部任务后打卡（' + cnt + '/' + tasks.length + '）';
    }
  }

  $('#checkinBtn').onclick = function () {
    var r = S.checkIn(KID);
    if (!r.ok) { toast(r.msg); return; }
    var html = '<h3>🎉 打卡成功！</h3>' +
      '<p>基础 20 分' + (r.bonus ? ' + 连击加成 ' + r.bonus + ' 分' : '') + '</p>' +
      '<p style="font-size:36px;font-weight:800;margin:10px 0">+' + r.points + ' 分</p>' +
      '<p>🔥 已连续打卡 ' + r.streak + ' 天</p>';
    if (r.newBadges && r.newBadges.length) {
      html += '<hr style="margin:12px 0;border:none;border-top:1px dashed #ddd"><b>🏅 解锁新徽章：</b>' + r.newBadges.map(badgeHtml).join('');
    }
    html += '<div class="btns"><button class="btn" onclick="closeModal()">太棒了！</button></div>';
    showModal(html);
    renderAll();
  };

  function renderRewards() {
    var unlocked = S.checkedInToday(KID);
    $('#rewardLock').style.display = unlocked ? 'none' : 'flex';
    var list = S.all().videos.filter(function (v) { return v.category === 'reward'; });
    $('#rewardList').innerHTML = list.length ? list.map(function (v) {
      return videoCard(v, '', '<button class="btn small" data-play="' + v.id + '">▶ 播放</button>');
    }).join('') : '<div class="empty">奖励视频区空空的，等妈妈添加 😊</div>';
  }

  function renderBadges() {
    var k = S.getKid(KID);
    $('#badgeWall').innerHTML = S.badges().map(function (b) {
      var got = (k.badges || []).indexOf(b.id) >= 0;
      return '<div class="badge' + (got ? '' : ' locked') + '">' +
        '<div class="ico">' + b.icon + '</div><b>' + esc(b.name) + '</b>' +
        '<small>' + (got ? esc(b.desc) : '🔒 ' + esc(b.desc)) + '</small></div>';
    }).join('');
    var got = (k.badges || []).length;
    $('#badgeCount').textContent = got + ' / ' + S.badges().length;
  }

  /* ---------- 转盘 ---------- */
  var wheelRot = 0, wheelBusy = false;
  function drawWheel() {
    var cv = $('#wheelCanvas');
    var ctx = cv.getContext('2d');
    var items = S.all().wheel.items;
    var n = Math.max(1, items.length);
    var size = 300;
    if (window.innerWidth < 360) size = 280;
    cv.width = size; cv.height = size;
    var cx = size / 2, cy = size / 2, r = size / 2 - 6;
    var seg = Math.PI * 2 / n;
    var colors = ['#ff8fb1', '#ffd166', '#8ecae6', '#b8f2a4', '#c3a6ff', '#ffb36b', '#7dd3fc', '#f7a1c4'];
    ctx.clearRect(0, 0, size, size);
    for (var i = 0; i < n; i++) {
      var a0 = wheelRot + i * seg, a1 = a0 + seg;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath();
      ctx.fillStyle = colors[i % colors.length]; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(a0 + seg / 2);
      ctx.textAlign = 'right'; ctx.fillStyle = '#25203a';
      ctx.font = 'bold 13px sans-serif';
      var label = items[i] ? String(items[i].label || '') : '';
      if (label.length > 8) label = label.slice(0, 8) + '…';
      ctx.fillText(label, r - 12, 5);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#d8dcea'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#5b7cfa'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('GO', cx, cy + 5);
  }
  function renderWheelInfo() {
    var k = S.getKid(KID);
    $('#wheelCostLabel').textContent = '每次 ' + S.all().wheel.cost + ' 积分';
    $('#wheelPts').textContent = k.points;
    var logs = (k.spinLog || []).slice().reverse().slice(0, 10);
    $('#spinHistory').innerHTML = logs.length ? logs.map(function (l) {
      return '<li><span>' + esc(l.text) + '</span><span class="muted">' + esc(l.date) + '</span></li>';
    }).join('') : '<li class="muted">还没有抽过奖</li>';
  }
  $('#spinBtn').onclick = function () {
    if (wheelBusy) return;
    var r = S.spin(KID);
    if (!r.ok) { toast(r.msg); return; }
    wheelBusy = true;
    $('#spinBtn').disabled = true;
    var items = S.all().wheel.items, n = items.length, seg = Math.PI * 2 / n;
    var target = Math.PI * 1.5 - (r.index + 0.5) * seg;
    var final = target;
    while (final < wheelRot + Math.PI * 8) final += Math.PI * 2;
    var start = wheelRot, t0 = performance.now(), dur = 3800;
    (function anim(t) {
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      wheelRot = start + (final - start) * e;
      drawWheel();
      if (p < 1) { requestAnimationFrame(anim); return; }
      wheelBusy = false;
      $('#spinBtn').disabled = false;
      renderHeader(); renderWheelInfo(); renderBadges();
      var html = '<h3>🎡 ' + esc(r.text) + '</h3>';
      if (r.item.type === 'prize') html += '<p class="muted">找妈妈领取奖品吧～</p>';
      html += '<p class="muted">当前积分 ⭐ ' + r.points + ' 分</p>';
      if (r.newBadges && r.newBadges.length) html += '<hr style="margin:12px 0;border:none;border-top:1px dashed #ddd"><b>🏅 解锁新徽章：</b>' + r.newBadges.map(badgeHtml).join('');
      html += '<div class="btns"><button class="btn" onclick="closeModal()">知道啦</button></div>';
      showModal(html);
    })(performance.now());
  };

  /* ---------- 兑换 ---------- */
  function renderShop() {
    var k = S.getKid(KID);
    var list = S.all().prizes;
    $('#shopPts').textContent = k.points;
    $('#shopList').innerHTML = list.length ? list.map(function (p) {
      var can = k.points >= p.cost && p.stock > 0;
      return '<div class="card shop-item"><div class="info"><b>' + esc(p.name) + '</b>' +
        '<div class="muted">⭐ ' + p.cost + ' 分 · 剩余 ' + p.stock + ' 件</div></div>' +
        '<button class="btn small" data-ex="' + p.id + '"' + (can ? '' : ' disabled') + '>兑换</button></div>';
    }).join('') : '<div class="empty">还没有可兑换的奖品 🛍</div>';
  }
  $('#shopList').addEventListener('click', function (e) {
    var id = e.target.getAttribute && e.target.getAttribute('data-ex');
    if (!id) return;
    showModal('<h3>🎁 确认兑换？</h3><p>会扣掉相应的积分哦</p>' +
      '<div class="btns"><button class="btn ghost" onclick="closeModal()">再想想</button>' +
      '<button class="btn" id="exYes">兑换！</button></div>');
    $('#exYes').onclick = function () {
      var r = S.exchange(KID, id);
      window.closeModal();
      if (!r.ok) { toast(r.msg); renderShop(); return; }
      showModal('<h3>🎉 兑换成功</h3><p style="font-size:18px"><b>' + esc(r.prize.name) + '</b></p>' +
        '<p class="muted">找妈妈领取奖品吧～</p>' +
        '<div class="btns"><button class="btn" onclick="closeModal()">好耶</button></div>');
      renderHeader(); renderShop(); renderBadges();
      if (r.newBadges && r.newBadges.length) setTimeout(function () { notifyBadges(r.newBadges); }, 600);
    };
  });

  /* ---------- 日历 ---------- */
  var calY = null, calM = null;
  function renderCalendar() {
    var now = new Date();
    if (calY == null) { calY = now.getFullYear(); calM = now.getMonth(); }
    $('#calTitle').textContent = calY + ' 年 ' + (calM + 1) + ' 月';
    var map = S.historyMap(KID);
    var startDow = new Date(calY, calM, 1).getDay();
    var daysInMonth = new Date(calY, calM + 1, 0).getDate();
    var prevDays = new Date(calY, calM, 0).getDate();
    var html = '';
    ['日', '一', '二', '三', '四', '五', '六'].forEach(function (d) { html += '<div class="dow">' + d + '</div>'; });
    for (var i = 0; i < startDow; i++) html += '<div class="cal-cell other">' + (prevDays - startDow + 1 + i) + '</div>';
    var monthCount = 0, monthPts = 0;
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = calY + '-' + pad2(calM + 1) + '-' + pad2(d);
      var rec = map[ds];
      var cls = 'cal-cell';
      if (rec) { cls += ' hit'; monthCount++; monthPts += rec.points || 0; }
      if (ds === S.today()) cls += ' today';
      html += '<div class="' + cls + '">' + d + (rec ? '<small>+' + rec.points + '</small>' : '') + '</div>';
    }
    var rest = (7 - (startDow + daysInMonth) % 7) % 7;
    for (var k = 1; k <= rest; k++) html += '<div class="cal-cell other">' + k + '</div>';
    $('#calGrid').innerHTML = html;
    $('#calStats').innerHTML = '<span class="chip">📅 本月打卡 ' + monthCount + ' 天</span>' +
      '<span class="chip">⭐ 本月积分 +' + monthPts + '</span>';
  }
  $('#calPrev').onclick = function () { calM--; if (calM < 0) { calM = 11; calY--; } renderCalendar(); };
  $('#calNext').onclick = function () { calM++; if (calM > 11) { calM = 0; calY++; } renderCalendar(); };

  /* ---------- 书架 ---------- */
  function renderShelf() {
    var list = S.all().videos.filter(function (v) { return v.category !== 'reward'; });
    $('#shelfList').innerHTML = list.length ? list.map(function (v) {
      return videoCard(v, '', '<button class="btn small" data-play="' + v.id + '">▶ 播放</button>');
    }).join('') : '<div class="empty">书架空空的，等妈妈添加学习视频 📚</div>';
  }

  /* ---------- 事件委托（播放/标记完成） ---------- */
  function bindPlay(container) {
    $(container).addEventListener('click', function (e) {
      var play = e.target.getAttribute && e.target.getAttribute('data-play');
      var dn = e.target.getAttribute && e.target.getAttribute('data-done');
      if (play) { openPlayer(findV(play)); }
      if (dn) {
        S.markWatched(KID, dn); renderTasks();
        toast('这一课完成啦 ✔');
      }
    });
  }
  bindPlay('#taskList'); bindPlay('#rewardList'); bindPlay('#shelfList');

  /* ---------- Tabs ---------- */
  $$('#tabs button').forEach(function (b) {
    b.onclick = function () {
      $$('#tabs button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      $$('.tab').forEach(function (s) { s.classList.remove('on'); });
      $('#tab-' + b.dataset.tab).classList.add('on');
      if (b.dataset.tab === 'wheel') drawWheel();
    };
  });

  /* ---------- 初始化（先读云端数据，再渲染） ---------- */
  function renderAll() {
    renderHeader(); renderTasks(); renderRewards(); renderBadges();
    drawWheel(); renderWheelInfo(); renderShop(); renderCalendar(); renderShelf();
    if (S.isOffline()) toast('⚠️ 暂时连不上服务器，改动不会被保存');
  }
  S.load().then(renderAll);
})();
