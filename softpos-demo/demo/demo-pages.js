// Registry for pages the demo adds on top of the vendor's own (the back-office pages).
// A page is { key, module, label: [en, zh], open(), close() }. `module` is one of
// dashboard, sales, products, stock, purchasing, customers, reports, setup. `open()` shows the page, `close()` hides it.
// The sidebar lists registered pages under their module and calls DemoPages.open(key); choosing any other entry calls DemoPages.closeAll().
(function () {
  'use strict';
  var pages = [], current = null;
  function fire() { document.dispatchEvent(new CustomEvent('demopages')); }
  window.DemoPages = {
    list: pages,
    register: function (page) {
      for (var i = pages.length - 1; i >= 0; i--) if (pages[i].key === page.key) pages.splice(i, 1);
      pages.push(page);
      fire();
    },
    get: function (key) { return pages.filter(function (p) { return p.key === key; })[0] || null; },
    open: function (key) {
      var page = this.get(key);
      if (!page) return false;
      this.closeAll();
      current = page;
      page.open();
      fire();
      return true;
    },
    closeAll: function () {
      if (!current) return;
      var page = current;
      current = null;
      if (page.close) page.close();
    },
    current: function () { return current ? current.key : null; }
  };
})();
