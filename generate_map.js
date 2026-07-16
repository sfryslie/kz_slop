// Generates kz_slop.vmf — a KZ bhop/platforming test map for Momentum Mod.
// Run: node generate_map.js   ->  writes kz_slop.vmf
// Compile with Momentum's vbsp/vvis/vrad (see README).

const fs = require("fs");

// ---------- materials ----------
const M = {
  floorKill: "BLACK",
  sky: "TOOLS/TOOLSSKYBOX",
  trigger: "TOOLS/TOOLSTRIGGER",
  padTop: "DEV_NYRO/DEV_GRAY-07",
  padSide: "DEV_NYRO/DEV_GRAY-05",
  startTop: "DEV_NYRO/DEV_GRAY-21",
  endTop: "DEV_NYRO/DEV_RED_A-01",
  accent: "DEV_NYRO/DEV_RED_A-01",
  climbTop: "DEV_NYRO/DEV_GRAY-09",
  climbSide: "DEV_NYRO/DEV_GRAY-06",
};

let nextId = 2; // 1 is reserved for worldspawn
const id = () => nextId++;

// Texture axes per face orientation (world-aligned, scale 0.25)
function axes(normal) {
  // normal: 'x','y','z'
  if (normal === "z") return { u: "[1 0 0 0] 0.25", v: "[0 -1 0 0] 0.25" };
  if (normal === "x") return { u: "[0 1 0 0] 0.25", v: "[0 0 -1 0] 0.25" };
  return { u: "[1 0 0 0] 0.25", v: "[0 0 -1 0] 0.25" };
}

function side(plane, material, normal) {
  const a = axes(normal);
  return `\t\tside
\t\t{
\t\t\t"id" "${id()}"
\t\t\t"plane" "${plane}"
\t\t\t"material" "${material}"
\t\t\t"uaxis" "${a.u}"
\t\t\t"vaxis" "${a.v}"
\t\t\t"rotation" "0"
\t\t\t"lightmapscale" "16"
\t\t\t"smoothing_groups" "0"
\t\t}`;
}

// Axis-aligned box solid. mats: {top,bottom,north,south,east,west} or a single string.
function solid(x1, y1, z1, x2, y2, z2, mats) {
  if (typeof mats === "string") mats = { all: mats };
  const m = (f) => mats[f] || mats.all || mats.side || M.padSide;
  // Plane points are clockwise when viewed from outside the solid.
  const sides = [
    // top (+z)
    side(`(${x1} ${y2} ${z2}) (${x2} ${y2} ${z2}) (${x2} ${y1} ${z2})`, m("top"), "z"),
    // bottom (-z)
    side(`(${x1} ${y1} ${z1}) (${x2} ${y1} ${z1}) (${x2} ${y2} ${z1})`, m("bottom"), "z"),
    // west (-x)
    side(`(${x1} ${y2} ${z2}) (${x1} ${y1} ${z2}) (${x1} ${y1} ${z1})`, m("west"), "x"),
    // east (+x)
    side(`(${x2} ${y2} ${z1}) (${x2} ${y1} ${z1}) (${x2} ${y1} ${z2})`, m("east"), "x"),
    // north (+y)
    side(`(${x2} ${y2} ${z2}) (${x1} ${y2} ${z2}) (${x1} ${y2} ${z1})`, m("north"), "y"),
    // south (-y)
    side(`(${x2} ${y1} ${z1}) (${x1} ${y1} ${z1}) (${x1} ${y1} ${z2})`, m("south"), "y"),
  ];
  return `\tsolid
\t{
\t\t"id" "${id()}"
${sides.join("\n")}
\t}`;
}

// Platform helper: centered at (cx, cy), square of `size`, top surface at `top`.
function pad(cx, cy, size, top, topMat, thickness = 32, sideMat = M.padSide) {
  const h = size / 2;
  return solid(cx - h, cy - h, top - thickness, cx + h, cy + h, top, {
    top: topMat,
    all: sideMat,
  });
}

const worldSolids = [];
const entities = [];

function pointEntity(classname, origin, extra = {}) {
  const kv = Object.entries(extra)
    .map(([k, v]) => `\t"${k}" "${v}"`)
    .join("\n");
  entities.push(`entity
{
\t"id" "${id()}"
\t"classname" "${classname}"
\t"origin" "${origin}"
${kv ? kv + "\n" : ""}}`);
}

function brushEntity(classname, solids, extra = {}) {
  const kv = Object.entries(extra)
    .map(([k, v]) => `\t"${k}" "${v}"`)
    .join("\n");
  entities.push(`entity
{
\t"id" "${id()}"
\t"classname" "${classname}"
${kv ? kv + "\n" : ""}${solids.join("\n")}
}`);
}

