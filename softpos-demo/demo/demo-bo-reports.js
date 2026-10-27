// Report centre and report pages. Owned by the reports work stream.
// The centre lists the reports by job (spec 4.4). A report opens on its own page, with a breadcrumb back to the centre.
// The reports built here run on /api/reports/:key (demo/backend/reports.js) and export to CSV; the vendor's pages that are not
// rebuilt (statements, aging, closing, X / Z) are buttons that open the existing page through DemoNav.openItem.
(function () {
  'use strict';

  var PAGE_KEY = 'bo:report-centre';
  var STORE_KEY = 'softpos.bo.reports.v1';
  var root = null;        // <section> that holds the page
  var shown = false;      // true while this page is the open one
  var view = { kind: 'centre', query: '', group: '', opener: '' };
  var rs = null;          // the report that is open: form, applied filters, data
  var lookups = null;

  // ---- what the centre offers ---------------------------------------------------------------------------------------
  var GROUPS = [
    { key: 'sales', name: 'Sales', icon: 'chart', hint: 'Takings by period and by user, and every invoice line' },
    { key: 'products', name: 'Products', icon: 'tag', hint: 'What sells, in each shop' },
    { key: 'stock', name: 'Stock', icon: 'box', hint: 'What is on the shelf, what is running low, what moved' },
    { key: 'recipes', name: 'Recipes and ingredients', icon: 'pot', hint: 'What the kitchen used and what it cost' },
    { key: 'customers', name: 'Customers', icon: 'people', hint: 'Statements and aging for account customers' },
    { key: 'cash', name: 'Cash and closing', icon: 'cash', hint: 'End-of-day and shift reports' },
    { key: 'classic', name: 'Classic pages', icon: 'doc', hint: 'Earlier report pages, with PDF and e-mail' }
  ];
  var ANY_STATUS = [['', 'Any status'], ['negative', 'Negative only'], ['out', 'Out of stock only'], ['in', 'In stock only']];
  var CATEGORY = { key: 'categoryId', label: 'Category', type: 'select', source: 'categories', any: 'All categories' };
  var INGREDIENT = { key: 'ingredientId', label: 'Ingredient', type: 'select', source: 'ingredients', any: 'All ingredients' };
  // shop / range: which of the shared filters the report uses; def: the period it opens on
  var REPORTS = [
    { key: 'sales-by-period', group: 'sales', name: 'Sales by period', help: 'Invoices, refunds and net sales for each day, week or month.', shop: true, range: true, def: 'last7',
      extras: [{ key: 'group', label: 'Group by', type: 'select', options: [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']], value: 'day' }] },
    { key: 'sales-by-user', group: 'sales', name: 'Sales by user', help: 'What each person sold in the period.', shop: true, range: true, def: 'last7' },
    { key: 'sales-detail', group: 'sales', name: 'Sales detail', help: 'Every invoice line in the period, including refunds.', shop: true, range: true, def: 'last7',
      extras: [{ key: 'cashier', label: 'User', type: 'select', source: 'users', any: 'All users' }, { key: 'type', label: 'Type', type: 'select', options: [['', 'Sales and refunds'], ['sale', 'Sales only'], ['refund', 'Refunds only']] }] },
    { key: 'product-sales', group: 'products', name: 'Product sales', help: 'Quantity and net sales for each product.', shop: true, range: true, def: 'last7', extras: [CATEGORY] },
    { key: 'product-sales-by-shop', group: 'products', name: 'Product sales by shop', help: 'Quantity and net sales for each product, shop by shop.', shop: true, range: true, def: 'last7', extras: [CATEGORY] },
    { key: 'stock-levels', group: 'stock', name: 'Stock levels', help: 'Stock on hand now, valued at cost and at retail price.', shop: true,
      extras: [CATEGORY, { key: 'status', label: 'Status', type: 'select', options: ANY_STATUS }, { key: 'scope', label: 'Show', type: 'select', options: [['stock', 'Stock items only'], ['all', 'All items']], value: 'stock' }] },
    { key: 'low-negative-stock', group: 'stock', also: ['recipes'], name: 'Low and negative stock', help: 'Items that are negative, out of stock or at or below the low-stock level, with days left at the current rate of use.',
      shop: true, range: true, def: 'last30',
      extras: [{ key: 'status', label: 'Status', type: 'select', options: [['', 'Low and negative'], ['negative', 'Negative only'], ['low', 'Low only']] }, { key: 'lowAt', label: 'Low at or below', type: 'number', value: 20 },
        { key: 'scope', label: 'Show', type: 'select', options: [['', 'All stock items'], ['ingredients', 'Ingredients only']] }] },
    { key: 'stock-movement', group: 'stock', name: 'Stock movement', help: 'Every change to stock: sales, goods received, adjustments, transfers and stock takes.', shop: true, range: true, def: 'last7',
      extras: [{ key: 'type', label: 'Movement', type: 'select', source: 'movementTypes', any: 'All movements' }] },
    { key: 'ingredient-consumption', group: 'recipes', name: 'Ingredient consumption', help: 'What the dishes sold used up, what it cost and its share of sales.', shop: true, range: true, def: 'last7', extras: [INGREDIENT] },
    { key: 'recipe-components', group: 'recipes', name: 'Recipe components', help: 'Every line of every recipe with its cost.',
      extras: [INGREDIENT, { key: 'state', label: 'Status', type: 'select', options: [['', 'Any status'], ['active', 'Active'], ['inactive', 'Inactive']] }] }
  ];
  // The vendor's pages that are not rebuilt. They are found in the sidebar data (DemoNav.readMenu / readSalesActions) so their permissions still apply.
  var VENDOR = [
    { group: 'customers', name: 'Customer statements', keys: ['reports:statement'] },
    { group: 'customers', name: 'Customer aging', keys: ['reports:aging'] },
    { group: 'cash', name: 'POS closing report', keys: ['reports:closing'] },
    { group: 'cash', name: 'X / Z reports', label: /^x\s*\/\s*z/i },
    { group: 'classic', name: 'Sales reports', keys: ['reports:sales'] },
    { group: 'classic', name: 'Product sales summary', keys: ['reports:productsales'] },
    { group: 'classic', name: 'Product sales by shop', keys: ['reports:productshopsales'] },
    { group: 'classic', name: 'Stock reports', keys: ['reports:stock'] }
  ];
  var BY_KEY = {};
  REPORTS.forEach(function (r) { BY_KEY[r.key] = r; });
  var PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Custom']];

  // ---- small helpers -------------------------------------------------------------------------------------------------
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function tt(s) { return window.SoftPOSLanguage ? window.SoftPOSLanguage.t(s) : s; }
  function fmt(template, vars) {
    var s = tt(template);
    Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function stamp(d) { return dayStr(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function currentShop() { var s = document.getElementById('shopSelect'); return s && s.value ? String(s.value) : '1'; }
  function toastMessage(message, bad) { if (typeof window.toast === 'function') window.toast(message, !!bad); }
  var NF = {
    int: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
    qty: new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }),
    money: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    pct: new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  };
  var NOWRAP = { period: 1, code: 1, unit: 1, invoiceNo: 1, type: 1, kind: 1, dishCode: 1, shopName: 1 }; // text columns that keep to one line; the others wrap when the table is tight
  function isNumberType(t) { return t === 'int' || t === 'qty' || t === 'money' || t === 'pct'; }

  var ICONS = {
    chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5V8Z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    pot: '<path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-3Z"/><path d="M2 11h20M9 7c0-1.5 1-1.5 1-3M14 7c0-1.5 1-1.5 1-3"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.7-3.7 3.200-5.500 6.500-5.500s5.800 1.800 6.500 5.500"/><circle cx="17" cy="9" r="2.5"/><path d="M17.500 14.500c2.300.3 3.800 1.800 4.200 4.500"/>',
    cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.500 12h.01M17.500 12h.01"/>',
    doc: '<path d="M7 3h8l4 4v14H7V3Z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
    search: '<circle cx="11" cy="11" r="6.500"/><path d="m16 16 4.500 4.500"/>',
    csv: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/>',
    print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/>',
    open: '<path d="M7 17 17 7M9 7h8v8"/>',
    bad: '<circle cx="12" cy="12" r="9"/><path d="M12 7.500v5.500M12 16.500h.01"/>',
    warn: '<path d="M12 3.500 22 20H2L12 3.500Z"/><path d="M12 10v4.500M12 17.500h.01"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.500 2.800 2.800 5.200-5.800"/>',
    mute: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    run: '<path d="m7 5 11 7-11 7V5Z"/>'
  };
  function ico(name, size) {
    var n = size || 16;
    return '<svg class="bo-ico" viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  // ---- remembered choices (per report, in this browser) --------------------------------------------------------------
  function loadPrefs() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  function savePrefs() {
    if (!rs) return;
    try {
      var all = loadPrefs();
      all[rs.key] = { form: { shop: rs.form.shop, preset: rs.form.preset, from: rs.form.from, to: rs.form.to, extras: rs.form.extras }, sort: rs.sort, pageSize: rs.pageSize };
      localStorage.setItem(STORE_KEY, JSON.stringify(all));
    } catch (e) { /* storage may be blocked */ }
  }
  function presetRange(p) {
    var now = new Date(), from = new Date(now.getFullYear(), now.getMonth(), now.getDate()), to = new Date(from);
    if (p === 'yesterday') { from.setDate(from.getDate() - 1); to = new Date(from); }
    else if (p === 'last7') from.setDate(from.getDate() - 6);
    else if (p === 'last30') from.setDate(from.getDate() - 29);
    else if (p === 'month') from.setDate(1);
    else if (p === 'lastmonth') { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
    return { from: dayStr(from) + 'T00:00', to: dayStr(to) + 'T23:59' };
  }

  // ---- data ------------------------------------------------------------------------------------------------------------
  function getJson(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.message || tt('The report could not be loaded.'));
        return body;
      });
    });
  }
  function ensureLookups() {
    if (lookups) return Promise.resolve(lookups);
    return getJson('/api/reports/lookups').then(function (l) { lookups = l; return l; }, function () { lookups = { shops: [], categories: [], users: [], ingredients: [], movementTypes: [] }; return lookups; });
  }
  function queryOf(paging) {
    var a = rs.applied, def = rs.def, p = [];
    function add(k, v) { p.push(encodeURIComponent(k) + '=' + encodeURIComponent(v)); }
    if (def.shop) add('filter[shopId]', a.shop);
    if (def.range) { add('filter[from]', a.from); add('filter[to]', a.to); }
    (def.extras || []).forEach(function (x) { var v = a.extras[x.key]; if (v !== '' && v !== undefined && v !== null) add('filter[' + x.key + ']', v); });
    if (a.q) add('q', a.q);
    if (rs.sort) add('sort', rs.sort);
    if (paging) { add('page', paging.page); add('pageSize', paging.pageSize); }
    return p.join('&');
  }

  // ---- the page itself ---------------------------------------------------------------------------------------------------
  function buildRoot() {
    var main = document.querySelector('#appScreen > main') || document.querySelector('main');
    if (!main) return false;
    root = document.createElement('section');
    root.id = 'boReports';
    root.className = 'view bo-rep';
    root.setAttribute('aria-label', 'Report centre');
    root.setAttribute('data-i18n-attrs', 'aria-label');
    main.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', function (e) { e.preventDefault(); run(); });
    root.addEventListener('keydown', onKeydown);
    return true;
  }
  function open() {
    shown = true;
    document.querySelectorAll('.view.active-view').forEach(function (v) { if (v !== root) v.classList.remove('active-view'); });
    root.classList.add('active-view');
    view = { kind: 'centre', query: '', group: '', opener: '' };
    showCentre(false);
  }
  function close() {
    shown = false;
    rs = null;
    if (root) root.classList.remove('active-view');
  }
  function focusTitle() { var h = root.querySelector('.bo-title'); if (h) h.focus({ preventScroll: true }); }

  // ---- report centre -------------------------------------------------------------------------------------------------------
  function vendorItem(entry) {
    var nav = window.DemoNav, leaves = [], hit = null;
    if (!nav) return null;
    nav.readMenu().forEach(function (m) { if (m.type === 'group') leaves = leaves.concat(m.items); else leaves.push(m); });
    leaves = leaves.concat(nav.readSalesActions());
    leaves.forEach(function (it) {
      if (hit || it.disabled) return;
      if ((entry.keys || []).indexOf(it.key) >= 0 || (entry.label && entry.label.test(it.label))) hit = it;
    });
    return hit;
  }
  function openVendor(index) {
    var item = vendorItem(VENDOR[index]);
    if (!item) return;
    if (window.DemoPages) window.DemoPages.closeAll();
    if (item.type === 'action') item.source.click(); else window.DemoNav.openItem(item);
  }
  function itemsOf(group) {
    var list = REPORTS.filter(function (r) { return r.group === group || (r.also || []).indexOf(group) >= 0; }).map(function (r) { return { report: r, name: r.name, help: r.help }; });
    VENDOR.forEach(function (v, i) { if (v.group === group && vendorItem(v)) list.push({ vendor: i, name: v.name, help: '' }); });
    return list;
  }
  function cardsHtml(query) {
    var q = query.trim().toLowerCase(), out = '';
    GROUPS.forEach(function (g) {
      var groupHit = q && (tt(g.name) + ' ' + g.name).toLowerCase().indexOf(q) >= 0;
      var list = itemsOf(g.key).filter(function (it) { return !q || groupHit || (tt(it.name) + ' ' + it.name + ' ' + tt(it.help) + ' ' + it.help).toLowerCase().indexOf(q) >= 0; });
      if (!list.length) return;
      out += '<section class="bo-card" aria-labelledby="boCard-' + g.key + '"><div class="bo-card-top"><span class="bo-card-ico">' + ico(g.icon, 22) + '</span><div><h3 id="boCard-' + g.key + '">' + esc(tt(g.name)) + '</h3><p>' + esc(tt(g.hint)) + '</p></div></div><div class="bo-card-btns">' +
        list.map(function (it) {
          if (it.vendor !== undefined) return '<button type="button" class="bo-btn bo-btn-sm" data-vendor="' + it.vendor + '" title="' + esc(tt('Opens the existing page')) + '">' + esc(tt(it.name)) + ico('open', 13) + '</button>';
          return '<button type="button" class="bo-btn bo-btn-sm" data-open="' + it.report.key + '" data-group="' + g.key + '">' + esc(tt(it.name)) + '</button>';
        }).join('') + '</div></section>';
    });
    return out || '<p class="bo-empty">' + esc(fmt('No report matches “{q}”.', { q: query.trim() })) + ' <button type="button" class="bo-link" data-act="clear-find">' + esc(tt('Clear search')) + '</button></p>';
  }
  function showCentre(focus) {
    var opener = view.opener;
    rs = null;
    view = { kind: 'centre', query: view.query, group: '', opener: opener };
    root.innerHTML = '<header class="bo-head"><div><h2 class="bo-title" tabindex="-1">' + esc(tt('Report centre')) + '</h2><p class="bo-help">' + esc(tt('Pick a report. The reports on these pages can be saved as CSV or printed.')) + '</p></div>' +
      '<label class="bo-f bo-find">' + ico('search', 16) + '<input type="search" name="find" autocomplete="off" placeholder="' + esc(tt('Find a report')) + '" aria-label="' + esc(tt('Find a report')) + '" value="' + esc(view.query) + '"></label></header>' +
      '<div class="bo-cards" id="boCards">' + cardsHtml(view.query) + '</div>';
    if (focus && opener) {
      var back = root.querySelector('[data-open="' + opener + '"]');
      if (back) { back.focus(); return; }
    }
    if (focus) focusTitle();
  }

  // ---- a report page ---------------------------------------------------------------------------------------------------------
  function openReport(key, group) {
    var def = BY_KEY[key];
    if (!def) return;
    var prefs = loadPrefs()[key] || {}, f = prefs.form || {}, preset = f.preset || def.def || 'last7', range = preset === 'custom' && f.from && f.to ? { from: f.from, to: f.to } : presetRange(preset), extras = {};
    (def.extras || []).forEach(function (x) { extras[x.key] = f.extras && f.extras[x.key] !== undefined ? f.extras[x.key] : (x.value !== undefined ? x.value : ''); });
    rs = { key: key, def: def, form: { shop: f.shop !== undefined ? f.shop : currentShop(), preset: preset, from: range.from, to: range.to, q: '', extras: extras },
      applied: null, sort: prefs.sort || '', pageSize: prefs.pageSize || 50, page: 1, data: null, loading: true, error: '', dirty: false, seq: 0, busy: false, note: '' };
    view = { kind: 'report', query: view.query, group: group || def.group, opener: key };
    ensureLookups().then(function () {
      if (!rs || rs.key !== key) return;
      var shops = lookups.shops || [];
      if (def.shop && rs.form.shop !== '' && shops.length && !shops.some(function (s) { return String(s.id) === String(rs.form.shop); })) rs.form.shop = shops[0] ? String(shops[0].id) : '';
      renderReport();
      focusTitle();
      run();
    });
  }
  function optionsOf(x) {
    if (x.options) return x.options.map(function (o) { return [o[0], tt(o[1])]; });
    var list = (lookups && lookups[x.source]) || [];
    return [['', tt(x.any)]].concat(list.map(function (o) { return [String(o.id), tt(o.name)]; }));
  }
  // The option text says what the box is ("All shops", "Last 7 days"), so a select needs no visible caption; it still has a name for screen readers.
  function selectHtml(name, label, options, value) {
    return '<label class="bo-f"><span class="bo-sr">' + esc(label) + '</span><select name="' + esc(name) + '">' +
      options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
  }
  function siblingsHtml(def) {
    var group = GROUPS.filter(function (g) { return g.key === view.group; })[0] || GROUPS[0];
    var list = REPORTS.filter(function (r) { return r.group === group.key || (r.also || []).indexOf(group.key) >= 0; });
    if (list.length < 2) return '';
    return '<nav class="bo-sibs" aria-label="' + esc(fmt('Reports in {group}', { group: tt(group.name) })) + '"><span class="bo-sibs-l">' + esc(tt(group.name)) + '</span>' + list.map(function (r) {
      return r.key === def.key ? '<span class="bo-sib is-here" aria-current="page">' + esc(tt(r.name)) + '</span>' : '<button type="button" class="bo-link bo-sib" data-open="' + r.key + '" data-group="' + group.key + '">' + esc(tt(r.name)) + '</button>';
    }).join('') + '</nav>';
  }
  function renderReport() {
    var def = rs.def, f = rs.form, controls = '';
    if (def.shop) controls += selectHtml('shop', tt('Shop'), [['', tt('All shops')]].concat((lookups.shops || []).map(function (s) { return [String(s.id), s.name]; })), f.shop);
    if (def.range) {
      controls += selectHtml('preset', tt('Period'), PRESETS.map(function (p) { return [p[0], tt(p[1])]; }), f.preset) +
        '<div class="bo-f bo-range" role="group" aria-label="' + esc(tt('Period')) + '"><input type="datetime-local" name="from" step="60" required aria-label="' + esc(tt('From')) + '" value="' + esc(f.from) + '"><span aria-hidden="true">–</span>' +
        '<input type="datetime-local" name="to" step="60" required aria-label="' + esc(tt('To')) + '" value="' + esc(f.to) + '"></div>';
    }
    (def.extras || []).forEach(function (x) {
      if (x.type === 'number') controls += '<label class="bo-f"><span class="bo-f-l">' + esc(tt(x.label)) + '</span><input type="number" name="x-' + x.key + '" class="bo-f-num" min="0" step="any" inputmode="decimal" value="' + esc(f.extras[x.key]) + '"></label>';
      else controls += selectHtml('x-' + x.key, tt(x.label), optionsOf(x), f.extras[x.key]);
    });
    controls += '<label class="bo-f bo-f-search">' + ico('search', 16) + '<input type="search" name="q" autocomplete="off" placeholder="' + esc(tt('Search in this report')) + '" aria-label="' + esc(tt('Search in this report')) + '" value="' + esc(f.q) + '"></label>' +
      '<button type="submit" class="bo-btn bo-run">' + ico('run', 14) + '<span>' + esc(tt('Run')) + '</span></button>';
    var group = GROUPS.filter(function (g) { return g.key === view.group; })[0];
    root.innerHTML = '<nav class="bo-crumb" aria-label="' + esc(tt('Breadcrumb')) + '"><ol><li>' + esc(tt('Reports')) + '</li><li><button type="button" class="bo-link" data-act="centre">' + esc(tt('Report centre')) + '</button></li><li aria-current="page">' + esc(tt(def.name)) + '</li></ol></nav>' +
      '<header class="bo-head"><div><h2 class="bo-title" tabindex="-1">' + esc(tt(def.name)) + '</h2><p class="bo-help">' + esc(tt(def.help)) + '</p>' + siblingsHtml(def) + '</div></header>' +
      '<form class="bo-bar" novalidate><div class="bo-export" role="group" aria-label="' + esc(tt('Export')) + '"><button type="button" class="bo-btn" data-act="csv">' + ico('csv', 15) + '<span>' + esc(tt('Export CSV')) + '</span></button>' +
      '<button type="button" class="bo-btn" data-act="print">' + ico('print', 15) + '<span>' + esc(tt('Print')) + '</span></button></div>' +
      '<div class="bo-filters" role="group" aria-label="' + esc(tt('Filters')) + '">' + controls + '</div></form>' +
      '<p class="bo-status" id="boStatus" role="status" aria-live="polite"></p><div class="bo-body" id="boBody"></div><div class="bo-foot" id="boFoot"></div>';
    renderBody();
  }
  function appliedLine() {
    var a = rs.applied, d = rs.data, parts = [];
    if (!a || !d) return '';
    if (rs.def.shop) {
      var shop = (lookups.shops || []).filter(function (s) { return String(s.id) === String(a.shop); })[0];
      parts.push(shop ? shop.name : tt('All shops'));
    }
    if (rs.def.range) parts.push(d.from.replace('T', ' ') + ' – ' + d.to.replace('T', ' '));
    else if (rs.key === 'stock-levels') parts.push(fmt('Current stock as of {when}', { when: stamp(new Date(d.generatedUtc)) }));
    return parts.join(' · ');
  }
  function renderBody() {
    var body = document.getElementById('boBody'), foot = document.getElementById('boFoot'), status = document.getElementById('boStatus');
    if (!body || !rs) return;
    var d = rs.data, canExport = !!d && d.total > 0 && !rs.busy;
    root.querySelectorAll('[data-act="csv"],[data-act="print"]').forEach(function (b) { b.disabled = !canExport; });
    var runBtn = root.querySelector('.bo-run');
    if (runBtn) runBtn.classList.toggle('is-dirty', rs.dirty);
    status.className = 'bo-status' + (rs.error ? ' is-error' : rs.dirty ? ' is-dirty' : '');
    status.textContent = rs.error ? rs.error : rs.dirty ? tt('Filters changed. Press Run to update the table.') : rs.note ? rs.note : rs.loading && !d ? tt('Loading report…') : appliedLine();
    body.setAttribute('aria-busy', rs.loading ? 'true' : 'false');
    if (rs.error && !d) {
      body.innerHTML = '<div class="bo-empty"><p>' + esc(rs.error) + '</p><button type="button" class="bo-btn" data-act="retry">' + esc(tt('Try again')) + '</button></div>';
      foot.innerHTML = '';
      return;
    }
    if (!d) {
      body.innerHTML = '<div class="bo-skel" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>';
      foot.innerHTML = '';
      return;
    }
    if (d.total === 0) {
      body.innerHTML = '<div class="bo-empty' + (rs.loading ? ' is-loading' : '') + '"><p>' + esc(tt('No records match these filters.')) + '</p><p class="bo-muted">' + esc(tt('Change the filters and press Run.')) + '</p></div>';
    } else {
      body.innerHTML = tableHtml(d);
      var wrap = body.querySelector('.bo-tablewrap');
      if (wrap && rs.loading) wrap.classList.add('is-loading');
    }
    foot.innerHTML = footHtml(d);
  }
  function cellHtml(c, v) {
    var cls = isNumberType(c.type) ? ' class="bo-num"' : '';
    if (v === null || v === undefined || v === '') return '<td' + cls + '><span class="bo-nil" aria-label="–">–</span></td>';
    if (c.key === 'status') {
      var kind = { 'Negative': 'bad', 'Out of stock': 'warn', 'Low': 'warn', 'In stock': 'ok' }[v] || 'mute';
      return '<td><span class="bo-st bo-st-' + kind + '">' + ico(kind, 15) + '<span>' + esc(tt(v)) + '</span></span></td>';
    }
    if (c.type === 'int') return '<td' + cls + '>' + NF.int.format(v) + '</td>';
    if (c.type === 'qty') return '<td class="bo-num' + (c.key === 'stock' && v < 0 ? ' is-neg' : '') + '">' + NF.qty.format(v) + '</td>';
    if (c.type === 'money') return '<td' + cls + '>' + NF.money.format(v) + '</td>';
    if (c.type === 'pct') return '<td' + cls + '>' + NF.pct.format(v) + '</td>';
    return '<td' + (c.type === 'datetime' || NOWRAP[c.key] ? ' class="bo-nw"' : '') + '>' + esc(c.tr ? tt(String(v)) : v) + '</td>';
  }
  function tableHtml(d) {
    var cols = d.columns, sort = rs.sort, first = (d.page - 1) * d.pageSize;
    var head = '<th scope="col" class="bo-no">' + esc(tt('No.')) + '</th>' + cols.map(function (c) {
      var on = sort === c.key || sort === '-' + c.key, dir = on ? (sort.charAt(0) === '-' ? 'descending' : 'ascending') : 'none';
      return '<th scope="col" class="' + (isNumberType(c.type) ? 'bo-num' : '') + (on ? ' is-sorted' : '') + '"' + (on ? ' aria-sort="' + dir + '"' : '') + '><button type="button" class="bo-sort" data-sort="' + c.key + '" data-type="' + c.type + '"><span>' + esc(tt(c.label)) +
        '</span><span class="bo-arrow" aria-hidden="true">' + (on ? (dir === 'descending' ? '▼' : '▲') : '↕') + '</span></button></th>';
    }).join('');
    var rows = d.rows.map(function (r, i) {
      return '<tr><td class="bo-no">' + (first + i + 1) + '</td>' + cols.map(function (c) { return cellHtml(c, r[c.key]); }).join('') + '</tr>';
    }).join('');
    var hasTotals = Object.keys(d.totals || {}).length > 0;
    var tfoot = hasTotals ? '<tfoot><tr><td class="bo-no"></td>' + cols.map(function (c, i) {
      var v = d.totals[c.key];
      if (v === undefined || v === null) return '<td class="' + (isNumberType(c.type) ? 'bo-num' : '') + '">' + (i === 0 ? esc(tt('Total')) : '') + '</td>';
      return cellHtml(c, v);
    }).join('') + '</tr></tfoot>' : '';
    return '<div class="bo-tablewrap" tabindex="0" role="region" aria-label="' + esc(tt(rs.def.name)) + '"><table class="bo-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody>' + tfoot + '</table></div>';
  }
  function footHtml(d) {
    var sizes = [20, 50, 100], pages = d.pageCount, p = d.page;
    function nav(act, label, glyph, off) { return '<button type="button" class="bo-btn bo-pg" data-page="' + act + '" aria-label="' + esc(tt(label)) + '"' + (off ? ' disabled' : '') + '>' + glyph + '</button>'; }
    return '<div class="bo-foot-row"><span class="bo-count">' + esc(d.total === 1 ? tt('1 record') : fmt('{n} records', { n: NF.int.format(d.total) })) + '</span><div class="bo-pager">' +
      '<label class="bo-rows"><span>' + esc(tt('Rows per page')) + '</span><select name="pageSize">' + sizes.map(function (n) { return '<option value="' + n + '"' + (n === rs.pageSize ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' +
      nav('1', 'First page', '«', p <= 1) + nav(String(p - 1), 'Previous page', '‹', p <= 1) + '<span class="bo-pos">' + p + ' / ' + pages + '</span>' + nav(String(p + 1), 'Next page', '›', p >= pages) + nav(String(pages), 'Last page', '»', p >= pages) + '</div></div>' + (d.note && d.total ? '<p class="bo-note">' + esc(tt(d.note)) + '</p>' : '');
  }

  // ---- running a report ------------------------------------------------------------------------------------------------------------
  function load(page) {
    var seq = ++rs.seq, key = rs.key;
    rs.loading = true; rs.error = ''; rs.note = '';
    renderBody();
    return getJson('/api/reports/' + key + '?' + queryOf({ page: page || 1, pageSize: rs.pageSize })).then(function (data) {
      if (!rs || rs.key !== key || seq !== rs.seq) return;
      rs.data = data; rs.loading = false; rs.page = data.page;
      renderBody();
      savePrefs();
    }, function (error) {
      if (!rs || rs.key !== key || seq !== rs.seq) return;
      rs.loading = false; rs.error = tt(error.message);
      renderBody();
    });
  }
  function run() {
    if (!rs) return Promise.resolve();
    if (rs.def.range && rs.form.to < rs.form.from) { rs.error = tt('End date/time must be on or after start date/time.'); renderBody(); return Promise.resolve(); }
    rs.applied = clone(rs.form);
    rs.dirty = false;
    return load(1);
  }
  function onInput(e) {
    var t = e.target;
    if (view.kind === 'centre' && t.name === 'find') {
      view.query = t.value;
      document.getElementById('boCards').innerHTML = cardsHtml(view.query);
      return;
    }
    if (rs && t.closest && t.closest('.bo-bar')) readControl(t);
  }
  function onChange(e) {
    var t = e.target;
    if (view.kind === 'centre') return;
    if (t.name === 'pageSize') { rs.pageSize = Number(t.value) || 50; load(1); return; }
    if (t.closest && t.closest('.bo-bar')) readControl(t);
  }
  function readControl(t) {
    var f = rs.form, name = t.name;
    if (!name) return;
    if (name === 'shop') f.shop = t.value;
    else if (name === 'q') f.q = t.value;
    else if (name === 'preset') {
      f.preset = t.value;
      if (t.value !== 'custom') {
        var r = presetRange(t.value);
        f.from = r.from; f.to = r.to;
        root.querySelector('[name="from"]').value = f.from; root.querySelector('[name="to"]').value = f.to;
      }
    } else if (name === 'from' || name === 'to') {
      f[name] = t.value;
      f.preset = 'custom';
      root.querySelector('[name="preset"]').value = 'custom';
    } else if (name.indexOf('x-') === 0) f.extras[name.slice(2)] = t.value;
    rs.dirty = true;
    rs.note = '';
    renderStatusOnly();
  }
  function renderStatusOnly() {
    var status = document.getElementById('boStatus'), runBtn = root.querySelector('.bo-run');
    if (!status) return;
    status.className = 'bo-status' + (rs.dirty ? ' is-dirty' : '');
    status.textContent = rs.dirty ? tt('Filters changed. Press Run to update the table.') : '';
    if (runBtn) runBtn.classList.toggle('is-dirty', rs.dirty);
  }
  function onKeydown(e) {
    if (e.key === 'Escape' && view.kind === 'centre' && e.target.name === 'find' && e.target.value) {
      e.target.value = '';
      view.query = '';
      document.getElementById('boCards').innerHTML = cardsHtml('');
      e.stopPropagation();
    }
  }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    if (b.dataset.open) { openReport(b.dataset.open, b.dataset.group); return; }
    if (b.dataset.vendor !== undefined) { openVendor(Number(b.dataset.vendor)); return; }
    if (b.dataset.sort) {
      var key = b.dataset.sort, numeric = b.dataset.type !== 'text' && b.dataset.type !== 'datetime';
      rs.sort = rs.sort === key ? '-' + key : rs.sort === '-' + key ? key : (numeric ? '-' + key : key);
      load(1);
      return;
    }
    if (b.dataset.page) { load(Number(b.dataset.page)); return; }
    switch (b.dataset.act) {
      case 'centre': showCentre(true); break;
      case 'clear-find': view.query = ''; root.querySelector('[name="find"]').value = ''; document.getElementById('boCards').innerHTML = cardsHtml(''); root.querySelector('[name="find"]').focus(); break;
      case 'retry': run(); break;
      case 'csv': exportCsv(); break;
      case 'print': printReport(); break;
    }
  }

  // ---- export ------------------------------------------------------------------------------------------------------------------------
  // The export always follows the filters on screen: if they were changed after the last Run, run first.
  function settled() { return rs.dirty || !rs.applied ? run() : Promise.resolve(); }
  function exportCsv() {
    if (!rs || rs.busy) return;
    var key = rs.key;
    rs.busy = true; renderBody();
    settled().then(function () {
      if (!rs || rs.key !== key) return;
      if (rs.error) throw new Error(rs.error); // the filters on screen are not valid: nothing is exported
      return fetch('/api/reports/' + key + '/export?format=csv&' + queryOf(), { credentials: 'same-origin' }).then(function (res) {
        if (!res.ok) return res.json().then(function (b) { throw new Error(b.message || tt('The report could not be loaded.')); });
        var name = (/filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '') || [])[1] || 'softpos-' + key + '.csv';
        return res.blob().then(function (blob) {
          var url = URL.createObjectURL(blob), a = document.createElement('a');
          a.href = url; a.download = name; a.hidden = true;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
          if (rs && rs.key === key) rs.note = fmt('Downloaded {name}', { name: name });
        });
      });
    }).catch(function (error) {
      if (rs) rs.error = tt(error.message);
      toastMessage(error.message, true);
    }).then(function () { if (rs && rs.key === key) { rs.busy = false; renderBody(); } });
  }
  function allRows() {
    var out = null;
    function next(page) {
      return getJson('/api/reports/' + rs.key + '?' + queryOf({ page: page, pageSize: 1000 })).then(function (d) {
        if (!out) out = d; else out.rows = out.rows.concat(d.rows);
        return d.page < d.pageCount ? next(page + 1) : out;
      });
    }
    return next(1);
  }
  function companyName() { try { return state.bootstrap.companyName || ''; } catch (e) { return ''; } }
  function plain(c, v) {
    if (v === null || v === undefined || v === '') return '';
    if (c.type === 'int') return NF.int.format(v);
    if (c.type === 'qty') return NF.qty.format(v);
    if (c.type === 'money') return NF.money.format(v);
    if (c.type === 'pct') return NF.pct.format(v);
    return c.tr ? tt(String(v)) : String(v);
  }
  function printReport() {
    if (!rs || rs.busy) return;
    var key = rs.key;
    rs.busy = true; renderBody();
    settled().then(function () { if (rs && rs.error) throw new Error(rs.error); return allRows(); }).then(function (d) {
      if (!rs || rs.key !== key) return;
      var cols = d.columns, num = function (c) { return isNumberType(c.type) ? ' class="n"' : ''; };
      var head = '<tr><th>' + esc(tt('No.')) + '</th>' + cols.map(function (c) { return '<th' + num(c) + '>' + esc(tt(c.label)) + '</th>'; }).join('') + '</tr>';
      var rows = d.rows.map(function (r, i) { return '<tr><td>' + (i + 1) + '</td>' + cols.map(function (c) { return '<td' + num(c) + '>' + esc(plain(c, r[c.key])) + '</td>'; }).join('') + '</tr>'; }).join('');
      var totals = '<tr class="t"><td></td>' + cols.map(function (c, i) { var v = d.totals[c.key]; return '<td' + num(c) + '>' + esc(v === undefined ? (i === 0 ? tt('Total') : '') : plain(c, v)) + '</td>'; }).join('') + '</tr>';
      var meta = [appliedLine(), fmt('Printed {when}', { when: stamp(new Date()) })].filter(Boolean).join('  ·  ');
      var html = '<!doctype html><html lang="' + (document.documentElement.lang || 'en') + '"><head><meta charset="utf-8"><title>' + esc(tt(rs.def.name)) + '</title><style>' +
        '@page{size:A4 ' + (cols.length > 6 ? 'landscape' : 'portrait') + ';margin:10mm}body{font:9pt Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:#172033}h1{font-size:13pt;margin:0}h2{font-size:11pt;margin:4px 0}p{margin:3px 0;color:#475569}' +
        'table{width:100%;border-collapse:collapse;margin-top:8px;font-size:8pt}th,td{padding:4px 5px;border-bottom:1px solid #d9e0e8;text-align:left;overflow-wrap:anywhere}th{background:#f5f7fa}.n{text-align:right}thead{display:table-header-group}tr{break-inside:avoid}tfoot,.t td{font-weight:700;border-top:1px solid #172033}.note{font-size:7pt;margin-top:8px}</style></head><body>' +
        '<h1>' + esc(companyName()) + '</h1><h2>' + esc(tt(rs.def.name)) + '</h2><p>' + esc(meta) + '</p><table><thead>' + head + '</thead><tbody>' + rows + totals + '</tbody></table>' + (d.note ? '<p class="note">' + esc(tt(d.note)) + '</p>' : '') + '</body></html>';
      return printHtml(html);
    }).catch(function (error) {
      toastMessage(error && error.message ? error.message : tt('Could not open printing. Use Export CSV instead.'), true);
    }).then(function () { if (rs && rs.key === key) { rs.busy = false; renderBody(); } });
  }
  function printHtml(html) {
    return new Promise(function (resolve, reject) {
      var frame = document.createElement('iframe');
      frame.title = 'Report print document';
      frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0';
      frame.addEventListener('load', function () {
        try {
          frame.contentWindow.addEventListener('afterprint', function () { frame.remove(); }, { once: true });
          frame.contentWindow.focus();
          frame.contentWindow.print();
          setTimeout(function () { if (frame.parentNode) frame.remove(); }, 60000);
          resolve();
        } catch (e) { frame.remove(); reject(new Error(tt('Could not open printing. Use Export CSV instead.'))); }
      }, { once: true });
      frame.srcdoc = html;
      document.body.appendChild(frame);
    });
  }

  // ---- language change: draw the page again in the other language, keeping what was typed ---------------------------------------
  document.addEventListener('softpos:languagechange', function () {
    if (!shown || !root) return;
    if (view.kind === 'centre') {
      var find = root.querySelector('[name="find"]'), had = document.activeElement === find;
      showCentre(false);
      if (had) root.querySelector('[name="find"]').focus();
    } else if (rs) {
      renderReport();
    }
  });

  // ---- register ------------------------------------------------------------------------------------------------------------------------
  function init() {
    if (!window.DemoPages || !buildRoot()) return;
    window.DemoPages.register({ key: PAGE_KEY, module: 'reports', label: ['Report centre', '报表中心'], open: open, close: close });
    // For other pages (Ctrl+K, links): DemoReports.list() gives { key, name, group } of the reports built here; DemoReports.open(key) shows one.
    window.DemoReports = {
      list: function () { return REPORTS.map(function (r) { return { key: r.key, name: r.name, group: r.group }; }); },
      open: function (key) { if (!BY_KEY[key]) return false; if (window.DemoPages.current() !== PAGE_KEY) window.DemoPages.open(PAGE_KEY); openReport(key, BY_KEY[key].group); return true; }
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
