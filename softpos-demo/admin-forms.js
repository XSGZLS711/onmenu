const masterForms={kind:'customers',rows:[],selected:null,lookups:null,sequence:0,saving:false,loading:false,opening:0};
const masterFormTitles={customers:'Customer Management',suppliers:'Supplier Management','sales-reps':'Sales Rep Management'};
function masterPendingKey(){return 'softpos.admin.forms.'+masterForms.lookups.owner+'.'+masterForms.kind;}
function masterPending(){try{return JSON.parse(sessionStorage.getItem(masterPendingKey())||'null');}catch{throw Error('The pending save could not be read. Reload this page before continuing.');}}
function masterSetFields(fields){
  for(const name of ['Name','Phone','Email','Address','Tin'])byId('masterForm'+name).value=fields?.[name.toLowerCase()]||'';
  byId('masterFormActive').checked=fields?.active??true;
  byId('masterFormShop').value=String(fields?.assignedShopId||masterForms.lookups?.shops[0]?.shopId||'');
}
function masterEdit(row){
  masterForms.selected=row;masterSetFields(row?.fields);
  byId('masterFormCode').textContent=row?'Code: '+row.code:'New record';
  byId('masterRecordFields').disabled=false;byId('masterFormSave').textContent=SoftPOSLanguage.t('Save');byId('masterFormResult').textContent='';
  const pending=masterPending();
  if(pending){masterForms.selected=pending.id?{id:pending.id,fields:pending.expected}:null;masterSetFields(pending.fields);byId('masterRecordFields').disabled=true;byId('masterFormCode').textContent='Save awaiting confirmation';byId('masterFormSave').textContent='Retry save';byId('masterFormResult').textContent='Retry the saved request before making another change.';}
}
async function masterLoadRows(){
  const sequence=++masterForms.sequence,kind=masterForms.kind;
  byId('masterFormListStatus').textContent='Loading…';
  try{
    const result=await request('/api/admin/forms/'+kind+'?search='+encodeURIComponent(byId('masterFormSearchText').value.trim()));
    if(sequence!==masterForms.sequence||kind!==masterForms.kind)return;
    masterForms.rows=result.rows;
    byId('masterFormRows').innerHTML=result.rows.map((row,index)=>`<button type="button" data-master-row="${index}"><strong>${escapeHtml(row.fields.name)}</strong><small>${escapeHtml([row.code,row.fields.phone,row.fields.email].filter(Boolean).join(' · '))}</small><small>${row.fields.active?'Active':'Inactive'}${kind==='sales-reps'?' · '+escapeHtml(masterForms.lookups.shops.find(s=>s.shopId===row.fields.assignedShopId)?.shopName||'Unassigned'):''}</small></button>`).join('');
    byId('masterFormListStatus').textContent=result.hasMore?'Showing the first 200 matches. Refine your search.':result.rows.length+' record'+(result.rows.length===1?'':'s');
  }catch(error){if(sequence===masterForms.sequence){byId('masterFormRows').replaceChildren();byId('masterFormListStatus').textContent=error.message;}}
}
async function openMasterForm(kind){
  if(masterForms.saving)return;
  const opening=++masterForms.opening;let ready=false;masterForms.loading=true;
  masterForms.kind=kind;masterForms.sequence++;byId('masterFormSearchText').value='';masterForms.rows=[];byId('masterFormRows').replaceChildren();byId('masterRecordFields').disabled=true;byId('masterFormSave').disabled=true;
  byId('masterFormHeading').textContent=masterFormTitles[kind];
  document.querySelectorAll('[data-master-form]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.masterForm===kind)));
  const rep=kind==='sales-reps';byId('masterFormContacts').hidden=rep;byId('masterFormShopLabel').hidden=!rep;
  byId('masterFormName').maxLength=kind==='customers'?200:250;byId('masterFormPhone').maxLength=kind==='suppliers'?50:100;byId('masterFormAddress').maxLength=kind==='suppliers'?250:1000;
  try{
    if(!masterForms.lookups){masterForms.lookups=await request('/api/admin/forms/lookups');byId('masterFormShop').replaceChildren(...masterForms.lookups.shops.map(shop=>new Option(shop.shopName,shop.shopId)));}
    if(opening!==masterForms.opening)return;
    if(!masterForms.lookups.shops.length)throw Error('Create an active shop before managing these forms.');
    masterEdit(null);ready=true;byId('masterRecordFields').disabled=true;await masterLoadRows();
  }catch(error){if(opening===masterForms.opening){byId('masterRecordFields').disabled=true;byId('masterFormResult').textContent=error.message;}}
  finally{if(opening===masterForms.opening){masterForms.loading=false;byId('masterFormSave').disabled=!ready;byId('masterRecordFields').disabled=!ready||!!masterPending();}}
}
document.querySelectorAll('[data-master-form]').forEach(button=>button.addEventListener('click',()=>openMasterForm(button.dataset.masterForm)));
byId('masterFormSearch').addEventListener('submit',event=>{event.preventDefault();masterLoadRows();});
byId('masterFormNew').addEventListener('click',()=>{if(!masterForms.saving&&!masterForms.loading&&masterForms.lookups)masterEdit(null);});
byId('masterFormRows').addEventListener('click',event=>{const button=event.target.closest('[data-master-row]');if(button&&!masterForms.saving&&!masterForms.loading)masterEdit(masterForms.rows[Number(button.dataset.masterRow)]);});
byId('masterRecordForm').addEventListener('submit',async event=>{
  event.preventDefault();if(masterForms.saving||masterForms.loading||!masterForms.lookups)return;
  const kind=masterForms.kind,selected=masterForms.selected,rep=kind==='sales-reps';
  const field=name=>byId('masterForm'+name).value.trim()||null;
  let pending;
  try{
    pending=masterPending();
    if(!pending){
      const fields={name:field('Name'),phone:rep?null:field('Phone'),email:rep?null:field('Email'),address:rep?null:field('Address'),tin:rep?null:field('Tin'),active:byId('masterFormActive').checked,assignedShopId:rep?Number(byId('masterFormShop').value):null};
      pending={requestId:crypto.randomUUID(),shopId:rep?fields.assignedShopId:masterForms.lookups.shops[0].shopId,id:selected?.id??null,fields,expected:selected?.fields??null};
      sessionStorage.setItem(masterPendingKey(),JSON.stringify(pending));
    }
  }catch(error){byId('masterFormResult').textContent=error.message;return;}
  masterForms.saving=true;byId('masterFormSave').disabled=true;byId('masterRecordFields').disabled=true;
  document.querySelectorAll('[data-master-form]').forEach(button=>button.disabled=true);
  try{
    csrfToken=(await request('/api/security/csrf')).token;
    await post('/api/admin/forms/'+kind,pending);
    sessionStorage.removeItem(masterPendingKey());
    masterEdit(null);await masterLoadRows();byId('masterFormResult').textContent='Record saved.';
  }catch(error){
    if([400,409].includes(error.status)){sessionStorage.removeItem(masterPendingKey());byId('masterRecordFields').disabled=false;await masterLoadRows();}
    else byId('masterFormSave').textContent='Retry save';
    byId('masterFormResult').textContent=error.message+([400,409].includes(error.status)?'':' Retry to confirm this same save.');
  }finally{masterForms.saving=false;byId('masterFormSave').disabled=false;document.querySelectorAll('[data-master-form]').forEach(button=>button.disabled=false);}
});
