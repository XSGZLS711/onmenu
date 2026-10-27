$('changePasswordBtn').addEventListener('click',()=>{
  $('changePasswordForm').reset();$('changePasswordStatus').textContent='';
  for(const input of $('changePasswordForm').querySelectorAll('input[data-password]'))input.type='password';
  $('changePasswordDialog').showModal();$('currentAccountPassword').focus();
});
$('closeChangePassword').addEventListener('click',()=>$('changePasswordDialog').close());
$('changePasswordDialog').addEventListener('close',()=>$('changePasswordForm').reset());
$('showAccountPasswords').addEventListener('change',()=>{for(const input of $('changePasswordForm').querySelectorAll('input[data-password]'))input.type=$('showAccountPasswords').checked?'text':'password';});
$('changePasswordForm').addEventListener('submit',async event=>{
  event.preventDefault();const status=$('changePasswordStatus');status.textContent='';
  const currentPassword=$('currentAccountPassword').value,newPassword=$('newAccountPassword').value,confirmPassword=$('confirmAccountPassword').value;
  if(newPassword!==confirmPassword){status.textContent='New passwords do not match.';return;}
  if(newPassword===currentPassword){status.textContent='Choose a different new password.';return;}
  const button=$('saveAccountPassword');button.disabled=true;
  try{
    await api('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword,confirmPassword})});
    $('changePasswordDialog').close();state.cart=[];state.saleCustomer=null;state.heldSaleId=null;renderCart();showLogin();
    toast('Password changed. Sign in using your new password.');await refreshCsrf();
  }catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
});
new MutationObserver(()=>{if($('appScreen').hidden&&$('changePasswordDialog').open)$('changePasswordDialog').close();}).observe($('appScreen'),{attributes:true,attributeFilter:['hidden']});
