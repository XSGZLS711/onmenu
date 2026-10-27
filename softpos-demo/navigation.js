// Group existing destinations without changing their forms, posting paths or permissions.
(() => {
  const sales=$('salesMenuDialog'),purchasing=$('inventoryMenuDialog');
  function syncNavigation(){
    $('retailSalesTab').hidden=!state.permissions?.Sales;
    $('salesMenuBtn').hidden=$('retailSalesTab').hidden&&$('serviceSalesTab').hidden&&$('customerPaymentsTab').hidden;
    $('inventorySuiteBtn').hidden=![...purchasing.querySelectorAll('[data-suite]')].some(button=>!button.hidden);
    const active=document.querySelector('.view.active-view')?.id;
    $('salesMenuBtn').classList.toggle('active',['orderView','serviceSalesView','customerPaymentsView','holdsView'].includes(active));
    const customerReport=active==='inventorySuiteView'&&['statement','aging','pricing','integration'].includes(suiteKind);
    const components=active==='inventorySuiteView'&&['components','stocktake','transfers','bulk'].includes(suiteKind);
    $('productManagementBtn').classList.toggle('active',['productsView','stockView'].includes(active)||components);
    $('inventorySuiteBtn').classList.toggle('active',active==='inventorySuiteView'&&!customerReport&&!components);
    $('reportsMenuBtn').classList.toggle('active',['salesReportsView','reportsView'].includes(active)||customerReport);
  }
  $('salesMenuBtn').addEventListener('click',()=>{if(!$('salesMenuBtn').hidden)sales.showModal();});
  $('closeSalesMenu').addEventListener('click',()=>sales.close());
  sales.addEventListener('click',event=>{if(event.target.closest('#retailSalesTab,#serviceSalesTab,#customerPaymentsTab'))sales.close();},true);
  $('productManagementBtn').addEventListener('click',()=>purchasing.close(),true);
  document.querySelector('#productManagementDialog .ops-manager').addEventListener('click',()=>{const first=[...document.querySelectorAll('#stockView .ops-subtabs [data-stock]')].find(button=>!button.hidden);first?.click();});
  const apply=applyModuleAccess;applyModuleAccess=function(options){apply(options);syncNavigation();};
  const activate=activateTab;activateTab=function(id){activate(id);syncNavigation();};
  const login=showLogin;showLogin=function(){for(const dialog of [sales,purchasing,$('productManagementDialog')])if(dialog.open)dialog.close();login();};
})();
