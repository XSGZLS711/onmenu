let softposInstallPrompt=null,softposInstalled=false;
const standaloneMode=matchMedia('(display-mode: standalone)');
function detectSoftposDevice(){
  const ua=navigator.userAgent;
  if(/iPad/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)||(/Android/i.test(ua)&&!/Mobile/i.test(ua)))return 'Tablet';
  if(/iPhone|iPod|Android|Mobile/i.test(ua)||navigator.userAgentData?.mobile)return 'Mobile phone';
  return 'Computer / laptop';
}
function updateSoftposInstall(){
  const installed=softposInstalled||standaloneMode.matches||navigator.standalone===true;
  for(const id of ['installSoftposBtn','loginInstallSoftpos'])$(id).hidden=installed;
  $('installSoftposNow').hidden=!softposInstallPrompt||installed;
  $('installSoftposDevice').textContent='Device: '+detectSoftposDevice();
  let steps;
  if(/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)){
    steps=['Open SoftPOS in Safari.','Tap Share, then Add to Home Screen.','Keep Open as Web App enabled if shown, then tap Add.'];
  }else if(detectSoftposDevice()!=='Computer / laptop'){
    steps=['Open SoftPOS in Chrome or Edge.','Open the browser menu and select Install app or Add to Home screen.','Confirm to add the SoftPOS shortcut.'];
  }else if(/Macintosh/i.test(navigator.userAgent)&&/Safari/i.test(navigator.userAgent)&&!/Chrome|Edg/i.test(navigator.userAgent)){
    steps=['In Safari, open the File menu.','Choose Add to Dock and confirm.','Open SoftPOS from its Dock icon.'];
  }else{
    steps=['Open SoftPOS in Chrome or Edge.','Click the install icon in the address bar, or find Install SoftPOS in the browser menu (Edge: Apps).','Confirm installation. The browser may also offer a desktop shortcut or taskbar pin.'];
  }
  $('installSoftposSteps').replaceChildren(...steps.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  $('installSoftposStatus').textContent=installed?'SoftPOS is running as an installed app.':softposInstallPrompt?'Tap Install now to add SoftPOS to this device.':'If your browser does not offer installation, use its shortcut or bookmark option.';
}
function openSoftposInstall(){updateSoftposInstall();$('installSoftposDialog').showModal();}
for(const id of ['installSoftposBtn','loginInstallSoftpos'])$(id).addEventListener('click',openSoftposInstall);
$('closeSoftposInstall').addEventListener('click',()=>$('installSoftposDialog').close());
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();softposInstallPrompt=event;updateSoftposInstall();});
window.addEventListener('appinstalled',()=>{softposInstalled=true;softposInstallPrompt=null;updateSoftposInstall();toast('SoftPOS installed. Open it from your app shortcut.');});
standaloneMode.addEventListener('change',updateSoftposInstall);
$('installSoftposNow').addEventListener('click',async()=>{
  const prompt=softposInstallPrompt;if(!prompt)return;
  $('installSoftposNow').disabled=true;
  try{
    await prompt.prompt();const choice=await prompt.userChoice;softposInstallPrompt=null;
    if(choice.outcome==='accepted'){softposInstalled=true;updateSoftposInstall();$('installSoftposStatus').textContent='Installation accepted. Open SoftPOS from its shortcut when installation finishes.';}
    else{updateSoftposInstall();$('installSoftposStatus').textContent='Installation cancelled. You can install later from the browser menu.';}
  }catch{softposInstallPrompt=null;updateSoftposInstall();$('installSoftposStatus').textContent='Use the browser installation steps below.';}
  finally{$('installSoftposNow').disabled=false;}
});
updateSoftposInstall();
