// Ccloth：MUSINSA 商品的官方實測尺寸（在 www.musinsa.com 任一頁用內建瀏覽器的 javascript_tool 執行）。
// goodsNo 可從訂單信商品圖網址取得（.../goods_img/日期/{goodsNo}/...）。
// 鍵名對照：총장=length、어깨너비=shoulder、가슴단면=chest、소매길이=sleeve、밑단단면=hem_width（上衣）／leg_opening（褲子）、
//          허리단면=waist、허벅지단면=thigh、밑위=rise。0 代表沒量，不要填。
(async () => {
  const IDS = [1759490];
  const out = {};
  for (const id of IDS) {
    const a = await fetch(`https://goods-detail.musinsa.com/api2/goods/${id}/actual-size`).then((r) => r.json());
    out[id] = { type: a.data && a.data.typeName, sizes: (a.data && a.data.sizes || []).map((s) => [s.name, Object.fromEntries(s.items.map((i) => [i.name, i.value]))]) };
    await new Promise((res) => setTimeout(res, 250));
  }
  return JSON.stringify(out);
})();
