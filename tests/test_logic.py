from datetime import date, datetime, timezone

from custom_components.eurojackpot_analyzer import logic
from custom_components.eurojackpot_analyzer.const import GREEK_ADDON_TIER
from custom_components.eurojackpot_analyzer.parsing import parse_allwyn, parse_allwyn_active, parse_official

ROWS = [
    ["2026-10-02", [1, 2, 3, 4, 5], [1, 2]],
    ["2026-10-06", [6, 7, 8, 9, 10], [3, 4]],
    ["2026-10-09", [1, 7, 20, 30, 40], [2, 4]],
]

ALLWYN_LAST = {
    "status": "results", "drawTime": 1791914400000, "drawId": 272,
    "winningNumbers": {"list": [35, 20, 22, 17, 11], "bonus": [8, 4]},
    "wagerStatistics": {"columns": 642038, "totalColumnsAll": 37602609.0},
    "prizeCategories": [
        {"id": 1, "divident": 120000000.0, "winners": 0, "winnersAll": 1},
        {"id": 4, "divident": 1780.0, "winners": 1, "winnersAll": 169},
        {"id": 13, "divident": 2.5, "winners": 69989, "gameType": "EJKAddon"},
    ],
}


def test_parse_allwyn_last():
    d = parse_allwyn(ALLWYN_LAST)
    assert d["date"] == "2026-10-13" and d["main"] == [11, 17, 20, 22, 35] and d["euro"] == [4, 8]
    by = {c["tier"]: c for c in d["classes"]}
    assert by["4+2"]["winners"] == 169 and by["4+2"]["winners_gr"] == 1 and by[GREEK_ADDON_TIER]["greek_only"]
    assert d["draw_number"] == 272 and d["columns_gr"] == 642038
    assert parse_allwyn({"status": "active"}) is None


def test_parse_allwyn_active():
    a = parse_allwyn_active({"drawTime": 1792173600000, "drawId": 273,
                             "prizeCategories": [{"id": 1, "jackpot": 10000000.0}]})
    assert a["draw_number"] == 273 and a["jackpot"] == 10000000.0
    assert a["draw_time"] == datetime(2026, 10, 16, 18, 0, tzinfo=timezone.utc)
    assert parse_allwyn_active(None) is None


def test_parse_official():
    payload = {"error": None, "head": {"datum": "2026-10-13"},
               "zahlen": {"hauptlotterie": {"ziehungen": [{"zahlen": ["35", "20", "22", "17", "11"]}, {"zahlen": ["4", "8"]}]}},
               "auswertung": {"quoten": {"hauptlotterie": {"ziehungen": [{"gewinnklassen": [
                   {"kurzbeschreibung": "5 + 2", "anzahl": 1, "quote": 120000000.0}]}]}}}}
    d = parse_official(payload)
    assert d["main"] == [11, 17, 20, 22, 35] and d["classes"][0]["tier"] == "5+2"
    assert parse_official({"error": "no data"}) is None


def test_merge_is_sorted_and_replaces():
    new = [{"date": "2026-10-13", "main": [5, 4, 3, 2, 1], "euro": [2, 1]},
           {"date": "2026-10-09", "main": [9, 8, 7, 6, 5], "euro": [1, 2]}]
    out = logic.merge_draws(ROWS, new)
    assert [r[0] for r in out] == ["2026-10-02", "2026-10-06", "2026-10-09", "2026-10-13"]
    assert out[2][1] == [5, 6, 7, 8, 9] and out[3][1] == [1, 2, 3, 4, 5]


def test_missing_dates():
    assert logic.missing_dates("2026-10-09", "2026-10-13") == [date(2026, 10, 13)]
    assert logic.missing_dates("2026-10-13", "2026-10-13") == []


def test_top_lists_and_format():
    st = logic.compute_stats(ROWS)
    tops = logic.top_lists(st, 3, 2)
    assert tops["draws_analysed"] == 3 and len(tops["frequent"]["main"]) == 3 and len(tops["overdue"]["euro"]) == 2
    assert tops["frequent"]["main"][0]["number"] in (1, 7)            # appear twice
    assert logic.format_numbers([1, 2, 3, 4, 5], [6, 7]) == "1 2 3 4 5 + 6 7"


def test_periods():
    assert logic.compute_stats(ROWS, "last_2")["n_draws"] == 2
    assert logic.compute_stats(ROWS, "1y")["n_draws"] == 3
    assert logic.compute_stats(ROWS, "all")["n_draws"] == 3
