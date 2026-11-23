# StudioBindahh

Write, plan and direct — for **screenplays**, **stage plays**, **two-column AV scripts**, **podcasts** and **photo shoots**. No install, no account, no build step.
Everything is saved privately in your browser (IndexedDB). Use **Backup** (or **Folder sync**) to keep copies.

## Run it

- Double-click `Start StudioBindahh.bat` (needs Python), **or** run `python serve.py` and open <http://localhost:5173>, **or** open `index.html`.
- **Always open it the same way.** Browsers keep `file://` and `localhost` data separate. "Back up all" + Import moves projects between them.

## What's inside

| Area | What it does |
|---|---|
| **Script** | Screenplay and stage-play editors. Auto-formatting, character / location / time autocomplete, **bold / italic / underline** (`Ctrl+B/I/U`), **dual dialogue** (`Ctrl+D`), automatic **(CONT'D)** and **(MORE)**, **line notes** (`Ctrl+Alt+M`), **revisions** with `*` margin marks and coloured pages, **locked scene numbers** (new scenes become 4A, 4B…), outline with drag-to-reorder, find & replace, undo/redo, focus mode. Import Fountain, Final Draft (.fdx) and **PDF**; export Fountain, .fdx, text and PDF. |
| **PDF script import** | Drop in a screenplay or stage-play PDF (home screen, or Script → Import / Export). The reader works from each line's position on the page: it learns the script's own indents, strips page numbers, CONTINUED, headers and revision asterisks, rebuilds wrapped lines, merges speeches split by (MORE)/(CONT'D), rebuilds dual dialogue, reads the title page and keeps margin scene numbers. A review step shows the result, lets you fix any line's type and switch options before importing. Scanned PDFs need OCR first. Uses pdf.js (loaded once from a CDN, or put it in `js/vendor/` for offline use). |
| **Real pagination** | Pages are laid out in true Courier cells (55-line, 1.5"/1" margins), so the editor's page counts and page markers match the printed PDF. |
| **Corkboard** | Index cards for every scene: edit headings and synopses, colour-code, drag cards to reorder the script. |
| **Breakdown** | Built around shared **elements**. Select words in the script to tag them; each tag is a *mention* that links to one element profile in Props & Wardrobe. Different phrasings of the same thing join automatically — “bright red sack” and “sack” become one element, while “blue sack” stays separate — and the selection palette offers “Same as an existing element?”. Plurals match (“mop” → “mops”, “knife” → “knives”). Per scene you get: a scene strip (location link, cast with profile links, shoot day, shots, frames), a quantity for every element, status and photo, **⋮ menu** (open profile, rename, merge, tag all mentions, remove, delete), **Tag all mentions in the script**, and for wardrobe & makeup a **cast-by-item grid** to say exactly who wears what in that scene. An **Element list** report shows every element across the script. |
| **Shot list** | Per-scene coverage with director's notes, reference images, shot tags, and the storyboard frame for each shot. See **Storyboard** below. |
| **Overview** | Project dashboard: progress tiles (script, schedule, shots, casting, props, wardrobe, tasks, budget), next shoot day, a “needs attention” list and upcoming tasks. |
| **Search (Ctrl+K)** | Find and jump to any scene, character, person, role, prop, wardrobe item, task, location, shoot day or breakdown tag; plural-aware. |
| **Lookbook** | Mood boards of reference images, colour swatches and notes. Drag images in, make a board per character or location, print, or send a board to the pitch deck. |
| **Schedule** | Stripboard or **calendar**; drag scenes onto days; auto-schedule by location; **cast-unavailability and double-booking warnings**. |
| **Call sheets** | Generated from each day; print to PDF; **Email** dialog builds the message and recipient list. |
| **Reports** | **Day out of Days**, one-liner, character report, **continuity chart and costume plot**, **props by scene**, and the **Daily production report** (one per shoot day: times and hours worked, scenes completed/partial/not shot, pages and setups, ahead/behind total, incidents, equipment, media; pre-fills from the shot list). CSV and print. |
| **Casting** (a tab inside Cast & crew) | A board of roles with candidate cards: headshots, ratings, audition and callback dates, notes. *Cast this actor* adds them to Cast & Crew and call sheets. Printable casting sheet. |
| **Tasks** | Kanban board (To do / In progress / Blocked / Done) with drag-and-drop, departments, assignees, due dates, overdue flags, scene links, list view, CSV and print. |
| **Pitch deck** | One click builds a deck from your project (cover, logline, synopsis, characters, look & tone, team, budget). Edit slides, choose a theme, present full-screen, export a 16:9 PDF. |
| **Cast & crew** | Table or card view with **full profiles**: photo, identity, contact, representation, emergency contact, wardrobe sizes / skills / kit, dietary needs, deal and rate, unavailable dates, paperwork checklist, notes, and the scenes and days they work. Printable profile sheets. |
| **Props & wardrobe** | The element manager. Every item is a profile: photos, **“also called” names** (the phrases used in the script), category, status, source, vendor, cost, continuity and care notes, plus a **per-scene editor**: which scenes it appears in, the quantity in each, and — for wardrobe — **which characters wear it in which scene**. Merge duplicates (select in Table view, or from an item), see wardrobe **by character**, and pull everything into the Budget. Feeds call sheets, cast profiles, search and reports (props & wardrobe by scene, costume plot, element list). |
| **Locations** | Location cards with permits and photos. |
| **Blocking & cues** | Top-down stage diagrams with animated frames, and a lighting/sound cue sheet. |
| **Undo everywhere** | Ctrl+Z / Ctrl+Y (or the top-bar buttons) work in every section, not just the script. |
| **Drafts** | Script → Drafts: save named drafts, compare any draft with the current script (pages, scenes and words, scenes added / removed / changed), restore with one click. One is saved automatically each day you write, and before imports and character renames; restoring saves your current script first. |
| **Rename / merge character** | Cast & Crew → Rename / merge (or from a cast profile). Changes the name everywhere at once — script cues and mentions, cast profile, casting role, wardrobe and prop assignments, breakdown tags, stage blocking — and merges two characters into one if you pick an existing name. |
| **Budget from rates** | Budget → Build from rates: cast and crew lines come from the rate on each profile × the days they are actually scheduled (Day out of Days), and location fees from each location's daily cost × days used. Re-running updates, never duplicates. |
| **Data safety** | Deleting a scene never silently destroys its shots, tags or frames: you're warned, Ctrl+Z restores them, and *Backup → Clean up unused data* removes leftovers only when you say so. |
| **Folder sync** | Mirror every project to a folder you pick (OneDrive, Dropbox, Google Drive, network share) so projects follow you between computers or are shared with a team. Chrome / Edge. Conflicts ask which version to keep. |

## Industry standards (all offline)

**Screenplay**
- **Omitted scenes** — keep their number and print as OMITTED; restore from the outline.
- **Locked pages & A-pages** — Script → Revisions → *Lock pages*: every page keeps its number; added text becomes 12A, 12B. *Export → Print revised pages only* sends just what changed, on coloured paper.
- **Watermarked PDFs** — Export → *PDF with watermark…* stamps a recipient name on every page.
- **TV acts** — an *Act Break (TV)* element (Ctrl+8) with page break, for teasers, cold opens and act outs.
- **Story structure** — Corkboard → *Story structure*: Three-act, Save the Cat, Hero's Journey or Eight sequences, with target pages versus where beats actually land.
- **Draft compare with redlines** — Drafts → Compare → *Redline* shows word-level inserted / deleted text for any scene.
- **Table read** — the speaker button reads the script aloud with a different voice and pitch per character.
- **Import** Fountain, Final Draft, PDF, and Highland / zip archives.

**Stage**
- **Front matter** — character list, setting, time and running time print after the title page.
- **Act.scene numbering** (1.1, 1.2, 2.1) and proper heading parsing for stage scenes.
- **Calling script / prompt book** — pin each cue to a line; the calling script shows STANDBY and GO in the margin, with page numbers, and prints.
- **Rehearsal, tech, dress and performance days** with matching call sheets and reports; the performance report records house open, curtain up/down, interval and running times.
- **Character / scene chart** (with entrances and exits), **costume change report** (flags quick and on-stage changes), and a **pre-set & strike list** (how each prop gets on stage).
- **Scaled set plans** (width × depth in m or ft, unit grid, scale bar, position read-out) and **camera, light and boom** icons with a field-of-view cone for film overhead diagrams.

**Production**
- **Shoot-time estimates** per scene, **company moves**, and a day-length warning on the stripboard.
- **Sides** — print the script pages for any shoot day from the Schedule or call sheet.
- **Script supervisor** — a take log per shot (circle / NG / alt, camera and sound rolls, timecode, notes), camera report, sound report and continuity log. Circling a take marks the shot done and feeds the daily report.
- **Budget** — account codes, above / below the line, fringes, contingency, a **top sheet** and **actuals against budget**.

**Formats & series (all offline)**
- **Two-column AV script** — New project → *Two-column AV script*: Segment headings, Video (left), Audio (right), On-screen text and Music/SFX. Pairs sit side by side, paginate and print in 28-character columns, and import / export as a **CSV** (Segment, Video, Audio). Plain-text export is two columns too.
- **Multi-camera sitcom format** — Script → Title page → *Sitcom (multi-camera) format*: double-spaced dialogue, ALL-CAPS action, underlined headings and “SCENE A, B, C” lettering that restarts each act. Works with acts, locked pages, omitted scenes, dual dialogue and revisions.
- **Series & episodes** — *Series bible* (Project section): make any project an episode, then **New episode** (optionally carrying over cast, casting roles and locations). The bible — premise, tone, rules, world, writers’ notes, characters with arcs, season arcs — is shared by every episode, plus an **episode guide** (S01E03, loglines, pages) you can print. Episode number appears on the title page and home screen.
- **Lined script** — Script supervisor → *Lined script*: pick a slate, drag down the script’s right margin to draw its coverage; solid = on camera, dashed = off camera, labels show the slate and circled takes. Lines stay attached to the script text as you edit, move across page breaks, and print.
- **Podcast & Audio suite** (New project → *Podcast & Audio*, or the sample on the home screen)
  - **Unscripted episode rundown** — timed segments with running cumulative clock, target durations, talking points, attached audio drops and live recording pacing timer (ahead / behind tracking). Preset templates for interviews (45m), co-hosted panel news (60m) and solo deep dives (25m). CSV export and quick summary copy.
  - **Guest prep** — guest profiles with pronouns, remote recording links (Riverside, Squadcast, Zoom), timezone, discussion angles / question checklists, sensitive "no-go" topics and release status.
  - **Sponsor reads & ad copy** — pre-roll, mid-roll, post-roll tracking with promo codes, vanity URLs, mandatory talking points, scripted copy and one-click copy.
  - **Show notes & chapter generator** — auto-compiles YouTube / Spotify chapter timestamps from the rundown, guest links, sponsor codes and summary into ready-to-publish notes.
  - **Scripted audio drama editor** — Scene/Segment, Speaker, Delivery/Mic direction, Dialogue, Sound Effects (SFX), Music cues, Audio clips/tape and Sponsor reads with typing auto-triggers (`SFX:`, `MUSIC:`, `CLIP:`, `SPONSOR:`). Exports to Fountain, plain text and PDF with speech-speed runtime calculation (~140 WPM).

**Contacts & settings**
- **Global contacts** (home screen → *Contacts*) — one address book of cast / talent and crew, shared by every production. Add people with full profiles, import / export (JSON, CSV). In any project, *Cast & crew → Import from contacts* copies the people you tick into the project; *Save to contacts* (or the button inside a profile) adds a project's people back, updating anyone already saved.
- **Settings** (home screen → *Settings*, or *Customize tabs* inside a project) — show or hide any section, with one-click presets for **Film & TV, Stage, Video / AV, Photography** and **Writing only**. Set it for every project or for just one; hidden sections keep their data.

**Photo shoots** (New project → *Photo shoot*, or the sample on the home screen)
- **Shoot brief** — client, concept, mood, objectives, usage & licensing, deliverables list and approval stakeholders; prints as a one-sheet.
- **Setups & looks** — each look / lighting set-up (“Hero beauty — Studio A — Morning”) with location, slot, estimated time, concept, notes and talent. Setups drive the schedule, call sheets, breakdown, budget and reports.
- **Photo shot list** — frames per setup with subject, format, camera & lens, lighting, wardrobe, props, hair & makeup, reference image and a hero flag. Track each frame from *Planned* to *Delivered*, as a list or a drag-and-drop status board. CSV and print.
- **Set & lighting** — top-down diagrams with strobes, softboxes, umbrellas, reflectors, flags / V-flats, backdrops, talent marks and cameras.
- **Run of show** — a timed plan for each shoot day (hair & makeup, setups, moves, breaks, lunch, wrap), built from the schedule and re-flowed as you edit; flags a day that runs past wrap.
- **Gear & rentals** — categorised kit list with rental house, day rate, days, pick-up / return and status; pack list and rental-order printouts; one click sends costs to the Budget.
- **Releases & permits** — model releases, minor consent (generated from date of birth), property releases, permits, insurance and usage agreements, with signed / expiry tracking.
- **Selects & approvals** — import frames as small previews, rate 1–5, pick / reject, colour-label, link to shots and track retouch → client review → approved. Keyboard viewer, filters, contact-sheet print, CSV and *Copy picks* for your editing software. Full-size files stay on your drive.
- The Overview (tiles and attention list) and Reports (*Shot status*) understand photo projects too.

**Budget & finance**
- **Dashboard** — total budget, spent, committed, remaining and forecast at a glance, with an on-track / at-risk / over-budget status, budget-vs-spend bars by category, spend by month, biggest overruns, top vendors and a “needs attention” list.
- **Budget sheet** — editable categories (above / below the line, fringeable, colour-coded) with collapsible sections, account codes, quantity × unit × rate, live totals, line details (vendor, due date, forecast override, notes), keyboard navigation, search and an over-budget filter. Lines created from cast / crew rates, locations, props, wardrobe or gear are tagged *auto* and update on **Sync from production**.
- **Expenses** — a ledger of everything paid, invoiced or committed (POs and bookings), each tied to a budget line (or contingency), with vendor, reference, method and an optional receipt photo. Filter, bulk-assign, duplicate; import a bank / card statement CSV.
- **Forecast** — every line shows budget, actual, committed, estimate-to-complete, forecast and variance; mark a line complete or override its forecast.
- **Additions & rules** — fringes, tax / VAT, insurance, agency or production fees and contingency as percentages (of any slice, or a running total) or fixed amounts, applied in order; expenses can be drawn against contingency.
- **Top sheet, cost report, detailed budget, ledger, cash flow** — all printable; CSV export / import of lines.
- **Cash flow & funding** — monthly spend (actual, committed, forecast) against funding drawdowns, with a balance that flags shortfalls.
- **Versions** — save snapshots, mark one as the approved baseline (shown as “vs approved”), compare with today line by line, restore. **Lock** the budget once approved so only expenses change.
- **Budgets (home screen)** — every project’s budget, spend, forecast and status in one table, totalled per currency.
- Category templates for Film & TV, Stage, Photo shoot and Blank; older budgets migrate automatically (actuals become opening expenses).

**Live production dashboard** (Produce → *Live dashboard*)
- Runs a shoot day in real time: a big clock, an **ON TIME / BEHIND / AHEAD** status with a live **forecast wrap**, scenes and pages done, shots circled, open problems and daylight left (from the call sheet's sunset).
- **Now & next** cards with a running timer for the scene being shot; one tap to *Start*, *Complete*, *Delay* or *Move to another day*.
- **Live schedule** — a timeline of the day: planned bars (outline) against actual and forecast bars, company moves, lunch, a NOW line, sunset and wrap markers. Click any scene for actions: log a delay, reorder, move to the next or a new day, drop it, edit actual times.
- **Alerts** that update as the day moves — meal break due or overdue, forecast past the call-sheet wrap or the day-length limit, short turnaround before the next call, exterior scenes finishing after sunset, cast not yet on site for the next scene, and suggestions of which scene to move to recover time.
- **Problems log** (category, severity, owner, scene) — resolve, monitor, or turn into a task; **Tasks** for today with one-tap progress and a quick-add; **Cast & crew check-in** (called → arrived → on set → wrapped, with lateness flagged); an **activity log**.
- Everything feeds the **daily production report** (first shot, lunch, wrap, scene status, incidents). **TV mode** fills the screen for the production office.

**US / UK standards** (project option — chip in the top bar, or *Standards & formats*)
- One switch changes terminology (Wardrobe ↔ Costume, Script supervisor ↔ Continuity, Daily production report ↔ Daily progress report, General crew call ↔ Unit call, Calling script ↔ Prompt copy, Intermission ↔ Interval, Per diem ↔ Subsistence, camera / sound report ↔ sheets), date and clock format (12-hour ↔ 24-hour, MM/DD ↔ DD/MM), paper (US Letter ↔ A4 — scripts re-paginate and print to the chosen size), units (feet ↔ metres, with set plans converted), currency, fringes ↔ employer on-costs, sales tax ↔ VAT, union and department lists.
- Working-time defaults (day-length warning, meal break, turnaround) follow the region and drive the schedule, run of show and live dashboard; they are typical defaults, editable per project.
- Pick the default for new projects in Settings, or per project when creating it. Clock, paper, units and currency can each be overridden.

**Live collaboration** (Share button in the top bar; *Join a session* on the home screen)
- **Start a session** from any project: pick your name and a session code (auto-generated, e.g. K7M-9QX-4TP-2WD), and choose whether people who join can edit or only view. Others on the **same Wi-Fi or network** open the address shown (like `http://192.168.1.20:5173`), choose *Join a session* and enter the code. They can also paste your address into *Join a session* from their own copy of the app.
- **Live editing** — changes from everyone merge in real time: script text, scene order, breakdown, shots, schedule, budget, tasks and every other section. Two people editing the same line is settled automatically (last change wins) and everyone ends up with identical data; if someone drops off the network, their device catches up when it reconnects.
- **Presence** — see who is in the session, what section each person is in, and in the script, a coloured marker on the line each person is editing. A built-in chat sends messages to everyone.
- **Roles** — the host can switch anyone between *Can edit* and *View only* at any time, or remove them. View-only guests see everything live but cannot change anything.
- **Secure by design** — the host's computer answers other devices only while a session is open. All project data and chat are encrypted in the browsers with a key derived from the session code (AES-256 + HMAC); the code itself is never sent over the network, every request is signed, wrong codes are rate-limited, and the server only relays encrypted bytes. Only people with the code can read or change anything. (Use it on a network you trust, since the page itself is served over plain HTTP.)
- Requirements: the host runs StudioBindahh through `Start StudioBindahh.bat` (or `python serve.py`) and keeps it open; on first run Windows may ask to allow Python through the firewall for private networks. Guests need only a browser. Undo is switched off during a session so nobody undoes other people's work — use Drafts or budget Versions to go back.

**Contacts & shot tags**
- **Flexible contacts** — a contact can be cast, crew or both, hold several positions (department and role), and carries a list of **credits** across productions that fills in when you save a project's people to contacts. Importing lets you choose *as Cast* or *as Crew* and the position for that production; the same person can be in a project in both roles.
- **Shot tags** — coloured tags (Hero, VFX, Stunt, Drone, Insert, Pickup, Green screen…) on every shot in the Shot list and Photo shot list. Tag one shot or many at once (*Select shots*), filter by any or all tags, rename, recolour, merge, assign a department, and see a *Shots by tag* report; tags appear in CSV and print.

**Storyboard — a concept tool first**
- **Frames are free.** Sketch a story without any script or shot list: frames live in your own named **Sequences** (“Opening”, “The chase”…), by scene, or on a **Filmstrip** with running time. Tie a frame to a scene and a shot whenever you like — or never. *Build* makes frames from your scenes or from your shot list, and **Create shots from frames** goes the other way (size, angle, movement and description come across; linked shots can stay in sync).
- **Frame studio** — a full editor on a large pasteboard: layers (image, drawing, text) you can **move, scale, rotate, flip, crop, copy / cut / paste (Ctrl+C / X / V, across frames), duplicate and reorder**, with opacity, numeric X / Y / W / H / rotation, and Fit / Fill / Centre. Paste or drop in images, zoom and pan the pasteboard, onion-skin the previous frame, thirds guides, undo / redo, PNG export. Pen, eraser, line, arrow, rectangle, ellipse and text tools.
- **3D distort** — pin any layer by its four corners (or use the tilt up/down, tilt left/right and perspective sliders) so a drawing lines up with the room, floor or horizon; cropping and drawing keep working on a distorted layer.
- **Camera** — frame the shot with a camera box that can be moved, zoomed and rolled; give it an end position (B) for a **push in, pull out, pan, tilt or roll**, with easing and a live preview. Park oversized background art outside the frame and let the camera move across it.
- **Present & export** — the animatic plays the camera moves and holds each frame for its seconds; **Video** records the whole thing to a .webm file. Print, copy / paste whole frames, drag to reorder between sequences.

**Folded tabs & formats**
- **Tab folding** (Settings, or *Customize tabs* inside a project; global or per project): related sections share one menu entry with sub-tabs across the top — **Visualize** (storyboard, shot list, lookbook, blocking), **Breakdown** (breakdown, props & wardrobe, locations, gear), **Schedule**, **People**, **On set**, and more. Choose Off, Balanced or Compact, or fold hubs one by one.
- **Adapts to the format** — sections that make no sense for a format are hidden (no photo tabs in a film, no shot list or script supervisor on a stage play), and groups change with the format: on a stage play, Blocking & cues joins *Rehearsal & show*, Visualize becomes *Design*; on a photo shoot, it is *Look & lighting*, *Shoot day* and *Talent & crew*.

## Writing notes

- Formatting uses Fountain-style markers: `**bold**`, `*italic*`, `_underline_`, `***bold italic***`.
- Dual dialogue: put the cursor in the second speaker's Character line and press `Ctrl+D` (adds ` ^`).
- Revisions: *Revisions → Start new revision*; every line you change from then on is marked and prints on that colour of paper.
- Unavailable dates (Cast tab): `2026-12-01, 2026-12-05..2026-12-07`.

## Files

`index.html` · `css/app.css` · `js/core.js` (storage, formats) · `js/layout.js` (rich text, pagination, print) · `js/history.js` (undo, revisions, numbering, safety) · `js/script.js` · `js/cards.js` · `js/breakdown.js` · `js/shots.js` · `js/boards.js` · `js/schedule.js` · `js/people.js` · `js/profiles.js` · `js/pdfimport.js` · `js/props.js` · `js/reports.js` · `js/stage.js` · `js/casting.js` · `js/tasks.js` · `js/dpr.js` · `js/sbrender.js` · `js/sbstudio.js` · `js/crypto.js` · `js/diff.js` · `js/collabcore.js` · `js/collabnet.js` · `js/collab.js` · `js/tags.js` · `js/region.js` · `js/live.js` · `js/fin.js` · `js/budget.js` · `js/budget2.js` · `js/series.js` · `js/lined.js` · `js/settings.js` · `js/contacts.js` · `js/photo.js` · `js/photo2.js` · `js/podcast.js` · `js/pitch.js` · `js/sync.js` · `js/app.js`
