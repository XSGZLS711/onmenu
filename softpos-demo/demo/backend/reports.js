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
