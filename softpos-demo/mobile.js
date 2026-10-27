// Mobile navigation reuses the existing cart, permission gates and payment flow.
const mobileViewport=window.matchMedia('(max-width: 600px)');
let mobilePage='sale';
const priceHome=document.createComment('Price entry position');
$('priceEntryPanel').before(priceHome);
const scanHome=document.createComment('Desktop scan button position');
$('scanBarcodeBtn').before(scanHome);
function setMobilePage(page){
  mobilePage=page;
  activateTab('orderView');
  syncMobileUI();
  window.scrollTo({top:0,behavior:'instant'});
}
function syncMobileUI(){
  const scanButton=$('scanBarcodeBtn'),mobileTools=$('mobilePriceBtn').parentElement;
  if(mobileViewport.matches){if(scanButton.parentElement!==mobileTools)mobileTools.insertBefore(scanButton,$('mobileDisplayBtn'));}
  else if(scanButton.parentElement!==scanHome.parentElement)scanHome.after(scanButton);
  if($('clearSearch').parentElement!==scanButton.parentElement||scanButton.nextElementSibling!==$('clearSearch'))scanButton.after($('clearSearch'));
  const desktopKeypad=!mobileViewport.matches&&!$('priceEntryPanel').hidden;
  $('priceEntryPanel').closest('.catalog')?.classList.toggle('price-keypad-active',desktopKeypad);
  if(!mobileViewport.matches)$('priceEntryPanel').querySelector('details').open=true;
  const signedIn=!$('appScreen').hidden;
  const saleActive=$('orderView').classList.contains('active-view');
  const phone=mobileViewport.matches&&signedIn;
  $('appScreen').dataset.mobilePage=mobilePage;
  document.body.classList.toggle('mobile-signed-in',phone);
  document.body.classList.toggle('mobile-sale-page',phone&&saleActive&&mobilePage==='sale');
  document.body.classList.toggle('mobile-cart-page',phone&&saleActive&&mobilePage==='cart');
  const cartCheckout=mobilePage==='cart';
  $('mobileViewCart').textContent=cartCheckout?'Checkout':'View Cart →';
  $('mobileViewCart').disabled=cartCheckout&&$('payBtn').disabled;
  $('mobileViewCart').title=cartCheckout?$('payBtn').title:'';
  $('mobileSaleBtn').setAttribute('aria-current',saleActive&&mobilePage==='sale'?'page':'false');
  $('mobileCartBtn').setAttribute('aria-current',saleActive&&mobilePage==='cart'?'page':'false');
  $('mobileMoreBtn').setAttribute('aria-current',!saleActive?'page':'false');
  const quantity=state.cart.reduce((sum,line)=>sum+Number(line.quantity),0);
  const count=Number(quantity.toFixed(4));
  $('mobileItemCount').textContent=`${count} ${count===1?'item':'items'}`;
  $('mobileCartCount').textContent=String(count);
  $('mobileCartCount').hidden=!count;
  $('mobileCartTotal').textContent=$('cartTotal').textContent;
  const vatText=$('cartVat').textContent;
  const vat=Number(vatText.replace(/[^\d.-]/g,''));
  const total=state.cart.reduce((sum,line)=>sum+cartNetPrice(line)*Number(line.quantity),0);
  $('mobileSubtotal').textContent=!/\d/.test(vatText)||!Number.isFinite(vat)?'—':cartAmount(Math.round((total-vat)*100)/100);
  $('mobileProfileBtn').textContent=$('userInitial').textContent||'U';
  $('mobilePriceBtn').hidden=$('priceEntryPanel').hidden;
  const entered=$('priceEntryAmount').value.trim();
  $('mobilePriceBtn').textContent=entered?`Price: ${money(Number(entered))}`:'▦ Enter price';
  $('mobileDisplayBtn').textContent=$('productList').classList.contains('list-mode')?'☷ List':'▦ Grid';
  if($('priceEntryPanel').hidden&&$('mobilePriceDialog').open)$('mobilePriceDialog').close();
  document.querySelectorAll('#productList .product-card').forEach(card=>{
    const qty=state.cart.filter(line=>line.productId===Number(card.dataset.product)).reduce((sum,line)=>sum+Number(line.quantity),0);
    let badge=card.querySelector('.mobile-product-count');
    if(!badge){badge=document.createElement('span');badge.className='mobile-product-count';card.querySelector('.product-card-top').append(badge);}
    const cartQuantity=String(Number(qty.toFixed(4)));
    badge.textContent=cartQuantity;badge.hidden=!qty;
    badge.title=cartQuantity+' in cart';badge.setAttribute('aria-label',cartQuantity+' in cart');
    card.dataset.baseLabel??=card.getAttribute('aria-label')||card.querySelector('strong').textContent;
    card.setAttribute('aria-label',card.dataset.baseLabel+(qty>0?', '+cartQuantity+' in cart':''));
    card.classList.toggle('mobile-selected',qty>0);
  });
}
function openMobileMore(){
  const list=$('mobileMenuItems');list.replaceChildren();
  $('mobileAccountName').textContent=[$('userName').textContent,$('userRole').textContent].filter(Boolean).join(' · ');
  const sources=[...document.querySelectorAll('.tabs>button'),$('salesMoreBtn'),$('installSoftposBtn'),$('changePasswordBtn'),...document.querySelectorAll('.top-actions .admin-link'),$('logoutBtn')];
  sources.forEach(source=>{
    if(source.hidden||source.closest('#productManagementDialog'))return;
    const item=document.createElement(source.tagName==='A'?'a':'button');
    item.textContent=source.id==='salesMoreBtn'?'More sales actions':SoftPOSLanguage.originalText(source).trim();item.setAttribute('data-i18n','');item.className='mobile-menu-item';
    if(source.tagName==='A')item.href=source.href;
    else {item.type='button';item.addEventListener('click',()=>{
      $('mobileMoreDialog').close();mobilePage='sale';source.click();syncMobileUI();window.scrollTo(0,0);
    });}
    list.append(item);
  });
  $('mobileMoreDialog').showModal();
}
function restoreMobilePrice(){
  priceHome.after($('priceEntryPanel'));
  $('priceEntryPanel').querySelector('details').open=false;
  syncMobileUI();
}
$('mobileSaleBtn').addEventListener('click',()=>setMobilePage('sale'));
$('mobileCartBtn').addEventListener('click',()=>setMobilePage('cart'));
$('mobileViewCart').addEventListener('click',()=>{
  if(mobilePage==='cart')$('payBtn').click();
  else setMobilePage('cart');
});
for(const id of ['mobileMoreBtn','mobileProfileBtn'])$(id).addEventListener('click',openMobileMore);
$('closeMobileMore').addEventListener('click',()=>$('mobileMoreDialog').close());
$('mobilePriceBtn').addEventListener('click',()=>{
  if($('priceEntryPanel').hidden)return;
  $('mobilePriceContent').append($('priceEntryPanel'));
  $('priceEntryPanel').querySelector('details').open=true;
  $('mobilePriceDialog').showModal();
});
$('closeMobilePrice').addEventListener('click',()=>$('mobilePriceDialog').close());
$('applyMobilePrice').addEventListener('click',()=>{
  const entered=$('priceEntryAmount').value.trim();
  if(entered&&(!/^(?:\d+(\.\d{0,2})?|\.\d{1,2})$/.test(entered)||Number(entered)<=0||Number(entered)>1000000)){
    toast('Enter a price greater than zero with up to two decimal places.',true);$('priceEntryAmount').focus();return;
  }
  $('mobilePriceDialog').close();
});
$('mobilePriceDialog').addEventListener('close',restoreMobilePrice);
$('mobileDisplayBtn').addEventListener('click',()=>{
  $($('productList').classList.contains('list-mode')?'gridView':'listView').click();syncMobileUI();
});
$('priceEntryAmount').addEventListener('input',syncMobileUI);
$('priceKeypad').addEventListener('click',()=>queueMicrotask(syncMobileUI));
$('clearEntryPrice').addEventListener('click',()=>queueMicrotask(syncMobileUI));
mobileViewport.addEventListener('change',()=>{
  if(!mobileViewport.matches){if($('mobilePriceDialog').open)$('mobilePriceDialog').close();if($('mobileMoreDialog').open)$('mobileMoreDialog').close();}
  syncMobileUI();
});
const mobileObserver=new MutationObserver(syncMobileUI);
mobileObserver.observe($('appScreen'),{attributes:true,attributeFilter:['hidden']});
mobileObserver.observe($('priceEntryPanel'),{attributes:true,attributeFilter:['hidden']});
mobileObserver.observe($('cartTotal'),{childList:true});
mobileObserver.observe($('cartVat'),{childList:true});
mobileObserver.observe($('payBtn'),{attributes:true,attributeFilter:['disabled','title']});
$('receiptDialog').addEventListener('close',()=>{if(!state.cart.length&&mobileViewport.matches)setMobilePage('sale');});
syncMobileUI();
