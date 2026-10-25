#!/usr/bin/env python3
"""發布前檢查：資料格式、必填欄位、預算理由、隱私（公開 repo 不能有訂單編號、收件人、地址、電話）。
有錯誤時以非 0 結束，發布流程要停下來修。
用法：python3 scripts/validate.py
"""
from __future__ import annotations

import json
import re
import sys

from ccloth_lib import CONFIG, DATA, ROOT, brands, load_json, rules

errors, warnings = [], []

PRIVACY_KEYS = {"order_no", "order_number", "order_id", "recipient", "receiver", "address", "phone", "mobile", "email", "card"}
PRIVACY_PATTERNS = [
    (re.compile(r"(?<!\d)09\d{2}[- ]?\d{3}[- ]?\d{3}(?!\d)"), "手機號碼"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "Email"),
    (re.compile(r"[市縣].{1,6}[區鄉鎮市].{0,15}[路街道].{0,10}號"), "地址"),
    (re.compile(r"訂單(?:編號|號碼)\s*[:：]?\s*[A-Z0-9]{6,}"), "訂單編號"),
]
ALLOWED_EMAILS = {"mail.global@musinsa.com"}


def walk(obj, path, fn):
    if isinstance(obj, dict):
        for k, v in obj.items():
            fn(k, v, f"{path}.{k}")
            walk(v, f"{path}.{k}", fn)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            walk(v, f"{path}[{i}]", fn)


def privacy_scan(name, obj):
    def fn(k, v, p):
        if str(k).lower() in PRIVACY_KEYS:
            errors.append(f"{name}{p}：欄位名稱「{k}」可能是個資，公開 repo 不能寫入")
        if isinstance(v, str):
            for pat, label in PRIVACY_PATTERNS:
                m = pat.search(v)
                if m and m.group(0) not in ALLOWED_EMAILS:
                    errors.append(f"{name}{p}：疑似{label}「{m.group(0)[:20]}…」")
    walk(obj, "", fn)


def check_items(name, items, r, brand_ids, slot_ids, require_scores=True):
    for it in items:
        tag = f"{name}:{it.get('id')}"
        for f in ("id", "brand", "name", "category", "url"):
            if not it.get(f):
                errors.append(f"{tag} 缺 {f}")
        if it.get("brand") not in brand_ids:
            errors.append(f"{tag} 品牌 {it.get('brand')} 不在 config/brands.json")
        if it.get("category") not in r["categories"]:
            errors.append(f"{tag} 類別 {it.get('category')} 不在規則裡")
        if it.get("slot") and it["slot"] not in slot_ids:
            errors.append(f"{tag} 衣櫥格 {it['slot']} 不存在")
        if require_scores:
            ex = it.get("experts") or {}
            for k in r["experts"]:
                e = ex.get(k) or {}
                if not isinstance(e.get("score"), (int, float)) or not 1 <= e["score"] <= 5:
                    errors.append(f"{tag} 專家「{r['experts'][k]['label']}」分數要 1–5")
                if not e.get("comment"):
                    errors.append(f"{tag} 專家「{r['experts'][k]['label']}」缺評語")
            for f in ("summary", "pairing"):
                if not it.get(f):
                    errors.append(f"{tag} 缺 {f}")
        b = it.get("budget")
        if b and b.get("over_pct") and not it.get("budget_reason"):
            errors.append(f"{tag} 超出預算 {b['over_pct']}% 但沒有 budget_reason")


def main():
    for p in list(CONFIG.glob("*.json")) + list(DATA.rglob("*.json")):
        try:
            json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{p.relative_to(ROOT)} 不是合法 JSON：{e}")
    if errors:
        report()
    r = rules()
    brand_ids = {b["id"] for b in brands()["brands"]}
    slot_ids = {s["id"] for s in r["capsule_slots"]}

    rep = load_json(DATA / "report.json")
    if rep:
        check_items("report", rep.get("items", []), r, brand_ids, slot_ids)
        if len(rep.get("items", [])) > r["ranking"]["max_items"]:
            errors.append("入選超過上限")
        for key in ("trends", "discounts", "outfits"):
            if not rep.get(key):
                warnings.append(f"report 缺 {key}")
    orders = load_json(DATA / "orders.json", {"items": []})
    for o in orders.get("items", []):
        if o.get("verdict") not in r["order_verdicts"]:
            errors.append(f"orders:{o.get('id')} 判定 {o.get('verdict')} 不在 {list(r['order_verdicts'])}")
        if o.get("slot") and o["slot"] not in slot_ids:
            errors.append(f"orders:{o.get('id')} 衣櫥格 {o['slot']} 不存在")

    for p in (DATA / "candidates").glob("*.json"):
        for it in json.loads(p.read_text(encoding="utf-8")).get("items", []):
            if any("text" in rv for rv in (it.get("reviews") or {}).get("items", [])):
                errors.append(f"{p.name}:{it.get('id')} 還留著評論原文，先跑 scripts/score.py 壓縮")
    for p in DATA.rglob("*.json"):
        if "raw" in p.parts:
            continue
        privacy_scan(str(p.relative_to(ROOT)), json.loads(p.read_text(encoding="utf-8")))
    report()


def report():
    for w in warnings:
        print("注意：", w)
    for e in errors:
        print("錯誤：", e)
    print(f"檢查完成：{len(errors)} 個錯誤、{len(warnings)} 個注意")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
