// Keep an online company session alive without counting browser tabs as separate users.
(()=>{
  let pending=false;
  async function heartbeat(){
    const admin=location.pathname==='/admin.html';
    const screen=document.getElementById('appScreen');
    if(pending||!navigator.onLine||(!admin&&(!screen||screen.hidden))||
      (typeof offlineMode!=='undefined'&&offlineMode))return;
    pending=true;
    try{
      const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});
      if(response.status===401){
        if(admin)location.replace('/');
        else if(typeof showLogin==='function'){
          showLogin();
          if(typeof toast==='function')toast('Your session has ended. Please sign in again.',true);
        }
      }
    }catch{}finally{pending=false;}
  }
  setInterval(heartbeat,60000);
  setTimeout(heartbeat,10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)heartbeat();});
})();
