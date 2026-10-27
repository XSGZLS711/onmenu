let componentEditor=null,componentSearchTimer,componentSearchSequence=0,componentOpenSequence=0;
function resetComponentEditor(){
  componentOpenSequence++;componentSearchSequence++;clearTimeout(componentSearchTimer);componentEditor=null;
  $('componentMaterialDialog').close();$('productComponentsDialog').close();$('productComponentRows').replaceChildren();$('componentProductChoices').replaceChildren();$('componentProductSearch').value='';
}
function syncComponentButton(){
  const form=$('editProductForm'),product=opsState.editProduct,button=$('assignProductComponents'),hint=$('productComponentHint');
  const available=state.productComponentsEnabled&&product&&!form.elements.stockItem.checked&&!offlineMode;
  button.hidden=!available;
  const unsaved=available&&product.fields.stockItem!==false,pending=available&&!!sessionStorage.getItem(opsKey(form));
  button.disabled=!!(unsaved||pending);
  hint.hidden=!available||(!unsaved&&!pending);
  if(unsaved){hint.textContent=Number(product.stock)!==0&&product.stock!=null?'Current stock is '+Number(product.stock)+'. Correct stock to zero in every shop, then save as Non-stock before assigning components.':'Save the product as Non-stock, then reopen it to assign components.';}
  else if(pending){hint.textContent='Resolve or cancel the saved product change before assigning components.';}
  else hint.textContent='';
}

