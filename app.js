(function () {
  var HEART =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20C10.5 18.4 7.3 15.8 5.4 11.9C4 9.1 5.2 6 8.4 6c1.8 0 3 1.1 3.6 2.2C12.6 7.1 13.8 6 15.6 6c3.2 0 4.4 3.1 3 5.9C16.7 15.8 13.5 18.4 12 20Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
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
  var jobsEntry = menu ? menu.querySelector('.settings-entry[data-job="jobs"]') : null;
  var busy = false;
  var retryTimer = 0;
  var allItems = [];
  var catalog = {};
  var mode = "manga";
  var selected = new Set();
  var selectMode = false;
  var blobUrls = [];

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
    if (window.YRoomGate) return window.YRoomGate.origin() || location.origin;
    var host = String(location.hostname || "");
    if (host === "127.0.0.1" || host === "localhost") return location.origin;
    return String(window.VAULT_ORIGIN || "").replace(/\/$/, "") || location.origin;
  }
  function withKey(path) {
    var u = new URL(path, vault() + "/");
    if (KEY) u.searchParams.set("k", KEY);
    return u.href;
  }
  function get(path) {
    if (window.YRoomGate) {
      return window.YRoomGate.apiRetry(path, KEY, { timeout: 20000, tries: 3 }).then(function (x) {
        if (!x || !x.j || (x.res && !x.res.ok)) throw (x && x.j) || new Error("bad");
        return x.j;
      });
    }
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
    var blobs = document.querySelector(".blobs");
    if (blobs) blobs.hidden = true;
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
        window.YRoomGate.refreshOrigin().then(boot);
      } else {
        location.reload();
      }
    }, 12000);
  }

  function readLabel(item) {
    if (!item) return "";
    if (item.finished) return "已閱讀";
    if (item.progress == null) return "";
    var pages = Number(item.page_count) || 0;
    if (pages <= 0) return "";
    var pct = Math.max(1, Math.min(100, Math.round((Number(item.progress) + 1) / pages * 100)));
    return pct + "%";
  }

  function coverUrl(item) {
    var extra = item.cover_rev ? "&r=" + encodeURIComponent(item.cover_rev) : "";
    return withKey("/cover?book=" + encodeURIComponent(item.id || "") + extra);
  }

  function revokeThumbs() {
    blobUrls.forEach(function (url) {
      try { URL.revokeObjectURL(url); } catch (e) {}
    });
    blobUrls = [];
  }

  function bindThumb(img, url) {
    function show() { img.classList.add("is-on"); }
    fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("bad");
        return res.blob();
      })
      .then(function (blob) {
        var obj = URL.createObjectURL(blob);
        blobUrls.push(obj);
        img.addEventListener("load", show);
        img.addEventListener("error", show);
        img.src = obj;
      })
      .catch(function () {
        img.addEventListener("load", show);
        img.addEventListener("error", show);
        img.src = url;
      });
  }

  function watchThumb(img, url, eager) {
    if (eager || !window.IntersectionObserver) {
      bindThumb(img, url);
      return;
    }
    if (!window.thumbObserver) {
      window.thumbObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var node = en.target;
          window.thumbObserver.unobserve(node);
          if (node.dataset.thumbBound) return;
          node.dataset.thumbBound = "1";
          bindThumb(node, node.dataset.thumbUrl);
        });
      }, { rootMargin: "240px 0px" });
    }
    img.dataset.thumbUrl = url;
    window.thumbObserver.observe(img);
  }

  function setJobRun(on) {
    var cover = document.querySelector("#cab-hud .cab-cover");
    if (cover) cover.classList.toggle("is-run", !!on);
    if (jobsEntry) {
      jobsEntry.classList.toggle("is-run", !!on);
      var badge = jobsEntry.querySelector(".ins-icon");
      if (badge) badge.classList.toggle("is-run", !!on);
    }
  }

  function enterSelect(id) {
    selectMode = true;
    if (id) selected.add(id);
    paintPicks();
  }

  function togglePick(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    selectMode = selected.size > 0;
    paintPicks();
  }

  function paintPicks() {
    document.querySelectorAll("#feed .tile").forEach(function (el) {
      el.classList.toggle("is-pick", selected.has(el.dataset.id));
    });
    showRail(selectMode && selected.size > 0);
    document.documentElement.classList.toggle("is-select", selectMode);
  }

  function showRail(on) {
    var rail = document.getElementById("photo-rail");
    if (rail) rail.hidden = !on;
    document.documentElement.classList.toggle("has-rail", !!on);
  }

  function ensureRail() {
    var rail = document.getElementById("photo-rail");
    if (!rail || rail.dataset.ready) return rail;
    rail.dataset.ready = "1";
    var heart = document.createElement("button");
    heart.type = "button";
    heart.className = "ins-icon rail-heart";
    heart.setAttribute("aria-label", "愛心");
    heart.title = "愛心";
    heart.innerHTML = '<span class="ins-ring"></span><span class="ins-face">' + HEART + "</span>";
    heart.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      toggleHeart();
    });
    rail.appendChild(heart);
    return rail;
  }

  function toggleHeart() {
    var ids = Array.from(selected);
    if (!ids.length) return;
    var anyOff = ids.some(function (id) { return catalog[id] && !catalog[id].favorite; });
    var patch = {};
    ids.forEach(function (id) {
      patch[id] = anyOff;
      if (catalog[id]) catalog[id].favorite = anyOff;
    });
    allItems.forEach(function (item) {
      if (patch[item.id] !== undefined) item.favorite = patch[item.id];
    });
    paintFeed();
    post("/api/prefs", { favorites: patch }).catch(function () {});
  }

  function bindTile(btn, item) {
    var press = 0;
    var sx = 0;
    var sy = 0;
    var fromHold = false;
    function clearPress() {
      if (press) {
        window.clearTimeout(press);
        press = 0;
      }
    }
    btn.addEventListener("pointerdown", function (ev) {
      if (ev.button && ev.button !== 0) return;
      sx = ev.clientX;
      sy = ev.clientY;
      fromHold = false;
      clearPress();
      press = window.setTimeout(function () {
        press = 0;
        fromHold = true;
        if (selectMode) togglePick(item.id);
        else enterSelect(item.id);
      }, 400);
    });
    btn.addEventListener("pointermove", function (ev) {
      if (!press) return;
      if (Math.abs(ev.clientX - sx) > 14 || Math.abs(ev.clientY - sy) > 14) clearPress();
    });
    btn.addEventListener("pointerup", clearPress);
    btn.addEventListener("pointercancel", clearPress);
    ["contextmenu", "selectstart", "dragstart"].forEach(function (name) {
      btn.addEventListener(name, function (ev) { ev.preventDefault(); }, true);
    });
    btn.addEventListener("click", function (ev) {
      if (fromHold) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        return;
      }
      if (selectMode) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        togglePick(item.id);
      }
    }, true);
  }

  function paintFeed() {
    revokeThumbs();
    feed.innerHTML = "";
    var items = mode === "fav"
      ? allItems.filter(function (item) { return item.favorite; })
      : allItems;
    items.forEach(function (item, index) {
      catalog[item.id] = item;
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      tile.setAttribute("data-id", item.id || "");
      if (item.has_cover) {
        var img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        if (index < 8) img.loading = "eager";
        tile.appendChild(img);
        watchThumb(img, coverUrl(item), index < 8);
      }
      var shield = document.createElement("span");
      shield.className = "tile-shield";
      tile.appendChild(shield);
      if (item.favorite) {
        var mark = document.createElement("span");
        mark.className = "tile-heart";
        mark.innerHTML = HEART;
        tile.appendChild(mark);
      }
      var meta = document.createElement("span");
      meta.className = "tile-ep";
      meta.textContent = item.page_count ? item.page_count + "頁" : "";
      if (!meta.textContent) meta.hidden = true;
      tile.appendChild(meta);
      var pct = document.createElement("span");
      pct.className = "tile-pct";
      var label = readLabel(item);
      if (label) pct.textContent = label;
      else pct.hidden = true;
      tile.appendChild(pct);
      bindTile(tile, item);
      tile.addEventListener("click", function () {
        if (busy || selectMode) return;
        if (!item.readable) return;
        location.href = "./read.html?book=" + encodeURIComponent(item.id) + "&k=" + encodeURIComponent(KEY) + "#k=" + encodeURIComponent(KEY);
      });
      feed.appendChild(tile);
    });
    paintPicks();
  }

  function pickMode(next) {
    mode = next === "fav" ? "fav" : "manga";
    document.querySelectorAll("#mode-bar .mode-btn").forEach(function (el) {
      el.classList.toggle("is-on", el.dataset.mode === mode);
    });
    selected = new Set();
    selectMode = false;
    paintFeed();
  }

  function placeMenu() {
    if (!gear || !menu || menu.hidden) return;
    var box = gear.getBoundingClientRect();
    var pad = 10;
    var vv = window.visualViewport;
    var vw = vv ? vv.width : window.innerWidth;
    var vh = vv ? vv.height : window.innerHeight;
    var vo = vv ? vv.offsetTop : 0;
    var vl = vv ? vv.offsetLeft : 0;
    var mw = menu.offsetWidth || 220;
    var mh = menu.offsetHeight || 200;
    var left = box.right - mw;
    if (left < vl + pad) left = vl + pad;
    if (left + mw > vl + vw - pad) left = Math.max(vl + pad, vl + vw - mw - pad);
    var top = box.bottom + 8;
    if (top + mh > vo + vh - pad) top = box.top - mh - 8;
    if (top < vo + pad) top = vo + pad;
    menu.style.position = "fixed";
    menu.style.right = "auto";
    menu.style.bottom = "auto";
    menu.style.left = Math.round(left) + "px";
    menu.style.top = Math.round(top) + "px";
  }

  function closeMenu() {
    menu.hidden = true;
    catcher.hidden = true;
    gear.setAttribute("aria-expanded", "false");
    gear.classList.remove("is-live");
    document.documentElement.classList.remove("settings-open");
    if (menu.parentNode !== document.getElementById("album-settings")) {
      document.getElementById("album-settings").appendChild(menu);
    }
  }

  function openMenu() {
    catcher.hidden = false;
    document.body.appendChild(catcher);
    document.body.appendChild(menu);
    menu.hidden = false;
    gear.setAttribute("aria-expanded", "true");
    gear.classList.add("is-live");
    document.documentElement.classList.add("settings-open");
    requestAnimationFrame(placeMenu);
  }

  gear.addEventListener("click", function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });
  catcher.addEventListener("pointerdown", function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  });
  catcher.addEventListener("click", function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenu();
  });
  menu.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
  menu.addEventListener("click", function (ev) {
    var btn = ev.target.closest(".settings-entry");
    if (!btn || btn.classList.contains("is-run")) return;
    closeMenu();
    var job = btn.getAttribute("data-job");
    if (job === "private") actMask.hidden = false;
    if (job === "jobs") {
      jobsMask.hidden = false;
      refreshJobs();
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
    setJobRun(true);
    closeAct();
    post("/api/host/item", { op: "private_favorites" }).then(function () {
      busy = false;
      jobsMask.hidden = false;
      refreshJobs();
    }).catch(function () {
      busy = false;
      setJobRun(false);
    });
  });

  document.getElementById("jobsClose").addEventListener("click", function () {
    jobsMask.hidden = true;
  });
  jobsMask.addEventListener("pointerup", function (ev) {
    if (ev.target === jobsMask) jobsMask.hidden = true;
  });

  function jobLine(row) {
    var title = row.title || "擷取私藏";
    var phase = row.phase || row.state || "";
    var pct = row.percent != null ? row.percent + "%" : "";
    return [title, phase, pct].filter(Boolean).join("  ");
  }

  function refreshJobs() {
    get("/api/host/jobs").then(function (snap) {
      jobsBody.innerHTML = "";
      var rows = (snap && (snap.active || snap.items)) || [];
      if (!rows.length) {
        jobsBody.textContent = "目前沒有工作";
        setJobRun(false);
        return;
      }
      var running = false;
      rows.forEach(function (row) {
        var p = document.createElement("p");
        p.textContent = jobLine(row);
        jobsBody.appendChild(p);
        if (row.state === "running" || row.state === "queued") running = true;
      });
      setJobRun(running);
    }).catch(function () {
      if (!jobsBody.textContent) jobsBody.textContent = "目前連不上佇列";
    });
  }

  document.querySelectorAll("#mode-bar .mode-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      pickMode(btn.dataset.mode);
    });
  });

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
    var gate = window.YRoomGate;
    var meAsk = gate
      ? gate.apiRetry("/api/me", KEY, { timeout: 20000, tries: 3 }).then(function (x) { return x && x.j; })
      : get("/api/me");
    meAsk.then(function (me) {
      if (!me) throw new Error("no_me");
      document.getElementById("reader-name").textContent = me.display_name || "館主";
      showHome();
      ensureRail();
      if (homeInstall && typeof navigator.standalone === "boolean" && !navigator.standalone) {
        var seen = "";
        try { seen = localStorage.getItem("yroom.installed") || ""; } catch (e) {}
        if (!seen) homeInstall.hidden = false;
      }
      if (gate) {
        return gate.apiRetry("/api/shelf?limit=200", KEY, { timeout: 20000, tries: 3 }).then(function (x) { return x && x.j; });
      }
      return get("/api/shelf?limit=200");
    }).then(function (data) {
      if (!data) return;
      allItems = data.items || [];
      catalog = {};
      allItems.forEach(function (item) { catalog[item.id] = item; });
      paintFeed();
      refreshJobs();
      setInterval(refreshJobs, 4000);
    }).catch(function () {
      failGate();
      scheduleReconnect();
    });
  }

  function boot() {
    KEY = (window.YRoomGate && window.YRoomGate.currentKey()) || window.YROOM_VIEW_KEY || KEY;
    if (!KEY) {
      failGate("請用入口連結打開");
      return;
    }
    var ask = window.YRoomGate
      ? window.YRoomGate.apiRetry("/api/door", KEY, { timeout: 20000, tries: 3 })
      : get("/api/door").then(function (door) { return { res: { ok: true }, j: door }; });
    ask.then(function (x) {
      if (!x || !x.j || (x.res && !x.res.ok)) {
        failGate();
        scheduleReconnect();
        return;
      }
      afterDoor(x.j);
    }).catch(function () {
      failGate();
      scheduleReconnect();
    });
  }

  boot();
})();
