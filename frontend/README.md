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
| Players | Every free agent and waiver player with face and team logo: opponent, this week's projection, model points, season average, percent rostered, expert rank trend. Click a row for the full stat lines, upcoming games, outlook and weeks spent on a league roster. Beside it, the ask panel (below). | `waiver.csv`, `lineup.csv`, `roster.csv`, `activity.csv` |
| League moves | Waiver order, claim results, and the add, drop and trade feed. | `team.csv`, `transaction.csv`, `activity.csv` |
| Model | Both notebook regressions re-run on the export: scores, predicted against actual, and every training row with its inputs. | `roster.csv`, `weekly_roster.csv` |
| Export data | Each CSV with its row count and columns, export notes, roster slots and scoring rules. | the export folder, `settings.csv` |

Links work per tab (`index.html#model`), per player (`index.html#player-<playerId>`)
and per question (`index.html#team=<teamId>&ask=best tight end`).

## Ask the decider

Pick your team, then ask in plain words: a position ("my tight end got injured,
who should I pick up?"), a player ("should I add Tyjae Spears?"), two players to
compare, "who should I add for my team?", "who should I drop?" or "who's trending?".

Answers come from the export only, with no server or API key:

- Available players are ranked on 60% this week's ESPN projection and 40% season
  average. The average counts for at most 1.5x the projection, so one big game
  does not carry a player.
- An add is recommended only when it beats the lowest-rated player you roster at
  that position, who is rated on the better of season average and projection so
  a starter on a bye is not suggested as a drop.
- Players listed out, doubtful or on IR are left off.

To put an LLM in front of it, define `window.WAIVER_ASK(question, context)` before
`app.js` loads. It gets the question plus `{week, team, available, league}` and
returns text or a promise of text; if it throws, the built-in answer is shown.

Faces and team logos load from ESPN's image host by player id and team
abbreviation, so they need a network connection; initials show without one.

The Model column scores a player only when ESPN projects receiving stats for
them this week, because those are the model's inputs. Without scikit-learn the
build still works and leaves the model numbers out.
