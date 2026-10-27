// Desktop-style recurring transaction: reuse a previous invoice as a new draft.
let recurringVersion=0,recurringSelection=null,recurringLoading=false;
const recurringDialog=document.createElement('dialog');recurringDialog.id='serviceRecurringDialog';recurringDialog.setAttribute('aria-labelledby','serviceRecurringHeading');
recurringDialog.innerHTML=`<div class="dialog-card"><div class="dialog-head"><div><h2 id="serviceRecurringHeading">Recurring Transaction</h2><p class="muted">Find a previous invoice and load its items into a new invoice for review.</p></div><button id="closeServiceRecurring" type="button" class="icon-btn" aria-label="Close recurring transactions">×</button></div><form id="recurringInvoiceSearch"><div class="recurring-filters"><label>Invoice No<input name="invoiceNo" maxlength="50"></label><label>Customer<input name="customer" maxlength="250"></label><label>Note<input name="note" maxlength="1000"></label><label>From<input name="from" type="date"></label><label>To<input name="to" type="date"></label><label class="check-label"><input name="openOnly" type="checkbox"> Open invoices only</label></div><button type="submit" class="secondary">Search invoices</button></form><p id="recurringStatus" role="status"></p><div id="recurringInvoiceResults" class="recurring-results"></div><section id="recurringInvoicePreview" hidden></section><p class="muted recurring-help">Loading does not post a sale. Quantities and invoiced prices are copied; current VAT and pricing rules are checked before loading. New PO, reference and optional note fields are kept. Payment surcharges are recalculated at checkout.</p><div class="dialog-actions"><button id="cancelServiceRecurring" type="button" class="ghost">Cancel</button><button id="loadRecurringInvoice" type="button" class="primary" disabled>Load into new invoice</button></div></div>`;
document.body.append(recurringDialog);
function recurringCurrent(version,shop,user){return version===recurringVersion&&shop===currentShop()&&user===state.me&&recurringDialog.open&&serviceActive();}
function recurringCanLoad(){return !state.cart.length&&!state.heldSaleId&&!state.quotationId&&!checkoutSending&&!sessionStorage.getItem(pendingCheckoutKey());}
function recurringMessage(message,error=false){$('recurringStatus').textContent=message;$('recurringStatus').classList.toggle('error',error);}
async function searchRecurringInvoices(){
 if(recurringLoading)return;
 const version=++recurringVersion,shop=currentShop(),user=state.me,form=$('recurringInvoiceSearch');recurringSelection=null;$('loadRecurringInvoice').disabled=true;$('recurringInvoicePreview').hidden=true;recurringMessage('Searching…');
 const params=new URLSearchParams({shopId:shop});for(const[key,value]of new FormData(form))if(value)params.set(key,key==='openOnly'?'true':value);
 try{const rows=await api('/api/service-sales/recurring?'+params);if(!recurringCurrent(version,shop,user))return;
  $('recurringInvoiceResults').innerHTML=rows.length?`<table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(row=>`<tr><td data-label="Invoice">${esc(row.invoiceNo)}</td><td data-label="Date">${esc(new Date(row.date).toLocaleDateString('en-FJ'))}</td><td data-label="Customer">${esc(row.customerName||'Cash customer')}</td><td data-label="Total">${money(row.total)}</td><td data-label="Status">${esc(row.status)}</td><td class="recurring-select-cell"><button class="ghost" type="button" data-recurring-invoice="${Number(row.id)}">Select</button></td></tr>`).join('')}</tbody></table>`:'<p class="muted">No matching invoices at this shop.</p>';
  $('recurringInvoiceResults').querySelectorAll('[data-recurring-invoice]').forEach(button=>button.onclick=()=>previewRecurringInvoice(Number(button.dataset.recurringInvoice)));
  recurringMessage(rows.length?'Showing up to 60 matching invoices.':'');
 }catch(error){if(recurringCurrent(version,shop,user)){recurringMessage(error.message,true);$('recurringInvoiceResults').replaceChildren();}}
}
async function previewRecurringInvoice(id){
 if(recurringLoading)return;
 const version=++recurringVersion,shop=currentShop(),user=state.me;recurringSelection=null;$('loadRecurringInvoice').disabled=true;$('recurringInvoicePreview').hidden=true;recurringMessage('Loading invoice…');
 try{const source=await api(`/api/service-sales/recurring/${id}?shopId=${shop}`);if(!recurringCurrent(version,shop,user))return;recurringSelection=source;
  $('recurringInvoicePreview').innerHTML=`<h3>${esc(source.invoiceNo)} · ${esc(source.customer?.name||source.customerName||'Cash customer')}</h3><p class="muted">${source.serviceTerms==='ACCOUNT'?'Account invoice':'COD / Cash Sales'} · ${source.items.length} item lines</p><div class="recurring-preview-lines">${source.items.map(line=>`<div><span>${esc(line.serviceDescription||line.productName)}</span><strong>${Number(line.quantity)} × ${money(line.unitPrice)}</strong></div>`).join('')}</div>`;$('recurringInvoicePreview').hidden=false;
  $('loadRecurringInvoice').disabled=!recurringCanLoad();recurringMessage(recurringCanLoad()?'Review the items, then load them into a new invoice.':'Hold or clear the current invoice before loading another transaction.');
 }catch(error){if(recurringCurrent(version,shop,user))recurringMessage(error.message,true);}
}
$('serviceRecurring').onclick=()=>{
 if(!state.permissions?.Sales||!state.permissions?.ServiceSales||typeof offlineMode!=='undefined'&&offlineMode){toast('Recurring transactions require service sales access and an online connection.',true);return;}
 const form=$('recurringInvoiceSearch');form.reset();form.elements.customer.value=state.saleCustomer?.name||state.serviceCustomerDetail||'';recurringSelection=null;$('recurringInvoiceResults').replaceChildren();$('recurringInvoicePreview').hidden=true;$('loadRecurringInvoice').disabled=true;recurringDialog.showModal();searchRecurringInvoices();form.elements.invoiceNo.focus();
};
$('recurringInvoiceSearch').onsubmit=event=>{event.preventDefault();searchRecurringInvoices();};
$('loadRecurringInvoice').onclick=async()=>{
 if(recurringLoading||!recurringSelection)return;
 if(!recurringCanLoad()){recurringMessage('Hold or clear the current invoice and recover any pending payment first.',true);return;}
 const source=recurringSelection,version=recurringVersion,shop=currentShop(),user=state.me;recurringLoading=true;$('loadRecurringInvoice').disabled=true;recurringMessage('Checking original prices and current VAT…');
 try{
  const lines=[];
  for(const original of source.items){
   const price=Number(original.unitPrice),changed=price!==Number(original.currentUnitPrice),line={...original,quantity:Number(original.quantity),unitPrice:price,unitPriceOverride:changed?price:null,serviceDescription:original.stockItem===false?original.serviceDescription||'':'',note:''};
   if(line.serviceDescription&&!state.serviceDescriptionsEnabled)throw Error('Enable service descriptions in sales options before copying this invoice.');
   if(changed){if(!canEditCartPrice(line))throw Error('The original price differs from the current price. Price entry and Change Price access or approval are required for this item.');if(price<=0||Math.abs(price*100-Math.round(price*100))>0.00001)throw Error('The original price cannot be entered as a web price override. Review this invoice in desktop SoftPOS.');line.priceApprovalId=await authorizeSalesAction('ChangePrice',{productId:line.productId,unitPrice:price});}
   if(!recurringCurrent(version,shop,user)||!recurringCanLoad())return;lines.push(line);
  }
  const items=lines.map(line=>({productId:line.productId,quantity:line.quantity,note:'',unitPrice:line.unitPriceOverride,serviceDescription:line.serviceDescription||null,...(line.priceApprovalId?{priceApprovalId:line.priceApprovalId}:{}),...(typeof line.applyVat==='boolean'?{applyVat:line.applyVat}:{})}));
  await api('/api/checkout/preview',{method:'POST',body:JSON.stringify({shopId:shop,customerId:source.customer?.customerId??null,items})});
  if(!recurringCurrent(version,shop,user)||!recurringCanLoad())return;
  state.cart=lines;state.saleCustomer=source.customer||null;state.serviceTerms=source.serviceTerms;state.serviceCustomerDetail=source.serviceTerms==='COD'?source.customerName||null:null;state.quotationId=null;state.heldSaleId=null;renderCart();if(typeof offlineSaveDraft==='function')offlineSaveDraft();recurringDialog.close();toast('Loaded '+source.invoiceNo+' into a new invoice. Review quantities, prices and VAT before saving.');
 }catch(error){if(recurringCurrent(version,shop,user))recurringMessage(error.message,true);}
 finally{recurringLoading=false;$('loadRecurringInvoice').disabled=!recurringSelection||!recurringCanLoad();}
};
for(const id of ['closeServiceRecurring','cancelServiceRecurring'])$(id).onclick=()=>recurringDialog.close();
recurringDialog.addEventListener('close',()=>{if(recurringDialog.open)return;recurringVersion++;recurringSelection=null;});
for(const id of ['shopSelect','logoutBtn'])$(id).addEventListener(id==='shopSelect'?'change':'click',()=>{recurringVersion++;recurringSelection=null;recurringDialog.close();});
const recurringPreviousActivateTab=activateTab;activateTab=function(id){if(id!=='serviceSalesView')recurringDialog.close();recurringPreviousActivateTab(id);};
