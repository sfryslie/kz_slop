# kz_slop

An AI-generated KZ bhop/platforming test map for [Momentum Mod](https://store.steampowered.com/app/669270/Momentum_Mod/). Pure slop, as requested.

## What's in the map

A linear course inside a big skybox room:

1. **Start pad** — spawn here
2. **Bhop section** — 10 platforms with gaps growing from 96 to 176 units, zigzagging left/right
3. **Rest pad**
4. **Climb section** — 8 ledges rising 48 units each (jump/crouch-jump up)
5. **High rest pad** (384 units up)
6. **Longjump section** — 192-unit and 216-unit gaps
7. **End pad** — red, with a red monolith so you know you made it

Falling off anywhere teleports you back to the start (the black floor is a giant `trigger_teleport`).

## How it's made

- [generate_map.js](generate_map.js) — Node script that writes `kz_slop.vmf` (the Source engine map source format) entirely in code. No Hammer editor involved. Run `node generate_map.js` to regenerate.
- The VMF is compiled to a playable `.bsp` using the compiler tools that ship with Momentum Mod itself:

```
set MOM=C:\Program Files (x86)\Steam\steamapps\common\Momentum Mod Playtest
"%MOM%\bin\win64\vbsp.exe" -game "%MOM%\momentum" kz_slop.vmf
"%MOM%\bin\win64\vvis.exe" -game "%MOM%\momentum" kz_slop
"%MOM%\bin\win64\vrad.exe" -game "%MOM%\momentum" kz_slop
```

All textures/skybox used are ones Momentum Mod ships with (its bundled HL2 VPKs + `dev_nyro` set), so the single `kz_slop.bsp` file is fully self-contained — no extra assets needed.

## How to play it (for Zee)

1. Drop `kz_slop.bsp` into `Steam\steamapps\common\Momentum Mod Playtest\momentum\maps\`
2. Launch Momentum Mod, open the console (`` ` ``), and run `map kz_slop`
3. The `kz_` prefix makes Momentum use KZ/Climb movement automatically
4. No timer zones are baked in — use Momentum's in-game zone editor to place a start zone on the first pad and an end zone on the red pad if you want times to count. Or just jump around.
