// Demo back end, part 8: the Roles and access page (backoffice-design-spec 4.5).
// A role is a set of permission keys. The sale screen and the sidebar read them through Api.permissionsFor; this file lists them and edits them.
(function () {
  'use strict';
  var Api = window.DemoApi, route = Api.route, need = Api.need;

  // Four sales actions have three levels instead of on/off: "allow" keeps the key, "approval" keeps the key plus "Approval", "deny" keeps neither.
  var LEVELS = ['DeleteRows', 'CancelSales', 'ChangePrice', 'LaybyCancel'];
  var MODES = ['deny', 'approval', 'allow'];
  // The catalogue is sent to the page, so the groups, names and help texts live here once (the real system would serve the same list).
  // Groups follow the sidebar: sales, products and stock, purchasing, reports.
  var GROUPS = [
    { key: 'sales', name: 'Sales', help: 'What this role can do on the sale screen and with customers.', items: [
      { key: 'Sales', label: 'Sale screen' },
      { key: 'ServiceSales', label: 'Invoices' },
      { key: 'Quotation', label: 'Quotations', help: 'View and print quotations. Creating or converting a quotation also needs the sale screen.' },
      { key: 'Customers', label: 'Create customers' },
      { key: 'CustomerPayments', label: 'Customer payments' },
      { key: 'Refund', label: 'Refunds' },
      { key: 'Discounts', label: 'Apply discounts' },
      { key: 'Layby', label: 'Create layby' },
      { key: 'LaybyCollect', label: 'Collect layby' }
    ] },
    { key: 'actions', name: 'Sales actions and approvals', help: 'For each sensitive button, choose whether this role may use it freely, needs approval from a supervisor, or may not use it.', items: [
      { key: 'ApproveSales', label: 'Approve other people\'s actions', help: 'Lets this role approve a sales action for another person, with that person standing at the till.' },
      { key: 'DeleteRows', label: 'Delete sale lines', level: true },
      { key: 'CancelSales', label: 'Cancel or remove held sales', level: true },
      { key: 'ChangePrice', label: 'Change unit price', level: true },
      { key: 'LaybyCancel', label: 'Cancel layby or refund', level: true, help: 'Cancelling a layby gives the deposit back to the customer.' }
    ] },
    { key: 'stock', name: 'Products and stock', help: 'Keeping the product list and the stock counts.', items: [
      { key: 'Products', label: 'Manage products' },
      { key: 'Adjustment', label: 'Adjust stock' },
      { key: 'Stocktake', label: 'Stocktake and mobile counts' },
      { key: 'StocktakePost', label: 'Post stocktake', help: 'Posting a count changes the stock. It also needs Stocktake and mobile counts.', needs: 'Stocktake' },
      { key: 'Transfers', label: 'Transfers: dispatch' },
      { key: 'TransferReceive', label: 'Transfers: receive goods' },
      { key: 'BulkTransfer', label: 'Bulk transfer', help: 'Bulk transfer also needs Transfers: dispatch.', needs: 'Transfers' }
    ] },
    { key: 'purchasing', name: 'Purchasing', help: 'Buying from suppliers and receiving goods.', items: [
      { key: 'Suppliers', label: 'Create suppliers' },
      { key: 'PO', label: 'Create purchase orders' },
      { key: 'Receive', label: 'Receive a purchase order' },
      { key: 'ReceiveWithoutPO', label: 'Receive without a purchase order', help: 'Goods that arrive with no purchase order, for example a market purchase.' },
      { key: 'Purchases', label: 'Supplier purchase invoices' }
    ] },
    { key: 'reports', name: 'Reports and setup', help: '', items: [
      { key: 'Reports', label: 'Dashboard and reports', help: 'The dashboard, sales and stock reports, and the X and Z reports.' },
      { key: 'CustomerReports', label: 'Customer statements and aging' },
      { key: 'Pricing', label: 'Pricing and promotions', help: 'Price breaks, promotions and happy hour.' },
      { key: 'Integration', label: 'Accounting link', help: 'The MYOB, Xero and QuickBooks link.' }
    ] }
  ];

  function isAdmin() { var r = Api.user().role; return r === 'Admin' || r === 'SuperAdmin'; }
  function guard() { need(isAdmin(), 'Your account cannot manage company access.', 403); }
  function fixed(name) { return name === 'Admin' || name === 'SuperAdmin'; }
  function allShops(name) { return fixed(name) || name === 'Supervisor'; }
  function roleOf(name) { var r = Api.db.roles[name]; need(r, 'Role not found.', 404); return r; }
  function usersOf(name) { return Api.db.users.filter(function (u) { return u.role === name && u.active !== false; }); }
  function modules() { return Api.permissionKeys.filter(function (k) { return !/Approval$/.test(k); }); }

  // The catalogue plus anything the permission list has that the groups do not know, so a new permission is never hidden.
  function catalogue() {
    var used = {}, groups = GROUPS.map(function (g) {
      return { key: g.key, name: g.name, help: g.help, items: g.items.map(function (i) { used[i.key] = true; return Object.assign({}, i); }) };
    });
    var extra = modules().filter(function (k) { return !used[k]; });
    if (extra.length) groups.push({ key: 'other', name: 'Other access', help: '', items: extra.map(function (k) { return { key: k, label: k }; }) });
    return groups;
  }
  function checkKeys() {
    var keys = [];
    catalogue().forEach(function (g) { g.items.forEach(function (i) { if (!i.level) keys.push(i.key); }); });
    return keys;
  }
  function levelOf(role, k) {
    return role.permissions.indexOf(k) >= 0 ? 'allow' : role.permissions.indexOf(k + 'Approval') >= 0 ? 'approval' : 'deny';
  }

  function row(name) {
    var role = Api.db.roles[name], keys = checkKeys();
    return {
      name: name, fixed: fixed(name), allShops: allShops(name), users: usersOf(name).length,
      allowed: keys.filter(function (k) { return role.permissions.indexOf(k) >= 0; }).length, total: keys.length,
      approval: LEVELS.filter(function (k) { return levelOf(role, k) === 'approval'; }).length,
      denied: LEVELS.filter(function (k) { return levelOf(role, k) === 'deny'; }).length
    };
  }
  var SORTS = {
    name: function (r) { return r.name; }, type: function (r) { return r.fixed ? 0 : 1; }, shops: function (r) { return r.allShops ? 0 : 1; },
    users: function (r) { return r.users; }, access: function (r) { return r.allowed; }, approval: function (r) { return r.approval; }
  };
  function rows(q) {
    var f = Api.filtersOf(q), text = String(q.q || '').trim().toLowerCase();
    return Object.keys(Api.db.roles).map(row).filter(function (r) {
      if (text && r.name.toLowerCase().indexOf(text) < 0) return false;
      if (f.users === 'with' && !r.users) return false;
      if (f.users === 'none' && r.users) return false;
      return true;
    });
  }

  route('GET', '/api/bo/roles', function (ctx) {
    guard();
    return Api.listPage(ctx.q, rows(ctx.q), SORTS, function (all) {
      return { count: all.length, users: all.reduce(function (n, r) { return n + r.users; }, 0), administrators: all.filter(function (r) { return r.fixed; }).length };
    });
  });

  // One row per role, one column per permission: the whole matrix in a spreadsheet, for a review or a reconciliation.
  route('GET', '/api/bo/roles/export', function (ctx) {
    guard();
    var groups = catalogue(), items = [];
    groups.forEach(function (g) { g.items.forEach(function (i) { items.push(i); }); });
    var sorted = Api.sortRows(rows(ctx.q), ctx.q.sort, SORTS);
    var head = ['Role', 'Type', 'Shop access', 'Users'].concat(items.map(function (i) { return i.label; }));
    var MODE_TEXT = { allow: 'No approval needed', approval: 'Needs approval', deny: 'Not allowed' };
    var out = sorted.map(function (r) {
      var role = Api.db.roles[r.name];
      return [r.name, r.fixed ? 'Administrator' : 'Standard', r.allShops ? 'All shops' : 'Own shop', r.users].concat(items.map(function (i) {
        return i.level ? MODE_TEXT[levelOf(role, i.key)] : (role.permissions.indexOf(i.key) >= 0 ? 'Yes' : 'No');
      }));
    });
    return Api.csvResponse('roles.csv', Api.csvText(head, out));
  });

  route('GET', '/api/bo/roles/:name', function (ctx) {
    guard();
    var name = ctx.params.name, role = roleOf(name), full = fixed(name), groups = catalogue(), checks = {}, levels = {}, depends = [];
    groups.forEach(function (g) {
      g.items.forEach(function (i) {
        if (i.level) levels[i.key] = full ? 'allow' : levelOf(role, i.key);
        else checks[i.key] = full || role.permissions.indexOf(i.key) >= 0;
        if (i.needs) depends.push([i.key, i.needs]);
      });
    });
    return { name: name, fixed: full, allShops: allShops(name), users: usersOf(name).map(function (u) { return u.fullName || u.userName; }),
      others: Object.keys(Api.db.roles).filter(function (n) { return n !== name; }), groups: groups, checks: checks, levels: levels, depends: depends };
  });

  route('PUT', '/api/bo/roles/:name', function (ctx) {
    guard();
    var name = ctx.params.name, role = roleOf(name), b = ctx.body || {}, checks = b.checks || {}, levels = b.levels || {}, list = role.permissions, valid = checkKeys();
    need(!fixed(name), 'Administrator access cannot be changed.');
    Object.keys(checks).forEach(function (k) { need(valid.indexOf(k) >= 0, 'Unknown permission ' + k + '.'); });
    Object.keys(levels).forEach(function (k) { need(LEVELS.indexOf(k) >= 0 && MODES.indexOf(levels[k]) >= 0, 'Unknown setting ' + k + '.'); });
    function set(k, on) { var at = list.indexOf(k); if (on && at < 0) list.push(k); if (!on && at >= 0) list.splice(at, 1); }
    Object.keys(checks).forEach(function (k) { set(k, !!checks[k]); });
    Object.keys(levels).forEach(function (k) { set(k, levels[k] === 'allow'); set(k + 'Approval', levels[k] === 'approval'); });
    return { name: name, message: 'Role access saved. People signed in with this role see the change the next time they sign in or reload.' };
  });
})();
