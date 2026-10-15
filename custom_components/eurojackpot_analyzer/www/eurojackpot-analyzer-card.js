/*
 * EuroJackpot Analyzer - Lovelace cards (served and registered automatically by the integration).
 *   custom:eurojackpot-analyzer-last-draw-card   last draw, jackpot, next draw, prizes
 *   custom:eurojackpot-analyzer-stats-card       overdue map of the 50 numbers + rankings
 *   custom:eurojackpot-analyzer-ticket-card      ticket generator
 */
const EJ_VERSION = "0.2.1";
const DOMAIN = "eurojackpot_analyzer";
const ID = {
  last: `sensor.${DOMAIN}_last_draw`,
  next: `sensor.${DOMAIN}_next_draw`,
  jackpot: `sensor.${DOMAIN}_jackpot`,
  overdue: `sensor.${DOMAIN}_most_overdue_numbers`,
  frequent: `sensor.${DOMAIN}_most_frequent_numbers`,
  rare: `sensor.${DOMAIN}_least_frequent_numbers`,
  ticket: `sensor.${DOMAIN}_generated_ticket`,
};

const TEXT = {
  el: {
    last: "Τελευταία κλήρωση", next: "Επόμενη κλήρωση", jackpot: "Τζάκποτ", draw: "Κλήρωση",
    tier: "Κατηγορία", winners: "Επιτυχίες", greece: "Ελλάδα", prize: "Κέρδος", greekOnly: "μόνο Ελλάδα",
    columnsGr: "στήλες Ελλάδας", noData: "Δεν υπάρχουν δεδομένα ακόμα",
    heat: "Χάρτης καθυστέρησης", heatHint: "Πόσες κληρώσεις έχουν περάσει από την τελευταία εμφάνιση κάθε αριθμού",
    overdue: "Καθυστερούν περισσότερο", frequent: "Συχνότεροι", rare: "Σπανιότεροι", euro: "Euro αριθμοί",
    since: "κλήρ.", times: "φορές", analysed: "κληρώσεις στην ανάλυση",
    tipNum: (n, g, c, p) => `Αριθμός ${n}: ${g} κληρώσεις χωρίς εμφάνιση · βγήκε ${c} φορές (${p}%)`,
    ticket: "Δελτίο", columns: "Στήλες", algorithm: "Αλγόριθμος", generate: "Δημιούργησε δελτίο",
    perColumn: "ανά στήλη", column: "Στήλη", total: "Σύνολο δελτίου", empty: "Διάλεξε στήλες και αλγόριθμο και πάτα «Δημιούργησε δελτίο».",
    generating: "Δημιουργία…", disclaimer: "Η κλήρωση είναι τυχαία· τα στατιστικά δεν αυξάνουν τις πιθανότητες. Παίξε υπεύθυνα (18+).",
    algos: {
      auto_ticket: "Αυτόματος – ένας ανά δελτίο", auto_column: "Αυτόματος – ένας ανά στήλη", random: "Καθαρά τυχαίος",
      hot: "Συχνοί (hot)", cold: "Σπάνιοι (cold)", overdue: "Καθυστερημένοι", weighted: "Σταθμισμένος",
      balanced: "Ισορροπημένος", smart: "Έξυπνη κατανομή",
    },
    short: { random: "Τυχαίος", hot: "Hot", cold: "Cold", overdue: "Καθυστ.", weighted: "Σταθμ.", balanced: "Ισορρ.", smart: "Έξυπνος" },
  },
  en: {
    last: "Last draw", next: "Next draw", jackpot: "Jackpot", draw: "Draw",
    tier: "Tier", winners: "Winners", greece: "Greece", prize: "Prize", greekOnly: "Greece only",
    columnsGr: "Greek columns", noData: "No data yet",
    heat: "Overdue map", heatHint: "Draws since each number last came out",
    overdue: "Most overdue", frequent: "Most frequent", rare: "Least frequent", euro: "Euro numbers",
    since: "draws", times: "times", analysed: "draws analysed",
    tipNum: (n, g, c, p) => `Number ${n}: ${g} draws since last seen · drawn ${c} times (${p}%)`,
    ticket: "Ticket", columns: "Columns", algorithm: "Algorithm", generate: "Generate ticket",
    perColumn: "per column", column: "Column", total: "Ticket total", empty: "Pick the columns and an algorithm, then press “Generate ticket”.",
    generating: "Generating…", disclaimer: "Draws are random; statistics do not improve your odds. Play responsibly (18+).",
    algos: {
      auto_ticket: "Automatic – one per ticket", auto_column: "Automatic – one per column", random: "Pure random",
      hot: "Hot numbers", cold: "Cold numbers", overdue: "Overdue numbers", weighted: "Frequency-weighted",
      balanced: "Balanced", smart: "Smart shape",
    },
    short: { random: "Random", hot: "Hot", cold: "Cold", overdue: "Overdue", weighted: "Weighted", balanced: "Balanced", smart: "Smart" },
  },
};

