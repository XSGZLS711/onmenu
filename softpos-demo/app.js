const state = { csrf:"", me:null, bootstrap:null, products:[], cart:[], categoryId:null, selectedTable:null, selectedCustomer:null, saleCustomer:null, editingTable:null };
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat(undefined,{style:"currency",currency:"FJD"}).format(Number(value||0));
const cartAmount = value => new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0));
const esc = value => String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

// Bound read-only sign-in requests so a broken connection cannot leave the overlay indefinitely.
async function startupApi(url,options={},timeoutMs=20000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await api(url,{...options,signal:controller.signal});}
  catch(error){if(error.name==='AbortError')throw new DOMException('The connection is taking too long. Check your internet connection and try again.','AbortError');throw error;}
  finally{clearTimeout(timer);}
}
async function refreshCsrf(){
  const result=await startupApi("/api/security/csrf");
  if(!result.token) throw new Error("SoftPOS security token was not returned.");
  state.csrf=result.token;
}
async function api(url,options={}){
  if(typeof offlineApi==='function'&&offlineMode)return offlineApi(url,options);
  const method=(options.method||"GET").toUpperCase();
  const headers={...(options.headers||{})};
  if(options.body) headers["Content-Type"]="application/json";
  if(method!=="GET"&&method!=="HEAD") headers["X-CSRF-TOKEN"]=state.csrf;
  let response;
  try{response=await fetch(url,{...options,headers,credentials:"same-origin"});}
  catch(error){
    if(!options.signal?.aborted&&typeof offlineApi==='function'&&offlineSessionError(error)&&!url.startsWith('/api/auth/')&&!url.startsWith('/api/security/')&&url!=='/api/me'){
      offlineMarkDisconnected();return offlineApi(url,options);
    }
    throw error;
  }
  if(response.status===401&&url!=="/api/auth/login"){
    showLogin();
    throw new Error("Your session has ended. Please sign in again.");
  }
  if(!response.ok){
    let details={}; try{ details=await response.json(); }catch{}
    const error=new Error(details.message||`Request failed (${response.status})`);
    if(response.status===409&&details.requiresCompanySelection&&Array.isArray(details.companies)) error.companies=details.companies;
    throw error;
  }
  if(response.status===204) return null;
  const type=response.headers.get("content-type")||""; return type.includes("json")?response.json():response.text();
}
function busy(show,message="Working…"){ $("busy").hidden=!show;if(show)$("busy").querySelector("span").textContent=message; }
let toastTimer; function toast(message,error=false){ clearTimeout(toastTimer); const el=$("toast"); el.textContent=message; el.classList.toggle("error-toast",error); el.hidden=false; toastTimer=setTimeout(()=>el.hidden=true,4200); }
function showLogin(){ if(typeof offlineSignedOut==='function')offlineSignedOut(); if(typeof resetSalesReporting==="function")resetSalesReporting(); if(typeof resetOperations==="function")resetOperations(); activateTab("orderView"); $("appScreen").hidden=true; $("loginScreen").hidden=false; $("loginPassword").value=""; $("companyChoiceLabel").hidden=true; $("loginCompanyChoice").replaceChildren(); }
function showApp(){ $("loginScreen").hidden=true; $("appScreen").hidden=false; }

async function initialize(){
  busy(true,"Checking sign-in…");
  try{
    if(typeof offlineMode!=='undefined'&&offlineMode){if(!localStorage.getItem('softpos.offline.logged-out')&&await offlineRestore())return;offlineMode=false;}
    const identity=startupApi("/api/me").then(me=>({me}),error=>({error}));
    const [options,session]=await Promise.all([startupApi("/api/auth/options"),identity,refreshCsrf()]);
    $("companyCodeLabel").hidden=!options.requiresCompanyCode;
    $("loginCompany").required=options.requiresCompanyCode;
    $("loginUserLabel").textContent=options.emailLogin?"Email address":"Username";
    $("loginUser").type=options.emailLogin?"email":"text";
    $("companyChoiceLabel").hidden=true;
    if(localStorage.getItem('softpos.offline.logged-out')){showLogin();return;}
    if(session.error)throw session.error;state.me=session.me;
    if(state.me.isPlatformOnly){ location.replace("/master.html"); return; }
    busy(true,"Opening your shop…");await loadBootstrap(null,true);
    showApp();
    if(typeof offlineOnlineReady==='function')void offlineOnlineReady();
  }catch(error){
    if(typeof offlineRestore==='function'&&offlineSessionError(error)){
      try{if(await offlineRestore())return;}catch{}
    }
    showLogin();
    if(error?.message&&!String(error.message).includes("session has ended")){
      $("loginError").textContent=error.message;
      $("loginError").hidden=false;
    }
  }finally{ busy(false); }
  if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
}

$("loginForm").addEventListener("submit",async event=>{
  event.preventDefault(); $("loginError").hidden=true; busy(true,"Signing in…");
  try{
    if(typeof offlineMode!=='undefined')offlineMode=false;
    // A tab may remain open while IIS is restarted or the application is
    // updated. Obtain a token tied to the current cookie before every login.
    await refreshCsrf();
    const selectedCompany=!$("companyChoiceLabel").hidden?$("loginCompanyChoice").value:
      !$("companyCodeLabel").hidden?$("loginCompany").value:null;
    await api("/api/auth/login",{method:"POST",body:JSON.stringify({companyCode:selectedCompany,userName:$("loginUser").value,password:$("loginPassword").value})});
    localStorage.removeItem('softpos.offline.logged-out');
    state.quotationId=null;state.heldSaleId=null;state.quotationId=null;state.cart=[];state.saleCustomer=null;state.saleNote='';state.serviceCustomerDetail=null;state.serviceReference='';state.servicePoNumber='';state.serviceTerms=null; state.editingTable=null; state.selectedCustomer=null; state.selectedTable=null; renderCart();
    if(typeof offlineMode!=='undefined')offlineMode=false;
    const [,me,checkout,bootstrap]=await Promise.all([refreshCsrf(),startupApi("/api/me"),startupApi("/api/checkout/options"),startupApi("/api/bootstrap")]);state.me=me;busy(true,"Opening your shop…");await loadBootstrap([checkout,bootstrap],true);showApp();
    if(typeof offlineOnlineReady==='function')void offlineOnlineReady();
  }catch(error){
    if(error.companies?.length){
      const select=$("loginCompanyChoice");
      select.replaceChildren(...error.companies.map(company=>{
        const option=document.createElement("option"); option.value=company.code; option.textContent=company.name; return option;
      }));
      $("companyChoiceLabel").hidden=false;
    }
    $("loginError").textContent=error.message; $("loginError").hidden=false;
  }finally{ busy(false); }
});
$("toggleLoginPassword").addEventListener("click",()=>{
  const visible=$("loginPassword").type==="password";
  $("loginPassword").type=visible?"text":"password";
  $("toggleLoginPassword").textContent=visible?"Hide password":"Show password";
  $("toggleLoginPassword").setAttribute("aria-pressed",String(visible));
});
$("loginUser").addEventListener("input",()=>{ $("companyChoiceLabel").hidden=true; $("loginCompanyChoice").replaceChildren(); });
$("logoutBtn").addEventListener("click",async()=>{ try{ if(typeof offlineMode==='undefined'||!offlineMode)await api("/api/auth/logout",{method:"POST"}); }finally{ state.quotationId=null;state.heldSaleId=null;state.cart=[];state.saleCustomer=null;state.saleNote='';state.serviceCustomerDetail=null;state.serviceReference='';state.servicePoNumber='';state.serviceTerms=null; showLogin(); } });

async function loadBootstrap(loadedData=null,loadCatalog=false){
  const [checkout,bootstrap]=loadedData??await Promise.all([startupApi("/api/checkout/options"),startupApi("/api/bootstrap")]);
  state.checkoutEnabled=checkout.enabled;
  state.showProductCode=checkout.showProductCode; state.barcodeScanningEnabled=checkout.barcodeScanningEnabled; if(typeof syncBarcodeScanning==="function")syncBarcodeScanning();
  state.serviceDescriptionsEnabled=checkout.serviceDescriptionsEnabled;state.productComponentsEnabled=checkout.productComponentsEnabled;
  state.holdSalesEnabled=checkout.holdSalesEnabled;state.discountsEnabled=checkout.discountsEnabled;
  state.receiptPaperWidthMm=checkout.receiptPaperWidthMm;state.enabledPaymentMethods=checkout.enabledPaymentMethods;state.paymentBanks=checkout.paymentBanks||[];state.creditCardFeePercent=Number(checkout.creditCardFeePercent||0);
  state.priceKeypadEnabled=checkout.priceKeypadEnabled;
  $('priceEntryPanel').hidden=!state.priceKeypadEnabled;
  $('priceEntryAmount').value='';
  state.sandboxSigning=checkout.sandboxSigning;
  document.querySelectorAll(".ops-product-manager").forEach(x=>x.hidden=!(checkout.productManagementEnabled??checkout.operationsEnabled)||!["admin","superadmin","supervisor"].includes((state.me.role||"").trim().toLowerCase()));
  document.querySelectorAll(".ops-manager").forEach(x=>x.hidden=!checkout.operationsEnabled||!["admin","superadmin","supervisor"].includes((state.me.role||"").trim().toLowerCase()));
  document.querySelectorAll(".ops-reports").forEach(x=>x.hidden=!checkout.operationsEnabled);
  applyModuleAccess(checkout);
  $("recentSalesBtn").hidden=!checkout.enabled;
  $("checkoutUnavailable").hidden=checkout.enabled;
  $("payBtn").title=checkout.enabled?"":"Checkout is not configured for this company yet.";
  $("payBtn").disabled=!checkout.enabled||state.cart.length===0;
  state.bootstrap=bootstrap;
  const licence=state.bootstrap.licenseNotice;
  $('licenseNotice').hidden=!licence;
  $('licenseNotice').textContent=licence?.message||'';
  $("companyName").textContent=state.bootstrap.companyName;
  const displayName=(state.me.fullName||state.me.userName||"User").trim();
  const role=(state.me.role||"").trim();
  $("userName").textContent=displayName;
  $("userRole").textContent=role;
  $("userRole").hidden=!role||role.toLocaleLowerCase()===displayName.toLocaleLowerCase();
  $("manageUsersLink").hidden=!state.me.canManageDirectory; $("changePasswordBtn").hidden=!state.me.canChangePassword;
  $("masterPortalLink").hidden=!state.me.canManagePlatform;
  $("userInitial").textContent=(state.me.fullName||state.me.userName||"U").slice(0,1).toUpperCase();
  const shops=state.bootstrap.shops||[];
  $("shopSelect").innerHTML=shops.map(s=>`<option value="${s.shopId}">${esc(s.shopName)}</option>`).join("");
  if(state.me.shopId&&shops.some(s=>s.shopId===state.me.shopId)) $("shopSelect").value=state.me.shopId;
  await refreshShopVms(currentShop(),currentShop()===Number(state.me.shopId||0)?checkout:null);
  state.loadedShopId=currentShop();
  renderCategories(); renderTables();
  if(loadCatalog)await Promise.all([loadSalesReps(),loadProducts(true)]);else await loadSalesReps();
  const held=(state.bootstrap.tables||[]).filter(t=>t.occupied).length; $("holdCount").textContent=held;
  if(checkout.enabled)restorePendingCheckout();
}
function currentShop(){ return Number($("shopSelect").value||0); }
async function refreshShopVms(shopId,loadedOptions=null){
  const options=loadedOptions??await startupApi(`/api/checkout/options?shopId=${shopId}`);
  state.sandboxSigning=options.sandboxSigning;
  state.vmsMode=options.vmsMode;
  applyModuleAccess(options);
  state.showProductCode=options.showProductCode; state.barcodeScanningEnabled=options.barcodeScanningEnabled; if(typeof syncBarcodeScanning==="function")syncBarcodeScanning();
  renderProducts();
  state.serviceDescriptionsEnabled=options.serviceDescriptionsEnabled;state.productComponentsEnabled=options.productComponentsEnabled;
  state.discountsEnabled=options.discountsEnabled;state.holdSalesEnabled=options.holdSalesEnabled;renderCart();
  state.receiptPaperWidthMm=options.receiptPaperWidthMm;state.enabledPaymentMethods=options.enabledPaymentMethods;state.paymentBanks=options.paymentBanks||[];state.creditCardFeePercent=Number(options.creditCardFeePercent||0);
  state.priceKeypadEnabled=options.priceKeypadEnabled;
  $('priceEntryPanel').hidden=!state.priceKeypadEnabled;
  if(!state.priceKeypadEnabled)$('priceEntryAmount').value='';
}
$("shopSelect").addEventListener("change",async()=>{ if(state.cart.length){$("shopSelect").value=String(state.loadedShopId);toast("Hold or clear the current sale before changing shops.",true);return;}state.loadedShopId=currentShop(); state.quotationId=null;state.heldSaleId=null;state.cart=[];state.saleCustomer=null;state.saleNote='';state.serviceCustomerDetail=null;state.serviceReference='';state.servicePoNumber='';state.serviceTerms=null; state.editingTable=null;$('priceEntryAmount').value=''; renderCart(); await refreshShopVms(currentShop()); await loadSalesReps(); await loadProducts();if(typeof offlineOnlineReady==='function')void offlineOnlineReady(); });

