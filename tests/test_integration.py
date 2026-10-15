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