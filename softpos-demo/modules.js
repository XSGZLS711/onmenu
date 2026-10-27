const moduleLabels={Sales:'Sales',ServiceSales:'Service Sales',Products:'Products',PO:'Purchase Orders',Receive:'Receive against PO',ReceiveWithoutPO:'Receive without PO',Adjustment:'Stock Adjustment',Refund:'Refunds',Reports:'X / Z Reports'};
function applyModuleAccess(options){
  state.permissions=options.permissions||{};
  if(options.companyReceipt)state.branchCompanyReceipt=options.companyReceipt;
  $('serviceSalesTab').hidden=!state.permissions.ServiceSales;
  $('customerPaymentsTab').hidden=!options.operationsEnabled||!state.permissions.CustomerPayments;
  document.querySelector('[data-tab="quotesView"]').hidden=!(state.permissions.Quotation??state.permissions.Sales);
  $('quoteBtn').hidden=!(state.permissions.Quotation??state.permissions.Sales);
  applySalesFeatureOptions(options);
  document.querySelectorAll(".ops-sales-reports").forEach(button=>button.hidden=!state.permissions.Reports);
  document.querySelectorAll(".create-supplier").forEach(b=>b.hidden=!state.permissions.Suppliers||!state.permissions[b.closest("form").id==="poCreate"?"PO":"ReceiveWithoutPO"]);
  $('browsePoPrint').hidden=!options.operationsEnabled||!(state.permissions.PO||state.permissions.Receive);
  newSaleCustomer.hidden=!options.operationsEnabled||!state.permissions.Customers;
  document.querySelectorAll('.ops-product-manager').forEach(x=>x.hidden=!state.permissions.Products);
  const stockModules={poCreate:'PO',poReceive:'Receive',directReceive:'ReceiveWithoutPO',stockAdjust:'Adjustment'};
  document.querySelectorAll('[data-stock]').forEach(x=>x.hidden=!options.operationsEnabled||!state.permissions[stockModules[x.dataset.stock]]);
  document.querySelectorAll('.ops-manager').forEach(x=>x.hidden=!options.operationsEnabled||!['PO','Receive','ReceiveWithoutPO'].some(m=>state.permissions[m]));
  document.querySelectorAll('.ops-reports').forEach(x=>x.hidden=!options.operationsEnabled||!state.permissions.Reports);
  $('refundTab').hidden=!options.operationsEnabled||!state.permissions.Refund;
  $('productManagementBtn').hidden=![...document.querySelectorAll('#productManagementDialog [data-tab]')].some(button=>!button.hidden);
  $('laybyBtn').hidden=!options.operationsEnabled||!state.permissions.Layby;
  const first=[...document.querySelectorAll('[data-stock]')].find(x=>!x.hidden);
  document.querySelectorAll('.stock-section').forEach(x=>x.hidden=x.id!==first?.dataset.stock);
}
function setSalesMode(service){state.serviceMode=service;state.serviceOnly=false;$('serviceSalesTools').hidden=!service;$('serviceSalesItems').value='all';state.categoryId=null;activateTab('orderView');renderCategories();loadProducts().catch(e=>toast(e.message,true));}
$('retailSalesTab').addEventListener('click',()=>setSalesMode(false));
const directLines=[];
let refundSale=null,refundLines=[],refundReceiptSequence=0,refundLookupSequence=0;
function resetExtraModules(){refundReceiptSequence++;refundLookupSequence++;directLines.length=0;refundSale=null;refundLines=[];state.serviceOnly=false;$('directReceive').reset();$('directReceive').elements.invoiceDate.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);$('refundForm').reset();$('refundFind').reset();$('directLines').replaceChildren();$('refundLines').replaceChildren();$('refundForm').hidden=true;$('refundReceipt').replaceChildren();$('refundHistory').replaceChildren();}
function renderDirectLines(){
  $('directLines').innerHTML=directLines.map((p,i)=>`<div class="ops-line"><strong>${esc(p.productName)}</strong><label data-i18n>Qty<input data-direct="${i}" data-field="quantity" type="number" min="0.0001" step="0.0001" value="${p.quantity}" required></label><label>Unit Cost<input data-direct="${i}" data-field="cost" type="number" min="0" step="0.0001" value="${p.cost}" required></label><label class="check-label"><input data-direct="${i}" data-field="vat" type="checkbox" ${p.vat?'checked':''}> Add VAT</label><button data-i18n type="button" class="ghost" data-direct-remove="${i}">Remove</button></div>`).join('');
  $('directLines').querySelectorAll('[data-field]').forEach(x=>x.addEventListener('input',()=>directLines[Number(x.dataset.direct)][x.dataset.field]=x.type==='checkbox'?x.checked:Number(x.value)));
  $('directLines').querySelectorAll('[data-direct-remove]').forEach(x=>x.addEventListener('click',()=>{directLines.splice(Number(x.dataset.directRemove),1);renderDirectLines();}));
}
$('directReceive').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget;
  const result=await opsSubmit(f,'/api/inventory/receive-without-po',()=>({supplierId:Number(f.elements.supplierId.value),reference:f.elements.reference.value,invoiceDate:f.elements.invoiceDate.value,lines:directLines.map(x=>({productId:x.productId,quantity:x.quantity,cost:x.cost,vat:x.vat}))}));
  if(result){directLines.length=0;renderDirectLines();f.elements.reference.value='';await loadProducts();}
});
$('refundFind').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget,shop=currentShop(),sequence=++refundLookupSequence;
  if(sessionStorage.getItem(opsKey($('refundForm')))&&!sessionStorage.getItem(opsKey($('refundForm'))+'.editable')){opsMessage(f,'Finish the saved refund request before loading another invoice.',true);return;}
  try{
    const result=await api(`/api/operations/refund-invoice?shopId=${shop}&invoiceNo=${encodeURIComponent(f.elements.invoiceNo.value.trim())}`);
    if(shop!==currentShop()||sequence!==refundLookupSequence)return;
    refundSale=result.sale;refundLines=result.lines;$('refundForm').reset();$('refundForm').hidden=false;
    $('refundInvoiceLabel').textContent=`Invoice ${refundSale.InvoiceNo||refundSale.invoiceNo}`;
    $('refundLines').innerHTML=refundLines.map((line,i)=>`<div class="refund-item"><div><strong>${esc(line.name)}</strong><small>${money(line.price)} each · ${line.remaining} available to return${Number(line.returned)>0?` · ${line.returned} already returned`:''}</small></div><label>Return quantity<input aria-label="Return quantity for ${esc(line.name)}" data-refund="${i}" type="number" min="0" max="${line.remaining}" step="0.0001" value="${line.remaining}" ${refundSale.FiscalStatus==='SANDBOX_SIGNED'?'readonly':''}></label></div>`).join('');
    $('refundLines').querySelectorAll('[data-refund]').forEach(x=>x.addEventListener('input',updateRefundTotal));updateRefundTotal();
    const fiscal=refundSale.FiscalStatus==='SANDBOX_SIGNED';
    const remaining=refundLines.some(x=>Number(x.remaining)>0);
    const allowed=refundSale.refundAllowed&&remaining;
    $('refundForm').querySelectorAll('input,select,button').forEach(x=>x.disabled=!allowed);
    $('refundForm').elements.method.value=refundSale.paymentMethod;
    $('refundItemTools').hidden=fiscal||!allowed;
    $('refundItemHint').textContent=fiscal?'VMS refund: all items are returned using the original payment method.':'Enter the quantity to return. Stock is updated automatically.';
    $('refundForm').elements.method.querySelector('[value="SPLIT"]').hidden=!fiscal;
    $('refundForm').elements.method.disabled=fiscal||!allowed;
    updateRefundMethod();
    opsMessage(f,!remaining?'This invoice has already been fully refunded.':allowed?(fiscal?'Full VMS refund: original payment method and all quantities are preserved.':''):'Original VMS signing must be confirmed before refunding.');
  }catch(error){opsMessage(f,error.message,true);}
});
function updateRefundTotal(){let total=0;refundLines.forEach((r,i)=>{const qty=Number($('refundForm').querySelector(`[data-refund="${i}"]`).value)||0;total+=r.quantity>0?(Math.round(Number(r.total)*(Number(r.returned)+qty)/Number(r.quantity)*100)-Math.round(Number(r.total)*Number(r.returned)/Number(r.quantity)*100))/100:0;});const rounding=refundSale?.FiscalStatus==='SANDBOX_SIGNED'?Number(refundSale.rounding||0):cashRounding(total,[{method:$('refundForm').elements.method.value}]);$('refundTotal').textContent=money(Math.round((total+rounding)*100)/100)+(rounding?' (cash round-off '+(rounding>0?'+':'')+money(rounding)+')':'');}
function updateRefundMethod(){
  const form=$('refundForm'),provider=form.elements.method.value!=='CASH';
  $('refundReferenceLabel').hidden=!provider;$('refundProviderHint').hidden=!provider;
  form.elements.reference.required=provider;
  if(!provider)form.elements.reference.value='';updateRefundTotal();
}
$('refundForm').elements.method.addEventListener('change',updateRefundMethod);
for(const [id,all] of [['refundAllItems',true],['refundClearItems',false]])$(id).addEventListener('click',()=>{
  if(refundSale?.FiscalStatus==='SANDBOX_SIGNED')return;
  refundLines.forEach((line,i)=>{$('refundForm').querySelector(`[data-refund="${i}"]`).value=all?line.remaining:0;});updateRefundTotal();
});
$('refundForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget;
  const result=await opsSubmit(f,'/api/operations/refund',()=>({saleRequestId:refundSale?.RequestId||refundSale?.requestId,reason:f.elements.reason.value,method:f.elements.method.value,reference:f.elements.reference.value,paymentConfirmed:true,lines:refundLines.map((r,i)=>({detailId:r.id,quantity:Number(f.querySelector(`[data-refund="${i}"]`).value),restock:r.stockItem})).filter(x=>x.quantity>0)}));
  if(result){await showRefundReceipt(result);f.hidden=true;refundSale=null;refundLines=[];await loadProducts();}
});
async function showRefundReceipt(r){
  const sequence=++refundReceiptSequence;
  if(r.FiscalRequired??r.fiscalRequired){await showFiscalRefundReceipt(r,sequence);return;}const number=r.Number||r.number,total=r.Total??r.total,vat=r.VatAmount??r.vatAmount;
  $('refundReceipt').innerHTML=`<article class="report-paper"><h2>${esc(state.bootstrap?.companyName||'SoftPOS')}</h2><h3>Refund receipt</h3><p>${esc(number)}</p><p>Original invoice: ${esc(r.OriginalInvoice||r.originalInvoice)}</p><p>${esc(new Date(r.CreatedUtc||r.createdUtc).toLocaleString())}</p><div>${(r.Items||r.items||[]).map(x=>`<p>${esc(x.Name||x.name)} · ${x.Quantity??x.quantity} · ${money(x.Amount??x.amount)}</p>`).join('')}</div><dl><div><dt data-i18n>VAT included</dt><dd>${money(vat)}</dd></div>${(r.Rounding??r.rounding)?`<div><dt>Cash round-off</dt><dd>${money(r.Rounding??r.rounding)}</dd></div>`:''}<div><dt>Refund total</dt><dd>${money(total+Number(r.Rounding??r.rounding??0))}</dd></div><div><dt>Refund method</dt><dd>${esc(r.Method||r.method)}</dd></div></dl><p>${esc(r.Reason||r.reason)}</p><p>THIS IS NOT A FISCAL INVOICE</p></article><button type="button" class="primary" id="printRefund">Print refund receipt</button>`;
  $('printRefund').addEventListener('click',()=>printThermalReceipt($('refundReceipt').querySelector('.report-paper')).catch(e=>toast(e.message,true)));
}
$('shopSelect').addEventListener('change',resetExtraModules);
$('directReceive').elements.invoiceDate.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
$('refundTab').addEventListener('click',showPendingOperations);
document.querySelector('.ops-manager').addEventListener('click',()=>document.querySelector('[data-stock]:not([hidden])')?.click());
window.addEventListener('afterprint',()=>document.body.classList.remove('printing-refund'));

