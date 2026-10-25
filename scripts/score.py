#!/usr/bin/env python3
"""把當月候選單品（data/candidates/YYYY-MM.json）依 config/rules.json 計算成網站用的 data/report.json。

用法：python3 scripts/score.py 2026-10
做的事：
  1. 尺寸 A（尺寸表）、B（同身形評論）、最終建議
  2. 分級提醒（注意 −0.1／警告 −0.3／嚴重 剔除），每條寫出程度
  3. 專家五項加權 → 綜合分；rank = 綜合分 − 扣分；同分比五項平均；上限 100 件
  4. 品牌綜合分（依 brand_lists 權重）、與上月比較
  5. 已購單品的版型核對、清單去除已買
  6. 高雄未來 3 個月氣候（平年值＋近 5 年偏差）→ 每件單品適穿月份；近 2 個月上架判斷
"""
from __future__ import annotations

import sys
from datetime import date, datetime, timezone, timedelta

from ccloth_lib import (DATA, analyze_reviews, brands, compact_reviews, fmt, load_json, recommend_from_chart, rules,
                        save_json, size_deviation)

TPE = timezone(timedelta(hours=8))
BRANDS = {b["id"]: b for b in brands()["brands"]}
EXPERT_KEYS = ["material", "fit", "build", "care", "function"]


def climate_horizon(r, run_date: date):
    """未來 N 個月（從下個月起）的常見氣溫：平年值平均低溫～平均高溫，加上近 5 年月均溫偏差；另列寒流低溫與熱天高溫。"""
    c = r.get("climate")
    if not c:
        return None
    n = c.get("horizon_months", 3)
    bands = r["temperature_bands"]
    months = []
    y, m = run_date.year, run_date.month
    for _ in range(n):
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        nm = c["normals"]
        tx, hi, lo = nm["tx"][m - 1], nm["tmax"][m - 1], nm["tmin"][m - 1]
        rec = c.get("recent", {}).get(str(m))
        anomaly = round(sum(rec["tx"]) / len(rec["tx"]) - tx, 1) if rec else 0.0
        low, high = round(lo + anomaly, 1), round(hi + anomaly, 1)
        cold = min(rec["min"]) if rec else None
        hot = max(rec["max"]) if rec else None
        hit = [b["id"] for b in bands if b["min"] < high and b["max"] > low]
        extra = []  # 偶爾會遇到：寒流（近 5 年最低溫 < 16°C）、熱天（平年 ≥ 30°C 天數 ≥ 3 天）
        if cold is not None and cold < 16 and "tcold" not in hit:
            extra.append("tcold")
        if nm["days_tmax_ge30"][m - 1] >= 3 and "t28" not in hit:
            extra.append("t28")
        months.append({"year": y, "month": m, "low": low, "high": high, "mean": round(tx + anomaly, 1),
                       "anomaly": anomaly, "cold_snap": cold, "hot_day": hot, "bands": hit, "occasional": extra,
                       "rain_days": nm["rain_days"][m - 1], "days_tmax_ge30": nm["days_tmax_ge30"][m - 1]})
    return {"from": run_date.isoformat(), "months": months, "method": c.get("method"),
            "station": c.get("station"), "period": c.get("normals_period"), "sources": c.get("sources", [])}


def season_fit(temps, horizon, r):
    """單品適穿溫度與每個月常見氣溫重疊 ≥ overlap_min_c 才算那個月穿得到。"""
    if not horizon or not temps:
        return None
    need = r["alerts"]["season_fit"]["overlap_min_c"]
    ok = []
    for mo in horizon["months"]:
        overlap = min(temps[1], mo["high"]) - max(temps[0], mo["low"])
        if overlap >= need:
            ok.append(mo["month"])
    return ok


def arrival(item, run_date: date, r):
    """近 2 個月上架：listed_at（商品 id 時間、published_at、首則評論日）或 new_flag（官網新品分類、26AW 標示）。"""
    cfg = r["alerts"]["new_arrival"]
    listed = item.get("listed_at")
    src = item.get("listed_source")
    if listed:
        days = (run_date - date.fromisoformat(listed)).days
        return {"is_new": days <= cfg["days"], "listed_at": listed, "days": days, "source": src}
    if item.get("new_flag"):
        return {"is_new": True, "listed_at": None, "days": None, "source": src}
    return {"is_new": False, "listed_at": None, "days": None, "source": src}


def level_name(r, lv):
    return r["levels"][str(lv)]["name"]


def add_alert(alerts, r, key, level, label, detail):
    alerts.append({"key": key, "level": level, "level_name": level_name(r, level), "label": label, "detail": detail})