function renderCategories(){
  const categories=[{categoryId:'fav',categoryName:"Favourites"},{categoryId:'menu',categoryName:"Hot sellers"},{categoryId:null,categoryName:"All products"},...(state.bootstrap.categories||[]).filter(c=>c.displayOnSales!==false)];
  if(!state.demoFavouritesStart){state.demoFavouritesStart=true;if(state.categoryId==null)state.categoryId='fav';}
  if(!categories.some(c=>c.categoryId===state.categoryId))state.categoryId=null;
  $("categoryList").innerHTML=categories.map(c=>`<button class="category tone-${c.categoryId==='fav'?'orange':c.categoryId==='menu'?'rose':categoryPresentation(c).tone} ${c.categoryId==='fav'?'category-fav':c.categoryId==='menu'?'category-menu':''} ${state.categoryId===c.categoryId?'active':''}" data-category="${c.categoryId??''}">${c.categoryId==='fav'?catalogIcon('star'):c.categoryId==='menu'?catalogIcon('flame'):catalogIcon(categoryPresentation(c).kind)}${esc(c.categoryName)}</button>`).join("");
  $("categoryList").querySelectorAll("button").forEach(button=>button.addEventListener("click",async()=>{
    state.categoryId=button.dataset.category===""?null:(button.dataset.category==='fav'||button.dataset.category==='menu')?button.dataset.category:Number(button.dataset.category); renderCategories(); await loadProducts();
  }));
}
let productRequest=0, searchTimer;
async function loadProducts(startup=false){
  clearTimeout(searchTimer);
  const request=++productRequest;
  if(!currentShop()) return;
  $('productCount').textContent='Searching…';
  $('productList').setAttribute('aria-busy','true');
  state.products=[]; $('productList').innerHTML=''; $('productEmpty').hidden=true;
  try{
    const q=new URLSearchParams({shopId:String(currentShop()),search:$('productSearch').value.trim()});
    if(state.categoryId) q.set('categoryId',state.categoryId);
    if(state.serviceOnly)q.set('serviceOnly','true');
    const products=await (startup?startupApi(`/api/products?${q}`):api(`/api/products?${q}`));
    if(request!==productRequest)return;
    state.products=products; renderProducts(); if(typeof syncMobileUI==="function")syncMobileUI();
  }catch(error){if(request===productRequest){$('productCount').textContent='Search unavailable. Type to try again.';toast(error.message,true);}}
  finally{if(request===productRequest)$('productList').setAttribute('aria-busy','false');}
}
function productSecondaryText(product){
 const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const description=normalize(product.description)===normalize(product.productName)?null:product.description;
 return [state.showProductCode?product.productCode:null,description].filter(Boolean).join(' · ');
}
function renderProducts(){
  const displayed=state.products;
  $("productEmpty").hidden=displayed.length>0;
  $("productCount").textContent=`${displayed.length} products shown`;
  $('productList').classList.toggle('menu-mode',state.categoryId==='menu');
  $("productList").innerHTML=state.categoryId==='menu'?displayed.map(p=>{
    const theme=productPresentation(p);
    return `<article class="product-card menu-tile tone-${theme.tone}" data-product="${p.productId}" data-menu-no="${p.menuNo}" tabindex="0" role="button" aria-label="No. ${p.menuNo}, ${esc(p.productName)}, ${esc(money(p.unitPrice))}"><div class="product-card-top"></div><div class="menu-number" aria-hidden="true">${esc(p.menuNo)}</div><strong title="${esc(p.productName)}">${esc(p.productName)}</strong><span class="menu-price">${esc(money(p.unitPrice))}</span></article>`;
  }).join(""):displayed.map(p=>{
    const theme=productPresentation(p),secondary=productSecondaryText(p);
    const stock=p.stockItem===false?'Non-stock':`${Number(p.stock).toLocaleString('en-FJ',{minimumFractionDigits:0,maximumFractionDigits:7})} ${p.uom||''} in stock`.replace(/\s+/g,' ').trim();
    return `<article class="product-card tone-${theme.tone} ${p.imageUrl?'has-product-photo':''}" data-product="${p.productId}" tabindex="0" role="button" aria-label="${esc(p.productName)}, ${esc(money(p.unitPrice))}"><div class="product-card-top"></div><div class="product-card-main">${catalogVisual(p,theme)}<div class="product-details"><strong title="${esc(p.productName)}">${esc(p.productName)}</strong>${secondary?`<small title="${esc(secondary)}">${esc(secondary)}</small>`:''}</div></div><footer><span class="price"><span class="product-price-currency">FJD</span> ${Number(p.unitPrice||0).toLocaleString("en-FJ",{minimumFractionDigits:2,maximumFractionDigits:2})}</span><span class="stock ${p.stockItem===false?'stock-service':Number(p.stock)<=0?'stock-empty':''}" title="${p.stockItem===false?'Non-stock item':'Available stock'}">${esc(stock)}</span><button type="button" class="fav-star" data-fav="${p.productId}" aria-pressed="${p.favourite?'true':'false'}" aria-label="Favourite" title="Favourite">${p.favourite?'\u2605':'\u2606'}</button></footer></article>`;
  }).join("");
  $('productList').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.closest('.product-card')?.classList.remove('has-product-photo');img.parentElement.remove();}));
  $("productList").querySelectorAll('.fav-star').forEach(star=>{
    star.addEventListener('keydown',e=>e.stopPropagation());
    star.addEventListener('click',async e=>{
      e.stopPropagation();
      const id=Number(star.dataset.fav),product=state.products.find(p=>p.productId===id),on=!(product&&product.favourite);
      try{
        await api('/api/products/'+id+'/favourite',{method:'POST',body:JSON.stringify({shopId:currentShop(),favourite:on})});
        if(product)product.favourite=on;
        star.setAttribute('aria-pressed',String(on));star.textContent=on?'\u2605':'\u2606';
        toast(on?'Added to favourites.':'Removed from favourites.');
        if(!on&&state.categoryId==='fav')await loadProducts();
      }catch(error){toast(error.message,true);}
    });
  });
  $("productList").querySelectorAll(".product-card").forEach(card=>{
    const add=()=>addProduct(Number(card.dataset.product)); card.addEventListener("click",add); card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();add();}});
  });
}
async function addProduct(id,scannedProduct=null){
  const product=scannedProduct||state.products.find(p=>p.productId===id); if(!product)return;
  const entered=state.priceKeypadEnabled?$('priceEntryAmount').value.trim():'';
  if(entered && (!/^(?:\d+(\.\d{0,2})?|\.\d{1,2})$/.test(entered)||Number(entered)<=0||Number(entered)>1000000)){
    toast('Enter a price greater than zero with up to two decimal places.',true);$('priceEntryAmount').focus();return;
  }
  const override=entered?Number(entered):null;
  let priceApprovalId=null;
  if(override!==null){try{priceApprovalId=await authorizeSalesAction('ChangePrice',{productId:id,unitPrice:override});}catch(error){toast(error.message,true);return;}}
  const line=state.cart.find(x=>x.productId===id&&(x.unitPriceOverride??null)===override&&(product.stockItem!==false||!(x.serviceDescription||x.note)));
  if(line){line.quantity=Number(line.quantity)+1;if(priceApprovalId)line.priceApprovalId=priceApprovalId;} else state.cart.push({...product,unitPrice:override??product.unitPrice,unitPriceOverride:override,priceApprovalId,quantity:1,note:""});
  $('priceEntryAmount').value='';
  renderCart();highlightCartAddition(line||state.cart[state.cart.length-1]);
  if($('productSearch').value){
    $('productSearch').value='';
    loadProducts();
    if(window.matchMedia('(min-width:601px)').matches)$('productSearch').focus({preventScroll:true});
  }
}
function cartRequestItems(){return state.cart.map(x=>({productId:x.productId,quantity:Number(x.quantity),note:x.note||'',unitPrice:x.unitPriceOverride??null,...(x.priceApprovalId?{priceApprovalId:x.priceApprovalId}:{}),serviceDescription:x.serviceDescription?.trim()||null,...(typeof x.applyVat==='boolean'?{applyVat:x.applyVat}:{}),...cartDiscountRequest(x)}));}
$('clearEntryPrice').addEventListener('click',()=>{$('priceEntryAmount').value='';$('priceEntryAmount').dispatchEvent(new Event('input',{bubbles:true}));$('priceEntryAmount').focus();});
function applyEntryPrice(){
  const input=$('priceEntryAmount'),entered=input.value.trim();
  if(entered&&(!/^(?:\d+(\.\d{0,2})?|\.\d{1,2})$/.test(entered)||Number(entered)<=0||Number(entered)>1000000)){
    toast('Enter a price greater than zero with up to two decimal places.',true);input.focus();return;
  }
  if($('mobilePriceDialog').open)$('applyMobilePrice').click();
  else $('productSearch').focus();
}
$('priceEntryAmount').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();applyEntryPrice();}});
$('priceKeypad').addEventListener('click',event=>{
  const button=event.target.closest('button[data-key],button[data-amount]');if(!button)return;
  const input=$('priceEntryAmount'),key=button.dataset.key;
  if(key==='enter'){applyEntryPrice();return;}
  if(button.dataset.amount)input.value=button.dataset.amount;
  else if(key==='clear')input.value='';
  else if(key==='back')input.value=input.value.slice(0,-1);
  else{
    const next=(input.value+(key==='.'&&!input.value?'0.':key)).replace(/^0+(?=\d)/,'');
    if(next.length<=input.maxLength&&/^\d+(?:\.\d{0,2})?$/.test(next))input.value=next;
  }
  input.dispatchEvent(new Event('input',{bubbles:true}));
  if(window.matchMedia('(min-width:601px)').matches)input.focus({preventScroll:true});
});

