# Push-ins after removed silences — worked example

All times are **source seconds** of one clip.

`analyze_silence` for `clip-4` returned eight ranges. After Phase 15 you decided to
remove six of them (two were kept: a laugh and a dramatic pause):

| # | start | end | duration | removed |
|---|---|---|---|---|
| 0 | 3.10 | 3.62 | 0.52 | yes |
| 1 | 9.40 | 10.30 | 0.90 | yes |
| 2 | 14.05 | 14.55 | 0.50 | yes |
| 3 | 21.70 | 23.40 | 1.70 | yes |
| 4 | 30.20 | 31.00 | 0.80 | no (laugh) |
| 5 | 36.80 | 37.40 | 0.60 | yes |
| 6 | 44.10 | 45.30 | 1.20 | yes |
| 7 | 52.00 | 53.50 | 1.50 | no (pause for effect) |

Mean of the **removed** silences: (0.52 + 0.90 + 0.50 + 1.70 + 0.60 + 1.20) / 6 = **0.90 s**.

Candidates (duration > 0.90): #3 (ratio 1.89) and #6 (ratio 1.33). #1 equals the
mean and does not qualify.

- **#3** — ratio 1.89 → `scalePercent` 10–20; choose 15. Starts at the first kept
  moment, `start = 23.40`. Frames at 23.4, 24.5 and 26.0 show a static talking head
  starting a new idea → keep. `end = 26.4` (3 s), `rampSeconds: 0.45`, `easeOut: true`.
- **#6** — ratio 1.33 → 5–10; would start at 45.30, but that is only ~22 s after
  #3 in source time and, after cuts, the frames show the presenter picking up the
  camera and walking → **skip** (Phase 16 visual rule / Phase 18).

```json
{
  "expectedRevision": 18,
  "label": "Push-in after the long pause before the second idea",
  "dryRun": true,
  "operations": [
    { "type": "add_push_in", "clipId": "clip-4", "start": 23.4, "end": 26.4,
      "scalePercent": 15, "rampSeconds": 0.45, "easeOut": true }
  ]
}
```

Checklist before committing each candidate:

- the kept stretch after the removed range is long enough for `end` (≥ 1.5 s);
- no camera move, scene change, transition, B-roll or clip boundary right there;
- no manual zoom / push-in on or near it, and ≥ 6–10 s from the previous automatic one;
- the tighter framing does not crop faces, hands or the object being talked about;
- it lands on something worth marking: a new sentence or idea, key information, a
  reaction, a punchline, a restart after a long pause.
