# EuroJackpot Analyzer για Home Assistant

Custom integration (HACS) που φέρνει το EuroJackpot στο Home Assistant:

- **Τελευταία κλήρωση**: αριθμοί, επιτυχίες και κέρδη ανά κατηγορία (σύνολο χωρών και Ελλάδα).
- **Επόμενη κλήρωση και τζάκποτ**.
- **Στατιστικά αριθμών**: καθυστερημένοι, συχνοί και σπάνιοι αριθμοί (από όλο το ιστορικό από το 2012).
- **Γεννήτρια δελτίων**: service που φτιάχνει δελτίο 1–12 στηλών με αλγόριθμο της επιλογής σου και επιστρέφει τις στήλες και το συνολικό κόστος (2,50 € ανά στήλη).

Δεν χρειάζεται λογαριασμός ούτε API key. Τα δεδομένα έρχονται από την Allwyn και την επίσημη υπηρεσία του EuroJackpot.
Το ιστορικό είναι ήδη ενσωματωμένο, οπότε δουλεύει αμέσως και χωρίς internet.

Είναι η αδελφή ενσωμάτωση της εφαρμογής Windows
[EuroJackpot Analyzer](https://github.com/VeZReVouLiS/EuroJackpot-Analyzer): ίδιοι αλγόριθμοι, ίδια στατιστικά.

## Εγκατάσταση (HACS)
1. HACS → ⋮ → **Custom repositories** → πρόσθεσε `https://github.com/VeZReVouLiS/EuroJackpot-Analyzer-HA` με τύπο **Integration**.
2. Κατέβασε το **EuroJackpot Analyzer** και κάνε επανεκκίνηση του Home Assistant.
3. **Ρυθμίσεις → Συσκευές και υπηρεσίες → Προσθήκη ενσωμάτωσης → EuroJackpot Analyzer**. Ένα κλικ, χωρίς ρυθμίσεις.

Χειροκίνητα: αντίγραψε τον φάκελο `custom_components/eurojackpot_analyzer` στο `config/custom_components/`.

## Οντότητες
| Οντότητα | Τιμή | Attributes |
|---|---|---|
| `sensor.eurojackpot_analyzer_last_draw` | ημερομηνία τελευταίας κλήρωσης | `numbers`, `euro_numbers`, `text`, `draw_number`, `prizes` (νικητές όλων των χωρών / Ελλάδας και κέρδος ανά κατηγορία), `columns_greece`, `columns_all_countries` |
| `sensor.eurojackpot_analyzer_next_draw` | ημερομηνία και ώρα επόμενης κλήρωσης | `draw_number` |
| `sensor.eurojackpot_analyzer_jackpot` | τζάκποτ σε € | `next_draw` |
| `sensor.eurojackpot_analyzer_overdue_numbers` | οι 5 αριθμοί που καθυστερούν περισσότερο | `main` και `euro` με `draws_since`, `longest_gap`, `last_seen` |
| `sensor.eurojackpot_analyzer_frequent_numbers` | οι 5 συχνότεροι αριθμοί | `main` και `euro` με `count`, `percent` |
| `sensor.eurojackpot_analyzer_rare_numbers` | οι 5 σπανιότεροι αριθμοί | όπως παραπάνω |
| `sensor.eurojackpot_analyzer_generated_ticket` | στήλες του τελευταίου δελτίου | `columns`, `total_cost`, `algorithm`, `generated_at` |

Τα ονόματα εμφανίζονται στα ελληνικά ή στα αγγλικά ανάλογα με τη γλώσσα του HA.

## Service `eurojackpot_analyzer.generate_ticket`
| Πεδίο | Τιμές | Προεπιλογή |
|---|---|---|
| `columns` | 1–12 | 5 |
| `algorithm` | `auto_ticket`, `auto_column`, `random`, `hot`, `cold`, `overdue`, `weighted`, `balanced`, `smart` | `auto_ticket` |
| `period` | `all`, `10y`, `5y`, `3y`, `1y`, `last_100`, `last_50` | `all` |

Η απάντηση περιέχει `columns` (κάθε στήλη με `numbers`, `euro_numbers`, `algorithm`, `text`), `total_cost` και `price_per_column`.
Το αποτέλεσμα αποθηκεύεται και στο `sensor.eurojackpot_analyzer_generated_ticket` και στέλνεται το event `eurojackpot_analyzer_ticket_generated`.

Δοκίμασέ το από **Εργαλεία προγραμματιστή → Ενέργειες**:

```yaml
action: eurojackpot_analyzer.generate_ticket
data:
  columns: 6
  algorithm: auto_column
  period: 5y
response_variable: ticket
```

> Η κλήρωση είναι τυχαία. Τα στατιστικά δεν αυξάνουν τις πιθανότητες νίκης. Παίξε υπεύθυνα (18+).

## Παραδείγματα
**Κάρτα Markdown με την τελευταία κλήρωση**

```yaml
type: markdown
title: EuroJackpot Analyzer
content: >
  **{{ states('sensor.eurojackpot_analyzer_last_draw') }}**
  {{ state_attr('sensor.eurojackpot_analyzer_last_draw', 'text') }}

  Επόμενη: {{ as_timestamp(states('sensor.eurojackpot_analyzer_next_draw')) | timestamp_custom('%a %d/%m %H:%M') }}
  · Τζάκποτ {{ states('sensor.eurojackpot_analyzer_jackpot') | int | round(0) | string }} €
```

**Ειδοποίηση όταν βγει νέα κλήρωση**

```yaml
alias: EuroJackpot - νέα κλήρωση
triggers:
  - trigger: state
    entity_id: sensor.eurojackpot_analyzer_last_draw
actions:
  - action: notify.notify
    data:
      title: EuroJackpot Analyzer
      message: >
        Κλήρωση {{ states('sensor.eurojackpot_analyzer_last_draw') }}:
        {{ state_attr('sensor.eurojackpot_analyzer_last_draw', 'text') }}
```

**Δελτίο κάθε Τρίτη και Παρασκευή το πρωί**

```yaml
alias: EuroJackpot - πρόταση δελτίου
triggers:
  - trigger: time
    at: "09:00:00"
conditions:
  - condition: time
    weekday: [tue, fri]
actions:
  - action: eurojackpot_analyzer.generate_ticket
    data: { columns: 5, algorithm: auto_column }
    response_variable: t
  - action: notify.notify
    data:
      title: "Δελτίο {{ t.total_cost }} €"
      message: "{% for c in t.columns %}{{ c.text }}\n{% endfor %}"
```

## Επιλογές
**Ρυθμίσεις → EuroJackpot Analyzer → Ρύθμιση**: συχνότητα ανανέωσης (10–720 λεπτά, προεπιλογή 30) και τιμή ανά στήλη (2,50 €).
Οι αισθητήρες ανανεώνονται επιπλέον στις 21:20, 21:50, 22:20, 22:50, 23:20 και 23:50, μετά την κλήρωση.

## Για προγραμματιστές
Ο κοινός πυρήνας (`core/rules.py`, `core/stats.py`, `core/generators.py`) και το ιστορικό (`data/draws.json`) αντιγράφονται
αυτόματα από το [EuroJackpot-Analyzer](https://github.com/VeZReVouLiS/EuroJackpot-Analyzer) (`tools/sync_ha.ps1`). Μην τα
αλλάζεις εδώ.

```bash
python -m venv .venv && .venv/bin/pip install pytest-homeassistant-custom-component
.venv/bin/python -m pytest -q
```
