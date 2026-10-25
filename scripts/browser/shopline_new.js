// Ccloth：Shopline 網站近 N 天上架的新品清單（在該網站任一頁用內建瀏覽器的 javascript_tool 執行）。
// Shopline 的商品 id 是 MongoDB ObjectId，前 8 個十六進位字元就是建立時間（秒），拿來當上架日。
// 用法：先改 LIST（分類路徑）與 DAYS，整段貼進 javascript_tool。輸出 JSON 字串，每件：
//   {id, listed_at, title, url, image, prices:[數字…], labels}
(async () => {
  const LIST = '/products';          // 例如 '/categories/men'、'/categories/allproducts'
  const DAYS = 62;                   // 近 2 個月
  const MAX_PAGES = 12;
  const cutoff = Date.now() / 1000 - DAYS * 86400;
  const seen = new Set();
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const sep = LIST.includes('?') ? '&' : '?';
    const html = await fetch(`${LIST}${sep}sort_by=created_at&order_by=desc&page=${page}`).then((r) => r.text());
    const box = document.createElement('div');
    box.innerHTML = html;
    const els = [...box.querySelectorAll('product-item[product-id]')];
    if (!els.length) break;
    let older = 0;
    for (const el of els) {
      const id = el.getAttribute('product-id');
      if (!/^[0-9a-f]{24}$/.test(id) || seen.has(id)) continue;
      seen.add(id);
      const ts = parseInt(id.slice(0, 8), 16);
      if (ts < cutoff) { older++; continue; }
      const a = el.querySelector('a[href*="/products/"]');
      const img = el.querySelector('img[data-srcset], img[src]');
      const srcset = img ? (img.getAttribute('data-srcset') || img.getAttribute('src') || '') : '';
      const image = (srcset.match(/https:\/\/[^\s,]+540x[^\s,]*/) || srcset.match(/https:\/\/[^\s,]+/) || [''])[0];
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      const prices = [...text.matchAll(/NT\$\s?([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
      const ga = a && a.getAttribute('ga-product');
      let title = img ? img.getAttribute('alt') : '';
      try { title = JSON.parse(ga).title || title; } catch (e) { /* 沒有 ga-product 就用 alt */ }
      const labels = [...el.querySelectorAll('.product-customized-labels-content')].map((x) => x.textContent.trim());
      out.push({ id, listed_at: new Date(ts * 1000).toISOString().slice(0, 10), title, url: a ? a.href : '', image, prices, labels });
    }
    if (older === els.length) break;  // 整頁都超過期限就停
    await new Promise((r) => setTimeout(r, 300));
  }
  return JSON.stringify({ site: location.host, list: LIST, days: DAYS, count: out.length, items: out });
})();
