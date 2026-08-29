(function () {
  var KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
  var STORE = "yroom.viewKey";
  var INSTALLED = "yroom.installed";

  function origin() {
    var host = String(location.hostname || "");
    if (host === "127.0.0.1" || host === "localhost") {
      return String(location.origin || "").replace(/\/$/, "");
    }
    return String(window.VAULT_ORIGIN || "").replace(/\/$/, "");
  }

  function api(path, key, opts) {
    var base = origin() || location.origin.replace(/\/$/, "");
    var url = base + path + (path.indexOf("?") >= 0 ? "&" : "?") + "k=" + encodeURIComponent(key || "");
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, (opts && opts.timeout) || 8000);
    return fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}))
      .then(function (res) {
        return res.json().then(function (j) { return { res: res, j: j }; }).catch(function () {
          return { res: res, j: null };
        });
      })
      .finally(function () { clearTimeout(t); });
  }

  function savePersonal(token) {
    if (!KEY_RE.test(token || "")) return;
    try { localStorage.setItem(STORE, token); } catch (e) {}
    try {
      var path = location.pathname.replace(/[^/]+$/, "") || "/";
      document.cookie = STORE + "=" + encodeURIComponent(token) + "; path=" + path + "; max-age=31536000; SameSite=Lax";
    } catch (e) {}
  }

  function pinKey(token) {
    if (typeof navigator.standalone === "boolean" && !navigator.standalone) {
      var pin = location.pathname + "?k=" + encodeURIComponent(token) + "#k=" + encodeURIComponent(token);
      if (location.pathname + location.search + location.hash !== pin) {
        history.replaceState({}, "", pin);
      }
    }
  }

  function currentKey() {
    if (window.YROOM_FORCE_INVITE) {
      return KEY_RE.test(window.YROOM_URL_KEY || "") ? window.YROOM_URL_KEY : "";
    }
    var q = new URLSearchParams(location.search).get("k") || "";
    var h = "";
    try {
      var raw = (location.hash || "").replace(/^#/, "");
      h = raw.indexOf("k=") === 0
        ? decodeURIComponent((raw.slice(2).split("&")[0] || "").replace(/\+/g, " "))
        : (new URLSearchParams(raw).get("k") || "");
    } catch (e) {}
    var stored = "";
    try { stored = localStorage.getItem(STORE) || ""; } catch (e) {}
    var cookie = "";
    try {
      var m = document.cookie.match(/(?:^|; )yroom\.viewKey=([^;]*)/);
      cookie = m ? decodeURIComponent(m[1]) : "";
    } catch (e) {}
    var fromUrl = KEY_RE.test(q) ? q : KEY_RE.test(h) ? h : "";
    return fromUrl || (KEY_RE.test(stored) ? stored : "") || (KEY_RE.test(cookie) ? cookie : "");
  }

  function blockWebChrome() {
    document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    document.addEventListener("selectstart", function (e) {
      if (e.target && e.target.closest && e.target.closest("input, textarea")) return;
      e.preventDefault();
    });
    document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  }

  function bindKeyboard() {
    var vv = window.visualViewport;
    if (!vv) return;
    var painted = -1;
    var kbOn = false;
    var lastHeight = -1;
    function apply() {
      var lift = Math.max(0, window.innerHeight - vv.height);
      var height = Math.round(vv.height);
      if (Math.abs(height - lastHeight) >= 2 || lastHeight < 0) {
        lastHeight = height;
        document.documentElement.style.setProperty("--vvh", height + "px");
      }
      if (Math.abs(lift - painted) >= 8) {
        painted = lift;
        document.documentElement.style.setProperty("--kb", Math.round(lift) + "px");
      }
      if (lift > 100) kbOn = true;
      else if (lift < 40) kbOn = false;
      document.documentElement.classList.toggle("kb-up", kbOn);
    }
    vv.addEventListener("resize", apply);
    apply();
  }

  function needsSafari() {
    var ua = navigator.userAgent || "";
    var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
    return ios && !safari && !window.navigator.standalone;
  }

  function refreshOrigin() {
    return fetch("./config.js?v=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (text) {
        var m = text.match(/VAULT_ORIGIN\s*=\s*["']([^"']*)["']/);
        if (m) window.VAULT_ORIGIN = m[1];
      })
      .catch(function () {});
  }

  window.YRoomGate = {
    KEY_RE: KEY_RE,
    STORE: STORE,
    INSTALLED: INSTALLED,
    origin: origin,
    api: api,
    savePersonal: savePersonal,
    pinKey: pinKey,
    currentKey: currentKey,
    blockWebChrome: blockWebChrome,
    bindKeyboard: bindKeyboard,
    needsSafari: needsSafari,
    refreshOrigin: refreshOrigin,
  };
})();
