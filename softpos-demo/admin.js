function escapeHtml(value){const node=document.createElement('span');node.textContent=String(value??'');return node.innerHTML.replaceAll('"','&quot;');}
const byId = id => document.getElementById(id);
let csrfToken = "";
let currentUserId = null;
let newUserSubmitting = false;
let companyProfileId = null;

function showSettingsTab(name) {
  if(name==='shops'&&typeof loadShopSetup==='function')loadShopSetup();
  if(name==='forms'&&typeof openMasterForm==='function')openMasterForm(masterForms.kind);
  for (const tab of document.querySelectorAll('[data-settings-tab]')) {
    const selected = tab.dataset.settingsTab === name;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    byId(tab.getAttribute('aria-controls')).hidden = !selected;
  }
}
const settingsTabs = [...document.querySelectorAll('[data-settings-tab]')];
for (const [index, tab] of settingsTabs.entries()) {
  tab.addEventListener('click', () => showSettingsTab(tab.dataset.settingsTab));
  tab.addEventListener('keydown', event => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? settingsTabs.length - 1 :
      event.key === 'ArrowRight' ? (index + 1) % settingsTabs.length :
      event.key === 'ArrowLeft' ? (index + settingsTabs.length - 1) % settingsTabs.length : null;
    if (next === null) return;
    event.preventDefault(); showSettingsTab(settingsTabs[next].dataset.settingsTab); settingsTabs[next].focus();
  });
}

async function loadCompanyProfile() {
  const profile = await request('/api/admin/company');
  companyProfileId = profile.companyId;
  for (const input of document.querySelectorAll('[data-company-field]'))
    input.value = profile[input.dataset.companyField] ?? '';
  byId('companyDetailsFields').disabled = !companyProfileId;
  byId('companyDetailsResult').textContent = companyProfileId ? '' : 'Company details are missing. Contact your system administrator.';
}

byId('companyDetailsForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!companyProfileId || byId('companyDetailsFields').disabled) return;
  const profile = { companyId: companyProfileId };
  for (const input of document.querySelectorAll('[data-company-field]')) {
    if (input.disabled) continue;
    const value = input.value.trim();
    profile[input.dataset.companyField] = input.type === 'number' ? (value === '' ? null : Number(value)) : value;
  }
  byId('companyDetailsFields').disabled = true;
  byId('companyDetailsResult').textContent = 'Saving company details…';
  try {
    csrfToken = (await request('/api/security/csrf')).token;
    await post('/api/admin/company', profile);
    byId('companyDetailsResult').textContent = 'Company details saved. Refresh the POS screen to use the updated details.';
  } catch (error) { byId('companyDetailsResult').textContent = error.message; }
  finally { byId('companyDetailsFields').disabled = false; }
});

