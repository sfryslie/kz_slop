// Generates kz_slop.vmf — a KZ mountain-ascent map for Momentum Mod.
// Run: node generate_map.js   ->  writes kz_slop.vmf
// Compile with Momentum's vbsp/vvis/vrad, then run zonemaker on the VMF
// to produce kz_slop.zon (timer zones). See README.
//
// v2: real displacement-terrain mountain (rock/grass blend), 4 timed stages
// (bhop foothills -> cliff climb -> ridge -> peak longjumps), timer zones
// baked in via zone_timer_* entities.

const fs = require("fs");

// ---------- materials ----------
const M = {
  terrain: "NATURE/BLENDCLIFFGRASS001A",
  nodraw: "TOOLS/TOOLSNODRAW",
  sky: "TOOLS/TOOLSSKYBOX",
  trigger: "TOOLS/TOOLSTRIGGER",
  grassTop: "NATURE/GRASSFLOOR002A",
  dirtTop: "NATURE/DIRTFLOOR004A",
  rockTop: "NATURE/ROCKFLOOR002A",
  cliffA: "NATURE/CLIFFFACE001A",
  cliffB: "NATURE/CLIFFFACE002A",
  flag: "DEV_NYRO/DEV_RED_A-01",
};

let nextId = 2; // 1 is reserved for worldspawn
const id = () => nextId++;

// ---------- VMF primitives ----------
function axes(normal, scale) {
  if (normal === "z") return { u: `[1 0 0 0] ${scale}`, v: `[0 -1 0 0] ${scale}` };
  if (normal === "x") return { u: `[0 1 0 0] ${scale}`, v: `[0 0 -1 0] ${scale}` };
  return { u: `[1 0 0 0] ${scale}`, v: `[0 0 -1 0] ${scale}` };
}

function side(plane, material, normal, opts = {}) {
  const a = axes(normal, opts.scale || 0.25);
  const verts = opts.verts
    ? `\t\t\tvertices_plus\n\t\t\t{\n` + opts.verts.map((v) => `\t\t\t\t"v" "${v}"`).join("\n") + `\n\t\t\t}\n`
    : "";
  return `\t\tside
\t\t{
\t\t\t"id" "${id()}"
\t\t\t"plane" "${plane}"
${verts}\t\t\t"material" "${material}"
\t\t\t"uaxis" "${a.u}"
\t\t\t"vaxis" "${a.v}"
\t\t\t"rotation" "0"
\t\t\t"lightmapscale" "${opts.lightmap || 16}"
\t\t\t"smoothing_groups" "0"
${opts.disp ? opts.disp + "\n" : ""}\t\t}`;
}

// Every box is also recorded for the web viewer (docs/), which renders the
// same geometry with three.js. Terrain tiles are skipped (the viewer rebuilds
// terrain from the heightfield) and TOOLS/* boxes are filtered on export.
const boxRecords = [];

