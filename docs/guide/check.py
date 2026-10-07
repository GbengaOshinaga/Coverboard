# -*- coding: utf-8 -*-
"""Checks the guide content against the repository before building:
every code path exists, every related/reference key resolves, and (with
--links) every reference URL responds. Exits non-zero on any problem."""
import os
import sys
import urllib.request

import content as C

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def main(check_links: bool) -> int:
    ids = {f["id"] for f in C.FEATURES}
    problems = []
    for f in C.FEATURES:
        for path, _ in f["code"]:
            if not os.path.exists(os.path.join(REPO, path)):
                problems.append(f"{f['id']}: code path not found: {path}")
        for r in f.get("related", []):
            if r not in ids:
                problems.append(f"{f['id']}: related feature not found: {r}")
        for r in f.get("refs", []):
            if r not in C.R:
                problems.append(f"{f['id']}: reference not found: {r}")
        for d in f.get("docs", []):
            if d not in C.D:
                problems.append(f"{f['id']}: doc link not found: {d}")

    if check_links:
        used = {r for f in C.FEATURES for r in f.get("refs", [])}
        for key in sorted(used):
            title, url = C.R[key]
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                status = urllib.request.urlopen(req, timeout=20).status
            except Exception as e:  # noqa: BLE001
                status = str(e)[:80]
            if status != 200:
                problems.append(f"link {key} ({url}): {status}")

    for p in problems:
        print("✖", p)
    print(f"{len(C.FEATURES)} features checked, {len(problems)} problem(s).")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main("--links" in sys.argv))
