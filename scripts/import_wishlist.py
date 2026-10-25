#!/usr/bin/env python3
"""匯入手機網站「同步到 GitHub」開的 Issue，寫入 data/wishlist.json。

- 只接受 repo 擁有者（OWNER）開的、標題以「Ccloth 清單」開頭的 Issue（repo 是公開的，別人也能開 Issue）。
- Issue 內文是整份清單的快照，取最新一則尚未匯入的為準；同網址單品保留原本的加入日與價格紀錄。
- 用 GitHub 公開 API，不需要登入。
用法：python3 scripts/import_wishlist.py
"""
from __future__ import annotations

import json
import re
import urllib.request
from datetime import datetime, timezone, timedelta

from ccloth_lib import DATA, load_json, save_json

OWNER, REPO = "jonwenjen", "ccloth"
TITLE_PREFIX = "Ccloth 清單"
TPE = timezone(timedelta(hours=8))


def fetch_issues():
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/issues?state=all&per_page=50&sort=created&direction=desc"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "ccloth"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def parse_body(body: str):
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", body or "", re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def main():
    wl = load_json(DATA / "wishlist.json", {"items": [], "imported_issues": []})
    wl.setdefault("imported_issues", [])
    issues = [i for i in fetch_issues()
              if "pull_request" not in i
              and (i.get("user") or {}).get("login", "").lower() == OWNER
              and (i.get("title") or "").startswith(TITLE_PREFIX)
              and i["number"] not in wl["imported_issues"]]
    if not issues:
        print("沒有新的清單 Issue")
        return
    latest = issues[0]
    snap = parse_body(latest.get("body"))
    if not snap or not isinstance(snap.get("items"), list):
        print(f"Issue #{latest['number']} 內文沒有可讀的 JSON，略過")
        wl["imported_issues"].append(latest["number"])
        save_json(DATA / "wishlist.json", wl)
        return
    old = {w.get("url") or w.get("id"): w for w in wl.get("items", [])}
    merged = []
    for it in snap["items"]:
        key = it.get("url") or it.get("id")
        base = dict(old.get(key, {}))
        base.update({k: v for k, v in it.items() if v is not None})
        base.setdefault("added", it.get("added") or latest["created_at"][:10])
        base["source"] = f"issue#{latest['number']}"
        merged.append(base)
    wl["items"] = merged
    # 手機上標「已淘汰」的已購單品
    retired = set(snap.get("retired") or [])
    if retired:
        orders = load_json(DATA / "orders.json", {"items": []})
        for o in orders.get("items", []):
            o["retired"] = o["id"] in retired
        save_json(DATA / "orders.json", orders)
        print(f"已淘汰 {len(retired)} 件已購單品")
    wl["imported_issues"] += [i["number"] for i in issues]
    wl["updated"] = datetime.now(TPE).strftime("%Y-%m-%d")
    save_json(DATA / "wishlist.json", wl)
    print(f"匯入 Issue #{latest['number']}：{len(merged)} 件（另標記已讀 {len(issues) - 1} 則較舊的同步）")


if __name__ == "__main__":
    main()