// Axis-aligned box solid. Plane points are clockwise viewed from outside.
function solid(x1, y1, z1, x2, y2, z2, mats, opts = {}) {
  if (typeof mats === "string") mats = { all: mats };
  const m = (f) => mats[f] || mats.all || M.cliffB;
  if (!opts.topOpts) boxRecords.push([x1, y1, z1, x2, y2, z2, m("top"), m("east")]);
  const vp = opts.withVerts
    ? {
        top: [`${x1} ${y2} ${z2}`, `${x2} ${y2} ${z2}`, `${x2} ${y1} ${z2}`, `${x1} ${y1} ${z2}`],
        bottom: [`${x1} ${y1} ${z1}`, `${x2} ${y1} ${z1}`, `${x2} ${y2} ${z1}`, `${x1} ${y2} ${z1}`],
        west: [`${x1} ${y2} ${z2}`, `${x1} ${y1} ${z2}`, `${x1} ${y1} ${z1}`, `${x1} ${y2} ${z1}`],
        east: [`${x2} ${y2} ${z1}`, `${x2} ${y1} ${z1}`, `${x2} ${y1} ${z2}`, `${x2} ${y2} ${z2}`],
        north: [`${x2} ${y2} ${z2}`, `${x1} ${y2} ${z2}`, `${x1} ${y2} ${z1}`, `${x2} ${y2} ${z1}`],
        south: [`${x2} ${y1} ${z1}`, `${x1} ${y1} ${z1}`, `${x1} ${y1} ${z2}`, `${x2} ${y1} ${z2}`],
      }
    : {};
  const o = (f) => (opts.withVerts ? { ...opts, verts: vp[f] } : opts);
  const sides = [
    side(`(${x1} ${y2} ${z2}) (${x2} ${y2} ${z2}) (${x2} ${y1} ${z2})`, m("top"), "z", opts.topOpts || o("top")),
    side(`(${x1} ${y1} ${z1}) (${x2} ${y1} ${z1}) (${x2} ${y2} ${z1})`, m("bottom"), "z", o("bottom")),
    side(`(${x1} ${y2} ${z2}) (${x1} ${y1} ${z2}) (${x1} ${y1} ${z1})`, m("west"), "x", o("west")),
    side(`(${x2} ${y2} ${z1}) (${x2} ${y1} ${z1}) (${x2} ${y1} ${z2})`, m("east"), "x", o("east")),
    side(`(${x2} ${y2} ${z2}) (${x1} ${y2} ${z2}) (${x1} ${y2} ${z1})`, m("north"), "y", o("north")),
    side(`(${x2} ${y1} ${z1}) (${x1} ${y1} ${z1}) (${x1} ${y1} ${z2})`, m("south"), "y", o("south")),
  ];
  return `\tsolid
\t{
\t\t"id" "${id()}"
${sides.join("\n")}
\t}`;
}

const worldSolids = [];
const entities = [];

function pointEntity(classname, origin, extra = {}) {
  const kv = Object.entries(extra).map(([k, v]) => `\t"${k}" "${v}"`).join("\n");
  entities.push(`entity
{
\t"id" "${id()}"
\t"classname" "${classname}"
\t"origin" "${origin}"
${kv ? kv + "\n" : ""}}`);
}

function brushEntity(classname, solids, extra = {}) {
  const kv = Object.entries(extra).map(([k, v]) => `\t"${k}" "${v}"`).join("\n");
  entities.push(`entity
{
\t"id" "${id()}"
\t"classname" "${classname}"
${kv ? kv + "\n" : ""}${solids.join("\n")}
}`);
}

// ---------- movement model (Momentum Mod climb mode) ----------
// Numbers from docs.momentum-mod.org: jump apex 57u (66 crouched), run speed
// 250 u/s, prestrafe tops out ~275 u/s, KZT bhop speed cap 380 u/s, g = 800.
// v2 tuned gaps by feel and ignored landing height — a +48 rise cuts airtime
// from 0.755s to 0.53s, which made stages 3/4 physically impossible. Every
// gap is now derived from this model.
const GRAV = 800;
const VJUMP = Math.sqrt(2 * GRAV * 57); // ~302 u/s vertical takeoff speed
// Airtime when landing dz units higher than takeoff (dz < 0 = drop).
const airTime = (dz) => (VJUMP + Math.sqrt(VJUMP * VJUMP - 2 * GRAV * dz)) / GRAV;
// Widest clearable gap at a given air speed: horizontal travel plus the 32u
// the player's bbox overhangs the takeoff and landing edges (16u each side).
const maxGap = (speed, dz) => speed * airTime(dz) + 32;
// A gap that uses `frac` of what's clearable at the assumed speed.
function gapFor(speed, dz, frac) {
  if (frac > 0.88) throw new Error(`frac ${frac} leaves no margin`);
  return Math.round(frac * maxGap(speed, dz));
}

// ---------- course layout ----------
// The course is generated first (pure data); the terrain function is then
// shaped around the resulting plaza positions.

