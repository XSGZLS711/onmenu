// Inventory mutations retain their request ID and payload until the server confirms
// success or a validation rollback, including across reloads and lost connections.
const opsState={lookups:null,shop:0,poLines:[],adjust:null,receive:[],report:null,editProduct:null};
const opsNumberKeys=new Set(['categoryId','departmentId','brandId','colourId','sizeId','supplierId','measurementId','price','cost','packUnit','adjustmentId','quantity']);
function opsValues(form){const values=Object.fromEntries(new FormData(form));for(const key of Object.keys(values))if(opsNumberKeys.has(key))values[key]=Number(values[key]);return values;}
function opsKey(form){return `softpos.operation.${state.me.companyCode}.${state.me.userId}.${currentShop()}.${form.id}${form.dataset.operationScope?'.'+form.dataset.operationScope:''}`;}
function opsMessage(form,message,error=false){const p=form.querySelector('.ops-result');p.textContent=message;p.classList.toggle('error',error);}
async function opsSubmit(form,url,create){
  let request;const key=opsKey(form),saved=sessionStorage.getItem(key);
  if(saved&&sessionStorage.getItem(key+'.editable')){request={...create(),requestId:JSON.parse(saved).requestId,shopId:currentShop()};sessionStorage.setItem(key,JSON.stringify(request));}
  else if(saved){request=JSON.parse(saved);if(!confirm('Retry the previously saved request for this form? Current edits will not be submitted.'))return;}
  else{request={...create(),requestId:crypto.randomUUID(),shopId:currentShop()};sessionStorage.setItem(key,JSON.stringify(request));}
  const controls=[...form.querySelectorAll('input,select,button')],disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);$('shopSelect').disabled=true;
  try{
    sessionStorage.removeItem(key+'.editable');
    await refreshCsrf();
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':state.csrf},credentials:'same-origin',body:JSON.stringify(request)});
    const result=await response.json();
    if(!response.ok){if(response.status===400){sessionStorage.setItem(key+'.editable','1');sessionStorage.setItem(key+'.error',result.message||'Operation rejected.');}else{sessionStorage.removeItem(key+'.editable');sessionStorage.removeItem(key+'.error');}throw new Error(result.message||'Operation failed.');}
    sessionStorage.removeItem(key);sessionStorage.removeItem(key+'.editable');sessionStorage.removeItem(key+'.error');opsMessage(form,[result.message||result.Message,result.number||result.Number].filter(Boolean).join(' '));toast(result.message||result.Message||'Report saved');return result;
  }catch(error){opsMessage(form,error.message+(sessionStorage.getItem(key+'.editable')?' Correct the entries and submit again using the same reference.':sessionStorage.getItem(key)?' Request saved. Submit again to recover it before entering another document.':''),true);}
  finally{controls.forEach((c,i)=>c.disabled=disabled[i]);$('shopSelect').disabled=false;if(form.id==='editProductForm'&&typeof syncComponentButton==='function')syncComponentButton();}
}
function showPendingOperations(){
  for(const id of ['newProductForm','editProductForm','poCreate','poReceive','directReceive','stockAdjust','refundForm','zCloseForm']){
    const form=$(id),saved=sessionStorage.getItem(opsKey(form));
    if(!saved)continue;
    if(id==="refundForm")form.hidden=false;
    if(sessionStorage.getItem(opsKey(form)+'.editable')){opsMessage(form,(sessionStorage.getItem(opsKey(form)+'.error')||'A request was rejected.')+' Correct or re-enter the fields and submit using the same reference.',true);continue;}
    const result=form.querySelector('.ops-result');result.textContent='A saved request needs confirmation before you enter another document. ';
    const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='Recover saved request';retry.addEventListener('click',()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));result.append(retry);
  }
}
function resetOperations(){
  SoftPOSProductPicker.close();
  closeManageProductSearch();
  if(typeof resetComponentEditor==='function')resetComponentEditor();
  if(typeof resetExtraModules==="function")resetExtraModules();
  opsState.lookups=null;opsState.shop=0;opsState.poLines=[];opsState.adjust=null;opsState.receive=[];opsState.report=null;opsState.editProduct=null;
  for(const id of ['newProductForm','editProductForm','poCreate','poReceive','directReceive','stockAdjust','refundForm','zCloseForm'])$(id).reset();
  $('editProductForm').hidden=true;$('manageProductList').replaceChildren();
  document.querySelectorAll('.ops-result,.ops-search-results').forEach(x=>x.textContent='');
  for(const id of ['poLines','receiveLines','opsReport','zHistory'])$(id).innerHTML='';renderPoLines();
  $('printOpsReport').hidden=true;$('adjustProduct').textContent='Select a product.';
}
async function loadOpsLookups(){
  if(typeof syncProductGroupButtons==='function')syncProductGroupButtons();
  showPendingOperations();
  if(opsState.shop!==currentShop()){opsState.lookups=null;opsState.shop=currentShop();opsState.poLines=[];opsState.adjust=null;opsState.receive=[];opsState.editProduct=null;$('editProductForm').hidden=true;renderPoLines();$('adjustProduct').textContent='Select a product.';$('receiveLines').innerHTML='';}
  if(!opsState.lookups)opsState.lookups=await api(`/api/inventory/operations-lookups?shopId=${currentShop()}`);
  document.querySelectorAll('[data-lookup]').forEach(select=>{const prior=select.value,priorLabel=select.selectedOptions[0]?.textContent;let rows=opsState.lookups[select.dataset.lookup]||[];if(select.dataset.lookup==='adjustments')rows=rows.filter(x=>!/overwrite|stock take/i.test(x.name));select.innerHTML='<option value="">Select…</option>'+rows.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');if(rows.some(x=>String(x.id)===prior))select.value=prior;else if(select.name==='supplierId'&&select.form?.id==='editProductForm'&&prior&&Number(prior)===opsState.editProduct?.fields.supplierId){select.add(new Option(priorLabel||'Supplier #'+prior,prior));select.value=prior;}});
  restorePendingProductEdit();if(typeof refreshSupplierPickers==='function')refreshSupplierPickers();
}
function productFields(form){const value=form.elements;return{code:value.code.value.trim(),name:value.name.value.trim(),departmentId:Number(value.departmentId.value),categoryId:Number(value.categoryId.value),price:Number(value.price.value),cost:Number(value.cost.value),measurementId:Number(value.measurementId.value),vat:value.vat.checked,stockItem:value.stockItem.checked,supplierId:Number(value.supplierId.value),active:value.active.checked,weightItem:value.weightItem.checked};}
function fillProductForm(form,fields){for(const key of ['code','name','departmentId','categoryId','price','cost','measurementId'])form.elements[key].value=String(fields[key]);const supplier=form.elements.supplierId;if(fields.supplierId!=null&&!Array.from(supplier.options).some(o=>o.value===String(fields.supplierId))){supplier.add(new Option(opsState.editProduct?.supplierName||'Supplier #'+fields.supplierId,fields.supplierId));}supplier.value=fields.supplierId==null?'':String(fields.supplierId);form.elements.active.checked=fields.active!==false;form.elements.weightItem.checked=fields.weightItem===true;form.elements.vat.checked=fields.vat===true;form.elements.stockItem.checked=fields.stockItem===true;if(typeof syncComponentButton==='function')syncComponentButton();}
function restorePendingProductEdit(){
  const form=$('editProductForm'),saved=sessionStorage.getItem(opsKey(form));if(!saved||opsState.editProduct)return;
  try{const request=JSON.parse(saved);opsState.editProduct={productId:request.productId,fields:request.expected};fillProductForm(form,request.product);$('editProductStock').textContent=`Product ${request.productId} · saved change awaiting confirmation`;form.hidden=false;}catch{opsMessage(form,'Saved product change could not be opened. Contact an administrator.',true);}
}
let manageRequest=0;
function manageProductFilters(){
 const params=new URLSearchParams({shopId:currentShop(),search:$('manageProductSearch').value.trim(),stockType:$('manageProductType').value,stockLevel:$('manageProductStockLevel').value,activeStatus:$('manageProductActiveStatus').value});
 if($('manageProductCategory').value)params.set('categoryId',$('manageProductCategory').value);
 if($('manageProductDepartment').value)params.set('departmentId',$('manageProductDepartment').value);
 return params;
}
function populateManageProductFilters(){
 for(const [id,key,caption] of [['manageProductCategory','categories','All Categories'],['manageProductDepartment','departments','All Departments']]){
  const select=$(id),prior=select.value,rows=opsState.lookups?.[key]||[];
  select.innerHTML='<option value="">'+caption+'</option>'+rows.map(r=>'<option value="'+Number(r.id)+'">'+esc(r.name)+'</option>').join('');
  if(rows.some(r=>String(r.id)===prior))select.value=prior;
 }
}
async function loadManageProducts(){
 if(!$('manageProductDialog').open)return;
 const sequence=++manageRequest,shop=currentShop(),list=$('manageProductList');
 list.innerHTML='<tr><td colspan="10">Loading products…</td></tr>';$('manageProductStatus').textContent='Loading products…';
 let rows;try{rows=await api('/api/operations/products?'+manageProductFilters());}
 catch(e){if(sequence===manageRequest&&$('manageProductDialog').open){list.innerHTML='<tr><td colspan="10">Unable to load products. Try Search again.</td></tr>';$('manageProductStatus').textContent=e.message;}throw e;}
 if(sequence!==manageRequest||shop!==currentShop()||!$('manageProductDialog').open)return;
 const lookup=(key,id)=>opsState.lookups?.[key]?.find(x=>Number(x.id)===Number(id))?.name||'—';
 $('manageProductStatus').textContent=rows.length+' products shown at the selected shop. Up to 50 matching products. Select a row or choose Edit.';
 list.innerHTML=rows.map((row,i)=>'<tr tabindex="0" data-product-row="'+i+'" aria-label="Edit '+esc(row.fields.name)+'"><td>'+esc(row.fields.code)+'</td><td class="manage-product-name">'+esc(row.fields.name)+'</td><td class="numeric">'+(row.fields.stockItem?Number(row.stock):'—')+'</td><td>'+esc(row.unit||lookup('measurements',row.fields.measurementId))+'</td><td class="numeric">'+money(row.fields.price)+'</td><td class="numeric">'+money(row.fields.cost)+'</td><td>'+esc(row.categoryName||lookup('categories',row.fields.categoryId))+'</td><td>'+esc(row.departmentName||lookup('departments',row.fields.departmentId))+'</td><td>'+(row.fields.stockItem?'Stock':'Non-stock')+'</td><td><button type="button" class="secondary" data-i="'+i+'">Edit</button></td></tr>').join('')||'<tr><td colspan="10" class="muted">No matching products. Change or clear the filters.</td></tr>';
 function selectProduct(index){
  if(sequence!==manageRequest||shop!==currentShop()||!$('manageProductDialog').open)return;
  const form=$('editProductForm');if(sessionStorage.getItem(opsKey(form))){closeManageProductSearch();toast('Recover the saved product change before editing another product.',true);form.hidden=false;form.scrollIntoView({block:'nearest'});return;}
  const row=rows[index];closeManageProductSearch();if(typeof resetComponentEditor==='function')resetComponentEditor();opsState.editProduct=row;fillProductForm(form,row.fields);form.elements.image.value='';
  const image=$('editProductImage');image.hidden=false;image.src='/api/products/'+row.productId+'/image?v='+Date.now();
  $('editProductStock').textContent=row.fields.stockItem?'Current stock: '+Number(row.stock)+' at this shop':'Non-stock product';opsMessage(form,'');form.hidden=false;form.scrollIntoView({block:'nearest'});
 }
 list.querySelectorAll('[data-product-row]').forEach(row=>{
  row.addEventListener('click',()=>selectProduct(Number(row.dataset.productRow)));
  row.addEventListener('keydown',e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectProduct(Number(row.dataset.productRow));}});
 });
}