async function loadVmsStatus() {
  const response = await fetch("/api/admin/vms-certificate", { credentials: "same-origin" });
  if (response.status === 404) {
    byId('vmsSection').hidden = false;
    byId('vmsStatus').textContent = 'VMS sandbox configuration is not enabled on this server.';
    byId('vmsForm').hidden = true;
    return;
  }
  if (!response.ok) throw new Error(`Certificate status failed (${response.status}).`);
  const shops = await response.json();
  byId("vmsSection").hidden = false;
  byId('vmsForm').hidden = false;
  byId("vmsStatus").textContent = shops.length ? "Choose how each shop handles VMS test invoices." : "No active shops are configured.";
  const upload = byId("vmsShop");
  const selected = upload.value;
  upload.replaceChildren(...shops.map(shop => {
    const option = document.createElement("option"); option.value = shop.shopId; option.textContent = shop.shopName; return option;
  }));
  if (shops.some(shop => String(shop.shopId) === selected)) upload.value = selected;
  const list = byId("vmsShops"); list.replaceChildren();
  for (const shop of shops) {
    const card = document.createElement("div"); card.className = "vms-shop-card";
    const title = document.createElement("strong"); title.textContent = shop.shopName;
    const detail = document.createElement("small");
    detail.textContent = shop.certificate.configured
      ? `Certificate: ${shop.certificate.subject} · ${shop.certificate.enabled ? "valid" : "expired"} · expires ${new Date(shop.certificate.expiresUtc).toLocaleDateString()}`
      : "No certificate uploaded for this shop";
    const controls = document.createElement("div"); controls.className = "vms-shop-controls";
    const mode = document.createElement("select"); mode.setAttribute("aria-label", `VMS mode for ${shop.shopName}`);
    for (const [value, label] of [["OFF","Off · test invoice"],["OWN","Use this shop's certificate"],["SHARED","Use another shop's certificate"]]) {
      const option = document.createElement("option"); option.value = value; option.textContent = label; mode.append(option);
    }
    mode.value = shop.mode;
    const source = document.createElement("select"); source.setAttribute("aria-label", `Certificate source for ${shop.shopName}`);
    const candidates = shops.filter(other => other.shopId !== shop.shopId &&
      shop.locationId != null && other.locationId === shop.locationId && other.certificate.enabled);
    for (const other of candidates) {
      const option = document.createElement("option"); option.value = other.shopId; option.textContent = other.shopName; source.append(option);
    }
    if (shop.certificateShopId) source.value = shop.certificateShopId;
    const updateSource = () => { source.hidden = mode.value !== "SHARED"; };
    mode.addEventListener("change", updateSource); updateSource();
    const save = document.createElement("button"); save.className = "secondary"; save.textContent = "Save";
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await post(`/api/admin/vms-shops/${shop.shopId}/mode`, {
          mode: mode.value, certificateShopId: mode.value === "SHARED" && source.value ? Number(source.value) : null,
          confirmedSameRegisteredLocation: mode.value !== "SHARED" ||
            window.confirm("Confirm both shops use the same FRCS registered business location.")
        });
        byId("vmsResult").textContent = `${shop.shopName} VMS setting saved.`;
        await loadVmsStatus();
    await loadRoleAccess();
      } catch (error) { byId("vmsResult").textContent = error.message; save.disabled = false; }
    });
    controls.append(mode, source, save); card.append(title, detail, controls); list.append(card);
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  if (response.status === 401) { location.href = "/"; throw new Error("Your session has ended."); }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { message = (await response.json()).message || message; } catch {}
    const error=new Error(message);error.status=response.status;throw error;
  }
  return response.headers.get("content-type")?.includes("json") ? response.json() : null;
}

function showError(message) { byId("adminError").textContent = message; byId("adminError").hidden = false; }
function cell(row, value) { const element = document.createElement("td"); element.textContent = value; row.append(element); return element; }
function showLink(path, label) {
  byId("linkLabel").textContent = label;
  byId("generatedLink").value = location.origin + path;
  byId("inviteEmailStatus").textContent = "";
  byId("copyLink").textContent = "Copy link";
  byId("linkPanel").hidden = false;
}
async function post(path, body) {
  return request(path, {
    method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrfToken },
    body: JSON.stringify(body || {})
  });
}

function updateInvitationButton() {
  const select = byId("inviteOperator");
  byId("inviteForm").querySelector("button[type=submit]").disabled = select.disabled || !select.value;
}

function updateNewUserButton() {
  const shop = byId("newUserShop");
  const role = byId("newUserRole");
  byId("newUserForm").querySelector("button[type=submit]").disabled = newUserSubmitting || shop.disabled || !shop.value || role.disabled || !role.value;
  byId("newUserRoleHint").textContent = !role.value ? "Choose a role to see its shop access." :
    role.selectedOptions[0]?.dataset.allShops === "true"
      ? "This company administrator can access all shops in this company. This does not grant Softnet master access."
      : "This user can access the selected shop, using the permissions configured for their role.";
}

function renderNewUserRoles(roles) {
  const select = byId("newUserRole");
  const previous = select.value;
  const placeholder = document.createElement("option");
  placeholder.value = ""; placeholder.textContent = roles.length ? "Select a company role" : "No enabled company roles";
  placeholder.disabled = true;
  select.replaceChildren(placeholder);
  for (const role of roles) {
    const option = document.createElement("option");
    option.value = role.name;
    option.textContent = role.allShops ? `${role.name} (company administrator)` : role.name;
    option.dataset.allShops = String(role.allShops);
    select.append(option);
  }
  select.value = roles.some(role => role.name === previous) ? previous : "";
  select.disabled = roles.length === 0;
  updateNewUserButton();
}