def price_twd(item, fx):
    p = item.get("price", {})
    if p.get("sale") is not None:
        return float(p["sale"]), p.get("basis") or "台灣售價"
    if p.get("origin_price") is not None and fx.get(p.get("origin_currency")):
        return round(p["origin_price"] * fx[p["origin_currency"]]), "原產地售價換算"
    return None, None


def pct_alert(alerts, r, key, value, count, cfg):
    if value is None:
        return
    if value >= cfg["severe_pct"] and count >= cfg["severe_min_count"]:
        add_alert(alerts, r, key, 3, cfg["label"], f"{fmt(value)}%（{count} 則）≥ {cfg['severe_pct']}% 且 ≥ {cfg['severe_min_count']} 則")
    elif value > cfg["warn_pct"]:
        add_alert(alerts, r, key, 2, cfg["label"], f"{fmt(value)}%（約 {count} 人）> {cfg['warn_pct']}%")


def final_size(a, b_stats, chart, category, r, fallback=None):
    """A 與 B 衝突時：同身形 ≥ 5 人（或 ≥ 3 人且 ≥ 75% 一致）穿同一號，且該號偏差 ≤ 2.5cm，才改用 B。
    尺寸表與評論都沒有時，用候選檔的 size_fallback（例如官方實穿者身高體重、版型說明）。"""
    a_size = a["size"]
    votes = b_stats.get("size_votes") or {}
    total = sum(votes.values())
    if not votes:
        if a_size:
            return a_size, "同身形評論沒有尺寸資料，依尺寸表。"
        if fallback and fallback.get("size"):
            return fallback["size"], f"官網沒有可讀的尺寸表，也沒有同身形評論；{fallback.get('reason', '')}到貨試穿為準。"
        return None, "尺寸表與評論都不足，到貨試穿為準。"
    b_size, b_n = next(iter(votes.items()))
    if a_size is None:
        return b_size, f"尺寸表缺數字，依同身形評論多數（{b_n}/{total} 人穿 {b_size}）。"
    if b_size == a_size:
        return a_size, f"尺寸表與同身形評論一致（{b_n}/{total} 人穿 {b_size}）。"
    note_max = r["alerts"]["size_range"]["note_max_cm"]
    enough = total >= 5 or (total >= 3 and b_n / total >= 0.75)
    dev = size_deviation(chart[b_size], r["fit_ranges"][category])["max_dev"] if b_size in chart else None
    if enough and dev is not None and dev <= note_max:
        return b_size, (f"同身形 {b_n}/{total} 人穿 {b_size}，且 {b_size} 對照範圍偏差 {fmt(dev)}cm，"
                        f"改採評論；尺寸表推的 {a_size} 是備案。")
    why = "同身形人數不夠" if not enough else (f"{b_size} 不在尺寸表" if dev is None else f"{b_size} 偏差 {fmt(dev)}cm 太大")
    return a_size, f"同身形評論多數穿 {b_size}（{b_n}/{total} 人），但{why}，仍以尺寸表 {a_size} 為準。"


