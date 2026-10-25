"""Ccloth 共用函式：讀設定、尺寸比對、評論排雷。只用 Python 標準函式庫。"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
DATA = ROOT / "data"

DIM_LABELS_DEFAULT = {
    "shoulder": "肩寬", "chest": "胸寬", "length": "長度", "sleeve": "袖長", "hem_width": "下擺寬",
    "waist": "腰圍平量", "hip": "臀圍", "rise": "前襠", "thigh": "大腿", "leg_opening": "褲口",
}


def load_json(path: Path, default=None):
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def rules() -> dict:
    return load_json(CONFIG / "rules.json")


def brands() -> dict:
    return load_json(CONFIG / "brands.json")


def fmt(n: float) -> str:
    """去掉多餘的 .0"""
    if n is None:
        return "—"
    return f"{n:.1f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------- 尺寸

def size_deviation(measure: dict, ranges: dict) -> dict:
    """單一尺寸對照版型範圍。偏差 = 離範圍最近邊界的距離（cm），範圍內為 0。"""
    devs = {}
    for dim, (lo, hi) in ranges.items():
        v = measure.get(dim)
        if v is None:
            continue
        if v < lo:
            devs[dim] = round(v - lo, 1)  # 負值 = 不足
        elif v > hi:
            devs[dim] = round(v - hi, 1)  # 正值 = 超出
        else:
            devs[dim] = 0.0
    abs_vals = [abs(d) for d in devs.values()]
    # 離範圍中心多遠（以半寬為 1），同樣在範圍內時用來挑最居中的尺寸
    center = [abs(measure[dim] - (lo + hi) / 2) / max((hi - lo) / 2, 0.5)
              for dim, (lo, hi) in ranges.items() if measure.get(dim) is not None]
    return {
        "devs": devs,
        "checked": list(devs.keys()),
        "max_dev": max(abs_vals) if abs_vals else None,
        "sum_dev": round(sum(abs_vals), 1) if abs_vals else None,
        "center": round(sum(center) / len(center), 2) if center else None,
    }


def recommend_from_chart(chart: dict, category: str, r: dict) -> dict:
    """A｜網站尺寸表：挑最大偏差最小的尺寸，同分比總偏差，再比誰最接近範圍中心，最後取較小的尺寸。"""
    ranges = r["fit_ranges"][category]
    labels = r.get("measurement_labels", DIM_LABELS_DEFAULT)
    evals = {size: size_deviation(m, ranges) for size, m in chart.items()}
    scored = [(s, e) for s, e in evals.items() if e["max_dev"] is not None]
    if not scored:
        return {"size": None, "reason": "尺寸表沒有可比對的數字", "evals": evals}
    order = list(chart.keys())
    # 主尺寸（褲子看腰圍、上衣看胸寬）比範圍小超過 0.5cm 就穿不下或會繃，這類尺寸排到最後
    primary = "waist" if category == "pants" else "chest"
    lo_p = ranges.get(primary, (None,))[0]

    def too_small(size):
        v = chart[size].get(primary)
        if v is None or lo_p is None:
            return 0
        gap = lo_p - v
        return round(gap, 1) if gap > 0.5 else 0

    scored.sort(key=lambda se: (too_small(se[0]), se[1]["max_dev"], se[1]["sum_dev"], se[1]["center"], order.index(se[0])))
    best, e = scored[0]
    parts = []
    for dim, d in e["devs"].items():
        lo, hi = ranges[dim]
        v = chart[best][dim]
        tag = "✓" if d == 0 else (f"+{fmt(d)}" if d > 0 else fmt(d))
        parts.append(f"{labels.get(dim, dim)} {fmt(v)}（{fmt(lo)}–{fmt(hi)}，{tag}）")
    if e["max_dev"] == 0:
        head = f"{best}：比對的 {len(e['devs'])} 項都在範圍內"
    else:
        head = f"{best}：最接近，最大偏差 {fmt(e['max_dev'])}cm"
    missing = [labels.get(d, d) for d in ranges if d not in e["devs"]]
    tail = f"；尺寸表沒有{'、'.join(missing)}" if missing else ""
    return {"size": best, "reason": head + "。" + "、".join(parts) + tail, "evals": evals}


# ---------------------------------------------------------------- 評論

BODY_PATTERNS = [
    # 175/75、175.75、175-75、175 75（可接尺寸）
    re.compile(r"(?<!\d)(1[4-9]\d)\s*(?:cm|公分)?\s*[/.\-、, ]\s*(\d{2,3})\s*(?:kg|公斤)?(?!\d)", re.I),
    # 175cm 75kg / 身高175 體重75
    re.compile(r"(?:身高)?\s*(1[4-9]\d)\s*(?:cm|公分).{0,6}?(?:體重)?\s*(\d{2,3})\s*(?:kg|公斤)", re.I),
    re.compile(r"(?:키)\s*(1[4-9]\d).{0,8}?(?:몸무게|체중)\s*(\d{2,3})"),
]

FIT_WORDS = {
    "big": ["偏大", "太大", "大了", "大一號", "鬆垮", "runs large", "too big", "크게", "커요"],
    "small": ["偏小", "太小", "小了", "小一號", "runs small", "too small", "작아", "작게"],
    "normal": ["剛好", "剛剛好", "正常", "合適", "尺寸ok", "true to size", "정사이즈", "딱 맞"],
}


def parse_body(review: dict) -> tuple[float | None, float | None]:
    h, w = review.get("height"), review.get("weight")
    if h and w:
        return float(h), float(w)
    text = review.get("text") or ""
    for pat in BODY_PATTERNS:
        m = pat.search(text)
        if m:
            hh, ww = float(m.group(1)), float(m.group(2))
            if 140 <= hh <= 200 and 35 <= ww <= 160:
                return hh, ww
    return (float(h) if h else None), (float(w) if w else None)


def body_match(review: dict, r: dict) -> bool:
    h, w = parse_body(review)
    if h is None or w is None:
        return False
    bf = r["reviews"]["body_filter"]
    return bf["height_cm"][0] <= h <= bf["height_cm"][1] and bf["weight_kg"][0] <= w <= bf["weight_kg"][1]


def _all_phrases(d: dict) -> list[str]:
    out = []
    for v in d.values():
        out.extend(v)
    return out


def clean_text(text: str, r: dict) -> str:
    """先刪否定片語與會誤判的字（透氣…），再拿去比對關鍵字。"""
    t = (text or "").lower()
    phrases = _all_phrases(r["reviews"]["negations"]) + r["reviews"].get("ignore_substrings", [])
    for p in sorted(phrases, key=len, reverse=True):
        t = t.replace(p.lower(), " ")
    return t


def flags_for(text: str, r: dict) -> set[str]:
    t = clean_text(text, r)
    found = set()
    for cat, langs in r["reviews"]["keywords"].items():
        if any(k.lower() in t for k in _all_phrases(langs)):
            found.add(cat)
    return found


def fit_reaction(review: dict) -> str | None:
    fit = review.get("fit")
    if fit in ("big", "small", "normal"):
        return fit
    zh = {"偏大": "big", "偏小": "small", "正常": "normal"}
    if fit in zh:
        return zh[fit]
    t = (review.get("text") or "").lower()
    for k in ("big", "small", "normal"):
        if any(w.lower() in t for w in FIT_WORDS[k]):
            return k
    return None


def analyze_reviews(block: dict | None, r: dict) -> dict:
    """雙重負評排雷：低星（有星等時）＋否定片語先刪 → 縮水／起毛球／領口、貼身、薄透比例；同身形另算。"""
    block = block or {}
    items = block.get("items") or []
    has_ratings = bool(block.get("has_ratings"))
    low_max = r["reviews"]["low_star_max"]

    def counts(revs):
        c = {"defects": 0, "shrink": 0, "pilling": 0, "collar": 0, "tight": 0, "sheer": 0}
        for rv in revs:
            if has_ratings and rv.get("rating") is not None and rv["rating"] > low_max:
                continue
            f = set(rv["flags"]) if "flags" in rv and "text" not in rv else flags_for(rv.get("text", ""), r)
            for k in ("shrink", "pilling", "collar", "tight", "sheer"):
                if k in f:
                    c[k] += 1
            if f & {"shrink", "pilling", "collar"}:
                c["defects"] += 1
        return c

    def pct(n, d):
        return round(100.0 * n / d, 1) if d else None

    body = [rv for rv in items if body_match(rv, r)]
    c_all, c_body = counts(items), counts(body)
    n_all, n_body = len(items), len(body)

    sizes, reactions = {}, {"big": 0, "normal": 0, "small": 0}
    for rv in body:
        s = rv.get("size")
        if s:
            sizes[str(s)] = sizes.get(str(s), 0) + 1
        fr = fit_reaction(rv)
        if fr:
            reactions[fr] += 1

    return {
        "source": block.get("source"),
        "lang": block.get("lang"),
        "has_ratings": has_ratings,
        "total_on_site": block.get("total_on_site"),
        "fetched": n_all,
        "body_matched": n_body,
        "counts": c_all,
        "body_counts": c_body,
        "defect_pct": pct(c_all["defects"], n_all),
        "body_defect_pct": pct(c_body["defects"], n_body),
        "tight_pct": pct(c_all["tight"], n_all),
        "sheer_pct": pct(c_all["sheer"], n_all),
        "size_votes": dict(sorted(sizes.items(), key=lambda kv: -kv[1])),
        "fit_reactions": reactions,
        "thickness_label": block.get("thickness_label"),
    }


def compact_reviews(block: dict | None, r: dict) -> dict | None:
    """公開 repo 不放評論原文：只留尺寸、身高體重、命中的排雷類別與尺寸反應。"""
    if not block or not block.get("items"):
        return block
    out = []
    for rv in block["items"]:
        if "text" not in rv:
            out.append(rv)
            continue
        h, w = parse_body(rv)
        out.append({"size": rv.get("size"), "height": h, "weight": w, "rating": rv.get("rating"),
                    "flags": sorted(flags_for(rv.get("text", ""), r)), "fit": fit_reaction(rv)})
    return {**block, "items": out, "compacted": True}
