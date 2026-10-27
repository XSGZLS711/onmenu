let poPrintSequence=0;
async function openPoPrint(id){
  const sequence=++poPrintSequence,shop=currentShop();
  if(!$('poPrintDialog').open)$('poPrintDialog').showModal();
  $('poPrintFilter').hidden=!!id;$('poBackToList').hidden=!id;
  $('poPrintPaper').replaceChildren();$('poPrintList').textContent='Loading purchase orders…';$('printPoDocument').hidden=true;
  try{
    const params=new URLSearchParams({shopId:shop});
    if(id)params.set('id',Number(id));
    else{
      if($('poPrintNumber').value.trim())params.set('poNo',$('poPrintNumber').value.trim());
      if($('poPrintSupplier').value.trim())params.set('supplier',$('poPrintSupplier').value.trim());
      if($('poPrintDate').value)params.set('date',$('poPrintDate').value);
    }
    const data=await api('/api/inventory/purchase-order-print?'+params);
    if(sequence!==poPrintSequence||shop!==currentShop())return;
    if(!id){
      $('poPrintList').innerHTML=data.map((p,i)=>`<button class="customer-row" type="button" data-print-po="${i}"><span><strong>${esc(p.number)}</strong><small>${esc(p.supplier)}</small></span><span>${new Date(p.date).toLocaleDateString()}</span></button>`).join('')||'<p>No purchase orders found.</p>';
      $('poPrintList').querySelectorAll('[data-print-po]').forEach(b=>b.addEventListener('click',()=>openPoPrint(data[Number(b.dataset.printPo)].id)));return;
    }
    $('poPrintList').replaceChildren();$('poPrintPaper').innerHTML=renderPoDocument(data);$('printPoDocument').hidden=false;
  }catch(e){if(sequence===poPrintSequence)$('poPrintList').textContent=e.message;}
}
function renderPoDocument(data){
  const h=data.header,c=data.company,total=data.lines.filter(x=>!x.cancelled).reduce((sum,x)=>sum+Number(x.total),0);
  const date=value=>value?new Date(value).toLocaleDateString('en-FJ',{day:'2-digit',month:'short',year:'numeric'}):'';
  return `<article class="po-paper"><header>${data.logoUrl?`<img class="po-company-logo" src="${esc(data.logoUrl)}" alt="Company logo">`:''}<div><h2>${esc(c.name)}</h2>${[c.address,c.phone?'Phone: '+c.phone:'',c.email,c.tin?'TIN: '+c.tin:''].filter(Boolean).map(x=>`<p>${esc(x)}</p>`).join('')}</div><div class="po-heading"><h1>PURCHASE ORDER</h1><strong>${esc(h.number)}</strong>${h.cancelled?'<p>CANCELLED</p>':''}</div></header><div class="po-details"><div><small>SUPPLIER</small><strong>${esc(h.supplier)}</strong></div><div><p>Date: ${date(h.date)}</p><p>Shop: ${esc(h.shop)}</p></div></div><table><thead><tr><th>Code</th><th>Product</th><th>UOM</th><th class="numeric">Qty</th><th class="numeric">Unit cost</th><th class="numeric">Amount</th></tr></thead><tbody>${data.lines.map(x=>`<tr${x.cancelled?' class="po-cancelled"':''}><td>${esc(x.code)}</td><td>${esc(x.name)}${x.cancelled?' (cancelled)':''}</td><td>${esc(x.uom)}</td><td class="numeric">${Number(x.quantity).toLocaleString('en-FJ',{maximumFractionDigits:4})}</td><td class="numeric">${Number(x.cost).toLocaleString('en-FJ',{minimumFractionDigits:2,maximumFractionDigits:4})}</td><td class="numeric">${money(x.total)}</td></tr>`).join('')}</tbody></table><div class="po-total">Order total <strong>${money(total)}</strong></div>${h.note?`<p class="po-note"><strong>Notes:</strong> ${esc(h.note)}</p>`:''}<footer><div><span class="po-signature-line"></span><span>Authorised signature</span></div><div><span class="po-signature-line"></span><span>Date</span></div></footer></article>`;
}
$('browsePoPrint').addEventListener('click',()=>openPoPrint());
$('poPrintFilter').addEventListener('submit',e=>{e.preventDefault();openPoPrint();});
$('clearPoPrintFilter').addEventListener('click',()=>{$('poPrintFilter').reset();openPoPrint();});
$('poBackToList').addEventListener('click',()=>openPoPrint());
function closePoPrint(){poPrintSequence++;$('poPrintDialog').close();}
$('closePoPrint').addEventListener('click',closePoPrint);$('closePoPrintBottom').addEventListener('click',closePoPrint);
$('poPrintDialog').addEventListener('cancel',()=>poPrintSequence++);
$('shopSelect').addEventListener('change',closePoPrint);$('logoutBtn').addEventListener('click',closePoPrint);
let poPrintFrame=null;
$('printPoDocument').addEventListener('click',async()=>{
  const button=$('printPoDocument'),sequence=poPrintSequence;button.disabled=true;
  try{
    poPrintFrame?.remove();
    const frame=document.createElement('iframe');poPrintFrame=frame;
    frame.title='Purchase order print document';frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0;';
    const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
    frame.srcdoc=`<!doctype html><html><head><meta charset="utf-8"><base href="${esc(new URL('.',location.href).href)}"><title>Purchase order</title><link rel="stylesheet" href="po-print.css?v=2"></head><body>${$('poPrintPaper').innerHTML}</body></html>`;
    document.body.append(frame);await loaded;
    const doc=frame.contentDocument;
    if(!doc.querySelector('link').sheet)throw new Error('Print styles unavailable');
    await Promise.all([...doc.images].map(img=>img.decode()));await doc.fonts.ready;
    if(sequence!==poPrintSequence){frame.remove();return;}
    frame.contentWindow.addEventListener('afterprint',()=>{frame.remove();if(poPrintFrame===frame)poPrintFrame=null;},{once:true});
    frame.contentWindow.focus();frame.contentWindow.print();
  }
  catch{poPrintFrame?.remove();poPrintFrame=null;toast('Could not prepare the PO for printing. Reopen it and try again.',true);}
  finally{button.disabled=false;}
});
window.addEventListener('afterprint',()=>document.body.classList.remove('printing-po'));