const PLAZA_R = 320; // flat plateau half-size
const plazas = []; // {x, y, z}
const platforms = []; // {cx, cy, sx, sy, top, thick, topMat, sideMat}
const report = []; // per-jump difficulty report, printed at the end

function buildCourse() {
  // Start plaza
  plazas.push({ x: 0, y: 0, z: 0 });

  // Each section: walk `cursor` from the previous plaza's edge along `dir`.
  // items: {gap, size (across), len (along, defaults size), off, top, dz, speed}
  function section(name, from, dir, items, finalGap, plazaRise, mats) {
    let cx = from.x + dir[0] * PLAZA_R;
    let cy = from.y + dir[1] * PLAZA_R;
    let prevTop = from.z, prevOff = 0, prevSize = PLAZA_R * 2;
    for (const it of items) {
      cx += dir[0] * it.gap; cy += dir[1] * it.gap;
      const along = it.len || it.size;
      const pcx = cx + dir[0] * (along / 2) + (dir[1] !== 0 ? it.off : 0);
      const pcy = cy + dir[1] * (along / 2) + (dir[0] !== 0 ? it.off : 0);
      platforms.push({
        cx: pcx, cy: pcy,
        sx: dir[0] !== 0 ? along : it.size, sy: dir[0] !== 0 ? it.size : along,
        top: it.top, thick: mats.thick, topMat: mats.topMat, sideMat: mats.sideMat,
      });
      const dz = it.top - prevTop;
      // true jump length includes the lateral zigzag component
      const lat = Math.max(0, Math.abs(it.off - prevOff) - (it.size + prevSize) / 2);
      const eff = Math.round(Math.hypot(it.gap, lat));
      const need = (eff - 32) / airTime(dz); // avg air speed required
      report.push(`${name}  gap=${String(it.gap).padStart(3)}  eff=${String(eff).padStart(3)}` +
        `  dz=${String(dz).padStart(3)}  need ${need.toFixed(0)} u/s of ${it.speed} assumed` +
        ` (${(100 * need / it.speed).toFixed(0)}%)`);
      if (eff > 0.88 * maxGap(it.speed, dz))
        throw new Error(`${name}: effective gap ${eff} exceeds 88% of clearable at ${it.speed} u/s`);
      prevTop = it.top; prevOff = it.off; prevSize = it.size;
      cx += dir[0] * along; cy += dir[1] * along;
    }
    const plaza = {
      x: cx + dir[0] * (finalGap + PLAZA_R),
      y: cy + dir[1] * (finalGap + PLAZA_R),
      z: prevTop + plazaRise,
    };
    const need = (finalGap - 32) / airTime(plazaRise);
    report.push(`${name}  gap=${String(finalGap).padStart(3)}  dz=${String(plazaRise).padStart(3)}` +
      `  need ${need.toFixed(0)} u/s (final jump onto plaza)`);
    plazas.push(plaza);
    return plaza;
  }

  // Stage 1 — foothills bhop: 12 hops with dips for speed play. Speed builds
  // down the chain (auto-bhop), so gaps grow from ~50% to ~66% of clearable.
  let z = 0;
  const dz1 = [-24, 16, -16, 20, 24, -24, 20, 24, -16, 24, 28, 24];
  const size1 = [128, 128, 120, 120, 112, 112, 104, 104, 96, 96, 96, 96];
  const off1 = [0, 64, -64, 56, -56, 64, -32, -80, 56, -56, 72, 0];
  const s1 = dz1.map((dz, i) => {
    const speed = Math.min(345, 280 + 14 * i);
    z += dz;
    return { gap: gapFor(speed, dz, 0.5 + 0.015 * i), size: size1[i], off: off1[i], top: z, dz, speed };
  });
  const p2 = section("S1 bhop ", plazas[0], [1, 0], s1, 140, 20,
    { topMat: M.grassTop, sideMat: M.cliffB, thick: 48 });

  // Stage 2 — cliff climb: +48 ledges hopped from near-standstill (assume run
  // speed 250, little room to prestrafe). Ledge #4 is a +56 crouch-jump.
  z = p2.z;
  const off2 = [48, -48, 40, -40, 48, -48, 32, -32, 48, 0];
  const s2 = off2.map((off, i) => {
    const crouch = i === 3;
    const dz = crouch ? 56 : 48;
    z += dz;
    return {
      gap: crouch ? 56 : gapFor(250, dz, 0.55 + 0.016 * i),
      size: 96, off, top: z, dz, speed: 250,
    };
  });
  const p3 = section("S2 climb", p2, [1, 0], s2, 96, 32,
    { topMat: M.dirtTop, sideMat: M.cliffB, thick: 64 });

  // Stage 3 — ridge pillars, turning north: narrow tops, +32 rises. Assumes
  // modest bhop chaining (285 -> 320 u/s), gaps 62% -> 72% of clearable.
  z = p3.z;
  const size3 = [96, 96, 88, 88, 80, 80, 72, 72];
  const off3 = [0, 56, -56, 48, -48, 56, -48, 0];
  const s3 = size3.map((size, i) => {
    const speed = Math.min(320, 285 + 8 * i);
    z += 32;
    return { gap: gapFor(speed, 32, 0.62 + 0.014 * i), size, off: off3[i], top: z, dz: 32, speed };
  });
  const p4 = section("S3 ridge", p3, [0, 1], s3, 160, 32,
    { topMat: M.rockTop, sideMat: M.cliffA, thick: 400 });

  // Stage 4 — peak longjumps: the spicy finale. Long rectangular runways
  // (192u along travel) so each jump gets a fresh prestrafe; rises shrink to
  // zero as gaps grow to 85% of clearable. Final jump: 204u gap, flat.
  z = p4.z;
  const dz4 = [16, 12, 8, 8];
  const frac4 = [0.74, 0.77, 0.8, 0.83];
  const s4 = dz4.map((dz, i) => {
    z += dz;
    return { gap: gapFor(275, dz, frac4[i]), size: 160, len: 192, off: [0, 64, -64, 48][i], top: z, dz, speed: 275 };
  });
  section("S4 peak ", p4, [1, 0], s4, gapFor(275, 0, 0.85), 0,
    { topMat: M.rockTop, sideMat: M.cliffB, thick: 64 });
}
buildCourse();

