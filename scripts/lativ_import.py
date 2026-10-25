#!/usr/bin/env python3
"""把 scripts/browser/lativ_collect.js 的輸出（工具存下來的檔案或純 JSON）轉成 data/raw/lativ-YYYY-MM.json。

用法：python3 scripts/lativ_import.py <輸出檔> 2026-11
之後在候選檔裡用 reviews=raw[id]["reviews_block"]，尺寸表另外看 sizeChartImage 圖片手動填入。
"""
from __future__ import annotations

import json
import sys

from ccloth_lib import DATA, save_json


def load_any(path: str):
    raw = json.load(open(path, encoding="utf-8"))
    if isinstance(raw, list) and raw and isinstance(raw[0], dict) and "text" in raw[0]:
        txt = raw[0]["text"]  # 工具存檔格式：[{type, text}]，text 是被引號包起來的 JSON 字串
        start, end = txt.find('"{'), txt.rfind('}"') + 2
        return json.loads(json.loads(txt[start:end]))
    return raw


def main(path: str, month: str):
    data = load_any(path)
    out = {}
    for pid, d in data.items():
        revs = d.get("reviews", [])
        d["reviews_block"] = {"source": "Lativ 官網評論", "lang": "zh", "has_ratings": False,
                              "total_on_site": d.get("ratingCount", len(revs)), "items": revs}
        out[pid] = d
        flag = "（全尺寸售完）" if d.get("allSoldOut") else ""
        print(f"{pid} {d.get('name')} 評論 {len(revs)} 則{flag} 尺寸表：{d.get('sizeChartImage')}")
    save_json(DATA / "raw" / f"lativ-{month}.json", out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