function renderNewUserShops(shops) {
  const select = byId("newUserShop");
  const previous = select.value;
  const placeholder = document.createElement("option");
  placeholder.value = ""; placeholder.textContent = shops.length ? "Select a shop" : "No active shops";
  placeholder.disabled = true;
  select.replaceChildren(placeholder);
  for (const shop of shops) {
    const option = document.createElement("option");
    option.value = shop.shopId; option.textContent = shop.shopName; select.append(option);
  }
  select.value = shops.some(shop => String(shop.shopId) === previous) ? previous :
    shops.length === 1 ? String(shops[0].shopId) : "";
  select.disabled = shops.length === 0;
  byId("newUserStatus").textContent = shops.length
    ? "Choose any enabled company role, then create an invitation for each person."
    : "Create a shop in System Setting → Shops, then click Refresh.";
  updateNewUserButton();
}

function renderInvitationOperators(operators, directory) {
  const linked = new Set(directory.users.map(user => user.posUserId));
  const pending = new Set(directory.invitations.map(invite => invite.posUserId));
  const available = operators.filter(operator => !linked.has(operator.userId) && !pending.has(operator.userId));
  const select = byId("inviteOperator");
  const previous = select.value;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = available.length ? "Select a POS operator" : "No available POS operators";
  placeholder.disabled = true;
  select.replaceChildren(placeholder);
  for (const operator of operators) {
    const option = document.createElement("option");
    option.value = operator.userId;
    const reason = linked.has(operator.userId) ? "Already linked to an email user" :
      pending.has(operator.userId) ? "Invitation pending" : "";
    option.textContent = `${operator.fullName || operator.userName} (${operator.role})${reason ? ` — ${reason}` : ""}`;
    option.disabled = Boolean(reason);
    select.append(option);
  }
  select.value = available.some(operator => String(operator.userId) === previous) ? previous : "";
  // Keep existing operators inspectable even when they are all assigned.
  select.disabled = operators.length === 0;
  byId("inviteOperatorStatus").textContent = !operators.length
    ? "No enabled POS operators were found. Create a company user above, then share their invitation link."
    : !available.length
      ? "All enabled POS operators already have an email user or pending invitation. Use Email users above to enable access or create a reset link, or revoke a pending invitation below. For a new person, create a company user above."
      : "Select an enabled POS operator. Operators already linked to an email user or pending invitation are shown but cannot be selected.";
  updateInvitationButton();
}

async function loadOverview() {
  byId("adminError").hidden = true;
  try {
    const result = await request("/api/admin/overview");
    const directory = result.directory;
    byId("adminCompany").textContent = directory.displayName;
    byId("adminSeats").textContent = `${directory.activeSeats} of ${directory.seatLimit}`;
    byId("adminExpiry").textContent = new Date(directory.licenseEndsUtc).toLocaleDateString();
    const operators = new Map(result.operators.map(operator => [operator.userId, operator]));
    const body = byId("adminUsers");
    body.replaceChildren();
    byId("adminEmpty").hidden = directory.users.length > 0;
    for (const user of directory.users) {
      const row = document.createElement("tr");
      cell(row, user.email);
      const operator = operators.get(user.posUserId);
      cell(row, operator ? `${operator.fullName} (${operator.role})` : `Operator ${user.posUserId} unavailable`);
      const status = cell(row, user.isEnabled ? "Active" : "Disabled");
      status.className = user.isEnabled ? "" : "muted";
      const action = document.createElement("td");
      const button = document.createElement("button");
      button.className = user.isEnabled ? "ghost" : "secondary";
      button.textContent = user.isEnabled ? "Disable" : "Enable";
      button.disabled = user.appUserId === currentUserId;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await post(`/api/admin/users/${user.appUserId}/enabled`, { enabled: !user.isEnabled });
          await loadOverview();
    await loadCompanyLogo();
        } catch (error) { showError(error.message); button.disabled = false; }
      });
      action.append(button);
      if (user.isEnabled) {
        const reset = document.createElement("button");
        reset.className = "link-btn";
        reset.textContent = "Reset link";
        reset.addEventListener("click", async () => {
          reset.disabled = true;
          try {
            const result = await post(`/api/admin/users/${user.appUserId}/reset-link`);
            showLink(result.path, `Password reset for ${user.email} (30 minutes)`);
          } catch (error) { showError(error.message); }
          finally { reset.disabled = false; }
        });
        action.append(reset);
      }
      row.append(action);
      body.append(row);
    }
    renderInvitationOperators(result.operators, directory);
    renderNewUserRoles(result.roles || []);
    renderNewUserShops(result.shops || []);
    const pending = byId("pendingInvites");
    pending.replaceChildren();
    byId("pendingEmpty").hidden = directory.invitations.length > 0;
    for (const invite of directory.invitations) {
      const row = document.createElement("div"); row.className = "admin-pending-row";
      const info = document.createElement("div");
      const email = document.createElement("strong"); email.textContent = invite.email;
      const detail = document.createElement("small");
      detail.textContent = `${operators.get(invite.posUserId)?.fullName || `Operator ${invite.posUserId}`} · expires ${new Date(invite.expiresUtc).toLocaleString()}`;
      info.append(email, detail);
      const revoke = document.createElement("button"); revoke.className = "ghost"; revoke.textContent = "Revoke";
      revoke.addEventListener("click", async () => {
        revoke.disabled = true;
        try { await post(`/api/admin/invitations/${invite.invitationId}/revoke`); await loadOverview(); }
        catch (error) { showError(error.message); revoke.disabled = false; }
      });
      row.append(info, revoke); pending.append(row);
    }
  } catch (error) {
    byId("inviteOperator").disabled = true;
    byId("inviteOperatorStatus").textContent = "Could not load POS operators. Click Refresh to try again.";
    updateInvitationButton();
    byId("newUserShop").disabled = true;
    byId("newUserStatus").textContent = "Could not load company shops. Click Refresh to try again.";
    updateNewUserButton();
    showError(error.message);
  }
}

