const inventoryReportTitles={movement:'Stock Movement report',products:'Product Summary report',components:'Product Component report'};
let inventoryReportLookups=null,inventoryReportKey='',inventoryLookupSequence=0;
function isInventoryReport(mode){return Object.hasOwn(inventoryReportTitles,mode);}
function reportRequestParams(filters,page){
  const today=reportDate(new Date());const params=new URLSearchParams({from:filters.from||today,to:filters.to||today,mode:filters.mode,groupBy:filters.groupBy||'product',page:String(page)});
  for(const key of ['shopId','fromTime','toTime','locationId','cashier','productId','categoryId','stockType','active','componentId','movementType'])if(filters[key])params.set(key,filters[key]);return params;
}
function reportDataEndpoint(mode){return isInventoryReport(mode)?'/api/sales-reports/inventory':'/api/sales-reports';}
async function extendInventoryFilters(form){
  const mode=form.elements.mode;
  for(const [value,title] of Object.entries(inventoryReportTitles))mode.add(new Option(title,value));
  form.querySelector('.report-filter-actions').insertAdjacentHTML('beforebegin',`<label data-i18n data-inventory-filter="categoryId" hidden>Category<select name="categoryId"><option value="">All categories</option></select></label><label data-inventory-filter="stockType" hidden>Stock type<select name="stockType"><option value="">All types</option><option value="stock">Stock items</option><option value="nonstock">Non-stock items</option></select></label><label data-i18n data-inventory-filter="active" hidden>Status<select name="active"><option value="">All statuses</option><option data-i18n value="active">Active</option><option data-i18n value="inactive">Disabled</option></select></label><label data-inventory-filter="movementType" hidden>Movement type<select name="movementType"><option value="">All movements</option></select></label><label data-inventory-filter="componentSearch" hidden>Component Search<input name="componentSearch" type="hidden"><button type="button" class="secondary" data-report-component-picker>Search Components</button></label><label data-inventory-filter="componentId" hidden>Component<select name="componentId"><option value="">All components</option></select></label>`);
  mode.addEventListener('change',()=>syncInventoryFilters(form));
  form.querySelector('[data-report-component-picker]').addEventListener('click',()=>SoftPOSProductPicker.open({owner:form,includeInactive:true,title:'Search Components',onSelect:product=>{form.elements.componentId.replaceChildren(new Option('All components',''),new Option([product.code,product.name].filter(Boolean).join(' · '),String(product.id),true,true));form.elements.componentSearch.value=product.code;}}));
  syncInventoryFilters(form);
  const key=state.me.companyCode+':'+state.me.userId+':'+currentShop(),sequence=++inventoryLookupSequence;
  try{
    if(!inventoryReportLookups||inventoryReportKey!==key){const data=await api('/api/sales-reports/inventory-lookups?shopId='+currentShop());if(sequence!==inventoryLookupSequence)return;inventoryReportLookups=data;inventoryReportKey=key;}
    if(!form.elements.categoryId)return;
    form.elements.categoryId.innerHTML=reportOptions(inventoryReportLookups.categories||[],'All categories');
    form.elements.movementType.innerHTML=reportOptions(inventoryReportLookups.movements||[],'All movements');
    syncInventoryFilters(form);
  }catch(e){$('salesReportStatus').textContent=e.message;}
}
function syncInventoryFilters(form){
  const shopSelect=form.elements.shopId;
  if(form.elements.mode.value==='productshopsales'&&state.me.allShops){if(!shopSelect.querySelector('option[value="0"]'))shopSelect.prepend(new Option('All Shops','0'));}
  else{const all=shopSelect.querySelector('option[value="0"]');if(all){if(shopSelect.value==='0'){shopSelect.value=String(currentShop());shopSelect.dispatchEvent(new Event('change'));}all.remove();}}
  const mode=form.elements.mode.value,inventory=isInventoryReport(mode),dated=!inventory||mode==='movement';
  for(const key of ['from','to','cashier']){const control=form.elements[key];control.closest('label').hidden=!dated;control.disabled=!dated;}
  for(const key of ['fromTime','toTime']){const control=form.elements[key];if(control){control.closest('label').hidden=inventory;control.disabled=inventory;}}
  for(const key of ['productId','productSearch']){const control=form.elements[key];if(control){control.closest('label').hidden=mode==='closing';control.disabled=mode==='closing';}}
  form.querySelectorAll('[data-report-today],[data-report-month]').forEach(button=>button.hidden=!dated);
  form.querySelectorAll('[data-inventory-filter]').forEach(label=>{const key=label.dataset.inventoryFilter;const show=inventory&&(key==='categoryId'||(key==='stockType'&&mode==='products')||(key==='active'&&mode!=='movement')||(key==='movementType'&&mode==='movement')||(['componentSearch','componentId'].includes(key)&&mode==='components'));label.hidden=!show;label.querySelector('input,select').disabled=!show;});
  form.querySelector('.report-group').hidden=mode!=='summary';form.elements.groupBy.disabled=mode!=='summary';
  const prior=form.elements.cashier.value;form.elements.cashier.innerHTML=reportOptions(mode==='movement'?(inventoryReportLookups?.users||[]):reportLookups.users,'All users');form.elements.cashier.value=prior;
}
function inventoryReportTable(result){
  const q=value=>Number(value??0).toLocaleString('en-FJ',{maximumFractionDigits:7}),m=money,product=r=>[r.productCode,r.productName].filter(Boolean).join(' · ');
  if(result.mode==='movement')return{head:['Date / time','Product','Movement','Document','User','Shop','Location','UOM','Recorded qty','Qty in','Qty out','Unit cost','Recorded cost','Notes'],body:result.rows.map(r=>[String(r.date).replace('T',' ').slice(0,16),product(r),r.movementType,r.document,r.cashier,r.shopName,r.locationName,r.uom||'',q(r.recordedQuantity),r.delta===null?'—':q(Math.max(0,r.delta)),r.delta===null?'—':q(Math.max(0,-r.delta)),m(r.unitCost),m(r.totalCost),(r.delta===null?'Count / unclassified movement. ':'')+(r.comments||'')])};
  if(result.mode==='products')return{head:['Code','Product','Category','Shop','Location','Type','Status','UOM','Current qty','Retail price','Stock cost value','Stock retail value'],body:result.rows.map(r=>[r.productCode,r.productName,r.category,r.shopName,r.locationName,r.stockItem?'Stock':'Non-stock',r.active?'Active':'Disabled',r.uom||'',r.stockItem?q(r.quantity):'—',m(r.price),m(r.costValue),m(r.retailValue)])};
  return{head:['Product code','Parent product','Component code','Component','Type','Location','UOM','Qty per 1 sold','Status','Component cost','Extended cost'],body:result.rows.map(r=>[r.productCode,r.productName,r.componentCode,r.componentName,r.componentStockItem?'Stock':'Non-stock recipe',r.locationName,r.uom||'',q(r.quantity),r.active?'Active':'Disabled',m(r.unitCost),m(r.componentCost)])};
}
function inventoryReportKpis(result){
  const t=result.totals,q=value=>Number(value??0).toLocaleString('en-FJ',{maximumFractionDigits:7}),m=money;
  const items=result.mode==='movement'?[['Movements',q(t.lineCount)],['Qty in',q(t.quantityIn)],['Qty out',q(t.quantityOut)],['Net movement',q(t.netQuantity)],['Count / review records',q(t.countRecords)]]:result.mode==='products'?[['Product / shop rows',q(t.lineCount)],['Stock units',q(t.quantity)],['Stock cost value',m(t.costValue)],['Stock retail value',m(t.retailValue)],['Negative stock rows',q(t.negativeStockRows)]]:[['Assignments',q(t.lineCount)],['Parent products',q(t.parentProducts)],['Active',q(t.activeAssignments)],['Disabled',q(t.inactiveAssignments)]];
  return items;
}
function inventoryReportFootnote(mode){return mode==='movement'?'Stock audit records from desktop and web. Stock Take and unclassified records show recorded quantities and are excluded from Qty in / out totals.':mode==='products'?'Current stock snapshot, not a historical balance. Values use current costs and retail prices. Quantities across different units are not directly comparable.':'Current direct component assignments shared with desktop. Quantities are per 1 parent item sold; nested recipes are not expanded. Cost uses the component purchase cost; disabled assignments do not consume stock.';}
function renderInventoryReport(result){
  $('salesReportTotals').innerHTML=inventoryReportKpis(result).map(([label,value])=>`<div class="report-kpi"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('');
  const table=inventoryReportTable(result);$('salesReportTable').innerHTML=reportTable(table.head,table.body.map(row=>row.map(esc)));
  $('salesReportPager').hidden=result.rowCount<=result.pageSize;$('salesReportPage').textContent=`Page ${result.page} of ${Math.max(1,Math.ceil(result.rowCount/result.pageSize))} · ${result.rowCount} rows`;
  $('salesReportPrevious').disabled=result.page<=1;$('salesReportNext').disabled=result.page*result.pageSize>=result.rowCount;
}
