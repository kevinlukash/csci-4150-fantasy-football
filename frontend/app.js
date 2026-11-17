(function () {
  "use strict";

  var D = window.WAIVER_DATA;
  var $ = function (id) { return document.getElementById(id); };
  if (!D) { $("missing").hidden = false; document.querySelector("main").hidden = true; return; }

  var POSITIONS = ["QB", "RB", "WR", "TE", "K", "D/ST"];
  var PAGE = 75;
  var state = { pos: "ALL", q: "", onlyProj: true, hideInjured: false, sort: "weekProj", dir: -1, shown: PAGE };
  var byId = {};
  D.players.forEach(function (p) { byId[p.id] = p; });

  // ---------------------------------------------------------------- helpers

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(v, digits) {
    return v == null ? "–" : Number(v).toFixed(digits == null ? 1 : digits);
  }
  function words(key) {
    return key.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/([0-9])([A-Za-z])/g, "$1 $2")
      .replace(/^./, function (c) { return c.toUpperCase(); }).replace(/ To /g, " to ");
  }
  function day(ms) {
    if (!ms) return "–";
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function injuryLabel(v) {
    if (!v || v === "ACTIVE") return "";
    return { INJURY_RESERVE: "IR", QUESTIONABLE: "Q", DOUBTFUL: "D", OUT: "Out" }[v] || v;
  }
  function tile(value, label) {
    return '<div class="tile"><b>' + esc(value) + "</b><span>" + esc(label) + "</span></div>";
  }
  function change(v) {
    if (v == null || v === 0) return "";
    return ' <small class="' + (v > 0 ? "up" : "down") + '">' + (v > 0 ? "+" : "") + fmt(v) + "</small>";
  }
  function spark(trend) {
    // expert rank by week; a lower rank is better, so the line rises as the rank improves
    if (!trend || trend.length < 2) return "";
    var w = 70, h = 22, ys = trend.map(function (t) { return t[1]; });
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), span = hi - lo || 1;
    var pts = trend.map(function (t, i) {
      return (2 + (i * (w - 4)) / (trend.length - 1)).toFixed(1) + "," + (2 + ((t[1] - lo) / span) * (h - 4)).toFixed(1);
    });
    var first = trend[0], last = trend[trend.length - 1];
    return '<svg class="spark" width="' + w + '" height="' + h + '" role="img" aria-label="Expert rank week ' +
      first[0] + " " + first[1] + ", week " + last[0] + " " + last[1] + '"><polyline class="trend" points="' +
      pts.join(" ") + '"/></svg>';
  }

  // ---------------------------------------------------------------- board

  var COLUMNS = [
    { key: "name", label: "Player", text: true },
    { key: "weekProj", label: "Wk " + D.league.week + " proj", title: "ESPN projected points this week" },
    { key: "model", label: "Model", title: "Single-week model, scored from this week's projection" },
    { key: "avg", label: "Avg", title: "Average points per game this season" },
    { key: "total", label: "Total", title: "Season points to date" },
    { key: "owned", label: "Rostered", title: "Percent of ESPN leagues that roster the player" },
    { key: "started", label: "Started", title: "Percent of ESPN leagues that start the player" },
    { key: "leagueAdds", label: "League", title: "Adds and drops in this league this season" },
    { key: "trend", label: "Rank trend", nosort: true, title: "Average expert rank by week" }
  ];

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = D.players.filter(function (p) {
      if (state.pos !== "ALL" && p.pos !== state.pos) return false;
      if (state.onlyProj && p.weekProj == null) return false;
      if (state.hideInjured && injuryLabel(p.injury)) return false;
      if (q && (p.name + " " + p.team).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var k = state.sort, dir = state.dir;
    rows.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "string") return dir * x.localeCompare(y);
      return dir * (x - y) || b.owned - a.owned;
    });
    return rows;
  }

  function renderChips() {
    var base = D.players.filter(function (p) { return !state.onlyProj || p.weekProj != null; });
    var html = ["ALL"].concat(POSITIONS).map(function (pos) {
      var n = pos === "ALL" ? base.length : base.filter(function (p) { return p.pos === pos; }).length;
      return '<button class="chip" data-pos="' + pos + '" aria-pressed="' + (state.pos === pos) + '">' +
        (pos === "ALL" ? "All" : pos) + "<small>" + n + "</small></button>";
    });
    $("pos-chips").innerHTML = html.join("");
  }

  function renderBoard() {
    var head = COLUMNS.map(function (c) {
      var cls = (c.text ? "" : "num") + (state.sort === c.key ? " sorted" : "");
      var arrow = state.sort === c.key ? (state.dir < 0 ? " ↓" : " ↑") : "";
      return '<th class="' + cls + '"' + (c.nosort ? "" : ' data-sort="' + c.key + '"') +
        (c.title ? ' title="' + esc(c.title) + '"' : "") + ">" + esc(c.label) + arrow + "</th>";
    });
    document.querySelector("#board thead").innerHTML = "<tr>" + head.join("") + "</tr>";

    var rows = filtered();
    var body = rows.slice(0, state.shown).map(function (p) {
      var inj = injuryLabel(p.injury);
      var league = p.leagueAdds || p.leagueDrops ? "+" + p.leagueAdds + " / −" + p.leagueDrops : "–";
      return '<tr tabindex="0" data-id="' + esc(p.id) + '">' +
        '<td class="player"><b>' + esc(p.name) + (inj ? '<span class="tag injury">' + esc(inj) + "</span>" : "") +
        "</b><span>" + esc(p.pos) + (p.posRank ? p.posRank : "") + " · " + esc(p.team) + "</span></td>" +
        '<td class="num"><b>' + fmt(p.weekProj) + "</b></td>" +
        '<td class="num">' + fmt(p.model) + "</td>" +
        '<td class="num">' + fmt(p.avg) + "</td>" +
        '<td class="num">' + fmt(p.total) + "</td>" +
        '<td class="num">' + fmt(p.owned) + "%" + change(p.ownedChange) +
        '<span class="bar"><i style="width:' + Math.max(0, Math.min(100, p.owned || 0)) + '%"></i></span></td>' +
        '<td class="num">' + fmt(p.started) + "%</td>" +
        '<td class="num">' + league + "</td>" +
        '<td class="num">' + spark(p.rankTrend) + "</td></tr>";
    });
    document.querySelector("#board tbody").innerHTML = body.join("") ||
      '<tr><td colspan="' + COLUMNS.length + '" class="muted">No players match these filters.</td></tr>';

    var foot = "Showing " + Math.min(state.shown, rows.length) + " of " + rows.length + " players.";
    if (rows.length > state.shown) foot += ' <button id="more">Show ' + PAGE + " more</button>";
    $("board-foot").innerHTML = foot;
  }

  function renderSummary() {
    var L = D.league, withProj = D.players.filter(function (p) { return p.weekProj != null; });
    var top = withProj.slice().sort(function (a, b) { return b.weekProj - a.weekProj; })[0];
    var claim = D.players.map(function (p) { return p.claimDate; }).filter(Boolean).sort()[0];
    $("league-line").textContent = L.name + " · " + L.season + " season · week " + L.week +
      " · export from " + (D.inventory.exportedAt || D.inventory.folder);
    $("summary").innerHTML =
      tile(D.players.length, "available players") +
      tile(withProj.length, "with a week " + L.week + " projection") +
      tile(top ? top.name : "–", top ? "top projection, " + fmt(top.weekProj) + " pts" : "top projection") +
      tile(claim ? day(claim) : "–", "next waiver run") +
      tile(D.activity.filter(function (m) { return m.action.indexOf("ADDED") >= 0; }).length, "league adds this season");
  }

  // ---------------------------------------------------------------- drawer

  function statList(obj) {
    var keys = Object.keys(obj || {});
    if (!keys.length) return '<p class="muted">Nothing in the export.</p>';
    return '<div class="stat-list">' + keys.map(function (k) {
      return "<div><span>" + esc(words(k)) + "</span><b>" + fmt(obj[k], obj[k] % 1 ? 2 : 0) + "</b></div>";
    }).join("") + "</div>";
  }

  function openPlayer(id) {
    var p = byId[id];
    if (!p) return;
    var inj = injuryLabel(p.injury);
    var html = "<h2>" + esc(p.name) + "</h2>" +
      '<p class="muted">' + esc(p.pos) + (p.posRank ? " rank " + p.posRank : "") + " · " + esc(p.team) +
      (inj ? ' · <span class="tag injury">' + esc(p.injury.replace(/_/g, " ").toLowerCase()) + "</span>" : "") +
      (p.claimDate ? " · on waivers until " + day(p.claimDate) : "") + "</p>" +
      '<div class="tiles">' +
      tile(fmt(p.weekProj), "week " + D.league.week + " projection") +
      tile(fmt(p.model), "model points") +
      tile(fmt(p.avg), "average this season") +
      tile(fmt(p.total), "season total") +
      tile(fmt(p.projTotal), "projected season total") +
      tile(fmt(p.owned) + "%", "rostered") +
      tile(fmt(p.started) + "%", "started") +
      tile(p.adp ? fmt(p.adp) : "–", "average draft pick") +
      tile(p.lastSeasonTotal != null ? fmt(p.lastSeasonTotal) : "–", "last season total") +
      "</div>";

    if (p.outlook) html += "<h3>Week " + p.outlookWeek + " outlook</h3><p>" + esc(p.outlook) + "</p>";
    if (p.rankTrend.length > 1) {
      html += "<h3>Expert rank by week</h3><p>" + p.rankTrend.map(function (t) {
        return "Wk " + t[0] + ": <b>" + t[1] + "</b>";
      }).join(" · ") + "</p>";
    }
    if (p.history.length) {
      html += '<h3>Weeks on a roster in this league</h3><div class="table-scroll"><table class="grid"><thead><tr>' +
        '<th>Week</th><th>Team</th><th>Slot</th><th>Opp</th><th class="num">Proj</th><th class="num">Points</th></tr></thead><tbody>' +
        p.history.map(function (h) {
          return "<tr><td>" + h.week + "</td><td>" + esc(h.team) + "</td><td>" + esc(h.slot) + "</td><td>" + esc(h.opp || "–") +
            '</td><td class="num">' + fmt(h.proj) + '</td><td class="num">' + fmt(h.pts) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    html += "<h3>Week " + D.league.week + " projected stats</h3>" + statList(p.weekProjStats);
    html += "<h3>Season stats</h3>" + statList(p.seasonStats);
    if (p.seasonOutlook) html += "<h3>Preseason outlook</h3><p>" + esc(p.seasonOutlook) + "</p>";

    $("drawer-body").innerHTML = html;
    $("drawer").hidden = false;
    $("scrim").hidden = false;
    $("drawer").scrollTop = 0;
    $("drawer-close").focus();
  }
  function closeDrawer() { $("drawer").hidden = true; $("scrim").hidden = true; }

  // ---------------------------------------------------------------- league tab

  function renderLeague() {
    var L = D.league, c = D.claims;
    var failed = Object.keys(c).filter(function (k) { return k.indexOf("FAILED") === 0; })
      .reduce(function (n, k) { return n + c[k]; }, 0);
    var teams = L.teams.slice().sort(function (a, b) { return a.waiverRank - b.waiverRank; });
    var html = '<div class="tiles">' +
      tile(c.EXECUTED || 0, "waiver claims that went through") +
      tile(failed, "claims that failed") +
      tile(c.PENDING || 0, "claims pending") +
      tile(c.CANCELED || 0, "claims cancelled") +
      tile(L.waiverDays.length ? L.waiverDays.length + " days a week" : "–", "waivers run, at " + L.waiverHour + ":00") +
      "</div>" +
      '<div class="cols"><div><h2>Waiver order</h2><div class="table-scroll"><table class="grid"><thead><tr>' +
      '<th class="num">Order</th><th>Team</th><th class="num">Record</th><th class="num">Adds</th><th class="num">Drops</th></tr></thead><tbody>' +
      teams.map(function (t) {
        return '<tr><td class="num">' + t.waiverRank + "</td><td>" + esc(t.name) + '</td><td class="num">' + t.wins + "–" + t.losses +
          '</td><td class="num">' + t.adds + '</td><td class="num">' + t.drops + "</td></tr>";
      }).join("") + "</tbody></table></div></div>" +
      '<div><h2>Recent moves</h2><div class="controls"><select id="move-filter" aria-label="Filter moves">' +
      '<option value="">All moves</option><option value="ADDED">Adds</option><option value="DROPPED">Drops</option>' +
      '<option value="TRADE">Trades</option><option value="AVAILABLE">Dropped and still available</option></select></div>' +
      '<div class="table-scroll tall"><table class="grid"><thead><tr><th>Date</th><th>Team</th><th>Move</th><th>Player</th></tr></thead>' +
      '<tbody id="moves"></tbody></table></div></div></div>';
    $("tab-league").innerHTML = html;
    renderMoves("");
    $("move-filter").addEventListener("change", function (e) { renderMoves(e.target.value); });
  }

  function renderMoves(filter) {
    var label = { DROPPED: "Dropped", "WAIVER ADDED": "Waiver add", "FA ADDED": "Free agent add", TRADE_SENT: "Traded away", TRADE_RECEIVED: "Traded for" };
    var rows = D.activity.filter(function (m) {
      if (filter === "AVAILABLE") return m.action === "DROPPED" && m.available;
      return !filter || m.action.indexOf(filter) >= 0;
    });
    $("moves").innerHTML = rows.map(function (m) {
      var who = m.available ? '<button class="link" data-id="' + esc(m.id) + '">' + esc(m.player) + "</button>" : esc(m.player);
      return "<tr><td>" + day(m.date) + "</td><td>" + esc(m.team) + "</td><td>" + esc(label[m.action] || m.action) +
        "</td><td>" + who + ' <span class="muted">' + esc(m.pos || "") + " " + esc(m.proTeam || "") + "</span></td></tr>";
    }).join("") || '<tr><td colspan="4" class="muted">No moves.</td></tr>';
  }

  // ---------------------------------------------------------------- model tab

  function scatter(rows) {
    var S = 300, pad = 34, vals = [];
    rows.forEach(function (r) { vals.push(r.y, r.pred); });
    var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max.apply(null, vals) * 1.05 || 1;
    var at = function (v) { return pad + ((v - lo) / (hi - lo)) * (S - pad - 8); };
    var dots = rows.map(function (r) {
      return '<circle class="pt-' + r.split + '" r="3.5" cx="' + at(r.y).toFixed(1) + '" cy="' + (S - at(r.pred)).toFixed(1) +
        '"><title>' + esc(r.name) + ": actual " + fmt(r.y) + ", predicted " + fmt(r.pred) + " (" + r.split + ")</title></circle>";
    });
    return '<svg viewBox="0 0 ' + S + " " + S + '" width="100%" style="max-width:340px" role="img" aria-label="Predicted against actual points">' +
      '<line class="axis" x1="' + pad + '" y1="' + (S - pad) + '" x2="' + (S - 8) + '" y2="' + (S - pad) + '"/>' +
      '<line class="axis" x1="' + pad + '" y1="8" x2="' + pad + '" y2="' + (S - pad) + '"/>' +
      '<line class="ideal" x1="' + at(lo) + '" y1="' + (S - at(lo)) + '" x2="' + at(hi) + '" y2="' + (S - at(hi)) + '"/>' +
      dots.join("") +
      '<text x="' + (S / 2) + '" y="' + (S - 8) + '" text-anchor="middle">Actual points</text>' +
      '<text x="12" y="' + (S / 2) + '" text-anchor="middle" transform="rotate(-90 12 ' + (S / 2) + ')">Predicted points</text>' +
      '<text x="' + pad + '" y="' + (S - pad + 13) + '" text-anchor="middle">' + Math.round(lo) + "</text>" +
      '<text x="' + (S - 8) + '" y="' + (S - pad + 13) + '" text-anchor="end">' + Math.round(hi) + "</text></svg>";
  }

  function renderModel() {
    var html = '<p class="muted">Both models are scikit-learn <code>MLPRegressor(random_state=1, max_iter=10000, tol=0.0001)</code> ' +
      "with a 75/25 train/test split, as written in the notebooks, re-run on the export shown in the Export data tab.</p>";
    D.models.forEach(function (m) {
      var k = m.metrics;
      html += '<div class="card" style="margin-bottom:20px"><h2>' + esc(m.title) + "</h2>" +
        '<p class="muted">From <code>' + esc(m.notebook) + "</code>. Reads <code>" + esc(m.source) + "</code>, predicts " + esc(m.target) +
        ", from " + m.columns.length + " inputs." +
        (m.waiverScored ? " Scores " + m.waiverScored + " available players in the Model column." : "") + "</p>";
      if (!m.rows.length) { html += "<p>No usable rows in this export.</p></div>"; return; }
      if (k) {
        html += '<div class="cols"><div><div class="tiles">' +
          tile(k.r2Test.toFixed(3), "R² on held-out rows") +
          tile(k.r2Train.toFixed(3), "R² on training rows") +
          tile(k.maeTest, "average miss, points") +
          tile(k.nTrain + " / " + k.nTest, "training / held-out rows") +
          tile(k.iterations, "training passes") +
          tile(k.layers.join(", "), "hidden units") + "</div></div><div>" + scatter(m.rows) +
          '<div class="legend"><span><i style="background:var(--accent)"></i>Training</span>' +
          '<span><i style="background:var(--test)"></i>Held out</span><span>Dashed line: perfect prediction</span></div></div></div>';
      } else {
        html += "<p>Model numbers were not built. Re-run the build with scikit-learn to add them.</p>";
      }
      html += "<h3>Training data, " + m.rows.length + ' rows</h3><div class="table-scroll tall"><table class="grid"><thead><tr>' +
        "<th>Player</th><th>Pos</th><th title=\"Stat period each row was read from\">Period</th>" +
        m.columns.map(function (c) { return '<th class="num">' + esc(c) + "</th>"; }).join("") +
        '<th class="num">Actual</th>' + (k ? '<th class="num">Predicted</th><th class="num">Miss</th><th>Set</th>' : "") +
        "</tr></thead><tbody>" +
        m.rows.map(function (r) {
          return "<tr><td>" + esc(r.name) + "</td><td>" + esc(r.pos) + "</td><td>" + esc(r.period) + "</td>" +
            r.x.map(function (v) { return '<td class="num">' + fmt(v, 2) + "</td>"; }).join("") +
            '<td class="num"><b>' + fmt(r.y) + "</b></td>" +
            (k ? '<td class="num">' + fmt(r.pred) + '</td><td class="num">' + fmt(r.pred - r.y) +
              '</td><td><span class="tag ' + r.split + '">' + (r.split === "test" ? "held out" : "train") + "</span></td>" : "") + "</tr>";
        }).join("") + "</tbody></table></div></div>";
    });
    $("tab-model").innerHTML = html;
  }

  // ---------------------------------------------------------------- data tab

  function renderData() {
    var I = D.inventory, L = D.league;
    var html = '<div class="tiles">' + tile(I.exportedAt || "–", "export taken") + tile(I.files.length, "CSV files") +
      tile(I.files.reduce(function (n, f) { return n + f.rows; }, 0).toLocaleString(), "rows in total") +
      tile(I.allExports.length, "exports on disk") + tile(D.builtAt, "page data built") + "</div>" +
      '<div class="cols"><div class="card"><h2>Files in this export</h2><p class="muted"><code>' + esc(I.folder) + "</code></p>" +
      I.files.map(function (f) {
        return "<details><summary><b>" + esc(f.file) + '</b> <span class="muted">' + f.rows.toLocaleString() + " rows · " +
          f.columns.length + " columns · " + (f.bytes / 1e6).toFixed(1) + " MB</span></summary><p>" + esc(f.columns.join(", ")) + "</p></details>";
      }).join("") + "<h3>Export notes</h3><ul class=\"plain\">" +
      I.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul></div>" +
      '<div class="card"><h2>League settings</h2><p class="muted">' + esc(L.teamCount) + " teams · " + esc(L.scoringType) +
      " · " + (L.faab ? "FAAB bidding" : "waiver order, no bidding") + "</p><h3>Roster slots</h3><p>" +
      Object.keys(L.slots).map(function (s) { return esc(s) + " × " + L.slots[s]; }).join(" · ") + "</p>" +
      '<h3>Scoring rules</h3><div class="table-scroll tall"><table class="grid"><thead><tr><th>Rule</th><th class="num">Points</th></tr></thead><tbody>' +
      L.scoring.map(function (s) { return "<tr><td>" + esc(s.label) + '</td><td class="num">' + s.points + "</td></tr>"; }).join("") +
      "</tbody></table></div></div></div>";
    $("tab-data").innerHTML = html;
  }

  // ---------------------------------------------------------------- wiring

  function showTab(name) {
    document.querySelectorAll(".tabs button").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.dataset.tab === name));
    });
    document.querySelectorAll(".tab").forEach(function (s) { s.hidden = s.id !== "tab-" + name; });
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    window.scrollTo(0, 0);
  }

  document.querySelector(".tabs").addEventListener("click", function (e) {
    if (e.target.dataset.tab) showTab(e.target.dataset.tab);
  });
  $("pos-chips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-pos]");
    if (!b) return;
    state.pos = b.dataset.pos; state.shown = PAGE; renderChips(); renderBoard();
  });
  $("search").addEventListener("input", function (e) { state.q = e.target.value; state.shown = PAGE; renderBoard(); });
  $("only-proj").addEventListener("change", function (e) { state.onlyProj = e.target.checked; state.shown = PAGE; renderChips(); renderBoard(); });
  $("hide-injured").addEventListener("change", function (e) { state.hideInjured = e.target.checked; state.shown = PAGE; renderBoard(); });
  $("board").addEventListener("click", function (e) {
    var th = e.target.closest("th[data-sort]");
    if (th) {
      var k = th.dataset.sort;
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === "name" ? 1 : -1; }
      renderBoard();
      return;
    }
    var tr = e.target.closest("tr[data-id]");
    if (tr) openPlayer(tr.dataset.id);
  });
  $("board").addEventListener("keydown", function (e) {
    var tr = e.target.closest("tr[data-id]");
    if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openPlayer(tr.dataset.id); }
  });
  $("board-foot").addEventListener("click", function (e) {
    if (e.target.id === "more") { state.shown += PAGE; renderBoard(); }
  });
  $("tab-league").addEventListener("click", function (e) {
    if (e.target.dataset.id) openPlayer(e.target.dataset.id);
  });
  $("drawer-close").addEventListener("click", closeDrawer);
  $("scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

  renderSummary();
  renderChips();
  renderBoard();
  renderLeague();
  renderModel();
  renderData();
  if ($("tab-" + location.hash.slice(1))) showTab(location.hash.slice(1));
  if (location.hash.indexOf("#player-") === 0) openPlayer(location.hash.slice(8));
})();
