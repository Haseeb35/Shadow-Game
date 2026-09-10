/* Shadow Self — level generator: writes levels/level1-12.json.
   Run from the project root:  node tools/gen-levels.js
   After running, regenerate the embedded fallback with:
   node tools/build-embedded.js
*/
const fs = require("fs");
const path = require("path");

const TS = 32;

/* ---- row helpers ------------------------------------------------------ */
function row(w, spec) {
  const a = new Array(w).fill(".");
  const singles = [];
  for (const key of Object.keys(spec)) {
    const ch = spec[key];
    if (key.indexOf("-") > -1) {
      const [s, e] = key.split("-").map(Number);
      for (let c = s; c <= e; c++) a[c] = ch;
    } else {
      singles.push([Number(key), ch]);
    }
  }
  // singles last so they override ranges
  for (const [c, ch] of singles) a[c] = ch;
  return a.join("");
}

function floorRow(w, spec) {
  const all = { ["0-" + (w - 1)]: "#" };
  for (const k of Object.keys(spec)) all[k] = spec[k];
  return row(w, all);
}

function empty(w) {
  return row(w, {});
}

/* a wall seam: rows r0..r1 with solid columns, a door/gate rect fills the gap */
function seamRows(w, cols, r0, r1) {
  const out = [];
  for (let r = r0; r <= r1; r++) {
    const spec = {};
    cols.forEach((c) => (spec[String(c)] = "#"));
    out.push(row(w, spec));
  }
  return out;
}

/* height-14 scaffold: 8 empty rows, seam at 8-10, 2 empty rows, floor at 13 */
function scaffold(w, seamCols, floorSpec, seamR0, seamR1) {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push(empty(w));
  rows.push(...seamRows(w, seamCols, seamR0 || 8, seamR1 || 10));
  rows.push(empty(w), empty(w));
  rows.push(floorRow(w, floorSpec));
  return rows;
}

function door(id, x, y, w, h, extra) {
  const d = { id, x, y, w, h };
  return Object.assign(d, extra || {});
}

/* ----------------------------------------------------------------------- */
const levels = [];

/* L1 — First Steps (a long tutorial: pads, keys, springs, platforms, shadow) */
{
  const W = 290;
  const g = [];
  for (let r = 0; r < 14; r++) g.push(new Array(W).fill("."));
  for (let c = 0; c < W; c++) g[13][c] = "#";

  const seam = (c0, c1) => {
    for (let r = 8; r <= 10; r++) for (let c = c0; c <= c1; c++) g[r][c] = "#";
  };
  const ow = (c0, c1, r) => {
    for (let c = c0; c <= c1; c++) g[r][c] = "-";
  };
  const spike = (c0, c1) => {
    for (let c = c0; c <= c1; c++) g[13][c] = "X";
  };
  const set = (c, ch) => {
    g[13][c] = ch;
  };

  /* 1 — The Meadow: run, hop the spikes, first checkpoint runs */
  set(3, "S");
  set(8, "P");
  ow(10, 12, 10);
  spike(14, 15);
  set(20, "P");
  ow(18, 20, 10);
  spike(26, 27);
  set(32, "P");
  spike(38, 39);
  set(44, "P");

  /* 2 — First Door: stand on the pad, slip through before it shuts */
  seam(58, 59);
  set(64, "P");

  /* 3 — Springs & the crossing: hop the one-ways, ride the platform */
  set(72, "P");
  ow(76, 80, 10);
  set(84, "^");
  ow(86, 90, 10);
  set(96, "P");
  spike(104, 111);
  set(118, "P");

  /* 4 — Keyed Entry: grab the key, open the golden lock */
  set(122, "P");
  for (let c = 127; c <= 129; c++) g[12][c] = "#";
  set(136, "P");
  seam(150, 151);
  set(156, "P");

  /* 5 — The Shadow Hall: leave your shadow on the pale pads */
  set(172, "P");
  seam(186, 187);
  set(194, "P");
  seam(206, 207);
  set(214, "P");
  seam(228, 229);
  set(236, "P");

  /* 6 — Final Crossing: ride the platform over the last spikes */
  set(252, "P");
  spike(258, 266);
  set(274, "P");
  set(284, "G");

  levels.push({
    name: "First Steps",
    subtitle: "Learning to trust the trail",
    hint: "Follow the glowing pads to open doors and run through before they shut. Golden keys open golden locks, springs fling you up, and ride the moving platforms. Your shadow trails 2s behind — leave it on a pale pad to hold a door, and only it can flip the dark pads.",
    tiles: g.map((r) => r.join("")),
    plates: [
      { x: 57, y: 13, w: 1, h: 1, type: "hold", targets: ["door1"] },
      { x: 180, y: 13, w: 1, h: 1, type: "hold", shadowOnly: true, targets: ["door3"] },
      { x: 200, y: 13, w: 1, h: 1, type: "toggle", shadowOnly: true, targets: ["door4"] },
      { x: 222, y: 13, w: 1, h: 1, type: "hold", shadowOnly: true, targets: ["door5"] },
    ],
    doors: [
      door("door1", 58, 11, 2, 2),
      door("door2", 150, 11, 2, 2, { key: true }),
      door("door3", 186, 11, 2, 2),
      door("door4", 206, 11, 2, 2),
      door("door5", 228, 11, 2, 2),
    ],
    keys: [{ x: 128, y: 11 }],
    platforms: [
      { x: 104, y: 10, w: 3, h: 1, path: [{ x: 104, y: 10 }, { x: 114, y: 10 }], speed: 1.5 },
      { x: 256, y: 10, w: 3, h: 1, path: [{ x: 256, y: 10 }, { x: 268, y: 10 }], speed: 1.4 },
    ],
    enemies: [],
  });
}