// ---------- the room ----------
// Interior: x -576..7744, y -1600..1600, z -768..1280
const IX1 = -576, IX2 = 7744, IY1 = -1600, IY2 = 1600, IZ1 = -768, IZ2 = 1280;
const T = 64; // wall thickness

// floor (black kill floor)
worldSolids.push(solid(IX1 - T, IY1 - T, IZ1 - T, IX2 + T, IY2 + T, IZ1, { top: M.floorKill, all: M.floorKill }));
// ceiling (skybox)
worldSolids.push(solid(IX1 - T, IY1 - T, IZ2, IX2 + T, IY2 + T, IZ2 + T, M.sky));
// walls (skybox)
worldSolids.push(solid(IX1 - T, IY1 - T, IZ1, IX1, IY2 + T, IZ2, M.sky)); // west
worldSolids.push(solid(IX2, IY1 - T, IZ1, IX2 + T, IY2 + T, IZ2, M.sky)); // east
worldSolids.push(solid(IX1, IY1 - T, IZ1, IX2, IY1, IZ2, M.sky)); // south
worldSolids.push(solid(IX1, IY2, IZ1, IX2, IY2 + T, IZ2, M.sky)); // north

// ---------- the course ----------
// Start pad
worldSolids.push(solid(0, -192, -32, 384, 192, 0, { top: M.startTop, all: M.padSide }));

// Bhop section: platforms with growing gaps, top z = 0
let x = 384;
const bhop = [
  // [gap, size, yCenter]
  [96, 128, 0],
  [112, 128, 96],
  [120, 112, -64],
  [128, 112, 64],
  [136, 112, -96],
  [144, 96, 0],
  [152, 96, 96],
  [160, 96, -96],
  [168, 80, 0],
  [176, 80, 64],
];
for (const [gap, size, yc] of bhop) {
  x += gap;
  worldSolids.push(pad(x + size / 2, yc, size, 0, M.padTop));
  x += size;
}

// Rest pad
x += 128;
const restCx = x + 128;
worldSolids.push(pad(restCx, 0, 256, 0, M.startTop));
x += 256;

// Climb section: ledges rising +48 each
let z = 0;
const climb = [
  // [gap, size, yCenter]
  [88, 96, 80],
  [88, 96, -80],
  [88, 96, 64],
  [88, 96, -64],
  [80, 96, 80],
  [80, 80, -80],
  [80, 80, 0],
  [80, 80, 80],
];
for (const [gap, size, yc] of climb) {
  x += gap;
  z += 48;
  worldSolids.push(pad(x + size / 2, yc, size, z, M.climbTop, 160, M.climbSide));
  x += size;
}

// High rest pad (z = 384)
x += 96;
worldSolids.push(pad(x + 112, 0, 224, z, M.startTop, 160, M.padSide));
x += 224;

// Longjump gaps
x += 192;
worldSolids.push(pad(x + 128, 0, 256, z, M.padTop, 160, M.padSide));
x += 256;
x += 216;

// End pad
const endCx = x + 192;
worldSolids.push(solid(x, -192, z - 160, x + 384, 192, z, { top: M.endTop, all: M.padSide }));
// End monolith
worldSolids.push(solid(x + 288, -32, z, x + 352, 32, z + 256, M.accent));

// ---------- entities ----------
pointEntity("info_player_start", "96 0 4", { angles: "0 0 0" });

pointEntity("info_teleport_destination", "96 0 8", {
  targetname: "spawn_dest",
  angles: "0 0 0",
});

// Kill-floor teleport back to start
brushEntity(
  "trigger_teleport",
  [solid(IX1, IY1, IZ1, IX2, IY2, IZ1 + 128, M.trigger)],
  { target: "spawn_dest", spawnflags: "1", StartDisabled: "0" }
);

// Sun + ambient
pointEntity("light_environment", "192 0 1000", {
  angles: "0 210 0",
  pitch: "-60",
  _light: "255 247 230 450",
  _ambient: "185 195 215 120",
  _lightHDR: "-1 -1 -1 1",
  _lightscaleHDR: "1",
  _ambientHDR: "-1 -1 -1 1",
  _AmbientScaleHDR: "1",
  SunSpreadAngle: "1",
});

// ---------- assemble ----------
const vmf = `versioninfo
{
\t"editorversion" "400"
\t"editorbuild" "8000"
\t"mapversion" "1"
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
\t"mapversion" "1"
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
console.log(`Wrote kz_slop.vmf (${worldSolids.length} world solids, ${entities.length} entities, course ends at x=${endCx + 192})`);
