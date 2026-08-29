(function () {
  var KEY = (window.YRoomGate && window.YRoomGate.currentKey()) || window.YROOM_VIEW_KEY || "";
  var hall = document.getElementById("hall");
  var status = document.getElementById("status");
  var feed = document.getElementById("feed");
  var home = document.getElementById("home-head");
  var gear = document.getElementById("settingsToggle");
  var menu = document.getElementById("settingsMenu");
  var catcher = document.getElementById("settingsCatch");
  var actMask = document.getElementById("actMask");
  var jobsMask = document.getElementById("jobsMask");
  var jobsBody = document.getElementById("jobsBody");
  var homeInstall = document.getElementById("home-install");
  var homeInstalled = document.getElementById("home-installed");
  var busy = false;
  var retryTimer = 0;

  if (window.YRoomGate) {
    window.YRoomGate.blockWebChrome();
    window.YRoomGate.bindKeyboard();
  } else {
    document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    document.addEventListener("selectstart", function (e) {
      if (e.target && e.target.closest && e.target.closest("input, textarea, select")) return;
      e.preventDefault();
    });
  }

  function vault() {
    return String(window.VAULT_ORIGIN || "").replace(/\/$/, "") || location.origin;
  }
  function withKey(path) {
    var u = new URL(path, vault() + "/");
    if (KEY) u.searchParams.set("k", KEY);
    return u.href;
  }
  function get(path) {
    return fetch(withKey(path), { credentials: "omit" }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw data;
        return data;
      });
    });
  }
  function post(path, body) {
    return fetch(withKey(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw data;
        return data;
      });
    });
  }

  function showHome() {
    hall.classList.remove("is-booting");
    hall.classList.add("is-ready");
    if (status) status.hidden = true;
    var wait = document.getElementById("boot-wait");
    if (wait) wait.hidden = true;
    var profile = document.querySelector(".profile");
    if (profile) profile.hidden = true;
    home.hidden = false;
    document.getElementById("cab-hud").hidden = false;
  }

  function failGate(msg) {
    hall.classList.remove("is-booting");
    if (status) status.textContent = msg || "維護中,請5分鐘後再試";
  }

  function scheduleReconnect() {
    if (retryTimer) return;
    retryTimer = setTimeout(function () {
      retryTimer = 0;
      if (window.YRoomGate) {
        window.YRoomGate.refreshOrigin().then(function () { location.reload(); });
      } else {
        location.reload();
      }
    }, 12000);
  }

  function renderShelf(data) {
    feed.innerHTML = "";
    (data.items || []).forEach(function (item) {
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      tile.setAttribute("data-id", item.id || "");
      if (item.has_cover) {
        var img = document.createElement("img");
        img.alt = "";
        img.src = withKey("/cover?book=" + encodeURIComponent(item.id || ""));
        tile.appendChild(img);
      }
      var meta = document.createElement("span");
      meta.className = "tile-ep";
      meta.textContent = item.finished ? "已閱讀" : (item.page_count ? item.page_count + "頁" : "");
      tile.appendChild(meta);
      tile.addEventListener("click", function () {
        if (busy) return;
        if (!item.readable) return;
        location.href = "./read.html?book=" + encodeURIComponent(item.id) + "&k=" + encodeURIComponent(KEY) + "#k=" + encodeURIComponent(KEY);
      });
      feed.appendChild(tile);
    });
  }

  function closeMenu() {
    menu.hidden = true;
    catcher.hidden = true;
    gear.setAttribute("aria-expanded", "false");
  }
  function openMenu() {
    menu.hidden = false;
    catcher.hidden = false;
    gear.setAttribute("aria-expanded", "true");
  }

  gear.addEventListener("click", function (ev) {
    ev.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });
  catcher.addEventListener("click", closeMenu);
  menu.addEventListener("click", function (ev) {
    var btn = ev.target.closest(".settings-entry");
    if (!btn) return;
    closeMenu();
    var job = btn.getAttribute("data-job");
    if (job === "private") {
      actMask.hidden = false;
    }
    if (job === "jobs") {
      refreshJobs();
      jobsMask.hidden = false;
    }
  });

  function closeAct() { actMask.hidden = true; }
  document.getElementById("actClose").addEventListener("click", closeAct);
  actMask.addEventListener("pointerup", function (ev) {
    if (ev.target === actMask) closeAct();
  });
  document.getElementById("actGo").addEventListener("click", function () {
    if (busy) return;
    busy = true;
    document.getElementById("cab-hud").classList.add("is-run");
    closeAct();
    post("/api/host/item", { op: "private_favorites" }).then(function () {
      busy = false;
      refreshJobs();
      jobsMask.hidden = false;
    }).catch(function () {
      busy = false;
      document.getElementById("cab-hud").classList.remove("is-run");
    });
  });

  document.getElementById("jobsClose").addEventListener("click", function () {
    jobsMask.hidden = true;
  });
  jobsMask.addEventListener("pointerup", function (ev) {
    if (ev.target === jobsMask) jobsMask.hidden = true;
  });

  function refreshJobs() {
    get("/api/host/jobs").then(function (snap) {
      jobsBody.innerHTML = "";
      var rows = snap.active || [];
      if (!rows.length) {
        jobsBody.textContent = "目前沒有工作";
        document.getElementById("cab-hud").classList.remove("is-run");
        return;
      }
      rows.forEach(function (row) {
        var p = document.createElement("p");
        var phase = row.phase || "";
        var pct = row.percent != null ? row.percent + "%" : "";
        p.textContent = "擷取私藏  " + phase + "  " + pct;
        jobsBody.appendChild(p);
        if (row.state === "running") {
          document.getElementById("cab-hud").classList.add("is-run");
        }
      });
    }).catch(function () {});
  }

  if (homeInstalled) {
    homeInstalled.addEventListener("click", function () {
      try { localStorage.setItem("yroom.installed", "1"); } catch (e) {}
      if (homeInstall) homeInstall.hidden = true;
    });
  }

  function afterDoor(door) {
    if (door && door.kind === "invite") {
      location.href = "./hey.html?k=" + encodeURIComponent(KEY);
      return;
    }
    if (window.YRoomGate) {
      window.YRoomGate.savePersonal(KEY);
      window.YRoomGate.pinKey(KEY);
    }
    get("/api/me").then(function (me) {
      document.getElementById("reader-name").textContent = me.display_name || "館主";
      showHome();
      if (homeInstall && typeof navigator.standalone === "boolean" && !navigator.standalone) {
        var seen = "";
        try { seen = localStorage.getItem("yroom.installed") || ""; } catch (e) {}
        if (!seen) homeInstall.hidden = false;
      }
      return get("/api/shelf?limit=80");
    }).then(function (data) {
      if (!data) return;
      renderShelf(data);
      refreshJobs();
      setInterval(refreshJobs, 4000);
    }).catch(function () {
      failGate();
      scheduleReconnect();
    });
  }

  if (!KEY) {
    failGate("請用入口連結打開");
    return;
  }
  get("/api/door").then(function (door) {
    afterDoor(door);
  }).catch(function () {
    failGate();
    scheduleReconnect();
  });
})();
