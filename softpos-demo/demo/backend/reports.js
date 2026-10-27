// Demo back end, part 6: sales reports, stock reports, the dashboard and the X / Z reports. All numbers come from the demo's own invoices, refunds and stock movements.
(function () {
  'use strict';
  var Api = window.DemoApi, route = Api.route, round2 = Api.round2, round4 = Api.round4, need = Api.need;
  var PAGE = 50;
  var METHODS = ['CASH', 'MPAISA', 'MYCASH', 'CHEQUE', 'EFTPOS', 'CARD', 'VOUCHER', 'EBANKING'];
  var METHOD_LABEL = { CASH: 'Cash', MPAISA: 'M-PAiSA', MYCASH: 'MyCash', CHEQUE: 'Cheque', EFTPOS: 'EFTPOS', CARD: 'Credit card', VOUCHER: 'Voucher', EBANKING: 'eBanking' };

  function two(n) { return ('0' + n).slice(-2); }
  function localDay(ms) { var d = new Date(ms); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }
  function localIso(ms) { var d = new Date(ms); return localDay(ms) + 'T' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()); }
  function locationName(shopId) { var s = Api.shop(shopId); return s ? (s.locationName || s.shopName.replace(/ ?shop$/i, '') + ' Location') : ''; }
  Api.locationName = locationName;
  function userName(id) { var u = Api.db.users.filter(function (x) { return x.id === id; })[0]; return u ? u.fullName : ''; }

  // ---- gathering the documents (sales and refunds) -----------------------------------
  function gather(o) {
    var db = Api.db, docs = [];
    function wanted(shopId, userId, at) {
      if (at < o.from || at > o.to) return false;
      if (o.shopId && shopId !== o.shopId) return false;
      if (o.locationId && Number(o.locationId) !== (Api.shop(shopId) || {}).locationId) return false;
      if (o.userId && o.userId !== userId) return false;
      return true;
    }
    function lineOut(l, sign) {
      var p = Api.product(l.productId) || {};
      return { productId: l.productId, code: p.code || '', name: l.name, description: l.serviceDescription || l.note || '', quantity: l.quantity, unitPrice: l.price != null ? l.price : (l.amount / l.quantity),
        discount: l.discountAmount || 0, vat: l.vatAmount || 0, total: l.total != null ? l.total : l.amount, sign: sign };
    }
    db.invoices.forEach(function (inv) {
      if (inv.isLayby && inv.laybyState !== 'COLLECTED') return;
      var at = new Date(inv.reportUtc || inv.createdUtc).getTime();
      if (!wanted(inv.shopId, inv.userId, at)) return;
      var lines = inv.lines.filter(function (l) { return !o.productId || l.productId === o.productId; }).map(function (l) { return lineOut(l, 1); });
      if (lines.length) docs.push({ kind: 'sale', no: inv.invoiceNo, at: at, shopId: inv.shopId, userId: inv.userId, cashier: inv.cashier, lines: lines, inv: inv });
    });
    (db.refunds || []).forEach(function (rf) {
      var at = new Date(rf.createdUtc).getTime();
      if (!wanted(rf.shopId, rf.userId, at)) return;
      var lines = rf.lines.filter(function (l) { return !o.productId || l.productId === o.productId; }).map(function (l) { return lineOut(l, -1); });
      if (lines.length) docs.push({ kind: 'refund', no: rf.refundNo, at: at, shopId: rf.shopId, userId: rf.userId, cashier: rf.cashier, lines: lines, refund: rf });
    });
    return docs;
  }
  function totalsOf(docs) {
    var t = { lineCount: 0, invoiceCount: 0, refundCount: 0, sales: 0, refunds: 0, netSales: 0, vat: 0, discounts: 0, quantity: 0, subtotal: 0, saleDiscounts: 0 };
    docs.forEach(function (d) {
      if (d.kind === 'sale') t.invoiceCount++; else t.refundCount++;
      d.lines.forEach(function (l) {
        t.lineCount++;
        if (d.kind === 'sale') { t.sales += l.total; t.discounts += l.discount; t.saleDiscounts += l.discount; t.quantity += l.quantity; t.vat += l.vat; }
        else { t.refunds += l.total; t.quantity -= l.quantity; t.vat -= l.vat; }
      });
    });
    ['sales', 'refunds', 'vat', 'discounts', 'saleDiscounts'].forEach(function (k) { t[k] = round2(t[k]); });
    t.quantity = round4(t.quantity); t.netSales = round2(t.sales - t.refunds); t.subtotal = round2(t.netSales - t.vat);
    return t;
  }
  function filtersOf(q) {
    var sf = q.shopId === undefined || q.shopId === '' ? 1 : Number(q.shopId);
    return { shopId: sf, from: new Date((q.from || Api.today()) + 'T' + (q.fromTime || '00:00') + ':00').getTime(), to: new Date((q.to || Api.today()) + 'T' + (q.toTime || '23:59') + ':59.999').getTime(),
      locationId: q.locationId || '', userId: q.cashier || '', productId: Number(q.productId) || 0 };
  }
  function page(rows, q) {
    var n = Math.max(1, Number(q.page) || 1);
    return { rows: rows.slice((n - 1) * PAGE, n * PAGE), rowCount: rows.length, page: n, pageSize: PAGE };
  }

  // ---- payments (also used by the closing, X and Z reports) -------------------------
  function paymentTotals(docs) {
    var by = {}, rounding = 0, surcharge = 0;
    METHODS.forEach(function (m) { by[m] = 0; });
    docs.forEach(function (d) {
      if (d.kind === 'sale') {
        var inv = d.inv;
        ((inv.payment && inv.payment.parts) || []).forEach(function (p) {
          var amount = p.method === 'CASH' ? p.applied + p.rounding : p.method === 'CARD' ? p.tendered : p.applied;
          by[p.method] = (by[p.method] || 0) + amount;
        });
        rounding += (inv.payment && inv.payment.rounding) || 0; surcharge += inv.surcharge || 0;
      } else {
        var m = d.refund.method || 'CASH';
        by[m] = (by[m] || 0) - d.refund.total;
        rounding += d.refund.rounding || 0;
      }
    });
    Object.keys(by).forEach(function (k) { by[k] = round2(by[k]); });
    return { by: by, rounding: round2(rounding), surcharge: round2(surcharge) };
  }

  // ---- sales reports ---------------------------------------------------------------
  function detailRows(docs) {
    var rows = [];
    docs.forEach(function (d) {
      d.lines.forEach(function (l) {
        var s = d.kind === 'sale' ? 1 : -1;
        rows.push({ invoiceDate: localIso(d.at), invoiceNo: d.no, isRefund: d.kind === 'refund', productId: l.productId, productCode: l.code, productName: l.name,
          description: d.kind === 'refund' ? 'Refund of ' + d.refund.invoiceNo + (d.refund.reason ? ' · ' + d.refund.reason : '') : l.description, cashier: d.cashier, shopId: d.shopId, shopName: (Api.shop(d.shopId) || {}).shopName,
          locationName: locationName(d.shopId), quantity: round4(s * l.quantity), unitPrice: round2(l.unitPrice), discount: round2(s * l.discount), vat: round2(s * l.vat), total: round2(s * l.total) });
      });
    });
    return rows.sort(function (a, b) { return a.invoiceDate < b.invoiceDate ? 1 : a.invoiceDate > b.invoiceDate ? -1 : a.invoiceNo < b.invoiceNo ? 1 : -1; });
  }
  function groupRows(docs, groupBy, perShop) {
    var map = {};
    docs.forEach(function (d) {
      d.lines.forEach(function (l) {
        var key, name, code = '';
        if (groupBy === 'user') { key = d.userId; name = d.cashier; }
        else if (groupBy === 'location') { key = 'loc' + (Api.shop(d.shopId) || {}).locationId; name = locationName(d.shopId); }
        else if (groupBy === 'date') { key = localDay(d.at); name = key; }
        else { key = String(l.productId); name = l.name; code = l.code; }
        var gk = (perShop ? d.shopId + ':' : '') + key;
        var m = map[gk] = map[gk] || { groupKey: gk, name: name, code: code, shopId: d.shopId, shopName: (Api.shop(d.shopId) || {}).shopName, docs: {}, refundDocs: {}, invoiceCount: 0, refundCount: 0, quantity: 0, sales: 0, refunds: 0, netSales: 0, vat: 0, discounts: 0, subtotal: 0 };
        if (d.kind === 'sale') { if (!m.docs[d.no]) { m.docs[d.no] = 1; m.invoiceCount++; } m.sales += l.total; m.quantity += l.quantity; m.vat += l.vat; m.discounts += l.discount; }
        else { if (!m.refundDocs[d.no]) { m.refundDocs[d.no] = 1; m.refundCount++; } m.refunds += l.total; m.quantity -= l.quantity; m.vat -= l.vat; }
      });
    });
    return Object.keys(map).map(function (k) {
      var m = map[k]; delete m.docs; delete m.refundDocs;
      ['sales', 'refunds', 'vat', 'discounts'].forEach(function (f) { m[f] = round2(m[f]); });
      m.quantity = round4(m.quantity); m.netSales = round2(m.sales - m.refunds); m.subtotal = round2(m.netSales - m.vat);
      return m;
    }).sort(function (a, b) { return groupBy === 'date' && !perShop ? (a.name < b.name ? 1 : -1) : perShop ? (a.shopName === b.shopName ? b.netSales - a.netSales : a.shopName < b.shopName ? -1 : 1) : b.netSales - a.netSales; });
  }
  route('GET', '/api/sales-reports/lookups', function (ctx) {
    var sf = ctx.q.shopId === undefined || ctx.q.shopId === '' ? 0 : Number(ctx.q.shopId);
    return { locations: Api.db.shops.filter(function (s) { return !sf || s.shopId === sf; }).map(function (s) { return { id: s.locationId, name: locationName(s.shopId) }; }),
      users: Api.db.users.filter(function (u) { return u.active !== false; }).map(function (u) { return { id: u.id, name: u.fullName }; }) };
  });
  route('GET', '/api/sales-reports', function (ctx) {
    var q = ctx.q, mode = q.mode || 'detail', f = filtersOf(q);
    if (mode === 'dashboard') f.productId = 0;
    var docs = gather(f), totals = totalsOf(docs), base = { from: q.from, to: q.to, mode: mode, groupBy: q.groupBy || 'product' };
    if (mode === 'dashboard') {
      var days = {}, prods = {};
      docs.forEach(function (d) {
        var day = localDay(d.at), s = d.kind === 'sale' ? 1 : -1, x = days[day] = days[day] || { date: day, netSales: 0, vat: 0 };
        d.lines.forEach(function (l) {
          x.netSales += s * l.total; x.vat += s * l.vat;
          var pr = prods[l.productId] = prods[l.productId] || { productId: l.productId, productName: l.name, quantity: 0, netSales: 0 };
          pr.quantity += s * l.quantity; pr.netSales += s * l.total;
        });
      });
      var daily = Object.keys(days).sort().map(function (k) { days[k].netSales = round2(days[k].netSales); days[k].vat = round2(days[k].vat); return days[k]; });
      var products = Object.keys(prods).map(function (k) { var p = prods[k]; p.netSales = round2(p.netSales); p.quantity = round4(p.quantity); return p; }).sort(function (a, b) { return b.netSales - a.netSales; }).slice(0, 10);
      return Object.assign({ totals: totals, daily: daily, products: products }, base);
    }
    if (mode === 'closing') {
      var pay = paymentTotals(docs), by = pay.by;
      var cashRows = METHODS.map(function (m) { return [METHOD_LABEL[m], by[m]]; }).filter(function (r) { return r[1] !== 0; });
      var received = round2(METHODS.reduce(function (s, m) { return s + by[m]; }, 0));
      Object.assign(totals, { cash: by.CASH, card: by.CARD, mpaisa: by.MPAISA, cheque: by.CHEQUE, eftpos: by.EFTPOS, voucher: by.VOUCHER, ebanking: by.EBANKING, mycash: by.MYCASH, other: 0, totalReceived: received, productReceived: received, grossSales: totals.sales });
      var list = [['Gross sales', totals.sales], ['Discounts included', totals.discounts], ['Refunds', -totals.refunds], ['Net sales', totals.netSales], ['VAT included in net sales', totals.vat]]
        .concat(cashRows, [['Cash rounding', pay.rounding], ['Credit card surcharge included', pay.surcharge], ['Total received', received]]).map(function (r) { return { label: r[0], amount: r[1] }; });
      return Object.assign({ totals: totals, rows: list, rowCount: list.length, page: 1, pageSize: PAGE }, base);
    }
    var rows = mode === 'detail' ? detailRows(docs) : mode === 'productshopsales' ? groupRows(docs, 'product', true) : groupRows(docs, mode === 'productsales' ? 'product' : (q.groupBy || 'product'), false);
    return Object.assign({ totals: totals }, page(rows, q), base);
  });

  // ---- stock reports ---------------------------------------------------------------
  var MOVE_LABEL = { SALE: 'Sale', RECEIVE: 'Goods received', ADJUST: 'Adjustment', TRANSFER_OUT: 'Transfer out', TRANSFER_IN: 'Transfer in', STOCKTAKE: 'Stock take', REFUND: 'Refund restock' };
  route('GET', '/api/sales-reports/inventory-lookups', function () {
    var db = Api.db;
    return { categories: db.categories.map(function (c) { return { id: c.id, name: c.name }; }), users: db.users.map(function (u) { return { id: u.id, name: u.fullName }; }),
      movements: Object.keys(MOVE_LABEL).map(function (k) { return { id: k, name: MOVE_LABEL[k] }; }) };
  });
  route('GET', '/api/sales-reports/inventory', function (ctx) {
    var q = ctx.q, mode = q.mode || 'products', db = Api.db, shopId = Api.shopId(q.shopId), productId = Number(q.productId) || 0, base = { mode: mode, from: q.from, to: q.to };
    function unit(p) { return (db.measurements.filter(function (m) { return m.id === p.measurementId; })[0] || {}).name || 'EACH'; }
    function catName(p) { return (Api.category(p.categoryId) || {}).name || ''; }
    if (mode === 'movement') {
      var f = filtersOf(Object.assign({}, q, { shopId: shopId })), who = q.cashier ? userName(q.cashier) : '';
      var list = db.movements.filter(function (m) {
        var at = new Date(m.atUtc).getTime(), p = Api.product(m.productId);
        if (m.shopId !== shopId || at < f.from || at > f.to || !p) return false;
        if (q.locationId && Number(q.locationId) !== (Api.shop(shopId) || {}).locationId) return false;
        if (productId && m.productId !== productId) return false;
        if (q.categoryId && p.categoryId !== Number(q.categoryId)) return false;
        if (q.movementType && m.type !== q.movementType) return false;
        if (who && m.user !== who) return false;
        return true;
      }).sort(function (a, b) { return a.atUtc < b.atUtc ? 1 : -1; });
      var totals = { lineCount: list.length, quantityIn: 0, quantityOut: 0, netQuantity: 0, countRecords: 0 };
      var rows = list.map(function (m) {
        var p = Api.product(m.productId), count = m.type === 'STOCKTAKE', delta = count ? null : m.delta;
        if (count) totals.countRecords++; else if (delta > 0) totals.quantityIn += delta; else totals.quantityOut -= delta;
        return { date: localIso(new Date(m.atUtc).getTime()), productCode: p.code, productName: p.name, movementType: MOVE_LABEL[m.type] || m.type, document: m.ref, cashier: m.user, shopName: Api.shop(shopId).shopName,
          locationName: locationName(shopId), uom: unit(p), recordedQuantity: m.after, delta: delta, unitCost: p.cost, totalCost: round2(Math.abs(m.delta) * p.cost), comments: m.note || '' };
      });
      totals.quantityIn = round4(totals.quantityIn); totals.quantityOut = round4(totals.quantityOut); totals.netQuantity = round4(totals.quantityIn - totals.quantityOut);
      return Object.assign({ totals: totals }, page(rows, q), base);
    }
    if (mode === 'components') {
      var parents = db.products.filter(function (p) { return db.recipes[p.productId] && (!productId || p.productId === productId) && (!q.categoryId || p.categoryId === Number(q.categoryId)); });
      var crow = [];
      parents.forEach(function (p) {
        db.recipes[p.productId].forEach(function (c) {
          var m = Api.product(c.materialId); if (!m) return;
          var active = c.active !== false;
          if (q.active === 'active' && !active) return; if (q.active === 'inactive' && active) return;
          if (q.componentId && m.productId !== Number(q.componentId)) return;
          crow.push({ productCode: p.code, productName: p.name, componentCode: m.code, componentName: m.name, componentStockItem: !!m.stockItem, locationName: locationName(shopId), uom: unit(m),
            quantity: c.quantity, active: active, unitCost: m.cost, componentCost: round2(c.quantity * m.cost) });
        });
      });
      var ct = { lineCount: crow.length, parentProducts: parents.filter(function (p) { return crow.some(function (r) { return r.productCode === p.code; }); }).length,
        activeAssignments: crow.filter(function (r) { return r.active; }).length, inactiveAssignments: crow.filter(function (r) { return !r.active; }).length };
      return Object.assign({ totals: ct }, page(crow, q), base);
    }
    var prows = db.products.filter(function (p) {
      if (productId && p.productId !== productId) return false;
      if (q.categoryId && p.categoryId !== Number(q.categoryId)) return false;
      if (q.stockType === 'stock' && !p.stockItem) return false; if (q.stockType === 'nonstock' && p.stockItem) return false;
      if (q.active === 'active' && p.active === false) return false; if (q.active === 'inactive' && p.active !== false) return false;
      return true;
    }).sort(function (a, b) { return a.name < b.name ? -1 : 1; }).map(function (p) {
      var qty = p.stockItem ? Api.stockOf(shopId, p.productId) : 0;
      return { productId: p.productId, productCode: p.code, productName: p.name, category: catName(p), shopName: Api.shop(shopId).shopName, locationName: locationName(shopId), uom: unit(p), stockItem: !!p.stockItem,
        active: p.active !== false, quantity: qty, price: p.price, costValue: round2(qty * p.cost), retailValue: round2(qty * p.price), rowId: p.productId, shopId: shopId };
    });
    var pt = { lineCount: prows.length, quantity: 0, costValue: 0, retailValue: 0, negativeStockRows: 0 };
    prows.forEach(function (r) { if (r.stockItem) { pt.quantity += r.quantity; pt.costValue += r.costValue; pt.retailValue += r.retailValue; if (r.quantity < 0) pt.negativeStockRows++; } });
    pt.quantity = round4(pt.quantity); pt.costValue = round2(pt.costValue); pt.retailValue = round2(pt.retailValue);
    return Object.assign({ totals: pt }, page(prows, q), base);
  });

  // ---- X and Z reports -------------------------------------------------------------
  function lastZ(shopId) {
    var list = Api.db.zReports.filter(function (z) { return z.shopId === shopId; });
    return list.length ? list[list.length - 1] : null;
  }
  function periodReport(shopId, kind, startMs, endMs, extra) {
    var docs = gather({ shopId: shopId, from: startMs, to: endMs, locationId: '', userId: '', productId: 0 }), t = totalsOf(docs), pay = paymentTotals(docs);
    var lay = typeof Api.laybyActivity === 'function' ? Api.laybyActivity(shopId, startMs, endMs) : { received: 0, refunded: 0, methods: {} };
    METHODS.forEach(function (m) { pay.by[m] = round2(pay.by[m] + ((lay.methods || {})[m] || 0)); });
    var report = { kind: kind, cashier: Api.user().fullName, shopId: shopId, periodStartUtc: docs.length ? new Date(Math.min.apply(null, docs.map(function (d) { return d.at; }))).toISOString() : null,
      generatedUtc: Api.nowIso(), saleCount: t.invoiceCount, grossSales: t.sales, refundTotal: t.refunds, total: t.netSales, laybyPayments: round2(lay.received), laybyRefunds: round2(lay.refunded),
      rounding: pay.rounding, surcharge: pay.surcharge, paymentBreakdown: METHODS.filter(function (m) { return pay.by[m] !== 0; }).map(function (m) { return { method: m, amount: pay.by[m] }; }), cashSales: pay.by.CASH };
    return Object.assign(report, extra || {});
  }
  route('GET', '/api/operations/x-report', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), z = lastZ(shopId);
    var start = z ? new Date(z.generatedUtc).getTime() + 1 : new Date(Api.today() + 'T00:00:00').getTime();
    var r = periodReport(shopId, 'X', start, Date.now());
    if (!r.periodStartUtc) r.periodStartUtc = new Date(start).toISOString();
    return r;
  });
  route('POST', '/api/operations/z-report', function (ctx) {
    var b = ctx.body, shopId = Api.shopId(b.shopId), z = lastZ(shopId), db = Api.db;
    var again = db.zReports.filter(function (x) { return x.requestId && x.requestId === b.requestId; })[0];
    if (again) return again;
    var start = z ? new Date(z.generatedUtc).getTime() + 1 : new Date(Api.today() + 'T00:00:00').getTime();
    var counted = b.countedCash === null || b.countedCash === undefined || b.countedCash === '' ? null : Number(b.countedCash);
    need(counted === null || (isFinite(counted) && counted >= 0), 'Enter the counted cash as a number, or leave it empty.');
    var r = periodReport(shopId, 'Z', start, Date.now());
    if (!r.periodStartUtc) r.periodStartUtc = new Date(start).toISOString();
    r.reportId = 'Z-' + Api.pad(db.zReports.length + 1, 5); r.requestId = b.requestId;
    r.countedCash = counted; r.cashDifference = counted === null ? null : round2(counted - r.cashSales);
    db.zReports.push(r);
    return r;
  });
  route('GET', '/api/operations/z-history', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId);
    return Api.db.zReports.filter(function (z) { return z.shopId === shopId; }).slice().reverse().slice(0, 30);
  });

  // ---- report centre (back-office): list endpoints with paging, sorting, search and CSV export ----------------------------
  //   GET /api/reports                  the reports this back end can run
  //   GET /api/reports/lookups          shops, categories, users, ingredients and movement types for the filters
  //   GET /api/reports/:key             ?page&pageSize&sort&q&filter[shopId|from|to|...]  ->  { columns, rows, total, totals, ... }
  //   GET /api/reports/:key/export      the same filters, every matching row, ?format=csv
  // Read-only: invoices, stock and recipes are only read here.
  var BO_REPORTS = {};
  function boDef(key, def) { def.key = key; BO_REPORTS[key] = def; }
  function boFilters(q) {
    var f = {};
    Object.keys(q).forEach(function (k) { var m = /^filter\[(.+)\]$/.exec(k); if (m) f[m[1]] = q[k]; });
    return f;
  }
  // "2026-10-27", "2026-10-27T08:00" or with seconds, read as local time; an end given without seconds runs to the end of that minute
  function boTime(v, end) {
    var s = String(v || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += end ? 'T23:59' : 'T00:00';
    var minute = /T\d{2}:\d{2}$/.test(s);
    if (minute) s += ':00';
    var ms = new Date(s).getTime();
    return isFinite(ms) ? ms + (end ? (minute ? 59999 : 999) : 0) : NaN;
  }
  function boRange(f) {
    var from = boTime(f.from, false), to = boTime(f.to, true);
    Api.need(isFinite(from) && isFinite(to), 'Enter a valid date range.');
    Api.need(to >= from, 'End date/time must be on or after start date/time.');
    return { from: from, to: to };
  }
  function boShops(f) {
    if (f.shopId === undefined || f.shopId === '' || f.shopId === 'all') return Api.db.shops.map(function (s) { return s.shopId; });
    Api.need(Api.shop(f.shopId), 'Choose a shop from the list.');
    return [Number(f.shopId)];
  }
  function boStamp(ms) { return localIso(ms).slice(0, 16).replace('T', ' '); }
  function boUnit(p) { return (Api.db.measurements.filter(function (m) { return m.id === p.measurementId; })[0] || {}).name || 'EACH'; }
  function boCategory(p) { return (Api.category(p.categoryId) || {}).name || ''; }
  function boShopName(id) { return (Api.shop(id) || {}).shopName || ''; }
  function boDocs(ctx, extra) {
    return gather(Object.assign({ shopId: ctx.shopFilter, from: ctx.range.from, to: ctx.range.to, locationId: '', userId: '', productId: 0 }, extra || {}));
  }
  function boSearch(rows, text, keys) {
    var terms = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter(function (r) {
      var hay = keys.map(function (k) { return r[k] === null || r[k] === undefined ? '' : String(r[k]); }).join(' ').toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }
  // sort=name (ascending) or sort=-name (descending); empty values always go last
  function boSort(rows, columns, spec) {
    var desc = String(spec || '').charAt(0) === '-', key = String(spec || '').replace(/^-/, '');
    var col = columns.filter(function (c) { return c.key === key; })[0];
    if (!col) return rows;
    var by = col.sortKey || key;
    return rows.slice().sort(function (a, b) {
      var x = a[by], y = b[by], r;
      if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
      if (y === null || y === undefined) return -1;
      r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
      return desc ? -r : r;
    });
  }
  function boTotals(columns, rows) {
    var t = {};
    columns.forEach(function (c) {
      if (!c.sum) return;
      var s = 0;
      rows.forEach(function (r) { s += Number(r[c.key]) || 0; });
      t[c.key] = c.type === 'qty' ? round4(s) : round2(s);
    });
    return t;
  }
  function boRun(key, q, everything) {
    var def = BO_REPORTS[key];
    need(def, 'This report does not exist.', 404);
    var f = boFilters(q), shops = boShops(f);
    var ctx = { f: f, q: q, shops: shops, shopFilter: shops.length === 1 ? shops[0] : 0, range: def.range ? boRange(f) : null };
    var columns = typeof def.columns === 'function' ? def.columns(ctx) : def.columns;
    var built = def.build(ctx);
    var rows = boSort(boSearch(built.rows, q.q, def.search || []), columns, q.sort || def.sort);
    var totals = def.totals ? def.totals(rows, ctx, built, columns) : boTotals(columns, rows);
    var size = everything ? Math.max(rows.length, 1) : Math.min(1000, Math.max(1, Math.floor(Number(q.pageSize)) || 50));
    var pages = Math.max(1, Math.ceil(rows.length / size)), page = Math.min(pages, Math.max(1, Math.floor(Number(q.page)) || 1));
    return { key: key, title: def.title, columns: columns, rows: rows.slice((page - 1) * size, page * size), total: rows.length, totals: totals, page: page, pageSize: size, pageCount: pages,
      sort: q.sort || def.sort, note: typeof def.note === 'function' ? def.note(ctx) : (def.note || ''), from: ctx.range ? boStamp(ctx.range.from) : '', to: ctx.range ? boStamp(ctx.range.to) : '',
      shopName: ctx.shopFilter ? boShopName(ctx.shopFilter) : '', generatedUtc: Api.nowIso() };
  }

  // shared pieces of the sales reports
  var BO_SALES_COLS = [
    { key: 'invoiceCount', label: 'Invoices', type: 'int', sum: true }, { key: 'refundCount', label: 'Refund count', type: 'int', sum: true }, { key: 'quantity', label: 'Net qty', type: 'qty', sum: true },
    { key: 'sales', label: 'Sales', type: 'money', sum: true }, { key: 'refunds', label: 'Refund value', type: 'money', sum: true }, { key: 'discounts', label: 'Discount', type: 'money', sum: true },
    { key: 'vat', label: 'VAT', type: 'money', sum: true }, { key: 'netSales', label: 'Net sales', type: 'money', sum: true }
  ];
  var BO_SALES_NOTE = 'Amounts include VAT. Refunds reduce net sales. Times use the recorded transaction date and time.';
  function boZero(fields) { return Object.assign({ _docs: {}, invoiceCount: 0, refundCount: 0, quantity: 0, sales: 0, refunds: 0, discounts: 0, vat: 0, netSales: 0 }, fields); }
  // sum the lines of the documents into one row per key({doc, line}) -> { key, fields } (null = skip the line)
  function boGroup(docs, keyOf) {
    var map = {};
    docs.forEach(function (d) {
      d.lines.forEach(function (l) {
        var k = keyOf(d, l);
        if (!k) return;
        var m = map[k.key] || (map[k.key] = boZero(k.fields));
        if (d.kind === 'sale') { if (!m._docs[d.no]) { m._docs[d.no] = 1; m.invoiceCount++; } m.sales += l.total; m.quantity += l.quantity; m.vat += l.vat; m.discounts += l.discount; }
        else { if (!m._docs[d.no]) { m._docs[d.no] = 1; m.refundCount++; } m.refunds += l.total; m.quantity -= l.quantity; m.vat -= l.vat; }
      });
    });
    return map;
  }
  function boClose(m) {
    delete m._docs;
    ['sales', 'refunds', 'discounts', 'vat'].forEach(function (k) { m[k] = round2(m[k]); });
    m.quantity = round4(m.quantity); m.netSales = round2(m.sales - m.refunds);
    return m;
  }
  function boMapRows(map) { return Object.keys(map).map(function (k) { return boClose(map[k]); }); }
  function boWithAverage(rows, ctx, built, columns) {
    var t = boTotals(columns, rows);
    t.average = t.invoiceCount ? round2(t.netSales / t.invoiceCount) : 0;
    return t;
  }
  function boPeriodKey(ms, g) {
    var d = new Date(ms);
    if (g === 'month') return d.getFullYear() + '-' + two(d.getMonth() + 1);
    if (g === 'week') { var w = new Date(d.getFullYear(), d.getMonth(), d.getDate()); w.setDate(w.getDate() - (w.getDay() + 6) % 7); return localDay(w.getTime()); }
    return localDay(ms);
  }

  boDef('sales-by-period', {
    title: 'Sales by period', range: true, sort: '-period', search: ['period'], note: BO_SALES_NOTE,
    columns: function (ctx) {
      var g = ctx.f.group;
      return [{ key: 'period', label: g === 'month' ? 'Month' : g === 'week' ? 'Week starting' : 'Day', type: 'text' }].concat(BO_SALES_COLS, [{ key: 'average', label: 'Average invoice', type: 'money' }]);
    },
    build: function (ctx) {
      var g = ['day', 'week', 'month'].indexOf(ctx.f.group) >= 0 ? ctx.f.group : 'day';
      var map = boGroup(boDocs(ctx), function (d) { var p = boPeriodKey(d.at, g); return { key: p, fields: { period: p } }; });
      // quiet periods are listed too, so a closed day shows as 0
      var step = new Date(ctx.range.from);
      step.setHours(0, 0, 0, 0);
      for (var n = 0; step.getTime() <= ctx.range.to && n < 1100; n++, step.setDate(step.getDate() + 1)) {
        var p = boPeriodKey(step.getTime(), g);
        if (!map[p]) map[p] = boZero({ period: p });
      }
      var rows = boMapRows(map);
      rows.forEach(function (r) { r.average = r.invoiceCount ? round2(r.netSales / r.invoiceCount) : 0; });
      return { rows: rows };
    },
    totals: boWithAverage
  });
  boDef('sales-by-user', {
    title: 'Sales by user', range: true, sort: '-netSales', search: ['user'], note: BO_SALES_NOTE,
    columns: [{ key: 'user', label: 'User', type: 'text' }].concat(BO_SALES_COLS, [{ key: 'average', label: 'Average invoice', type: 'money' }]),
    build: function (ctx) {
      var rows = boMapRows(boGroup(boDocs(ctx), function (d) { return { key: d.userId, fields: { user: d.cashier } }; }));
      rows.forEach(function (r) { r.average = r.invoiceCount ? round2(r.netSales / r.invoiceCount) : 0; });
      return { rows: rows };
    },
    totals: boWithAverage
  });
  boDef('sales-detail', {
    title: 'Sales detail', range: true, sort: '-date', search: ['invoiceNo', 'code', 'name', 'user', 'description'],
    note: 'One row per invoice line. Amounts include VAT. Refund lines are negative.',
    columns: [{ key: 'date', label: 'Date / time', type: 'datetime' }, { key: 'invoiceNo', label: 'Invoice', type: 'text' }, { key: 'type', label: 'Type', type: 'text', tr: true },
      { key: 'code', label: 'Code', type: 'text' }, { key: 'name', label: 'Product', type: 'text' }, { key: 'description', label: 'Description', type: 'text' }, { key: 'user', label: 'User', type: 'text' },
      { key: 'shopName', label: 'Shop', type: 'text' }, { key: 'quantity', label: 'Qty', type: 'qty', sum: true }, { key: 'unitPrice', label: 'Unit price', type: 'money' },
      { key: 'discount', label: 'Discount', type: 'money', sum: true }, { key: 'vat', label: 'VAT', type: 'money', sum: true }, { key: 'total', label: 'Line total', type: 'money', sum: true }],
    build: function (ctx) {
      var rows = detailRows(boDocs(ctx, { userId: ctx.f.cashier || '' })).map(function (r) {
        return { date: r.invoiceDate.slice(0, 16).replace('T', ' '), invoiceNo: r.invoiceNo, type: r.isRefund ? 'Refund' : 'Sale', code: r.productCode, name: r.productName, description: r.description || '',
          user: r.cashier, shopName: r.shopName, quantity: r.quantity, unitPrice: r.unitPrice, discount: r.discount, vat: r.vat, total: r.total };
      }).filter(function (r) { return !ctx.f.type || (ctx.f.type === 'refund' ? r.type === 'Refund' : r.type === 'Sale'); });
      return { rows: rows };
    }
  });

  function boProductSales(perShop) {
    return {
      title: perShop ? 'Product sales by shop' : 'Product sales', range: true, sort: perShop ? 'shopName' : '-netSales', search: ['code', 'name', 'category', 'shopName'], note: BO_SALES_NOTE,
      columns: (perShop ? [{ key: 'shopName', label: 'Shop', type: 'text' }] : []).concat([{ key: 'code', label: 'Code', type: 'text' }, { key: 'name', label: 'Product', type: 'text' }, { key: 'category', label: 'Category', type: 'text' }],
        BO_SALES_COLS, [{ key: 'share', label: 'Share of net sales (%)', type: 'pct', sum: true }]),
      build: function (ctx) {
        var map = boGroup(boDocs(ctx), function (d, l) {
          var p = Api.product(l.productId);
          if (!p || (ctx.f.categoryId && p.categoryId !== Number(ctx.f.categoryId))) return null;
          return { key: (perShop ? d.shopId + ':' : '') + p.productId, fields: { shopId: d.shopId, shopName: boShopName(d.shopId), code: p.code, name: p.name, category: boCategory(p) } };
        });
        var rows = boMapRows(map), base = {};
        rows.forEach(function (r) { var k = perShop ? r.shopId : 0; base[k] = (base[k] || 0) + r.netSales; });
        rows.forEach(function (r) { var b = base[perShop ? r.shopId : 0]; r.share = b ? round2(r.netSales / b * 100) : 0; });
        return { rows: rows };
      }
    };
  }
  boDef('product-sales', boProductSales(false));
  boDef('product-sales-by-shop', boProductSales(true));

  // stock reports
  var BO_STATUS_RANK = { 'Negative': 0, 'Out of stock': 1, 'Low': 2, 'In stock': 3, 'Not tracked': 4 };
  function boStockItems(ctx, scope) {
    var recipeIds = {};
    Object.keys(Api.db.recipes).forEach(function (pid) { Api.db.recipes[pid].forEach(function (c) { if (c.active !== false) recipeIds[c.materialId] = 1; }); });
    var items = Api.db.products.filter(function (p) {
      if (p.active === false) return false;
      if (ctx.f.categoryId && p.categoryId !== Number(ctx.f.categoryId)) return false;
      if (scope === 'all') return true;
      return !!p.stockItem && (scope !== 'ingredients' || recipeIds[p.productId]);
    });
    return { items: items, ingredient: recipeIds };
  }
  boDef('stock-levels', {
    title: 'Stock levels', sort: 'name', search: ['code', 'name', 'category', 'shopName'], note: 'Current stock, valued at cost and at retail price. Items that are not stocked are listed only when you choose all items.',
    columns: [{ key: 'shopName', label: 'Shop', type: 'text' }, { key: 'code', label: 'Code', type: 'text' }, { key: 'name', label: 'Product', type: 'text' }, { key: 'category', label: 'Category', type: 'text' },
      { key: 'unit', label: 'Unit', type: 'text' }, { key: 'stock', label: 'Stock', type: 'qty', sum: true }, { key: 'cost', label: 'Unit cost', type: 'money' }, { key: 'costValue', label: 'Cost value', type: 'money', sum: true },
      { key: 'price', label: 'Retail price', type: 'money' }, { key: 'retailValue', label: 'Retail value', type: 'money', sum: true }, { key: 'status', label: 'Status', type: 'text', tr: true, sortKey: 'rank' }],
    build: function (ctx) {
      var set = boStockItems(ctx, ctx.f.scope === 'all' ? 'all' : 'stock'), rows = [];
      ctx.shops.forEach(function (shopId) {
        set.items.forEach(function (p) {
          var qty = p.stockItem ? Api.stockOf(shopId, p.productId) : null;
          var status = qty === null ? 'Not tracked' : qty < 0 ? 'Negative' : qty === 0 ? 'Out of stock' : 'In stock';
          if (ctx.f.status === 'negative' && status !== 'Negative') return;
          if (ctx.f.status === 'out' && status !== 'Out of stock') return;
          if (ctx.f.status === 'in' && status !== 'In stock') return;
          rows.push({ shopId: shopId, shopName: boShopName(shopId), code: p.code, name: p.name, category: boCategory(p), unit: boUnit(p), stock: qty, cost: p.cost, costValue: qty === null ? null : round2(qty * p.cost),
            price: p.price, retailValue: qty === null ? null : round2(qty * p.price), status: status, rank: BO_STATUS_RANK[status] });
        });
      });
      return { rows: rows };
    }
  });

  // how much of each stock item went out in the period: sold as it is, or used up by the recipes of the dishes sold
  function boUsage(shopId, range) {
    var docs = gather({ shopId: shopId, from: range.from, to: range.to, locationId: '', userId: '', productId: 0 });
    var recipesOn = Api.salesOptions(shopId).productComponentsEnabled !== false, used = {};
    docs.forEach(function (d) {
      d.lines.forEach(function (l, i) {
        // a refund gives goods back to stock only when it was marked "restock"
        var sign = d.kind === 'sale' ? 1 : (d.refund.lines[i] && d.refund.lines[i].restock ? -1 : 0), p = Api.product(l.productId);
        if (!sign || !p) return;
        if (p.stockItem) { used[p.productId] = (used[p.productId] || 0) + sign * l.quantity; return; }
        if (!recipesOn) return;
        (Api.db.recipes[p.productId] || []).forEach(function (c) { if (c.active !== false) used[c.materialId] = (used[c.materialId] || 0) + sign * c.quantity * l.quantity; });
      });
    });
    return { docs: docs, used: used };
  }
  boDef('low-negative-stock', {
    title: 'Low and negative stock', range: true, sort: 'stock', search: ['code', 'name', 'category', 'shopName'],
    note: 'Items at or below the low-stock level. Average use counts what was sold in the period, directly or through recipes; days left is the stock divided by that average.',
    columns: [{ key: 'shopName', label: 'Shop', type: 'text' }, { key: 'code', label: 'Code', type: 'text' }, { key: 'name', label: 'Item', type: 'text' }, { key: 'category', label: 'Category', type: 'text' },
      { key: 'kind', label: 'Type', type: 'text', tr: true }, { key: 'unit', label: 'Unit', type: 'text' }, { key: 'stock', label: 'Stock', type: 'qty' }, { key: 'average', label: 'Average use per day', type: 'qty' },
      { key: 'daysLeft', label: 'Days left', type: 'qty' }, { key: 'status', label: 'Status', type: 'text', tr: true, sortKey: 'rank' }],
    build: function (ctx) {
      var set = boStockItems(ctx, ctx.f.scope === 'ingredients' ? 'ingredients' : 'stock'), rows = [];
      var lowAt = ctx.f.lowAt === undefined || ctx.f.lowAt === '' ? 20 : Number(ctx.f.lowAt);
      Api.need(isFinite(lowAt) && lowAt >= 0, 'Enter the low-stock level as a number, 0 or more.');
      var days = Math.max(1, (ctx.range.to - ctx.range.from) / 864e5);
      ctx.shops.forEach(function (shopId) {
        var use = boUsage(shopId, ctx.range).used;
        set.items.forEach(function (p) {
          var qty = Api.stockOf(shopId, p.productId), status = qty < 0 ? 'Negative' : qty === 0 ? 'Out of stock' : qty <= lowAt ? 'Low' : '';
          if (!status || (ctx.f.status === 'negative' && status !== 'Negative') || (ctx.f.status === 'low' && status === 'Negative')) return;
          var avg = Math.max(0, (use[p.productId] || 0) / days);
          rows.push({ shopId: shopId, shopName: boShopName(shopId), code: p.code, name: p.name, category: boCategory(p), kind: set.ingredient[p.productId] ? 'Ingredient' : 'Product', unit: boUnit(p), stock: qty,
            average: round4(avg), daysLeft: qty <= 0 ? 0 : avg > 0 ? Math.round(qty / avg * 10) / 10 : null, status: status, rank: BO_STATUS_RANK[status] });
        });
      });
      return { rows: rows };
    },
    totals: function () { return {}; }
  });
  var BO_MOVE_LABEL = { SALE: 'Sale', RECEIVE: 'Goods received', ADJUST: 'Adjustment', TRANSFER_OUT: 'Transfer out', TRANSFER_IN: 'Transfer in', STOCKTAKE: 'Stock take', REFUND: 'Refund restock' };
  boDef('stock-movement', {
    title: 'Stock movement', range: true, sort: '-date', search: ['code', 'name', 'document', 'user', 'type'], note: 'Every change to stock in the period: sales, goods received, adjustments, transfers and stock takes. Cost value is the change times the current unit cost.',
    columns: [{ key: 'date', label: 'Date / time', type: 'datetime' }, { key: 'shopName', label: 'Shop', type: 'text' }, { key: 'code', label: 'Code', type: 'text' }, { key: 'name', label: 'Product', type: 'text' },
      { key: 'type', label: 'Movement', type: 'text', tr: true }, { key: 'document', label: 'Document', type: 'text' }, { key: 'user', label: 'User', type: 'text' }, { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'delta', label: 'Quantity change', type: 'qty', sum: true }, { key: 'after', label: 'Balance after', type: 'qty' }, { key: 'unitCost', label: 'Unit cost', type: 'money' }, { key: 'costValue', label: 'Cost value', type: 'money', sum: true }],
    build: function (ctx) {
      var rows = [];
      Api.db.movements.forEach(function (m) {
        var at = new Date(m.atUtc).getTime(), p = Api.product(m.productId);
        if (!p || ctx.shops.indexOf(m.shopId) < 0 || at < ctx.range.from || at > ctx.range.to || (ctx.f.type && m.type !== ctx.f.type)) return;
        rows.push({ date: boStamp(at), shopName: boShopName(m.shopId), code: p.code, name: p.name, type: BO_MOVE_LABEL[m.type] || m.type, typeCode: m.type, document: m.ref, user: m.user, unit: boUnit(p),
          delta: round4(m.delta), after: m.after, unitCost: p.cost, costValue: round2(m.delta * p.cost) });
      });
      return { rows: rows };
    }
  });

  // recipes
  boDef('ingredient-consumption', {
    title: 'Ingredient consumption', range: true, sort: '-cost', search: ['code', 'name', 'shopName'],
    note: 'Quantity used = dishes sold in the period times the active recipe lines (refunds marked restock give goods back). Cost uses the current unit cost. Share of sales = cost divided by net sales without VAT in the same period and shop.',
    columns: [{ key: 'shopName', label: 'Shop', type: 'text' }, { key: 'code', label: 'Code', type: 'text' }, { key: 'name', label: 'Ingredient', type: 'text' }, { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'stock', label: 'Current stock', type: 'qty' }, { key: 'used', label: 'Quantity used', type: 'qty' }, { key: 'unitCost', label: 'Unit cost', type: 'money' }, { key: 'cost', label: 'Cost', type: 'money', sum: true },
      { key: 'share', label: 'Share of sales (%)', type: 'pct' }, { key: 'dishes', label: 'Dishes', type: 'int' }],
    build: function (ctx) {
      var dishes = {}, rows = [], sales = {};
      Object.keys(Api.db.recipes).forEach(function (pid) { Api.db.recipes[pid].forEach(function (c) { if (c.active !== false) dishes[c.materialId] = (dishes[c.materialId] || 0) + 1; }); });
      ctx.shops.forEach(function (shopId) {
        var u = boUsage(shopId, ctx.range);
        sales[shopId] = totalsOf(u.docs).subtotal;
        Object.keys(dishes).map(Number).forEach(function (mid) {
          var m = Api.product(mid);
          if (!m || (ctx.f.ingredientId && mid !== Number(ctx.f.ingredientId))) return;
          var used = round4(u.used[mid] || 0), cost = round2(used * m.cost);
          rows.push({ shopId: shopId, shopName: boShopName(shopId), code: m.code, name: m.name, unit: boUnit(m), stock: Api.stockOf(shopId, mid), used: used, unitCost: m.cost, cost: cost,
            share: sales[shopId] > 0 ? round2(cost / sales[shopId] * 100) : 0, dishes: dishes[mid] });
        });
      });
      return { rows: rows, sales: sales };
    },
    totals: function (rows, ctx, built, columns) {
      var t = boTotals(columns, rows), base = 0;
      ctx.shops.forEach(function (shopId) { base += built.sales[shopId] || 0; });
      t.share = base > 0 ? round2(t.cost / base * 100) : 0;
      return t;
    }
  });
  boDef('recipe-components', {
    title: 'Recipe components', sort: 'dish', search: ['dishCode', 'dish', 'code', 'name'], note: 'Every line of every recipe, with the cost of that line at the current unit cost.',
    columns: [{ key: 'dishCode', label: 'Dish code', type: 'text' }, { key: 'dish', label: 'Dish', type: 'text' }, { key: 'code', label: 'Ingredient code', type: 'text' }, { key: 'name', label: 'Ingredient', type: 'text' },
      { key: 'quantity', label: 'Quantity', type: 'qty' }, { key: 'unit', label: 'Unit', type: 'text' }, { key: 'unitCost', label: 'Unit cost', type: 'money' }, { key: 'cost', label: 'Line cost', type: 'money', sum: true },
      { key: 'state', label: 'Status', type: 'text', tr: true }],
    build: function (ctx) {
      var rows = [];
      Api.db.products.forEach(function (d) {
        (Api.db.recipes[d.productId] || []).forEach(function (c) {
          var m = Api.product(c.materialId), active = c.active !== false;
          if (!m || (ctx.f.ingredientId && m.productId !== Number(ctx.f.ingredientId))) return;
          if ((ctx.f.state === 'active' && !active) || (ctx.f.state === 'inactive' && active)) return;
          rows.push({ dishCode: d.code, dish: d.name, code: m.code, name: m.name, quantity: c.quantity, unit: boUnit(m), unitCost: m.cost, cost: round2(c.quantity * m.cost), state: active ? 'Active' : 'Inactive' });
        });
      });
      return { rows: rows };
    }
  });

  route('GET', '/api/reports', function () {
    return Object.keys(BO_REPORTS).map(function (k) { return { key: k, title: BO_REPORTS[k].title }; });
  });
  route('GET', '/api/reports/lookups', function () {
    var db = Api.db, recipeIds = {};
    Object.keys(db.recipes).forEach(function (pid) { db.recipes[pid].forEach(function (c) { recipeIds[c.materialId] = 1; }); });
    return { shops: db.shops.map(function (s) { return { id: s.shopId, name: s.shopName }; }),
      categories: db.categories.filter(function (c) { return c.active !== false; }).map(function (c) { return { id: c.id, name: c.name }; }),
      users: db.users.filter(function (u) { return u.active !== false; }).map(function (u) { return { id: u.id, name: u.fullName }; }),
      ingredients: Object.keys(recipeIds).map(Number).map(Api.product).filter(Boolean).sort(function (a, b) { return a.name < b.name ? -1 : 1; }).map(function (p) { return { id: p.productId, name: p.name }; }),
      movementTypes: Object.keys(BO_MOVE_LABEL).map(function (k) { return { id: k, name: BO_MOVE_LABEL[k] }; }) };
  });
  route('GET', '/api/reports/:key', function (ctx) { return boRun(ctx.params.key, ctx.q, false); });

  // CSV: UTF-8 with a byte order mark so Excel reads Chinese correctly; the header follows the interface language
  function boText(s) { return window.SoftPOSLanguage ? window.SoftPOSLanguage.t(s) : s; }
  function boCell(v, col) {
    if (v === null || v === undefined || v === '') return '';
    var s;
    if (col.type === 'money') s = round2(v).toFixed(2);
    else if (col.type === 'pct') s = String(Math.round(Number(v) * 10) / 10);
    else if (col.type === 'qty') s = String(round4(v));
    else if (col.type === 'int') s = String(Math.round(v));
    else {
      s = String(v);
      if (col.tr) s = boText(s);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // a text cell must not start a formula in a spreadsheet
    }
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  route('GET', '/api/reports/:key/export', function (ctx) {
    need(!ctx.q.format || ctx.q.format === 'csv', 'Only CSV export is available.');
    var r = boRun(ctx.params.key, ctx.q, true), cols = r.columns, lines = [];
    lines.push(cols.map(function (c) { return boCell(boText(c.label), { type: 'text' }); }).join(','));
    r.rows.forEach(function (row) { lines.push(cols.map(function (c) { return boCell(row[c.key], c); }).join(',')); });
    if (ctx.q.totals !== '0' && r.rows.length) {
      lines.push(cols.map(function (c, i) { return i === 0 ? boCell(boText('Total'), { type: 'text' }) : boCell(r.totals[c.key], c); }).join(','));
    }
    var span = r.from ? '-' + r.from.slice(0, 10) + '_' + r.to.slice(0, 10) : '-' + localDay(Date.now());
    return new Response('﻿' + lines.join('\r\n') + '\r\n', { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="softpos-' + ctx.params.key + span + '.csv"' } });
  });

  Api.module({
    seed: function (db) { db.zReports = []; },
    afterSeed: function (db) {
      // favourites: the eight best sellers of the last 30 days, the same list for every shop to start with
      var sold = {};
      db.invoices.forEach(function (inv) { inv.lines.forEach(function (l) { sold[l.productId] = (sold[l.productId] || 0) + l.quantity; }); });
      db.favourites = { 1: Object.keys(sold).map(Number).filter(function (id) { var p = Api.product(id); return p && p.price > 0 && p.categoryId < 8; }).sort(function (a, b) { return sold[b] - sold[a]; }).slice(0, 8) };
      // five earlier days already closed, so "today" has a sensible X report
      for (var back = 5; back >= 1; back--) {
        var day = new Date(); day.setDate(day.getDate() - back); day.setHours(21, 30, 0, 0);
        var prev = lastZ(1), start = prev ? new Date(prev.generatedUtc).getTime() + 1 : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0).getTime();
        var r = periodReport(1, 'Z', start, day.getTime());
        r.generatedUtc = day.toISOString(); r.cashier = 'Demo Cashier'; r.reportId = 'Z-' + Api.pad(db.zReports.length + 1, 5);
        if (!r.periodStartUtc) r.periodStartUtc = new Date(start).toISOString();
        var wobble = [0, -2, 0, 5, -0.5][back - 1];
        r.countedCash = round2(r.cashSales + wobble); r.cashDifference = round2(wobble);
        db.zReports.push(r);
      }
    }
  });
  Api.gatherSales = gather; Api.salesTotals = totalsOf;
})();
