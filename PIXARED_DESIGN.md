# Pixared design decisions

Updated 20 November 2026. The approved **Closer view** images are the visual source of truth for the complete public redesign, its specification and all six implementation tickets. Use the rightmost cabinet in the phone study and the **Closer view** measurements. The existing Studio defines the appearance, motion, timing, audio and output of the films. [Desktop first visit](references/desktop-closeup-first-visit.png) · [Desktop playback](references/desktop-closeup-playback.png) · [Phone cabinet](references/crt-face-options.png) · [Phone framing](references/crt-picture-sizes.png)

## Confirmed with the owner

| Decision | Design consequence |
| --- | --- |
| One page and one TV for names and logos | Entering a name or choosing a logo changes the artwork in the same CRT. Both use the same preview, editing and download controls. |
| A domestic wooden TV that belongs in a 1986 living room | Use the wide cabinet from the supplied reference, convex glass on the left, two stacked dials and a speaker grille on the right, an aerial and short splayed feet. The set has its own silhouette and occupies part of the page. |
| A physical fold-down front for the first-visit invitation | The flap and its hinges center beneath the visible CRT glass, with equal side insets and the tuner column clear. The name field is present on arrival. Logo upload is in the same invitation. The flap gives both input paths room below the picture and closes for the performance. |
| A headerless page with a felt pennant and enamel pin | Pin the russet Pixared pennant to the upper left wall and the separate oval **GitHub ↗** button to the upper right. Allow space between each object and the centered clock. |
| A centered TV standing on the sideboard | Both splayed feet touch the top. Their shadows start at the points of contact. The furniture and television share a centerline. Opening the hinged front moves the panel while the feet stay planted. This replaces the earlier floating treatment. |
| A centered clock on the wall behind the TV | Show most of the dial. The top of the television covers a small lower segment. Keep the clock's hub visible between the aerials. Its slow movement continues during the film. |
| Closer view for the TV | Narrow the right-hand tuner strip and retain both stacked dials and the louvred speaker. Bring the whole set closer on the phone and desktop. On desktop, give the film more room by showing less of the wall and the cupboard doors beneath the set. Keep the aerial, both feet and the open fold-down in view. |

Closer view is the rightmost of the [three cabinet options](references/crt-face-options.png). The [measured phone comparison](references/crt-picture-sizes.png) uses frames from the existing films. The [earlier cabinet study](references/wood-cabinet-study.png) establishes the open and closed front. The [period reference notes](references/pixared-tv-research.md) document the research and visual studies.

## Centering the room

The wireframes interpret “center” as the midpoint of the walnut TV body at the midpoint of the usable viewport, with the keyboard closed. Measure the wall pins and clock independently so their size cannot push the TV sideways or down. Place a wider, freestanding sideboard directly beneath the set on the same centerline.

The clock hangs on the olive wall. On the phone, start its diameter at about 30% of the TV body's width. On desktop, size it to the space above the closer set, with a little wall showing above its rim and the aerial tips. Aim to tuck the bottom fifth of the clock face behind the wooden top edge. The hub and most hour marks remain visible. A muted putty face, legible hands and a silent second hand sweeping once a minute carry the room's continuous motion.

## Wall identity

