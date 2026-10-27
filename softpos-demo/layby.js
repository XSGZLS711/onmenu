let laybySelection=null,laybyLoadSequence=0,laybyListSequence=0;
const laybyPaymentForm=$('laybyPaymentForm');
function laybyOnline(){if(!state.permissions?.Layby||!state.salesOperationsEnabled)throw Error('Your role cannot use Layby.');if(typeof offlineMode!=='undefined'&&offlineMode)throw Error('Layby needs an online connection.');}
function syncLaybyCart(){
  const pending=sessionStorage.getItem(opsKey($('laybyCreateForm')));
  $('laybyCartSummary').textContent=pending?'A saved layby request is waiting. Submit to recover it before creating another layby.':`${state.cart.length} cart lines · ${$('cartTotal').textContent}`;
  $('laybyCustomerName').textContent=state.saleCustomer?.name||'Select a named customer for layby.';
  $('laybyCreateForm').querySelector('[type=submit]').disabled=!pending&&(!state.cart.length||!state.saleCustomer?.customerId||state.saleCustomer.customerId<=0||!state.permissions?.Sales);
}
async function loadLaybys(){
  laybyOnline();const shop=currentShop(),sequence=++laybyListSequence;
  $('laybyListStatus').textContent='Loading…';
  try{
    const rows=await api(`/api/operations/laybys?shopId=${shop}&search=${encodeURIComponent($('laybySearch').value.trim())}`);
    if(sequence!==laybyListSequence||shop!==currentShop())return;
    $('laybyListStatus').textContent=rows.length?`${rows.length} laybys shown · outstanding first`:'No laybys found.';
    $('laybyList').innerHTML=rows.map(row=>`<button type="button" data-open-layby="${esc(row.requestId)}"><span><strong>${esc(row.invoiceNo)} · ${esc(row.customerName)}</strong><small>${esc(money(row.total))} total · ${esc(money(row.amountPaid))} paid</small></span><strong>${esc(money(row.balance))}<small>${row.laybyState==='CANCELLED'?'Cancelled':row.laybyState==='COLLECTED'?'Collected':Number(row.balance)>0?'Balance':'Awaiting collection'}</small></strong></button>`).join('');
    $('laybyList').querySelectorAll('[data-open-layby]').forEach(button=>button.addEventListener('click',()=>openLayby(button.dataset.openLayby).catch(error=>toast(error.message,true))));
    showLaybyPending();return rows;
  }catch(error){if(sequence===laybyListSequence)$('laybyListStatus').textContent=error.message;throw error;}
}
function showLaybyPending(){
  const scope=laybyPaymentForm.dataset.operationScope;delete laybyPaymentForm.dataset.operationScope;const prefix=opsKey(laybyPaymentForm)+'.';if(scope)laybyPaymentForm.dataset.operationScope=scope;
  const ids=Object.keys(sessionStorage).filter(key=>key.startsWith(prefix)&&/^[\da-f-]{36}$/i.test(key.slice(prefix.length))).map(key=>key.slice(prefix.length));
  $('laybyPending').replaceChildren();
  for(const id of ids){const button=document.createElement('button');button.type='button';button.className='ghost';button.textContent='Recover saved layby payment';button.addEventListener('click',()=>openLayby(id).catch(error=>toast(error.message,true)));$('laybyPending').append(button);}
}
async function openLayby(id){
  laybyOnline();const shop=currentShop(),sequence=++laybyLoadSequence;if(laybySelection?.requestId!==id)$('laybyPaymentReceipt').replaceChildren();laybySelection=null;$('laybyDetail').hidden=true;
  const detail=await api(`/api/operations/laybys/${encodeURIComponent(id)}?shopId=${shop}`);
  if(sequence!==laybyLoadSequence||shop!==currentShop())return;
  laybySelection=detail;laybyPaymentForm.dataset.operationScope=id;laybyPaymentForm.reset();laybyPaymentForm.querySelector('.ops-result').textContent='';
  $('laybyInvoiceHeading').textContent=detail.sale.invoiceNo+' · '+detail.sale.customer.name;
  $('laybyBalanceSummary').innerHTML=[['Total',detail.sale.total],['Paid',detail.amountPaid],['Balance',detail.balance]].map(([label,value])=>`<div><small>${label}</small><strong>${esc(money(value))}</strong></div>`).join('');
  const methods=configuredPaymentMethods(state.enabledPaymentMethods).filter(method=>method!=='CARD'||!Number(state.creditCardFeePercent));
  laybyPaymentForm.elements.method.replaceChildren(...methods.map(method=>new Option(paymentLabel(method),method)));
  laybyPaymentForm.elements.bankId.replaceChildren(new Option('Select bank…',''),...(state.paymentBanks||[]).map(bank=>new Option(bank.name,bank.id)));
  laybyPaymentForm.elements.amount.value=Number(detail.balance).toFixed(2);laybyPaymentForm.elements.tendered.value=Number(detail.balance).toFixed(2);
  const pending=sessionStorage.getItem(opsKey(laybyPaymentForm));
  const frozen=!!pending&&!sessionStorage.getItem(opsKey(laybyPaymentForm)+'.editable');
  const payable=detail.balance>0&&(!detail.status||String(detail.status).trim().toUpperCase()==='OPEN');
  for(const control of laybyPaymentForm.querySelectorAll('input,select'))control.disabled=frozen||!payable;
  laybyPaymentForm.querySelector('[type=submit]').disabled=!pending&&(!payable||!methods.length);
  laybyPaymentForm.querySelector('[type=submit]').textContent=frozen?'Recover saved payment':'Save payment';
  if(pending)opsMessage(laybyPaymentForm,'A saved payment needs confirmation. Retry uses the saved amount and reference.');
  $('laybyHistory').innerHTML='<h4>Payment history</h4>'+detail.payments.map(row=>`<p><strong>${esc(row.receiptNo)}</strong> · ${esc(money(row.amountPaid))}${Number(row.change)>0?' · Change '+esc(money(row.change)):''} · ${esc(new Date(row.paymentDate).toLocaleString())}</p>`).join('');
  $('laybyDetail').hidden=false;syncLaybyPayment();syncLaybyWorkflow(detail);
}
function syncLaybyPayment(){
  const form=laybyPaymentForm,bank=paymentNeedsBank(form.elements.method.value);$('laybyBankLabel').hidden=!bank;form.elements.bankId.required=bank;
  const amount=Number(form.elements.amount.value),rounding=form.elements.method.value==='CASH'?cashRounding(amount,[{method:'CASH'}]):0;
  $('laybyPaymentHint').textContent=`Payable: ${money(amount+rounding)}${rounding?' · Cash round-off '+money(rounding):''}${form.elements.method.value==='CASH'?' · Only cash can give change.':''}${configuredPaymentMethods(state.enabledPaymentMethods).includes('CARD')&&Number(state.creditCardFeePercent)>0?' · Credit card is unavailable for layby while a card surcharge is configured.':''}`;
}
$('laybyBtn').addEventListener('click',async()=>{try{laybyOnline();activateTab('laybyView');syncLaybyCart();await loadLaybys();}catch(error){toast(error.message,true);}});
$('refreshLaybys').addEventListener('click',()=>loadLaybys().catch(error=>toast(error.message,true)));
$('laybySearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();loadLaybys().catch(error=>toast(error.message,true));}});
$('laybyChooseCustomer').addEventListener('click',()=>$('chooseSaleCustomer').click());
for(const id of ['saleCustomerDialog','createCustomerDialog'])$(id).addEventListener('close',()=>{if($('laybyView').classList.contains('active-view'))syncLaybyCart();});
$('laybyCreateForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const shop=currentShop();
  try{
    laybyOnline();if(sessionStorage.getItem(pendingCheckoutKey()))throw Error('Recover the pending sale payment before creating a layby.');const items=cartRequestItems(),customerId=state.saleCustomer?.customerId;
    let preview;
    if(!sessionStorage.getItem(opsKey(form))||sessionStorage.getItem(opsKey(form)+'.editable')){
      if(!items.length||!customerId||customerId<=0)throw Error('Add items and select a named customer first.');
      preview=await api('/api/checkout/preview',{method:'POST',body:JSON.stringify({shopId:shop,items,customerId,...(state.quotationId?{quotationId:state.quotationId}:{})})});
      if(shop!==currentShop())return;
    }
    const saved=sessionStorage.getItem(opsKey(form)),replay=saved&&!sessionStorage.getItem(opsKey(form)+'.editable')?JSON.parse(saved):null;
    const sourceItems=replay?.items||items,sourceCustomer=replay?.customerId??customerId;
    const result=await opsSubmit(form,'/api/checkout',()=>({items,customerId,...(state.quotationId?{quotationId:state.quotationId}:{}),isLayby:true,expectedTotal:preview.total,salesRepId:state.salesRepId,additionalNote:state.saleNote||null,customerDetail:state.serviceCustomerDetail||null,invoiceReference:state.serviceReference||null,customerPoNumber:state.servicePoNumber||null,heldSaleId:state.heldSaleId||null,payment:{method:'CASH',tendered:0,reference:''}}));
    if(!result||shop!==currentShop())return;
    if(JSON.stringify(sourceItems)===JSON.stringify(cartRequestItems())&&sourceCustomer===state.saleCustomer?.customerId){state.quotationId=null;state.cart=[];state.saleCustomer=null;state.saleNote='';state.serviceCustomerDetail=null;state.serviceReference='';state.servicePoNumber='';state.serviceTerms=null;state.heldSaleId=null;renderCart();}
    opsMessage(form,'Layby '+result.invoiceNo+' created. Select it below to record the deposit.');syncLaybyCart();$('laybySearch').value='';
    const rows=await loadLaybys();const created=rows?.find(row=>row.invoiceNo===result.invoiceNo);if(created)await openLayby(created.requestId);
    loadProducts().catch(()=>{});
  }catch(error){opsMessage(form,error.message,true);}
});
laybyPaymentForm.addEventListener('submit',async event=>{
  event.preventDefault();const selected=laybySelection;if(!selected)return;
  try{
    laybyOnline();const form=laybyPaymentForm;
    const result=await opsSubmit(form,'/api/operations/laybys/payment',()=>({saleRequestId:selected.requestId,amount:Number(form.elements.amount.value),expectedBalance:Number(selected.balance),payment:{method:form.elements.method.value,tendered:Number(form.elements.tendered.value),reference:form.elements.reference.value,...(paymentNeedsBank(form.elements.method.value)?{bankId:Number(form.elements.bankId.value)}:{})}}));
    if(!result){if(sessionStorage.getItem(opsKey(form)+'.editable'))await openLayby(selected.requestId);return;}if(currentShop()!==selected.shopId)return;
    const paper=document.createElement('article');paper.innerHTML=`<h2>${esc(state.bootstrap?.companyName||'SoftPOS')}</h2><h3>LAYBY PAYMENT · TRAINING</h3><p>NOT A FISCAL INVOICE</p><p>Invoice: ${esc(result.InvoiceNo)}</p><p>Receipt: ${esc(result.ReceiptNo)}</p><p>Customer: ${esc(selected.sale.customer.name)}</p><p>${esc(paymentLabel(result.Payment.Method))}: ${esc(money(result.Payment.Applied+result.Payment.Rounding))}</p><p>Received: ${esc(money(result.Payment.Tendered))}</p><p>Change: ${esc(money(result.Payment.Change))}</p><p>Total paid: ${esc(money(result.AmountPaid))}</p><h3>Balance: ${esc(money(result.Balance))}</h3>`;
    $('laybyPaymentReceipt').replaceChildren(paper);const print=document.createElement('button');print.type='button';print.className='ghost';print.textContent='Print payment receipt';print.addEventListener('click',()=>printThermalReceipt(paper).catch(error=>toast(error.message,true)));$('laybyPaymentReceipt').append(print);
    await loadLaybys();await openLayby(selected.requestId);if(laybySelection?.fiscalEnabled){$('laybyPaymentReceipt').replaceChildren();await recoverLaybyFiscal();}
  }catch(error){opsMessage(laybyPaymentForm,error.message,true);}
});
for(const name of ['amount','method','tendered'])laybyPaymentForm.elements[name].addEventListener('input',syncLaybyPayment);
laybyPaymentForm.elements.amount.addEventListener('change',()=>{const amount=Number(laybyPaymentForm.elements.amount.value);laybyPaymentForm.elements.tendered.value=(amount+(laybyPaymentForm.elements.method.value==='CASH'?cashRounding(amount,[{method:'CASH'}]):0)).toFixed(2);syncLaybyPayment();});
$('laybyPrintInvoice').addEventListener('click',async()=>{if(!laybySelection)return;try{const d=laybySelection;showTestReceipt(d.requestId,d.sale,d.shopId,d.createdUtc);$('receiptDialog').showModal();const final=(d.fiscalDocuments||[]).find(doc=>doc.phase==='FINAL_NS'&&doc.status==='SIGNED');if(final)await renderFiscalReceipt(laybySignedReceipt(JSON.parse(final.responseJson)));else await showNonFiscalTestReceipt();}catch(error){toast(error.message,true);}});
for(const id of ['shopSelect','logoutBtn'])$(id).addEventListener(id==='shopSelect'?'change':'click',()=>{laybyLoadSequence++;laybyListSequence++;laybySelection=null;$('laybyDetail').hidden=true;$('laybyPaymentReceipt').replaceChildren();$('laybyList').replaceChildren();if($('laybyView').classList.contains('active-view'))activateTab('orderView');});