levels.push({
  name: "The Echo",
  subtitle: "Your shadow holds what you release",
  hint: "The pad opens the door — but only while someone stands on it. Stand on the pad and hold still; when your shadow catches up ten seconds later, leave it there and slip through the door.",
  tiles: scaffold(48, [28, 29], { "3": "S", "8": "P", "41": "G" }),
  plates: [{ x: 12, y: 13, w: 1, h: 1, type: "hold", targets: ["door1"] }],
  doors: [door("door1", 28, 11, 2, 2)],
  enemies: [],
});

levels.push({
  name: "Blocked",
  subtitle: "A switch only ghosts can touch",
  hint: "That dark switch ignores you — only your shadow can flip it. Touch it now, then wait at the door; ten seconds later your shadow will press it and open the way. A guard patrols beyond, so time your run.",
  tiles: scaffold(48, [24, 25, 26], { "3": "S", "8": "P", "41": "G" }),
  plates: [{ x: 14, y: 13, w: 1, h: 1, type: "toggle", shadowOnly: true, targets: ["door1"] }],
  doors: [door("door1", 24, 11, 3, 2)],
  enemies: [{ x: 31, y: 13, w: 1, h: 2, min: 28, max: 36, speed: 85 }],
});

levels.push({
  name: "Keyed Entry",
  subtitle: "Some doors need a hand",
  hint: "Golden keys open golden doors. Grab the key, walk it to the lock, and the door swings open for good. Two locks block your way — find a key for each.",
  tiles: scaffold(48, [26, 27, 33, 34], { "3": "S", "8": "P", "40": "G" }),
  keys: [{ x: 10, y: 12 }, { x: 30, y: 12 }],
  plates: [],
  doors: [
    door("door1", 26, 11, 2, 2, { key: true }),
    door("door2", 33, 11, 2, 2, { key: true }),
  ],
  enemies: [],
});

/* L5 — Fragile Ground (custom vertical layout) */
{
  const W = 25;
  const tiles = [
    empty(W), empty(W), empty(W), empty(W), empty(W), empty(W), empty(W), empty(W),
    row(W, { "0-4": "#", "5": "S", "6-9": "#", "10-12": "F", "13-18": "#", "19": "G", "20-24": "#" }),
    row(W, { "0-9": "#", "13-24": "#" }),
    row(W, { "0-9": "#", "13-24": "#" }),
    row(W, { "0-9": "#", "13-24": "#" }),
    row(W, { "0-9": "#", "13-24": "#" }),
    row(W, { "0-9": "#", "10-12": "X", "13-24": "#" }),
  ];
  levels.push({
    name: "Fragile Ground",
    subtitle: "A floor that fears your shadow",
    hint: "Pale stone holds you fine — but it shatters under your shadow's weight. Cross it quickly; if you stand still, your shadow will break the floor right beneath your feet.",
    tiles,
    plates: [],
    doors: [],
    enemies: [],
  });
}

