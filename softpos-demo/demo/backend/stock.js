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

  // ---- back-office product list (backoffice-design-spec 4.1, 4.2 and 7) ---------------------
  // One row shape for the list, the drawer and the CSV: the product, its unit and sub unit, its stock at one shop and whether it has a recipe.
  function bad(field, message) { throw new Api.ApiError(400, message, { field: field }); }
  function recipeCost(productId) {
    var r = (Api.db.recipes[productId] || []).filter(function (c) { return c.active !== false; });
    return r.length ? round2(r.reduce(function (s, c) { var m = Api.product(c.materialId); return s + c.quantity * (m ? m.cost : 0); }, 0)) : null;
  }
  function margin(p) { return p.price > 0 ? Math.round((p.price - p.cost) / p.price * 1000) / 10 : null; }
  function boRow(p, shopId) {
    var cat = Api.category(p.categoryId), dep = nameOf(Api.db.departments, p.departmentId), sup = Api.supplier(p.supplierId);
    return { productId: p.productId, code: p.code, name: p.name, spec: p.spec || '', categoryId: p.categoryId, categoryName: cat ? cat.name : '', departmentId: p.departmentId, departmentName: dep,
      supplierId: p.supplierId || null, supplierName: sup ? sup.name : '', price: p.price, cost: p.cost, margin: margin(p), stockItem: !!p.stockItem, stock: p.stockItem ? Api.stockOf(shopId, p.productId) : null,
      unitId: p.measurementId, unit: unitName(p), subUnitId: p.subMeasurementId || null, subUnit: Api.unitName(p.subMeasurementId), subRatio: p.subRatio || null,
      weighed: !!p.weightItem, vat: p.vat !== false, active: p.active !== false, barcode: p.barcode || '', menuNo: p.menuNo || null, favourite: Api.isFavourite(shopId, p.productId),
      hasRecipe: Api.hasRecipe(p.productId), recipeCount: (Api.db.recipes[p.productId] || []).length, recipeCost: recipeCost(p.productId), hasImage: !!p.imageUrl };
  }
  function boFilter(q, shopId) {
    var f = Api.filtersOf(q), s = (q.q || '').toLowerCase().trim();
    return Api.db.products.filter(function (p) {
      var st = f.status || 'active';
      if (st === 'active' && p.active === false) return false;
      if (st === 'inactive' && p.active !== false) return false;
      if (f.categoryId && p.categoryId !== Number(f.categoryId)) return false;
      if (f.departmentId && p.departmentId !== Number(f.departmentId)) return false;
      if (f.supplierId && p.supplierId !== Number(f.supplierId)) return false;
      if (f.type === 'stock' && !p.stockItem) return false;
      if (f.type === 'nonstock' && p.stockItem) return false;
      if (f.recipe === 'has' && !Api.hasRecipe(p.productId)) return false;
      if (f.recipe === 'none' && Api.hasRecipe(p.productId)) return false;
      var stock = Api.stockOf(shopId, p.productId);
      if (f.stockLevel === 'negative' && !(p.stockItem && stock < 0)) return false;
      if (f.stockLevel === 'zero' && !(p.stockItem && stock === 0)) return false;
      if (f.stockLevel === 'positive' && !(p.stockItem && stock > 0)) return false;
      if (f.favourite === 'yes' && !Api.isFavourite(shopId, p.productId)) return false;
      if (f.menu === 'yes' && !p.menuNo) return false;
      return !s || (p.name + ' ' + p.code + ' ' + (p.barcode || '') + ' ' + (p.spec || '')).toLowerCase().indexOf(s) >= 0;
    });
  }
  var BO_SORTS = {
    code: function (r) { return r.code; }, name: function (r) { return r.name; }, spec: function (r) { return r.spec; }, category: function (r) { return r.categoryName; }, department: function (r) { return r.departmentName; },
    supplier: function (r) { return r.supplierName; }, price: function (r) { return r.price; }, cost: function (r) { return r.cost; }, margin: function (r) { return r.margin; }, stock: function (r) { return r.stock; },
    unit: function (r) { return r.unit; }, subUnit: function (r) { return r.subUnit; }, status: function (r) { return r.active ? 0 : 1; }, menuNo: function (r) { return r.menuNo; }, barcode: function (r) { return r.barcode; },
    weighed: function (r) { return r.weighed ? 0 : 1; }, favourite: function (r) { return r.favourite ? 0 : 1; }, recipe: function (r) { return r.hasRecipe ? 0 : 1; }, recipeCost: function (r) { return r.recipeCost; }
  };
  function boTotals(rows) {
    var value = 0, negative = 0;
    rows.forEach(function (r) { if (r.stock !== null) { value += r.stock * r.cost; if (r.stock < 0) negative++; } });
    return { count: rows.length, stockValue: round2(value), negative: negative, withRecipe: rows.filter(function (r) { return r.hasRecipe; }).length };
  }
  route('GET', '/api/bo/products', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId);
    var rows = boFilter(ctx.q, shopId).map(function (p) { return boRow(p, shopId); });
    return Api.listPage(ctx.q, rows, BO_SORTS, boTotals);
  });
  var EXPORT_HEAD = ['Code', 'Name', 'Specification', 'Category', 'Department', 'Supplier', 'Retail price', 'Cost price', 'Gross margin %', 'Stock item', 'Stock', 'Unit', 'Sub unit', 'Sub unit ratio', 'Weighed', 'VAT', 'Active', 'Barcode', 'Menu number'];
  function yn(v) { return v ? 'Yes' : 'No'; }
  route('GET', '/api/bo/products/export', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId);
    var rows = Api.sortRows(boFilter(ctx.q, shopId).map(function (p) { return boRow(p, shopId); }), ctx.q.sort, BO_SORTS).map(function (r) {
      return [r.code, r.name, r.spec, r.categoryName, r.departmentName, r.supplierName, r.price, r.cost, r.margin === null ? '' : r.margin, yn(r.stockItem), r.stock === null ? '' : r.stock, r.unit, r.subUnit, r.subRatio || '', yn(r.weighed), yn(r.vat), yn(r.active), r.barcode, r.menuNo || ''];
    });
    return Api.csvResponse('products.csv', Api.csvText(EXPORT_HEAD, rows));
  });
  route('GET', '/api/bo/products/template', function () {
    return Api.csvResponse('products-template.csv', Api.csvText(EXPORT_HEAD.filter(function (h) { return h !== 'Gross margin %' && h !== 'Stock'; }), [['X01', 'Example dish', 'One plate', 'Rice', 'General', 'General Supplier', 9.8, 3.6, '', 'No', '', 'EACH', '', '', 'No', 'Yes', 'Yes', '', '']]));
  });
  function usedAsIngredient(id) {
    var out = [];
    Object.keys(Api.db.recipes).forEach(function (dish) { if (Api.db.recipes[dish].some(function (c) { return c.materialId === Number(id); })) out.push(Number(dish)); });
    return out;
  }
  // A product that has been sold, counted, ordered, moved or used in a recipe cannot be deleted; it can be made inactive.
  function productHistory(id) {
    var db = Api.db, hit = new RegExp('"productId":' + Number(id) + '[,}]');
    if (db.recipes[id] || usedAsIngredient(id).length) return 'a recipe';
    if (db.movements.some(function (m) { return m.productId === Number(id); })) return 'stock movements';
    var lists = { sales: db.invoices, 'held sales': db.holds, quotations: db.quotations, 'purchase orders': db.pos, 'purchases': db.purchases, transfers: db.transfers, stocktakes: db.stocktakes, refunds: db.refunds };
    var names = Object.keys(lists);
    for (var i = 0; i < names.length; i++) if (hit.test(JSON.stringify(lists[names[i]] || []))) return names[i];
    return '';
  }
  function boDetail(p, shopId) {
    var row = boRow(p, shopId);
    row.stockByShop = Api.db.shops.map(function (s) { return { shopId: s.shopId, shopName: s.shopName, stock: p.stockItem ? Api.stockOf(s.shopId, p.productId) : null }; });
    row.usedIn = usedAsIngredient(p.productId).length;
    row.history = productHistory(p.productId);
    return row;
  }
  function boRead(input, base) {
    var f = input || {}, p = Object.assign({ code: '', name: '', spec: '', categoryId: 0, departmentId: 0, supplierId: null, measurementId: 0, subMeasurementId: null, subRatio: null, price: 0, cost: 0, vat: true, stockItem: true, weighed: false, active: true, barcode: '', menuNo: null }, base || {});
    ['code', 'name', 'spec', 'barcode'].forEach(function (k) { if (f[k] !== undefined) p[k] = String(f[k] === null ? '' : f[k]).trim(); });
    ['categoryId', 'departmentId', 'measurementId'].forEach(function (k) { if (f[k] !== undefined) p[k] = Number(f[k]); });
    ['supplierId', 'subMeasurementId'].forEach(function (k) { if (f[k] !== undefined) p[k] = Number(f[k]) || null; });
    ['price', 'cost'].forEach(function (k) { if (f[k] !== undefined) p[k] = f[k] === '' || f[k] === null ? NaN : Number(f[k]); });
    if (f.subRatio !== undefined) p.subRatio = f.subRatio === '' || f.subRatio === null ? null : Number(f.subRatio);
    ['vat', 'stockItem', 'weighed', 'active'].forEach(function (k) { if (f[k] !== undefined) p[k] = !!f[k]; });
    if (f.menuNo !== undefined) p.menuNo = f.menuNo === '' || f.menuNo === null ? null : Number(f.menuNo);
    if (!p.name) bad('name', 'Enter a product name.');
    if (!p.code) bad('code', 'Enter a product code.');
    if (!Api.category(p.categoryId)) bad('categoryId', 'Choose a category.');
    if (!isFinite(p.price) || p.price < 0) bad('price', 'Enter a valid retail price.');
    if (!isFinite(p.cost) || p.cost < 0) bad('cost', 'Enter a valid cost price.');
    if (!nameOf(Api.db.measurements, p.measurementId)) bad('measurementId', 'Choose a main unit.');
    if (!nameOf(Api.db.departments, p.departmentId)) p.departmentId = Api.category(p.categoryId).departmentId || 1;
    if (p.subMeasurementId) {
      if (!nameOf(Api.db.measurements, p.subMeasurementId)) bad('subMeasurementId', 'Choose a sub unit.');
      if (p.subMeasurementId === p.measurementId) bad('subMeasurementId', 'The sub unit must differ from the main unit.');
      if (!(p.subRatio > 0)) bad('subRatio', 'Enter how many sub units make one main unit.');
    } else { p.subMeasurementId = null; p.subRatio = null; }
    if (p.menuNo !== null && !(Math.floor(p.menuNo) === p.menuNo && p.menuNo >= 1 && p.menuNo <= 999)) bad('menuNo', 'A menu number is a whole number from 1 to 999.');
    return p;
  }
  function boUnique(f, selfId) {
    var db = Api.db;
    db.products.forEach(function (x) {
      if (x.productId === selfId) return;
      if (x.code.toLowerCase() === f.code.toLowerCase()) bad('code', 'This product code already exists.');
      if (f.barcode && x.barcode && x.barcode === f.barcode) bad('barcode', 'This barcode is already used by ' + x.name + '.');
      if (f.menuNo && x.menuNo === f.menuNo) bad('menuNo', 'Menu number ' + f.menuNo + ' is already used by ' + x.name + '.');
    });
  }
  function boApply(p, f) {
    ['code', 'name', 'spec', 'categoryId', 'departmentId', 'supplierId', 'measurementId', 'subMeasurementId', 'subRatio', 'price', 'cost', 'vat', 'stockItem', 'active', 'barcode', 'menuNo'].forEach(function (k) { p[k] = f[k]; });
    p.weightItem = !!f.weighed;
  }
  function setFavourite(shopId, productId, on) {
    var list = Api.favouriteIds(shopId), at = list.indexOf(productId);
    if (on && at < 0) list.push(productId);
    if (!on && at >= 0) list.splice(at, 1);
  }
  route('GET', '/api/bo/products/:id', function (ctx) {
    var p = Api.product(ctx.params.id);
    need(p, 'Product not found.', 404);
    return boDetail(p, Api.shopId(ctx.q.shopId));
  });
  route('POST', '/api/bo/products', function (ctx) {
    var b = ctx.body, db = Api.db, shopId = Api.shopId(b.shopId), f = boRead(b.product);
    boUnique(f, 0);
    var id = db.products.reduce(function (m, x) { return Math.max(m, x.productId); }, 0) + 1, p = { productId: id, description: '', imageUrl: '' };
    boApply(p, f);
    db.products.push(p);
    db.shops.forEach(function (s) { (db.stock[s.shopId] || (db.stock[s.shopId] = {}))[id] = 0; });
    if (b.favourite !== undefined) setFavourite(shopId, id, !!b.favourite);
    return { productId: id, message: 'Product created.', number: p.code };
  });
  route('PATCH', '/api/bo/products/:id', function (ctx) {
    var db = Api.db, p = Api.product(ctx.params.id), b = ctx.body, shopId = Api.shopId(b.shopId);
    need(p, 'Product not found.', 404);
    var f = boRead(b.product, { code: p.code, name: p.name, spec: p.spec || '', categoryId: p.categoryId, departmentId: p.departmentId, supplierId: p.supplierId || null, measurementId: p.measurementId, subMeasurementId: p.subMeasurementId || null,
      subRatio: p.subRatio || null, price: p.price, cost: p.cost, vat: p.vat !== false, stockItem: !!p.stockItem, weighed: !!p.weightItem, active: p.active !== false, barcode: p.barcode || '', menuNo: p.menuNo || null });
    boUnique(f, p.productId);
    if (p.stockItem && !f.stockItem) {
      if (!db.shops.every(function (s) { return Api.stockOf(s.shopId, p.productId) === 0; })) bad('stockItem', 'Stock must be zero in every shop before this product becomes non-stock.');
      if (usedAsIngredient(p.productId).length) bad('stockItem', p.name + ' is an ingredient in ' + usedAsIngredient(p.productId).length + ' recipe(s). Take it out of them first.');
    }
    if (!p.stockItem && f.stockItem) delete db.recipes[p.productId];
    boApply(p, f);
    if (b.favourite !== undefined) setFavourite(shopId, p.productId, !!b.favourite);
    return { productId: p.productId, message: 'Product updated.', number: p.code };
  });
  function deleteProduct(p) {
    var db = Api.db, why = productHistory(p.productId);
    if (why) throw new Api.ApiError(400, p.name + ' has ' + why + ' and cannot be deleted. Make it inactive instead.');
    db.products = db.products.filter(function (x) { return x.productId !== p.productId; });
    Object.keys(db.stock).forEach(function (sid) { delete db.stock[sid][p.productId]; });
    Object.keys(db.favourites || {}).forEach(function (sid) { db.favourites[sid] = db.favourites[sid].filter(function (id) { return id !== p.productId; }); });
    delete db.recipes[p.productId];
  }
  route('DELETE', '/api/bo/products/:id', function (ctx) {
    var p = Api.product(ctx.params.id);
    need(p, 'Product not found.', 404);
    deleteProduct(p);
    return { message: 'Product deleted.', number: p.code };
  });
  route('POST', '/api/bo/products/bulk', function (ctx) {
    var b = ctx.body, db = Api.db, shopId = Api.shopId(b.shopId), done = 0, skipped = [];
    var ids = (b.ids || []).map(Number);
    need(ids.length, 'Select at least one product.');
    var action = b.action, value = b.value;
    if (action === 'category') need(Api.category(value), 'Choose a category.');
    ids.forEach(function (id) {
      var p = Api.product(id);
      if (!p) return;
      try {
        if (action === 'activate') p.active = true;
        else if (action === 'deactivate') p.active = false;
        else if (action === 'category') { p.categoryId = Number(value); p.departmentId = Api.category(value).departmentId || p.departmentId; }
        else if (action === 'favourite') setFavourite(shopId, id, true);
        else if (action === 'unfavourite') setFavourite(shopId, id, false);
        else if (action === 'delete') deleteProduct(p);
        else throw new Api.ApiError(400, 'Unknown action.');
        done++;
      } catch (e) { if (e instanceof Api.ApiError && action === 'delete') skipped.push({ id: id, name: p.name, reason: e.message }); else throw e; }
    });
    return { message: done + ' product(s) updated.', done: done, skipped: skipped };
  });
  // Products and recipes are shared by every shop here; copying makes sure the other shop has a stock line for each product, starting at zero.
  route('POST', '/api/bo/products/copy', function (ctx) {
    var b = ctx.body, db = Api.db, from = Api.shopId(b.shopId), to = Number(b.toShopId), added = 0;
    need(Api.shop(to) && to !== from, 'Choose another shop.');
    var ids = b.ids && b.ids.length ? b.ids.map(Number) : boFilter(b.query || {}, from).map(function (p) { return p.productId; });
    var stock = db.stock[to] || (db.stock[to] = {});
    ids.forEach(function (id) { if (Api.product(id) && stock[id] === undefined) { stock[id] = 0; added++; } });
    return { message: ids.length + ' product(s) are available at ' + Api.shop(to).shopName + '.', count: ids.length, added: added };
  });
  route('POST', '/api/bo/products/import', function (ctx) {
    var table = Api.parseCsv(ctx.body.csv), db = Api.db, created = 0, updated = 0, errors = [];
    need(table.length > 1, 'The file has no product lines.');
    var head = table[0].map(function (h) { return h.trim().toLowerCase(); }), col = function (name) { return head.indexOf(name.toLowerCase()); };
    need(col('Code') >= 0 && col('Name') >= 0, 'The first line must have the columns Code and Name.');
    var pick = function (row, name) { var i = col(name); return i < 0 ? undefined : String(row[i] === undefined ? '' : row[i]).trim(); };
    var truth = function (v) { return /^(yes|y|true|1)$/i.test(v); };
    var lookup = function (list, v) { var x = list.filter(function (i) { return i.name.toLowerCase() === String(v).toLowerCase(); })[0]; return x ? x.id : 0; };
    table.slice(1).forEach(function (row, n) {
      var line = n + 2;
      try {
        var code = pick(row, 'Code'), existing = db.products.filter(function (p) { return p.code.toLowerCase() === String(code).toLowerCase(); })[0], input = {};
        input.code = code; input.name = pick(row, 'Name');
        if (pick(row, 'Specification') !== undefined) input.spec = pick(row, 'Specification');
        var cat = pick(row, 'Category'); if (cat) { input.categoryId = lookup(db.categories, cat); if (!input.categoryId) throw new Api.ApiError(400, 'Unknown category "' + cat + '".'); }
        var dep = pick(row, 'Department'); if (dep) input.departmentId = lookup(db.departments, dep);
        var sup = pick(row, 'Supplier'); if (sup) input.supplierId = lookup(db.suppliers, sup);
        var unit = pick(row, 'Unit'); if (unit) { input.measurementId = lookup(db.measurements, unit); if (!input.measurementId) throw new Api.ApiError(400, 'Unknown unit "' + unit + '".'); }
        var sub = pick(row, 'Sub unit'); if (sub !== undefined) { input.subMeasurementId = sub ? lookup(db.measurements, sub) : null; input.subRatio = pick(row, 'Sub unit ratio'); }
        ['Retail price', 'Cost price'].forEach(function (h) { var v = pick(row, h); if (v !== undefined && v !== '') input[h === 'Retail price' ? 'price' : 'cost'] = v; });
        [['Stock item', 'stockItem'], ['Weighed', 'weighed'], ['VAT', 'vat'], ['Active', 'active']].forEach(function (m) { var v = pick(row, m[0]); if (v !== undefined && v !== '') input[m[1]] = truth(v); });
        if (pick(row, 'Barcode') !== undefined) input.barcode = pick(row, 'Barcode');
        if (pick(row, 'Menu number') !== undefined) input.menuNo = pick(row, 'Menu number');
        if (existing) {
          var f = boRead(input, { code: existing.code, name: existing.name, spec: existing.spec || '', categoryId: existing.categoryId, departmentId: existing.departmentId, supplierId: existing.supplierId || null, measurementId: existing.measurementId,
            subMeasurementId: existing.subMeasurementId || null, subRatio: existing.subRatio || null, price: existing.price, cost: existing.cost, vat: existing.vat !== false, stockItem: !!existing.stockItem, weighed: !!existing.weightItem, active: existing.active !== false, barcode: existing.barcode || '', menuNo: existing.menuNo || null });
          boUnique(f, existing.productId);
          if (existing.stockItem && !f.stockItem) throw new Api.ApiError(400, 'Change Stock item on the product page: stock must be zero first.');
          boApply(existing, f); updated++;
        } else {
          if (!input.categoryId) throw new Api.ApiError(400, 'Choose a category for a new product.');
          if (!input.measurementId) input.measurementId = 1;
          var g = boRead(input); boUnique(g, 0);
          var id = db.products.reduce(function (m, x) { return Math.max(m, x.productId); }, 0) + 1, np = { productId: id, description: '', imageUrl: '' };
          boApply(np, g); db.products.push(np); db.shops.forEach(function (s) { (db.stock[s.shopId] || (db.stock[s.shopId] = {}))[id] = 0; }); created++;
        }
      } catch (e) { if (e instanceof Api.ApiError) errors.push({ line: line, message: e.message }); else throw e; }
    });
    return { message: created + ' created, ' + updated + ' updated' + (errors.length ? ', ' + errors.length + ' line(s) skipped.' : '.'), created: created, updated: updated, errors: errors.slice(0, 30), errorCount: errors.length };
  });

  // ---- recipe overview (backoffice-design-spec section 6) ----------------------------------
  // A recipe belongs to a non-stock product (a dish). `portions` is how many the ingredients at this shop can still make.
  function recipeLines(p, shopId) {
    return (Api.db.recipes[p.productId] || []).map(function (c) {
      var m = Api.product(c.materialId);
      return { materialId: c.materialId, code: m.code, name: m.name, quantity: c.quantity, active: c.active !== false, unit: unitName(m), subUnit: Api.unitName(m.subMeasurementId), subRatio: m.subRatio || null,
        stock: Api.stockOf(shopId, m.productId), cost: m.cost, categoryName: (Api.category(m.categoryId) || {}).name || '' };
    });
  }
  function recipeStats(lines) {
    var live = lines.filter(function (l) { return l.active; }), portions = null, negative = [];
    live.forEach(function (l) {
      if (l.stock < 0) negative.push(l.name);
      var n = Math.max(0, Math.floor(l.stock / l.quantity + 1e-9));
      if (portions === null || n < portions) portions = n;
    });
    return { portions: portions, negative: negative };
  }
  function recipeRow(p, shopId) {
    var row = boRow(p, shopId), lines = recipeLines(p, shopId), st = recipeStats(lines);
    row.portions = st.portions; row.negativeIngredients = st.negative; row.ingredientCount = lines.length;
    return row;
  }
  function recipeFilter(q, shopId) {
    var f = Api.filtersOf(q), s = (q.q || '').toLowerCase().trim();
    return Api.db.products.filter(function (p) {
      if (p.stockItem || p.active === false) return false;
      if (f.categoryId && p.categoryId !== Number(f.categoryId)) return false;
      var has = Api.hasRecipe(p.productId);
      if (f.recipe === 'has' && !has) return false;
      if (f.recipe === 'none' && has) return false;
      if (f.negative === 'yes' && !recipeStats(recipeLines(p, shopId)).negative.length) return false;
      return !s || (p.name + ' ' + p.code + ' ' + (p.spec || '')).toLowerCase().indexOf(s) >= 0;
    });
  }
  var RECIPE_SORTS = Object.assign({}, BO_SORTS, { stock: function (r) { return r.portions; }, ingredients: function (r) { return r.ingredientCount; } });
  route('GET', '/api/bo/recipes', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), rows = recipeFilter(ctx.q, shopId).map(function (p) { return recipeRow(p, shopId); });
    return Api.listPage(ctx.q, rows, RECIPE_SORTS, function (all) {
      return { count: all.length, withRecipe: all.filter(function (r) { return r.hasRecipe; }).length, noRecipe: all.filter(function (r) { return !r.hasRecipe; }).length, negative: all.filter(function (r) { return r.negativeIngredients.length; }).length };
    });
  });
  var RECIPE_HEAD = ['Product code', 'Product name', 'Ingredient code', 'Ingredient name', 'Quantity', 'Unit', 'Active'];
  route('GET', '/api/bo/recipes/export', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), rows = [];
    Api.sortRows(recipeFilter(ctx.q, shopId).map(function (p) { return recipeRow(p, shopId); }), ctx.q.sort, RECIPE_SORTS).forEach(function (r) {
      recipeLines(Api.product(r.productId), shopId).forEach(function (l) { rows.push([r.code, r.name, l.code, l.name, l.quantity, l.unit, yn(l.active)]); });
    });
    return Api.csvResponse('recipes.csv', Api.csvText(RECIPE_HEAD, rows));
  });
  route('GET', '/api/bo/recipes/template', function () {
    return Api.csvResponse('recipes-template.csv', Api.csvText(RECIPE_HEAD.filter(function (h) { return ['Product name', 'Ingredient name', 'Unit'].indexOf(h) < 0; }), [['N01', 'M01', 0.25, 'Yes'], ['N01', 'M02', 0.12, 'Yes']]));
  });
  route('GET', '/api/bo/recipes/:id', function (ctx) {
    var shopId = Api.shopId(ctx.q.shopId), p = Api.product(ctx.params.id);
    need(p && !p.stockItem, 'Only non-stock products have a recipe.', 404);
    var row = recipeRow(p, shopId);
    row.lines = recipeLines(p, shopId);
    row.materials = Api.db.products.filter(function (m) { return m.stockItem && m.active !== false; }).sort(function (a, b) { return (a.categoryId === 8 ? 0 : 1) - (b.categoryId === 8 ? 0 : 1) || (a.name < b.name ? -1 : 1); }).map(function (m) {
      return { id: m.productId, code: m.code, name: m.name, unit: unitName(m), subUnit: Api.unitName(m.subMeasurementId), subRatio: m.subRatio || null, cost: m.cost, stock: Api.stockOf(shopId, m.productId), categoryName: (Api.category(m.categoryId) || {}).name || '' };
    });
    return row;
  });
  function saveRecipe(p, lines, updateCost) {
    var seen = {};
    var rows = (lines || []).map(function (l) {
      var m = Api.product(l.materialId);
      if (!m || !m.stockItem) bad('', 'Choose a stock product for every ingredient.');
      if (seen[m.productId]) bad('', m.name + ' is listed twice. Combine the quantities.');
      seen[m.productId] = true;
      if (!(Number(l.quantity) > 0)) bad('', 'Enter a quantity above zero for ' + m.name + '.');
      return { materialId: m.productId, quantity: round4(Number(l.quantity)), active: l.active !== false };
    });
    if (rows.length) Api.db.recipes[p.productId] = rows; else delete Api.db.recipes[p.productId];
    if (updateCost) { var c = recipeCost(p.productId); if (c !== null) p.cost = c; }
  }
  route('PUT', '/api/bo/recipes/:id', function (ctx) {
    var p = Api.product(ctx.params.id);
    need(p && !p.stockItem, 'Only non-stock products can have a recipe.', 404);
    saveRecipe(p, ctx.body.lines, !!ctx.body.updateCost);
    return { productId: p.productId, message: (ctx.body.lines || []).length ? 'Recipe saved.' : 'Recipe removed.', number: p.code };
  });
  function recipeTargets(b, shopId) {
    var ids = (b.ids || []).map(Number);
    return (ids.length ? ids.map(Api.product) : recipeFilter(b.query || {}, shopId)).filter(function (p) { return p && !p.stockItem; });
  }
  route('POST', '/api/bo/recipes/update-cost', function (ctx) {
    var shopId = Api.shopId(ctx.body.shopId), n = 0;
    recipeTargets(ctx.body, shopId).forEach(function (p) { var c = recipeCost(p.productId); if (c !== null && c !== p.cost) { p.cost = c; n++; } });
    return { message: n + ' product cost(s) updated from their recipes.', count: n };
  });
  route('POST', '/api/bo/recipes/change-ingredient', function (ctx) {
    var b = ctx.body, from = Api.product(b.fromId), to = Api.product(b.toId), factor = Number(b.factor) || 1, n = 0, db = Api.db;
    need(from && from.stockItem && to && to.stockItem, 'Choose two stock products.');
    need(from.productId !== to.productId, 'Choose a different ingredient to change to.');
    need(factor > 0, 'Enter a quantity factor above zero.');
    var scope = b.ids && b.ids.length ? b.ids.map(Number) : null;
    Object.keys(db.recipes).forEach(function (id) {
      if (scope && scope.indexOf(Number(id)) < 0) return;
      var rows = db.recipes[id], hit = rows.filter(function (c) { return c.materialId === from.productId; })[0];
      if (!hit) return;
      var other = rows.filter(function (c) { return c.materialId === to.productId; })[0], q = round4(hit.quantity * factor);
      if (other) { other.quantity = round4(other.quantity + q); db.recipes[id] = rows.filter(function (c) { return c !== hit; }); } else { hit.materialId = to.productId; hit.quantity = q; }
      n++;
    });
    return { message: n + ' recipe(s) now use ' + to.name + '.', count: n };
  });
  route('POST', '/api/bo/recipes/import', function (ctx) {
    var table = Api.parseCsv(ctx.body.csv), db = Api.db, groups = {}, order = [], errors = [], done = 0;
    need(table.length > 1, 'The file has no recipe lines.');
    var head = table[0].map(function (h) { return h.trim().toLowerCase(); }), col = function (n) { return head.indexOf(n.toLowerCase()); };
    need(col('Product code') >= 0 && col('Ingredient code') >= 0 && col('Quantity') >= 0, 'The first line must have the columns Product code, Ingredient code and Quantity.');
    table.slice(1).forEach(function (row, i) {
      var code = String(row[col('Product code')] || '').trim(), line = i + 2;
      var p = db.products.filter(function (x) { return x.code.toLowerCase() === code.toLowerCase(); })[0];
      var m = db.products.filter(function (x) { return x.code.toLowerCase() === String(row[col('Ingredient code')] || '').trim().toLowerCase(); })[0];
      if (!p || p.stockItem) { errors.push({ line: line, message: 'Product "' + code + '" is not a non-stock product.' }); return; }
      if (!m || !m.stockItem) { errors.push({ line: line, message: 'Ingredient "' + String(row[col('Ingredient code')] || '').trim() + '" is not a stock product.' }); return; }
      var q = Number(row[col('Quantity')]), a = col('Active') >= 0 ? String(row[col('Active')]).trim() : '';
      if (!(q > 0)) { errors.push({ line: line, message: 'Enter a quantity above zero.' }); return; }
      if (!groups[p.productId]) { groups[p.productId] = []; order.push(p.productId); }
      if (groups[p.productId].some(function (x) { return x.materialId === m.productId; })) { errors.push({ line: line, message: m.name + ' is listed twice. Combine the quantities.' }); return; }
      groups[p.productId].push({ materialId: m.productId, quantity: q, active: !/^(no|n|false|0)$/i.test(a) });
    });
    order.forEach(function (id) { saveRecipe(Api.product(id), groups[id], false); done++; });
    return { message: done + ' recipe(s) imported' + (errors.length ? ', ' + errors.length + ' line(s) skipped.' : '.'), done: done, errors: errors.slice(0, 30), errorCount: errors.length };
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
