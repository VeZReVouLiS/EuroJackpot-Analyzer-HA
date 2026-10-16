/*
 * EuroJackpot Analyzer - frontend (served and registered automatically by the integration).
 *
 *   Sidebar panel       eurojackpot-analyzer-panel        full screen, scales with the window, country + language menus
 *   Lovelace cards      custom:eurojackpot-analyzer-last-draw-card | -stats-card | -ticket-card | -my-tickets-card
 *
 * Plain custom elements, no framework and no build step. Everything is sized in `em`, so the panel can
 * scale the whole UI just by changing its font size, and the cards use container queries so they adapt
 * to the width of whatever holds them.
 *
 * Country (Greece / Germany) decides how the last draw is presented (Allwyn style or the official
 * eurojackpot.com style); language (el / en / de) decides the texts. Both are chosen in the panel, remembered
 * in this browser, and can be fixed on a card with `country:` / `language:`.
 */
const EJ_VERSION = "0.5.0";
const DOMAIN = "eurojackpot_analyzer";
const ASSETS = window.EJ_ASSETS || `/${DOMAIN}/assets`;     // EJ_ASSETS: only the offline preview sets it
const ID = {
  last: `sensor.${DOMAIN}_last_draw`,
  next: `sensor.${DOMAIN}_next_draw`,
  jackpot: `sensor.${DOMAIN}_jackpot`,
  overdue: `sensor.${DOMAIN}_most_overdue_numbers`,
  frequent: `sensor.${DOMAIN}_most_frequent_numbers`,
  rare: `sensor.${DOMAIN}_least_frequent_numbers`,
  ticket: `sensor.${DOMAIN}_generated_ticket`,
  myTickets: `sensor.${DOMAIN}_my_tickets`,
};
const REPO_HA = "https://github.com/VeZReVouLiS/EuroJackpot-Analyzer-HA";
const REPO_APP = "https://github.com/VeZReVouLiS/EuroJackpot-Analyzer";
const WEB_APP = "https://vezrevoulis.github.io/EuroJackpot-Analyzer/";
const LANGS = ["el", "en", "de"];
const LOCALES = { el: "el-GR", en: "en-GB", de: "de-DE" };

/* the user's choices (menus in the panel, remembered in this browser) beat the Home Assistant settings */
const LANG_KEY = "eurojackpot_analyzer_lang";
const COUNTRY_KEY = "eurojackpot_analyzer_country";
const getPref = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
const ALL_ELEMENTS = new Set();

/* country / language catalogue (countries.json, shared with the Windows app) */
let CAT = null;
fetch(`${ASSETS}/countries.json`).then((r) => r.json()).then((j) => {
  CAT = j;
  for (const el of ALL_ELEMENTS) if (el.relang) el.relang();
}).catch(() => { /* flags and the German layout are optional: the UI works without them */ });
const supportedCountry = (code) => (CAT ? CAT.countries.find((c) => c.code === code && c.supported) : null);
const flag = (f) => `<img class="flag" src="${ASSETS}/flags/${f}.svg" alt="">`;

