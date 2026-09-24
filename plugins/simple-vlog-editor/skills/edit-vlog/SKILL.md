---
name: edit-vlog
description: Use when the user asks to edit a whole vlog (or "this footage", "my trip videos", "a rough cut") autonomously in SimpleVlogEditor — understanding every file first, rebuilding the story, removing mistakes, redundancy and dead air, then adding only the push-ins, images, cards, titles, tags, effects and transitions that serve the story.
---

# Edit a vlog autonomously in SimpleVlogEditor

Work like a human editor: first understand all the material, then reconstruct the
story, plan the edit, and only then change the timeline. This skill is the
editorial workflow; the **`edit-video`** skill is the operating manual for the
tools (request ids, revisions, captions, images, effects, verification). Follow
both. Where they overlap, the stricter rule wins.

Priorities, in this order:

1. Preserve the meaning and intention of the video.
2. Make the story understandable.
3. Remove mistakes and redundancy.
4. Improve rhythm and flow.
5. Improve the picture.
6. Add graphic elements only when they serve the narrative.
7. Avoid over-editing.

**The user's explicit instructions always override the automatic behaviour below**
(counts, durations, languages, styles, what to keep).

**Central rule:** do not try to show off every feature. Use only what improves
*this* vlog. The edit should feel deliberate, natural and human.

**Hierarchy of intervention** — prefer the one higher up; the further down, the
stronger the justification it needs:

simple cut → silence adjustment → discreet push-in → reordering → contextual
image → text → transition → visual effect

---

## Recovering without drama

Timeouts, stalled media, lost connections and editor restarts are **not errors of the
edit**. The host retries them and reopens the editor from its checkpoint by itself; if
one still reaches you, follow the recovery steps in `edit-video` (health check →
`restart_editor` → `get_project`/`get_timeline` → continue) and keep going. A `revision_conflict` is the same: re-read `get_project`, redo the change on the new
revision and carry on. Do not
report them to the user as failures unless something stays blocked.

## Phase 0 — Start safely

1. `get_recovery_state` — is there a previous edit or checkpoint for this material? (Resume rules: see `edit-video`.)
2. `health_check` — the editor is connected and visible. If the only tools available are `check_installation`, `health_check` and `get_editor_capabilities`, SimpleVlogEditor is not installed: tell the user to download the installer from https://simplevlogeditor.com/, install it keeping the default folder, and call `check_installation` once they have.
3. `get_editor_capabilities` — read limits, presets, fonts, tag shapes, transitions. Pass on any `updateNotice` to the user first.
   Editor and plugin ship together and a vlog edit is long: before starting one, make sure both are the current release. If either is behind, ask the user to install the current editor from https://simplevlogeditor.com/ (uninstalling the old one first, then restarting the computer), to reinstall this plugin from its repository, and to restart Claude Code or Codex — and wait for them rather than editing across versions.
4. `get_project` and `get_timeline` — record the current `revision`.

Never start from an old revision. Every later mutation carries `expectedRevision`
and a fresh `requestId`. Before large changes, call `checkpoint_project`.

## Phase 1 — Import and inventory (no edits yet)

- Import every file the user supplied — videos, audio, images — with `queue_media_import` (absolute paths), and poll `get_import_status` until every file is terminal.
- `list_assets`, then `get_timeline` again. Note duplicates (`already_present`), missing files and unsupported formats, and tell the user about them.
- Build an internal inventory, one line per asset:
  `asset → type → duration → file name → current position → what is known of its content → possible narrative role`.

## Phase 2 — Read the file names

Names are evidence, never proof. `chegada-restaurante.mp4` probably comes before
`comendo-restaurante.mp4`, which comes before `saindo-restaurante.mp4`. Generic
names (`IMG_5821.jpg`, `VID_0003.mp4`) depend on the content analysis.

## Phase 3 — Look at every image

Open and look at each image yourself (see `edit-video`). For each: what it shows
(people, places, objects, legible information), what its name suggests, a short
description, and which speech it relates to. Decide whether it could work as an
`overlay`, an illustrative insert, a `behind-subject` picture, a narrative
element, or a text-card background (`set_text_background`). An image is used
only when it has a narrative job.

## Phase 4 — Transcribe

`transcribe` every video (and every audio file) that contains speech. A clip with no
audio is **not an error**: `transcribe` returns `noAudio: true` with a warning — note it
and move on (see Phase 6a). Use the
language the user named; otherwise let it detect (`language` omitted or `auto`).
Work out the vlog's **predominant spoken language**. Every text you put *inside*
the video — Subscribe/“Inscreva-se”, text cards, titles, background captions,
other on-screen messages — is written in that language. (The chat report and the
publishing description follow the language of the user's prompt, as `edit-video`
says.)

