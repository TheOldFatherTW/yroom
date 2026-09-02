(function () {
  var q = new URLSearchParams(location.search);
  var key = window.YROOM_VIEW_KEY || q.get("k") || "";
  var origin = String(window.VAULT_ORIGIN || "").replace(/\/$/, "") || location.origin;
  var videoId = q.get("video") || q.get("book") || "";
  var titleEl = document.getElementById("bookTitle");
  var player = document.getElementById("player");
  var playBtn = document.getElementById("playBtn");
  var playFace = document.getElementById("playFace");
  var waitEl = document.getElementById("watchWait");
  var menu = document.getElementById("readerSettingsMenu");
  var catcher = document.getElementById("readerSettingsCatch");
  var gear = document.getElementById("configButton");
  var endMask = document.getElementById("endMask");
  var duration = 0;
  var lastSave = 0;
  var readySent = false;

  function withKey(path) {
    var u = new URL(path, origin + "/");
    if (key) u.searchParams.set("k", key);
    return u.href;
  }
  function mediaUrl() {
    return withKey("/media.mp4?video=" + encodeURIComponent(videoId));
  }
  function coverUrl() {
    return withKey("/cover?book=" + encodeURIComponent(videoId));
  }
  function closeWatch() {
    try { player.pause(); } catch (e) {}
    try { window.parent.postMessage({ fami: "close-reader" }, location.origin); } catch (e) {}
  }
  function ready() {
    if (readySent) return;
    readySent = true;
    try { window.parent.postMessage({ fami: "reader-ready" }, location.origin); } catch (e) {}
  }
  function savePos(sec, done) {
    var now = Date.now();
    if (!done && now - lastSave < 4000) return;
    lastSave = now;
    var body = { position: Math.max(0, Math.floor(sec || 0)) };
    if (done) {
      var fin = {};
      fin[videoId] = true;
      body.finished = fin;
    }
    fetch(withKey("/api/prefs?video=" + encodeURIComponent(videoId)), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(function () {});
  }
  function showEnd(on) {
    if (endMask) endMask.hidden = !on;
  }
  function startPlay() {
    if (!player.getAttribute("src")) player.src = mediaUrl();
    player.playsInline = true;
    var p = player.play();
    if (p && p.then) p.catch(function () {});
    if (playBtn) playBtn.hidden = true;
    if (waitEl) waitEl.hidden = true;
  }

  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  if (titleEl) titleEl.textContent = "";
  if (player) {
    player.poster = coverUrl();
    player.setAttribute("src", mediaUrl());
  }

  fetch(withKey("/api/video?video=" + encodeURIComponent(videoId)))
    .then(function (r) { return r.json(); })
    .then(function (info) {
      if (titleEl) titleEl.textContent = (info && info.title) || "";
      duration = Number(info && info.duration) || 0;
      return fetch(withKey("/api/prefs?video=" + encodeURIComponent(videoId))).then(function (r) { return r.json(); });
    })
    .then(function (prefs) {
      var pos = Number(prefs && prefs.position) || 0;
      if (player && pos > 2) {
        player.addEventListener("loadedmetadata", function () {
          try { player.currentTime = pos; } catch (e) {}
        }, { once: true });
      }
      if (waitEl) waitEl.hidden = true;
      ready();
    })
    .catch(function () {
      if (waitEl) waitEl.textContent = "維護中,請5分鐘後再試";
      ready();
    });

  if (playBtn) {
    playBtn.addEventListener("click", function () {
      startPlay();
    });
  }
  if (player) {
    player.addEventListener("play", function () {
      if (playBtn) playBtn.hidden = true;
      if (waitEl) waitEl.hidden = true;
    });
    player.addEventListener("timeupdate", function () {
      savePos(player.currentTime, false);
    });
    player.addEventListener("pause", function () {
      savePos(player.currentTime, false);
    });
    player.addEventListener("ended", function () {
      savePos(duration || player.currentTime, true);
      showEnd(true);
    });
  }
  document.getElementById("endAgain").addEventListener("click", function () {
    showEnd(false);
    try { player.currentTime = 0; } catch (e) {}
    startPlay();
  });
  document.getElementById("endHome").addEventListener("click", closeWatch);
  document.getElementById("backShelf").addEventListener("click", closeWatch);
  document.getElementById("backToShelf").addEventListener("click", closeWatch);

  function closeMenu() {
    if (menu) menu.hidden = true;
    if (catcher) catcher.hidden = true;
    if (gear) {
      gear.setAttribute("aria-expanded", "false");
      gear.classList.remove("is-live");
    }
  }
  function openMenu() {
    if (catcher) catcher.hidden = false;
    if (menu) menu.hidden = false;
    if (gear) {
      gear.setAttribute("aria-expanded", "true");
      gear.classList.add("is-live");
    }
  }
  if (gear) {
    gear.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (menu && menu.hidden) openMenu();
      else closeMenu();
    });
  }
  if (catcher) catcher.addEventListener("click", closeMenu);
})();
