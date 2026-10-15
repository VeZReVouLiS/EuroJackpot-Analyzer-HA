"""Sidebar panel + Lovelace cards of EuroJackpot Analyzer.

One JavaScript file ships with the integration. It defines the full-screen panel (shown in the sidebar, like
GR e-Pass) and the three Lovelace cards. This module serves it and registers it:

* the static paths (card file + assets folder) once per Home Assistant run (aiohttp cannot remove a route, registering it again raises);
* the sidebar panel once per instance (removed when the last entry unloads);
* the module on every dashboard (add_extra_js_url) so the cards need no resource setup.

The module URL carries a cache-busting token (version + file size + mtime). Without it a caching proxy in front
of Home Assistant (Cloudflare Tunnel, nginx, ...) keeps serving the previous UI after an upgrade.
"""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

CARD_FILE = "eurojackpot-analyzer-card.js"
CARD_URL = f"/{DOMAIN}/{CARD_FILE}"
ASSETS_URL = f"/{DOMAIN}/assets"
PANEL_COMPONENT = "eurojackpot-analyzer-panel"
PANEL_PATH = "eurojackpot"                 # the sidebar entry opens /eurojackpot
PANEL_TITLE = "EuroJackpot Analyzer"
PANEL_ICON = "mdi:ticket-confirmation"

_STATIC_SERVED = f"{DOMAIN}_static_served"
_PANEL_REGISTERED = f"{DOMAIN}_panel_registered"
_EXTRA_URL = f"{DOMAIN}_extra_js_url"


async def async_register_ui(hass: HomeAssistant, _component: str = "frontend") -> None:
    """Serve the module, load it on every dashboard and add the sidebar panel."""
    if getattr(hass, "http", None) is None:
        return                                          # headless / test environments
    from homeassistant.components import frontend, panel_custom
    from homeassistant.components.http import StaticPathConfig

    source = Path(__file__).parent / "www" / CARD_FILE
    if not hass.data.get(_STATIC_SERVED):
        await hass.http.async_register_static_paths([
            StaticPathConfig(CARD_URL, str(source), cache_headers=False),
            # flags, logo and countries.json (copied from the Windows app by tools/sync_ha_core.py)
            StaticPathConfig(ASSETS_URL, str(source.parent / "assets"), cache_headers=False),
        ])
        hass.data[_STATIC_SERVED] = True

    integration = await async_get_integration(hass, DOMAIN)
    stat = await hass.async_add_executor_job(source.stat)
    token = f"{integration.version or 'dev'}-{stat.st_size:x}-{int(stat.st_mtime):x}"
    module_url = f"{CARD_URL}?v={token}"

    if not hass.data.get(_EXTRA_URL):
        frontend.add_extra_js_url(hass, module_url)
        hass.data[_EXTRA_URL] = module_url

    if not hass.data.get(_PANEL_REGISTERED):
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name=PANEL_COMPONENT,
            frontend_url_path=PANEL_PATH,
            module_url=module_url,
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            # Everybody in the household may look at the draws and generate a ticket: the page only reads
            # entity states and calls the generate_ticket service.
            require_admin=False,
            config={},
        )
        hass.data[_PANEL_REGISTERED] = True
        _LOGGER.debug("Registered the EuroJackpot Analyzer panel at /%s from %s", PANEL_PATH, module_url)


def async_unregister_ui(hass: HomeAssistant) -> None:
    """Drop the sidebar entry and the dashboard module when the last config entry unloads."""
    from homeassistant.components import frontend

    if hass.data.pop(_PANEL_REGISTERED, False):
        frontend.async_remove_panel(hass, PANEL_PATH)
    url = hass.data.pop(_EXTRA_URL, None)
    if url:
        frontend.remove_extra_js_url(hass, url)
