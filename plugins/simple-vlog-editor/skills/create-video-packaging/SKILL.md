---
name: create-video-packaging
description: Use when the user asks for thumbnails, covers, video titles, a YouTube description, chapters, hashtags or discoverability tags for a video — and right after finishing an edit in SimpleVlogEditor when the project's automatic Video Packaging setting is on. Reads the project in the Video Editor (transcript, frames, QR links), researches how the topic ranks on YouTube, then delivers titles, description, tags and three covers into the Video Packaging tool.
---

# Create video packaging in SimpleVlogEditor

Packaging is what makes a finished video get watched: three covers, three
titles, a description with chapters and hashtags, and a tag list. All of it is
delivered into the **Video Packaging** tool through the `simple-vlog-editor`
MCP server, never left as text in chat.

Everything comes from the project that is loaded in the **Video Editor**. That
is where the transcript lives, where frames can be captured, and where the QR
links and the finished timeline are. Video Packaging reads the editor; it never
reads a folder on its own.

**Order matters.** Understand the whole video first. Then write the description,
the tags and the titles. Only then draw the covers, each one from its own title.
A cover drawn before the title exists is a cover about nothing.

**When it runs by itself.** The project decides, not you. In the Video Editor's
project settings the user has a checkbox — *Generate thumbnails, titles,
description and tags automatically* — and `finish_editing` reports it as
`videoPackaging.automatic` (also `autoVideoPackaging` in
`get_packaging_sources`, and in `get_project`'s settings).

- `true` (the default) — run this workflow as soon as `finish_editing` returns.
- `false` — the edit is the whole job. Stop there, exactly as before Video
  Packaging existed: no covers, no titles, no description, no tags, no
  `save_frames`. Run this workflow only if the user explicitly asks for
  thumbnails, titles, a description or tags.

A direct request from the user always wins over the setting. Do not change the
setting (`set_project_settings` `autoVideoPackaging`) unless the user asks you to.

---

## Step 1 — Make sure there is a project

Call `show_tool` with `tool: "video-editor"`, then call
`get_packaging_sources` **and** `get_video_understanding`. They answer with
everything below in one pass, so
do not probe with `get_project`, `list_assets` and `transcribe` first.

- `hasProject: true` — go on to step 2.
- `hasProject: false` — load the videos the user means into the editor with
  `add_media` (paths you already know) or `queue_media_import` (a folder), then
  analyse them as `edit-video` describes and call `get_packaging_sources` again.
- No videos to load, or the editor will not take them — stop and tell the user
  plainly: Video Packaging works from a project in the Video Editor, so at least
  one video has to be loaded and analysed there first. Do not invent covers from
  the file name.
- `unknown_command` for `get_packaging_sources` means the Video Editor page is
  not open. Ask the user to open the Video Editor and try again.

## Step 2 — Reuse what is already there

`get_packaging_sources` tells you, per clip, `transcriptReady`, `silenceAnalyzed`
and `savedFrames`, plus a stored `understanding` and the `savedFrames` list with
absolute paths.

- Stored understanding is not null — use it as a starting point, but still
  verify the final edited picture across the complete timeline before choosing
  covers.
- `transcriptReady: true` — `transcribe` returns the cached words; it costs
  nothing to call, but do not ask for a different model just to "refresh" it.
- `savedFrames` are candidates, not permission to reuse an old cover. The list
  only ever holds backgrounds saved from the edit **as it is now**; `staleFrames`
  counts the ones an edit has since invalidated, and those are refused by
  `set_video_packaging`. A background still has to fit the current creative
  direction.
- `understanding.stale: true` means the edit changed after it was written (a
  cut, a zoom, a caption, an effect). Read the finished video again and store a
  new one; chapters in particular will have moved.

Only what is genuinely missing gets done again.

## Step 3 — Settle the tag style

Call `get_packaging_tag_style`. It returns the lettering that will be used: its
`path` on disk, its `id`, its `name`, a description, the `mode` the reader chose
and the `available` styles.

The editor ships eleven styles — **Classic** (red, black and yellow torn blocks)
is the default — and the reader may have loaded one of their own, which the
application keeps across restarts.

Two modes, both decided by the reader in the Video Packaging tool:

- `mode: "default"` — the saved style is used. The call returns at once.
- `mode: "ask"` — the call **opens the style picker on screen and waits**. The
  editor minimises its activity console while the picker is up and brings it
  back afterwards. Call it early, before you start drawing, and simply wait; it
  falls back to the saved style if nobody answers.

Do not choose a style on the reader's behalf and do not nag them about it. If
they hand you an image file and ask you to use it, save it with
`set_packaging_tag_style` — that makes it their own style and keeps it.

The returned image is attached to every cover prompt as the lettering reference.
See `references/cover-prompt.md`.

## Step 4 — Understand the video, then choose three backgrounds

Read the whole transcript (`transcribe` per clip) and inspect the final edited
picture across the whole timeline. Start with `get_contact_sheet`, then use
`get_frames` with `composited: true` around promising moments so cuts, zooms,
text and effects are present exactly as the audience will see them. Sample the
opening, the central action and the final result, not just one convenient scene.
Work out what the video actually delivers, in what order, and where its strongest
moments are.

Store it with `set_video_understanding`: `summary`, `topics`, `chapters`
(seconds from the start of the finished video), `highlights` and `language`. This
is what step 2 of the next run reuses.

Then choose **three different real frames** to serve as cover backgrounds — one
per creative direction. Prefer people when people exist: front-facing, clear,
expressive faces, followed by frames that visibly show the video's action or
result. Avoid backs of heads, closed eyes, motion blur, tiny subjects and scenes
without context. Never invent a person, room, object or event.

Write them out with `save_frames` (clip id + the three source timestamps). It
saves the **finished picture** — the same composition as `get_frames` with
`composited: true`, with cuts, speed, zooms, captions, placed pictures, effects
and tags — in `video-packaging/frames/` beside the footage, and returns each
file's absolute `path`, its source `timestamp` and its `outputTime`, the second
it occupies in the finished video.

It refuses, before writing anything, an instant the export never shows:

- one inside a stretch that was **cut out** of the edit;
- one inside a **transition**, where two shots are blended;
- one whose person cut-out (Background Caption, picture behind the person, AI
  effect) could not be computed on this machine.

The refusal is `unfaithful_frame`, with a `suggestedTimestamp` for each rejected
instant when a nearby faithful one exists. Use it, or pick another moment. When
you look first with `get_frames` `composited: true`, choose among frames that
report `faithful: true`.

## Step 5 — Research the topic on YouTube, then write the titles

Before writing anything, search YouTube for the video's topic and read the
**titles, descriptions and recurring keywords** of the videos that actually rank:

- Prefer the highest-viewed videos on the topic.
- Pay special attention to **outliers** — a video with far more views than the
  rest of its own channel normally gets. That gap is the packaging working, and
  those titles are the ones worth learning from.
- Note the phrasing, the word order, the numbers, the brackets and the promise
  each title makes. Note which keywords appear in the first line of the
  descriptions.

Then write **three** titles into the titles inputs. Each title must:

- create curiosity — the viewer has to feel they are missing something;
- still deliver — it says what the video actually gives, in the video's own
  language, and never promises something the transcript does not contain;
- read like the titles that rank for this topic, without copying one;
- carry the keywords that matter, near the front;
- stay under about 70 characters so it is not cut off.

Title `n` belongs to background `n`: the pair is one creative direction.

From each title, write the **cover text** — the few words that will be set in
the tag lettering on that cover. It is not the title repeated: it is the hook
that makes the title land. Short, spoken, uppercase-friendly, two or three words
per line, at most three lines. It must create curiosity and still be honest about
what the video contains, the same as the title. Choose the cover text so it suits
the background you paired it with.

## Step 6 — Write the description

From the transcript and the frames, write a description that says what the video
delivers, in the video's own language. Structure it as:

1. Two or three lines that repeat the promise of the strongest title, carrying
   the keywords found in step 5 in the first line, because that is the part
   search reads.
2. Whatever context the video needs — what it is, who is in it, where it is.
3. **Chapters**, one per line as `mm:ss Title`, starting at `00:00`, from the
   `chapters` you stored in step 4. Use the finished video's clock.
4. Every link that appears in the video. `get_packaging_sources` returns
   `qrLinks` — every link a QR tag encodes on the timeline. All of them must be
   in the description, each with a line saying what it is for. A QR code the
   viewer cannot scan in time is only useful if the link is underneath.
5. **Hashtags** on the last line, three to five, the most relevant first.

## Step 7 — Write the tags

From the whole video and the keyword research, write the discoverability tags as
a comma-separated list: the exact topic first, then its close variants, then the
broader category, then the names and places the video actually features. Keep
them all true to the content. Around 15 to 25 tags is right; do not pad.

## Step 8 — Draw the covers, then deliver

Now, and only now, generate the three covers — one per title, using its paired
background and its cover text, with the prompt in
`references/cover-prompt.md`. Save each as a 16:9 PNG in the `coversFolder`
that `get_packaging_sources` returned.

If you have no way to generate images, say so in one line and deliver the rest;
the backgrounds, the titles, the cover texts and the prompts are enough for the
user to finish in the generator of their choice.

Deliver everything with one `set_video_packaging` call — absolute cover paths,
each cover's `sourceFramePath` (the `path` `save_frames` returned for its
background) and `sourceTimestamp` (that frame's **`outputTime`**, not its source
timestamp), the three titles, the description with real newline characters,
and the tags — with a unique `requestId`. A background saved before the last
change to the edit is refused: save it again and redraw that cover.
Omitted fields keep their current values and supplied arrays replace that
section, so a later fix can send only what changed. Use `get_video_packaging` to
check what is on screen before a partial update.

The editor brings Video Packaging forward by itself after the call. Immediately
call `get_video_packaging` and verify that all three thumbnails have a positive
`byteLength`, all three source timestamps and paths are present, and the titles,
multiline description and tags are visible. A zero-byte or missing image is a
failed delivery: fix it and verify again. Then call `set_ai_control_log` with
`view: "minimized"`; the reader can maximize the global log from any tool tab.

In the final response, state the three real final-timeline timestamps used. Do
not claim delivery until `get_video_packaging` confirms it.

---

## What not to do

- Do not put covers, titles, descriptions or tags into timeline text clips
  unless the user explicitly asks for them inside the video.
- Do not invent a link, a chapter or a claim the transcript does not support.
- Do not draw a cover before its title exists.
- Do not reuse an old generated cover or fabricate a scene instead of using a
  frame from the edited video.
- Do not deliver only in chat. If it is not in Video Packaging, it was not
  delivered.
