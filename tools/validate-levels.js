/* Shadow Self - structural validation for levels/level1-12.json.
   Usage: node tools/validate-levels.js   (run from the project root)     */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.resolve("src/level.js"), "utf8"), sandbox);
const Level = sandbox.window.Level;

const dir = path.resolve("levels");
let bad = 0;

function fail(msg) {
  bad++;
  console.log("  FAIL: " + msg);
}

const files = fs.readdirSync(dir).filter((f) => /^level\d+\.json$/.test(f));
files.sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

for (const file of files) {
  const num = file.match(/^level(\d+)\.json$/)[1];
  let def;
  try {
    def = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  } catch (e) {
    console.log("L" + num + ": JSON parse error: " + e.message);
    bad++;
    continue;
  }
  console.log("L" + num + " — " + def.name);

  const lvl = new Level(def);
  const W = lvl.width;
  const H = lvl.height;

  const rows = def.tiles.map((r) => r.replace(/ /g, ".").length);
  for (let r = 0; r < rows.length; r++) {
    if (rows[r] !== W) fail(`row ${r} length ${rows[r]} != width ${W}`);
  }
  if (W < 8) fail("width too small");
  if (H < 4) fail("height too small");

  const solidAt = (tx, ty) => {
    const idx = lvl.idx(tx, ty);
    return idx >= 0 && lvl.solid[idx] === 1;
  };
  const inLevel = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  if (def.tiles.some((r) => r.includes("S")) === false) fail("no spawn char 'S'");
  if (def.tiles.some((r) => r.includes("G")) === false) fail("no goal char 'G'");

  for (const d of lvl.doors) {
    if (!inLevel(d.x, d.y) || d.x + d.w > W || d.y + d.h > H)
      fail(`door '${d.id}' out of bounds`);
    const above = d.y - 1;
    for (let dx = 0; dx < d.w; dx++) {
      if (!solidAt(d.x + dx, above))
        fail(`door '${d.id}' has no solid ceiling above at (${d.x + dx}, ${above})`);
    }
    if (d.key && lvl.keys.length === 0)
      fail(`locked door '${d.id}' but the level has no keys`);
  }
  const keyDoors = lvl.doors.filter((d) => d.key).length;
  if (keyDoors > lvl.keys.length)
    fail(`${keyDoors} locked door(s) but only ${lvl.keys.length} key(s)`);

  for (const g of lvl.gates) {
    if (!inLevel(g.x, g.y) || g.x + g.w > W || g.y + g.h > H) fail("gate out of bounds");
    const above = g.y - 1;
    for (let dx = 0; dx < g.w; dx++) {
      if (!solidAt(g.x + dx, above)) fail(`gate ${g.idx} has no solid ceiling above at (${g.x + dx}, ${above})`);
    }
    const pr = g.projector;
    if (!inLevel(pr.x, pr.y)) fail("gate projector out of bounds");
    if (!solidAt(pr.x, pr.y)) fail(`gate ${g.idx} projector at (${pr.x}, ${pr.y}) not on solid floor`);
  }

  for (const p of lvl.plates) {
    if (!inLevel(p.x, p.y) || p.x + p.w > W || p.y + p.h > H) fail("plate out of bounds");
    for (let dx = 0; dx < p.w; dx++) {
      if (!solidAt(p.x + dx, p.y)) fail(`plate at (${p.x},${p.y}) not on solid floor`);
    }
    if (p.shadowOnly && p.playerOnly) fail(`plate at (${p.x},${p.y}) is both shadowOnly and playerOnly`);
  }

  for (const e of lvl.enemies) {
    if (!inLevel(e.x, e.y)) fail(`enemy ${e.type} (${e.x},${e.y}) out of bounds`);
    if (e.type === "flyer") {
      if (!(e.minY !== undefined && e.maxY !== undefined && e.minY < e.maxY))
        fail(`flyer (${e.x},${e.y}) needs minY < maxY`);
      if (!inLevel(e.x, e.minY) || !inLevel(e.x, e.maxY))
        fail(`flyer (${e.x},${e.y}) vertical range out of bounds`);
    } else if (e.type === "watcher") {
      if (!solidAt(e.x, e.y)) fail(`watcher (${e.x},${e.y}) not on solid floor`);
    } else {
      if (!(e.min !== undefined && e.max !== undefined && e.min < e.max)) {
        if (e.type !== "chaser") fail(`enemy ${e.type} (${e.x},${e.y}) needs min < max`);
      } else if (!solidAt(Math.floor((e.min + e.max) / 2), e.y)) {
        fail(`enemy ${e.type} (${e.x},${e.y}) patrol not on solid floor`);
      }
    }
  }

  for (const t of lvl.turrets) {
    if (!inLevel(t.x, t.y)) fail("turret out of bounds");
    if (!solidAt(t.x, t.y)) fail(`turret at (${t.x},${t.y}) not on solid floor`);
  }

  for (const k of lvl.keys) {
    if (!inLevel(k.x, k.y)) fail(`key at (${k.x},${k.y}) out of bounds`);
    if (!solidAt(k.x, k.y + 1)) fail(`key at (${k.x},${k.y}) has no solid floor beneath`);
  }

  for (const s of lvl.springs) {
    if (!inLevel(s.x, s.y)) fail(`spring at (${s.x},${s.y}) out of bounds`);
    if (!solidAt(s.x, s.y)) fail(`spring at (${s.x},${s.y}) not on a solid tile`);
  }

  for (const pf of lvl.platforms) {
    for (const wp of pf.path) {
      if (!inLevel(Math.floor(wp.x / lvl.TS), Math.floor(wp.y / lvl.TS)))
        fail("platform waypoint out of bounds");
    }
    if (pf.w <= 0 || pf.h <= 0) fail("platform has non-positive size");
  }

  if (lvl.fragile.length === 0 && def.fragile && def.fragile.length) fail("fragile declared but none parsed");

  console.log(
    `  size ${W}x${H}, spawn(${lvl.spawn.x.toFixed(1)},${lvl.spawn.y}), ` +
      `goal(${lvl.goal.x.toFixed(1)},${lvl.goal.y}), doors ${lvl.doors.length}, ` +
      `gates ${lvl.gates.length}, plates ${lvl.plates.length}, enemies ${lvl.enemies.length}, ` +
      `turrets ${lvl.turrets.length}, keys ${lvl.keys.length}, springs ${lvl.springs.length}, ` +
      `platforms ${lvl.platforms.length}, fragile ${lvl.fragile.length}`
  );
}

console.log(bad === 0 ? "\nALL CHECKS PASSED" : "\n" + bad + " CHECK(S) FAILED");
process.exit(bad === 0 ? 0 : 1);
