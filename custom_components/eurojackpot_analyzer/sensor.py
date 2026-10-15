"""Sensors: last draw, next draw, jackpot, number rankings and the last generated ticket."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorEntityDescription
from homeassistant.const import CURRENCY_EURO
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import logic
from .const import DOMAIN, NAME
from .coordinator import EuroJackpotCoordinator


def _top_state(tops: dict, key: str) -> str | None:
    nums = [str(x["number"]) for x in tops[key]["main"][:5]]
    return ", ".join(nums) or None


def _last_attrs(data: dict) -> dict[str, Any]:
    last = data["last"]
    return {
        "numbers": last["main"], "euro_numbers": last["euro"],
        "text": logic.format_numbers(last["main"], last["euro"]),
        "draw_number": last.get("draw_number"),
        "columns_greece": last.get("columns_gr"), "columns_all_countries": last.get("columns_all"),
        "prizes": [
            {"tier": c["tier"], "winners_all_countries": c["winners"], "winners_greece": c.get("winners_gr"),
             "prize_per_winner": c["prize"], **({"where_won": c["where"]} if c.get("where") else {})}
            for c in last.get("classes", [])],
        "total_sales": last.get("stake_all"),
        "draws_in_history": data["count"], "history_since": data["first_date"],
    }


@dataclass(frozen=True, kw_only=True)
class EuroJackpotSensorDescription(SensorEntityDescription):
    value_fn: Callable[[dict], Any]
    attrs_fn: Callable[[dict], dict[str, Any]] | None = None


SENSORS: tuple[EuroJackpotSensorDescription, ...] = (
    EuroJackpotSensorDescription(
        key="last_draw", translation_key="last_draw", device_class=SensorDeviceClass.DATE, icon="mdi:ticket-confirmation",
        value_fn=lambda d: date.fromisoformat(d["last"]["date"]), attrs_fn=_last_attrs),
    EuroJackpotSensorDescription(
        key="next_draw", translation_key="next_draw", device_class=SensorDeviceClass.TIMESTAMP, icon="mdi:calendar-clock",
        value_fn=lambda d: d["next"]["draw_time"],
        attrs_fn=lambda d: {"draw_number": d["next"].get("draw_number")}),
    EuroJackpotSensorDescription(
        key="jackpot", translation_key="jackpot", device_class=SensorDeviceClass.MONETARY,
        native_unit_of_measurement=CURRENCY_EURO, suggested_display_precision=0,
        icon="mdi:cash-multiple", value_fn=lambda d: d["next"].get("jackpot"),
        attrs_fn=lambda d: {"next_draw": d["next"]["draw_time"].isoformat()}),
    EuroJackpotSensorDescription(
        key="overdue_numbers", translation_key="overdue_numbers", icon="mdi:timer-sand",
        value_fn=lambda d: _top_state(d["tops"], "overdue"),
        attrs_fn=lambda d: {"main": d["tops"]["overdue"]["main"], "euro": d["tops"]["overdue"]["euro"],
                            "all": d["tops"]["all"], "draws_analysed": d["tops"]["draws_analysed"]}),
    EuroJackpotSensorDescription(
        key="frequent_numbers", translation_key="frequent_numbers", icon="mdi:fire",
        value_fn=lambda d: _top_state(d["tops"], "frequent"),
        attrs_fn=lambda d: {"main": d["tops"]["frequent"]["main"], "euro": d["tops"]["frequent"]["euro"],
                            "draws_analysed": d["tops"]["draws_analysed"]}),
    EuroJackpotSensorDescription(
        key="rare_numbers", translation_key="rare_numbers", icon="mdi:snowflake",
        value_fn=lambda d: _top_state(d["tops"], "rare"),
        attrs_fn=lambda d: {"main": d["tops"]["rare"]["main"], "euro": d["tops"]["rare"]["euro"],
                            "draws_analysed": d["tops"]["draws_analysed"]}),
)


async def async_setup_entry(hass: HomeAssistant, entry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    coordinator: EuroJackpotCoordinator = entry.runtime_data
    entities: list[SensorEntity] = [EuroJackpotSensor(coordinator, entry.entry_id, d) for d in SENSORS]
    entities.append(GeneratedTicketSensor(coordinator, entry.entry_id))
    async_add_entities(entities)


class _Base(CoordinatorEntity[EuroJackpotCoordinator], SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator: EuroJackpotCoordinator, entry_id: str, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry_id)}, name=NAME, manufacturer="Allwyn / EuroJackpot",
            entry_type=DeviceEntryType.SERVICE)


class EuroJackpotSensor(_Base):
    entity_description: EuroJackpotSensorDescription
    # big attributes only the cards need: keep them out of the recorder database
    _unrecorded_attributes = frozenset({"all", "prizes"})

    def __init__(self, coordinator, entry_id: str, description: EuroJackpotSensorDescription) -> None:
        super().__init__(coordinator, entry_id, description.key)
        self.entity_description = description

    @property
    def native_value(self):
        return self.entity_description.value_fn(self.coordinator.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        fn = self.entity_description.attrs_fn
        return fn(self.coordinator.data) if fn else None


class GeneratedTicketSensor(_Base):
    """State = number of columns of the last generated ticket; attributes hold the columns and the cost."""

    _attr_translation_key = "generated_ticket"
    _attr_icon = "mdi:dice-multiple"

    def __init__(self, coordinator, entry_id: str) -> None:
        super().__init__(coordinator, entry_id, "generated_ticket")

    @property
    def native_value(self):
        t = self.coordinator.last_ticket
        return t["column_count"] if t else None

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        t = self.coordinator.last_ticket
        return dict(t) if t else None