def score_item(item, r, fx, horizon=None, run_date=None):
    cat = item["category"]
    alerts = []
    excluded_reasons = []

    if item.get("in_stock") is False:
        excluded_reasons.append("缺貨")
    if item.get("gender") == "women":
        excluded_reasons.append("女裝")
    brand = BRANDS.get(item.get("brand"), {})
    if brand.get("status") not in (None, "verified"):
        excluded_reasons.append(f"品牌狀態 {brand.get('status')}：{brand.get('notes', '')}")

    chart = item.get("size_chart") or {}
    a = recommend_from_chart(chart, cat, r) if chart else {"size": None, "reason": "沒有尺寸表", "evals": {}}
    rv = analyze_reviews(item.get("reviews"), r)
    final, final_reason = final_size(a, rv, chart, cat, r, item.get("size_fallback"))

    # 尺寸範圍
    sr = r["alerts"]["size_range"]
    if final and final in chart:
        ev = size_deviation(chart[final], r["fit_ranges"][cat])
        if ev["max_dev"]:
            labels = r["measurement_labels"]
            worst = max(ev["devs"].items(), key=lambda kv: abs(kv[1]))
            lo, hi = r["fit_ranges"][cat][worst[0]]
            d = worst[1]
            detail = (f"{final} 號{labels.get(worst[0], worst[0])} {fmt(chart[final][worst[0]])}cm，"
                      f"{'超出' if d > 0 else '不足'} {fmt(abs(d))}cm（範圍 {fmt(lo)}–{fmt(hi)}）")
            lv = 1 if ev["max_dev"] <= sr["note_max_cm"] else 2 if ev["max_dev"] <= sr["warn_max_cm"] else 3
            add_alert(alerts, r, "size_range", lv, sr["label"], detail)

    if not chart:
        nc = r["alerts"]["no_chart"]
        add_alert(alerts, r, "no_chart", nc["level"], nc["label"], nc["note"])

    # 收口下擺
    hr = r["hem_rule"]
    if cat in hr["applies_to"] and final in chart:
        m = chart[final]
        if m.get("chest") and m.get("hem_width"):
            diff = m["chest"] - m["hem_width"]
            if diff >= hr["severe_diff_cm"]:
                add_alert(alerts, r, "hem", 3, "收口下擺", f"下擺比胸寬小 {fmt(diff)}cm（≥ {hr['severe_diff_cm']}cm）")
            elif diff > hr["warn_diff_cm"]:
                add_alert(alerts, r, "hem", 2, "收口下擺", f"下擺比胸寬小 {fmt(diff)}cm（> {hr['warn_diff_cm']}cm，等同羅紋下擺）")

    # 前襠過短
    if cat == "pants" and final in chart and chart[final].get("rise") is not None:
        if chart[final]["rise"] < r["alerts"]["rise_severe_below_cm"]:
            add_alert(alerts, r, "rise", 3, "前襠過短", f"前襠 {fmt(chart[final]['rise'])}cm < {r['alerts']['rise_severe_below_cm']}cm")

    # 禁用特徵
    feats = item.get("features") or {}
    for key, cfg in r["alerts"]["banned_features"].items():
        if feats.get(key) and cat in cfg.get("applies_to", [cat]):
            add_alert(alerts, r, key, cfg["level"], cfg["label"], feats.get(f"{key}_note") or "商品頁標示或照片可見")

    # 拉鍊
    oz = r["alerts"]["one_way_zip"]
    if cat in oz["applies_to"] and feats.get("zip") == "one-way":
        add_alert(alerts, r, "one_way_zip", oz["level"], oz["label"], "規則要求雙向拉鍊；坐下或敞開時下擺會卡肚子")

    # 評論排雷
    a_cfg = r["alerts"]
    if cat in a_cfg["defects"]["applies_to"]:
        pct_alert(alerts, r, "defects", rv["defect_pct"], rv["counts"]["defects"], a_cfg["defects"])
    if cat in a_cfg["tight"]["applies_to"]:
        pct_alert(alerts, r, "tight", rv["tight_pct"], rv["counts"]["tight"], a_cfg["tight"])
    if cat in a_cfg["sheer"]["applies_to"]:
        pct_alert(alerts, r, "sheer", rv["sheer_pct"], rv["counts"]["sheer"], a_cfg["sheer"])
    ss = a_cfg["small_sample"]
    if rv["fetched"] < ss["min_reviews"] or rv["body_matched"] < ss["min_body_matched"]:
        add_alert(alerts, r, "small_sample", ss["level"], ss["label"],
                  f"評論 {rv['fetched']} 則、同身形 {rv['body_matched']} 則（門檻 {ss['min_reviews']}／{ss['min_body_matched']}）")

    # 近 2 個月上架
    arr = arrival(item, run_date, r) if run_date else None
    na = a_cfg.get("new_arrival")
    if arr and na and not arr["is_new"]:
        if arr["listed_at"]:
            add_alert(alerts, r, "new_arrival", na["level"], na["label"],
                      f"{arr['listed_at']} 上架，已 {arr['days']} 天（> {na['days']} 天）" + (f"；依據：{arr['source']}" if arr.get("source") else ""))
        else:
            add_alert(alerts, r, "new_arrival", na["level"], na["unknown_label"], arr.get("source") or "官網沒有上架日，也不在新品分類")

    # 未來 3 個月適穿
    months = season_fit(item.get("temps"), horizon, r)
    sf = a_cfg.get("season_fit")
    if sf and months is not None:
        names = "、".join(f"{m} 月" for m in months)
        rng = "、".join(f"{mo['month']} 月 {fmt(mo['low'])}–{fmt(mo['high'])}°C" for mo in horizon["months"])
        t = item["temps"]
        if not months:
            add_alert(alerts, r, "season_fit", sf["level_none"], sf["label"], f"適穿 {t[0]}–{t[1]}°C；未來 3 個月常見 {rng}")
        elif len(months) == 1:
            add_alert(alerts, r, "season_fit", sf["level_one"], sf["one_label"], f"適穿 {t[0]}–{t[1]}°C，只對到 {names}")

    # 預算
    twd, price_basis = price_twd(item, fx)
    limit = r["budget"]["limits_twd"][cat]
    budget = {"limit": limit, "price_twd": twd, "basis": price_basis, "over_pct": None, "status": "預算內"}
    if twd is not None and twd > limit:
        over = round(100 * (twd / limit - 1), 1)
        budget.update(over_pct=over, status=f"超出 {fmt(over)}%")
        b = a_cfg["budget"]
        lv = 1 if over <= b["note_max_pct"] else 2 if over <= b["warn_max_pct"] else 3
        add_alert(alerts, r, "budget", lv, b["label"], f"NT${int(twd):,} 比上限 NT${limit:,} 多 {fmt(over)}%")

    # 代購溢價
    p = item.get("price", {})
    premium = None
    if p.get("sale") and p.get("origin_price") and fx.get(p.get("origin_currency")):
        premium = round(100 * (p["sale"] / (p["origin_price"] * fx[p["origin_currency"]]) - 1), 1)
        pc = a_cfg["premium"]
        if premium >= pc["warn_pct"]:
            add_alert(alerts, r, "premium", 2, pc["label"], f"台灣價比原產地換算貴 {fmt(premium)}%")
        elif premium >= pc["note_pct"]:
            add_alert(alerts, r, "premium", 1, pc["label"], f"台灣價比原產地換算貴 {fmt(premium)}%，建議等折扣或改買原產地站")

    # 分數
    ex = item.get("experts") or {}
    scores = [ex.get(k, {}).get("score") for k in EXPERT_KEYS]
    overall = avg5 = None
    if all(isinstance(s, (int, float)) for s in scores):
        overall = round(sum(ex[k]["score"] * r["item_weights"][k] for k in EXPERT_KEYS), 2)
        avg5 = round(sum(scores) / 5, 2)
    penalty = round(sum(r["levels"][str(al["level"])]["penalty"] or 0 for al in alerts if al["level"] < 3), 2)
    severe = [al for al in alerts if al["level"] == 3]
    excluded_reasons += [f"{al['label']}：{al['detail']}" for al in severe]
    rank_score = round(overall - penalty, 2) if overall is not None else None

    out = dict(item)
    out.pop("reviews", None)
    out.update({
        "size": {
            "a": {"size": a["size"], "reason": a["reason"]},
            "b": {"n": rv["body_matched"], "votes": rv["size_votes"], "reactions": rv["fit_reactions"]},
            "final": final, "final_reason": final_reason,
        },
        "review_stats": rv,
        "alerts": sorted(alerts, key=lambda al: -al["level"]),
        "penalty": penalty,
        "overall": overall,
        "avg5": avg5,
        "rank_score": rank_score,
        "budget": budget,
        "premium_pct": premium,
        "arrival": arr,
        "season_months": months,
    })
    return out, excluded_reasons


