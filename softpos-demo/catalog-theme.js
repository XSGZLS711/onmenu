// Category colours follow existing records. Tiles show only uploaded product photos.
function catalogIcon(kind){
 const paths={meals:'M7 3v6m-3-6v6m6-6v6M4 9h6m-3 0v12M17 3v18m0-18c4 3 4 8 0 9',drinks:'M9 3h6v3l2 3v11H7V9l2-3V3Zm0 3h6M7 11h10',groceries:'M4 9h16l-2 11H6L4 9Zm4 0 4-6 4 6M9 13v4m6-4v4',services:'m14 5 5-3c2 4-1 8-5 8L7 20a3 3 0 0 1-4-4l10-7c-1-4 2-7 6-7',apparel:'m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c-1 3-7 3-8 0',products:'m3 7 9-4 9 4v11l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v11M7 5l9 4',flame:'M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8Z',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z'};
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(paths[kind]||paths.products).split('|').map(d=>`<path d="${d}"/>`).join('')}</svg>`;
}
function catalogKind(name,nonStock=false){
 const value=String(name||'').toLowerCase();
 if(/meal|chicken|pizza|fries|food|restaurant/.test(value))return 'meals';
 if(/drink|beverage|water|coke|cola|juice|milk|drop|aqua|mother/.test(value))return 'drinks';
 if(/cloth|shirt|apparel|fashion/.test(value))return 'apparel';
 if(/service|repair/.test(value)||nonStock)return 'services';
 if(/grocer|biscuit|rice|bread|snack|kava/.test(value))return 'groceries';
 return 'products';
}
function categoryPresentation(category){
 const name=category?.categoryName||'All products';
 const kind=catalogKind(name);
 const tones={meals:'orange',drinks:'blue',groceries:'green',services:'purple',apparel:'rose'};
 const palette=['blue','green','purple','orange','rose','teal'];
 const tone=category?.categoryId==null?'teal':(tones[kind]||palette[Math.abs(Number(category.categoryId)||0)%palette.length]);
 return {name,kind,tone};
}
function productPresentation(product){
 const category=(state.bootstrap?.categories||[]).find(c=>Number(c.categoryId)===Number(product.categoryId)&&product.categoryId!=null);
 const theme=category?categoryPresentation(category):{name:product.stockItem===false?'Services':'Products',tone:product.stockItem===false?'purple':'blue'};
 return {...theme,kind:catalogKind(product.productName,product.stockItem===false)};
}
function catalogVisual(product){
 return product.imageUrl?`<div class="product-visual"><img class="product-photo" src="${esc(product.imageUrl)}" alt="${esc(product.productName)}" loading="lazy"></div>`:'';
}
function catalogCartThumb(line){
 return line.imageUrl?`<div class="cart-thumb"><img src="${esc(line.imageUrl)}" alt="" loading="lazy"></div>`:'';
}

// Reserve only the grid rows that sit beside the desktop keypad.
addEventListener('DOMContentLoaded',()=>{
 const catalog=document.querySelector('#orderView .catalog'),panel=document.getElementById('priceEntryPanel'),list=document.getElementById('productList');
 if(!catalog||!panel||!list)return;
 let frame=0;
 function update(){
  frame=0;
  const active=innerWidth>=1200&&catalog.classList.contains('price-keypad-active')&&!panel.hidden&&!list.classList.contains('list-mode')&&list.getClientRects().length>0;
  const rows=active?Math.max(0,Math.ceil((panel.getBoundingClientRect().bottom-list.getBoundingClientRect().top+8)/112)):0;
  if(rows>0){const value=String(rows);if(list.style.getPropertyValue('--keypad-reserved-rows')!==value)list.style.setProperty('--keypad-reserved-rows',value);}
  list.classList.toggle('keypad-wrap',rows>0);
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(update);}
 const resize=new ResizeObserver(schedule);[catalog,panel,list].forEach(el=>resize.observe(el));
 const changes=new MutationObserver(schedule);changes.observe(catalog,{attributes:true,attributeFilter:['class']});changes.observe(panel,{attributes:true,attributeFilter:['hidden']});changes.observe(list,{attributes:true,attributeFilter:['class'],childList:true});
 addEventListener('resize',schedule);schedule();
});