function cartLineVat(line){
  const quantity=Number(line.quantity);
  if(Number.isFinite(line.vatAmount)&&Number(line.originalQuantity)>0)
    return Math.round(Number(line.vatAmount)*quantity/Number(line.originalQuantity)*100)/100;
  const rate=Number(line.vatRate||0);
  if(!Number.isFinite(rate)||rate<=0)return 0;
  const total=Math.round(cartNetPrice(line)*quantity*10000)/10000;
  return Math.round((total*rate/(100+rate)+Number.EPSILON)*100)/100;
}
let cartVatTimer,cartVatSequence=0;
function updateCartVat(){
  clearTimeout(cartVatTimer);
  const sequence=++cartVatSequence;
  const vat=$('cartVat');
  vat.removeAttribute('title');
  if(!state.cart.length){vat.textContent=cartAmount(0);return;}
  if(!state.checkoutEnabled||state.editingTable){vat.textContent=cartAmount(state.cart.reduce((sum,line)=>sum+cartLineVat(line),0));return;}
  vat.textContent='Calculating…';
  const shopId=currentShop();
  const items=cartRequestItems();
  cartVatTimer=setTimeout(async()=>{
    try{
      const preview=await api('/api/checkout/preview',{method:'POST',body:JSON.stringify({requestId:crypto.randomUUID(),shopId,expectedTotal:0,items,payment:{method:'CASH',tendered:0,reference:''}})});
      if(sequence===cartVatSequence)vat.textContent=cartAmount(preview.vatAmount);
    }catch(error){if(sequence===cartVatSequence){vat.textContent='—';vat.title=error.message;}}
  },250);
}
function hasCartDiscount(line){return Number(line.discountPercent)>0||Number(line.discountAmount)>0;}
function cartDiscountType(line){return line.discountType||(Number(line.discountAmount)>0?'amount':'percent');}
function cartDiscountRequest(line){return cartDiscountType(line)==='amount'?(Number(line.discountAmount)>0?{discountAmount:Number(line.discountAmount)}:{}):(Number(line.discountPercent)>0?{discountPercent:Number(line.discountPercent)}:{});}
function cartNetPrice(line){if(Number(line.discountAmount)>0)return Math.min(Number(line.unitPrice),Math.round((Number(line.unitPrice)-Number(line.discountAmount)+Number.EPSILON)*100)/100);return Number(line.discountPercent)>0?Math.min(Number(line.unitPrice),Math.round((Number(line.unitPrice)*(1-Number(line.discountPercent)/100)+Number.EPSILON)*100)/100):Number(line.unitPrice);}
function renderCart(){
  if(typeof syncSalesMoreActions==='function')syncSalesMoreActions();
  if($('printDraftBill'))$('printDraftBill').disabled=!state.cart.length;
  if(!state.cart.length&&typeof resetSalesRep==='function')resetSalesRep();
  if(typeof offlineSaveDraft==='function')offlineSaveDraft();
  $("salesHoldActions").hidden=!state.holdSalesEnabled||!state.checkoutEnabled;
  $("salesHoldBtn").disabled=state.cart.length===0;
  if($("saleCustomerName")){$("saleCustomerName").textContent=state.saleCustomer?.name||SoftPOSLanguage.t("Cash Customer");$("clearSaleCustomer").hidden=!state.saleCustomer;}
  $("cartEmpty").hidden=state.cart.length>0; $("cartItems").hidden=state.cart.length===0;
  $("cartHeading").textContent=state.editingTable?`Table ${state.editingTable.tableName}`:"Sale Cart";
  $("cartItems").innerHTML='<div class="cart-grid-heading" aria-hidden="true"><span data-i18n>Item</span><span data-i18n>Qty</span><span data-i18n>Unit price</span><span data-i18n>Total</span><span></span></div>'+state.cart.map((line,index)=>`<div class="cart-grid-row"><div class="cart-grid-product"><strong title="${esc(line.productName)}">${esc(line.productName)}</strong>${line.stockItem===false&&state.serviceDescriptionsEnabled?`<button type="button" class="cart-grid-description" data-description="${index}" title="${esc(line.serviceDescription||'Add service description')}">${line.serviceDescription?'Edit details':'Details'}</button>`:''}</div><button type="button" class="cart-grid-qty" data-action="edit-qty" data-index="${index}" aria-label="Edit quantity for ${esc(line.productName)}">${Number(line.quantity)}</button>${cartPriceControl(line,index)}<strong class="cart-grid-total">${money(cartNetPrice(line)*Number(line.quantity))}</strong><div class="cart-grid-actions">${(state.discountsEnabled&&state.permissions?.Discounts)||hasCartDiscount(line)?`<button type="button" class="cart-discount-btn ${hasCartDiscount(line)?'has-discount':''}" data-edit-discount="${index}" aria-label="Edit discount for ${esc(line.productName)}" title="${hasCartDiscount(line)?esc(Number(line.discountAmount)>0?money(line.discountAmount)+' off per item':Number(line.discountPercent)+'% off'):'Item discount'}">${cartActionIcon('discount')}</button>`:''}<button type="button" class="cart-grid-remove" data-action="remove" data-index="${index}" aria-label="Remove ${esc(line.productName)}" title="Remove item">${cartActionIcon("remove")}</button></div></div><div class="cart-line cart-mobile-line ${line.imageUrl?'has-cart-photo':''}"><div class="cart-line-content">${catalogCartThumb(line)}<div><h3>${esc(line.productName)}</h3><p class="cart-unit-price">${cartPriceControl(line,index,true)} each ${(state.discountsEnabled&&state.permissions?.Discounts)||hasCartDiscount(line)?`<button type="button" class="cart-discount-btn ${hasCartDiscount(line)?'has-discount':''}" data-edit-discount="${index}">${hasCartDiscount(line)?(Number(line.discountAmount)>0?esc(money(line.discountAmount))+' off':Number(line.discountPercent)+'% off'):'Discount'}</button>`:''}</p>${line.stockItem===false&&state.serviceDescriptionsEnabled?`<div class="service-description"><button type="button" class="secondary" data-description="${index}">${line.serviceDescription?'Edit description':'Add description'}</button>${line.serviceDescription?`<p class="service-description-preview">${esc(line.serviceDescription)}</p>`:''}</div>`:''}<div class="qty-control"><button data-action="minus" data-index="${index}">−</button><input data-action="qty" data-index="${index}" type="number" min="0.0001" step="0.0001" value="${Number(line.quantity)}"><button data-action="plus" data-index="${index}">+</button><button class="remove" data-action="remove" data-index="${index}" aria-label="Remove ${esc(line.productName)}" title="Remove item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/></svg></button></div></div></div><div class="line-total">${money(cartNetPrice(line)*Number(line.quantity))}</div></div>`).join("");
  $('cartItems').querySelectorAll('.cart-thumb img').forEach(img=>img.addEventListener('error',()=>{img.closest('.cart-line')?.classList.remove('has-cart-photo');img.parentElement.remove();}));
  $("cartItems").querySelectorAll("[data-action]").forEach(control=>{
    const index=Number(control.dataset.index),action=control.dataset.action;
    if(action==="edit-qty") control.addEventListener("click",()=>openCartQuantity(state.cart[index]));
    else if(action==="qty") control.addEventListener("change",()=>{const q=Number(control.value);if(Number.isFinite(q))changeCartQuantity(state.cart[index],q);else renderCart();});
    else control.addEventListener("click",()=>{const line=state.cart[index];if(line)changeCartQuantity(line,action==='remove'?0:Math.max(0,Number(line.quantity)+(action==='plus'?1:-1)));});
  });
  $("cartItems").querySelectorAll("[data-description]").forEach(button=>button.addEventListener("click",()=>openServiceDescription(state.cart[Number(button.dataset.description)])));
  $("cartItems").querySelectorAll('[data-edit-discount]').forEach(button=>button.addEventListener('click',()=>openCartDiscount(state.cart[Number(button.dataset.editDiscount)])));
  $('cartItems').querySelectorAll('[data-edit-price]').forEach(button=>button.addEventListener('click',()=>openCartPrice(state.cart[Number(button.dataset.editPrice)])));
  const cartGross=state.cart.reduce((sum,x)=>sum+Number(x.unitPrice)*Number(x.quantity),0);
  const cartNet=state.cart.reduce((sum,x)=>sum+cartNetPrice(x)*Number(x.quantity),0);
  $("cartSubtotal").textContent=cartAmount(cartGross);
  $("cartDiscount").textContent=cartAmount(Math.max(0,cartGross-cartNet));
  $("cartTotal").textContent=cartAmount(cartNet);
  updateCartVat();
  $("holdBtn").disabled=state.cart.length===0; $("quoteBtn").disabled=state.cart.length===0;
  $("payBtn").disabled=!state.checkoutEnabled||state.cart.length===0;
  if(typeof syncNextItemPrice==='function')syncNextItemPrice();
  if(typeof syncMobileUI==="function")syncMobileUI();
}
$("productSearch").addEventListener("keydown",e=>{if(e.key==="Enter")loadProducts();});
$('productSearch').addEventListener('input',()=>{
  clearTimeout(searchTimer); ++productRequest;
  state.products=[]; $('productList').innerHTML=''; $('productEmpty').hidden=true;
  $('productCount').textContent='Searching…';
  searchTimer=setTimeout(loadProducts,350);
});
$('clearSearch').addEventListener('click',()=>{$('productSearch').value='';state.categoryId=null;renderCategories();loadProducts();$('productSearch').focus();});
for(const mode of ['grid','list']) $(mode+'View').addEventListener('click',()=>{
  $('productList').classList.toggle('list-mode',mode==='list');
  $('gridView').setAttribute('aria-pressed',String(mode==='grid'));
  $('listView').setAttribute('aria-pressed',String(mode==='list'));
});
function clearCurrentCart(){state.quotationId=null;state.heldSaleId=null;state.cart=[];state.saleCustomer=null;state.saleNote='';state.serviceCustomerDetail=null;state.serviceReference='';state.servicePoNumber='';state.serviceTerms=null;state.editingTable=null;renderCart();}
$('clearCart').addEventListener('click',()=>{if(!state.cart.length){clearCurrentCart();return;}$('clearCartMessage').textContent='Remove all '+state.cart.length+' item line'+(state.cart.length===1?'':'s')+' from this sale?';$('clearCartDialog').showModal();$('cancelClearCart').focus();});
$('cancelClearCart').addEventListener('click',()=>$('clearCartDialog').close());
$('confirmClearCart').addEventListener('click',async()=>{
 const button=$('confirmClearCart');if(button.disabled)return;button.disabled=true;
 try{const heldSaleId=state.heldSaleId,authorization=await authorizeSalesAction('CancelSales',heldSaleId?{heldSaleId}:{});
 if(heldSaleId)await api('/api/sales-holds/'+heldSaleId+'/remove?shopId='+currentShop()+(authorization?'&authorization='+authorization:''),{method:'POST'});
 clearCurrentCart();$('clearCartDialog').close();}catch(error){toast(error.message,true);}finally{button.disabled=false;}
});

function renderTables(){
  $("tableList").innerHTML=(state.bootstrap.tables||[]).map(t=>`<button type="button" class="table-choice ${t.occupied?'occupied':''}" data-table="${t.tableId}"><strong>${esc(t.tableName)}</strong><br><small>${t.occupied?'Held order':'Available'}</small></button>`).join("");
  $("tableList").querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
    state.selectedTable=state.bootstrap.tables.find(t=>t.tableId===Number(button.dataset.table));
    $("tableList").querySelectorAll("button").forEach(x=>x.classList.toggle("selected",x===button));
    $("holdModeText").hidden=!state.selectedTable.occupied;
    $("holdModeText").textContent=state.selectedTable.occupied?"This table already has a held order. Saving will replace it with the current order.":"";
  }));
}
$("holdBtn").addEventListener("click",()=>{
  state.selectedTable=state.editingTable||null; renderTables();
  if(state.selectedTable){ const b=$("tableList").querySelector(`[data-table="${state.selectedTable.tableId}"]`); if(b)b.click(); }
  $("holdDialog").showModal();
});
$("confirmHold").addEventListener("click",async()=>{
  if(!state.selectedTable){toast("Please select a table.",true);return;} busy(true);
  try{
    const result=await api("/api/holds",{method:"POST",body:JSON.stringify({shopId:currentShop(),tableId:state.selectedTable.tableId,append:false,items:cartRequestItems()})});
    $("holdDialog").close(); toast(`Order ${result.number} held successfully.`); state.quotationId=null;state.heldSaleId=null;state.cart=[];state.saleCustomer=null;state.saleNote='';state.serviceCustomerDetail=null;state.serviceReference='';state.servicePoNumber='';state.serviceTerms=null;state.editingTable=null;renderCart(); await loadBootstrap();
  }catch(error){toast(error.message,true);}finally{busy(false);}
});

async function loadCustomers(){
  try{
    const customers=await api(`/api/customers?search=${encodeURIComponent($("customerSearch").value.trim())}`);
    $("customerResults").innerHTML=customers.map(c=>`<button type="button" class="customer-row" data-customer="${c.customerId}"><span><strong>${esc(c.name)}</strong><small>${esc(c.customerNo)} · ${esc(c.phone||c.email||c.tin||"")}</small></span><span>Choose</span></button>`).join("")||`<div class="empty compact">No customers found.</div>`;
    $("customerResults").querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
      state.selectedCustomer=customers.find(c=>c.customerId===Number(button.dataset.customer));
      $("selectedCustomer").innerHTML=`Selected: <strong>${esc(state.selectedCustomer.name)}</strong> (${esc(state.selectedCustomer.customerNo)})`;
      $("selectedCustomer").hidden=false;
    }));
  }catch(error){toast(error.message,true);}
}
$("quoteBtn").addEventListener("click",async()=>{state.selectedCustomer=null;$("selectedCustomer").hidden=true;$("quoteReference").value=state.serviceReference||'';$("quoteDialog").showModal();await loadCustomers();});
$("customerSearchBtn").addEventListener("click",loadCustomers); $("customerSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();loadCustomers();}});
$("confirmQuote").addEventListener("click",async()=>{
  if(!state.selectedCustomer){toast("Please select a customer.",true);return;} busy(true);
  try{
    const result=await api("/api/quotations",{method:"POST",body:JSON.stringify({shopId:currentShop(),customerId:state.selectedCustomer.customerId,reference:$("quoteReference").value,note:$("quoteNote").value,items:cartRequestItems()})});
    $("quoteDialog").close(); toast(`Quotation ${result.number} saved successfully.`); state.quotationId=null;state.heldSaleId=null;state.cart=[];state.saleCustomer=null;state.saleNote='';state.serviceCustomerDetail=null;state.serviceReference='';state.servicePoNumber='';state.serviceTerms=null;state.editingTable=null;renderCart();
  }catch(error){toast(error.message,true);}finally{busy(false);}
});

async function loadHolds(){ busy(true); try{ const holds=await api("/api/holds"); $("holdCount").textContent=holds.length; $("holdsEmpty").hidden=holds.length>0; $("holdsList").innerHTML=holds.map(h=>`<article class="record-card"><header><div><p class="eyebrow">${esc(h.orderNo)}</p><h3>${esc(h.tableName)}</h3></div><strong>${money(h.total)}</strong></header><dl><div><dt>Items</dt><dd>${h.itemCount}</dd></div><div><dt>Order taker</dt><dd>${esc(h.salesPerson||"")}</dd></div><div><dt data-i18n>Date</dt><dd>${h.orderDate?new Date(h.orderDate).toLocaleDateString():""}</dd></div><div><dt>Time</dt><dd>${esc(h.orderTime||"")}</dd></div></dl><button class="secondary" data-open-table="${h.tableId}">Open order</button></article>`).join(""); $("holdsList").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>openHeldOrder(Number(b.dataset.openTable)))); }catch(error){toast(error.message,true);}finally{busy(false);} }
async function openHeldOrder(tableId){ busy(true); try{ const order=await api(`/api/holds/table/${tableId}`); state.cart=order.items.map(x=>({productId:x.productId,productCode:x.productCode,productName:x.productName,description:x.description,quantity:x.quantity,originalQuantity:x.quantity,unitPrice:x.unitPrice,vatAmount:Number(x.vatAmount),note:x.note||""})); state.editingTable={tableId:order.header.tableId,tableName:order.header.tableName}; renderCart(); activateTab("orderView"); }catch(error){toast(error.message,true);}finally{busy(false);} }
$("refreshHolds").addEventListener("click",loadHolds);

async function loadQuotes(){busy(true);try{const shop=currentShop(),quotes=await api('/api/quotations?shopId='+shop);if(shop!==currentShop())return;$('quotesEmpty').hidden=quotes.length>0;$('quotesBody').innerHTML=quotes.map(q=>`<tr><td><strong>${esc(q.quotationNo)}</strong></td><td>${esc(q.customerName)}</td><td>${q.quotationDate?new Date(q.quotationDate).toLocaleString():''}</td><td>${esc(q.createdBy)}</td><td>${money(q.total)}</td><td>${q.cancelled?'Cancelled':q.invoiceNo?'Converted · '+esc(q.invoiceNo):'Open'}</td><td><button type="button" data-print-quote="${q.quotationId}">Print</button> ${state.permissions?.Sales&&!q.cancelled&&!q.invoiceNo?'<button type="button" data-convert-quote="'+q.quotationId+'">Convert to sale</button>':''}</td></tr>`).join('');$('quotesBody').querySelectorAll('[data-print-quote]').forEach(b=>b.addEventListener('click',()=>printQuotation(Number(b.dataset.printQuote))));$('quotesBody').querySelectorAll('[data-convert-quote]').forEach(b=>b.addEventListener('click',()=>convertQuotation(Number(b.dataset.convertQuote))));}catch(e){toast(e.message,true);}finally{busy(false);}}
$("refreshQuotes").addEventListener("click",loadQuotes);

