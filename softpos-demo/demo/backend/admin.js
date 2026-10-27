// Demo back end, part 7: the System Setting pages (company, shops, sales options, forms, users, role access, product groups).
(function () {
  'use strict';
  var Api = window.DemoApi, route = Api.route, round2 = Api.round2, need = Api.need;

  function numId(u) { return Api.numId(u); }
  function userByNum(n) { return Api.db.users.filter(function (u) { return numId(u) === Number(n); })[0]; }
  function isAdmin() { var r = Api.user().role; return r === 'Admin' || r === 'SuperAdmin'; }
  function guard() { need(isAdmin(), 'Your account cannot manage company access.', 403); }
  function roleNames() { return Object.keys(Api.db.roles); }

  // ---- company -------------------------------------------------------------------------
  route('GET', '/api/admin/company', function () {
    guard();
    var c = Api.db.company, p = Api.db.companyProfile, r = { companyId: 1, companyName: c.name, companyTin: c.tin, mobile: p.mobile, telephone: c.phone, fax: p.fax, email: c.email, website: p.website, vat: c.vat, creditCardFee: c.ccFee, ecal: c.ecal, pbl: c.pbl };
    for (var i = 0; i < 4; i++) { r['physicalAddressLine' + (i + 1)] = p.physical[i] || ''; r['postalAddressLine' + (i + 1)] = p.postal[i] || ''; }
    return r;
  });
  route('POST', '/api/admin/company', function (ctx) {
    guard();
    var b = ctx.body, c = Api.db.company, p = Api.db.companyProfile;
    ['vat', 'creditCardFee', 'ecal'].forEach(function (k) { need(b[k] == null || (Number(b[k]) >= 0 && Number(b[k]) <= 100), 'Percentages must be between 0 and 100.'); });
    if (b.email) need(/^\S+@\S+\.\S+$/.test(b.email), 'Enter a valid email address.');
    if (b.companyTin != null) c.tin = b.companyTin;
    if (b.telephone != null) c.phone = b.telephone;
    if (b.email != null) c.email = b.email;
    if (b.vat != null) c.vat = Number(b.vat);
    if (b.creditCardFee != null) c.ccFee = Number(b.creditCardFee);
    if (b.ecal != null) c.ecal = Number(b.ecal);
    if (b.pbl != null) c.pbl = Number(b.pbl);
    ['mobile', 'fax', 'website'].forEach(function (k) { if (b[k] != null) p[k] = b[k]; });
    for (var i = 0; i < 4; i++) { if (b['physicalAddressLine' + (i + 1)] != null) p.physical[i] = b['physicalAddressLine' + (i + 1)]; if (b['postalAddressLine' + (i + 1)] != null) p.postal[i] = b['postalAddressLine' + (i + 1)]; }
    c.address = p.physical.filter(Boolean).join(', ');
    return { message: 'Company details saved.' };
  });
  route('GET', '/api/company-logo', function () {
    var res = Api.db.companyLogo ? Api.dataResponse(Api.db.companyLogo) : null;
    if (!res) throw new Api.ApiError(404, 'No logo.');
    return res;
  });
  route('POST', '/api/admin/company-logo', function (ctx) {
    guard();
    var file = ctx.form && ctx.form.get('image');
    need(file && file.size, 'Choose a PNG or JPEG under 2 MB.');
    need(file.size <= 2 * 1024 * 1024, 'The logo must be under 2 MB.');
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { Api.db.companyLogo = String(reader.result); resolve({ message: 'Logo saved.' }); };
      reader.onerror = function () { reject(new Api.ApiError(400, 'The logo could not be read.')); };
      reader.readAsDataURL(file);
    });
  });
  route('POST', '/api/admin/company-logo/remove', function () { guard(); Api.db.companyLogo = ''; return { message: 'Logo removed.' }; });

  // ---- licence and email users ---------------------------------------------------------
  function licenceEnds() { var m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(Api.db.license.ends); return m ? new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00').toISOString() : Api.nowIso(); }
  route('GET', '/api/admin/overview', function () {
    guard();
    var db = Api.db, linked = db.users.filter(function (u) { return u.email; });
    return { directory: { displayName: db.license.company, activeSeats: db.users.filter(function (u) { return u.active !== false; }).length, seatLimit: db.license.seats, licenseEndsUtc: licenceEnds(),
        users: linked.map(function (u) { return { appUserId: numId(u), email: u.email, posUserId: numId(u), isEnabled: u.active !== false }; }),
        invitations: db.invitations.map(function (i) { return { invitationId: i.id, email: i.email, posUserId: i.posUserId, expiresUtc: i.expiresUtc }; }) },
      operators: db.users.filter(function (u) { return u.active !== false; }).map(function (u) { return { userId: numId(u), userName: u.userName, fullName: u.fullName, role: u.role }; }),
      roles: roleNames().map(function (n) { return { name: n, allShops: n === 'Admin' || n === 'SuperAdmin' || n === 'Supervisor' }; }),
      shops: db.shops.filter(function (s) { return s.active !== false; }).map(function (s) { return { shopId: s.shopId, shopName: s.shopName }; }) };
  });
  route('POST', '/api/admin/users/:id/enabled', function (ctx) {
    guard();
    var u = userByNum(ctx.params.id);
    need(u, 'User not found.', 404);
    need(u.id !== Api.user().id, 'You cannot disable your own access.');
    u.active = !!ctx.body.enabled;
    return { message: u.active ? 'User enabled.' : 'User disabled.' };
  });
  route('POST', '/api/admin/users/:id/reset-link', function (ctx) {
    guard();
    need(userByNum(ctx.params.id), 'User not found.', 404);
    return { path: '/reset-password?token=demo-' + Api.uuid().slice(0, 8) };
  });
  route('POST', '/api/admin/invitations/:id/revoke', function (ctx) {
    guard();
    var db = Api.db, inv = db.invitations.filter(function (i) { return i.id === Number(ctx.params.id); })[0];
    need(inv, 'Invitation not found.', 404);
    db.invitations = db.invitations.filter(function (i) { return i !== inv; });
    var u = userByNum(inv.posUserId);
    if (u && inv.newUser) db.users = db.users.filter(function (x) { return x !== u; });
    else if (u) u.email = '';
    return { message: 'Invitation revoked.' };
  });
  function expires() { return new Date(Date.now() + 48 * 3600000).toISOString(); }
  route('POST', '/api/admin/new-user-invitations', function (ctx) {
    guard();
    var b = ctx.body, db = Api.db, email = String(b.email || '').trim().toLowerCase();
    need(String(b.fullName || '').trim(), 'Enter the full name.'); need(/^\S+@\S+\.\S+$/.test(email), 'Enter a valid email address.');
    need(roleNames().indexOf(b.role) >= 0, 'Choose a company role.'); need(Api.shop(b.shopId), 'Choose a shop.');
    need(!db.users.some(function (u) { return u.email.toLowerCase() === email; }), 'This email address already has a user.');
    var n = db.users.reduce(function (m, u) { return Math.max(m, numId(u)); }, 0) + 1;
    var user = { id: 'u' + n, userName: email.split('@')[0], email: email, fullName: String(b.fullName).trim(), role: b.role, shopId: Number(b.shopId), active: true, operator: String(b.fullName).trim() };
    db.users.push(user);
    var inv = { id: Api.next('invitation'), email: email, posUserId: n, expiresUtc: expires(), newUser: true };
    db.invitations.push(inv);
    return { path: '/accept-invitation?token=demo-' + Api.uuid().slice(0, 8), emailStatus: 'not-configured' };
  });
  route('POST', '/api/admin/invitations', function (ctx) {
    guard();
    var b = ctx.body, db = Api.db, email = String(b.email || '').trim().toLowerCase(), u = userByNum(b.posUserId);
    need(u, 'Choose a POS operator.'); need(/^\S+@\S+\.\S+$/.test(email), 'Enter a valid email address.');
    need(!u.email, 'This operator is already linked to an email user.');
    need(!db.invitations.some(function (i) { return i.posUserId === numId(u); }), 'An invitation is already pending for this operator.');
    u.email = email;
    db.invitations.push({ id: Api.next('invitation'), email: email, posUserId: numId(u), expiresUtc: expires(), newUser: false });
    return { path: '/accept-invitation?token=demo-' + Api.uuid().slice(0, 8), emailStatus: 'not-configured' };
  });

  // ---- sales options -----------------------------------------------------------------------
  var SETTING_KEYS = ['draftBillEnabled', 'salesRepEnabled', 'productComponentsEnabled', 'barcodeScanningEnabled', 'priceKeypadEnabled', 'showProductCode', 'serviceDescriptionsEnabled', 'discountsEnabled', 'holdSalesEnabled'];
  route('GET', '/api/admin/pos-settings', function (ctx) {
    guard();
    var shopId = Number(ctx.q.shopId) || 0, o = Api.db.salesOptions, base = Object.assign({}, o.defaults);
    return shopId && o.shops[shopId] ? Object.assign(base, o.shops[shopId]) : base;
  });
  route('POST', '/api/admin/pos-settings', function (ctx) {
    guard();
    var b = ctx.body, shopId = Number(ctx.q.shopId) || 0, o = Api.db.salesOptions;
    var methods = (b.enabledPaymentMethods || []).filter(function (m) { return ['CASH', 'MPAISA', 'MYCASH', 'CHEQUE', 'EFTPOS', 'CARD', 'VOUCHER', 'EBANKING'].indexOf(m) >= 0; });
    need(methods.length, 'Choose at least one payment type.');
    need([58, 80].indexOf(Number(b.receiptPaperWidthMm)) >= 0, 'Choose a receipt paper size.');
    var next = { enabledPaymentMethods: methods, receiptPaperWidthMm: Number(b.receiptPaperWidthMm) };
    SETTING_KEYS.forEach(function (k) { next[k] = k === 'priceKeypadEnabled' ? !!(b.priceKeypadEnabled != null ? b.priceKeypadEnabled : b.enabled) : !!b[k]; });
    if (shopId) { need(Api.shop(shopId), 'Choose a shop.'); o.shops[shopId] = next; } else { o.defaults = next; }
    return { message: 'Sales options saved.' };
  });
  route('GET', '/api/admin/document-options', function (ctx) {
    guard();
    var shopId = Number(ctx.q.shopId) || 0;
    return Object.assign({ centralInvoice: true, centralReceipt: true, centralQuotation: true, centralTransfer: true, centralContacts: true, address: '', phone: '', email: '', tin: '' }, Api.db.documentOptions[shopId] || {});
  });
  route('POST', '/api/admin/document-options', function (ctx) {
    guard();
    var b = ctx.body, shopId = Number(b.shopId) || 0;
    Api.db.documentOptions[shopId] = { centralInvoice: !!b.centralInvoice, centralReceipt: !!b.centralReceipt, centralQuotation: !!b.centralQuotation, centralTransfer: !!b.centralTransfer, centralContacts: !!b.centralContacts,
      address: b.address || '', phone: b.phone || '', email: b.email || '', tin: b.tin || '' };
    return { message: 'Document settings saved.' };
  });
  route('GET', '/api/admin/layby-settings', function (ctx) { guard(); return Api.laybySettings(Number(ctx.q.shopId) || 0); });
  route('POST', '/api/admin/layby-settings', function (ctx) {
    guard();
    var b = ctx.body, shopId = Number(ctx.q.shopId) || 0;
    need(Number(b.minimumDepositPercent) >= 0 && Number(b.minimumDepositPercent) <= 100, 'The minimum deposit must be between 0 and 100 percent.');
    need(Number(b.dueDays) >= 0 && Number(b.dueDays) <= 3650, 'Due days must be between 0 and 3650.');
    Api.db.laybySettings[shopId] = { minimumDepositPercent: Number(b.minimumDepositPercent), dueDays: Number(b.dueDays), vmsAdvancesEnabled: !!b.vmsAdvancesEnabled };
    return { message: 'Layby settings saved.' };
  });

  // ---- shops -----------------------------------------------------------------------------
  route('GET', '/api/admin/shops', function () {
    guard();
    var db = Api.db;
    return { shops: db.shops.map(function (s) { return { name: s.shopName, code: 'S' + Api.pad(s.shopId, 3), active: s.active !== false, division: s.division, locationId: s.locationId, locationName: Api.locationName(s.shopId), locationCode: 'L' + Api.pad(s.locationId, 3) }; }),
      divisions: [{ id: 1, name: 'GENERAL' }, { id: 2, name: 'RESTAURANT' }] };
  });
  route('POST', '/api/admin/shops', function (ctx) {
    guard();
    var b = ctx.body, db = Api.db, name = String(b.name || '').trim();
    need(name, 'Enter the shop name.'); need(name.length <= 50, 'The shop name is too long.');
    need(!db.shops.some(function (s) { return s.shopName.toLowerCase() === name.toLowerCase(); }), 'A shop with this name already exists.');
    var again = db.shops.filter(function (s) { return s.requestId && s.requestId === b.requestId; })[0];
    var id = again ? again.shopId : db.shops.reduce(function (m, s) { return Math.max(m, s.shopId); }, 0) + 1;
    if (!again) {
      db.shops.push({ shopId: id, shopName: name, locationId: id, division: Number(b.divisionId) === 2 ? 'RESTAURANT' : 'GENERAL', active: true, requestId: b.requestId });
      db.stock[id] = {};
      db.products.forEach(function (p) { db.stock[id][p.productId] = 0; });
    }
    return { message: 'Shop created.', locationCode: 'L' + Api.pad(id, 3) };
  });
  route('GET', '/api/admin/forms/lookups', function () {
    guard();
    return { owner: 'DEMO/' + numId(Api.user()), shops: Api.db.shops.filter(function (s) { return s.active !== false; }).map(function (s) { return { shopId: s.shopId, shopName: s.shopName }; }) };
  });

  // ---- customers, suppliers and sales reps ----------------------------------------------------
  function formRow(kind, r) {
    if (kind === 'customers') return { id: r.customerId, code: r.customerNo, fields: { name: r.name, phone: r.phone, email: r.email, address: r.address, tin: r.tin, active: r.active !== false, assignedShopId: null } };
    if (kind === 'suppliers') return { id: r.id, code: 'S' + Api.pad(r.id, 4), fields: { name: r.name, phone: r.phone, email: r.email, address: r.address || '', tin: r.tin || '', active: r.active !== false, assignedShopId: null } };
    return { id: r.id, code: 'SR' + Api.pad(r.id, 3), fields: { name: r.name, phone: null, email: null, address: null, tin: null, active: r.active !== false, assignedShopId: r.assignedShopId || 1 } };
  }
  function formList(kind) { var db = Api.db; return kind === 'customers' ? db.customers : kind === 'suppliers' ? db.suppliers : kind === 'sales-reps' ? db.salesReps : null; }
  route('GET', '/api/admin/forms/:kind', function (ctx) {
    guard();
    var list = formList(ctx.params.kind), s = (ctx.q.search || '').toLowerCase();
    need(list, 'Unknown form.', 404);
    var rows = list.map(function (r) { return formRow(ctx.params.kind, r); }).filter(function (r) { return !s || (r.fields.name + ' ' + r.code + ' ' + (r.fields.phone || '') + ' ' + (r.fields.email || '')).toLowerCase().indexOf(s) >= 0; });
    return { rows: rows.slice(0, 200), hasMore: rows.length > 200 };
  });
  route('POST', '/api/admin/forms/:kind', function (ctx) {
    guard();
    var kind = ctx.params.kind, list = formList(kind), b = ctx.body, f = b.fields || {}, db = Api.db;
    need(list, 'Unknown form.', 404);
    need(String(f.name || '').trim(), 'Enter a name.');
    if (f.email) need(/^\S+@\S+\.\S+$/.test(f.email), 'Enter a valid email address.');
    var idKey = kind === 'customers' ? 'customerId' : 'id', row = b.id == null ? null : list.filter(function (r) { return r[idKey] === Number(b.id); })[0];
    need(b.id == null || row, 'This record no longer exists.', 409);
    var dup = list.some(function (r) { return r !== row && r.name.toLowerCase() === String(f.name).trim().toLowerCase(); });
    need(!dup, 'A record with this name already exists.');
    if (!row) {
      if (kind === 'customers') { var cid = list.reduce(function (m, r) { return Math.max(m, r.customerId); }, 0) + 1; row = { customerId: cid, customerNo: 'C' + Api.pad(cid, 4), accountEnabled: false }; }
      else row = { id: list.reduce(function (m, r) { return Math.max(m, r.id); }, 0) + 1 };
      list.push(row);
    }
    row.name = String(f.name).trim(); row.active = f.active !== false;
    if (kind === 'sales-reps') { row.assignedShopId = Number(f.assignedShopId) || 1; }
    else { row.phone = f.phone || ''; row.email = f.email || ''; row.address = f.address || ''; row.tin = f.tin || ''; }
    return { id: row[idKey], message: 'Record saved.' };
  });

  // ---- role access ----------------------------------------------------------------------------
  route('GET', '/api/admin/role-access', function () {
    guard();
    var db = Api.db, names = roleNames(), keys = Api.permissionKeys;
    var entries = [];
    names.forEach(function (n, i) { keys.forEach(function (k) { entries.push({ roleId: i + 1, module: k, allowed: db.roles[n].permissions.indexOf(k) >= 0 }); }); });
    return { roles: names.map(function (n, i) { return { id: i + 1, name: n }; }), modules: keys.filter(function (k) { return !/Approval$/.test(k); }), entries: entries };
  });
  route('POST', '/api/admin/role-access', function (ctx) {
    guard();
    var names = roleNames(), db = Api.db;
    (ctx.body.entries || []).forEach(function (e) {
      var name = names[Number(e.roleId) - 1];
      need(name, 'Role not found.', 404);
      need(Api.permissionKeys.indexOf(e.module) >= 0, 'Unknown module ' + e.module + '.');
      if (name === 'Admin' || name === 'SuperAdmin') return;
      var list = db.roles[name].permissions, at = list.indexOf(e.module);
      if (e.allowed && at < 0) list.push(e.module);
      if (!e.allowed && at >= 0) list.splice(at, 1);
    });
    return { message: 'Role access saved.' };
  });

  // ---- VMS (fiscal signing is not part of the demo) ------------------------------------------------
  route('GET', '/api/admin/vms-certificate', function () { throw new Api.ApiError(404, 'VMS is not part of the demo.'); });
  route('POST', '/api/admin/vms-certificate', function () { throw new Api.ApiError(400, 'VMS certificates are not part of the demo.'); });

  // ---- departments and categories ------------------------------------------------------------------
  route('GET', '/api/admin/product-groups', function () {
    guard();
    var db = Api.db;
    return { departments: db.departments.map(function (d) { return { id: d.id, code: d.code, name: d.name, active: d.active !== false }; }),
      categories: db.categories.map(function (c) { return { id: c.id, code: c.code, name: c.name, departmentId: c.departmentId || null, description: c.description || '', excludeQuantity: !!c.excludeQuantity, displayOnSales: c.displayOnSales !== false }; }) };
  });
  route('POST', '/api/admin/product-groups/:kind', function (ctx) {
    guard();
    var kind = ctx.params.kind, db = Api.db, b = ctx.body, f = b.fields || {}, list = kind === 'departments' ? db.departments : kind === 'categories' ? db.categories : null;
    need(list, 'Unknown group type.', 404);
    need(String(f.code || '').trim(), 'Enter a code.'); need(String(f.name || '').trim(), 'Enter a name.');
    var row = b.id == null ? null : list.filter(function (r) { return r.id === Number(b.id); })[0];
    need(b.id == null || row, 'This entry no longer exists.', 409);
    need(!list.some(function (r) { return r !== row && (r.code.toLowerCase() === String(f.code).trim().toLowerCase() || r.name.toLowerCase() === String(f.name).trim().toLowerCase()); }), 'The code and name must be unique.');
    if (!row) { row = { id: list.reduce(function (m, r) { return Math.max(m, r.id); }, 0) + 1 }; list.push(row); }
    row.code = String(f.code).trim(); row.name = String(f.name).trim();
    if (kind === 'departments') row.active = f.active !== false;
    else {
      row.active = true; row.departmentId = f.departmentId || null; row.description = f.description || ''; row.excludeQuantity = !!f.excludeQuantity; row.displayOnSales = f.displayOnSales !== false;
    }
    return { id: row.id, message: (kind === 'departments' ? 'Department' : 'Category') + ' saved.' };
  });
})();
