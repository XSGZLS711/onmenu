function invoicePrintHtml(format,sale=state.receiptSale,receipt=state.fiscalReceipt){
  if(!['A4','A5'].includes(format))throw Error('Choose A4 or A5 invoice paper.');
  if(!sale||!receipt)throw Error('The invoice is not ready for printing.');
  const compact=format==='A5',company=state.receiptCompany||state.branchCompanyReceipt||state.bootstrap?.companyReceipt||{};
  const amount=value=>Number(value||0).toLocaleString('en-FJ',{minimumFractionDigits:2,maximumFractionDigits:2});
  const quantity=value=>Number(value||0).toLocaleString('en-FJ',{maximumFractionDigits:4});
  const shop=state.bootstrap?.shops?.find(row=>row.shopId===state.receiptShopId)?.shopName||'';
  const date=new Date(state.receiptCreatedUtc||Date.now()).toLocaleString('en-FJ',{dateStyle:'medium',timeStyle:'short'});
  const lines=sale.lines||[],payment=sale.payment,parts=payment.parts||[payment];
  const vat=lines.reduce((sum,line)=>sum+(line.vatAmount!=null?Number(line.vatAmount):Number(line.vatRate)>0?Math.round(Number(line.total)*Number(line.vatRate)/(100+Number(line.vatRate))*100)/100:0),0);
  const discount=lines.reduce((sum,line)=>sum+Number(line.discountAmount||0),0);
  const pair=(label,value,classes='')=>`<div class="${classes}"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  const qr=/^data:image\/(gif|png|jpeg);base64,/.test(receipt.verificationQrCode||'')?receipt.verificationQrCode:null;
  const fiscal=!receipt.nonFiscal&&receipt.journal;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${esc(sale.invoiceNo)}</title><style>
    @page{size:${format} portrait;margin:${compact?10:14}mm}
    *{box-sizing:border-box}html,body{margin:0;padding:0;color:#172b3a;background:white;font-family:Arial,Helvetica,sans-serif}
    body{font-size:${compact?10:11.5}px;line-height:1.45}main{width:100%;max-width:${compact?128:182}mm;margin:auto}
    header{display:flex;justify-content:space-between;gap:18px;padding-bottom:14px;border-bottom:2px solid #164563;break-inside:avoid}
    .company{min-width:0;flex:1}.company h1{font-size:${compact?18:23}px;line-height:1.15;margin:0 0 7px;overflow-wrap:anywhere}
    p{margin:3px 0;overflow-wrap:anywhere}.document{text-align:right;flex-shrink:0}.document h2{font-size:${compact?21:28}px;letter-spacing:2px;margin:0;color:#164563}.document strong{display:block;font-size:${compact?12:15}px}
    .status{padding:6px 8px;border:1px solid #687d8b;margin:12px 0;font-size:${compact?9:10}px;font-weight:bold;letter-spacing:.3px}
    .details{display:flex;justify-content:space-between;gap:16px;margin:14px 0 18px;break-inside:avoid}.details>div{min-width:0;max-width:58%}.details small{display:block;font-weight:bold;letter-spacing:1px;color:#536c7b;margin-bottom:4px}.details strong{font-size:${compact?12:14}px}.sale-meta{text-align:right}
    table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{padding:8px 5px;background:#eaf0f4;color:#164563;border-bottom:1px solid #9db2c0;font-size:${compact?9:10}px;text-align:left}td{padding:9px 5px;border-bottom:1px solid #dce4e9;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}
    th:first-child,td:first-child{width:6%;padding-left:0;color:#647988}th:nth-child(2){width:44%}th:nth-child(3){width:12%}th:nth-child(4){width:18%}th:last-child{width:20%}th:nth-child(n+3),td:nth-child(n+3){text-align:right}
    td small{display:block;white-space:pre-wrap;font-size:${compact?9:10}px;margin-top:3px;color:#536c7b}.summary{margin:16px 0 0 auto;width:${compact?'78%':'58%'};break-inside:avoid}dl{margin:0}dl>div{display:flex;justify-content:space-between;gap:12px;padding:4px 0}dt{min-width:0;overflow-wrap:anywhere}dd{margin:0;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}.grand{font-weight:bold;font-size:${compact?13:16}px;border-top:1px solid #9db2c0;border-bottom:1px solid #9db2c0;margin:5px 0;padding:7px 0!important}.change{font-weight:bold;border-top:1px solid #dce4e9;margin-top:4px;padding-top:7px!important}
    .note{margin-top:16px;padding-top:10px;border-top:1px solid #dce4e9;white-space:pre-wrap;overflow-wrap:anywhere}.note strong{display:block;margin-bottom:4px}.fiscal-copy{margin-top:22px;padding-top:12px;border-top:1px solid #9db2c0}.fiscal-copy h3{font-size:11px;letter-spacing:.5px}.fiscal-copy pre{font:10px/1.3 'Courier New',monospace;white-space:pre-wrap;overflow-wrap:anywhere}.fiscal-copy img{display:block;width:45mm;height:auto;margin:10px auto;break-inside:avoid}.verification{font-size:9px;overflow-wrap:anywhere}
    @media screen{body{padding:14px}main{min-height:50mm}}@media print{th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><main><header><div class="company"><h1>${esc(company.name||state.bootstrap?.companyName||'SoftPOS')}</h1>${[company.address,company.phone?'Phone: '+company.phone:'',company.email,company.tin?'TIN: '+company.tin:''].filter(Boolean).map(value=>`<p>${esc(value)}</p>`).join('')}</div><div class="document"><h2>${sale.isLayby?'LAYBY':sale.serviceTerms==='ACCOUNT'?'ACCOUNT SALES':sale.serviceTerms==='COD'?'CASH SALES':'INVOICE'}</h2><strong>${esc(sale.invoiceNo)}</strong><p>${esc(date)}</p>${sale.receiptNo?`<p>Receipt: ${esc(sale.receiptNo)}</p>`:''}</div></header>
    ${receipt.nonFiscal?'':'<p class="status">SANDBOX TRAINING - NOT VALID FOR TAX</p>'}
    <section class="details"><div><small>CUSTOMER</small><strong>${esc(sale.customer?.name||'Cash Customer')}</strong>${[sale.customer?.phone?'Phone: '+sale.customer.phone:'',sale.customer?.email,sale.customer?.tin?'TIN: '+sale.customer.tin:''].filter(Boolean).map(value=>`<p>${esc(value)}</p>`).join('')}</div><div class="sale-meta">${shop?`<p>Shop: ${esc(shop)}</p>`:''}${sale.salesRepName?`<p>Sales rep: ${esc(sale.salesRepName)}</p>`:''}</div></section>
    <table aria-label="Invoice items"><thead><tr><th>#</th><th>DESCRIPTION</th><th>QTY</th><th>UNIT FJD</th><th>AMOUNT FJD</th></tr></thead><tbody>${lines.map((line,index)=>{
      const name=line.serviceDescription||line.name;
      return `<tr><td>${index+1}</td><td style="white-space:pre-wrap">${esc(name)}${Number(line.discountAmount)>0?`<small>Discount included: ${amount(line.discountAmount)}</small>`:''}</td><td>${quantity(line.quantity)}</td><td>${amount(line.price)}</td><td>${amount(line.total)}</td></tr>`;
    }).join('')}</tbody></table>
    <section class="summary"><dl>${pair('Subtotal (ex VAT)',amount(Number(sale.total)-vat))}${pair('VAT included',amount(vat))}${discount>0?pair('Discounts included',amount(discount)):''}${Number(sale.surcharge)>0?pair('Credit card fee included',amount(sale.surcharge)):''}${pair('TOTAL FJD',amount(sale.total),'grand')}${payment.rounding?pair('Cash round-off',amount(payment.rounding))+pair('Amount due',amount(Number(sale.total)+Number(payment.rounding))):''}${parts.map(part=>pair(paymentLabel(part.method)+(part.bankName?' - '+part.bankName:''),amount(Number(part.applied)+Number(part.rounding||0)))).join('')}${pair('Amount paid',amount(payment.tendered))}${pair('Change',amount(payment.change),'change')}${sale.isLayby||sale.serviceTerms==='ACCOUNT'?pair('Total paid to account',amount(sale.total-sale.balance))+pair('Balance remaining',amount(sale.balance),'grand'):''}</dl></section>
    ${sale.customerPoNumber?`<section class="note"><strong>PO NO</strong>${esc(sale.customerPoNumber)}</section>`:''}
    ${sale.invoiceReference?`<section class="note"><strong>REFERENCE</strong>${esc(sale.invoiceReference)}</section>`:''}
    ${sale.customerDetail&&sale.customerDetail!==sale.customer?.name?`<section class="note"><strong>CUSTOMER DETAIL</strong>${esc(sale.customerDetail)}</section>`:''}
    ${sale.additionalNote?`<section class="note"><strong>NOTE</strong>${esc(sale.additionalNote)}</section>`:''}
    ${fiscal?`<section class="fiscal-copy"><h3>RECEIPT DETAILS</h3><pre>${esc(receipt.journal)}</pre>${qr?`<img src="${esc(qr)}" alt="Receipt verification QR code">`:''}${receipt.verificationUrl?`<p class="verification">Verification: ${esc(receipt.verificationUrl)}</p>`:''}</section>`:''}
  </main></body></html>`;
}

