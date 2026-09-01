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
    var base = origin();
    if (!base) {
      return Promise.reject(new Error("no_origin"));
    }
    var url = base + path + (path.indexOf("?") >= 0 ? "&" : "?") + "k=" + encodeURIComponent(key || "");
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, (opts && opts.timeout) || 20000);
    var init = { credentials: "omit", cache: "no-store", signal: ctrl.signal };
    if (opts) {
      if (opts.method) init.method = opts.method;
      if (opts.headers) init.headers = opts.headers;
      if (opts.body !== undefined) init.body = opts.body;
    }
    return fetch(url, init)
      .then(function (res) {
        return res.json().then(function (j) { return { res: res, j: j }; }).catch(function () {
          return { res: res, j: null };
        });
      })
      .finally(function () { clearTimeout(t); });
  }

  function apiRetry(path, key, opts) {
    var tries = (opts && opts.tries) || 3;
    function once(n) {
      return api(path, key, opts).then(function (x) {
        if (x && x.res && x.res.ok && x.j) return x;
        if (n >= tries) return x;
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(once(n + 1)); }, 400 * n);
        });
      }).catch(function (err) {
        if (n >= tries) throw err;
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            once(n + 1).then(resolve, reject);
          }, 400 * n);
        });
      });
    }
    return once(1);
  }

  function savePersonal(token) {
    if (!KEY_RE.test(token || "")) return;
    try { localStorage.setItem(STORE, token); } catch (e) {}
    try {
      var path = location.pathname.replace(/[^/]+$/, "") || "/";
      document.cookie = STORE + "=" + encodeURIComponent(token) + "; path=" + path + "; max-age=31536000; SameSite=Lax";
    } catch (e) {}
  }

  function isIPhone() {
    return /iPhone|iPod/.test(navigator.userAgent || "");
  }

  function pinKey(token) {
    if (isIPhone()) return;
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
    return (KEY_RE.test(stored) ? stored : "") || (KEY_RE.test(cookie) ? cookie : "") || fromUrl;
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
    var lastTop = -1;
    function apply() {
      var lift = Math.max(0, window.innerHeight - vv.height);
      var height = Math.round(vv.height);
      var top = Math.round(vv.offsetTop);
      if (Math.abs(height - lastHeight) >= 2 || lastHeight < 0) {
        lastHeight = height;
        document.documentElement.style.setProperty("--vvh", height + "px");
      }
      if (Math.abs(top - lastTop) >= 2 || lastTop < 0) {
        lastTop = top;
        document.documentElement.style.setProperty("--vv-top", top + "px");
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

  function lockSheetPage(mask) {
    if (!mask || mask.dataset.sheetLock) return;
    mask.dataset.sheetLock = "1";
    var lastY = 0;
    function paintOpen() {
      var open = !!document.querySelector(".batch-tag-mask:not([hidden]), .ask-mask:not([hidden]), .list-tag-mask:not([hidden])");
      document.documentElement.classList.toggle("tag-modal-open", open);
    }
    paintOpen();
    if (window.MutationObserver) {
      new MutationObserver(paintOpen).observe(mask, { attributes: true, attributeFilter: ["hidden"] });
    }
    mask.addEventListener("touchstart", function (ev) {
      if (ev.touches && ev.touches[0]) lastY = ev.touches[0].clientY;
    }, { passive: true });
    mask.addEventListener("touchmove", function (ev) {
      var node = ev.target && ev.target.nodeType === 1 ? ev.target : ev.target && ev.target.parentElement;
      var scroller = node && node.closest && node.closest(".list-tag-body, .tag-picker-suggest");
      var y = ev.touches && ev.touches[0] ? ev.touches[0].clientY : lastY;
      var dy = y - lastY;
      lastY = y;
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
        var atTop = scroller.scrollTop <= 0 && dy > 0;
        var atBot = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 && dy < 0;
        if (!atTop && !atBot) return;
      }
      ev.preventDefault();
    }, { passive: false });
  }

  function needsSafari() {
    var ua = navigator.userAgent || "";
    var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
    return ios && !safari && !window.navigator.standalone;
  }

  function refreshOrigin() {
    var prev = String(window.VAULT_ORIGIN || "").replace(/\/$/, "");
    return fetch("./config.js?v=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (text) {
        var m = text.match(/VAULT_ORIGIN\s*=\s*["']([^"']*)["']/);
        var next = m ? String(m[1] || "").replace(/\/$/, "") : "";
        if (!next || next === prev) return;
        return fetch(next + "/api/public", { cache: "no-store" }).then(function (res) {
          if (res && res.ok) window.VAULT_ORIGIN = next;
        });
      })
      .catch(function () {});
  }

  window.YRoomGate = {
    KEY_RE: KEY_RE,
    STORE: STORE,
    INSTALLED: INSTALLED,
    origin: origin,
    api: api,
    apiRetry: apiRetry,
    savePersonal: savePersonal,
    isIPhone: isIPhone,
    pinKey: pinKey,
    currentKey: currentKey,
    blockWebChrome: blockWebChrome,
    bindKeyboard: bindKeyboard,
    lockSheetPage: lockSheetPage,
    needsSafari: needsSafari,
    refreshOrigin: refreshOrigin,
  };
})();
