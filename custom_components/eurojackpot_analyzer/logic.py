"""Pure helpers (no Home Assistant imports): history merging, statistics windows, top lists, formatting."""
from __future__ import annotations

from datetime import date, timedelta

from .core import rules, stats


def rows_to_draws(rows: list[list]) -> list[dict]:
    return [{"date": r[0], "main": r[1], "euro": r[2]} for r in rows]


def merge_draws(rows: list[list], new: list[dict]) -> list[list]:
    """Insert/replace draws (dicts with date/main/euro) in the sorted history rows [[date, main, euro], ...]."""
    by_date = {r[0]: r for r in rows}
    for d in new:
        by_date[d["date"]] = [d["date"], sorted(d["main"]), sorted(d["euro"])]
    return [by_date[k] for k in sorted(by_date)]


def missing_dates(last_stored: str, last_known: str) -> list[date]:
    """Draw dates after `last_stored` up to and including `last_known`."""
    start = date.fromisoformat(last_stored) + timedelta(days=1)
    return list(rules.candidate_dates(start, date.fromisoformat(last_known)))


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
    return result
