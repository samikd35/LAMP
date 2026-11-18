# The lamp shot: reference, first pass, revision

[First SAMUEL render](../samples/first-version.mp4) · [Editable title render](../samples/recreated-title.mp4) · [Frame measurements](frame-study.csv)

In the comparison, **left is the downloaded footage; right is the Three.js rig**. The two audio tracks are selectable: recreated foley first, reference sound second. The standalone reference edit keeps the complete fade and audio tail. Only the comparison copy is conformed to a common 13-second clock.

The downloaded reference, the credit-strip edit, and the side-by-side video and still are local study files. The original studio renders and measurements are included here.

## What was measured

The downloaded file contains 314 video frames at 24 fps. I decoded the entire clip into consecutive frame sheets, inspected enlarged poses at the turn, strikes and reveal, and compared them with the first 300-frame, 30 fps render. Audio analysis used the stereo spectrogram, native-frame peak/RMS envelopes and EBU R128 loudness. These are measurements of the recording, not an identification of the physical sounds used on the original stage.

[frame-study.csv](frame-study.csv) contains one row per native frame: 314 reference, 300 first version, 390 revised. `frame` is zero-based within each film. The luma column is mean absolute change from the preceding frame at 160 × 90; it includes fades and is **not** a displacement or joint-angle estimate. Audio columns measure the corresponding mono-downmixed interval; blanks mean the first movie has no audio stream. Do not directly compare frame indices between 24 and 30 fps. Use seconds.

## Critique and changes

| Moment in the reference | What failed in the first film | Revision in the editable studio |
| --- | --- | --- |
| Opening, roughly frames 0–30 | The reference lets the title establish itself; the first lamp was already parked beside a tightly set word. The beige, nearly uniform stage also made the bulb's direction difficult to see. | Fade onto a cool blue field. Matte ink lettering, wider optical spacing, thinner serifs, and a level, fixed camera. The first contact is heard before the whole performer is visible. |
| Right-to-left entrance, roughly frames 30–93 | The original passes several stationary letters, loses travel distance, brakes just past the target, then has to turn back. The first version had one preliminary hop, from the other side. Its following camera made the baseline move during flight and weakened the impression of weight. | The entrance crosses the right frame edge. Eight timed contacts include the offscreen run-up. Lateral velocity carries through each arc; braking happens while the base is planted. The path is staged in depth and resolves into the actual gap next to the selected glyph. |
| Turn and preparation, frames 93–133 | The original holds the base in place while the mechanism reorients. The first version communicated most intent by rotating the whole lamp. Its arm lengths and overlapping side rails read as a folding ruler at small sizes. | Separate body yaw and shade swivel. Shorter lower linkage, longer upper fork, separated tie bars, two springs anchored across moving joints, broader foot and a fuller reflector. The lamp folds before releasing upward. |
| Target strikes, around frames **145, 156, 167, 180 and 200** | The original makes repeated attempts. In the first render, a single landing immediately produced the whole result. Its long exit jump spent the largest gesture walking away from the gag. | Each contact reduces the remaining letter height. The base follows that changing support surface, leaves it on a new arc, then lands again. The deepest preparation and biggest vertical jump precede the last strike. The lens does not follow the apex. |
| Inspection and reveal, roughly frames 201–280 | In the reference, the eye is the shade: looking down, looking away, pausing, and finally facing us are separate actions. The original floor pool changes direction with the head. The first film ended with the lamp beside the word and had no comparable lighting cue. | The emitter and its moving floor pool follow the shade. The final swivel can address the viewer without spinning the weighted base. **Lamp replaces letter** holds this gag and fades. **Restore full name** deliberately diverges with a final dismount. Neither ending adds a subtitle. |

## Sound critique

The first export was not merely mixed too quietly: **it had no audio stream**. That removed the distinction between a light footfall, a loaded hinge and a decisive impact. Increasing the bounce height alone would not fix it.

The reference's approach has transients near 0.92, 1.42, 1.88, 2.33, 2.88, 3.29, 3.63 and 3.88 seconds. There is breathing room after the stop. The target strikes cluster at approximately **6.04, 6.50, 6.96, 7.50 and 8.33 seconds**; the last has substantially more low-frequency energy. Short higher-frequency sweeps continue through the inspection and final turn. The entire reference measured **−34.6 LUFS integrated, −8.5 dB true peak**. The quiet intervals matter; filling them with music would change the performance.

For personalized exports, the same exposure sheet drives new synthesized footfalls and spring cues. A contact combines a short rim tick, damped metal resonances and a lower body transient; approach panning narrows toward the selected letter. The final blow has a lower pitch and longer decay. Hinge friction, brief asymmetric reflections and silence separate the acts. A reference-title reconstruction measured **−32.6 LUFS integrated, −7.5 dB true peak**. Loudness similarity is not timbre identity. The reference cut, unlike the recreation, retains the original encoded AAC payload; its SHA-256 matches the download.

## Remaining differences

The source edit is the way to see the original performance without the lower line. Its picture was re-encoded after repairing that region; it is not a byte-identical video stream. The editable film is a reconstruction, not the original asset, artwork, materials or recorded sound. The A/B hold shows the differences: the P bowl and R leg are different, the recreated bulb/reflector has a different highlight, the lower linkage is less compact, and its floor pool is more concentrated. The original has hand-balanced spacing for five particular glyphs. The studio instead has to accommodate a single I, two dozen wide letters, accents, manual targets and portrait framing. The extreme leap is kept in frame in the editable version rather than deliberately losing the shade past the upper matte.

## Reproduce

With the source clip at `references/PIXAR_logo-50rAKjuTXbc.mp4`, run `node scripts/reference-cut.mjs` to prepare the local reference edit. Then run `node scripts/study.mjs` to regenerate the CSV and two-soundtrack comparison reel using the supplied studio renders. To produce a fresh editable title render, start the studio and run `npm run export -- PIXAR`. Everyday name and logo exports run independently of the study files.
