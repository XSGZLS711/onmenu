$('serviceSalesTab').addEventListener('click',()=>setSalesMode(true));
$('closeServiceSales').addEventListener('click',()=>setSalesMode(false));
$('serviceSalesItems').addEventListener('change',()=>{state.serviceOnly=$('serviceSalesItems').value==='service';state.categoryId=null;renderCategories();loadProducts().catch(e=>toast(e.message,true));});
async function printQuotation(id){
 const popup=window.open('','_blank');if(!popup){toast('Allow the print window to print this quotation.',true);return;}
 popup.opener=null;popup.document.body.textContent='Preparing quotation…';
 try{
  const document=await api(`/api/quotations/${id}/document?shopId=${currentShop()}`),h=document.header,c=document.company;
  popup.document.open();popup.document.write(`<!doctype html><html><head><title>Quotation ${esc(h.quotationNo)}</title><style>@page{size:A4;margin:16mm}body{font:14px Arial;color:#172b3a;line-height:1.5}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:9px;border-bottom:1px solid #ddd;text-align:right}th:first-child,td:first-child{text-align:left;width:55%;overflow-wrap:anywhere}small{display:block;white-space:pre-wrap}.note{white-space:pre-wrap}</style></head><body><h1>${esc(c.name)}</h1><p>${esc(c.address)}<br>${esc(c.phone)} ${esc(c.email)}<br>TIN: ${esc(c.tin)}</p><h2>Quotation ${esc(h.quotationNo)}${h.cancelled?' — Cancelled':''}</h2><p>Customer: ${esc(h.customerName)}<br>${h.quotationDate?esc(new Date(h.quotationDate).toLocaleString()):''}<br>Reference: ${esc(h.reference||'')}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${document.items.map(x=>`<tr><td style="white-space:pre-wrap">${esc(x.description&&String(x.name).endsWith(' - '+x.description)?x.description:x.name)}${x.description&&!String(x.name).includes(x.description)?`<small>${esc(x.description)}</small>`:''}</td><td>${esc(x.quantity)}</td><td>${esc(money(x.price))}</td><td>${esc(money(x.total))}</td></tr>`).join('')}</tbody></table><p>VAT included: ${esc(money(document.items.reduce((sum,x)=>sum+Number(x.vatAmount||0),0)))}</p><h2>Total: ${esc(money(document.items.reduce((sum,x)=>sum+Number(x.total||0),0)))}</h2>${h.note?`<p class="note">${esc(h.note)}</p>`:''}<p>QUOTATION · NOT A TAX INVOICE · PAYMENT NOT RECORDED</p></body></html>`);popup.document.close();popup.focus();popup.print();
 }catch(e){popup.close();toast(e.message,true);}
}
async function convertQuotation(id){
 if(state.cart.length||state.heldSaleId||sessionStorage.getItem(pendingCheckoutKey())){toast('Complete, hold or clear the current sale before converting a quotation.',true);return;}
 busy(true);try{
  const shop=currentShop(),quote=await api(`/api/quotations/${id}/sale?shopId=${shop}`);if(shop!==currentShop())return;
  const items=quote.items.map(x=>({productId:x.productId,quantity:Number(x.quantity),unitPrice:Number(x.unitPrice),note:x.note||'',...(typeof x.applyVat==='boolean'?{applyVat:x.applyVat}:{}),...(x.stockItem===false&&state.serviceDescriptionsEnabled?{serviceDescription:x.note||''}:{})}));
  const preview=await api('/api/checkout/preview',{method:'POST',body:JSON.stringify({shopId:shop,customerId:quote.customer.customerId,quotationId:id,items})});
  if(shop!==currentShop())return;
  const products=quote.items.map((x,i)=>({...x,productName:preview.lines[i].name,serviceDescription:items[i].serviceDescription,unitPrice:Number(preview.lines[i].price),unitPriceOverride:Number(preview.lines[i].price),vatRate:Number(preview.lines[i].vatRate||0)}));
  state.quotationId=id;state.cart=products;state.saleCustomer=quote.customer;state.saleNote=String(quote.note||'');state.serviceCustomerDetail=null;state.serviceReference=String(quote.reference||'');state.servicePoNumber=String(quote.customerPoNumber||'');state.serviceTerms=null;renderCart();activateTab('orderView');toast(`Quotation ${quote.quotationNo} loaded with quoted prices. Review and complete checkout to convert.`);
 }catch(e){toast(e.message,true);}finally{busy(false);}
}
let paymentCustomer=null,paymentInvoices=[],customerPaymentSequence=0;
$('customerPaymentFind').addEventListener('submit',async event=>{
 event.preventDefault();const sequence=++customerPaymentSequence;
 try{const rows=await api('/api/customers?search='+encodeURIComponent($('paymentCustomerSearch').value));if(sequence!==customerPaymentSequence)return;
 $('paymentCustomerResults').innerHTML=rows.map((x,i)=>`<button class="secondary" type="button" data-payment-customer="${i}">${esc(x.name)} · ${esc(x.customerNo)}</button>`).join('')||'<p>No customers found.</p>';
 $('paymentCustomerResults').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>loadCustomerPaymentInvoices(rows[Number(b.dataset.paymentCustomer)]).catch(e=>toast(e.message,true))));
 }catch(e){toast(e.message,true);}
});
async function loadCustomerPaymentInvoices(customer){
 const form=$('customerPaymentForm');if(sessionStorage.getItem(opsKey(form))&&!sessionStorage.getItem(opsKey(form)+'.editable')){toast('Recover the saved customer payment before selecting another customer.',true);form.hidden=false;return;}
 const sequence=++customerPaymentSequence,shop=currentShop(),rows=await api(`/api/operations/customer-payments?shopId=${shop}&customerId=${customer.customerId}`);
 if(shop!==currentShop()||sequence!==customerPaymentSequence)return;paymentCustomer=customer;paymentInvoices=rows;
 $('paymentCustomerHeading').textContent=customer.name;
 $('customerPaymentInvoices').innerHTML=rows.map((x,i)=>`<div class="ops-line"><strong>${esc(x.invoiceNo)}</strong><span>Balance ${money(x.balance)}</span><label>Apply<input data-customer-apply="${i}" type="number" min="0" max="${Number(x.balance)}" step="0.01" value="0"></label></div>`).join('')||'<p>No outstanding credit invoices for this customer at this branch.</p>';
 form.elements.method.innerHTML=(state.enabledPaymentMethods||['CASH']).map(x=>`<option value="${esc(x)}">${esc(typeof paymentLabel==='function'?paymentLabel(x):x)}</option>`).join('');
 form.elements.bankId.innerHTML='<option value="">Choose bank</option>'+(state.paymentBanks||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
 form.hidden=false;form.querySelector('button[type=submit]').disabled=!rows.length;updateCustomerPaymentMethod();updateCustomerPaymentTotal();
}
function updateCustomerPaymentTotal(){const total=[...$('customerPaymentForm').querySelectorAll('[data-customer-apply]')].reduce((s,x)=>s+Number(x.value||0),0);$('customerPaymentTotal').textContent=money(total);return Math.round(total*100)/100;}
function updateCustomerPaymentMethod(){const f=$('customerPaymentForm'),bank=['CARD','CHEQUE','EFTPOS','EBANKING'].includes(f.elements.method.value);f.elements.bankId.closest('label').hidden=!bank;f.elements.bankId.required=bank;f.elements.reference.required=f.elements.method.value!=='CASH';if(!bank)f.elements.bankId.value='';}
$('customerPaymentForm').addEventListener('input',updateCustomerPaymentTotal);
$('customerPaymentForm').elements.method.addEventListener('change',updateCustomerPaymentMethod);
$('customerPaymentForm').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;
 const result=await opsSubmit(form,'/api/operations/customer-payments',()=>({customerId:paymentCustomer?.customerId,payment:{method:form.elements.method.value,tendered:updateCustomerPaymentTotal(),reference:form.elements.reference.value,...(form.elements.bankId.value?{bankId:Number(form.elements.bankId.value)}:{})},lines:paymentInvoices.map((x,i)=>({invoiceNo:x.invoiceNo,expectedBalance:Number(x.balance),amount:Number(form.querySelector(`[data-customer-apply="${i}"]`).value)})).filter(x=>x.amount>0)}));
 if(result){renderCustomerPaymentReceipt(result);paymentInvoices=[];form.hidden=true;}
});
function renderCustomerPaymentReceipt(r){
 $('customerPaymentReceipt').innerHTML=`<article class="report-paper"><h2>${esc(r.company.name)}</h2><p>${esc(r.company.address)}<br>${esc(r.company.phone)} ${esc(r.company.email)}<br>TIN: ${esc(r.company.tin)}</p><h3>Customer payment receipt</h3><strong>${esc(r.receiptNo)}</strong><p>${esc(r.customer.name)} · ${esc(new Date(r.createdUtc).toLocaleString())}</p>${r.lines.map(x=>`<p>${esc(x.InvoiceNo||x.invoiceNo)} · ${money(x.Amount??x.amount)}</p>`).join('')}<p>Total received: <strong>${money(r.total)}</strong> · ${esc(r.payment.Method||r.payment.method)}</p></article><button id="printCustomerPayment" type="button" class="primary">Print payment receipt</button>`;
 $('printCustomerPayment').addEventListener('click',()=>printThermalReceipt($('customerPaymentReceipt').querySelector('article')).catch(e=>toast(e.message,true)));
}
$('customerPaymentsTab').addEventListener('click',()=>{
 const form=$('customerPaymentForm');if(sessionStorage.getItem(opsKey(form))){form.hidden=false;form.querySelector('button[type=submit]').disabled=false;form.elements.method.required=false;form.elements.bankId.required=false;form.elements.reference.required=false;opsMessage(form,'A saved payment is awaiting confirmation. Use Save customer payment to retry it safely.');}
});
$('shopSelect').addEventListener('change',()=>{customerPaymentSequence++;paymentCustomer=null;paymentInvoices=[];$('customerPaymentForm').hidden=true;$('paymentCustomerResults').replaceChildren();$('customerPaymentReceipt').replaceChildren();});