const laybyActionForm=$('laybyActionForm');
function syncLaybyWorkflow(detail){
  const workflowState=detail.laybyState||(detail.balance>0?'OPEN':'PAID'),pending=(detail.fiscalDocuments||[]).some(doc=>doc.status!=='SIGNED');
  const labels={OPEN:'Open',PART_PAID:'Part-paid',PAID:'Paid — awaiting collection',COLLECTING:'Collection pending',COLLECTED:'Collected',CANCELLING:'Cancellation pending',CANCELLED:'Cancelled'};
  $('laybyWorkflowStatus').textContent=(labels[workflowState]||workflowState)+(detail.dueUtc?' · Due '+new Date(detail.dueUtc).toLocaleDateString():'')+(detail.minimumDeposit?' · Minimum first deposit '+money(detail.minimumDeposit):'')+(pending?' · VMS receipt pending':'');
  $('laybyRecoverFiscal').hidden=!pending&&!['COLLECTING','CANCELLING'].includes(workflowState);
  $('laybyCollect').hidden=workflowState!=='PAID'||!state.permissions?.LaybyCollect;
  $('laybyCancel').hidden=!['OPEN','PART_PAID','PAID'].includes(workflowState)||!salesActionAvailable('LaybyCancel');
  laybyActionForm.dataset.operationScope=detail.requestId;
  $('laybyRecoverAction').hidden=!sessionStorage.getItem(opsKey(laybyActionForm));
  if(!sessionStorage.getItem(opsKey(laybyPaymentForm))&&(!['OPEN','PART_PAID'].includes(workflowState)||pending))laybyPaymentForm.querySelector('[type=submit]').disabled=true;
  $('laybyPrintInvoice').hidden=workflowState==='CANCELLED';
  if(detail.fiscalEnabled){
    $('laybyPaymentReceipt').replaceChildren();
    for(const doc of detail.fiscalDocuments||[]){
      if(doc.status!=='SIGNED'||!doc.responseJson)continue;
      const fiscal=JSON.parse(doc.responseJson),button=document.createElement('button');button.type='button';button.className='ghost';button.textContent='Print '+doc.phase.replaceAll('_',' ')+' · '+fiscal.invoiceNumber;
      button.addEventListener('click',async()=>{try{const paper=document.createElement('article'),journal=document.createElement('pre');journal.textContent=fiscal.journal;paper.append(journal);if(fiscal.verificationQRCode&&fiscal.verificationQRCode.length<2000000){const bytes=atob(fiscal.verificationQRCode),mime=bytes.startsWith('GIF8')?'gif':bytes.charCodeAt(0)===137?'png':bytes.charCodeAt(0)===255?'jpeg':null;if(!mime)throw Error('Invalid VMS QR image.');const img=document.createElement('img');img.src='data:image/'+mime+';base64,'+fiscal.verificationQRCode;img.alt='VMS receipt verification QR';img.style.width='45mm';paper.append(img);}await printThermalReceipt(paper);}catch(error){toast(error.message,true);}});$('laybyPaymentReceipt').append(button);
    }
  }
}
async function recoverLaybyFiscal(){
  const detail=laybySelection;if(!detail)return;const button=$('laybyRecoverFiscal');button.disabled=true;
  try{await api(`/api/operations/laybys/${detail.requestId}/fiscal?shopId=${detail.shopId}`,{method:'POST'});if(currentShop()===detail.shopId){await loadLaybys();await openLayby(detail.requestId);}}
  catch(error){if(currentShop()===detail.shopId){opsMessage(laybyPaymentForm,error.message,true);await openLayby(detail.requestId);$('laybyWorkflowStatus').textContent+=' · '+error.message;}}
  finally{button.disabled=false;}
}
$('laybyRecoverFiscal').addEventListener('click',recoverLaybyFiscal);
function openLaybyAction(action,recover=false){
  const detail=laybySelection;if(!detail)return;laybyActionForm.reset();laybyActionForm.dataset.operationScope=detail.requestId;
  const saved=sessionStorage.getItem(opsKey(laybyActionForm)),pending=recover&&saved?JSON.parse(saved):null;
  if(saved&&!recover){openLaybyAction(null,true);return;}
  const chosen=pending?.action||action;laybyActionForm.elements.action.value=chosen;
  $('laybyActionHeading').textContent=chosen==='COLLECT'?'Collect layby goods':'Cancel layby and refund';
  $('laybyActionSummary').textContent=detail.sale.invoiceNo+' · '+(chosen==='COLLECT'?'Confirm the customer is collecting the goods. VMS settlement must finish before release.':'Full refund: '+money(Number(detail.refundAmount??detail.amountPaid))+'. Stock is released after the cancellation completes.');
  $('laybyCancelFields').hidden=chosen!=='CANCEL';laybyActionForm.elements.reason.required=chosen==='CANCEL';laybyActionForm.elements.refundConfirmed.required=chosen==='CANCEL'&&detail.amountPaid>0;
  laybyActionForm.elements.refundMethod.replaceChildren(...configuredPaymentMethods(state.enabledPaymentMethods).map(method=>new Option(paymentLabel(method),method)));
  if(pending){laybyActionForm.elements.reason.value=pending.reason||'';laybyActionForm.elements.refundMethod.value=pending.refundMethod||'CASH';laybyActionForm.elements.refundConfirmed.checked=pending.refundConfirmed;}
  laybyActionForm.querySelector('.ops-result').textContent=pending?'Submit to recover the saved action. Changes will not replace an uncertain request.':'';
  if(chosen==='CANCEL')laybyActionForm.elements.refundMethod.dispatchEvent(new Event('change'));
  $('laybyActionDialog').showModal();
}
$('laybyCollect').addEventListener('click',()=>openLaybyAction('COLLECT'));
$('laybyCancel').addEventListener('click',()=>openLaybyAction('CANCEL'));
$('laybyRecoverAction').addEventListener('click',()=>openLaybyAction(null,true));
$('closeLaybyAction').addEventListener('click',()=>$('laybyActionDialog').close());
laybyActionForm.elements.refundMethod.addEventListener('change',()=>{if(!laybySelection)return;const amount=Number(laybySelection.refundAmount??laybySelection.amountPaid),payable=amount+(laybyActionForm.elements.refundMethod.value==='CASH'?cashRounding(amount,[{method:'CASH'}]):0);$('laybyActionSummary').textContent=laybySelection.sale.invoiceNo+' � Full refund: '+money(payable)+'. Stock is released after cancellation completes.';});

