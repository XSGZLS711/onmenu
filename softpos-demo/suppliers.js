let supplierOrigin=null;
function refreshSupplierPickers(){
  document.querySelectorAll('.supplier-picker').forEach(picker=>{
    const input=picker.querySelector('.supplier-search');
    input.value='';picker.querySelector('.supplier-search-results')?.replaceChildren();
  });
}
for(const picker of document.querySelectorAll('.supplier-picker')){
  const input=picker.querySelector('.supplier-search'),select=picker.querySelector('select'),results=document.createElement('div');
  results.className='ops-search-results supplier-search-results';picker.append(results);
  function search(){
    const term=input.value.trim().toLocaleLowerCase();
    if(!term){results.replaceChildren();return;}
    const rows=(opsState.lookups?.suppliers||[]).filter(x=>x.name.toLocaleLowerCase().includes(term)).slice(0,20);
    results.innerHTML=rows.map((x,i)=>`<button type="button" data-supplier-result="${i}">${esc(x.name)}</button>`).join('')||'<p>No matching suppliers. Use Create Supplier to add one.</p>';
    results.querySelectorAll('[data-supplier-result]').forEach(b=>b.addEventListener('click',()=>{select.value=rows[Number(b.dataset.supplierResult)].id;input.value='';results.replaceChildren();}));
  }
  input.addEventListener('input',search);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
  picker.querySelector('.create-supplier').addEventListener('click',()=>{supplierOrigin=picker.closest('form');$('supplierDialog').showModal();});
}
$('closeSupplierDialog').addEventListener('click',()=>$('supplierDialog').close());
$('createSupplierForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,origin=supplierOrigin,shop=currentShop(),user=state.me;
  if(!origin)return;
  const result=await opsSubmit(form,'/api/operations/suppliers',()=>({name:form.elements.name.value,phone:form.elements.phone.value,email:form.elements.email.value,address:form.elements.address.value,tin:form.elements.tin.value,originModule:origin.id==='poCreate'?'PO':'ReceiveWithoutPO'}));
  if(result&&user===state.me&&shop===currentShop()){
    opsState.lookups=null;await loadOpsLookups();
    origin.elements.supplierId.value=result.supplierId;
    form.reset();$('supplierDialog').close();
  }
});
function resetSupplierUi(){supplierOrigin=null;$('supplierDialog').close();$('createSupplierForm').reset();refreshSupplierPickers();$('receivePoSearch').value='';$('receivePoSupplierSearch').value='';$('receivePoResults').replaceChildren();$('receiveItemSearch').value='';}
$('shopSelect').addEventListener('change',resetSupplierUi);$('logoutBtn').addEventListener('click',resetSupplierUi);
