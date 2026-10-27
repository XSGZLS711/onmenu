// Roles and access page (backoffice-design-spec 4.5): a list of roles, and a drawer with the permissions in groups.
// Built on DemoBO.list and DemoBO.drawer from demo-bo-products.js. Chinese text is in i18n-roles.js.
(function () {
  'use strict';
  var B = window.DemoBO, doc = document;
  if (!B || !window.DemoPages) return;
  var el = B.el, T = B.T, icon = B.icon, call = B.call, U = B.util, clear = U.clear;
  var roles = { list: null, built: null }, VIEW = 'boRolesView', seq = 0;

  function uid(p) { seq += 1; return (p || 'bo-r') + seq; }
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

  // ---- the list ------------------------------------------------------------------------------
  function accessCell(r) {
    var pct = r.total ? Math.round(100 * r.allowed / r.total) : 0;
    return el('span', { class: 'bo-rl-access', title: T('{a} of {b} permissions allowed', { a: r.allowed, b: r.total }) }, [
      el('span', { class: 'bo-rl-bar', 'aria-hidden': 'true' }, [el('i', { style: 'width:' + pct + '%' })]),
      el('span', { text: T('{a} of {b}', { a: r.allowed, b: r.total }) })
    ]);
  }
  function columns() {
    return [
      { key: 'name', label: 'Role', fixed: true, render: function (r) { return el('button', { type: 'button', class: 'bo-link bo-name', text: r.name, onclick: function (e) { editRole(r, e.currentTarget); } }); } },
      { key: 'type', label: 'Type', render: function (r) { return T(r.fixed ? 'Administrator' : 'Standard'); } },
      { key: 'shops', label: 'Shop access', render: function (r) { return T(r.allShops ? 'All shops' : 'Own shop'); } },
      { key: 'users', label: 'Users', align: 'right', render: function (r) { return r.users ? String(r.users) : el('span', { class: 'bo-muted', text: '0' }); } },
      { key: 'access', label: 'Access', render: accessCell },
      { key: 'approval', label: 'Needs approval', align: 'right', render: function (r) { return r.approval ? String(r.approval) : null; } }
    ];
  }
  function totalsText(t) {
    return [U.plural(t.count, '{n} role', '{n} roles'), U.plural(t.users, '{n} user', '{n} users')].join(' · ');
  }
  function buildList(view) {
    roles.list = B.list({
      key: 'roles', host: view, title: 'Roles and access', help: 'What each role can do. Select Edit on a row to change it.',
      endpoint: '/api/bo/roles', exportUrl: '/api/bo/roles/export', rowId: 'name', searchLabel: 'Search roles', searchPlaceholder: 'Role name',
      defaults: { sort: 'name', pageSize: 50 },
      columns: columns(),
      buttons: [{ key: 'export', label: 'Export CSV', run: function (l) { B.download(l.exportUrl(), 'roles.csv').catch(function (e) { U.notify(e.message, true); }); } }],
      filters: [{ key: 'users', label: 'Users', all: 'All roles', tr: true, options: [['with', 'With users'], ['none', 'Without users']] }],
      rowActions: function () { return [{ key: 'edit', label: 'Edit', name: function (x) { return x.name; }, run: function (row, btn) { editRole(row, btn); } }]; },
      totalsText: totalsText,
      empty: { none: 'No roles yet.', text: 'No roles match these filters.' }
    });
    view.classList.add('bo-roles-page');
    return roles.list;
  }

  // ---- the drawer: permissions in groups -----------------------------------------------------
  var MODE_LABEL = { deny: 'Not allowed', approval: 'Needs approval', allow: 'No approval needed' };

  function matrix(d) {
    return function (values) {
      var root = el('div', { class: 'bo-rm' }), summary = el('p', { class: 'bo-rm-summary', role: 'status' }), warn = el('ul', { class: 'bo-rm-warn' });
      var labels = {}, groups = [], tips = [];
      d.groups.forEach(function (g) { g.items.forEach(function (i) { labels[i.key] = i.label; }); });

      function closeTips(except) { tips.forEach(function (t) { if (t.tip !== except) { t.tip.hidden = true; t.btn.setAttribute('aria-expanded', 'false'); } }); }
      function helpButton(i) {
        if (!i.help) return [null, null];
        var tip = el('div', { class: 'bo-rm-tip', role: 'note', hidden: true, text: T(i.help) });
        var btn = el('button', { type: 'button', class: 'bo-rm-q', 'aria-expanded': 'false', 'aria-label': T('About {name}', { name: T(i.label) }), title: T('About {name}', { name: T(i.label) }), onclick: function (e) {
          e.stopPropagation();
          closeTips(tip);
          tip.hidden = !tip.hidden; btn.setAttribute('aria-expanded', tip.hidden ? 'false' : 'true');
        } }, ['?']);
        tips.push({ tip: tip, btn: btn });
        return [btn, tip];
      }

      function groupNode(g) {
        var plain = g.items.filter(function (i) { return !i.level; }), withLevels = g.items.filter(function (i) { return i.level; });
        var box = el('fieldset', { class: 'bo-rm-group' }), count = el('span', { class: 'bo-rm-count' }), all = null, boxes = [];
        if (plain.length > 1) {
          all = el('input', { type: 'checkbox', class: 'bo-rm-all', 'aria-label': T('Select all in {group}', { group: T(g.name) }), disabled: d.fixed, onchange: function () {
            plain.forEach(function (i) { values.checks[i.key] = all.checked; });
            boxes.forEach(function (b) { b.cb.checked = all.checked; });
            update();
          } });
        }
        box.appendChild(el('legend', { class: 'bo-rm-legend' }, [all, el('span', { class: 'bo-rm-gname', text: T(g.name) }), count]));
        if (g.help) box.appendChild(el('p', { class: 'bo-help', text: T(g.help) }));
        var grid = el('div', { class: 'bo-rm-grid' });
        plain.forEach(function (i) {
          var id = uid('bo-rmc'), cb = el('input', { type: 'checkbox', id: id, disabled: d.fixed, onchange: function () { values.checks[i.key] = cb.checked; update(); } }), hb = helpButton(i);
          cb.checked = !!values.checks[i.key];
          boxes.push({ cb: cb, key: i.key });
          grid.appendChild(el('div', { class: 'bo-rm-item' }, [el('label', { class: 'bo-rm-lab', for: id }, [cb, el('span', { text: T(i.label) })]), hb[0], hb[1]]));
        });
        box.appendChild(grid);
        withLevels.forEach(function (i) {
          var id = uid('bo-rml'), sel = el('select', { id: id, class: 'bo-input bo-rm-sel', disabled: d.fixed, onchange: function () { values.levels[i.key] = sel.value; update(); } }), hb = helpButton(i);
          ['deny', 'approval', 'allow'].forEach(function (m) { sel.appendChild(el('option', { value: m, text: T(MODE_LABEL[m]) })); });
          sel.value = values.levels[i.key] || 'deny';
          box.appendChild(el('div', { class: 'bo-rm-level' }, [el('label', { for: id, text: T(i.label) }), hb[0], hb[1], sel]));
        });
        groups.push({ g: g, plain: plain, all: all, count: count, boxes: boxes });
        return box;
      }

      function update() {
        var on = 0, total = 0;
        groups.forEach(function (x) {
          var n = x.plain.filter(function (i) { return values.checks[i.key]; }).length;
          on += n; total += x.plain.length;
          if (x.plain.length) x.count.textContent = n + ' / ' + x.plain.length;
          if (x.all) { x.all.checked = n === x.plain.length; x.all.indeterminate = n > 0 && n < x.plain.length; }
        });
        var approvals = Object.keys(values.levels).filter(function (k) { return values.levels[k] === 'approval'; }).length;
        summary.textContent = T('{a} of {b} permissions allowed', { a: on, b: total }) + (approvals ? ' · ' + U.plural(approvals, '{n} action needs approval', '{n} actions need approval') : '');
        clear(warn);
        (d.depends || []).forEach(function (p) {
          if (values.checks[p[0]] && !values.checks[p[1]]) warn.appendChild(el('li', null, [icon('warn', 14), el('span', { text: T('{a} needs {b}, which is not allowed.', { a: T(labels[p[0]]), b: T(labels[p[1]]) }) })]));
        });
        warn.hidden = !warn.firstChild;
      }

      if (values.copiedFrom) root.appendChild(el('p', { class: 'bo-rm-copied', role: 'status' }, [T('Copied from {name}. Nothing is saved until you select Save.', { name: values.copiedFrom })]));
      root.appendChild(summary); root.appendChild(warn);
      d.groups.forEach(function (g) { root.appendChild(groupNode(g)); });
      update();
      doc.addEventListener('click', function close() { if (!root.isConnected) { doc.removeEventListener('click', close); return; } closeTips(null); });
      return { node: root, update: update };
    };
  }

  // "Copy access from" fills the matrix from another role; it is saved only with Save.
  function copyField(d) {
    return {
      type: 'custom', name: 'copyFrom', render: function (values, api) {
        var id = uid('bo-rmcp'), sel = el('select', { id: id, class: 'bo-input' }, [el('option', { value: '', text: T('Choose a role…') })]);
        d.others.forEach(function (n) { sel.appendChild(el('option', { value: n, text: T(n) })); });
        sel.addEventListener('change', function () {
          var from = sel.value;
          if (!from) return;
          call('GET', '/api/bo/roles/' + encodeURIComponent(from)).then(function (src) {
            Object.keys(src.checks).forEach(function (k) { values.checks[k] = src.checks[k]; });
            Object.keys(src.levels).forEach(function (k) { values.levels[k] = src.levels[k]; });
            values.copiedFrom = from;
            api.drawer.rerender();
          }, function (e) { U.notify(e.message, true); sel.value = ''; });
        });
        return { node: el('div', { class: 'bo-field bo-rm-copy' }, [el('label', { class: 'bo-flabel', for: id, text: T('Copy access from another role') }), sel]) };
      }
    };
  }

  function intro(d) {
    return function () {
      return el('div', { class: 'bo-rm-intro' }, [
        el('p', { text: T(d.allShops ? 'Can work in every shop.' : 'Works in the shop each person is assigned to.') }),
        el('p', { text: d.users.length ? T('Used by {names}.', { names: d.users.join(', ') }) : T('No users have this role.') }),
        d.fixed ? el('p', { class: 'bo-rm-fixed' }, [icon('warn', 14), el('span', { text: T('Administrators always keep full access. This cannot be changed.') })]) : null
      ]);
    };
  }

  function roleDrawer(d, opener) {
    var l = roles.list;
    l.setActive(d.name);
    var inst = B.drawer({
      title: 'Role access', subtitle: T(d.name), returnFocus: opener, saveLabel: d.fixed ? 'Close' : 'Save',
      values: { checks: d.checks, levels: d.levels, copiedFrom: '' },
      intro: intro(d),
      fields: (d.fixed ? [] : [copyField(d)]).concat([{ type: 'custom', name: 'matrix', render: matrix(d) }]),
      onSave: function (v) {
        if (d.fixed) return Promise.resolve({ name: d.name, unchanged: true });
        return call('PUT', '/api/bo/roles/' + encodeURIComponent(d.name), { checks: v.checks, levels: v.levels }).then(function (r) { U.notify(U.tmsg(r.message)); return r; });
      },
      onClose: function (saved, r) {
        l.setActive(null);
        if (saved && r && !r.unchanged) l.reload().then(function () { l.focusRow(d.name); });
      }
    });
    inst.el.classList.add('bo-drawer-wide');
    if (d.fixed) inst.el.classList.add('bo-roles-fixed');
    return inst;
  }
  function editRole(row, opener) {
    return call('GET', '/api/bo/roles/' + encodeURIComponent(row.name)).then(function (d) { roleDrawer(d, opener); }, function (e) { U.notify(e.message, true); });
  }

  // ---- the page ------------------------------------------------------------------------------
  var page = {
    open: function () {
      var v = ensureView(VIEW);
      showView(v);
      if (!roles.built) { roles.built = true; buildList(v); } else roles.list.reload();
      setTimeout(function () { if (roles.list) roles.list.resize(); }, 0);
    },
    close: function () { B.closeDrawers(); var v = doc.getElementById(VIEW); if (v) v.classList.remove('active-view'); }
  };
  window.DemoPages.register({ key: 'bo:roles', module: 'setup', label: ['Roles and access', '角色与权限'], open: page.open, close: page.close });

  // The old Role access tab inside System Setting edited the same data with a different screen; it now points to this page.
  function openFromSetting() {
    var item = null;
    if (window.DemoNav) window.DemoNav.readMenu().forEach(function (m) { (m.items || [m]).forEach(function (i) { if (i.key === 'bo:roles') item = i; }); });
    if (item) window.DemoNav.openItem(item); else window.DemoPages.open('bo:roles');
  }
  function patchSettingTab() {
    var panel = doc.getElementById('rolesPanel'), form = doc.getElementById('roleAccessForm');
    if (!panel || !form || panel.querySelector('.bo-roles-note')) return;
    form.hidden = true;
    var text = el('p'), btn = el('button', { type: 'button', class: 'bo-btn bo-btn-primary', onclick: openFromSetting });
    var note = el('div', { class: 'bo-roles-note bo-scope' }, [text, btn]);
    function words() { text.textContent = T('Role access has its own page now: a list of roles, with the permissions in groups.'); btn.textContent = T('Open Roles and access'); }
    words();
    doc.addEventListener('softpos:languagechange', words);
    form.parentNode.insertBefore(note, form);
  }
  patchSettingTab();
  doc.addEventListener('DOMContentLoaded', patchSettingTab);
})();