## Phase 5 — Map the speech

For each transcribed clip, in source seconds: main subject, secondary subjects,
people, places, events, questions and answers, introductions, explanations,
conclusions, topic changes, key sentences, funny moments, mistakes, restarts,
repetitions, redundancies, and references to something visible. For example:

```
clip-7   0:00–0:18 introduces the restaurant
         0:18–0:42 explanation
         0:42–0:51 failed attempt
         0:51–1:06 correct retake
         1:06–1:34 opinion about the food
```

## Phase 6 — First, sparse visual pass

`get_contact_sheet` per video, coarse. Note setting, people, framing, camera
movement, changes of place or camera, B-roll, objects and visually important
events. Keep this pass sparse.

## Phase 6a — Silent clips and timelapses

For every video with no audio, decide whether it is a **timelapse**. First trust the
editor: `isTimelapse` and `timelapseReason` (from `transcribe`, `list_assets` or
`get_timeline`) come from its own detector — the camera naming the mode, or a file
written over far longer than it plays. If the editor says no, look at the contact sheet:
compressed time (clouds racing, shadows sweeping, traffic or crowds streaking, sky
changing) is a timelapse too; a drone shot or quiet B-roll at normal speed is not.

**Unless the user said otherwise, every timelapse is sped up to last about 15 s.** Set
`set_project_settings` → `{ "timelapseTargetSeconds": 15 }` once, and the editor speeds
up every clip it flagged, keeping the target after trims. For a timelapse you identified
only from the frames, `set_speed` = kept duration ÷ 15 on that clip. Do this in the
structural batch (Phase 21). Timelapses are natural places for the project soundtrack
and for a change-of-time transition; they get no push-ins from silence (they have none).

## Phase 7 — Cross speech with picture

Check whether what is said is visible when it is said (“look at the size of this
plate”). If the contact sheet cannot confirm it, sample frames near those words.

## Phase 8 — Densify only where it matters

Request extra `get_frames` when the speech points at something (“look at this”,
“here”, “this place”, “this food”, “this product”, “as you can see”), and at
demonstrations, sudden topic changes, important movement, relevant objects,
possible effect or image moments, and any cut that might be problematic. Do not
collect frames without a reason.

## Phase 9 — Understand the audio files

Classify each audio file as speech, narration, music, sound effect or unknown,
using its content and, as secondary evidence, its name. Transcribe speech and
narration.

## Phase 10 — Build the global story

Before editing, be able to answer: *What happened? What story do these files
tell? Which order lets a viewer understand it best?* — beginning, development,
changes of place and subject, events, conclusion.

## Phase 11 — Decide the order

Use the transcript, the pictures, the names, temporal and spatial continuity, and
references in the speech. **Keep the original order whenever it already makes
sense.** Reorder (`move_clip`) only for a clear gain in understanding.

## Phase 12 — Remove speech mistakes

False starts, obvious errors, abandoned sentences, restarts, and repetitions
caused by a mistake. Keep the final, complete, natural version:

> “Today we're going to visit the museum…” / “Today we're…” / “Hang on.” /
> “Today we're going to visit the National Museum here in Brasília.” → keep the last.

Cut on word timings, never mid-word, taking the pause with the mistake (the
detailed rules are in `edit-video`). Use `delete_source_range` with a `reason`.

## Phase 13 — Remove semantic redundancy

Passages that say the same thing in different words: keep the best one by
clarity, naturalness, audio, picture, and continuity with what comes before and
after. **Do not remove repetition used on purpose** for humour, emotion or emphasis.

## Phase 14 — Analyse silences

`analyze_silence` on predominantly spoken clips. **Per clip**, compute from its
`silenceRanges` (each `{start, end, enabled}` in source seconds): count, minimum,
maximum and mean duration, a rough distribution, and — once decided — which
ones will actually be removed. Decisions use per-clip statistics; never pool
silences from clips of very different character.

## Phase 15 — Decide the silence cuts

Unless the user said otherwise:

- **Static scenes** (talking head, locked-off camera, someone seated): cut more aggressively.
- **Scenes with movement** (walking, cooking, tours, camera moves, showing objects): cut conservatively.
- **Keep** pauses that carry humour, emotion, suspense, a reaction or a narrative breath.

