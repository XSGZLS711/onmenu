// Demo back end, part 1: the store, the router and the fetch hook.
// Everything runs in the browser. Data is invented, is kept in this browser's local storage so it survives a reload,
// and can be reset from the account menu. Nothing talks to a server.
(function () {
  'use strict';
  var DB_KEY = 'softpos.demo.db.v4';
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  var routes = [];
  var modules = [];
  var saveTimer = 0;

  function ApiError(status, message, extra) {
    this.status = status; this.message = message; this.extra = extra || {};
  }
  ApiError.prototype = Object.create(Error.prototype);

  var Api = window.DemoApi = {
    ApiError: ApiError,
    db: null,
    writes: 0,
    reset: reset,
    save: save,
    route: route,
    round2: function (n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; },
    round4: function (n) { return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000; },
    nowIso: function () { return new Date().toISOString(); },
    uuid: function () { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); })); },
    next: function (name) { var db = Api.db; db.seq[name] = (db.seq[name] || 0) + 1; return db.seq[name]; },
    pad: function (n, w) { var s = String(n); while (s.length < (w || 4)) s = '0' + s; return s; },
    need: function (condition, message, status) { if (!condition) throw new ApiError(status || 400, message); },
    bad: function (message) { throw new ApiError(400, message); },
    log: []
  };

  // ---- store ---------------------------------------------------------------------
  function load() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) { var db = JSON.parse(raw); if (db && db.version === 4) return db; }
    } catch (e) { /* storage may be blocked or damaged */ }
    return null;
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(DB_KEY, JSON.stringify(Api.db)); } catch (e) { /* too large or blocked: keep working in memory */ }
    }, 150);
  }
  function build() {
    var db = { version: 4, seq: {} };
    Api.db = db;
    modules.forEach(function (m) { if (m.seed) m.seed(db); });
    modules.forEach(function (m) { if (m.afterSeed) m.afterSeed(db); });
    save();
    return db;
  }
  function reset() {
    try { localStorage.removeItem(DB_KEY); } catch (e) { /* ignore */ }
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    build();
  }
  Api.module = function (m) { modules.push(m); };
  Api.start = function () {
    Api.db = load();
    if (!Api.db) build();
    else modules.forEach(function (m) { if (m.migrate) m.migrate(Api.db); });
  };

  // ---- router --------------------------------------------------------------------
  function route(method, pattern, handler) {
    var keys = [];
    var source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:([A-Za-z]+)/g, function (m, key) { keys.push(key); return '([^/]+)'; });
    routes.push({ method: method, re: new RegExp('^' + source + '/?$'), keys: keys, handler: handler });
  }
  function find(method, path) {
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      if (r.method !== method) continue;
      var m = r.re.exec(path);
      if (!m) continue;
      var params = {};
      r.keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); });
      return { handler: r.handler, params: params };
    }
    return null;
  }
  function parseBody(init, raw) {
    var body = init && init.body !== undefined ? init.body : (raw && raw.body);
    if (body == null) return { json: {}, form: null };
    if (typeof FormData !== 'undefined' && body instanceof FormData) return { json: {}, form: body };
    if (typeof body === 'string') { try { return { json: JSON.parse(body), form: null }; } catch (e) { return { json: {}, form: null }; } }
    return { json: {}, form: null };
  }
  function respond(status, data) {
    var text = data === undefined ? 'null' : JSON.stringify(data);
    return new Response(status === 204 ? null : text, { status: status, headers: { 'content-type': 'application/json' } });
  }
  function dispatch(method, url, init, raw) {
    var q = {};
    url.searchParams.forEach(function (v, k) { q[k] = v; });
    var hit = find(method, url.pathname);
    if (!hit) {
      Api.log.push(method + ' ' + url.pathname);
      if (window.console && console.info) console.info('[demo] no handler for ' + method + ' ' + url.pathname + '; returned an empty answer');
      return respond(200, method === 'GET' ? [] : { message: 'Done (demo).' });
    }
    if (method !== 'GET') Api.writes++;
    try {
      var parsed = parseBody(init, raw);
      var out = hit.handler({ q: q, body: parsed.json, form: parsed.form, params: hit.params, method: method, url: url });
      if (out && typeof out.then === 'function') return out.then(finish, function (error) { return failure(error, method, url); });
      return finish(out);
    } catch (error) {
      return failure(error, method, url);
    }
  }
  function finish(out) {
    Api.save();
    return out instanceof Response ? out : respond(200, out);
  }
  function failure(error, method, url) {
    if (error instanceof ApiError) return respond(error.status, Object.assign({ message: error.message }, error.extra));
    if (window.console && console.error) console.error('[demo] handler failed for ' + method + ' ' + url.pathname, error);
    return respond(500, { message: 'Demo error: ' + (error && error.message || error) });
  }

  // another tab or page of the demo saved: pick up its data
  window.addEventListener('storage', function (e) {
    if (e.key !== DB_KEY || !e.newValue) return;
    try { var db = JSON.parse(e.newValue); if (db && db.version === 4) Api.db = db; } catch (x) { /* ignore */ }
  });
  Api.dataResponse = function (dataUrl) {
    var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(dataUrl || '');
    if (!m) return null;
    var bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes, { status: 200, headers: { 'content-type': m[1] || 'application/octet-stream' } });
  };

  if (realFetch) {
    window.fetch = function (input, init) {
      var rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
      var url;
      try { url = new URL(rawUrl, location.href); } catch (e) { return realFetch(input, init); }
      if (url.pathname.indexOf('/api/') !== 0) return realFetch(input, init);
      var method = ((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(dispatch(method, url, init, typeof input === 'string' ? null : input)); }, 40);
      });
    };
  }
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register = function () { return Promise.resolve({ scope: '', update: function () { return Promise.resolve(); }, unregister: function () { return Promise.resolve(true); } }); }; } catch (e) { /* ignore */ }
  }
})();
