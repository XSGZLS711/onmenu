let saleCustomerSearchSequence=0;
async function searchSaleCustomers(){
  const sequence=++saleCustomerSearchSequence,shop=currentShop();
  try{
    const rows=await api('/api/customers?search='+encodeURIComponent($('saleCustomerSearch').value));
    if(sequence!==saleCustomerSearchSequence||shop!==currentShop())return;
    $('saleCustomerResults').innerHTML=rows.map((c,i)=>`<button type="button" class="customer-row" data-sale-customer="${i}"><span><strong>${esc(c.name)}</strong><small>${esc(c.phone||c.email||'')}</small></span><span>Choose</span></button>`).join('')||'<p>No customers found.</p>';
    $('saleCustomerResults').querySelectorAll('[data-sale-customer]').forEach(b=>b.addEventListener('click',()=>{state.saleCustomer=rows[Number(b.dataset.saleCustomer)];renderCart();$('saleCustomerDialog').close();}));
  }catch(e){toast(e.message,true);}
}
$('chooseSaleCustomer').addEventListener('click',()=>{$('saleCustomerDialog').showModal();searchSaleCustomers();});
$('closeSaleCustomer').addEventListener('click',()=>{$('saleCustomerDialog').close();saleCustomerSearchSequence++;});
$('clearSaleCustomer').addEventListener('click',()=>{state.saleCustomer=null;renderCart();});
$('searchSaleCustomers').addEventListener('click',searchSaleCustomers);
$('saleCustomerSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchSaleCustomers();}});
$('newSaleCustomer').addEventListener('click',()=>{$('saleCustomerDialog').close();$('createCustomerDialog').showModal();});
$('closeCreateCustomer').addEventListener('click',()=>{$('createCustomerDialog').close();});
$('createCustomerForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,shop=currentShop(),user=state.me;
  const result=await opsSubmit(form,'/api/operations/customers',()=>({name:form.elements.name.value,phone:form.elements.phone.value,email:form.elements.email.value,tin:form.elements.tin.value,address:form.elements.address.value}));
  if(result&&shop===currentShop()&&user===state.me){state.saleCustomer=result.customer;renderCart();form.reset();$('createCustomerDialog').close();}
});
function resetCustomerUi(){
  saleCustomerSearchSequence++;
  $('saleCustomerDialog').close();$('createCustomerDialog').close();
  $('saleCustomerResults').replaceChildren();$('saleCustomerSearch').value='';
  $('createCustomerForm').reset();$('createCustomerForm').querySelector('.ops-result').textContent='';
}
$('shopSelect').addEventListener('change',resetCustomerUi);
$('logoutBtn').addEventListener('click',resetCustomerUi);
