# 執行紀錄

最新的在最上面。每次執行在這裡加一筆：日期、模型、數量、自我審查改了什麼、待改進。

## 2026-10-25　第二輪：近 2 個月新品、高雄季節、圖片

- 模型：claude-opus-5-5
- Robin 指示：選物／穿搭／衣櫥加圖片；每月找近 2 個月上架、當季與下一季要穿的單品；依高雄過去氣候挑未來 3 個月的單品；圖片尺寸表都要讀；上次沒做到的一併處理。
- 結果：候選 62、入選 56（31 件是近 2 個月新品、51 件至少 2 個月穿得到）、剔除 6（新增 PROJEXT Pima Boxy Tee：尺寸圖只有女模特兒，判定女款）。
- 前三名：GOOPi P1-S 黑褲 2 號、JERSCY 長袖超級重磅 TEE L（10/10 新品）、JERSCY 厚磅紋理長袖 Polo L（9/30 新品）。
- 新增候選 9 件：JERSCY 長袖重磅 TEE、長袖 Polo、美麗諾針織；GOOPi 亨利領長袖、EVD 口袋襯衫；plain-me 經典挺拔上班神褲、燈芯絨狩獵外套；YANGI White Collar Polo。
- 高雄未來 3 個月（平年值＋近 5 年偏差）：11 月 21–28°C、12 月 17–24°C、1 月 15–23°C；近年 12、1 月比平年冷約 1°C，寒流最低 7.7°C。

### 規則與程式調整

- `rules.json`：加 `climate`、`alerts.new_arrival`（> 62 天注意）、`alerts.season_fit`（未來 3 個月都用不到警告、只 1 個月注意）；版本 2026-10-25c。
- `score.py`：算未來 3 個月常見氣溫與溫度帶（`report.climate`）、每件 `season_months` 與 `arrival`；`counts` 加新品與適穿件數。
- 尺寸表圖片：JERSCY（inffits 彈窗 `#stImage`）、PROJEXT（描述最後一張）、TAICHI、Mr. Henley 全部判讀；長圖用 images.weserv.nl 裁切。JERSCY 超級重磅 TEE 改建議 XL。
- 評論：Shopline 官方評價 API，JERSCY、TAICHI、PROJEXT 抓最新 200 則（多數全 5 星）。
- 購買紀錄：MUSINSA 12 件從訂單信圖片網址取得 goodsNo，用實測尺寸 API 補 measurements 並重判（5 件直接穿、7 件注意穿法）；補商品圖 16 件。
- 網站：單品卡、專家搭配、自動配、衣櫥、清單、已購加商品圖；選物加「只看近 2 個月新品」「只看未來 3 個月適穿」；穿搭頁加高雄未來 3 個月氣溫。
- 新增 `scripts/browser/shopline_new.js`、`shopline_reviews.js`、`musinsa_actual_size.js`。

### 待改進

- plain-me 舊訂單（Billy Pants、1616 系列等）官網已下架，商品圖找不到 9 件，網站顯示類別字樣。
- Professor.Ę 官網沒有公開運費頁，國際運費只能到結帳頁才看得到（不代為操作）。
- Shopline 評價沒有身高體重，同身形樣本仍然不足；下期試 Dcard／PTT 同款討論。
- 雙向拉鍊輕夾克：12 個品牌近 2 個月新品仍沒有合格款（GOOPi 翻領短外套有雙向拉鍊但肩寬 60.5）。
- 每年 1 月更新 `rules.json → climate.recent`。

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
