// Camera frames are decoded locally. Only the decoded barcode is sent to product lookup.
let barcodeSession=0,barcodeStream=null,barcodeControls=null,barcodeRunning=false,barcodeLookingUp=false;
let barcodeNativeTimer=null,barcodeRotatedTimer=null,barcodeTorchOn=false;
let barcodePhotoPicking=false;
let barcodeAudioContext=null;
let barcodeTargetInput=null;
function prepareBarcodeSound(){
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    barcodeAudioContext??=new Audio();
    if(barcodeAudioContext.state==='suspended')barcodeAudioContext.resume().catch(()=>{});
  }catch{/* Sound availability must not interrupt scanning. */}
}
function playBarcodeSound(){
  try{
    if(barcodeAudioContext?.state!=='running')return;
    const context=barcodeAudioContext,now=context.currentTime;
    const tone=context.createOscillator(),volume=context.createGain();
    tone.type='sine';tone.frequency.value=1100;
    volume.gain.setValueAtTime(0,now);volume.gain.linearRampToValueAtTime(.18,now+.01);volume.gain.linearRampToValueAtTime(0,now+.15);
    tone.connect(volume);volume.connect(context.destination);
    tone.onended=()=>{tone.disconnect();volume.disconnect();};tone.start(now);tone.stop(now+.16);
  }catch{/* Keep scanning if this device cannot play the confirmation sound. */}
}
function createBarcodeReader(){
  // DecodeHintType.TRY_HARDER=3 in the pinned ZXing 0.1.5 bundle.
  return new ZXingBrowser.BrowserMultiFormatReader(new Map([[3,true]]),{delayBetweenScanAttempts:180,delayBetweenScanSuccess:500,tryPlayVideoTimeout:10000});
}
function barcodeAllowed(){return !$('appScreen').hidden&&state.barcodeScanningEnabled&&(barcodeTargetInput?state.permissions?.Products:state.permissions?.Sales);}
function stopBarcodeCamera(){
  barcodeRunning=false;
  clearTimeout(barcodeNativeTimer);barcodeNativeTimer=null;barcodeTorchOn=false;
  clearTimeout(barcodeRotatedTimer);barcodeRotatedTimer=null;
  $('barcodeTorchBtn').hidden=true;
  barcodeControls?.stop();barcodeControls=null;
  barcodeStream?.getTracks().forEach(track=>track.stop());barcodeStream=null;
  $('barcodeScannerVideo').srcObject=null;
}
function syncBarcodeScanning(){
  $('scanBarcodeBtn').hidden=$('appScreen').hidden||!state.barcodeScanningEnabled||!state.permissions?.Sales;
  document.querySelectorAll('[data-scan-product-code]').forEach(button=>button.hidden=!state.barcodeScanningEnabled||!state.permissions?.Products);
  if(!barcodeAllowed()&&$('barcodeScannerDialog').open)$('barcodeScannerDialog').close();
}
async function acceptScannedBarcode(value,session=barcodeSession,withSound=true){
  const barcode=String(value||'').trim();
  if(!barcode||barcodeLookingUp||session!==barcodeSession||!barcodeAllowed()||!$('barcodeScannerDialog').open)return;
  stopBarcodeCamera();barcodeLookingUp=true;
  if(withSound)playBarcodeSound();
  $('barcodeManualInput').value=barcode;
  if(barcodeTargetInput){
    if(!barcodeTargetInput.isConnected||barcodeTargetInput.closest('form').hidden||!$('productsView').classList.contains('active-view')){$('barcodeScannerDialog').close();return;}
    if(barcode.length>barcodeTargetInput.maxLength){$('barcodeScannerStatus').textContent=`The scanned code is too long. Product codes allow ${barcodeTargetInput.maxLength} characters.`;}
    else{
      barcodeTargetInput.value=barcode;
      barcodeTargetInput.dispatchEvent(new Event('input',{bubbles:true}));barcodeTargetInput.dispatchEvent(new Event('change',{bubbles:true}));
      $('barcodeScannerStatus').textContent=`Product code ${barcode} filled in. Tap Done to return to the product form.`;
    }
    barcodeLookingUp=false;$('scanAnotherBarcode').disabled=false;return;
  }
  $('scanAnotherBarcode').disabled=true;
  $('barcodeScannerStatus').textContent=`Barcode ${barcode} read. Finding product…`;
  const shop=currentShop(),company=state.me.companyCode;
  try{
    const product=await api('/api/products/barcode?'+new URLSearchParams({shopId:String(shop),barcode}));
    if(session!==barcodeSession||!barcodeAllowed()||!$('barcodeScannerDialog').open||currentShop()!==shop||state.me.companyCode!==company)return;
    const before=state.cart.reduce((sum,line)=>sum+Number(line.quantity),0);
    addProduct(product.productId,product);
    const after=state.cart.reduce((sum,line)=>sum+Number(line.quantity),0);
    $('barcodeScannerStatus').textContent=after>before?`${product.productName} added to cart. Tap Scan another to continue.`:'Product could not be added. Check the entered price and your sale permissions.';
  }catch(error){if(session===barcodeSession)$('barcodeScannerStatus').textContent=`Barcode ${barcode} read. ${error.message}`;}
  finally{if(session===barcodeSession){barcodeLookingUp=false;$('scanAnotherBarcode').disabled=false;}}
}
async function startNativeBarcodeDetection(session){
  if(!window.BarcodeDetector)return;
  try{
    const supported=await BarcodeDetector.getSupportedFormats();
    const formats=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','codabar','qr_code','data_matrix'].filter(format=>supported.includes(format));
    if(!formats.length||session!==barcodeSession||!barcodeRunning)return;
    const detector=new BarcodeDetector({formats});
    const detect=async()=>{
      if(session!==barcodeSession||!barcodeRunning)return;
      try{
        const video=$('barcodeScannerVideo');
        if(video.readyState>=2){
          const codes=await detector.detect(video);
          if(session!==barcodeSession||!barcodeRunning)return;
          if(codes[0]?.rawValue){acceptScannedBarcode(codes[0].rawValue,session);return;}
        }
      }catch{/* ZXing continues if the browser's native detector cannot read this frame. */}
      if(session===barcodeSession&&barcodeRunning)barcodeNativeTimer=setTimeout(detect,180);
    };
    detect();
  }catch{/* Native barcode support is optional; ZXing remains active. */}
}
function decodeRotatedBarcode(reader,source,canvas){
  const width=source.videoWidth||source.naturalWidth||source.width;
  const height=source.videoHeight||source.naturalHeight||source.height;
  if(!width||!height)return null;
  canvas.width=height;canvas.height=width;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.translate(0,width);ctx.rotate(-Math.PI/2);ctx.drawImage(source,0,0,width,height);
  return reader.decodeFromCanvas(canvas);
}
function startRotatedBarcodeDetection(session){
  const reader=createBarcodeReader(),canvas=document.createElement('canvas');
  const detect=()=>{
    if(session!==barcodeSession||!barcodeRunning)return;
    try{
      const video=$('barcodeScannerVideo');
      if(video.readyState>=2){const result=decodeRotatedBarcode(reader,video,canvas);if(result){acceptScannedBarcode(result.getText(),session);return;}}
    }catch{/* A barcode may not be present in this frame. */}
    if(session===barcodeSession&&barcodeRunning)barcodeRotatedTimer=setTimeout(detect,350);
  };
  barcodeRotatedTimer=setTimeout(detect,350);
}
async function configureBarcodeCamera(stream,session){
  const track=stream.getVideoTracks?.()[0];
  if(!track)return;
  const caps=track.getCapabilities?.()||{};
  if(caps.focusMode?.includes('continuous')){
    try{await track.applyConstraints({advanced:[{focusMode:'continuous'}]});}catch{/* Keep scanning with the camera's default focus. */}
  }
  if(session!==barcodeSession||!barcodeRunning)return;
  $('barcodeTorchBtn').hidden=!caps.torch;
  $('barcodeTorchBtn').textContent='Light on';
  try{
    const cameras=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='videoinput');
    if(session!==barcodeSession||!barcodeRunning)return;
    const selected=track.getSettings?.().deviceId;
    $('barcodeCameraSelect').replaceChildren(...cameras.map((camera,index)=>{const option=document.createElement('option');option.value=camera.deviceId;option.textContent=camera.label||`Camera ${index+1}`;option.selected=camera.deviceId===selected;return option;}));
    $('barcodeCameraLabel').hidden=cameras.length<2;
  }catch{/* Camera selection is optional. */}
}
async function startBarcodeCamera(deviceId){
  if(!barcodeAllowed()||barcodeLookingUp)return;
  stopBarcodeCamera();const session=++barcodeSession;
  $('barcodeManualInput').value='';$('barcodeScannerStatus').textContent='Opening camera…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera unavailable. Open the app using HTTPS, or enter the barcode below.');
    if(!window.ZXingBrowser)throw new Error('Scanner could not load. Refresh the app, or enter the barcode below.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}}),width:{ideal:1920},height:{ideal:1080}}});
    if(session!==barcodeSession||!$('barcodeScannerDialog').open||!barcodeAllowed()){stream.getTracks().forEach(track=>track.stop());return;}
    barcodeStream=stream;barcodeRunning=true;
    $('barcodeScannerStatus').textContent='Keep the entire barcode visible and steady, about 15–25 cm away. Use Light on if needed.';
    configureBarcodeCamera(stream,session).catch(()=>{});
    const reader=createBarcodeReader();
    const controls=await reader.decodeFromStream(stream,$('barcodeScannerVideo'),(result,error,controls)=>{
      if(result&&barcodeRunning&&session===barcodeSession){controls.stop();acceptScannedBarcode(result.getText(),session);}
    });
    if(session!==barcodeSession||!barcodeRunning)controls.stop();else {barcodeControls=controls;startNativeBarcodeDetection(session);startRotatedBarcodeDetection(session);}
  }catch(error){
    if(session!==barcodeSession)return;
    stopBarcodeCamera();
    $('barcodeScannerStatus').textContent=error.name==='NotAllowedError'?'Camera permission was denied. Allow camera access in your browser settings, or enter the barcode below.':error.name==='NotFoundError'?'No camera found. Enter the barcode below.':error.name==='NotReadableError'?'Camera is busy. Close other camera apps and tap Scan another.':error.message;
  }
}
function openBarcodeScanner(target=null){
  barcodeTargetInput=target;if(!barcodeAllowed()){barcodeTargetInput=null;return;}
  $('barcodeScannerHeading').textContent=target?'Scan product code':'Scan product barcode';
  $('barcodeManualForm').querySelector('button').textContent=target?'Use code':'Find product';
  $('barcodeManualInput').maxLength=target?target.maxLength:250;
  prepareBarcodeSound();$('barcodeScannerDialog').showModal();startBarcodeCamera();
}
$('scanBarcodeBtn').addEventListener('click',()=>openBarcodeScanner());
document.querySelectorAll('[data-scan-product-code]').forEach(button=>button.addEventListener('click',()=>openBarcodeScanner(button.closest('form').elements.code)));
for(const id of ['closeBarcodeScanner','doneBarcodeScanner'])$(id).addEventListener('click',()=>$('barcodeScannerDialog').close());
$('barcodeScannerDialog').addEventListener('close',()=>{++barcodeSession;stopBarcodeCamera();barcodeTargetInput=null;barcodePhotoPicking=false;barcodeLookingUp=false;$('scanAnotherBarcode').disabled=false;});
$('scanAnotherBarcode').addEventListener('click',()=>{prepareBarcodeSound();startBarcodeCamera($('barcodeCameraSelect').value||undefined);});
$('barcodeCameraSelect').addEventListener('change',()=>startBarcodeCamera($('barcodeCameraSelect').value));
$('barcodeTorchBtn').addEventListener('click',async()=>{
  const session=barcodeSession,track=barcodeStream?.getVideoTracks?.()[0];if(!track||!barcodeRunning)return;
  try{await track.applyConstraints({advanced:[{torch:!barcodeTorchOn}]});if(session!==barcodeSession)return;barcodeTorchOn=!barcodeTorchOn;$('barcodeTorchBtn').textContent=barcodeTorchOn?'Light off':'Light on';}
  catch{$('barcodeScannerStatus').textContent='Camera light is unavailable. Try brighter lighting.';}
});
$('barcodeManualForm').addEventListener('submit',event=>{event.preventDefault();acceptScannedBarcode($('barcodeManualInput').value,barcodeSession,false);});
$('barcodePhotoInput').addEventListener('click',event=>{if(barcodeLookingUp){event.preventDefault();return;}prepareBarcodeSound();barcodePhotoPicking=true;++barcodeSession;stopBarcodeCamera();});
$('barcodePhotoInput').addEventListener('cancel',()=>{barcodePhotoPicking=false;});
$('barcodePhotoInput').addEventListener('change',async()=>{
  barcodePhotoPicking=false;
  const file=$('barcodePhotoInput').files[0];$('barcodePhotoInput').value='';
  if(!file||barcodeLookingUp||!barcodeAllowed()||!$('barcodeScannerDialog').open)return;
  const session=++barcodeSession;stopBarcodeCamera();
  $('barcodeScannerStatus').textContent='Reading barcode photo…';
  let url;
  try{
    if(file.size>20*1024*1024)throw new Error('Choose a photo under 20 MB.');
    url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();
    if(session!==barcodeSession||!$('barcodeScannerDialog').open)return;
    const canvas=document.createElement('canvas'),scale=Math.min(1,2560/Math.max(image.naturalWidth,image.naturalHeight));
    canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const reader=createBarcodeReader();let result;
    try{result=reader.decodeFromCanvas(canvas);}catch{result=decodeRotatedBarcode(reader,canvas,document.createElement('canvas'));}
    if(!result)throw new Error('No barcode found in this photo. Take a sharper photo with the entire barcode visible.');
    await acceptScannedBarcode(result.getText(),session);
  }catch(error){if(session===barcodeSession)$('barcodeScannerStatus').textContent='No barcode could be read. Use a clear, well-lit photo with the entire barcode visible, or enter its number below.';}
  finally{if(url)URL.revokeObjectURL(url);}
});
$('shopSelect').addEventListener('change',()=>{if($('barcodeScannerDialog').open)$('barcodeScannerDialog').close();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&$('barcodeScannerDialog').open){stopBarcodeCamera();if(!barcodePhotoPicking)$('barcodeScannerDialog').close();}});
window.addEventListener('pagehide',()=>{++barcodeSession;stopBarcodeCamera();});
new MutationObserver(syncBarcodeScanning).observe($('appScreen'),{attributes:true,attributeFilter:['hidden']});
syncBarcodeScanning();

