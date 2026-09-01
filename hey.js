(function () {
  var statusEl = document.getElementById("status");
  var waitEl = document.getElementById("invite-wait");
  var safariNote = document.getElementById("invite-safari");
  var dotsEl = document.getElementById("gate-dots");
  var padEl = document.getElementById("gate-pad");
  var LOCK_STORE = "yroom.gateLock";
  var typed = "";
  var need = 9;
  var busy = false;
  var lockedUntil = 0;
  var lockTimer = 0;
  var retryTimer = 0;

  function startWait() {
    if (padEl) padEl.hidden = true;
    if (dotsEl) dotsEl.hidden = true;
    if (waitEl) waitEl.hidden = false;
    if (statusEl) statusEl.textContent = "";
  }

  function paintDots() {
    if (!dotsEl) return;
    var html = "";
    var i;
    for (i = 0; i < need; i += 1) {
      html += i < typed.length ? '<span class="is-on"></span>' : "<span></span>";
    }
    dotsEl.innerHTML = html;
  }

  function lockLeft() {
    return Math.max(0, lockedUntil - Date.now());
  }

  function paintLock() {
    var left = lockLeft();
    var off = left > 0 || busy;
    if (padEl) padEl.classList.toggle("is-off", off);
    if (left <= 0) {
      if (statusEl && statusEl.textContent.indexOf("分鐘") >= 0) statusEl.textContent = "";
      return;
    }
    var mins = Math.max(1, Math.ceil(left / 60000));
    if (statusEl) statusEl.textContent = "請" + mins + "分鐘後再試";
  }

  function setLock(sec) {
    lockedUntil = Date.now() + Math.max(0, Number(sec) || 0) * 1000;
    try { localStorage.setItem(LOCK_STORE, String(lockedUntil)); } catch (e) {}
    paintLock();
    if (lockTimer) clearInterval(lockTimer);
    if (lockLeft() > 0) {
      lockTimer = setInterval(function () {
        if (lockLeft() <= 0) {
          clearInterval(lockTimer);
          lockTimer = 0;
          try { localStorage.removeItem(LOCK_STORE); } catch (e) {}
        }
        paintLock();
      }, 1000);
    }
  }

  function restoreLock() {
    var raw = "";
    try { raw = localStorage.getItem(LOCK_STORE) || ""; } catch (e) {}
    var until = Number(raw) || 0;
    if (until > Date.now()) setLock((until - Date.now()) / 1000);
  }

  function clearTyped() {
    typed = "";
    paintDots();
  }

  function shake() {
    if (!dotsEl) return;
    dotsEl.classList.remove("is-bad");
    void dotsEl.offsetWidth;
    dotsEl.classList.add("is-bad");
  }

  function scheduleReconnect() {
    if (retryTimer) return;
    retryTimer = setTimeout(function () {
      retryTimer = 0;
      window.YRoomGate.refreshOrigin().then(bootPublic);
    }, 12000);
  }

  function goHome(token) {
    try { sessionStorage.setItem("yroom.gateOk", "1"); } catch (e) {}
    window.YRoomGate.savePersonal(token);
    window.YROOM_VIEW_KEY = token;
    window.YROOM_NEED_GATE = false;
    document.documentElement.classList.remove("need-gate");
    document.documentElement.classList.add("gate-ok");
    startWait();
    if (window.YRoomShelf && window.YRoomShelf.enterAfterGate) {
      window.YRoomShelf.enterAfterGate(token);
    }
  }

  function submit() {
    if (busy || lockLeft() > 0) return;
    if (typed.length !== need) return;
    busy = true;
    paintLock();
    window.YRoomGate.api("/api/gate", "", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: typed }),
      timeout: 20000,
    }).then(function (x) {
      var j = x && x.j;
      if (j && j.ok && j.token && window.YRoomGate.KEY_RE.test(j.token)) {
        goHome(j.token);
        return;
      }
      if (j && j.error === "locked") {
        setLock(j.wait_sec || 600);
        clearTyped();
        shake();
        busy = false;
        paintLock();
        return;
      }
      if (j && j.error === "bad_pin") {
        clearTyped();
        shake();
        busy = false;
        paintLock();
        return;
      }
      if (statusEl) statusEl.textContent = "維護中,請5分鐘後再試";
      scheduleReconnect();
      clearTyped();
      busy = false;
      paintLock();
    }).catch(function () {
      if (statusEl) statusEl.textContent = "維護中,請5分鐘後再試";
      scheduleReconnect();
      clearTyped();
      busy = false;
      paintLock();
    });
  }

  function pushDigit(n) {
    if (busy || lockLeft() > 0) return;
    if (!/^\d$/.test(n)) return;
    if (typed.length >= need) return;
    typed += n;
    paintDots();
    if (typed.length >= need) submit();
  }

  function popDigit() {
    if (busy || lockLeft() > 0) return;
    if (!typed) return;
    typed = typed.slice(0, -1);
    paintDots();
  }

  function bootPublic() {
    if (!window.YRoomGate.origin() && location.protocol === "https:") {
      if (statusEl) statusEl.textContent = "維護中,請5分鐘後再試";
      scheduleReconnect();
    }
    window.YRoomGate.api("/api/public", "", { timeout: 8000 }).then(function (x) {
      var n = x && x.j && Number(x.j.gate_len);
      if (n >= 4 && n <= 16) need = n;
      paintDots();
    }).catch(function () {
      paintDots();
    });
  }

  function boot() {
    window.YRoomGate.blockWebChrome();
    window.YRoomGate.bindKeyboard();
    if (!window.YROOM_NEED_GATE) return;
    restoreLock();
    paintDots();
    paintLock();
    if (window.YRoomGate.needsSafari()) {
      if (safariNote) safariNote.hidden = false;
      if (padEl) padEl.hidden = true;
      if (dotsEl) dotsEl.hidden = true;
      return;
    }
    bootPublic();
  }

  if (padEl) {
    padEl.addEventListener("pointerup", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest(".gate-key") : null;
      if (!btn || !padEl.contains(btn)) return;
      ev.preventDefault();
      if (btn.getAttribute("data-del") === "1") popDigit();
      else pushDigit(btn.getAttribute("data-num") || "");
    });
  }

  document.addEventListener("keydown", function (ev) {
    if (busy || lockLeft() > 0) return;
    if (ev.key === "Backspace") {
      ev.preventDefault();
      popDigit();
      return;
    }
    if (/^\d$/.test(ev.key)) {
      ev.preventDefault();
      pushDigit(ev.key);
    }
  });

  boot();
})();
