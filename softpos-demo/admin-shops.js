const shopSetup = { saving: false, pending: null, key: null, loading: false };

function shopSetupReady() {
  byId('createShopFields').disabled = shopSetup.saving || shopSetup.loading || !shopSetup.key || !!shopSetup.pending || !byId('createShopDivision').options.length;
  byId('createShopSave').disabled = shopSetup.saving || shopSetup.loading || !shopSetup.key || (!shopSetup.pending && !byId('createShopDivision').options.length);
  byId('createShopSave').textContent = shopSetup.pending ? 'Retry add shop' : 'Add shop';
}

async function loadShopSetup() {
  if (shopSetup.loading || shopSetup.saving) return;
  shopSetup.loading = true;
  shopSetupReady();
  byId('shopSetupStatus').textContent = 'Loading shops…';
  try {
    const [data, lookups] = await Promise.all([request('/api/admin/shops'), request('/api/admin/forms/lookups')]);
    const key = 'softpos.admin.shops.' + lookups.owner;
    const pending = JSON.parse(sessionStorage.getItem(key) || 'null');
    shopSetup.key = key;
    shopSetup.pending = pending;
    const division = byId('createShopDivision');
    const selected = pending?.divisionId ?? division.value;
    division.replaceChildren(...data.divisions.map(d => new Option(d.name, d.id)));
    if ([...division.options].some(option => option.value === String(selected))) division.value = String(selected);
    if (pending) {
      byId('createShopName').value = pending.name;
      byId('createShopResult').textContent = 'Retry the pending request to confirm whether the shop was created.';
    }
    const rows = byId('shopSetupRows');
    rows.replaceChildren();
    for (const shop of data.shops) {
      const card = document.createElement('div'); card.className = 'vms-shop-card';
      const name = document.createElement('strong'); name.textContent = shop.name;
      const details = document.createElement('small');
      details.textContent = `Shop code: ${shop.code ?? '—'} · ${shop.active ? 'Active' : 'Inactive'} · Division: ${shop.division ?? '—'}`;
      const location = document.createElement('small');
      location.textContent = shop.locationId ? `Stock location: ${shop.locationName} (${shop.locationCode})` : 'No stock location linked';
      card.append(name, details, location); rows.append(card);
    }
    byId('shopSetupStatus').textContent = data.shops.length ? `${data.shops.length} shops` : 'No shops yet. Add your first shop above.';
    if (!data.divisions.length && !pending) byId('createShopResult').textContent = 'An active division is required. Contact your company administrator.';
  } catch (error) {
    shopSetup.key = null;
    byId('shopSetupStatus').textContent = error.message;
  } finally {
    shopSetup.loading = false;
    shopSetupReady();
  }
}

byId('refreshShops').addEventListener('click', loadShopSetup);
byId('createShopForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (shopSetup.saving || shopSetup.loading || !shopSetup.key) return;
  shopSetup.saving = true;
  let created = false;
  try {
    if (!shopSetup.pending) {
      const pending = { requestId: crypto.randomUUID(), name: byId('createShopName').value.trim(), divisionId: Number(byId('createShopDivision').value) };
      // Persist before sending so refreshes and lost responses reuse the same request.
      sessionStorage.setItem(shopSetup.key, JSON.stringify(pending));
      shopSetup.pending = pending;
    }
    shopSetupReady();
    byId('createShopResult').textContent = 'Creating shop and stock location…';
    csrfToken = (await request('/api/security/csrf')).token;
    const result = await post('/api/admin/shops', shopSetup.pending);
    sessionStorage.removeItem(shopSetup.key);
    shopSetup.pending = null;
    created = true;
    byId('createShopName').value = '';
    byId('createShopResult').textContent = `${result.message} Location code: ${result.locationCode}. Refresh the POS to select this shop.`;
  } catch (error) {
    if (error.status === 400) {
      sessionStorage.removeItem(shopSetup.key);
      shopSetup.pending = null;
    }
    byId('createShopResult').textContent = error.message + (shopSetup.pending ? ' Retry to confirm the save.' : '');
  } finally {
    shopSetup.saving = false;
    shopSetupReady();
  }
  if (created) {
    if (typeof masterForms !== 'undefined') masterForms.lookups = null;
    await loadShopSetup();
    await loadOverview();
    const selected = byId('salesOptionsShop').value;
    try {
      const lookups = await request('/api/admin/forms/lookups');
      byId('salesOptionsShop').replaceChildren(new Option('Company defaults', '0'), ...lookups.shops.map(s => new Option(s.shopName, s.shopId)));
      byId('salesOptionsShop').value = selected;
      await loadVmsStatus();
    } catch (error) { showError(error.message); }
  }
});