function componentMaterial(id){return componentEditor?.materials?.find(p=>p.id===id);}
function componentCostSummary(){
  const rows=componentEditor.rows.filter(r=>r.active),complete=rows.length>0&&rows.every(r=>componentMaterial(r.componentId)?.cost!=null);
  const total=rows.reduce((sum,r)=>sum+r.quantity*(componentMaterial(r.componentId)?.cost||0),0);
  $('componentRecipeCost').textContent=complete?money(total):'Incomplete';
  $('componentCostHint').textContent=complete?'Calculated from current ingredient costs at this shop.':'Add ingredients with available costs to calculate the recipe.';
  $('componentUpdateCost').disabled=!complete;
  if(!complete)$('componentUpdateCost').checked=false;
  document.querySelectorAll('[data-component-total]').forEach(el=>{const r=componentEditor.rows[Number(el.dataset.componentTotal)],m=componentMaterial(r.componentId);el.textContent=m?.cost!=null?money(m.cost*r.quantity):'—';});
}
function renderComponentAssignments(){
  $('productComponentRows').innerHTML=componentEditor.rows.map((row,index)=>{
    const m=componentMaterial(row.componentId);
    return '<tr class="'+(row.active?'':'recipe-inactive')+'"><td><strong>'+esc(row.name)+'</strong><small>'+esc(m?.code||'')+(row.active?'':' · Inactive')+'</small></td><td><input aria-label="Quantity for '+esc(row.name)+'" type="number" min="0.0000001" max="1000000" step="0.0000001" required data-component-qty="'+index+'" value="'+row.quantity+'"></td><td>'+esc(m?.unit||'Stock unit')+'</td><td>'+(m?.cost!=null?money(m.cost):'—')+'</td><td data-component-total="'+index+'"></td><td><label class="recipe-active"><input type="checkbox" aria-label="Active '+esc(row.name)+'" data-component-active="'+index+'" '+(row.active?'checked':'')+'> Active</label><button type="button" class="ghost" data-component-remove="'+index+'">Remove</button></td></tr>';
  }).join('')||'<tr><td colspan="6" class="muted">No raw materials added. Use Add Raw Material to build this recipe.</td></tr>';
  $('productComponentRows').querySelectorAll('[data-component-qty]').forEach(input=>input.addEventListener('input',()=>{componentEditor.rows[Number(input.dataset.componentQty)].quantity=Number(input.value);componentCostSummary();}));
  $('productComponentRows').querySelectorAll('[data-component-active]').forEach(input=>input.addEventListener('change',()=>{componentEditor.rows[Number(input.dataset.componentActive)].active=input.checked;renderComponentAssignments();}));
  $('productComponentRows').querySelectorAll('[data-component-remove]').forEach(button=>button.addEventListener('click',()=>{componentEditor.rows.splice(Number(button.dataset.componentRemove),1);renderComponentAssignments();}));
  componentCostSummary();
}
async function openProductComponents(){
  if(!opsState.editProduct||offlineMode)return;
  if(opsState.editProduct.fields.stockItem!==false||$('editProductForm').elements.stockItem.checked||sessionStorage.getItem(opsKey($('editProductForm')))){
    syncComponentButton();toast($('productComponentHint').textContent||'Save this product as Non-stock before assigning components.',true);return;
  }
  const product=opsState.editProduct,shop=currentShop(),sequence=++componentOpenSequence;
  const form=$('productComponentsForm');
  // Move older pending saves to their own product's key before opening any recipe.
  form.dataset.operationScope='';const legacyKey=opsKey(form),legacy=sessionStorage.getItem(legacyKey);
  if(legacy){
    const old=JSON.parse(legacy),target=legacyKey+'.product.'+old.productId;
    if(!sessionStorage.getItem(target)){
      sessionStorage.setItem(target,legacy);
      if(sessionStorage.getItem(legacyKey+'.editable'))sessionStorage.setItem(target+'.editable','1');
      sessionStorage.removeItem(legacyKey);sessionStorage.removeItem(legacyKey+'.editable');
    }
  }
  form.dataset.operationScope='product.'+product.productId;
  const result=await api(`/api/inventory/products/${product.productId}/components?shopId=${shop}`);
  if(sequence!==componentOpenSequence||shop!==currentShop()||product!==opsState.editProduct)return;
  const saved=sessionStorage.getItem(opsKey(form));
  if(saved){
    const request=JSON.parse(saved);
    if(request.productId!==product.productId||request.shopId!==shop)throw new Error('This saved component request belongs to a different product or shop.');
    componentEditor={productId:request.productId,shopId:request.shopId,expected:request.expected,rows:structuredClone(request.components),locationId:request.components[0]?.locationId||0};
    $('componentProductName').textContent=product.fields.name+' · recover pending save';
  }else{
    componentEditor={productId:product.productId,shopId:shop,expected:result.components,rows:structuredClone(result.components),locationId:result.locationId};
    $('componentProductName').textContent=product.fields.name;
  }
  componentEditor.materials=result.materials||[];
  componentEditor.storedCost=saved?JSON.parse(saved).expectedCost:componentMaterial(product.productId)?.storedCost;
  $('componentUpdateCost').checked=saved?JSON.parse(saved).updateCost===true:false;
  $('componentProductDetails').textContent='Code: '+product.fields.code+' · Selling price: '+money(product.fields.price)+' / '+(componentMaterial(product.productId)?.unit||'item');
  $('componentRecipeImage').hidden=!result.imageUrl;if(result.imageUrl)$('componentRecipeImage').src=result.imageUrl;
  $('componentProductSearch').value='';$('componentProductChoices').replaceChildren();opsMessage(form,'');renderComponentAssignments();$('productComponentsDialog').showModal();
}
$('assignProductComponents').addEventListener('click',()=>openProductComponents().catch(e=>toast(e.message,true)));
$('editProductForm').elements.stockItem.addEventListener('change',syncComponentButton);
$('closeProductComponents').addEventListener('click',resetComponentEditor);
$('productComponentsDialog').addEventListener('cancel',()=>resetComponentEditor());
function componentMaterialFilters(){
 const params=new URLSearchParams({shopId:componentEditor.shopId,search:$('componentProductSearch').value.trim(),stockType:$('componentMaterialType').value,stockLevel:$('componentMaterialStockLevel').value});
 if($('componentMaterialDepartment').value)params.set('departmentId',$('componentMaterialDepartment').value);
 if($('componentMaterialCategory').value)params.set('categoryId',$('componentMaterialCategory').value);
 return params;
}
function populateComponentMaterialFilters(){
 for(const [id,key,caption] of [['componentMaterialDepartment','departments','All Departments'],['componentMaterialCategory','categories','All Categories']]){
  const select=$(id),prior=select.value,rows=opsState.lookups?.[key]||[];
  select.innerHTML='<option value="">'+caption+'</option>'+rows.map(r=>'<option value="'+Number(r.id)+'">'+esc(r.name)+'</option>').join('');if(rows.some(r=>String(r.id)===prior))select.value=prior;
 }
}
async function searchComponentMaterials(){
  const sequence=++componentSearchSequence,editor=componentEditor;if(!editor||!$('componentMaterialDialog').open)return;
  $('componentProductChoices').innerHTML='<tr><td colspan="10">Loading raw materials…</td></tr>';$('componentMaterialResultsStatus').textContent='Loading raw materials…';
  try{
    const choices=await api('/api/inventory/component-products?'+componentMaterialFilters());
    if(sequence!==componentSearchSequence||editor!==componentEditor)return;
    for(const p of choices){const i=editor.materials.findIndex(x=>x.id===p.id);if(i>=0)editor.materials[i]=p;else editor.materials.push(p);}
    renderComponentAssignments();
    const visible=choices.filter(p=>p.id!==editor.productId);
    $('componentMaterialResultsStatus').textContent=visible.length+' products shown. Up to 50 matching active products. Add materials, then press Done.';
    $('componentProductChoices').innerHTML=visible.map(p=>{
      const added=editor.rows.some(r=>r.componentId===p.id&&r.active);
      return '<tr tabindex="0" data-material-row="'+p.id+'" class="'+(added?'material-added':'')+'" aria-label="Add '+esc(p.name)+'"><td>'+esc(p.code)+'</td><td class="manage-product-name">'+esc(p.name)+'</td><td class="numeric">'+(p.stockItem?Number(p.stock):'—')+'</td><td>'+esc(p.unit||'—')+'</td><td class="numeric">'+money(p.price||0)+'</td><td class="numeric">'+(p.cost!=null?money(p.cost):'—')+'</td><td>'+esc(p.categoryName||'—')+'</td><td>'+esc(p.departmentName||'—')+'</td><td>'+(p.stockItem?'Stock':'Non-stock')+'</td><td><button type="button" class="secondary" data-component-id="'+p.id+'">'+(added?'Added ✓':'Add +')+'</button></td></tr>';
    }).join('')||'<tr><td colspan="10" class="muted">No matching raw materials. Change or clear the filters.</td></tr>';
    $('componentProductChoices').querySelectorAll('[data-material-row]').forEach(row=>{
      row.addEventListener('click',e=>{if(!e.target.closest('button'))row.querySelector('button').click();});
      row.addEventListener('keydown',e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();row.querySelector('button').click();}});
    });
    $('componentProductChoices').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
      const product=choices.find(p=>p.id===Number(button.dataset.componentId));
      if(editor.rows.some(r=>r.componentId===product.id&&r.active)){toast('This raw material is already added. Change its quantity in the recipe.');return;}
      if(editor.rows.length>=100){toast('Use up to 100 raw materials.',true);return;}
      const inactive=editor.rows.find(r=>r.componentId===product.id&&!r.active);
      if(inactive)inactive.active=true;else editor.rows.push({id:0,componentId:product.id,name:product.name,quantity:1,active:true,locationId:editor.locationId});
      button.textContent='Added ✓';button.closest('tr').classList.add('material-added');renderComponentAssignments();$('componentMaterialStatus').textContent=editor.rows.filter(r=>r.active).length+' raw materials in recipe. Select more or press Done.';
    }));
  }catch(e){if(sequence===componentSearchSequence){$('componentProductChoices').innerHTML='<tr><td colspan="10">Unable to load raw materials. Try Search again.</td></tr>';$('componentMaterialResultsStatus').textContent=e.message;toast(e.message,true);}}
}
$('componentProductSearch').addEventListener('input',()=>{clearTimeout(componentSearchTimer);componentSearchSequence++;componentSearchTimer=setTimeout(searchComponentMaterials,250);});
$('componentMaterialSearch').addEventListener('click',searchComponentMaterials);
$('componentProductSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(componentSearchTimer);searchComponentMaterials();}});
for(const id of ['componentMaterialDepartment','componentMaterialCategory','componentMaterialType','componentMaterialStockLevel'])$(id).addEventListener('change',()=>{clearTimeout(componentSearchTimer);searchComponentMaterials();});
$('componentMaterialClearFilters').addEventListener('click',()=>{clearTimeout(componentSearchTimer);$('componentProductSearch').value='';$('componentMaterialDepartment').value='';$('componentMaterialCategory').value='';$('componentMaterialType').value='all';$('componentMaterialStockLevel').value='all';searchComponentMaterials();});

$('componentAddMaterial').addEventListener('click',()=>{populateComponentMaterialFilters();$('componentMaterialDialog').showModal();$('componentMaterialStatus').textContent='Select raw materials to add to the recipe.';searchComponentMaterials();});
function closeComponentMaterials(){componentSearchSequence++;clearTimeout(componentSearchTimer);$('componentMaterialDialog').close();}
$('componentMaterialDone').addEventListener('click',closeComponentMaterials);
$('componentMaterialClose').addEventListener('click',closeComponentMaterials);
$('componentMaterialDialog').addEventListener('cancel',e=>{e.preventDefault();closeComponentMaterials();});
$('componentCancelRecipe').addEventListener('click',resetComponentEditor);
$('productComponentsForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!componentEditor)return;
  const editor=componentEditor;
  if(editor.productId!==opsState.editProduct?.productId||editor.shopId!==currentShop()){toast('Select this product again before saving its components.',true);return;}
  const saved=sessionStorage.getItem(opsKey(event.currentTarget)),savedCost=saved&&JSON.parse(saved).updateCost===true;
  const result=await opsSubmit(event.currentTarget,'/api/inventory/products/components',()=>({productId:editor.productId,expected:editor.expected,components:editor.rows,...($('componentUpdateCost').checked?{updateCost:true,expectedCost:editor.storedCost}: {})}));
  if(result&&componentEditor===editor){if($('componentUpdateCost').checked||savedCost){opsState.editProduct=null;$('editProductForm').hidden=true;}resetComponentEditor();}
});
