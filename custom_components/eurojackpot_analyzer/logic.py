"""Pure helpers (no Home Assistant imports): history merging, statistics windows, top lists, formatting."""
from __future__ import annotations

from datetime import date, timedelta

from .core import rules, stats


def rows_to_draws(rows: list[list]) -> list[dict]:
    """History rows [[date, main, euro, {tier: prize}?], ...] -> draw dicts (with `details` when the prizes are known)."""
    out = []
    for r in rows:
        d = {"date": r[0], "main": r[1], "euro": r[2]}
        if len(r) > 3 and r[3]:
            d["details"] = {"classes": [{"tier": t, "prize": p} for t, p in r[3].items()]}
        out.append(d)
    return out


def prizes_of(draw: dict) -> dict[str, float]:
    """{tier: prize per winner} of a draw dict that carries `classes` (the paying classes only)."""
    return {c["tier"]: c["prize"] for c in draw.get("classes") or [] if c.get("prize", 0) > 0}


def merge_draws(rows: list[list], new: list[dict]) -> list[list]:
    """Insert/replace draws (dicts with date/main/euro) in the sorted history rows [[date, main, euro, prizes?], ...]."""
    by_date = {r[0]: r for r in rows}
    for d in new:
        row = [d["date"], sorted(d["main"]), sorted(d["euro"])]
        prizes = prizes_of(d) or (by_date[d["date"]][3] if d["date"] in by_date and len(by_date[d["date"]]) > 3 else None)
        if prizes:
            row.append(prizes)
        by_date[d["date"]] = row
    return [by_date[k] for k in sorted(by_date)]


def add_prizes(rows: list[list], seed_rows: list[list]) -> bool:
    """Give rows saved by an older version the prizes of the bundled history (in place). True when something changed."""
    prizes = {r[0]: r[3] for r in seed_rows if len(r) > 3}
    changed = False
    for r in rows:
        if len(r) == 3 and r[0] in prizes:
            r.append(prizes[r[0]])
            changed = True
    return changed


def missing_dates(last_stored: str, last_known: str) -> list[date]:
    """Draw dates after `last_stored` up to and including `last_known`."""
    start = date.fromisoformat(last_stored) + timedelta(days=1)
    return list(rules.candidate_dates(start, date.fromisoformat(last_known)))


def merge_where(classes: list[dict], official: dict | None) -> list[dict]:
    """Add the official 'where the winners are' data (matched by tier) to classes that come from another source."""
    if not official:
        return classes
    where = {c["tier"]: c["where"] for c in official.get("classes", []) if c.get("where")}
    return [{**c, "where": where[c["tier"]]} if c["tier"] in where and "where" not in c else c for c in classes]


def compute_stats(rows: list[list], period: str = "all") -> dict:
    """Statistics for a period: all | 1y | 3y | 5y | 10y | last_N (counts in the window, gaps on full history)."""
    draws = rows_to_draws(rows)
    since = None
    if draws and period not in ("", "all"):
        if period.startswith("last_"):
            n = int(period.split("_")[1])
            since = draws[-n]["date"] if len(draws) >= n else None
        elif period.endswith("y"):
            years = int(period[:-1])
            since = (date.fromisoformat(draws[-1]["date"]) - timedelta(days=365 * years)).isoformat()
    return stats.compute(draws, since)


def format_numbers(main: list[int], euro: list[int]) -> str:
    return " ".join(str(n) for n in main) + " + " + " ".join(str(n) for n in euro)


def top_lists(st: dict, n_main: int = 10, n_euro: int = 3) -> dict:
    """The three rankings the sensors expose."""
    main = {x["n"]: x for x in st["main"]}
    euro = {x["n"]: x for x in st["euro"]}
    rk = st["ranking"]

    def pick(block, order, k, kind):
        out = []
        for n in order[:k]:
            x = block[n]
            if kind == "overdue":
                out.append({"number": n, "draws_since": x["gap"], "longest_gap": x["max_gap"],
                            "last_seen": x["last_seen"]})
            else:
                out.append({"number": n, "count": x["count"], "percent": x["pct"], "draws_since": x["gap"]})
        return out

    result = {}
    for key, kind in (("overdue", "overdue"), ("frequent", "hot"), ("rare", "cold")):
        order_main = rk["main"]["overdue" if key == "overdue" else kind]
        order_euro = rk["euro"]["overdue" if key == "overdue" else kind]
        result[key] = {
            "main": pick(main, order_main, n_main, "overdue" if key == "overdue" else "freq"),
            "euro": pick(euro, order_euro, n_euro, "overdue" if key == "overdue" else "freq"),
        }
    result["draws_analysed"] = st["n_draws"]
    # the complete table for the heat-map card (every number, current euro pool only)
    result["all"] = {
        "main": [{"number": x["n"], "count": x["count"], "percent": x["pct"], "draws_since": x["gap"]}
                 for x in st["main"]],
        "euro": [{"number": x["n"], "count": x["count"], "percent": x["pct"], "draws_since": x["gap"]}
                 for x in st["euro"] if x["active"]],
    }
    return result