function activateTab(id){ if(typeof offlineMode!=="undefined"&&offlineMode&&id!=="orderView"){toast("This page needs an internet connection.",true);return;} document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===id&&(id!=="orderView"||t.id==="retailSalesTab"))); document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active-view",v.id===id)); $("productManagementBtn").classList.toggle("active",["productsView","stockView"].includes(id)); if(id==="holdsView")loadHolds(); if(id==="quotesView")loadQuotes(); if(typeof syncMobileUI==="function")syncMobileUI(); if((id==="dashboardView"||id==="salesReportsView")&&typeof loadSalesReporting==="function")loadSalesReporting(id); }
document.querySelectorAll(".tab[data-tab]").forEach(tab=>tab.addEventListener("click",()=>activateTab(tab.dataset.tab)));
document.addEventListener('DOMContentLoaded',()=>{renderCart();initialize();});

// Keep the same immutable request after an uncertain response, so retry cannot post twice.
let checkoutDraft=null, checkoutRequest=null, checkoutSending=false, paymentParts=[], checkoutBaseTotal=0, checkoutCardFeeRate=0;
$('payBtn').addEventListener('click',async()=>{
  if(!state.cart.length)return;
  if(sessionStorage.getItem(opsKey($('laybyCreateForm')))&&!sessionStorage.getItem(opsKey($('laybyCreateForm'))+'.editable')){toast('Recover the saved layby from More before starting a sale.',true);return;}
  if(typeof offlineMode!=='undefined'&&offlineMode&&sessionStorage.getItem(pendingCheckoutKey())){toast('An online payment is awaiting confirmation. Reconnect and recover it before starting an offline sale.',true);return;}
  if(state.serviceTerms==='ACCOUNT'&&(!state.saleCustomer||typeof offlineMode!=='undefined'&&offlineMode)){toast('Select an account customer and connect online before saving.',true);return;}
  if(state.editingTable){toast('Complete held-table orders in desktop SoftPOS during this test release.',true);return;}
  busy(true);
  try{
    checkoutDraft={requestId:crypto.randomUUID(),shopId:currentShop(),expectedTotal:0,items:cartRequestItems(),...(state.saleNote?{additionalNote:state.saleNote}:{}),...(state.serviceCustomerDetail&&state.serviceTerms!=='ACCOUNT'?{customerDetail:state.serviceCustomerDetail}:{}),...(state.serviceReference?{invoiceReference:state.serviceReference}:{}),...(state.servicePoNumber?{customerPoNumber:state.servicePoNumber}:{}),...(state.serviceTerms?{serviceTerms:state.serviceTerms}:{}),...(state.salesRepId?{salesRepId:state.salesRepId}:{}),customerId:state.saleCustomer?.customerId??null,...(state.heldSaleId?{heldSaleId:state.heldSaleId}:{}),...(state.quotationId?{quotationId:state.quotationId}:{}),payment:{method:'CASH',tendered:0,reference:''}};
    const preview=await api('/api/checkout/preview',{method:'POST',body:JSON.stringify(checkoutDraft)});
    if(typeof offlineMode!=='undefined'&&offlineMode)checkoutDraft.offline={createdUtc:new Date().toISOString(),vatAmount:preview.vatAmount,lines:preview.lines.map(line=>({productId:line.productId,quantity:line.quantity,price:line.price,vatAmount:line.vatAmount})),...(offlineSnapshot.componentRecipes?{componentRecipes:offlineSnapshot.componentRecipes.filter(r=>checkoutDraft.items.some(i=>i.productId===r.productId)).map(r=>({productId:r.productId,version:r.version}))}:{})};
    checkoutBaseTotal=Number(preview.total);checkoutCardFeeRate=Number(preview.creditCardFeePercent??state.creditCardFeePercent??0);checkoutDraft.expectedTotal=preview.total; checkoutRequest=null;paymentParts=[];
    $('paymentTotal').textContent=money(preview.total); $('paymentAmount').value=Number(preview.total).toFixed(2);
    $('paymentMethod').value=configuredPaymentMethods(state.enabledPaymentMethods)[0]||'';setPaymentKeypad(false);populatePaymentBanks(''); $('paymentReference').value=''; $('paymentError').textContent='';$('offlinePaymentConfirmed').checked=false;
    for(const id of ['paymentMethod','paymentAmount','paymentReference','paymentBank','cancelPayment'])$(id).disabled=false;paymentSummary();
    $('paymentAmount').value=paymentExactAmount().toFixed(2);paymentSummary();$('paymentDialog').showModal();
  }catch(error){toast(error.message,true);}finally{busy(false);}
});
function populatePaymentBanks(selected=$('paymentBank').value){
  const banks=state.paymentBanks||[];
  $('paymentBank').innerHTML='<option value="">'+(banks.length?'Select bank…':'No banks configured')+'</option>'+banks.map(bank=>'<option value="'+Number(bank.id)+'">'+esc(bank.name)+'</option>').join('');
  $('paymentBank').value=String(selected||'');
}
function paymentEntry(){
  const method=$('paymentMethod').value;
  const base=Number($('paymentAmount').value),fee=method==='CARD'?creditCardSurcharge(base,checkoutCardFeeRate):0;
  return {method,tendered:method==='CARD'?Math.round((base+fee)*100)/100:base,...(method==='CARD'?{baseAmount:base}:{}),reference:$('paymentReference').value.trim(),...(paymentNeedsBank(method)&&$('paymentBank').value?{bankId:Number($('paymentBank').value)}:{})};
}
function paymentBaseAmount(part){return Number(part.method==='CARD'?(part.baseAmount??part.tendered):part.tendered);}
function paymentBaseRemaining(){return Math.max(0,Math.round((checkoutBaseTotal-paymentParts.reduce((sum,p)=>sum+paymentBaseAmount(p),0))*100)/100);}
function paymentExactAmount(){
 if($('paymentMethod').value!=='CASH')return paymentBaseRemaining();
 const total=Math.round((checkoutBaseTotal+paymentParts.filter(p=>p.method==='CARD').reduce((sum,p)=>sum+Number(p.tendered)-paymentBaseAmount(p),0))*100)/100;
 const adjustment=cashRounding(total,[...paymentParts,{method:$('paymentMethod').value}]);
 return Math.max(0,Math.round((paymentBaseRemaining()+adjustment)*100)/100);
}
function validPaymentBank(part){return !paymentNeedsBank(part.method)||!!(part.bankId&&paymentBankName(part.bankId));}
function paymentSummary(){
  const account=(checkoutRequest||checkoutDraft)?.serviceTerms==='ACCOUNT';$('paymentForm').classList.toggle('account-checkout',account);$('paymentHeading').textContent=account?'Confirm Account invoice':'Complete payment';document.querySelector('#paymentDialog .payment-header .muted').textContent=account?'No payment is collected now. The balance will appear in Customer Payments.':'Select a method and confirm the amount.';
  if(account){for(const id of ['paymentMethod','paymentAmount','paymentReference','paymentBank'])$(id).disabled=true;$('paymentBank').required=false;$('paymentReference').required=false;$('offlinePaymentConfirmed').required=false;$('paymentTotal').textContent=money((checkoutRequest||checkoutDraft).expectedTotal);$('paymentChange').textContent='Outstanding balance: '+money((checkoutRequest||checkoutDraft).expectedTotal);$('confirmPayment').textContent='Save Account invoice';return;}

  const enabled=configuredPaymentMethods(state.enabledPaymentMethods);
  if(!enabled.includes($('paymentMethod').value))$('paymentMethod').value=enabled[0]||'';

  document.querySelectorAll('[data-payment]').forEach(button=>{button.hidden=!enabled.includes(button.dataset.payment);button.setAttribute('aria-pressed',String(button.dataset.payment===$('paymentMethod').value));button.disabled=$('paymentMethod').disabled;});
  for(const option of $('paymentMethod').options){option.hidden=!enabled.includes(option.value);option.disabled=option.hidden;}
  $('addPayment').hidden=enabled.length<2;
  const externalOffline=!!checkoutDraft?.offline&&!offlineMobilePayments()&&(paymentParts.some(part=>part.method!=='CASH')||($('paymentMethod').value!=='CASH'&&Number($('paymentAmount').value)>0));
  $('offlinePaymentConfirmation').hidden=!externalOffline;
  $('offlinePaymentConfirmed').required=externalOffline;
  const mobileExternal=!!checkoutDraft?.offline&&offlineMobilePayments()&&(paymentParts.some(part=>part.method!=='CASH')||($('paymentMethod').value!=='CASH'&&Number($('paymentAmount').value)>0));
  $('confirmPayment').textContent=mobileExternal?'Payment received · Complete sale':'Complete sale';
  $('confirmPayment').dataset.externalPaymentConfirmation=String(mobileExternal);
  const cash=$('paymentMethod').value==='CASH';
  populatePaymentBanks();const bankNeeded=paymentNeedsBank($('paymentMethod').value);$('paymentBankLabel').hidden=!bankNeeded;$('paymentBank').required=bankNeeded&&Number($('paymentAmount').value)>0&&!$('paymentMethod').disabled;
  $('paymentReferenceLabel').hidden=cash; $('paymentReference').required=false;
  const entry=paymentEntry(),quoteParts=checkoutRequest?(checkoutRequest.payment.parts||[checkoutRequest.payment]):[...paymentParts,...(entry.tendered>0?[entry]:[])];
  const surcharge=Math.round(quoteParts.filter(p=>p.method==='CARD').reduce((sum,p)=>sum+Number(p.tendered)-paymentBaseAmount(p),0)*100)/100;
  const due=checkoutRequest?.expectedTotal??Math.round((checkoutBaseTotal+surcharge)*100)/100;
  if(checkoutDraft&&!checkoutRequest)checkoutDraft.expectedTotal=due;
  const rounding=cashRounding(due,quoteParts.length?quoteParts:[{method:$('paymentMethod').value}]),payable=Math.round((due+rounding)*100)/100;
  $('paymentRoundingSummary').hidden=rounding===0;$('paymentRoundingValue').textContent=(rounding>0?'+':'')+money(rounding);$('paymentRoundedDue').textContent=money(payable);
  $('paymentTotal').textContent=money(payable);$('paymentAmountLabel').textContent=$('paymentMethod').value==='CARD'?'Card amount before surcharge':cash?'Cash received':paymentLabel($('paymentMethod').value)+' amount';
  $('paymentSurchargeSummary').hidden=surcharge<=0;$('paymentSaleBase').textContent=money(checkoutBaseTotal);$('paymentSurchargeValue').textContent=money(surcharge);$('paymentDueWithSurcharge').textContent=money(due);
  $('paymentSurchargeLabel').textContent='Credit card surcharge'+(!checkoutRequest?' ('+checkoutCardFeeRate+'%)':'');
  $('paymentCardCharge').hidden=$('paymentMethod').value!=='CARD'||entry.tendered<=0||checkoutCardFeeRate<=0;
  const pendingCard=checkoutRequest?.payment.method==='CARD'?checkoutRequest.payment:null;
  $('paymentCardCharge').textContent='Charge to card: '+money(pendingCard?.tendered??entry.tendered);
  const received=quoteParts.reduce((sum,p)=>sum+Number(p.tendered),0);
  const balance=Math.round((payable-received)*100)/100;
  const cashReceived=paymentParts.filter(p=>p.method==='CASH').reduce((sum,p)=>sum+p.tendered,0)+(cash?Number($('paymentAmount').value||0):0);
  $('paymentChange').dataset.status=balance>0?'remaining':balance<0&&!cashReceived?'overpaid':'ready';
  $('paymentChange').innerHTML=balance>0?`<span data-i18n>Remaining to pay</span><strong>${money(balance)}</strong>`:balance<0&&!cashReceived?`<span>Overpayment � enter the exact amount</span><strong>${money(-balance)}</strong>`:`<span data-i18n>Cash change</span><strong>${money(Math.max(0,-balance))}</strong>`;
  $('addPayment').disabled=$('paymentMethod').disabled;$('paymentKeypad').querySelectorAll('button').forEach(button=>button.disabled=$('paymentAmount').disabled);
  $('paymentParts').innerHTML=(paymentParts.length?'<h3 data-i18n class="payment-parts-heading">Added payments</h3>':'')+paymentParts.map((p,i)=>`<div class="split-payment-row"><strong>${esc(paymentLabel(p.method)+(p.bankId?' · '+(paymentBankName(p.bankId)||'Bank #'+p.bankId):''))}</strong><span>${money(p.tendered)}</span><button data-i18n type="button" data-remove-payment="${i}" ${$('paymentMethod').disabled?'disabled':''}>Remove</button></div>`).join('');
  $('paymentParts').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    if($('paymentMethod').disabled)return;
    const [removed]=paymentParts.splice(Number(b.dataset.removePayment),1);
    $('paymentMethod').value=paymentParts.length?removed.method:enabled[0]||'';
    $('paymentAmount').value=paymentExactAmount().toFixed(2);
    populatePaymentBanks(removed.bankId);$('paymentReference').value='';$('paymentError').textContent='';
    paymentSummary();$('paymentAmount').focus();
  }));
}
$('addPayment').addEventListener('click',()=>{
  const part=paymentEntry();
  if(!configuredPaymentMethods(state.enabledPaymentMethods).includes(part.method)){$('paymentError').textContent='Choose an enabled payment type.';return;}
  if(!validPaymentBank(part)){$('paymentError').textContent='Select a bank for '+paymentLabel(part.method)+'.';$('paymentBank').focus();return;}
  if(part.tendered<=0||!Number.isFinite(part.tendered)||Math.abs(Math.round(part.tendered*100)-part.tendered*100)>0.00001||Math.abs(Math.round(paymentBaseAmount(part)*100)-paymentBaseAmount(part)*100)>0.00001){ $('paymentError').textContent='Enter a positive payment amount.';return; }
  if(paymentParts.some(p=>p.method===part.method)){$('paymentError').textContent='This payment method is already added. Remove it to change its amount.';return;}
  if(part.method==='CARD'&&paymentBaseAmount(part)>paymentBaseRemaining()){$('paymentError').textContent='Credit card amount exceeds the remaining sale balance.';return;}
  paymentParts.push(part);$('paymentError').textContent='';$('paymentReference').value='';$('paymentBank').value='';
  $('paymentAmount').value=paymentExactAmount().toFixed(2);
  const next=configuredPaymentMethods(state.enabledPaymentMethods).find(m=>!paymentParts.some(p=>p.method===m));if(next)$('paymentMethod').value=next;
  $('paymentAmount').value=paymentExactAmount().toFixed(2);
  paymentSummary();
});
document.querySelectorAll('[data-payment]').forEach(button=>button.addEventListener('click',()=>{
  if($('paymentMethod').disabled||!configuredPaymentMethods(state.enabledPaymentMethods).includes(button.dataset.payment))return;
  if($('paymentMethod').value!==button.dataset.payment)$('paymentBank').value='';
  const wasExact=Math.abs(Number($('paymentAmount').value)-paymentExactAmount())<0.00001;
  $('paymentMethod').value=button.dataset.payment;
  if(wasExact)$('paymentAmount').value=paymentExactAmount().toFixed(2);
  paymentSummary();
}));
let replacePaymentAmount=false;
function setPaymentKeypad(open){$('paymentKeypad').hidden=!open;$('paymentAmount').setAttribute('aria-expanded',String(open));if(open)replacePaymentAmount=true;}
$('paymentAmount').addEventListener('click',()=>{if(!$('paymentAmount').disabled){setPaymentKeypad(true);$('paymentAmount').select();}});
$('paymentAmount').addEventListener('input',()=>replacePaymentAmount=false);
$('paymentAmount').addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('paymentKeypad').hidden){event.preventDefault();event.stopPropagation();setPaymentKeypad(false);}});
$('paymentKeypad').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
 if($('paymentAmount').disabled)return;
 const key=button.dataset.amountKey;if(key==='done'){setPaymentKeypad(false);return;}
 let value=$('paymentAmount').value;
 if(key==='exact')value=paymentExactAmount().toFixed(2);
 else if(key==='clear')value='';
 else if(key==='back')value=replacePaymentAmount?'':value.slice(0,-1);
 else {if(replacePaymentAmount)value='';if(key==='.'&&value.includes('.'))return;value+=key;if(value.startsWith('.'))value='0'+value;if(!/^\d{0,10}(\.\d{0,2})?$/.test(value))return;}
 replacePaymentAmount=false;$('paymentAmount').value=value;paymentSummary();
}));
$('paymentMethod').addEventListener('change',paymentSummary);$('paymentAmount').addEventListener('input',paymentSummary);
$('cancelPayment').addEventListener('click',()=>{if(!checkoutSending&&!checkoutRequest)$('paymentDialog').close();});
$('paymentDialog').addEventListener('cancel',event=>{if(checkoutSending||checkoutRequest)event.preventDefault();});
$('paymentForm').addEventListener('submit',async event=>{
  event.preventDefault();if(checkoutSending||!checkoutDraft)return;
  if(!checkoutRequest&&checkoutDraft.serviceTerms==='ACCOUNT')checkoutRequest={...checkoutDraft,payment:{method:'CASH',tendered:0,reference:''}};
  if(!checkoutRequest){
    const parts=[...paymentParts];
    if(Number($('paymentAmount').value)>0||(!parts.length&&$('paymentMethod').value==='CASH'&&checkoutBaseTotal+cashRounding(checkoutBaseTotal,[{method:'CASH'}])===0))parts.push(paymentEntry());
    if(!parts.length){$('paymentError').textContent='Add a payment first.';return;}
    if(parts.some(part=>!validPaymentBank(part))){$('paymentError').textContent='Select a valid bank for each bank payment.';return;}
    let quote;try{quote=creditCardQuote(checkoutBaseTotal,parts.length===1?parts[0]:{method:'SPLIT',parts},checkoutCardFeeRate);}catch(error){$('paymentError').textContent=error.message;return;}
    checkoutDraft.expectedTotal=quote.total;
    const enabled=configuredPaymentMethods(state.enabledPaymentMethods),total=quote.total;
    if(parts.some(part=>!enabled.includes(part.method)||!Number.isFinite(part.tendered)||(part.tendered<=0&&!(parts.length===1&&part.method==='CASH'&&part.tendered===0&&total+cashRounding(total,parts)===0))||Math.abs(Math.round(part.tendered*100)-part.tendered*100)>0.00001)||new Set(parts.map(p=>p.method)).size!==parts.length){$('paymentError').textContent='Use each enabled payment type once, with a positive amount and up to two decimal places.';return;}
    const external=Math.round(parts.filter(p=>p.method!=='CASH').reduce((sum,p)=>sum+p.tendered,0)*100),cashPart=parts.find(p=>p.method==='CASH'),due=Math.round((total+cashRounding(total,parts))*100);
    if(external>due||(!cashPart&&external!==due)||(cashPart&&(external>=Math.round(total*100)||Math.round(cashPart.tendered*100)<due-external))){$('paymentError').textContent='Payments must cover the total. Non-cash payments must match the balance; only cash can give change.';return;}

    checkoutRequest={...checkoutDraft,payment:parts.length===1?parts[0]:{method:'SPLIT',tendered:parts.reduce((s,p)=>s+p.tendered,0),reference:'',parts}};
    if(checkoutRequest.offline&&parts.some(part=>part.method!=='CASH'))checkoutRequest.offline={...checkoutRequest.offline,externalPaymentsConfirmed:$('offlinePaymentConfirmed').checked||(offlineMobilePayments()&&$('confirmPayment').dataset.externalPaymentConfirmation==='true')};
  }
  if(checkoutRequest.offline){
    checkoutSending=true;$('confirmPayment').disabled=true;
    try{
      await offlineQueueCheckout(checkoutRequest);
      state.cart=[];state.saleCustomer=null;state.saleNote='';state.serviceCustomerDetail=null;state.serviceReference='';state.servicePoNumber='';state.serviceTerms=null;renderCart();checkoutRequest=null;checkoutDraft=null;$('paymentDialog').close();
      if(!offlineMode)syncOfflineSales();loadProducts().catch(()=>{});
    }catch(error){$('paymentError').textContent=error.message;checkoutRequest=null;}
    finally{checkoutSending=false;$('confirmPayment').disabled=false;}
    return;
  }
  try{sessionStorage.setItem(pendingCheckoutKey(),JSON.stringify(checkoutRequest));}
  catch{ $('paymentError').textContent='Cannot preserve this payment for safe retry. Enable browser session storage before paying.';return; }
  checkoutSending=true;$('confirmPayment').disabled=true;$('paymentError').textContent='';
  for(const id of ['paymentMethod','paymentAmount','paymentReference','paymentBank','cancelPayment'])$(id).disabled=true;paymentSummary();
  try{
    const response=await fetch('/api/checkout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':state.csrf},body:JSON.stringify(checkoutRequest)});
    if(!response.ok){
      let message=`Request failed (${response.status}). Retry uses the same sale reference.`;
      try{message=(await response.json()).message||message;}catch{}
      if(response.status===400){sessionStorage.removeItem(pendingCheckoutKey());checkoutRequest=null;for(const id of ['paymentMethod','paymentAmount','paymentReference','paymentBank','cancelPayment'])$(id).disabled=false;paymentSummary();}
      throw new Error(message);
    }
    const result=await response.json();
    sessionStorage.removeItem(pendingCheckoutKey());
    state.receiptCompany=state.branchCompanyReceipt;showTestReceipt(checkoutRequest.requestId,result,checkoutRequest.shopId,new Date().toISOString());
    state.quotationId=null;state.heldSaleId=null;state.cart=[];state.saleCustomer=null;state.saleNote='';state.serviceCustomerDetail=null;state.serviceReference='';state.servicePoNumber='';state.serviceTerms=null;renderCart();checkoutRequest=null;checkoutDraft=null;$('paymentDialog').close();$('receiptDialog').showModal();
    await loadFiscalReceipt();
    loadProducts().catch(error=>toast('Sale saved; refresh products to update stock.',true));
  }catch(error){$('paymentError').textContent=error.message;}finally{checkoutSending=false;$('confirmPayment').disabled=false;}
});
$('closeReceipt').addEventListener('click',()=>$('receiptDialog').close());
async function createReceiptImage(receipt,sale){
  const width=680,pad=28,lineHeight=29,qrSize=480;
  const journal=(receipt.nonFiscal?receipt.body:receipt.journal||'').replace(/\r\n/g,'\n').trimEnd().split('\n');
  const headerLines=receipt.nonFiscal?(receipt.header||'').split('\n'):[];
  const headerHeight=headerLines.length?pad*2+headerLines.length*lineHeight:0;
  const footerIndex=journal.findIndex(line=>/END OF FISCAL INVOICE/i.test(line));
  const mainLines=footerIndex<0?journal:journal.slice(0,footerIndex);
  const footerLines=footerIndex<0?[]:journal.slice(footerIndex);
  let qr=null;
  if(/^data:image\/(gif|png|jpeg);base64,/.test(receipt.verificationQrCode||'')){
    qr=new Image();qr.src=receipt.verificationQrCode;await qr.decode();
  }
  const height=headerHeight+pad+(mainLines.length+footerLines.length)*lineHeight+(qr?qrSize+40:0)+(receipt.nonFiscal?0:48)+pad;
  if(height>16000)throw new Error('Receipt is too long to share as one image. Use Print instead.');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('This browser cannot create a receipt image.');
  ctx.fillStyle=receipt.nonFiscal?'#fff':'#f1f5f9';ctx.fillRect(0,0,width,height);
  ctx.textBaseline='top';ctx.fillStyle='#111';ctx.font='22px "Courier New", monospace';
  const textX=(width-40*ctx.measureText('0').width)/2;
  if(headerLines.length){
    ctx.fillStyle='#111';ctx.font='bold 22px "Courier New", monospace';
    let headerY=pad;
    for(const line of headerLines){ctx.fillText(line,textX,headerY,width-textX*2);headerY+=lineHeight;}
    ctx.fillStyle='#111';ctx.font='22px "Courier New", monospace';
  }
  let y=headerHeight+pad;
  for(const line of mainLines){ctx.fillText(line,textX,y,width-textX*2);y+=lineHeight;}
  if(qr){y+=20;ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,(width-qrSize)/2,y,qrSize,qrSize);y+=qrSize+20;}
  for(const line of footerLines){ctx.fillText(line,textX,y,width-textX*2);y+=lineHeight;}
  if(!receipt.nonFiscal){
    ctx.fillStyle='#991b1b';ctx.font='17px Arial, sans-serif';
    ctx.fillText('TRAINING RECEIPT - NOT VALID FOR TAX',textX,y+18);
  }
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('This browser could not save the receipt image.');
  const name=String(sale.invoiceNo||'receipt').replace(/[^a-zA-Z0-9_-]/g,'-');
  return new File([blob],`SoftPOS-${name}.png`,{type:'image/png'});
}
function downloadReceiptImage(file){
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');link.href=url;link.download=file.name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('shareReceipt').addEventListener('click',async()=>{
  const file=state.receiptFile;if(!file)return;
  if(typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]})){
    try{
      await navigator.share({files:[file],title:`SoftPOS test receipt ${state.receiptSale.invoiceNo}`});
      return;
    }catch(error){if(error.name==='AbortError')return;}
  }
  downloadReceiptImage(file);
  toast('Receipt image saved. Attach it in WhatsApp or Viber.');
});
$('saveReceipt').addEventListener('click',()=>{if(state.receiptFile)downloadReceiptImage(state.receiptFile);});
function emailComposeData(){
  const receipt=state.fiscalReceipt;
  return {
    subject:`SoftPOS test receipt ${state.receiptSale.invoiceNo}`,
    body:`${receipt.nonFiscal?'':'SANDBOX TEST RECEIPT\n\n'}${receipt.journal}${receipt.verificationUrl ? `\n\nVerify receipt:\n${receipt.verificationUrl}` : ''}`
  };
}
$('emailReceipt').addEventListener('click',()=>{
  if(!state.fiscalReceipt)return;
  const options=$('emailOptions');options.hidden=!options.hidden;
  $('emailApp').hidden=!(state.receiptFile&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[state.receiptFile]}));
  if(!options.hidden)options.scrollIntoView({block:'nearest'});
});
$('emailApp').addEventListener('click',async()=>{
  if(!state.receiptFile)return;
  try{
    await navigator.share({files:[state.receiptFile],title:`SoftPOS test receipt ${state.receiptSale.invoiceNo}`});
    $('emailOptions').hidden=true;
  }catch(error){if(error.name!=='AbortError')toast('This device could not open an email app. Save the image and attach it manually.',true);}
});
$('emailGmail').addEventListener('click',()=>{
  const {subject,body}=emailComposeData();
  window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,'_blank','noopener,noreferrer');
  $('emailOptions').hidden=true;
});
$('emailOutlook').addEventListener('click',()=>{
  const {subject,body}=emailComposeData();
  window.open(`https://outlook.office.com/mail/deeplink/compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,'_blank','noopener,noreferrer');
  $('emailOptions').hidden=true;
});
$('emailDefault').addEventListener('click',()=>{
  const {subject,body}=emailComposeData();
  window.location.href=`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  $('emailOptions').hidden=true;
});
$('printReceipt').addEventListener('click',async()=>{
  if(!state.fiscalReceipt)return;
  const button=$('printReceipt');button.disabled=true;
  try{
    const format=$('invoicePrintFormat').value;
    if(format==='A4'||format==='A5'){await printInvoicePage(format);return;}
    if(!$('fiscalQrBlock').hidden)await $('fiscalQr').decode();
    await printThermalReceipt($('fiscalPaper'));
  }catch(error){toast(error.message||'Could not prepare this invoice for printing. Reopen it and try again.',true);}
  finally{button.disabled=!state.fiscalReceipt;}
});
function showTestReceipt(id,result,shopId,createdUtc){
  state.receiptId=id;
  state.receiptShopId=shopId;
  state.receiptCreatedUtc=createdUtc;
  state.receiptCompany=result.companyReceipt||state.branchCompanyReceipt;
  state.receiptSale=result;state.fiscalReceipt=null;state.receiptFile=null;
  $('emailReceipt').disabled=true;$('printReceipt').disabled=true;
  $('shareReceipt').disabled=true;$('saveReceipt').disabled=true;$('shareHint').hidden=true;
  $('emailOptions').hidden=true;
  const payments=result.payment.parts||[result.payment];
  const paymentRows=payments.map(p=>`<span class="receipt-payment-line"><span>${esc(paymentLabel(p.method)+(p.bankName?' · '+p.bankName:''))}</span><strong>${money(Number(p.applied)+Number(p.rounding||0))}</strong></span>`).join('');
  $('receiptContent').innerHTML=`<p class="receipt-reference">Invoice No: <strong>${esc(result.invoiceNo)}</strong></p><dl class="receipt-payment-summary">${Number(result.surcharge)>0?`<div><dt data-i18n>Sale amount</dt><dd>${money(result.total-result.surcharge)}</dd></div><div><dt>Credit card surcharge (${Number(result.surchargeRate)}%)</dt><dd>${money(result.surcharge)}</dd></div>`:''}${result.payment.rounding?`<div><dt>Cash round-off</dt><dd>${money(result.payment.rounding)}</dd></div><div><dt data-i18n>Amount due</dt><dd>${money(result.total+result.payment.rounding)}</dd></div>`:''}<div class="receipt-total"><dt>Total Sale</dt><dd>${money(result.total)}</dd></div><div class="receipt-payment-types"><dt>${payments.length>1?'Payment methods':'Payment method'}</dt><dd>${paymentRows}</dd></div><div class="receipt-amount-paid"><dt>Amount Paid</dt><dd>${money(result.payment.tendered)}</dd></div><div class="receipt-change"><dt data-i18n>Change</dt><dd>${money(result.payment.change)}</dd></div></dl>`;
  if(result.serviceTerms==='ACCOUNT')$('receiptContent').insertAdjacentHTML('afterbegin','<h3>Account Sales · Unpaid invoice</h3>');if(result.serviceTerms==='COD')$('receiptContent').insertAdjacentHTML('afterbegin','<h3>Cash Sales</h3>');
  if(result.isLayby||result.serviceTerms==='ACCOUNT')$('receiptContent').querySelector('dl').insertAdjacentHTML('beforeend',`<div><dt>Total paid to account</dt><dd>${money(result.total-Number(result.balance||0))}</dd></div><div><dt>Balance remaining</dt><dd>${money(result.balance||0)}</dd></div>`);
  $('fiscalMessage').textContent='';$('fiscalJournal').textContent='';$('fiscalJournal').hidden=true;$('fiscalVerify').hidden=true;
  $('trainingReceiptHeader').textContent='';$('trainingReceiptHeader').hidden=true;
  $('fiscalQrBlock').hidden=true;$('fiscalQr').removeAttribute('src');
  $('fiscalPaper').hidden=true;$('fiscalPaper').classList.remove('non-fiscal');$('fiscalFooter').hidden=true;$('fiscalFooter').textContent='';
}
function formatTrainingReceipt(sale,shopId,createdUtc){
  const width=40;
  const center=value=>String(value||'').slice(0,width).padStart(Math.ceil((width+Math.min(String(value||'').length,width))/2));
  const amount=value=>Number(value||0).toFixed(2);
  const pair=(label,value)=>String(label).slice(0,width-String(value).length-1).padEnd(width-String(value).length)+value;
  const wrap=(value,size)=>{
    const paragraphs=String(value||'').replaceAll('\r','').split('\n');
    if(paragraphs.length>1)return paragraphs.flatMap(paragraph=>wrap(paragraph,size));
    const words=String(value||'').trim().split(/\s+/);
    const lines=[];let current='';
    for(const word of words){
      if((current+' '+word).trim().length>size&&current){lines.push(current);current='';}
      let rest=word;
      while(rest.length>size){
        if(current){lines.push(current);current='';}
        lines.push(rest.slice(0,size));
        rest=rest.slice(size);
      }
      if(rest)current=(current+' '+rest).trim();
    }
    if(current)lines.push(current);
    return lines.length?lines:[''];
  };
  const details=state.receiptCompany||state.branchCompanyReceipt||state.bootstrap?.companyReceipt||{};
  const company=details.name||state.bootstrap?.companyName||'SoftPOS';
  const shop=state.bootstrap?.shops?.find(x=>x.shopId===shopId)?.shopName||'';
  const date=new Date(createdUtc||Date.now()).toLocaleString('en-FJ',{dateStyle:'short',timeStyle:'short'});
  const header=[...wrap(company,width).map(center)];
  if(shop)header.push(center(shop));
  header.push(center(sale.isLayby?'LAYBY INVOICE':sale.serviceTerms==='ACCOUNT'?'ACCOUNT SALES':sale.serviceTerms==='COD'?'CASH SALES':'SALES RECEIPT'));
  const lines=[];
  if(details.tin)lines.push(...wrap(`TIN: ${details.tin}`,width));
  if(details.address)lines.push(...wrap(details.address,width));
  if(details.phone)lines.push(...wrap(`Phone: ${details.phone}`,width));
  if(!sale.customer)lines.push('Customer: Cash Customer');
  if(sale.salesRepName)lines.push(...wrap('Sales rep: '+sale.salesRepName,width));
  if(sale.customer){
    lines.push(...wrap('Customer: '+sale.customer.name,width));
    if(sale.customer.phone)lines.push(...wrap('Phone: '+sale.customer.phone,width));
    if(sale.customer.tin)lines.push(...wrap('Customer TIN: '+sale.customer.tin,width));
  }
  lines.push('-'.repeat(width),`Invoice: ${sale.invoiceNo}`,`Date: ${date}`,'-'.repeat(width),
    'Item            Qty    Price      Total');
  for(const item of sale.lines||[]){
    const description=item.serviceDescription||'';
    const name=description||item.name;
    const names=wrap(name,14);
    const qty=Number(item.quantity||0).toLocaleString('en-FJ',{maximumFractionDigits:4});
    lines.push(`${names[0].padEnd(14)} ${qty.padStart(5)} ${amount(item.price).padStart(8)} ${amount(item.total).padStart(10)}`);
    for(const extra of names.slice(1))lines.push(extra);

    if(Number(item.discountAmount)>0)lines.push(pair('  Discount',amount(item.discountAmount))); 
  }
  const vat=(sale.lines||[]).reduce((sum,item)=>{
    if(item.vatAmount!=null)return sum+Number(item.vatAmount);
    const rate=Number(item.vatRate||0);
    return sum+(rate>0?Math.round((Number(item.total)*rate/(100+rate)+Number.EPSILON)*100)/100:0);
  },0);
  lines.push('-'.repeat(width),pair('Subtotal (ex VAT)',amount(Number(sale.total)-vat)),
    pair('VAT included',amount(vat)),pair('TOTAL FJD',amount(sale.total)),
    '-'.repeat(width));
  if(sale.payment.rounding)lines.push(pair('Cash round-off',amount(sale.payment.rounding)),pair('Amount due',amount(sale.total+sale.payment.rounding)));
  for(const part of sale.payment.parts||[sale.payment])
    lines.push(pair(paymentLabel(part.method)+(part.bankName?' · '+part.bankName:''),amount(Number(part.applied)+Number(part.rounding||0))));
  lines.push(pair('Amount paid',amount(sale.payment.tendered)),pair('Change',amount(sale.payment.change)));
  if(sale.isLayby||sale.serviceTerms==='ACCOUNT')lines.push(pair('Total paid to account',amount(sale.total-sale.balance)),pair('Balance remaining',amount(sale.balance)));
  if(sale.customerDetail&&sale.customerDetail!==sale.customer?.name)lines.push('',...wrap('Customer detail: '+sale.customerDetail,width));
  if(sale.customerPoNumber)lines.push('',...wrap('PO No: '+sale.customerPoNumber,width));
  if(sale.invoiceReference)lines.push('',...wrap('Reference: '+sale.invoiceReference,width));
  if(sale.additionalNote)lines.push('',...wrap('Note: '+sale.additionalNote,width));
  return {header:header.join('\n'),body:lines.join('\n')};
}
async function showNonFiscalTestReceipt(){
  const sale=state.receiptSale;
  const formatted=formatTrainingReceipt(sale,state.receiptShopId,state.receiptCreatedUtc);
  const receipt={journal:`${formatted.header}\n${formatted.body}`,header:formatted.header,body:formatted.body,
    verificationUrl:'',verificationQrCode:'',nonFiscal:true};
  state.fiscalReceipt=receipt;
  $('trainingReceiptHeader').textContent=receipt.header;$('trainingReceiptHeader').hidden=false;
  $('fiscalJournal').textContent=receipt.body;
  $('fiscalJournal').hidden=false;$('fiscalPaper').hidden=false;
  $('fiscalPaper').classList.add('non-fiscal');
  $('fiscalMessage').textContent='';
  $('emailReceipt').disabled=false;$('printReceipt').disabled=false;
  try{
    state.receiptFile=await createReceiptImage(receipt,sale);
    $('shareReceipt').disabled=false;$('saveReceipt').disabled=false;$('shareHint').hidden=false;
  }catch(error){toast(error.message||'Could not prepare a shareable receipt image.',true);}
}
async function loadFiscalReceipt(){
  if(state.receiptSale?.serviceTerms==='ACCOUNT'){await showNonFiscalTestReceipt();return;}
  if(state.receiptSale?.isLayby){try{const signed=await api(`/api/checkout/${state.receiptId}/signed-receipt`);if(signed){await renderFiscalReceipt(signed);return;}}catch(error){$('fiscalMessage').textContent=error.message;return;}await showNonFiscalTestReceipt();return;}
  try{
    const signed=await api(`/api/checkout/${state.receiptId}/signed-receipt`);
    if(signed){await renderFiscalReceipt(signed);return;}
  }catch(error){$('fiscalMessage').textContent=error.message;return;}
  try { await refreshShopVms(state.receiptShopId); }
  catch(error){$('fiscalMessage').textContent=error.message;return;}
  if(state.vmsMode==='OFF'){await showNonFiscalTestReceipt();return;}
  if(!state.sandboxSigning){$('fiscalMessage').textContent='The selected shop certificate is unavailable. Ask the company administrator to check VMS settings.';return;}
  $('closeReceipt').disabled=true;$('fiscalMessage').textContent='Signing with VMS. Please wait…';
  try{
    const receipt=await api(`/api/checkout/${state.receiptId}/sandbox-receipt`,{method:'POST'});
    await renderFiscalReceipt(receipt);
  }catch(error){$('fiscalMessage').textContent=error.message+' Reopen this sale from Reprint Receipt to check it again. Do not create another sale.';}
  finally{$('closeReceipt').disabled=false;}
}
async function renderFiscalReceipt(receipt){
    $('fiscalMessage').textContent='';
    $('trainingReceiptHeader').hidden=true;
    const journalLines=(receipt.journal||'').replace(/\r\n/g,'\n').trimEnd().split('\n');
    const footerIndex=journalLines.findIndex(line=>/END OF FISCAL INVOICE/i.test(line));
    $('fiscalJournal').textContent=(footerIndex<0?journalLines:journalLines.slice(0,footerIndex)).join('\n');
    $('fiscalFooter').textContent=footerIndex<0?'':journalLines.slice(footerIndex).join('\n');
    $('fiscalFooter').hidden=footerIndex<0;
    $('fiscalJournal').hidden=false;$('fiscalPaper').hidden=false;
    if(/^data:image\/(gif|png|jpeg);base64,/.test(receipt.verificationQrCode||'')){
      $('fiscalQr').src=receipt.verificationQrCode;$('fiscalQrBlock').hidden=false;
    }
    const verification=new URL(receipt.verificationUrl||location.origin);
    if(receipt.verificationUrl&&verification.protocol==='https:'){$('fiscalVerify').href=verification.href;$('fiscalVerify').hidden=false;}
    state.fiscalReceipt=receipt;
    $('emailReceipt').disabled=false;$('printReceipt').disabled=false;
    try{
      state.receiptFile=await createReceiptImage(receipt,state.receiptSale);
      $('shareReceipt').disabled=false;$('saveReceipt').disabled=false;$('shareHint').hidden=false;
    }catch(error){toast(error.message||'Could not prepare a shareable receipt image.',true);}
}
let recentSalesSearchId=0;
async function loadRecentSales(){
  const searchId=++recentSalesSearchId;
  const date=$('recentSalesDate').value;
  const invoiceNo=$('recentSalesInvoice').value.trim();
  const params=new URLSearchParams();
  if(date){
    const start=new Date(`${date}T00:00:00`);
    const end=new Date(start);end.setDate(end.getDate()+1);
    params.set('startUtc',start.toISOString());params.set('endUtc',end.toISOString());
  }
  if(invoiceNo)params.set('invoiceNo',invoiceNo);
  $('recentSalesList').textContent='Loading receipts…';
  try{
    const rows=await api(`/api/checkout/recent${params.size?'?'+params:''}`);
    if(searchId!==recentSalesSearchId)return;
    $('recentSalesList').innerHTML=rows.map((row,index)=>`<div class="recent-sale-row"><button type="button" class="recent-sale-button" data-receipt="${index}"><strong>${esc(row.sale.invoiceNo)}</strong><span>${money(row.sale.total)}</span><small>${new Date(row.createdUtc).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}</small></button><button type="button" class="ghost copy-invoice-button" data-copy-invoice="${index}" aria-label="Copy invoice number ${esc(row.sale.invoiceNo)}">Copy</button></div>`).join('')||'<p>No receipts found.</p>';
    $('recentSalesList').querySelectorAll('[data-receipt]').forEach(button=>button.addEventListener('click',async()=>{const row=rows[Number(button.dataset.receipt)];showTestReceipt(row.requestId,row.sale,row.shopId,row.createdUtc);$('recentSalesDialog').close();$('receiptDialog').showModal();await loadFiscalReceipt();}));
    $('recentSalesList').querySelectorAll('[data-copy-invoice]').forEach(button=>button.addEventListener('click',async()=>{
      const number=rows[Number(button.dataset.copyInvoice)].sale.invoiceNo;
      try{await navigator.clipboard.writeText(number);button.textContent='Copied';setTimeout(()=>button.textContent='Copy',1500);}
      catch{toast('Could not copy automatically. Select and copy the invoice number.',true);}
    }));
  }catch(error){if(searchId===recentSalesSearchId)$('recentSalesList').textContent=error.message;}
}
$('recentSalesBtn').addEventListener('click',()=>{$('recentSalesDialog').showModal();loadRecentSales();});
$('recentSalesFilter').addEventListener('submit',event=>{event.preventDefault();loadRecentSales();});
$('clearRecentSalesFilter').addEventListener('click',()=>{$('recentSalesDate').value='';$('recentSalesInvoice').value='';loadRecentSales();});
$('closeRecentSales').addEventListener('click',()=>$('recentSalesDialog').close());
$('receiptDialog').addEventListener('cancel',event=>{if($('closeReceipt').disabled)event.preventDefault();});
function pendingCheckoutKey(){return `softpos.pending.${state.me.companyCode}.${state.me.userId}`;}
function restorePendingCheckout(){
  const saved=sessionStorage.getItem(pendingCheckoutKey());if(!saved)return;
  try{
    checkoutRequest=JSON.parse(saved);checkoutDraft=checkoutRequest;
    const recoveredParts=checkoutRequest.payment.parts||[checkoutRequest.payment];const recoveredFee=recoveredParts.filter(p=>p.method==='CARD').reduce((sum,p)=>sum+Number(p.tendered)-paymentBaseAmount(p),0);checkoutBaseTotal=Math.round((checkoutRequest.expectedTotal-recoveredFee)*100)/100;checkoutCardFeeRate=Number(state.creditCardFeePercent||0);
    $('paymentTotal').textContent=money(checkoutRequest.expectedTotal);$('paymentAmount').value=paymentBaseAmount(checkoutRequest.payment);
    paymentParts=checkoutRequest.payment.parts||[];
    $('paymentMethod').value=paymentParts.length?'CASH':checkoutRequest.payment.method;$('paymentReference').value=checkoutRequest.payment.reference||'';populatePaymentBanks(checkoutRequest.payment.bankId);
    if(paymentParts.length)$('paymentAmount').value='0';
    for(const id of ['paymentMethod','paymentAmount','paymentReference','paymentBank','cancelPayment'])$(id).disabled=true;paymentSummary();
    $('paymentError').textContent='An earlier payment needs confirmation. Submit again to recover the same sale; do not start a replacement sale.';
    paymentSummary();if(!$('paymentDialog').open)$('paymentDialog').showModal();
  }catch{toast('The saved payment could not be restored. Check Reprint Receipt before making another sale.',true);$('payBtn').disabled=true;}
}

let salesHoldPending=null,salesHoldBusy=false;
$('salesHoldBtn').addEventListener('click',async()=>{if(state.quotationId){toast('Complete or clear the quotation conversion before holding another sale.',true);return;}
  if(salesHoldBusy||!state.cart.length)return;
  if(checkoutSending||sessionStorage.getItem(pendingCheckoutKey())){toast('Finish or recover the pending payment first.',true);return;}
  salesHoldBusy=true;busy(true);
  try{
    const body={shopId:currentShop(),items:cartRequestItems(),...(state.saleNote?{additionalNote:state.saleNote}:{}),...(state.serviceCustomerDetail&&state.serviceTerms!=='ACCOUNT'?{customerDetail:state.serviceCustomerDetail}:{}),...(state.serviceReference?{invoiceReference:state.serviceReference}:{}),...(state.servicePoNumber?{customerPoNumber:state.servicePoNumber}:{}),...(state.serviceTerms?{serviceTerms:state.serviceTerms}:{}),salesRepId:state.salesRepId??null,customerId:state.saleCustomer?.customerId??null,previousHoldId:state.heldSaleId??null};
    const signature=JSON.stringify(body);
    if(salesHoldPending?.signature!==signature)salesHoldPending={signature,request:{requestId:crypto.randomUUID(),...body}};
    await api('/api/sales-holds',{method:'POST',body:JSON.stringify(salesHoldPending.request)});
    state.quotationId=null;state.heldSaleId=null;state.cart=[];state.saleCustomer=null;state.saleNote='';state.serviceCustomerDetail=null;state.serviceReference='';state.servicePoNumber='';state.serviceTerms=null;salesHoldPending=null;renderCart();toast('Sale held. Select Resume sale to continue.');
  }catch(error){toast(error.message,true);}finally{salesHoldBusy=false;busy(false);}
});
$('salesResumeBtn').addEventListener('click',async()=>{
  if(checkoutSending||sessionStorage.getItem(pendingCheckoutKey())){toast('Finish or recover the pending payment first.',true);return;}
  if(state.cart.length){toast('Hold or clear the current sale before resuming another.',true);return;}
  busy(true);try{
    const shop=currentShop(),rows=await api('/api/sales-holds?shopId='+shop);
    if(shop!==currentShop())return;
    $('salesResumeEmpty').hidden=rows.length>0;
    $('salesResumeList').innerHTML=rows.map((row,i)=>'<div class="held-sale-row"><button type="button" class="record-card" data-resume="'+i+'"><strong>'+esc(row.snapshot.customer?.Name||'Cash Customer')+'</strong><span> '+money(row.total)+' · '+row.snapshot.items.length+' items</span><small> '+esc(new Date(row.createdUtc).toLocaleString())+'</small></button><button data-i18n type="button" class="held-sale-remove" data-remove-hold="'+i+'">Remove</button></div>').join('');
    $('salesResumeList').querySelectorAll('[data-remove-hold]').forEach(button=>button.addEventListener('click',async()=>{
      if(shop!==currentShop())return;
      button.disabled=true;busy(true);
      try{
        busy(false);
        const heldSaleId=rows[Number(button.dataset.removeHold)].id,authorization=await authorizeSalesAction('CancelSales',{heldSaleId});
        busy(true);
        await api('/api/sales-holds/'+heldSaleId+'/remove?shopId='+shop+(authorization?'&authorization='+authorization:''),{method:'POST'});
        button.closest('.held-sale-row').remove();
        $('salesResumeEmpty').hidden=$('salesResumeList').children.length>0;
        toast('Held sale removed.');
      }catch(error){toast(error.message,true);button.disabled=false;}finally{busy(false);}
    }));
    $('salesResumeList').querySelectorAll('[data-resume]').forEach(button=>button.addEventListener('click',async()=>{
      busy(true);try{
        if(state.cart.length||shop!==currentShop())throw Error('Hold or clear the current sale first.');
        const latest=await api('/api/sales-holds?shopId='+shop+'&id='+rows[Number(button.dataset.resume)].id);
        if(!latest.length)throw Error('This held sale is no longer available.');
        if(state.cart.length||shop!==currentShop())throw Error('The current sale changed. Reopen Resume sale.');
        const row=latest[0],c=row.snapshot.customer;
        const canDiscount=state.discountsEnabled&&state.permissions?.Discounts;
        const discountsRemoved=!canDiscount&&row.snapshot.items.some(hasCartDiscount);
        const resumeItems=row.snapshot.items.map(x=>({...x,discountPercent:canDiscount?x.discountPercent:0,discountAmount:canDiscount?x.discountAmount:0}));
        busy(false);
        for(const line of resumeItems.filter(x=>x.unitPriceOverride!=null))line.priceApprovalId=await authorizeSalesAction('ChangePrice',{productId:line.productId,unitPrice:line.unitPriceOverride});
        busy(true);
        const preview=await api('/api/checkout/preview',{method:'POST',body:JSON.stringify({shopId:shop,items:resumeItems.map(x=>({productId:x.productId,quantity:x.quantity,note:x.note,unitPrice:x.unitPriceOverride,priceApprovalId:x.priceApprovalId,serviceDescription:x.serviceDescription,...cartDiscountRequest(x)})),customerId:c?.CustomerId??null})});
        if(state.cart.length||shop!==currentShop())throw Error('The current sale changed. Reopen Resume sale.');
        state.cart=resumeItems.map((x,i)=>({...x,unitPrice:preview.lines[i].originalPrice??preview.lines[i].price}));state.saleCustomer=c?{customerId:c.CustomerId,name:c.Name,phone:c.Phone,email:c.Email,tin:c.Tin}:null;state.heldSaleId=row.id;state.saleNote=row.snapshot.additionalNote||'';state.serviceCustomerDetail=row.snapshot.customerDetail??null;state.serviceReference=row.snapshot.invoiceReference||'';state.servicePoNumber=row.snapshot.customerPoNumber||'';state.serviceTerms=row.snapshot.serviceTerms||(c?'ACCOUNT':'COD');state.salesRepId=state.salesRepEnabled===false?null:row.snapshot.salesRepId??state.defaultSalesRepId??null;$('saleSalesRep').value=String(state.salesRepId??'');
        renderCart();$('salesResumeDialog').close();toast(discountsRemoved?'Sale resumed. Discounts removed because they are disabled for your account. Review the total.':'Sale resumed. Review items before checkout.');
      }catch(error){toast(error.message,true);}finally{busy(false);}
    }));
    $('salesResumeDialog').showModal();
  }catch(error){toast(error.message,true);}finally{busy(false);}
});

let serviceDescriptionLine=null;
function updateServiceDescriptionCount(){ $('serviceDescriptionCount').textContent=$('serviceDescriptionText').value.length+' / 1,500 characters'; }
function openServiceDescription(line){
  if(!line||line.stockItem!==false||!state.serviceDescriptionsEnabled)return;
  serviceDescriptionLine=line;
  $('serviceDescriptionProduct').textContent=line.productName;
  $('serviceDescriptionText').value=line.serviceDescription||'';
  updateServiceDescriptionCount();$('serviceDescriptionDialog').showModal();$('serviceDescriptionText').focus();
}
$('serviceDescriptionText').addEventListener('input',updateServiceDescriptionCount);
for(const id of ['closeServiceDescription','cancelServiceDescription'])$(id).addEventListener('click',()=>$('serviceDescriptionDialog').close());
$('serviceDescriptionDialog').addEventListener('close',()=>{serviceDescriptionLine=null;});
$('serviceDescriptionForm').addEventListener('submit',event=>{
  event.preventDefault();
  if(!serviceDescriptionLine||!state.cart.includes(serviceDescriptionLine)||!state.serviceDescriptionsEnabled){$('serviceDescriptionDialog').close();return;}
  const value=$('serviceDescriptionText').value.replaceAll('\r','').trim();
  if(value.length>1500){toast('Description must not exceed 1,500 characters.',true);return;}
  serviceDescriptionLine.serviceDescription=value;renderCart();$('serviceDescriptionDialog').close();
});
$('serviceDescriptionText').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();$('serviceDescriptionForm').requestSubmit();}});

