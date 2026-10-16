"""Pure helpers for the synced tickets and the alerts (no Home Assistant imports): which tickets a draw decides, what the
notification messages say."""
from __future__ import annotations

from .core import evaluation, ticket_sync

MESSAGES = {
    "el": {
        "new_draw": "Κλήρωση {date}: {numbers}",
        "jackpot": "Το τζάκποτ του EuroJackpot είναι {amount} εκατ. € ({date})",
        "win": "Δελτίο για {date}: κέρδη σε {cols} από {total} στήλες, σύνολο {prize}",
        "win_unknown": "Δελτίο για {date}: κέρδη σε {cols} από {total} στήλες",
        "none": "Δελτίο για {date}: καμία κερδισμένη στήλη",
        "title": "EuroJackpot",
    },
    "en": {
        "new_draw": "Draw {date}: {numbers}",
        "jackpot": "The EuroJackpot jackpot is {amount} million € ({date})",
        "win": "Ticket for {date}: {cols} of {total} columns won, total {prize}",
        "win_unknown": "Ticket for {date}: {cols} of {total} columns won",
        "none": "Ticket for {date}: no winning column",
        "title": "EuroJackpot",
    },
    "de": {
        "new_draw": "Ziehung {date}: {numbers}",
        "jackpot": "Der EuroJackpot beträgt {amount} Mio. € ({date})",
        "win": "Schein für {date}: {cols} von {total} Reihen gewonnen, Summe {prize}",
        "win_unknown": "Schein für {date}: {cols} von {total} Reihen gewonnen",
        "none": "Schein für {date}: keine Gewinnreihe",
        "title": "EuroJackpot",
    },
}


def text(lang: str, key: str, **kw) -> str:
    table = MESSAGES.get((lang or "en")[:2], MESSAGES["en"])
    return table[key].format(**kw)


def draw_for(rows: list[list], date: str) -> dict | None:
    """The draw of `date` as the evaluation expects it (with the prize table when the history has it)."""
    for r in rows:
        if r[0] == date:
            d = {"date": r[0], "main": r[1], "euro": r[2]}
            if len(r) > 3 and r[3]:
                d["details"] = {"classes": [{"tier": t, "prize": p} for t, p in r[3].items()]}
            return d
    return None


def pending_results(tickets: list[dict], rows: list[list], done: set[str]) -> list[dict]:
    """Results of the played tickets whose draw is in the history and that were not reported yet.

    `done` holds `uid|date` keys of what was reported. Every item: {key, uid, date, result}.
    """
    out = []
    for t in tickets:
        if not t.get("played"):
            continue
        uid = ticket_sync.uid_of(t)
        key = f"{uid}|{t['target_date']}"
        if key in done:
            continue
        draw = draw_for(rows, t["target_date"])
        if not draw:
            continue
        cols = [{"main": c["main"], "euro": c["euro"]} for c in t.get("columns") or []]
        if not cols:
            continue
        out.append({"key": key, "uid": uid, "date": t["target_date"], "result": evaluation.evaluate_ticket(cols, draw)})
    return out


def result_message(lang: str, item: dict) -> str:
    r = item["result"]
    n = r["winning_columns"]
    if not n:
        return text(lang, "none", date=item["date"])
    if r["complete"]:
        return text(lang, "win", date=item["date"], cols=n, total=len(r["columns"]), prize=f"{r['total_prize']:,.2f} €")
    return text(lang, "win_unknown", date=item["date"], cols=n, total=len(r["columns"]))


def jackpot_due(jackpot: float | None, threshold_millions: float, draw_time: str, alerted_for: str | None) -> bool:
    """One alert per draw when the jackpot reaches the threshold (0 = off)."""
    return bool(jackpot and threshold_millions > 0 and jackpot >= threshold_millions * 1_000_000 and alerted_for != draw_time)


def parse_columns(text_in: str) -> list[dict]:
    """'5 12 23 34 45 + 3 7; 1 2 3 4 5 + 1 2' -> [{main, euro}, ...]. Raises ValueError with a readable message."""
    cols = []
    for part in [p for p in text_in.replace("\n", ";").split(";") if p.strip()]:
        left, _, right = part.partition("+")
        try:
            main = sorted(int(x) for x in left.replace(",", " ").split())
            euro = sorted(int(x) for x in right.replace(",", " ").split())
        except ValueError as err:
            raise ValueError(f"Not a number in: {part.strip()}") from err
        if len(main) != 5 or len(set(main)) != 5 or not all(1 <= n <= 50 for n in main):
            raise ValueError(f"A column needs 5 different main numbers 1-50: {part.strip()}")
        if len(euro) != 2 or len(set(euro)) != 2 or not all(1 <= n <= 12 for n in euro):
            raise ValueError(f"A column needs 2 different Euro numbers 1-12: {part.strip()}")
        cols.append({"main": main, "euro": euro})
    if not cols:
        raise ValueError("No columns given.")
    if len(cols) > 12:
        raise ValueError("At most 12 columns.")
    return cols