async function initializeAdmin() {
    try {
    const me = await request("/api/me");
    if (!me.canManageDirectory) throw new Error("Your account cannot manage company access.");
    byId("adminMasterLink").hidden = !me.canManagePlatform;
    currentUserId = Number(me.userId);
    csrfToken = (await request("/api/security/csrf")).token;
    await loadCompanyProfile();
    await loadOverview();
    await loadCompanyLogo();
    const settings=await request('/api/admin/pos-settings');
    const enabledPayments=configuredPaymentMethods(settings.enabledPaymentMethods);document.querySelectorAll('[name=enabledPaymentMethod]').forEach(input=>input.checked=enabledPayments.includes(input.value));
    byId('receiptPaperWidthMm').value=String(settings.receiptPaperWidthMm===58?58:80);
    byId('priceKeypadEnabled').checked=settings.priceKeypadEnabled;
    byId('showProductCode').checked=settings.showProductCode; byId('barcodeScanningEnabled').checked=settings.barcodeScanningEnabled;
    byId('serviceDescriptionsEnabled').checked=settings.serviceDescriptionsEnabled;
    byId('holdSalesEnabled').checked=settings.holdSalesEnabled;
    byId('draftBillEnabled').checked=settings.draftBillEnabled??true;
    byId('salesRepEnabled').checked=settings.salesRepEnabled??true;
    byId('discountsEnabled').checked=settings.discountsEnabled;
    byId('productComponentsEnabled').checked=settings.productComponentsEnabled;
    await loadVmsStatus();
    await loadRoleAccess();
  } catch (error) { showError(error.message); }
}

