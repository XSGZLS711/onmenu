// Interaction improvements for the daily jobs. Each block is separate so it can be lifted into the real code on its own:
//   1. Quick actions under the cart title (Hold, Resume with a count, Reprint, Refund, More) instead of unlabelled icons.
//   2. After a sale the receipt leads with the change due and returns to a new sale by itself (Enter or a 10 second countdown).
//   3. Quick cash amounts in the payment box.
//   4. Ctrl+K search for pages, tasks, sales tools and products (with their stock).
// Like the navigation, this reads and clicks the existing buttons, so no page logic changes.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var phone = window.matchMedia('(max-width: 600px)');
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function tt(s) { return window.SoftPOSLanguage ? SoftPOSLanguage.t(s) : s; }
  function shop() { return typeof currentShop === 'function' ? currentShop() : 1; }
  function available(el) { return !!el && !el.closest('[hidden]'); }
  var SVG = function (d) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };

  // ---- 1. quick actions under the cart title --------------------------------------------------------
  var QUICK = [
    { id: 'hold', src: 'salesHoldBtn', label: 'Hold', icon: SVG('<path d="M8 5v14M16 5v14"/>') },
    { id: 'resume', src: 'salesResumeBtn', label: 'Resume', icon: SVG('<path d="m8 5 11 7-11 7Z"/>'), badge: true },
    { id: 'reprint', src: 'recentSalesBtn', label: 'Reprint', title: 'Reprint receipt', icon: SVG('<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>') },
    { id: 'refund', src: 'refundTab', label: 'Refund', icon: SVG('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>') },
    { id: 'more', src: 'salesMoreBtn', label: 'More', title: 'Sales tools', icon: SVG('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>') }
  ];
  var held = 0;
  function buildQuick() {
    var title = document.querySelector('#orderView .cart-title');
    if (!title || $('demoQuick')) return;
    var bar = document.createElement('div');
    bar.id = 'demoQuick';
    bar.className = 'demo-quick';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Sale actions');
    bar.innerHTML = QUICK.map(function (q) {
      return '<button type="button" class="dq-btn" data-dq="' + q.id + '" title="' + esc(q.title || q.label) + '">' + q.icon + '<span class="dq-label">' + esc(q.label) + '</span>' + (q.badge ? '<b class="dq-badge" hidden></b>' : '') + '</button>';
    }).join('');
    title.insertAdjacentElement('afterend', bar);
    bar.addEventListener('click', function (event) {
      var b = event.target.closest('[data-dq]');
      if (!b) return;
      var q = QUICK.filter(function (x) { return x.id === b.dataset.dq; })[0], src = q && $(q.src);
      if (src && !src.disabled) src.click();
    });
  }
  function syncQuick() {
    var bar = $('demoQuick');
    if (!bar) { buildQuick(); bar = $('demoQuick'); }
    if (!bar) return;
    QUICK.forEach(function (q) {
      var b = bar.querySelector('[data-dq="' + q.id + '"]'), src = $(q.src);
      if (!b) return;
      b.hidden = !available(src);
      b.disabled = !!(src && src.disabled);
      if (q.badge) { var n = b.querySelector('.dq-badge'); n.hidden = !held; n.textContent = String(held); }
    });
  }
  function refreshHeld() {
    if (document.hidden || !$('salesResumeBtn') || !available($('salesResumeBtn'))) return;
    fetch('/api/sales-holds?shopId=' + shop(), { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      held = Array.isArray(rows) ? rows.length : 0; syncQuick();
    }).catch(function () { /* the count is a convenience */ });
  }

  // ---- 2. change due, and back to a new sale ---------------------------------------------------------
  var paidAt = 0, countdown = 0, count = 0;
  document.addEventListener('submit', function (event) { if (event.target && event.target.id === 'paymentForm') paidAt = Date.now(); }, true);
  function stopCountdown() {
    clearInterval(countdown); countdown = 0;
    var c = document.querySelector('#closeReceipt .dq-count'); if (c) c.remove();
  }
  function receiptOpened() {
    var close = $('closeReceipt');
    if (!close) return;
    if (!paidAt || Date.now() - paidAt > 15000) { close.dataset.demoNew = ''; close.innerHTML = '<span>Close</span>'; return; }
    paidAt = 0;
    close.dataset.demoNew = '1';
    count = 10;
    close.innerHTML = '<span>New sale</span> <small class="dq-count">' + count + '</small>';
    close.focus();
    clearInterval(countdown);
    countdown = setInterval(function () {
      count--;
      var c = close.querySelector('.dq-count');
      if (c) c.textContent = String(count);
      if (count <= 0) { stopCountdown(); close.click(); }
    }, 1000);
  }
  function wireReceipt() {
    var dialog = $('receiptDialog');
    if (!dialog || dialog.dataset.demoUx) return;
    dialog.dataset.demoUx = '1';
    new MutationObserver(function () { if (dialog.open) receiptOpened(); else stopCountdown(); }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    ['pointerdown', 'keydown', 'change'].forEach(function (name) {
      dialog.addEventListener(name, function (event) {
        if (event.type === 'keydown' && event.key === 'Enter') return; // Enter is the fast way to start the next sale
        stopCountdown();
      }, true);
    });
  }

  // ---- 3. quick cash amounts ---------------------------------------------------------------------------
  function cashSuggestions(due) {
    var steps = [5, 10, 20, 50, 100], out = [];
    steps.forEach(function (step) {
      var v = Math.ceil(due / step) * step;
      if (v <= due + 0.004) v += step;
      if (out.indexOf(v) < 0) out.push(v);
    });
    return out.sort(function (a, b) { return a - b; }).slice(0, 4);
  }
  function renderQuickCash() {
    var dialog = $('paymentDialog'), input = $('paymentAmount');
    if (!dialog || !dialog.open || !input) return;
    var chosen = dialog.querySelector('.payment-choice[aria-pressed="true"]'), cash = !!chosen && chosen.dataset.payment === 'CASH';
    var row = $('demoQuickCash');
    if (!row) {
      row = document.createElement('div');
      row.id = 'demoQuickCash'; row.className = 'demo-quickcash'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Quick cash amounts');
      input.closest('.payment-amount-field').insertAdjacentElement('afterend', row);
      row.addEventListener('click', function (event) {
        var b = event.target.closest('[data-qc]');
        if (!b) return;
        input.value = Number(b.dataset.qc).toFixed(2);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    var due = typeof paymentExactAmount === 'function' ? paymentExactAmount() : 0;
    row.hidden = !cash || !(due > 0);
    if (row.hidden) return;
    var key = due.toFixed(2);
    if (row.dataset.due === key && row.dataset.lang === (window.SoftPOSLanguage ? SoftPOSLanguage.language : '')) return;
    row.dataset.due = key; row.dataset.lang = window.SoftPOSLanguage ? SoftPOSLanguage.language : '';
    row.innerHTML = '<button type="button" class="dq-cash dq-exact" data-qc="' + key + '"><span>Exact</span></button>' +
      cashSuggestions(due).map(function (v) { return '<button type="button" class="dq-cash" data-qc="' + v.toFixed(2) + '">' + v.toLocaleString(undefined, { maximumFractionDigits: 2 }) + '</button>'; }).join('');
  }
  function wirePayment() {
    var dialog = $('paymentDialog');
    if (!dialog || dialog.dataset.demoUx) return;
    dialog.dataset.demoUx = '1';
    new MutationObserver(function () { setTimeout(renderQuickCash, 0); }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    dialog.addEventListener('click', function () { setTimeout(renderQuickCash, 30); });
  }

  // ---- 4. Ctrl+K search --------------------------------------------------------------------------------------
  var palette = null, items = [], active = 0, productTimer = 0, productSeq = 0, recent = [];
  try { recent = JSON.parse(localStorage.getItem('demo.recent') || '[]'); } catch (e) { recent = []; }
  function remember(label) {
    recent = [label].concat(recent.filter(function (x) { return x !== label; })).slice(0, 5);
    try { localStorage.setItem('demo.recent', JSON.stringify(recent)); } catch (e) { /* ignore */ }
  }
  function nav() { return window.DemoNav; }
  function allPages() {
    var out = [];
    if (!nav()) return out;
    nav().readMenu().forEach(function (x) {
      if (x.type === 'leaf') out.push({ kind: 'Pages', label: x.label, group: x.group ? x.group.label : '', item: x });
      else x.items.forEach(function (i) { out.push({ kind: 'Pages', label: i.label, group: x.label, item: i }); });
    });
    return out;
  }
  function salesTools() {
    return nav() ? nav().readSalesActions().filter(function (a) { return !a.disabled; }).map(function (a) { return { kind: 'Sales tools', label: a.label, item: a }; }) : [];
  }
  function pageByKey(key) {
    var hit = allPages().filter(function (p) { return p.item.key === key; })[0];
    return hit && hit.item;
  }
  function openTask(key, subtab) {
    var page = pageByKey(key);
    if (!page) return;
    nav().openItem(page);
    if (subtab) setTimeout(function () { var t = document.querySelector('[data-stock="' + subtab + '"]'); if (t) t.click(); }, 250);
  }
  function tasks() {
    var list = [
      { label: 'Receive goods against a purchase order', key: 'stock:stockView', sub: 'poReceive' },
      { label: 'Receive goods without a purchase order', key: 'stock:stockView', sub: 'directReceive' },
      { label: 'Create a purchase order', key: 'stock:stockView', sub: 'poCreate' },
      { label: 'Adjust stock', key: 'stock:stockView|stockAdjust' },
      { label: 'Close the day (Z report)', tool: /X \/ Z|日结/ },
      { label: 'Reprint a receipt', tool: /Reprint|重打/ },
      { label: 'Refund a sale', tool: /^Refund|退款/ },
      { label: 'Edit menu numbers', fn: openNumbers, show: canEditNumbers }
    ];
    return list.filter(function (t) {
      if (t.fn) return t.show();
      if (t.tool) return salesTools().some(function (a) { return t.tool.test(a.label); });
      return !!pageByKey(t.key);
    }).map(function (t) {
      return { kind: 'Tasks', label: t.label, run: function () {
        if (t.fn) t.fn();
        else if (t.tool) { var a = salesTools().filter(function (x) { return t.tool.test(x.label); })[0]; if (a) a.item.source.click(); }
        else openTask(t.key, t.sub);
      } };
    });
  }
  function buildPalette() {
    if (palette) return;
    palette = document.createElement('div');
    palette.id = 'demoPalette'; palette.className = 'dp'; palette.hidden = true;
    palette.setAttribute('role', 'dialog'); palette.setAttribute('aria-modal', 'true'); palette.setAttribute('aria-label', 'Search');
    palette.innerHTML = '<div class="dp-box"><input id="dpInput" type="search" autocomplete="off" spellcheck="false" aria-label="Search" placeholder="Search pages, tasks and products">' +
      '<ul id="dpList" role="listbox"></ul><p class="dp-hint"><span>↑ ↓</span> <span>Enter</span> <span>Esc</span></p></div>';
    document.body.appendChild(palette);
    palette.addEventListener('mousedown', function (event) { if (event.target === palette) closePalette(); });
    $('dpInput').addEventListener('input', onQuery);
    $('dpInput').addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
      else if (event.key === 'Enter') { event.preventDefault(); choose(active); }
      else if (event.key === 'Escape') { event.preventDefault(); closePalette(); }
    });
    $('dpList').addEventListener('mousemove', function (event) { var li = event.target.closest('li[data-i]'); if (li && Number(li.dataset.i) !== active) { active = Number(li.dataset.i); paint(); } });
    $('dpList').addEventListener('click', function (event) { var li = event.target.closest('li[data-i]'); if (li) choose(Number(li.dataset.i)); });
  }
  function matches(entry, q) {
    var hay = (entry.label + ' ' + (entry.group || '') + ' ' + (entry.detail || '')).toLowerCase();
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function onQuery() {
    var q = $('dpInput').value.trim().toLowerCase();
    var base = tasks().concat(allPages(), salesTools());
    if (!q) {
      var seen = {}, rec = [];
      recent.forEach(function (label) { var hit = base.filter(function (e) { return e.label === label; })[0]; if (hit && !seen[label]) { seen[label] = 1; rec.push(Object.assign({}, hit, { kind: 'Recent' })); } });
      items = rec.concat(base.filter(function (e) { return e.kind === 'Tasks'; }));
    } else items = base.filter(function (e) { return matches(e, q); }).slice(0, 12);
    active = 0; paint();
    clearTimeout(productTimer);
    if (q.length >= 2) productTimer = setTimeout(function () { searchProducts(q); }, 180);
  }
  function managerView() { return typeof state !== 'undefined' && !!(state.permissions && state.permissions.Products); }
  function searchProducts(q) {
    var seq = ++productSeq, manager = managerView();
    var url = (manager ? '/api/operations/products?shopId=' : '/api/products?shopId=') + shop() + '&search=' + encodeURIComponent(q);
    fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      if (seq !== productSeq || !palette || palette.hidden || $('dpInput').value.trim().toLowerCase() !== q) return;
      var found = (rows || []).slice(0, 6).map(function (r) {
        var f = r.fields;
        var name = f ? f.name : r.productName, code = f ? f.code : r.productCode, stockItem = f ? f.stockItem : r.stockItem, stock = r.stock, unit = r.unit || r.uom || '';
        return { kind: 'Products', label: name, detail: (code ? code + ' · ' : '') + (stockItem ? Number(stock).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ' + unit + ' ' + tt('in stock') : tt('No stock count')),
          raw: r, name: name, run: function () { openProduct(name, r, manager); } };
      });
      items = items.filter(function (e) { return e.kind !== 'Products'; }).concat(found);
      paint();
    }).catch(function () { /* products are an extra */ });
  }
  function openProduct(name, row, manager) {
    if (manager && nav()) {
      var page = pageByKey('stock:productsView');
      if (!page) return;
      nav().openItem(page);
      setTimeout(function () {
        var b = qa('#productsView button').filter(function (x) { return /Search Product|搜索商品/i.test(x.textContent); })[0];
        if (b) b.click();
        setTimeout(function () { var i = $('manageProductSearch'); if (i) { i.value = name; if (i.form) i.form.requestSubmit(); } }, 300);
      }, 300);
    } else if (typeof addProduct === 'function') {
      if (typeof activateTab === 'function') activateTab('orderView');
      addProduct(row.productId, row);
    }
  }
  function paint() {
    var html = '', last = '';
    items.forEach(function (e, i) {
      if (e.kind !== last) { html += '<li class="dp-head" role="presentation">' + esc(tt(e.kind)) + '</li>'; last = e.kind; }
      html += '<li role="option" data-i="' + i + '" aria-selected="' + (i === active) + '"' + (i === active ? ' class="on"' : '') + '><span class="dp-label">' + esc(e.label) + '</span>' +
        (e.group || e.detail ? '<small>' + esc(e.group || e.detail) + '</small>' : '') + '</li>';
    });
    $('dpList').innerHTML = html || '<li class="dp-none" role="presentation">' + esc(tt('Nothing matches')) + '</li>';
    var on = $('dpList').querySelector('li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function move(d) { if (!items.length) return; active = (active + d + items.length) % items.length; paint(); }
  function choose(i) {
    var e = items[i];
    if (!e) return;
    closePalette();
    remember(e.label);
    if (e.run) e.run(); else if (e.item && nav()) {
      if (e.item.type === 'action') e.item.source.click(); else nav().openItem(e.item);
    }
  }
  function openPalette() {
    if (phone.matches || !$('appScreen') || $('appScreen').hidden) return;
    buildPalette();
    palette.hidden = false;
    $('dpInput').value = '';
    onQuery();
    $('dpInput').focus();
  }
  function closePalette() { if (palette) palette.hidden = true; }
  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) { event.preventDefault(); if (palette && !palette.hidden) closePalette(); else openPalette(); }
    else if (event.key === 'Escape' && palette && !palette.hidden) closePalette();
  });
  function buildSearchButton() {
    var host = document.querySelector('#appScreen > .topbar .top-actions');
    if (!host || $('demoSearchBtn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'demoSearchBtn'; b.className = 'demo-searchbtn';
    b.innerHTML = SVG('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>') + '<span>Search</span><kbd>Ctrl K</kbd>';
    b.addEventListener('click', openPalette);
    host.insertBefore(b, host.firstChild);
  }

  // ---- 5. Hot sellers: numbered dishes ----------------------------------------------------------------------
  // A dish can carry the number printed on the menu board. The Hot sellers category shows those dishes as big numbers in number order,
  // and a number typed into the box (or "#7" in the search field) adds that dish to the sale.
  function isZh() { return !!window.SoftPOSLanguage && SoftPOSLanguage.language === 'zh-CN'; }
  function L(en, zh) { return isZh() ? zh : en; }
  function say(message, isError) { if (typeof toast === 'function') toast(message, !!isError); }
  function inMenuView() { var list = $('productList'); return !!list && list.classList.contains('menu-mode'); }
  function canEditNumbers() { return typeof state !== 'undefined' && !!(state.permissions && state.permissions.Products); }
  var menuCache = { at: 0, shop: 0, rows: [] };
  function menuRows() {
    if (inMenuView() && typeof state !== 'undefined' && state.products && state.products.length) return Promise.resolve(state.products);
    if (Date.now() - menuCache.at < 15000 && menuCache.shop === shop()) return Promise.resolve(menuCache.rows);
    return fetch('/api/products?shopId=' + shop() + '&categoryId=menu', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      menuCache = { at: Date.now(), shop: shop(), rows: rows }; return rows;
    });
  }
  function parseEntry(text) {
    text = String(text || '').trim().replace(/^#\s*/, '');
    var m = /^(\d+)\s*[*xX×]\s*(\d+)$/.exec(text);
    if (m) return { qty: Number(m[1]), no: Number(m[2]) };
    m = /^(\d+)$/.exec(text);
    return m ? { qty: 1, no: Number(m[1]) } : null;
  }
  function flash(no) {
    var tile = document.querySelector('.menu-tile[data-menu-no="' + no + '"]');
    if (!tile) return;
    tile.classList.add('menu-flash');
    setTimeout(function () { tile.classList.remove('menu-flash'); }, 700);
  }
  function addByNumber(text) {
    var entry = parseEntry(text);
    if (!entry || entry.qty < 1 || entry.qty > 99 || entry.no < 1) {
      say(L('Type a dish number such as 7, or 2*7 for two of No. 7.', '请输入菜号，例如 7；2*7 表示 2 份 7 号。'), true);
      return Promise.resolve(false);
    }
    return menuRows().then(function (rows) {
      var row = rows.filter(function (r) { return r.menuNo === entry.no; })[0];
      if (!row) { say(L('No dish has number ' + entry.no + '.', '没有 ' + entry.no + ' 号菜。'), true); return false; }
      var chain = Promise.resolve();
      for (var i = 0; i < entry.qty; i++) chain = chain.then(function () { return addProduct(row.productId, row); });
      return chain.then(function () { say(entry.qty + ' × ' + entry.no + ' · ' + row.productName + L(' added', ' 已加入'), false); flash(entry.no); return true; });
    });
  }
  function buildMenuBox() {
    var row = document.querySelector('#orderView .search-row');
    if (!row || $('menuNoBox')) return;
    var box = document.createElement('div');
    box.id = 'menuNoBox'; box.className = 'menu-box'; box.hidden = true;
    box.innerHTML = '<input id="menuNo" type="text" inputmode="numeric" autocomplete="off" aria-label="Dish number">' +
      '<button type="button" id="menuNoAdd" class="dq-btn dq-add"><span>Add</span></button>' +
      '<button type="button" id="menuNoEdit" class="dq-btn" hidden><span>Edit numbers</span></button>';
    row.appendChild(box);
    var input = $('menuNo');
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); submitNumber(); }
      else if (event.key === 'Escape') { input.value = ''; }
    });
    $('menuNoAdd').addEventListener('click', submitNumber);
    $('menuNoEdit').addEventListener('click', openNumbers);
  }
  function submitNumber() {
    var input = $('menuNo');
    if (!input || !input.value.trim()) { if (input) input.focus(); return; }
    addByNumber(input.value).then(function (ok) { if (ok) input.value = ''; input.focus(); if (!ok) input.select(); });
  }
  var wasMenu = false;
  function syncMenuBox() {
    var box = $('menuNoBox');
    if (!box) return;
    var on = inMenuView();
    box.hidden = !on;
    var input = $('menuNo');
    input.placeholder = L('No.', '菜号');
    input.title = L('Type the number from the menu board and press Enter. 2*7 adds two of No. 7.', '输入菜单上的号码后按回车。2*7 表示 2 份 7 号。');
    $('menuNoEdit').hidden = !canEditNumbers();
    if (on && !wasMenu && !phone.matches) input.focus();
    wasMenu = on;
  }
  // "#7" in the search field adds dish 7 from any category.
  document.addEventListener('keydown', function (event) {
    var t = event.target;
    if (event.key !== 'Enter' || !t || t.id !== 'productSearch' || !/^#\s*\d/.test(t.value)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    addByNumber(t.value).then(function (ok) { if (ok) { t.value = ''; if (typeof loadProducts === 'function') loadProducts(); } });
  }, true);

  // ---- the numbering dialog ---------------------------------------------------------------------------------
  var mn = { rows: [], dialog: null };
  function buildNumbers() {
    if (mn.dialog) return;
    var d = document.createElement('dialog');
    d.id = 'menuNumbersDialog';
    d.innerHTML = '<form class="dialog-card" id="menuNumbersForm" method="dialog">' +
      '<div class="dialog-head"><h2>Menu numbers</h2><button type="button" class="icon-btn" data-mn-close aria-label="Close">×</button></div>' +
      '<p class="muted">Give each dish the number printed on your menu board. Numbered dishes appear in Hot sellers, in number order.</p>' +
      '<div class="mn-tools"><input type="search" id="mnFilter" placeholder="Search" autocomplete="off"><button type="button" id="mnAuto" class="secondary">Number the rest</button><button type="button" id="mnClear" class="ghost">Clear all</button></div>' +
      '<div class="mn-list" id="mnList"></div><p class="error" id="mnError" role="alert" hidden></p>' +
      '<div class="dialog-actions"><button type="button" class="ghost" data-mn-close>Cancel</button><button type="submit" class="primary" id="mnSave">Save</button></div></form>';
    document.body.appendChild(d);
    mn.dialog = d;
    d.addEventListener('click', function (event) { if (event.target.closest('[data-mn-close]')) d.close(); });
    $('mnFilter').addEventListener('input', paintNumbers);
    $('mnList').addEventListener('input', function (event) {
      var i = event.target.dataset && event.target.dataset.i;
      if (i === undefined) return;
      mn.rows[Number(i)].value = event.target.value.trim();
      validateNumbers();
    });
    $('mnAuto').addEventListener('click', function () {
      var used = {};
      mn.rows.forEach(function (r) { if (r.value) used[r.value] = 1; });
      var n = 1;
      mn.rows.forEach(function (r) { if (r.value) return; while (used[String(n)]) n++; r.value = String(n); used[String(n)] = 1; });
      paintNumbers();
    });
    $('mnClear').addEventListener('click', function () { mn.rows.forEach(function (r) { r.value = ''; }); paintNumbers(); });
    $('menuNumbersForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var items = mn.rows.filter(function (r) { return r.value !== r.orig; }).map(function (r) { return { productId: r.id, menuNo: r.value === '' ? null : Number(r.value) }; });
      if (!items.length) { d.close(); return; }
      fetch('/api/products/menu-numbers', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopId: shop(), items: items }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (!res.ok) { var e = $('mnError'); e.hidden = false; e.textContent = res.body.message || 'Could not save.'; return; }
          menuCache.at = 0; d.close(); say(L('Menu numbers saved.', '菜单编号已保存。'), false);
          if (typeof loadProducts === 'function') loadProducts();
        });
    });
  }
  function validateNumbers() {
    var count = {}, bad = false;
    mn.rows.forEach(function (r) { if (r.value) count[r.value] = (count[r.value] || 0) + 1; });
    var message = '';
    mn.rows.forEach(function (r, i) {
      var n = Number(r.value), invalid = r.value !== '' && !(Math.floor(n) === n && n >= 1 && n <= 999), dup = r.value !== '' && count[r.value] > 1;
      var el = $('mnList').querySelector('[data-i="' + i + '"]');
      if (el) el.classList.toggle('mn-bad', invalid || dup);
      if ((invalid || dup) && !message) message = invalid ? L('A number is a whole number from 1 to 999.', '编号必须是 1 到 999 的整数。') : L('Number ' + r.value + ' is used twice.', '编号 ' + r.value + ' 重复了。');
      if (invalid || dup) bad = true;
    });
    var err = $('mnError'); err.hidden = !bad; err.textContent = message;
    $('mnSave').disabled = bad;
  }
  function paintNumbers() {
    var q = $('mnFilter').value.trim().toLowerCase();
    $('mnList').innerHTML = mn.rows.map(function (r, i) {
      if (q && (r.name + ' ' + r.code + ' ' + r.category).toLowerCase().indexOf(q) < 0) return '';
      return '<label class="mn-row" data-i="' + i + '"><input class="mn-no" type="number" min="1" max="999" inputmode="numeric" data-i="' + i + '" value="' + esc(r.value) + '" aria-label="' + esc(r.name) + '"><span class="mn-code">' + esc(r.code) + '</span><span class="mn-name">' + esc(r.name) + '</span><span class="mn-cat">' + esc(r.category) + '</span></label>';
    }).join('');
    validateNumbers();
  }
  function openNumbers() {
    if (!canEditNumbers()) return;
    buildNumbers();
    fetch('/api/products?shopId=' + shop(), { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      mn.rows = rows.map(function (r) { var v = r.menuNo ? String(r.menuNo) : ''; return { id: r.productId, code: r.productCode || '', name: r.productName, category: r.categoryName || '', value: v, orig: v }; })
        .sort(function (a, b) { var an = a.orig ? Number(a.orig) : 1e9, bn = b.orig ? Number(b.orig) : 1e9; return an - bn || (a.category < b.category ? -1 : a.category > b.category ? 1 : a.code < b.code ? -1 : 1); });
      $('mnFilter').value = ''; $('mnError').hidden = true;
      paintNumbers();
      mn.dialog.showModal();
    });
  }

  // ---- wiring -------------------------------------------------------------------------------------------------------
  function tick() { buildQuick(); syncQuick(); wireReceipt(); wirePayment(); buildSearchButton(); buildMenuBox(); syncMenuBox(); }
  function init() {
    tick();
    setInterval(tick, 800);
    setInterval(refreshHeld, 3000);
    setTimeout(refreshHeld, 1500);
    document.addEventListener('close', function (event) { if (event.target && event.target.tagName === 'DIALOG') setTimeout(refreshHeld, 400); }, true);
    document.addEventListener('softpos:languagechange', function () { var q = $('demoQuickCash'); if (q) q.dataset.lang = ''; if (palette && !palette.hidden) onQuery(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
