"""Async HTTP client for the Allwyn/OPAP draws API and the official eurojackpot.com service."""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta

import aiohttp

from .const import ALLWYN_BASE, ALLWYN_REFERER, OFFICIAL_REFERER, OFFICIAL_URL
from .parsing import parse_allwyn, parse_allwyn_active, parse_official

_LOGGER = logging.getLogger(__name__)

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)


class SourceError(Exception):
    """A data source failed (network / HTTP). The message is safe to show."""


class EuroJackpotClient:
    def __init__(self, session: aiohttp.ClientSession) -> None:
        self._session = session

    async def _get_json(self, url: str, referer: str, retries: int = 2):
        headers = {
            "User-Agent": BROWSER_UA,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "el-GR,el;q=0.9,en;q=0.8",
            "Origin": referer.rstrip("/"),
            "Referer": referer,
        }
        last = ""
        for attempt in range(retries + 1):
            try:
                async with asyncio.timeout(25):
                    async with self._session.get(url, headers=headers) as resp:
                        if resp.status == 204:
                            return None
                        if resp.status >= 400:
                            last = f"HTTP {resp.status} {resp.reason}"
                            if resp.status in (400, 404):
                                break
                        else:
                            return await resp.json(content_type=None)
            except (aiohttp.ClientError, TimeoutError, ValueError) as err:
                last = f"{type(err).__name__}: {err}"
            await asyncio.sleep(1.0 * (attempt + 1))
        raise SourceError(last or "unknown error")

    # Allwyn ---------------------------------------------------------------
    async def last_and_active(self) -> tuple[dict | None, dict | None]:
        """(last draw with results, upcoming draw) from Allwyn."""
        data = await self._get_json(f"{ALLWYN_BASE}/last-result-and-active", ALLWYN_REFERER)
        data = data or {}
        return parse_allwyn(data.get("last")), parse_allwyn_active(data.get("active"))

    async def allwyn_range(self, start: date, end: date) -> list[dict]:
        """All draws between two dates (inclusive), queried month by month."""
        ids: list[int] = []
        cur = date(start.year, start.month, 1)
        while cur <= end:
            nxt = date(cur.year + (cur.month // 12), cur.month % 12 + 1, 1)
            last = nxt - timedelta(days=1)
            ids.extend(await self._get_json(
                f"{ALLWYN_BASE}/draw-date/{cur.isoformat()}/{last.isoformat()}/draw-id", ALLWYN_REFERER) or [])
            cur = nxt
        draws = []
        for draw_id in ids:
            d = parse_allwyn(await self._get_json(f"{ALLWYN_BASE}/{draw_id}", ALLWYN_REFERER))
            if d and start.isoformat() <= d["date"] <= end.isoformat():
                draws.append(d)
        return draws

    # official -------------------------------------------------------------
    async def official_day(self, day: date) -> dict | None:
        return parse_official(await self._get_json(OFFICIAL_URL.format(d=day.isoformat()), OFFICIAL_REFERER))
