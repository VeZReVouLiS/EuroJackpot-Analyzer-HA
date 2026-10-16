"""Constants for the EuroJackpot integration."""
from __future__ import annotations

DOMAIN = "eurojackpot_analyzer"
NAME = "EuroJackpot Analyzer"

CONF_SCAN_INTERVAL = "scan_interval"      # minutes
CONF_PRICE = "price_per_column"
CONF_NOTIFY = "notify_service"             # e.g. notify.mobile_app_my_phone (empty = no notifications)
CONF_JACKPOT_MIN = "jackpot_threshold"     # million EUR, 0 = no jackpot alert
CONF_TOKEN = "github_token"                # optional: read (and write) the tickets synced through the user's gist

DEFAULT_SCAN_INTERVAL = 30
DEFAULT_PRICE = 2.5                        # EUR per column in Greece (2.00 + 0.50 add-on)
MAX_COLUMNS = 12

ALGORITHMS = ["random", "hot", "cold", "overdue", "weighted", "balanced", "smart"]
AUTO_TICKET = "auto_ticket"                # one random algorithm for the whole ticket
AUTO_COLUMN = "auto_column"                # a random algorithm for every column
PERIODS = ["all", "10y", "5y", "3y", "1y", "last_100", "last_50"]

ALLWYN_BASE = "https://api.opap.gr/draws/v3.0/5149"
ALLWYN_REFERER = "https://www.allwyn.gr/"
OFFICIAL_URL = (
    "https://www.eurojackpot.com/wlinfo/WL_InfoService"
    "?client=jsn&gruppe=ZahlenUndQuoten&spielart=EJ&adg=ja&datum={d}"
)
OFFICIAL_REFERER = "https://www.eurojackpot.com/"
ALLWYN_FIRST_DATE = "2024-03-08"           # Greek draws exist since then

# Allwyn prize category id -> tier (same order as the official classes)
TIERS = {1: "5+2", 2: "5+1", 3: "5+0", 4: "4+2", 5: "4+1", 6: "3+2", 7: "4+0", 8: "2+2",
         9: "3+1", 10: "3+0", 11: "1+2", 12: "2+1"}
GREEK_ADDON_TIER = "1+1"
