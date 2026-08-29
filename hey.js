(function () {
  var statusEl = document.getElementById("status");
  var goBtn = document.getElementById("invite-go");
  var waitEl = document.getElementById("invite-wait");
  var safariNote = document.getElementById("invite-safari");
  var busy = false;
  var retryTimer = 0;

  function startWait() {
    if (goBtn) goBtn.hidden = true;
    if (waitEl) waitEl.hidden = false;
    if (statusEl) statusEl.textContent = "";
  }

  function scheduleReconnect() {
    if (retryTimer) return;
    retryTimer = setTimeout(function () {
      retryTimer = 0;
      window.YRoomGate.refreshOrigin().then(boot);
    }, 12000);
  }

  function boot() {
    window.YRoomGate.blockWebChrome();
    window.YRoomGate.bindKeyboard();
    if (window.YRoomGate.needsSafari()) {
      if (safariNote) safariNote.hidden = false;
      if (goBtn) goBtn.hidden = true;
      return;
    }
    var key = window.YROOM_URL_KEY || "";
    if (!key) {
      if (statusEl) statusEl.textContent = "請用入口連結打開";
      return;
    }
    if (!window.YRoomGate.origin() && location.protocol === "https:") {
      if (statusEl) statusEl.textContent = "維護中,請5分鐘後再試";
      scheduleReconnect();
      return;
    }
    window.YRoomGate.api("/api/public", "", { timeout: 8000 }).catch(function () { return null; });
    window.YRoomGate.apiRetry("/api/door", key, { timeout: 20000, tries: 3 }).then(function (x) {
      if (!x || !x.res || !x.res.ok || !x.j) {
        if (statusEl) statusEl.textContent = "維護中,請5分鐘後再試";
        scheduleReconnect();
        return;
      }
      if (x.j.kind !== "invite") {
        if (statusEl) statusEl.textContent = "請用入口連結打開";
        return;
      }
      if (statusEl) statusEl.textContent = "";
    }).catch(function () {
      if (statusEl) statusEl.textContent = "維護中,請5分鐘後再試";
      scheduleReconnect();
    });
  }

  if (goBtn) {
    goBtn.addEventListener("click", function () {
      if (busy) return;
      if (window.YRoomGate.needsSafari()) return;
      var inviteKey = window.YROOM_URL_KEY || "";
      if (!inviteKey) {
        if (statusEl) statusEl.textContent = "請用入口連結打開";
        return;
      }
      busy = true;
      startWait();
      window.YRoomGate.apiRetry("/api/invite/claim", inviteKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        timeout: 20000,
        tries: 3,
      }).then(function (x) {
        if (!x || !x.res.ok || !x.j || !x.j.token) {
          if (statusEl) statusEl.textContent = "維護中,請5分鐘後再試";
          if (waitEl) waitEl.hidden = true;
          if (goBtn) goBtn.hidden = false;
          busy = false;
          return;
        }
        window.YRoomGate.savePersonal(x.j.token);
        location.href = "./index.html?k=" + encodeURIComponent(x.j.token) + "#k=" + encodeURIComponent(x.j.token);
      }).catch(function () {
        if (statusEl) statusEl.textContent = "維護中,請5分鐘後再試";
        if (waitEl) waitEl.hidden = true;
        if (goBtn) goBtn.hidden = false;
        busy = false;
      });
    });
  }

  boot();
})();
