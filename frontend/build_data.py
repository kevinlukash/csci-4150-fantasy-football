"""Turn one export folder into frontend/data.js for the waiver wire page.

Run from the repo root:

    uv run --with scikit-learn frontend/build_data.py            # newest export with waiver.csv
    uv run --with scikit-learn frontend/build_data.py exports/league_..._...
    uv run --with scikit-learn frontend/build_data.py --real-names

League team names are shown as "Team 1", "Team 2", ... (numbered by ESPN team
id) so the page is fine to present. Pass --real-names to keep the league's own.

Without scikit-learn the page still gets every table; only the model numbers
(predictions and scores) are left out.

The model section repeats the two notebooks step for step
(Initial_Regression_Experiment.ipynb and Multi_Week_Regression.ipynb): same
features, same target, same split, same MLPRegressor settings. The only change
is that every row of the export is read instead of a fixed row count.
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

csv.field_size_limit(10**9)

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "data.js"

FEATURES = [
    "projected_points",
    "projected_avg_points",
    "projected_breakdown_receivingYards",
    "projected_breakdown_receivingReceptions",
    "projected_breakdown_receivingTouchdowns",
]
WEEKS_USED = 3  # week_predict in the multi-week notebook
REAL_NAMES = "--real-names" in sys.argv
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]


def team_label(team_id, real_name):
    """The name the page shows for a league team."""
    if REAL_NAMES or team_id in (None, ""):
        return real_name
    return f"Team {team_id}"


def read(folder: Path, name: str) -> list[dict]:
    path = folder / name
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def loads(text, default):
    try:
        return json.loads(text) if text else default
    except (TypeError, ValueError):
        return default


def num(value, digits=2):
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if f != f:
        return None
    return round(f, digits)


def named(breakdown: dict) -> dict:
    """Keep the stats ESPN names; drop the ones that are only a number id."""
    out = {}
    for key, value in (breakdown or {}).items():
        if key.isdigit():
            continue
        v = num(value)
        if v is not None:
            out[key] = v
    return out


def clean_name(name: str) -> str:
    # the exporter prefixes an apostrophe to names Excel would read as formulas
    return name[1:] if name[:2] in ("'=", "'+", "'-", "'@") else name


def pick_folder() -> Path:
    if ARGS:
        return Path(ARGS[0]).resolve()
    found = sorted(p.parent for p in (ROOT / "exports").glob("*/waiver.csv"))
    if not found:
        sys.exit("No export with a waiver.csv under exports/. Run export_football.py first.")
    return found[-1]


def folder_time(folder: Path):
    parts = folder.name.split("_")
    try:
        stamp = datetime.strptime(parts[2] + parts[3], "%Y%m%d%H%M%S")
    except (IndexError, ValueError):
        return None
    return stamp.strftime("%Y-%m-%d %H:%M")


# ---------------------------------------------------------------- players


def build_players(folder, week):
    lineup_by_player = defaultdict(list)
    for row in read(folder, "lineup.csv"):
        lineup_by_player[row["playerId"]].append(
            {
                "week": int(row["week"]),
                "pts": num(row["points"]),
                "proj": num(row["projected_points"]),
                "opp": row.get("pro_opponent") or None,
                "team": team_label(row.get("team_id"), row.get("team_name")) or None,
                "slot": row.get("slot_position") or None,
            }
        )

    players = []
    for row in read(folder, "waiver.csv"):
        stats = loads(row["stats"], {})
        season = stats.get("0", {})
        this_week = stats.get(str(week), {})
        entry = loads(row["player_pool_entry"], {})
        info = entry.get("player", {})
        own = info.get("ownership") or {}

        last_season = next(
            (
                s
                for s in info.get("stats", [])
                if s.get("statSourceId") == 0
                and s.get("scoringPeriodId") == 0
                and str(s.get("seasonId")) == str(int(row["season"]) - 1)
            ),
            {},
        )

        rank_trend = []
        for wk, ranks in sorted((info.get("rankings") or {}).items(), key=lambda kv: int(kv[0])):
            vals = [r["rank"] for r in ranks if r.get("rankType") == "PPR" and r.get("rank")]
            if vals and int(wk) > 0:
                rank_trend.append([int(wk), round(sum(vals) / len(vals), 1)])

        outlooks = (info.get("outlooks") or {}).get("outlooksByWeek") or {}
        latest = max(outlooks, key=int) if outlooks else None
        injury = row["injuryStatus"]
        draft = (info.get("draftRanksByRankType") or {}).get("PPR") or {}
        rating = (entry.get("ratings") or {}).get("0") or {}

        history = sorted(lineup_by_player.get(row["playerId"], []), key=lambda h: h["week"])

        players.append(
            {
                "id": row["playerId"],
                "name": clean_name(row["name"]),
                "pos": row["position"],
                "team": row["proTeam"],
                "posRank": int(row["posRank"]) if row["posRank"].isdigit() else None,
                "status": row["availability_status"],
                "injury": None if injury in ("", "[]") else injury,
                "owned": num(row["percent_owned"]),
                "started": num(row["percent_started"]),
                "ownedChange": num(own.get("percentChange")),
                "adp": num(own.get("averageDraftPosition"), 1),
                "avg": num(row["avg_points"]),
                "total": num(row["total_points"]),
                "projAvg": num(row["projected_avg_points"]),
                "projTotal": num(row["projected_total_points"]),
                "weekProj": num(this_week.get("projected_points")),
                "weekProjStats": named(this_week.get("projected_breakdown")),
                "seasonStats": named(season.get("breakdown")),
                "lastSeasonTotal": num(last_season.get("appliedTotal")),
                "lastSeasonAvg": num(last_season.get("appliedAverage")),
                "draftRank": draft.get("rank") or None,
                "overallRank": rating.get("totalRanking") or None,
                "rankTrend": rank_trend,
                "outlook": outlooks.get(latest) if latest else None,
                "outlookWeek": int(latest) if latest else None,
                "seasonOutlook": info.get("seasonOutlook") or None,
                "claimDate": entry.get("waiverProcessDate"),
                "history": history,
                "model": None,
            }
        )
    return players


# ---------------------------------------------------------------- rosters


def build_rosters(folder, week):
    """Each league team's players, plus every NFL team's upcoming opponents."""
    by_team = defaultdict(list)
    schedule = {}
    for row in read(folder, "roster.csv"):
        stats = loads(row["stats"], {})
        injury = row["injuryStatus"]
        by_team[row["team_id"]].append(
            {
                "id": row["playerId"],
                "name": clean_name(row["name"]),
                "pos": row["position"],
                "team": row["proTeam"],
                "slot": row["lineupSlot"],
                "injury": None if injury in ("", "[]") else injury,
                "avg": num(row["avg_points"]),
                "weekProj": num(stats.get(str(week), {}).get("projected_points")),
            }
        )
        if row["proTeam"] not in schedule:
            games = loads(row["schedule"], {})
            if games:
                schedule[row["proTeam"]] = {int(w): g.get("team") for w, g in games.items()}
    return by_team, schedule


# ---------------------------------------------------------------- league


def build_league(folder):
    league = (read(folder, "league.csv") or [{}])[0]
    settings = (read(folder, "settings.csv") or [{}])[0]
    scoring = sorted(
        (
            {"abbr": s.get("abbr"), "label": s.get("label"), "points": s.get("points")}
            for s in loads(settings.get("scoring_format"), [])
        ),
        key=lambda s: s["label"] or "",
    )
    slots = {k: v for k, v in loads(settings.get("position_slot_counts"), {}).items() if v and k}
    teams = [
        {
            "id": t["team_id"],
            "name": team_label(t["team_id"], t["team_name"]),
            "wins": int(t["wins"] or 0),
            "losses": int(t["losses"] or 0),
            "standing": int(t["standing"] or 0),
            "waiverRank": int(t["waiver_rank"] or 0),
            "adds": int(t["acquisitions"] or 0),
            "drops": int(t["drops"] or 0),
            "pointsFor": num(t["points_for"], 1),
        }
        for t in read(folder, "team.csv")
    ]
    return {
        "id": league.get("league_id"),
        "name": settings.get("name"),
        "season": league.get("season"),
        "week": int(league.get("current_week") or 0),
        "scoringType": settings.get("scoring_type"),
        "teamCount": settings.get("team_count"),
        "waiverDays": loads(settings.get("waiver_process_days"), []),
        "waiverHour": settings.get("waiver_process_hour"),
        "faab": settings.get("faab") == "True",
        "scoring": scoring,
        "slots": slots,
        "teams": teams,
    }


def build_activity(folder, available_ids):
    moves = []
    for row in read(folder, "activity.csv"):
        for action in loads(row["actions"], []):
            if len(action) < 3 or not isinstance(action[2], dict):
                continue
            team, kind, player = action[0], action[1], action[2]
            pid = str(player.get("playerId"))
            moves.append(
                {
                    "date": int(row["date"]) if row["date"].isdigit() else None,
                    "team": team_label(team.get("team_id"), team.get("team_name")) if isinstance(team, dict) else str(team),
                    "action": kind,
                    "player": player.get("name"),
                    "id": pid,
                    "pos": player.get("position"),
                    "proTeam": player.get("proTeam"),
                    "available": pid in available_ids,
                    "bid": action[3] if len(action) > 3 and isinstance(action[3], (int, float)) else None,
                }
            )
    moves.sort(key=lambda m: m["date"] or 0, reverse=True)

    claims = Counter()
    for row in read(folder, "transaction.csv"):
        if row["type"] == "WAIVER":
            claims[row["status"]] += 1
    return moves, dict(claims)


def build_inventory(folder):
    files = []
    for path in sorted(folder.glob("*.csv")):
        with open(path, encoding="utf-8-sig", newline="") as fh:
            reader = csv.reader(fh)
            header = next(reader, [])
            rows = sum(1 for _ in reader)
        files.append({"file": path.name, "rows": rows, "columns": header, "bytes": path.stat().st_size})
    notes = folder / "export_notes.txt"
    others = sorted(p.name for p in folder.parent.iterdir() if p.is_dir())
    return {
        "folder": folder.name,
        "exportedAt": folder_time(folder),
        "files": files,
        "notes": notes.read_text(encoding="utf-8").strip().splitlines() if notes.exists() else [],
        "allExports": others,
    }


# ---------------------------------------------------------------- model


def first_period(stats_text):
    """The notebooks read only the first stat period in each cell."""
    stats = loads(stats_text, {})
    if not stats:
        return None, None
    period = next(iter(stats))
    return period, stats[period]


def feature_row(period_stats):
    proj = period_stats.get("projected_breakdown") or {}
    values = [
        period_stats.get("projected_points"),
        period_stats.get("projected_avg_points"),
        proj.get("receivingYards"),
        proj.get("receivingReceptions"),
        proj.get("receivingTouchdowns"),
    ]
    if any(v is None for v in values):
        return None
    return [float(v) for v in values]


def single_week_rows(folder):
    rows = []
    for row in read(folder, "roster.csv"):
        period, stats = first_period(row["stats"])
        if stats is None:
            continue
        feats, target = feature_row(stats), stats.get("points")
        if feats is None or target is None:
            continue
        rows.append(
            {"name": clean_name(row["name"]), "pos": row["position"], "period": period, "x": feats, "y": float(target)}
        )
    return rows


def multi_week_rows(folder):
    by_player = defaultdict(dict)
    pos = {}
    for row in read(folder, "weekly_roster.csv"):
        period, stats = first_period(row["stats"])
        if stats is None:
            continue
        feats, target = feature_row(stats), stats.get("points")
        if feats is None or target is None:
            continue
        name = clean_name(row["name"])
        by_player[name][int(row["week"])] = (feats, float(target), period)
        pos[name] = row["position"]

    rows = []
    for name, weeks in by_player.items():
        if any(w not in weeks for w in range(1, WEEKS_USED + 1)):
            continue
        x = []
        for w in range(1, WEEKS_USED + 1):
            x += weeks[w][0]
            if w < WEEKS_USED:
                x.append(weeks[w][1])
        rows.append(
            {
                "name": name,
                "pos": pos[name],
                "period": ",".join(weeks[w][2] for w in range(1, WEEKS_USED + 1)),
                "x": x,
                "y": weeks[WEEKS_USED][1],
            }
        )
    return rows


def multi_week_columns():
    cols = []
    for w in range(1, WEEKS_USED + 1):
        cols += [f"wk{w} {f.replace('projected_breakdown_', '').replace('projected_', 'proj_')}" for f in FEATURES]
        if w < WEEKS_USED:
            cols.append(f"wk{w} points")
    return cols


def fit(rows):
    """Same split and regressor as the notebooks. Returns None without scikit-learn."""
    if len(rows) < 8:
        return None
    try:
        import numpy as np
        from sklearn.model_selection import train_test_split
        from sklearn.neural_network import MLPRegressor
    except ImportError:
        return None

    x = np.array([r["x"] for r in rows], dtype=float)
    y = np.array([r["y"] for r in rows], dtype=float)
    idx = np.arange(len(rows))
    x_train, x_test, y_train, y_test, i_train, i_test = train_test_split(x, y, idx, random_state=1)
    regr = MLPRegressor(random_state=1, max_iter=10000, tol=0.0001)
    regr.fit(x_train, y_train)

    preds = regr.predict(x)
    test = set(i_test.tolist())
    for i, row in enumerate(rows):
        row["pred"] = round(float(preds[i]), 2)
        row["split"] = "test" if i in test else "train"
    test_err = np.abs(regr.predict(x_test) - y_test)
    return {
        "regr": regr,
        "r2Test": round(float(regr.score(x_test, y_test)), 4),
        "r2Train": round(float(regr.score(x_train, y_train)), 4),
        "maeTest": round(float(test_err.mean()), 2),
        "nTrain": len(i_train),
        "nTest": len(i_test),
        "iterations": int(regr.n_iter_),
        "layers": [int(n) for n in regr.hidden_layer_sizes],
    }


def build_models(folder, players, week):
    single = single_week_rows(folder)
    multi = multi_week_rows(folder)
    fit_single, fit_multi = fit(single), fit(multi)

    scored = 0
    if fit_single:
        # Score each available player from this week's ESPN projection, the same
        # five inputs the single-week model was trained on.
        waiver = {r["playerId"]: r for r in read(folder, "waiver.csv")}
        batch, targets = [], []
        for p in players:
            stats = loads(waiver[p["id"]]["stats"], {}).get(str(week))
            feats = feature_row(stats) if stats else None
            if feats:
                batch.append(feats)
                targets.append(p)
        if batch:
            for p, value in zip(targets, fit_single["regr"].predict(batch)):
                p["model"] = round(float(value), 2)
            scored = len(batch)

    def pack(key, title, source, target, columns, rows, result, extra):
        metrics = {k: v for k, v in (result or {}).items() if k != "regr"} or None
        for r in rows:
            r["x"] = [round(v, 3) for v in r["x"]]
        return {
            "key": key,
            "title": title,
            "source": source,
            "target": target,
            "columns": columns,
            "rows": rows,
            "metrics": metrics,
            **extra,
        }

    short = [f.replace("projected_breakdown_", "proj_").replace("projected_", "proj_") for f in FEATURES]
    return [
        pack(
            "single",
            "Single-week model",
            "roster.csv",
            "points in the same stat period",
            short,
            single,
            fit_single,
            {"notebook": "Initial_Regression_Experiment.ipynb", "waiverScored": scored},
        ),
        pack(
            "multi",
            "Multi-week model",
            "weekly_roster.csv",
            f"points in week {WEEKS_USED}",
            multi_week_columns(),
            multi,
            fit_multi,
            {"notebook": "Multi_Week_Regression.ipynb", "waiverScored": 0},
        ),
    ]


# ---------------------------------------------------------------- main


def main():
    folder = pick_folder()
    league = build_league(folder)
    players = build_players(folder, league["week"])
    rosters, schedule = build_rosters(folder, league["week"])
    for team in league["teams"]:
        team["roster"] = rosters.get(team["id"], [])
    for p in players:
        games = schedule.get(p["team"])
        # [week, opponent]; opponent is None on a bye. Empty when the schedule is unknown.
        p["next"] = [[w, games.get(w)] for w in range(league["week"], league["week"] + 4)] if games else []
    moves, claims = build_activity(folder, {p["id"] for p in players})
    models = build_models(folder, players, league["week"])

    adds, drops = Counter(), Counter()
    for m in moves:
        (drops if m["action"] == "DROPPED" else adds if "ADDED" in m["action"] else Counter())[m["id"]] += 1
    for p in players:
        p["leagueAdds"] = adds.get(p["id"], 0)
        p["leagueDrops"] = drops.get(p["id"], 0)

    data = {
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "league": league,
        "players": players,
        "activity": moves,
        "claims": claims,
        "models": models,
        "inventory": build_inventory(folder),
    }
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text("window.WAIVER_DATA=" + text.replace("</", "<\\/") + ";\n", encoding="utf-8")

    trained = [m["key"] for m in models if m["metrics"]]
    print(f"{folder.name} -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.1f} MB)")
    print(f"players {len(players)}, moves {len(moves)}, week {league['week']}")
    for m in models:
        print(f"{m['key']}: {len(m['rows'])} rows, metrics {m['metrics']}")
    if not trained:
        print("scikit-learn not found: tables built, model numbers left out.")


if __name__ == "__main__":
    main()