byId("refreshUsers").addEventListener("click", loadOverview);
byId("inviteOperator").addEventListener("change", updateInvitationButton);
byId("newUserShop").addEventListener("change", updateNewUserButton);
byId("newUserRole").addEventListener("change", updateNewUserButton);
byId("newUserForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (newUserSubmitting || byId("newUserShop").disabled || !byId("newUserShop").value || byId("newUserRole").disabled || !byId("newUserRole").value) return;
  newUserSubmitting = true;
  updateNewUserButton();
  try {
    const email = byId("newUserEmail").value.trim();
    const result = await post("/api/admin/new-user-invitations", {
      fullName: byId("newUserName").value.trim(), email,
      role: byId("newUserRole").value, shopId: Number(byId("newUserShop").value)
    });
    showLink(result.path, `Invitation for ${email} (48 hours)`);
    byId("inviteEmailStatus").textContent = result.emailStatus === "sent"
      ? "Operator created and invitation email sent."
      : result.emailStatus === "failed"
        ? "Operator and invitation created, but email delivery failed. Copy and share the link privately."
        : "Operator and invitation created. Copy and share the link privately; email delivery is not configured.";
    byId("newUserName").value = "";
    byId("newUserEmail").value = "";
    await loadOverview();
  } catch (error) { showError(error.message); }
  finally { newUserSubmitting = false; updateNewUserButton(); }
});
byId("inviteForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (byId("inviteOperator").disabled || !byId("inviteOperator").value) return;
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const result = await post("/api/admin/invitations", {
      email: byId("inviteEmail").value, posUserId: Number(byId("inviteOperator").value)
    });
    showLink(result.path, "Invitation link (48 hours)");
    byId("inviteEmailStatus").textContent = result.emailStatus === "sent"
      ? "Invitation email sent. You can also copy the link."
      : result.emailStatus === "failed"
        ? "Invitation created, but email delivery failed. Copy and share the link privately."
        : "Invitation created. Email delivery is not configured; copy and share the link privately.";
    byId("inviteEmail").value = "";
    await loadOverview();
    await loadCompanyLogo();
  } catch (error) { showError(error.message); }
  finally { updateInvitationButton(); }
});
byId("copyLink").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(byId("generatedLink").value); byId("copyLink").textContent = "Copied"; }
  catch { byId("generatedLink").select(); showError("Copy the selected link manually."); }
});
initializeAdmin();

byId("posSettingsForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button=event.currentTarget.querySelector("button[type=submit]");button.disabled=true;
  try {
    const enabledPaymentMethods=[...document.querySelectorAll('[name=enabledPaymentMethod]:checked')].map(input=>input.value);
    if(!enabledPaymentMethods.length)throw Error('Choose at least one payment type.');
    await post("/api/admin/pos-settings?shopId="+byId("salesOptionsShop").value,{draftBillEnabled:byId("draftBillEnabled").checked,salesRepEnabled:byId("salesRepEnabled").checked,enabledPaymentMethods,receiptPaperWidthMm:Number(byId("receiptPaperWidthMm").value),productComponentsEnabled:byId("productComponentsEnabled").checked,barcodeScanningEnabled:byId("barcodeScanningEnabled").checked,enabled:byId("priceKeypadEnabled").checked,showProductCode:byId("showProductCode").checked,serviceDescriptionsEnabled:byId("serviceDescriptionsEnabled").checked,holdSalesEnabled:byId("holdSalesEnabled").checked,discountsEnabled:byId("discountsEnabled").checked});
    byId("posSettingsResult").textContent="Settings saved. Refresh the POS screen to apply this change.";
  } catch(error) { byId("posSettingsResult").textContent=error.message; }
  finally { button.disabled=false; }
});

byId("vmsForm").addEventListener("submit", async event => {
  event.preventDefault();
  const uploadForm = event.currentTarget;
  const button = uploadForm.querySelector("button[type=submit]");
  button.disabled = true;
  byId("vmsResult").textContent = "Verifying certificate and PAC with the VMS test service…";
  try {
    const form = new FormData();
    form.append("shopId", byId("vmsShop").value);
    form.append("locationConfirmed", String(byId("vmsLocationConfirmed").checked));
    form.append("certificate", byId("vmsFile").files[0]);
    form.append("password", byId("vmsPassword").value);
    form.append("pac", byId("vmsPac").value);
    await request("/api/admin/vms-certificate", {
      method: "POST", headers: { "X-CSRF-TOKEN": csrfToken }, body: form
    });
    uploadForm.reset();
    byId("vmsResult").textContent = "VMS test certificate verified and saved for the selected shop. Set its VMS mode to use it.";
    await loadVmsStatus();
    await loadRoleAccess();
  } catch (error) { byId("vmsResult").textContent = error.message; }
  finally { button.disabled = false; }
});

