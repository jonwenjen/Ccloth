// Ccloth：Shopline 網站的官方評價（在該網站任一頁用內建瀏覽器的 javascript_tool 執行）。
// 用法：改 PATHS（商品路徑）與 MAX，整段貼進 javascript_tool。輸出 {path: {pid, listed_at, total, items:[[星等, 內容], …]}}。
// 評論原文只在本機整理用，寫進候選檔後 score.py 會壓縮成統計欄位，不會進公開 repo。
(async () => {
  const PATHS = ['/products/w0101'];
  const MAX = 200;
  const mid = (document.documentElement.outerHTML.match(/"merchant_id"\s*:\s*"([0-9a-f]{24})"/) || [])[1];
  const out = {};
  for (const path of PATHS) {
    const html = await fetch(path).then((r) => r.text());
    const m = html.match(/"@type":"Product"[\s\S]{0,400}?"sku":"([0-9a-f]{24})"/);
    if (!m) { out[path] = { err: '找不到商品 id' }; continue; }
    const pid = m[1];
    const items = []; let total = null;
    for (let page = 1; page <= Math.ceil(MAX / 50); page++) {
      const r = await fetch(`/api/merchants/${mid}/products/${pid}/product_review_comments?page=${page}&limit=50`).then((x) => x.json());
      total = r.total;
      (r.items || []).forEach((x) => items.push([x.score, (x.comment || '').replace(/[​　\s]+/g, ' ').trim()]));
      if (items.length >= total || !(r.items || []).length) break;
      await new Promise((res) => setTimeout(res, 250));
    }
    out[path] = { pid, listed_at: new Date(parseInt(pid.slice(0, 8), 16) * 1000).toISOString().slice(0, 10), total, items: items.slice(0, MAX) };
  }
  return JSON.stringify(out);
})();
