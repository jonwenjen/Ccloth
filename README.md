# Ccloth

Robin 的台灣男裝選物系統。每月 15 日自動分析 16 個品牌的購物網站（plain-me、GOOPiMADE、WISDOM、Filter017、MIXFIT、1973、Resurrection、Lativ，以及 2026-10-25 加入的 YANGI、Professor.Ę、JERSCY、PROJEXT、Mr. Henley、TAICHI、VOUX、CUBOX），依身形（175cm／75kg，肩 44、胸 48、腰 43.5，有點肚子）、黃偏黑膚色、「43 歲穿出 35 歲感」的目標與膠囊衣櫥缺口挑選單品，結果發布成手機優先的網站。

網站：<https://jonwenjen.github.io/Ccloth/>

## 網站有什麼

| 分頁 | 內容 |
|---|---|
| 選物 | 本月入選單品，依 rank 排序。每件有建議尺寸、分級提醒、皮尺尺寸條（黃色是你的範圍、黑線是該尺寸實際數字），展開看五項專家評分、尺寸 A／B／最終建議、排雷數據、價格、材質與保養 |
| 折扣 | 檔期倒數與折價券 |
| 穿搭 | 高雄 5 個溫度帶；自動抓今天氣溫，專家搭配＋用已購與清單自動組合 |
| 衣櫥 | 12 格膠囊衣櫥，已購＋清單即時算還缺什麼，缺的格子直接連到本月可補的單品 |
| 清單 | 按「＋ 加入清單」存在手機瀏覽器；「同步到 GitHub」開一個 Issue，15 號自動匯入 |
| 已購 | Gmail 匯入的訂單與逐件判定；可以標「已淘汰」 |
| 潮流 | 本季、下一季、不退流行、對你不利的流行，每條寫「Robin 怎麼穿」 |
| 品牌 | 材質優先的五項指標與綜合分 |
| 方法 | 版型範圍、分級提醒、這期的自我審查 |

## 檔案

```
config/rules.json        所有選品規則（改規則只改這裡）
config/brands.json       16 個品牌的賣場網址與狀態（verified = 選品；needs_url = 還沒找到賣場；closing = 品牌退場）
data/candidates/M.json   每月候選單品原始資料（評論只留統計欄位）
data/report.json         網站讀的最新月報；data/history/ 保留每一期
data/orders.json         購買紀錄（不含訂單編號、收件資料）
data/wishlist.json       從 Issue 匯入的清單
scripts/score.py         候選 → 月報：尺寸、提醒、排序、品牌分
scripts/validate.py      發布前檢查（格式、預算理由、隱私）
scripts/import_wishlist.py  匯入清單 Issue
scripts/lativ_import.py、scripts/browser/lativ_collect.js  Lativ 資料收集
PLAYBOOK.md              每月流程（排程任務照這份執行）
docs/run-log.md          每次執行的紀錄
```

## 手動跑一次

```
python3 scripts/score.py 2026-10
python3 scripts/validate.py
```

只用 Python 標準函式庫，不需要安裝套件。

## 待 Robin 確認

- MIXFIT、1973、Resurrection 還沒找到可以下單的官方賣場（詳見 `config/brands.json` 的 notes）。把網址填進 `store`、`status` 改成 `verified`，下一期就會納入。
- VOUX 已宣布退出台灣市場，標為 `closing`，不選品。
- 尺寸表不是文字的品牌（JERSCY、PROJEXT 等）：候選檔可寫 `size_fallback`（官方實穿者或版型說明），並自動加「沒有尺寸表」注意。
