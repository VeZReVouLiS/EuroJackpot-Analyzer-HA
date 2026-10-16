"""Config flow: one click to set up, options for the refresh interval and the column price."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback

from homeassistant.helpers import selector

from .const import (CONF_JACKPOT_MIN, CONF_NOTIFY, CONF_PRICE, CONF_SCAN_INTERVAL, CONF_TOKEN, DEFAULT_PRICE,
                    DEFAULT_SCAN_INTERVAL, DOMAIN, NAME)


class EuroJackpotConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title=NAME, data={})
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return EuroJackpotOptionsFlow()


class EuroJackpotOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input: dict | None = None) -> ConfigFlowResult:
        if user_input is not None:
            user_input = {**user_input, CONF_NOTIFY: (user_input.get(CONF_NOTIFY) or "").strip(),
                          CONF_TOKEN: (user_input.get(CONF_TOKEN) or "").strip()}
            return self.async_create_entry(data=user_input)
        opts = self.config_entry.options
        schema = vol.Schema({
            vol.Required(CONF_SCAN_INTERVAL, default=opts.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)):
                vol.All(vol.Coerce(int), vol.Range(min=10, max=720)),
            vol.Required(CONF_PRICE, default=opts.get(CONF_PRICE, DEFAULT_PRICE)):
                vol.All(vol.Coerce(float), vol.Range(min=0.5, max=20)),
            vol.Optional(CONF_NOTIFY, description={"suggested_value": opts.get(CONF_NOTIFY, "")}): str,
            vol.Required(CONF_JACKPOT_MIN, default=opts.get(CONF_JACKPOT_MIN, 0)):
                vol.All(vol.Coerce(float), vol.Range(min=0, max=1000)),
            vol.Optional(CONF_TOKEN, description={"suggested_value": opts.get(CONF_TOKEN, "")}):
                selector.TextSelector(selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)),
        })
        return self.async_show_form(step_id="init", data_schema=schema)