const TEXT = {
  el: {
    last: "Τελευταία κλήρωση", next: "Επόμενη κλήρωση", jackpot: "Τζάκποτ", draw: "Κλήρωση",
    tier: "Κατηγορία", winners: "Επιτυχίες", greece: "Ελλάδα", prize: "Κέρδος", greekOnly: "μόνο Ελλάδα",
    columnsGr: "στήλες Ελλάδας", noData: "Δεν υπάρχουν δεδομένα ακόμα",
    cls: "Κατηγορία", match: "Επιτυχίες", winnersN: "Νικητές", prizeWinner: "Κέρδος ανά νικητή",
    sales: "Συνολικός τζίρος", where: "Πού κερδήθηκε", whereHint: "Η επίσημη πηγή δίνει τον τόπο των νικητών μόνο για τις 3 πρώτες κατηγορίες.",
    noWinner: "κανένας νικητής",
    cd: { d: "ημέρες", h: "ώρες", m: "λεπτά", s: "δευτερόλεπτα" },
    heat: "Χάρτης καθυστέρησης", heatHint: "Πόσες κληρώσεις έχουν περάσει από την τελευταία εμφάνιση κάθε αριθμού",
    overdue: "Καθυστερούν περισσότερο", frequent: "Συχνότεροι", rare: "Σπανιότεροι", euro: "Αριθμοί Euro",
    since: "κλήρ.", analysed: "κληρώσεις στην ανάλυση",
    tipNum: (n, g, c, p) => `Αριθμός ${n}: ${g} κληρώσεις χωρίς εμφάνιση · βγήκε ${c} φορές (${p}%)`,
    ticket: "Δελτίο", columns: "Στήλες", algorithm: "Αλγόριθμος", generate: "Δημιούργησε δελτίο",
    perColumn: "ανά στήλη", column: "Στήλη", total: "Σύνολο δελτίου",
    empty: "Διάλεξε στήλες και αλγόριθμο και πάτα «Δημιούργησε δελτίο».",
    generating: "Δημιουργία…", disclaimer: "Η κλήρωση είναι τυχαία· τα στατιστικά δεν αυξάνουν τις πιθανότητες. Παίξε υπεύθυνα (18+).",
    refresh: "Ανανέωση", language: "Γλώσσα", country: "Χώρα", panelSub: "Κληρώσεις · Στατιστικά · Δελτία",
    algos: {
      auto_ticket: "Αυτόματος - ένας ανά δελτίο", auto_column: "Αυτόματος - ένας ανά στήλη", random: "Καθαρά τυχαίος",
      hot: "Συχνοί (hot)", cold: "Σπάνιοι (cold)", overdue: "Καθυστερημένοι", weighted: "Σταθμισμένος",
      balanced: "Ισορροπημένος", smart: "Έξυπνη κατανομή",
    },
    short: { random: "Τυχαίος", hot: "Hot", cold: "Cold", overdue: "Καθυστ.", weighted: "Σταθμ.", balanced: "Ισορρ.", smart: "Έξυπνος" },
  },
  en: {
    last: "Last draw", next: "Next draw", jackpot: "Jackpot", draw: "Draw",
    tier: "Tier", winners: "Winners", greece: "Greece", prize: "Prize", greekOnly: "Greece only",
    columnsGr: "Greek columns", noData: "No data yet",
    cls: "Class", match: "Match", winnersN: "Winners", prizeWinner: "Prize per winner",
    sales: "Total sales", where: "Where the winners are", whereHint: "The official source gives the location of the winners for the top 3 classes only.",
    noWinner: "no winner",
    cd: { d: "days", h: "hours", m: "minutes", s: "seconds" },
    heat: "Overdue map", heatHint: "Draws since each number last came out",
    overdue: "Most overdue", frequent: "Most frequent", rare: "Least frequent", euro: "Euro numbers",
    since: "draws", analysed: "draws analysed",
    tipNum: (n, g, c, p) => `Number ${n}: ${g} draws since last seen · drawn ${c} times (${p}%)`,
    ticket: "Ticket", columns: "Columns", algorithm: "Algorithm", generate: "Generate ticket",
    perColumn: "per column", column: "Column", total: "Ticket total",
    empty: "Pick the columns and an algorithm, then press “Generate ticket”.",
    generating: "Generating…", disclaimer: "Draws are random; statistics do not improve your odds. Play responsibly (18+).",
    refresh: "Refresh", language: "Language", country: "Country", panelSub: "Draws · Statistics · Tickets",
    algos: {
      auto_ticket: "Automatic - one per ticket", auto_column: "Automatic - one per column", random: "Pure random",
      hot: "Hot numbers", cold: "Cold numbers", overdue: "Overdue numbers", weighted: "Frequency-weighted",
      balanced: "Balanced", smart: "Smart shape",
    },
    short: { random: "Random", hot: "Hot", cold: "Cold", overdue: "Overdue", weighted: "Weighted", balanced: "Balanced", smart: "Smart" },
  },
  de: {
    last: "Letzte Ziehung", next: "Nächste Ziehung", jackpot: "Jackpot", draw: "Ziehung",
    tier: "Klasse", winners: "Gewinner", greece: "Griechenland", prize: "Gewinn", greekOnly: "nur Griechenland",
    columnsGr: "griechische Felder", noData: "Noch keine Daten",
    cls: "Klasse", match: "Treffer", winnersN: "Gewinner", prizeWinner: "Gewinn pro Gewinner",
    sales: "Gesamtumsatz", where: "Wo wurde gewonnen", whereHint: "Die offizielle Quelle nennt den Ort der Gewinner nur für die ersten 3 Gewinnklassen.",
    noWinner: "kein Gewinner",
    cd: { d: "Tage", h: "Stunden", m: "Minuten", s: "Sekunden" },
    heat: "Überfälligkeits-Karte", heatHint: "Ziehungen seit dem letzten Erscheinen jeder Zahl",
    overdue: "Am längsten überfällig", frequent: "Am häufigsten", rare: "Am seltensten", euro: "Eurozahlen",
    since: "Zieh.", analysed: "Ziehungen analysiert",
    tipNum: (n, g, c, p) => `Zahl ${n}: ${g} Ziehungen seit dem letzten Mal · ${c}-mal gezogen (${p} %)`,
    ticket: "Spielschein", columns: "Felder", algorithm: "Algorithmus", generate: "Spielschein erstellen",
    perColumn: "pro Feld", column: "Feld", total: "Summe Spielschein",
    empty: "Wähle Felder und einen Algorithmus und klicke auf „Spielschein erstellen“.",
    generating: "Wird erstellt …", disclaimer: "Die Ziehung ist zufällig; Statistiken erhöhen die Gewinnchancen nicht. Spiele verantwortungsvoll (ab 18).",
    refresh: "Aktualisieren", language: "Sprache", country: "Land", panelSub: "Ziehungen · Statistik · Spielscheine",
    algos: {
      auto_ticket: "Automatisch - einer pro Schein", auto_column: "Automatisch - einer pro Feld", random: "Reiner Zufall",
      hot: "Heiße Zahlen", cold: "Kalte Zahlen", overdue: "Überfällige Zahlen", weighted: "Nach Häufigkeit gewichtet",
      balanced: "Ausgewogen", smart: "Intelligentes Muster",
    },
    short: { random: "Zufall", hot: "Heiß", cold: "Kalt", overdue: "Überfällig", weighted: "Gewichtet", balanced: "Ausgewogen", smart: "Intelligent" },
  },
};
const TEXT2 = {
 "el": {
  "my": "Τα δελτία μου",
  "noTickets": "Δεν υπάρχουν δελτία ακόμα. Φτιάξε ένα στο «Δελτίο» με «Αποθήκευση στα δελτία μου».",
  "syncHint": "Για να δεις τα δελτία από τις εφαρμογές σου, βάλε το token GitHub του συγχρονισμού στις Επιλογές της ενσωμάτωσης. Δελτία που φτιάχνεις εδώ με «Αποθήκευση στα δελτία μου» εμφανίζονται κι εδώ.",
  "played": "παίχτηκε",
  "notPlayed": "δεν παίχτηκε",
  "analyze": "Ανάλυση",
  "analyzing": "Υπολογισμός…",
  "close": "Κλείσιμο",
  "save": "Αποθήκευση στα δελτία μου",
  "resNone": "καμία κερδισμένη στήλη",
  "resPending": "περιμένει την κλήρωση",
  "resWon": "κέρδη σε {n} από {tot} στήλες",
  "resWonSum": "σύνολο {sum}",
  "resTotal": "{n} δελτία",
  "syncOff": "χωρίς συγχρονισμό",
  "syncedAt": "Συγχρονισμός",
  "about": "Σχετικά",
  "aboutHowto": "Οδηγίες χρήσης",
  "aboutSources": "Πηγές δεδομένων",
  "aboutCredits": "Credits",
  "aboutLinks": "Σύνδεσμοι",
  "aboutGuide": "Πίνακας|Η πλαϊνή μπάρα «EuroJackpot Analyzer» δείχνει την τελευταία κλήρωση, τα στατιστικά και τα δελτία. Χώρα και γλώσσα αλλάζουν από τα μενού πάνω δεξιά.\nΚάρτες|Πρόσθεσε στον πίνακα ελέγχου: custom:eurojackpot-analyzer-last-draw-card, -stats-card, -ticket-card και -my-tickets-card.\nΔελτίο|Διάλεξε στήλες και αλγόριθμο και πάτα «Δημιούργησε δελτίο». Με το «Αποθήκευση στα δελτία μου» μπαίνει στη λίστα και συγχρονίζεται με τις εφαρμογές.\nΤα δελτία μου|Δελτία από τις εφαρμογές: Ρυθμίσεις > Συσκευές και υπηρεσίες > EuroJackpot Analyzer > Επιλογές > token GitHub (το ίδιο με τον συγχρονισμό δελτίων). Πάτα «Ανάλυση» για πιθανότητες και έλεγχο ιστορικού.\nΕιδοποιήσεις|Στις Επιλογές όρισε υπηρεσία notify και όριο τζάκποτ. Για αυτοματισμούς: γεγονότα eurojackpot_analyzer_new_draw, _jackpot_alert και _ticket_result.\nΥπηρεσίες|generate_ticket, analyze_ticket και sync_tickets (Εργαλεία προγραμματιστή > Υπηρεσίες).",
  "aboutSourcesText": "Επίσημη υπηρεσία του EuroJackpot (eurojackpot.com): κληρώσεις από το 2012, επιτυχίες, κέρδη και πού κερδήθηκαν.\nAllwyn (api.opap.gr): ελληνικά στοιχεία από το 2024 και τζάκποτ.",
  "aboutCreditsText": "Δημιουργός: VeZReVouLiS, με τη βοήθεια του Claude (Anthropic).\nΣημαίες: flag-icons (MIT).",
  "aboutRepo": "Σελίδα του έργου (Home Assistant)",
  "aboutApps": "Εφαρμογές Windows, Mac, Android",
  "aboutWeb": "Εφαρμογή web / iPhone",
  "aboutDisclaimer": "Ανεπίσημο εργαλείο, χωρίς σύνδεση με την Allwyn ή το EuroJackpot. Η κλήρωση είναι τυχαία και τα στατιστικά δεν αυξάνουν τις πιθανότητες νίκης. Παίξε υπεύθυνα (18+).",
  "an": {
   "title": "Ανάλυση δελτίου",
   "overall": "Σύνολο δελτίου",
   "cost": "Κόστος ανά κλήρωση",
   "pAny": "Πιθανότητα για κάποιο βραβείο",
   "odds": "περίπου 1 στις {n}",
   "jackpot": "Πιθανότητα τζάκποτ (5 + 2)",
   "expected": "Αναμενόμενο κέρδος (χωρίς τζάκποτ)",
   "net": "Αναμενόμενη διαφορά",
   "tiers": "Πιθανότητες ανά κατηγορία (για μία στήλη)",
   "thTier": "Κατηγορία",
   "thP": "Πιθανότητα",
   "thOdds": "1 στις",
   "thPrize": "Μέσο βραβείο",
   "column": "Στήλη",
   "freq": "Συχνότητα αριθμών: {x}× του μέσου όρου",
   "gap": "Μέση καθυστέρηση: {n} κληρώσεις",
   "shape": "{odd} μονοί / {even} ζυγοί, {low} χαμηλοί / {high} υψηλοί, άθροισμα {sum}",
   "typical": "Τυπικό σχήμα",
   "untypical": "Ασυνήθιστο σχήμα",
   "hot": "Πιο συχνοί: {a}",
   "overdue": "Πιο καθυστερημένοι: {a}",
   "histWin": "Στο ιστορικό θα είχε κερδίσει σε {n} από {d} κληρώσεις. Καλύτερη κατηγορία: {best}.",
   "histTotal": "Σύνολο κερδών {won} για κόστος {cost}.",
   "histNever": "Στο ιστορικό δεν θα είχε κερδίσει σε καμία κλήρωση.",
   "histUnknown": "Σε παλιές κληρώσεις χωρίς στοιχεία κερδών το ποσό δεν υπολογίζεται.",
   "histAll": "Όλες οι στήλες μαζί στο ιστορικό: κέρδη {won} για κόστος {cost}.",
   "assumption": "Το αναμενόμενο κέρδος βασίζεται στον μέσο όρο των πραγματικών βραβείων από το 2022.",
   "disclaimer": "Εκτίμηση μόνο για ενημέρωση. Η κλήρωση είναι τυχαία: κάθε στήλη έχει ακριβώς τις ίδιες πιθανότητες και το παρελθόν δεν προβλέπει το μέλλον. Δεν αποτελεί πρόβλεψη ή εγγύηση κέρδους. Παίξε υπεύθυνα (18+)."
  }
 },
 "en": {
  "my": "My tickets",
  "noTickets": "No tickets yet. Make one in “Ticket” with “Save to my tickets”.",
  "syncHint": "To see the tickets of your apps, put the GitHub token of the ticket sync into the options of the integration. Tickets you make here with “Save to my tickets” show up here too.",
  "played": "played",
  "notPlayed": "not played",
  "analyze": "Analysis",
  "analyzing": "Calculating…",
  "close": "Close",
  "save": "Save to my tickets",
  "resNone": "no winning column",
  "resPending": "waiting for the draw",
  "resWon": "{n} of {tot} columns won",
  "resWonSum": "total {sum}",
  "resTotal": "{n} tickets",
  "syncOff": "no sync",
  "syncedAt": "Synced",
  "about": "About",
  "aboutHowto": "How to use",
  "aboutSources": "Data sources",
  "aboutCredits": "Credits",
  "aboutLinks": "Links",
  "aboutGuide": "Panel|The “EuroJackpot Analyzer” sidebar entry shows the last draw, the statistics and the tickets. Country and language are chosen in the menus at the top right.\nCards|Add to a dashboard: custom:eurojackpot-analyzer-last-draw-card, -stats-card, -ticket-card and -my-tickets-card.\nTicket|Choose the columns and an algorithm and press “Generate ticket”. With “Save to my tickets” it goes into the list and syncs with the apps.\nMy tickets|Tickets from the apps: Settings > Devices & services > EuroJackpot Analyzer > Configure > GitHub token (the same as the ticket sync). Press “Analysis” for the odds and a history check.\nNotifications|In the options set a notify service and a jackpot limit. For automations: the events eurojackpot_analyzer_new_draw, _jackpot_alert and _ticket_result.\nServices|generate_ticket, analyze_ticket and sync_tickets (Developer tools > Actions).",
  "aboutSourcesText": "Official EuroJackpot service (eurojackpot.com): draws since 2012, winners, prizes and where they were won.\nAllwyn (api.opap.gr): Greek figures since 2024 and the jackpot.",
  "aboutCreditsText": "Author: VeZReVouLiS, with the help of Claude (Anthropic).\nFlags: flag-icons (MIT).",
  "aboutRepo": "Project page (Home Assistant)",
  "aboutApps": "Windows, Mac, Android apps",
  "aboutWeb": "Web app / iPhone",
  "aboutDisclaimer": "An unofficial tool, not connected to Allwyn or EuroJackpot. Draws are random and statistics do not improve your odds. Play responsibly (18+).",
  "an": {
   "title": "Ticket analysis",
   "overall": "Whole ticket",
   "cost": "Cost per draw",
   "pAny": "Chance of some prize",
   "odds": "about 1 in {n}",
   "jackpot": "Jackpot chance (5 + 2)",
   "expected": "Expected prize (without the jackpot)",
   "net": "Expected difference",
   "tiers": "Chances per class (for one column)",
   "thTier": "Class",
   "thP": "Chance",
   "thOdds": "1 in",
   "thPrize": "Average prize",
   "column": "Column",
   "freq": "Frequency of the numbers: {x}× the average",
   "gap": "Average gap: {n} draws",
   "shape": "{odd} odd / {even} even, {low} low / {high} high, sum {sum}",
   "typical": "Typical shape",
   "untypical": "Unusual shape",
   "hot": "Most frequent: {a}",
   "overdue": "Most overdue: {a}",
   "histWin": "In history it would have won in {n} of {d} draws. Best class: {best}.",
   "histTotal": "Total winnings {won} for a cost of {cost}.",
   "histNever": "In history it would not have won in any draw.",
   "histUnknown": "For old draws without prize data the amount cannot be calculated.",
   "histAll": "All columns together in history: winnings {won} for a cost of {cost}.",
   "assumption": "The expected prize is based on the average of the real prizes since 2022.",
   "disclaimer": "An estimate for information only. Draws are random: every column has exactly the same chances and the past does not predict the future. This is not a prediction or a guarantee of winnings. Play responsibly (18+)."
  }
 },
 "de": {
  "my": "Meine Scheine",
  "noTickets": "Noch keine Scheine. Erstelle einen unter „Spielschein“ mit „In Meine Scheine speichern“.",
  "syncHint": "Um die Scheine deiner Apps zu sehen, trage das GitHub-Token der Schein-Synchronisierung in die Optionen der Integration ein. Scheine, die du hier mit „In Meine Scheine speichern“ erstellst, erscheinen auch hier.",
  "played": "gespielt",
  "notPlayed": "nicht gespielt",
  "analyze": "Analyse",
  "analyzing": "Berechne …",
  "close": "Schließen",
  "save": "In Meine Scheine speichern",
  "resNone": "keine Gewinnreihe",
  "resPending": "wartet auf die Ziehung",
  "resWon": "{n} von {tot} Reihen gewonnen",
  "resWonSum": "Summe {sum}",
  "resTotal": "{n} Scheine",
  "syncOff": "keine Synchronisierung",
  "syncedAt": "Synchronisiert",
  "about": "Info",
  "aboutHowto": "Anleitung",
  "aboutSources": "Datenquellen",
  "aboutCredits": "Credits",
  "aboutLinks": "Links",
  "aboutGuide": "Panel|Der Eintrag „EuroJackpot Analyzer“ in der Seitenleiste zeigt die letzte Ziehung, die Statistik und die Scheine. Land und Sprache wählst du in den Menüs oben rechts.\nKarten|Zum Dashboard hinzufügen: custom:eurojackpot-analyzer-last-draw-card, -stats-card, -ticket-card und -my-tickets-card.\nSpielschein|Wähle Felder und einen Algorithmus und klicke auf „Spielschein erstellen“. Mit „In Meine Scheine speichern“ kommt er in die Liste und wird mit den Apps synchronisiert.\nMeine Scheine|Scheine aus den Apps: Einstellungen > Geräte & Dienste > EuroJackpot Analyzer > Konfigurieren > GitHub-Token (dasselbe wie bei der Schein-Synchronisierung). Klicke auf „Analyse“ für die Chancen und eine Verlaufsprüfung.\nBenachrichtigungen|Lege in den Optionen einen Notify-Dienst und eine Jackpot-Grenze fest. Für Automatisierungen: die Ereignisse eurojackpot_analyzer_new_draw, _jackpot_alert und _ticket_result.\nDienste|generate_ticket, analyze_ticket und sync_tickets (Entwicklerwerkzeuge > Aktionen).",
  "aboutSourcesText": "Offizieller EuroJackpot-Dienst (eurojackpot.com): Ziehungen seit 2012, Gewinner, Gewinne und wo gewonnen wurde.\nAllwyn (api.opap.gr): griechische Zahlen seit 2024 und der Jackpot.",
  "aboutCreditsText": "Autor: VeZReVouLiS, mit Unterstützung von Claude (Anthropic).\nFlaggen: flag-icons (MIT).",
  "aboutRepo": "Projektseite (Home Assistant)",
  "aboutApps": "Apps für Windows, Mac, Android",
  "aboutWeb": "Web-App / iPhone",
  "aboutDisclaimer": "Ein inoffizielles Werkzeug ohne Verbindung zu Allwyn oder EuroJackpot. Die Ziehung ist zufällig und Statistiken erhöhen die Gewinnchancen nicht. Spiele verantwortungsvoll (ab 18).",
  "an": {
   "title": "Analyse des Spielscheins",
   "overall": "Ganzer Schein",
   "cost": "Kosten pro Ziehung",
   "pAny": "Chance auf irgendeinen Gewinn",
   "odds": "etwa 1 zu {n}",
   "jackpot": "Jackpot-Chance (5 + 2)",
   "expected": "Erwarteter Gewinn (ohne Jackpot)",
   "net": "Erwartete Differenz",
   "tiers": "Chancen pro Klasse (für ein Feld)",
   "thTier": "Klasse",
   "thP": "Chance",
   "thOdds": "1 zu",
   "thPrize": "Ø Gewinn",
   "column": "Feld",
   "freq": "Häufigkeit der Zahlen: {x}× des Durchschnitts",
   "gap": "Durchschnittliche Pause: {n} Ziehungen",
   "shape": "{odd} ungerade / {even} gerade, {low} niedrig / {high} hoch, Summe {sum}",
   "typical": "Typisches Muster",
   "untypical": "Ungewöhnliches Muster",
   "hot": "Am häufigsten: {a}",
   "overdue": "Am längsten überfällig: {a}",
   "histWin": "In der Historie hätte es in {n} von {d} Ziehungen gewonnen. Beste Klasse: {best}.",
   "histTotal": "Gewinne insgesamt {won} bei Kosten von {cost}.",
   "histNever": "In der Historie hätte es in keiner Ziehung gewonnen.",
   "histUnknown": "Für alte Ziehungen ohne Gewinndaten kann der Betrag nicht berechnet werden.",
   "histAll": "Alle Felder zusammen in der Historie: Gewinne {won} bei Kosten von {cost}.",
   "assumption": "Der erwartete Gewinn basiert auf dem Durchschnitt der tatsächlichen Gewinne seit 2022.",
   "disclaimer": "Eine Schätzung nur zur Information. Die Ziehung ist zufällig: Jedes Feld hat genau die gleichen Chancen und die Vergangenheit sagt die Zukunft nicht voraus. Das ist weder eine Vorhersage noch eine Gewinngarantie. Spiele verantwortungsvoll (ab 18)."
  }
 }
};
for (const l of LANGS) Object.assign(TEXT[l], TEXT2[l]);
const fill = (str, v) => String(str).replace(/\{(\w+)\}/g, (_, k) => (v[k] == null ? "" : v[k]));
const normLang = (l) => { l = String(l || "").toLowerCase().slice(0, 2); return LANGS.includes(l) ? l : "en"; };