Mechanics: detected ranges are removed when the clip's `cutSilence` is on —
`set_clip_edits` with `{ "cutSilence": true }` — and each range can be kept with
`set_detected_range` (`rangeIndex`, `enabled: false`). A pause the detector
missed is a `delete_source_range`. Leave the editor's own automatic zoom
(`edits.silence.autoZoom.enabled`) **off**: the push-ins below are placed by hand
so each one can pass the visual checks.

## Phase 16 — Push-in after a relevant removed silence

After deciding the removals, compute for each clip the **mean duration of the
silences that will be removed**. A removed silence *longer than that mean* is a
**candidate** for a push-in starting on the first kept moment after it — in
source seconds, the removed range's `end`.

Strength is proportional to how far it exceeds the mean (`ratio = duration / mean`):

| ratio | `scalePercent` |
|---|---|
| just above 1 (≈ 1.0–1.5) | 5–10 |
| ≈ 1.5–2 | 10–20 |
| well above 2 | 20–30 |

Never exceed **30** unless the user asked. Duration about **1.5–4 s** (it does
not need to scale with the silence), smooth entry (`rampSeconds` ≈ 0.3–0.6,
never 0 unless a hard punch-in is the explicit style), and `easeOut: true`
whenever returning gently to the original framing makes sense. `end` must stay
inside the same kept stretch (before the next removed range).

A long silence **does not oblige** a zoom. Skip it if the camera is making an
important move, a scene change follows immediately, a manual zoom or another
push-in is already there or near, the framing would stop working, or the zoom
would crop important visual information. The formula is worked through in
[references/push-in-after-silence.md](references/push-in-after-silence.md).

## Phase 17 — Don't over-zoom

Even if many silences qualify, zoom on few. Prefer those that coincide with the
start of a new sentence, a change of idea, important information, a reaction, a
punchline, or a restart after a long pause. Keep roughly **6–10 s** between
automatic push-ins; of several close candidates, keep only the most relevant.

## Phase 18 — No zoom on invisible cuts

Normally no push-in when the removed silence is next to a clip change, right
before a transition, during a camera change, during B-roll, or where the scene's
own movement already gives energy. The point is to hide or dignify a jump cut in
a relatively static shot, not to add motion where there is enough.

## Phase 19 — Natural alternation of framing

In long talking-head stretches, push-ins can evoke a multi-camera edit:
original → light zoom → original → moderate zoom. Avoid zoom → zoom → zoom → zoom,
and avoid random intensities: the changes follow the structure of the speech.

## Phase 20 — Structural plan

Decide: clips kept, clips removed, order, speech removed, redundancies removed,
silences removed, push-in candidates. **No purely decorative elements yet.**

## Phase 21 — Execute the structure

One `apply_edit_batch` with `move_clip`, `trim_clip`, `delete_source_range`,
`set_clip_edits` (`cutSilence`), `set_detected_range`, `remove_clip`, the timelapse
speed (`set_project_settings` `timelapseTargetSeconds: 15`, `set_speed`) — first with
`dryRun: true`. Check `durationBefore`, `durationAfter`, `removedSeconds` and the
planned operations. Then commit the same batch against the current revision.

## Phase 22 — Recompute after the cuts

`get_timeline` → new revision → rebuild the time mapping (`keepRanges`,
`removedRanges`, `outputStart`) → confirm which push-in candidates still exist.
Push-ins use **source** time: place them on the first kept stretch after each
removed silence. **Never use output-timeline seconds as if they were source seconds.**

## Phase 23 — Apply the push-ins

`add_push_in` with `clipId`, `start`, `end`, `scalePercent`, `rampSeconds`,
`easeOut` — in one batch, dry run first.

## Phase 24 — Verify cuts and zooms

`get_frames` (use `composited: true` to see the zoom) around each: the frame
before the cut, the first kept frame, the start of the push-in, the moment of
maximum zoom, and the return to normal framing. Look for jarring jump cuts,
framing problems, cropped objects, people half out of frame, excessive zoom,
unpleasant visual changes. Fix or remove what fails.

## Phase 25 — Place images

Cross the images with the *final* timeline. Use them **during speech** when they
illustrate what is being said (on the words, from the transcript timing), or
**between narrative moments** when they explain a change of place, context or
time. Never because they happen to be available. Verify every placement as
`edit-video` requires.

## Phase 26 — Text cards

For important changes of context only: “Next morning…”, “After lunch…”, “Day 2”,
“Arriving in Asunción”. Not between every clip. Written in the vlog's language.

## Phase 27 — Background captions

