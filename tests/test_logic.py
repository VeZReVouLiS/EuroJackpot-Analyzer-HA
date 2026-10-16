import pytest

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


def test_official_where_won_is_parsed_and_merged():
    rows = [
        {"kurzbeschreibung": "5 + 2", "anzahl": 1, "quote": 120000000.0,
         "aufteilung": [{"landAlpha3": "DEU", "kuerzel": "DE", "anzahl": 1, "provinz": "Nordrhein-Westfalen"}]},
        {"kurzbeschreibung": "5 + 1", "anzahl": 7, "quote": 2981587.2,
         "aufteilung": [{"landAlpha3": "DNK", "kuerzel": "DK", "anzahl": 1}, {"landAlpha3": "bad"}]},
        {"kurzbeschreibung": "4 + 2", "anzahl": 169, "quote": 1780.0},
    ]
    payload = {
        "error": None, "head": {"datum": "2026-10-13"},
        "zahlen": {"hauptlotterie": {"ziehungen": [{"zahlen": ["35", "20", "22", "17", "11"]}, {"zahlen": ["4", "8"]}]}},
        "auswertung": {
            "spieleinsatz": {"hauptlotterie": "75205218.00"},
            "quoten": {"hauptlotterie": {"ziehungen": [{"gewinnklassen": rows}]}},
        },
    }
    d = parse_official(payload)
    assert d["stake_all"] == 75205218.0
    assert d["classes"][0]["where"] == [{"alpha3": "DEU", "code": "DE", "winners": 1, "region": "Nordrhein-Westfalen"}]
    assert d["classes"][1]["where"] == [{"alpha3": "DNK", "code": "DK", "winners": 1}]
    assert "where" not in d["classes"][2]
    allwyn = [{"tier": "5+2", "winners": 1, "winners_gr": 0, "prize": 1.0}, {"tier": "4+2", "winners": 169}]
    merged = logic.merge_where(allwyn, d)
    assert merged[0]["where"][0]["alpha3"] == "DEU" and "where" not in merged[1]
    assert logic.merge_where(allwyn, None) == allwyn


def test_prizes_travel_with_the_history_rows():
    from custom_components.eurojackpot_analyzer.tickets import draw_for
    new = [{"date": "2026-10-16", "main": [1, 2, 3, 4, 5], "euro": [1, 2],
            "classes": [{"tier": "4+2", "prize": 1780.0}, {"tier": "3+0", "prize": 0}]}]
    out = logic.merge_draws(ROWS, new)
    assert out[-1] == ["2026-10-16", [1, 2, 3, 4, 5], [1, 2], {"4+2": 1780.0}]
    again = logic.merge_draws(out, [{"date": "2026-10-16", "main": [1, 2, 3, 4, 5], "euro": [1, 2]}])
    assert again[-1][3] == {"4+2": 1780.0}                      # a refresh without a prize table keeps the known one
    assert logic.rows_to_draws(out)[-1]["details"]["classes"] == [{"tier": "4+2", "prize": 1780.0}]
    assert "details" not in logic.rows_to_draws(out)[0]
    assert draw_for(out, "2026-10-16")["details"]["classes"][0]["prize"] == 1780.0 and draw_for(out, "2000-01-01") is None
    old = [["2026-10-02", [1, 2, 3, 4, 5], [1, 2]]]
    assert logic.add_prizes(old, [["2026-10-02", [1, 2, 3, 4, 5], [1, 2], {"5+2": 1.0}]]) and old[0][3] == {"5+2": 1.0}
    assert not logic.add_prizes(old, [["2026-10-02", [1, 2, 3, 4, 5], [1, 2], {"5+2": 1.0}]])


def test_parse_columns():
    from custom_components.eurojackpot_analyzer.tickets import parse_columns
    assert parse_columns("5 12 23 34 45 + 3 7; 1,2,3,4,5 + 1 2") == [
        {"main": [5, 12, 23, 34, 45], "euro": [3, 7]}, {"main": [1, 2, 3, 4, 5], "euro": [1, 2]}]
    for bad in ["", "1 2 3 4 + 1 2", "1 2 3 4 51 + 1 2", "1 2 3 4 5 + 1 13", "1 2 3 4 5 + 1 1", "a b c d e + 1 2", "1 2 3 4 4 + 1 2"]:
        with pytest.raises(ValueError):
            parse_columns(bad)
    with pytest.raises(ValueError):
        parse_columns(";".join(["1 2 3 4 5 + 1 2"] * 13))


def test_pending_results_and_messages():
    from custom_components.eurojackpot_analyzer import tickets as tk
    rows = [["2026-10-13", [11, 17, 20, 22, 35], [4, 8], {"4+2": 1780.0}]]
    win = {"uid": "a", "target_date": "2026-10-13", "played": True,
           "columns": [{"main": [11, 17, 20, 22, 1], "euro": [4, 8]}, {"main": [1, 2, 3, 4, 5], "euro": [1, 2]}]}
    lose = {"uid": "b", "target_date": "2026-10-13", "played": True, "columns": [{"main": [1, 2, 3, 4, 5], "euro": [1, 2]}]}
    items = tk.pending_results([win, lose, {**win, "uid": "c", "played": False}, {**win, "uid": "d", "target_date": "2026-10-20"}], rows, set())
    assert [i["uid"] for i in items] == ["a", "b"]             # not played / not drawn yet are left out
    assert items[0]["result"]["total_prize"] == 1780.0 and items[0]["result"]["winning_columns"] == 1
    assert "1 of 2 columns won" in tk.result_message("en", items[0]) and "1.780,00" not in tk.result_message("en", items[0])
    assert tk.result_message("en", items[1]) == "Ticket for 2026-10-13: no winning column"
    assert tk.pending_results([win], rows, {items[0]["key"]}) == []
    assert tk.text("el", "new_draw", date="x", numbers="y") == "Κλήρωση x: y" and tk.text("fr", "title") == "EuroJackpot"


def test_jackpot_due():
    from custom_components.eurojackpot_analyzer.tickets import jackpot_due
    assert jackpot_due(30e6, 25, "2026-10-16T18:00", None)
    assert not jackpot_due(30e6, 25, "2026-10-16T18:00", "2026-10-16T18:00")      # once per draw
    assert not jackpot_due(20e6, 25, "k", None) and not jackpot_due(30e6, 0, "k", None) and not jackpot_due(None, 25, "k", None)
