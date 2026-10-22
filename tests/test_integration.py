"""Set the integration up in a real (test) Home Assistant with the network layer mocked."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.eurojackpot_analyzer.client import EuroJackpotClient, SourceError
from custom_components.eurojackpot_analyzer.const import DOMAIN

from .test_logic import ALLWYN_LAST
from custom_components.eurojackpot_analyzer.parsing import parse_allwyn, parse_allwyn_active

ACTIVE = parse_allwyn_active({"drawTime": 1792173600000, "drawId": 273,
                              "prizeCategories": [{"id": 1, "jackpot": 10000000.0}]})


VERSION = json.loads((Path(__file__).parent.parent / "custom_components" / "eurojackpot_analyzer" / "manifest.json").read_text())["version"]


def entry() -> MockConfigEntry:
    return MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={}, title="EuroJackpot Analyzer")


async def setup(hass: HomeAssistant, last=None, active=ACTIVE, fail=False, official=None):
    last = last if last is not None else parse_allwyn(ALLWYN_LAST)
    patches = [patch.object(EuroJackpotClient, "last_and_active",
                            AsyncMock(side_effect=SourceError("HTTP 403 Forbidden")) if fail else AsyncMock(return_value=(last, active))),
               patch.object(EuroJackpotClient, "allwyn_range", AsyncMock(return_value=[])),
               patch.object(EuroJackpotClient, "official_day", AsyncMock(return_value=official))]
    for p in patches:
        p.start()
    e = entry()
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    await hass.async_block_till_done()
    for p in patches:
        p.stop()
    return e


async def test_sensors(hass: HomeAssistant) -> None:
    await setup(hass)
    last = hass.states.get("sensor.eurojackpot_analyzer_last_draw")
    assert last.state == "2026-10-13"
    assert last.attributes["numbers"] == [11, 17, 20, 22, 35] and last.attributes["euro_numbers"] == [4, 8]
    assert last.attributes["text"] == "11 17 20 22 35 + 4 8" and last.attributes["draw_number"] == 272
    prizes = {p["tier"]: p for p in last.attributes["prizes"]}
    assert prizes["4+2"]["winners_greece"] == 1 and prizes["4+2"]["winners_all_countries"] == 169
    nxt = hass.states.get("sensor.eurojackpot_analyzer_next_draw")
    assert datetime.fromisoformat(nxt.state) == datetime(2026, 10, 16, 18, 0, tzinfo=timezone.utc)
    jackpot = hass.states.get("sensor.eurojackpot_analyzer_jackpot")
    assert float(jackpot.state) == 10000000.0 and jackpot.attributes["unit_of_measurement"] == "€"
    for key in ("most_overdue_numbers", "most_frequent_numbers", "least_frequent_numbers"):
        s = hass.states.get(f"sensor.eurojackpot_analyzer_{key}")
        assert s.state not in ("unknown", "unavailable") and len(s.attributes["main"]) == 10
        assert len(s.attributes["euro"]) == 3
    assert hass.states.get("sensor.eurojackpot_analyzer_generated_ticket").state == "unknown"   # nothing generated yet


async def test_where_won_and_sales_from_the_official_source(hass: HomeAssistant) -> None:
    official = {"classes": [{"tier": "5+2", "where": [{"alpha3": "DEU", "code": "DE", "winners": 1, "region": "Bayern"}]}],
                "stake_all": 75205218.0}
    await setup(hass, official=official)
    last = hass.states.get("sensor.eurojackpot_analyzer_last_draw")
    prizes = {p["tier"]: p for p in last.attributes["prizes"]}
    assert prizes["5+2"]["where_won"] == [{"alpha3": "DEU", "code": "DE", "winners": 1, "region": "Bayern"}]
    assert "where_won" not in prizes["4+2"] and last.attributes["total_sales"] == 75205218.0
    assert prizes["4+2"]["winners_greece"] == 1          # the Allwyn (Greek) data is kept


async def test_generate_ticket_service(hass: HomeAssistant) -> None:
    await setup(hass)
    res = await hass.services.async_call(DOMAIN, "generate_ticket", {"columns": 7, "algorithm": "hot", "period": "5y"},
                                         blocking=True, return_response=True)
    assert res["column_count"] == 7 and res["total_cost"] == 17.5 and res["price_per_column"] == 2.5
    for c in res["columns"]:
        assert len(set(c["numbers"])) == 5 and all(1 <= n <= 50 for n in c["numbers"])
        assert len(set(c["euro_numbers"])) == 2 and all(1 <= n <= 12 for n in c["euro_numbers"])
        assert c["algorithm"] == "hot"
    state = hass.states.get("sensor.eurojackpot_analyzer_generated_ticket")
    assert state.state == "7" and state.attributes["total_cost"] == 17.5
    auto = await hass.services.async_call(DOMAIN, "generate_ticket", {"columns": 12, "algorithm": "auto_column"},
                                          blocking=True, return_response=True)
    assert len({c["algorithm"] for c in auto["columns"]}) > 1


async def test_service_validation(hass: HomeAssistant) -> None:
    await setup(hass)
    with pytest.raises(Exception):
        await hass.services.async_call(DOMAIN, "generate_ticket", {"columns": 13}, blocking=True, return_response=True)


async def test_new_draw_is_added_to_history(hass: HomeAssistant) -> None:
    e = await setup(hass)
    coord = e.runtime_data
    before = coord.data["count"]
    new = {**parse_allwyn(ALLWYN_LAST), "date": "2026-10-16", "main": [1, 2, 3, 4, 5], "euro": [1, 2]}
    with patch.object(EuroJackpotClient, "last_and_active", AsyncMock(return_value=(new, ACTIVE))), \
         patch.object(EuroJackpotClient, "allwyn_range", AsyncMock(return_value=[new])),          patch.object(EuroJackpotClient, "official_day", AsyncMock(return_value=None)):
        await coord.async_refresh()
    assert coord.data["count"] == before + 1
    assert hass.states.get("sensor.eurojackpot_analyzer_last_draw").state == "2026-10-16"


async def test_works_offline_from_bundled_history(hass: HomeAssistant) -> None:
    e = await setup(hass, fail=True)
    assert e.state.value == "loaded"
    assert hass.states.get("sensor.eurojackpot_analyzer_last_draw").state == "2026-10-13"      # from the bundled snapshot
    assert hass.states.get("sensor.eurojackpot_analyzer_next_draw").state not in ("unknown", "unavailable")
    assert hass.states.get("sensor.eurojackpot_analyzer_jackpot").state == "unknown"            # no jackpot without the API


async def test_single_instance_and_options(hass: HomeAssistant) -> None:
    e = await setup(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == "abort" and result["reason"] == "already_configured"
    flow = await hass.config_entries.options.async_init(e.entry_id)
    assert flow["type"] == "form"
    done = await hass.config_entries.options.async_configure(flow["flow_id"], {"scan_interval": 60, "price_per_column": 2.0})
    assert done["type"] == "create_entry" and e.options["price_per_column"] == 2.0


async def test_full_number_table_for_the_heat_map(hass: HomeAssistant) -> None:
    await setup(hass)
    s = hass.states.get("sensor.eurojackpot_analyzer_most_overdue_numbers")
    all_ = s.attributes["all"]
    assert [x["number"] for x in all_["main"]] == list(range(1, 51))
    assert [x["number"] for x in all_["euro"]] == list(range(1, 13))          # the current 1-12 pool
    assert all(set(x) == {"number", "count", "percent", "draws_since"} for x in all_["main"])
    assert s.attributes["draws_analysed"] == 998

async def test_panel_cards_and_module_are_registered(hass: HomeAssistant) -> None:
    from pathlib import Path
    from unittest.mock import MagicMock

    from custom_components.eurojackpot_analyzer import panel

    hass.http = MagicMock()
    hass.http.async_register_static_paths = AsyncMock()
    with patch("homeassistant.components.frontend.add_extra_js_url") as add_js, \
         patch("homeassistant.components.panel_custom.async_register_panel", new_callable=AsyncMock) as reg_panel:
        await panel.async_register_ui(hass)
        await panel.async_register_ui(hass)                                 # idempotent: nothing is registered twice
    cfg = hass.http.async_register_static_paths.call_args.args[0][0]
    assert hass.http.async_register_static_paths.call_count == 1
    assert cfg.url_path == "/eurojackpot_analyzer/eurojackpot-analyzer-card.js" and Path(cfg.path).exists()
    assert add_js.call_count == 1 and add_js.call_args.args[1].startswith(cfg.url_path + f"?v={VERSION}-")
    assert reg_panel.call_count == 1
    kw = reg_panel.call_args.kwargs
    assert kw["webcomponent_name"] == "eurojackpot-analyzer-panel" and kw["frontend_url_path"] == "eurojackpot"
    assert kw["sidebar_title"] == "EuroJackpot Analyzer" and kw["require_admin"] is False
    assert kw["module_url"].startswith(cfg.url_path + f"?v={VERSION}-")          # cache-busting token


async def test_panel_is_removed_with_the_last_entry(hass: HomeAssistant) -> None:
    from unittest.mock import MagicMock

    from custom_components.eurojackpot_analyzer import panel

    hass.http = MagicMock()
    hass.http.async_register_static_paths = AsyncMock()
    with patch("homeassistant.components.frontend.add_extra_js_url"), \
         patch("homeassistant.components.panel_custom.async_register_panel", new_callable=AsyncMock):
        await panel.async_register_ui(hass)
    with patch("homeassistant.components.frontend.async_remove_panel") as rm, \
         patch("homeassistant.components.frontend.remove_extra_js_url") as rm_js:
        panel.async_unregister_ui(hass)
        panel.async_unregister_ui(hass)                                     # a second call does nothing
    rm.assert_called_once_with(hass, "eurojackpot")
    assert rm_js.call_count == 1


async def test_ui_is_skipped_without_a_web_server(hass: HomeAssistant) -> None:
    from custom_components.eurojackpot_analyzer import panel

    hass.http = None
    await panel.async_register_ui(hass)                                     # must not raise

# --- 0.5.0: alerts, synced tickets, analysis ---------------------------------------------------------------------

from homeassistant.util import dt as dt_util  # noqa: E402
from pytest_homeassistant_custom_component.common import async_capture_events, async_mock_service  # noqa: E402

PLAYED = {"uid": "t1", "created_at": "2026-10-12T10:00:00", "target_date": "2026-10-13", "algo": "manual", "price": 5.0,
          "played": True, "updated_at": "2026-10-12T10:00:00.000Z",
          "columns": [{"main": [11, 17, 20, 22, 1], "euro": [4, 8]}, {"main": [1, 2, 3, 4, 5], "euro": [1, 2]}]}


class FakeGist:
    remote: dict | None = None
    pushed: list = []

    def __init__(self, token, gist_id=None):
        self.id = gist_id or "gist1"

    def pull_or_create(self):
        return FakeGist.remote

    def push(self, doc):
        FakeGist.pushed.append(doc)


async def setup_with(hass, options=None):
    FakeGist.remote, FakeGist.pushed = None, []
    e = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={}, title="EuroJackpot Analyzer", options=options or {})
    e.add_to_hass(hass)
    patches = [patch.object(EuroJackpotClient, "last_and_active", AsyncMock(return_value=(parse_allwyn(ALLWYN_LAST), ACTIVE))),
               patch.object(EuroJackpotClient, "allwyn_range", AsyncMock(return_value=[])),
               patch.object(EuroJackpotClient, "official_day", AsyncMock(return_value=None)),
               patch("custom_components.eurojackpot_analyzer.coordinator.ticket_sync.Gist", FakeGist)]
    for p in patches:
        p.start()
    assert await hass.config_entries.async_setup(e.entry_id)
    await hass.async_block_till_done()
    return e, patches


def stop(patches):
    for p in patches:
        p.stop()


async def test_new_draw_and_jackpot_alerts(hass: HomeAssistant) -> None:
    calls = async_mock_service(hass, "notify", "test_phone")
    draws = async_capture_events(hass, f"{DOMAIN}_new_draw")
    alerts = async_capture_events(hass, f"{DOMAIN}_jackpot_alert")
    e, patches = await setup_with(hass, {"notify_service": "notify.test_phone", "jackpot_threshold": 5})
    coord = e.runtime_data
    assert not draws                                            # the first start is no news
    assert len(alerts) == 1 and alerts[0].data["jackpot"] == 10000000.0
    assert len(calls) == 1 and "10 million" in calls[0].data["message"]
    new = {**parse_allwyn(ALLWYN_LAST), "date": "2026-10-16", "main": [1, 2, 3, 4, 5], "euro": [1, 2]}
    with patch.object(EuroJackpotClient, "last_and_active", AsyncMock(return_value=(new, ACTIVE))), \
         patch.object(EuroJackpotClient, "allwyn_range", AsyncMock(return_value=[new])):
        await coord.async_refresh()
        await coord.async_refresh()
    stop(patches)
    assert len(draws) == 1 and draws[0].data["text"] == "1 2 3 4 5 + 1 2" and draws[0].data["date"] == "2026-10-16"
    assert len(alerts) == 1                                     # the jackpot alert comes once per draw
    assert len(calls) == 2 and calls[1].data["message"] == "Draw 2026-10-16: 1 2 3 4 5 + 1 2" and calls[1].data["title"] == "EuroJackpot"


async def test_alert_event_without_a_notify_service(hass: HomeAssistant) -> None:
    alerts = async_capture_events(hass, f"{DOMAIN}_jackpot_alert")
    _, patches = await setup_with(hass, {"jackpot_threshold": 5})
    stop(patches)
    assert len(alerts) == 1                                     # the event is fired anyway, for automations of the user


async def test_ticket_results(hass: HomeAssistant, freezer) -> None:
    freezer.move_to("2026-10-14 10:00:00+00:00")
    calls = async_mock_service(hass, "notify", "test_phone")
    results = async_capture_events(hass, f"{DOMAIN}_ticket_result")
    e, patches = await setup_with(hass, {"notify_service": "notify.test_phone"})
    coord = e.runtime_data
    coord.state["tickets"] = [PLAYED, {**PLAYED, "uid": "t2", "played": False}]
    await coord.async_refresh()
    await coord.async_refresh()
    stop(patches)
    assert len(results) == 1 and results[0].data["uid"] == "t1"
    assert results[0].data["winning_columns"] == 1 and results[0].data["total_prize"] > 0 and results[0].data["tiers"][0] == "4+2"
    assert len(calls) == 1 and "1 of 2 columns won" in calls[0].data["message"] and calls[0].data["message"].startswith("Ticket for 2026-10-13")
    s = hass.states.get("sensor.eurojackpot_analyzer_my_tickets")
    assert s.state == "2"
    by = {t["uid"]: t for t in s.attributes["tickets"]}
    assert by["t1"]["result"]["winning_columns"] == 1 and by["t2"]["result"] is None
    assert by["t1"]["columns"][0]["text"] == "11 17 20 22 1 + 4 8" and s.attributes["sync_enabled"] is False


async def test_old_results_are_silent(hass: HomeAssistant, freezer) -> None:
    freezer.move_to("2026-12-01 10:00:00+00:00")
    calls = async_mock_service(hass, "notify", "test_phone")
    results = async_capture_events(hass, f"{DOMAIN}_ticket_result")
    e, patches = await setup_with(hass, {"notify_service": "notify.test_phone"})
    e.runtime_data.state["tickets"] = [PLAYED]
    await e.runtime_data.async_refresh()
    stop(patches)
    assert not results and not calls
    assert e.runtime_data.state["results"]["t1"]["winning_columns"] == 1       # recorded all the same


async def test_analyze_ticket_service(hass: HomeAssistant) -> None:
    e, patches = await setup_with(hass)
    res = await hass.services.async_call(DOMAIN, "analyze_ticket", {"numbers": "11 17 20 22 35 + 4 8; 1 2 3 4 5 + 1 2"},
                                         blocking=True, return_response=True)
    ov = res["overall"]
    assert ov["columns"] == 2 and ov["cost"] == 5.0 and 0 < ov["p_any"] < 1
    assert abs(ov["p_jackpot"] - 2 / 139838160) < 1e-12 and len(res["columns"]) == 2
    bt = res["columns"][0]["backtest"]
    assert bt["draws"] == 998 and bt["best_tier"] == "5+2"                      # the first column is the last draw
    await hass.services.async_call(DOMAIN, "generate_ticket", {"columns": 3, "algorithm": "hot"}, blocking=True, return_response=True)
    again = await hass.services.async_call(DOMAIN, "analyze_ticket", {}, blocking=True, return_response=True)
    assert again["overall"]["columns"] == 3                                     # the last generated ticket
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "analyze_ticket", {"numbers": "1 2 3"}, blocking=True, return_response=True)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "analyze_ticket", {"uid": "nope"}, blocking=True, return_response=True)
    stop(patches)


async def test_generate_can_save_the_ticket(hass: HomeAssistant) -> None:
    e, patches = await setup_with(hass)
    res = await hass.services.async_call(DOMAIN, "generate_ticket", {"columns": 2, "algorithm": "random", "save": True},
                                         blocking=True, return_response=True)
    stop(patches)
    assert res["target_date"] == "2026-10-16" and "|2026-10-16|" in res["saved_uid"]
    s = hass.states.get("sensor.eurojackpot_analyzer_my_tickets")
    assert s.state == "1" and s.attributes["tickets"][0]["played"] is False and len(s.attributes["tickets"][0]["columns"]) == 2


async def test_ticket_sync_through_the_gist(hass: HomeAssistant) -> None:
    from custom_components.eurojackpot_analyzer.core import ticket_sync
    e, patches = await setup_with(hass, {"github_token": "ghp_test"})
    FakeGist.remote = ticket_sync.to_doc([PLAYED], {})
    FakeGist.pushed = []
    await hass.services.async_call(DOMAIN, "sync_tickets", {}, blocking=True)
    s = hass.states.get("sensor.eurojackpot_analyzer_my_tickets")
    assert s.state == "1" and s.attributes["sync_enabled"] is True
    assert FakeGist.pushed == []                                                # nothing newer here: no write
    res = await hass.services.async_call(DOMAIN, "generate_ticket", {"columns": 1, "algorithm": "hot", "save": True},
                                         blocking=True, return_response=True)
    stop(patches)
    assert len(FakeGist.pushed) == 1 and {t["uid"] for t in FakeGist.pushed[0]["tickets"]} == {"t1", res["saved_uid"]}
    assert e.runtime_data.state["gist"] == "gist1"


async def test_sync_without_a_token_is_an_error(hass: HomeAssistant) -> None:
    from homeassistant.exceptions import HomeAssistantError
    _, patches = await setup_with(hass)
    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(DOMAIN, "sync_tickets", {}, blocking=True)
    stop(patches)


async def test_new_options_are_saved(hass: HomeAssistant) -> None:
    e, patches = await setup_with(hass)
    stop(patches)
    flow = await hass.config_entries.options.async_init(e.entry_id)
    done = await hass.config_entries.options.async_configure(
        flow["flow_id"], {"scan_interval": 30, "price_per_column": 2.5, "notify_service": " notify.x ", "jackpot_threshold": 40,
                          "github_token": " tok "})
    assert done["type"] == "create_entry" and e.options["notify_service"] == "notify.x" and e.options["github_token"] == "tok"
    assert e.options["jackpot_threshold"] == 40


async def test_late_prizes_correct_an_earlier_result(hass: HomeAssistant, freezer) -> None:
    """The prize table of a draw arrives after its numbers: the row and the results of the tickets are corrected."""
    freezer.move_to("2026-10-14 10:00:00+00:00")
    calls = async_mock_service(hass, "notify", "test_phone")
    results = async_capture_events(hass, f"{DOMAIN}_ticket_result")
    e, patches = await setup_with(hass, {"notify_service": "notify.test_phone"})
    coord = e.runtime_data
    row = coord.rows[-1]
    assert row[0] == "2026-10-13"
    coord.rows[-1] = [row[0], row[1], row[2], {"5+2": 1.0}]                      # what was known right after the draw
    coord.state["tickets"] = [PLAYED]
    coord.state["reported"] = ["t1|2026-10-13"]
    coord.state["results"] = {"t1": {"date": "2026-10-13", "winning_columns": 0, "total_prize": 0, "complete": True, "tiers": []}}
    await coord.async_refresh()
    await coord.async_refresh()
    stop(patches)
    assert coord.rows[-1][3]["4+2"] == 1780.0                                    # the row has the table of the source now
    assert len(results) == 1 and results[0].data["winning_columns"] == 1 and results[0].data["total_prize"] == 1780.0
    assert len(calls) == 1 and "1 of 2 columns won" in calls[0].data["message"]


async def test_options_list_the_notify_services(hass: HomeAssistant) -> None:
    async_mock_service(hass, "notify", "mobile_app_phone")
    async_mock_service(hass, "notify", "telegram")
    e, patches = await setup_with(hass, {"notify_service": "notify.old_one"})
    stop(patches)
    flow = await hass.config_entries.options.async_init(e.entry_id)
    field = next(k for k in flow["data_schema"].schema if str(k) == "notify_service")
    cfg = flow["data_schema"].schema[field].config
    assert cfg["options"] == ["notify.mobile_app_phone", "notify.old_one", "notify.telegram"]      # the current choice stays listed
    assert cfg["custom_value"] is True                                                           # typing a name still works
