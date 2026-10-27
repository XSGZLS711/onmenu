let reportLookups=null,reportLookupsKey='',reportLoadSequence=0,reportPage=1,reportApplied=null,reportProductSequence=0;
let reportAppliedLabels=null;
const reportDate=date=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);
const reportQuantity=value=>new Intl.NumberFormat(undefined,{maximumFractionDigits:4}).format(Number(value||0));
const reportNumber=value=>Number(value||0);
function resetSalesReporting(){
  if(typeof inventoryLookupSequence!=='undefined'){inventoryLookupSequence++;inventoryReportLookups=null;inventoryReportKey='';}
  reportLoadSequence++;reportProductSequence++;reportLookups=null;reportLookupsKey='';reportApplied=null;reportPage=1;
  reportAppliedLabels=null;$('salesReportActions').hidden=true;if(typeof resetReportExport==='function')resetReportExport();
  for(const id of ['dashboardFilters','salesReportFilters','dashboardTotals','dashboardDaily','dashboardProducts','salesReportTotals','salesReportTable','dashboardStatus','salesReportStatus'])$(id).replaceChildren();
  $('salesReportPager').hidden=true;
}
function reportOptions(rows,label){return `<option value="">${label}</option>`+rows.map(row=>`<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('');}
function buildReportFilters(id,dashboard){
  const today=reportDate(new Date());const month=today.slice(0,8)+'01';
  $(id).innerHTML=`<label>From date<input name="from" type="date" value="${dashboard?today:month}" required></label><label>To date<input name="to" type="date" value="${today}" required></label>${dashboard?'':`<label>Shop<select name="shopId">${Array.from($('shopSelect').options).map(o=>`<option value="${esc(o.value)}" ${o.value===String(currentShop())?'selected':''}>${esc(o.textContent)}</option>`).join('')}</select></label><label>From Time<input name="fromTime" type="time" step="60" value="00:00" required></label><label>To Time<input name="toTime" type="time" step="60" value="23:59" required></label>`}<label>Location<select name="locationId">${reportOptions(reportLookups.locations,'All locations')}</select></label>${dashboard?'':`<label data-i18n>User<select name="cashier">${reportOptions(reportLookups.users,'All users')}</select></label><label class="report-product-search">Product Search<input name="productSearch" type="hidden"><button type="button" class="secondary" data-report-product-picker>Search Products</button></label><label>Product<select name="productId"><option value="">All products</option></select></label><label>Report type<select name="mode"><option value="detail">Sales detail</option><option value="summary">Sales summary</option><option value="productsales">Product Sales Summary</option><option value="productshopsales">Product Sales Summary Per Shop</option><option value="closing">POS Closing Report</option></select></label><label class="report-group" hidden>Summarise by<select name="groupBy"><option value="product">Product</option><option data-i18n value="user">User</option><option value="location">Location</option><option data-i18n value="date">Date</option></select></label>`}<div class="report-filter-actions"><button class="primary" type="submit">${dashboard?'Update dashboard':'Run report'}</button><button class="ghost" type="button" data-report-today>Today</button><button class="ghost" type="button" data-report-month>This month</button></div>`;
  const form=$(id);
  if(!dashboard&&typeof extendInventoryFilters==='function')extendInventoryFilters(form);
  form.onsubmit=event=>{event.preventDefault();runSalesReport(dashboard);};
  form.querySelector('[data-report-today]').addEventListener('click',()=>{form.elements.from.value=today;form.elements.to.value=today;runSalesReport(dashboard);});
  form.querySelector('[data-report-month]').addEventListener('click',()=>{form.elements.from.value=month;form.elements.to.value=today;runSalesReport(dashboard);});
  if(!dashboard){
    form.elements.mode.addEventListener('change',()=>form.querySelector('.report-group').hidden=form.elements.mode.value!=='summary');
    form.querySelector('[data-report-product-picker]').addEventListener('click',loadReportProducts);
    form.elements.shopId.addEventListener('change',async()=>{
      const sequence=++reportLoadSequence,shop=form.elements.shopId.value;
      form.elements.locationId.value='';form.elements.cashier.value='';form.elements.productId.replaceChildren(new Option('All products',''));form.elements.productSearch.value='';
      try{const lookups=await api('/api/sales-reports/lookups?shopId='+shop);if(sequence!==reportLoadSequence||shop!==form.elements.shopId.value)return;reportLookups=lookups;reportLookupsKey=state.me.companyCode+':'+state.me.userId+':'+shop;form.elements.locationId.innerHTML=reportOptions(lookups.locations,'All locations');form.elements.cashier.innerHTML=reportOptions(lookups.users,'All users');}
      catch(error){if(sequence===reportLoadSequence){$('salesReportStatus').textContent=error.message;$('salesReportStatus').classList.add('error');}}
    });
  }
}
async function loadReportProducts(){
 const form=$('salesReportFilters');if(!form.elements.productId)return;
 const shop=Number(form.elements.shopId.value)||currentShop(),globalShop=currentShop();
 SoftPOSProductPicker.open({owner:form,shop,allowDifferentShop:true,isValid:()=>(Number(form.elements.shopId.value)||currentShop())===shop&&currentShop()===globalShop,includeInactive:true,onSelect:product=>{form.elements.productId.replaceChildren(new Option('All products',''),new Option([product.code,product.name].filter(Boolean).join(' · '),String(product.id),true,true));form.elements.productSearch.value=product.code;}});
}
async function loadSalesReporting(id){
  const dashboard=id==='dashboardView';
  const status=$(dashboard?'dashboardStatus':'salesReportStatus');
  const selectedReportShop=dashboard?currentShop():Number($('salesReportFilters').elements.shopId?.value||currentShop());
  const key=state.me.companyCode+':'+state.me.userId+':'+selectedReportShop;
  const sequence=++reportLoadSequence;status.textContent='Loading filters…';status.classList.remove('error');
  try{
    if(!reportLookups||reportLookupsKey!==key){
      const lookups=await api('/api/sales-reports/lookups?shopId='+selectedReportShop);
      if(sequence!==reportLoadSequence)return;
      reportLookups=lookups;reportLookupsKey=key;
    }
    const form=$(dashboard?'dashboardFilters':'salesReportFilters');
    if(!form.children.length)buildReportFilters(form.id,dashboard);
    await runSalesReport(dashboard);
  }catch(error){if(sequence===reportLoadSequence){status.textContent=error.message;status.classList.add('error');}}
}
function salesReportPeriod(filters){const date=value=>new Date(value+'T12:00:00').toLocaleDateString('en-FJ',{day:'numeric',month:'long',year:'numeric'}),start=filters.fromTime||'00:00',end=filters.toTime||'23:59';return filters.from===filters.to?date(filters.from)+' · '+start+' – '+end:date(filters.from)+' '+start+' – '+date(filters.to)+' '+end;}
const salesReportTitles={detail:'Sales Detail Report',summary:'Sales Summary Report',productsales:'Product Sales Summary',productshopsales:'Product Sales Summary Per Shop',closing:'POS Closing Report'};
function salesReportFootnote(mode){return mode==='closing'?'Read-only report; no till is closed. Desktop and web sales use invoice date/time. Receipts use payment date/time and recorded tender amounts, including refunds and rounding, with cash change already excluded. Product Sales Received is the allocated receipt amount for non-layby invoices dated within this period; prior-period collections and layby deposits can make Total Received different. Reversed, cancelled and voided receipts are excluded.': 'Amounts include VAT. Refunds reduce net sales. Totals use invoice line values before invoice rounding. Times use the recorded transaction date/time.';}
function reportKpis(totals){
  return [['Sales',money(totals.sales)],['Refunds',money(totals.refunds)],['Net sales',money(totals.netSales)],['VAT',money(totals.vat)],['Invoices',reportQuantity(totals.invoiceCount)],['Refund documents',reportQuantity(totals.refundCount)]].map(([label,value])=>`<div class="report-kpi"><small>${label}</small><strong>${esc(value)}</strong></div>`).join('');
}
function reportTable(headers,rows){return `<table><thead><tr>${headers.map(label=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>'<tr>'+row.map(value=>`<td>${value}</td>`).join('')+'</tr>').join(''):`<tr><td colspan="${headers.length}" class="report-empty">No records match these filters.</td></tr>`}</tbody></table>`;}
function productShopReportGroups(result){const groups=new Map();for(const row of result.rows){const key=String(row.shopId??row.shopName);if(!groups.has(key))groups.set(key,{name:row.shopName,rows:[]});groups.get(key).rows.push(row);}return [...groups.values()];}
function renderSalesReport(result,dashboard){
  if(!dashboard&&isInventoryReport(result.mode)){renderInventoryReport(result);return;}
  $(dashboard?'dashboardTotals':'salesReportTotals').innerHTML=reportKpis(result.totals);
  if(dashboard){
    const max=Math.max(...result.daily.map(row=>Math.abs(reportNumber(row.netSales))),1);
    $('dashboardDaily').innerHTML=result.daily.length?result.daily.map(row=>`<div class="sales-day"><span>${esc(String(row.date).slice(0,10))}</span><div class="sales-day-track"><i class="${reportNumber(row.netSales)<0?'negative':''}" style="width:${Math.abs(reportNumber(row.netSales))/max*100}%"></i></div><strong>${esc(money(row.netSales))}</strong></div>`).join(''):'<p class="muted">No sales in this period.</p>';
    $('dashboardProducts').innerHTML=reportTable(['Product','Net qty','Net sales'],result.products.map(row=>[esc(row.productName),esc(reportQuantity(row.quantity)),esc(money(row.netSales))]));
    return;
  }
  if(result.mode==='closing'){
    $('salesReportTotals').replaceChildren();
    const labels=reportAppliedLabels||{};
    $('salesReportTable').innerHTML=`<section class="closing-report"><header><h3>${esc(state.bootstrap.companyName)}</h3><h4>POS Closing Report</h4><p>${esc(labels.shopId||$('shopSelect').selectedOptions[0]?.textContent||'')} · ${esc(salesReportPeriod(reportApplied))}</p></header>${reportTable(['Description','Amount (FJD)'],result.rows.map(row=>[esc(row.label),esc(money(row.amount))]))}</section>`;
    $('salesReportPager').hidden=true;return;
  }
  if(result.mode==='productshopsales'){
    $('salesReportTotals').innerHTML='<div class="report-kpi"><small>Total</small><strong>'+esc(money(result.totals.netSales))+'</strong></div>';
    $('salesReportTable').innerHTML=productShopReportGroups(result).map(group=>'<section><h3>'+esc(group.name)+'</h3>'+reportTable(['Product Code','Product Name','Qty Sold','Total'],group.rows.map(row=>[esc(row.code),esc(row.name),esc(reportQuantity(row.quantity)),esc(money(row.netSales))]))+'</section>').join('')||reportTable(['Product Code','Product Name','Qty Sold','Total'],[]);
  }else if(result.mode==='summary'||result.mode==='productsales'){
    const label={product:'Product',user:'User',location:'Location',date:'Date'}[result.groupBy];
    $('salesReportTable').innerHTML=reportTable([...(result.mode==='productshopsales'?['Shop']:[]),...(['productsales','productshopsales'].includes(result.mode)?['Code']:[]),label,'Invoices','Refunds','Net qty','Sales','Refund value','VAT','Discount','Net sales'],result.rows.map(row=>[...(result.mode==='productshopsales'?[esc(row.shopName)]:[]),...(['productsales','productshopsales'].includes(result.mode)?[esc(row.code)]:[]),esc(row.name),esc(reportQuantity(row.invoiceCount)),esc(reportQuantity(row.refundCount)),esc(reportQuantity(row.quantity)),esc(money(row.sales)),esc(money(row.refunds)),esc(money(row.vat)),esc(money(row.discounts)),esc(money(row.netSales))]));
  }else{
    $('salesReportTable').innerHTML=reportTable(['Date / time','Invoice','Type','Product','Description','User','Shop','Location','Qty','Unit price','Discount','VAT','Line total'],result.rows.map(row=>[esc(String(row.invoiceDate).replace('T',' ').slice(0,16)),esc(row.invoiceNo),row.isRefund?'<span class="report-refund">Refund</span>':'Sale',esc([row.productCode,row.productName].filter(Boolean).join(' · ')),`<span class="report-description">${esc(row.description)}</span>`,esc(row.cashier),esc(row.shopName),esc(row.locationName),esc(reportQuantity(row.quantity)),esc(money(row.unitPrice)),esc(money(row.discount)),esc(money(row.vat)),esc(money(row.total))]));
  }
  $('salesReportPager').hidden=result.rowCount<=result.pageSize;
  $('salesReportPage').textContent=`Page ${result.page} of ${Math.max(1,Math.ceil(result.rowCount/result.pageSize))} · ${result.rowCount} rows`;
  $('salesReportPrevious').disabled=result.page<=1;
  $('salesReportNext').disabled=result.page*result.pageSize>=result.rowCount;
}
async function runSalesReport(dashboard,nextPage=1,reuseApplied=false){
  const form=$(dashboard?'dashboardFilters':'salesReportFilters');
  if(!form.reportValidity())return;
  const status=$(dashboard?'dashboardStatus':'salesReportStatus');
  const sequence=++reportLoadSequence;
  const filters=reuseApplied?reportApplied:Object.fromEntries(new FormData(form));
  const labels=reuseApplied?reportAppliedLabels:(!dashboard?Object.fromEntries(['shopId','locationId','cashier','productId','groupBy','categoryId','stockType','active','componentId','movementType'].map(key=>[key,form.elements[key]?.selectedOptions[0]?.textContent||''])):null);
  if(!filters)return;
  if(filters.to<filters.from||(filters.to===filters.from&&(filters.toTime||'23:59')<(filters.fromTime||'00:00'))){status.textContent='End date/time must be on or after start date/time.';status.classList.add('error');return;}
  const params=reportRequestParams({...filters,mode:dashboard?'dashboard':filters.mode},nextPage);
  status.textContent='Loading report…';status.classList.remove('error');
  const totals=$(dashboard?'dashboardTotals':'salesReportTotals');totals.replaceChildren();
  if(dashboard){$('dashboardDaily').replaceChildren();$('dashboardProducts').replaceChildren();}else{$('salesReportTable').replaceChildren();$('salesReportPager').hidden=true;$('salesReportActions').hidden=true;if(typeof resetReportExport==='function')resetReportExport();}
  try{
    const result=await api(reportDataEndpoint(dashboard?'dashboard':filters.mode)+'?'+params);
    if(sequence!==reportLoadSequence)return;
    if(!dashboard){reportPage=result.page;reportApplied=filters;reportAppliedLabels=labels;$('salesReportActions').hidden=false;}
    renderSalesReport(result,dashboard);
    if(!dashboard){$('salesReportsHeading').textContent=isInventoryReport(result.mode)?inventoryReportTitles[result.mode]:(salesReportTitles[result.mode]||'Sales reports');$('salesReportsView').querySelector('.report-footnote').textContent=isInventoryReport(result.mode)?inventoryReportFootnote(result.mode):salesReportFootnote(result.mode);}
    status.textContent=isInventoryReport(result.mode)?`${result.mode==='movement'?filters.from+' to '+filters.to:'Current snapshot'} · ${reportQuantity(result.rowCount)} rows`:`${filters.from} ${filters.fromTime||'00:00'} to ${filters.to} ${filters.toTime||'23:59'} · ${reportQuantity(result.totals.lineCount)} invoice lines`;
  }catch(error){if(sequence===reportLoadSequence){status.textContent=error.message;status.classList.add('error');}}
}
$('salesReportPrevious').addEventListener('click',()=>runSalesReport(false,reportPage-1,true));
$('salesReportNext').addEventListener('click',()=>runSalesReport(false,reportPage+1,true));
