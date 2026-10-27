let salesApprovalResolve=null;
function applySalesFeatureOptions(options){
  state.draftBillEnabled=options.draftBillEnabled??true;
  state.salesRepEnabled=options.salesRepEnabled??true;
  $('printDraftBill').hidden=!state.draftBillEnabled;
  $('saleSalesRepLabel').hidden=!state.salesRepEnabled;
  $('selectSalesRep').hidden=!state.salesRepEnabled;
  state.salesOperationsEnabled=!!options.operationsEnabled;
  if(!state.salesRepEnabled)resetSalesRep();
  syncSalesMoreActions();
}
function syncSalesMoreActions(){
  const offline=typeof offlineMode!=='undefined'&&offlineMode;
  $('printDraftBill').disabled=!state.cart.length;
  $('selectSalesRep').disabled=offline||!state.permissions?.Sales;
  $('printTillBtn').hidden=offline||!state.permissions?.Reports||!state.salesOperationsEnabled;
  $('additionalNoteBtn').disabled=!state.permissions?.Sales;
  $('additionalNoteBtn').classList.toggle('has-sale-note',!!state.saleNote);
}
$('salesMoreBtn').addEventListener('click',()=>{syncSalesMoreActions();$('salesMoreDialog').showModal();$('salesMoreBtn').setAttribute('aria-expanded','true');});
$('closeSalesMore').addEventListener('click',()=>$('salesMoreDialog').close());
$('salesMoreDialog').addEventListener('close',()=>$('salesMoreBtn').setAttribute('aria-expanded','false'));
$('salesMoreActions').addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!button.disabled)$('salesMoreDialog').close();},{capture:true});
$('selectSalesRep').addEventListener('click',()=>{
  if(state.salesRepEnabled===false||!state.permissions?.Sales)return;
  $('salesRepDialog').showModal();$('saleSalesRep').focus();
});
for(const id of ['closeSalesRep','doneSalesRep'])$(id).addEventListener('click',()=>$('salesRepDialog').close());
$('additionalNoteBtn').addEventListener('click',()=>{$('additionalNoteText').value=state.saleNote||'';$('additionalNoteDialog').showModal();$('additionalNoteText').focus();});
for(const id of ['closeAdditionalNote','cancelAdditionalNote'])$(id).addEventListener('click',()=>$('additionalNoteDialog').close());
$('additionalNoteForm').addEventListener('submit',event=>{event.preventDefault();state.saleNote=$('additionalNoteText').value.trim();$('additionalNoteDialog').close();renderCart();});
$('printTillBtn').addEventListener('click',async()=>{
  if(!state.permissions?.Reports||!state.salesOperationsEnabled)return;
  busy(true);
  try{const shop=currentShop(),report=await api('/api/operations/x-report?shopId='+shop);if(shop!==currentShop())return;showOpsReport(report);openOpsReportPrint();}
  catch(error){toast(error.message,true);}finally{busy(false);}
});
function salesActionAvailable(action){return !!(state.permissions?.[action]||state.permissions?.[action+'Approval']);}
async function authorizeSalesAction(action,details={}){
  if(!salesActionAvailable(action))throw Error('Your role cannot perform this action.');
  if(typeof offlineMode!=='undefined'&&offlineMode){
    if(!state.permissions?.[action])throw Error('Approval requires an internet connection.');
    return null;
  }
  const request={shopId:currentShop(),action,...details};
  if(state.permissions?.[action])return (await api('/api/sales-actions/authorize',{method:'POST',body:JSON.stringify(request)})).id;
  if(salesApprovalResolve)throw Error('Finish the current approval first.');
  $('salesApprovalHeading').textContent={DeleteRows:'Approve row deletion',CancelSales:'Approve sale cancellation',ChangePrice:'Approve price change',LaybyCancel:'Approve layby cancellation'}[action];
  $('salesApprovalDetails').textContent=details.unitPrice!=null?'New unit price: '+money(details.unitPrice):'An authorized operator must approve this action.';
  $('salesApprovalError').textContent='';$('salesApprovalForm').reset();
  $('salesApprovalDialog').showModal();$('salesApprovalUser').focus();
  return new Promise((resolve,reject)=>{salesApprovalResolve={resolve,reject,request};});
}
$('salesApprovalForm').addEventListener('submit',async event=>{
  event.preventDefault();const pending=salesApprovalResolve;if(!pending)return;
  const button=$('submitSalesApproval');button.disabled=true;
  try{
    const result=await api('/api/sales-actions/approve',{method:'POST',body:JSON.stringify({...pending.request,userName:$('salesApprovalUser').value,password:$('salesApprovalPassword').value})});
    salesApprovalResolve=null;
    $('salesApprovalDialog').addEventListener('close',()=>pending.resolve(result.id),{once:true});
    $('salesApprovalDialog').close();
  }catch(error){$('salesApprovalError').textContent=error.message;}
  finally{$('salesApprovalPassword').value='';button.disabled=false;}
});
$('cancelSalesApproval').addEventListener('click',()=>$('salesApprovalDialog').close());
$('salesApprovalDialog').addEventListener('close',()=>{
  $('salesApprovalPassword').value='';if(salesApprovalResolve){const pending=salesApprovalResolve;salesApprovalResolve=null;pending.reject(Error('Approval cancelled.'));}
});
async function loadSalesReps(){
  const select=$('saleSalesRep'),shop=currentShop(),previous=state.salesRepId;select.replaceChildren(new Option('No sales rep',''));state.salesRepId=null;state.defaultSalesRepId=null;state.salesRepsShopId=shop;
  if(!state.permissions?.Sales||state.salesRepEnabled===false){select.disabled=true;return;}
  if(typeof offlineMode!=='undefined'&&offlineMode){select.disabled=true;return;}
  select.disabled=true;
  try{const reps=await startupApi('/api/sales-reps?shopId='+shop);if(shop!==currentShop()||state.salesRepEnabled===false)return;state.defaultSalesRepId=reps[0]?.id??null;if(reps.length)select.replaceChildren(...reps.map(rep=>new Option(rep.name,rep.id)));state.salesRepId=reps.some(rep=>rep.id===previous)?previous:state.defaultSalesRepId;select.value=String(state.salesRepId??'');select.disabled=!reps.length;}
  catch(error){toast(error.message,true);}
}
$('saleSalesRep').addEventListener('change',()=>{state.salesRepId=Number($('saleSalesRep').value)||null;});
function resetSalesRep(){const offline=typeof offlineMode!=='undefined'&&offlineMode;state.salesRepId=!offline&&state.salesRepEnabled!==false&&state.salesRepsShopId===currentShop()?state.defaultSalesRepId??null:null;if($('saleSalesRep'))$('saleSalesRep').value=String(state.salesRepId??'');}
async function changeCartQuantity(line,quantity){
  if(!line||!state.cart.includes(line))return;
  try{
    if(quantity<=0){await authorizeSalesAction('DeleteRows',{productId:line.productId});if(!state.cart.includes(line))return;state.cart.splice(state.cart.indexOf(line),1);}
    else line.quantity=quantity;
    renderCart();
  }catch(error){renderCart();toast(error.message,true);}
}
$('printDraftBill').addEventListener('click',async()=>{
  if(state.draftBillEnabled===false){toast('Draft bill printing is disabled by your administrator.',true);return;}
  if(!state.cart.length)return;
  const button=$('printDraftBill');button.disabled=true;
  try{
    const items=cartRequestItems(),shopId=currentShop();
    const preview=await api('/api/checkout/draft-preview',{method:'POST',body:JSON.stringify({shopId,items,customerId:state.saleCustomer?.customerId??null,...(state.quotationId?{quotationId:state.quotationId}:{})})});
    const paper=document.createElement('article');
    paper.innerHTML=`<h2>${esc(state.bootstrap?.companyName)}</h2><h3>${state.serviceTerms==='COD'?'CASH SALES · ':state.serviceTerms==='ACCOUNT'?'ACCOUNT SALES · ':''}DRAFT BILL</h3><p>NOT A FISCAL RECEIPT · UNPAID</p><p>${esc(new Date().toLocaleString())}</p><p>Customer: ${esc(state.saleCustomer?.name||state.serviceCustomerDetail||'Cash Customer')}</p>${state.salesRepEnabled!==false?`<p>Sales rep: ${esc($('saleSalesRep').selectedOptions[0]?.textContent||'No sales rep')}</p>`:''}${state.servicePoNumber?`<p>PO No: ${esc(state.servicePoNumber)}</p>`:''}${state.serviceReference?`<p>Reference: ${esc(state.serviceReference)}</p>`:''}${state.serviceCustomerDetail&&state.saleCustomer?`<p style="white-space:pre-wrap">Customer detail: ${esc(state.serviceCustomerDetail)}</p>`:''}<table><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>${preview.lines.map(line=>`<tr><td style="white-space:pre-wrap">${esc(line.serviceDescription||line.name)}<small>${esc(money(line.originalPrice??line.price))} each</small></td><td>${esc(line.quantity)}</td><td>${esc(money(line.total))}</td></tr>`).join('')}</tbody></table><p>VAT included: ${esc(money(preview.vatAmount))}</p><h3>Total: ${esc(money(preview.total))}</h3>${state.saleNote?`<p style="white-space:pre-wrap">Note: ${esc(state.saleNote)}</p>`:''}<p>Payment has not been recorded.</p>`;
    await printThermalReceipt(paper);
  }catch(error){toast(error.message,true);}finally{button.disabled=!state.cart.length;}
});

$('productManagementBtn').addEventListener('click',()=>$('productManagementDialog').showModal());
$('closeProductManagement').addEventListener('click',()=>$('productManagementDialog').close());
$('productManagementDialog').addEventListener('click',event=>{if(event.target.closest('[data-tab]'))$('productManagementDialog').close();});
