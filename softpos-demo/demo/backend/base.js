// Demo back end, part 2: sample company, catalogue, people, sign-in and the lookups every page needs.
(function () {
  'use strict';
  var Api = window.DemoApi, route = Api.route, round2 = Api.round2, need = Api.need;

  var PERMISSION_KEYS = ['Stocktake', 'StocktakePost', 'Transfers', 'TransferReceive', 'BulkTransfer', 'Purchases', 'Pricing', 'CustomerReports', 'Integration',
    'Sales', 'Quotation', 'CustomerPayments', 'Layby', 'LaybyCollect', 'LaybyCancel', 'LaybyCancelApproval', 'Discounts', 'ServiceSales', 'Customers',
    'Suppliers', 'Products', 'PO', 'Receive', 'ReceiveWithoutPO', 'Adjustment', 'Refund', 'Reports', 'DeleteRows', 'CancelSales', 'ChangePrice',
    'ApproveSales', 'DeleteRowsApproval', 'CancelSalesApproval', 'ChangePriceApproval'];
  var CASHIER_PERMS = ['Sales', 'ServiceSales', 'Quotation', 'Customers', 'Discounts', 'Refund', 'DeleteRowsApproval', 'CancelSalesApproval', 'ChangePriceApproval', 'Layby', 'LaybyCollect', 'CustomerPayments'];
  var SUPERVISOR_PERMS = PERMISSION_KEYS.filter(function (k) { return ['Integration', 'Pricing'].indexOf(k) < 0; });

  // ---- seed ----------------------------------------------------------------------
  var CATEGORIES = [[1, 'Noodles', true], [2, 'Rice', true], [3, 'Dumplings', true], [4, 'Sides', true], [5, 'Soft Drinks', true], [6, 'Frozen', true], [7, 'General', true], [8, 'Raw Material', false]];
  // code, name, category, price, cost, stock item, opening stock (main shop), barcode
  var PRODUCTS = [
    ['N01', 'Beef noodle soup', 1, 16.8, 7.3, false, 0], ['N02', 'Chicken noodle soup', 1, 14.8, 6.1, false, 0], ['N03', 'Pork noodle soup', 1, 15.8, 6.6, false, 0],
    ['N04', 'Fried noodles with beef', 1, 15.8, 6.9, false, 0], ['N05', 'Fried noodles with egg', 1, 13.8, 5.4, false, 0], ['N06', 'Cold sesame noodles', 1, 14.8, 5.8, false, 0],
    ['R01', 'Egg fried rice', 2, 9.8, 3.6, false, 0], ['R02', 'Chicken fried rice', 2, 12.8, 5.2, false, 0], ['R03', 'Beef stir fry with rice', 2, 14.8, 6.4, false, 0],
    ['R04', 'Steamed rice', 2, 3.0, 0.8, false, 0], ['D01', 'Pork dumplings (cooked)', 3, 13.8, 5.5, false, 0], ['D02', 'Chicken dumplings (cooked)', 3, 13.8, 5.4, false, 0],
    ['D03', 'Vegetable dumplings (cooked)', 3, 12.8, 4.7, false, 0], ['S01', 'Spring rolls', 4, 6.5, 2.4, false, 0], ['S02', 'Pickled cucumber', 4, 5.0, 1.5, false, 0],
    ['S03', 'Fried egg', 4, 2.5, 0.8, false, 0], ['B01', 'Cola 600 ml', 5, 3.5, 1.9, true, 48, '9300000000011'], ['B02', 'Lemon soda 600 ml', 5, 3.5, 1.9, true, 36, '9300000000028'],
    ['B03', 'Mineral water 1 L', 5, 2.5, 1.1, true, 60, '9300000000035'], ['B04', 'Iced tea', 5, 4.0, 1.7, true, 24, '9300000000042'],
    ['F01', 'Pork dumplings (frozen, 25)', 6, 9.95, 6.2, true, 60, '9300000000059'], ['F02', 'Chicken dumplings (frozen, 25)', 6, 9.95, 6.1, true, 50, '9300000000066'],
    ['G01', 'Takeaway box', 7, 0.5, 0.2, true, 400], ['G02', 'Takeaway bag', 7, 0.3, 0.1, true, 350],
    ['M01', 'Noodle (kg)', 8, 0, 4.5, true, 60], ['M02', 'Beef (kg)', 8, 0, 18, true, 25], ['M03', 'Chicken (kg)', 8, 0, 9.5, true, 30], ['M04', 'Pork (kg)', 8, 0, 11, true, 28],
    ['M05', 'Rice (kg)', 8, 0, 2.2, true, 90], ['M06', 'Eggs (each)', 8, 0, 0.55, true, 240], ['M07', 'Cooking oil (L)', 8, 0, 5.8, true, 20], ['M08', 'Flour (kg)', 8, 0, 1.9, true, 70]
  ];
  // Specification text and the smaller unit a product can also be counted in (code -> [unit id, how many of it make one main unit]).
  var SPECS = { N01: 'One bowl', N02: 'One bowl', N03: 'One bowl', N04: 'One plate', N05: 'One plate', N06: 'One bowl', R01: 'One plate', R02: 'One plate', R03: 'One plate', R04: 'One bowl', D01: '8 pieces', D02: '8 pieces', D03: '8 pieces',
    S01: '4 rolls', S02: 'Small dish', S03: 'One egg', B01: '600 ml', B02: '600 ml', B03: '1 L', B04: '500 ml', F01: '25 per pack', F02: '25 per pack', G01: 'Takeaway', G02: 'Takeaway',
    M01: 'Fresh, per kg', M02: 'Chilled, per kg', M03: 'Chilled, per kg', M04: 'Chilled, per kg', M05: 'Per kg', M06: 'Per egg', M07: 'Per litre', M08: 'Per kg' };
  var SUBUNITS = { M01: [3, 1000], M02: [3, 1000], M03: [3, 1000], M04: [3, 1000], M05: [3, 1000], M07: [5, 1000], M08: [3, 1000] };
  // finished dish code -> list of [raw material code, quantity per portion in the material's own unit]
  var RECIPES = {
    N01: [['M01', 0.25], ['M02', 0.12]], N02: [['M01', 0.25], ['M03', 0.12]], N03: [['M01', 0.25], ['M04', 0.12]], N04: [['M01', 0.25], ['M02', 0.1], ['M07', 0.02]],
    N05: [['M01', 0.25], ['M06', 1], ['M07', 0.02]], R01: [['M05', 0.2], ['M06', 1], ['M07', 0.02]], R02: [['M05', 0.2], ['M03', 0.1], ['M06', 1]], R03: [['M05', 0.2], ['M02', 0.12]],
    D01: [['M08', 0.12], ['M04', 0.1]]
  };

  Api.module({
    seed: function (db) {
      db.company = { name: 'Sample Noodle House', tin: '00-000000-0-0', address: '1 Sample Street, Suva', phone: '+679 000 0000', email: 'hello@example.com', vat: 12.5, ccFee: 2.5, ecal: 0, pbl: 0, logoNote: '' };
      db.license = { company: 'Sample Noodle House Pte Limited', seats: 5, signedIn: 2, ends: Api.futureDate(60) };
      db.shops = [{ shopId: 1, shopName: 'Main Shop', locationId: 1, division: 'GENERAL', active: true }, { shopId: 2, shopName: 'Second Shop', locationId: 2, division: 'GENERAL', active: true }];
      db.categories = CATEGORIES.map(function (c) { return { id: c[0], code: 'CAT' + Api.pad(c[0], 3), name: c[1], displayOnSales: c[2], departmentId: c[0] === 8 ? 2 : 1, description: '', excludeQuantity: false, active: true }; });
      db.departments = [{ id: 1, code: 'DEP001', name: 'General', active: true }, { id: 2, code: 'DEP002', name: 'Kitchen', active: true }];
      db.measurements = ['EACH', 'KG', 'G', 'L', 'ML', 'BOX', 'BAG', 'BOTTLE', 'CAN', 'PORTION', 'PACK', 'DOZEN', 'METRE', 'HOUR', 'SET', 'PAIR'].map(function (n, i) { return { id: i + 1, name: n }; });
      db.brands = [{ id: 1, name: 'None' }]; db.colours = [{ id: 1, name: 'None' }]; db.sizes = [{ id: 1, name: 'None' }];
      db.suppliers = [{ id: 1, name: 'General Supplier', phone: '', email: '', address: '', tin: '', active: true }, { id: 2, name: 'Fresh Produce Co', phone: '', email: '', address: '', tin: '', active: true }, { id: 3, name: 'Packaging Traders', phone: '', email: '', address: '', tin: '', active: true }];
      db.adjustments = [{ id: 1, name: 'Damaged' }, { id: 2, name: 'Expired' }, { id: 3, name: 'Found' }, { id: 4, name: 'Count correction' }];
      db.banks = [{ id: 1, name: 'Sample Bank A' }, { id: 2, name: 'Sample Bank B' }, { id: 3, name: 'Sample Bank C' }];
      db.users = [
        { id: 'u1', userName: 'demo.admin', email: 'admin@example.com', fullName: 'Demo Admin', role: 'Admin', shopId: 1, active: true, operator: 'Demo Admin' },
        { id: 'u2', userName: 'demo.cashier', email: 'cashier@example.com', fullName: 'Demo Cashier', role: 'Cashier', shopId: 1, active: true, operator: 'Demo Cashier' },
        { id: 'u3', userName: 'demo.supervisor', email: 'supervisor@example.com', fullName: 'Demo Supervisor', role: 'Supervisor', shopId: 1, active: true, operator: 'Demo Supervisor' },
        { id: 'u4', userName: 'demo.counter', email: '', fullName: 'Counter Staff', role: 'Cashier', shopId: 1, active: true, operator: 'Counter Staff' }
      ];
      db.invitations = []; db.favourites = {};
      db.companyProfile = { mobile: '', fax: '', website: '', physical: ['1 Sample Street', 'Suva', '', ''], postal: ['PO Box 100', 'Suva', '', ''] };
      db.documentOptions = {}; db.companyLogo = '';
      db.roles = {};
      ['Admin', 'SuperAdmin', 'Supervisor', 'Cashier', 'Guest', 'Operations', 'Product Manager', 'Stock Controller'].forEach(function (r) {
        var granted = r === 'Admin' || r === 'SuperAdmin' ? PERMISSION_KEYS : r === 'Supervisor' ? SUPERVISOR_PERMS : r === 'Cashier' ? CASHIER_PERMS : r === 'Guest' ? [] :
          r === 'Operations' ? ['Sales', 'Reports', 'Adjustment', 'PO', 'Receive'] : r === 'Product Manager' ? ['Products', 'Suppliers', 'Pricing'] : ['Adjustment', 'Stocktake', 'StocktakePost', 'Transfers', 'TransferReceive', 'BulkTransfer'];
        db.roles[r] = { permissions: granted.slice(), approvals: {} };
      });
      db.salesOptions = {
        defaults: { draftBillEnabled: true, salesRepEnabled: true, productComponentsEnabled: true, barcodeScanningEnabled: false, priceKeypadEnabled: false, showProductCode: true,
          serviceDescriptionsEnabled: true, discountsEnabled: true, holdSalesEnabled: true, receiptPaperWidthMm: 80, enabledPaymentMethods: ['CASH', 'MPAISA', 'MYCASH', 'EFTPOS', 'CARD'] },
        shops: {}
      };
      db.customers = [
        { customerId: 1, customerNo: 'C0001', name: 'Island Catering Ltd', phone: '+679 000 1111', email: 'accounts@example.com', tin: '11-111111-1-1', address: '5 Harbour Road, Suva', accountEnabled: true, active: true },
        { customerId: 2, customerNo: 'C0002', name: 'Aroha Traders', phone: '+679 000 2222', email: 'orders@example.com', tin: '', address: 'Nadi', accountEnabled: true, active: true },
        { customerId: 3, customerNo: 'C0003', name: 'Sample School Canteen', phone: '+679 000 3333', email: '', tin: '', address: 'Lautoka', accountEnabled: false, active: true },
        { customerId: 4, customerNo: 'C0004', name: 'Walk-in Regular', phone: '', email: '', tin: '', address: '', accountEnabled: false }
      ];
      db.salesReps = [{ id: 1, name: 'Demo Admin', active: true, assignedShopId: 1 }, { id: 2, name: 'Demo Cashier', active: true, assignedShopId: 1 }];
      db.products = []; db.stock = { 1: {}, 2: {} }; db.recipes = {};
      PRODUCTS.forEach(function (p, i) {
        var id = i + 1;
        db.products.push({ productId: id, code: p[0], name: p[1], description: '', categoryId: p[2], departmentId: p[2] === 8 ? 2 : 1, measurementId: p[0].charAt(0) === 'M' ? (/\(kg\)/.test(p[1]) ? 2 : /\(L\)/.test(p[1]) ? 4 : 1) : 1,
          price: p[3], cost: p[4], vat: p[2] !== 8, stockItem: !!p[5], supplierId: p[2] === 8 ? 2 : p[2] === 7 ? 3 : 1, active: true, weightItem: false, barcode: p[7] || '', imageUrl: '', menuNo: i < 20 ? i + 1 : null,
          spec: SPECS[p[0]] || '', subMeasurementId: SUBUNITS[p[0]] ? SUBUNITS[p[0]][0] : null, subRatio: SUBUNITS[p[0]] ? SUBUNITS[p[0]][1] : null });
        db.stock[1][id] = p[6] || 0;
        db.stock[2][id] = p[6] ? Math.round(p[6] * 0.4) : 0;
      });
      Object.keys(RECIPES).forEach(function (code) {
        var dish = db.products.filter(function (p) { return p.code === code; })[0];
        db.recipes[dish.productId] = RECIPES[code].map(function (r) { var m = db.products.filter(function (p) { return p.code === r[0]; })[0]; return { materialId: m.productId, quantity: r[1], active: true }; });
      });
      db.movements = [];
      db.session = { userId: 'u1' };
    },
    // A database saved by an earlier version has no specification or sub unit: fill them in once.
    migrate: function (db) {
      db.products.forEach(function (p) {
        if (p.spec === undefined) p.spec = SPECS[p.code] || '';
        if (p.subMeasurementId === undefined) { p.subMeasurementId = SUBUNITS[p.code] ? SUBUNITS[p.code][0] : null; p.subRatio = SUBUNITS[p.code] ? SUBUNITS[p.code][1] : null; }
      });
    }
  });

  // ---- helpers other modules use ----------------------------------------------------
  Api.futureDate = function (days) { return new Date(Date.now() + days * 864e5).toISOString().slice(0, 10).replace(/-/g, '/'); };
  Api.today = function () { return new Date().toISOString().slice(0, 10); };
  Api.product = function (id) { return Api.db.products.filter(function (p) { return p.productId === Number(id); })[0]; };
  Api.productByCode = function (code) { return Api.db.products.filter(function (p) { return p.code === code; })[0]; };
  Api.shop = function (id) { return Api.db.shops.filter(function (s) { return s.shopId === Number(id); })[0]; };
  Api.category = function (id) { return Api.db.categories.filter(function (c) { return c.id === Number(id); })[0]; };
  Api.supplier = function (id) { return Api.db.suppliers.filter(function (s) { return s.id === Number(id); })[0]; };
  Api.customer = function (id) { return Api.db.customers.filter(function (c) { return c.customerId === Number(id); })[0]; };
  Api.numId = function (u) { return Number(String(u.id).replace(/\D/g, '')); };
  Api.user = function () { var db = Api.db; return db.users.filter(function (u) { return u.id === db.session.userId; })[0] || db.users[0]; };
  Api.shopId = function (v) { var id = Number(v); return Api.shop(id) ? id : 1; };
  Api.stockOf = function (shopId, productId) { var s = Api.db.stock[shopId] || (Api.db.stock[shopId] = {}); return s[productId] || 0; };
  Api.moveStock = function (shopId, productId, delta, type, ref, note) {
    var db = Api.db, p = Api.product(productId);
    if (!p || !p.stockItem) return;
    var s = db.stock[shopId] || (db.stock[shopId] = {});
    var before = s[productId] || 0;
    s[productId] = Api.round4(before + delta);
    db.movements.push({ id: Api.next('movement'), shopId: shopId, productId: productId, type: type, delta: delta, before: before, after: s[productId], ref: ref || '', note: note || '', atUtc: Api.at || Api.nowIso(), user: Api.at ? (Api.atUser || Api.user().fullName) : Api.user().fullName });
    if (db.movements.length > 4000) db.movements.splice(0, db.movements.length - 4000);
  };
  // Selling a dish with a recipe takes its raw materials out of stock.
  Api.consume = function (shopId, productId, quantity, ref, options) {
    var db = Api.db, p = Api.product(productId);
    if (!p) return;
    if (p.stockItem) { Api.moveStock(shopId, productId, -quantity, 'SALE', ref); return; }
    if (options && options.productComponentsEnabled === false) return;
    (db.recipes[productId] || []).forEach(function (c) { if (c.active !== false) Api.moveStock(shopId, c.materialId, -c.quantity * quantity, 'SALE', ref, 'Recipe of ' + p.name); });
  };
  Api.permissionsFor = function (user) {
    var role = Api.db.roles[user.role] || { permissions: [] };
    var perms = {};
    PERMISSION_KEYS.forEach(function (k) { perms[k] = role.permissions.indexOf(k) >= 0; });
    return perms;
  };
  Api.permissionKeys = PERMISSION_KEYS;
  Api.salesOptions = function (shopId) {
    var o = Api.db.salesOptions;
    return Object.assign({}, o.defaults, o.shops[shopId] || {});
  };
  Api.companyReceipt = function () { var c = Api.db.company; return { name: c.name, tin: c.tin, address: c.address, phone: c.phone, email: c.email }; };
  Api.favouriteIds = function (shopId) { var f = Api.db.favourites || (Api.db.favourites = {}); return f[shopId] || (f[shopId] = (f[1] || []).slice()); };
  Api.isFavourite = function (shopId, productId) { return Api.favouriteIds(Api.shopId(shopId)).indexOf(Number(productId)) >= 0; };
  Api.productRow = function (p, shopId) {
    var cat = Api.category(p.categoryId);
    return { productId: p.productId, productCode: p.code, productName: p.name, description: p.description || '', unitPrice: p.price, stock: p.stockItem ? Api.stockOf(shopId, p.productId) : 0,
      uom: (Api.db.measurements.filter(function (m) { return m.id === p.measurementId; })[0] || {}).name || 'EACH', locationId: shopId, categoryId: p.categoryId, stockItem: p.stockItem,
      vatRate: p.vat ? Api.db.company.vat : 0, imageUrl: p.imageUrl || '', barcode: p.barcode || '', serviceVatRate: Api.db.company.vat, categoryName: cat && cat.name,
      favourite: Api.isFavourite(shopId, p.productId), menuNo: p.menuNo || null,
      hasRecipe: Api.hasRecipe(p.productId), subUom: Api.unitName(p.subMeasurementId) };
  };
  Api.unitName = function (id) { return (Api.db.measurements.filter(function (m) { return m.id === Number(id); })[0] || {}).name || ''; };
  Api.hasRecipe = function (productId) { var r = Api.db.recipes[productId]; return !!(r && r.length); };

  // ---- list pages (backoffice-design-spec 4.1 and 7) -------------------------------------
  // Every back-office list asks the same way: page, pageSize, sort (name, or -name for descending), q (text) and filter[key]=value.
  // The answer is { page, pageSize, pages, total, rows, totals }; the footer line of the page is written from `totals`.
  var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  Api.filtersOf = function (q) {
    var f = {};
    Object.keys(q).forEach(function (k) { var m = /^filter\[(.+)\]$/.exec(k); if (m && q[k] !== '') f[m[1]] = q[k]; });
    return f;
  };
  // sorters: { key: function (row) -> number | string | null }. Empty values always sort last.
  Api.sortRows = function (rows, sort, sorters) {
    var desc = String(sort || '').charAt(0) === '-', key = String(sort || '').replace(/^-/, ''), get = sorters && sorters[key];
    if (!get) return rows;
    var keyed = rows.map(function (r, i) { return { r: r, i: i, v: get(r) }; });
    keyed.sort(function (a, b) {
      var x = a.v, y = b.v, empty = function (v) { return v === null || v === undefined || v === ''; };
      if (empty(x) || empty(y)) return empty(x) && empty(y) ? a.i - b.i : empty(x) ? 1 : -1;
      var c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
      return (desc ? -c : c) || a.i - b.i;
    });
    return keyed.map(function (k) { return k.r; });
  };
  Api.listPage = function (q, rows, sorters, totals) {
    rows = Api.sortRows(rows, q.sort, sorters);
    var size = Math.min(200, Math.max(1, Math.floor(Number(q.pageSize)) || 50)), total = rows.length, pages = Math.max(1, Math.ceil(total / size)), page = Math.min(pages, Math.max(1, Math.floor(Number(q.page)) || 1));
    return { page: page, pageSize: size, pages: pages, total: total, rows: rows.slice((page - 1) * size, page * size), totals: totals ? totals(rows) : {} };
  };
  // CSV out and in. The file starts with a byte-order mark so a spreadsheet opens Chinese text correctly.
  Api.csvText = function (headers, rows) {
    var cell = function (v) { var t = v === null || v === undefined ? '' : String(v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    return '\ufeff' + [headers].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
  };
  Api.csvResponse = function (fileName, text) {
    return new Response(text, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="' + fileName + '"' } });
  };
  Api.parseCsv = function (text) {
    var rows = [], row = [], cell = '', quoted = false, src = String(text || '').replace(/^\ufeff/, '');
    for (var i = 0; i < src.length; i++) {
      var c = src.charAt(i);
      if (quoted) { if (c === '"') { if (src.charAt(i + 1) === '"') { cell += '"'; i++; } else quoted = false; } else cell += c; }
      else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && src.charAt(i + 1) === '\n') i++; row.push(cell); cell = ''; if (row.some(function (v) { return v !== ''; })) rows.push(row); row = []; }
      else cell += c;
    }
    row.push(cell);
    if (row.some(function (v) { return v !== ''; })) rows.push(row);
    return rows;
  };

  // ---- sign in and the opening data ----------------------------------------------
  route('GET', '/api/auth/options', function () { return { requiresCompanyCode: false, emailLogin: false }; });
  route('GET', '/api/security/csrf', function () { return { token: 'demo-token' }; });
  route('GET', '/api/auth/session', function () { return { authenticated: true }; });
  route('POST', '/api/auth/login', function (ctx) {
    var name = String(ctx.body.userName || '').trim().toLowerCase();
    var user = Api.db.users.filter(function (u) { return u.userName.toLowerCase() === name || u.email.toLowerCase() === name; })[0];
    if (!user) user = Api.db.users.filter(function (u) { return /cashier/.test(name) ? u.role === 'Cashier' : /super/.test(name) ? u.role === 'Supervisor' : u.role === 'Admin'; })[0];
    need(user.active !== false, 'This user is disabled.');
    Api.db.session.userId = user.id;
    return { ok: true };
  });
  route('POST', '/api/auth/logout', function () { return { ok: true }; });
  route('POST', '/api/auth/change-password', function (ctx) { need(ctx.body.newPassword || ctx.body.password, 'Enter a new password.'); return { message: 'Password changed (demo).' }; });
  route('GET', '/api/me', function () {
    var u = Api.user();
    return { companyCode: 'DEMO', userId: Api.numId(u), userName: u.userName, fullName: u.fullName, role: u.role, shopId: u.shopId, allShops: u.role !== 'Cashier', canChangePassword: true,
      canManageDirectory: u.role === 'Admin' || u.role === 'SuperAdmin', canManagePlatform: false, isPlatformOnly: false };
  });
  route('GET', '/api/checkout/options', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId || Api.user().shopId), o = Api.salesOptions(shopId), u = Api.user(), perms = Api.permissionsFor(u);
    return { enabled: true, operationsEnabled: true, productManagementEnabled: true, testOnly: false, companyReceipt: Api.companyReceipt(), draftBillEnabled: o.draftBillEnabled,
      salesRepEnabled: o.salesRepEnabled, receiptPaperWidthMm: Number(o.receiptPaperWidthMm), barcodeScanningEnabled: o.barcodeScanningEnabled, priceKeypadEnabled: o.priceKeypadEnabled,
      showProductCode: o.showProductCode, productComponentsEnabled: o.productComponentsEnabled, discountsEnabled: o.discountsEnabled, holdSalesEnabled: o.holdSalesEnabled,
      serviceDescriptionsEnabled: o.serviceDescriptionsEnabled, enabledPaymentMethods: o.enabledPaymentMethods.slice(), paymentBanks: Api.db.banks.slice(), creditCardFeePercent: Api.db.company.ccFee,
      sandboxSigning: false, vmsMode: 'OFF', permissions: perms };
  });
  route('GET', '/api/bootstrap', function () {
    var db = Api.db;
    return { licenseNotice: null, companyName: db.company.name, companyReceipt: Api.companyReceipt(),
      shops: db.shops.filter(function (s) { return s.active !== false; }).map(function (s) { return { shopId: s.shopId, shopName: s.shopName, locationId: s.locationId }; }), tables: [],
      categories: db.categories.filter(function (c) { return c.displayOnSales; }).map(function (c) { return { categoryId: c.id, categoryName: c.name, displayOnSales: true }; }) };
  });

  // ---- catalogue ------------------------------------------------------------------
  route('GET', '/api/products', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), search = (ctx.q.search || '').toLowerCase().trim(), cat = Number(ctx.q.categoryId) || 0, favs = ctx.q.categoryId === 'fav' ? Api.favouriteIds(shopId) : null;
    return Api.db.products.filter(function (p) {
      var c = Api.category(p.categoryId);
      if (!p.active || !c || !c.displayOnSales) return false;
      if (favs && favs.indexOf(p.productId) < 0) return false;
      if (ctx.q.categoryId === 'menu' && !p.menuNo) return false;
      if (ctx.q.serviceOnly === 'true' && p.stockItem) return false;
      if (cat && p.categoryId !== cat) return false;
      return !search || (p.name + ' ' + p.code + ' ' + p.barcode).toLowerCase().indexOf(search) >= 0;
    }).sort(function (a, b) { return ctx.q.categoryId === 'menu' ? a.menuNo - b.menuNo : 0; }).slice(0, 200).map(function (p) { return Api.productRow(p, shopId); });
  });
  // Menu numbers: the number printed on the menu board for a dish, so a customer can point at it and the cashier can find it fast.
  route('POST', '/api/products/menu-numbers', function (ctx) {
    var db = Api.db, items = ctx.body.items || [], next = {};
    db.products.forEach(function (p) { next[p.productId] = p.menuNo || null; });
    items.forEach(function (it) {
      var id = Number(it.productId), raw = it.menuNo, no = raw === null || raw === '' || raw === undefined ? null : Number(raw);
      need(next.hasOwnProperty(id), 'Product not found.', 404);
      need(no === null || (Math.floor(no) === no && no >= 1 && no <= 999), 'A menu number is a whole number from 1 to 999.');
      next[id] = no;
    });
    var seen = {};
    Object.keys(next).forEach(function (id) { var no = next[id]; if (no === null) return; need(!seen[no], 'Menu number ' + no + ' is used by more than one product.'); seen[no] = id; });
    db.products.forEach(function (p) { p.menuNo = next[p.productId]; });
    return { message: 'Menu numbers saved.' };
  });
  route('POST', '/api/products/:id/favourite', function (ctx) {
    var shopId = Api.shopId(ctx.body.shopId), id = Number(ctx.params.id), list = Api.favouriteIds(shopId), at = list.indexOf(id);
    need(Api.product(id), 'Product not found.', 404);
    if (ctx.body.favourite && at < 0) list.push(id);
    if (!ctx.body.favourite && at >= 0) list.splice(at, 1);
    return { favourite: list.indexOf(id) >= 0 };
  });
  route('GET', '/api/products/barcode', function (ctx) {
    var code = String(ctx.q.code || ctx.q.barcode || '').trim();
    var p = Api.db.products.filter(function (x) { return x.active && (x.barcode === code || x.code === code); })[0];
    need(p, 'No product has this barcode.', 404);
    return Api.productRow(p, Api.shopId(ctx.q.shopId));
  });
  route('GET', '/api/customers', function (ctx) {
    var s = (ctx.q.search || '').toLowerCase();
    return Api.db.customers.filter(function (c) { return c.active !== false && (!s || (c.name + ' ' + c.customerNo + ' ' + c.phone + ' ' + c.email + ' ' + c.tin).toLowerCase().indexOf(s) >= 0); }).slice(0, 50)
      .map(function (c) { return { customerId: c.customerId, customerNo: c.customerNo, name: c.name, phone: c.phone, email: c.email, tin: c.tin, address: c.address }; });
  });
  route('POST', '/api/operations/customers', function (ctx) {
    var b = ctx.body;
    need(String(b.name || '').trim(), 'Enter the customer name.');
    var id = Api.next('customer');
    id = Math.max(id, Api.db.customers.length + 1);
    var c = { customerId: id, customerNo: 'C' + Api.pad(id, 4), name: String(b.name).trim(), phone: b.phone || '', email: b.email || '', tin: b.tin || '', address: b.address || '', accountEnabled: false };
    Api.db.customers.push(c);
    return { message: 'Customer created.', number: c.customerNo, customer: { customerId: c.customerId, customerNo: c.customerNo, name: c.name, phone: c.phone, email: c.email, tin: c.tin, address: c.address } };
  });
  route('GET', '/api/sales-reps', function () { return Api.db.salesReps.filter(function (r) { return r.active !== false; }).map(function (r) { return { id: r.id, name: r.name }; }); });
  route('GET', '/api/inventory/operations-lookups', function () {
    var db = Api.db;
    var map = function (a) { return a.map(function (x) { return { id: x.id, name: x.name }; }); };
    return { categories: map(db.categories.filter(function (x) { return x.active !== false; })), departments: map(db.departments.filter(function (x) { return x.active !== false; })), brands: map(db.brands), colours: map(db.colours), sizes: map(db.sizes), suppliers: map(db.suppliers.filter(function (x) { return x.active !== false; })), measurements: map(db.measurements), adjustments: map(db.adjustments) };
  });
  route('GET', '/api/inventory/lookups', function () {
    var db = Api.db;
    var map = function (a) { return a.map(function (x) { return { id: x.id, name: x.name }; }); };
    return { shops: db.shops.map(function (s) { return { id: s.shopId, name: s.shopName }; }), suppliers: map(db.suppliers.filter(function (x) { return x.active !== false; })), categories: map(db.categories.filter(function (x) { return x.active !== false; })), departments: map(db.departments.filter(function (x) { return x.active !== false; })), measurements: map(db.measurements) };
  });
  route('POST', '/api/operations/suppliers', function (ctx) {
    need(String(ctx.body.name || '').trim(), 'Enter the supplier name.');
    var s = { id: Api.next('supplier') + 3, name: String(ctx.body.name).trim(), phone: ctx.body.phone || '', email: ctx.body.email || '' };
    Api.db.suppliers.push(s);
    return { message: 'Supplier created.', supplier: { id: s.id, name: s.name }, id: s.id, supplierId: s.id, name: s.name };
  });
  route('GET', '/api/operations/suppliers', function () { return Api.db.suppliers.filter(function (s) { return s.active !== false; }).map(function (s) { return { id: s.id, name: s.name }; }); });
  route('POST', '/api/security/refresh', function () { return { token: 'demo-token' }; });
})();