const STYLE = `
:host { display: block; }
ha-card { position: relative; overflow: hidden; color: var(--primary-text-color); }
.wrap { padding: 1.15em; container-type: inline-size; }
.head { display: flex; align-items: center; gap: .85em; flex-wrap: wrap; justify-content: space-between; }
.title { display: flex; align-items: center; gap: .85em; min-width: 0; }
.logo { display: grid; place-items: center; width: 2.9em; height: 2.9em; border-radius: .85em; font-size: 1em; flex: none;
  background: linear-gradient(135deg, #2a3a55, #0d1328); border: 1.5px solid #5b6b88; box-shadow: 0 .4em 1.2em rgba(56,150,255,.3); }
.logo span { font-size: 1.5em; line-height: 1; }
.logo img { width: 84%; height: auto; display: block; }
.logo.big { width: 3.7em; height: 3.7em; border-radius: 1em; }
.logo svg { width: 84%; height: auto; display: block; }
.when { font-size: 1.5em; line-height: 1.25; color: var(--secondary-text-color); }
.when b { color: var(--primary-text-color); font-weight: 800; }
.title b { display: block; font-size: 1.2em; line-height: 1.2; }
.sub { color: var(--secondary-text-color); font-size: .88em; }
.hero { background: linear-gradient(135deg, rgba(124,92,255,.22), rgba(34,211,238,.10)); border-bottom: 1px solid var(--divider-color); }
.balls { display: flex; flex-wrap: wrap; align-items: flex-start; gap: .55em; }
.balls.nowrap { flex-wrap: nowrap; gap: clamp(3px, 1.2cqw, .6em); }
.ballbox { display: flex; flex-direction: column; align-items: center; gap: .25em; }
.cap { font-size: .74em; color: var(--secondary-text-color); line-height: 1; white-space: nowrap; }
.cap:empty { display: none; }
.ball { --b: 3.1em; width: var(--b); height: var(--b); border-radius: 50%; display: inline-grid; place-items: center;
  font-weight: 800; font-size: calc(var(--b) * .42); color: #fff; flex: none;
  background: radial-gradient(circle at 30% 25%, #8b9cff, #4338ca);
  box-shadow: inset 0 -.25em .5em rgba(0,0,0,.25), 0 .3em .8em rgba(67,56,202,.35); }
.ball.euro { color: #422006; background: radial-gradient(circle at 30% 25%, #fde68a, #f59e0b);
  box-shadow: inset 0 -.25em .5em rgba(0,0,0,.15), 0 .3em .8em rgba(245,158,11,.4); }
.ball.lg { --b: clamp(2.4em, 11.5cqw, 4.6em); } .ball.sm { --b: clamp(1.7em, 7.8cqw, 2.8em); }
.sep { width: .4em; flex: none; }
.jp { margin-top: 1.1em; padding: .8em 1.1em; border-radius: 1em; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .4em 1em;
  background: linear-gradient(135deg, rgba(245,158,11,.20), rgba(245,158,11,.05)); border: 1px solid rgba(245,158,11,.35); }
.jp .amt { font-size: clamp(1.7em, 9cqw, 2.9em); font-weight: 900; line-height: 1.1; letter-spacing: -.02em;
  background: linear-gradient(135deg, #f59e0b, #d97706 55%, #b45309); -webkit-background-clip: text; background-clip: text; color: transparent; }
.next { margin-top: 1em; padding: .8em 1.1em; border-radius: 1em; text-align: center; border: 1px solid var(--divider-color);
  background: linear-gradient(135deg, rgba(124,92,255,.14), rgba(34,211,238,.08)); }
.next .nt { color: var(--secondary-text-color); font-size: .95em; } .next .nt b { color: var(--primary-text-color); font-size: 1.1em; margin-left: .3em; }
.cd { display: flex; justify-content: center; align-items: flex-start; gap: clamp(3px, 1.4cqw, .6em); margin-top: .6em; }
.cd i { font-style: normal; font-size: clamp(1.4em, 6cqw, 2.3em); font-weight: 800; line-height: 1.15; opacity: .5; }
.cd .c { min-width: clamp(3.2em, 15cqw, 6em); padding: .35em .5em; border-radius: .9em; border: 1px solid var(--divider-color);
  background: linear-gradient(135deg, rgba(124,92,255,.28), rgba(34,211,238,.18)); }
.cd .c b { display: block; font-size: clamp(1.4em, 6cqw, 2.4em); line-height: 1.1; font-variant-numeric: tabular-nums; }
.cd .c span { font-size: .7em; color: var(--secondary-text-color); font-weight: 600; }
.label { font-size: .86em; color: var(--secondary-text-color); font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: .98em; margin-top: .4em; }
th { text-align: right; font-size: .82em; color: var(--secondary-text-color); font-weight: 600; padding: .5em .6em; }
td { text-align: right; padding: .5em .6em; border-top: 1px solid var(--divider-color); font-variant-numeric: tabular-nums; }
th:first-child, td:first-child { text-align: left; font-weight: 700; white-space: nowrap; }
table.off th:nth-child(2), table.off td:nth-child(2) { text-align: left; font-weight: 400; white-space: normal; }
td.nw { white-space: nowrap; }
tr.gr td { background: rgba(52,211,153,.10); }
.tag { font-size: .68em; padding: .1em .6em; border-radius: 999px; background: rgba(245,158,11,.25); margin-left: .5em; font-weight: 700; }
.flag { width: 1.6em; height: 1.2em; object-fit: cover; border-radius: .25em; box-shadow: 0 0 0 1px rgba(128,128,150,.35); flex: none; }
.where h4 { margin: 1.2em 0 .5em; font-size: 1.05em; }
.where .wr { display: flex; flex-wrap: wrap; gap: .4em 1em; padding: .5em 0; border-top: 1px solid var(--divider-color); }
.where .wc { min-width: 11em; font-weight: 700; } .where .wc small { font-weight: 400; color: var(--secondary-text-color); }
.where .chips { display: flex; flex-wrap: wrap; gap: .35em; }
.where .chip { display: inline-flex; align-items: center; gap: .4em; padding: .2em .7em; border-radius: 999px; font-size: .88em;
  background: var(--secondary-background-color); border: 1px solid var(--divider-color); }
.heat { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: .35em; }
.cell { border-radius: .6em; padding: .4em 0 .3em; text-align: center; line-height: 1.1; border: 1px solid var(--divider-color); cursor: default; }
.cell b { display: block; font-size: 1.12em; } .cell i { font-style: normal; font-size: .74em; opacity: .85; }
.legend { display: flex; align-items: center; gap: .6em; font-size: .76em; color: var(--secondary-text-color); margin-top: .6em; }
.legend .bar { flex: 1; height: .4em; border-radius: .2em; background: linear-gradient(90deg, rgba(59,130,246,.9), rgba(59,130,246,.3), rgba(244,63,94,.35), rgba(244,63,94,.9)); }
.rank { display: grid; grid-template-columns: repeat(auto-fit, minmax(15em, 1fr)); gap: 1.2em; margin-top: 1.3em; }
.sect + .sect { margin-top: 1.2em; }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: .8em 1.4em; }
.stepper { display: inline-flex; align-items: center; gap: .6em; }
.stepper button { width: 2.5em; height: 2.5em; border-radius: .7em; border: 1px solid var(--divider-color); background: var(--secondary-background-color);
  color: inherit; font-size: 1.1em; font-weight: 800; cursor: pointer; }
.stepper button:hover { filter: brightness(1.15); }
.stepper output { min-width: 1.6em; text-align: center; font-size: 1.7em; font-weight: 800; }
select { font: inherit; font-size: 1em; color: inherit; background: var(--secondary-background-color); border: 1px solid var(--divider-color); border-radius: .7em; padding: .6em .8em; max-width: 100%; }
.go { margin-top: 1em; width: 100%; padding: .8em 1em; border: 0; border-radius: .9em; font: inherit; font-weight: 800; font-size: 1.12em; color: #fff; cursor: pointer;
  background: linear-gradient(135deg, #7c5cff, #5b8def); box-shadow: 0 .5em 1.4em rgba(124,92,255,.4); }
.go:hover { filter: brightness(1.08); } .go[disabled] { opacity: .6; cursor: default; }
.col { display: flex; align-items: center; gap: clamp(6px, 2cqw, .8em); padding: .55em .7em; margin-top: .55em; border-radius: .85em;
  background: var(--secondary-background-color); border: 1px solid var(--divider-color); }
.col .no { flex: none; width: 1.8em; height: 1.8em; border-radius: .55em; display: grid; place-items: center; font-weight: 800; font-size: .85em; background: var(--divider-color); }
.col .tg { margin-left: auto; flex: none; font-size: .74em; padding: .15em .7em; border-radius: 999px; background: rgba(124,92,255,.25); font-weight: 700; }
.total { margin-top: .9em; padding: .8em 1.1em; border-radius: 1em; display: flex; align-items: center; justify-content: space-between; gap: .8em;
  background: linear-gradient(135deg, rgba(124,92,255,.35), rgba(34,211,238,.25)); border: 1px solid var(--divider-color); }
.total .sum { font-size: 2.1em; font-weight: 900; }
.empty { padding: 1.3em .6em; text-align: center; color: var(--secondary-text-color); }
.note { margin-top: .9em; font-size: .8em; color: var(--secondary-text-color); }

.modal { position: fixed; inset: 0; z-index: 50; display: flex; align-items: flex-start; justify-content: center; padding: 4vh 3vw; overflow-y: auto;
  background: rgba(8,12,24,.62); font-size: clamp(14px, calc(0.3vw + 12px), 22px); }
.modal .box { position: relative; width: min(46em, 100%); box-sizing: border-box; padding: 1.4em 1.5em 1.5em; border-radius: 1.2em; color: var(--primary-text-color);
  background: var(--card-background-color); border: 1px solid var(--divider-color); box-shadow: 0 1em 3em rgba(0,0,0,.5); }
.modal .x { position: absolute; top: .7em; right: .7em; width: 2.2em; height: 2.2em; border-radius: .7em; border: 1px solid var(--divider-color);
  background: var(--secondary-background-color); color: inherit; font: inherit; cursor: pointer; }
.modal h3 { margin: 0 2em .6em 0; font-size: 1.35em; } .modal h4 { margin: 1.3em 0 .4em; font-size: 1.05em; }
.modal ul { margin: .3em 0 0; padding-left: 1.2em; } .modal li { margin: .35em 0; line-height: 1.4; }
.modal a { color: var(--primary-color); font-weight: 700; text-decoration: none; } .modal a:hover { text-decoration: underline; }
.kv { display: flex; justify-content: space-between; gap: 1em; padding: .45em 0; border-top: 1px solid var(--divider-color); }
.kv span { color: var(--secondary-text-color); } .kv b { text-align: right; }
.anc { margin-top: 1em; padding-top: .2em; } .anc .col { margin-top: .3em; }
.links { display: flex; flex-wrap: wrap; gap: .6em 1em; margin-top: .4em; }
.modal .note { margin-top: 1.3em; }
.ab-head { display: flex; align-items: center; gap: .9em; margin-bottom: .4em; } .ab-head .logo { width: 3.4em; height: 3.4em; }
.tk { margin-top: .8em; padding: .8em .9em; border-radius: 1em; background: var(--secondary-background-color); border: 1px solid var(--divider-color); }
.tk.won { border-color: rgba(52,211,153,.8); box-shadow: 0 0 0 1px rgba(52,211,153,.35) inset; }
.tk .row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .4em .8em; }
.tk .when2 { font-weight: 800; font-size: .95em; } .tk .badge { font-size: .74em; padding: .15em .7em; border-radius: 999px; background: var(--divider-color); font-weight: 700; margin-left: .5em; }
.tk .res { font-size: .9em; margin-top: .45em; color: var(--secondary-text-color); } .tk .res.win { color: #34d399; font-weight: 700; }
.tk .col { background: transparent; border: 0; padding: .25em 0; margin-top: .2em; }
.minor { font: inherit; font-weight: 700; font-size: .9em; color: inherit; background: var(--secondary-background-color); border: 1px solid var(--divider-color);
  border-radius: .7em; padding: .4em .9em; cursor: pointer; } .minor:hover { filter: brightness(1.15); }
.chk { display: flex; align-items: center; gap: .6em; margin-top: .9em; font-weight: 600; cursor: pointer; }
.chk input { width: 1.2em; height: 1.2em; }
@container (max-width: 400px) { .tag { display: none; } .col .tg { display: none; } .col .no { width: 1.5em; height: 1.5em; } .heat { gap: .2em; } .cell b { font-size: 1em; } }
`;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/* a lottery drum with balls: the icon of the draw card */
const DRAW_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <rect x="5" y="36" width="7" height="22" rx="1.5" fill="#94a3b8"/><rect x="52" y="36" width="7" height="22" rx="1.5" fill="#94a3b8"/>
  <path d="M8 31H56" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="5" cy="31" rx="2.6" ry="10" fill="none" stroke="#cbd5e1" stroke-width="1.6"/>
  <rect x="28.5" y="4.5" width="7" height="6" rx="1" fill="#cbd5e1"/>
  <circle cx="32" cy="31" r="20" fill="rgba(255,255,255,.07)" stroke="#e2e8f0" stroke-width="2"/>
  <g fill="none" stroke="#e2e8f0" stroke-width="1.5"><ellipse cx="32" cy="31" rx="8" ry="20"/><ellipse cx="32" cy="31" rx="15" ry="20"/><ellipse cx="32" cy="31" rx="20" ry="6"/></g>
  <circle cx="25" cy="37" r="4.2" fill="#6366f1"/><circle cx="35" cy="39" r="4.2" fill="#f59e0b"/><circle cx="31" cy="28" r="4.2" fill="#6366f1"/><circle cx="40" cy="30" r="4.2" fill="#f59e0b"/><circle cx="23" cy="27" r="3.6" fill="#f59e0b"/>
