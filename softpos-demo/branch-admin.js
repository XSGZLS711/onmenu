// Branch selectors share the existing sales settings form and validation.
async function loadBranchSalesSettings(){
 const shop=byId('salesOptionsShop').value;
 await loadLaybySettings();
 const settings=await request('/api/admin/pos-settings?shopId='+shop);
 if(shop!==byId('salesOptionsShop').value)return;
 for(const key of ['priceKeypadEnabled','showProductCode','serviceDescriptionsEnabled','holdSalesEnabled','draftBillEnabled','salesRepEnabled','discountsEnabled','productComponentsEnabled','barcodeScanningEnabled'])byId(key).checked=!!settings[key];
 byId('receiptPaperWidthMm').value=String(settings.receiptPaperWidthMm);
 const methods=configuredPaymentMethods(settings.enabledPaymentMethods);document.querySelectorAll('[name=enabledPaymentMethod]').forEach(x=>x.checked=methods.includes(x.value));
 const options=await request('/api/admin/document-options?shopId='+shop);
 if(shop!==byId('salesOptionsShop').value)return;
 const form=byId('documentOptionsForm');for(const key of ['centralInvoice','centralReceipt','centralQuotation','centralTransfer','centralContacts','address','phone','email','tin'])form.elements[key].value=String(options[key]??'');
 byId('posSettingsResult').textContent='';byId('documentOptionsResult').textContent='';
}
byId('salesOptionsShop').addEventListener('change',()=>loadBranchSalesSettings().catch(e=>showError(e.message)));
byId('documentOptionsForm').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;
 try{const values=Object.fromEntries(new FormData(form));for(const key of ['centralInvoice','centralReceipt','centralQuotation','centralTransfer','centralContacts'])values[key]=values[key]==='true';await post('/api/admin/document-options',{...values,shopId:Number(byId('salesOptionsShop').value)});byId('documentOptionsResult').textContent='Document settings saved.';}catch(e){byId('documentOptionsResult').textContent=e.message;}finally{button.disabled=false;}
});
(async()=>{try{const data=await request('/api/admin/forms/lookups');byId('salesOptionsShop').innerHTML='<option value="0">Company defaults</option>'+data.shops.map(x=>`<option value="${x.shopId}">${escapeHtml(x.shopName)}</option>`).join('');await loadBranchSalesSettings();}catch(e){showError(e.message);}})();