document.querySelectorAll('.ops-product-manager,.ops-manager,.ops-stock-adjustment').forEach(tab=>tab.addEventListener('click',async()=>{try{await loadOpsLookups();if(tab.dataset.tab==='productsView')await loadManageProducts();}catch(e){toast(e.message,true);}}));
$('shopSelect').addEventListener('change',async()=>{closeManageProductSearch();$('manageProductCategory').value='';$('manageProductDepartment').value='';opsState.shop=0;opsState.report=null;$('opsReport').innerHTML='';$('zHistory').innerHTML='';$('printOpsReport').hidden=true;document.querySelectorAll('.ops-search-results').forEach(x=>x.innerHTML='');if($('productsView').classList.contains('active-view')||$('stockView').classList.contains('active-view'))try{await loadOpsLookups();if($('productsView').classList.contains('active-view'))await loadManageProducts();else await refreshPos();}catch(e){toast(e.message,true);}});
let manageSearchTimer;
function closeManageProductSearch(){manageRequest++;clearTimeout(manageSearchTimer);$('manageProductDialog').close();$('manageProductList').replaceChildren();}
$('openManageProductSearch').addEventListener('click',async()=>{
 if(typeof offlineMode!=='undefined'&&offlineMode){toast('Product search needs an internet connection.',true);return;}
 const shop=currentShop();$('manageProductDialog').showModal();$('manageProductSearch').focus();
 try{await loadOpsLookups();if(shop!==currentShop()||!$('manageProductDialog').open)return;populateManageProductFilters();await loadManageProducts();}
 catch(e){if($('manageProductDialog').open)toast(e.message,true);}
});
for(const id of ['manageProductCategory','manageProductDepartment','manageProductType','manageProductStockLevel','manageProductActiveStatus'])$(id).addEventListener('change',()=>{clearTimeout(manageSearchTimer);loadManageProducts().catch(e=>toast(e.message,true));});
$('manageProductClearFilters').addEventListener('click',()=>{clearTimeout(manageSearchTimer);$('manageProductSearch').value='';$('manageProductCategory').value='';$('manageProductDepartment').value='';$('manageProductType').value='all';$('manageProductStockLevel').value='all';$('manageProductActiveStatus').value='active';loadManageProducts().catch(e=>toast(e.message,true));});
$('closeManageProductSearch').addEventListener('click',closeManageProductSearch);
$('manageProductDialog').addEventListener('cancel',e=>{e.preventDefault();closeManageProductSearch();});
$('manageProductSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(manageSearchTimer);loadManageProducts().catch(e=>toast(e.message,true));}});

$('manageProductSearch').addEventListener('input',()=>{clearTimeout(manageSearchTimer);manageSearchTimer=setTimeout(()=>loadManageProducts().catch(e=>toast(e.message,true)),300);});
$('manageProductSearchBtn').addEventListener('click',()=>loadManageProducts().catch(e=>toast(e.message,true)));
async function uploadProductImage(productId,shopId,file){
  if(!file)return;
  if(file.size>2*1024*1024||!['image/png','image/jpeg'].includes(file.type))throw new Error('Choose a PNG or JPEG image under 2 MB.');
  const body=new FormData();body.append('image',file);
  const response=await fetch(`/api/products/${productId}/image?shopId=${shopId}`,{method:'POST',credentials:'same-origin',headers:{'X-CSRF-TOKEN':state.csrf},body});
  if(!response.ok){let message='Image upload failed.';try{message=(await response.json()).message||message;}catch{}throw new Error(message);}
}
async function finishProductSave(form,result,file,shop){
  const button=form.querySelector('button[type=submit]');button.disabled=true;$('shopSelect').disabled=true;
  try{await uploadProductImage(result.productId,shop,file);}
  catch(error){toast(`Product saved. ${error.message} Open Edit to upload its image again.`,true);}
  finally{form.reset();button.disabled=false;$('shopSelect').disabled=false;}
  await Promise.all([loadProducts(),loadManageProducts()]);
}
$('editProductImage').addEventListener('error',()=> $('editProductImage').hidden=true);
$('removeProductImage').addEventListener('click',async()=>{
  if(!opsState.editProduct)return;
  const button=$('removeProductImage');button.disabled=true;
  try{await api(`/api/products/${opsState.editProduct.productId}/image/remove?shopId=${currentShop()}`,{method:'POST'});$('editProductImage').hidden=true;toast('Product image removed.');await loadProducts();}
  catch(error){toast(error.message,true);}finally{button.disabled=false;}
});
$('newProductForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,file=form.elements.image.files[0],shop=currentShop();const result=await opsSubmit(form,'/api/operations/products',()=>({product:productFields(form)}));if(result)await finishProductSave(form,result,file,shop);});
$('editProductForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,file=form.elements.image.files[0],shop=currentShop();if(!opsState.editProduct&&!sessionStorage.getItem(opsKey(form))){opsMessage(form,'Select a product to edit.',true);return;}const result=await opsSubmit(form,'/api/operations/products/update',()=>({productId:opsState.editProduct.productId,expected:opsState.editProduct.fields,product:productFields(form)}));if(result){opsState.editProduct=null;await finishProductSave(form,result,file,shop);form.hidden=true;}});
$('cancelNewProduct').addEventListener('click',()=>{const form=$('newProductForm'),key=opsKey(form);if(sessionStorage.getItem(key)&&!sessionStorage.getItem(key+'.editable')){toast('Recover the saved product request before cancelling; its result is not yet confirmed.',true);return;}for(const suffix of ['', '.editable', '.error'])sessionStorage.removeItem(key+suffix);form.reset();opsMessage(form,'');form.elements.code.focus();});
$('cancelProductEdit').addEventListener('click',()=>{const form=$('editProductForm'),key=opsKey(form);if(sessionStorage.getItem(key)){if(!sessionStorage.getItem(key+'.editable')){toast('Recover the saved product change before closing it.',true);return;}sessionStorage.removeItem(key);sessionStorage.removeItem(key+'.editable');sessionStorage.removeItem(key+'.error');}opsState.editProduct=null;form.reset();opsMessage(form,'');form.hidden=true;if(typeof syncComponentButton==='function')syncComponentButton();});
function updatePoDraftTotals(){
  let total=0;opsState.poLines.forEach((line,i)=>{const amount=(Number(line.quantity)||0)*(Number(line.cost)||0);total+=amount;const cell=$('poLines').querySelector('[data-po-amount="'+i+'"]');if(cell)cell.textContent=money(amount);});
  $('poDraftSummary').textContent=opsState.poLines.length+' item'+(opsState.poLines.length===1?'':'s')+' · Total '+money(total);
}
function renderPoLines(){
  $('poLines').innerHTML=opsState.poLines.map((line,i)=>`<tr><td>${i+1}</td><td>${esc(line.productCode||line.code||'—')}</td><td class="po-product-name">${esc(line.productName)}</td><td><input aria-label="Qty for ${esc(line.productName)}" data-i="${i}" data-field="quantity" type="number" min="0.0001" step="0.0001" value="${line.quantity}" required></td><td><input aria-label="Cost for ${esc(line.productName)}" data-i="${i}" data-field="cost" type="number" min="0" step="0.0001" value="${line.cost}" required></td><td class="numeric" data-po-amount="${i}"></td><td><button type="button" class="ghost" data-remove="${i}" aria-label="Remove ${esc(line.productName)}">Remove</button></td></tr>`).join('')||'<tr><td colspan="7" class="muted">No items added. Choose Search Products to add items.</td></tr>';
  $('poLines').querySelectorAll('[data-field]').forEach(input=>input.addEventListener('input',()=>{opsState.poLines[Number(input.dataset.i)][input.dataset.field]=Number(input.value);updatePoDraftTotals();}));
  $('poLines').querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>{opsState.poLines.splice(Number(button.dataset.remove),1);renderPoLines();}));
  updatePoDraftTotals();
}
$('cancelPoDraft').addEventListener('click',()=>{
  const form=$('poCreate'),key=opsKey(form);
  if(sessionStorage.getItem(key)&&!sessionStorage.getItem(key+'.editable')){toast('Recover the saved purchase order before cancelling; its result is not yet confirmed.',true);return;}
  for(const suffix of ['', '.editable', '.error'])sessionStorage.removeItem(key+suffix);
  opsState.poLines=[];form.reset();form.querySelector('.supplier-search-results')?.replaceChildren();opsMessage(form,'');renderPoLines();form.elements.supplierId.focus();
});
for(const picker of document.querySelectorAll('.ops-product-picker')){
 picker.innerHTML='<button type="button" class="primary" data-open-product-picker>Search Products</button>';
 picker.querySelector('button').addEventListener('click',()=>SoftPOSProductPicker.open({owner:picker,stockOnly:true,multiple:picker.dataset.picker!=='adjust',onSelect:product=>{
  const p={...product,productId:product.id,productName:product.name,productCode:product.code,unitPrice:product.price,uom:product.unit};
  if(picker.dataset.picker==='po'){if(!opsState.poLines.some(x=>x.productId===p.productId))opsState.poLines.push({...p,quantity:1,cost:0});renderPoLines();}
  else if(picker.dataset.picker==='direct'){if(!directLines.some(x=>x.productId===p.productId))directLines.push({...p,quantity:1,cost:0,vat:false});renderDirectLines();}
  else{opsState.adjust=p;$('adjustProduct').textContent=p.productName+' — Current stock: '+Number(p.stock)+' '+p.uom;}
 }}));
}
$('poCreate').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const result=await opsSubmit(f,'/api/inventory/purchase-orders',()=>({supplierId:Number(f.elements.supplierId.value),note:f.elements.note.value,lines:opsState.poLines.map(x=>({productId:x.productId,quantity:x.quantity,cost:x.cost}))}));if(result){opsState.poLines=[];renderPoLines();f.reset();await openPoPrint(result.poId);}});
let poSearchSequence=0,poSearchTimer;
async function refreshPos(){
  const sequence=++poSearchSequence,shop=currentShop(),term=$('receivePoSearch').value.trim();
  $('receivePoSelect').value='';receiveSequence++;opsState.receive=[];$('receiveLines').replaceChildren();$('receivePoResults').textContent='Searching…';
  try{
    const rows=await api(`/api/inventory/purchase-orders?shopId=${shop}&poNo=${encodeURIComponent(term)}&supplier=${encodeURIComponent($('receivePoSupplierSearch').value.trim())}`);
    if(sequence!==poSearchSequence||shop!==currentShop())return;
    $('receivePoSelect').innerHTML='<option value="">Select open PO…</option>'+rows.map(r=>`<option value="${r.id}">${esc(r.number)} · ${esc(r.supplier)}</option>`).join('');
    $('receivePoResults').innerHTML=rows.slice(0,20).map((r,i)=>`<button type="button" data-choose-po="${i}"><strong>${esc(r.number)}</strong><small>${esc(r.supplier)}</small></button>`).join('')||'<p>No open purchase orders found.</p>';
    $('receivePoResults').querySelectorAll('[data-choose-po]').forEach(b=>b.addEventListener('click',()=>{$('receivePoSelect').value=rows[Number(b.dataset.choosePo)].id;$('receivePoResults').replaceChildren();$('receivePoSelect').dispatchEvent(new Event('change'));}));
  }catch(e){if(sequence===poSearchSequence)$('receivePoResults').textContent=e.message;}
}
for(const id of ['receivePoSearch','receivePoSupplierSearch']){
  $(id).addEventListener('input',()=>{clearTimeout(poSearchTimer);poSearchSequence++;receiveSequence++;$('receivePoSelect').value='';opsState.receive=[];$('receiveLines').replaceChildren();$('receivePoResults').replaceChildren();poSearchTimer=setTimeout(refreshPos,250);});
  $(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(poSearchTimer);refreshPos();}});
}
$('searchReceivePo').addEventListener('click',()=>{clearTimeout(poSearchTimer);refreshPos();});
$('clearReceivePoSearch').addEventListener('click',()=>{clearTimeout(poSearchTimer);$('receivePoSearch').value='';$('receivePoSupplierSearch').value='';refreshPos();});
$('receiveProductPicker').addEventListener('click',()=>{
 if(!opsState.receive.length){toast('Choose an open purchase order first.',true);return;}
 const sequence=receiveSequence,shop=currentShop();SoftPOSProductPicker.open({owner:$('poReceive'),stockOnly:true,title:'Search PO Items',provider:()=>opsState.receive.map(row=>({...row,cost:row.unitCost??null})),isValid:()=>sequence===receiveSequence&&shop===currentShop(),onSelect:product=>{
  const index=opsState.receive.findIndex(row=>row.id===product.id),input=$('receiveLines').querySelector('[data-receive="'+index+'"]');
  if(!input||input.disabled){toast('This item requires the desktop receiving workflow.',true);return false;}
  input.closest('.ops-line').hidden=false;input.scrollIntoView({block:'center'});input.focus();input.select();
 }});
});
$('refreshPos').addEventListener('click',()=>refreshPos().catch(e=>toast(e.message,true)));
document.querySelectorAll('[data-stock]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.stock-section').forEach(x=>x.hidden=x.id!==button.dataset.stock);$('stockView').querySelector('.ops-subtabs').hidden=button.dataset.stock==='stockAdjust';$('stockViewHeading').textContent=button.dataset.stock==='stockAdjust'?'Stock Adjustment':'PO & Receiving';document.querySelectorAll('[data-stock]').forEach(x=>{x.classList.toggle('secondary',x===button);x.classList.toggle('ghost',x!==button);});if(button.dataset.stock==='poReceive')refreshPos().catch(e=>toast(e.message,true));}));
$('poReceive').elements.invoiceDate.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
let receiveSequence=0;
$('receivePoSelect').addEventListener('change',async()=>{const seq=++receiveSequence,shop=currentShop(),id=Number($('receivePoSelect').value);opsState.receive=[];$('receiveLines').innerHTML='';if(!id)return;try{const rows=await api(`/api/inventory/purchase-orders?shopId=${shop}&id=${id}`);if(seq!==receiveSequence||shop!==currentShop())return;opsState.receive=rows;receiveItemSearch.value='';$('receiveLines').innerHTML=rows.map((r,i)=>`<div class="ops-line"><div><strong>${esc(r.name)}</strong><small>Balance ${r.balance} packs · ${r.pack} units/pack · ${money(r.cost)}/pack${r.serialized?' · Receive on desktop':''}</small></div><label>Qty Received<input data-receive="${i}" type="number" min="0" max="${r.balance}" step="0.0001" value="0" ${r.serialized?'disabled':''}></label><label class="check-label"><input data-vat="${i}" type="checkbox"> Add VAT</label></div>`).join('')||'<p>No open lines.</p>';}catch(e){toast(e.message,true);}});
$('poReceive').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const result=await opsSubmit(f,'/api/inventory/receive',()=>({poId:Number($('receivePoSelect').value),reference:f.elements.reference.value,invoiceDate:f.elements.invoiceDate.value,lines:opsState.receive.map((r,i)=>({detailId:r.id,quantity:Number(f.querySelector(`[data-receive="${i}"]`).value),vat:f.querySelector(`[data-vat="${i}"]`).checked})).filter(x=>x.quantity>0)}));if(result){f.elements.reference.value='';await refreshPos();await loadProducts();}});
$('stockAdjust').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;if(!opsState.adjust&&!sessionStorage.getItem(opsKey(f))){opsMessage(f,'Select a product first.',true);return;}const result=await opsSubmit(f,'/api/operations/adjust',()=>({...opsValues(f),productId:opsState.adjust.productId,expectedStock:Number(opsState.adjust.stock)}));if(result){opsState.adjust=null;$('adjustProduct').textContent=`Stock updated: ${result.before} → ${result.after}. Select a product for another adjustment.`;f.reset();await loadProducts();}});
function showOpsReport(r){opsState.report=r;$('opsReport').innerHTML=`<article class="report-paper"><h2>${esc(state.bootstrap?.companyName||'SoftPOS')}</h2><h3>${esc(r.kind)} REPORT</h3><p>Cashier: ${esc(/^webadmin-/i.test(r.cashier||'')?(state.me?.fullName||'Cashier'):r.cashier||state.me?.fullName||'Cashier')}</p><p>Shop: ${esc(state.bootstrap?.shops?.find(shop=>Number(shop.shopId)===Number(r.shopId))?.shopName||r.shopId)}</p><p>Start Date / Time: ${esc((r.periodStartUtc||r.fromUtc)?new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(r.periodStartUtc||r.fromUtc)?(r.periodStartUtc||r.fromUtc):(r.periodStartUtc||r.fromUtc)+'Z').toLocaleString():'No Activity Recorded')}</p><p>Report Run Time: ${esc(new Date(r.generatedUtc).toLocaleString())}</p>${r.reportId?`<small>Reference ${esc(r.reportId)}</small>`:''}<dl>${[['Sales',r.saleCount],['Gross sales',money(r.grossSales??r.total)],['Refunds',money(r.refundTotal??0)],['Net sales',money(r.total)],...(r.laybyPayments?[['Layby payments received',money(r.laybyPayments)]]:[]),...(r.laybyRefunds?[['Layby refunds paid',money(r.laybyRefunds)]]:[]),...(r.rounding?[['Cash round-off',money(r.rounding)]]:[]),...(r.surcharge?[['Credit card surcharge included',money(r.surcharge)]]:[]),...(r.paymentBreakdown?r.paymentBreakdown.map(p=>[paymentLabel(p.method),money(p.amount)]):[['Cash sales',money(r.cash)],['Credit Card',money(r.card)],['M-PAiSA',money(r.mpaisa)]]),...(r.countedCash==null?[]:[['Counted sales cash',money(r.countedCash)],['Cash difference',money(r.cashDifference)]])].map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></article>`;$('printOpsReport').hidden=false;}
$('xReportBtn').addEventListener('click',async()=>{try{const shop=currentShop(),r=await api(`/api/operations/x-report?shopId=${shop}`);if(shop===currentShop())showOpsReport(r);}catch(e){toast(e.message,true);}});
$('zCloseForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;if(!sessionStorage.getItem(opsKey(f))&&!confirm('Save the Z report and close your current web-sales period at this shop?'))return;const result=await opsSubmit(f,'/api/operations/z-report',()=>({countedCash:f.elements.countedCash.value===''?null:Number(f.elements.countedCash.value)}));if(result){showOpsReport(result);f.reset();opsMessage(f,'Z report saved. Subsequent web sales belong to the next period.');}});
$('zHistoryBtn').addEventListener('click',async()=>{try{const shop=currentShop(),rows=await api(`/api/operations/z-history?shopId=${shop}`);if(shop!==currentShop())return;$('zHistory').innerHTML=rows.map((r,i)=>`<button class="ghost" data-history="${i}">${esc(new Date(r.generatedUtc).toLocaleString())} · ${r.saleCount} sales · ${money(r.total)}</button>`).join('')||'<p>No saved Z reports.</p>';$('zHistory').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>showOpsReport(rows[Number(b.dataset.history)])));}catch(e){toast(e.message,true);}});
$('printOpsReport').addEventListener('click',()=>openOpsReportPrint());
window.addEventListener('afterprint',()=>document.body.classList.remove('printing-ops'));

document.querySelector('.ops-reports').addEventListener('click',showPendingOperations);

document.querySelectorAll('.close-operation-view').forEach(button=>button.addEventListener('click',()=>{
  if($('shopSelect').disabled){toast('Please wait for the current action to finish.',true);return;}
  activateTab('orderView');
}));