// ---------- terrain ----------
const TILE = 512, POWER = 3, NV = 9; // 9x9 verts per tile
const BASE_Z = -448; // displacement base plane

// Bounds follow the course, padded so the mountain falls away on all sides.
const PADDING = 1792;
let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
for (const p of plazas) {
  bx0 = Math.min(bx0, p.x - PLAZA_R); bx1 = Math.max(bx1, p.x + PLAZA_R);
  by0 = Math.min(by0, p.y - PLAZA_R); by1 = Math.max(by1, p.y + PLAZA_R);
}
const snap = (v, up) => (up ? Math.ceil(v / TILE) : Math.floor(v / TILE)) * TILE;
const TX0 = snap(bx0 - PADDING, false), TX1 = snap(bx1 + PADDING, true);
const TY0 = snap(by0 - PADDING, false), TY1 = snap(by1 + PADDING, true);

const segs = [];
for (let i = 0; i < plazas.length - 1; i++) segs.push([plazas[i], plazas[i + 1]]);

function pathInfo(x, y) {
  let bestD2 = Infinity, bestZ = 0;
  for (const [a, b] of segs) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t, py = a.y + dy * t;
    const d2 = (x - px) * (x - px) + (y - py) * (y - py);
    if (d2 < bestD2) { bestD2 = d2; bestZ = a.z + (b.z - a.z) * t; }
  }
  return { d: Math.sqrt(bestD2), z: bestZ };
}

