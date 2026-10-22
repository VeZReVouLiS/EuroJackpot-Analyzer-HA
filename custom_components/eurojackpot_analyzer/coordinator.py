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

from . import logic, tickets as tk
from .client import EuroJackpotClient, SourceError
from .const import (ALGORITHMS, ALLWYN_FIRST_DATE, AUTO_COLUMN, AUTO_TICKET, CONF_JACKPOT_MIN, CONF_NOTIFY, CONF_PRICE,
                    CONF_SCAN_INTERVAL, CONF_TOKEN, DEFAULT_PRICE, DEFAULT_SCAN_INTERVAL, DOMAIN, MAX_COLUMNS, PERIODS)
from .core import analysis, generators, rules, ticket_sync

_LOGGER = logging.getLogger(__name__)
SEED_FILE = Path(__file__).parent / "data" / "draws.json"
MAX_GAP_DAYS_OFFICIAL = 90
RESULT_WINDOW_DAYS = 7          # results of older draws are recorded silently (no notification)


class EuroJackpotCoordinator(DataUpdateCoordinator[dict]):
    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: EuroJackpotClient) -> None:
        minutes = entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        super().__init__(hass, _LOGGER, config_entry=entry, name=DOMAIN, update_interval=timedelta(minutes=minutes))
        self.client = client
        self._draws_store: Store = Store(hass, 1, f"{DOMAIN}.draws")
        self._ticket_store: Store = Store(hass, 1, f"{DOMAIN}.ticket")
        self._state_store: Store = Store(hass, 1, f"{DOMAIN}.state")
        self.state: dict = {}                   # last_draw, jackpot_alert, reported, tickets, tombstones, gist, results
        self.rows: list[list] = []              # [[date, main, euro], ...] ascending
        self.last_ticket: dict | None = None
        self._tops: dict | None = None
        self._stats_for: str | None = None      # last draw date the cached statistics belong to
        self._official_for: tuple[str, dict | None] | None = None   # (draw date, official result) cache

    @property
    def price(self) -> float:
        return float(self.config_entry.options.get(CONF_PRICE, DEFAULT_PRICE))

    @property
    def tickets(self) -> list[dict]:
        return self.state.get("tickets", [])

    @property
    def token(self) -> str:
        return (self.config_entry.options.get(CONF_TOKEN) or "").strip()

    # storage ----------------------------------------------------------------
    async def async_load(self) -> None:
        saved = await self._draws_store.async_load()
        seed = json.loads(await self.hass.async_add_executor_job(SEED_FILE.read_text, "utf-8"))["draws"]
        if saved and saved.get("draws"):
            self.rows = saved["draws"]
            if logic.add_prizes(self.rows, seed):       # saved by an older version: add the prizes of the bundled history
                await self._draws_store.async_save({"draws": self.rows})
        else:                                           # first start: bundled snapshot, works offline
            self.rows = seed
            await self._draws_store.async_save({"draws": self.rows})
        ticket = await self._ticket_store.async_load()
        self.last_ticket = ticket or None
        self.state = await self._state_store.async_load() or {}

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
            except Exception as err:        # best effort: never let the extra data break the update
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
            elif last["date"] == self.rows[-1][0]:
                # the prizes of a draw are published after its numbers: keep the table of the newest draw up to date
                prizes = logic.prizes_of(last)
                row = self.rows[-1]
                if prizes and (row[3] if len(row) > 3 else None) != prizes:
                    self.rows = logic.merge_draws(self.rows, [last])
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
        data = {"count": len(self.rows), "last": last_detail, "next": nxt, "tops": self._tops,
                "first_date": self.rows[0][0]}
        await self._after_update(data)
        return data

    # alerts and the tickets synced through the gist of the user ----------------
    async def _save_state(self) -> None:
        await self._state_store.async_save(self.state)

    async def _notify(self, message: str) -> None:
        target = (self.config_entry.options.get(CONF_NOTIFY) or "").strip()
        if not target:
            return
        domain, _, service = target.partition(".")
        if not service:
            domain, service = "notify", domain
        try:
            await self.hass.services.async_call(domain, service, {"title": tk.text(self.hass.config.language, "title"),
                                                                  "message": message}, blocking=True)
        except Exception as err:                # a wrong notify service must never break the update
            _LOGGER.warning("Could not send the notification through %s.%s: %s", domain, service, err)

    async def _after_update(self, data: dict) -> None:
        lang = self.hass.config.language
        dirty = False
        if self.token:
            try:
                await self.async_sync_tickets()
            except (ticket_sync.SyncError, OSError) as err:
                _LOGGER.debug("Ticket sync failed: %s", err)
        last, nxt = data["last"], data["next"]
        prev = self.state.get("last_draw")
        if prev != last["date"]:
            if prev and last["date"] > prev:        # not on the very first start: that is no news
                payload = {"date": last["date"], "numbers": last["main"], "euro_numbers": last["euro"],
                           "text": logic.format_numbers(last["main"], last["euro"]), "draw_number": last.get("draw_number"),
                           "jackpot_next": nxt.get("jackpot")}
                self.hass.bus.async_fire(f"{DOMAIN}_new_draw", payload)
                await self._notify(tk.text(lang, "new_draw", date=last["date"], numbers=payload["text"]))
            self.state["last_draw"] = last["date"]
            dirty = True
        threshold = float(self.config_entry.options.get(CONF_JACKPOT_MIN, 0) or 0)
        key = nxt["draw_time"].isoformat()
        if tk.jackpot_due(nxt.get("jackpot"), threshold, key, self.state.get("jackpot_alert")):
            self.state["jackpot_alert"] = key
            dirty = True
            self.hass.bus.async_fire(f"{DOMAIN}_jackpot_alert", {"jackpot": nxt["jackpot"], "draw_time": key, "threshold": threshold})
            await self._notify(tk.text(lang, "jackpot", amount=f"{nxt['jackpot'] / 1_000_000:g}", date=key[:10]))
        reported = set(self.state.get("reported", []))
        sigs = self.state.setdefault("sigs", {})
        for item in tk.pending_results(self.tickets, self.rows, reported, sigs):
            reported.add(item["key"])
            sigs[item["key"]] = item["sig"]
            res = item["result"]
            old = self.state.get("results", {}).get(item["uid"])
            new = {"date": item["date"], "winning_columns": res["winning_columns"], "total_prize": res["total_prize"],
                   "complete": res["complete"], "tiers": [c["tier"] for c in res["columns"]]}
            self.state.setdefault("results", {})[item["uid"]] = new
            dirty = True
            news = old is None or (old["date"], old["winning_columns"], old["total_prize"]) != (new["date"], new["winning_columns"], new["total_prize"])
            if news and (dt_util.now().date() - date.fromisoformat(item["date"])).days <= RESULT_WINDOW_DAYS:
                self.hass.bus.async_fire(f"{DOMAIN}_ticket_result", {"uid": item["uid"], **new})
                await self._notify(tk.result_message(lang, item))
        if dirty:
            self.state["reported"] = sorted(reported)
            await self._save_state()

    async def async_sync_tickets(self) -> dict:
        """Merge the tickets of this Home Assistant with the sync gist of the user (pull, and push what is newer here)."""
        token = self.token
        if not token:
            raise ticket_sync.SyncError("No GitHub token is set in the integration options.")

        def work():
            gist = ticket_sync.Gist(token, self.state.get("gist"))
            remote = gist.pull_or_create()
            merged, tombs = ticket_sync.merge(self.tickets, remote, self.state.get("tombstones"))
            before = {"tickets": (remote or {}).get("tickets"), "tombstones": (remote or {}).get("tombstones") or {}}
            if before != {"tickets": merged, "tombstones": tombs}:
                gist.push(ticket_sync.to_doc(merged, tombs))
            return gist.id, merged, tombs

        gist_id, merged, tombs = await self.hass.async_add_executor_job(work)
        changed = merged != self.tickets or tombs != self.state.get("tombstones", {}) or gist_id != self.state.get("gist")
        self.state.update({"gist": gist_id, "tickets": merged, "tombstones": tombs, "synced_at": dt_util.utcnow().isoformat()})
        if changed:
            await self._save_state()
            self.async_update_listeners()
        return {"tickets": len(merged)}

    def next_draw_date(self) -> str:
        t = self.data["next"]["draw_time"] if self.data else None
        if t is None:
            return rules.next_draw_dates(dt_util.now().replace(tzinfo=None), 1)[0].isoformat()
        return t.astimezone(dt_util.get_time_zone("Europe/Athens")).date().isoformat()

    async def _add_ticket(self, columns: list[dict], algorithm: str) -> dict:
        """Put a generated ticket into the synced list (not played yet, for the next draw) and push it when sync is on."""
        now = datetime.now(dt_util.UTC)
        stamp = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
        target = self.next_draw_date()
        created = dt_util.now().replace(tzinfo=None).isoformat(timespec="seconds")
        ticket = {"uid": f"{created}|{target}|{secrets.token_hex(2)}", "created_at": created, "target_date": target,
                  "algo": algorithm, "columns": columns, "price": round(len(columns) * self.price, 2), "played": False,
                  "updated_at": stamp}
        self.state["tickets"] = [*self.tickets, ticket]
        await self._save_state()
        if self.token:
            try:
                await self.async_sync_tickets()
            except (ticket_sync.SyncError, OSError) as err:
                _LOGGER.warning("The ticket was saved here but could not be synced: %s", err)
        self.async_update_listeners()
        return ticket

    # analysis -----------------------------------------------------------------
    async def async_analyze(self, columns: list[dict], country: str = "GR") -> dict:
        def work() -> dict:
            st = logic.compute_stats(self.rows, "all")
            return analysis.analyze(columns, logic.rows_to_draws(self.rows), st, self.price, country)

        return await self.hass.async_add_executor_job(work)

    # tickets ----------------------------------------------------------------
    async def async_generate_ticket(self, columns: int, algorithm: str, period: str, save: bool = False) -> dict:
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
        if save:
            saved = await self._add_ticket([{"main": c["main"], "euro": c["euro"], "algo": c["algo"]} for c in t["columns"]],
                                           algorithm)
            result["saved_uid"] = saved["uid"]
            result["target_date"] = saved["target_date"]
        self.last_ticket = result
        await self._ticket_store.async_save(result)
        self.async_update_listeners()
        self.hass.bus.async_fire(f"{DOMAIN}_ticket_generated", result)
        return result
