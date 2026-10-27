// Navigation demo. Replaces the centred pop-up menus with:
//   - a left sidebar on desktop and tablets (it collapses to an icon rail), and
//   - a full-screen "More" with back navigation on phones.
// It reads the existing buttons, permissions and handlers and clicks them, so no page logic is changed.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var phoneQuery = window.matchMedia('(max-width: 600px)');
  var tabletQuery = window.matchMedia('(max-width: 1279px)'); // below this the sidebar starts as an icon rail, so the products keep their width

  var ICONS = {
    dashboard: '<path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z"/>',
    sales: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    stock: '<path d="M3 8l9-5 9 5v8l-9 5-9-5V8Z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    quotation: '<path d="M7 3h8l4 4v14H7V3Z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
    expense: '<path d="M4 4h16v16l-3-2-3 2-2-2-2 2-3-2-3 2V4Z"/><path d="M8 9h8M8 13h5"/>',
    reports: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'
  };
  function icon(name) {
    return '<span class="ds-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.more) + '</svg></span>';
  }
  function tt(s) { return window.SoftPOSLanguage ? SoftPOSLanguage.t(s) : s; }
  function isZh() { return window.SoftPOSLanguage && SoftPOSLanguage.language === 'zh-CN'; }
  function count(n, one, many) { return isZh() ? n + ' ' + one.zh : n + ' ' + (n === 1 ? one.en : many.en); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function text(btn) { return btn.textContent.replace(/\s+/g, ' ').trim(); }
  function pretty(s) {
    if (s !== s.toUpperCase()) return s;
    s = s.charAt(0) + s.slice(1).toLowerCase();
    return s.replace(/^X \/ z reports$/, 'X / Z reports');
  }
  function keyOf(btn) {
    return btn.id || [btn.dataset.tab, btn.dataset.stock, btn.dataset.suite && 'suite-' + btn.dataset.suite, btn.dataset.reportMode, btn.dataset.reportFamily,
      btn.dataset.customerReport].filter(Boolean).join('|') || text(btn);
  }

  // ---- read the existing menus ------------------------------------------------
  var GROUPS = [
    { key: 'sales', icon: 'sales', label: 'Sales', btn: 'salesMenuBtn', list: '#salesMenuDialog .sales-more-actions button' },
    { key: 'stock', icon: 'stock', label: 'Stock', btn: 'productManagementBtn', list: '#productManagementDialog .sales-more-actions button' },
    { key: 'expense', icon: 'expense', label: 'Expense', btn: 'inventorySuiteBtn', list: '#inventoryMenuDialog .sales-more-actions button' },
    { key: 'reports', icon: 'reports', label: 'Reports', btn: 'reportsMenuBtn', list: '#reportMenuDialog .sales-more-actions button' }
  ];
  function readMenu() {
    var out = [];
    qa('#appScreen > nav.tabs > button').forEach(function (tab) {
      var group = GROUPS.filter(function (g) { return g.btn === tab.id; })[0];
      if (!group) {
        if (tab.hidden) return;
        var tabKey = keyOf(tab), name = text(tab);
        out.push({ type: 'leaf', key: tabKey, group: null, label: name, icon: tab.dataset.tab === 'dashboardView' ? 'dashboard' : 'quotation', source: tab });
        return;
      }
      var items = qa(group.list).filter(function (b) { return !b.hidden; }).map(function (b) {
        return { type: 'leaf', key: group.key + ':' + keyOf(b), group: group, label: pretty(text(b)), source: b, disabled: b.disabled };
      });
      if (!items.length) return;
      if (items.length === 1) {
        // A menu with one entry is just a link: one click instead of two, and no extra level to remember.
        out.push({ type: 'leaf', key: items[0].key, group: group, label: tt(group.label), detail: items[0].label, icon: group.icon, source: items[0].source });
      } else out.push({ type: 'group', key: group.key, label: tt(group.label), icon: group.icon, items: items });
    });
    return out;
  }
  function readSalesActions() {
    return qa('#salesMoreActions button').filter(function (b) { return !b.hidden && !b.dataset.demoTool; }).map(function (b) {
      return { type: 'action', key: 'act:' + keyOf(b), label: pretty(text(b)), source: b, disabled: b.disabled };
    });
  }

  // ---- shared state -----------------------------------------------------------
  var activeKey = 'sales:retailSalesTab';
  var crumbParts = [];
  var expanded = { sales: true, stock: true, expense: true, reports: true };
  function setActive(item) {
    activeKey = item.key;
    crumbParts = item.group && item.type !== 'group' ? [tt(item.group.label), item.detail || item.label] : [item.detail || item.label];
    if (item.key === 'sales:retailSalesTab') crumbParts = [];
  }
  function toastMessage(message) { if (typeof toast === 'function') toast(message, false); }

  // ---- desktop and tablet: sidebar --------------------------------------------
  var side = document.createElement('nav');
  side.id = 'demoSidebar';
  side.className = 'demo-side';
  side.setAttribute('aria-label', tt('SoftPOS modules'));
  var crumb = document.createElement('p');
  crumb.id = 'demoCrumb';
  crumb.className = 'demo-crumb';
  crumb.hidden = true;
  var userPref = null;
  try { userPref = localStorage.getItem('demo.sidebar'); } catch (e) { /* storage may be blocked */ }

  function collapsed() { return userPref ? userPref === 'collapsed' : tabletQuery.matches; }

  function renderSidebar() {
    var app = $('appScreen');
    if (!app) return;
    var isCollapsed = collapsed();
    app.classList.toggle('ds-collapsed', isCollapsed);
    var html = '<div class="ds-scroll">';
    readMenu().forEach(function (m) {
      if (m.type === 'leaf') {
        html += '<button type="button" class="ds-item" data-ds="' + esc(m.key) + '" title="' + esc(m.detail ? m.label + ': ' + m.detail : m.label) + '"' + (activeKey === m.key ? ' aria-current="page"' : '') + '>' +
          icon(m.icon) + '<span class="ds-label">' + esc(m.label) + '</span></button>';
        return;
      }
      var open = expanded[m.key] !== false && !isCollapsed;
      var hasActive = m.items.some(function (i) { return i.key === activeKey; });
      html += '<div class="ds-group"><button type="button" class="ds-head' + (hasActive ? ' has-active' : '') + '" data-ds-group="' + m.key + '" aria-expanded="' + open + '" title="' + esc(m.label) + '">' +
        icon(m.icon) + '<span class="ds-label">' + esc(m.label) + '</span><svg class="ds-chev" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>';
      if (open) {
        html += '<div class="ds-sub">' + m.items.map(function (i) {
          return '<button type="button" class="ds-item" data-ds="' + esc(i.key) + '"' + (activeKey === i.key ? ' aria-current="page"' : '') + '><span class="ds-label">' + esc(i.label) + '</span></button>';
        }).join('') + '</div>';
      }
      html += '</div>';
    });
    html += '</div><button type="button" class="ds-collapse" aria-pressed="' + isCollapsed + '" title="' + esc(tt(isCollapsed ? 'Expand the sidebar' : 'Collapse to icons')) + '">' +
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="' + (isCollapsed ? 'm6 3 5 5-5 5' : 'm10 3-5 5 5 5') + '" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span class="ds-label">' + esc(tt('Collapse')) + '</span></button>';
    side.innerHTML = html;
    renderCrumb();
    placeSidebar();
  }
  function renderCrumb() {
    var parts = crumbParts.slice();
    crumb.hidden = !parts.length;
    var app = $('appScreen');
    if (app && app.classList.contains('ds-cashier') && parts.length) {
      // With no sidebar, the way back to the sale screen is right above the page.
      crumb.innerHTML = '<button type="button" class="demo-backsale" data-back-sale>‹ ' + esc(tt('Retail Sales')) + '</button><span>' + esc(parts.join(' › ')) + '</span>';
    } else crumb.textContent = parts.join(' › ');
  }
  crumb.addEventListener('click', function (event) {
    if (!event.target.closest('[data-back-sale]')) return;
    var sale = findItem('sales:retailSalesTab');
    if (sale) { setActive(sale); sale.source.click(); renderSidebar(); }
  });
  function placeSidebar() {
    var top = document.querySelector('#appScreen > .topbar');
    var notice = $('licenseNotice');
    var h = (top ? top.getBoundingClientRect().height : 0) + (notice && !notice.hidden ? notice.getBoundingClientRect().height : 0);
    document.documentElement.style.setProperty('--ds-top', Math.round(h) + 'px');
  }
  function findItem(key) {
    var found = null;
    readMenu().forEach(function (m) {
      if (m.type === 'leaf' && m.key === key) found = m;
      else if (m.type === 'group') m.items.forEach(function (i) { if (i.key === key) found = i; });
    });
    return found;
  }
  side.addEventListener('click', function (event) {
    var head = event.target.closest('[data-ds-group]');
    var item = event.target.closest('[data-ds]');
    var toggle = event.target.closest('.ds-collapse');
    if (toggle) {
      userPref = collapsed() ? 'expanded' : 'collapsed';
      try { localStorage.setItem('demo.sidebar', userPref); } catch (e) { /* ignore */ }
      renderSidebar();
      return;
    }
    if (head) {
      if (collapsed()) {
        userPref = 'expanded';
        try { localStorage.setItem('demo.sidebar', userPref); } catch (e) { /* ignore */ }
        expanded[head.dataset.dsGroup] = true;
      } else expanded[head.dataset.dsGroup] = !(expanded[head.dataset.dsGroup] !== false);
      renderSidebar();
      return;
    }
    if (item) {
      var target = findItem(item.dataset.ds);
      if (!target || target.disabled) return;
      setActive(target);
      target.source.click();
      renderSidebar();
    }
  });

  // Close buttons are not needed once every page is one click away.
  function mountDesktop() {
    var app = $('appScreen');
    if (!app || side.parentNode === app) return;
    var tabs = app.querySelector(':scope > nav.tabs');
    if (tabs) tabs.after(side); else app.appendChild(side);
    var main = app.querySelector(':scope > main');
    if (main) main.insertBefore(crumb, main.firstChild);
  }

  // ---- phone: a full-screen More with back navigation -----------------------------
  var more = document.createElement('section');
  more.id = 'demoMore';
  more.className = 'demo-more';
  more.hidden = true;
  more.setAttribute('aria-label', tt('More'));
  var pageBar = document.createElement('div');
  pageBar.id = 'demoPageBar';
  pageBar.className = 'demo-pagebar';
  pageBar.hidden = true;
  var m = { open: false, stack: ['root'], page: null };
  var depth = 0;
  var ignorePop = false;

  function snapshot() { return { open: m.open, stack: m.stack.slice(), page: m.page }; }
  function pushHistory() { depth++; try { history.pushState({ demoMore: snapshot() }, ''); } catch (e) { /* ignore */ } }
  function userLine() { return [$('userName') && $('userName').textContent, $('userRole') && !$('userRole').hidden ? $('userRole').textContent : ''].filter(Boolean).join(' · '); }

  // ---- phone: one screen with every function as a tile --------------------------------------------------
  // The list-then-sub-list design is gone: all pages and tools are visible at once, grouped under headings, and one tap opens a page.
  Object.assign(ICONS, {
    refund: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    layby: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 11h16"/>',
    printer: '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    note: '<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13 7 4 4"/>',
    wrench: '<path d="M14 6a4 4 0 0 0 5 5l-8 8a2.8 2.8 0 0 1-4-4l8-8Z"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14h2"/>',
    truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    sliders: '<path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="9" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="19" cy="8" r="2"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 13l2 2 4-4"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h3l3 11h10l2-8H7"/>',
    tag: '<path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
    link: '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 8l3 3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 4v7h-7"/>',
    logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>'
  });
  var ICON_RULES = [
    [/dashboard|概览/, 'dashboard'], [/refund|退款/, 'refund'], [/layby|预订/, 'layby'], [/x ?\/ ?z|日结/, 'clock'],
    [/reprint|recentsales|receipt|till|draft bill|print|小票|打印|重打|重印|收据/, 'printer'], [/sales rep|salesrep|销售员|销售代表/, 'account'], [/note|备注/, 'note'],
    [/quotation|quote|报价/, 'quotation'], [/service|服务/, 'wrench'], [/customer payment|客户付款/, 'wallet'],
    [/product management|商品管理/, 'stock'], [/purchas|po &|采购/, 'cart'], [/transfer|调拨/, 'truck'], [/adjust|调整/, 'sliders'],
    [/stocktake|盘点/, 'clipboard'], [/price break|pricing|promotion|happy|阶梯|促销/, 'tag'], [/myob|xero|quickbooks|accounting/, 'link'],
    [/aging|账龄/, 'clock'], [/statement|对账/, 'quotation'], [/report|报表/, 'reports']
  ];
  function pickIcon(label, key) {
    var hay = (String(key || '') + ' ' + String(label || '')).toLowerCase();
    for (var i = 0; i < ICON_RULES.length; i++) if (ICON_RULES[i][0].test(hay)) return ICON_RULES[i][1];
    return 'more';
  }
  var accountRows = [
    { id: 'acct:install', label: 'Install SoftPOS', src: 'installSoftposBtn', icon: 'download' },
    { id: 'acct:password', label: 'Change password', src: 'changePasswordBtn', icon: 'key' },
    { id: 'acct:settings', label: 'System Setting', src: 'manageUsersLink', icon: 'gear' },
    { id: 'acct:language', label: 'Language', src: null, icon: 'globe' },
    { id: 'acct:reset', label: 'Reset demo data', src: null, icon: 'refresh' },
    { id: 'acct:logout', label: 'Log out', src: 'logoutBtn', icon: 'logout' }
  ];
  function tileHtml(t, tone) {
    return '<button type="button" class="dm-tile tone-' + tone + (t.disabled ? ' is-disabled' : '') + '" data-dm="' + esc(t.id) + '"' + (t.disabled ? ' aria-disabled="true"' : '') + ' data-find="' + esc(String(t.label).toLowerCase()) + '">' +
      '<span class="dm-ticon">' + icon(t.icon || pickIcon(t.label, t.id)) + '</span><span class="dm-tlabel">' + esc(t.label) + '</span></button>';
  }
  function sectionHtml(title, tiles, tone) {
    if (!tiles.length) return '';
    return '<section class="dm-sec">' + (title ? '<h3 class="dm-section">' + esc(title) + '</h3>' : '') + '<div class="dm-grid">' + tiles.map(function (t) { return tileHtml(t, tone); }).join('') + '</div></section>';
  }
  function renderMore() {
    var menu = readMenu(), sub = userLine();
    var by = { top: [], sales: [], stock: [], expense: [], reports: [] };
    menu.forEach(function (x) {
      if (x.type === 'leaf') {
        if (x.key === 'sales:retailSalesTab') return; // the bottom bar already has it
        var sec = x.group ? x.group.key : (x.key === 'dashboardView' ? 'reports' : 'sales');
        var tile = { id: 'leaf:' + x.key, label: x.detail || x.label, icon: x.key === 'dashboardView' ? 'dashboard' : null };
        if (x.key === 'dashboardView') by[sec].unshift(tile); else by[sec].push(tile);
      } else {
        x.items.forEach(function (i) {
          if (i.key === 'sales:retailSalesTab') return;
          by[x.key].push({ id: 'item:' + i.key, label: i.label, disabled: i.disabled });
        });
      }
    });
    var tools = readSalesActions().map(function (a) { return { id: a.key, label: a.label, disabled: a.disabled }; });
    var account = [];
    accountRows.forEach(function (a) {
      var el = a.src ? $(a.src) : null;
      if (a.src && (!el || el.hidden)) return;
      var label = el && text(el) ? text(el) : tt(a.label);
      if (a.id === 'acct:language') label = tt('Language') + ': ' + (isZh() ? '简体中文' : 'English');
      account.push({ id: a.id, label: label, icon: a.icon });
    });
    var html = '<header class="dm-head"><div class="dm-titles"><h2 id="dmTitle" tabindex="-1">' + esc(tt('More')) + '</h2>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div></header>' +
      '<div class="dm-body"><label class="dm-search"><input type="search" id="dmSearch" autocomplete="off" placeholder="' + esc(tt('Find a function')) + '" aria-label="' + esc(tt('Find a function')) + '"></label>' +
      sectionHtml(tt('Sales'), by.sales, 'sales') + sectionHtml(tt('Sales tools'), tools, 'tools') + sectionHtml(tt('Stock'), by.stock, 'stock') +
      sectionHtml(tt('Expense'), by.expense, 'expense') + sectionHtml(tt('Reports'), by.reports, 'reports') + sectionHtml(isZh() ? '账户' : 'Account', account, 'account') +
      '<p class="dm-empty" hidden>' + esc(tt('Nothing matches')) + '</p></div>';
    more.innerHTML = html;
    more.scrollTop = 0;
  }
  more.addEventListener('input', function (event) {
    if (event.target.id !== 'dmSearch') return;
    var q = event.target.value.trim().toLowerCase(), any = false;
    qa('.dm-tile', more).forEach(function (t) { var hit = !q || t.dataset.find.indexOf(q) >= 0; t.hidden = !hit; if (hit) any = true; });
    qa('.dm-sec', more).forEach(function (sec) { sec.hidden = !qa('.dm-tile:not([hidden])', sec).length; });
    var empty = more.querySelector('.dm-empty'); if (empty) empty.hidden = any;
  });
  function showMoreUI() {
    more.hidden = !m.open;
    pageBar.hidden = !m.page || m.open;
    document.body.classList.toggle('demo-more-open', m.open);
    document.body.classList.toggle('demo-more-page', !!m.page && !m.open);
    if (m.open) renderMore();
    if (typeof syncMobileUI === 'function') syncMobileUI();
  }
  function renderPageBar() {
    if (!m.page) { pageBar.innerHTML = ''; return; }
    pageBar.innerHTML = '<button type="button" class="dpb-back" data-dm="pagebar-back"><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="m10 3-5 5 5 5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span>' +
      esc(m.page.back) + '</span></button><strong>' + esc(m.page.title) + '</strong>';
  }
  function openMore() {
    if (m.open) return;
    m.open = true; m.stack = ['root']; m.page = null;
    pushHistory();
    showMoreUI();
  }
  function leaveMore() {
    var d = depth;
    m.open = false; m.page = null; m.stack = ['root']; depth = 0;
    more.hidden = true; pageBar.hidden = true;
    document.body.classList.remove('demo-more-open', 'demo-more-page');
    if (d > 0) { ignorePop = true; try { history.go(-d); } catch (e) { ignorePop = false; } }
  }
  function backToSale() { leaveMore(); if (typeof setMobilePage === 'function') setMobilePage('sale'); }
  function openPage(item, backLabel) {
    // Actions such as Refund or Print till work on the sale screen, so they leave More and use their own dialog.
    if (item.type === 'action') { backToSale(); item.source.click(); return; }
    if (item.key === 'sales:retailSalesTab') { backToSale(); return; }
    m.open = false;
    m.page = { key: item.key, title: item.detail || item.label, back: backLabel };
    pushHistory();
    renderPageBar();
    item.source.click();
    showMoreUI();
  }

  more.addEventListener('click', function (event) {
    var b = event.target.closest('[data-dm]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    var id = b.dataset.dm, menu = readMenu(), found = null, isAction = false;
    if (id.indexOf('leaf:') === 0) menu.forEach(function (x) { if (x.type === 'leaf' && 'leaf:' + x.key === id) found = x; });
    else if (id.indexOf('item:') === 0) menu.forEach(function (x) { if (x.type === 'group') x.items.forEach(function (i) { if ('item:' + i.key === id) found = i; }); });
    else if (id.indexOf('act:') === 0) { readSalesActions().forEach(function (a) { if (a.key === id) { found = a; isAction = true; } }); }
    else if (id.indexOf('acct:') === 0) { accountAction(id); return; }
    if (!found) return;
    if (!isAction) setActive(found);
    openPage(found, tt('More'));
  });
  function accountAction(id) {
    var map = { 'acct:install': 'installSoftposBtn', 'acct:password': 'changePasswordBtn', 'acct:logout': 'logoutBtn' };
    if (id === 'acct:settings') { leaveMore(); openAdmin(); return; }
    if (id === 'acct:language') { SoftPOSLanguage.setLanguage(isZh() ? 'en' : 'zh-CN'); return; }
    if (id === 'acct:reset') { resetDemo(); return; }
    var el = $(map[id]);
    if (!el) return;
    leaveMore();
    el.click();
  }
  pageBar.addEventListener('click', function (event) {
    if (event.target.closest('[data-dm="pagebar-back"]')) history.back();
  });

  window.addEventListener('popstate', function (event) {
    if (!phoneQuery.matches) return;
    if (ignorePop) { ignorePop = false; return; }
    var s = event.state && event.state.demoMore;
    if (!s) {
      var wasOpen = m.open || m.page;
      m.open = false; m.page = null; m.stack = ['root']; depth = 0;
      more.hidden = true; pageBar.hidden = true;
      document.body.classList.remove('demo-more-open', 'demo-more-page');
      if (wasOpen && typeof setMobilePage === 'function') setMobilePage('sale');
      return;
    }
    m.open = s.open; m.stack = s.stack.slice(); m.page = s.page;
    depth = Math.max(0, depth - 1);
    renderPageBar();
    showMoreUI();
  });
  // The bottom bar's More tab and the avatar open the new screen instead of the old pop-up.
  document.addEventListener('click', function (event) {
    if (!phoneQuery.matches) return;
    if (event.target.closest('#mobileMoreBtn, #mobileProfileBtn')) {
      event.stopImmediatePropagation(); event.preventDefault();
      if (m.open) return;
      if (m.page) { m.page = null; m.open = true; m.stack = ['root']; showMoreUI(); return; }
      openMore();
    }
  }, true);
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href^="#demo-"]');
    if (!link) return;
    event.preventDefault();
    var target = link.getAttribute('href');
    if (target === '#demo-admin') openAdmin();
    else if (target === '#demo-back') closeAdmin();
    else toastMessage('Softnet master is the vendor\'s own console and is not part of this demo.');
  });

  // Keep the old code's own state in step.
  var baseActivate = typeof activateTab === 'function' ? activateTab : null;
  if (baseActivate) {
    activateTab = function (id) {
      baseActivate(id);
      if (id === 'orderView') { activeKey = 'sales:retailSalesTab'; crumbParts = []; if (!phoneQuery.matches) renderSidebar(); }
    };
  }
  var baseSetPage = typeof setMobilePage === 'function' ? setMobilePage : null;
  if (baseSetPage) {
    setMobilePage = function (page) {
      if (m.open || m.page) leaveMore();
      baseSetPage(page);
    };
  }
  var baseSync = typeof syncMobileUI === 'function' ? syncMobileUI : null;
  if (baseSync) {
    syncMobileUI = function () {
      baseSync();
      if (m.open || m.page) {
        $('mobileMoreBtn').setAttribute('aria-current', 'page');
        $('mobileSaleBtn').setAttribute('aria-current', 'false');
        $('mobileCartBtn').setAttribute('aria-current', 'false');
      }
    };
  }
  var baseAccess = typeof applyModuleAccess === 'function' ? applyModuleAccess : null;
  if (baseAccess) {
    applyModuleAccess = function (options) { baseAccess(options); schedule(); };
  }
  var baseLogin = typeof showLogin === 'function' ? showLogin : null;
  if (baseLogin) showLogin = function () { if (m.open || m.page) leaveMore(); baseLogin(); };

  // ---- System Setting opens inside the demo --------------------------------------------
  var adminWrites = 0;
  function openAdmin() {
    var view = $('demoAdminView');
    if (!view) return;
    if (m.open || m.page) leaveMore();
    adminWrites = window.DemoApi ? DemoApi.writes : 0;
    view.hidden = false;
    view.scrollTop = 0;
    document.body.classList.add('demo-admin-open');
    if (typeof showSettingsTab === 'function') showSettingsTab('company');
    if (typeof initializeAdmin === 'function') initializeAdmin();
  }
  function closeAdmin() {
    var view = $('demoAdminView');
    if (!view || view.hidden) return;
    view.hidden = true;
    document.body.classList.remove('demo-admin-open');
    // Settings such as payment types and permissions are read when the POS starts, as in the real system.
    if (window.DemoApi && DemoApi.writes !== adminWrites) location.reload();
  }
  function resetDemo() {
    if (!window.confirm(tt('Reset the sample data and reload? Carts, held sales and anything you entered will be lost.'))) return;
    try { localStorage.removeItem('softpos.offline.logged-out'); } catch (e) { /* ignore */ }
    DemoApi.reset();
    location.reload();
  }
  document.addEventListener('keydown', function (event) {
    var view = $('demoAdminView');
    if (event.key === 'Escape' && view && !view.hidden && !document.querySelector('dialog[open]')) closeAdmin();
  });

  // ---- cashier mode: a role that only sells sees the order screen and nothing else -----------------------
  // The permissions already hide every page a cashier may not use. When nothing is left except selling, the sidebar is pointless, so it goes
  // and the remaining sales pages move into the sales tools menu next to Refund and Layby.
  function cashierMode() {
    var menu = readMenu(), admin = $('manageUsersLink');
    if (!menu.length || (admin && !admin.hidden)) return false;
    return menu.every(function (x) {
      if (x.type === 'leaf') return x.key !== 'dashboardView' && (!x.group || x.group.key === 'sales');
      return x.key === 'sales';
    });
  }
  function salesPages() {
    var pages = [];
    readMenu().forEach(function (x) {
      if (x.type === 'leaf') { if (x.key !== 'sales:retailSalesTab') pages.push(x); }
      else x.items.forEach(function (i) { if (i.key !== 'sales:retailSalesTab') pages.push(i); });
    });
    return pages;
  }
  function applyCashierMode() {
    var app = $('appScreen'), box = $('salesMoreActions');
    if (!app) return;
    var on = cashierMode();
    app.classList.toggle('ds-cashier', on);
    if (!box) return;
    qa('[data-demo-tool]', box).forEach(function (b) { b.remove(); });
    if (!on) return;
    salesPages().reverse().forEach(function (page) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.demoTool = page.key; b.disabled = !!page.disabled;
      b.textContent = page.detail || page.label;
      box.insertBefore(b, box.firstChild);
    });
  }
  document.addEventListener('click', function (event) {
    var b = event.target.closest('[data-demo-tool]');
    if (!b) return;
    var page = findItem(b.dataset.demoTool), dialog = b.closest('dialog');
    if (dialog && dialog.open) dialog.close();
    if (page) { setActive(page); page.source.click(); renderSidebar(); }
  });

  window.DemoNav = { readMenu: readMenu, readSalesActions: readSalesActions, openItem: function (item) { setActive(item); item.source.click(); renderSidebar(); } };

  // ---- wiring -------------------------------------------------------------------
  var timer = 0;
  function schedule() { clearTimeout(timer); timer = setTimeout(function () { mountDesktop(); applyCashierMode(); renderSidebar(); if (m.open) renderMore(); }, 30); }

  function badge() {
    var heading = $('companyName');
    if (!heading || document.querySelector('.demo-badge')) return;
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'demo-badge';
    chip.setAttribute('data-i18n', '');
    chip.title = tt('Reset demo data');
    chip.textContent = 'Navigation demo · sample data';
    chip.addEventListener('click', resetDemo);
    heading.parentNode.appendChild(chip);
    if (window.SoftPOSLanguage) SoftPOSLanguage.setLanguage(SoftPOSLanguage.language, false);
  }
  function init() {
    document.body.appendChild(more);
    // After a reload the page starts closed, so forget any More screen the old state described.
    try { if (history.state && history.state.demoMore) history.replaceState(null, ''); } catch (e) { /* ignore */ }
    badge();
    mountDesktop();
    renderSidebar();
    new MutationObserver(schedule).observe($('appScreen'), { subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
    window.addEventListener('resize', function () { placeSidebar(); if (!phoneQuery.matches && (m.open || m.page)) leaveMore(); });
    tabletQuery.addEventListener('change', schedule);
    document.addEventListener('softpos:languagechange', function () {
      side.setAttribute('aria-label', tt('SoftPOS modules'));
      more.setAttribute('aria-label', tt('More'));
      var chip = document.querySelector('.demo-badge');
      if (chip) chip.title = tt('Reset demo data');
      schedule();
    });
    phoneQuery.addEventListener('change', schedule);
    // Page content may change the order of the bar: keep the bar above the page.
    document.body.insertBefore(pageBar, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
