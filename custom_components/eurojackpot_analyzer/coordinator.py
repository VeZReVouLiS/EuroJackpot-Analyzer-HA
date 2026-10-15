"""Data coordinator: keeps the draw history, fetches new draws, computes statistics, generates tickets."""
from __future__ import annotations

import json
import logging
import secrets
from datetime import date, datetime, timedelta
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from . import logic
from .client import EuroJackpotClient, SourceError
from .const import (ALGORITHMS, ALLWYN_FIRST_DATE, AUTO_COLUMN, AUTO_TICKET, CONF_PRICE, CONF_SCAN_INTERVAL,
                    DEFAULT_PRICE, DEFAULT_SCAN_INTERVAL, DOMAIN, MAX_COLUMNS, PERIODS)
from .core import generators, rules

_LOGGER = logging.getLogger(__name__)
SEED_FILE = Path(__file__).parent / "data" / "draws.json"
MAX_GAP_DAYS_OFFICIAL = 90


class EuroJackpotCoordinator(DataUpdateCoordinator[dict]):
    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: EuroJackpotClient) -> None:
        minutes = entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        super().__init__(hass, _LOGGER, config_entry=entry, name=DOMAIN, update_interval=timedelta(minutes=minutes))
        self.client = client
        self._draws_store: Store = Store(hass, 1, f"{DOMAIN}.draws")
        self._ticket_store: Store = Store(hass, 1, f"{DOMAIN}.ticket")
        self.rows: list[list] = []              # [[date, main, euro], ...] ascending
        self.last_ticket: dict | None = None
        self._tops: dict | None = None
        self._stats_for: str | None = None      # last draw date the cached statistics belong to
        self._official_for: tuple[str, dict | None] | None = None   # (draw date, official result) cache

    @property
    def price(self) -> float:
        return float(self.config_entry.options.get(CONF_PRICE, DEFAULT_PRICE))

    # storage ----------------------------------------------------------------
    async def async_load(self) -> None:
        saved = await self._draws_store.async_load()
        if saved and saved.get("draws"):
            self.rows = saved["draws"]
        else:                                   # first start: bundled snapshot, works offline
            text = await self.hass.async_add_executor_job(SEED_FILE.read_text, "utf-8")
            self.rows = json.loads(text)["draws"]
            await self._draws_store.async_save({"draws": self.rows})
        ticket = await self._ticket_store.async_load()
        self.last_ticket = ticket or None

    # updating ---------------------------------------------------------------
    async def _fetch_missing(self, last_known: str) -> list[dict]:
        """Draws newer than our history up to `last_known` (Allwyn range, official per-day as fallback)."""
        last_stored = self.rows[-1][0]
        if last_known <= last_stored:
            return []
        if last_stored >= ALLWYN_FIRST_DATE:
            try:
                return await self.client.allwyn_range(date.fromisoformat(last_stored) + timedelta(days=1),
                                                      date.fromisoformat(last_known))
            except SourceError as err:
                _LOGGER.debug("Allwyn range failed (%s), trying the official source", err)
        days = logic.missing_dates(last_stored, last_known)[:MAX_GAP_DAYS_OFFICIAL]
        out = []
        for day in days:
            d = await self.client.official_day(day)
            if d:
                out.append(d)
        return out

    async def _with_official(self, last: dict) -> dict:
        """Merge the official result of the last draw (where-won per country/state, sales). Best effort, cached."""
        if self._official_for is None or self._official_for[0] != last["date"] or self._official_for[1] is None:
            try:
                official = await self.client.official_day(date.fromisoformat(last["date"]))
            except SourceError as err:
                _LOGGER.debug("Official source unavailable for the where-won data: %s", err)
                official = None
            self._official_for = (last["date"], official)
        official = self._official_for[1]
        if not official:
            return last
        return {**last, "classes": logic.merge_where(last.get("classes", []), official),
                "stake_all": last.get("stake_all") or official.get("stake_all")}

    async def _async_update_data(self) -> dict:
        last = nxt = None
        try:
            last, nxt = await self.client.last_and_active()
        except SourceError as err:
            _LOGGER.debug("Allwyn unavailable (%s), falling back to the official source", err)
        if last is None:                         # fallback: probe the most recent draw dates
            try:
                for day in reversed(list(rules.candidate_dates(date.today() - timedelta(days=10), date.today()))):
                    last = await self.client.official_day(day)
                    if last:
                        break
            except SourceError as err:
                if not self.rows:
                    raise UpdateFailed(f"No data source available: {err}") from err
                _LOGGER.warning("Data sources unavailable, using stored history: %s", err)
        if last:                                 # official data adds where the winners are and the total sales
            last = await self._with_official(last)
        changed = False
        if last:
            try:
                new = await self._fetch_missing(last["date"])
            except SourceError as err:
                _LOGGER.warning("Could not fetch missing draws: %s", err)
                new = []
            if last["date"] not in {d["date"] for d in new} and last["date"] > self.rows[-1][0]:
                new.append(last)
            if new:
                self.rows = logic.merge_draws(self.rows, new)
                await self._draws_store.async_save({"draws": self.rows})
                changed = True
        latest_stored = self.rows[-1][0]
        if changed or self._tops is None or self._stats_for != latest_stored:
            st = await self.hass.async_add_executor_job(logic.compute_stats, self.rows, "all")
            self._tops = logic.top_lists(st)
            self._stats_for = latest_stored
        if nxt is None:                          # no jackpot info: at least the date of the next draw
            nd = rules.next_draw_dates(dt_util.now().replace(tzinfo=None), 1)[0]
            athens = dt_util.get_time_zone("Europe/Athens")
            nxt = {"draw_time": dt_util.as_utc(datetime(nd.year, nd.month, nd.day, 21, 0, tzinfo=athens)),
                   "draw_number": None, "jackpot": None}
        last_row = self.rows[-1]
        last_detail = last if last and last["date"] == last_row[0] else {
            "date": last_row[0], "main": last_row[1], "euro": last_row[2], "draw_number": None, "classes": [],
            "columns_gr": None, "columns_all": None}
        return {"count": len(self.rows), "last": last_detail, "next": nxt, "tops": self._tops,
                "first_date": self.rows[0][0]}

    # tickets ----------------------------------------------------------------
    async def async_generate_ticket(self, columns: int, algorithm: str, period: str) -> dict:
        if not 1 <= columns <= MAX_COLUMNS:
            raise ValueError(f"columns must be 1..{MAX_COLUMNS}")
        if algorithm not in ALGORITHMS + [AUTO_TICKET, AUTO_COLUMN] or period not in PERIODS:
            raise ValueError("invalid algorithm or period")

        def build() -> dict:
            st = logic.compute_stats(self.rows, period)
            t = generators.generate_ticket(st, columns, algorithm, secrets.SystemRandom())
            return t

        t = await self.hass.async_add_executor_job(build)
        result = {
            "columns": [{"numbers": c["main"], "euro_numbers": c["euro"], "algorithm": c["algo"],
                         "text": logic.format_numbers(c["main"], c["euro"])} for c in t["columns"]],
            "column_count": columns,
            "price_per_column": self.price,
            "total_cost": round(columns * self.price, 2),
            "algorithm": algorithm,
            "period": period,
            "generated_at": dt_util.utcnow().isoformat(),
        }
        self.last_ticket = result
        await self._ticket_store.async_save(result)
        self.async_update_listeners()
        self.hass.bus.async_fire(f"{DOMAIN}_ticket_generated", result)
        return result
