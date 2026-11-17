(function () {
  "use strict";

  var D = window.WAIVER_DATA;
  var $ = function (id) { return document.getElementById(id); };
  if (!D) { $("missing").hidden = false; document.querySelector("main").hidden = true; return; }

  var POSITIONS = ["QB", "RB", "WR", "TE", "K", "D/ST"];
  var POS_WORD = { QB: "quarterback", RB: "running back", WR: "wide receiver", TE: "tight end", K: "kicker", "D/ST": "defense" };
  var PAGE = 60;
  var WEEK = D.league.week;
  var state = { pos: "ALL", q: "", onlyProj: true, hideInjured: false, sort: "weekProj", dir: -1, shown: PAGE };
  var byId = {};
  D.players.forEach(function (p) { byId[p.id] = p; p.opp = p.next && p.next.length ? p.next[0][1] : undefined; });

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
  function healthy(p) {
    return ["OUT", "INJURY_RESERVE", "DOUBTFUL"].indexOf(p.injury) < 0;
  }
  function tile(value, label) {
    return '<div class="tile"><b>' + esc(value) + "</b><span>" + esc(label) + "</span></div>";
  }
  function change(v) {
    if (v == null || Math.abs(v) < 0.05) return "";
    return ' <small class="' + (v > 0 ? "up" : "down") + '">' + (v > 0 ? "+" : "") + fmt(v) + "</small>";
  }

  // Faces and logos come from ESPN's image host, keyed by the same player id
  // and team abbreviation the export uses. Initials show if an image is missing.
  function logoUrl(team) {
    if (!team || team === "None" || team === "FA") return "";
    return "https://a.espncdn.com/i/teamlogos/nfl/500/" + encodeURIComponent(team.toLowerCase()) + ".png";
  }
  function face(p, size) {
    var initials = p.name.split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase();
    var logo = logoUrl(p.team), isTeam = p.pos === "D/ST";
    var src = isTeam ? logo : "https://a.espncdn.com/i/headshots/nfl/players/full/" + encodeURIComponent(p.id) + ".png";
    return '<span class="face"' + (size ? ' style="--s:' + size + 'px"' : "") + "><i>" + esc(initials) + "</i>" +
      (src ? '<img class="head' + (isTeam ? " crest" : "") + '" loading="lazy" alt="" src="' + src + '" onerror="this.remove()">' : "") +
      (!isTeam && logo ? '<img class="logo" loading="lazy" alt="" src="' + logo + '" onerror="this.remove()">' : "") + "</span>";
  }
  function oppText(p) {
    if (p.opp === undefined) return "";
    return p.opp ? "vs " + p.opp : "bye";
  }
  function who(p, extra) {
    var inj = injuryLabel(p.injury);
    return '<div class="who">' + face(p) + '<div class="who-text"><b>' + esc(p.name) +
      (inj ? '<span class="tag injury">' + esc(inj) + "</span>" : "") + "</b><span>" + esc(p.pos) +
      (p.posRank ? " #" + p.posRank : "") + " · " + esc(p.team) + (extra ? " · " + esc(extra) : "") + "</span></div></div>";
  }
  function spark(trend) {
    // expert rank by week; a lower rank is better, so the line rises as the rank improves
    if (!trend || trend.length < 2) return "";
    var w = 64, h = 22, ys = trend.map(function (t) { return t[1]; });
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
    { key: "weekProj", label: "Wk " + WEEK + " proj", title: "ESPN projected points this week" },
    { key: "model", label: "Model", title: "Single-week model, scored from this week's projection" },
    { key: "avg", label: "Avg", title: "Average points per game this season" },
    { key: "owned", label: "Rostered", title: "Percent of ESPN leagues that roster the player, with the latest change" },
    { key: "trend", label: "Rank trend", nosort: true, cls: "hide-sm", title: "Average expert rank by week" }
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
    $("pos-chips").innerHTML = ["ALL"].concat(POSITIONS).map(function (pos) {
      var n = pos === "ALL" ? base.length : base.filter(function (p) { return p.pos === pos; }).length;
      return '<button class="chip" data-pos="' + pos + '" aria-pressed="' + (state.pos === pos) + '">' +
        (pos === "ALL" ? "All" : pos) + "<small>" + n + "</small></button>";
    }).join("");
  }

  function renderBoard() {
    document.querySelector("#board thead").innerHTML = "<tr>" + COLUMNS.map(function (c) {
      var cls = (c.text ? "" : "num") + (state.sort === c.key ? " sorted" : "") + (c.cls ? " " + c.cls : "");
      var arrow = state.sort === c.key ? (state.dir < 0 ? " ↓" : " ↑") : "";
      return '<th class="' + cls + '"' + (c.nosort ? "" : ' data-sort="' + c.key + '"') +
        (c.title ? ' title="' + esc(c.title) + '"' : "") + ">" + esc(c.label) + arrow + "</th>";
    }).join("") + "</tr>";

    var rows = filtered();
    document.querySelector("#board tbody").innerHTML = rows.slice(0, state.shown).map(function (p) {
      return '<tr tabindex="0" data-id="' + esc(p.id) + '"><td>' + who(p, oppText(p)) + "</td>" +
        '<td class="num big">' + fmt(p.weekProj) + "</td>" +
        '<td class="num">' + fmt(p.model) + "</td>" +
        '<td class="num">' + fmt(p.avg) + "</td>" +
        '<td class="num">' + fmt(p.owned) + "%" + change(p.ownedChange) +
        '<span class="bar"><i style="width:' + Math.max(0, Math.min(100, p.owned || 0)) + '%"></i></span></td>' +
        '<td class="num hide-sm">' + spark(p.rankTrend) + "</td></tr>";
    }).join("") || '<tr><td colspan="' + COLUMNS.length + '" class="muted">No players match these filters.</td></tr>';

    $("board-count").textContent = rows.length + " of " + D.players.length + " available players";
    $("board-foot").innerHTML = rows.length > state.shown
      ? "Showing " + state.shown + ' of ' + rows.length + '. <button id="more">Show ' + PAGE + " more</button>" : "";
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
    var html = '<div class="drawer-hero">' + face(p, 84) + "<div><h2>" + esc(p.name) + "</h2><p>" +
      esc(p.pos) + (p.posRank ? " #" + p.posRank : "") + " · " + esc(p.team) +
      (injuryLabel(p.injury) ? " · " + esc(p.injury.replace(/_/g, " ").toLowerCase()) : "") +
      (p.claimDate ? " · on waivers until " + day(p.claimDate) : "") + "</p></div></div>" +
      '<div class="drawer-pad"><div class="tiles">' +
      tile(fmt(p.weekProj), "week " + WEEK + " projection") +
      tile(fmt(p.model), "model points") +
      tile(fmt(p.avg), "average this season") +
      tile(fmt(p.total), "season total") +
      tile(fmt(p.owned) + "%", "rostered") +
      tile(fmt(p.started) + "%", "started") +
      tile("+" + p.leagueAdds + " / −" + p.leagueDrops, "adds / drops in league") +
      tile(p.adp ? fmt(p.adp) : "–", "average draft pick") +
      tile(p.lastSeasonTotal != null ? fmt(p.lastSeasonTotal) : "–", "last season total") +
      "</div>";

    if (p.next && p.next.length) {
      html += '<h3>Upcoming games</h3><div class="next">' + p.next.map(function (g) {
        return "<span>" + (g[1] ? '<img alt="" src="' + logoUrl(g[1]) + '" onerror="this.remove()">' : "") +
          "Wk " + g[0] + " · " + (g[1] ? esc(g[1]) : "bye") + "</span>";
      }).join("") + "</div>";
    }
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
    html += "<h3>Week " + WEEK + " projected stats</h3>" + statList(p.weekProjStats);
    html += "<h3>Season stats</h3>" + statList(p.seasonStats);
    if (p.seasonOutlook) html += "<h3>Preseason outlook</h3><p>" + esc(p.seasonOutlook) + "</p>";
    html += "</div>";

    $("drawer-body").innerHTML = html;
    $("drawer").hidden = false;
    $("scrim").hidden = false;
    $("drawer").scrollTop = 0;
    $("drawer-close").focus();
  }
  function closeDrawer() { $("drawer").hidden = true; $("scrim").hidden = true; }

  // ---------------------------------------------------------------- ask the decider
  //
  // Answers come from the export alone: the available pool, the chosen team's
  // roster, ESPN's projection and the season average. To put an LLM in front of
  // it later, define window.WAIVER_ASK(question, context) returning text (or a
  // promise of text); the page calls it and falls back to the answer below.

  var TEAM_KEY = "waiverDecider.myTeam";
  var myTeam = null;
  var rostered = [];
  D.league.teams.forEach(function (t) {
    (t.roster || []).forEach(function (r) { r.fantasyTeam = t.name; rostered.push(r); });
  });

  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(); }
  var nameIndex = D.players.map(function (p) { return { p: p, avail: true }; })
    .concat(rostered.map(function (p) { return { p: p, avail: false }; }))
    .map(function (e) {
      e.n = norm(e.p.name);
      var parts = e.n.split(" ").filter(function (w) { return ["jr", "sr", "ii", "iii", "iv", "dst"].indexOf(w) < 0; });
      e.last = parts[parts.length - 1] || "";
      return e;
    });

  function mentioned(text) {
    var t = " " + norm(text) + " ";
    var hits = nameIndex.filter(function (e) { return t.indexOf(" " + e.n + " ") >= 0; });
    if (!hits.length) {
      hits = nameIndex.filter(function (e) { return e.last.length >= 4 && t.indexOf(" " + e.last + " ") >= 0; });
      hits.sort(function (a, b) { return value(b.p) - value(a.p); });
      var seenLast = {};
      hits = hits.filter(function (e) { if (seenLast[e.last]) return false; seenLast[e.last] = 1; return true; });
    }
    var seen = {};
    return hits.filter(function (e) { if (seen[e.p.id]) return false; seen[e.p.id] = 1; return true; }).slice(0, 2);
  }

  // Drop what the manager says they do NOT want ("I don't need a running back,
  // show me tight ends") so the position that is left is the one being asked for.
  function withoutNegated(text) {
    return text.toLowerCase().replace(/\b(?:don'?t|do not|not|no|without)\b[^,.;!?]*?(?=,|\.|;|!|\?|\bbut\b|\bshow\b|\bgive\b|$)/g, " ");
  }

  function posFrom(text) {
    var t = withoutNegated(text);
    if (/\bqbs?\b|quarterback/.test(t)) return "QB";
    if (/\brbs?\b|running ?back/.test(t)) return "RB";
    if (/\bwrs?\b|receiver|wideout/.test(t)) return "WR";
    if (/\btes?\b|tight ?end/.test(t)) return "TE";
    if (/kicker|\bk\b/.test(t)) return "K";
    if (/d\/?st\b|defen[cs]e/.test(t)) return "D/ST";
    return null;
  }

  // One number per available player: this week's projection weighted with what
  // the player has averaged. The average counts for at most 1.5x the projection,
  // so one big game does not carry a player ESPN expects little from.
  function value(p) {
    if (p.weekProj == null) return p.avg || 0;
    return 0.6 * p.weekProj + 0.4 * Math.min(p.avg || 0, 1.5 * p.weekProj);
  }
  // What a rostered player is worth keeping for: the better of the season
  // average and this week's projection, so a bye or a knock does not make a
  // starter look droppable.
  function keep(r) {
    return Math.max(r.avg || 0, r.weekProj || 0);
  }
  function pool(pos) {
    return D.players.filter(function (p) { return p.pos === pos && p.weekProj != null && healthy(p); })
      .sort(function (a, b) { return value(b) - value(a); });
  }
  function mine(pos) {
    if (!myTeam) return [];
    return myTeam.roster.filter(function (r) { return r.pos === pos; })
      .sort(function (a, b) { return keep(b) - keep(a); });
  }
  function droppable(pos) {
    var list = mine(pos).filter(function (r) { return r.slot !== "IR"; });
    return list[list.length - 1] || null;
  }
  function usage(p) {
    var s = p.weekProjStats || {}, bits = [];
    if (p.pos === "QB" && s.passingAttempts) bits.push(fmt(s.passingAttempts) + " pass attempts");
    if (s.rushingAttempts >= 1 && p.pos !== "QB") bits.push(fmt(s.rushingAttempts) + " carries");
    if (s.receivingTargets >= 1) bits.push(fmt(s.receivingTargets) + " targets");
    return bits.join(", ");
  }

  function pick(p, opts) {
    opts = opts || {};
    var avail = !!byId[p.id];
    var sub = [p.pos + " · " + p.team];
    if (avail && oppText(p)) sub.push(oppText(p));
    if (opts.sub) sub.push(opts.sub); else if (avail && usage(p)) sub.push(usage(p) + " projected");
    var inj = injuryLabel(p.injury);
    return '<button class="pick" type="button"' + (avail ? ' data-id="' + esc(p.id) + '"' : " disabled") + ">" +
      (opts.rank ? '<span class="rank">' + opts.rank + "</span>" : "") + face(p, 36) +
      '<span class="who-text"><b>' + esc(p.name) + (inj ? '<span class="tag injury">' + esc(inj) + "</span>" : "") +
      "</b><span>" + esc(sub.join(" · ")) + "</span></span>" +
      '<span class="pts">' + fmt(p.weekProj) + "<small>avg " + fmt(p.avg) + "</small></span></button>";
  }

  var METHOD = '<p class="note">Ranked on 60% this week\'s ESPN projection and 40% season average. A pickup has to beat ' +
    "the better of a rostered player\'s average and projection. Players listed out, doubtful or on IR are left off. Numbers are from the " + esc(D.inventory.exportedAt || "latest") + " export.</p>";
  var NEED_TEAM = "<p>Pick your team at the top and I can weigh this against your roster.</p>";

  function topAt(pos) {
    var list = pool(pos).slice(0, 5);
    if (!list.length) return "<p>No healthy " + POS_WORD[pos] + " with a projection is available this week.</p>";
    var html = "<p>Top available " + POS_WORD[pos] + "s for week " + WEEK + ":</p>" +
      list.map(function (p, i) { return pick(p, { rank: i + 1 }); }).join("");
    if (myTeam) {
      var have = mine(pos), hurt = have.filter(function (r) { return !healthy(r); });
      var out = droppable(pos), best = list[0];
      if (hurt.length) {
        html += "<p>On your roster, " + hurt.map(function (r) {
          return "<b>" + esc(r.name) + "</b> is " + esc(r.injury.replace(/_/g, " ").toLowerCase());
        }).join(" and ") + ".</p>";
      }
      if (out) {
        var gain = value(best) - keep(out);
        html += gain > 0.5
          ? '<p><b class="call">Add ' + esc(best.name) + "</b> and drop " + esc(out.name) + " (" + fmt(out.weekProj) +
            " projected, " + fmt(out.avg) + " average). That rates about " + fmt(gain) + " points better.</p>"
          : "<p>None of these rates above " + esc(out.name) + ", your lowest-rated " + POS_WORD[pos] +
            ", so <b class=\"call\">hold</b> unless you need the depth.</p>";
      } else {
        html += '<p>You have no ' + POS_WORD[pos] + ' on your roster, so <b class="call">add ' + esc(best.name) + "</b>.</p>";
      }
    }
    return html + METHOD;
  }

  function upgrades() {
    if (!myTeam) {
      var all = D.players.filter(function (p) { return p.weekProj != null && healthy(p) && p.pos !== "K" && p.pos !== "D/ST"; })
        .sort(function (a, b) { return value(b) - value(a); }).slice(0, 5);
      return "<p>The best available players this week, any position:</p>" +
        all.map(function (p, i) { return pick(p, { rank: i + 1 }); }).join("") + NEED_TEAM + METHOD;
    }
    var swaps = [];
    POSITIONS.forEach(function (pos) {
      var best = pool(pos)[0], out = droppable(pos);
      if (!best) return;
      var gain = out ? value(best) - keep(out) : value(best);
      if (gain > 0.5) swaps.push({ add: best, drop: out, gain: gain });
    });
    swaps.sort(function (a, b) { return b.gain - a.gain; });
    if (!swaps.length) {
      return "<p>Nobody available rates above the lowest-rated player at the same position on <b>" + esc(myTeam.name) +
        '</b>. <b class="call">Stand pat</b> this week.</p>' + METHOD;
    }
    return "<p>Best swaps for <b>" + esc(myTeam.name) + "</b>, biggest gain first. Each one beats a player you already have at that position:</p>" +
      swaps.slice(0, 4).map(function (s, i) {
        return pick(s.add, { rank: i + 1, sub: s.drop ? "drop " + s.drop.name + " · +" + fmt(s.gain) : "open spot · +" + fmt(s.gain) });
      }).join("") + METHOD;
  }

  function verdict(entry) {
    var p = entry.p;
    if (!entry.avail) {
      return pick(p) + "<p><b>" + esc(p.name) + "</b> is on " + esc(p.fantasyTeam) + "'s roster, so not available." +
        (myTeam && p.fantasyTeam === myTeam.name ? " Ask “who should I drop?” to see how your roster rates." : "") + "</p>";
    }
    var list = pool(p.pos), rank = list.indexOf(p) + 1;
    var html = pick(p) + "<p>" + (rank ? "Rates #" + rank + " of " + list.length + " available " + POS_WORD[p.pos] + "s this week. " : "") +
      "Rostered in " + fmt(p.owned) + "% of ESPN leagues" +
      (p.ownedChange ? ", " + (p.ownedChange > 0 ? "up " : "down ") + fmt(Math.abs(p.ownedChange)) + " points" : "") + "." +
      (p.model != null ? " Our model has " + fmt(p.model) + " points." : "") + "</p>";
    if (!healthy(p)) {
      return html + '<p><b class="call">Pass for now.</b> Listed ' + esc(p.injury.replace(/_/g, " ").toLowerCase()) + ", so a stash at best.</p>";
    }
    if (p.weekProj == null) return html + '<p><b class="call">Pass.</b> ESPN has no projection for this week.</p>';
    if (myTeam) {
      var out = droppable(p.pos), gain = out ? value(p) - keep(out) : value(p);
      html += gain > 0.5
        ? '<p><b class="call">Add.</b> ' + (out ? "Drop " + esc(out.name) + " (" + fmt(out.weekProj) + " projected, " + fmt(out.avg) +
          " average); this rates about " + fmt(gain) + " points better." : "You have no " + POS_WORD[p.pos] + " rostered.") + "</p>"
        : '<p><b class="call">Pass.</b> Every ' + POS_WORD[p.pos] + " on your roster rates higher; the closest is " + esc(out.name) + ".</p>";
    } else {
      html += rank && rank <= 5 ? '<p><b class="call">Worth a claim</b> if you need a ' + POS_WORD[p.pos] + ".</p>"
        : rank && rank <= 15 ? '<p><b class="call">Depth option.</b> Fine as a bench add, not a starter.</p>'
        : '<p><b class="call">Leave on the wire.</b> Better options are available.</p>';
      html += NEED_TEAM;
    }
    return html + METHOD;
  }

  function compare(a, b) {
    var hi = value(a.p) >= value(b.p) ? a : b, lo = hi === a ? b : a;
    var html = pick(a.p) + pick(b.p) + '<p><b class="call">' + esc(hi.p.name) + "</b> rates higher: " + fmt(hi.p.weekProj) +
      " projected and " + fmt(hi.p.avg) + " average, against " + fmt(lo.p.weekProj) + " and " + fmt(lo.p.avg) + " for " + esc(lo.p.name) + ".</p>";
    [a, b].forEach(function (e) {
      if (!e.avail) html += "<p>" + esc(e.p.name) + " is on " + esc(e.p.fantasyTeam) + "'s roster.</p>";
      else if (!healthy(e.p)) html += "<p>" + esc(e.p.name) + " is listed " + esc(e.p.injury.replace(/_/g, " ").toLowerCase()) + ".</p>";
    });
    return html + METHOD;
  }

  function trending() {
    var list = D.players.filter(function (p) { return p.weekProj != null && p.ownedChange > 0; })
      .sort(function (a, b) { return b.ownedChange - a.ownedChange; }).slice(0, 5);
    if (!list.length) return "<p>No available player gained roster share in this export.</p>";
    return "<p>Available players being added fastest across ESPN leagues:</p>" + list.map(function (p, i) {
      return pick(p, { rank: i + 1, sub: "rostered " + fmt(p.owned) + "%, up " + fmt(p.ownedChange) });
    }).join("");
  }

  function dropAdvice() {
    if (!myTeam) return NEED_TEAM;
    var list = myTeam.roster.filter(function (r) { return r.slot !== "IR"; })
      .sort(function (a, b) { return keep(a) - keep(b); }).slice(0, 4);
    return "<p>The lowest-rated players on <b>" + esc(myTeam.name) + "</b> this week:</p>" +
      list.map(function (r, i) { return pick(r, { rank: i + 1, sub: r.slot === "BE" ? "bench" : "starting at " + r.slot }); }).join("") +
      "<p>Ask “who should I add?” to see who would replace them.</p>" + METHOD;
  }

  var EXAMPLES = [
    "My tight end got injured. Who should I pick up?",
    "Who should I add for my team?",
    "Best running back available",
    "Who should I drop?",
    "Who's trending?"
  ];

  function answer(q) {
    var names = mentioned(q), pos = posFrom(q), t = q.toLowerCase();
    if (names.length >= 2) return compare(names[0], names[1]);
    if (names.length === 1) return verdict(names[0]);
    if (/trend|rising|hot\b|popular|everyone/.test(t)) return trending();
    if (pos) return topAt(pos);
    if (/\bdrop|\bcut\b|swap out|worst/.test(t)) return dropAdvice();
    // Only a waiver question gets picks; anything else gets the help text, not a guess.
    if (/\badd|pick ?ups?\b|waiver|\bclaim|upgrade|\bswap|replace|improve my|my (team|roster|lineup)/.test(t)) return upgrades();
    return "<p>I can answer from this week's export. Try a position (“best tight end”), a player (“should I add " +
      esc((pool("WR")[0] || D.players[0]).name) + "?”), two players to compare, “who should I drop?”, or “who's trending?”.</p>";
  }

  function say(cls, html) {
    var el = document.createElement("div");
    el.className = "msg " + cls;
    el.innerHTML = html;
    $("chat").appendChild(el);
    $("chat").scrollTop = cls === "bot" ? el.offsetTop - 8 : $("chat").scrollHeight;
  }

  function ask(q) {
    q = q.trim();
    if (!q) return;
    say("user", esc(q));
    var local = answer(q);
    if (typeof window.WAIVER_ASK !== "function") { say("bot", local); return; }
    var context = { week: WEEK, team: myTeam, available: D.players, league: D.league };
    Promise.resolve().then(function () { return window.WAIVER_ASK(q, context); }).then(function (text) {
      say("bot", text ? "<p>" + esc(text).replace(/\n+/g, "</p><p>") + "</p>" : local);
    }).catch(function () { say("bot", local); });
  }

  function setTeam(id) {
    myTeam = D.league.teams.filter(function (t) { return t.id === id; })[0] || null;
    try { localStorage.setItem(TEAM_KEY, id || ""); } catch (e) { /* private window: keep it for this visit only */ }
  }

  function renderAsk() {
    var saved = "";
    try { saved = localStorage.getItem(TEAM_KEY) || ""; } catch (e) { saved = ""; }
    var teams = D.league.teams.slice().sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
    $("my-team").innerHTML = '<option value="">Not set</option>' + teams.map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (t.id === saved ? " selected" : "") + ">" + esc(t.name) + "</option>";
    }).join("");
    setTeam(saved);
    $("suggest").innerHTML = EXAMPLES.map(function (e) { return '<button type="button">' + esc(e) + "</button>"; }).join("");
    say("bot", "<p>Ask who to pick up or drop in week " + WEEK + ". I rank the " + D.players.length +
      " available players from the league export" + (myTeam ? " against <b>" + esc(myTeam.name) + "</b>'s roster." : ". Pick your team above for add and drop calls.") + "</p>");
  }

  // ---------------------------------------------------------------- league tab

  function renderLeague() {
    var L = D.league, c = D.claims;
    var failed = Object.keys(c).filter(function (k) { return k.indexOf("FAILED") === 0; })
      .reduce(function (n, k) { return n + c[k]; }, 0);
    var teams = L.teams.slice().sort(function (a, b) { return a.waiverRank - b.waiverRank; });
    var claim = D.players.map(function (p) { return p.claimDate; }).filter(Boolean).sort()[0];
    $("tab-league").innerHTML = '<div class="tiles">' +
      tile(claim ? day(claim) : "–", "next waiver run") +
      tile(L.waiverDays.length + "×", "waiver runs a week, at " + L.waiverHour + ":00") +
      tile(c.EXECUTED || 0, "claims that went through") +
      tile(failed, "claims that failed") +
      tile(c.PENDING || 0, "claims pending") +
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
      '<div class="table-scroll tall"><table class="grid"><thead><tr><th>Player</th><th>Move</th><th>Team</th><th>Date</th></tr></thead>' +
      '<tbody id="moves"></tbody></table></div></div></div>';
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
      var p = { id: m.id, name: m.player || "?", pos: m.pos || "", team: m.proTeam || "" };
      var name = m.available ? '<button class="link" data-id="' + esc(m.id) + '">' + esc(m.player) + "</button>" : "<b>" + esc(m.player) + "</b>";
      return '<tr><td><div class="who">' + face(p, 32) + '<div class="who-text">' + name + "<span> " + esc(p.pos) + " · " + esc(p.team) +
        "</span></div></div></td><td>" + esc(label[m.action] || m.action) + "</td><td>" + esc(m.team) + "</td><td>" + day(m.date) + "</td></tr>";
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
      html += '<div class="card" style="margin-bottom:24px"><h2>' + esc(m.title) + "</h2>" +
        '<p class="muted">From <code>' + esc(m.notebook) + "</code>. Reads <code>" + esc(m.source) + "</code>, predicts " + esc(m.target) +
        ", from " + m.columns.length + " inputs." +
        (m.waiverScored ? " Scores " + m.waiverScored + " available players in the Model column." : "") + "</p>";
      if (!m.rows.length) { html += "<p>No usable rows in this export.</p></div>"; return; }
      if (k) {
        html += '<div class="cols"><div><div class="tiles">' +
          tile(k.r2Test.toFixed(3), "score (R²) on held-out rows") +
          tile(k.r2Train.toFixed(3), "score (R²) on training rows") +
          tile(k.maeTest, "average miss, points") +
          tile(k.nTrain + " / " + k.nTest, "training / held-out rows") + "</div></div><div>" + scatter(m.rows) +
          '<div class="legend"><span><i style="background:var(--blue)"></i>Training</span>' +
          '<span><i style="background:var(--accent-bright)"></i>Held out</span><span>Dashed line: perfect prediction</span></div></div></div>';
      } else {
        html += "<p>Model numbers were not built. Re-run the build with scikit-learn to add them.</p>";
      }
      html += "<h3>Training data, " + m.rows.length + ' rows</h3><div class="table-scroll tall"><table class="grid"><thead><tr>' +
        '<th>Player</th><th>Pos</th><th title="Stat period each row was read from">Period</th>' +
        m.columns.map(function (c) { return '<th class="num">' + esc(c) + "</th>"; }).join("") +
        '<th class="num">Actual</th>' + (k ? '<th class="num">Predicted</th><th class="num">Miss</th><th>Set</th>' : "") +
        "</tr></thead><tbody>" +
        m.rows.map(function (r) {
          return "<tr><td><b>" + esc(r.name) + "</b></td><td>" + esc(r.pos) + "</td><td>" + esc(r.period) + "</td>" +
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
    $("tab-data").innerHTML = '<div class="tiles">' + tile(I.exportedAt || "–", "export taken") + tile(I.files.length, "CSV files") +
      tile(I.files.reduce(function (n, f) { return n + f.rows; }, 0).toLocaleString(), "rows in total") +
      tile(I.allExports.length, "exports on disk") + "</div>" +
      '<div class="cols"><div class="card"><h2>Files in this export</h2><p class="muted"><code>' + esc(I.folder) + "</code></p>" +
      I.files.map(function (f) {
        return "<details><summary><b>" + esc(f.file) + '</b> <span class="muted">' + f.rows.toLocaleString() + " rows · " +
          f.columns.length + " columns · " + (f.bytes / 1e6).toFixed(1) + " MB</span></summary><p>" + esc(f.columns.join(", ")) + "</p></details>";
      }).join("") + '<h3>Export notes</h3><ul class="plain">' +
      I.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" +
      '<p class="muted" style="margin-top:14px">Page data built ' + esc(D.builtAt) + ".</p></div>" +
      '<div class="card"><h2>League settings</h2><p class="muted">' + esc(L.teamCount) + " teams · " + esc(L.scoringType) +
      " · " + (L.faab ? "FAAB bidding" : "waiver order, no bidding") + "</p><h3>Roster slots</h3><p>" +
      Object.keys(L.slots).map(function (s) { return esc(s) + " × " + L.slots[s]; }).join(" · ") + "</p>" +
      '<h3>Scoring rules</h3><div class="table-scroll tall"><table class="grid"><thead><tr><th>Rule</th><th class="num">Points</th></tr></thead><tbody>' +
      L.scoring.map(function (s) { return "<tr><td>" + esc(s.label) + '</td><td class="num">' + s.points + "</td></tr>"; }).join("") +
      "</tbody></table></div></div></div>";
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
  $("chat").addEventListener("click", function (e) {
    var b = e.target.closest(".pick[data-id]");
    if (b) openPlayer(b.dataset.id);
  });
  $("suggest").addEventListener("click", function (e) {
    if (e.target.tagName === "BUTTON") ask(e.target.textContent);
  });
  $("ask-form").addEventListener("submit", function (e) {
    e.preventDefault();
    ask($("ask-input").value);
    $("ask-input").value = "";
  });
  $("my-team").addEventListener("change", function (e) {
    setTeam(e.target.value);
    say("bot", myTeam ? "<p>Got it. Answers now compare against <b>" + esc(myTeam.name) + "</b>'s roster.</p>"
      : "<p>Team cleared. Answers rank the available pool only.</p>");
  });
  $("drawer-close").addEventListener("click", closeDrawer);
  $("scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

  $("league-line").textContent = "CSCI 4150 · " + D.league.name + " · week " + WEEK + " · export " + (D.inventory.exportedAt || "");
  renderChips();
  renderBoard();
  renderAsk();
  renderLeague();
  renderModel();
  renderData();

  // Deep links: #model opens a tab, #player-<id> a player, #ask=<question> asks it (#team=<id>&ask=... sets the team first).
  var hash = decodeURIComponent(location.hash.slice(1));
  if ($("tab-" + hash)) showTab(hash);
  else if (hash.indexOf("player-") === 0) openPlayer(hash.slice(7));
  else if (hash.indexOf("ask=") >= 0) {
    var team = /team=([^&]+)/.exec(hash);
    if (team) { setTeam(team[1]); $("my-team").value = team[1]; }
    ask(hash.slice(hash.indexOf("ask=") + 4));
  }
})();