// Keyboard scanners send a fast barcode followed by Enter. Camera access remains explicit.
let hardwareBarcodeBuffer='',hardwareBarcodeStart=0,hardwareBarcodeLast=0,hardwareBarcodeTarget=null;
let hardwareBarcodeQueue=Promise.resolve();
function resetHardwareBarcode(){hardwareBarcodeBuffer='';hardwareBarcodeStart=0;hardwareBarcodeLast=0;hardwareBarcodeTarget=null;}
document.addEventListener('keydown',event=>{
  if(event.isComposing||event.repeat||event.ctrlKey||event.altKey||event.metaKey){resetHardwareBarcode();return;}
  const target=event.target,now=performance.now();
  const codeInput=target.matches?.('#newProductForm input[name="code"],#editProductForm input[name="code"]');
  const editable=target.closest?.('input,textarea,select,[contenteditable="true"]');
  const saleActive=!$('appScreen').hidden&&$('orderView').classList.contains('active-view')&&state.permissions?.Sales&&state.barcodeScanningEnabled;
  if(document.querySelector('dialog[open]')||(!codeInput&&(!saleActive||(editable&&target!==$('productSearch'))))){resetHardwareBarcode();return;}
  if(event.key==='Enter'){
    const value=hardwareBarcodeBuffer;
    const fast=value.length>=4&&now-hardwareBarcodeLast<100&&(hardwareBarcodeLast-hardwareBarcodeStart)/Math.max(1,value.length-1)<=40;
    resetHardwareBarcode();
    if(!fast)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(codeInput)return;
    if(target===$('productSearch'))$('productSearch').value='';
    const shop=currentShop(),company=state.me.companyCode;
    hardwareBarcodeQueue=hardwareBarcodeQueue.then(async()=>{
      const contextValid=()=>!$('appScreen').hidden&&state.permissions?.Sales&&state.barcodeScanningEnabled&&currentShop()===shop&&state.me?.companyCode===company&&$('orderView').classList.contains('active-view')&&!document.querySelector('dialog[open]');
      if(!contextValid())return;
      try{
        const product=await api('/api/products/barcode?'+new URLSearchParams({shopId:String(shop),barcode:value}));
        if(contextValid())addProduct(product.productId,product);
      }catch(error){if(contextValid())toast(error.message,true);}
    }).catch(()=>{});
    return;
  }
  if(event.key.length!==1){resetHardwareBarcode();return;}
  if(target!==hardwareBarcodeTarget||now-hardwareBarcodeLast>100){resetHardwareBarcode();hardwareBarcodeStart=now;hardwareBarcodeTarget=target;}
  hardwareBarcodeLast=now;hardwareBarcodeBuffer+=event.key;
  if(hardwareBarcodeBuffer.length>250)resetHardwareBarcode();
},true);
window.addEventListener('blur',resetHardwareBarcode);
