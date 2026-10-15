"""Pure parsing of the two data sources (no Home Assistant imports, easy to unit-test)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .const import GREEK_ADDON_TIER, TIERS


def parse_allwyn(draw: dict | None) -> dict | None:
    """One Allwyn draw -> {'date','main','euro','draw_number','classes','columns_gr','columns_all'}."""
    if not draw or draw.get("status") != "results":
        return None
    wn = draw.get("winningNumbers") or {}
    main, euro = wn.get("list") or [], wn.get("bonus") or []
    if len(main) != 5 or len(euro) != 2:
        return None
    # draws are held ~21:00 Greek/Finnish time (UTC+2/+3): +3h keeps the right calendar day
    dt = datetime.fromtimestamp(draw["drawTime"] / 1000, tz=timezone.utc) + timedelta(hours=3)
    classes = []
    for p in draw.get("prizeCategories") or []:
        cid = p.get("id")
        if p.get("gameType") == "EJKAddon" or cid == 13:
            classes.append({"tier": GREEK_ADDON_TIER, "winners": int(p.get("winners") or 0),
                            "winners_gr": int(p.get("winners") or 0), "prize": float(p.get("divident") or 0),
                            "greek_only": True})
        elif cid in TIERS:
            classes.append({"tier": TIERS[cid], "winners": int(p.get("winnersAll") or 0),
                            "winners_gr": int(p.get("winners") or 0), "prize": float(p.get("divident") or 0)})
    ws = draw.get("wagerStatistics") or {}
    return {"date": dt.date().isoformat(), "main": sorted(main), "euro": sorted(euro),
            "draw_number": draw.get("drawId"), "classes": classes,
            "columns_gr": ws.get("columns"), "columns_all": ws.get("totalColumnsAll")}


def parse_allwyn_active(active: dict | None) -> dict | None:
    """The upcoming draw: time (UTC), number and jackpot."""
    if not active or "drawTime" not in active:
        return None
    jackpot = None
    for p in active.get("prizeCategories") or []:
        if p.get("id") == 1:
            jackpot = float(p.get("jackpot") or 0) or None
    return {"draw_time": datetime.fromtimestamp(active["drawTime"] / 1000, tz=timezone.utc),
            "draw_number": active.get("drawId"), "jackpot": jackpot}


def parse_official(payload: dict | None) -> dict | None:
    """Official eurojackpot.com JSON (one draw date) -> same shape as parse_allwyn (without Greek data)."""
    if not payload or payload.get("error") or "head" not in payload:
        return None
    try:
        rows = payload["zahlen"]["hauptlotterie"]["ziehungen"]
        main = [int(x) for x in rows[0]["zahlen"]]
        euro = [int(x) for x in rows[1]["zahlen"]]
        date_str = payload["head"]["datum"]
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    if len(main) != 5 or len(euro) != 2:
        return None
    classes = []
    try:
        for r in payload["auswertung"]["quoten"]["hauptlotterie"]["ziehungen"][0]["gewinnklassen"]:
            classes.append({"tier": str(r.get("kurzbeschreibung", "")).replace(" ", ""),
                            "winners": int(r.get("anzahl") or 0), "winners_gr": None,
                            "prize": float(r.get("quote") or 0)})
    except (KeyError, IndexError, TypeError, ValueError):
        classes = []
    return {"date": date_str, "main": sorted(main), "euro": sorted(euro), "draw_number": None,
            "classes": classes, "columns_gr": None, "columns_all": None}
