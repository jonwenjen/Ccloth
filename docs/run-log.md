# 執行紀錄

最新的在最上面。每次執行在這裡加一筆：日期、模型、數量、自我審查改了什麼、待改進。

## 2026-10-25　加入 8 個品牌後重跑

- 模型：claude-opus-5-5
- 依 Robin 指示加入 YANGI、Professor.Ę、JERSCY、PROJEXT、Mr. Henley、TAICHI、VOUX、CUBOX。7 個確認官網可下單（verified）；VOUX 已宣布退出台灣市場、官網商品連結錯亂，標為 closing 不選品。
- 範圍：12 個已確認品牌（原 5 個＋新 7 個）。
- 結果：候選 54、入選 49、剔除 5（新增剔除：Professor.Ę Faded Black Denim 褲長多 10cm 且超預算 182%、CUBOX 條紋 POLO 肩寬多 12cm）。
- 前三名不變（GOOPi P1-S、Lativ 彈性西裝長褲、Lativ 工裝寬版襯衫）。新品牌最高：JERSCY 超級重磅 TEE 第 5 名、TAICHI 賈伯斯 JOBS 長袖第 9 名、YANGI Long Sleeve Crewneck 第 11 名。
- 折扣：新增 JERSCY 重磅系列與套裝、Mr. Henley 8 折、PROJEXT 部分 6 折、YANGI 夏季款約 8 折、CUBOX 5 折起、TAICHI 滿 3 件折 100／5 件折 300（10/30 截止）。都不是有明確日期的大檔，沒有新建日曆提醒。

### 規則與程式調整

- 新增「沒有尺寸表」注意（−0.1）與 `size_fallback`（官方實穿者或版型說明推估的尺寸）；沒有任何依據時顯示「到貨試穿為準」。
- 品牌狀態不是 verified 的商品自動剔除；網站「品牌」頁依狀態顯示「待確認網址」或「品牌已退場」。
- `price.basis` 可覆寫價格依據（Professor.Ę 美元價 × 32.508 換算），網站價格區塊會顯示換算方式。
- TAICHI、Mr. Henley 的尺寸表是圖片，用內建瀏覽器判讀成數字。

### 待改進

- JERSCY（inffits 尺寸工具）、PROJEXT（長圖）的尺寸表還沒讀到，下期用內建瀏覽器判讀。
- TAICHI（4.8 分／5,240 則）、PROJEXT（4.8 分／44 則）商品頁有評論，但內容要另外載入；下期試抓評論做排雷與尺寸 B。
- Professor.Ę 只有美元價、國際運費另計，實際到手價會更高。

## 2026-10-25　第一期（建置＋首次分析）

- 模型：claude-opus-5-5
- 範圍：5 個已確認品牌（plain-me、GOOPiMADE、WISDOM、Filter017、Lativ）；MIXFIT、1973、Resurrection 找不到官方賣場，標為 needs_url。
- 結果：候選 35、入選 32、剔除 3（GOOPi PC-01X 胸寬多 10cm、WISDOM WIDE PANTS 褲口多 10cm、Lativ 粗針半開襟毛衣全尺寸售完）。
- 購買紀錄：從 Gmail 匯入 23 筆（MUSINSA 2026-10-24 兩張訂單共 12 件、plain-me 官網與蝦皮 11 件）。MUSINSA 12 件全部「到貨確認」或「注意穿法」。
- 折扣：蝦皮 11.11（10/11–11/13）、Crealive 季末折扣（到 11/2）已建 Google 日曆提醒。

### 建置時的規則調整

- 原規則為 MUSINSA 設計，改為在地化：中文排雷關鍵字＋否定片語，排除「透氣」「輕薄外套」等誤判；代購溢價只適用韓、日進口款。
- 尺寸挑選：主尺寸（褲子腰圍、上衣胸寬）比範圍小 0.5cm 以上的尺寸排最後；同分取最接近範圍中心。
- 尺寸 B：≥ 5 人，或 ≥ 3 人且 ≥ 75% 一致，且該尺寸偏差 ≤ 2.5cm，才改用評論尺寸。
- 評論原文不進公開 repo，score.py 會壓縮成尺寸、身高體重、排雷類別。

### 待改進

- MUSINSA 新訂單的 goodsNo 與實測尺寸：商品頁尺寸表無法自動讀取，到貨後請量好填進 data/orders.json，或下期改用內建瀏覽器讀 MUSINSA Global。
- Lativ 尺寸表是圖片、評論 API 被 robots.txt 擋：需要 Claude 桌面版開著。03:47 排程時電腦多半在睡，Lativ 可能只有列表資料。
- 台灣品牌官網幾乎沒有評論，「樣本太少」注意會很常見；下期試 momo／蝦皮同款評論。
- 雙向拉鍊輕夾克本期沒有合格款，下期優先找。
