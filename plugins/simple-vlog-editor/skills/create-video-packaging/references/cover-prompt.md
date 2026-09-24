# The cover prompt

One cover per title. Each cover is drawn from three things:

1. **the title** it belongs to (step 5 of the skill);
2. **the background** — the frame saved by `save_frames` for that same
   position, handed to the generator as an image, never described in words;
3. **the tag style** — the image returned by `get_packaging_tag_style`, handed
   to the generator as a second image, as the lettering reference.

Attach both images to the request. A cover drawn from a description of the
background instead of the background itself is a different video's cover.

## The prompt

Fill the three bracketed fields and send it with the two images attached.

```
Make a thumbnail for a YouTube video whose title is:

[TITLE]

The first image is the lettering style the thumbnail's text must copy. The
second image is the background you must use.

Use the background exactly as given: do not replace it, do not redraw it, do not
change its framing, and do not change the faces of the people in it. Keep the
people who are already in the background and add no one else — no extra people,
no new subjects.

Improve only the colour, the lighting, the brightness and the contrast of the
background so it reads well as a thumbnail. Do not introduce noise, grain,
blur or artefacts, and do not soften or alter any face.

Set this text on the thumbnail, in the lettering style of the first image:

[COVER TEXT]

Copy that style's letterforms, weight, colours and torn brush-stroke blocks —
never its words. Two or three short lines, uppercase, high contrast, placed
where it does not cover a face.

The text must read as an extension of the title, not a repeat of it: together
they create curiosity and still tell the truth about what the video delivers.
The result must be 16:9 and legible at a small size.
```

## The styles

`get_packaging_tag_style` returns whichever style is current, with a description
of it. The editor ships eleven, and **Classic** is what is used when nobody has
chosen otherwise:

| id | what it looks like |
|---|---|
| `classic` | White condensed uppercase on torn red, black and yellow brush blocks. The default. |
| `home-classic` | Classic applied to household words, with a colour emoji and yellow spark marks. |
| `home-teal` | The same shape in teal, deep navy and coral. |
| `travel` | Rounded heavy uppercase on teal and orange blocks, with a small travel illustration. |
| `neon-blue` / `neon-pink` | Silver-white over a second line in cyan or hot pink, with a neon glow and no panel. |
| `promo-gold` | Silver over gold on a thick red rim. Retail-promo energy. |
| `pastel` | Friendly rounded type on soft painted pastel strokes with hand-drawn doodles. |
| `action-red` / `action-gold` / `action-blue` | Italic chrome over a gradient second line, riding a streak of motion light. |

The reader may also have loaded their own sheet; then `source` is `custom` and
the description says so. Whatever comes back, hand the **image** over — a
description is a fallback, not a substitute.

## Judging the result

Before delivering a cover, check it honestly:

- Is the background still the background that was handed over?
- Are the faces untouched, and is nobody in the picture who was not there?
- Is the lettering the style from the reference, and is it readable at the size
  of a phone thumbnail?
- Does the text plus the title make someone want to click, without promising
  anything the video does not deliver?

If a cover fails any of these, redraw it rather than shipping it.
