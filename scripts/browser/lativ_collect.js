// Lativ 商品資料與評論收集（在 Claude 桌面版內建瀏覽器的 lativ.com.tw 分頁裡執行）
// 用法：先開任一 https://www.lativ.com.tw/product/xxxxx 頁面，把 IDS 換成這期要看的商品編號，
//       用 javascript_tool 執行。輸出很長會自動存成檔案，再用 scripts/lativ_import.py 轉成候選資料。
// 為什麼要用瀏覽器：Lativ 的尺寸表是圖片、評論由 /v1/comments API 載入，網頁抓取工具被 robots.txt 擋下。
// 請求依序送出、每次間隔 300ms（規則要求 ≥ 250ms）。
const IDS = ['75321', '72945'];
const SIZE_NAME = { '1': 'S', '2': 'M', '3': 'L', '4': 'XL', '5': 'XXL', '6': '3XL' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
for (const id of IDS) {
  const html = await fetch(`/product/${id}`).then((r) => r.text());
  const m = html.match(/<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/);
  let b = null;
  if (m) {
    for (const v of Object.values(JSON.parse(m[1]))) {
      if (v && v.body && v.body.meta && v.body.meta.productId === id && v.body.sizes) { b = v.body; break; }
    }
  }
  await sleep(300);
  let token = '';
  const reviews = [];
  for (let page = 0; page < 3; page++) { // 每頁 200 則，最多 600 則（規則：估尺寸抓到 600 則）
    const c = await fetch(`/v1/comments/${id}?productId=${id}&pageSize=200&pageToken=${encodeURIComponent(token)}`).then((r) => r.json());
    for (const r of c.ratings || []) {
      reviews.push({ size: SIZE_NAME[(r.skuId || '').slice(-2, -1)] || null, date: (r.createTime || '').slice(0, 10),
                     text: (r.content || '').replace(/\s+/g, ' ').slice(0, 300), rating: null });
    }
    token = c.nextPageToken || '';
    await sleep(300);
    if (!token) break;
  }
  const img = (h) => (h ? `https://cdx.lativ.com.tw/upload-v1/${h}` : null);
  out[id] = b ? {
    name: b.meta.name, price: { original: Number(b.meta.originPrice) || null, sale: Number(b.meta.promotionPrice || b.meta.originPrice) || null },
    material: b.material, origin: b.origin, colors: (b.colors || []).map((x) => x.color && x.color.name),
    sizes: (b.sizes || []).map((s) => s.name),
    soldOutSkus: Object.entries(b.inventory || {}).filter(([, v]) => !v.num).map(([k]) => k),
    allSoldOut: Object.values(b.inventory || {}).every((v) => !v.num),
    sizeChartImage: img(b.sizeChartImage && b.sizeChartImage.hash),
    fittingReportImage: img(b.fittingReportImage && b.fittingReportImage.hash),
    ratingCount: Number(b.ratingCount) || 0, ratingSummary: b.ratingSummary || '',
    description: b.productDescription || null, reviews,
  } : { error: '讀不到商品資料', reviews };
}
JSON.stringify(out, null, 2);