let discountEditorLine=null;
function discountEditorAllowed(){return !!(state.discountsEnabled&&state.permissions?.Discounts);}
function updateDiscountEditor(){
  const amount=$('discountEditorType').value==='amount';
  $('discountEditorValue').max=amount?String(discountEditorLine?.unitPrice||0):'100';
  $('discountEditorLabel').textContent=amount?'Amount per item (FJD)':'Percentage (%)';
}
function openCartDiscount(line){
  if(!line||(!discountEditorAllowed()&&!hasCartDiscount(line)))return;
  discountEditorLine=line;$('discountEditorProduct').textContent=line.productName+' · '+money(line.unitPrice)+' each';
  $('discountEditorType').value=cartDiscountType(line);
  $('discountEditorValue').value=Number(cartDiscountType(line)==='amount'?line.discountAmount:line.discountPercent)||0;
  for(const id of ['discountEditorType','discountEditorValue','applyCartDiscount'])$(id).disabled=!discountEditorAllowed();
  $('removeCartDiscount').hidden=!hasCartDiscount(line);updateDiscountEditor();$('cartDiscountDialog').showModal();
  if(discountEditorAllowed()){$('discountEditorValue').focus();$('discountEditorValue').select();}
}
$('discountEditorType').addEventListener('change',()=>{$('discountEditorValue').value='0';updateDiscountEditor();$('discountEditorValue').focus();});
for(const id of ['closeCartDiscount','cancelCartDiscount'])$(id).addEventListener('click',()=>$('cartDiscountDialog').close());
$('cartDiscountDialog').addEventListener('close',()=>{discountEditorLine=null;});
$('cartDiscountForm').addEventListener('submit',event=>{
  event.preventDefault();if(!discountEditorAllowed()||!state.cart.includes(discountEditorLine))return;
  const amount=$('discountEditorType').value==='amount',value=Number($('discountEditorValue').value);
  if(!Number.isFinite(value)||value<0||value>(amount?Number(discountEditorLine.unitPrice):100)||Math.abs(Math.round(value*100)-value*100)>0.0000001){toast(amount?'Discount cannot exceed the item price. Use up to two decimal places.':'Enter a discount from 0 to 100%, with up to two decimal places.',true);return;}
  discountEditorLine.discountType=amount?'amount':'percent';discountEditorLine.discountAmount=amount?value:0;discountEditorLine.discountPercent=amount?0:value;
  renderCart();$('cartDiscountDialog').close();
});
$('removeCartDiscount').addEventListener('click',()=>{
  if(state.cart.includes(discountEditorLine)){discountEditorLine.discountAmount=0;discountEditorLine.discountPercent=0;renderCart();}
  $('cartDiscountDialog').close();
});

