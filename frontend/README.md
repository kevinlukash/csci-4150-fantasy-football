# Waiver wire front-end

A static page over the football export. No server and no install: build the
data file, then open `index.html`.

```
uv run --no-project --with scikit-learn python frontend/build_data.py
open frontend/index.html
```

`build_data.py` reads the newest folder under `exports/` that has a
`waiver.csv` (or the folder you pass as an argument) and writes
`frontend/data.js`. Re-run it after each new export.

| Tab | Shows | Comes from |
| --- | --- | --- |
| Available players | Every free agent and waiver player: this week's projection, model points, season average and total, percent rostered and started, league adds and drops, expert rank trend. Click a row for the full stat lines, outlook and weeks spent on a league roster. | `waiver.csv`, `lineup.csv`, `activity.csv` |
| League moves | Waiver order, claim results, and the add, drop and trade feed. | `team.csv`, `transaction.csv`, `activity.csv` |
| Model | Both notebook regressions re-run on the export: scores, predicted against actual, and every training row with its inputs. | `roster.csv`, `weekly_roster.csv` |
| Export data | Each CSV with its row count and columns, export notes, roster slots and scoring rules. | the export folder, `settings.csv` |

Links work per tab (`index.html#model`) and per player (`index.html#player-<playerId>`).

The Model column scores a player only when ESPN projects receiving stats for
them this week, because those are the model's inputs. Without scikit-learn the
build still works and leaves the model numbers out.
