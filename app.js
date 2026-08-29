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
  var coverInput = document.getElementById("cover-input");
  var backdropInput = document.getElementById("backdrop-input");
  var stageBg = document.getElementById("stage-bg");
  var cabHud = document.getElementById("cab-hud");
  var faceImg = document.getElementById("face-img");
  var readerName = document.getElementById("reader-name");
  var jobsEntry = menu ? menu.querySelector('.settings-entry[data-job="jobs"]') : null;
  var busy = false;
  var retryTimer = 0;
  var allItems = [];
  var catalog = {};
  var mode = "manga";
  var selected = new Set();
  var selectMode = false;
  var blobUrls = [];
  var backdropUrl = "";
  var waitBusy = false;
  var waitTimer = 0;
  var prefetchCtl = null;
  var readerOpen = false;
  var readerStaySeq = 0;
  var readerReadyTimer = 0;
  var hintTimer = 0;
  var bridgeBackAt = 0;

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
    if (cabHud) cabHud.hidden = false;
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

  function setJobRun(on, entry) {
    var cover = document.querySelector("#cab-hud .cab-cover");
    if (cover) cover.classList.toggle("is-run", !!on);
    var row = entry || jobsEntry;
    if (row) {
      row.classList.toggle("is-run", !!on);
      var badge = row.querySelector(".ins-icon");
      if (badge) badge.classList.toggle("is-run", !!on);
    }
  }

  function layoutStage() {
    if (!stageBg || !hall || stageBg.hidden) return;
    var hallBox = hall.getBoundingClientRect();
    var tags = document.getElementById("tag-board");
    var startBox = tags && !tags.hidden ? tags.getBoundingClientRect() : (feed ? feed.getBoundingClientRect() : null);
    var endBox = feed ? feed.getBoundingClientRect() : startBox;
    var start = startBox ? Math.max(0, startBox.top - hallBox.top) : 180;
    var end = endBox ? Math.max(start + 24, endBox.top - hallBox.top) : start + 80;
    var fade = "linear-gradient(to bottom, #000 0, #000 " + Math.round(start) + "px, transparent " + Math.round(end) + "px)";
    stageBg.style.height = Math.round(end) + "px";
    stageBg.style.webkitMaskImage = fade;
    stageBg.style.maskImage = fade;
    if (backdropUrl) tuneNameOnBackdrop(backdropUrl);
  }

  function lumaBehindName(img, stage, nameEl) {
    var stageBox = stage.getBoundingClientRect();
    var nameBox = nameEl.getBoundingClientRect();
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;
    if (stageBox.width < 8 || nameBox.height < 4 || !iw || !ih) return null;
    var scale = Math.max(stageBox.width / iw, stageBox.height / ih);
    var ox = (stageBox.width - iw * scale) / 2;
    var pad = 10;
    var sx = (nameBox.left - stageBox.left - ox - pad) / scale;
    var sy = (nameBox.top - stageBox.top - pad) / scale;
    var sw = (nameBox.width + pad * 2) / scale;
    var sh = (nameBox.height + pad * 2) / scale;
    var x = Math.max(0, Math.min(iw - 1, sx));
    var y = Math.max(0, Math.min(ih - 1, sy));
    var w = Math.max(1, Math.min(iw - x, sw));
    var h = Math.max(1, Math.min(ih - y, sh));
    var canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 12;
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(img, x, y, w, h, 0, 0, 24, 12);
      var data = ctx.getImageData(0, 0, 24, 12).data;
      var sum = 0;
      for (var i = 0; i < data.length; i += 4) {
        sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      }
      return sum / (data.length / 4);
    } catch (err) {
      return null;
    }
  }

  function tuneNameOnBackdrop(url) {
    if (!readerName || !stageBg || stageBg.hidden || !url) return;
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      if (url !== backdropUrl) return;
      var luma = lumaBehindName(img, stageBg, readerName);
      var light = luma != null && luma >= 0.65;
      readerName.classList.toggle("is-on-light", light);
      readerName.classList.toggle("is-on-dark", !light);
    };
    img.src = url;
  }

  function paintStage(reader) {
    if (!stageBg || !hall) return;
    if (reader && reader.has_backdrop && reader.id) {
      backdropUrl = vault() + "/backdrop?person=" + encodeURIComponent(reader.id) + "&k=" + encodeURIComponent(KEY) + "&r=" + (reader.backdrop_rev || 0);
      hall.classList.add("has-backdrop");
      if (readerName) {
        readerName.classList.remove("is-on-light");
        readerName.classList.add("is-on-dark");
      }
      stageBg.style.backgroundImage = "url(" + backdropUrl + ")";
      stageBg.hidden = false;
      requestAnimationFrame(layoutStage);
    } else {
      backdropUrl = "";
      hall.classList.remove("has-backdrop");
      if (readerName) readerName.classList.remove("is-on-light", "is-on-dark");
      stageBg.hidden = true;
      stageBg.style.backgroundImage = "";
    }
  }

  function renderMe(reader) {
    if (!reader) return;
    if (readerName) readerName.textContent = reader.display_name || "館主";
    if (faceImg) {
      if (reader.has_cover) {
        faceImg.src = vault() + "/cover?person=" + encodeURIComponent(reader.id || "owner") + "&k=" + encodeURIComponent(KEY) + "&r=" + (reader.cover_rev || 0);
      } else {
        faceImg.src = "./face-default.jpg?v=2";
      }
      faceImg.hidden = false;
    }
    if (cabHud) cabHud.hidden = false;
    if (home) home.hidden = false;
    paintStage(reader);
  }

  function showWaitCard(title) {
    var mask = document.getElementById("waitMask");
    var head = document.getElementById("waitTitle");
    var pct = document.getElementById("waitPct");
    if (head) head.textContent = title || "更換背景中";
    if (pct) pct.textContent = "0%";
    if (mask) mask.hidden = false;
  }

  function setWaitPct(n) {
    var pct = document.getElementById("waitPct");
    if (pct) pct.textContent = Math.max(0, Math.min(100, Math.round(n))) + "%";
  }

  function hideWaitCard() {
    var mask = document.getElementById("waitMask");
    if (mask) mask.hidden = true;
    if (waitTimer) {
      window.clearInterval(waitTimer);
      waitTimer = 0;
    }
  }

  function tickWait() {
    var pct = document.getElementById("waitPct");
    var n = parseInt((pct && pct.textContent) || "0", 10) || 0;
    if (n < 90) setWaitPct(n + 1);
  }

  function postFile(url, body, onPct) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr);
        else reject(new Error("fail"));
      };
      xhr.onerror = function () { reject(new Error("net")); };
      if (xhr.upload) {
        xhr.upload.onprogress = function (ev) {
          if (ev.lengthComputable && ev.total) onPct(Math.round((ev.loaded / ev.total) * 100));
        };
      }
      xhr.send(body);
    });
  }

  function refreshMe() {
    return get("/api/me").then(function (me) {
      if (me) renderMe(me);
      return me;
    });
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
        openReader(item);
      });
      feed.appendChild(tile);
    });
    paintPicks();
  }

  function tileNode(item) {
    if (!feed || !item || !item.id) return null;
    var tiles = feed.querySelectorAll(".tile");
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].dataset.id === item.id) return tiles[i];
    }
    return null;
  }

  function tileCover(item) {
    var tile = tileNode(item);
    if (!tile) return "";
    var img = tile.querySelector("img");
    if (img && (img.currentSrc || img.src)) return img.currentSrc || img.src;
    return "";
  }

  function sizeBridgeCover(coverEl, item) {
    if (!coverEl) return;
    coverEl.style.width = "";
    coverEl.style.height = "";
    var tile = tileNode(item);
    if (!tile) return;
    var box = tile.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) return;
    coverEl.style.width = Math.round(box.width) + "px";
    coverEl.style.height = Math.round(box.height) + "px";
  }

  function readingUrl(item, extra) {
    var q = new URLSearchParams();
    q.set("book", item.id);
    q.set("k", KEY);
    var end = (extra && extra.end) || (item.finished ? "1" : "");
    if (end) q.set("end", end);
    return "./read.html?" + q.toString() + "#k=" + encodeURIComponent(KEY);
  }

  function rememberReading(item, cover) {
    try {
      sessionStorage.setItem("yroom.reading", JSON.stringify({
        book: item.id,
        k: KEY,
        end: item.finished ? "1" : "",
        cover: cover || "",
      }));
    } catch (e) {}
  }

  function stayOverlayUrl(n) {
    var raw = (location.hash || "").replace(/^#/, "").replace(/&?stay=\d+/g, "").replace(/&$/, "");
    return location.pathname + location.search + "#" + (raw ? raw + "&stay=" + n : "stay=" + n);
  }

  function cleanOverlayUrl() {
    var raw = (location.hash || "").replace(/^#/, "").replace(/&?stay=\d+/g, "").replace(/&$/, "");
    return location.pathname + location.search + (raw ? "#" + raw : "");
  }

  function padOverlay() {
    if (!readerOpen) return;
    try {
      readerStaySeq += 1;
      history.pushState({ yroomReader: 1, n: readerStaySeq }, "", stayOverlayUrl(readerStaySeq));
      readerStaySeq += 1;
      history.pushState({ yroomReader: 1, n: readerStaySeq }, "", stayOverlayUrl(readerStaySeq));
    } catch (e) {}
  }

  function closeReader() {
    var layer = document.getElementById("reader-layer");
    var frame = document.getElementById("reader-frame");
    readerOpen = false;
    document.documentElement.classList.remove("is-reading");
    if (layer) {
      layer.hidden = true;
      layer.classList.remove("is-live");
    }
    if (frame) {
      try { frame.src = "about:blank"; } catch (e) {}
    }
    try { sessionStorage.removeItem("yroom.reading"); } catch (e) {}
    try { history.replaceState({}, "", cleanOverlayUrl()); } catch (e) {}
    window.clearTimeout(readerReadyTimer);
    window.clearTimeout(hintTimer);
  }

  function showReaderLive() {
    var layer = document.getElementById("reader-layer");
    if (!layer || !readerOpen) return;
    layer.classList.add("is-live");
    window.clearTimeout(readerReadyTimer);
    window.clearTimeout(hintTimer);
    var hint = document.getElementById("reader-hint");
    if (hint) hint.hidden = true;
  }

  function prefetchReader(item) {
    if (!item || !item.id || !KEY) return;
    var origin = vault();
    if (!origin) return;
    if (prefetchCtl && prefetchCtl._book === item.id) return;
    if (prefetchCtl) prefetchCtl.abort();
    prefetchCtl = new AbortController();
    prefetchCtl._book = item.id;
    var signal = prefetchCtl.signal;
    var bid = encodeURIComponent(item.id);
    var tok = encodeURIComponent(KEY);
    [
      "./read.html",
      "./read.css?v=14",
      origin + "/static/reader.js?v=25",
      origin + "/static/css/global.css?v=20",
      origin + "/static/css/read.css?v=20",
      origin + "/static/css/navImage.css?v=20",
      origin + "/static/css/navMenu.css?v=20",
      origin + "/static/css/config.css?v=20",
      origin + "/static/css/mybook.css?v=20",
    ].forEach(function (url) {
      fetch(url, { signal: signal, mode: "cors", credentials: "omit" }).catch(function () {});
    });
    var auth = "?book=" + bid + "&k=" + tok;
    Promise.all([
      fetch(origin + "/api/book" + auth, { signal: signal, mode: "cors" }).then(function (r) { return r.json(); }),
      fetch(origin + "/api/prefs" + auth, { signal: signal, mode: "cors" }).then(function (r) { return r.json(); }).catch(function () { return {}; }),
    ]).then(function (pair) {
      var book = pair[0] || {};
      var prefs = pair[1] || {};
      var leaves = book.leaves || [];
      if (!leaves.length) return;
      var posKey = book.positionKey || item.id;
      var idx = 0;
      if (prefs.finished && prefs.finished[posKey]) {
        idx = Math.max(0, leaves.length - 1);
      } else {
        var saved = prefs.positions && prefs.positions[posKey];
        if (Number.isFinite(saved)) idx = Math.max(0, Math.min(saved, leaves.length - 1));
      }
      [leaves[idx], leaves[idx + 1], leaves[idx - 1]].forEach(function (leaf) {
        if (!leaf || !leaf.src) return;
        var im = new Image();
        im.decoding = "async";
        im.src = origin + "/pages/" + encodeURIComponent(leaf.src) + "?book=" + bid + "&k=" + tok;
      });
    }).catch(function () {});
  }

  function openReader(item, opts) {
    if (!item || !item.id) return;
    var layer = document.getElementById("reader-layer");
    var frame = document.getElementById("reader-frame");
    var coverEl = document.getElementById("reader-bridge-cover");
    var hint = document.getElementById("reader-hint");
    var bridge = document.getElementById("reader-bridge");
    if (!layer || !frame) {
      location.replace(readingUrl(item, opts));
      return;
    }
    var cover = (opts && opts.cover) || tileCover(item);
    if (!cover && item.has_cover) cover = coverUrl(item);
    if (coverEl) {
      if (cover) {
        coverEl.hidden = false;
        coverEl.src = cover;
        sizeBridgeCover(coverEl, item);
      } else {
        coverEl.removeAttribute("src");
        coverEl.hidden = true;
        coverEl.style.width = "";
        coverEl.style.height = "";
      }
    }
    if (bridge) bridge.classList.toggle("has-cover", !!cover);
    window.clearTimeout(hintTimer);
    if (hint) hint.hidden = false;
    rememberReading(item, cover);
    document.documentElement.classList.add("is-reading");
    layer.hidden = false;
    layer.classList.remove("is-live");
    var wasOpen = readerOpen;
    readerOpen = true;
    if (!wasOpen) padOverlay();
    prefetchReader(item);
    var url = readingUrl(item, opts);
    try {
      if (frame.getAttribute("src") === url && frame.contentWindow) {
        frame.contentWindow.location.replace(url);
      } else {
        frame.src = url;
      }
    } catch (e) {
      frame.src = url;
    }
    window.clearTimeout(readerReadyTimer);
    readerReadyTimer = window.setTimeout(showReaderLive, 15000);
  }

  function openSaved(data) {
    if (!data || !data.book) return;
    openReader({
      id: data.book,
      finished: data.end === "1",
      has_cover: !!data.cover,
    }, { end: data.end, cover: data.cover });
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
    if (job === "cover" && coverInput) coverInput.click();
    if (job === "backdrop" && backdropInput) backdropInput.click();
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

  if (window.YRoomGate && window.YRoomGate.lockSheetPage) {
    if (actMask) window.YRoomGate.lockSheetPage(actMask);
    if (jobsMask) window.YRoomGate.lockSheetPage(jobsMask);
  }
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
      renderMe(me);
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
      requestAnimationFrame(layoutStage);
      refreshJobs();
      setInterval(refreshJobs, 4000);
      if (window.__yroomPendingRead) {
        var pending = window.__yroomPendingRead;
        window.__yroomPendingRead = null;
        openSaved(pending);
      }
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

  if (coverInput) coverInput.addEventListener("change", function () {
    var file = coverInput.files && coverInput.files[0];
    if (!file) return;
    var entry = document.querySelector('.settings-entry[data-job="cover"]');
    setJobRun(true, entry);
    var fd = new FormData();
    fd.append("cover", file);
    fetch(vault() + "/api/cover?k=" + encodeURIComponent(KEY), { method: "POST", body: fd })
      .then(function () { return refreshMe(); })
      .finally(function () {
        setJobRun(false, entry);
        coverInput.value = "";
      });
  });

  if (backdropInput) backdropInput.addEventListener("change", function () {
    var file = backdropInput.files && backdropInput.files[0];
    if (!file || waitBusy) {
      backdropInput.value = "";
      return;
    }
    waitBusy = true;
    showWaitCard("更換背景中");
    waitTimer = window.setInterval(tickWait, 280);
    var entry = document.querySelector('.settings-entry[data-job="backdrop"]');
    setJobRun(true, entry);
    var fd = new FormData();
    fd.append("backdrop", file);
    postFile(vault() + "/api/backdrop?k=" + encodeURIComponent(KEY), fd, function (n) {
      if (waitTimer) {
        window.clearInterval(waitTimer);
        waitTimer = 0;
      }
      setWaitPct(n);
    }).then(function () {
      setWaitPct(100);
      return refreshMe();
    }).finally(function () {
      hideWaitCard();
      setJobRun(false, entry);
      waitBusy = false;
      backdropInput.value = "";
    });
  });

  var readerBack = document.getElementById("reader-back");
  if (readerBack) {
    readerBack.addEventListener("pointerup", function (ev) {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      ev.preventDefault();
      if (Date.now() - bridgeBackAt < 400) return;
      bridgeBackAt = Date.now();
      closeReader();
    });
    readerBack.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (Date.now() - bridgeBackAt < 400) return;
      bridgeBackAt = Date.now();
      closeReader();
    });
  }

  window.addEventListener("message", function (ev) {
    if (ev.origin !== location.origin) return;
    var kind = ev.data && ev.data.fami;
    if (kind === "close-reader") closeReader();
    else if (kind === "reader-ready") showReaderLive();
    else if (kind === "reader-loading" && readerOpen) {
      var layer = document.getElementById("reader-layer");
      if (layer) layer.classList.remove("is-live");
    }
  });
  window.addEventListener("popstate", function () {
    if (readerOpen) {
      padOverlay();
      return;
    }
    if (/stay=\d+/.test(location.hash || "")) {
      try { history.replaceState({}, "", cleanOverlayUrl()); } catch (e) {}
    }
  });
  window.addEventListener("resize", layoutStage);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", layoutStage);

  window.YRoomShelf = {
    openSaved: openSaved,
    closeReader: closeReader,
  };

  boot();
})();