levels.push({
  name: "The Locked Light",
  subtitle: "Only your shadow may pass",
  hint: "That shimmering gate answers only to your shadow. Stand on the cyan projector until your shadow takes it, then walk to the gate — it opens while your shadow keeps the light on.",
  tiles: scaffold(48, [28, 29], { "3": "S", "8": "P", "40": "G" }),
  plates: [],
  gates: [{ x: 28, y: 11, w: 2, h: 2, projector: { x: 26, y: 13 } }],
  doors: [],
  enemies: [],
});

/* L7 — Spring Heels (custom: spring + wall + ledge + moving platform) */
{
  const W = 48;
  const tiles = [
    empty(W), empty(W), empty(W), empty(W), empty(W), empty(W), empty(W), empty(W),
    empty(W),
    row(W, { "20-26": "#" }),
    row(W, { "17-19": "#" }),
    row(W, { "17-19": "#" }),
    row(W, { "17-19": "#" }),
    floorRow(W, { "4": "S", "9": "P", "15": "^", "20-35": "X", "43": "G" }),
  ];
  levels.push({
    name: "Spring Heels",
    subtitle: "Bounce over the void",
    hint: "A spring will fling you high — run onto it and hold toward the ledge. From there, drop onto the moving platform and ride it across the spikes.",
    tiles,
    plates: [],
    doors: [],
    enemies: [],
    platforms: [{ x: 24, y: 10, w: 3, h: 1, path: [{ x: 24, y: 10 }, { x: 35, y: 10 }], speed: 1.3 }],
  });
}

levels.push({
  name: "Keep Out",
  subtitle: "A shield of your own making",
  hint: "A turret guards the door. Hold the pad open while dodging the shots — then keep standing there. When your shadow arrives it absorbs the fire and holds the pad, and you can walk free. The violet switch answers only to you.",
  tiles: scaffold(48, [26, 27, 28, 38, 39, 40], { "3": "S", "5": "P", "44": "G" }),
  plates: [
    { x: 22, y: 13, w: 1, h: 1, type: "hold", targets: ["door1"] },
    { x: 35, y: 13, w: 1, h: 1, type: "toggle", playerOnly: true, targets: ["door2"] },
  ],
  doors: [
    door("door1", 26, 11, 3, 2),
    door("door2", 38, 11, 3, 2),
  ],
  enemies: [],
  turrets: [{ x: 8, y: 13, dir: 1, period: 3.0, speed: 180 }],
});

levels.push({
  name: "The Gauntlet",
  subtitle: "Every tool, one run",
  hint: "Hold the pad for your shadow, leave it on the light to open the gate, then ride the platform across the spike field. A guard and a chaser hunt the open ground.",
  tiles: scaffold(48, [14, 15, 16, 26, 27, 28], { "3": "S", "7": "P", "32-40": "X", "44": "G" }),
  plates: [{ x: 11, y: 13, w: 1, h: 1, type: "hold", targets: ["door1"] }],
  doors: [door("door1", 14, 11, 3, 2)],
  gates: [{ x: 26, y: 11, w: 3, h: 2, projector: { x: 23, y: 13 } }],
  enemies: [
    { x: 19, y: 13, w: 1, h: 2, min: 17, max: 22, speed: 85 },
    { type: "chaser", x: 43, y: 13, w: 1, h: 1, speed: 140, range: 7 },
  ],
  platforms: [{ x: 32, y: 10, w: 3, h: 1, path: [{ x: 32, y: 10 }, { x: 40, y: 10 }], speed: 1.4 }],
});

levels.push({
  name: "Predators",
  subtitle: "They learn to hunt",
  hint: "The purple one hunts you down, the bat hovers over the gap, and the eye marks its prey. Jump over the hunter or stomp it, time the crossing, and slip past the watcher's shots.",
  tiles: scaffold(48, [], { "3": "S", "8": "P", "20-29": "X", "43": "G" }),
  plates: [],
  doors: [],
  enemies: [
    { type: "chaser", x: 14, y: 13, w: 1, h: 1, speed: 150, range: 8, min: 9, max: 19 },
    { type: "flyer", x: 24, y: 7, w: 1, h: 1, speed: 55, minY: 5, maxY: 8 },
    { type: "flyer", x: 34, y: 7, w: 1, h: 1, speed: 55, minY: 5, maxY: 8 },
    { type: "watcher", x: 40, y: 13, w: 1, h: 2, period: 2.6, speed: 200 },
  ],
  platforms: [{ x: 21, y: 10, w: 3, h: 1, path: [{ x: 21, y: 10 }, { x: 28, y: 10 }], speed: 1.2 }],
});