const smooth = (a, b, t) => {
  const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

function noise(x, y) {
  return 70 * Math.sin(0.0063 * x + 0.8) * Math.cos(0.0051 * y - 1.9)
       + 46 * Math.sin(0.0117 * x + 1.3) * Math.cos(0.0089 * y - 0.7)
       + 24 * Math.sin(0.023 * x - 0.4) * Math.sin(0.019 * y + 1.1)
       + 12 * Math.sin(0.041 * x) * Math.cos(0.037 * y);
}

// Backdrop peaks: scenery-only crags framing the course. [x, y, summitZ, r] —
// each is placed so its radius never reaches the course line or leaves the
// terrain bounds.
const PEAKS = [
  [2000, -1500, 850, 1000],
  [10000, 1200, 1350, 1250],
  [-1600, 1400, 700, 950],
  [5300, 4100, 1000, 1000],
];

function H(x, y) {
  const p = pathInfo(x, y);
  // open mountainside: sags below the course line, falls away laterally
  // into proper valleys (steeper and deeper than v2)
  const lat = Math.pow(Math.max(0, p.d - 224) / 1500, 1.7) * 1500;
  let h = p.z - 300 - lat + noise(x, y);
  for (const [px, py, pz, pr] of PEAKS) {
    const d = Math.hypot(x - px, y - py);
    if (d < pr) h = Math.max(h, BASE_Z + 64 + (pz - BASE_Z - 64) * Math.pow(1 - d / pr, 1.5) + 0.4 * noise(x, y));
  }
  // plaza plateaus: flat, exactly at plaza height
  let w = 0, pz = 0;
  for (const pl of plazas) {
    const d = Math.max(Math.abs(x - pl.x), Math.abs(y - pl.y));
    const wi = 1 - smooth(PLAZA_R, PLAZA_R + 256, d);
    if (wi > w) { w = wi; pz = pl.z; }
  }
  h = h * (1 - w) + pz * w;
  // rolling valley floor instead of a dead-flat clamp (offset noise so the
  // floor undulation doesn't correlate with the mountainside)
  const floor = BASE_Z + 64 + 0.4 * noise(x + 3000, y - 1700);
  return Math.min(2000, Math.max(h, floor));
}

// grass (255) on flat ground, rock (0) on steep slopes
function alphaAt(x, y) {
  const e = 24;
  const gx = (H(x + e, y) - H(x - e, y)) / (2 * e);
  const gy = (H(x, y + e) - H(x, y - e)) / (2 * e);
  const g = Math.sqrt(gx * gx + gy * gy);
  const t = 1 - smooth(0.45, 0.95, g);
  return Math.round(255 * t);
}

const f2 = (v) => (Math.round(v * 100) / 100).toString();

function dispTile(x1, y1) {
  const step = TILE / (NV - 1);
  const rows = { normals: [], distances: [], offsets: [], offset_normals: [], alphas: [], triangle_tags: [] };
  // Engine mapping (builddisp.cpp): rows advance +y from startposition, columns advance +x.
  for (let r = 0; r < NV; r++) {
    const y = y1 + r * step;
    const norm = [], dist = [], offs = [], alph = [];
    for (let c = 0; c < NV; c++) {
      const x = x1 + c * step;
      norm.push("0 0 1");
      dist.push(f2(H(x, y) - BASE_Z));
      offs.push("0 0 0");
      alph.push(alphaAt(x, y));
    }
    rows.normals.push(norm.join(" "));
    rows.distances.push(dist.join(" "));
    rows.offsets.push(offs.join(" "));
    rows.offset_normals.push(norm.join(" "));
    rows.alphas.push(alph.join(" "));
  }
  for (let r = 0; r < NV - 1; r++) rows.triangle_tags.push(Array(2 * (NV - 1)).fill("0").join(" "));

  const rowBlock = (name, data) =>
    `\t\t\t${name}\n\t\t\t{\n` + data.map((d, i) => `\t\t\t\t"row${i}" "${d}"`).join("\n") + `\n\t\t\t}`;

  const disp = `\t\t\tdispinfo
\t\t\t{
\t\t\t\t"power" "${POWER}"
\t\t\t\t"startposition" "[${x1} ${y1} ${BASE_Z}]"
\t\t\t\t"flags" "0"
\t\t\t\t"elevation" "0"
\t\t\t\t"subdiv" "0"
${rowBlock("normals", rows.normals)}
${rowBlock("distances", rows.distances)}
${rowBlock("offsets", rows.offsets)}
${rowBlock("offset_normals", rows.offset_normals)}
${rowBlock("alphas", rows.alphas)}
${rowBlock("triangle_tags", rows.triangle_tags)}
\t\t\t\tallowed_verts
\t\t\t\t{
\t\t\t\t\t"10" "-1 -1 -1 -1 -1 -1 -1 -1 -1 -1"
\t\t\t\t}
\t\t\t}`;

  return solid(x1, y1, BASE_Z - 64, x1 + TILE, y1 + TILE, BASE_Z, { top: M.terrain, all: M.nodraw },
    { topOpts: { scale: 0.5, lightmap: 32, disp }, lightmap: 32 });
}

for (let ty = TY0; ty < TY1; ty += TILE)
  for (let tx = TX0; tx < TX1; tx += TILE)
    worldSolids.push(dispTile(tx, ty));

// ---------- the room ----------
// Displacements don't seal the map, so a nodraw slab under the terrain does.
const IZ1 = BASE_Z - 64, IZ2 = 2304, T = 64;
worldSolids.push(solid(TX0 - T, TY0 - T, IZ1 - T, TX1 + T, TY1 + T, IZ1, M.nodraw)); // sealing floor
worldSolids.push(solid(TX0 - T, TY0 - T, IZ2, TX1 + T, TY1 + T, IZ2 + T, M.sky)); // ceiling
worldSolids.push(solid(TX0 - T, TY0 - T, IZ1, TX0, TY1 + T, IZ2, M.sky)); // west
worldSolids.push(solid(TX1, TY0 - T, IZ1, TX1 + T, TY1 + T, IZ2, M.sky)); // east
worldSolids.push(solid(TX0, TY0 - T, IZ1, TX1, TY0, IZ2, M.sky)); // south
worldSolids.push(solid(TX0, TY1, IZ1, TX1, TY1 + T, IZ2, M.sky)); // north

// ---------- course platforms ----------
// Each platform extends down into the terrain below it (min height sampled
// across the footprint) so nothing floats — pads become columns and spurs.
function groundedBottom(cx, cy, hx, hy, top, minThick) {
  let lo = Infinity;
  for (const [dx, dy] of [[0, 0], [-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy]])
    lo = Math.min(lo, H(cx + dx, cy + dy));
  return Math.min(top - minThick, Math.round(lo) - 64);
}
for (const p of platforms) {
  const hx = p.sx / 2, hy = p.sy / 2;
  const bot = groundedBottom(p.cx, p.cy, hx, hy, p.top, p.thick);
  worldSolids.push(solid(p.cx - hx, p.cy - hy, bot, p.cx + hx, p.cy + hy, p.top,
    { top: p.topMat, all: p.sideMat }));
}

// ---------- summit decorations ----------
const S = plazas[4];
// cairn
worldSolids.push(solid(S.x + 96, S.y - 64, S.z, S.x + 224, S.y + 64, S.z + 96, M.cliffA));
worldSolids.push(solid(S.x + 112, S.y - 48, S.z + 96, S.x + 208, S.y + 48, S.z + 160, M.cliffA));
worldSolids.push(solid(S.x + 128, S.y - 32, S.z + 160, S.x + 192, S.y + 32, S.z + 208, M.cliffA));
// flag pole + flag
worldSolids.push(solid(S.x + 156, S.y - 4, S.z + 208, S.x + 164, S.y + 4, S.z + 464, M.rockTop));
worldSolids.push(solid(S.x + 164, S.y - 2, S.z + 400, S.x + 260, S.y + 2, S.z + 456, M.flag));

// ---------- stage markers + scatter decor ----------
// small cairn + marker flag tucked in a corner of each stage plaza
for (let i = 1; i <= 3; i++) {
  const pl = plazas[i];
  const bx = pl.x + 208, by = pl.y + 208, bz = pl.z;
  worldSolids.push(solid(bx - 48, by - 48, bz, bx + 48, by + 48, bz + 56, M.cliffA));
  worldSolids.push(solid(bx - 28, by - 28, bz + 56, bx + 28, by + 28, bz + 96, M.cliffA));
  worldSolids.push(solid(bx - 4, by - 4, bz + 96, bx + 4, by + 4, bz + 288, M.rockTop));
  worldSolids.push(solid(bx + 4, by - 2, bz + 232, bx + 68, by + 2, bz + 280, M.flag));
}

// scattered boulders and rock spires, seeded so builds are reproducible.
// Boulders stay 320u+ off the course line; tall spires 800u+ so nothing
// pokes into a jump.
let seed = 1337;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const rrange = (a, b) => Math.round(a + (b - a) * rand());
let placed = 0;
for (let tries = 0; tries < 500 && placed < 46; tries++) {
  const x = rrange(TX0 + 512, TX1 - 512), y = rrange(TY0 + 512, TY1 - 512);
  const { d } = pathInfo(x, y);
  const spire = placed % 6 === 5;
  if (d < (spire ? 800 : 320) || d > 1900) continue;
  const hz = Math.round(H(x, y));
  if (hz < BASE_Z + 96) continue;
  if (spire) {
    const b = rrange(80, 160), h1 = rrange(220, 420);
    worldSolids.push(solid(x - b, y - b, hz - 128, x + b, y + b, hz + h1, M.cliffA));
    const b2 = Math.round(b * 0.6);
    worldSolids.push(solid(x - b2, y - b2, hz + h1, x + b2, y + b2, hz + h1 + rrange(100, 220), M.cliffB));
  } else {
    const s = rrange(40, 110);
    worldSolids.push(solid(x - s, y - s, hz - s, x + s, y + s, hz + rrange(s * 0.7, s * 1.3),
      rand() < 0.5 ? M.cliffA : M.cliffB));
  }
  placed++;
}

// ---------- entities ----------
const P = plazas;
pointEntity("info_player_start", `${P[0].x} ${P[0].y} ${P[0].z + 8}`, { angles: "0 0 0" });

// stage restart destinations (facing the direction of travel)
const rdAngles = ["0 0 0", "0 0 0", "0 90 0", "0 0 0"];
for (let i = 0; i < 4; i++) {
  pointEntity("info_teleport_destination", `${P[i].x} ${P[i].y} ${P[i].z + 16}`, {
    targetname: `rd_s${i + 1}`, angles: rdAngles[i],
  });
}

function zoneSolid(pl, height) {
  return solid(pl.x - 288, pl.y - 288, pl.z, pl.x + 288, pl.y + 288, pl.z + height, M.trigger,
    { withVerts: true });
}

brushEntity("zone_timer_start", [zoneSolid(P[0], 160)], {
  track_number: "0", stage_end_zones: "1", checkpoints_required: "1",
  checkpoints_ordered: "1", safe_height: "0", max_velocity: "-1",
  bhop_enabled: "0", restart_destination: "rd_s1",
});
for (let i = 1; i <= 3; i++) {
  brushEntity("zone_timer_stage", [zoneSolid(P[i], 160)], {
    stage_number: `${i + 1}`, checkpoints_required: "1", checkpoints_ordered: "1",
    limit_ground_speed: "1", safe_height: "0", restart_destination: `rd_s${i + 1}`,
  });
}
brushEntity("zone_timer_end", [zoneSolid(P[4], 200)], { track_number: "0" });

// sun + ambient + fog
pointEntity("light_environment", `${P[0].x} ${P[0].y} 2000`, {
  angles: "0 235 0", pitch: "-42",
  _light: "255 244 224 450", _ambient: "168 182 205 110",
  _lightHDR: "-1 -1 -1 1", _lightscaleHDR: "1",
  _ambientHDR: "-1 -1 -1 1", _AmbientScaleHDR: "1",
  SunSpreadAngle: "2",
});
pointEntity("env_fog_controller", `${P[0].x} ${P[0].y} 400`, {
  fogenable: "1", fogblend: "0", fogcolor: "190 205 225", fogcolor2: "190 205 225",
  fogdir: "1 0 0", fogstart: "2048", fogend: "9500", fogmaxdensity: "0.6",
  farz: "-1", spawnflags: "1",
});

// ---------- assemble ----------
const vmf = `versioninfo
{
\t"editorversion" "400"
\t"editorbuild" "8000"
\t"mapversion" "2"
\t"formatversion" "100"
\t"prefab" "0"
}
visgroups
{
}
viewsettings
{
\t"bSnapToGrid" "1"
\t"bShowGrid" "1"
\t"nGridSpacing" "64"
}
world
{
\t"id" "1"
\t"mapversion" "2"
\t"classname" "worldspawn"
\t"skyname" "sky_cape_hill"
\t"maxpropscreenwidth" "-1"
\t"detailvbsp" "detail.vbsp"
\t"detailmaterial" "detail/detailsprites"
${worldSolids.join("\n")}
}
${entities.join("\n")}
cameras
{
\t"activecamera" "-1"
}
cordon
{
\t"mins" "(-99999 -99999 -99999)"
\t"maxs" "(99999 99999 99999)"
\t"active" "0"
}
`;

fs.writeFileSync(__dirname + "/kz_slop.vmf", vmf);
console.log(`Wrote kz_slop.vmf: ${worldSolids.length} world solids, ${entities.length} entities, ${platforms.length} platforms`);
console.log("Plazas:", plazas.map((p, i) => `S${i + 1 <= 4 ? i + 1 : "ummit"}(${p.x}, ${p.y}, z=${p.z})`).join("  "));
console.log(`Terrain: x ${TX0}..${TX1}, y ${TY0}..${TY1} (${((TX1 - TX0) / TILE) * ((TY1 - TY0) / TILE)} tiles)`);
console.log("\nJump difficulty report (need = avg air speed required):");
for (const r of report) console.log("  " + r);

// ---------- web viewer data (docs/mapdata.js) ----------
// Heightfield + course boxes for the three.js viewer on GitHub Pages.
const VSTEP = 64;
const vnx = Math.round((TX1 - TX0) / VSTEP) + 1;
const vny = Math.round((TY1 - TY0) / VSTEP) + 1;
const heights = new Array(vnx * vny);
for (let iy = 0; iy < vny; iy++)
  for (let ix = 0; ix < vnx; ix++)
    heights[iy * vnx + ix] = Math.round(H(TX0 + ix * VSTEP, TY0 + iy * VSTEP));

const kind = (mat) => ({
  [M.grassTop]: "grass", [M.dirtTop]: "dirt", [M.rockTop]: "rock",
  [M.cliffA]: "cliffa", [M.cliffB]: "cliffb", [M.flag]: "flag",
}[mat]);
const viewerBoxes = boxRecords
  .filter(([, , , , , , t, s]) => kind(t) || kind(s))
  .map(([x1, y1, z1, x2, y2, z2, t, s]) => [x1, y1, z1, x2, y2, z2, kind(t) || kind(s), kind(s) || kind(t)]);

const mapdata = {
  step: VSTEP, x0: TX0, y0: TY0, nx: vnx, ny: vny, heights,
  boxes: viewerBoxes,
  plazas: plazas.map((p, i) => ({ ...p, name: i === 0 ? "Start" : i === plazas.length - 1 ? "Summit" : `Stage ${i + 1}` })),
  zoneR: 288, zoneH: 160,
};
if (!fs.existsSync(__dirname + "/docs")) fs.mkdirSync(__dirname + "/docs");
fs.writeFileSync(__dirname + "/docs/mapdata.js", "window.MAPDATA = " + JSON.stringify(mapdata) + ";\n");
console.log(`\nWrote docs/mapdata.js: ${viewerBoxes.length} boxes, ${vnx}x${vny} heightfield`);