const STYLE = `
:host { display: block; }
ha-card { position: relative; overflow: hidden; color: var(--primary-text-color); }
.wrap { padding: 16px; container-type: inline-size; }
.head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: space-between; }
.title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.logo { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; font-size: 22px; flex: none;
  background: linear-gradient(135deg, #fde68a, #f59e0b); color: #422006; box-shadow: 0 6px 18px rgba(245,158,11,.35); }
.title b { display: block; font-size: 1.15em; line-height: 1.2; }
.sub { color: var(--secondary-text-color); font-size: .85em; }
.hero { background: linear-gradient(135deg, rgba(124,92,255,.22), rgba(34,211,238,.10)); border-bottom: 1px solid var(--divider-color); }
.balls { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; }
.ballbox { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.cap { font-size: .72em; color: var(--secondary-text-color); line-height: 1; min-height: 1em; }
.ball { --b: 44px; width: var(--b); height: var(--b); border-radius: 50%; display: inline-grid; place-items: center;
  font-weight: 800; font-size: calc(var(--b) * .42); color: #fff; flex: none;
  background: radial-gradient(circle at 30% 25%, #8b9cff, #4338ca);
  box-shadow: inset 0 -4px 8px rgba(0,0,0,.25), 0 4px 12px rgba(67,56,202,.35); }
.ball.euro { color: #422006; background: radial-gradient(circle at 30% 25%, #fde68a, #f59e0b);
  box-shadow: inset 0 -4px 8px rgba(0,0,0,.15), 0 4px 12px rgba(245,158,11,.4); }
.ball.lg { --b: clamp(34px, 11cqw, 56px); } .ball.sm { --b: clamp(22px, 7.6cqw, 36px); } .ball.xs { --b: 26px; }
.balls.nowrap { flex-wrap: nowrap; gap: clamp(3px, 1.2cqw, 8px); }
.cap:empty { display: none; }
.ball.hit { outline: 3px solid #34d399; outline-offset: 2px; }
.sep { width: 6px; }
.jp { margin-top: 16px; padding: 12px 16px; border-radius: 14px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 16px;
  background: linear-gradient(135deg, rgba(245,158,11,.20), rgba(245,158,11,.05)); border: 1px solid rgba(245,158,11,.35); }
.jp .when { text-align: right; font-size: .85em; color: var(--secondary-text-color); }
.jp .amt { font-size: clamp(1.6em, 8cqw, 2.4em); font-weight: 900; line-height: 1.1; letter-spacing: -.02em;
  background: linear-gradient(135deg, #f59e0b, #d97706 55%, #b45309); -webkit-background-clip: text; background-clip: text; color: transparent; }
.label { font-size: .75em; text-transform: uppercase; letter-spacing: .06em; color: var(--secondary-text-color); font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: .9em; margin-top: 12px; }
th { text-align: right; font-size: .72em; text-transform: uppercase; letter-spacing: .05em; color: var(--secondary-text-color); font-weight: 600; padding: 6px 8px; }
td { text-align: right; padding: 6px 8px; border-top: 1px solid var(--divider-color); font-variant-numeric: tabular-nums; }
th:first-child, td:first-child { text-align: left; font-weight: 700; }
tr.gr td { background: rgba(52,211,153,.10); }
.tag { font-size: .7em; padding: 1px 7px; border-radius: 999px; background: rgba(245,158,11,.25); margin-left: 6px; font-weight: 700; }
h3 { margin: 0 0 8px; font-size: 1em; display: flex; align-items: center; gap: 8px; }
.heat { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 5px; }
.cell { border-radius: 9px; padding: 5px 0 4px; text-align: center; line-height: 1.1; border: 1px solid var(--divider-color); cursor: default; }
.cell b { display: block; font-size: 1.05em; } .cell i { font-style: normal; font-size: .72em; opacity: .85; }
.legend { display: flex; align-items: center; gap: 8px; font-size: .72em; color: var(--secondary-text-color); margin-top: 8px; }
.legend .bar { flex: 1; height: 6px; border-radius: 3px; background: linear-gradient(90deg, rgba(59,130,246,.9), rgba(59,130,246,.3), rgba(244,63,94,.35), rgba(244,63,94,.9)); }
.rank { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin-top: 18px; }
.sect + .sect { margin-top: 18px; }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; }
.stepper { display: inline-flex; align-items: center; gap: 8px; }
.stepper button { width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--divider-color); background: var(--secondary-background-color);
  color: inherit; font-size: 18px; font-weight: 800; cursor: pointer; }
.stepper output { min-width: 28px; text-align: center; font-size: 1.5em; font-weight: 800; }
select { font: inherit; color: inherit; background: var(--secondary-background-color); border: 1px solid var(--divider-color); border-radius: 10px; padding: 8px 10px; max-width: 100%; }
.go { margin-top: 14px; width: 100%; padding: 12px 16px; border: 0; border-radius: 12px; font: inherit; font-weight: 800; font-size: 1.05em; color: #fff; cursor: pointer;
  background: linear-gradient(135deg, #7c5cff, #5b8def); box-shadow: 0 8px 22px rgba(124,92,255,.4); }
.go[disabled] { opacity: .6; cursor: default; }
.col { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; padding: 8px 10px; margin-top: 8px; border-radius: 12px;
  background: var(--secondary-background-color); border: 1px solid var(--divider-color); }
.col { flex-wrap: nowrap; gap: clamp(6px, 2cqw, 12px); }
.col .no { font-weight: 800; flex: none; width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; font-size: .8em; background: var(--divider-color); }
.col .tg { margin-left: auto; flex: none; font-size: .7em; padding: 2px 9px; border-radius: 999px; background: rgba(124,92,255,.25); font-weight: 700; }
.total { margin-top: 12px; padding: 12px 16px; border-radius: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: linear-gradient(135deg, rgba(124,92,255,.35), rgba(34,211,238,.25)); border: 1px solid var(--divider-color); }
.total .sum { font-size: 1.9em; font-weight: 900; }
@container (max-width: 400px) { .tag { display: none; } .col .tg { display: none; } .col .no { width: 20px; height: 20px; } .heat { gap: 3px; } .cell b { font-size: .95em; } }
.empty { padding: 18px 8px; text-align: center; color: var(--secondary-text-color); }
.note { margin-top: 12px; font-size: .75em; color: var(--secondary-text-color); }
`;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