def score_brands(cand, r, items, prev_report):
    out = []
    prev_brands = {b["id"]: b for b in (prev_report or {}).get("brands", [])}
    for b in brands()["brands"]:
        bs = (cand.get("brand_scores") or {}).get(b["id"], {})
        metrics = bs.get("metrics") or {}
        overall = {}
        for lst in r["brand_lists"]:
            if all(isinstance(metrics.get(k, {}).get("score"), (int, float)) for k in lst["weights"]):
                overall[lst["id"]] = round(sum(metrics[k]["score"] * w for k, w in lst["weights"].items()), 2)
        picks = [{"id": i["id"], "name": i["name"], "rank_score": i["rank_score"]} for i in items if i["brand"] == b["id"]]
        prev = prev_brands.get(b["id"])
        change = None
        if prev and prev.get("overall") and overall:
            k = r["brand_lists"][0]["id"]
            if k in prev["overall"] and k in overall:
                change = round(overall[k] - prev["overall"][k], 2)
        out.append({
            "id": b["id"], "name": b["name"], "origin": b.get("origin"), "status": b["status"],
            "store": b.get("store"), "notes": b.get("notes"), "size_system": b.get("size_system"),
            "metrics": metrics, "overall": overall, "overall_change": change,
            "strengths": bs.get("strengths"), "features": bs.get("features"), "fits_robin": bs.get("fits_robin"),
            "price_band": bs.get("price_band"), "signature_items": bs.get("signature_items", []),
            "changes_vs_last": bs.get("changes_vs_last"), "picks": picks,
        })
    first = r["brand_lists"][0]["id"]
    out.sort(key=lambda x: (x["status"] != "verified", -(x["overall"].get(first) or 0)))
    return out


