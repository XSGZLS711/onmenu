// Sort the displayed product results without replacing rows or their selection handlers.
(() => {
  const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
  function attach(table){
    if(!table||table.dataset.sortReady)return;
    table.dataset.sortReady='true';
    const body=table.tBodies[0],headers=[...table.tHead.rows[0].cells];
    let column=-1,direction=1;
    const value=(row,index)=>{
      const text=row.cells[index].textContent.trim();
      if(!text||text==='—')return null;
      if([2,4,5].includes(index)){const number=Number(text.replace(/[^0-9.+-]/g,''));return Number.isFinite(number)?number:null;}
      return text;
    };
    function sort(){
      if(column<0)return;
      const rows=[...body.rows];if(rows.some(row=>row.cells.length!==headers.length))return;
      const ordered=rows.map((row,index)=>({row,index,key:value(row,column)})).sort((a,b)=>{
        if(a.key==null||b.key==null)return a.key==null?(b.key==null?a.index-b.index:1):-1;
        const compared=typeof a.key==='number'?a.key-b.key:collator.compare(a.key,b.key);
        return compared*direction||a.index-b.index;
      }).map(item=>item.row);
      if(ordered.every((row,index)=>row===rows[index]))return;
      observer.disconnect();body.append(...ordered);observer.observe(body,{childList:true});
    }
    const observer=new MutationObserver(sort);observer.observe(body,{childList:true});
    headers.slice(0,-1).forEach((header,index)=>{
      const label=header.textContent.trim(),button=document.createElement('button');button.type='button';button.className='product-grid-sort';button.textContent=label;
      header.replaceChildren(button);header.setAttribute('aria-sort','none');button.setAttribute('aria-label','Sort by '+label);
      button.addEventListener('click',()=>{
        direction=column===index?-direction:1;column=index;
        headers.slice(0,-1).forEach((h,i)=>{h.setAttribute('aria-sort',i===column?(direction===1?'ascending':'descending'):'none');h.firstElementChild.setAttribute('aria-label','Sort by '+h.textContent.trim()+(i===column?(direction===1?', descending next':', ascending next'):''));});
        sort();
      });
    });
  }
  window.SoftPOSProductGridSort={attach};
  for(const id of ['manageProductDialog','componentMaterialDialog'])attach(document.querySelector('#'+id+' .manage-product-grid table'));
})();