class EJBase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cfg = {};
  }
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
  getCardSize() { return 4; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }
  // language: the card option `language: el|en` wins, otherwise the language of the Home Assistant user
  get lang() { return (this._cfg.language || (this._hass && this._hass.language) || "en").toLowerCase().startsWith("el") ? "el" : "en"; }
  get tr() { return TEXT[this.lang]; }
  get locale() { return this.lang === "el" ? "el-GR" : "en-GB"; }
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
  shell(inner, cls = "") { return `<style>${STYLE}</style><ha-card><div class="wrap ${cls}">${inner}</div></ha-card>`; }
  _render() { this.shadowRoot.innerHTML = this.shell(`<div class="empty">${this.tr.noData}</div>`); }
}

/* ---------------------------------------------------------------- last draw */
class EJLastDrawCard extends EJBase {
  static get defaults() { return { show_prizes: true }; }
  static getStubConfig() { return { show_prizes: true }; }
  get ids() { return [this._cfg.entity || ID.last, ID.next, ID.jackpot]; }
  getCardSize() { return this._cfg.show_prizes ? 9 : 4; }
  _render() {
    const root = this.shadowRoot;
    if (!this._hass) { root.innerHTML = this.shell(""); return; }
    const t = this.tr;
    const last = this.st(this._cfg.entity || ID.last);
    if (!last || !last.attributes.numbers) { root.innerHTML = this.shell(`<div class="empty">${t.noData}</div>`); return; }
    const a = last.attributes;
    const next = this.st(ID.next), jp = this.st(ID.jackpot);
    let nextTxt = "";
    if (next && next.state && next.state !== "unknown" && next.state !== "unavailable") {
      const d = new Date(next.state);
      const hours = (d - new Date()) / 36e5;
      const rtf = new Intl.RelativeTimeFormat(this.locale, { numeric: "auto" });
      const rel = Math.abs(hours) < 48 ? rtf.format(Math.round(hours), "hour") : rtf.format(Math.round(hours / 24), "day");
      nextTxt = `${t.next}: ${d.toLocaleString(this.locale, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })} · ${rel}`;
    }
    const jackpot = jp && !isNaN(parseFloat(jp.state)) ? parseFloat(jp.state) : null;
    const head = `
      <div class="head">
        <div class="title"><div class="logo">★</div>
          <div><b>EuroJackpot</b><span class="sub">${t.last} · ${esc(this.fmtDate(last.state))}${a.draw_number ? ` · #${esc(a.draw_number)}` : ""}</span></div></div>
      </div>
      <div class="balls nowrap" style="margin-top:16px">
        ${a.numbers.map((n) => this.ball(n, "lg")).join("")}<span class="sep"></span>${a.euro_numbers.map((n) => this.ball(n, "euro lg")).join("")}
      </div>
      ${jackpot !== null ? `<div class="jp"><div><div class="label">${t.jackpot}</div><div class="amt">${this.fmtMoney(jackpot, 0)}</div></div><div class="when">${esc(nextTxt)}</div></div>` : (nextTxt ? `<div class="sub" style="margin-top:12px">${esc(nextTxt)}</div>` : "")}`;
    let prizes = "";
    if (this._cfg.show_prizes && Array.isArray(a.prizes) && a.prizes.length) {
      const rows = a.prizes.map((p) => {
        const gr = p.winners_greece;
        const greekOnly = p.tier === "1+1";
        return `<tr class="${gr > 0 ? "gr" : ""}"><td>${esc(p.tier.replace("+", " + "))}${greekOnly ? `<span class="tag">${t.greekOnly}</span>` : ""}</td>
          <td>${greekOnly ? "—" : this.fmtN(p.winners_all_countries)}</td><td>${gr == null ? "—" : this.fmtN(gr)}</td>
          <td>${p.prize_per_winner > 0 ? this.fmtMoney(p.prize_per_winner) : "—"}</td></tr>`;
      }).join("");
      prizes = `<table><thead><tr><th>${t.tier}</th><th>${t.winners}</th><th>${t.greece}</th><th>${t.prize}</th></tr></thead><tbody>${rows}</tbody></table>
        ${a.columns_greece ? `<div class="note">${this.fmtN(a.columns_greece)} ${t.columnsGr}</div>` : ""}`;
    }
    root.innerHTML = `<style>${STYLE}</style><ha-card><div class="wrap hero">${head}</div>${prizes ? `<div class="wrap">${prizes}</div>` : ""}</ha-card>`;
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
      return `<div><div class="label" style="margin-bottom:8px">${label}</div>
        <div class="balls">${attrs.main.slice(0, 5).map((x) => this.ball(x.number, "sm", cap(x))).join("")}<span class="sep"></span>${attrs.euro.slice(0, 2).map((x) => this.ball(x.number, "euro sm", cap(x))).join("")}</div></div>`;
    };
    root.innerHTML = this.shell(`
      <div class="head"><div class="title"><div class="logo">📊</div><div><b>${t.heat}</b><span class="sub">${t.heatHint}</span></div></div>
        <span class="sub">${od.attributes.draws_analysed ? this.fmtN(od.attributes.draws_analysed) + " " + t.analysed : ""}</span></div>
      <div class="sect" style="margin-top:14px"><div class="heat">${cells}</div>
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
    super.setConfig(cfg);
  }
  async _generate() {
    this._busy = true;
    this._render();
    try {
      await this._hass.callService(DOMAIN, "generate_ticket", { columns: this._cols, algorithm: this._algo, period: this._cfg.period || "all" });
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
        <div class="sum">${this.fmtMoney(a.total_cost)}</div></div>`;
    }
    root.innerHTML = this.shell(`
      <div class="head"><div class="title"><div class="logo">🎟️</div><div><b>${t.ticket}</b><span class="sub">× ${this.fmtMoney(price)} ${t.perColumn}</span></div></div></div>
      <div class="controls" style="margin-top:14px">
        <div class="stepper"><span class="label">${t.columns}</span><button data-act="minus" aria-label="-">−</button><output>${this._cols}</output><button data-act="plus" aria-label="+">+</button></div>
        <label class="stepper"><span class="label">${t.algorithm}</span><select data-act="algo">${algoOpts}</select></label>
      </div>
      <button class="go" data-act="go" ${this._busy ? "disabled" : ""}>🎲 ${this._busy ? t.generating : t.generate}</button>
      <div class="sect">${result}</div>
      <div class="note">${t.disclaimer}</div>`);
    const q = (s) => root.querySelector(s);
    q('[data-act="minus"]').onclick = () => { this._cols = Math.max(1, this._cols - 1); this._render(); };
    q('[data-act="plus"]').onclick = () => { this._cols = Math.min(12, this._cols + 1); this._render(); };
    q('[data-act="algo"]').onchange = (e) => { this._algo = e.target.value; };
    q('[data-act="go"]').onclick = () => this._generate();
  }
}

const CARDS = [
  ["eurojackpot-analyzer-last-draw-card", EJLastDrawCard, "EuroJackpot Analyzer – Τελευταία κλήρωση / Last draw", "Last draw numbers, jackpot, next draw and prizes."],
  ["eurojackpot-analyzer-stats-card", EJStatsCard, "EuroJackpot Analyzer – Στατιστικά / Statistics", "Overdue heat-map of the 50 numbers and rankings."],
  ["eurojackpot-analyzer-ticket-card", EJTicketCard, "EuroJackpot Analyzer – Δελτίο / Ticket", "Ticket generator with 1-12 columns."],
];
window.customCards = window.customCards || [];
for (const [tag, cls, name, description] of CARDS) {
  if (!customElements.get(tag)) customElements.define(tag, cls);
  window.customCards.push({ type: tag, name, description, preview: true, documentationURL: "https://github.com/VeZReVouLiS/EuroJackpot-Analyzer-HA" });
}
console.info(`%c EuroJackpot Analyzer %c cards ${EJ_VERSION} `, "background:#f59e0b;color:#422006;font-weight:700", "background:#4338ca;color:#fff");
