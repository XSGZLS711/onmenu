// Receipt-only print document keeps report/A4 styles separate.
function receiptPaperWidthMm() {
  return Number(state.receiptPaperWidthMm) === 58 ? 58 : 80;
}
async function printThermalReceipt(paper,paperWidth=receiptPaperWidthMm(),maxPageHeightMm=null) {
  if (!paper) throw new Error('Receipt is not ready for printing.');
  const width = Number(paperWidth)===58?58:80, contentWidth = width - 4;
  const frame = document.createElement('iframe');
  frame.title = 'Receipt print';
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}mm;height:1px;border:0`;
  document.body.append(frame);
  let cleanupTimer;
  const cleanup = () => { clearTimeout(cleanupTimer); frame.remove(); };
  try {
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><title>SoftPOS receipt</title><style>
      *{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:black}
      body{width:${contentWidth}mm;font:${width===58?700:400} ${width===58?14:12}px/${width===58?1.4:1.35} Arial,sans-serif;overflow-wrap:anywhere}
      article{margin:0;padding:0;width:100%}h2{font-size:16px;margin:4px 0}h3{font-size:13px;margin:4px 0}p{margin:5px 0}
      pre,#trainingReceiptHeader{font:${width===58?14:11.5}px/1.4 ${width===58?"Consolas,'DejaVu Sans Mono',monospace":"'Courier New',monospace"};white-space:pre-wrap;overflow-wrap:anywhere;margin:0;width:100%;color:black}
      pre{font-weight:${width===58?700:400}}
      #trainingReceiptHeader{font-weight:bold;margin-bottom:4px}[hidden],button,a{display:none!important}
      img{display:block;width:${width===58?54:64}mm;max-width:100%;height:auto;margin:3mm auto;padding:2mm;background:white;image-rendering:pixelated;break-inside:avoid;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      table{width:100%;min-width:0;table-layout:fixed;border-collapse:collapse;font-size:inherit}th,td{padding:3px 1px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top;overflow-wrap:anywhere}
      th:first-child,td:first-child{width:55%}th:nth-child(2),td:nth-child(2){width:15%}th:last-child,td:last-child{width:30%;text-align:right}
      small{display:block;white-space:pre-wrap;${width===58?'font-size:inherit;font-weight:700;':''}}dl{margin:6px 0}dl>div{display:flex;justify-content:space-between;gap:6px;padding:3px 0}dt{min-width:0}dd{margin:0;text-align:right;flex-shrink:0}
      #fiscalQrBlock{width:100%;max-width:100%;margin:0;padding:0;break-inside:avoid;page-break-inside:avoid}#fiscalFooter{break-before:avoid}
      .offline-receipt-warning{font-weight:bold;border:1px solid black;padding:4px}
      @page{margin:2mm}
    </style></head><body></body></html>`);
    doc.close();
    // Preserve receipt text and QR contents without the screen's fixed widths.
    for (const child of paper.childNodes) doc.body.append(doc.importNode(child, true));
    await Promise.all(Array.from(doc.images).filter(img => !img.closest('[hidden]')).map(img => img.decode()));
    if (doc.fonts) await doc.fonts.ready;
    // Keep the signed journal's columns on their original lines. Condense only
    // horizontally when necessary; the larger font height and bold weight remain.
    if (width === 58) {
      const canvas = doc.createElement('canvas'), context = canvas.getContext('2d');
      const available = doc.body.getBoundingClientRect().width;
      for (const journal of doc.querySelectorAll('pre:not([hidden])')) {
        const style = frame.contentWindow.getComputedStyle(journal);
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const original = journal.textContent;
        const parts = original.split(/(\r?\n)/);
        const lines = parts.filter((_, index) => index % 2 === 0);
        const longest = Math.max(1, ...lines.map(line => context.measureText(line).width));
        // Fiscal journals normally use a fixed-width divider. Long identifiers
        // get their own fit, so they cannot shrink the item and total columns.
        const divider = lines.find(line => /^[-=]{20,}$/.test(line));
        const columns = divider ? divider.length : 40;
        const columnWidth = Math.min(longest, context.measureText('0'.repeat(columns)).width);
        journal.replaceChildren();
        journal.style.whiteSpace = 'normal';
        journal.style.overflowWrap = 'normal';
        journal.style.overflow = 'hidden';
        for (let index = 0; index < parts.length; index++) {
          if (index % 2) { journal.append(doc.createTextNode(parts[index])); continue; }
          const line = parts[index];
          const lineWidth = Math.max(columnWidth, context.measureText(line).width, 1);
          const scale = Math.min(1, available / Math.ceil(lineWidth));
          const row = doc.createElement('span');
          row.className = 'thermal-journal-line';
          row.textContent = line;
          row.style.cssText = `display:block;white-space:pre;width:${available / scale}px;min-height:${style.lineHeight};transform-origin:top left;transform:scaleX(${scale})`;
          journal.append(row);
        }
      }
    }

    const heightMm = Math.max(20, Math.ceil(doc.body.getBoundingClientRect().height * 25.4 / 96) + 4);
    const pageStyle = doc.createElement('style');
    pageStyle.textContent = `@page{size:${width}mm ${maxPageHeightMm===297?Math.min(heightMm,297):heightMm}mm;margin:2mm}`;
    doc.head.append(pageStyle);
    frame.contentWindow.addEventListener('afterprint', cleanup, {once:true});
    cleanupTimer = setTimeout(cleanup, 60000);
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
