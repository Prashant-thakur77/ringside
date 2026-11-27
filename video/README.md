# Ringside film

The demo film, rebuilt from data. Every number comes from `eval/results/results.json` and `apps/web/public/home/gap.json` via `make_narration.py`.

1. `python3 make_narration.py` writes `narration.json` and `film/public/data/facts.json`.
2. `python3 make_film.py` writes `film/film.json` (scene order, footage, labels).
3. `node capture.mjs shots.json` records the site into `captures/` (copy them to `film/public/captures/`).
4. Narration takes, timeline and captions: `tools/tts_takes.py`, `tools/vo_timeline.py --write`, `tools/captions.py`.
5. `python3 music.py`, `python3 make_sfx.py`, `python3 tools/sfx_synth.py kit audio/sfx`, `python3 tools/sfx_synth.py track sfx_cues.json audio/sfx_track.wav`.
6. `cd film && npm run render`, then `python3 tools/mix.py mix.json --mux film/out/film.mp4 final.mp4`.