async function printInvoicePage(format){
  const html=invoicePrintHtml(format),frame=document.createElement('iframe');
  frame.title=format+' invoice print';frame.setAttribute('aria-hidden','true');
  frame.style.cssText=`position:fixed;left:-10000px;top:0;width:${format==='A5'?148:210}mm;height:1px;border:0`;
  let timer;const cleanup=()=>{clearTimeout(timer);frame.remove();};
  try{
    const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));frame.srcdoc=html;document.body.append(frame);await loaded;
    await Promise.all([...frame.contentDocument.images].map(img=>img.decode()));if(frame.contentDocument.fonts)await frame.contentDocument.fonts.ready;
    frame.contentWindow.addEventListener('afterprint',cleanup,{once:true});timer=setTimeout(cleanup,60000);frame.contentWindow.focus();frame.contentWindow.print();
  }catch(error){cleanup();throw error;}
}

const invoicePrintChoice=document.getElementById('invoicePrintFormat');
if(invoicePrintChoice){
  try{const saved=localStorage.getItem('softpos.invoicePrintFormat');if(['RECEIPT','A4','A5'].includes(saved))invoicePrintChoice.value=saved;}catch{}
  invoicePrintChoice.addEventListener('change',()=>{try{localStorage.setItem('softpos.invoicePrintFormat',invoicePrintChoice.value);}catch{}});
}