const roleLabels={Stocktake:'Stocktake / Mobile Counts',StocktakePost:'Post Stocktake',Transfers:'Stock Transfer — Dispatch',TransferReceive:'Goods Received — Stock Transfers',BulkTransfer:'Bulk Stock Transfer',Purchases:'Supplier Purchase Invoices',Pricing:'Price Breaks / Promotions / Happy Hour',CustomerReports:'Customer Statements / Aging',Integration:'MYOB / Xero / QuickBooks',Sales:'Retail Sales',Quotation:'Quotation',Layby:'Create Layby',LaybyCollect:'Collect Layby',LaybyCancel:'Cancel Layby / Refund',Discounts:'Apply Discounts',ServiceSales:'Service Sale',CustomerPayments:'Customer Payments',Customers:'Create Customers',Suppliers:'Create Suppliers',Products:'Product Management',PO:'PO & Receiving — Create PO',Receive:'PO & Receiving — Receive PO',ReceiveWithoutPO:'PO & Receiving — Receive Without PO',Adjustment:'Stock Adjustment',Refund:'Refunds',Reports:'Dashboard / Sales / Stock / X & Z Reports',DeleteRows:'Delete Sale Rows',CancelSales:'Cancel Sales / Remove Held Sales',ChangePrice:'Change Unit Price',ApproveSales:'Approve Sales Actions'};
const roleMenuGroups=[
 {name:'Sales',modules:['Sales','ServiceSales','CustomerPayments','Customers','Refund','Discounts','Layby','LaybyCollect'],help:'Choose sales access here. Set approval requirements for individual sales buttons below.'},
 {name:'Sales Actions & Approvals',modules:['ApproveSales','DeleteRows','CancelSales','ChangePrice','LaybyCancel'],help:'Choose No Approval Required, Require Approval, or Not Allowed for each sales button. Approve Sales Actions allows this role to approve another operator.'},
 {name:'Stock',modules:['Products','PO','Receive','ReceiveWithoutPO','Suppliers','Transfers','TransferReceive','BulkTransfer','Adjustment','Stocktake','StocktakePost'],help:'Bulk Stock Transfer also requires Stock Transfer — Dispatch.'},
 {name:'Quotation',modules:['Quotation'],help:'Allow viewing and printing quotations. Creating or converting a quotation also requires Retail Sales.'},
 {name:'Expense',modules:['Purchases'],help:'Expense entry is not available yet. This permission controls the existing supplier purchase invoices.'},
 {name:'Reports',modules:['Reports','CustomerReports','Pricing','Integration']}
];
async function loadRoleAccess(){
  const data=await request('/api/admin/role-access');
  const picker=byId('roleAccessRole'),previous=picker.value;
  const approvalModules=['DeleteRows','CancelSales','ChangePrice','LaybyCancel'];
  const known=new Set(roleMenuGroups.flatMap(group=>group.modules));
  const extra=data.modules.filter(module=>!known.has(module));
  const groups=extra.length?[...roleMenuGroups,{name:'Other Access',modules:extra}]:roleMenuGroups;
  picker.innerHTML=data.roles.map(role=>`<option value="${Number(role.id)}">${escapeHtml(role.name)}</option>`).join('');
  picker.value=data.roles.some(role=>String(role.id)===previous)?previous:String((data.roles.find(role=>role.name.trim().toLowerCase()==='cashier')||data.roles[0])?.id??'');
  byId('roleAccessTable').innerHTML=data.roles.map(role=>{
    const name=role.name.trim().toLowerCase(),admin=['admin','superadmin'].includes(name);
    const renderPermission=module=>{
      const entry=data.entries.find(e=>e.roleId===role.id&&e.module===module);
      const label=escapeHtml(roleLabels[module]||module);
      if(approvalModules.includes(module)){
        const approval=data.entries.find(e=>e.roleId===role.id&&e.module===module+'Approval');
        const mode=admin||entry?.allowed||(!entry&&name==='supervisor'&&module!=='LaybyCancel')?'allow':(approval?.allowed||(!entry&&!approval&&module==='LaybyCancel'&&['supervisor','head cashier'].includes(name)))?'approval':'deny';
        return `<label class="role-permission role-permission-action"><span>${label}</span><select aria-label="${escapeHtml(role.name)}: ${label}" data-sales-access="${role.id}" data-module="${module}" ${admin?'disabled':''}><option value="deny" ${mode==='deny'?'selected':''}>Not Allowed</option><option value="allow" ${mode==='allow'?'selected':''}>No Approval Required</option><option value="approval" ${mode==='approval'?'selected':''}>Require Approval</option></select></label>`;
      }
      const salesEntry=data.entries.find(e=>e.roleId===role.id&&e.module==='Sales');
      const quotationDefault=salesEntry?salesEntry.allowed:['supervisor','head cashier','cashier'].includes(name);
      const allowed=admin||(entry?entry.allowed:(module==='Quotation'?quotationDefault:module==='Integration'?false:module==='ApproveSales'?['supervisor','head cashier'].includes(name):['Sales','ServiceSales','Customers','Reports'].includes(module)?['supervisor','head cashier','cashier'].includes(name):name==='supervisor'));
      return `<label class="role-permission"><span>${label}</span><input type="checkbox" aria-label="${escapeHtml(role.name)}: ${label}" data-role-access="${role.id}" data-module="${module}" ${allowed?'checked':''} ${admin?'disabled':''}></label>`;
    };
    return `<section class="role-menu-panel" data-role-panel="${Number(role.id)}" aria-label="${escapeHtml(role.name)} permissions" ${String(role.id)!==picker.value?'hidden':''}>`+groups.map(group=>{
      const modules=group.modules.filter(module=>data.modules.includes(module));
      if(!modules.length)return '';
      return `<fieldset class="role-menu-group"><legend>${escapeHtml(group.name)}</legend>${group.help?'<p class="role-menu-help muted">'+escapeHtml(group.help)+'</p>':''}<div class="role-permission-grid">${modules.map(renderPermission).join('')}</div></fieldset>`;
    }).join('')+'</section>';
  }).join('');
}
byId('roleAccessRole').addEventListener('change',()=>{
  byId('roleAccessTable').querySelectorAll('[data-role-panel]').forEach(panel=>panel.hidden=panel.dataset.rolePanel!==byId('roleAccessRole').value);
});
byId('roleAccessForm').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;
  try{const entries=[...document.querySelectorAll('[data-role-access]:not(:disabled)')].map(x=>({roleId:Number(x.dataset.roleAccess),module:x.dataset.module,allowed:x.checked}));
    for(const x of document.querySelectorAll('[data-sales-access]:not(:disabled)'))entries.push({roleId:Number(x.dataset.salesAccess),module:x.dataset.module,allowed:x.value==='allow'},{roleId:Number(x.dataset.salesAccess),module:x.dataset.module+'Approval',allowed:x.value==='approval'});
    await post('/api/admin/role-access',{entries});byId('roleAccessResult').textContent='Role access saved. Refresh the POS screen to update its buttons.';}
  catch(error){byId('roleAccessResult').textContent=error.message;}
  finally{button.disabled=false;}
});

