// Device-local data is scoped to the signed-in company, cashier and shop.
// The SQL server remains authoritative; queued requests are never rewritten on retry.
let offlineMode=!navigator.onLine,offlineSnapshot=null,offlineSyncing=false,offlinePreparing=false;
let offlineDraftTimer,offlineProbeTimer;
const offlineDbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open('SoftPOSOffline',1);
  request.onupgradeneeded=()=>{for(const store of ['snapshots','sales','drafts'])request.result.createObjectStore(store,{keyPath:'key'});};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
offlineDbPromise.catch(()=>{});
function offlineOwner(me=state.me){return me?JSON.stringify([me.companyCode,String(me.userId),me.userName||'']):null;}
function offlineShopKey(shop=currentShop()){return offlineOwner()+':'+shop;}
function offlineValid(snapshot=offlineSnapshot){return snapshot&&snapshot.owner===offlineOwner()&&snapshot.shopId===currentShop()&&Date.now()<Date.parse(snapshot.expiresUtc)&&Date.now()>=Date.parse(snapshot.downloadedUtc)-300000;}
async function offlineRead(store,key){const db=await offlineDbPromise;return new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function offlineAll(store){const db=await offlineDbPromise;return new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function offlineWrite(store,value){const db=await offlineDbPromise;return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite',{durability:'strict'});tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Device storage write failed.'));});}
async function offlineSales(){return (await offlineAll('sales')).filter(row=>row.owner===offlineOwner()).sort((a,b)=>a.createdUtc.localeCompare(b.createdUtc));}
function offlineSetSession(snapshot){localStorage.setItem('softpos.offline.session',JSON.stringify({key:snapshot.key,owner:snapshot.owner}));}
function offlineSignedOut(){offlineSnapshot=null;clearTimeout(offlineDraftTimer);try{localStorage.removeItem('softpos.offline.session');localStorage.setItem('softpos.offline.logged-out','1');}catch{}updateOfflineStatus();}
function offlineSessionError(error){return error?.name==='TypeError'||error?.name==='AbortError';}
async function offlineRaw(url,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal,credentials:'same-origin',headers:{...(options.body?{'Content-Type':'application/json','X-CSRF-TOKEN':state.csrf}:{}),...options.headers}});
    let data=null;try{data=await response.json();}catch{}
    if(!response.ok){const error=Error(data?.message||`Request failed (${response.status}).`);error.status=response.status;throw error;}
    return data;
  }finally{clearTimeout(timer);}
}
function offlineRestrict(){
  if(!offlineMode||$('appScreen').hidden)return;
  const permissions=offlineSnapshot?.options.permissions||state.permissions||{};
  const options={...(offlineSnapshot?.options||{}),operationsEnabled:false,productManagementEnabled:false,holdSalesEnabled:false,
    permissions:Object.fromEntries(Object.keys(permissions).map(key=>[key,['Sales','ServiceSales','Discounts','DeleteRows','CancelSales','ChangePrice'].includes(key)?permissions[key]:false]))};
  state.checkoutEnabled=!!options.enabled&&!!permissions.Sales&&!!offlineValid();state.holdSalesEnabled=false;
  applyModuleAccess(options);state.permissions=options.permissions;
  $('recentSalesBtn').hidden=true;$('shopSelect').disabled=true;$('chooseSaleCustomer').disabled=true;
  for(const id of ['manageUsersLink','masterPortalLink','changePasswordBtn'])$(id).hidden=true;
  $('salesHoldActions').hidden=true;
  $('saleSalesRep').disabled=true;resetSalesRep();
  if(typeof syncBarcodeScanning==='function')syncBarcodeScanning();
  $('payBtn').disabled=!state.checkoutEnabled||!state.cart.length;
}
function offlineMarkDisconnected(){
  offlineMode=true;offlineRestrict();updateOfflineStatus();
}
async function updateOfflineStatus(){
  const signedIn=!$('appScreen').hidden;
  $('offlineStatusBar').hidden=!signedIn;
  $('offlineStateText').textContent=offlineMode?'Offline':'Online';
  if(!signedIn)$('offlineStatusBar').open=false;
  $('offlineStatusBar').classList.toggle('is-offline',offlineMode);
  let rows=[];try{if(signedIn)rows=await offlineSales();}catch{}
  const pending=rows.filter(row=>row.status!=='synced').length;
  $('offlinePendingCount').hidden=!pending;
  $('offlinePendingCount').textContent=String(pending);
  $('offlinePendingCount').setAttribute('aria-label',`${pending} sales pending sync`);
  $('offlinePendingText').textContent=pending?`${pending} sale${pending===1?'':'s'} pending sync`:offlineValid()?'Offline data ready':'Prepare this device for offline sales';
  $('offlineSyncBtn').disabled=offlineSyncing||offlineMode;
  $('offlinePrepareBtn').disabled=offlineMode||offlinePreparing;
  $('offlinePrepareBtn').textContent=offlineValid()?'Refresh offline data':'Prepare offline';
}
async function prepareOfflineData(){
  if(offlineMode||offlinePreparing||$('appScreen').hidden)return;
  offlinePreparing=true;await updateOfflineStatus();
  const owner=offlineOwner(),shop=currentShop();
  try{
    const [catalog,options]=await Promise.all([offlineRaw('/api/offline/catalog?shopId='+shop),offlineRaw('/api/checkout/options?shopId='+shop)]);
    if(owner!==offlineOwner()||shop!==currentShop()||$('appScreen').hidden)return;
    if(!options.enabled||!options.permissions?.Sales||!Array.isArray(catalog.products)||!catalog.expiresUtc)throw Error('This account or shop is not ready for offline sales.');
    const snapshot={key:offlineShopKey(),owner,shopId:shop,me:structuredClone(state.me),bootstrap:structuredClone(state.bootstrap),options,products:catalog.products,componentRecipes:catalog.componentRecipes,downloadedUtc:catalog.downloadedUtc,expiresUtc:catalog.expiresUtc};
    await offlineWrite('snapshots',snapshot);offlineSetSession(snapshot);offlineSnapshot=snapshot;
    if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
    $('offlineSetupDialog').close();toast(`${snapshot.products.length} products saved on this device. Offline access lasts 8 hours.`);
  }catch(error){$('offlineSetupStatus').textContent=error.message;toast(error.message,true);}
  finally{offlinePreparing=false;updateOfflineStatus();}
}
async function offlineRestore(){
  let pointer;try{pointer=JSON.parse(localStorage.getItem('softpos.offline.session')||'null');}catch{return false;}
  if(!pointer)return false;
  const snapshot=await offlineRead('snapshots',pointer.key);
  if(!snapshot||snapshot.owner!==pointer.owner||!snapshot.options.enabled||!snapshot.options.permissions?.Sales||Date.now()>=Date.parse(snapshot.expiresUtc)||Date.now()<Date.parse(snapshot.downloadedUtc)-300000)return false;
  offlineMode=true;offlineSnapshot=snapshot;state.me=snapshot.me;state.bootstrap=snapshot.bootstrap;
  const options=snapshot.options;
  state.receiptPaperWidthMm=options.receiptPaperWidthMm??80;
  for(const [key,value] of Object.entries(options))if(['enabled','permissions','sandboxSigning','priceKeypadEnabled','showProductCode','serviceDescriptionsEnabled','discountsEnabled','barcodeScanningEnabled','productComponentsEnabled','receiptPaperWidthMm','enabledPaymentMethods','paymentBanks','creditCardFeePercent','vmsMode'].includes(key))state[key==='enabled'?'checkoutEnabled':key]=value;
  state.holdSalesEnabled=false;state.heldSaleId=null;state.saleCustomer=null;state.editingTable=null;
  $('companyName').textContent=snapshot.bootstrap.companyName;
  $('userName').textContent=snapshot.me.fullName||snapshot.me.userName||'User';$('userRole').textContent=snapshot.me.role||'';
  $('userInitial').textContent=$('userName').textContent.slice(0,1).toUpperCase();
  const shop=snapshot.bootstrap.shops.find(shop=>shop.shopId===snapshot.shopId);
  $('shopSelect').replaceChildren(new Option(shop?.shopName||'Shop',String(snapshot.shopId)));
  $('priceEntryPanel').hidden=!state.priceKeypadEnabled;
  state.categoryId=null;state.serviceOnly=false;
  const draft=await offlineRead('drafts',snapshot.key);state.cart=draft?.cart||[];state.saleNote=draft?.saleNote||'';state.serviceCustomerDetail=draft?.customerDetail??null;state.serviceReference=draft?.invoiceReference||'';state.servicePoNumber=draft?.customerPoNumber||'';state.serviceTerms=draft?.serviceTerms??null;
  showApp();offlineRestrict();renderCategories();renderCart();await loadProducts();updateOfflineStatus();
  toast('Offline mode: this trusted device uses your last downloaded data.');return true;
}
function offlineSaveDraft(){
  clearTimeout(offlineDraftTimer);
  if($('appScreen').hidden||!offlineSnapshot||offlineSnapshot.owner!==offlineOwner()||offlineSnapshot.shopId!==currentShop())return;
  const value={key:offlineShopKey(),cart:structuredClone(state.cart),saleNote:state.saleNote||'',customerDetail:state.serviceCustomerDetail??null,invoiceReference:state.serviceReference||'',customerPoNumber:state.servicePoNumber||'',serviceTerms:state.serviceTerms??null};
  offlineDraftTimer=setTimeout(()=>offlineWrite('drafts',value).catch(()=>toast('Could not save this cart on the device. Check device storage.',true)),180);
}
// Decimal calculations mirror the server's positive decimal rounding rules.
function offlineScaled(value){const text=String(value??0);if(!/^\d+(?:\.\d{1,4})?$/.test(text))throw Error('Offline values support up to four decimal places.');const [whole,part='']=text.split('.');return BigInt(whole)*10000n+BigInt(part.padEnd(4,'0'));}
function offlineRound(value,divisor){return (value+divisor/2n)/divisor;}
function offlinePreview(request){
  if(!offlineValid()||!state.permissions?.Sales)throw Error('Offline data expired or is unavailable. Connect and prepare this device again.');
  if(request.shopId!==offlineSnapshot.shopId||request.customerId||request.heldSaleId||!request.items?.length||request.items.length>200)throw Error('Offline sales support walk-in customers only. Resume held sales and customer accounts online.');
  const lines=request.items.map(item=>{
    const product=offlineSnapshot.products.find(p=>p.productId===item.productId);if(!product)throw Error('A product is missing from this device. Refresh offline data online.');
    if(!product.stockItem&&!state.permissions.ServiceSales)throw Error('Your role cannot sell service items.');
    if(item.unitPrice!=null&&!state.priceKeypadEnabled)throw Error('Entered prices are disabled.');
    if(item.unitPrice!=null&&!state.permissions.ChangePrice)throw Error('Price changes require online approval.');
    if(item.serviceDescription&&(!state.serviceDescriptionsEnabled||product.stockItem))throw Error('This product cannot use a service description.');
    const original=offlineScaled(item.unitPrice??product.unitPrice),qty=offlineScaled(item.quantity);
    if(qty<=0n||qty>10000000000n||original<0n||original>10000000000n)throw Error('Enter a valid price and quantity.');
    const percent=offlineScaled(item.discountPercent||0),amount=offlineScaled(item.discountAmount||0);
    if(percent>1000000n||amount>original||(percent>0n&&amount>0n))throw Error('Enter a valid discount.');
    if((percent>0n||amount>0n)&&(!state.discountsEnabled||!state.permissions.Discounts))throw Error('Your role cannot apply discounts.');
    let price=percent>0n?offlineRound(original*(1000000n-percent),1000000n*100n)*100n:original;
    if(amount>0n)price=offlineRound(original-amount,100n)*100n;
    const total=offlineRound(price*qty,10000n),rate=offlineScaled(product.vatRate||0);
    const vat=rate>0n?offlineRound(total*rate,(1000000n+rate)*100n):0n;
    return {productId:product.productId,name:product.productName,quantity:Number(qty)/10000,price:Number(price)/10000,total:Number(total)/10000,vatRate:product.vatRate||0,vatAmount:Number(vat)/100,discountAmount:Number(offlineRound(original*qty,10000n)-total)/10000,originalPrice:Number(original)/10000,serviceDescription:item.serviceDescription||null,_total:total,_vat:vat};
  });
  const total=Number(offlineRound(lines.reduce((sum,line)=>sum+line._total,0n),100n))/100,vatAmount=Number(lines.reduce((sum,line)=>sum+line._vat,0n))/100;
  const rate=Number(offlineSnapshot.options.creditCardFeePercent||0),quote=creditCardQuote(total,request.payment||{method:'CASH',tendered:0},rate),finalLines=lines.map(({_total,_vat,...line})=>line);
  if(quote.surcharge>0)finalLines.push({productId:0,name:'Credit card surcharge',quantity:1,price:quote.surcharge,total:quote.surcharge,vatRate:0,vatAmount:0});
  return {total:quote.total,vatAmount,lines:finalLines,creditCardFeePercent:rate,surcharge:quote.surcharge};
}
async function offlineApi(url,options={}){
  const path=new URL(url,location.href),method=(options.method||'GET').toUpperCase();
  if(path.pathname==='/api/checkout/preview'&&method==='POST')return offlinePreview(JSON.parse(options.body));
  if(path.pathname==='/api/checkout/draft-preview'&&method==='POST'){
    if(state.draftBillEnabled===false)throw Error('Draft bill printing is disabled by your administrator.');
    return offlinePreview(JSON.parse(options.body));
  }
  if(path.pathname==='/api/products'&&method==='GET'){
    if(!offlineValid())throw Error('Offline catalogue expired. Connect and refresh offline data.');
    const terms=(path.searchParams.get('search')||'').toLowerCase().split(/\s+/).filter(Boolean),category=path.searchParams.get('categoryId');
    const pending=await offlineSales();
    return offlineSnapshot.products.filter(p=>!(state.bootstrap.categories||[]).some(c=>c.categoryId===p.categoryId&&c.displayOnSales===false)&&(!category||String(p.categoryId)===category)&&(path.searchParams.get('serviceOnly')!=='true'||!p.stockItem)&&terms.every(term=>[p.productCode,p.barcode,p.productName,p.description].join(' ').toLowerCase().includes(term))).slice(0,200).map(p=>({...p,stock:p.stock-pending.filter(row=>!row.result&&row.shopId===currentShop()).flatMap(row=>row.request.items).filter(item=>item.productId===p.productId).reduce((sum,item)=>sum+item.quantity,0)}));
  }
  if(path.pathname==='/api/products/barcode'&&method==='GET'){
    if(!offlineValid()||!state.permissions.Sales||!state.barcodeScanningEnabled)throw Error('Offline scanning is unavailable.');
    const matches=offlineSnapshot.products.filter(p=>!(state.bootstrap.categories||[]).some(c=>c.categoryId===p.categoryId&&c.displayOnSales===false)&&p.barcode===(path.searchParams.get('barcode')||'').trim());
    if(matches.length!==1)throw Error(matches.length?'More than one product uses this barcode. Resolve it online.':'Product is not in the downloaded catalogue.');return matches[0];
  }
  throw Error('This action needs an internet connection. Offline mode supports walk-in sales.');
}
function offlineMobilePayments(){return window.matchMedia('(max-width: 600px)').matches&&/Android|iPhone|iPod|Windows Phone/i.test(navigator.userAgent);}
function offlineValidatePayment(total,payment){
  const cents=value=>{
    if(!Number.isFinite(value)||value<=0||offlineScaled(value)%100n!==0n)throw Error('Enter a positive payment amount with up to two decimal places.');
    return offlineScaled(value)/100n;
  };
  const due=cents(total),split=payment.method==='SPLIT',parts=split?payment.parts:[payment];
  if(!Array.isArray(parts)||parts.length<(split?2:1)||parts.length>(split?8:1)||(!split&&payment.parts))throw Error('Invalid payment parts.');
  const seen=new Set();let external=0n,cash=0n;
  const normalized=parts.map(part=>{
    const method=String(part.method).toUpperCase(),amount=method==='CASH'&&Number(part.tendered)===0&&total+cashRounding(total,[{method:'CASH'}])===0?0n:cents(part.tendered),reference=String(part.reference||'').trim();
    if(!configuredPaymentMethods(state.enabledPaymentMethods).includes(method)||seen.has(method)||part.parts)throw Error('Use each payment method once.');
    if(reference.length>100||/[\x00-\x1f\x7f]/.test(reference))throw Error('Invalid transaction reference.');
    if(paymentNeedsBank(method)&&(!part.bankId||!paymentBankName(part.bankId)))throw Error('Select a valid bank for this payment.');
    if(!paymentNeedsBank(method)&&part.bankId!=null)throw Error('A bank is not used for this payment type.');
    seen.add(method);if(method==='CASH')cash=amount;else external+=amount;
    return {method,tendered:Number(amount)/100,reference:method==='CASH'?'':reference,...(paymentNeedsBank(method)?{bankId:Number(part.bankId),bankName:paymentBankName(part.bankId)}:{}),...(method==='CARD'&&part.baseAmount!=null?{baseAmount:Number(part.baseAmount)}:{})};
  });
  if(external>due||(!seen.has('CASH')&&external!==due)||(seen.has('CASH')&&(external>=due||external>due+BigInt(Math.round(cashRounding(total,normalized)*100))||cash<due+BigInt(Math.round(cashRounding(total,normalized)*100))-external)))throw Error('External payments must cover the balance exactly; only cash can give change.');
  const rounding=cashRounding(total,normalized),roundedDue=due+BigInt(Math.round(rounding*100));
  const change=seen.has('CASH')?cash+external-roundedDue:0n;
  return {rounding,parts:normalized.map(part=>({...part,rounding:part.method==='CASH'?rounding:0,applied:part.method==='CASH'?Number(due-external)/100:part.tendered})),tendered:Number(cash+external)/100,change:Number(change)/100};
}
async function offlineQueueCheckout(request){
  if(!request.offline)throw Error('This payment was started online. Reconnect and recover the same payment before continuing.');
  const preview=offlinePreview(request),payment=request.payment;
  const validatedPayment=offlineValidatePayment(preview.total,payment);
  if(validatedPayment.parts.some(part=>part.method!=='CASH')&&!request.offline.externalPaymentsConfirmed)throw Error('Confirm the external payment was received.');
  if(preview.total!==request.expectedTotal)throw Error('The cart total changed. Review it before saving.');
  const row={key:offlineOwner()+':'+request.requestId,owner:offlineOwner(),shopId:request.shopId,request:structuredClone(request),createdUtc:request.offline.createdUtc,status:'pending',companyName:state.bootstrap.companyName,shopName:$('shopSelect').selectedOptions[0]?.textContent,cashier:$('userName').textContent,preview,payment:validatedPayment};
  const db=await offlineDbPromise;
  clearTimeout(offlineDraftTimer);
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(['sales','drafts'],'readwrite',{durability:'strict'}),store=tx.objectStore('sales'),existing=store.get(row.key);
    existing.onsuccess=()=>{
      if(existing.result){if(JSON.stringify(existing.result.request)!==JSON.stringify(row.request)){tx.abort();return;}}
      else store.add(row);
      tx.objectStore('drafts').put({key:offlineShopKey(),cart:[],saleNote:''});
    };
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('This sale reference already exists with different data.'));tx.onerror=()=>reject(tx.error);
  });
  updateOfflineStatus();await offlineShowReceipt(row);return row;
}
async function offlineShowReceipt(row){
  if(row.result&&!offlineMode){showTestReceipt(row.request.requestId,row.result,row.shopId,row.createdUtc);$('receiptDialog').showModal();await loadFiscalReceipt();return;}
  const preview=row.preview,reference='OFF-'+row.request.requestId,payment=row.payment||offlineValidatePayment(row.preview.total,row.request.payment);
  $('offlineReceiptPaper').innerHTML=`<h2>${esc(row.companyName)}</h2><p>${esc(row.shopName)} · ${esc(row.cashier)}</p><h3>OFFLINE RECEIPT</h3><p>Customer: Cash Customer</p><p class="offline-receipt-warning">PENDING SYNC — NOT A FISCAL INVOICE</p><p class="offline-reference">${esc(reference)}</p><p>${esc(new Date(row.createdUtc).toLocaleString())}</p><table><thead><tr><th data-i18n>Item</th><th data-i18n>Qty</th><th>Amount</th></tr></thead><tbody>${preview.lines.map(line=>`<tr><td>${esc(line.name)}${line.serviceDescription?`<small>${esc(line.serviceDescription)}</small>`:''}</td><td>${line.quantity}</td><td>${money(line.total)}</td></tr>`).join('')}</tbody></table><dl><div><dt data-i18n>Total</dt><dd>${money(preview.total)}</dd></div><div><dt>VAT included (pending verification)</dt><dd>${money(preview.vatAmount)}</dd></div>${payment.parts.map(part=>`<div><dt>${esc(paymentLabel(part.method)+(part.bankName?' · '+part.bankName:''))}${part.reference?` · ${esc(part.reference)}`:''}</dt><dd>${money(Number(part.applied)+Number(part.rounding||0))}</dd></div>`).join('')}${payment.rounding?`<div><dt>Cash round-off</dt><dd>${money(payment.rounding)}</dd></div><div><dt data-i18n>Amount due</dt><dd>${money(preview.total+payment.rounding)}</dd></div>`:''}<div><dt>Total received</dt><dd>${money(payment.tendered)}</dd></div><div><dt>Cash change</dt><dd>${money(payment.change)}</dd></div></dl>${row.request.additionalNote?`<p style="white-space:pre-wrap">Note: ${esc(row.request.additionalNote)}</p>`:''}<p>${row.result?'Saved to server. Reconnect to retrieve the final receipt.':'Stored on this device. Keep this reference until the final receipt is available.'}</p>`;
  $('offlineReceiptDialog').showModal();
}
async function renderOfflineQueue(){
  const rows=await offlineSales();
  $('offlineQueueList').replaceChildren();
  if(!rows.length){$('offlineQueueList').textContent='No offline sales on this device for this account.';return;}
  for(const row of rows){
    const article=document.createElement('article');article.className='offline-sale-row';
    const labels={pending:'Pending sync',review:'Needs review',receipt:'Sale saved — receipt pending',synced:'Synced'};
    article.innerHTML=`<div><strong>${money(row.preview.total)} · ${esc(row.shopName)}</strong><small>${esc(new Date(row.createdUtc).toLocaleString())}</small><small>${esc(row.result?.invoiceNo||'OFF-'+row.request.requestId)}</small><p>${esc(labels[row.status]||row.status)}${row.error?': '+esc(row.error):''}</p></div>`;
    const open=document.createElement('button');open.className='ghost';open.textContent='Receipt';open.addEventListener('click',async()=>{try{await offlineShowReceipt(row);}catch(error){toast(error.message,true);}});article.append(open);$('offlineQueueList').append(article);
  }
}
async function syncOfflineSales(includeReview=false){
  if(offlineSyncing||$('appScreen').hidden||!navigator.onLine)return;
  offlineSyncing=true;await updateOfflineStatus();const owner=offlineOwner(),me=state.me;
  const run=async()=>{
    try{
      const identity=await offlineRaw('/api/me');if(offlineOwner(identity)!==owner){const error=Error('Sign in to the original cashier account to sync its sales.');error.status=401;throw error;}
      await refreshCsrf();
      if(owner!==offlineOwner()||state.me!==me||$('appScreen').hidden)return;
      const rows=await offlineSales();
      for(const row of rows.filter(row=>row.status!=='synced'&&(includeReview||row.status!=='review'))){
        if(owner!==offlineOwner()||$('appScreen').hidden)return;
        try{
          if(!row.result){
            row.result=await offlineRaw('/api/checkout',{method:'POST',body:JSON.stringify(row.request)});
            row.status='receipt';row.savedUtc=new Date().toISOString();row.error='';await offlineWrite('sales',row);
          }
          const options=await offlineRaw('/api/checkout/options?shopId='+row.shopId);
          if(options.sandboxSigning)await offlineRaw(`/api/checkout/${row.request.requestId}/sandbox-receipt`,{method:'POST',body:'{}'});
          row.status='synced';row.syncedUtc=new Date().toISOString();row.error='';await offlineWrite('sales',row);
        }catch(error){
          row.status=row.result?'receipt':error.status>=400&&error.status<500?'review':'pending';row.error=error.message;await offlineWrite('sales',row);
          if(error.status===401||error.status===403)throw error;
          if(offlineSessionError(error)){offlineMarkDisconnected();break;}
        }
      }
    }catch(error){
      if(error.status===401||error.status===403){offlineSignedOut();showLogin();toast('Sign in online to sync. Pending sales remain on this device.',true);}
      else{if(offlineSessionError(error))offlineMarkDisconnected();toast(error.message,true);}
    }
  };
  try{if(navigator.locks)await navigator.locks.request('softpos-offline-sync:'+owner,run);else await run();}
  finally{offlineSyncing=false;updateOfflineStatus();if($('offlineQueueDialog').open)renderOfflineQueue();}
}
async function offlineReconnect(includeReview=false){
  if($('appScreen').hidden||!navigator.onLine||offlinePreparing||offlineSyncing)return;
  try{
    const me=await offlineRaw('/api/me');
    if(offlineOwner(me)!==offlineOwner()){offlineSignedOut();showLogin();return;}
    const shop=currentShop(),options=await offlineRaw('/api/checkout/options?shopId='+shop);
    if(offlineSnapshot?.owner===offlineOwner()&&offlineSnapshot.shopId===shop){
      offlineSnapshot.options=options;await offlineWrite('snapshots',offlineSnapshot);
      if(!options.enabled||!options.permissions?.Sales){try{localStorage.removeItem('softpos.offline.session');}catch{}offlineSnapshot=null;}
    }
    const wasOffline=offlineMode;offlineMode=false;
    if(wasOffline){
      applyModuleAccess(options);state.checkoutEnabled=options.enabled;state.holdSalesEnabled=options.holdSalesEnabled;state.permissions=options.permissions;
      $('shopSelect').disabled=false;$('chooseSaleCustomer').disabled=false;
      $('recentSalesBtn').hidden=!options.enabled;$('manageUsersLink').hidden=!me.canManageDirectory;$('changePasswordBtn').hidden=!me.canChangePassword;$('masterPortalLink').hidden=!me.canManagePlatform;
      for(const key of ['sandboxSigning','vmsMode','priceKeypadEnabled','showProductCode','serviceDescriptionsEnabled','discountsEnabled','barcodeScanningEnabled','productComponentsEnabled','receiptPaperWidthMm','enabledPaymentMethods','paymentBanks','creditCardFeePercent'])state[key]=options[key];
      $('priceEntryPanel').hidden=!state.priceKeypadEnabled;renderCart();
      if(typeof syncBarcodeScanning==='function')syncBarcodeScanning();
    }
    await syncOfflineSales(includeReview);
    if(!offlineMode&&offlineSnapshot&&Date.now()-Date.parse(offlineSnapshot.downloadedUtc)>300000&&state.cart.length===0&&!document.querySelector('dialog[open]'))await prepareOfflineData();
    if(wasOffline&&!offlineMode)await loadProducts();updateOfflineStatus();
  }catch(error){
    if(error.status===401||error.status===403){offlineSignedOut();showLogin();}
    else if(offlineSessionError(error))offlineMarkDisconnected();
  }
}
async function offlineOnlineReady(){
  const owner=offlineOwner(),shop=currentShop();
  try{
    offlineMode=false;const snapshot=await offlineRead('snapshots',offlineShopKey());if($('appScreen').hidden||owner!==offlineOwner()||shop!==currentShop())return;offlineSnapshot=snapshot||null;
    $('shopSelect').disabled=false;$('chooseSaleCustomer').disabled=false;
    if(snapshot){offlineSetSession(snapshot);if(Date.now()-Date.parse(snapshot.downloadedUtc)>300000)await prepareOfflineData();}
    if($('appScreen').hidden||owner!==offlineOwner()||shop!==currentShop())return;updateOfflineStatus();syncOfflineSales();
  }catch{if($('appScreen').hidden||owner!==offlineOwner()||shop!==currentShop())return;offlineSnapshot=null;toast('Online sales are available. Offline device storage could not be opened.',true);}
}
$('offlinePrepareBtn').addEventListener('click',()=>{$('offlineSetupStatus').textContent='';$('offlineTrustedDevice').checked=false;$('offlineSetupDialog').showModal();});
$('offlineSetupForm').addEventListener('submit',event=>{event.preventDefault();prepareOfflineData();});
$('closeOfflineSetup').addEventListener('click',()=>$('offlineSetupDialog').close());
$('offlineQueueBtn').addEventListener('click',async()=>{await renderOfflineQueue();$('offlineQueueDialog').showModal();});
$('closeOfflineQueue').addEventListener('click',()=>$('offlineQueueDialog').close());
$('offlineExportBackup').addEventListener('click',async()=>{
  try{
    const rows=await offlineSales();if(!rows.length){toast('There are no offline sales to export.');return;}
    const blob=new Blob([JSON.stringify({format:'SoftPOSOfflineBackup',version:1,exportedUtc:new Date().toISOString(),owner:offlineOwner(),sales:rows},null,2)],{type:'application/json'});
    const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='SoftPOS-offline-sales-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }catch(error){toast(error.message,true);}
});
for(const id of ['offlineSyncBtn','offlineQueueSync'])$(id).addEventListener('click',()=>offlineReconnect(true));
$('closeOfflineReceipt').addEventListener('click',()=>$('offlineReceiptDialog').close());
$('printOfflineReceipt').addEventListener('click',()=>printThermalReceipt($('offlineReceiptPaper')).catch(e=>toast(e.message,true)));

window.addEventListener('offline',offlineMarkDisconnected);
window.addEventListener('online',()=>{clearTimeout(offlineProbeTimer);offlineProbeTimer=setTimeout(offlineReconnect,500);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)offlineReconnect();});
setInterval(()=>{if(!document.hidden){offlineRestrict();offlineReconnect();}},30000);
new MutationObserver(()=>{updateOfflineStatus();if($('appScreen').hidden){for(const id of ['offlineQueueDialog','offlineReceiptDialog','offlineSetupDialog'])if($(id).open)$(id).close();}}).observe($('appScreen'),{attributes:true,attributeFilter:['hidden']});

// Keep connection actions in the header without covering the catalog after use.
document.addEventListener('click',event=>{if(!$('offlineStatusBar').contains(event.target))$('offlineStatusBar').open=false;});
$('offlineStatusBar').addEventListener('click',event=>{if(event.target.closest('button'))$('offlineStatusBar').open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('offlineStatusBar').open){$('offlineStatusBar').open=false;$('offlineStatusBar').querySelector('summary').focus();}});
