let reportExportSequence=0,preparedReportExport=null,reportExportFrame=null;
function resetReportExport(){
  ++reportExportSequence;preparedReportExport=null;reportExportFrame?.remove();reportExportFrame=null;
  if($('reportExportDialog').open)$('reportExportDialog').close();
}
function reportExportTable(result){
  if(isInventoryReport(result.mode))return inventoryReportTable(result);
  const number=v=>reportQuantity(v),amount=v=>'FJD '+Number(v||0).toFixed(2);
  if(result.mode==='closing')return {head:['Description','Amount (FJD)'],body:result.rows.map(r=>[r.label,amount(r.amount)])};
  if(result.mode==='productshopsales'){const groups=productShopReportGroups(result).map(group=>({name:group.name,body:group.rows.map(r=>[r.code,r.name,number(r.quantity),amount(r.netSales)])}));return {head:['Product Code','Product Name','Qty Sold','Total'],body:groups.flatMap(g=>g.body),groups};}
  if(result.mode==='summary'||result.mode==='productsales')return {head:[...(result.mode==='productshopsales'?['Shop']:[]),...(['productsales','productshopsales'].includes(result.mode)?['Code']:[]),{product:'Product',user:'User',location:'Location',date:'Date'}[result.groupBy],'Invoices','Refunds','Net qty','Sales','Refund value','VAT','Discount','Net sales'],body:result.rows.map(r=>[...(result.mode==='productshopsales'?[r.shopName]:[]),...(['productsales','productshopsales'].includes(result.mode)?[r.code]:[]),r.name,number(r.invoiceCount),number(r.refundCount),number(r.quantity),amount(r.sales),amount(r.refunds),amount(r.vat),amount(r.discounts),amount(r.netSales)])};
  return {head:['Date / time','Invoice','Type','Product','Description','User','Shop','Location','Qty','Unit price','Discount','VAT','Line total'],body:result.rows.map(r=>[String(r.invoiceDate).replace('T',' ').slice(0,16),r.invoiceNo,r.isRefund?'Refund':'Sale',[r.productCode,r.productName].filter(Boolean).join(' - '),r.description||'',r.cashier,r.shopName,r.locationName,number(r.quantity),amount(r.unitPrice),amount(r.discount),amount(r.vat),amount(r.total)])};
}
async function collectReportExport(filters,sequence){
  let result=null,rows=[],pages=1;
  for(let page=1;page<=pages;page++){
    if(sequence!==reportExportSequence)throw new Error('Report preparation cancelled.');
    const params=reportRequestParams(filters,page);
    const batch=await api(reportDataEndpoint(filters.mode)+'?'+params);
    if(sequence!==reportExportSequence)throw new Error('Report preparation cancelled.');
    if(!result){result=batch;pages=Math.max(1,Math.ceil(batch.rowCount/batch.pageSize));}
    else if(batch.rowCount!==result.rowCount||JSON.stringify(batch.totals)!==JSON.stringify(result.totals))throw new Error('Sales changed while preparing the report. Please run it again.');
    rows.push(...batch.rows);$('reportExportStatus').textContent=`Preparing all matching rows: ${rows.length} of ${result.rowCount}…`;
  }
  if(rows.length!==result.rowCount)throw new Error('The complete report could not be loaded. Please run it again.');
  return {...result,rows};
}
async function prepareReportExport(action){
  if(!reportApplied||!state.permissions?.Reports)return;
  resetReportExport();const sequence=reportExportSequence;
  const filters={...reportApplied},labels={...reportAppliedLabels},company=state.bootstrap.companyName;
  $('reportExportHeading').textContent={print:'Print report',email:'Email report',share:'Share report'}[action];
  $('reportExportStatus').textContent='Preparing all matching rows…';$('reportExportControls').hidden=true;$('reportExportDialog').showModal();
  try{
    const result=await collectReportExport(filters,sequence);
    const inventory=isInventoryReport(result.mode),table=reportExportTable(result),title=inventory?inventoryReportTitles[result.mode]:salesReportTitles[result.mode]||'Sales Report';
    const lines=inventory?[result.mode==='movement'?`Period: ${filters.from} to ${filters.to}`:`Current snapshot: ${new Date().toLocaleString()}`,`Location: ${labels.locationId} | Product: ${labels.productId}`,`Category: ${labels.categoryId}`,...(result.mode==='movement'?[`User: ${labels.cashier} | Movement: ${labels.movementType}`]:result.mode==='products'?[`Stock type: ${labels.stockType} | Status: ${labels.active}`]:[`Component: ${labels.componentId} | Status: ${labels.active}`])]:[`Period: ${filters.from} ${filters.fromTime||'00:00'} to ${filters.to} ${filters.toTime||'23:59'}`,`Shop: ${labels.shopId||$('shopSelect').selectedOptions[0]?.textContent||''} | Location: ${labels.locationId} | User: ${labels.cashier}`,...(result.mode==='closing'?[]:[`Product: ${labels.productId}`]),...(result.mode==='summary'?[`Summary by: ${labels.groupBy}`]:[])];
    const totals=result.mode==='productshopsales'?`Total: FJD ${Number(result.totals.netSales||0).toFixed(2)}`:result.mode==='closing'?`Total Received: FJD ${Number(result.totals.totalReceived||0).toFixed(2)}`:inventory?inventoryReportKpis(result).map(([label,value])=>label+': '+value).join('   '):`Sales: FJD ${Number(result.totals.sales).toFixed(2)}   Refunds: FJD ${Number(result.totals.refunds).toFixed(2)}   Net sales: FJD ${Number(result.totals.netSales).toFixed(2)}   VAT: FJD ${Number(result.totals.vat).toFixed(2)}`;
    const footnote=inventory?inventoryReportFootnote(result.mode):salesReportFootnote(result.mode);
    const closing=['closing','productshopsales'].includes(result.mode),pdf=new jspdf.jsPDF({orientation:closing?'portrait':'landscape',unit:'mm',format:'a4'}),width=pdf.internal.pageSize.getWidth()-20,height=pdf.internal.pageSize.getHeight();
    pdf.setProperties({title:company+' - '+title});
    const logo=new Image();logo.src='images/softpos-logo.png';await logo.decode();
    if(sequence!==reportExportSequence)return;
    pdf.addImage(logo,'PNG',10,8,18,15);pdf.setFontSize(13);pdf.setFont('helvetica','bold');pdf.text(company,32,14);pdf.setFontSize(11);pdf.text(title,32,21);
    pdf.setFont('helvetica','normal');pdf.setFontSize(8);
    const meta=pdf.splitTextToSize(lines.join('\n'),width);pdf.text(meta,10,30);
    let top=31+meta.length*4;pdf.setFontSize(8);pdf.text(pdf.splitTextToSize(totals,width),10,top);top+=9;
    pdf.setFontSize(7);const footerLines=pdf.splitTextToSize(footnote,width-15),footerHeight=footerLines.length*3+9;
    pdf.autoTable({head:[table.head],body:table.groups?table.groups.flatMap(group=>[[{content:group.name,colSpan:4,styles:{fontStyle:'bold',fillColor:[230,239,246]}}],...group.body]):table.body,startY:top,margin:{top:12,left:10,right:10,bottom:footerHeight},styles:{fontSize:result.mode==='detail'?7:8,cellPadding:2,overflow:'linebreak'},headStyles:{fillColor:[15,39,68]},alternateRowStyles:{fillColor:[245,248,251]},rowPageBreak:'avoid'});
    const pageCount=pdf.getNumberOfPages();for(let page=1;page<=pageCount;page++){pdf.setPage(page);pdf.setFontSize(7);pdf.text(footerLines,10,height-footerHeight+3);pdf.text(`Page ${page} of ${pageCount}`,width+10,height-5,{align:'right'});}
    const name=`SoftPOS-${result.mode}-${filters.from||reportDate(new Date())}${filters.to?'-to-'+filters.to:''}.pdf`,file=new File([pdf.output('blob')],name,{type:'application/pdf'});
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 ${closing?'portrait':'landscape'};margin:10mm}body{font:9pt Arial;color:#0f2744}header{display:flex;gap:14px;align-items:center}header img{width:65px}h1{font-size:15pt;margin:0}h2{font-size:12pt;margin:5px 0}p{white-space:pre-wrap}table{width:100%;border-collapse:collapse;table-layout:auto;font-size:${result.mode==='detail'?'7':'8'}pt}th,td{padding:5px;border-bottom:1px solid #d8e3ee;text-align:left;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#edf2f7}thead{display:table-header-group}tr{break-inside:avoid}footer{margin-top:12px;font-size:7pt}</style></head><body><header><img src="${esc(location.origin)}/images/softpos-logo.png" alt="SoftPOS"><div><h1>${esc(company)}</h1><h2>${esc(title)}</h2></div></header><p>${esc(lines.join('\n'))}</p><p><strong>${esc(totals)}</strong></p>${table.groups?table.groups.map(group=>'<h3>'+esc(group.name)+'</h3>'+reportTable(table.head,group.body.map(row=>row.map(esc)))).join(''):reportTable(table.head,table.body.map(row=>row.map(esc)))}<footer>${esc(footnote)}</footer></body></html>`;
    if(sequence!==reportExportSequence)return;
    const thermalHtml=(table.groups?'<style>table{font-size:11px}th:first-child,td:first-child{width:18%}th:nth-child(2),td:nth-child(2){width:42%}th:nth-child(3),td:nth-child(3){width:14%;text-align:right}th:last-child,td:last-child{width:26%;text-align:right}thead{display:table-header-group}tr{break-inside:avoid}</style>':'')+'<h2>'+esc(company)+'</h2><h3>'+esc(title)+'</h3><p>'+esc(lines.join('\n')).replaceAll('\n','<br>')+'</p><p><strong>'+esc(totals)+'</strong></p>'+(table.groups?table.groups.map(group=>'<h3>'+esc(group.name)+'</h3>'+reportTable(table.head,group.body.map(row=>row.map(esc)))).join(''):table.body.map(row=>result.mode==='closing'?'<dl><div><dt>'+esc(row[0])+'</dt><dd>'+esc(row[1])+'</dd></div></dl>':'<section style="border-top:1px solid black;margin-top:6px;padding-top:4px;break-inside:avoid"><h3>'+esc(row[0])+'</h3><dl>'+row.slice(1).map((value,index)=>'<div><dt>'+esc(table.head[index+1])+'</dt><dd style="flex-shrink:1;max-width:65%;overflow-wrap:anywhere">'+esc(value)+'</dd></div>').join('')+'</dl></section>').join(''))+'<small>'+esc(footnote)+'</small>';
    preparedReportExport={file,html,title,company,lines,thermalHtml};
    let printFormat;try{printFormat=localStorage.getItem('softpos.reportExportPrintFormat');}catch{}
    $('reportExportPrintFormat').value=['A4','THERMAL_58','THERMAL_80'].includes(printFormat)?printFormat:'A4';
    const canShare=typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]});
    $('shareReportPdf').hidden=!canShare;
    $('reportExportStatus').textContent=`${result.rows.length} matching rows prepared. ${action==='email'?(canShare?'Tap Email / Share PDF and choose your email app.':'Download the PDF, then open an email draft and attach the downloaded file.'):canShare?'Print, download, or choose an app to share the PDF.':'Print or download the PDF to share using your preferred app.'}`;
    $('reportExportControls').hidden=false;
  }catch(error){if(sequence===reportExportSequence)$('reportExportStatus').textContent=error.message;}
}
function downloadReportPdf(){
  if(!preparedReportExport)return;
  const url=URL.createObjectURL(preparedReportExport.file),link=document.createElement('a');link.href=url;link.download=preparedReportExport.file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function printPreparedReport(){
  if(!preparedReportExport)return;
  const sequence=reportExportSequence;
  try{
    const format=$('reportExportPrintFormat').value;
    if(format==='THERMAL_58'||format==='THERMAL_80'){
      const paper=document.createElement('article');paper.innerHTML=preparedReportExport.thermalHtml;
      await printThermalReceipt(paper,format==='THERMAL_58'?58:80,297);return;
    }
    reportExportFrame?.remove();const frame=document.createElement('iframe');reportExportFrame=frame;frame.title='Sales report print document';frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0';
    const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));frame.srcdoc=preparedReportExport.html;document.body.append(frame);await loaded;
    await Promise.all([...frame.contentDocument.images].map(img=>img.decode()));await frame.contentDocument.fonts.ready;
    if(sequence!==reportExportSequence){frame.remove();return;}
    frame.contentWindow.addEventListener('afterprint',()=>{frame.remove();if(reportExportFrame===frame)reportExportFrame=null;},{once:true});frame.contentWindow.focus();frame.contentWindow.print();
  }catch(error){toast('Could not open printing. Download the PDF and print it instead.',true);}
}
document.querySelectorAll('[data-report-export]').forEach(button=>button.addEventListener('click',()=>prepareReportExport(button.dataset.reportExport)));
$('closeReportExport').addEventListener('click',()=>$('reportExportDialog').close());
$('reportExportDialog').addEventListener('close',resetReportExport);
$('downloadReportPdf').addEventListener('click',downloadReportPdf);
$('printReportPdf').addEventListener('click',printPreparedReport);
$('reportExportPrintFormat').addEventListener('change',()=>{try{localStorage.setItem('softpos.reportExportPrintFormat',$('reportExportPrintFormat').value);}catch{}});
$('shareReportPdf').addEventListener('click',async()=>{if(!preparedReportExport)return;try{await navigator.share({files:[preparedReportExport.file],title:preparedReportExport.title});}catch(error){if(error.name!=='AbortError')toast('Sharing is unavailable. Download the PDF and attach it in your app.',true);}});
$('emailReportDraft').addEventListener('click',()=>{if(!preparedReportExport)return;const report=preparedReportExport;location.href='mailto:?'+new URLSearchParams({subject:report.company+' - '+report.title,body:report.lines.join('\n')+'\n\nPlease attach the downloaded report: '+report.file.name}).toString().replace(/\+/g,'%20');});