// Shared selection-only grid. Product maintenance and sales keep their own editors.
(() => {
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currency=value=>value==null?'—':'FJD '+Number(value).toFixed(2);
  const dialog=document.createElement('dialog');dialog.id='productSelectionDialog';dialog.className='recipe-dialog product-selection-dialog';
  dialog.innerHTML=`<div class="dialog-card large"><div class="dialog-head"><h2 id="productSelectionTitle">Search Products</h2><button type="button" class="icon-btn" data-picker-close aria-label="Close product selection">×</button></div><div class="manage-product-filters"><label class="manage-product-query">Code / Name / Barcode<input id="productSelectionSearch" maxlength="200" autocomplete="off" placeholder="Search by code, name or barcode"></label><label>Department<select id="productSelectionDepartment"><option value="">All Departments</option></select></label><label>Category<select id="productSelectionCategory"><option value="">All Categories</option></select></label><label>Product Type<select id="productSelectionType"><option value="all">All Types</option><option value="stock">Stock</option><option value="nonstock">Non-stock / Service</option></select></label><label>Stock Level<select id="productSelectionStockLevel"><option value="all">All Stock Levels</option><option value="positive">In Stock</option><option value="zero">Zero Stock</option><option value="negative">Negative Stock</option></select></label><div class="manage-product-filter-actions"><button type="button" class="primary" id="productSelectionSearchBtn">Search</button><button type="button" class="ghost" id="productSelectionClear">Clear Filters</button></div></div><p id="productSelectionStatus" class="muted" role="status" aria-live="polite"></p><div class="manage-product-grid" tabindex="0" aria-label="Product selection results"><table><thead><tr><th scope="col">Code</th><th scope="col">Name</th><th scope="col" class="numeric">Qty</th><th scope="col">Unit</th><th scope="col" class="numeric">Price</th><th scope="col" class="numeric">Cost</th><th scope="col">Category</th><th scope="col">Department</th><th scope="col">Type</th><th scope="col">Action</th></tr></thead><tbody id="productSelectionRows"></tbody></table></div><div class="recipe-actions"><p id="productSelectionSummary" role="status"></p><button type="button" class="primary" data-picker-close>Done</button></div></div>`;
  document.body.append(dialog);
  window.SoftPOSProductGridSort.attach(dialog.querySelector('table'));
  const el=id=>document.getElementById(id);let current=null,sequence=0,timer,opening=0;
  const normalize=p=>({...p,id:Number(p.id??p.productId),code:p.code??p.productCode??'',name:p.name??p.productName??'',stock:p.stock??p.snapshot??null,stockItem:p.stockItem!==false,unit:p.unit??p.uom??'',price:p.price??p.unitPrice??null,cost:p.cost??null});
  function valid(context){
    if(!context||context!==current||!dialog.open)return false;
    if(context.owner&&!context.owner.isConnected)return false;
    const view=context.owner?.closest('.view');if(view&&!view.classList.contains('active-view'))return false;
    return (!context.isValid||context.isValid())&&(context.provider||context.shop===currentShop()||context.allowDifferentShop&&!!context.isValid);
  }
  function close(){opening++;sequence++;clearTimeout(timer);current=null;dialog.close();el('productSelectionRows').replaceChildren();}
  function filters(){return {search:el('productSelectionSearch').value.trim(),departmentId:el('productSelectionDepartment').value,categoryId:el('productSelectionCategory').value,stockType:el('productSelectionType').value,stockLevel:el('productSelectionStockLevel').value};}
  function localRows(rows,f){
    const terms=f.search.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return rows.map(normalize).filter(p=>terms.every(term=>[p.code,p.name,p.barcode||''].join(' ').toLocaleLowerCase().includes(term))&&(!f.departmentId||String(p.departmentId)===f.departmentId)&&(!f.categoryId||String(p.categoryId)===f.categoryId)&&(f.stockType==='all'||(f.stockType==='stock')===p.stockItem)&&(f.stockLevel==='all'||p.stockItem&&(f.stockLevel==='positive'?p.stock>0:f.stockLevel==='zero'?Number(p.stock)===0:p.stock<0)));
  }
  async function search(){
    const context=current,request=++sequence;clearTimeout(timer);if(!valid(context))return;
    el('productSelectionRows').innerHTML='<tr><td colspan="10">Loading products…</td></tr>';el('productSelectionStatus').textContent='Loading products…';
    try{
      const f=filters();let rows;
      if(context.provider)rows=localRows(await context.provider(),f).slice(0,100);
      else{const params=new URLSearchParams({shopId:context.shop,search:f.search,stockOnly:!!context.stockOnly,stockType:f.stockType,stockLevel:f.stockLevel,includeInactive:!!context.includeInactive});if(f.departmentId)params.set('departmentId',f.departmentId);if(f.categoryId)params.set('categoryId',f.categoryId);rows=await api('/api/inventory/products?'+params);}
      if(request!==sequence||!valid(context))return;
      rows=rows.map(normalize).filter(p=>(!context.stockOnly||p.stockItem)&&(!context.nonStockOnly||!p.stockItem));
      el('productSelectionStatus').textContent=rows.length+' products shown (up to 100 matches). '+(context.multiple?'Add products, then press Done.':'Choose a row or Select.');
      el('productSelectionRows').innerHTML=rows.map((p,i)=>`<tr tabindex="0" data-selection-row="${i}" class="${context.selected.has(p.id)?'selection-added':''}" aria-label="${context.multiple?'Add':'Select'} ${escape(p.name)}"><td>${escape(p.code)}</td><td class="manage-product-name">${escape(p.name)}</td><td class="numeric">${p.stockItem&&p.stock!=null?Number(p.stock):'—'}</td><td>${escape(p.unit||'—')}</td><td class="numeric">${currency(p.price)}</td><td class="numeric">${currency(p.cost)}</td><td>${escape(p.categoryName||'—')}</td><td>${escape(p.departmentName||'—')}</td><td>${p.stockItem?'Stock':'Non-stock'}</td><td><button type="button" class="secondary" data-selection-index="${i}">${context.multiple?'Add':'Select'}</button></td></tr>`).join('')||'<tr><td colspan="10">No matching products. Change or clear the filters.</td></tr>';
      async function choose(index){
        if(!valid(context)||context.selecting||request!==sequence)return;
        const product=rows[index];if(!product)return;context.selecting=true;
        if(!context.multiple)close();
        try{
          const accepted=await context.onSelect(product);
          if(accepted===false||!context.multiple||!valid(context))return;
          context.selected.add(product.id);el('productSelectionSummary').textContent=context.selected.size+' product'+(context.selected.size===1?'':'s')+' selected. Last added: '+product.name;
          dialog.querySelectorAll('[data-selection-row]').forEach(row=>row.classList.toggle('selection-added',context.selected.has(rows[Number(row.dataset.selectionRow)]?.id)));
        }catch(error){if(typeof toast==='function')toast(error.message,true);else el('productSelectionStatus').textContent=error.message;}
        finally{context.selecting=false;}
      }
      el('productSelectionRows').querySelectorAll('[data-selection-row]').forEach(row=>{
        row.addEventListener('click',()=>choose(Number(row.dataset.selectionRow)));
        row.addEventListener('keydown',event=>{if(event.target===row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();choose(Number(row.dataset.selectionRow));}});
      });
    }catch(error){if(request===sequence&&valid(context)){el('productSelectionStatus').textContent=error.message;el('productSelectionRows').innerHTML='<tr><td colspan="10">Unable to load products. Try Search again.</td></tr>';}}
  }
  async function open(options){
    close();const token=++opening,context={...options,shop:options.shop??(typeof currentShop==='function'?currentShop():null),selected:new Set()};current=context;
    el('productSelectionTitle').textContent=options.title||'Search Products';el('productSelectionSearch').value=options.search||'';el('productSelectionDepartment').innerHTML='<option value="">All Departments</option>';el('productSelectionCategory').innerHTML='<option value="">All Categories</option>';el('productSelectionType').value=options.stockOnly?'stock':options.nonStockOnly?'nonstock':'all';el('productSelectionType').disabled=!!(options.stockOnly||options.nonStockOnly);el('productSelectionStockLevel').value='all';el('productSelectionSummary').textContent='';el('productSelectionStatus').textContent='Loading products…';dialog.showModal();el('productSelectionSearch').focus();
    try{
      let lookups;
      if(options.provider){const rows=(await options.provider()).map(normalize);lookups={};for(const [key,id,name] of [['departments','departmentId','departmentName'],['categories','categoryId','categoryName']])lookups[key]=Array.from(new Map(rows.filter(p=>p[id]!=null&&p[name]).map(p=>[p[id],{id:p[id],name:p[name]}])).values());}
      else lookups=await api('/api/inventory/lookups?shopId='+context.shop);
      if(token!==opening||!valid(context))return;
      for(const [id,key,title] of [['productSelectionDepartment','departments','All Departments'],['productSelectionCategory','categories','All Categories']])el(id).innerHTML='<option value="">'+title+'</option>'+(lookups[key]||[]).map(p=>'<option value="'+Number(p.id)+'">'+escape(p.name)+'</option>').join('');
      await search();
    }catch(error){if(valid(context))el('productSelectionStatus').textContent=error.message;}
  }
  dialog.querySelectorAll('[data-picker-close]').forEach(button=>button.addEventListener('click',close));dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  el('productSelectionSearch').addEventListener('input',()=>{clearTimeout(timer);sequence++;timer=setTimeout(search,250);});el('productSelectionSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search();}});el('productSelectionSearchBtn').onclick=search;
  for(const id of ['productSelectionDepartment','productSelectionCategory','productSelectionType','productSelectionStockLevel'])el(id).onchange=search;
  el('productSelectionClear').onclick=()=>{el('productSelectionSearch').value='';el('productSelectionDepartment').value='';el('productSelectionCategory').value='';el('productSelectionType').value=current?.stockOnly?'stock':current?.nonStockOnly?'nonstock':'all';el('productSelectionStockLevel').value='all';search();};
  document.getElementById('shopSelect')?.addEventListener('change',close);document.getElementById('logoutBtn')?.addEventListener('click',close);document.addEventListener('click',event=>{if(event.target.closest('.tabs button,.close-operation-view')&&dialog.open)close();});
  window.SoftPOSProductPicker={open,close};
})();
