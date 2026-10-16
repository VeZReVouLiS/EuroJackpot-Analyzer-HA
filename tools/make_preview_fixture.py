"""Build tools/preview/fixture.js: fake Home Assistant states (real data) for previewing the cards offline.

Usage (with the HA venv):  python -W ignore tools/make_preview_fixture.py
"""
from __future__ import annotations

import json
import secrets
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from custom_components.eurojackpot_analyzer import logic, tickets as tk  # noqa: E402
from custom_components.eurojackpot_analyzer.core import analysis  # noqa: E402
from custom_components.eurojackpot_analyzer.core import generators  # noqa: E402
from custom_components.eurojackpot_analyzer.const import OFFICIAL_URL  # noqa: E402
from custom_components.eurojackpot_analyzer.parsing import parse_allwyn, parse_allwyn_active, parse_official  # noqa: E402

D = "eurojackpot_analyzer"
HEAD = {"User-Agent": "Mozilla/5.0 Chrome/126", "Origin": "https://www.allwyn.gr", "Referer": "https://www.allwyn.gr/"}


def main() -> None:
    rows = json.loads((ROOT / "custom_components" / D / "data" / "draws.json").read_text(encoding="utf-8"))["draws"]
    req = urllib.request.Request("https://api.opap.gr/draws/v3.0/5149/last-result-and-active", headers=HEAD)
    data = json.loads(urllib.request.urlopen(req, timeout=25).read())
    last, nxt = parse_allwyn(data["last"]), parse_allwyn_active(data["active"])
    oreq = urllib.request.Request(OFFICIAL_URL.format(d=last["date"]),
                                  headers={"User-Agent": "Mozilla/5.0 Chrome/126", "Referer": "https://www.eurojackpot.com/"})
    official = parse_official(json.loads(urllib.request.urlopen(oreq, timeout=25).read()))
    last["classes"] = logic.merge_where(last["classes"], official)       # where the winners are (top 3 classes)
    last["stake_all"] = official["stake_all"] if official else None
    st = logic.compute_stats(rows)
    tops = logic.top_lists(st)
    ticket = generators.generate_ticket(st, 5, "auto_column", secrets.SystemRandom())
    now = datetime.now(timezone.utc).isoformat()
    # demo tickets: one played for the last draw (a 4 + 2 among the columns), one generated for the next draw
    drawn = {"date": rows[-1][0], "main": rows[-1][1], "euro": rows[-1][2]}          # the newest draw we have prizes for
    won = [{"main": sorted(drawn["main"][:4] + [drawn["main"][4] - 1 if drawn["main"][4] > 1 else 2]), "euro": drawn["euro"]},
           {"main": [3, 9, 18, 27, 44], "euro": [2, 11]}, {"main": [6, 12, 25, 33, 41], "euro": [1, 7]}]
    demo = [
        {"uid": "demo1", "created_at": "2026-10-12T10:00:00", "target_date": drawn["date"], "algo": "manual", "price": 7.5, "played": True,
         "updated_at": "2026-10-12T10:00:00.000Z", "columns": won},
        {"uid": "demo2", "created_at": "2026-10-15T10:00:00", "target_date": nxt["draw_time"].date().isoformat(), "algo": "auto_column", "price": 12.5,
         "played": False, "updated_at": "2026-10-15T10:00:00.000Z", "columns": [{"main": c["main"], "euro": c["euro"]} for c in ticket["columns"]]},
    ]
    results = {}
    for item in tk.pending_results(demo, rows, set()):
        r = item["result"]
        results[item["uid"]] = {"date": item["date"], "winning_columns": r["winning_columns"], "total_prize": r["total_prize"],
                                "complete": r["complete"], "tiers": [c["tier"] for c in r["columns"]]}
    my = [{"uid": t["uid"], "target_date": t["target_date"], "played": t["played"], "algorithm": t["algo"], "price": t["price"],
           "columns": [{"numbers": c["main"], "euro_numbers": c["euro"], "text": logic.format_numbers(c["main"], c["euro"])} for c in t["columns"]],
           "result": results.get(t["uid"])} for t in demo]
    analysis_doc = analysis.analyze([{"main": c["main"], "euro": c["euro"]} for c in demo[1]["columns"][:3]], logic.rows_to_draws(rows), st, 2.5, "GR")

    def s(entity, state, attrs=None):
        return {"entity_id": f"sensor.{D}_{entity}", "state": state, "attributes": attrs or {}, "last_updated": now}

    def top_state(key):
        return ", ".join(str(x["number"]) for x in tops[key]["main"][:5])

    states = [
        s("last_draw", last["date"], {
            "numbers": last["main"], "euro_numbers": last["euro"], "draw_number": last["draw_number"],
            "columns_greece": last["columns_gr"], "columns_all_countries": last["columns_all"],
            "prizes": [{"tier": c["tier"], "winners_all_countries": c["winners"], "winners_greece": c.get("winners_gr"),
                        "prize_per_winner": c["prize"], **({"where_won": c["where"]} if c.get("where") else {})}
                       for c in last["classes"]],
            "total_sales": last["stake_all"]}),
        s("next_draw", nxt["draw_time"].isoformat(), {"draw_number": nxt["draw_number"]}),
        s("jackpot", str(nxt["jackpot"]), {"unit_of_measurement": "€"}),
        s("most_overdue_numbers", top_state("overdue"), {"main": tops["overdue"]["main"], "euro": tops["overdue"]["euro"],
                                                       "all": tops["all"], "draws_analysed": tops["draws_analysed"]}),
        s("most_frequent_numbers", top_state("frequent"), {"main": tops["frequent"]["main"], "euro": tops["frequent"]["euro"],
                                                         "draws_analysed": tops["draws_analysed"]}),
        s("least_frequent_numbers", top_state("rare"), {"main": tops["rare"]["main"], "euro": tops["rare"]["euro"],
                                                      "draws_analysed": tops["draws_analysed"]}),
        s("generated_ticket", "5", {
            "columns": [{"numbers": c["main"], "euro_numbers": c["euro"], "algorithm": c["algo"],
                         "text": logic.format_numbers(c["main"], c["euro"])} for c in ticket["columns"]],
            "column_count": 5, "price_per_column": 2.5, "total_cost": 12.5, "algorithm": "auto_column", "period": "all"}),
        s("my_tickets", str(len(my)), {"tickets": my, "sync_enabled": True, "synced_at": now}),
    ]
    out = ROOT / "tools" / "preview" / "fixture.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("window.FIXTURE = " + json.dumps({x["entity_id"]: x for x in states}, ensure_ascii=False) + ";\nwindow.ANALYSIS = "
                   + json.dumps(analysis_doc, ensure_ascii=False) + ";\n",
                   encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
