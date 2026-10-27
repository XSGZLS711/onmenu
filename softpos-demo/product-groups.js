function syncProductGroupButtons(){
  document.querySelectorAll('[data-manage-product-group]').forEach(button=>button.hidden=!state.me?.canManageDirectory||offlineMode);
}
(()=>{
const byId=id=>document.getElementById(id);
let originProductForm=null,groupOwner=null;
async function request(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',...options});
  if(!response.ok){let message=`Request failed (${response.status})`;try{message=(await response.json()).message||message;}catch{}const error=new Error(message);error.status=response.status;throw error;}
  return response.json();
}
async function post(url,body){await refreshCsrf();return request(url,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':state.csrf},body:JSON.stringify(body)});}
let productGroups = {departments:[],categories:[]};
let productGroupKind = 'departments', selectedProductGroup = null, pendingProductGroup = null;
let groupsLoading = true,groupEditorLocked=false;
function groupFields(row,kind=productGroupKind){
  return {code:row.code,name:row.name,active:kind==='departments'?row.active:true,departmentId:kind==='categories'?(row.departmentId??null):null,description:kind==='categories'?row.description:'',excludeQuantity:kind==='categories'?row.excludeQuantity:false,...(kind==='categories'?{displayOnSales:row.displayOnSales!==false}:{})};
}
function renderProductGroupList(){
  const list=byId('groupList'),search=byId('groupSearch').value.trim().toLowerCase();list.replaceChildren();
  const rows=productGroups[productGroupKind].filter(row=>`${row.code} ${row.name}`.toLowerCase().includes(search));
  if(!rows.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=groupsLoading?'Loading entries…':'No matching entries.';list.append(empty);}
  for(const row of rows){
    const button=document.createElement('button');button.type='button';button.className='group-entry';button.classList.toggle('selected',selectedProductGroup?.id===row.id);button.disabled=!!pendingProductGroup||groupEditorLocked;
    button.setAttribute('aria-pressed',String(selectedProductGroup?.id===row.id));
    const name=document.createElement('strong');name.textContent=row.name;
    const detail=document.createElement('small');detail.textContent=row.code+(productGroupKind==='categories'&&row.displayOnSales===false?' · Hidden from sales':'')+(productGroupKind==='departments'&&!row.active?' · Inactive':'');
    button.append(name,detail);button.addEventListener('click',()=>editProductGroup(row));list.append(button);
  }
}
function editProductGroup(row=null){
  selectedProductGroup=row?structuredClone(row):null;
  const category=productGroupKind==='categories',label=category?'category':'department';
  byId('groupEditorTitle').textContent=`${row?'Update':'New'} ${label}`;
  byId('saveProductGroup').textContent=`${row?'Update':'Create'} ${label}`;
  byId('groupName').maxLength=category?50:250;
  byId('groupCode').value=row?.code??'';byId('groupName').value=row?.name??'';byId('groupActive').checked=row?.active??true;
  byId('groupDescription').value=row?.description??'';byId('groupDisplayOnSales').checked=row?.displayOnSales!==false;byId('groupDisplayOnSalesLabel').hidden=!category;byId('groupDisplayOnSalesHint').hidden=!category;
  byId('groupActiveLabel').hidden=category;byId('groupDepartmentLabel').hidden=!category;byId('groupDescriptionLabel').hidden=!category;
  const select=byId('groupDepartment');select.replaceChildren(new Option('No department',''));
  for(const department of productGroups.departments.filter(d=>d.active||d.id===row?.departmentId))select.add(new Option(department.name+(department.active?'':' (inactive)'),department.id));
  select.value=row?.departmentId??'';
  renderProductGroupList();
}
async function loadProductGroups(){
  const data=await request('/api/admin/product-groups');productGroups=data;groupsLoading=false;
  editProductGroup(selectedProductGroup?data[productGroupKind].find(x=>x.id===selectedProductGroup.id):null);
}
function lockProductGroupEditor(locked){
  groupEditorLocked=locked;
  byId('productGroupForm').querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=locked);
  for(const id of ['departmentsTab','categoriesTab','refreshProductGroups','closeProductGroups','doneProductGroups'])byId(id).disabled=locked;
  renderProductGroupList();
}
function selectProductGroupKind(kind){
  byId('productGroupsTitle').textContent=kind==='categories'?'Category management':'Department management';
  productGroupKind=kind;byId('groupSearch').value='';byId('productGroupResult').textContent='';
  for(const [id,k] of [['departmentsTab','departments'],['categoriesTab','categories']]){byId(id).className=kind===k?'primary':'secondary';byId(id).setAttribute('aria-pressed',String(kind===k));}
  editProductGroup();
}
byId('departmentsTab').addEventListener('click',()=>selectProductGroupKind('departments'));
byId('categoriesTab').addEventListener('click',()=>selectProductGroupKind('categories'));
byId('groupSearch').addEventListener('input',renderProductGroupList);
byId('newProductGroup').addEventListener('click',()=>{editProductGroup();byId('productGroupResult').textContent='';byId('groupCode').focus();});
byId('refreshProductGroups').addEventListener('click',async()=>{try{await loadProductGroups();opsState.lookups=null;await loadOpsLookups();byId('productGroupResult').textContent='Entries refreshed.';}catch(error){byId('productGroupResult').textContent=error.message;}});
byId('productGroupForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(groupsLoading)return;
  const category=productGroupKind==='categories';
  pendingProductGroup??={requestId:crypto.randomUUID(),id:selectedProductGroup?.id??null,expected:selectedProductGroup?groupFields(selectedProductGroup):null,fields:{code:byId('groupCode').value.trim(),name:byId('groupName').value.trim(),active:category?true:byId('groupActive').checked,departmentId:category&&byId('groupDepartment').value?Number(byId('groupDepartment').value):null,description:category?byId('groupDescription').value.trim():'',excludeQuantity:category?(selectedProductGroup?.excludeQuantity??false):false,...(category?{displayOnSales:byId('groupDisplayOnSales').checked}:{})}};
  lockProductGroupEditor(true);byId('productGroupResult').textContent='Saving…';
  try{
    // Keep the same reference after a lost response, so Retry cannot create a duplicate.
    const result=await post(`/api/admin/product-groups/${productGroupKind}`,pendingProductGroup);
    const wasNew=pendingProductGroup.id===null;
    const saved={id:result.id,...pendingProductGroup.fields};pendingProductGroup=null;
    productGroups[productGroupKind]=productGroups[productGroupKind].filter(row=>row.id!==saved.id).concat(saved);
    editProductGroup(saved);byId('productGroupResult').textContent=result.message;
    if(category&&state.bootstrap){state.bootstrap.categories=productGroups.categories.map(c=>({categoryId:c.id,categoryName:c.name,displayOnSales:c.displayOnSales!==false}));renderCategories();}
    try{if(category)await loadProducts();await loadProductGroups();opsState.lookups=null;await loadOpsLookups();if(wasNew&&originProductForm){const select=originProductForm.elements[productGroupKind==='categories'?'categoryId':'departmentId'];if(Array.from(select.options).some(option=>Number(option.value)===saved.id))select.value=String(saved.id);}}catch{byId('productGroupResult').textContent=result.message+' Refresh to reload the product selections.';}
  }catch(error){
    if(error.status>=500||error instanceof TypeError){byId('productGroupResult').textContent='Could not confirm the save. Retry to check the same request.';byId('saveProductGroup').disabled=false;byId('saveProductGroup').textContent='Retry save';return;}
    pendingProductGroup=null;byId('productGroupResult').textContent=error.message;
  }
  lockProductGroupEditor(false);
});
renderProductGroupList();

async function openProductGroups(kind,form){
  if(!state.me?.canManageDirectory){toast('Only an admin can manage departments and categories.',true);return;}
  if(offlineMode){toast('Connect online to manage departments and categories.',true);return;}
  const owner=`${state.me.companyCode}.${state.me.userId}`;
  if(groupOwner!==owner){pendingProductGroup=null;selectedProductGroup=null;productGroups={departments:[],categories:[]};groupsLoading=true;groupOwner=owner;}
  originProductForm=form;
  if(!pendingProductGroup)selectProductGroupKind(kind);
  byId('productGroupsDialog').showModal();
  if(pendingProductGroup)return;
  lockProductGroupEditor(true);
  try{await loadProductGroups();}catch(error){groupsLoading=true;byId('productGroupResult').textContent=error.message;}
  finally{lockProductGroupEditor(false);}
}
function closeProductGroups(){if(pendingProductGroup){toast('Retry the save to confirm it before closing.',true);return;}byId('productGroupsDialog').close();}
document.querySelectorAll('[data-manage-product-group]').forEach(button=>button.addEventListener('click',()=>openProductGroups(button.dataset.manageProductGroup,button.closest('form'))));
byId('closeProductGroups').addEventListener('click',closeProductGroups);byId('doneProductGroups').addEventListener('click',closeProductGroups);
byId('productGroupsDialog').addEventListener('cancel',event=>{if(pendingProductGroup){event.preventDefault();toast('Retry the save to confirm it before closing.',true);}});
})();
