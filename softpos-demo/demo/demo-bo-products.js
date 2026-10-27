// Products and Recipes back-office pages. Owned by the products work stream.
// DemoBO.list (backoffice-design-spec 4.1) and DemoBO.drawer (4.2) are the two reusable parts. Later pages (suppliers, customers, roles) call them as they are:
//   DemoBO.list({ key, host, title, endpoint, columns, filters, buttons, bulk, ... })  -> { reload, refresh, setActive, focusRow, clearSelection, ... }
//   DemoBO.drawer({ title, fields, more, values, onSave, onDelete, ... })              -> { close, isDirty, setValue, rerender, values }
//   DemoBO.dialog({ title, message, body, confirmLabel, danger, onConfirm })           -> Promise (false when cancelled)
// Every piece of text goes through T(), which uses the demo's language switch; the Chinese is in i18n-products.js.
(function () {
  'use strict';
  var doc = document;

  // ---- small helpers ---------------------------------------------------------------------
  function T(en, vars) {
    var s = window.SoftPOSLanguage ? window.SoftPOSLanguage.t(en) : en;
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; }) : s;
  }
  function isZh() { return !!window.SoftPOSLanguage && window.SoftPOSLanguage.language === 'zh-CN'; }
  function plural(n, one, many) { return isZh() ? T(many, { n: n }) : T(n === 1 ? one : many, { n: n }); }
  function el(tag, props, kids) {
    var n = doc.createElement(tag), after = null;
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'value') after = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) n.appendChild(typeof c === 'object' ? c : doc.createTextNode(c)); });
    if (after !== null) n.value = after;
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(p) { uid.n = (uid.n || 0) + 1; return (p || 'bo') + uid.n; }
  function dp(n, d) { return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function money(n) { return dp(n, 2); }
  function qty(n) { return Number(Number(n).toFixed(4)).toLocaleString(undefined, { maximumFractionDigits: 4 }); }
  function store(key, value) {
    try {
      if (value === undefined) { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage may be blocked */ }
    return null;
  }
  var ICONS = {
    gear: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    down: '<path d="M6 9l6 6 6-6"/>', right: '<path d="M9 6l6 6-6 6"/>', left: '<path d="M15 6l-6 6 6 6"/>',
    first: '<path d="M11 6l-6 6 6 6M19 6l-6 6 6 6"/>', last: '<path d="M13 6l6 6-6 6M5 6l6 6-6 6"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
    recipe: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    up: '<path d="M6 15l6-6 6 6"/>'
  };
  function icon(name, size) {
    var s = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size || 16); s.setAttribute('height', size || 16); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'bo-ico');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = ICONS[name] || '';
    return s;
  }
  function shopId() { try { return typeof currentShop === 'function' ? currentShop() || 1 : 1; } catch (e) { return 1; } }
  // The page's own toast (app.js); the demo has no other way to say "saved".
  function notify(message, isError) { if (typeof window.toast === 'function') window.toast(message, !!isError); }
  // The server speaks English; the Chinese comes from the same dictionary as the rest of the page.
  function tmsg(m) { return T(String(m || '')); }

  // ---- calls to the back end -------------------------------------------------------------
  function call(method, url, body) {
    var opts = { method: method, headers: {}, credentials: 'same-origin' };
    try { if (typeof state !== 'undefined' && state.csrf && method !== 'GET') opts.headers['X-CSRF-TOKEN'] = state.csrf; } catch (e) { /* not signed in yet */ }
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = JSON.parse(t); } catch (e) { j = null; }
        if (!r.ok) { var err = new Error(tmsg((j && j.message) || 'Something went wrong. Try again.')); err.field = j && j.field; err.status = r.status; throw err; }
        return j !== null ? j : t;
      });
    });
  }
  function qs(params) {
    var out = [];
    Object.keys(params).forEach(function (k) { var v = params[k]; if (v !== '' && v !== null && v !== undefined) out.push(encodeURIComponent(k) + '=' + encodeURIComponent(v)); });
    return out.join('&');
  }
  function download(url, fileName) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(T('The file could not be created.')); return r.blob(); }).then(function (blob) {
      var a = doc.createElement('a'), u = URL.createObjectURL(blob);
      a.href = u; a.download = fileName; doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 1500);
    });
  }

  // ---- layers: popovers, dialogs and drawers share one Esc and Tab handler ----------------
  var layers = [], pop = null;
  function focusables(node) {
    return Array.prototype.slice.call(node.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')).filter(function (n) {
      return !n.disabled && n.getAttribute('tabindex') !== '-1' && n.type !== 'hidden' && !n.closest('[hidden]') && (n.offsetWidth || n.offsetHeight || n.getClientRects().length);
    });
  }
  doc.addEventListener('keydown', function (e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      if (pop) { e.preventDefault(); e.stopPropagation(); closePop(true); return; }
      var top = layers[layers.length - 1];
      if (top) { e.preventDefault(); e.stopPropagation(); top.onEsc(); }
    } else if (e.key === 'Tab') {
      var l = layers[layers.length - 1];
      if (!l || pop) return;
      var list = focusables(l.node);
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (!l.node.contains(doc.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);
  doc.addEventListener('mousedown', function (e) { if (pop && !pop.node.contains(e.target) && !pop.anchor.contains(e.target)) closePop(false); }, true);
  window.addEventListener('resize', function () { if (pop) closePop(false); });
  function openPop(anchor, node, o) {
    closePop(false);
    node.classList.add('bo-pop', 'bo-scope');
    doc.body.appendChild(node);
    var r = anchor.getBoundingClientRect(), w = node.offsetWidth, h = node.offsetHeight, vw = doc.documentElement.clientWidth, vh = window.innerHeight;
    var left = (o && o.alignRight) ? r.right - w : r.left, top = (o && o.up) ? r.top - h - 4 : r.bottom + 4;
    if (top < 4) top = r.bottom + 4;
    if (top + h > vh - 4 && r.top - h - 4 > 4) top = r.top - h - 4;
    node.style.left = Math.max(4, Math.min(left, vw - w - 4)) + 'px';
    node.style.top = Math.max(4, top) + 'px';
    anchor.setAttribute('aria-expanded', 'true');
    pop = { node: node, anchor: anchor, onClose: o && o.onClose };
    var f = focusables(node)[0];
    if (f) f.focus();
  }
  function closePop(refocus) {
    if (!pop) return;
    var p = pop;
    pop = null;
    p.node.remove();
    p.anchor.setAttribute('aria-expanded', 'false');
    if (p.onClose) p.onClose();
    if (refocus && p.anchor.isConnected) p.anchor.focus();
  }

  // ---- dialog ------------------------------------------------------------------------------
  // A small modal for confirmations and short forms. Resolves with the value of onConfirm (or true), and with false when cancelled.
  function dialog(o) {
    return new Promise(function (resolve) {
      var opener = doc.activeElement, id = uid('bo-dlg'), busy = false, done = false;
      var scrim = el('div', { class: 'bo-modal bo-scope' });
      var err = el('p', { class: 'bo-dialog-err', role: 'alert', hidden: true });
      var cancel = o.hideCancel ? null : el('button', { type: 'button', class: 'bo-btn', text: T(o.cancelLabel || 'Cancel') });
      var ok = el('button', { type: 'button', class: 'bo-btn ' + (o.danger ? 'bo-btn-danger' : 'bo-btn-primary'), text: T(o.confirmLabel || 'OK') });
      var body = el('div', { class: 'bo-dialog-body' }, [o.message ? el('p', { class: 'bo-dialog-msg', text: T(o.message, o.vars) }) : null, o.body || null, err]);
      var box = el('div', { class: 'bo-dialog', role: o.danger ? 'alertdialog' : 'dialog', 'aria-modal': 'true', 'aria-labelledby': id }, [
        el('h2', { id: id, class: 'bo-dialog-title', text: T(o.title, o.vars) }), body, el('div', { class: 'bo-dialog-foot' }, [cancel, ok])
      ]);
      scrim.appendChild(box);
      var layer = { node: box, onEsc: function () { if (!busy) finish(false); } };
      function finish(value) {
        if (done) return;
        done = true;
        layers.splice(layers.indexOf(layer), 1);
        scrim.remove();
        if (opener && opener.isConnected) opener.focus();
        resolve(value);
      }
      function fail(message) { err.textContent = message; err.hidden = false; }
      function confirm() {
        if (busy) return;
        err.hidden = true;
        var bad = o.validate ? o.validate() : '';
        if (bad) { fail(tmsg(bad)); return; }
        if (!o.onConfirm) { finish(true); return; }
        busy = true; ok.disabled = true; if (cancel) cancel.disabled = true;
        Promise.resolve().then(function () { return o.onConfirm(); }).then(function (v) { busy = false; finish(v === undefined ? true : v); }, function (e) {
          busy = false; ok.disabled = false; if (cancel) cancel.disabled = false; fail(tmsg(e && e.message));
        });
      }
      ok.addEventListener('click', confirm);
      if (cancel) cancel.addEventListener('click', function () { finish(false); });
      scrim.addEventListener('mousedown', function (e) { if (e.target === scrim && !busy) finish(false); });
      box.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && /^(INPUT)$/.test(e.target.tagName) && e.target.type !== 'file' && e.target.type !== 'checkbox') { e.preventDefault(); confirm(); }
      });
      doc.body.appendChild(scrim);
      layers.push(layer);
      var first = o.danger ? cancel || ok : (focusables(body)[0] || ok);
      first.focus();
    });
  }

  // ---- drawer form (spec 4.2) --------------------------------------------------------------
  // Fields are described, not written as markup: { name, label, type: text|number|select|switch|custom, required, options, helper(values, api), hidden(values), ... }.
  // { pair: [fieldA, fieldB] } puts two fields in one row. `more` holds the optional fields that sit under "More details".
  var drawers = [];
  function drawer(o) {
    var values = clone(o.values || {}), initial = JSON.stringify(values), errors = {}, busy = false, closed = false, moreOpen = !!o.moreOpen, banner = '';
    var opener = o.returnFocus || doc.activeElement, titleId = uid('bo-drw'), ups = [], inputs = {};
    var root = el('div', { class: 'bo-drawer-root bo-scope' });
    var scrim = el('div', { class: 'bo-scrim', onmousedown: function () { requestClose(); } });
    var panel = el('aside', { class: 'bo-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
    root.appendChild(scrim); root.appendChild(panel);
    var thenFn = null;
    var inst = { el: panel, values: values, close: close, isDirty: isDirty, setValue: setValue, rerender: build, error: setError, setBusy: setBusy, refresh: refresh, focus: focusField,
      closeThen: function (fn) { thenFn = fn; requestClose(); } };
    var layer = { node: panel, onEsc: function () { requestClose(); } };

    function isDirty() { return JSON.stringify(values) !== initial; }
    function refresh() { ups.forEach(function (u) { u(); }); }
    function setValue(name, v) {
      values[name] = v;
      var i = inputs[name];
      if (i) { if (i.kind === 'switch') i.sync(); else i.input.value = v === null || v === undefined ? '' : v; }
      refresh();
    }
    function setBusy(b) {
      busy = b;
      panel.classList.toggle('is-busy', b);
      Array.prototype.forEach.call(panel.querySelectorAll('.bo-drawer-foot button'), function (x) { x.disabled = b; });
      if (inputs.__save) inputs.__save.textContent = b ? T('Saving…') : T(o.saveLabel || 'Save');
    }
    function setError(name, message) {
      errors[name] = message;
      var i = inputs[name];
      if (!i) { banner = message; paintBanner(); return; }
      var row = i.row;
      row.classList.add('has-error');
      i.input.setAttribute('aria-invalid', 'true');
      var p = row.querySelector('.bo-err');
      if (!p) { p = el('p', { class: 'bo-err', id: uid('bo-err'), role: 'alert' }); row.appendChild(p); i.input.setAttribute('aria-describedby', p.id); }
      p.textContent = message;
      if (i.inMore && !moreOpen) toggleMore(true);
    }
    function clearErrors() {
      errors = {}; banner = ''; paintBanner();
      Object.keys(inputs).forEach(function (k) {
        var i = inputs[k];
        if (!i.row) return;
        i.row.classList.remove('has-error');
        i.input.removeAttribute('aria-invalid'); i.input.removeAttribute('aria-describedby');
        var p = i.row.querySelector('.bo-err');
        if (p) p.remove();
      });
    }
    function focusField(name) { var i = inputs[name]; if (i && i.input) { if (i.inMore && !moreOpen) toggleMore(true); i.input.focus(); } }
    var bannerEl = el('p', { class: 'bo-banner', role: 'alert', hidden: true });
    function paintBanner() { bannerEl.textContent = banner; bannerEl.hidden = !banner; }

    var api = { values: values, set: setValue, refresh: refresh, focus: focusField, error: setError, close: close, setBusy: setBusy, drawer: inst };
    function helperNode(f, helper) {
      return function () {
        var r = f.helper ? f.helper(values, api) : '';
        clear(helper);
        helper.hidden = !r;
        if (!r) return;
        if (typeof r === 'string') helper.appendChild(doc.createTextNode(r));
        else if (r.nodeType) helper.appendChild(r);
        else { helper.appendChild(doc.createTextNode(r.text || '')); if (r.action) { helper.appendChild(doc.createTextNode(' ')); helper.appendChild(el('button', { type: 'button', class: 'bo-link', text: r.action.label, onclick: r.action.run })); } }
      };
    }
    function buildField(f, inMore) {
      var id = uid('bo-f'), row = el('div', { class: 'bo-fieldrow', 'data-name': f.name || '' }), box = el('div', { class: 'bo-field' + (f.type === 'switch' ? ' is-switch' : '') });
      var label = el('label', { class: 'bo-flabel', for: id }, [T(f.label), f.required ? el('span', { class: 'bo-req', 'aria-hidden': 'true', text: '*' }) : null]);
      var helper = el('p', { class: 'bo-help', hidden: true });
      var input, rec = { row: row, inMore: inMore, kind: f.type };
      if (f.type === 'custom') {
        var made = f.render(values, api);
        row.appendChild(made.node);
        if (made.update) ups.push(made.update);
        if (f.name) inputs[f.name] = { row: row, input: made.node, inMore: inMore };
        if (f.hidden) ups.push(function () { row.hidden = !!f.hidden(values); });
        return row;
      }
      if (f.type === 'select') {
        input = el('select', { id: id, class: 'bo-input' });
        if (f.blank !== undefined) input.appendChild(el('option', { value: '', text: T(f.blank) }));
        (f.options || []).forEach(function (op) { input.appendChild(el('option', { value: String(op[0]), text: op[1] })); });
        input.value = values[f.name] === null || values[f.name] === undefined ? '' : String(values[f.name]);
        input.addEventListener('change', function () { values[f.name] = input.value; refresh(); });
      } else if (f.type === 'switch') {
        input = el('button', { id: id, type: 'button', class: 'bo-switch', role: 'switch' }, [el('span', { class: 'bo-track' }, [el('span', { class: 'bo-thumb' })]), el('span', { class: 'bo-state' })]);
        var sync = function () { var on = !!values[f.name]; input.setAttribute('aria-checked', on ? 'true' : 'false'); input.lastChild.textContent = T(on ? f.on : f.off); };
        rec.sync = sync; sync();
        input.addEventListener('click', function () { values[f.name] = !values[f.name]; sync(); refresh(); });
      } else {
        input = el('input', { id: id, class: 'bo-input', type: f.type === 'number' ? 'number' : 'text', maxlength: f.maxlength, autocomplete: 'off', placeholder: f.placeholder ? T(f.placeholder) : null,
          step: f.step, min: f.min, max: f.max, inputmode: f.type === 'number' ? 'decimal' : null });
        input.value = values[f.name] === null || values[f.name] === undefined ? '' : values[f.name];
        input.addEventListener('input', function () { values[f.name] = input.value; refresh(); });
      }
      if (f.required) input.setAttribute('aria-required', 'true');
      if (f.unit) box.appendChild(label), box.appendChild(input), box.appendChild(el('span', { class: 'bo-unit', text: f.unit }));
      else { box.appendChild(label); box.appendChild(input); }
      row.appendChild(box); row.appendChild(helper);
      rec.input = input; inputs[f.name] = rec;
      var paint = helperNode(f, helper);
      ups.push(function () {
        paint();
        if (f.hidden) row.hidden = !!f.hidden(values);
        if (f.disabled) input.disabled = !!f.disabled(values);
      });
      return row;
    }
    function buildEntry(f, inMore) {
      if (!f.pair) return buildField(f, inMore);
      var wrap = el('div', { class: 'bo-pair' }, f.pair.map(function (x) { return buildField(x, inMore); }));
      if (f.helper) {
        var helper = el('p', { class: 'bo-help', hidden: true });
        wrap.appendChild(helper);
        ups.push(helperNode(f, helper));
      }
      return wrap;
    }
    var moreBtn, moreBody;
    function toggleMore(open) {
      moreOpen = open === undefined ? !moreOpen : open;
      if (moreBtn) { moreBtn.setAttribute('aria-expanded', moreOpen ? 'true' : 'false'); moreBody.hidden = !moreOpen; }
    }

    function build() {
      var scrollTop = panel.querySelector('.bo-drawer-body') ? panel.querySelector('.bo-drawer-body').scrollTop : 0, hadFocus = doc.activeElement, focusName = null;
      Object.keys(inputs).forEach(function (k) { if (inputs[k].input === hadFocus) focusName = k; });
      ups = []; inputs = {}; clear(panel);
      var head = el('header', { class: 'bo-drawer-head' }, [
        el('div', { class: 'bo-drawer-titles' }, [el('h2', { id: titleId, text: T(o.title, o.vars) }), o.subtitle ? el('p', { text: o.subtitle }) : null]),
        el('button', { type: 'button', class: 'bo-iconbtn', 'aria-label': T('Close'), onclick: requestClose }, [icon('close', 18)])
      ]);
      var body = el('div', { class: 'bo-drawer-body' }, [bannerEl]);
      if (o.intro) body.appendChild(o.intro(values, api));
      (o.fields || []).forEach(function (f) { body.appendChild(buildEntry(f, false)); });
      if (o.more && o.more.length) {
        var mid = uid('bo-more');
        moreBtn = el('button', { type: 'button', class: 'bo-more', 'aria-expanded': moreOpen ? 'true' : 'false', 'aria-controls': mid, onclick: function () { toggleMore(); } }, [icon('down', 16), el('span', { text: T(o.moreLabel || 'More details') })]);
        moreBody = el('div', { id: mid, class: 'bo-more-body', hidden: !moreOpen }, o.more.map(function (f) { return buildEntry(f, true); }));
        body.appendChild(moreBtn); body.appendChild(moreBody);
      } else { moreBtn = null; moreBody = null; }
      if (o.outro) body.appendChild(o.outro(values, api));
      var del = o.onDelete ? el('button', { type: 'button', class: 'bo-btn bo-btn-icon bo-btn-danger-ghost', 'aria-label': T(o.deleteLabel || 'Delete'), title: T(o.deleteLabel || 'Delete'), onclick: askDelete }, [icon('trash', 18)]) : null;
      var save = el('button', { type: 'button', class: 'bo-btn bo-btn-primary', text: T(o.saveLabel || 'Save'), onclick: save_ });
      inputs.__save = save;
      var foot = el('footer', { class: 'bo-drawer-foot' }, [del, el('span', { class: 'bo-spacer' }), el('button', { type: 'button', class: 'bo-btn', text: T('Cancel'), onclick: requestClose }), save]);
      panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot);
      refresh();
      body.scrollTop = scrollTop;
      Object.keys(errors).forEach(function (k) { if (inputs[k]) setError(k, errors[k]); });
      if (banner) paintBanner();
      if (focusName && inputs[focusName]) inputs[focusName].input.focus();
      if (busy) setBusy(true);
    }

    function requestClose() {
      if (busy || closed) return;
      if (!isDirty()) { close(false); return; }
      dialog({ title: 'Discard your changes?', message: 'What you changed on this form has not been saved.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', danger: true }).then(function (yes) { if (yes) close(false); else { thenFn = null; focusFirst(); } });
    }
    function focusFirst() { var f = focusables(panel.querySelector('.bo-drawer-body') || panel)[0]; if (f) f.focus(); }
    function askDelete() {
      if (busy) return;
      dialog({ title: o.deleteTitle || 'Delete this item?', message: o.deleteMessage || 'This cannot be undone.', vars: o.vars, confirmLabel: 'Delete', danger: true }).then(function (yes) {
        if (!yes) return;
        clearErrors(); setBusy(true);
        Promise.resolve(o.onDelete(values, api)).then(function (res) { setBusy(false); close(true, res); }, function (e) { setBusy(false); banner = e.message; paintBanner(); panel.querySelector('.bo-drawer-body').scrollTop = 0; });
      });
    }
    function save_() {
      if (busy) return;
      clearErrors();
      var first = null;
      (o.fields || []).concat(o.more || []).forEach(function (f) {
        (f.pair || [f]).forEach(function (x) {
          if (!x.required || (x.hidden && x.hidden(values))) return;
          var v = values[x.name];
          if (v === null || v === undefined || String(v).trim() === '') { setError(x.name, T('Required')); if (!first) first = x.name; }
        });
      });
      if (first) { focusField(first); return; }
      var bad = o.validate ? o.validate(values) : null;
      if (bad) { setError(bad.field || '', tmsg(bad.message)); if (bad.field) focusField(bad.field); return; }
      setBusy(true);
      Promise.resolve(o.onSave(values, api)).then(function (res) { setBusy(false); close(true, res); }, function (e) {
        setBusy(false);
        if (e && e.field && inputs[e.field]) { setError(e.field, e.message); focusField(e.field); }
        else { banner = (e && e.message) || T('Something went wrong. Try again.'); paintBanner(); panel.querySelector('.bo-drawer-body').scrollTop = 0; }
      });
    }
    function close(saved, result) {
      if (closed) return;
      closed = true;
      layers.splice(layers.indexOf(layer), 1);
      drawers.splice(drawers.indexOf(inst), 1);
      panel.classList.remove('is-open');
      var finish = function () {
        root.remove();
        if (o.onClose) o.onClose(!!saved, result);
        if (opener && opener.isConnected) opener.focus();
        var next = thenFn;
        thenFn = null;
        if (next) next();
      };
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish(); else setTimeout(finish, 140);
    }
    panel.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
      var t = e.target;
      if (t.tagName === 'INPUT' && t.type !== 'checkbox' || t.tagName === 'SELECT') { e.preventDefault(); save_(); }
    });
    build();
    doc.body.appendChild(root);
    layers.push(layer); drawers.push(inst);
    requestAnimationFrame(function () { panel.classList.add('is-open'); });
    var start = o.focus && inputs[o.focus] ? inputs[o.focus].input : focusables(panel.querySelector('.bo-drawer-body'))[0];
    if (start) start.focus();
    return inst;
  }
  doc.addEventListener('softpos:languagechange', function () { drawers.forEach(function (d) { d.rerender(); }); });
  function closeDrawers() { drawers.slice().forEach(function (d) { d.close(false); }); }

  // ---- list page (spec 4.1) ----------------------------------------------------------------
  function list(cfg) {
    var KEY = 'demo.bo.' + cfg.key, saved = store(KEY) || {}, def = cfg.defaults || {};
    var st = { q: '', filters: Object.assign({}, def.filters || {}, saved.filters || {}), sort: saved.sort !== undefined ? saved.sort : (def.sort || ''), pageSize: saved.pageSize || def.pageSize || 50, hidden: saved.hidden || (def.hidden || []).slice(), adv: false };
    var pageNo = 1, data = null, selected = {}, seq = 0, activeId = null, failed = '', loading = false, inst = {};
    var host = cfg.host;
    clear(host); host.classList.add('bo-page', 'bo-scope');
    var cols = cfg.columns, byKey = {};
    cols.forEach(function (c) { byKey[c.key] = c; });

    function persist() { store(KEY, { filters: st.filters, sort: st.sort, pageSize: st.pageSize, hidden: st.hidden }); }
    function filterDefs() { return (cfg.filters || []).concat(cfg.advanced || []); }
    function isDefault() {
      if (st.q) return false;
      return filterDefs().every(function (f) { return String(st.filters[f.key] || '') === String((def.filters || {})[f.key] || ''); });
    }
    function selCount() { return Object.keys(selected).length; }

    // header
    var head = el('div', { class: 'bo-head' }, [el('div', { class: 'bo-head-text' }, [el('h2', { class: 'bo-title', text: T(cfg.title) }), cfg.help ? el('p', { class: 'bo-help-line', text: T(cfg.help) }) : null]), el('div', { class: 'bo-head-links' })]);
    // toolbar
    var toolbar = el('div', { class: 'bo-toolbar', role: 'toolbar', 'aria-label': T(cfg.title) });
    var left = el('div', { class: 'bo-tb-left' }), right = el('div', { class: 'bo-tb-right' });
    var searchBox = el('input', { class: 'bo-input bo-search', type: 'search', autocomplete: 'off', 'aria-label': T(cfg.searchLabel || 'Search'), placeholder: T(cfg.searchPlaceholder || 'Name, code or barcode'), value: '' });
    var searchBtn = el('button', { type: 'button', class: 'bo-btn bo-btn-accent', text: T('Search') });
    var advBtn = el('button', { type: 'button', class: 'bo-btn bo-btn-link', 'aria-expanded': st.adv ? 'true' : 'false' }, [el('span', { text: T('Advanced') }), icon('down', 14)]);
    var clearBtn = el('button', { type: 'button', class: 'bo-link bo-clear', text: T('Clear filters'), hidden: true });
    var advPanel = el('div', { class: 'bo-adv', hidden: !st.adv });
    toolbar.appendChild(left); toolbar.appendChild(right);
    var selects = {};
    function filterField(f, boxed) {
      var s = el('select', { class: 'bo-input', 'aria-label': T(f.label) });
      if (!f.noBlank) s.appendChild(el('option', { value: '', text: T(f.all || f.label) }));
      (f.options || []).forEach(function (op) { s.appendChild(el('option', { value: String(op[0]), text: f.tr ? T(op[1]) : op[1] })); });
      s.value = st.filters[f.key] === undefined ? '' : String(st.filters[f.key]);
      s.addEventListener('change', function () { st.filters[f.key] = s.value; apply(); });
      selects[f.key] = s;
      if (!boxed) return s;
      var id = uid('bo-af'); s.id = id;
      return el('div', { class: 'bo-field bo-adv-field' }, [el('label', { class: 'bo-flabel', for: id, text: T(f.label) }), s]);
    }
    function buildToolbar() {
      clear(left); clear(right); clear(advPanel); selects = {};
      (cfg.buttons || []).forEach(function (b) {
        left.appendChild(el('button', { type: 'button', class: 'bo-btn' + (b.kind === 'primary' ? ' bo-btn-primary' : ''), 'data-act': b.key, text: T(b.label), onclick: function () { b.run(inst); } }));
      });
      (cfg.filters || []).forEach(function (f) { right.appendChild(filterField(f, false)); });
      right.appendChild(searchBox); right.appendChild(searchBtn);
      if ((cfg.advanced || []).length) right.appendChild(advBtn);
      right.appendChild(clearBtn);
      (cfg.advanced || []).forEach(function (f) { advPanel.appendChild(filterField(f, true)); });
    }
    buildToolbar();
    searchBox.value = st.q;
    st.adv = (cfg.advanced || []).some(function (f) { return String(st.filters[f.key] || '') !== String((def.filters || {})[f.key] || ''); });
    advBtn.setAttribute('aria-expanded', st.adv ? 'true' : 'false'); advPanel.hidden = !st.adv;

    // table
    var wrap = el('div', { class: 'bo-table-wrap', tabindex: '-1' }), tableBox = el('div', { class: 'bo-table-box' });
    wrap.appendChild(tableBox);
    // footer
    var foot = el('div', { class: 'bo-foot' });
    host.appendChild(head); host.appendChild(toolbar); host.appendChild(advPanel); host.appendChild(wrap); host.appendChild(foot);
    renderLinks();

    function renderLinks() {
      var box = head.querySelector('.bo-head-links');
      clear(box);
      (cfg.links || []).forEach(function (l) { box.appendChild(el('button', { type: 'button', class: 'bo-link', text: T(l.label), onclick: l.run })); });
    }
    function apply() { pageNo = 1; st.q = searchBox.value.trim(); persist(); load(); }
    searchBtn.addEventListener('click', apply);
    searchBox.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); apply(); } });
    advBtn.addEventListener('click', function () { st.adv = !st.adv; advBtn.setAttribute('aria-expanded', st.adv ? 'true' : 'false'); advPanel.hidden = !st.adv; sizeSoon(); });
    clearBtn.addEventListener('click', function () {
      st.q = ''; searchBox.value = ''; st.filters = Object.assign({}, def.filters || {});
      Object.keys(selects).forEach(function (k) { selects[k].value = st.filters[k] === undefined ? '' : String(st.filters[k]); });
      pageNo = 1; persist(); load();
    });

    // ---- loading ----
    function query() {
      var p = { shopId: shopId(), page: pageNo, pageSize: st.pageSize, sort: st.sort, q: st.q };
      Object.keys(st.filters).forEach(function (k) { if (st.filters[k] !== '' && st.filters[k] !== undefined) p['filter[' + k + ']'] = st.filters[k]; });
      return p;
    }
    function load() {
      var mine = ++seq;
      loading = true; failed = '';
      host.setAttribute('aria-busy', 'true');
      paintChrome();
      return call('GET', cfg.endpoint + '?' + qs(query())).then(function (d) {
        if (mine !== seq) return;
        loading = false; data = d; pageNo = d.page;
        host.setAttribute('aria-busy', 'false');
        paint();
      }, function (e) {
        if (mine !== seq) return;
        loading = false; failed = e.message; host.setAttribute('aria-busy', 'false'); paint();
      });
    }
    function paintChrome() { clearBtn.hidden = isDefault(); wrap.classList.toggle('is-loading', loading && !!data); if (!data) paintTable(); }

    // ---- table ----
    function visibleCols() { return cols.filter(function (c) { return st.hidden.indexOf(c.key) < 0; }); }
    function sortKeyOf(c) { return c.sort === undefined ? c.key : c.sort; }
    function paint() { clearBtn.hidden = isDefault(); wrap.classList.remove('is-loading'); paintTable(); paintFoot(); sizeSoon(); }
    function paintTable() {
      clear(tableBox);
      if (failed) { tableBox.appendChild(el('div', { class: 'bo-empty', role: 'alert' }, [el('p', { text: failed }), el('button', { type: 'button', class: 'bo-btn', text: T('Try again'), onclick: function () { load(); } })])); return; }
      if (!data) { tableBox.appendChild(el('div', { class: 'bo-empty', role: 'status' }, [el('p', { text: T('Loading…') })])); return; }
      if (!data.rows.length) {
        var e = cfg.empty || {}, kids = [el('p', { text: T(isDefault() ? (e.none || 'Nothing here yet.') : (e.text || 'Nothing matches these filters.')) })], row = el('div', { class: 'bo-empty-actions' });
        if (!isDefault()) row.appendChild(el('button', { type: 'button', class: 'bo-btn', text: T('Clear filters'), onclick: function () { clearBtn.click(); } }));
        if (e.action) row.appendChild(el('button', { type: 'button', class: 'bo-btn bo-btn-primary', text: T(e.action.label), onclick: function () { e.action.run(inst); } }));
        kids.push(row);
        tableBox.appendChild(el('div', { class: 'bo-empty' }, kids));
        return;
      }
      var table = el('table', { class: 'bo-table' }), thead = el('thead'), tr = el('tr');
      var gear = el('button', { type: 'button', class: 'bo-iconbtn', 'aria-label': T('Choose columns'), title: T('Choose columns'), 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: function (e) { columnPicker(e.currentTarget); } }, [icon('gear', 16)]);
      tr.appendChild(el('th', { scope: 'col', class: 'bo-c-sel' }, [gear]));
      tr.appendChild(el('th', { scope: 'col', class: 'bo-c-no', text: T('No.') }));
      tr.appendChild(el('th', { scope: 'col', class: 'bo-c-act', text: T('Actions') }));
      visibleCols().forEach(function (c) {
        var th = el('th', { scope: 'col', class: (c.align ? 'is-' + c.align : '') + (c.className ? ' ' + c.className : '') });
        var key = sortKeyOf(c);
        if (key) {
          var on = st.sort === key ? 'asc' : st.sort === '-' + key ? 'desc' : '';
          th.setAttribute('aria-sort', on === 'asc' ? 'ascending' : on === 'desc' ? 'descending' : 'none');
          th.appendChild(el('button', { type: 'button', class: 'bo-sort' + (on ? ' is-on' : ''), 'aria-label': T('Sort by {name}', { name: T(c.label) }), onclick: function () { st.sort = st.sort === key ? '-' + key : key; pageNo = 1; persist(); load(); } },
            [el('span', { text: T(c.label) }), el('span', { class: 'bo-arrows', 'aria-hidden': 'true' }, [el('i', { class: 'up' + (on === 'asc' ? ' on' : '') }), el('i', { class: 'dn' + (on === 'desc' ? ' on' : '') })])]));
        } else th.textContent = T(c.label);
        tr.appendChild(th);
      });
      thead.appendChild(tr); table.appendChild(thead);
      var tbody = el('tbody'), offset = (data.page - 1) * data.pageSize;
      data.rows.forEach(function (row, i) {
        var id = row[cfg.rowId], rtr = el('tr', { 'data-id': id, class: (selected[id] ? 'is-selected ' : '') + (activeId === id ? 'is-editing ' : '') + (cfg.rowClass ? cfg.rowClass(row) || '' : '') });
        var cb = el('input', { type: 'checkbox', 'aria-label': T('Select row {n}', { n: offset + i + 1 }), onchange: function () { if (cb.checked) selected[id] = true; else delete selected[id]; rtr.classList.toggle('is-selected', cb.checked); paintFoot(); } });
        cb.checked = !!selected[id];
        rtr.appendChild(el('td', { class: 'bo-c-sel' }, [cb]));
        rtr.appendChild(el('td', { class: 'bo-c-no', text: String(offset + i + 1) }));
        var acts = el('td', { class: 'bo-c-act' });
        (cfg.rowActions ? cfg.rowActions(row) : []).forEach(function (a) {
          acts.appendChild(el('button', { type: 'button', class: 'bo-link' + (a.danger ? ' is-danger' : ''), 'data-act': a.key || '', text: T(a.label), 'aria-label': T(a.label) + ' ' + (a.name ? a.name(row) : ''), onclick: function (e) { a.run(row, e.currentTarget, inst); } }));
        });
        rtr.appendChild(acts);
        visibleCols().forEach(function (c) {
          var td = el('td', { class: (c.align ? 'is-' + c.align : '') + (c.className ? ' ' + c.className : '') });
          var v = c.render ? c.render(row, { inst: inst }) : row[c.key];
          if (v === null || v === undefined || v === '') v = '—';
          td.appendChild(typeof v === 'object' ? v : doc.createTextNode(String(v)));
          rtr.appendChild(td);
        });
        tbody.appendChild(rtr);
      });
      table.appendChild(tbody); tableBox.appendChild(table);
    }
    function columnPicker(anchor) {
      var box = el('div', { class: 'bo-colpick', role: 'group', 'aria-label': T('Choose columns') });
      cols.forEach(function (c) {
        var id = uid('bo-col'), cb = el('input', { type: 'checkbox', id: id, onchange: function () {
          var at = st.hidden.indexOf(c.key);
          if (cb.checked && at >= 0) st.hidden.splice(at, 1);
          if (!cb.checked && at < 0) st.hidden.push(c.key);
          persist(); paintTable();
        } });
        cb.checked = st.hidden.indexOf(c.key) < 0;
        if (c.fixed) cb.disabled = true;
        box.appendChild(el('div', { class: 'bo-colrow' }, [cb, el('label', { for: id, text: T(c.label) })]));
      });
      box.appendChild(el('button', { type: 'button', class: 'bo-link', text: T('Reset columns'), onclick: function () { st.hidden = (def.hidden || []).slice(); persist(); closePop(false); paintTable(); } }));
      openPop(anchor, box, {});
    }

    // ---- footer ----
    function paintFoot() {
      clear(foot);
      if (!data) return;
      var rows = data.rows, ids = rows.map(function (r) { return r[cfg.rowId]; }), n = selCount();
      var allOn = ids.length > 0 && ids.every(function (id) { return selected[id]; });
      var allCb = el('input', { type: 'checkbox', id: uid('bo-all'), 'aria-label': T('Select all rows on this page'), onchange: function () {
        ids.forEach(function (id) { if (allCb.checked) selected[id] = true; else delete selected[id]; });
        Array.prototype.forEach.call(tableBox.querySelectorAll('tbody tr'), function (tr) { var on = !!selected[tr.getAttribute('data-id') * 1 || tr.getAttribute('data-id')]; var c = tr.querySelector('.bo-c-sel input'); if (c) { c.checked = allCb.checked; tr.classList.toggle('is-selected', allCb.checked); } });
        paintFoot();
      } });
      allCb.checked = allOn;
      var bulkBtn = el('button', { type: 'button', class: 'bo-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', disabled: n === 0 || !(cfg.bulk || []).length }, [el('span', { text: T('Bulk action') }), icon('down', 14)]);
      bulkBtn.addEventListener('click', function () {
        var menu = el('div', { class: 'bo-menu', role: 'menu' });
        cfg.bulk.forEach(function (b) {
          menu.appendChild(el('button', { type: 'button', role: 'menuitem', class: 'bo-menuitem' + (b.danger ? ' is-danger' : ''), text: T(b.label), onclick: function () { closePop(false); b.run(Object.keys(selected).map(function (k) { return isNaN(k) ? k : Number(k); }), inst); } }));
        });
        openPop(bulkBtn, menu, { up: true });
      });
      var left = el('div', { class: 'bo-foot-left' }, [el('label', { class: 'bo-allrow', for: allCb.id }, [allCb, el('span', { text: T('All') })]),
        el('span', { class: 'bo-sel-count', text: T('Selected {n}', { n: n }) }), n ? el('button', { type: 'button', class: 'bo-link', text: T('Clear'), onclick: function () { clearSelection(); } }) : null, bulkBtn]);
      var totals = el('div', { class: 'bo-totals', role: 'status', text: cfg.totalsText ? cfg.totalsText(data.totals || {}, data) : plural(data.total, '{n} row', '{n} rows') });
      var pages = Math.max(1, data.pages), go = function (p) { pageNo = Math.min(pages, Math.max(1, p)); load(); };
      var size = el('select', { class: 'bo-input bo-size', 'aria-label': T('Rows per page') }, [20, 50, 100].map(function (v) { return el('option', { value: v, text: String(v) }); }));
      size.value = String(st.pageSize);
      size.addEventListener('change', function () { st.pageSize = Number(size.value); pageNo = 1; persist(); load(); });
      var pager = el('div', { class: 'bo-pager' }, [
        el('button', { type: 'button', class: 'bo-iconbtn', 'aria-label': T('First page'), disabled: data.page <= 1, onclick: function () { go(1); } }, [icon('first', 16)]),
        el('button', { type: 'button', class: 'bo-iconbtn', 'aria-label': T('Previous page'), disabled: data.page <= 1, onclick: function () { go(data.page - 1); } }, [icon('left', 16)]),
        el('span', { class: 'bo-pageno', text: data.page + ' / ' + pages }),
        el('button', { type: 'button', class: 'bo-iconbtn', 'aria-label': T('Next page'), disabled: data.page >= pages, onclick: function () { go(data.page + 1); } }, [icon('right', 16)]),
        el('button', { type: 'button', class: 'bo-iconbtn', 'aria-label': T('Last page'), disabled: data.page >= pages, onclick: function () { go(pages); } }, [icon('last', 16)]),
        el('label', { class: 'bo-sizelabel' }, [el('span', { text: T('Rows per page') }), size])
      ]);
      foot.appendChild(left); foot.appendChild(totals); foot.appendChild(pager);
    }
    function clearSelection() {
      selected = {};
      Array.prototype.forEach.call(tableBox.querySelectorAll('tbody tr'), function (tr) { tr.classList.remove('is-selected'); var c = tr.querySelector('.bo-c-sel input'); if (c) c.checked = false; });
      paintFoot();
    }

    // ---- sizing: the table takes the height that is left on a desk; on a phone the page just scrolls ----
    var sizeTimer = 0;
    function size_() {
      if (!host.getClientRects().length) return;
      var top = Math.round(host.getBoundingClientRect().top + window.pageYOffset) + 'px';
      if (host.style.getPropertyValue('--bo-top') !== top) host.style.setProperty('--bo-top', top);
    }
    function sizeSoon() { clearTimeout(sizeTimer); sizeTimer = setTimeout(size_, 30); }
    window.addEventListener('resize', sizeSoon);
    if (window.ResizeObserver) new ResizeObserver(sizeSoon).observe(host);
    doc.addEventListener('change', function (e) { if (e.target && e.target.id === 'shopSelect' && host.offsetParent) { selected = {}; load(); } });
    doc.addEventListener('softpos:languagechange', function () {
      if (!host.isConnected) return;
      clear(head.querySelector('.bo-head-text')); head.querySelector('.bo-head-text').appendChild(el('h2', { class: 'bo-title', text: T(cfg.title) }));
      if (cfg.help) head.querySelector('.bo-head-text').appendChild(el('p', { class: 'bo-help-line', text: T(cfg.help) }));
      renderLinks(); rebuildToolbar(); if (data) { paintTable(); paintFoot(); }
    });
    function rebuildToolbar() {
      searchBox.setAttribute('aria-label', T(cfg.searchLabel || 'Search')); searchBox.setAttribute('placeholder', T(cfg.searchPlaceholder || 'Name, code or barcode'));
      searchBtn.textContent = T('Search'); advBtn.firstChild.textContent = T('Advanced'); clearBtn.textContent = T('Clear filters');
      buildToolbar();
    }

    inst = {
      el: host, state: st, key: cfg.key,
      reload: load,
      data: function () { return data; },
      query: query,
      selected: function () { return Object.keys(selected).map(function (k) { return isNaN(k) ? k : Number(k); }); },
      clearSelection: clearSelection,
      setActive: function (id) { activeId = id; Array.prototype.forEach.call(tableBox.querySelectorAll('tbody tr'), function (tr) { tr.classList.toggle('is-editing', activeId !== null && tr.getAttribute('data-id') === String(activeId)); }); },
      focusRow: function (id) {
        var tr = tableBox.querySelector('tr[data-id="' + id + '"]');
        var t = tr && (tr.querySelector('.bo-c-act button') || tr.querySelector('input'));
        if (t) { t.focus(); if (t.scrollIntoView) t.scrollIntoView({ block: 'nearest' }); }
      },
      setFilterOptions: function (key, options) { filterDefs().forEach(function (f) { if (f.key === key) f.options = options; }); buildToolbar(); },
      resize: size_,
      exportUrl: function () { var p = query(); delete p.page; delete p.pageSize; return cfg.exportUrl + '?' + qs(Object.assign({ format: 'csv' }, p)); }
    };
    load();
    return inst;
  }

  // ==== pages built on the two components =====================================================
  var lookupCache = null, shopCache = null;
  function lookups(force) {
    if (lookupCache && !force) return Promise.resolve(lookupCache);
    return Promise.all([call('GET', '/api/inventory/operations-lookups?shopId=' + shopId()), call('GET', '/api/inventory/lookups')]).then(function (r) { lookupCache = r[0]; shopCache = r[1].shops; return lookupCache; });
  }
  function opts(rows) { return rows.map(function (x) { return [x.id, x.name]; }); }
  function shopName() { var s = doc.getElementById('shopSelect'); return s && s.selectedOptions[0] ? s.selectedOptions[0].textContent : T('this shop'); }
  // After an edit the sale screen and the old inventory forms read the catalogue again, so they never show stale prices.
  function syncSale() {
    try { if (typeof loadProducts === 'function') loadProducts(); } catch (e) { /* the sale screen is not ready */ }
    try { if (typeof opsState !== 'undefined') opsState.lookups = null; } catch (e) { /* ignore */ }
  }
  function ensureView(id) {
    var v = doc.getElementById(id);
    if (!v) { v = el('section', { id: id, class: 'view bo-page' }); (doc.querySelector('#appScreen > main') || doc.querySelector('main') || doc.body).appendChild(v); }
    return v;
  }
  function showView(v) {
    try { if (typeof activateTab === 'function') activateTab(v.id); } catch (e) { /* offline mode refuses; fall through */ }
    Array.prototype.forEach.call(doc.querySelectorAll('.view'), function (x) { x.classList.toggle('active-view', x === v); });
    window.scrollTo(0, 0);
  }
  function resultDialog(title, message, lines) {
    var body = lines && lines.length ? el('ul', { class: 'bo-dialog-list' }, lines.map(function (l) { return el('li', { text: l }); })) : null;
    return dialog({ title: title, message: message, body: body, confirmLabel: 'OK', hideCancel: true });
  }
  function csvChooser(templateUrl, templateName, hint) {
    var file = el('input', { type: 'file', accept: '.csv,text/csv', class: 'bo-file', 'aria-label': T('Choose a CSV file') }), text = null;
    var body = el('div', { class: 'bo-import' }, [el('p', { class: 'bo-help', text: T(hint) }), el('button', { type: 'button', class: 'bo-link', text: T('Download the template'), onclick: function () { download(templateUrl, templateName); } }), file]);
    file.addEventListener('change', function () {
      text = null;
      if (!file.files[0]) return;
      var r = new FileReader();
      r.onload = function () { text = String(r.result); };
      r.readAsText(file.files[0]);
    });
    return { body: body, text: function () { return text; }, picked: function () { return !!file.files[0]; } };
  }

  // ---- Products ----------------------------------------------------------------------------
  var products = { list: null, view: null };
  function statusCell(r) { return el('span', { class: r.active ? 'bo-ok' : 'bo-muted' }, [(r.active ? '● ' : '○ ') + T(r.active ? 'Active' : 'Inactive')]); }
  function yesNo(v) { return v ? T('Yes') : T('No'); }
  function stockCell(r) {
    if (r.stock === null) return null;
    if (r.stock < 0) return el('span', { class: 'bo-neg bo-with-ico', title: T('Negative stock') }, [icon('warn', 14), qty(r.stock)]);
    return r.stock === 0 ? el('span', { class: 'bo-muted', text: '0' }) : qty(r.stock);
  }
  function recipeIconCell(r) {
    if (r.stockItem) return null;
    return el('span', { class: 'bo-rcp' + (r.hasRecipe ? ' on' : ''), title: T(r.hasRecipe ? 'Has a recipe' : 'No recipe') }, [icon('recipe', 18), el('span', { class: 'bo-sr', text: T(r.hasRecipe ? 'Has a recipe' : 'No recipe') })]);
  }
  function productTotals(t) {
    var parts = [plural(t.count, '{n} product', '{n} products'), T('stock value FJD {x}', { x: money(t.stockValue) })];
    if (t.negative) parts.push(T('{n} with negative stock', { n: t.negative }));
    return parts.join(' · ');
  }
  function productColumns() {
    return [
      { key: 'name', label: 'Name', fixed: true, render: function (r) { return el('button', { type: 'button', class: 'bo-link bo-name', text: r.name, onclick: function (e) { editProduct(r, e.currentTarget); } }); } },
      { key: 'code', label: 'Code' },
      { key: 'category', label: 'Category', render: function (r) { return r.categoryName; } },
      { key: 'price', label: 'Retail price', align: 'right', render: function (r) { return money(r.price); } },
      { key: 'cost', label: 'Cost price', align: 'right', render: function (r) { return money(r.cost); } },
      { key: 'margin', label: 'Margin', align: 'right', render: function (r) { return r.margin === null ? null : dp(r.margin, 1) + '%'; } },
      { key: 'stock', label: 'Stock', align: 'right', render: stockCell },
      { key: 'unit', label: 'Unit' },
      { key: 'subUnit', label: 'Sub unit' },
      { key: 'menuNo', label: 'Menu no.', align: 'right', render: function (r) { return r.menuNo; } },
      { key: 'status', label: 'Status', render: statusCell },
      { key: 'recipe', label: 'Recipe', align: 'center', render: recipeIconCell },
      { key: 'weighed', label: 'Weighed', render: function (r) { return yesNo(r.weighed); } },
      { key: 'favourite', label: 'Favourite', render: function (r) { return yesNo(r.favourite); } },
      { key: 'department', label: 'Department', render: function (r) { return r.departmentName; } },
      { key: 'supplier', label: 'Supplier', render: function (r) { return r.supplierName; } },
      { key: 'barcode', label: 'Barcode' },
      { key: 'spec', label: 'Specification' }
    ];
  }
  function afterChange(listInst, id) {
    syncSale();
    return listInst.reload().then(function () { if (id) listInst.focusRow(id); });
  }
  function buildProducts(view) {
    return lookups(true).then(function (lk) {
      var cats = opts(lk.categories);
      products.list = list({
        key: 'products', host: view, title: 'Products', help: 'Prices, costs and stock for everything you sell. Select Edit on a row to change it.',
        endpoint: '/api/bo/products', exportUrl: '/api/bo/products/export', rowId: 'productId', searchPlaceholder: 'Name, code or barcode',
        links: [{ label: 'Recipes', run: function () { if (window.DemoPages) window.DemoPages.open('bo:recipes'); } }],
        defaults: { sort: 'name', pageSize: 50, filters: { status: 'active' }, hidden: ['margin', 'subUnit', 'weighed', 'favourite', 'department', 'supplier', 'barcode', 'spec'] },
        columns: productColumns(),
        buttons: [
          { key: 'new', label: 'New', kind: 'primary', run: function () { newProduct(); } },
          { key: 'import', label: 'Import', run: function () { importProducts(); } },
          { key: 'export', label: 'Export CSV', run: function (l) { download(l.exportUrl(), 'products.csv').catch(function (e) { notify(e.message, true); }); } },
          { key: 'copy', label: 'Copy to shop', run: function (l) { copyToShop(l, '/api/bo/products/copy', 'products'); } }
        ],
        filters: [
          { key: 'categoryId', label: 'Category', all: 'All categories', options: cats },
          { key: 'type', label: 'Type', all: 'All types', tr: true, options: [['stock', 'Stock items'], ['nonstock', 'Non-stock items']] }
        ],
        advanced: [
          { key: 'status', label: 'Status', noBlank: true, tr: true, options: [['active', 'Active'], ['inactive', 'Inactive'], ['all', 'Active and inactive']] },
          { key: 'departmentId', label: 'Department', all: 'All departments', options: opts(lk.departments) },
          { key: 'supplierId', label: 'Supplier', all: 'All suppliers', options: opts(lk.suppliers) },
          { key: 'stockLevel', label: 'Stock level', all: 'Any stock level', tr: true, options: [['negative', 'Negative stock'], ['zero', 'Zero stock'], ['positive', 'In stock']] },
          { key: 'recipe', label: 'Recipe', all: 'With or without recipe', tr: true, options: [['has', 'Has a recipe'], ['none', 'No recipe']] },
          { key: 'favourite', label: 'Favourite', all: 'Any', tr: true, options: [['yes', 'Favourites only']] },
          { key: 'menu', label: 'Menu number', all: 'Any', tr: true, options: [['yes', 'With a menu number']] }
        ],
        bulk: [
          { key: 'activate', label: 'Make active', run: function (ids, l) { bulkProducts(l, ids, 'activate'); } },
          { key: 'deactivate', label: 'Make inactive', run: function (ids, l) { bulkProducts(l, ids, 'deactivate'); } },
          { key: 'category', label: 'Change category…', run: function (ids, l) { bulkCategory(l, ids, cats); } },
          { key: 'favourite', label: 'Add to favourites', run: function (ids, l) { bulkProducts(l, ids, 'favourite'); } },
          { key: 'unfavourite', label: 'Remove from favourites', run: function (ids, l) { bulkProducts(l, ids, 'unfavourite'); } },
          { key: 'delete', label: 'Delete', danger: true, run: function (ids, l) { bulkProducts(l, ids, 'delete'); } }
        ],
        rowActions: function (r) {
          return [{ key: 'edit', label: 'Edit', name: function (x) { return x.name; }, run: function (row, btn) { editProduct(row, btn); } },
            { key: 'delete', label: 'Delete', danger: true, name: function (x) { return x.name; }, run: function (row, btn) { deleteProduct(row, btn); } }];
        },
        totalsText: productTotals,
        empty: { none: 'No products yet.', text: 'No products match these filters.', action: { label: 'New product', run: function () { newProduct(); } } }
      });
    });
  }
  function bulkProducts(l, ids, action) {
    var go = function () {
      return call('POST', '/api/bo/products/bulk', { ids: ids, action: action, shopId: shopId() }).then(function (r) {
        l.clearSelection();
        return afterChange(l).then(function () {
          if (r.skipped && r.skipped.length) return resultDialog('Some products were kept', plural(r.skipped.length, '{n} product could not be deleted. It has history, so make it inactive instead.', '{n} products could not be deleted. They have history, so make them inactive instead.'), r.skipped.map(function (x) { return x.name; }));
          notify(plural(r.done, '{n} product updated.', '{n} products updated.'));
        });
      }, function (e) { notify(e.message, true); });
    };
    if (action === 'delete') return dialog({ title: 'Delete the selected products?', message: plural(ids.length, 'Delete {n} product? This cannot be undone. Products with sales, stock or recipe history are kept.', 'Delete {n} products? This cannot be undone. Products with sales, stock or recipe history are kept.'), confirmLabel: 'Delete', danger: true }).then(function (yes) { if (yes) go(); });
    if (action === 'deactivate') return dialog({ title: 'Make the selected products inactive?', message: plural(ids.length, '{n} product will no longer show on the sale screen.', '{n} products will no longer show on the sale screen.'), confirmLabel: 'Make inactive' }).then(function (yes) { if (yes) go(); });
    return go();
  }
  function bulkCategory(l, ids, cats) {
    var sel = el('select', { class: 'bo-input', 'aria-label': T('Category') }, [el('option', { value: '', text: T('Select…') })].concat(cats.map(function (c) { return el('option', { value: c[0], text: c[1] }); })));
    return dialog({ title: 'Change the category', message: plural(ids.length, 'Move {n} product to this category.', 'Move {n} products to this category.'), body: sel, confirmLabel: 'Change category', validate: function () { return sel.value ? '' : 'Choose a category.'; },
      onConfirm: function () { return call('POST', '/api/bo/products/bulk', { ids: ids, action: 'category', value: sel.value, shopId: shopId() }); } }).then(function (r) {
      if (!r) return;
      l.clearSelection(); afterChange(l).then(function () { notify(plural(r.done, '{n} product updated.', '{n} products updated.')); });
    });
  }
  function copyToShop(l, url, what) {
    var chosen = l.selected(), total = (l.data() || {}).total || 0, count = chosen.length || total;
    var others = (shopCache || []).filter(function (s) { return s.id !== shopId(); });
    if (!others.length) { notify(T('There is no other shop to copy to.'), true); return; }
    var sel = el('select', { class: 'bo-input', 'aria-label': T('Copy to shop') }, others.map(function (s) { return el('option', { value: s.id, text: s.name }); }));
    var message = chosen.length ? plural(count, 'Copy the {n} selected item to another shop.', 'Copy the {n} selected items to another shop.') : plural(count, 'Copy this {n} item to another shop.', 'Copy all {n} items in this list to another shop.');
    return dialog({ title: 'Copy to shop', message: message, body: el('div', {}, [sel, el('p', { class: 'bo-help', text: T('Products and recipes are shared by every shop here, so the other shop gets them with zero stock.') })]), confirmLabel: 'Copy',
      onConfirm: function () { return call('POST', url, { ids: chosen, toShopId: Number(sel.value), shopId: shopId(), query: l.query() }); } }).then(function (r) { if (r) notify(r.message ? T(r.message) : T('Copied.')); });
  }
  function importProducts() {
    var pick = csvChooser('/api/bo/products/template', 'products-template.csv', 'Choose a CSV file with the columns of the template. A product whose code already exists is updated; any other is created.');
    return dialog({ title: 'Import products', body: pick.body, confirmLabel: 'Import', validate: function () { return pick.picked() ? '' : 'Choose a CSV file first.'; },
      onConfirm: function () { return new Promise(function (resolve) { setTimeout(resolve, 80); }).then(function () { if (pick.text() === null) throw new Error(T('The file could not be read.')); return call('POST', '/api/bo/products/import', { csv: pick.text() }); }); } }).then(function (r) {
      if (!r) return;
      afterChange(products.list).then(function () {
        if (r.errorCount) resultDialog('Import finished', r.message, r.errors.map(function (x) { return T('Line {n}', { n: x.line }) + ': ' + tmsg(x.message); }));
        else notify(tmsg(r.message));
      });
    });
  }

  function marginLine(v) {
    var price = Number(v.price), cost = Number(v.cost);
    if (v.price === '' || v.price === null || !isFinite(price) || price <= 0) return T('Enter a retail price to see the gross margin.');
    if (v.cost === '' || v.cost === null || !isFinite(cost)) return '';
    var gain = price - cost, pct = gain / price * 100;
    return gain < 0 ? T('The cost is above the retail price: gross margin {pct}%.', { pct: dp(pct, 1) }) : T('Gross margin {pct}% · FJD {amt} on each sale.', { pct: dp(pct, 1), amt: money(gain) });
  }
  function productFields(d, lk, state) {
    var mainUnit = function (v) { return (lk.measurements.filter(function (m) { return String(m.id) === String(v.measurementId); })[0] || {}).name || ''; };
    var subUnit = function (v) { return (lk.measurements.filter(function (m) { return String(m.id) === String(v.subMeasurementId); })[0] || {}).name || ''; };
    var stockNow = d && d.stockItem ? d.stockByShop.map(function (s) { return s.shopName + ' ' + qty(s.stock); }).join(' · ') : '';
    var main = [
      { name: 'name', label: 'Name', type: 'text', required: true, maxlength: 200 },
      { name: 'code', label: 'Code', type: 'text', required: true, maxlength: 50 },
      { name: 'categoryId', label: 'Category', type: 'select', required: true, blank: 'Select…', options: opts(lk.categories) },
      { pair: [{ name: 'price', label: 'Retail price', type: 'number', required: true, step: '0.01', min: '0' }, { name: 'cost', label: 'Cost price', type: 'number', required: true, step: '0.01', min: '0' }],
        helper: function (v, api) {
          var w = el('span', {}, [marginLine(v)]);
          if (d && d.hasRecipe && !v.stockItem && d.recipeCost !== null && Number(v.cost) !== d.recipeCost) {
            w.appendChild(el('br'));
            w.appendChild(doc.createTextNode(T('The recipe costs FJD {x}.', { x: money(d.recipeCost) }) + ' '));
            w.appendChild(el('button', { type: 'button', class: 'bo-link', text: T('Use the recipe cost'), onclick: function () { api.set('cost', String(d.recipeCost)); } }));
          }
          return w;
        } },
      { name: 'measurementId', label: 'Main unit', type: 'select', required: true, blank: 'Select…', options: opts(lk.measurements) },
      { name: 'active', label: 'Status', type: 'switch', on: 'Active', off: 'Inactive', helper: function (v) { return v.active ? '' : T('Inactive products are hidden from the sale screen and from new orders.'); } },
      { name: 'stockItem', label: 'Stock', type: 'switch', on: 'Stock item', off: 'Non-stock item', helper: function (v) {
        if (d && d.stockItem && !v.stockItem) {
          if (d.usedIn) return T('It is an ingredient in {n} recipes, so it has to stay a stock item.', { n: d.usedIn });
          return T('Stock has to be zero in every shop first. Now: {x}.', { x: stockNow });
        }
        if (d && !d.stockItem && v.stockItem && d.hasRecipe) return T('Saving it as a stock item removes its recipe of {n} ingredients.', { n: d.recipeCount });
        if (d && d.stockItem) return T('Stock now: {x}. Change it under Stock, Adjust stock.', { x: stockNow });
        return v.stockItem ? T('Its quantity is counted, and sales take it out of stock.') : T('Not counted. A dish sold from a recipe takes its ingredients out of stock instead.');
      } },
      { name: 'weighed', label: 'Weighing', type: 'switch', on: 'Weighed', off: 'Not weighed', helper: function (v) { return v.weighed ? T('The cashier enters the weight when selling it.') : ''; } },
      { name: '__recipe', type: 'custom', hidden: function (v) { return !!v.stockItem; }, render: function (v, api) {
        var box = el('div', { class: 'bo-block' }), line = el('p', {}), btn = el('button', { type: 'button', class: 'bo-btn', onclick: function () { api.drawer.closeThen(function () { openRecipe(d.productId); }); } });
        box.appendChild(el('h3', { text: T('Recipe') })); box.appendChild(line);
        if (d) box.appendChild(btn);
        return { node: box, update: function () {
          if (!d) { line.textContent = T('Save the product first, then add its recipe.'); return; }
          line.textContent = d.hasRecipe ? plural(d.recipeCount, '{n} ingredient', '{n} ingredients') + ' · ' + T('recipe cost FJD {x}', { x: money(d.recipeCost) }) : T('No recipe yet. Without one, selling it takes nothing out of stock.');
          btn.textContent = T(d.hasRecipe ? 'Edit recipe' : 'Add a recipe');
        } };
      } }
    ];
    var more = [
      { name: 'menuNo', label: 'Menu number', type: 'number', step: '1', min: '1', max: '999', helper: function () { return T('The number on the menu board, 1 to 999. Leave empty if it has none.'); } },
      { name: 'favourite', label: 'Favourite', type: 'switch', on: 'Favourite', off: 'Not a favourite', helper: function (v) { return v.favourite ? T('Shown first on the sale screen at {shop}.', { shop: shopName() }) : ''; } },
      { name: 'vat', label: 'VAT', type: 'switch', on: 'VAT charged', off: 'No VAT' },
      { name: 'departmentId', label: 'Department', type: 'select', blank: 'Same as the category', options: opts(lk.departments) },
      { name: 'supplierId', label: 'Supplier', type: 'select', blank: 'None', options: opts(lk.suppliers) },
      { name: 'barcode', label: 'Barcode', type: 'text', maxlength: 60 },
      { name: 'spec', label: 'Specification', type: 'text', maxlength: 120 },
      { pair: [{ name: 'subMeasurementId', label: 'Sub unit', type: 'select', blank: 'None', options: opts(lk.measurements) }, { name: 'subRatio', label: 'Per main unit', type: 'number', step: 'any', min: '0' }],
        helper: function (v) { return v.subMeasurementId && Number(v.subRatio) > 0 ? T('1 {main} = {n} {sub}', { main: mainUnit(v), n: qty(Number(v.subRatio)), sub: subUnit(v) }) : T('Optional: a smaller unit the product is also counted in, such as grams for a kilogram.'); } }
    ];
    return { main: main, more: more };
  }
  function productValues(d, lk) {
    if (!d) {
      var each = lk.measurements.filter(function (m) { return m.name === 'EACH'; })[0];
      return { name: '', code: '', categoryId: '', price: '', cost: '', measurementId: each ? String(each.id) : '', active: true, stockItem: true, weighed: false, menuNo: '', favourite: false, vat: true, departmentId: '', supplierId: '', barcode: '', spec: '', subMeasurementId: '', subRatio: '' };
    }
    return { name: d.name, code: d.code, categoryId: String(d.categoryId), price: String(d.price), cost: String(d.cost), measurementId: String(d.unitId), active: d.active, stockItem: d.stockItem, weighed: d.weighed, menuNo: d.menuNo ? String(d.menuNo) : '',
      favourite: d.favourite, vat: d.vat, departmentId: String(d.departmentId || ''), supplierId: d.supplierId ? String(d.supplierId) : '', barcode: d.barcode, spec: d.spec, subMeasurementId: d.subUnitId ? String(d.subUnitId) : '', subRatio: d.subRatio ? String(d.subRatio) : '' };
  }
  function productDrawer(d, lk, opener) {
    var f = productFields(d, lk), id = d ? d.productId : null, l = products.list;
    if (id) l.setActive(id);
    return drawer({
      title: d ? 'Edit product' : 'New product', subtitle: d ? d.code : null, fields: f.main, more: f.more, values: productValues(d, lk), returnFocus: opener, moreOpen: false,
      deleteTitle: 'Delete this product?', deleteMessage: d ? 'Delete {name}? This cannot be undone.' : '', vars: d ? { name: d.name } : null,
      onDelete: d ? function () { return call('DELETE', '/api/bo/products/' + id).then(function (r) { notify(tmsg(r.message)); return r; }); } : null,
      onSave: function (v) {
        var body = { shopId: shopId(), favourite: !!v.favourite, product: { name: v.name, code: v.code, spec: v.spec, categoryId: v.categoryId, departmentId: v.departmentId, supplierId: v.supplierId, measurementId: v.measurementId,
          subMeasurementId: v.subMeasurementId, subRatio: v.subMeasurementId ? v.subRatio : '', price: v.price, cost: v.cost, vat: !!v.vat, stockItem: !!v.stockItem, weighed: !!v.weighed, active: !!v.active, barcode: v.barcode, menuNo: v.menuNo } };
        return (id ? call('PATCH', '/api/bo/products/' + id, body) : call('POST', '/api/bo/products', body)).then(function (r) { notify(tmsg(r.message)); return r; });
      },
      onClose: function (saved, r) {
        l.setActive(null);
        if (saved) afterChange(l, (r && r.productId) || id);
      }
    });
  }
  function editProduct(row, opener) {
    return Promise.all([call('GET', '/api/bo/products/' + row.productId + '?shopId=' + shopId()), lookups()]).then(function (r) { productDrawer(r[0], r[1], opener); }, function (e) { notify(e.message, true); });
  }
  function newProduct() {
    var opener = doc.activeElement;
    return lookups().then(function (lk) { productDrawer(null, lk, opener); });
  }
  function deleteProduct(row, opener) {
    return dialog({ title: 'Delete this product?', message: 'Delete {name}? This cannot be undone.', vars: { name: row.name }, confirmLabel: 'Delete', danger: true,
      onConfirm: function () { return call('DELETE', '/api/bo/products/' + row.productId); } }).then(function (r) {
      if (r) { notify(tmsg(r.message)); afterChange(products.list); } else if (opener && opener.isConnected) opener.focus();
    });
  }

  function pageOf(def) {
    var page = { built: null };
    return {
      open: function () {
        var v = ensureView(def.id);
        showView(v);
        if (!page.built) { page.built = def.build(v); return page.built.then(function () { def.list().resize(); }); }
        return lookups(true).then(function () { return def.list().reload(); }).then(function () { def.list().resize(); });
      },
      close: function () { closeDrawers(); closePop(false); var v = doc.getElementById(def.id); if (v) v.classList.remove('active-view'); }
    };
  }
  var productsPage = pageOf({ id: 'boProductsView', build: buildProducts, list: function () { return products.list; } });
  if (window.DemoPages) {
    window.DemoPages.register({ key: 'bo:products', module: 'products', label: ['Products', '商品'], open: productsPage.open, close: productsPage.close });
  }

  // ---- Recipes (spec section 6) ---------------------------------------------------------------
  var recipes = { list: null };
  function portionCell(r) {
    if (r.portions === null) return null;
    var neg = r.negativeIngredients.length;
    if (neg) return el('span', { class: 'bo-neg bo-with-ico', title: T('Negative stock: {x}', { x: r.negativeIngredients.join(', ') }) }, [icon('warn', 14), qty(r.portions)]);
    if (r.portions === 0) return el('span', { class: 'bo-warnc bo-with-ico', title: T('An ingredient has run out.') }, [icon('warn', 14), '0']);
    return el('span', { title: T('Portions the ingredients in stock can make.'), text: qty(r.portions) });
  }
  function recipeColumns() {
    return [
      { key: 'name', label: 'Product', fixed: true, render: function (r) { return el('button', { type: 'button', class: 'bo-link bo-name', text: r.name, onclick: function (e) { openRecipe(r.productId, e.currentTarget); } }, [el('span', { class: 'bo-sub', text: r.code })]); } },
      { key: 'spec', label: 'Specification' },
      { key: 'category', label: 'Category', render: function (r) { return r.categoryName; } },
      { key: 'stock', label: 'Stock', align: 'right', render: portionCell },
      { key: 'recipe', label: 'Recipe', align: 'center', render: function (r) { return recipeIconCell(Object.assign({}, r, { stockItem: false })); } },
      { key: 'unit', label: 'Main unit' },
      { key: 'subUnit', label: 'Sub unit' },
      { key: 'ingredients', label: 'Ingredients', align: 'right', render: function (r) { return r.ingredientCount || null; } },
      { key: 'cost', label: 'Cost price', align: 'right', render: function (r) { return money(r.cost); } },
      { key: 'recipeCost', label: 'Recipe cost', align: 'right', render: function (r) { return r.recipeCost === null ? null : money(r.recipeCost); } }
    ];
  }
  function recipeTotals(t) {
    var parts = [plural(t.count, '{n} dish', '{n} dishes'), T('{n} with a recipe', { n: t.withRecipe }), T('{n} without', { n: t.noRecipe })];
    if (t.negative) parts.push(T('{n} with an ingredient in negative stock', { n: t.negative }));
    return parts.join(' · ');
  }
  function afterRecipeChange(id) {
    syncSale();
    var all = [recipes.list, products.list].filter(Boolean);
    return Promise.all(all.map(function (l) { return l.reload(); })).then(function () { if (id && recipes.list) recipes.list.focusRow(id); });
  }
  function buildRecipes(view) {
    return lookups(true).then(function (lk) {
      recipes.list = list({
        key: 'recipes', host: view, title: 'Recipes', help: 'What goes into each dish. Selling a dish takes its ingredients out of stock.', searchPlaceholder: 'Name or code',
        endpoint: '/api/bo/recipes', exportUrl: '/api/bo/recipes/export', rowId: 'productId',
        links: [{ label: 'Products', run: function () { if (window.DemoPages) window.DemoPages.open('bo:products'); } }],
        defaults: { sort: 'name', pageSize: 50, filters: {}, hidden: ['ingredients', 'cost', 'recipeCost'] },
        columns: recipeColumns(),
        buttons: [
          { key: 'cost', label: 'Update cost from recipe', run: function (l) { updateCostFromRecipe(l); } },
          { key: 'change', label: 'Change ingredient', run: function (l) { changeIngredient(l); } },
          { key: 'import', label: 'Import recipes', run: function () { importRecipes(); } },
          { key: 'export', label: 'Export recipes', run: function (l) { download(l.exportUrl(), 'recipes.csv').catch(function (e) { notify(e.message, true); }); } },
          { key: 'copy', label: 'Copy to shop', run: function (l) { copyToShop(l, '/api/bo/products/copy', 'recipes'); } }
        ],
        filters: [
          { key: 'recipe', label: 'Recipe', all: 'With or without recipe', tr: true, options: [['has', 'Has a recipe'], ['none', 'No recipe']] },
          { key: 'categoryId', label: 'Category', all: 'All categories', options: opts(lk.categories.filter(function (c) { return c.name !== 'Raw Material'; })) },
          { key: 'negative', label: 'Ingredient stock', all: 'Any ingredient stock', tr: true, options: [['yes', 'Ingredient with negative stock']] }
        ],
        bulk: [{ key: 'cost', label: 'Update cost from recipe', run: function (ids, l) { updateCostFromRecipe(l); } }],
        rowActions: function () { return [{ key: 'edit', label: 'Edit', name: function (x) { return x.name; }, run: function (row, btn) { openRecipe(row.productId, btn); } }]; },
        totalsText: recipeTotals,
        empty: { none: 'No dishes yet.', text: 'No dishes match these filters.' }
      });
    });
  }
  function updateCostFromRecipe(l) {
    var chosen = l.selected(), count = chosen.length || (l.data() || {}).total || 0;
    return dialog({ title: 'Update cost from recipe', message: chosen.length ? plural(count, 'Set the cost price of the {n} selected dish to what its recipe costs today.', 'Set the cost price of the {n} selected dishes to what their recipes cost today.') : plural(count, 'Set the cost price of {n} dish in this list to what its recipe costs today.', 'Set the cost price of all {n} dishes in this list to what their recipes cost today.'),
      confirmLabel: 'Update cost', onConfirm: function () { return call('POST', '/api/bo/recipes/update-cost', { ids: chosen, query: l.query(), shopId: shopId() }); } }).then(function (r) {
      if (!r) return;
      l.clearSelection(); afterRecipeChange().then(function () { notify(tmsg(r.message)); });
    });
  }
  function changeIngredient(l) {
    return call('GET', '/api/inventory/component-products?shopId=' + shopId()).then(function (items) {
      var mk = function (label) { return el('select', { class: 'bo-input', 'aria-label': T(label) }, [el('option', { value: '', text: T('Select…') })].concat(items.map(function (i) { return el('option', { value: i.productId, text: i.name + ' · ' + i.code }); }))); };
      var from = mk('Replace this ingredient'), to = mk('With this ingredient'), factor = el('input', { class: 'bo-input', type: 'number', step: 'any', min: '0', value: '1', 'aria-label': T('Quantity factor') });
      var field = function (label, ctl) { return el('div', { class: 'bo-field' }, [el('label', { class: 'bo-flabel', text: T(label) }), ctl]); };
      var chosen = l.selected();
      var body = el('div', { class: 'bo-form-stack' }, [field('Replace', from), field('With', to), field('Quantity factor', factor), el('p', { class: 'bo-help', text: T('1 keeps the same quantity. Use 0.5 if you need half as much of the new ingredient.') }),
        el('p', { class: 'bo-help', text: chosen.length ? plural(chosen.length, 'Only in the {n} selected recipe.', 'Only in the {n} selected recipes.') : T('In every recipe that uses it.') })]);
      return dialog({ title: 'Change ingredient', body: body, confirmLabel: 'Change ingredient', validate: function () { return !from.value || !to.value ? 'Choose both ingredients.' : from.value === to.value ? 'Choose a different ingredient to change to.' : ''; },
        onConfirm: function () { return call('POST', '/api/bo/recipes/change-ingredient', { fromId: Number(from.value), toId: Number(to.value), factor: Number(factor.value), ids: chosen, shopId: shopId() }); } }).then(function (r) {
        if (!r) return;
        l.clearSelection(); afterRecipeChange().then(function () { notify(tmsg(r.message)); });
      });
    }, function (e) { notify(e.message, true); });
  }
  function importRecipes() {
    var pick = csvChooser('/api/bo/recipes/template', 'recipes-template.csv', 'Choose a CSV file with one line for each ingredient of a dish: product code, ingredient code and quantity. A dish in the file gets exactly the ingredients listed for it.');
    return dialog({ title: 'Import recipes', body: pick.body, confirmLabel: 'Import', validate: function () { return pick.picked() ? '' : 'Choose a CSV file first.'; },
      onConfirm: function () { return new Promise(function (resolve) { setTimeout(resolve, 80); }).then(function () { if (pick.text() === null) throw new Error(T('The file could not be read.')); return call('POST', '/api/bo/recipes/import', { csv: pick.text() }); }); } }).then(function (r) {
      if (!r) return;
      afterRecipeChange().then(function () {
        if (r.errorCount) resultDialog('Import finished', r.message, r.errors.map(function (x) { return T('Line {n}', { n: x.line }) + ': ' + tmsg(x.message); }));
        else notify(tmsg(r.message));
      });
    });
  }

  function recipeDrawer(d, opener) {
    var byId = {};
    d.materials.forEach(function (m) { byId[m.id] = m; });
    var id = d.productId, values = { lines: d.lines.map(function (c) { return { materialId: c.materialId, quantity: String(c.quantity), active: c.active }; }), updateCost: false };
    function cost(v) { return v.lines.reduce(function (s, c) { var m = byId[c.materialId]; return s + (c.active && m ? (Number(c.quantity) || 0) * m.cost : 0); }, 0); }
    var summary = function () {
      return el('div', { class: 'bo-block' }, [el('div', { class: 'bo-kv' }, [
        el('div', {}, [el('span', { text: T('Code') + ' ' }), el('b', { text: d.code })]), el('div', {}, [el('span', { text: T('Category') + ' ' }), el('b', { text: d.categoryName })]),
        el('div', {}, [el('span', { text: T('Main unit') + ' ' }), el('b', { text: d.unit })]), el('div', {}, [el('span', { text: T('Retail price') + ' ' }), el('b', { text: money(d.price) })]),
        el('div', {}, [el('span', { text: T('Cost price') + ' ' }), el('b', { text: money(d.cost) })])])]);
    };
    var linesField = { type: 'custom', name: 'lines', render: function (v, api) {
      var box = el('div', { class: 'bo-lines' }), list_ = el('div', { class: 'bo-line-list' }), add = el('select', { class: 'bo-input', 'aria-label': T('Add an ingredient') });
      function lineNode(c, i) {
        var m = byId[c.materialId], q = el('input', { class: 'bo-input bo-qty', type: 'number', step: 'any', min: '0', 'aria-label': T('Quantity of {name}', { name: m.name }), value: c.quantity });
        var note = el('p', { class: 'bo-help' }), sw = el('button', { type: 'button', class: 'bo-switch', role: 'switch' }, [el('span', { class: 'bo-track' }, [el('span', { class: 'bo-thumb' })]), el('span', { class: 'bo-state' })]);
        var paint = function () {
          sw.setAttribute('aria-checked', c.active ? 'true' : 'false'); sw.lastChild.textContent = T(c.active ? 'Active' : 'Paused');
          var n = Number(c.quantity), parts = [];
          if (n > 0 && m.subUnit && m.subRatio) parts.push('= ' + qty(n * m.subRatio) + ' ' + m.subUnit);
          parts.push(T('line cost FJD {x}', { x: money((n || 0) * m.cost) }));
          note.textContent = parts.join(' · ');
          note.classList.toggle('bo-neg', false);
        };
        q.addEventListener('input', function () { c.quantity = q.value; paint(); api.refresh(); });
        sw.addEventListener('click', function () { c.active = !c.active; paint(); api.refresh(); });
        paint();
        var stock = m.stock < 0 ? el('span', { class: 'bo-neg bo-with-ico' }, [icon('warn', 14), T('Stock {x} {u}', { x: qty(m.stock), u: m.unit })]) : el('span', { class: 'bo-muted', text: T('Stock {x} {u}', { x: qty(m.stock), u: m.unit }) });
        return el('div', { class: 'bo-line' + (c.active ? '' : ' is-paused') }, [
          el('div', { class: 'bo-line-head' }, [el('div', { class: 'bo-line-name' }, [el('b', { text: m.name }), el('span', { class: 'bo-sub', text: m.code })]), sw,
            el('button', { type: 'button', class: 'bo-iconbtn', 'aria-label': T('Remove {name}', { name: m.name }), onclick: function () { v.lines.splice(i, 1); fill(); api.refresh(); } }, [icon('close', 16)])]),
          el('div', { class: 'bo-line-body' }, [q, el('span', { class: 'bo-unit', text: m.unit }), stock]), note]);
      }
      function fill() {
        clear(list_);
        if (!v.lines.length) list_.appendChild(el('p', { class: 'bo-help', text: T('No ingredients yet. Add the first one below.') }));
        v.lines.forEach(function (c, i) { list_.appendChild(lineNode(c, i)); });
        clear(add);
        add.appendChild(el('option', { value: '', text: T('Add an ingredient…') }));
        var groups = {};
        d.materials.filter(function (m) { return !v.lines.some(function (c) { return c.materialId === m.id; }); }).forEach(function (m) {
          var g = groups[m.categoryName] || (groups[m.categoryName] = el('optgroup', { label: m.categoryName }));
          g.appendChild(el('option', { value: m.id, text: m.name + ' · ' + m.code }));
          if (!g.parentNode) add.appendChild(g);
        });
      }
      add.addEventListener('change', function () {
        if (!add.value) return;
        v.lines.push({ materialId: Number(add.value), quantity: '1', active: true });
        fill(); api.refresh();
        var qs_ = list_.querySelectorAll('.bo-qty'); if (qs_.length) { qs_[qs_.length - 1].focus(); qs_[qs_.length - 1].select(); }
      });
      fill();
      box.appendChild(el('h3', { class: 'bo-sect', text: T('Ingredients') })); box.appendChild(list_); box.appendChild(el('div', { class: 'bo-field' }, [add]));
      return { node: box };
    } };
    var totalField = { type: 'custom', render: function (v) {
      var line = el('p', {}), margin = el('p', { class: 'bo-help' }), box = el('div', { class: 'bo-block' }, [el('h3', { text: T('Recipe cost') }), line, margin]);
      return { node: box, update: function () {
        var c = cost(v);
        line.textContent = T('FJD {x} for one {unit}', { x: money(c), unit: d.unit });
        line.className = 'bo-total';
        margin.textContent = d.price > 0 ? T('Retail price FJD {p} · gross margin {m}% on the recipe cost.', { p: money(d.price), m: dp((d.price - c) / d.price * 100, 1) }) : '';
      } };
    } };
    var costSwitch = { name: 'updateCost', label: 'Product cost', type: 'switch', on: 'Set to the recipe cost', off: 'Keep the current cost', helper: function (v) { return T('The product costs FJD {c} now; this recipe costs FJD {r}.', { c: money(d.cost), r: money(cost(v)) }); } };
    var inst = drawer({
      title: d.hasRecipe ? 'Edit recipe' : 'New recipe', subtitle: d.name, intro: summary, fields: [linesField, totalField, costSwitch], values: values, returnFocus: opener,
      deleteLabel: 'Remove recipe', deleteTitle: 'Remove this recipe?', deleteMessage: 'Remove the recipe of {name}? Selling it will no longer take ingredients out of stock.', vars: { name: d.name },
      onDelete: d.hasRecipe ? function () { return call('PUT', '/api/bo/recipes/' + id, { lines: [], shopId: shopId() }).then(function (r) { notify(tmsg(r.message)); return r; }); } : null,
      validate: function (v) {
        for (var i = 0; i < v.lines.length; i++) if (!(Number(v.lines[i].quantity) > 0)) return { message: 'Enter a quantity above zero for every ingredient.' };
        return null;
      },
      onSave: function (v) {
        return call('PUT', '/api/bo/recipes/' + id, { lines: v.lines.map(function (c) { return { materialId: c.materialId, quantity: Number(c.quantity), active: c.active }; }), updateCost: !!v.updateCost, shopId: shopId() }).then(function (r) { notify(tmsg(r.message)); return r; });
      },
      onClose: function (saved) { if (recipes.list) recipes.list.setActive(null); if (saved) afterRecipeChange(id); }
    });
    if (recipes.list) recipes.list.setActive(id);
    return inst;
  }
  function openRecipe(id, opener) {
    return call('GET', '/api/bo/recipes/' + id + '?shopId=' + shopId()).then(function (d) { recipeDrawer(d, opener || doc.activeElement); }, function (e) { notify(e.message, true); });
  }
  var recipesPage = pageOf({ id: 'boRecipesView', build: buildRecipes, list: function () { return recipes.list; } });
  if (window.DemoPages) {
    window.DemoPages.register({ key: 'bo:recipes', module: 'products', label: ['Recipes', '配方'], open: recipesPage.open, close: recipesPage.close });
  }

  window.DemoBO = { openRecipe: openRecipe, closeDrawers: closeDrawers, list: list, drawer: drawer, dialog: dialog, el: el, T: T, icon: icon, call: call, download: download, qs: qs, util: { notify: notify, tmsg: tmsg, plural: plural, money: money, qty: qty, dp: dp, isZh: isZh, store: store, shopId: shopId, clear: clear } };
})();