Short highlight words or phrases (“PARAGUAY”, “DAY 2”, “R$ 120”, “IT WENT WRONG”,
“3 HOURS LATER”), in the vlog's language, following the background-caption style
rules in `edit-video` — white, bold, upper case, sans serif, and **about 80% of the
frame width** unless the user asks for another size.

Choose where each one goes from the pictures, not only from the words: a stretch where
**a person is on screen and the camera is steady**. Sample every candidate stretch at
**one frame per second** (`get_contact_sheet`, `interval: 1`) and reject stretches where
the framing pans, tilts, zooms, shakes or walks. The three layers must stay clean —
front: the person only; middle: the background caption only; back: the rest of the
video — so nothing else (placed pictures of either style, tags, cards, other captions,
push-ins or effect sections) overlaps a background caption in time. Verify with
`get_frames` `composited: true` inside the span; if the cut-out is poor, move it or
drop it. Unless the user says otherwise: **at most 2 or 3 in the
whole project.**

## Phase 28 — Editorial push-ins

Push-ins unrelated to silence may mark a punchline, reaction, reveal, key
information or change of opinion — but count the silence push-ins first. The
two kinds together must not turn the video into constant zooming.

## Phase 29 — Subscribe tag

One occurrence, normally, after the viewer has already received some value.
Avoid the first seconds, emotional moments, key scenes and visually crowded
shots. Text in the vlog's language (e.g. “Inscreva-se”). More than four seconds
on screen (`edit-video`).

## Phase 30 — Video effects

Unless the user asks: **at most 2 timed effects in the whole project**, usually
**2–4 s** each (`add_video_effect` sections), and only when semantically
justified.

## Phase 31 — Transitions

Plain cuts stay the default. Transitions mainly for a change of place, a change
of time, a change of subject, or going into B-roll. Do not use a different
transition on every cut.

## Phase 32 — Music

When a supplied audio file is clearly a soundtrack, consider
`set_project_soundtrack`. Never turn an ambiguous audio file into background
music on your own.

## Phase 32a — Even out the volume

**Always.** Every vlog is levelled: clips recorded on different days, and a speaker
who leans in and then drops their voice, arrive at the viewer at the same level.
It is the editor's own **Even out the volume across the project**, so switch it on
with `set_project_settings` → `{ "loudness": { "enabled": true } }` and leave the
rest of its settings as they are (`mode: "level"`, the default target). Do it once,
before the export, and mention it in the summary rather than asking about it.

It is not a licence to touch anything else about the sound: it lifts speech, never
silence, room tone or hiss, and per-clip volume and replacement audio stay as you
set them. Turn it off only if the user asks for the raw levels.

## Phase 33 — Noise

Never suppress noise automatically. `suppress_noise` / `set_noise_suppression`
only when the user explicitly asks to remove noise.

## Phase 34 — Graphic plan

With the structure done, prepare images, captions, background captions, extra
push-ins, Subscribe, cards, effects and transitions — as one or a few
`apply_edit_batch` calls, **dry run first**, then commit.

## Phase 35 — Validate the visuals

`get_frames` with `composited: true` on every added element: legibility, framing,
images, faces, text, effects, zooms, overlays. Treat `fitsInFrame: false` and a
non-empty `covers` in `get_timeline` as defects.

## Phase 36 — Editorial review

Ask yourself: Is the story still clear? Did any cut change the meaning? Is
information repeated? Is the rhythm right? Are there too many zooms? Do the
zooms feel motivated by the speech, or automatic? Are there unnecessary
effects? Is the editing drawing more attention than the content? **When an
element does not clearly improve the result, remove it.**

## Phase 37 — Preview

`preview` (and composited frames) with special attention to: the opening, the
first 30–60 s, changes of place, aggressive cuts, long removed silences,
push-ins, images, effects, Subscribe, cards, and the ending. Fix what you find.

## Phase 38 — Final technical check

`get_timeline`; confirm the revision; confirm no clip is waiting for its file;
confirm the duration; confirm the operations you intended are all present;
`checkpoint_project`.

## Phase 39 — Finish

`finish_editing` with a concise summary. Then read `videoPackaging.automatic` in
its result: when it is `true`, run `create-video-packaging` straight away; when it
is `false`, the user switched automatic Video Packaging off for this project, so
the edit ends here — do not make covers, titles, a description or tags unless
they ask.
In chat, report briefly the main changes — cuts (where, what, the words that now meet), push-ins, images (shot
list), cards, titles, tags, effects, transitions — plus the decisions you left
to the user, and the video description required by `edit-video`.