async function loadCompanyLogo(){
  const response=await fetch('/api/company-logo',{credentials:'same-origin',cache:'no-store'});
  const preview=byId('companyLogoPreview');preview.hidden=!response.ok;byId('removeCompanyLogo').hidden=!response.ok;
  if(response.ok)preview.src=URL.createObjectURL(await response.blob());
}
byId('companyLogoForm').addEventListener('submit',async event=>{
  event.preventDefault();const formElement=event.currentTarget,file=byId('companyLogoFile').files[0],button=formElement.querySelector('button[type="submit"]');
  if(!file||file.size>2*1024*1024){byId('companyLogoResult').textContent='Choose a PNG or JPEG under 2 MB.';return;}
  button.disabled=true;
  try{
    csrfToken=(await request('/api/security/csrf')).token;
    const form=new FormData();form.append('image',file);
    await request('/api/admin/company-logo',{method:'POST',headers:{'X-CSRF-TOKEN':csrfToken},body:form});
    byId('companyLogoResult').textContent='Company logo saved. It will appear on printed purchase orders.';formElement.reset();await loadCompanyLogo();
  }catch(error){byId('companyLogoResult').textContent=error.message;}
  finally{button.disabled=false;}
});
byId('removeCompanyLogo').addEventListener('click',async()=>{
  const button=byId('removeCompanyLogo');button.disabled=true;
  try{await post('/api/admin/company-logo/remove',{});await loadCompanyLogo();byId('companyLogoResult').textContent='Company logo removed.';}
  catch(error){byId('companyLogoResult').textContent=error.message;}
  finally{button.disabled=false;}
});
