# kz_slop

An AI-generated KZ mountain-ascent map for [Momentum Mod](https://store.steampowered.com/app/669270/Momentum_Mod/), with a working timer. Pure slop, as requested — now with geology.

## The course

You climb a mountain, in four timed stages, from grassy foothills to a rocky peak with a cairn and a red flag:

| Stage | Section | What you do |
|---|---|---|
| 1 | **Foothills** (z 0→280) | 12-platform bhop, gaps growing 96→160 units, zigzagging |
| 2 | **Cliffs** (z 280→700) | 8 ledges rising 48 units each up a rock face |
| 3 | **Ridge** (z 700→1020) | 7 narrow rock pillars heading north, gaps 160→200 |
| 4 | **Peak** (z 1020→1380) | Longjump finale: gaps 192→216, then a 220 to the summit |

Each stage has its own start zone with a restart point — fall onto the mountainside and use Momentum's *Restart Stage* bind to retry the current section. The terrain is real displacement geometry with rock/grass blending by slope; each stage plaza is a flat plateau guarded by cliffs.

## How to play it (for Zee)

1. Drop `kz_slop.bsp` into `Steam\steamapps\common\Momentum Mod Playtest\momentum\maps\`
2. Drop `kz_slop.json` into `...\momentum\maps\zones\local\` (create the folder if needed) — this is the timer zone file
3. Launch Momentum Mod, open console (`` ` ``), run `map kz_slop`
4. The `kz_` prefix auto-selects KZ/Climb (KZT) movement; the timer starts when you leave the start zone

## How it's made

- [generate_map.js](generate_map.js) — Node script that generates the entire map source (`kz_slop.vmf`) in code: 240 displacement terrain tiles shaped around the course path, 32 platforms, timer zone entities. No Hammer editor involved. Run `node generate_map.js` to regenerate.
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

Two things that are easy to get wrong when writing VMFs in code:

- Brush plane points must be **clockwise viewed from outside** the solid, or vbsp strips every face and crashes.
- `zonemaker.exe` reads face vertices from the `vertices_plus` block (a Strata Hammer extension), not from plane intersections — zone brushes without it fail with "Could not find bottom of zone brush".
- Displacement `dispinfo` rows advance along **+Y** from `startposition` (the min corner); columns within a row advance along **+X** (verified against `builddisp.cpp` in the Momentum engine source).