// Account actions share their existing handlers with the mobile More menu.
const desktopAccountMenu=$('desktopAccountMenu');
document.addEventListener('click',event=>{if(!desktopAccountMenu.contains(event.target))desktopAccountMenu.open=false;});
desktopAccountMenu.querySelector('.account-menu-items').addEventListener('click',event=>{if(event.target.closest('button,a'))desktopAccountMenu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&desktopAccountMenu.open){desktopAccountMenu.open=false;desktopAccountMenu.querySelector('summary').focus();}});

// Keep the selected line by reference so a stale dialog cannot edit a different item.
let quantityEditorLine=null,quantityReplaceNext=false;
function openCartQuantity(line){
  if(!line||!state.cart.includes(line))return;
  quantityEditorLine=line;quantityReplaceNext=true;
  $('quantityEditorProduct').textContent=line.productName;
  $('quantityEditorValue').value=Number(line.quantity);
  $('quantityEditorValue').setAttribute('aria-valuenow',String(Number(line.quantity)));
  $('quantityEditorValue').setCustomValidity('');
  $('cartQuantityDialog').showModal();
  $('quantityEditorValue').focus();$('quantityEditorValue').select();
}
for(const id of ['closeCartQuantity','cancelCartQuantity'])$(id).addEventListener('click',()=>$('cartQuantityDialog').close());
$('cartQuantityDialog').addEventListener('close',()=>{quantityEditorLine=null;});
$('quantityEditorValue').addEventListener('input',()=>{quantityReplaceNext=false;const input=$('quantityEditorValue');input.setCustomValidity('');const quantity=Number(input.value);if(Number.isFinite(quantity)&&quantity>0)input.setAttribute('aria-valuenow',String(quantity));else input.removeAttribute('aria-valuenow');});
$('quantityEditorValue').addEventListener('pointerdown',()=>{quantityReplaceNext=false;});
function stepCartQuantity(direction){
  const input=$('quantityEditorValue'),current=Number(input.value);
  if(!Number.isFinite(current)||current<=0)input.value='1';
  else if(direction>0)input.value=String(Math.floor(current)+1);
  else if(current>1)input.value=String(Math.max(1,Math.ceil(current)-1));
  input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
}
$('increaseQuantity').addEventListener('click',()=>stepCartQuantity(1));
$('decreaseQuantity').addEventListener('click',()=>stepCartQuantity(-1));
$('quantityEditorValue').addEventListener('keydown',event=>{
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();stepCartQuantity(event.key==='ArrowUp'?1:-1);}
});
$('quantityKeypad').addEventListener('click',event=>{
  const button=event.target.closest('button[data-key]');if(!button)return;
  const input=$('quantityEditorValue'),key=button.dataset.key;
  if(key==='enter'){$('cartQuantityForm').requestSubmit();return;}
  let value=quantityReplaceNext?'':input.value;
  if(key==='clear')value='';
  else if(key==='back')value=value.slice(0,-1);
  else{
    const next=(value+(key==='.'&&!value?'0.':key)).replace(/^0+(?=\d)/,'');
    if(next.length<=12&&/^\d+(?:\.\d{0,4})?$/.test(next))value=next;
  }
  input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
});
$('cartQuantityForm').addEventListener('submit',event=>{
  event.preventDefault();
  const input=$('quantityEditorValue'),quantity=Number(input.value);
  if(!Number.isFinite(quantity)||quantity<=0){input.setCustomValidity('Enter a quantity greater than zero.');input.reportValidity();return;}
  if(!/^(?:\d+(?:\.\d{0,4})?|\.\d{1,4})$/.test(input.value.trim())){input.setCustomValidity('Use up to four decimal places.');input.reportValidity();return;}
  if(!input.reportValidity())return;
  if(quantityEditorLine&&state.cart.includes(quantityEditorLine)){quantityEditorLine.quantity=quantity;renderCart();}
  $('cartQuantityDialog').close();
});

