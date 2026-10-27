// Demo back end, part 5: refunds, layby, customer payments, recurring invoices, pricing rules, customer reports and a simulated accounting link.
(function () {
  'use strict';
  var Api = window.DemoApi, route = Api.route, round2 = Api.round2, round4 = Api.round4, need = Api.need;
  var BANK_METHODS = ['CARD', 'CHEQUE', 'EFTPOS', 'EBANKING'];

  function strip(l) { var c = Object.assign({}, l); delete c._p; return c; }
  function ago(days, hour, minute) { var d = new Date(); d.setDate(d.getDate() - days); d.setHours(hour == null ? 12 : hour, minute == null ? 15 : minute, 0, 0); return d.toISOString(); }
  function dateOnly(iso) { var d = new Date(iso); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function invoiceById(requestId) { return Api.db.invoices.filter(function (i) { return i.requestId === requestId; })[0]; }
  function bankName(id) { var b = id ? Api.db.banks.filter(function (x) { return x.id === Number(id); })[0] : null; return b ? b.name : ''; }
  function optionsFor(shopId) { return Api.salesOptions(shopId); }

  // Give goods back to stock (the mirror of Api.consume).
  Api.restore = function (shopId, productId, quantity, ref, note) {
    var p = Api.product(productId);
    if (!p) return;
    if (p.stockItem) { Api.moveStock(shopId, productId, quantity, 'REFUND', ref, note); return; }
    if (optionsFor(shopId).productComponentsEnabled === false) return;
    (Api.db.recipes[productId] || []).forEach(function (c) { if (c.active !== false) Api.moveStock(shopId, c.materialId, c.quantity * quantity, 'REFUND', ref, note || ('Recipe of ' + p.name)); });
  };

  Api.module({
    seed: function (db) {
      db.refunds = []; db.customerPayments = []; db.laybySettings = {};
      db.accounting = { configs: ['MYOB', 'Xero', 'QuickBooks'].map(function (p) { return { provider: p, clientId: '', homeCurrency: '', redirectUri: '', sandbox: true, connected: false, companyName: '', companyId: '' }; }), taxLinks: {}, signed: {} };
    },
    afterSeed: function (db) {
      var p = Api.productByCode;
      db.pricing.priceBreaks.push({ PromotionId: 1, Code: 1, Description: 'Frozen dumplings: 2 for 18.00', Break1_Quantity: 2, Break1_Price: 1.9, Active: true, ProductIds: [p('F01').productId, p('F02').productId] });
      db.pricing.promotions.push({ PromotionHeaderId: 1, PromotionName: 'Happy hour: soft drinks 20% off', ShopId: 1, PromotionScope: 'Department', PromotionCategoryId: 5, PromotionDiscountType: 'Percent', PromotionDiscountValue: 20,
        PromotionMinimumQty: 1, PromotionApplyMode: 'PerItem', StartDate: dateOnly(ago(30)), EndDate: dateOnly(ago(-180)), StartTime: '15:00', EndTime: '17:00', DailyWindow: true, InActive: false, PromotionDays: '0,1,2,3,4,5,6', ProductIds: [] });
      db.seq.priceBreak = 1; db.seq.promotion = 1;

      // credit-account invoices for the two account customers
      var accounts = [[1, 62, [['N01', 8], ['R03', 6]]], [1, 33, [['D01', 10], ['S01', 6]]], [1, 9, [['N02', 6], ['R02', 4]]], [2, 41, [['N04', 5], ['S02', 4]]], [2, 15, [['D01', 6]]], [2, 4, [['N05', 8], ['R01', 6]]]];
      accounts.forEach(function (a) {
        Api.createInvoice({ requestId: Api.uuid(), shopId: 1, customerId: a[0], serviceTerms: 'ACCOUNT', items: a[2].map(function (x) { return { productId: p(x[0]).productId, quantity: x[1] }; }) }, { createdUtc: ago(a[1], 10), user: db.users[0] });
      });
      var first = db.invoices.filter(function (i) { return i.serviceTerms === 'ACCOUNT' && i.customerId === 1; })[0];
      postCustomerPayment({ shopId: 1, customerId: 1, payment: { method: 'EFTPOS', tendered: first.total, reference: 'EFT55021', bankId: 1 }, lines: [{ invoiceNo: first.invoiceNo, expectedBalance: first.total, amount: first.total }] }, { createdUtc: ago(50, 11) });
      var part = db.invoices.filter(function (i) { return i.serviceTerms === 'ACCOUNT' && i.customerId === 2; })[0];
      var half = round2(part.total / 2);
      postCustomerPayment({ shopId: 1, customerId: 2, payment: { method: 'CASH', tendered: half, reference: '' }, lines: [{ invoiceNo: part.invoiceNo, expectedBalance: part.total, amount: half }] }, { createdUtc: ago(20, 15) });

      // one earlier refund
      var source = db.invoices.filter(function (i) { return !i.serviceTerms && !i.isLayby && i.shopId === 1 && new Date(i.createdUtc).getTime() < Date.now() - 2 * 864e5 && i.lines.length > 1; })[0];
      if (source) postRefund(source, [{ detailId: 1, quantity: 1, restock: false }], 'CASH', '', 'Order was wrong', { createdUtc: new Date(new Date(source.createdUtc).getTime() + 20 * 60000).toISOString(), user: db.users[1] });

      // two laybys: one part-paid, one paid and waiting for collection
      var l1 = Api.createLayby({ requestId: Api.uuid(), shopId: 1, customerId: 2, items: [{ productId: p('F01').productId, quantity: 6 }, { productId: p('F02').productId, quantity: 6 }] }, { createdUtc: ago(6, 10) });
      postLaybyPayment(l1, 20, { method: 'CASH', tendered: 20, reference: '' }, { createdUtc: ago(6, 10, 30) });
      var l2 = Api.createLayby({ requestId: Api.uuid(), shopId: 1, customerId: 1, items: [{ productId: p('B01').productId, quantity: 12 }, { productId: p('B03').productId, quantity: 12 }] }, { createdUtc: ago(10, 11) });
      postLaybyPayment(l2, 30, { method: 'CASH', tendered: 30, reference: '' }, { createdUtc: ago(10, 11, 20) });
      postLaybyPayment(l2, round2(l2.total - 30), { method: 'MPAISA', tendered: round2(l2.total - 30), reference: 'MP772013' }, { createdUtc: ago(3, 16) });
    }
  });

  // ---- refunds -------------------------------------------------------------------------
  function returnedOf(inv, index) {
    return round4((Api.db.refunds || []).filter(function (r) { return r.requestId === inv.requestId; }).reduce(function (s, r) {
      return s + r.lines.filter(function (l) { return l.lineIndex === index; }).reduce(function (t, l) { return t + l.quantity; }, 0);
    }, 0));
  }
  function refundedAmountOf(inv, index) {
    return round2((Api.db.refunds || []).filter(function (r) { return r.requestId === inv.requestId; }).reduce(function (s, r) {
      return s + r.lines.filter(function (l) { return l.lineIndex === index; }).reduce(function (t, l) { return t + l.total; }, 0);
    }, 0));
  }
  function refundStatus(inv) {
    var all = inv.lines.every(function (l, i) { return returnedOf(inv, i) >= l.quantity - 0.00001; }), some = inv.lines.some(function (l, i) { return returnedOf(inv, i) > 0; });
    return all ? 'Fully refunded' : some ? 'Part refunded' : inv.serviceTerms === 'ACCOUNT' ? 'Account' : inv.isLayby ? 'Layby' : 'Paid';
  }
  function refundView(r) {
    return { number: r.refundNo, total: r.total, vatAmount: r.vat, rounding: r.rounding, originalInvoice: r.invoiceNo, createdUtc: r.createdUtc, method: r.method, reason: r.reason, requestId: r.requestId, fiscalRequired: false,
      items: r.lines.map(function (l) { return { name: l.name, quantity: l.quantity, amount: l.total }; }) };
  }
  function postRefund(inv, lines, method, reference, reason, opts) {
    opts = opts || {};
    var db = Api.db, user = opts.user || Api.user(), docLines = [], total = 0, vat = 0;
    need(String(reason || '').trim(), 'Enter the reason for the refund.');
    need(lines.length, 'Enter a quantity to return for at least one item.');
    lines.forEach(function (r) {
      var index = Number(r.detailId) - 1, line = inv.lines[index];
      need(line, 'An invoice line could not be found.');
      var qty = Number(r.quantity), returned = returnedOf(inv, index);
      need(qty > 0 && qty <= round4(line.quantity - returned) + 0.00001, 'You can return at most ' + round4(line.quantity - returned) + ' of ' + line.name + '.');
      var amount = round2(round2(line.total * (returned + qty) / line.quantity) - round2(line.total * returned / line.quantity));
      var vatAmount = round2(round2(line.vatAmount * (returned + qty) / line.quantity) - round2(line.vatAmount * returned / line.quantity));
      total += amount; vat += vatAmount;
      docLines.push({ lineIndex: index, productId: line.productId, name: line.name, quantity: qty, total: amount, vatAmount: vatAmount, restock: !!r.restock });
    });
    total = round2(total); vat = round2(vat);
    var rounding = method === 'CASH' ? Api.cashRounding(total, true) : 0, createdUtc = opts.createdUtc || Api.nowIso();
    var doc = { refundNo: 'REF-' + Api.pad(Api.next('refund'), 5), invoiceNo: inv.invoiceNo, requestId: inv.requestId, shopId: inv.shopId, createdUtc: createdUtc, userId: user.id, cashier: user.fullName,
      method: method, reference: reference || '', reason: String(reason).trim(), total: total, vat: vat, rounding: rounding, lines: docLines };
    db.refunds.push(doc);
    Api.at = opts.createdUtc || null; Api.atUser = user.fullName;
    try { docLines.forEach(function (l) { if (l.restock) Api.restore(inv.shopId, l.productId, l.quantity, doc.refundNo); }); } finally { Api.at = null; Api.atUser = null; }
    if (inv.serviceTerms === 'ACCOUNT') inv.balance = Math.max(0, round2((inv.balance || 0) - total));
    return doc;
  }
  route('GET', '/api/operations/refund-invoices', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), search = (ctx.q.search || '').toLowerCase().trim(), size = 10, pageNo = Math.max(1, Number(ctx.q.page) || 1);
    var rows = Api.db.invoices.filter(function (i) {
      if (i.shopId !== shopId || (i.isLayby && i.laybyState !== 'COLLECTED')) return false;
      var name = (i.customer && i.customer.name) || '';
      return !search || (i.invoiceNo + ' ' + name).toLowerCase().indexOf(search) >= 0;
    }).sort(function (a, b) { return a.createdUtc < b.createdUtc ? 1 : -1; });
    return { rows: rows.slice((pageNo - 1) * size, pageNo * size).map(function (i) { return { invoiceNo: i.invoiceNo, createdUtc: i.createdUtc, customerName: (i.customer && i.customer.name) || 'Cash customer', cashier: i.cashier, total: i.total, status: refundStatus(i) }; }),
      totalCount: rows.length, pageSize: size };
  });
  route('GET', '/api/operations/refund-invoice', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), no = String(ctx.q.invoiceNo || '').trim().toLowerCase();
    need(no, 'Enter an invoice number.');
    var inv = Api.db.invoices.filter(function (i) { return i.invoiceNo.toLowerCase() === no && i.shopId === shopId; })[0];
    need(inv, 'Invoice not found at this shop.', 404);
    need(!inv.isLayby || inv.laybyState === 'COLLECTED', 'Layby invoices are refunded by cancelling the layby.');
    var parts = (inv.payment && inv.payment.parts) || [], method = parts.length === 1 ? parts[0].method : 'CASH';
    return { sale: { InvoiceNo: inv.invoiceNo, invoiceNo: inv.invoiceNo, RequestId: inv.requestId, requestId: inv.requestId, FiscalStatus: 'NONE', paymentMethod: method, refundAllowed: true, rounding: 0 },
      lines: inv.lines.map(function (l, i) { var returned = returnedOf(inv, i); return { id: i + 1, name: l.name, price: l.quantity ? round2(l.total / l.quantity) : l.price, remaining: round4(l.quantity - returned), returned: returned, quantity: l.quantity, total: l.total, stockItem: !!l.stockItem }; }) };
  });
  route('POST', '/api/operations/refund', function (ctx) {
    var b = ctx.body, inv = invoiceById(b.saleRequestId);
    need(inv, 'The original invoice could not be found.', 404);
    need(b.method, 'Choose how the refund is paid.');
    if (b.method !== 'CASH') need(String(b.reference || '').trim(), 'Enter the reference from your payment provider.');
    var done = Api.db.refunds.filter(function (r) { return r.refundRequestId && r.refundRequestId === b.requestId; })[0];
    if (done) return Object.assign(refundView(done), { message: 'Refund saved.' });
    var doc = postRefund(inv, b.lines || [], b.method, b.reference, b.reason, {});
    doc.refundRequestId = b.requestId;
    return Object.assign(refundView(doc), { message: 'Refund saved.' });
  });
  route('GET', '/api/operations/refund-history', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId);
    return Api.db.refunds.filter(function (r) { return r.shopId === shopId; }).slice(-10).reverse().map(function (r) { return { refund: refundView(r), fiscalStatus: 'NONE' }; });
  });
  Api.returnedOf = returnedOf;

  // ---- layby -------------------------------------------------------------------------
  function laybyConfig(shopId) { var all = Api.db.laybySettings || {}; return Object.assign({ minimumDepositPercent: 10, dueDays: 60, vmsAdvancesEnabled: false }, all[0] || {}, shopId ? all[shopId] || {} : {}); }
  Api.laybySettings = laybyConfig;
  Api.createLayby = function (b, opts) {
    opts = opts || {};
    var db = Api.db, shopId = Api.shopId(b.shopId), user = opts.user || Api.user();
    need(b.customerId && Api.customer(b.customerId), 'Select a named customer for layby.');
    need(Api.permissionsFor(user).Layby || opts.createdUtc, 'Your role cannot use Layby.');
    var priced = Api.priceCart(shopId, b.items || []), cfg = laybyConfig(shopId), created = opts.createdUtc || Api.nowIso();
    var inv = { requestId: b.requestId || Api.uuid(), invoiceNo: Api.nextInvoiceNo(), shopId: shopId, createdUtc: created, userId: user.id, cashier: user.fullName, customerId: Number(b.customerId), customer: Api.customerCard(b.customerId),
      salesRepName: null, lines: priced.lines.map(strip), total: priced.total, vat: priced.vatAmount, surcharge: 0, surchargeRate: 0, payment: { method: 'CASH', tendered: 0, change: 0, rounding: 0, parts: [] }, serviceTerms: null, balance: priced.total,
      additionalNote: b.additionalNote || '', invoiceReference: b.invoiceReference || '', customerPoNumber: b.customerPoNumber || '', customerDetail: b.customerDetail || '', refunds: [], isLayby: true, laybyState: 'OPEN', laybyPayments: [], amountPaid: 0,
      dueUtc: new Date(new Date(created).getTime() + cfg.dueDays * 864e5).toISOString(), minimumDeposit: round2(priced.total * cfg.minimumDepositPercent / 100) };
    db.invoices.push(inv);
    Api.at = opts.createdUtc || null; Api.atUser = user.fullName;
    try { priced.lines.forEach(function (l) { Api.consume(shopId, l.productId, l.quantity, inv.invoiceNo, optionsFor(shopId)); }); } finally { Api.at = null; Api.atUser = null; }
    if (b.heldSaleId) db.holds = db.holds.filter(function (h) { return h.id !== Number(b.heldSaleId); });
    if (b.quotationId) { var q = db.quotations.filter(function (x) { return x.quotationId === Number(b.quotationId); })[0]; if (q) q.invoiceNo = inv.invoiceNo; }
    return inv;
  };
  function laybySale(inv) {
    var view = Api.saleView(inv), parts = inv.laybyPayments.map(function (p) { return { method: p.method, tendered: p.tendered, applied: p.amountPaid, rounding: p.rounding, reference: p.reference, bankName: p.bankName }; });
    view.payment = { method: parts.length > 1 ? 'SPLIT' : parts.length ? parts[0].method : 'CASH', tendered: inv.amountPaid, change: 0, rounding: 0, parts: parts };
    view.balance = inv.balance; view.isLayby = true;
    return view;
  }
  function postLaybyPayment(inv, amount, payment, opts) {
    opts = opts || {};
    need(inv.laybyState === 'OPEN' || inv.laybyState === 'PART_PAID', 'This layby cannot take payments.');
    amount = round2(Number(amount));
    need(amount > 0, 'Enter an amount above zero.');
    need(amount <= round2(inv.balance) + 0.00001, 'The payment is more than the balance.');
    need(inv.amountPaid > 0 || amount >= inv.minimumDeposit - 0.00001 || amount >= inv.balance - 0.00001, 'The first deposit must be at least ' + inv.minimumDeposit.toFixed(2) + '.');
    var method = payment && payment.method;
    need(method, 'Choose a payment method.');
    var rounding = method === 'CASH' ? Api.cashRounding(amount, true) : 0, payable = round2(amount + rounding), tendered = Number(payment.tendered);
    need(isFinite(tendered) && tendered + 0.00001 >= payable, 'The amount received does not cover the payment.');
    if (method !== 'CASH') need(Math.abs(tendered - payable) < 0.005, 'Only cash can give change.');
    if (method !== 'CASH' && method !== 'CARD') need(String(payment.reference || '').trim() || opts.createdUtc, 'Enter the payment reference.');
    var receiptNo = 'LB-' + Api.pad(Api.next('laybyReceipt'), 5), change = round2(tendered - payable);
    inv.laybyPayments.push({ receiptNo: receiptNo, amountPaid: amount, change: change, rounding: rounding, tendered: tendered, method: method, reference: payment.reference || '', bankName: bankName(payment.bankId), paymentDate: opts.createdUtc || Api.nowIso(), userId: (opts.user || Api.user()).id });
    inv.amountPaid = round2(inv.amountPaid + amount);
    inv.balance = Math.max(0, round2(inv.total - inv.amountPaid));
    inv.laybyState = inv.balance <= 0.004 ? 'PAID' : 'PART_PAID';
    return inv.laybyPayments[inv.laybyPayments.length - 1];
  }
  Api.laybyActivity = function (shopId, fromMs, toMs) {
    var out = { received: 0, refunded: 0, methods: {} };
    function add(method, amount) { out.methods[method] = round2((out.methods[method] || 0) + amount); }
    Api.db.invoices.forEach(function (inv) {
      if (!inv.isLayby || inv.shopId !== shopId) return;
      inv.laybyPayments.forEach(function (p) { var at = new Date(p.paymentDate).getTime(); if (at >= fromMs && at <= toMs) { var v = p.method === 'CASH' ? p.amountPaid + p.rounding : p.amountPaid; out.received += v; add(p.method, v); } });
      if (inv.laybyRefund) { var at = new Date(inv.laybyRefund.atUtc).getTime(); if (at >= fromMs && at <= toMs) { var r = inv.laybyRefund.amount + (inv.laybyRefund.rounding || 0); out.refunded += r; add(inv.laybyRefund.method, -r); } }
    });
    Api.db.customerPayments.forEach(function (c) { var at = new Date(c.createdUtc).getTime(); if (c.shopId === shopId && at >= fromMs && at <= toMs) add(c.method, c.total); });
    return out;
  };
  function laybyList(shopId, search) {
    var s = (search || '').toLowerCase().trim();
    return Api.db.invoices.filter(function (i) { return i.isLayby && i.shopId === shopId && (!s || (i.invoiceNo + ' ' + ((i.customer && i.customer.name) || '')).toLowerCase().indexOf(s) >= 0); })
      .sort(function (a, b) { var oa = (a.laybyState === 'COLLECTED' || a.laybyState === 'CANCELLED') ? 1 : 0, ob = (b.laybyState === 'COLLECTED' || b.laybyState === 'CANCELLED') ? 1 : 0; return oa - ob || (a.createdUtc < b.createdUtc ? 1 : -1); });
  }
  route('GET', '/api/operations/laybys', function (ctx) {
    return laybyList(Api.shopId(ctx.q.shopId), ctx.q.search).map(function (i) { return { requestId: i.requestId, invoiceNo: i.invoiceNo, customerName: (i.customer && i.customer.name) || '', total: i.total, amountPaid: i.amountPaid, balance: i.balance, laybyState: i.laybyState }; });
  });
  route('GET', '/api/operations/laybys/:id', function (ctx) {
    var inv = invoiceById(ctx.params.id);
    need(inv && inv.isLayby, 'Layby not found.', 404);
    return { requestId: inv.requestId, shopId: inv.shopId, createdUtc: inv.createdUtc, sale: laybySale(inv), amountPaid: inv.amountPaid, balance: inv.balance, status: inv.laybyState === 'PART_PAID' ? 'OPEN' : inv.laybyState, laybyState: inv.laybyState,
      payments: inv.laybyPayments.map(function (p) { return { receiptNo: p.receiptNo, amountPaid: p.amountPaid, change: p.change, paymentDate: p.paymentDate }; }), fiscalEnabled: false, fiscalDocuments: [], refundAmount: inv.amountPaid, dueUtc: inv.dueUtc, minimumDeposit: inv.amountPaid > 0 ? 0 : inv.minimumDeposit };
  });
  route('POST', '/api/operations/laybys/payment', function (ctx) {
    var b = ctx.body, inv = invoiceById(b.saleRequestId);
    need(inv && inv.isLayby, 'Layby not found.', 404);
    need(b.expectedBalance == null || Math.abs(Number(b.expectedBalance) - inv.balance) < 0.005, 'The layby balance changed. Open it again.');
    var p = postLaybyPayment(inv, b.amount, b.payment || {}, {});
    return { InvoiceNo: inv.invoiceNo, ReceiptNo: p.receiptNo, Payment: { Method: p.method, Applied: p.amountPaid, Rounding: p.rounding, Tendered: p.tendered, Change: p.change }, AmountPaid: inv.amountPaid, Balance: inv.balance,
      message: 'Layby payment saved.', number: p.receiptNo };
  });
  route('POST', '/api/operations/laybys/action', function (ctx) {
    var b = ctx.body, inv = invoiceById(b.saleRequestId);
    need(inv && inv.isLayby, 'Layby not found.', 404);
    need(b.expectedBalance == null || Math.abs(Number(b.expectedBalance) - inv.balance) < 0.005, 'The layby balance changed. Open it again.');
    if (b.action === 'COLLECT') {
      need(inv.laybyState === 'PAID', 'Only a fully paid layby can be collected.');
      inv.laybyState = 'COLLECTED'; inv.reportUtc = Api.nowIso();
      return { message: 'Goods released to the customer.', number: inv.invoiceNo };
    }
    need(b.action === 'CANCEL', 'Unknown layby action.');
    need(['OPEN', 'PART_PAID', 'PAID'].indexOf(inv.laybyState) >= 0, 'This layby can no longer be cancelled.');
    need(String(b.reason || '').trim(), 'Enter the reason for cancelling.');
    if (inv.amountPaid > 0) need(b.refundConfirmed, 'Confirm that the deposit was refunded.');
    var method = b.refundMethod || 'CASH';
    inv.laybyRefund = { amount: inv.amountPaid, method: method, atUtc: Api.nowIso(), reason: b.reason, rounding: method === 'CASH' ? Api.cashRounding(inv.amountPaid, true) : 0 };
    inv.lines.forEach(function (l) { Api.restore(inv.shopId, l.productId, l.quantity, inv.invoiceNo, 'Layby cancelled'); });
    inv.laybyState = 'CANCELLED'; inv.balance = 0;
    return { message: 'Layby cancelled and stock released.', number: inv.invoiceNo };
  });

  // ---- customer payments (credit accounts) ----------------------------------------------
  function openAccountInvoices(shopId, customerId) {
    return Api.db.invoices.filter(function (i) { return i.serviceTerms === 'ACCOUNT' && i.shopId === shopId && i.customerId === Number(customerId) && i.balance > 0.004; }).sort(function (a, b) { return a.createdUtc < b.createdUtc ? -1 : 1; });
  }
  function postCustomerPayment(b, opts) {
    opts = opts || {};
    var db = Api.db, shopId = Api.shopId(b.shopId), customer = Api.customer(b.customerId);
    need(customer, 'Choose a customer.');
    var lines = (b.lines || []).filter(function (l) { return Number(l.amount) > 0; });
    need(lines.length, 'Enter an amount to apply to at least one invoice.');
    var total = 0, applied = [];
    lines.forEach(function (l) {
      var inv = db.invoices.filter(function (i) { return i.invoiceNo === l.invoiceNo && i.serviceTerms === 'ACCOUNT' && i.customerId === customer.customerId; })[0];
      need(inv, 'Invoice ' + l.invoiceNo + ' is not a credit invoice for this customer.');
      need(l.expectedBalance == null || Math.abs(Number(l.expectedBalance) - inv.balance) < 0.005, 'The balance of ' + inv.invoiceNo + ' changed. Search the customer again.');
      need(Number(l.amount) <= inv.balance + 0.00001, 'The payment for ' + inv.invoiceNo + ' is more than its balance.');
      applied.push({ inv: inv, amount: round2(Number(l.amount)) }); total += Number(l.amount);
    });
    total = round2(total);
    var pay = b.payment || {};
    need(pay.method, 'Choose a payment method.');
    need(Math.abs(Number(pay.tendered) - total) < 0.005, 'The amount received must equal the amount applied.');
    if (pay.method !== 'CASH') need(String(pay.reference || '').trim(), 'Enter the payment reference.');
    applied.forEach(function (a) { a.inv.balance = Math.max(0, round2(a.inv.balance - a.amount)); });
    var doc = { receiptNo: 'CP-' + Api.pad(Api.next('customerPayment'), 5), customerId: customer.customerId, shopId: shopId, createdUtc: opts.createdUtc || Api.nowIso(), method: pay.method, reference: pay.reference || '', bankName: bankName(pay.bankId),
      total: total, lines: applied.map(function (a) { return { invoiceNo: a.inv.invoiceNo, amount: a.amount }; }) };
    db.customerPayments.push(doc);
    return doc;
  }
  route('GET', '/api/operations/customer-payments', function (ctx) {
    return openAccountInvoices(Api.shopId(ctx.q.shopId), ctx.q.customerId).map(function (i) { return { invoiceNo: i.invoiceNo, balance: i.balance, total: i.total, date: i.createdUtc }; });
  });
  route('POST', '/api/operations/customer-payments', function (ctx) {
    var doc = postCustomerPayment(ctx.body, {}), customer = Api.customer(doc.customerId);
    return { company: Api.companyReceipt(), receiptNo: doc.receiptNo, number: doc.receiptNo, customer: { name: customer.name, customerNo: customer.customerNo }, createdUtc: doc.createdUtc,
      lines: doc.lines.map(function (l) { return { InvoiceNo: l.invoiceNo, Amount: l.amount }; }), total: doc.total, payment: { Method: doc.method }, message: 'Customer payment saved.' };
  });

  // ---- recurring invoices -----------------------------------------------------------
  route('GET', '/api/service-sales/recurring', function (ctx) {
    var q = ctx.q, shopId = Api.shopId(q.shopId), db = Api.db;
    return db.invoices.map(function (inv, index) { return { inv: inv, id: index + 1 }; }).filter(function (x) {
      var i = x.inv, day = dateOnly(i.createdUtc), name = ((i.customer && i.customer.name) || '').toLowerCase();
      if (i.shopId !== shopId || i.isLayby) return false;
      if (q.invoiceNo && i.invoiceNo.toLowerCase().indexOf(String(q.invoiceNo).toLowerCase()) < 0) return false;
      if (q.customer && name.indexOf(String(q.customer).toLowerCase()) < 0) return false;
      if (q.note && (i.additionalNote || '').toLowerCase().indexOf(String(q.note).toLowerCase()) < 0) return false;
      if (q.from && day < q.from) return false; if (q.to && day > q.to) return false;
      if (q.openOnly === 'true' && !(i.balance > 0.004)) return false;
      return true;
    }).sort(function (a, b) { return a.inv.createdUtc < b.inv.createdUtc ? 1 : -1; }).slice(0, 60)
      .map(function (x) { return { id: x.id, invoiceNo: x.inv.invoiceNo, date: x.inv.createdUtc, customerName: (x.inv.customer && x.inv.customer.name) || '', total: x.inv.total, status: x.inv.balance > 0.004 ? 'Open' : 'Paid' }; });
  });
  route('GET', '/api/service-sales/recurring/:id', function (ctx) {
    var inv = Api.db.invoices[Number(ctx.params.id) - 1];
    need(inv && !inv.isLayby, 'Invoice not found.', 404);
    return { invoiceNo: inv.invoiceNo, customer: inv.customer, customerName: (inv.customer && inv.customer.name) || '', serviceTerms: inv.serviceTerms === 'ACCOUNT' ? 'ACCOUNT' : 'COD',
      items: inv.lines.map(function (l) {
        var p = Api.product(l.productId) || {};
        return Object.assign(Api.productRow(p, inv.shopId), { productName: l.name, quantity: l.quantity, unitPrice: l.originalPrice, currentUnitPrice: p.price, serviceDescription: l.serviceDescription || '', stockItem: !!p.stockItem, applyVat: l.vatRate > 0 });
      }) };
  });

  // ---- pricing rules ---------------------------------------------------------------------
  route('GET', '/api/pricing/setup', function () { var p = Api.db.pricing; return { policy: p.policy, priceBreaks: p.priceBreaks, promotions: p.promotions }; });
  route('POST', '/api/pricing/policy', function (ctx) {
    Api.db.pricing.policy = { priceBreaksEnabled: !!ctx.body.priceBreaksEnabled, promotionsEnabled: !!ctx.body.promotionsEnabled };
    return { message: 'Branch pricing options saved.' };
  });
  route('POST', '/api/pricing/price-break', function (ctx) {
    var b = ctx.body, list = Api.db.pricing.priceBreaks;
    need(Number(b.code) > 0, 'Enter a group code.'); need(String(b.description || '').trim(), 'Enter a description.');
    need(Number(b.quantity) > 0, 'Enter the quantity per batch.'); need(Number(b.discount) >= 0, 'Enter the discount per batch.');
    need((b.productIds || []).length || list.some(function (r) { return r.PromotionId === Number(b.id); }), 'Choose at least one product.');
    var row = list.filter(function (r) { return r.PromotionId === Number(b.id); })[0];
    need(!list.some(function (r) { return r !== row && r.Code === Number(b.code); }), 'This group code is already used.');
    if (!row) { row = { PromotionId: Api.next('priceBreak') + 1, ProductIds: [] }; list.push(row); }
    Object.assign(row, { Code: Number(b.code), Description: String(b.description).trim(), Break1_Quantity: Number(b.quantity), Break1_Price: Number(b.discount), Active: !!b.active });
    if ((b.productIds || []).length) row.ProductIds = b.productIds.map(Number);
    return { message: 'Price break saved.', number: String(row.Code) };
  });
  route('POST', '/api/pricing/promotion', function (ctx) {
    var b = ctx.body, list = Api.db.pricing.promotions;
    need(String(b.name || '').trim(), 'Enter a promotion name.'); need(Number(b.value) >= 0, 'Enter the discount value.');
    need(b.startDate && b.endDate && b.startDate <= b.endDate, 'The end date must be on or after the start date.');
    if (b.scope === 'Department') need(b.categoryId, 'Choose a category.'); else need((b.productIds || []).length || list.some(function (r) { return r.PromotionHeaderId === Number(b.id); }), 'Choose at least one product.');
    var row = list.filter(function (r) { return r.PromotionHeaderId === Number(b.id) && r.ShopId != null; })[0];
    if (!row) { row = { PromotionHeaderId: Api.next('promotion') + 1, ShopId: Api.shopId(b.shopId), ProductIds: [] }; list.push(row); }
    Object.assign(row, { PromotionName: String(b.name).trim(), PromotionScope: b.scope || 'Product', PromotionCategoryId: b.categoryId || null, PromotionDiscountType: b.discountType || 'SpecialPrice', PromotionDiscountValue: Number(b.value),
      PromotionMinimumQty: Number(b.minimumQuantity) || 1, PromotionApplyMode: b.applyMode || 'PerItem', StartDate: b.startDate, EndDate: b.endDate, StartTime: b.startTime || '00:00', EndTime: b.endTime || '23:59',
      DailyWindow: !!b.dailyWindow, InActive: !!b.active, PromotionDays: b.days || '0,1,2,3,4,5,6' });
    if (b.scope !== 'Department' && (b.productIds || []).length) row.ProductIds = b.productIds.map(Number);
    return { message: 'Promotion saved.', number: row.PromotionName };
  });

  // ---- customer statement and aging ------------------------------------------------------
  route('GET', '/api/customer-reports/statement', function (ctx) {
    var q = ctx.q, shopId = Api.shopId(q.shopId), c = Api.customer(q.customerId), db = Api.db;
    need(c, 'Choose a customer.');
    var from = (q.from || '1970-01-01'), to = (q.to || Api.today());
    var events = [];
    db.invoices.forEach(function (i) { if (i.serviceTerms === 'ACCOUNT' && i.customerId === c.customerId && i.shopId === shopId) events.push({ at: i.createdUtc, document: i.invoiceNo, kind: 'Invoice', debit: i.total, credit: 0 }); });
    db.customerPayments.forEach(function (p) { if (p.customerId === c.customerId && p.shopId === shopId) events.push({ at: p.createdUtc, document: p.receiptNo, kind: 'Payment', debit: 0, credit: p.total }); });
    (db.refunds || []).forEach(function (r) {
      var inv = invoiceById(r.requestId);
      if (inv && inv.serviceTerms === 'ACCOUNT' && inv.customerId === c.customerId && inv.shopId === shopId) events.push({ at: r.createdUtc, document: r.refundNo, kind: 'Credit note', debit: 0, credit: r.total });
    });
    events.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    var opening = 0, running = 0, entries = [];
    events.forEach(function (e) {
      var day = dateOnly(e.at);
      if (day < from) { opening += e.debit - e.credit; return; }
      if (day > to) return;
      if (!entries.length) running = opening;
      running = round2(running + e.debit - e.credit);
      entries.push({ date: e.at, document: e.document, kind: e.kind, debit: e.debit, credit: e.credit, balance: running });
    });
    opening = round2(opening);
    return { customer: { name: c.name, code: c.customerNo, phone: c.phone, email: c.email }, opening: opening, entries: entries, closing: entries.length ? entries[entries.length - 1].balance : opening, from: from + 'T00:00:00', to: to + 'T00:00:00', company: Api.companyReceipt() };
  });
  route('GET', '/api/customer-reports/aging', function (ctx) {
    var q = ctx.q, shopId = Api.shopId(q.shopId), asOf = q.asOf || Api.today(), asMs = new Date(asOf + 'T23:59:59').getTime();
    var summary = {}, details = [];
    Api.db.invoices.forEach(function (i) {
      if (i.serviceTerms !== 'ACCOUNT' || i.shopId !== shopId || !(i.balance > 0.004)) return;
      if (q.customerId && i.customerId !== Number(q.customerId)) return;
      var age = Math.max(0, Math.floor((asMs - new Date(i.createdUtc).getTime()) / 864e5)), c = Api.customer(i.customerId);
      var s = summary[c.customerId] = summary[c.customerId] || { code: c.customerNo, customer: c.name, current: 0, days31To60: 0, days61To90: 0, over90: 0, total: 0 };
      var bucket = age <= 30 ? 'current' : age <= 60 ? 'days31To60' : age <= 90 ? 'days61To90' : 'over90';
      s[bucket] = round2(s[bucket] + i.balance); s.total = round2(s.total + i.balance);
      details.push({ customer: c.name, invoiceNo: i.invoiceNo, date: i.createdUtc, ageDays: age, balance: i.balance });
    });
    return { summary: Object.keys(summary).map(function (k) { return summary[k]; }), details: details.sort(function (a, b) { return b.ageDays - a.ageDays; }), asOf: asOf + 'T00:00:00', company: Api.companyReceipt() };
  });

  // ---- offline catalogue ---------------------------------------------------------------
  route('GET', '/api/offline/catalog', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), now = Date.now();
    return { products: Api.db.products.filter(function (p) { var c = Api.category(p.categoryId); return p.active !== false && c && c.displayOnSales; }).map(function (p) { return Api.productRow(p, shopId); }),
      componentRecipes: Object.keys(Api.db.recipes).map(function (id) { return { productId: Number(id), version: 1 }; }), downloadedUtc: new Date(now - 1000).toISOString(), expiresUtc: new Date(now + 8 * 3600000).toISOString() };
  });

  // ---- simulated accounting link --------------------------------------------------------
  var CUSTOMERS = ['Island Catering Ltd', 'Aroha Traders', 'Sample School Canteen', 'Harbour Cafe', 'Reef Lodge'];
  function config(provider) { var c = Api.db.accounting.configs.filter(function (x) { return x.provider === provider; })[0]; need(c, 'Choose a provider.'); return c; }
  function sourceInvoices(provider) {
    var rnd = Api.rng(provider.length * 977 + provider.charCodeAt(0)), out = [], items = ['Catering platter', 'Weekly noodle supply', 'Dumplings (frozen, 25)', 'Event hire', 'Delivery fee', 'Lunch boxes'];
    for (var n = 0; n < 14; n++) {
      var lines = [], count = 1 + Math.floor(rnd() * 3);
      for (var k = 0; k < count; k++) lines.push({ description: items[Math.floor(rnd() * items.length)], quantity: 1 + Math.floor(rnd() * 5), amount: Math.round((40 + rnd() * 260) * 100) / 100, taxCode: rnd() < 0.85 ? 'VAT' : 'ZERO', taxInclusive: true });
      var total = round2(lines.reduce(function (s, l) { return s + l.amount; }, 0)), tax = round2(lines.filter(function (l) { return l.taxCode === 'VAT'; }).reduce(function (s, l) { return s + l.amount * 12.5 / 112.5; }, 0));
      out.push({ remoteId: provider + '-R' + (1001 + n), layout: 'Service', number: provider.charAt(0) + '-' + (1001 + n), date: dateOnly(ago(n * 2 + 1)), customer: CUSTOMERS[n % CUSTOMERS.length], total: total, tax: tax, lines: lines, provider: provider });
    }
    return out;
  }
  function signedKey(provider, remoteId) { return provider + ':' + remoteId; }
  function journal(src) {
    return ['FRCS SANDBOX - DEMO ONLY', Api.db.company.name, 'Invoice ' + src.number, src.customer, '------------------------------'].concat(src.lines.map(function (l) { return l.description + '  ' + l.quantity + ' x ' + l.amount.toFixed(2); }),
      ['------------------------------', 'TOTAL ' + src.total.toFixed(2), 'VAT ' + src.tax.toFixed(2), 'Signed in the demo, not by FRCS.']).join('\n');
  }
  route('GET', '/api/accounting/settings', function () { return Api.db.accounting.configs.map(function (c) { return Object.assign({}, c); }); });
  route('POST', '/api/accounting/settings', function (ctx) {
    var b = ctx.body, c = config(b.provider);
    need(String(b.clientId || '').trim(), 'Enter the client ID.'); need(b.homeCurrency, 'Confirm the company currency.');
    Object.assign(c, { clientId: String(b.clientId).trim(), homeCurrency: b.homeCurrency, redirectUri: b.redirectUri || '', sandbox: !!b.sandbox });
    return { message: b.provider + ' settings saved.' };
  });
  route('POST', '/api/accounting/connect', function (ctx) {
    var c = config(ctx.body.provider);
    need(c.clientId, 'Save the provider app settings first.');
    return { url: 'accounting-callback.html?code=demo-code&state=' + encodeURIComponent(c.provider) };
  });
  route('POST', '/api/accounting/oauth/complete', function (ctx) {
    var c = config(ctx.body.state);
    Object.assign(c, { connected: true, companyName: 'Sample Company Ltd', companyId: 'co-1' });
    return { message: c.provider + ' is now connected (demo). Return to the POS and choose Refresh settings / companies.' };
  });
  route('GET', '/api/accounting/companies', function (ctx) { var c = config(ctx.q.provider); need(c.connected, 'Connect this provider first.'); return [{ id: 'co-1', name: 'Sample Company Ltd' }, { id: 'co-2', name: 'Sample Cafe Ltd' }]; });
  route('POST', '/api/accounting/company', function (ctx) {
    var c = config(ctx.body.provider); need(c.connected, 'Connect this provider first.'); need(ctx.body.companyId, 'Choose a company.');
    c.companyId = ctx.body.companyId; c.companyName = ctx.body.companyId === 'co-2' ? 'Sample Cafe Ltd' : 'Sample Company Ltd';
    return { message: 'Company selected: ' + c.companyName + '.' };
  });
  route('GET', '/api/accounting/invoices', function (ctx) {
    var q = ctx.q, c = config(q.provider), size = 8, pageNo = Math.max(1, Number(q.page) || 1), db = Api.db;
    need(c.connected, 'Connect this provider first.');
    var rows = sourceInvoices(c.provider).filter(function (s) { return (!q.from || s.date >= q.from) && (!q.to || s.date <= q.to); });
    return { invoices: rows.slice((pageNo - 1) * size, pageNo * size).map(function (s) {
      var signed = db.accounting.signed[signedKey(c.provider, s.remoteId)];
      return { id: signed ? 'acc-' + s.remoteId : null, remoteId: s.remoteId, layout: s.layout, number: s.number, date: s.date, customer: s.customer, total: s.total, status: 'Open', fiscalStatus: signed ? 'SIGNED' : 'DRAFT' };
    }), hasMore: rows.length > pageNo * size };
  });
  function accountingDoc(provider, remoteId) {
    var s = sourceInvoices(provider).filter(function (x) { return x.remoteId === remoteId; })[0], signed = Api.db.accounting.signed[signedKey(provider, remoteId)];
    need(s, 'Invoice not found.', 404);
    return { id: 'acc-' + remoteId, status: signed ? 'SIGNED' : 'DRAFT', shopId: 1, invoice: { number: s.number, customer: s.customer, provider: provider, currency: 'FJD', total: s.total, tax: s.tax, lines: s.lines },
      receipt: signed ? { journal: signed.journal, verificationQRCode: '' } : null };
  }
  route('GET', '/api/accounting/invoice', function (ctx) { return accountingDoc(ctx.q.provider, ctx.q.remoteId); });
  route('GET', '/api/accounting/invoice/:id', function (ctx) {
    var remoteId = ctx.params.id.replace(/^acc-/, ''), provider = remoteId.split('-')[0];
    return accountingDoc(provider, remoteId);
  });
  route('GET', '/api/accounting/tax-codes', function (ctx) {
    var provider = config(ctx.q.provider).provider;
    return { codes: [{ code: 'VAT', name: 'VAT 12.5%', rate: 12.5 }, { code: 'ZERO', name: 'Zero-rated supplies', rate: 0 }, { code: 'EXEMPT', name: 'Exempt supplies', rate: 0 }], links: Api.db.accounting.taxLinks[provider] || [] };
  });
  route('POST', '/api/accounting/tax-links', function (ctx) {
    var provider = config(ctx.body.provider).provider;
    Api.db.accounting.taxLinks[provider] = (ctx.body.links || []).map(function (l) { return { taxCode: l.taxCode, vmsLabel: l.vmsLabel, rate: Number(l.rate) }; });
    return { message: 'Tax links saved.' };
  });
  route('POST', '/api/accounting/fiscalize', function (ctx) {
    var remoteId = String(ctx.body.requestId || '').replace(/^acc-/, ''), provider = remoteId.split('-')[0], s = sourceInvoices(provider).filter(function (x) { return x.remoteId === remoteId; })[0];
    need(s, 'Invoice not found.', 404);
    var key = signedKey(provider, remoteId), entry = Api.db.accounting.signed[key] || (Api.db.accounting.signed[key] = { journal: journal(s) });
    return { message: 'Invoice signed (demo).', receipt: { journal: entry.journal, verificationQrCode: '' } };
  });

  // a finished count waiting for review (made last, so its snapshot matches the stock)
  Api.module({
    afterSeed: function (db) {
      var p = Api.productByCode;
      var cat = ['B01', 'B02', 'B03', 'B04', 'F01', 'F02'].map(function (c, i) { var x = p(c); var snap = Api.stockOf(1, x.productId); return { productId: x.productId, code: x.code, name: x.name, snapshot: snap, quantity: snap + (i % 3 === 0 ? -2 : i % 3 === 1 ? 1 : 0) }; });
      db.stocktakes.push({ id: Api.uuid(), requestId: null, shopId: 1, state: 'UPLOADED', batchNo: 'B-0001', createdUtc: ago(0, 1, 5), userId: 1, catalog: cat });
    }
  });
})();
