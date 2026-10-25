# 🎡 WonderPark Tycoon

A 3D theme park management game in the spirit of RollerCoaster Tycoon / OpenRCT2,
built with [three.js](https://threejs.org/). Lay out paths, build and upgrade
rides, feed and water your visitors, keep the place clean and repaired, and
watch the credits roll in.

Every asset is **generated procedurally at runtime** — textures, geometry,
sound. There are no model or image files to download, nothing to license, and
nothing that can fail to load.

```bash
npm install
npm run dev      # http://localhost:5173
```

---

## Playing

| | |
|---|---|
| **Build** | Pick a category in the bottom dock, click in the world to place. `R` rotates. |
| **Paths** | Choose a surface and **drag** to paint. Everything must touch a path or guests can't reach it. |
| **Overbuilding** | You can place straight onto paving — the walkway underneath is removed for you. |
| **Camera** | `WASD` pan · right-drag orbit · wheel zoom · `Q`/`E` rotate · `R`/`F` tilt |
| **Inspect** | Click any ride, guest or staff member. |
| **Move / rotate** | Select a ride, then **📦 Move / rotate** — 20% of its build cost. |
| **Demolish** | `X`, then click. |
| **Speed** | `Space` pauses; the ⏸ ▶ ⏩ ⏭ buttons set game speed. |
| **Panels** | `O` objectives · `G` finances · `T` staff · `P` park · `H` help |
| **Save** | 💾 in the toolbar, or `Ctrl`+`S` to quick-save. Autosaves every 2 min. |
| **Console** | `/` opens the command console (see below). |

The loop: guests arrive at the gate, pay admission, then walk the path network
looking for rides they can afford and tolerate. They get hungry, thirsty and
need the toilet; if they can't find what they need they get unhappy and leave.
Happy guests ride more, spend more, and raise the park rating — which unlocks
better attractions and draws bigger crowds.

### Things that will bite you

- **Rides wear out.** One mechanic covers roughly four or five rides. Without
  them, breakdowns stay broken and queues walk away.
- **Litter tanks your rating** faster than anything else. Janitors and bins.
- **Facilities scale with headcount.** Toilets, food and drink per guest are
  part of the rating formula.
- **Scenery near paths** raises happiness, which raises the rating, which
  brings more guests. Gardens are not decoration, they're economics.

### Building over paving

Paths count as clearable ground. Drop a ride onto a paved plaza and the
walkway tiles inside its footprint are simply removed — the hint bar tells you
how many will go before you commit, and the park log records it.

Anything that isn't a path still blocks: rides, shops, scenery, the map edge.
The cursor turns red and the refusal names what is in the way ("Oak Tree is
already here") rather than a generic error. A footprint that straddles paving
and a building is refused as a whole.

Paved-over tiles are gone for good — demolishing the ride later leaves bare
ground, not the path you built over. Watch out for paving over the only route
to something: the ride will report "No path" until you reconnect it.

### Moving things

Every placed object can be picked up again from its inspector panel for **20%
of its build cost**. While you carry it, `R` turns it and `Esc` puts it back;
the footprint preview goes red wherever it will not fit. Everything the
attraction has earned — its upgrade tier, condition, lifetime income and
ticket price — moves with it.

A quarter turn genuinely swaps the ground an object covers, so a rotated 8×6
ferris wheel reserves 6×8 tiles. Setting it back down exactly where it was
costs nothing.

---

## Saving

Progress is kept in your browser's local storage across four slots: a rolling
**autosave** (rewritten every two minutes and whenever you close the tab) plus
three manual slots. `Ctrl`+`S` quick-saves to slot 1; the 💾 button opens the
full screen with per-slot day, balance, rating and timestamp.

You can also **export a save to a JSON file** and import it back — useful for
backups or moving a park between browsers. Saves carry a format version and a
mismatched file is refused rather than partially applied.

Guests are intentionally not saved: they arrive and leave constantly and a
reloaded park refills within seconds. Everything else round-trips — paths and
their surfaces, every building with its upgrade tier, condition, price and
lifetime takings, staff, litter, the ledger, the clock, weather, objectives
and awards.

---

## Command console

Press `/` (or the ⌨️ button). A leading slash is optional.

| Command | Effect |
|---|---|
| `money 50000` | Add credits (negative removes them) |
| `rating 800` | Set the park rating |
| `unlock` / `unlock off` | Ignore rating gates on the catalogue |
| `repair` | Instantly fix everything |
| `autorepair on\|off` | Toggle the auto-repair service contract |
| `clean` | Remove all litter |
| `guests 50` | Spawn guests at the gate |
| `weather sunny\|rain\|storm\|snow\|clear\|cloudy` | Force the weather |
| `time 21.5` | Set the hour of day |
| `speed 0..4` | Game speed |
| `fee 12` | Entry fee |
| `staff mechanic 3` | Hire staff for free |
| `open` / `close` | Open or close every attraction |
| `firework 5` | Launch fireworks at the camera |
| `god` | 1,000,000 credits, rating 1000, everything unlocked, auto-repair on |

`↑`/`↓` scroll command history. `Esc` closes.

### Auto-repair

Off by default. When on (🛠️ in the toolbar, or Park Settings), any ride broken
for more than 4 seconds is fixed automatically and charged at a **35% premium**
over a manual repair. The delay gives a mechanic the chance to get there first,
so hiring staff stays the cheaper option — auto-repair is insurance against
downtime, not a replacement for a maintenance team.

---

## What's in it

**23 rides** — carousel, teacups, balloon race, park express train, sky wheel,
observation tower, big top circus, funhouse, helter skelter, pirate galleon,
wave swinger, enterprise, bumper cars, terror drop, roller coaster, haunted
mansion, log flume, go-karts, plus the eccentric ones: **Ozzy the Octopus**
(six heaving tentacles with spinning cars), the **Giant Frisbee** (a spinning
disc on a pendulum that swings past vertical), **UFO Abduction** (hovering
saucer, tractor beam, and a very surprised cow), the **Magic Carpet** (swings,
then barrel-rolls) and the **Reverse Bungee** (two riders fired 24 m up on
elastic).

Every ride is individually animated with its own mechanism — the coaster
converts height into speed, the flume drifts then plunges and splashes, karts
brake for corners and accelerate out of them, ferris wheel gondolas stay level,
the drop tower climbs, hangs, and falls.

**14 shops and facilities** · **20 scenery and garden pieces** · 4 path surfaces
· 4 staff types · day/night cycle · 6 weather states · upgrades (4 tiers) ·
objectives, awards and marketing campaigns · ride-along camera on every
attraction.

---

## Development

```
src/
  core/      Engine (renderer + post-processing), CameraRig, Game loop, Audio
  gfx/       Procedural Textures, Materials, Sky + day/night, particle Effects
  world/     Grid, Terrain, Paths
  build/     Ride / shop / decoration model builders
  sim/       Park, Attraction, Guests, Staff, Pathfinder, Economy
  ui/        HUD, dock, inspector, modals, console
  data/      catalog.js — every buildable item and its stats
```

### Testing

The tests drive a real browser (Playwright + Chromium with SwiftShader), so
they catch runtime errors that a build never would. Start `npm run dev` first.

```bash
npm run test:smoke   # boots the game, places all 56 catalogue items, runs
                     # every ride animation, exercises the UI, tools, console,
                     # auto-repair and teardown. Fails on any console error.
npm run test:sim     # steps ~2 in-game days of simulation headlessly and
                     # reports guest behaviour, ride boardings and the ledger.
npm run shots        # writes annotated screenshots to scripts/shots/
```

`npm run test:sim` is the one to watch when changing balance — it reports how
many guests actually rode something, what the shops sold, and where the money
went.

### Performance notes

- Anything static is merged at build time (`mergeMeshes` / `mergeColored` in
  `gfx/Materials.js`). Ride passengers and carousel horses collapse to one mesh
  each; a flower bed goes from ~130 draw calls to 7.
- Crowds and staff render as instanced meshes — three draw calls for the whole
  crowd.
- Bulb brightness is driven centrally by `setBulbNight()` from the sky, so
  nothing glows at noon.
- Quality auto-scales from measured frame time; override it in Park Settings.