The felt Pixared pennant identifies the room. The whole enamel **GitHub ↗** pin on the upper right of the back wall is a source link. Give it a 44 × 44 CSS-pixel minimum hit area, a visible keyboard focus outline and an accessible name such as “View Lamp Name Studio on GitHub, opens in a new tab.” Opening the source in a second tab keeps the current film and render available. The printed Pixared lettering is provisional. [Proposed repository](https://github.com/samikd35/LAMP) · [GitHub brand assets](https://brand.github.com/foundations/logo)

The pins stay visible behind the first-visit modal. Its **Close** action returns focus to **Edit** and makes the wall link available. Keep the clock decorative. The proposed **Room motion** switch in the fold-down is available on first visit and through **Edit**, separately from the film's transport. Respect reduced motion from the first frame. [W3C guidance on pausing background movement](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)

## Giving the film more room

The three [visual options](references/crt-face-options.png) read left to right. The [phone measurements](references/crt-picture-sizes.png) compare the same complete 16:9 frame of Sam on a 360-pixel-wide viewport. The former 212 × 159 aperture is the baseline. Film sizes below are rounded CSS pixels. Area gains use the unrounded 16:9 frame. The studio film's own black bars are included.

| Design | Case width | Landscape | Square | Portrait | Landscape area gain |
| --- | ---: | ---: | ---: | ---: | ---: |
| Previous face | 320 | 212 × 119 | 159 × 159 | 89 × 159 | — |
| Slim tuner | 320 | 236 × 133 | 176 × 176 | 99 × 176 | 24% |
| Lower dials | 320 | 260 × 146 | 180 × 180 | 101 × 180 | 50% |
| Closer view | 344 | 254 × 143 | 189 × 189 | 106 × 189 | 43% |

- **Slim tuner.** Narrow the right-hand column from about 70 to 48 CSS pixels in the drawing. Remove the flat wood beside the stacked dials and draw the glass lip closer to the outer moulding. Two 44 × 44 targets fit down the column with the speaker underneath. This makes the fewest changes to the familiar face.
- **Lower dials.** A 25-pixel strip on the right holds just the speaker louvres. Move both dials side by side to the lower right, beside the three transport and editing keys. The film gets the most width. The five controls now share the lower fascia. Keep their hit areas separate when the flap is closed.
- **Closer view (selected).** Use the Slim tuner face and scale the complete case uniformly from 320 to 344 pixels on a 360-pixel phone. Each side margin is 8 pixels. The landscape picture comes within 6 pixels of Lower dials while retaining the stacked dials. The added height gives square and portrait films the most room of the three.

Keep reflections at the outer glass lip, the speaker slats dark and the wooden side reveal narrow. Fit each entire film inside the curved mask. In the closer view the lamp and letters are about 20% larger in each dimension than the baseline. The larger frame leaves modest phone margins for the wood box and its support.

## Desktop and mobile

- **Desktop.** At 1280 × 800, use the approved framing as the target. Center a 704-pixel-wide case at (640, 400), with a complete landscape film of about 519 × 292 CSS pixels. Both feet touch the pale sideboard top. The lower edge of the viewport cuts through the cupboard doors. The clock, left pennant and right GitHub pin frame the set. On [first visit](references/desktop-closeup-first-visit.png) the open flap and both actions sit fully below the glass and above the viewport edge. The camera holds this distance as the front closes for [playback](references/desktop-closeup-playback.png). On shorter laptop windows, limit the case size by the height needed for the aerials and open flap.
- **Phone.** At 360 × 640, center the selected 344-pixel-wide case at (180, 320) on a 356-pixel sideboard. Use 16-pixel input text and at least 44 × 44 CSS-pixel hit areas independently of the visible brass parts.
- **Keyboard open.** Initially focus the dialog heading so the visitor can see the sample performance and **Upload a logo** before typing. The measured study reserves 280 pixels for the keyboard. Let the scene scroll vertically just enough to show the field and both actions. The wall pins can leave the viewport. The TV stays horizontally centered and its feet keep their contact with the sideboard. Return to the centered view when the keyboard closes.
- **Film framing.** The table above gives the contained film dimensions by format. Landscape gains most from extra glass width. Square and portrait are height-limited. A proposed **Enlarge** action on the set can give portrait films more height. The exported film uses its selected dimensions.

## Public interaction

The public UI adapts the current name, logo and export operations to these cabinet controls.

| Moment | Visitor experience |
| --- | --- |
| First visit | The visitor arrives with the front panel already open below the CRT. The full 13-second **PIXAR** film plays once, muted. The lamp lands on the **I**. After playback the CRT returns to the PIXAR poster. The panel contains **Your name**, **Play my preview**, **Upload a logo** and **Close**. Tab stays within the open dialog. **Close** or Escape folds the panel up, keeps the draft and returns focus to **Edit**. |
| First personal preview | Type **Sam** and press Go or **Play my preview**. The panel folds up flush with the cabinet and the 13-second film targets the **a** automatically. For **NOVA**, choose the file in the same panel, see its thumbnail and press the same play key. The 16.6-second film targets the orange **O** in this example. The panel stays closed when the film ends. The lower front offers playback, **Edit** and **Prepare MP4** with the panel shut. |
| Customize | The upper **Landing** dial opens a keyboard-operable list. The glass can also take a direct selection. The lower **Sound** dial toggles preview sound. **Edit** reopens the current draft for artwork, colors, film shape and the name-only ending. |
| Prepare and download | **Prepare MP4** captures the current artwork and settings. The key reads **Preparing…** while the separate render runs, then **Download MP4**. Keep the browser preview available. Identify which version is ready if the visitor edits the draft during rendering. The MP4 contains the film itself. |
| Recover | An invalid upload leaves the last good artwork and settings intact, gives a specific inline reason, and offers **Choose another file**. A failed render offers **Retry render** for the saved version. The public set only needs to show the status of the visitor’s film. |

The proposed public surface shows one film and its render status. The timeline, batch tools and multi-job queue belong in the Studio editor. Use native dialog focus and visible focus rings. After submitting, place focus on the transport. Announce upload and render outcomes through a status region. [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

## Where 3D earns its place

| Layer | Proposed treatment |
| --- | --- |
| Cabinet | Model the outer profile, glass lip, aerial, feet, dials and hinge. The opening flap reveals its thickness, and a dial can turn one detent when a selection changes. Bake wood grain, fine grille detail and soft lighting into the surfaces. Keep the cabinet steady while people aim, type or watch. |
| Film | Reuse the existing Three.js performance and camera framing. The preview currently creates its own WebGL renderer and advances the scene at the film frame rate. Keep decorative effects outside the film and its export. [Film scene](src/scene.ts) · [Existing playback](src/editor.ts) |
| Surroundings | Give the sideboard enough depth to show its top and front. Bake the contact shadows into the resting pose. Put the clock face and its independently drawn seconds hand behind the TV, with the walnut top edge masking the lower arc. The felt pennant and enamel pin can be still surfaces. |
| Interaction | Overlay real HTML fields, buttons and selectors on the cabinet. Touching a dial, pressing a key and selecting from a list must produce the same result. The 3D pieces can follow the HTML state. |

Start with a cabinet poster, sample frame and usable form. Load the live scene when the visitor engages the flap. On a modest phone, cache the wall, furniture and cabinet during playback. Rotate the small clock hand independently and redraw the cabinet when the hinge or a dial changes. Suspend ambient work in a hidden tab. [Three.js guide to rendering on demand](https://threejs.org/manual/pages/rendering-on-demand.html)

Keep the grounded television steady during entry, playback and export. With reduced motion, hold the clock, start the sample on a poster and change the flap pose directly. Personal playback begins on the visitor's play action.

## Implementation workflow

The owner chose Matt Pocock’s skills and GitHub Issues in `samikd35/LAMP` for the Pixared spec and implementation tickets. Use `/to-spec` to capture the agreed experience, `/to-tickets` to split it into working features, and `/implement` to build each ticket. [Pixared issue tracker](https://github.com/samikd35/LAMP/issues)

The deliverable is the complete public Pixared UI redesign. The room, responsive TV, both artwork flows, cabinet controls, accessibility, export wait, download and recovery all belong to this release. The owner confirmed that name and logo animation and their underlying systems continue to work as they do in Studio. The public controls use the existing import, targeting, playback, render job, retry and download operations. The TV follows the returned job identifier for the visitor’s film. **Sam** and **NOVA** are examples for checking the real journeys. Hosting the existing local service is separate work. [Existing film scene](src/scene.ts) · [Studio server](server/studio.mjs)

The owner approved testing the redesign through the public page and the MP4 downloaded from it. Every ticket includes the pinned source images and a visual acceptance check. [Production UI specification](https://github.com/samikd35/LAMP/issues/1)

| Implementation ticket | Depends on |
| --- | --- |
| [#2 Enter the finished room](https://github.com/samikd35/LAMP/issues/2) | — |
| [#3 Play and edit a name film](https://github.com/samikd35/LAMP/issues/3) | #2 |
| [#4 Play a logo film and recover a failed upload](https://github.com/samikd35/LAMP/issues/4) | #2 |
| [#5 Customize either film](https://github.com/samikd35/LAMP/issues/5) | #3 and #4 |
| [#6 Prepare and download an MP4](https://github.com/samikd35/LAMP/issues/6) | #3 and #4 |
| [#7 Keep the correct film and draft through failures or edits](https://github.com/samikd35/LAMP/issues/7) | #5 and #6 |

## Still to verify

Compare the running desktop page with the approved mockups at 1280 × 800 and check flap clearance in shorter laptop windows. Check the selected case at narrower phone widths, then verify the clock overlap, foot and flap clearance, 44-pixel targets, keyboard scroll and focus restoration, full portrait frame and 30 fps film playback on a device.

## Superseded visual studies

The earlier 532-pixel desktop framing showed the full sideboard on [first visit](references/desktop-closer-first-visit.png) and [during playback](references/desktop-closer-playback.png). The owner requested a closer view with a larger film.

The owner rejected Projector Light, Tuning Field and Color Gels. They chose the sideboard setting, then replaced the floating pose with feet resting on the tabletop and moved the clock behind the center of the television. The [setting comparison](references/catalogue-and-sideboard.png), [hover test](references/cabinet-hover-study.mp4), [wall-object alternatives](references/sideboard-wall-details.png) and [wall motion comparison](references/sideboard-wall-motion.mp4) preserve that design history.

The owner chose the middle treatment in the [first wall-pin comparison](references/centered-tv-wall-pins.png) and moved GitHub to the right side of the same wall. The [earlier responsive diagrams](references/centered-tv-layout.png) document fold-down and keyboard behavior with the former pin positions.