</svg>`;
const logoHtml = () => `<div class="logo"><img src="${ASSETS}/logo.svg" alt=""></div>`;

class EJBase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cfg = {};
    this._modal = null;
    this.shadowRoot.addEventListener("click", (e) => {
      const close = e.target.closest("[data-close]");
      if (close && (close.classList.contains("x") || e.target === close)) { this._modal = null; this._render(); return; }
      const an = e.target.closest("[data-an]");
      if (an) this.analyze(an.dataset.an);
    });
  }
  connectedCallback() { ALL_ELEMENTS.add(this); }
  disconnectedCallback() { ALL_ELEMENTS.delete(this); this._stopTimer(); }
  static get defaults() { return {}; }
  get ids() { return []; }
  setConfig(cfg) {
    this._cfg = { ...this.constructor.defaults, ...cfg };
    this._sig = null;
    this._render();
  }
  set hass(h) {
    this._hass = h;
    const sig = this.ids.map((i) => (h.states[i] ? h.states[i].last_updated : "-")).join("|");
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }
  /* language or country changed (menus / stored choice) or the catalogue arrived: draw again */
  relang() { this._sig = null; if (this._hass) this.hass = this._hass; }
  getCardSize() { return 4; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }
  // the card option wins, then the user's stored choice, then the Home Assistant settings
  get lang() { return normLang(this._cfg.language || getPref(LANG_KEY) || (this._hass && this._hass.language)); }
  get country() {
    const c = String(this._cfg.country || getPref(COUNTRY_KEY) || (this._hass && this._hass.config && this._hass.config.country) || "GR").toUpperCase();
    const found = supportedCountry(c);
    return found ? found.code : "GR";
  }
  get countryInfo() { return supportedCountry(this.country); }
  get tr() { return TEXT[this.lang]; }
  get locale() { return LOCALES[this.lang]; }
  st(id) { return this._hass && this._hass.states[id]; }
  fmtN(n) { return Number(n).toLocaleString(this.locale); }
  fmtMoney(n, digits = 2) {
    return Number(n).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) + " €";
  }
  fmtDate(iso) {
    return new Date(iso + "T12:00:00").toLocaleDateString(this.locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  ball(n, cls = "", cap = "") {
    return `<div class="ballbox"><span class="ball ${cls}">${esc(n)}</span><span class="cap">${esc(cap)}</span></div>`;
  }
  shell(inner, cls = "") {
    const modal = this._modal ? `<div class="modal" data-close><div class="box"><button class="x" data-close aria-label="${esc(this.tr.close)}">✕</button>${this._modal}</div></div>` : "";
    return `<style>${STYLE}</style><ha-card><div class="wrap ${cls}">${inner}</div></ha-card>${modal}`;
  }
  /* the statistics of a ticket: of a synced one (uid) or of the last generated one (empty) */
  async analyze(uid) {
    this._modal = `<div class="empty">${this.tr.analyzing}</div>`;
    this._render();
    try {
      const data = { country: this.country };
      if (uid) data.uid = uid;
      const r = await this._hass.connection.sendMessagePromise({ type: "call_service", domain: DOMAIN, service: "analyze_ticket", service_data: data, return_response: true });
      this._modal = `<h3>${this.tr.an.title}</h3>${this.analysisHtml(r.response)}`;
    } catch (e) {
      this._modal = `<div class="empty">${esc((e && e.message) || e)}</div>`;
    }
    this._render();
  }
  analysisHtml(res) {
    const a = this.tr.an, o = res.overall, money = (n) => this.fmtMoney(n);
    const loc = (x, o) => Number(x).toLocaleString(this.locale, o);
    const pct = (p) => loc(p >= 0.01 ? (p * 100).toFixed(2) : (p * 100).toPrecision(2), { maximumFractionDigits: 8 }) + " %";
    const tier = (x) => String(x).replace("+", " + ");
    const rows = o.tiers.map((x) => `<tr><td>${tier(x.tier)}</td><td>${pct(x.p)}</td><td>${this.fmtN(x.odds)}</td><td>${x.avg_prize ? money(x.avg_prize) : "-"}</td></tr>`).join("");
    const cols = res.columns.map((c, i) => {
      const p = c.profile, b = c.backtest;
      const balls = c.main.map((n) => this.ball(n, "sm")).join("") + '<span class="sep"></span>' + c.euro.map((n) => this.ball(n, "euro sm")).join("");
      const hist = b.wins.length
        ? fill(a.histWin, { n: b.wins.length, d: b.draws, best: tier(b.best_tier) }) + " " + (b.complete ? fill(a.histTotal, { won: money(b.total_prize), cost: money(b.cost) }) : a.histUnknown)
        : a.histNever;
      return `<div class="anc"><div class="col"><span class="no">${i + 1}</span><div class="balls nowrap">${balls}</div></div><ul>
        <li>${fill(a.freq, { x: p.freq_ratio == null ? "-" : loc(p.freq_ratio, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</li><li>${fill(a.gap, { n: loc(p.avg_gap, { maximumFractionDigits: 1 }) })}</li>
        <li>${fill(a.shape, p)} - ${p.typical ? a.typical : a.untypical}</li>
        <li>${fill(a.hot, { a: p.hottest.join(", ") })}</li><li>${fill(a.overdue, { a: p.most_overdue.join(", ") })}</li><li>${hist}</li></ul></div>`;
    }).join("");
    const bt = o.backtest;
    return `<h4>${a.overall}</h4>
      <div class="kv"><span>${a.cost}</span><b>${money(o.cost)}</b></div>
      <div class="kv"><span>${a.pAny}</span><b>${pct(o.p_any)} (${fill(a.odds, { n: this.fmtN(o.odds_any) })})</b></div>
      <div class="kv"><span>${a.jackpot}</span><b>${fill(a.odds, { n: this.fmtN(o.odds_jackpot) })}</b></div>
      <div class="kv"><span>${a.expected}</span><b>${money(o.expected_prize)}</b></div>
      <div class="kv"><span>${a.net}</span><b>${money(o.expected_net)}</b></div>
      <div class="note">${a.assumption}</div>
      <h4>${a.tiers}</h4><table><tr><th>${a.thTier}</th><th>${a.thP}</th><th>${a.thOdds}</th><th>${a.thPrize}</th></tr>${rows}</table>
      ${cols}
      <div class="note">${fill(a.histAll, { won: money(bt.total_prize), cost: money(bt.cost) })}</div>
      <div class="note">${a.disclaimer}</div>`;
  }
  _stopTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
  _render() { this.shadowRoot.innerHTML = this.shell(`<div class="empty">${this.tr.noData}</div>`); }
}

/* ---------------------------------------------------------------- last draw */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
class EJLastDrawCard extends EJBase {
  static get defaults() { return { show_prizes: true }; }
  static getStubConfig() { return { show_prizes: true }; }
  get ids() { return [this._cfg.entity || ID.last, ID.next, ID.jackpot]; }
  getCardSize() { return this._cfg.show_prizes ? 9 : 4; }
  matchText(tier) { return String(tier).replace("+", " + "); }       // "5 + 2", like in the Greek layout
  /* "Next draw 16/10/2026 - 21:00" in the country's time zone, with a DD:HH:MM:SS countdown */
  nextBox(next) {
    this._nextAt = null;
    if (!next || !next.state || next.state === "unknown" || next.state === "unavailable") return "";
    const d = new Date(next.state);
    if (isNaN(d)) return "";
    this._nextAt = d.getTime();
    const tz = (this.countryInfo && this.countryInfo.tz) || "Europe/Athens";
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
    const t = this.tr, cell = (u) => `<div class="c"><b data-cd="${u}">00</b><span>${t.cd[u]}</span></div>`;
    return `<div class="next"><div class="nt">${t.next} <b>${p.day}/${p.month}/${p.year} - ${p.hour}:${p.minute}</b></div>
      <div class="cd">${cell("d")}<i>:</i>${cell("h")}<i>:</i>${cell("m")}<i>:</i>${cell("s")}</div></div>`;
  }
  _tick() {
    const left = Math.max(0, Math.floor((this._nextAt - Date.now()) / 1000));
    const v = { d: Math.floor(left / 86400), h: Math.floor((left % 86400) / 3600), m: Math.floor((left % 3600) / 60), s: left % 60 };
    for (const k in v) {
      const el = this.shadowRoot.querySelector(`[data-cd="${k}"]`);
      if (el) el.textContent = String(v[k]).padStart(2, "0");
    }
  }
  whereHtml(prizes) {
    const t = this.tr, byA3 = CAT ? Object.fromEntries(CAT.countries.map((c) => [c.alpha3, c])) : {};
    const rows = prizes.map((p, i) => (p.where_won && p.where_won.length ? { p, i } : null)).filter(Boolean).map(({ p, i }) => {
      const chips = [...p.where_won].sort((a, b) => b.winners - a.winners).map((w) => {
        const c = byA3[w.alpha3];
        const st = w.region && CAT && CAT.german_states[w.region];
        const label = w.region ? (st ? st[this.lang] || st.en : w.region) : (c ? c.name[this.lang] || c.name.en : w.code || w.alpha3);
        return `<span class="chip">${c ? flag(c.flag) : ""}${esc(label)} <b>${this.fmtN(w.winners)}×</b></span>`;
      }).join("");
      return `<div class="wr"><div class="wc">${ROMAN[i] || i + 1} <small>${esc(this.matchText(p.tier))}</small></div><div class="chips">${chips}</div></div>`;
    });
    return rows.length ? `<div class="where"><h4>${t.where}</h4>${rows.join("")}<div class="note">${t.whereHint}</div></div>` : "";
  }
  prizeTable(a) {
    const t = this.tr, prizes = a.prizes;
    let table;
    if (this.countryInfo && this.countryInfo.layout === "official") {      // as on the official eurojackpot.com page
      const rows = prizes.filter((p) => p.tier !== "1+1").map((p, i) => `<tr class="${p.winners_all_countries > 0 ? "gr" : ""}"><td>${ROMAN[i] || i + 1}</td><td>${esc(this.matchText(p.tier))}</td>
        <td class="nw">${p.winners_all_countries ? `${this.fmtN(p.winners_all_countries)} ×` : `<span class="sub">${t.noWinner}</span>`}</td>
        <td class="nw">${p.prize_per_winner > 0 ? this.fmtMoney(p.prize_per_winner) : "-"}</td></tr>`).join("");
      table = `<table class="off"><thead><tr><th>${t.cls}</th><th>${t.match}</th><th>${t.winnersN}</th><th>${t.prizeWinner}</th></tr></thead><tbody>${rows}</tbody></table>
        ${a.total_sales ? `<div class="note">${t.sales}: <b>${this.fmtMoney(a.total_sales)}</b>${a.columns_all_countries ? ` · ${this.fmtN(a.columns_all_countries)} ${t.columns.toLowerCase()}` : ""}</div>` : ""}`;
    } else {                                                                // Greek (Allwyn) layout
      const rows = prizes.map((p) => {
        const gr = p.winners_greece, greekOnly = p.tier === "1+1";
        return `<tr class="${gr > 0 ? "gr" : ""}"><td>${esc(p.tier.replace("+", " + "))}${greekOnly ? `<span class="tag">${t.greekOnly}</span>` : ""}</td>
          <td>${greekOnly ? "-" : this.fmtN(p.winners_all_countries)}</td><td>${gr == null ? "-" : this.fmtN(gr)}</td>
          <td>${p.prize_per_winner > 0 ? this.fmtMoney(p.prize_per_winner) : "-"}</td></tr>`;
      }).join("");
      table = `<table><thead><tr><th>${t.tier}</th><th>${t.winners}</th><th>${t.greece}</th><th>${t.prize}</th></tr></thead><tbody>${rows}</tbody></table>
        ${a.columns_greece ? `<div class="note">${this.fmtN(a.columns_greece)} ${t.columnsGr}</div>` : ""}`;
    }
    return table + this.whereHtml(prizes);
  }
  _render() {
    const root = this.shadowRoot;
    this._stopTimer();
    if (!this._hass) { root.innerHTML = this.shell(""); return; }
    const t = this.tr;
    const last = this.st(this._cfg.entity || ID.last);
    if (!last || !last.attributes.numbers) { root.innerHTML = this.shell(`<div class="empty">${t.noData}</div>`); return; }
    const a = last.attributes;
    const jp = this.st(ID.jackpot);
    const nextHtml = this.nextBox(this.st(ID.next));
    const jackpot = jp && !isNaN(parseFloat(jp.state)) ? parseFloat(jp.state) : null;
    const head = `
      <div class="head">
        <div class="title"><div class="logo big">${DRAW_ICON}</div>
          <div class="when"><b>${t.last}</b> · ${esc(this.fmtDate(last.state))}${a.draw_number ? ` · #${esc(a.draw_number)}` : ""}</div></div>
      </div>
      <div class="balls nowrap" style="margin-top:1.1em">
        ${a.numbers.map((n) => this.ball(n, "lg")).join("")}<span class="sep"></span>${a.euro_numbers.map((n) => this.ball(n, "euro lg")).join("")}
      </div>
      ${jackpot !== null ? `<div class="jp"><div><div class="label">${t.jackpot}</div><div class="amt">${this.fmtMoney(jackpot, 0)}</div></div></div>` : ""}
      ${nextHtml}`;
    const prizes = this._cfg.show_prizes && Array.isArray(a.prizes) && a.prizes.length ? this.prizeTable(a) : "";
    root.innerHTML = `<style>${STYLE}</style><ha-card><div class="wrap hero">${head}</div>${prizes ? `<div class="wrap">${prizes}</div>` : ""}</ha-card>`;
    if (this._nextAt) { this._tick(); this._timer = setInterval(() => this._tick(), 1000); }
  }
}

/* -------------------------------------------------------------------- stats */
class EJStatsCard extends EJBase {
  static getStubConfig() { return {}; }
  get ids() { return [ID.overdue, ID.frequent, ID.rare]; }
  getCardSize() { return 9; }
  _render() {
    const root = this.shadowRoot;
    if (!this._hass) { root.innerHTML = this.shell(""); return; }
    const t = this.tr;
    const od = this.st(ID.overdue), fr = this.st(ID.frequent), ra = this.st(ID.rare);
    if (!od || !od.attributes.all) { root.innerHTML = this.shell(`<div class="empty">${t.noData}</div>`); return; }
    const all = od.attributes.all;
    const maxGap = Math.max(...all.main.map((x) => x.draws_since || 0), 1);
    const cells = all.main.map((x) => {
      const k = (x.draws_since || 0) / maxGap;
      const rgb = k > 0.35 ? "244,63,94" : "59,130,246";
      const alpha = (0.18 + Math.min(1, k) * 0.72).toFixed(2);
      return `<div class="cell" title="${esc(t.tipNum(x.number, x.draws_since, x.count, x.percent))}" style="background:rgba(${rgb},${alpha})"><b>${x.number}</b><i>${x.draws_since}</i></div>`;
    }).join("");
    const rankBlock = (label, st, kind) => {
      const attrs = st ? st.attributes : { main: [], euro: [] };
      const cap = (x) => (kind === "overdue" ? `${x.draws_since} ${t.since}` : `${x.count}×`);
      return `<div><div class="label" style="margin-bottom:.6em">${label}</div>
        <div class="balls">${attrs.main.slice(0, 5).map((x) => this.ball(x.number, "sm", cap(x))).join("")}<span class="sep"></span>${attrs.euro.slice(0, 2).map((x) => this.ball(x.number, "euro sm", cap(x))).join("")}</div></div>`;
    };
    root.innerHTML = this.shell(`
      <div class="head"><div class="title"><div class="logo"><span>📊</span></div><div><b>${t.heat}</b><span class="sub">${t.heatHint}</span></div></div>
        <span class="sub">${od.attributes.draws_analysed ? this.fmtN(od.attributes.draws_analysed) + " " + t.analysed : ""}</span></div>
      <div class="sect" style="margin-top:1em"><div class="heat">${cells}</div>
        <div class="legend"><span>0</span><div class="bar"></div><span>${maxGap}</span></div></div>
      <div class="rank">${rankBlock(t.overdue, od, "overdue")}${rankBlock(t.frequent, fr, "freq")}${rankBlock(t.rare, ra, "freq")}</div>
      <div class="note">${t.euro}: ${all.euro.map((x) => `<b>${x.number}</b> (${x.draws_since})`).join(" · ")}</div>`);
  }
}

/* ------------------------------------------------------------------- ticket */
class EJTicketCard extends EJBase {
  static get defaults() { return { columns: 5, algorithm: "auto_column", period: "all", price: 2.5 }; }
  static getStubConfig() { return { columns: 5, algorithm: "auto_column" }; }
  get ids() { return [ID.ticket]; }
  getCardSize() { return 8; }
  setConfig(cfg) {
    this._cols = Number(cfg.columns || 5);
    this._algo = cfg.algorithm || "auto_column";
    this._busy = false;
    this._save = !!cfg.save;
    super.setConfig(cfg);
  }
  async _generate() {
    this._busy = true;
    this._render();
    try {
      await this._hass.callService(DOMAIN, "generate_ticket", { columns: this._cols, algorithm: this._algo, period: this._cfg.period || "all", save: this._save });
    } finally {
      this._busy = false;
      this._render();
    }
  }
  _render() {
    const root = this.shadowRoot;
    if (!this._hass) { root.innerHTML = this.shell(""); return; }
    const t = this.tr;
    const tk = this.st(ID.ticket);
    const a = tk && tk.attributes && tk.attributes.columns ? tk.attributes : null;
    const price = a ? a.price_per_column : Number(this._cfg.price);
    const algoOpts = Object.entries(t.algos).map(([k, v]) => `<option value="${k}" ${k === this._algo ? "selected" : ""}>${esc(v)}</option>`).join("");
    let result = `<div class="empty">${t.empty}</div>`;
    if (a) {
      const rows = a.columns.map((c, i) => `<div class="col" title="${t.column} ${i + 1}"><span class="no">${i + 1}</span>
        <div class="balls nowrap">${c.numbers.map((n) => this.ball(n, "sm")).join("")}<span class="sep"></span>${c.euro_numbers.map((n) => this.ball(n, "euro sm")).join("")}</div>
        <span class="tg">${esc(t.short[c.algorithm] || c.algorithm)}</span></div>`).join("");
      result = `${rows}<div class="total"><div><div class="label">${t.total}</div><div class="sub">${a.column_count} × ${this.fmtMoney(a.price_per_column)}</div></div>
        <div class="sum">${this.fmtMoney(a.total_cost)}</div></div>
        <div class="controls" style="margin-top:.8em"><button class="minor" data-an="">📊 ${t.analyze}</button></div>`;
    }
    root.innerHTML = this.shell(`
      <div class="head"><div class="title"><div class="logo"><span>🎟️</span></div><div><b>${t.ticket}</b><span class="sub">× ${this.fmtMoney(price)} ${t.perColumn}</span></div></div></div>
      <div class="controls" style="margin-top:1em">
        <div class="stepper"><span class="label">${t.columns}</span><button data-act="minus" aria-label="-">−</button><output>${this._cols}</output><button data-act="plus" aria-label="+">+</button></div>
        <label class="stepper"><span class="label">${t.algorithm}</span><select data-act="algo">${algoOpts}</select></label>
      </div>
      <label class="chk"><input type="checkbox" data-act="save" ${this._save ? "checked" : ""}>${esc(t.save)}</label>
      <button class="go" data-act="go" ${this._busy ? "disabled" : ""}>🎲 ${this._busy ? t.generating : t.generate}</button>
      <div class="sect">${result}</div>
      <div class="note">${t.disclaimer}</div>`);
    const q = (s) => root.querySelector(s);
    q('[data-act="minus"]').onclick = () => { this._cols = Math.max(1, this._cols - 1); this._render(); };
    q('[data-act="plus"]').onclick = () => { this._cols = Math.min(12, this._cols + 1); this._render(); };
    q('[data-act="algo"]').onchange = (e) => { this._algo = e.target.value; };
    q('[data-act="save"]').onchange = (e) => { this._save = e.target.checked; };
    q('[data-act="go"]').onclick = () => this._generate();
  }
}


/* --------------------------------------------------------------- my tickets */
class EJMyTicketsCard extends EJBase {
  static get defaults() { return { max_tickets: 6 }; }
  static getStubConfig() { return { max_tickets: 6 }; }
  get ids() { return [ID.myTickets]; }
  getCardSize() { return 8; }
  _render() {
    const root = this.shadowRoot;
    if (!this._hass) { root.innerHTML = this.shell(""); return; }
    const t = this.tr, s = this.st(ID.myTickets), at = (s && s.attributes) || {};
    const all = at.tickets || [], list = all.slice(0, Number(this._cfg.max_tickets) || 6);
    const today = new Date().toISOString().slice(0, 10);
    const items = list.map((k) => {
      let res = "";
      if (k.result) {
        const r = k.result;
        res = r.winning_columns
          ? `<div class="res win">✔ ${fill(t.resWon, { n: r.winning_columns, tot: k.columns.length })}${r.complete ? " - " + fill(t.resWonSum, { sum: this.fmtMoney(r.total_prize) }) : ""}</div>`
          : `<div class="res">${t.resNone}</div>`;
      } else if (k.played) {
        res = `<div class="res">${k.target_date >= today ? t.resPending : ""}</div>`;
      }
      const cols = k.columns.map((c) => `<div class="col"><div class="balls nowrap">${c.numbers.map((n) => this.ball(n, "sm")).join("")}<span class="sep"></span>${c.euro_numbers.map((n) => this.ball(n, "euro sm")).join("")}</div></div>`).join("");
      return `<div class="tk ${k.result && k.result.winning_columns ? "won" : ""}"><div class="row"><div><span class="when2">${esc(this.fmtDate(k.target_date))}</span><span class="badge">${k.played ? t.played : t.notPlayed}</span></div>
        <button class="minor" data-an="${esc(k.uid)}">📊 ${t.analyze}</button></div>${cols}${res}</div>`;
    }).join("");
    const empty = `<div class="empty">${at.sync_enabled ? t.noTickets : t.syncHint}</div>`;
    root.innerHTML = this.shell(`
      <div class="head"><div class="title"><div class="logo"><span>🎫</span></div><div><b>${t.my}</b><span class="sub">${fill(t.resTotal, { n: all.length })}${at.sync_enabled ? "" : " · " + t.syncOff}</span></div></div></div>
      ${list.length ? items : empty}
      <div class="note">${t.disclaimer}</div>`);
  }
}

/* -------------------------------------------------------------------- panel */
const PANEL_STYLE = `
:host { display: block; min-height: 100%; box-sizing: border-box; color: var(--primary-text-color);
  background: var(--primary-background-color);
  /* the whole UI scales with the window: every size inside is in em */
  font-size: clamp(15px, calc(0.42vw + 11px), 27px); }
.page { padding: clamp(12px, 1.2vw, 32px); max-width: none; margin: 0; }
.bar { display: flex; align-items: center; justify-content: space-between; gap: 1em; flex-wrap: wrap; margin-bottom: 1.2em; }
.brand { display: flex; align-items: center; gap: .9em; min-width: 0; }
.brand .logo { display: grid; place-items: center; width: 3.3em; height: 3.3em; border-radius: 1em; flex: none;
  background: linear-gradient(135deg, #2a3a55, #0d1328); border: 1.5px solid #5b6b88; box-shadow: 0 .4em 1.2em rgba(56,150,255,.3); }
.brand .logo img { width: 84%; height: auto; display: block; }
.brand h1 { margin: 0; font-size: 1.7em; line-height: 1.15; }
.brand .sub { color: var(--secondary-text-color); font-size: .95em; }
.tools { display: flex; align-items: center; gap: .7em; flex-wrap: wrap; }
.tool { font: inherit; font-weight: 700; color: inherit; background: var(--card-background-color); border: 1px solid var(--divider-color);
  border-radius: .8em; padding: .55em 1em; cursor: pointer; display: inline-flex; align-items: center; gap: .55em; }
.tool:hover { filter: brightness(1.15); }
.flag { width: 1.6em; height: 1.2em; object-fit: cover; border-radius: .25em; box-shadow: 0 0 0 1px rgba(128,128,150,.35); flex: none; }
.caret { font-style: normal; font-size: .8em; opacity: .7; }
.dd { position: relative; }
.menu { display: none; position: absolute; top: calc(100% + .35em); right: 0; z-index: 20; min-width: 100%; max-height: 70vh; overflow-y: auto;
  padding: .35em; border-radius: .9em; background: var(--card-background-color); border: 1px solid var(--divider-color);
  box-shadow: 0 .6em 2em rgba(0,0,0,.35); }
.menu.open { display: block; }
.item { display: flex; align-items: center; gap: .7em; width: 100%; padding: .55em .8em; border: 0; border-radius: .65em; background: transparent;
  color: inherit; font: inherit; font-weight: 600; text-align: left; white-space: nowrap; cursor: pointer; }
.item:hover { background: var(--secondary-background-color); }
.item.on { background: rgba(124,92,255,.22); }
.item.off { opacity: .5; cursor: default; }
.item em { margin-left: auto; padding-left: 1em; font-size: .78em; font-style: normal; color: var(--secondary-text-color); }
.cols { display: grid; gap: clamp(12px, 1.5vw, 32px); grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; }
@media (max-width: 1350px) { .cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cols > :nth-child(3) { grid-column: 1 / -1; } }
@media (max-width: 800px) { .cols { grid-template-columns: minmax(0, 1fr); } .cols > :nth-child(3) { grid-column: auto; } }
ha-menu-button { margin-right: .4em; }
.stack { display: grid; gap: clamp(12px, 1.5vw, 32px); min-width: 0; }

.modal { position: fixed; inset: 0; z-index: 50; display: flex; align-items: flex-start; justify-content: center; padding: 4vh 3vw; overflow-y: auto;
  background: rgba(8,12,24,.62); font-size: clamp(14px, calc(0.3vw + 12px), 22px); }
.modal .box { position: relative; width: min(46em, 100%); box-sizing: border-box; padding: 1.4em 1.5em 1.5em; border-radius: 1.2em; color: var(--primary-text-color);
  background: var(--card-background-color); border: 1px solid var(--divider-color); box-shadow: 0 1em 3em rgba(0,0,0,.5); }
.modal .x { position: absolute; top: .7em; right: .7em; width: 2.2em; height: 2.2em; border-radius: .7em; border: 1px solid var(--divider-color);
  background: var(--secondary-background-color); color: inherit; font: inherit; cursor: pointer; }
.modal h3 { margin: 0 2em .6em 0; font-size: 1.35em; } .modal h4 { margin: 1.3em 0 .4em; font-size: 1.05em; }
.modal ul { margin: .3em 0 0; padding-left: 1.2em; } .modal li { margin: .35em 0; line-height: 1.4; }
.modal a { color: var(--primary-color); font-weight: 700; text-decoration: none; } .modal a:hover { text-decoration: underline; }
.kv { display: flex; justify-content: space-between; gap: 1em; padding: .45em 0; border-top: 1px solid var(--divider-color); }
.kv span { color: var(--secondary-text-color); } .kv b { text-align: right; }
.anc { margin-top: 1em; padding-top: .2em; } .anc .col { margin-top: .3em; }
.links { display: flex; flex-wrap: wrap; gap: .6em 1em; margin-top: .4em; }
.modal .note { margin-top: 1.3em; }
.ab-head { display: flex; align-items: center; gap: .9em; margin-bottom: .4em; } .ab-head .logo { width: 3.4em; height: 3.4em; }
.tk { margin-top: .8em; padding: .8em .9em; border-radius: 1em; background: var(--secondary-background-color); border: 1px solid var(--divider-color); }
.tk.won { border-color: rgba(52,211,153,.8); box-shadow: 0 0 0 1px rgba(52,211,153,.35) inset; }
.tk .row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .4em .8em; }
.tk .when2 { font-weight: 800; font-size: .95em; } .tk .badge { font-size: .74em; padding: .15em .7em; border-radius: 999px; background: var(--divider-color); font-weight: 700; margin-left: .5em; }
.tk .res { font-size: .9em; margin-top: .45em; color: var(--secondary-text-color); } .tk .res.win { color: #34d399; font-weight: 700; }
.tk .col { background: transparent; border: 0; padding: .25em 0; margin-top: .2em; }
.minor { font: inherit; font-weight: 700; font-size: .9em; color: inherit; background: var(--secondary-background-color); border: 1px solid var(--divider-color);
  border-radius: .7em; padding: .4em .9em; cursor: pointer; } .minor:hover { filter: brightness(1.15); }
.chk { display: flex; align-items: center; gap: .6em; margin-top: .9em; font-weight: 600; cursor: pointer; }
.chk input { width: 1.2em; height: 1.2em; }
`;

class EJPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
    this._onDocClick = () => this._closeMenus();
    this._about = false;
    this.shadowRoot.addEventListener("click", (e) => {
      const close = e.target.closest("[data-close]");
      if (close && (close.classList.contains("x") || e.target === close)) { this._about = false; this._renderAbout(); }
    });
  }
  connectedCallback() { ALL_ELEMENTS.add(this); document.addEventListener("click", this._onDocClick); }
  disconnectedCallback() { ALL_ELEMENTS.delete(this); document.removeEventListener("click", this._onDocClick); }
  set hass(h) {
    this._hass = h;
    if (!this._built) this._build();
    for (const el of this._cards) el.hass = h;
    if (this._menu) this._menu.hass = h;
  }
  set narrow(v) {
    this._narrow = v;
    if (this._menu) { this._menu.narrow = v; this._menu.style.display = v ? "" : "none"; }
  }
  set route(_) {}
  set panel(_) {}
  get lang() { return normLang(getPref(LANG_KEY) || (this._hass && this._hass.language)); }
  get country() {
    const c = String(getPref(COUNTRY_KEY) || (this._hass && this._hass.config && this._hass.config.country) || "GR").toUpperCase();
    const found = supportedCountry(c);
    return found ? found.code : "GR";
  }
  _build() {
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${PANEL_STYLE}</style>
      <div class="page">
        <div class="bar">
          <div class="brand"><ha-menu-button></ha-menu-button><div class="logo"><img src="${ASSETS}/logo.svg" alt=""></div>
            <div><h1>EuroJackpot Analyzer</h1><div class="sub" data-sub></div></div></div>
          <div class="tools" data-tools></div>
        </div>
        <div class="cols"></div>
      </div>`;
    const cols = this.shadowRoot.querySelector(".cols");
    this._cards = ["last-draw", "stats", "ticket", "my-tickets"].map((n) => document.createElement(`eurojackpot-analyzer-${n}-card`));
    this._cards[0].setConfig({});
    this._cards[1].setConfig({});
    this._cards[2].setConfig({ columns: 5, algorithm: "auto_column" });
    this._cards[3].setConfig({});
    const stack = document.createElement("div");
    stack.className = "stack";
    stack.append(this._cards[2], this._cards[3]);
    cols.append(this._cards[0], this._cards[1], stack);
    this._menu = this.shadowRoot.querySelector("ha-menu-button");
    this._menu.hass = this._hass;
    this._menu.narrow = !!this._narrow;
    this._menu.style.display = this._narrow ? "" : "none";
    this._renderBar();
  }
  _closeMenus() { this.shadowRoot && this.shadowRoot.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open")); }
  /* a dropdown with flags: `items` = [{value, flag, label, sub, disabled}] */
  _dropdown(id, items, value, btnLabel) {
    const cur = items.find((i) => i.value === value) || items[0];
    const list = items.map((i) => `<button class="item ${i.value === value ? "on" : ""} ${i.disabled ? "off" : ""}" data-v="${esc(i.value)}">${flag(i.flag)}<span>${esc(i.label)}</span>${i.sub ? `<em>${esc(i.sub)}</em>` : ""}</button>`).join("");
    return `<div class="dd" data-dd="${id}"><button class="tool" data-btn title="${esc(btnLabel)}">${cur ? flag(cur.flag) : ""}<span>${esc(cur ? (cur.short || cur.label) : "")}</span><i class="caret">▾</i></button><div class="menu">${list}</div></div>`;
  }
  _renderBar() {
    const t = TEXT[this.lang], root = this.shadowRoot;
    root.querySelector("[data-sub]").textContent = t.panelSub;
    const refresh = `<button class="tool" data-act="about" title="${esc(t.about)}">ⓘ <span>${esc(t.about)}</span></button><button class="tool" data-act="refresh" title="${t.refresh}">↻ <span>${t.refresh}</span></button>`;
    let menus = "";
    if (CAT) {
      const countries = CAT.countries.map((c) => ({ value: c.code, flag: c.flag, label: c.name.own, sub: c.supported ? "" : c.soon, disabled: !c.supported }));
      const langs = Object.entries(CAT.languages).map(([k, l]) => ({ value: k, flag: l.flag, label: l.name, short: l.code }));
      menus = this._dropdown("country", countries, this.country, t.country) + this._dropdown("lang", langs, this.lang, t.language);
    }
    root.querySelector("[data-tools]").innerHTML = refresh + menus;
    root.querySelector('[data-act="about"]').onclick = (e) => { e.stopPropagation(); this._about = true; this._renderAbout(); };
    root.querySelector('[data-act="refresh"]').onclick = (e) => {
      e.stopPropagation();
      const ids = [ID.last].filter((i) => this._hass.states[i]);
      if (ids.length) this._hass.callService("homeassistant", "update_entity", { entity_id: ids });
    };
    root.querySelectorAll("[data-dd]").forEach((dd) => {
      const menu = dd.querySelector(".menu");
      dd.querySelector("[data-btn]").onclick = (e) => { e.stopPropagation(); const open = menu.classList.contains("open"); this._closeMenus(); menu.classList.toggle("open", !open); };
      dd.querySelectorAll(".item").forEach((b) => { b.onclick = (e) => {
        e.stopPropagation();
        this._closeMenus();
        if (b.classList.contains("off")) return;
        if (dd.dataset.dd === "lang") this._setPref(LANG_KEY, b.dataset.v); else this._setPref(COUNTRY_KEY, b.dataset.v);
      }; });
    });
  }
  _renderAbout() {
    const root = this.shadowRoot;
    let box = root.querySelector("[data-about]");
    if (!this._about) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.dataset.about = ""; root.appendChild(box); }
    const t = TEXT[this.lang], lines = (k) => String(t[k]).split("\n").filter(Boolean);
    const guide = lines("aboutGuide").map((l) => { const [h, d] = l.split("|"); return `<li><b>${esc(h)}:</b> ${esc(d || "")}</li>`; }).join("");
    const li = (k) => lines(k).map((l) => `<li>${esc(l)}</li>`).join("");
    const a = (url, label) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    box.innerHTML = `<div class="modal" data-close><div class="box"><button class="x" data-close aria-label="${esc(t.close)}">✕</button>
      <div class="ab-head"><div class="logo"><img src="${ASSETS}/logo.svg" alt=""></div><div><h3 style="margin:0">EuroJackpot Analyzer</h3><div class="sub">v${EJ_VERSION}</div></div></div>
      <h4>${t.aboutHowto}</h4><ul>${guide}</ul>
      <h4>${t.aboutSources}</h4><ul>${li("aboutSourcesText")}</ul>
      <h4>${t.aboutCredits}</h4><ul>${li("aboutCreditsText")}</ul>
      <h4>${t.aboutLinks}</h4><div class="links">${a(REPO_HA, "🔗 " + t.aboutRepo)}${a(REPO_APP + "/releases", "⬇ " + t.aboutApps)}${a(WEB_APP, "🌐 " + t.aboutWeb)}</div>
      <div class="note">${t.aboutDisclaimer}</div></div></div>`;
  }
  /* instant switch: remember the choice and redraw this panel and every card */
  _setPref(key, value) {
    setPref(key, value);
    this._renderBar();
    this._renderAbout();
    for (const el of ALL_ELEMENTS) if (el !== this && el.relang) el.relang();
  }
  relang() { if (this._built) { this._renderBar(); this._renderAbout(); } }       // the catalogue arrived
}

const CARDS = [
  ["eurojackpot-analyzer-last-draw-card", EJLastDrawCard, "EuroJackpot Analyzer - Τελευταία κλήρωση / Last draw", "Last draw numbers, jackpot, next draw with countdown and prizes."],
  ["eurojackpot-analyzer-stats-card", EJStatsCard, "EuroJackpot Analyzer - Στατιστικά / Statistics", "Overdue heat-map of the 50 numbers and rankings."],
  ["eurojackpot-analyzer-ticket-card", EJTicketCard, "EuroJackpot Analyzer - Δελτίο / Ticket", "Ticket generator with 1-12 columns."],
  ["eurojackpot-analyzer-my-tickets-card", EJMyTicketsCard, "EuroJackpot Analyzer - Τα δελτία μου / My tickets", "The tickets of your apps and the ones saved here, with results and analysis."],
];
window.customCards = window.customCards || [];
for (const [tag, cls, name, description] of CARDS) {
  if (!customElements.get(tag)) {
    customElements.define(tag, cls);
    window.customCards.push({ type: tag, name, description, preview: true, documentationURL: "https://github.com/VeZReVouLiS/EuroJackpot-Analyzer-HA" });
  }
}
if (!customElements.get("eurojackpot-analyzer-panel")) customElements.define("eurojackpot-analyzer-panel", EJPanel);
console.info(`%c EuroJackpot Analyzer %c ${EJ_VERSION} `, "background:#f59e0b;color:#422006;font-weight:700", "background:#4338ca;color:#fff");
