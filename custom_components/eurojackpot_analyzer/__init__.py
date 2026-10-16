"""EuroJackpot Analyzer: last draw, next draw and jackpot, number statistics, ticket generator, sidebar panel."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse, callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_change
from homeassistant.setup import async_when_setup

from . import tickets as tk
from .client import EuroJackpotClient
from .const import ALGORITHMS, AUTO_COLUMN, AUTO_TICKET, DOMAIN, MAX_COLUMNS, PERIODS
from .coordinator import EuroJackpotCoordinator
from .core import ticket_sync
from .panel import CARD_URL, async_register_ui, async_unregister_ui  # noqa: F401  (CARD_URL re-exported)

PLATFORMS = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

SERVICE_GENERATE_TICKET = "generate_ticket"
GENERATE_SCHEMA = vol.Schema({
    vol.Optional("columns", default=5): vol.All(vol.Coerce(int), vol.Range(min=1, max=MAX_COLUMNS)),
    vol.Optional("algorithm", default=AUTO_TICKET): vol.In(ALGORITHMS + [AUTO_TICKET, AUTO_COLUMN]),
    vol.Optional("period", default="all"): vol.In(PERIODS),
    vol.Optional("save", default=False): cv.boolean,
})

SERVICE_ANALYZE_TICKET = "analyze_ticket"
ANALYZE_SCHEMA = vol.Schema({
    vol.Optional("uid"): cv.string,
    vol.Optional("numbers"): cv.string,
    vol.Optional("country", default="GR"): cv.string,
})
SERVICE_SYNC_TICKETS = "sync_tickets"

type EuroJackpotConfigEntry = ConfigEntry[EuroJackpotCoordinator]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    def coordinator_of() -> EuroJackpotCoordinator:
        entries = hass.config_entries.async_loaded_entries(DOMAIN)
        if not entries:
            raise ServiceValidationError("The EuroJackpot Analyzer integration is not set up")
        return entries[0].runtime_data

    async def handle_generate(call: ServiceCall) -> dict:
        return await coordinator_of().async_generate_ticket(call.data["columns"], call.data["algorithm"],
                                                            call.data["period"], call.data["save"])

    async def handle_analyze(call: ServiceCall) -> dict:
        coordinator = coordinator_of()
        try:
            if call.data.get("numbers"):
                columns = tk.parse_columns(call.data["numbers"])
            elif call.data.get("uid"):
                t = next((x for x in coordinator.tickets if ticket_sync.uid_of(x) == call.data["uid"]), None)
                if not t:
                    raise ValueError("No synced ticket with this uid.")
                columns = [{"main": c["main"], "euro": c["euro"]} for c in t["columns"]]
            elif coordinator.last_ticket:
                columns = [{"main": c["numbers"], "euro": c["euro_numbers"]} for c in coordinator.last_ticket["columns"]]
            else:
                raise ValueError("Give the numbers or a ticket uid, or generate a ticket first.")
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err
        return await coordinator.async_analyze(columns, call.data["country"])

    async def handle_sync(call: ServiceCall) -> None:
        try:
            await coordinator_of().async_sync_tickets()
        except (ticket_sync.SyncError, OSError) as err:
            raise HomeAssistantError(str(err)) from err
        await coordinator_of().async_request_refresh()

    hass.services.async_register(DOMAIN, SERVICE_GENERATE_TICKET, handle_generate, schema=GENERATE_SCHEMA,
                                 supports_response=SupportsResponse.OPTIONAL)
    hass.services.async_register(DOMAIN, SERVICE_ANALYZE_TICKET, handle_analyze, schema=ANALYZE_SCHEMA,
                                 supports_response=SupportsResponse.ONLY)
    hass.services.async_register(DOMAIN, SERVICE_SYNC_TICKETS, handle_sync, schema=vol.Schema({}))
    return True


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
    # the sidebar panel + cards, as soon as the frontend is up (whatever the start-up order is)
    async_when_setup(hass, "frontend", async_register_ui)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def _async_options_updated(hass: HomeAssistant, entry: EuroJackpotConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: EuroJackpotConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded and not [e for e in hass.config_entries.async_loaded_entries(DOMAIN) if e.entry_id != entry.entry_id]:
        async_unregister_ui(hass)
    return unloaded
