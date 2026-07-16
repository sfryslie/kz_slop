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

// Axis-aligned box solid. Plane points are clockwise viewed from outside.
function solid(x1, y1, z1, x2, y2, z2, mats, opts = {}) {
  if (typeof mats === "string") mats = { all: mats };
  const m = (f) => mats[f] || mats.all || M.cliffB;
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

// ---------- course layout ----------
// The course is generated first (pure data); the terrain function is then
// shaped around the resulting plaza positions.

const PLAZA_R = 320; // flat plateau half-size
const plazas = []; // {x, y, z}
const platforms = []; // {cx, cy, size, top, thick, topMat, sideMat}

function buildCourse() {
  // Start plaza
  plazas.push({ x: 0, y: 0, z: 0 });

  // Each section: walk `cursor` from the previous plaza's edge along `dir`.
  // items: [gap, size, perpOffset, riseTo]
  function section(from, dir, items, finalGap, plazaZ, mats) {
    let cx = from.x + dir[0] * PLAZA_R;
    let cy = from.y + dir[1] * PLAZA_R;
    for (const [gap, size, off, top] of items) {
      cx += dir[0] * gap; cy += dir[1] * gap;
      const pcx = cx + dir[0] * (size / 2) + (dir[1] !== 0 ? off : 0);
      const pcy = cy + dir[1] * (size / 2) + (dir[0] !== 0 ? off : 0);
      platforms.push({ cx: pcx, cy: pcy, size, top, thick: mats.thick, topMat: mats.top, sideMat: mats.side });
      cx += dir[0] * size; cy += dir[1] * size;
    }
    const px = cx + dir[0] * (finalGap + PLAZA_R);
    const py = cy + dir[1] * (finalGap + PLAZA_R);
    const plaza = { x: px, y: py, z: plazaZ };
    plazas.push(plaza);
    return plaza;
  }

  // Stage 1: Foothills bhop (z 0 -> 280). Gaps 96->160, gentle rises.
  const s1 = [];
  const gaps1 = [96, 104, 112, 118, 124, 130, 136, 142, 148, 152, 156, 160];
  const sizes1 = [128, 128, 120, 120, 112, 112, 104, 104, 96, 96, 96, 96];
  const offs1 = [0, 96, -96, 64, -64, 96, 0, -96, 64, -64, 96, 0];
  for (let i = 0; i < 12; i++) s1.push([gaps1[i], sizes1[i], offs1[i], 20 * (i + 1)]);
  const p2 = section(plazas[0], [1, 0], s1, 128, 280, { top: M.grassTop, side: M.cliffB, thick: 48 });

  // Stage 2: Cliff climb (z 280 -> 700). Ledges +48 each.
  const s2 = [];
  const gaps2 = [88, 92, 96, 100, 104, 106, 108, 112];
  const offs2 = [80, -80, 64, -64, 80, -80, 0, 80];
  for (let i = 0; i < 8; i++) s2.push([gaps2[i], 96, offs2[i], 280 + 48 * (i + 1)]);
  const p3 = section(p2, [1, 0], s2, 96, 700, { top: M.dirtTop, side: M.cliffB, thick: 64 });

  // Stage 3: Ridge pillars, turning north (z 700 -> 1020). Long gaps, narrow tops.
  const s3 = [];
  const gaps3 = [160, 168, 176, 184, 192, 196, 200];
  const sizes3 = [96, 96, 88, 88, 80, 80, 72];
  const offs3 = [0, 80, -80, 64, -64, 80, 0];
  for (let i = 0; i < 7; i++) s3.push([gaps3[i], sizes3[i], offs3[i], 700 + 40 * (i + 1)]);
  const p4 = section(p3, [0, 1], s3, 200, 1020, { top: M.rockTop, side: M.cliffA, thick: 400 });

  // Stage 4: Peak longjumps (z 1020 -> 1380). The spicy finale.
  const s4 = [];
  const gaps4 = [192, 200, 208, 212, 216];
  const sizes4 = [160, 144, 144, 128, 128];
  const offs4 = [0, 64, -64, 48, 0];
  for (let i = 0; i < 5; i++) s4.push([gaps4[i], sizes4[i], offs4[i], 1020 + 48 * (i + 1)]);
  section(p4, [1, 0], s4, 220, 1380, { top: M.rockTop, side: M.cliffB, thick: 64 });
}
buildCourse();

// ---------- terrain ----------
const TILE = 512, POWER = 3, NV = 9; // 9x9 verts per tile
const BASE_Z = -256; // displacement base plane
const TX0 = -1024, TX1 = 9216, TY0 = -2048, TY1 = 4096;

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
  return 46 * Math.sin(0.0117 * x + 1.3) * Math.cos(0.0089 * y - 0.7)
       + 24 * Math.sin(0.023 * x - 0.4) * Math.sin(0.019 * y + 1.1)
       + 12 * Math.sin(0.041 * x) * Math.cos(0.037 * y);
}

function H(x, y) {
  const p = pathInfo(x, y);
  // open mountainside: sags below the course line, falls away laterally
  const lat = Math.pow(Math.max(0, p.d - 192) / 1400, 2) * 800;
  let h = p.z - 300 - lat + noise(x, y);
  // plaza plateaus: flat, exactly at plaza height
  let w = 0, pz = 0;
  for (const pl of plazas) {
    const d = Math.max(Math.abs(x - pl.x), Math.abs(y - pl.y));
    const wi = 1 - smooth(PLAZA_R, PLAZA_R + 256, d);
    if (wi > w) { w = wi; pz = pl.z; }
  }
  h = h * (1 - w) + pz * w;
  return Math.max(-240, Math.min(2000, h));
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
for (const p of platforms) {
  const h = p.size / 2;
  worldSolids.push(solid(p.cx - h, p.cy - h, p.top - p.thick, p.cx + h, p.cy + h, p.top,
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
