// Use a snapshot of the selected report so later view changes cannot mix report values.
function openOpsReportPrint(){
  const paper=$('opsReport').firstElementChild;if(!paper||!opsState.report)return;
  $('opsReportPrintPreview').replaceChildren(paper.cloneNode(true));
  $('opsReportPrintHeading').textContent='Print '+opsState.report.kind+' Report';
  const choice=$('opsReportPrintFormat');let saved;
  try{saved=localStorage.getItem('softpos.reportPrintFormat');}catch{}
  choice.value=['THERMAL_58','THERMAL_80','A4','A5'].includes(saved)?saved:receiptPaperWidthMm()===58?'THERMAL_58':'THERMAL_80';
  $('opsReportPrintDialog').showModal();
}
for(const id of ['closeOpsReportPrint','cancelOpsReportPrint'])$(id).onclick=()=>$('opsReportPrintDialog').close();
$('opsReportPrintFormat').onchange=()=>{try{localStorage.setItem('softpos.reportPrintFormat',$('opsReportPrintFormat').value);}catch{}};
async function printOpsReportPage(format,paper){
  if(!['A4','A5'].includes(format))throw Error('Choose A4 or A5 report paper.');
  const frame=document.createElement('iframe');frame.title=format+' report print';frame.setAttribute('aria-hidden','true');
  frame.style.cssText='position:fixed;left:-10000px;top:0;width:'+(format==='A5'?148:210)+'mm;height:1px;border:0';
  let timer;const cleanup=()=>{clearTimeout(timer);frame.remove();};
  try{
    const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
    frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><title>Report</title><style>@page{size:'+format+' portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#172b3a;font:13px/1.45 Arial,sans-serif}article{width:100%;max-width:170mm;margin:auto}h2,h3{margin:0 0 10px}p{margin:6px 0}dl{margin:16px 0}dl>div{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #dce4e9;break-inside:avoid}dt{min-width:0;overflow-wrap:anywhere}dd{margin:0;font-weight:bold;white-space:nowrap}</style></head><body>'+paper.outerHTML+'</body></html>';
    document.body.append(frame);await loaded;if(frame.contentDocument.fonts)await frame.contentDocument.fonts.ready;
    frame.contentWindow.addEventListener('afterprint',cleanup,{once:true});timer=setTimeout(cleanup,60000);frame.contentWindow.focus();frame.contentWindow.print();
  }catch(error){cleanup();throw error;}
}
$('confirmOpsReportPrint').onclick=async()=>{
  const paper=$('opsReportPrintPreview').firstElementChild;if(!paper)return;
  const button=$('confirmOpsReportPrint');button.disabled=true;
  try{
    const format=$('opsReportPrintFormat').value;
    if(format==='THERMAL_58'||format==='THERMAL_80')await printThermalReceipt(paper,format==='THERMAL_58'?58:80);
    else await printOpsReportPage(format,paper);
  }catch(error){toast(error.message||'Could not prepare this report for printing.',true);}
  finally{button.disabled=false;}
};

const reportPrintShowLogin=showLogin;showLogin=function(){if($('opsReportPrintDialog').open)$('opsReportPrintDialog').close();$('opsReportPrintPreview').replaceChildren();reportPrintShowLogin();};
