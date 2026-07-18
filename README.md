# kz_slop

An AI-generated KZ mountain-ascent map for [Momentum Mod](https://store.steampowered.com/app/669270/Momentum_Mod/), with a working timer. Pure slop, as requested — now with geology **and physics**.

🌐 **[Explore the map in your browser](https://sfryslie.github.io/kz_slop/)** — a three.js viewer generated from the same script that builds the map. It even has a playable bhop mode (WASD + hold Space, F to toggle fly/play).

## The course

You climb a mountain, in four timed stages, from grassy foothills to a rocky peak with a cairn and a red flag:

| Stage | Section | What you do |
|---|---|---|
| 1 | **Foothills** (z 0→120) | 12-platform bhop with dips for speed play, gaps 122→192 |
| 2 | **Cliffs** (z 120→592) | 10 ledges rising +48 up a rock face, plus one +56 crouch-jump |
| 3 | **Ridge** (z 592→880) | 8 narrow pillars heading north, +32 rises, gaps 131→167 |
| 4 | **Peak** (z 880→924) | Longjump finale on 192-unit runways: gaps 166→204 |

Each stage has its own start zone with a restart point — fall onto the mountainside and use Momentum's *Restart Stage* bind to retry the current section. The terrain is real displacement geometry with rock/grass blending by slope, rolling valleys, boulder fields, and backdrop crags framing the course.

## The physics model (v3)

v2's finale was physically impossible: it asked for 192–216u gaps while landing +48 higher, but landing +48 cuts airtime from 0.755s to 0.53s. v3 derives **every gap** from Momentum's climb-mode movement numbers (57u jump apex, 250 run / ~275 prestrafe, 380 KZT bhop cap, g=800):

```
airtime(dz) = (v + sqrt(v² − 2·g·dz)) / g        v = √(2·g·57) ≈ 302 u/s
max gap     = speed · airtime + 32 (bbox overhang)
gap         = difficulty · max gap               difficulty ≤ 0.85
```

`node generate_map.js` prints a per-jump difficulty report (required air speed vs. assumed). The final summit jump is a flat 204u gap — a ~236 longjump, spicy but human.

## How to play it (for Zee)

1. Drop `kz_slop.bsp` into `Steam\steamapps\common\Momentum Mod Playtest\momentum\maps\`
2. Drop `kz_slop.json` into `...\momentum\maps\zones\local\` (create the folder if needed) — this is the timer zone file
3. Launch Momentum Mod, open console (`` ` ``), run `map kz_slop`
4. The `kz_` prefix auto-selects KZ/Climb (KZT) movement; the timer starts when you leave the start zone

## How it's made

- [generate_map.js](generate_map.js) — Node script that generates the entire map source (`kz_slop.vmf`) in code: ~400 displacement terrain tiles shaped around the course path, 34 platforms grounded into the terrain, decoration, and timer zone entities. No Hammer editor involved. Run `node generate_map.js` to regenerate.
- The same run also writes [docs/mapdata.js](docs/mapdata.js) — heightfield + box geometry for the [web viewer](docs/index.html), so the browser version can never drift from the compiled map.
- Compiled and zoned with the tools that ship with Momentum Mod itself:

```
set MOM=C:\Program Files (x86)\Steam\steamapps\common\Momentum Mod Playtest
"%MOM%\bin\win64\vbsp.exe" -game "%MOM%\momentum" kz_slop.vmf
"%MOM%\bin\win64\vvis.exe" -game "%MOM%\momentum" kz_slop
"%MOM%\bin\win64\vrad.exe" -game "%MOM%\momentum" kz_slop
"%MOM%\bin\win64\zonemaker.exe" kz_slop.vmf     (writes kz_slop.json, the zone file)
```

All textures (HL2 `nature/` set, `sky_cape_hill` skybox) come from content Momentum bundles for every player, so the map needs no extra assets.

### Notes for map generators

Things that are easy to get wrong when writing VMFs in code:

- Brush plane points must be **clockwise viewed from outside** the solid, or vbsp strips every face and crashes.
- `zonemaker.exe` reads face vertices from the `vertices_plus` block (a Strata Hammer extension), not from plane intersections — zone brushes without it fail with "Could not find bottom of zone brush".
- Displacement `dispinfo` rows advance along **+Y** from `startposition` (the min corner); columns within a row advance along **+X** (verified against `builddisp.cpp` in the Momentum engine source).
- Tune jumps against a movement model, not by eyeball — landing height changes airtime quadratically, and 48 units of rise deletes ~30% of your jump distance.
