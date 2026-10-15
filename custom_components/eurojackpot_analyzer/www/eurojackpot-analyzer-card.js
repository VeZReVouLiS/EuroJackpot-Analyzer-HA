/*
 * EuroJackpot Analyzer - frontend (served and registered automatically by the integration).
 *
 *   Sidebar panel       eurojackpot-analyzer-panel        full screen, scales with the window, language button
 *   Lovelace cards      custom:eurojackpot-analyzer-last-draw-card | -stats-card | -ticket-card
 *
 * Plain custom elements, no framework and no build step. Everything is sized in `em`, so the panel can
 * scale the whole UI just by changing its font size, and the cards use container queries so they adapt
 * to the width of whatever holds them.
 */
const EJ_VERSION = "0.3.2";
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

/* language: the user's choice (button in the panel, remembered in this browser) beats the Home Assistant language */
const LANG_KEY = "eurojackpot_analyzer_lang";
const langPref = () => { try { return localStorage.getItem(LANG_KEY); } catch (e) { return null; } };
const setLangPref = (l) => { try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* private mode */ } };
const ALL_ELEMENTS = new Set();

const TEXT = {
  el: {
    last: "Τελευταία κλήρωση", next: "Επόμενη κλήρωση", jackpot: "Τζάκποτ", draw: "Κλήρωση",
    tier: "Κατηγορία", winners: "Επιτυχίες", greece: "Ελλάδα", prize: "Κέρδος", greekOnly: "μόνο Ελλάδα",
    columnsGr: "στήλες Ελλάδας", noData: "Δεν υπάρχουν δεδομένα ακόμα",
    heat: "Χάρτης καθυστέρησης", heatHint: "Πόσες κληρώσεις έχουν περάσει από την τελευταία εμφάνιση κάθε αριθμού",
    overdue: "Καθυστερούν περισσότερο", frequent: "Συχνότεροι", rare: "Σπανιότεροι", euro: "Αριθμοί Euro",
    since: "κλήρ.", analysed: "κληρώσεις στην ανάλυση",
    tipNum: (n, g, c, p) => `Αριθμός ${n}: ${g} κληρώσεις χωρίς εμφάνιση · βγήκε ${c} φορές (${p}%)`,
    ticket: "Δελτίο", columns: "Στήλες", algorithm: "Αλγόριθμος", generate: "Δημιούργησε δελτίο",
    perColumn: "ανά στήλη", column: "Στήλη", total: "Σύνολο δελτίου",
    empty: "Διάλεξε στήλες και αλγόριθμο και πάτα «Δημιούργησε δελτίο».",
    generating: "Δημιουργία…", disclaimer: "Η κλήρωση είναι τυχαία· τα στατιστικά δεν αυξάνουν τις πιθανότητες. Παίξε υπεύθυνα (18+).",
    refresh: "Ανανέωση", language: "Γλώσσα", panelSub: "Κληρώσεις · στατιστικά · δελτία",
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
    since: "draws", analysed: "draws analysed",
    tipNum: (n, g, c, p) => `Number ${n}: ${g} draws since last seen · drawn ${c} times (${p}%)`,
    ticket: "Ticket", columns: "Columns", algorithm: "Algorithm", generate: "Generate ticket",
    perColumn: "per column", column: "Column", total: "Ticket total",
    empty: "Pick the columns and an algorithm, then press “Generate ticket”.",
    generating: "Generating…", disclaimer: "Draws are random; statistics do not improve your odds. Play responsibly (18+).",
    refresh: "Refresh", language: "Language", panelSub: "Draws · statistics · tickets",
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
.wrap { padding: 1.15em; container-type: inline-size; }
.head { display: flex; align-items: center; gap: .85em; flex-wrap: wrap; justify-content: space-between; }
.title { display: flex; align-items: center; gap: .85em; min-width: 0; }
.logo { display: grid; place-items: center; width: 2.9em; height: 2.9em; border-radius: .85em; font-size: 1em; flex: none;
  background: linear-gradient(135deg, #fde68a, #f59e0b); color: #422006; box-shadow: 0 .4em 1.2em rgba(245,158,11,.35); }
.logo span { font-size: 1.55em; line-height: 1; }
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
.jp .when { text-align: right; font-size: .92em; color: var(--secondary-text-color); }
.jp .amt { font-size: clamp(1.7em, 9cqw, 2.9em); font-weight: 900; line-height: 1.1; letter-spacing: -.02em;
  background: linear-gradient(135deg, #f59e0b, #d97706 55%, #b45309); -webkit-background-clip: text; background-clip: text; color: transparent; }
.label { font-size: .86em; color: var(--secondary-text-color); font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: .98em; margin-top: .4em; }
th { text-align: right; font-size: .82em; color: var(--secondary-text-color); font-weight: 600; padding: .5em .6em; }
td { text-align: right; padding: .5em .6em; border-top: 1px solid var(--divider-color); font-variant-numeric: tabular-nums; }
th:first-child, td:first-child { text-align: left; font-weight: 700; white-space: nowrap; }
tr.gr td { background: rgba(52,211,153,.10); }
.tag { font-size: .68em; padding: .1em .6em; border-radius: 999px; background: rgba(245,158,11,.25); margin-left: .5em; font-weight: 700; }
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
@container (max-width: 400px) { .tag { display: none; } .col .tg { display: none; } .col .no { width: 1.5em; height: 1.5em; } .heat { gap: .2em; } .cell b { font-size: 1em; } }
`;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

class EJBase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cfg = {};
  }
  connectedCallback() { ALL_ELEMENTS.add(this); }
  disconnectedCallback() { ALL_ELEMENTS.delete(this); }
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
  /* the language changed (button / stored choice): draw again */
  relang() { this._sig = null; if (this._hass) this.hass = this._hass; }
  getCardSize() { return 4; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }
  // the card option `language` wins, then the user's stored choice, then the Home Assistant language
  get lang() {
    const l = (this._cfg.language || langPref() || (this._hass && this._hass.language) || "en").toLowerCase();
    return l.startsWith("el") ? "el" : "en";
  }
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
        <div class="title"><div class="logo"><span>★</span></div>
          <div><b>EuroJackpot</b><span class="sub">${t.last} · ${esc(this.fmtDate(last.state))}${a.draw_number ? ` · #${esc(a.draw_number)}` : ""}</span></div></div>
      </div>
      <div class="balls nowrap" style="margin-top:1.1em">
        ${a.numbers.map((n) => this.ball(n, "lg")).join("")}<span class="sep"></span>${a.euro_numbers.map((n) => this.ball(n, "euro lg")).join("")}
      </div>
      ${jackpot !== null ? `<div class="jp"><div><div class="label">${t.jackpot}</div><div class="amt">${this.fmtMoney(jackpot, 0)}</div></div><div class="when">${esc(nextTxt)}</div></div>` : (nextTxt ? `<div class="sub" style="margin-top:.8em">${esc(nextTxt)}</div>` : "")}`;
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
      <div class="head"><div class="title"><div class="logo"><span>🎟️</span></div><div><b>${t.ticket}</b><span class="sub">× ${this.fmtMoney(price)} ${t.perColumn}</span></div></div></div>
      <div class="controls" style="margin-top:1em">
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
  background: linear-gradient(135deg, #fde68a, #f59e0b); color: #422006; box-shadow: 0 .4em 1.2em rgba(245,158,11,.35); }
.brand .logo span { font-size: 1.8em; line-height: 1; }
.brand h1 { margin: 0; font-size: 1.7em; line-height: 1.15; }
.brand .sub { color: var(--secondary-text-color); font-size: .95em; }
.tools { display: flex; align-items: center; gap: .7em; }
.seg { display: inline-flex; border: 1px solid var(--divider-color); border-radius: .8em; overflow: hidden; }
.seg button, .tool { font: inherit; font-weight: 700; color: inherit; background: var(--card-background-color); border: 0; padding: .55em 1em; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--divider-color); }
.seg button.on { background: linear-gradient(135deg, #7c5cff, #5b8def); color: #fff; }
.tool { border: 1px solid var(--divider-color); border-radius: .8em; }
.tool:hover, .seg button:not(.on):hover { filter: brightness(1.15); }
.cols { display: grid; gap: clamp(12px, 1.5vw, 32px); grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; }
@media (max-width: 1350px) { .cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cols > :nth-child(3) { grid-column: 1 / -1; } }
@media (max-width: 800px) { .cols { grid-template-columns: minmax(0, 1fr); } .cols > :nth-child(3) { grid-column: auto; } }
ha-menu-button { margin-right: .4em; }
`;

class EJPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
  }
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
  get lang() {
    const l = (langPref() || (this._hass && this._hass.language) || "en").toLowerCase();
    return l.startsWith("el") ? "el" : "en";
  }
  _build() {
    this._built = true;
    const t = TEXT[this.lang];
    this.shadowRoot.innerHTML = `<style>${PANEL_STYLE}</style>
      <div class="page">
        <div class="bar">
          <div class="brand"><ha-menu-button></ha-menu-button><div class="logo"><span>★</span></div>
            <div><h1>EuroJackpot Analyzer</h1><div class="sub" data-sub>${t.panelSub}</div></div></div>
          <div class="tools">
            <button class="tool" data-act="refresh" title="${t.refresh}">↻ <span data-refresh>${t.refresh}</span></button>
            <div class="seg" role="group" aria-label="${t.language}"><button data-lang="el">Ελληνικά</button><button data-lang="en">English</button></div>
          </div>
        </div>
        <div class="cols"></div>
      </div>`;
    const cols = this.shadowRoot.querySelector(".cols");
    this._cards = [document.createElement("eurojackpot-analyzer-last-draw-card"), document.createElement("eurojackpot-analyzer-stats-card"), document.createElement("eurojackpot-analyzer-ticket-card")];
    this._cards[0].setConfig({});
    this._cards[1].setConfig({});
    this._cards[2].setConfig({ columns: 5, algorithm: "auto_column" });
    for (const el of this._cards) cols.appendChild(el);
    this._menu = this.shadowRoot.querySelector("ha-menu-button");
    this._menu.hass = this._hass;
    this._menu.narrow = !!this._narrow;
    this._menu.style.display = this._narrow ? "" : "none";
    this.shadowRoot.querySelectorAll("[data-lang]").forEach((b) => { b.onclick = () => this._setLang(b.dataset.lang); });
    this.shadowRoot.querySelector('[data-act="refresh"]').onclick = () => {
      const ids = [ID.last].filter((i) => this._hass.states[i]);
      if (ids.length) this._hass.callService("homeassistant", "update_entity", { entity_id: ids });
    };
    this._paintLang();
  }
  /* instant language switch: remember the choice and redraw this panel and every card */
  _setLang(l) {
    setLangPref(l);
    this._paintLang();
    for (const el of ALL_ELEMENTS) if (el.relang) el.relang();
  }
  _paintLang() {
    const t = TEXT[this.lang], root = this.shadowRoot;
    root.querySelectorAll("[data-lang]").forEach((b) => b.classList.toggle("on", b.dataset.lang === this.lang));
    root.querySelector("[data-sub]").textContent = t.panelSub;
    root.querySelector("[data-refresh]").textContent = t.refresh;
  }
}

const CARDS = [
  ["eurojackpot-analyzer-last-draw-card", EJLastDrawCard, "EuroJackpot Analyzer – Τελευταία κλήρωση / Last draw", "Last draw numbers, jackpot, next draw and prizes."],
  ["eurojackpot-analyzer-stats-card", EJStatsCard, "EuroJackpot Analyzer – Στατιστικά / Statistics", "Overdue heat-map of the 50 numbers and rankings."],
  ["eurojackpot-analyzer-ticket-card", EJTicketCard, "EuroJackpot Analyzer – Δελτίο / Ticket", "Ticket generator with 1-12 columns."],
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