laybyActionForm.addEventListener('submit',async event=>{
  event.preventDefault();const detail=laybySelection;if(!detail)return;
  try{
    const form=laybyActionForm,key=opsKey(form),saved=sessionStorage.getItem(key),editable=sessionStorage.getItem(key+'.editable'),action=form.elements.action.value;
    const authorizationId=action==='CANCEL'&&(!saved||editable)?await authorizeSalesAction('LaybyCancel',{heldSaleId:detail.requestId}):null;
    const result=await opsSubmit(form,'/api/operations/laybys/action',()=>({saleRequestId:detail.requestId,action,expectedBalance:Number(detail.balance),reason:form.elements.reason.value,refundMethod:form.elements.refundMethod.value,refundConfirmed:form.elements.refundConfirmed.checked,authorizationId}));
    if(!result)return;$('laybyActionDialog').close();await openLayby(detail.requestId);
    if(laybySelection?.fiscalEnabled)await recoverLaybyFiscal();else await loadLaybys();
  }catch(error){opsMessage(laybyActionForm,error.message,true);}
});

function laybySignedReceipt(fiscal){
  let qr='';if(fiscal.verificationQRCode&&fiscal.verificationQRCode.length<2000000){const bytes=atob(fiscal.verificationQRCode),mime=bytes.startsWith('GIF8')?'gif':bytes.charCodeAt(0)===137?'png':bytes.charCodeAt(0)===255?'jpeg':null;if(mime)qr='data:image/'+mime+';base64,'+fiscal.verificationQRCode;}
  return {status:'SANDBOX_SIGNED',invoiceNumber:fiscal.invoiceNumber,journal:fiscal.journal,verificationUrl:fiscal.verificationUrl||'',verificationQrCode:qr};
}