function cartActionIcon(kind){
 const path=kind==='remove'?'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>':'<path d="M3 3h7l11 11-7 7L3 10V3Z"/><circle cx="7" cy="7" r="1"/><path d="m10 15 5-5"/>';
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
}
function canEditCartPrice(line){return !!((state.priceKeypadEnabled||line.stockItem===false&&state.permissions?.ServiceSales)&&state.permissions?.Sales&&salesActionAvailable('ChangePrice')&&(line.stockItem!==false||state.permissions?.ServiceSales));}
function cartPriceControl(line,index,mobile=false){return canEditCartPrice(line)?'<button type="button" class="cart-grid-price cart-edit-price'+(mobile?' mobile-edit-price':'')+'" data-edit-price="'+index+'" title="Edit unit price" aria-label="Edit unit price for '+esc(line.productName)+'">'+money(line.unitPrice)+'</button>':'<span class="cart-grid-price">'+money(line.unitPrice)+'</span>';}
function syncNextItemPrice(){
 const value=$('priceEntryAmount').value.trim(),valid=/^(?:\d+(\.\d{0,2})?|\.\d{1,2})$/.test(value)&&Number(value)>0&&Number(value)<=1000000;
 $('nextItemPrice').hidden=!state.priceKeypadEnabled||!value;$('nextItemPrice').classList.toggle('invalid-price',!valid);
 $('nextItemPriceText').textContent=valid?'Next item price: FJD '+Number(value).toLocaleString('en-FJ',{minimumFractionDigits:2,maximumFractionDigits:2}):'Enter a valid price before selecting a product';
}
$('priceEntryAmount').addEventListener('input',syncNextItemPrice);
$('clearNextItemPrice').addEventListener('click',()=>$('clearEntryPrice').click());
new MutationObserver(syncNextItemPrice).observe($('priceEntryPanel'),{attributes:true,attributeFilter:['hidden']});
let cartHighlightTimer;
function highlightCartAddition(line){
 clearTimeout(cartHighlightTimer);const index=state.cart.indexOf(line);document.querySelectorAll('#cartItems .cart-added').forEach(row=>row.classList.remove('cart-added'));if(index<0)return;
 for(const selector of ['.cart-grid-row','.cart-mobile-line'])$('cartItems').querySelectorAll(selector)[index]?.classList.add('cart-added');
 revealAddedCartRow(index);
 cartHighlightTimer=setTimeout(()=>document.querySelectorAll('#cartItems .cart-added').forEach(row=>row.classList.remove('cart-added')),1600);
}
function revealAddedCartRow(index){
 const container=$('cartItems');
 if(!container.getClientRects().length||container.clientHeight<=0||container.scrollHeight<=container.clientHeight)return;
 const row=[container.querySelectorAll('.cart-grid-row')[index],container.querySelectorAll('.cart-mobile-line')[index]].find(element=>element?.getClientRects().length);
 if(!row)return;
 const bounds=container.getBoundingClientRect(),item=row.getBoundingClientRect(),heading=container.querySelector('.cart-grid-heading');
 const headerHeight=heading?.getClientRects().length?heading.getBoundingClientRect().height:0;
 const visibleTop=bounds.top+headerHeight+4,visibleBottom=bounds.top+container.clientHeight-4;
 let target=container.scrollTop;
 if(item.top<visibleTop||item.height>visibleBottom-visibleTop)target+=item.top-visibleTop;
 else if(item.bottom>visibleBottom)target+=item.bottom-visibleBottom;
 container.scrollTop=Math.max(0,Math.min(target,container.scrollHeight-container.clientHeight));
}
let priceEditorLine=null,priceReplaceNext=false;
function openCartPrice(line){
 if(!line||!state.cart.includes(line)||!canEditCartPrice(line))return;
 priceEditorLine=line;priceReplaceNext=true;$('cartPriceProduct').textContent=line.productName;$('cartPriceValue').value=Number(line.unitPrice);$('cartPriceError').textContent='';
 $('cartPriceDialog').showModal();$('cartPriceValue').focus();$('cartPriceValue').select();
}
for(const id of ['closeCartPrice','cancelCartPrice'])$(id).addEventListener('click',()=>$('cartPriceDialog').close());
$('cartPriceDialog').addEventListener('close',()=>{priceEditorLine=null;});
$('cartPriceValue').addEventListener('input',()=>{priceReplaceNext=false;$('cartPriceError').textContent='';});
$('cartPriceValue').addEventListener('pointerdown',()=>{priceReplaceNext=false;});
$('cartPriceKeypad').addEventListener('click',event=>{
 const button=event.target.closest('[data-key]');if(!button)return;const input=$('cartPriceValue'),key=button.dataset.key;if(key==='enter'){$('cartPriceForm').requestSubmit();return;}
 let value=priceReplaceNext?'':input.value;if(key==='clear')value='';else if(key==='back')value=value.slice(0,-1);else{const next=(value+(key==='.'&&!value?'0.':key)).replace(/^0+(?=\d)/,'');if(next.length<=10&&/^\d+(?:\.\d{0,2})?$/.test(next))value=next;}
 input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
});
$('cartPriceForm').addEventListener('submit',async event=>{
 event.preventDefault();const line=priceEditorLine,value=$('cartPriceValue').value.trim(),price=Number(value);
 if(!line||!state.cart.includes(line)||!canEditCartPrice(line)){$('cartPriceError').textContent='Price editing is no longer allowed for this item.';return;}
 if(!/^(?:\d+(\.\d{0,2})?|\.\d{1,2})$/.test(value)||!Number.isFinite(price)||price<=0||price>1000000){$('cartPriceError').textContent='Enter a price greater than zero, up to FJD 1,000,000, with up to two decimal places.';return;}
 if(Number(line.discountAmount)>price){$('cartPriceError').textContent='Reduce or remove the item discount before lowering the price below it.';return;}
 try{const approval=await authorizeSalesAction('ChangePrice',{productId:line.productId,unitPrice:price});if(!state.cart.includes(line))return;line.unitPrice=price;line.unitPriceOverride=price;line.priceApprovalId=approval;renderCart();$('cartPriceDialog').close();}catch(error){$('cartPriceError').textContent=error.message;}
});
document.addEventListener('keydown',event=>{
 if(!['F2','F8'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||$('appScreen').hidden)return;
 if(document.querySelector('dialog[open]')||!$('busy').hidden)return;event.preventDefault();if(event.repeat)return;
 if(event.key==='F2'){if(!$('orderView').classList.contains('active-view'))activateTab('orderView');if(typeof setMobilePage==='function')setMobilePage('sale');$('productSearch').focus();$('productSearch').select();}
 else if($('orderView').classList.contains('active-view')&&!$('payBtn').disabled)$('payBtn').click();
});

const catalogDisplayMenu=$('catalogDisplayMenu');
document.addEventListener('click',event=>{if(!catalogDisplayMenu.contains(event.target))catalogDisplayMenu.open=false;});
catalogDisplayMenu.addEventListener('click',event=>{if(event.target.closest('button'))catalogDisplayMenu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&catalogDisplayMenu.open){catalogDisplayMenu.open=false;catalogDisplayMenu.querySelector('summary').focus();}});

// Refresh only the built-in customer label; actual customer names are never translated.
document.addEventListener('softpos:languagechange',()=>{if(!state.saleCustomer&&$('saleCustomerName'))$('saleCustomerName').textContent=SoftPOSLanguage.t('Cash Customer');});