async function showFiscalRefundReceipt(r,sequence){
  const id=r.RequestId||r.requestId,container=$('refundReceipt');
  container.innerHTML='<p id="refundFiscalStatus" role="status">Preparing VMS refund receipt…</p><div id="refundFiscalPaper"></div><button id="recoverRefundVms" class="secondary" type="button">Sign / recover VMS refund</button>';
  const recover=$('recoverRefundVms');
  async function sign(){
    recover.disabled=true;$('refundFiscalStatus').textContent='Checking VMS refund…';
    try{
      let receipt=await api(`/api/operations/refund/${id}/signed-receipt`);
      if(sequence!==refundReceiptSequence)return;
      if(!receipt){await refreshCsrf();receipt=await api(`/api/operations/refund/${id}/sandbox-receipt`,{method:'POST'});}
      if(sequence!==refundReceiptSequence)return;
      const lines=String(receipt.journal||'').replace(/\r\n/g,'\n').trimEnd().split('\n');
      const footer=lines.findIndex(x=>/END OF FISCAL INVOICE/i.test(x));
      const qr=/^data:image\/(gif|png|jpeg);base64,/.test(receipt.verificationQrCode||'')?receipt.verificationQrCode:'';
      $('refundFiscalPaper').innerHTML=`<article class="refund-fiscal-paper"><pre>${esc((footer<0?lines:lines.slice(0,footer)).join('\n'))}</pre>${qr?`<img id="refundFiscalQr" alt="Refund verification QR code" src="${qr}">`:''}${footer>=0?`<pre>${esc(lines.slice(footer).join('\n'))}</pre>`:''}<p class="muted">TRAINING RECEIPT — NOT VALID FOR TAX</p></article><div class="ops-subtabs"><button id="printFiscalRefund" class="primary" type="button">Print refund receipt</button><button id="saveFiscalRefund" class="secondary" type="button" disabled>Save Image</button><button id="shareFiscalRefund" class="secondary" type="button" disabled>Share Image</button></div>`;
      $('refundFiscalStatus').textContent='VMS refund signed.';recover.hidden=true;
      $('printFiscalRefund').addEventListener('click',async()=>{try{await printThermalReceipt($('refundFiscalPaper').querySelector('.refund-fiscal-paper'));}catch(e){toast(e.message,true);}});
      try{
        const file=await createReceiptImage(receipt,{invoiceNo:r.Number||r.number});
        if(sequence!==refundReceiptSequence)return;
        $('saveFiscalRefund').disabled=false;$('shareFiscalRefund').disabled=false;
        $('saveFiscalRefund').addEventListener('click',()=>downloadReceiptImage(file));
        $('shareFiscalRefund').addEventListener('click',async()=>{if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'SoftPOS refund receipt'});return;}catch(error){if(error.name==='AbortError')return;}}downloadReceiptImage(file);toast('Receipt image saved. Attach it in WhatsApp or Viber.');});
      }catch(error){toast('Refund signed. Receipt image could not be prepared; printing is available.',true);}
    }catch(error){if(sequence===refundReceiptSequence)$('refundFiscalStatus').textContent=error.message+' This refund and stock return are already saved. Use this recovery button or Recent refunds; do not create a replacement refund.';}
    finally{recover.disabled=false;}
  }
  recover.addEventListener('click',sign);await sign();
}
$('refundHistoryBtn').addEventListener('click',async()=>{
  try{
    const shop=currentShop(),rows=await api(`/api/operations/refund-history?shopId=${shop}`);if(shop!==currentShop())return;
    $('refundHistory').innerHTML=rows.map((row,i)=>`<button type="button" class="ghost" data-refund-history="${i}">${esc(row.refund.originalInvoice)} · ${money(row.refund.total)} · ${row.refund.fiscalRequired?(row.fiscalStatus==='SIGNED'?'Receipt ready':'Receipt awaiting confirmation'):'Refund receipt'}</button>`).join('')||'<p>No recent refunds.</p>';
    $('refundHistory').querySelectorAll('[data-refund-history]').forEach(button=>button.addEventListener('click',()=>showRefundReceipt(rows[Number(button.dataset.refundHistory)].refund)));
  }catch(error){toast(error.message,true);}
});

$('closeRefund').addEventListener('click',()=>{state.serviceOnly=false;activateTab('orderView');});
