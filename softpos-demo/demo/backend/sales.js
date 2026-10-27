// Demo back end, part 3: pricing, checkout, receipts, held sales, quotations and approvals.
(function () {
  'use strict';
  var Api = window.DemoApi, route = Api.route, round2 = Api.round2, need = Api.need;

  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  Api.rng = rng;
  Api.module({
    seed: function (db) {
      db.invoices = []; db.holds = []; db.quotations = [];
      db.pricing = { policy: { priceBreaksEnabled: true, promotionsEnabled: true }, priceBreaks: [], promotions: [] };
      db.approvals = {};
    },
    // A few weeks of invented trading so the dashboard and reports have something to show.
    afterSeed: function (db) {
      var r = rng(20261026), now = new Date();
      var dishes = db.products.filter(function (p) { return p.active && p.categoryId < 8 && p.price > 0; });
      var cashier = db.users[1], admin = db.users[0];
      for (var d = 24; d >= 0; d--) {
        var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
        var count = d === 0 ? 3 : 4 + Math.floor(r() * 6);
        for (var i = 0; i < count; i++) {
          var items = [], n = 1 + Math.floor(r() * 3);
          for (var k = 0; k < n; k++) items.push({ productId: dishes[Math.floor(r() * dishes.length)].productId, quantity: 1 + (r() < 0.25 ? 1 : 0), note: '' });
          var hour = 11 + Math.floor(r() * 9), minute = Math.floor(r() * 60);
          var when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
          if (when > now) when = new Date(now.getTime() - (i + 1) * 600000);
          var priced = priceCart(1, items, { noPromotions: true });
          var pick = r(), method = pick < 0.55 ? 'CASH' : pick < 0.8 ? 'MPAISA' : pick < 0.93 ? 'EFTPOS' : 'MYCASH', due = priced.total;
          var cash = method === 'CASH', rounding = cashRounding(due, cash);
          var tendered = cash ? Math.ceil((due + rounding) / 5) * 5 : due;
          createInvoice({ requestId: Api.uuid(), shopId: 1, items: items, customerId: r() < 0.1 ? 4 : null, payment: { method: method, tendered: tendered, reference: cash ? '' : 'REF' + Math.floor(r() * 90000 + 10000),
            bankId: method === 'EFTPOS' ? 1 : undefined } }, { createdUtc: when.toISOString(), user: r() < 0.7 ? cashier : admin });
        }
      }
    }
  });

  // ---- cash rounding and card surcharge (same rules as the browser) ---------------
  function cashRounding(total, hasCash) { return hasCash ? (Math.round(Math.round(total * 100) / 5) * 5 - Math.round(total * 100)) / 100 : 0; }
  function cardSurcharge(amount, rate) { if (!(amount > 0) || !(rate > 0)) return 0; return Math.floor((Math.round(amount * 100) * Math.round(rate * 100) + 5000) / 10000) / 100; }
  Api.cashRounding = cashRounding; Api.cardSurcharge = cardSurcharge;

  // ---- pricing -------------------------------------------------------------------
  function hhmm(value) { return String(value || '').slice(0, 5); }
  function promoActive(promo, shopId, when) {
    if (promo.ShopId != null && Number(promo.ShopId) !== Number(shopId)) return false;
    if (!promo.InActive) return false;
    var day = when.toISOString().slice(0, 10);
    if (promo.StartDate && day < String(promo.StartDate).slice(0, 10)) return false;
    if (promo.EndDate && day > String(promo.EndDate).slice(0, 10)) return false;
    var days = String(promo.PromotionDays == null ? '0,1,2,3,4,5,6' : promo.PromotionDays).split(',');
    if (days.indexOf(String(when.getDay())) < 0) return false;
    if (promo.DailyWindow) {
      var now = ('0' + when.getHours()).slice(-2) + ':' + ('0' + when.getMinutes()).slice(-2);
      if (now < hhmm(promo.StartTime) || now > hhmm(promo.EndTime || '23:59')) return false;
    }
    return true;
  }
  function priceCart(shopId, items, opts) {
    opts = opts || {};
    var db = Api.db, vat = db.company.vat, policy = db.pricing.policy || {};
    need(Array.isArray(items) && items.length, 'The sale has no items.');
    var lines = items.map(function (it) {
      var p = Api.product(it.productId);
      need(p && p.active !== false, 'A product in this sale is no longer available.');
      var qty = Number(it.quantity);
      need(isFinite(qty) && qty > 0, 'Enter a quantity above zero for ' + p.name + '.');
      var manual = it.unitPrice != null && isFinite(Number(it.unitPrice));
      var base = manual ? Number(it.unitPrice) : p.price;
      var dPct = Number(it.discountPercent) || 0, dAmt = Number(it.discountAmount) || 0;
      var price = dAmt > 0 ? Math.max(0, round2(base - dAmt)) : dPct > 0 ? round2(base * (1 - dPct / 100)) : base;
      return { item: it, p: p, qty: qty, base: base, price: price, manual: manual, discounted: price < base, rate: it.applyVat === false ? 0 : (p.vat ? vat : 0), extra: 0 };
    });
    // scheduled promotions, unless the cashier set a price or a discount by hand
    if (policy.promotionsEnabled !== false && !opts.noPromotions) {
      var now = new Date();
      var promos = db.pricing.promotions.filter(function (r) { return promoActive(r, shopId, now); });
      lines.forEach(function (l) {
        if (l.manual || l.discounted) return;
        var best = null;
        promos.forEach(function (r) {
          var scope = r.PromotionScope || 'Product';
          var hit = scope === 'Department' ? Number(r.PromotionCategoryId) === l.p.categoryId : (r.ProductIds || []).indexOf(l.p.productId) >= 0;
          if (!hit || l.qty < (Number(r.PromotionMinimumQty) || 1)) return;
          var v = Number(r.PromotionDiscountValue ?? r.TypeValue), type = r.PromotionDiscountType || 'SpecialPrice';
          var np = type === 'SpecialPrice' ? v : type === 'Percent' ? round2(l.base * (1 - v / 100)) : Math.max(0, round2(l.base - v));
          if (np < l.base && (!best || np < best.price)) best = { price: np, every: r.PromotionApplyMode === 'EveryQtyBreak', min: Number(r.PromotionMinimumQty) || 1 };
        });
        if (best) {
          var units = best.every ? Math.floor(l.qty / best.min) * best.min : l.qty;
          l.extra += round2((l.base - best.price) * units);
        }
      });
    }
    // quantity price breaks (a group of products shares one batch size)
    if (policy.priceBreaksEnabled !== false) {
      db.pricing.priceBreaks.filter(function (r) { return r.Active; }).forEach(function (r) {
        var members = lines.filter(function (l) { return (r.ProductIds || []).indexOf(l.p.productId) >= 0 && !l.manual && !l.discounted; });
        var qty = members.reduce(function (s, l) { return s + l.qty; }, 0), size = Number(r.Break1_Quantity) || 0;
        if (!size || qty < size) return;
        var discount = Math.floor(qty / size) * Number(r.Break1_Price);
        var totalValue = members.reduce(function (s, l) { return s + l.price * l.qty; }, 0) || 1;
        members.forEach(function (l) { l.extra += round2(discount * (l.price * l.qty) / totalValue); });
      });
    }
    var out = lines.map(function (l) {
      var gross = round2(l.base * l.qty), net = round2(l.price * l.qty - l.extra);
      net = Math.max(0, net);
      var vatAmount = l.rate > 0 ? round2(net * l.rate / (100 + l.rate)) : 0;
      return { productId: l.p.productId, name: l.p.name, quantity: l.qty, price: l.qty ? round2(net / l.qty) : l.price, originalPrice: l.base, total: net, vatRate: l.rate, vatAmount: vatAmount,
        serviceDescription: l.item.serviceDescription || null, discountAmount: round2(Math.max(0, gross - net)), note: l.item.note || '', stockItem: l.p.stockItem, _p: l.p };
    });
    var total = round2(out.reduce(function (s, x) { return s + x.total; }, 0));
    return { lines: out, total: total, vatAmount: round2(out.reduce(function (s, x) { return s + x.vatAmount; }, 0)), creditCardFeePercent: db.company.ccFee };
  }
  Api.priceCart = priceCart;
  function publicPreview(priced) {
    return { total: priced.total, vatAmount: priced.vatAmount, creditCardFeePercent: priced.creditCardFeePercent,
      lines: priced.lines.map(function (l) { var c = Object.assign({}, l); delete c._p; return c; }) };
  }
  route('POST', '/api/checkout/preview', function (ctx) {
    var b = ctx.body, shopId = Api.shopId(b.shopId);
    return publicPreview(priceCart(shopId, b.items || []));
  });
  route('POST', '/api/checkout/draft-preview', function (ctx) {
    var b = ctx.body;
    return publicPreview(priceCart(Api.shopId(b.shopId), b.items || []));
  });

  // ---- numbering and the sale record ----------------------------------------------
  function nextInvoiceNo() { return 'INV-' + Api.pad(Api.next('invoice'), 5); }
  Api.nextInvoiceNo = nextInvoiceNo;
  function customerCard(id) {
    var c = id ? Api.customer(id) : null;
    return c ? { customerId: c.customerId, customerNo: c.customerNo, name: c.name, phone: c.phone, email: c.email, tin: c.tin, address: c.address } : null;
  }
  function saleView(inv) {
    return { invoiceNo: inv.invoiceNo, total: inv.total, surcharge: inv.surcharge, surchargeRate: inv.surchargeRate, lines: inv.lines, payment: inv.payment, customer: inv.customer, salesRepName: inv.salesRepName,
      serviceTerms: inv.serviceTerms || null, balance: inv.balance || 0, customerDetail: inv.customerDetail || null, customerPoNumber: inv.customerPoNumber || null,
      invoiceReference: inv.invoiceReference || null, additionalNote: inv.additionalNote || null, isLayby: !!inv.isLayby, companyReceipt: Api.companyReceipt(), requestId: inv.requestId,
      InvoiceNo: inv.invoiceNo, RequestId: inv.requestId };
  }
  Api.saleView = saleView; Api.customerCard = customerCard;

  // payments: parts = [{method, tendered, baseAmount?, reference?, bankId?}]
  function settle(base, payment, rate, terms) {
    var parts = payment && payment.parts ? payment.parts : [payment];
    parts = parts.filter(function (p) { return p && p.method; });
    if (terms === 'ACCOUNT') return { total: base, surcharge: 0, payment: { method: 'ACCOUNT', tendered: 0, change: 0, rounding: 0, parts: [] }, balance: base };
    need(parts.length, 'Add a payment first.');
    var card = parts.filter(function (p) { return p.method === 'CARD'; })[0];
    var surcharge = card ? cardSurcharge(Number(card.baseAmount != null ? card.baseAmount : card.tendered), rate) : 0;
    var total = round2(base + surcharge);
    var hasCash = parts.some(function (p) { return p.method === 'CASH'; });
    var rounding = cashRounding(total, hasCash), due = round2(total + rounding);
    var external = round2(parts.filter(function (p) { return p.method !== 'CASH'; }).reduce(function (s, p) { return s + Number(p.tendered); }, 0));
    var cash = parts.filter(function (p) { return p.method === 'CASH'; })[0];
    var tendered = round2(parts.reduce(function (s, p) { return s + Number(p.tendered); }, 0));
    need(tendered + 0.00001 >= due, 'The payments do not cover the total.');
    var change = 0;
    var out = parts.map(function (p) {
      var bank = p.bankId ? (Api.db.banks.filter(function (b) { return b.id === Number(p.bankId); })[0] || {}).name : '';
      if (p.method === 'CASH') {
        var needed = round2(due - external);
        change = round2(Number(p.tendered) - needed);
        return { method: 'CASH', tendered: Number(p.tendered), applied: round2(needed - rounding), rounding: rounding, reference: '', bankName: '' };
      }
      return { method: p.method, tendered: Number(p.tendered), applied: p.method === 'CARD' ? round2(Number(p.tendered) - surcharge) : Number(p.tendered), rounding: 0, reference: p.reference || '', bankName: bank || '' };
    });
    if (!cash) change = round2(tendered - due);
    return { total: total, surcharge: surcharge, balance: 0,
      payment: { method: out.length > 1 ? 'SPLIT' : out[0].method, tendered: tendered, change: Math.max(0, change), rounding: rounding, reference: out[0].reference, parts: out } };
  }
  Api.settle = settle;

  function createInvoice(b, opts) {
    var db = Api.db;
    opts = opts || {};
    var shopId = Api.shopId(b.shopId), priced = priceCart(shopId, b.items || []);
    var terms = b.serviceTerms || null;
    if (terms === 'ACCOUNT') need(b.customerId && (Api.customer(b.customerId) || {}).accountEnabled, 'Choose a customer with an account.');
    if (b.expectedTotal != null && Number(b.expectedTotal) > 0 && terms !== 'ACCOUNT') {
      // the browser may include a card surcharge in expectedTotal; the total is validated after settlement
    }
    var settled = settle(priced.total, b.payment, db.company.ccFee, terms);
    var no = nextInvoiceNo();
    var user = opts.user || Api.user();
    var rep = b.salesRepId ? db.salesReps.filter(function (r) { return r.id === Number(b.salesRepId); })[0] : null;
    var inv = { requestId: b.requestId || Api.uuid(), invoiceNo: no, shopId: shopId, createdUtc: opts.createdUtc || Api.nowIso(), userId: user.id, cashier: user.fullName,
      customerId: b.customerId || null, customer: customerCard(b.customerId), salesRepName: rep ? rep.name : null,
      lines: priced.lines.map(function (l) { var c = Object.assign({}, l); delete c._p; return c; }), total: settled.total, vat: priced.vatAmount, surcharge: settled.surcharge,
      surchargeRate: settled.surcharge > 0 ? db.company.ccFee : 0, payment: settled.payment, serviceTerms: terms, balance: settled.balance || 0, additionalNote: b.additionalNote || '',
      invoiceReference: b.invoiceReference || '', customerPoNumber: b.customerPoNumber || '', customerDetail: b.customerDetail || '', quotationId: b.quotationId || null, refunds: [], isLayby: !!opts.layby };
    db.invoices.push(inv);
    var options = Api.salesOptions(shopId);
    Api.at = opts.createdUtc || null; Api.atUser = user.fullName;
    try { priced.lines.forEach(function (l) { Api.consume(shopId, l.productId, l.quantity, no, options); }); } finally { Api.at = null; Api.atUser = null; }
    if (b.heldSaleId) db.holds = db.holds.filter(function (h) { return h.id !== Number(b.heldSaleId); });
    if (b.quotationId) { var q = db.quotations.filter(function (x) { return x.quotationId === Number(b.quotationId); })[0]; if (q) q.invoiceNo = no; }
    return inv;
  }
  Api.createInvoice = createInvoice;

  route('POST', '/api/checkout', function (ctx) {
    var b = ctx.body, db = Api.db;
    var again = db.invoices.filter(function (i) { return i.requestId === b.requestId; })[0];
    if (again) return saleView(again);
    if (b.isLayby) return saleView(Api.createLayby(b));
    return saleView(createInvoice(b, b.offline && b.offline.createdUtc ? { createdUtc: b.offline.createdUtc } : null));
  });
  route('GET', '/api/checkout/:id/signed-receipt', function () { return null; });
  route('POST', '/api/checkout/:id/sandbox-receipt', function () { throw new Api.ApiError(400, 'VMS signing is not part of this demo.'); });
  route('GET', '/api/checkout/recent', function (ctx) {
    var q = ctx.q, rows = Api.db.invoices.filter(function (i) {
      if (q.startUtc && i.createdUtc < q.startUtc) return false;
      if (q.endUtc && i.createdUtc >= q.endUtc) return false;
      if (q.invoiceNo && i.invoiceNo.toLowerCase().indexOf(String(q.invoiceNo).toLowerCase()) < 0) return false;
      return true;
    }).sort(function (a, b) { return a.createdUtc < b.createdUtc ? 1 : -1; }).slice(0, 50);
    return rows.map(function (i) { return { requestId: i.requestId, sale: saleView(i), shopId: i.shopId, createdUtc: i.createdUtc }; });
  });

  // ---- approvals ------------------------------------------------------------------
  route('POST', '/api/sales-actions/authorize', function () { var id = 'auth-' + Api.next('auth'); Api.db.approvals[id] = true; return { id: id }; });
  route('POST', '/api/sales-actions/approve', function (ctx) {
    var name = String(ctx.body.userName || '').trim().toLowerCase();
    need(name && ctx.body.password, 'Enter the approver user name and password.');
    var u = Api.db.users.filter(function (x) { return x.userName.toLowerCase() === name || x.email.toLowerCase() === name; })[0];
    need(u && (u.role === 'Admin' || u.role === 'Supervisor' || u.role === 'SuperAdmin'), 'This user cannot approve sales actions.');
    var id = 'auth-' + Api.next('auth'); Api.db.approvals[id] = true; return { id: id };
  });

  // ---- held sales ------------------------------------------------------------------
  function snapshotItems(items, shopId) {
    return (items || []).map(function (it) {
      var p = Api.product(it.productId);
      var row = Api.productRow(p, shopId);
      return Object.assign({}, row, { quantity: Number(it.quantity), originalQuantity: Number(it.quantity), note: it.note || '', unitPrice: p.price, unitPriceOverride: it.unitPrice == null ? null : Number(it.unitPrice),
        discountPercent: Number(it.discountPercent) || 0, discountAmount: Number(it.discountAmount) || 0, discountType: Number(it.discountAmount) > 0 ? 'amount' : 'percent',
        serviceDescription: it.serviceDescription || '', applyVat: it.applyVat });
    });
  }
  route('POST', '/api/sales-holds', function (ctx) {
    var b = ctx.body, shopId = Api.shopId(b.shopId);
    var priced = priceCart(shopId, b.items || []);
    var cust = customerCard(b.customerId);
    var h = { id: Api.next('hold'), shopId: shopId, requestId: b.requestId, createdUtc: Api.nowIso(), total: priced.total,
      snapshot: { customer: cust ? { CustomerId: cust.customerId, Name: cust.name, Phone: cust.phone, Email: cust.email, Tin: cust.tin } : null, items: snapshotItems(b.items, shopId),
        additionalNote: b.additionalNote || '', customerDetail: b.customerDetail || null, invoiceReference: b.invoiceReference || '', customerPoNumber: b.customerPoNumber || '', serviceTerms: b.serviceTerms || null, salesRepId: b.salesRepId || null } };
    Api.db.holds.push(h);
    return { id: h.id, ok: true };
  });
  route('GET', '/api/sales-holds', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId);
    return Api.db.holds.filter(function (h) { return h.shopId === shopId && (!ctx.q.id || h.id === Number(ctx.q.id)); });
  });
  route('POST', '/api/sales-holds/:id/remove', function (ctx) {
    Api.db.holds = Api.db.holds.filter(function (h) { return h.id !== Number(ctx.params.id); });
    return { ok: true };
  });
  route('GET', '/api/holds', function () { return []; });
  route('GET', '/api/holds/table/:id', function () { throw new Api.ApiError(404, 'This table has no held order.'); });
  route('POST', '/api/holds', function () { throw new Api.ApiError(400, 'Table orders are not configured in this demo.'); });

  // ---- quotations -----------------------------------------------------------------
  route('POST', '/api/quotations', function (ctx) {
    var b = ctx.body, shopId = Api.shopId(b.shopId), db = Api.db;
    need(b.customerId && Api.customer(b.customerId), 'Please select a customer.');
    var priced = priceCart(shopId, b.items || [], { noPromotions: true });
    var id = Api.next('quotation');
    var q = { quotationId: id, quotationNo: Api.pad(id, 3), shopId: shopId, customerId: Number(b.customerId), quotationDate: Api.nowIso(), createdBy: Api.user().userName, reference: b.reference || '', note: b.note || '',
      customerPoNumber: '', items: (b.items || []).map(function (it) { return Object.assign({}, it); }), lines: priced.lines.map(function (l) { var c = Object.assign({}, l); delete c._p; return c; }), total: priced.total, cancelled: false, invoiceNo: '' };
    db.quotations.push(q);
    return { number: q.quotationNo, quotationId: id, message: 'Quotation saved.' };
  });
  route('GET', '/api/quotations', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId);
    return Api.db.quotations.filter(function (q) { return q.shopId === shopId; }).sort(function (a, b) { return b.quotationId - a.quotationId; }).map(function (q) {
      return { quotationId: q.quotationId, quotationNo: q.quotationNo, customerName: (Api.customer(q.customerId) || {}).name || '', quotationDate: q.quotationDate, createdBy: q.createdBy, total: q.total, cancelled: q.cancelled, invoiceNo: q.invoiceNo };
    });
  });
  function quote(id) { var q = Api.db.quotations.filter(function (x) { return x.quotationId === Number(id); })[0]; need(q, 'Quotation not found.', 404); return q; }
  route('GET', '/api/quotations/:id/document', function (ctx) {
    var q = quote(ctx.params.id), c = Api.customer(q.customerId) || {};
    return { header: { quotationNo: q.quotationNo, cancelled: q.cancelled, customerName: c.name, quotationDate: q.quotationDate, reference: q.reference, note: q.note },
      company: Api.companyReceipt(), items: q.lines.map(function (l) { return { name: l.name, description: l.serviceDescription || '', quantity: l.quantity, price: l.price, total: l.total, vatAmount: l.vatAmount }; }) };
  });
  route('GET', '/api/quotations/:id/sale', function (ctx) {
    var q = quote(ctx.params.id);
    need(!q.cancelled && !q.invoiceNo, 'This quotation is no longer open.');
    return { quotationNo: q.quotationNo, customer: customerCard(q.customerId), note: q.note, reference: q.reference, customerPoNumber: q.customerPoNumber,
      items: q.items.map(function (it) { var p = Api.product(it.productId); return Object.assign(Api.productRow(p, q.shopId), { productId: it.productId, quantity: Number(it.quantity), unitPrice: it.unitPrice == null ? p.price : Number(it.unitPrice), note: it.note || '', applyVat: it.applyVat, stockItem: p.stockItem }); }) };
  });
  route('POST', '/api/quotations/:id/cancel', function (ctx) { quote(ctx.params.id).cancelled = true; return { ok: true }; });
})();
