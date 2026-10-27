// Demo back end, part 4: products, recipes, purchasing, receiving, transfers, adjustments and stocktake.
(function () {
  'use strict';
  var Api = window.DemoApi, route = Api.route, round2 = Api.round2, round4 = Api.round4, need = Api.need;

  function nameOf(list, id) { var x = list.filter(function (i) { return i.id === Number(id); })[0]; return x ? x.name : ''; }
  function unitName(p) { return nameOf(Api.db.measurements, p.measurementId) || 'EACH'; }

  Api.module({
    seed: function (db) {
      db.pos = []; db.purchases = []; db.transfers = []; db.stocktakes = [];
    },
    afterSeed: function (db) {
      var d = function (back) { return new Date(Date.now() - back * 864e5).toISOString(); };
      var p = Api.productByCode;
      // one open purchase order and two received deliveries
      db.pos.push({ id: Api.next('po'), number: 'PO-0001', shopId: 1, supplierId: 2, date: d(2), note: 'Weekly fresh order', cancelled: false, cancelReason: '',
        lines: [{ detailId: Api.next('poline'), productId: p('M02').productId, quantity: 20, cost: 18, received: 0, cancelled: false }, { detailId: Api.next('poline'), productId: p('M03').productId, quantity: 25, cost: 9.5, received: 0, cancelled: false }] });
      [[5, 2, 'INV 5488', [['M01', 40, 4.5], ['M05', 50, 2.2]]], [12, 3, 'INV 5541', [['G01', 200, 0.2], ['G02', 200, 0.1]]]].forEach(function (g) {
        var lines = g[3].map(function (l) { return { productId: p(l[0]).productId, quantity: l[1], cost: l[2], total: round2(l[1] * l[2]), vat: false }; });
        db.purchases.push({ number: 'GR-' + Api.pad(Api.next('purchase'), 4), shopId: 1, date: d(g[0]), supplierId: g[1], reference: g[2], total: round2(lines.reduce(function (s, l) { return s + l.total; }, 0)), paid: 0,
          documentType: 'Goods receipt', stockPosted: true, payablePosted: g[0] > 10, note: '', poId: null, lines: lines });
      });
      // goods on the way to the second shop
      db.transfers.push({ id: Api.next('transfer'), number: 'TR-0001', sourceShopId: 1, destShopId: 2, date: d(1), dispatched: true, received: false, note: 'Top up drinks',
        lines: [{ productId: p('B01').productId, quantity: 12, received: 0 }, { productId: p('B03').productId, quantity: 12, received: 0 }] });
      Api.at = d(1); Api.atUser = 'Demo Admin';
      try { db.transfers[0].lines.forEach(function (l) { Api.moveStock(1, l.productId, -l.quantity, 'TRANSFER_OUT', 'TR-0001'); }); } finally { Api.at = null; Api.atUser = null; }
    }
  });

  // ---- products ------------------------------------------------------------------
  function productFilter(q, shopId) {
    var s = (q.search || '').toLowerCase().trim();
    return Api.db.products.filter(function (p) {
      if (q.activeStatus === 'inactive' && p.active) return false;
      if ((!q.activeStatus || q.activeStatus === 'active') && !p.active && q.includeInactive !== 'true') return false;
      if (q.categoryId && p.categoryId !== Number(q.categoryId)) return false;
      if (q.departmentId && p.departmentId !== Number(q.departmentId)) return false;
      if (q.stockType === 'stock' && !p.stockItem) return false;
      if (q.stockType === 'nonstock' && p.stockItem) return false;
      if (q.stockOnly === 'true' && !p.stockItem) return false;
      var st = Api.stockOf(shopId, p.productId);
      if (q.stockLevel === 'positive' && !(p.stockItem && st > 0)) return false;
      if (q.stockLevel === 'zero' && !(p.stockItem && st === 0)) return false;
      if (q.stockLevel === 'negative' && !(p.stockItem && st < 0)) return false;
      return !s || (p.name + ' ' + p.code + ' ' + p.barcode).toLowerCase().indexOf(s) >= 0;
    });
  }
  function opsRow(p, shopId) {
    return { productId: p.productId, stock: p.stockItem ? Api.stockOf(shopId, p.productId) : 0,
      fields: { code: p.code, name: p.name, categoryId: p.categoryId, departmentId: p.departmentId, measurementId: p.measurementId, price: p.price, cost: p.cost, vat: !!p.vat,
        stockItem: !!p.stockItem, supplierId: p.supplierId, active: p.active !== false, weightItem: !!p.weightItem },
      categoryName: nameOf(Api.db.categories, p.categoryId), departmentName: nameOf(Api.db.departments, p.departmentId), unit: unitName(p), supplierName: (Api.supplier(p.supplierId) || {}).name || '' };
  }
  function pickerRow(p, shopId) {
    return { id: p.productId, productId: p.productId, code: p.code, name: p.name, stock: p.stockItem ? Api.stockOf(shopId, p.productId) : null, stockItem: !!p.stockItem, unit: unitName(p), price: p.price, cost: p.cost,
      storedCost: p.cost, categoryName: nameOf(Api.db.categories, p.categoryId), departmentName: nameOf(Api.db.departments, p.departmentId), serialized: false, active: p.active !== false };
  }
  route('GET', '/api/operations/products', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId);
    return productFilter(ctx.q, shopId).sort(function (a, b) { return a.name < b.name ? -1 : 1; }).slice(0, 50).map(function (p) { return opsRow(p, shopId); });
  });
  route('GET', '/api/inventory/products', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId);
    return productFilter(ctx.q, shopId).sort(function (a, b) { return a.name < b.name ? -1 : 1; }).slice(0, 100).map(function (p) { return pickerRow(p, shopId); });
  });
  route('GET', '/api/inventory/component-products', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), q = Object.assign({}, ctx.q);
    return productFilter(q, shopId).filter(function (p) { return p.stockItem; }).sort(function (a, b) { return a.name < b.name ? -1 : 1; }).slice(0, 50).map(function (p) { return pickerRow(p, shopId); });
  });
  function readFields(f) {
    f = f || {};
    var p = { code: String(f.code || '').trim(), name: String(f.name || '').trim(), departmentId: Number(f.departmentId), categoryId: Number(f.categoryId), price: Number(f.price), cost: Number(f.cost),
      measurementId: Number(f.measurementId), vat: !!f.vat, stockItem: !!f.stockItem, supplierId: Number(f.supplierId) || null, active: f.active !== false, weightItem: !!f.weightItem };
    need(p.code, 'Enter a product code.'); need(p.name, 'Enter a product name.');
    need(isFinite(p.price) && p.price >= 0, 'Enter a valid price.'); need(isFinite(p.cost) && p.cost >= 0, 'Enter a valid cost.');
    need(Api.category(p.categoryId), 'Choose a category.'); need(nameOf(Api.db.departments, p.departmentId), 'Choose a department.'); need(nameOf(Api.db.measurements, p.measurementId), 'Choose a unit of measure.');
    return p;
  }
  route('POST', '/api/operations/products', function (ctx) {
    var f = readFields(ctx.body.product), db = Api.db;
    need(!db.products.some(function (p) { return p.code.toLowerCase() === f.code.toLowerCase(); }), 'This product code already exists.');
    var id = db.products.reduce(function (m, p) { return Math.max(m, p.productId); }, 0) + 1;
    db.products.push(Object.assign({ productId: id, description: '', barcode: '', imageUrl: '' }, f));
    db.shops.forEach(function (s) { (db.stock[s.shopId] || (db.stock[s.shopId] = {}))[id] = 0; });
    return { productId: id, message: 'Product created.', number: f.code };
  });
  route('POST', '/api/operations/products/update', function (ctx) {
    var b = ctx.body, p = Api.product(b.productId), db = Api.db;
    need(p, 'Product not found.', 404);
    var f = readFields(b.product);
    need(!db.products.some(function (x) { return x.productId !== p.productId && x.code.toLowerCase() === f.code.toLowerCase(); }), 'This product code already exists.');
    if (p.stockItem && !f.stockItem) {
      need(db.shops.every(function (s) { return Api.stockOf(s.shopId, p.productId) === 0; }), 'Stock must be zero in every shop before this product becomes non-stock.');
    }
    if (!p.stockItem && f.stockItem) delete db.recipes[p.productId];
    Object.assign(p, f);
    return { productId: p.productId, message: 'Product updated.', number: p.code };
  });
  route('POST', '/api/products/:id/image', function (ctx) {
    var p = Api.product(ctx.params.id), file = ctx.form && (ctx.form.get('image') || ctx.form.get('file'));
    need(p, 'Product not found.', 404);
    need(file && file.size, 'Choose an image.');
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { p.imageUrl = String(reader.result); resolve({ ok: true, imageUrl: p.imageUrl, message: 'Image saved.' }); };
      reader.onerror = function () { reject(new Api.ApiError(400, 'The image could not be read.')); };
      reader.readAsDataURL(file);
    });
  });
  route('POST', '/api/products/:id/image/remove', function (ctx) { var p = Api.product(ctx.params.id); if (p) p.imageUrl = ''; return { ok: true }; });

  // ---- recipes -------------------------------------------------------------------
  route('GET', '/api/inventory/products/:id/components', function (ctx) {
    var p = Api.product(ctx.params.id), shopId = Api.shopId(ctx.q.shopId);
    need(p, 'Product not found.', 404);
    var rows = (Api.db.recipes[p.productId] || []).map(function (c, i) { var m = Api.product(c.materialId); return { id: i + 1, componentId: c.materialId, name: m.name, quantity: c.quantity, active: c.active !== false, locationId: shopId }; });
    var mats = (Api.db.recipes[p.productId] || []).map(function (c) { return pickerRow(Api.product(c.materialId), shopId); });
    return { components: rows, locationId: shopId, materials: mats, imageUrl: p.imageUrl || '' };
  });
  route('POST', '/api/inventory/products/components', function (ctx) {
    var b = ctx.body, p = Api.product(b.productId);
    need(p && !p.stockItem, 'Only non-stock products can have a recipe.');
    var rows = (b.components || []).filter(function (c) { return c.componentId; });
    rows.forEach(function (c) { need(Number(c.quantity) > 0, 'Enter a quantity above zero for every raw material.'); });
    Api.db.recipes[p.productId] = rows.map(function (c) { return { materialId: Number(c.componentId), quantity: Number(c.quantity), active: c.active !== false }; });
    if (b.updateCost) {
      var cost = Api.db.recipes[p.productId].filter(function (c) { return c.active; }).reduce(function (s, c) { return s + c.quantity * (Api.product(c.materialId).cost || 0); }, 0);
      p.cost = round2(cost);
    }
    return { message: 'Recipe saved.', number: p.code };
  });

  // ---- stock adjustment ----------------------------------------------------------
  route('POST', '/api/operations/adjust', function (ctx) {
    var b = ctx.body, shopId = Api.shopId(b.shopId), p = Api.product(b.productId);
    need(p && p.stockItem, 'Choose a stock product.');
    need(nameOf(Api.db.adjustments, b.adjustmentId), 'Choose an adjustment type.');
    var change = Number(b.quantity);
    need(isFinite(change) && change !== 0, 'Enter a quantity change.');
    var before = Api.stockOf(shopId, p.productId);
    need(b.expectedStock == null || Math.abs(Number(b.expectedStock) - before) < 0.00001, 'Stock changed since you opened this product. Select it again.');
    Api.moveStock(shopId, p.productId, change, 'ADJUST', nameOf(Api.db.adjustments, b.adjustmentId), b.reason || '');
    return { message: 'Stock adjusted.', before: before, after: Api.stockOf(shopId, p.productId), number: 'ADJ-' + Api.pad(Api.next('adjust'), 4) };
  });

  // ---- purchase orders -----------------------------------------------------------
  route('POST', '/api/inventory/purchase-orders', function (ctx) {
    var b = ctx.body, shopId = Api.shopId(b.shopId);
    need(Api.supplier(b.supplierId), 'Choose a supplier.');
    need((b.lines || []).length, 'Add at least one item to the purchase order.');
    var lines = b.lines.map(function (l) {
      var p = Api.product(l.productId); need(p && p.stockItem, 'Only stock products can be ordered.');
      need(Number(l.quantity) > 0 && Number(l.cost) >= 0, 'Enter a quantity and cost for ' + p.name + '.');
      return { detailId: Api.next('poline'), productId: p.productId, quantity: Number(l.quantity), cost: Number(l.cost), received: 0, cancelled: false };
    });
    var po = { id: Api.next('po'), number: 'PO-' + Api.pad(Api.db.pos.length + 1, 4), shopId: shopId, supplierId: Number(b.supplierId), date: Api.nowIso(), note: b.note || '', cancelled: false, cancelReason: '', lines: lines };
    Api.db.pos.push(po);
    return { poId: po.id, number: po.number, message: 'Purchase order created.' };
  });
  function poOpen(po) { return !po.cancelled && po.lines.some(function (l) { return !l.cancelled && l.received < l.quantity; }); }
  route('GET', '/api/inventory/purchase-orders', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId);
    if (ctx.q.id) {
      var po = Api.db.pos.filter(function (x) { return x.id === Number(ctx.q.id); })[0];
      need(po, 'Purchase order not found.', 404);
      return po.lines.filter(function (l) { return !l.cancelled && l.received < l.quantity; }).map(function (l) {
        var p = Api.product(l.productId);
        return { id: l.detailId, detailId: l.detailId, productId: p.productId, code: p.code, name: p.name, stock: Api.stockOf(shopId, p.productId), stockItem: true, unit: unitName(p), balance: round4(l.quantity - l.received), pack: 1, cost: l.cost, unitCost: l.cost, serialized: false };
      });
    }
    var no = (ctx.q.poNo || '').toLowerCase(), sup = (ctx.q.supplier || '').toLowerCase();
    return Api.db.pos.filter(function (po) { return po.shopId === shopId && poOpen(po) && (!no || po.number.toLowerCase().indexOf(no) >= 0) && (!sup || (Api.supplier(po.supplierId).name).toLowerCase().indexOf(sup) >= 0); })
      .map(function (po) { return { id: po.id, number: po.number, supplier: Api.supplier(po.supplierId).name }; });
  });
  route('GET', '/api/inventory/po', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId);
    return Api.db.pos.filter(function (po) { return po.shopId === shopId && poOpen(po) && po.lines.every(function (l) { return !l.received; }); }).map(function (po) { return { id: po.id, number: po.number, supplier: Api.supplier(po.supplierId).name }; });
  });
  route('POST', '/api/inventory/po/cancel', function (ctx) {
    var po = Api.db.pos.filter(function (x) { return x.id === Number(ctx.body.poId); })[0];
    need(po, 'Purchase order not found.', 404);
    need(po.lines.every(function (l) { return !l.received; }), 'A purchase order that has been received cannot be cancelled.');
    need(String(ctx.body.reason || '').trim(), 'Enter a cancellation reason.');
    po.cancelled = true; po.cancelReason = ctx.body.reason;
    return { message: 'Purchase order cancelled.', number: po.number };
  });
  route('GET', '/api/inventory/purchase-order-print', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), db = Api.db;
    if (ctx.q.id) {
      var po = db.pos.filter(function (x) { return x.id === Number(ctx.q.id); })[0];
      need(po, 'Purchase order not found.', 404);
      return { header: { number: po.number, supplier: Api.supplier(po.supplierId).name, date: po.date, shop: Api.shop(po.shopId).shopName, cancelled: po.cancelled, note: po.note }, company: Api.companyReceipt(), logoUrl: '',
        lines: po.lines.map(function (l) { var p = Api.product(l.productId); return { code: p.code, name: p.name, uom: unitName(p), quantity: l.quantity, cost: l.cost, total: round2(l.quantity * l.cost), cancelled: l.cancelled }; }) };
    }
    var no = (ctx.q.poNo || '').toLowerCase(), sup = (ctx.q.supplier || '').toLowerCase();
    return db.pos.filter(function (po) { return po.shopId === shopId && (!no || po.number.toLowerCase().indexOf(no) >= 0) && (!sup || Api.supplier(po.supplierId).name.toLowerCase().indexOf(sup) >= 0) && (!ctx.q.date || po.date.slice(0, 10) === ctx.q.date); })
      .sort(function (a, b) { return b.id - a.id; }).map(function (po) { return { id: po.id, number: po.number, supplier: Api.supplier(po.supplierId).name, date: po.date }; });
  });

  // ---- receiving and purchasing documents ----------------------------------------
  function postReceipt(shopId, supplierId, reference, date, lines, poId) {
    var db = Api.db;
    var no = 'GR-' + Api.pad(Api.next('purchase'), 4);
    var docLines = lines.map(function (l) {
      var p = Api.product(l.productId), qty = Number(l.quantity), cost = Number(l.cost);
      var vatAdd = l.vat ? db.company.vat / 100 : 0;
      Api.moveStock(shopId, p.productId, qty, 'RECEIVE', no);
      if (cost > 0) p.cost = round4(cost);
      return { productId: p.productId, quantity: qty, cost: round4(cost * (1 + vatAdd)), total: round2(qty * cost * (1 + vatAdd)), vat: !!l.vat };
    });
    var doc = { number: no, shopId: shopId, date: date ? new Date(date + 'T12:00:00').toISOString() : Api.nowIso(), supplierId: Number(supplierId), reference: reference || '', total: round2(docLines.reduce(function (s, l) { return s + l.total; }, 0)),
      paid: 0, documentType: 'Goods receipt', stockPosted: true, payablePosted: false, note: '', poId: poId || null, lines: docLines };
    db.purchases.push(doc);
    return doc;
  }
  route('POST', '/api/inventory/receive', function (ctx) {
    var b = ctx.body, shopId = Api.shopId(b.shopId), po = Api.db.pos.filter(function (x) { return x.id === Number(b.poId); })[0];
    need(po && poOpen(po), 'Choose an open purchase order.');
    need((b.lines || []).length, 'Enter a quantity received for at least one item.');
    var lines = b.lines.map(function (r) {
      var l = po.lines.filter(function (x) { return x.detailId === Number(r.detailId); })[0];
      need(l, 'A purchase order line could not be found.');
      need(Number(r.quantity) > 0 && Number(r.quantity) <= round4(l.quantity - l.received) + 0.00001, 'You cannot receive more than the balance of ' + Api.product(l.productId).name + '.');
      l.received = round4(l.received + Number(r.quantity));
      return { productId: l.productId, quantity: Number(r.quantity), cost: l.cost, vat: !!r.vat };
    });
    var doc = postReceipt(shopId, po.supplierId, b.reference, b.invoiceDate, lines, po.id);
    return { message: 'Goods received.', number: doc.number };
  });
  route('POST', '/api/inventory/receive-without-po', function (ctx) {
    var b = ctx.body, shopId = Api.shopId(b.shopId);
    need(Api.supplier(b.supplierId), 'Choose a supplier.');
    need((b.lines || []).length, 'Add at least one item.');
    b.lines.forEach(function (l) { need(Api.product(l.productId) && Number(l.quantity) > 0 && Number(l.cost) >= 0, 'Enter a quantity and cost for every item.'); });
    var doc = postReceipt(shopId, b.supplierId, b.reference, b.invoiceDate, b.lines, null);
    return { message: 'Goods received.', number: doc.number };
  });
  route('GET', '/api/inventory/purchases', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), q = ctx.q, db = Api.db;
    var rows = db.purchases.filter(function (d) {
      var day = d.date.slice(0, 10);
      if (d.shopId !== shopId) return false;
      if (q.from && day < q.from) return false; if (q.to && day > q.to) return false;
      if (q.supplierId && d.supplierId !== Number(q.supplierId)) return false;
      var s = (q.search || '').toLowerCase();
      return !s || (d.number + ' ' + d.reference).toLowerCase().indexOf(s) >= 0;
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    function view(d) { return { number: d.number, date: d.date, supplierId: d.supplierId, supplier: Api.supplier(d.supplierId).name, reference: d.reference, total: d.total, paid: d.paid, balance: round2(d.total - d.paid),
      documentType: d.documentType, status: d.payablePosted ? 'Invoiced' : 'Unbilled', stockPosted: d.stockPosted, payablePosted: d.payablePosted, note: d.note }; }
    if (q.number) {
      var d = db.purchases.filter(function (x) { return x.number === q.number; })[0];
      need(d, 'Purchase document not found.', 404);
      return { header: view(d), company: Api.companyReceipt(), lines: d.lines.map(function (l) { var p = Api.product(l.productId); return { code: p.code, name: p.name, quantity: l.quantity, cost: l.cost, total: l.total }; }) };
    }
    return rows.map(view);
  });
  route('POST', '/api/inventory/purchases/bill', function (ctx) {
    var d = Api.db.purchases.filter(function (x) { return x.number === ctx.body.purchaseNo; })[0];
    need(d, 'Purchase document not found.', 404);
    need(!d.payablePosted, 'A supplier invoice has already been posted for this receipt.');
    need(String(ctx.body.supplierInvoiceNo || '').trim(), 'Enter the supplier invoice number.');
    d.payablePosted = true; d.reference = ctx.body.supplierInvoiceNo; d.note = ctx.body.note || d.note; d.documentType = 'Supplier invoice';
    return { message: 'Supplier invoice posted.', number: d.number };
  });

  // ---- transfers -----------------------------------------------------------------
  function transferView(t) {
    return { id: t.id, number: t.number, source: Api.shop(t.sourceShopId).shopName, destination: Api.shop(t.destShopId).shopName, date: t.date, received: t.received, dispatched: t.dispatched };
  }
  function dispatchTransfer(shopId, destShopId, note, lines) {
    var db = Api.db;
    need(Api.shop(destShopId) && Number(destShopId) !== shopId, 'Choose a destination branch.');
    need((lines || []).length, 'Add at least one product to transfer.');
    var t = { id: Api.next('transfer'), number: 'TR-' + Api.pad(db.transfers.length + 1, 4), sourceShopId: shopId, destShopId: Number(destShopId), date: Api.nowIso(), dispatched: true, received: false, note: note || '', lines: [] };
    lines.forEach(function (l) {
      var p = Api.product(l.productId); need(p && p.stockItem, 'Only stock products can be transferred.');
      need(Number(l.quantity) > 0, 'Enter a quantity above zero.');
      Api.moveStock(shopId, p.productId, -Number(l.quantity), 'TRANSFER_OUT', t.number);
      t.lines.push({ productId: p.productId, quantity: Number(l.quantity), received: 0 });
    });
    db.transfers.push(t);
    return t;
  }
  route('POST', '/api/inventory/transfers', function (ctx) {
    var b = ctx.body, t = dispatchTransfer(Api.shopId(b.shopId), b.destinationShopId, b.note, b.lines);
    return { message: 'Transfer dispatched.', number: t.number };
  });
  route('POST', '/api/inventory/transfers/bulk', function (ctx) {
    var b = ctx.body, shopId = Api.shopId(b.shopId), numbers = [];
    need((b.destinations || []).length, 'Choose at least one destination.');
    b.destinations.forEach(function (d) { numbers.push(dispatchTransfer(shopId, d.shopId, b.note, d.lines).number); });
    return { message: 'Bulk transfers dispatched.', number: numbers.join(', ') };
  });
  route('GET', '/api/inventory/transfers', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), incoming = ctx.q.incoming === 'true';
    var mine = Api.db.transfers.filter(function (t) { return incoming ? t.destShopId === shopId : t.sourceShopId === shopId; }).sort(function (a, b) { return b.id - a.id; });
    if (ctx.q.transferId) {
      var t = mine.filter(function (x) { return x.id === Number(ctx.q.transferId); })[0];
      need(t, 'Transfer not found.', 404);
      return { header: transferView(t), lines: t.lines.map(function (l) { var p = Api.product(l.productId); return { code: p.code, name: p.name, quantity: l.quantity, received: l.received }; }) };
    }
    return mine.map(transferView);
  });
  route('POST', '/api/inventory/transfers/receive', function (ctx) {
    var shopId = Api.shopId(ctx.body.shopId), t = Api.db.transfers.filter(function (x) { return x.id === Number(ctx.body.transferId); })[0];
    need(t && t.destShopId === shopId, 'Transfer not found at this branch.', 404);
    need(t.dispatched && !t.received, 'This transfer has already been received.');
    t.lines.forEach(function (l) { l.received = l.quantity; Api.moveStock(shopId, l.productId, l.quantity, 'TRANSFER_IN', t.number); });
    t.received = true;
    return { message: 'Goods received.', number: t.number };
  });

  // ---- stocktake -----------------------------------------------------------------
  route('GET', '/api/inventory/stocktake', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), list = Api.db.stocktakes.filter(function (s) { return s.shopId === shopId; }).sort(function (a, b) { return a.createdUtc < b.createdUtc ? 1 : -1; });
    if (ctx.q.batchId) {
      var s = list.filter(function (x) { return x.id === ctx.q.batchId; })[0];
      need(s, 'Count not found.', 404);
      return { header: { batchNo: s.batchNo, state: s.state }, catalog: s.catalog.map(function (c) { return { productId: c.productId, code: c.code, name: c.name, snapshot: c.snapshot, currentQuantity: Api.stockOf(shopId, c.productId), quantity: c.quantity }; }) };
    }
    return list.map(function (s) { return { id: s.id, state: s.state, batchNo: s.batchNo, createdUtc: s.createdUtc, userId: s.userId }; });
  });
  route('POST', '/api/inventory/stocktake/post', function (ctx) {
    var shopId = Api.shopId(ctx.body.shopId), s = Api.db.stocktakes.filter(function (x) { return x.id === ctx.body.batchId; })[0];
    need(s && s.state === 'UPLOADED', 'Only an uploaded count can be posted.');
    s.catalog.forEach(function (c) {
      if (c.quantity == null) return;
      var now = Api.stockOf(shopId, c.productId), diff = round4(Number(c.quantity) - now);
      if (diff !== 0) Api.moveStock(shopId, c.productId, diff, 'STOCKTAKE', s.batchNo, 'Stocktake ' + s.batchNo);
    });
    s.state = 'POSTED';
    return { message: 'Stocktake posted.', number: s.batchNo };
  });
  route('POST', '/api/inventory/stocktake/prepare', function (ctx) {
    var shopId = Api.shopId(ctx.body.shopId), db = Api.db;
    var again = db.stocktakes.filter(function (x) { return x.requestId && x.requestId === ctx.body.requestId; })[0];
    function catalog(batch) {
      return batch.catalog.map(function (c) {
        var p = Api.product(c.productId);
        return { id: p.productId, productId: p.productId, code: p.code, name: p.name, barcode: p.barcode || '', unit: unitName(p), stock: c.snapshot, stockItem: true, price: p.price, cost: p.cost, snapshot: c.snapshot };
      });
    }
    if (again) return { batchId: again.id, batchNo: again.batchNo, catalog: catalog(again) };
    var n = db.stocktakes.length + 1;
    var batch = { id: Api.uuid(), requestId: ctx.body.requestId, shopId: shopId, state: 'COUNTING', batchNo: 'B-' + Api.pad(n, 4), createdUtc: Api.nowIso(), userId: Api.numId(Api.user()),
      catalog: db.products.filter(function (p) { return p.stockItem && p.active !== false; }).map(function (p) { return { productId: p.productId, code: p.code, name: p.name, snapshot: Api.stockOf(shopId, p.productId), quantity: null }; }) };
    db.stocktakes.push(batch);
    return { batchId: batch.id, batchNo: batch.batchNo, catalog: catalog(batch) };
  });
  route('POST', '/api/inventory/stocktake/upload', function (ctx) {
    var b = ctx.body, shopId = Api.shopId(b.shopId), batch = Api.db.stocktakes.filter(function (x) { return x.id === b.batchId; })[0];
    need(batch, 'This count could not be found. Download a new count.', 404);
    need(batch.state === 'COUNTING' || batch.state === 'UPLOADED', 'This count has already been posted.');
    var lines = b.lines || [];
    need(lines.length, 'Count at least one product before uploading.');
    var conflicts = [];
    lines.forEach(function (l) {
      var c = batch.catalog.filter(function (x) { return x.productId === Number(l.productId); })[0];
      need(c, 'A counted product is not part of this count.');
      need(Number(l.quantity) >= 0, 'Counted quantities cannot be negative.');
      c.quantity = Number(l.quantity);
      if (Math.abs(Api.stockOf(shopId, c.productId) - c.snapshot) > 0.00001) conflicts.push({ productId: c.productId, code: c.code, name: c.name });
    });
    batch.state = 'UPLOADED';
    return { message: 'Count ' + batch.batchNo + ' uploaded.', number: batch.batchNo, conflicts: conflicts };
  });
})();