levels.push({
  name: "The Vault",
  subtitle: "Three locks, one past",
  hint: "Two golden locks need their keys. Between them, a timed door stays open only while someone holds its pad — leave your shadow there. A watcher guards the vault door beyond.",
  tiles: scaffold(48, [16, 17, 26, 27, 34, 35], { "3": "S", "8": "P", "44": "G" }),
  keys: [{ x: 6, y: 12 }, { x: 30, y: 12 }],
  plates: [{ x: 23, y: 13, w: 1, h: 1, type: "hold", targets: ["door2"] }],
  doors: [
    door("door1", 16, 11, 2, 2, { key: true }),
    door("door2", 26, 11, 2, 2),
    door("door3", 34, 11, 2, 2, { key: true }),
  ],
  enemies: [
    { type: "watcher", x: 40, y: 13, w: 1, h: 2, period: 2.6, speed: 210 },
  ],
});

/* L12 — The Longest Echo (everything, longer) */
{
  const W = 56;
  const tiles = [
    empty(W), empty(W), empty(W), empty(W), empty(W), empty(W), empty(W), empty(W),
    row(W, { "14-16": "#", "26-28": "#", "48-49": "#" }),
    row(W, { "14-16": "#", "26-28": "#", "48-49": "#" }),
    row(W, { "14-16": "#", "26-28": "#", "48-49": "#" }),
    empty(W),
    empty(W),
    floorRow(W, { "3": "S", "8": "P", "29-40": "X", "54": "G" }),
  ];
  levels.push({
    name: "The Longest Echo",
    subtitle: "Ten seconds ahead of yourself",
    hint: "Everything at once. Dodge the turret and hold the pad for your shadow, then leave it on the light to open the gate. Ride the platform across the spikes, grab the key, and slip past the watcher to open the final lock.",
    tiles,
    keys: [{ x: 44, y: 12 }],
    plates: [{ x: 11, y: 13, w: 1, h: 1, type: "hold", targets: ["door1"] }],
    doors: [
      door("door1", 14, 11, 3, 2),
      door("door3", 48, 11, 2, 2, { key: true }),
    ],
    gates: [{ x: 26, y: 11, w: 3, h: 2, projector: { x: 24, y: 13 } }],
    enemies: [
      { type: "chaser", x: 21, y: 13, w: 1, h: 1, speed: 150, range: 6, min: 18, max: 22 },
      { type: "flyer", x: 46, y: 11, w: 1, h: 1, speed: 55, minY: 9, maxY: 12 },
      { type: "watcher", x: 52, y: 13, w: 1, h: 2, period: 2.6, speed: 210 },
    ],
    platforms: [{ x: 29, y: 10, w: 3, h: 1, path: [{ x: 29, y: 10 }, { x: 40, y: 10 }], speed: 1.3 }],
    turrets: [{ x: 6, y: 13, dir: 1, period: 3.2, speed: 180 }],
  });
}

/* ----------------------------------------------------------------------- */
const dir = path.resolve("levels");
for (let i = 0; i < levels.length; i++) {
  const lvl = levels[i];
  const out = {
    name: lvl.name,
    subtitle: lvl.subtitle,
    hint: lvl.hint,
    tiles: lvl.tiles,
  };
  for (const k of [
    "plates",
    "doors",
    "gates",
    "enemies",
    "turrets",
    "keys",
    "platforms",
  ]) {
    if (lvl[k] && lvl[k].length) out[k] = lvl[k];
  }
  fs.writeFileSync(
    path.join(dir, "level" + (i + 1) + ".json"),
    JSON.stringify(out, null, 2) + "\n",
    "utf8"
  );
  console.log("level" + (i + 1) + ".json written (" + lvl.name + ")");
}