def check_orders(orders, r):
    """已購單品：有實測數字就核對版型範圍，結果附在報告裡（訂單檔本身不改）。"""
    res = {}
    for o in (orders or {}).get("items", []):
        cat, m = o.get("category"), o.get("measurements")
        if cat in r["fit_ranges"] and m:
            ev = size_deviation(m, r["fit_ranges"][cat])
            res[o["id"]] = {"max_dev": ev["max_dev"], "devs": ev["devs"]}
    return res


def clean_wishlist(wishlist, orders):
    if not wishlist:
        return wishlist, []
    bought_urls = {o.get("url") for o in (orders or {}).get("items", []) if o.get("url")}
    bought_names = {(o.get("brand"), o.get("name")) for o in (orders or {}).get("items", [])}
    keep, removed = [], []
    for w in wishlist.get("items", []):
        if w.get("url") in bought_urls or (w.get("brand"), w.get("name")) in bought_names:
            removed.append(w)
        else:
            keep.append(w)
    wishlist["items"] = keep
    return wishlist, removed


def main(month: str):
    r = rules()
    cand = load_json(DATA / "candidates" / f"{month}.json")
    if cand is None:
        sys.exit(f"找不到 data/candidates/{month}.json")
    fx = (cand.get("fx") or {}).get("rates", {})
    run_date = date.fromisoformat(cand.get("collected_at") or datetime.now(TPE).date().isoformat())
    horizon = climate_horizon(r, run_date)
    prev_report = load_json(DATA / "report.json")
    if prev_report and prev_report.get("month") == month:
        prev_report = load_json(DATA / "history" / f"{prev_month(month)}.json")

    kept, excluded = [], []
    for it in cand["items"]:
        scored, reasons = score_item(it, r, fx, horizon, run_date)
        if reasons:
            excluded.append({"id": it["id"], "brand": it["brand"], "name": it["name"], "url": it.get("url"), "reasons": reasons})
        elif scored["rank_score"] is None:
            excluded.append({"id": it["id"], "brand": it["brand"], "name": it["name"], "url": it.get("url"),
                             "reasons": ["專家評分不完整"]})
        else:
            kept.append(scored)
    kept.sort(key=lambda x: (-x["rank_score"], -x["avg5"]))
    kept = kept[: r["ranking"]["max_items"]]
    prev_ids = {i["id"]: n for n, i in enumerate((prev_report or {}).get("items", []), 1)}
    for n, it in enumerate(kept, 1):
        it["rank"] = n
        it["prev_rank"] = prev_ids.get(it["id"])

    orders = load_json(DATA / "orders.json", {"items": []})
    wishlist = load_json(DATA / "wishlist.json", {"items": []})
    wishlist, removed = clean_wishlist(wishlist, orders)
    save_json(DATA / "wishlist.json", wishlist)

    report = {
        "month": month,
        "generated_at": datetime.now(TPE).isoformat(timespec="minutes"),
        "model": cand.get("model"),
        "summary": cand.get("summary"),
        "fx": cand.get("fx"),
        "counts": {"candidates": len(cand["items"]), "picked": len(kept), "excluded": len(excluded),
                   "new": sum(1 for i in kept if (i.get("arrival") or {}).get("is_new")),
                   "season_ok": sum(1 for i in kept if i.get("season_months") and len(i["season_months"]) >= 2)},
        "climate": horizon,
        "items": kept,
        "excluded": excluded,
        "brands": score_brands(cand, r, kept, prev_report),
        "trends": cand.get("trends"),
        "discounts": cand.get("discounts"),
        "outfits": cand.get("outfits"),
        "self_review": cand.get("self_review"),
        "orders_check": check_orders(orders, r),
        "wishlist_removed": [{"brand": w.get("brand"), "name": w.get("name")} for w in removed],
    }
    save_json(DATA / "report.json", report)
    save_json(DATA / "history" / f"{month}.json", report)
    # 候選檔要進公開 repo：評論原文換成統計用的欄位
    for it in cand["items"]:
        if it.get("reviews"):
            it["reviews"] = compact_reviews(it["reviews"], r)
    save_json(DATA / "candidates" / f"{month}.json", cand)
    print(f"{month}: 候選 {len(cand['items'])}、入選 {len(kept)}、剔除 {len(excluded)}")
    for it in kept[:10]:
        al = "、".join(f"{a['level_name']}:{a['label']}" for a in it["alerts"]) or "無"
        print(f"  #{it['rank']:>2} {it['rank_score']:.2f} {it['brand']:<10} {it['name']} [{it['size']['final']}] 提醒：{al}")


def prev_month(month: str) -> str:
    y, m = map(int, month.split("-"))
    y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return f"{y}-{m:02d}"


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else datetime.now(TPE).strftime("%Y-%m"))
