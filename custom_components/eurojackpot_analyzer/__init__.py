"""EuroJackpot: last draw, next draw and jackpot, number statistics and a ticket generator."""
from __future__ import annotations

from pathlib import Path

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_change

from .client import EuroJackpotClient
from .const import ALGORITHMS, AUTO_COLUMN, AUTO_TICKET, DOMAIN, MAX_COLUMNS, PERIODS
from .coordinator import EuroJackpotCoordinator

PLATFORMS = [Platform.SENSOR]
CARD_FILE = "eurojackpot-analyzer-card.js"
CARD_URL = f"/{DOMAIN}/{CARD_FILE}"
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

SERVICE_GENERATE_TICKET = "generate_ticket"
GENERATE_SCHEMA = vol.Schema({
    vol.Optional("columns", default=5): vol.All(vol.Coerce(int), vol.Range(min=1, max=MAX_COLUMNS)),
    vol.Optional("algorithm", default=AUTO_TICKET): vol.In(ALGORITHMS + [AUTO_TICKET, AUTO_COLUMN]),
    vol.Optional("period", default="all"): vol.In(PERIODS),
})

type EuroJackpotConfigEntry = ConfigEntry[EuroJackpotCoordinator]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    async def handle_generate(call: ServiceCall) -> dict:
        entries = hass.config_entries.async_loaded_entries(DOMAIN)
        if not entries:
            raise ServiceValidationError("The EuroJackpot integration is not set up")
        coordinator: EuroJackpotCoordinator = entries[0].runtime_data
        return await coordinator.async_generate_ticket(call.data["columns"], call.data["algorithm"],
                                                       call.data["period"])

    hass.services.async_register(DOMAIN, SERVICE_GENERATE_TICKET, handle_generate, schema=GENERATE_SCHEMA,
                                 supports_response=SupportsResponse.OPTIONAL)
    await _async_register_cards(hass)
    return True


async def _async_register_cards(hass: HomeAssistant) -> None:
    """Serve the Lovelace cards and load them on every dashboard, so users need no resource setup."""
    if getattr(hass, "http", None) is None or "frontend" not in hass.config.components:
        return                                   # headless / test environments
    from homeassistant.components.frontend import add_extra_js_url
    from homeassistant.components.http import StaticPathConfig
    from homeassistant.loader import async_get_integration

    js = Path(__file__).parent / "www" / CARD_FILE
    await hass.http.async_register_static_paths([StaticPathConfig(CARD_URL, str(js), cache_headers=False)])
    version = (await async_get_integration(hass, DOMAIN)).version
    add_extra_js_url(hass, f"{CARD_URL}?v={version}")


async def async_setup_entry(hass: HomeAssistant, entry: EuroJackpotConfigEntry) -> bool:
    coordinator = EuroJackpotCoordinator(hass, entry, EuroJackpotClient(async_get_clientsession(hass)))
    await coordinator.async_load()
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    @callback
    def _refresh(_now) -> None:                  # right after the draw (21:00 Greek time) results appear
        hass.async_create_task(coordinator.async_request_refresh())

    entry.async_on_unload(async_track_time_change(hass, _refresh, hour=[21, 22, 23], minute=[20, 50]))
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def _async_options_updated(hass: HomeAssistant, entry: EuroJackpotConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: EuroJackpotConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
