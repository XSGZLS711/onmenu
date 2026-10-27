let refundInvoiceSearchVersion=0,refundInvoiceSearchPage=1,refundInvoiceSearchRows=[],refundInvoiceSearchShop=0;
function refundInvoiceRequestPending(){const form=$('refundForm');return sessionStorage.getItem(opsKey(form))&&!sessionStorage.getItem(opsKey(form)+'.editable');}
function closeRefundInvoiceSearch(){refundInvoiceSearchVersion++;if($('refundInvoiceSearchDialog').open)$('refundInvoiceSearchDialog').close();$('refundInvoiceSearchRows').replaceChildren();refundInvoiceSearchRows=[];}
async function loadRefundInvoiceChoices(page=1){
  const shop=currentShop(),version=++refundInvoiceSearchVersion;refundInvoiceSearchShop=shop;refundInvoiceSearchPage=page;
  const dialog=$('refundInvoiceSearchDialog'),status=$('refundInvoiceSearchStatus'),button=$('refundInvoiceSearchForm').querySelector('button');
  status.textContent='Loading invoices…';button.disabled=true;$('refundInvoicePrevious').disabled=true;$('refundInvoiceNext').disabled=true;$('refundInvoiceSearchRows').replaceChildren();refundInvoiceSearchRows=[];
  try{
    const query=new URLSearchParams({shopId:shop,search:$('refundInvoiceSearchText').value.trim(),page});
    const data=await api('/api/operations/refund-invoices?'+query);
    if(version!==refundInvoiceSearchVersion||shop!==currentShop()||!dialog.open)return;
    refundInvoiceSearchRows=data.rows;
    const pages=Math.max(1,Math.ceil(data.totalCount/data.pageSize));
    status.textContent=data.totalCount?data.totalCount+' invoices at this shop — newest first. Select an invoice to view its items.':'No invoices found.';
    $('refundInvoicePage').textContent='Page '+page+' of '+pages;
    $('refundInvoicePrevious').disabled=page<=1;$('refundInvoiceNext').disabled=page>=pages;
    $('refundInvoiceSearchRows').innerHTML=data.rows.map((row,index)=>'<tr><td><strong>'+esc(row.invoiceNo)+'</strong></td><td>'+esc(new Date(row.createdUtc).toLocaleString('en-FJ',{dateStyle:'short',timeStyle:'short'}))+'</td><td>'+esc(row.customerName)+'</td><td>'+esc(row.cashier)+'</td><td class="numeric">'+esc(money(row.total))+'</td><td>'+esc(row.status)+'</td><td><button class="secondary" type="button" data-refund-invoice-choice="'+index+'">Select</button></td></tr>').join('')||'<tr><td colspan="7">No invoices found.</td></tr>';
  }catch(error){if(version===refundInvoiceSearchVersion&&dialog.open)status.textContent=error.message;}
  finally{if(version===refundInvoiceSearchVersion)button.disabled=false;}
}
$('openRefundInvoiceSearch').onclick=()=>{
  if(!state.permissions?.Refund)return;
  if(refundInvoiceRequestPending()){opsMessage($('refundFind'),'Finish the saved refund request before loading another invoice.',true);return;}
  $('refundInvoiceSearchText').value='';$('refundInvoiceSearchDialog').showModal();loadRefundInvoiceChoices();$('refundInvoiceSearchText').focus();
};
for(const id of ['closeRefundInvoiceSearch','cancelRefundInvoiceSearch'])$(id).onclick=closeRefundInvoiceSearch;
$('refundInvoiceSearchDialog').addEventListener('close',()=>{refundInvoiceSearchVersion++;$('refundInvoiceSearchForm').querySelector('button').disabled=false;});
$('refundInvoiceSearchForm').onsubmit=event=>{event.preventDefault();loadRefundInvoiceChoices(1);};
$('refundInvoicePrevious').onclick=()=>loadRefundInvoiceChoices(Math.max(1,refundInvoiceSearchPage-1));
$('refundInvoiceNext').onclick=()=>loadRefundInvoiceChoices(refundInvoiceSearchPage+1);
$('refundInvoiceSearchRows').onclick=event=>{
  const button=event.target.closest('[data-refund-invoice-choice]');if(!button||refundInvoiceSearchShop!==currentShop())return;
  if(refundInvoiceRequestPending()){toast('Finish the saved refund request before loading another invoice.',true);return;}
  const invoice=refundInvoiceSearchRows[Number(button.dataset.refundInvoiceChoice)];if(!invoice)return;
  $('refundFind').elements.invoiceNo.value=invoice.invoiceNo;closeRefundInvoiceSearch();$('refundFind').requestSubmit();
};
$('shopSelect').addEventListener('change',closeRefundInvoiceSearch);
const invoiceSearchReset=resetExtraModules;resetExtraModules=function(){closeRefundInvoiceSearch();invoiceSearchReset();};
const invoiceSearchLogin=showLogin;showLogin=function(){closeRefundInvoiceSearch();invoiceSearchLogin();};
