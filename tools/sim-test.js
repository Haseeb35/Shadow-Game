/* Shadow Self — mechanics simulation tests for levels/level1-12.json.
   Runs real Level/ShadowSystem/Entities/Player classes in a vm sandbox.
   Usage: node tools/sim-test.js   (run from the project root)             */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const f of ["src/level.js", "src/shadow.js", "src/entities.js", "src/player.js"]) {
  vm.runInContext(fs.readFileSync(path.resolve(f), "utf8"), sandbox);
}
const Level = sandbox.window.Level;
const ShadowSystem = sandbox.window.ShadowSystem;
const Entities = sandbox.window.Entities;
const Player = sandbox.window.Player;
const TS = 32;

let failures = 0;
let checks = 0;
function check(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.log("  FAIL: " + msg);
  }
}

function load(n) {
  const def = JSON.parse(fs.readFileSync(path.resolve("levels/level" + n + ".json"), "utf8"));
  return new Level(def);
}

function gameStub(level) {
  const g = {
    level,
    state: "playing",
    timer: 0,
    time: 0,
    Sound: new Proxy({}, { get: (t, k) => () => {} }),
    fx: {
      spawnBurst: () => {},
      spawnRing: () => {},
      shake: () => {},
      flash: () => {},
      hitStop: () => {},
    },
    ui: { toast: () => {}, showHint: () => {} },
    onPlayerDeath: () => {},
    onWin: () => {},
    player: null,
    shadow: null,
    entities: null,
  };
  g.player = new Player(g, level.spawn);
  g.shadow = new ShadowSystem(g);
  g.entities = new Entities(g);
  return g;
}

const emptyInput = { left: false, right: false, jumpDown: false, jumpHeld: false, down: false };

function placeShadow(g, tileX, tileY) {
  g.shadow.visible = true;
  g.shadow.x = tileX * TS + TS / 2;
  g.shadow.y = tileY * TS;
  g.shadow.prevX = g.shadow.x;
  g.shadow.prevY = g.shadow.y;
}

function placePlayer(g, tileX, tileY) {
  g.player.x = tileX * TS + TS / 2;
  g.player.y = tileY * TS;
  g.player.vx = 0;
  g.player.vy = 0;
  g.player.alive = true;
}

/* one physics frame: platforms move first, then the player */
function step(g, n) {
  for (let i = 0; i < n; i++) {
    g.entities.updatePlatforms(1 / 60);
    g.player.update(1 / 60, emptyInput);
    g.entities.update(1 / 60);
  }
}

/* ---------------- L1: hold plate opens door (player and shadow) ---------------- */
console.log("L1 First Steps — plates, keys, springs, platforms");
{
  const g = gameStub(load(1));
  // door1: hold plate at (57,13), player or shadow can open it
  const door1 = g.level.doors[0];
  placePlayer(g, 57, 13);
  step(g, 12);
  check(door1.open === true, "player on plate should open door1");
  placePlayer(g, 64, 13);
  step(g, 40);
  check(door1.open === false, "door1 should close after player leaves plate");
  placeShadow(g, 57, 13);
  step(g, 12);
  check(door1.open === true, "shadow on plate should open door1");
  g.shadow.visible = false;

  // spring at (84,13): landing on it bounces the player
  placePlayer(g, 84, 8);
  step(g, 1);
  let bounced = false;
  for (let i = 0; i < 90 && !bounced; i++) {
    step(g, 1);
    if (g.player.vy < -600) bounced = true;
  }
  check(bounced, "spring should launch the player upward");
  check(g.player.alive === true, "player should survive the spring bounce");

  // key at (128,11) on the raised block, unlocks door2
  placePlayer(g, 128, 12);
  step(g, 3);
  check(g.player.keys === 1, "player should pick up the key");
  placePlayer(g, 150, 13);
  step(g, 3);
  check(g.level.doors[1].open === true, "key should unlock door2");

  // door3: shadow-only hold pad at (180,13)
  const door3 = g.level.doors[2];
  placePlayer(g, 180, 13);
  step(g, 12);
  check(door3.open === false, "player must NOT open shadow-only hold door3");
  placeShadow(g, 180, 13);
  step(g, 12);
  check(door3.open === true, "shadow should open shadow-only hold door3");
  g.shadow.visible = false;

  // door4: shadow-only toggle pad at (200,13)
  const door4 = g.level.doors[3];
  placeShadow(g, 200, 13);
  step(g, 12);
  check(door4.open === true, "shadow should toggle door4 open");
  g.shadow.visible = false;
  step(g, 60);
  placeShadow(g, 200, 13);
  step(g, 12);
  check(door4.open === false, "second shadow press should toggle door4 closed");

  // door5: shadow-only hold plate at (222,13)
  const door5 = g.level.doors[4];
  placePlayer(g, 222, 13);
  step(g, 12);
  check(door5.open === false, "player must NOT open shadow-only hold door5");
  placeShadow(g, 222, 13);
  step(g, 12);
  check(door5.open === true, "shadow should open hold door5");

  // platform 1 should carry the player across the spikes
  const pf = g.level.platforms[0];
  g.player.reset({ x: 105, y: 10 });
  g.player.x = pf.rect.x + pf.rect.w / 2;
  g.player.y = pf.rect.y;
  g.player.vx = 0;
  g.player.vy = 0;
  g.player.alive = true;
  step(g, 60);
  check(pf.riding === true, "player should ride platform 1");
  check(g.player.x > 104 * TS, "platform 1 should carry the player to the right");
  check(g.player.alive === true, "player should survive riding over the spikes");
}

/* ---------------- L2: shadow holds the pad, door stays open ---------------- */
console.log("L2 The Echo — shadow holds door");
{
  const g = gameStub(load(2));
  const door = g.level.doors[0];
  placeShadow(g, 12, 13);
  step(g, 12);
  check(door.open === true, "shadow on plate should open door");
}

/* ---------------- L3: shadow-only toggle flips the door ---------------- */
console.log("L3 Blocked — shadow-only toggle");
{
  const g = gameStub(load(3));
  const door = g.level.doors[0];
  placePlayer(g, 14, 13);
  step(g, 12);
  check(door.open === false, "player must NOT trigger shadow-only toggle");
  placeShadow(g, 14, 13);
  step(g, 12);
  check(door.open === true, "shadow should toggle door open");
  g.player.alive = false;
  g.shadow.visible = false;
  step(g, 60);
  check(door.open === true, "toggle door should STAY open after shadow leaves");
  placeShadow(g, 14, 13);
  step(g, 12);
  check(door.open === false, "second shadow press should toggle door closed");
}

/* ---------------- L4: keys open locked doors ---------------- */
console.log("L4 Keyed Entry — keys + locked doors");
{
  const g = gameStub(load(4));
  const d1 = g.level.doors[0];
  const d2 = g.level.doors[1];
  placePlayer(g, 10, 13); // stand on the floor beneath the key tile
  step(g, 3);
  check(g.player.keys === 1, "player should pick up the key");
  check(g.level.keys[0].taken === true, "key should be marked taken");
  placePlayer(g, 26, 13); // walk to first locked door
  step(g, 3);
  check(d1.open === true, "key should unlock door1");
  check(g.player.keys === 0, "key should be consumed");
  check(d2.open === false, "door2 should still be locked");
}

/* ---------------- L5: fragile breaks under shadow only ---------------- */
console.log("L5 Fragile Ground — shadow breaks bridge");
{
  const g = gameStub(load(5));
  const f = g.level.fragile;
  check(f.length >= 3, "expected fragile tiles");
  placePlayer(g, 10, 8);
  step(g, 120);
  check(f.every((x) => x.state === 0), "player alone must not crack fragile");
  placeShadow(g, 10, 8);
  step(g, 40);
  check(f.some((x) => x.state === 1), "shadow should crack fragile (state 1)");
  step(g, 40);
  check(f.some((x) => x.state === 3), "shadow should shatter fragile (state 3)");
  check(g.level.isSolid(10, 8) === false, "broken fragile tile must be passable");
}

/* ---------------- L6: gate opens only while shadow is on projector ---------------- */
console.log("L6 The Locked Light — shadow gate");
{
  const g = gameStub(load(6));
  const gate = g.level.gates[0];
  placePlayer(g, 26, 13);
  step(g, 12);
  check(gate.active === false, "player on projector must not open gate");
  placeShadow(g, 26, 13);
  step(g, 12);
  check(gate.active === true, "shadow on projector should open gate");
  check(g.level.isSolid(28, 11) === false, "gate tile must be passable while active");
  g.shadow.visible = false;
  step(g, 40);
  check(gate.active === false, "gate should close after shadow leaves");
}

/* ---------------- L7: spring bounce + platform carries the player ---------------- */
console.log("L7 Spring Heels — spring + moving platform");
{
  const g = gameStub(load(7));
  // drop the player onto the spring tile
  placePlayer(g, 15, 8);
  step(g, 1);
  let bounced = false;
  for (let i = 0; i < 90 && !bounced; i++) {
    step(g, 1);
    if (g.player.vy < -600) bounced = true;
  }
  check(bounced, "spring should launch the player upward");
  check(g.player.alive === true, "player should survive the bounce");

  // platform carry: stand the player on the platform and ride it right
  const pf = g.level.platforms[0];
  g.player.reset({ x: 25, y: 10 });
  g.player.x = pf.rect.x + pf.rect.w / 2;
  g.player.y = pf.rect.y;
  g.player.vx = 0;
  g.player.vy = 0;
  g.player.alive = true;
  step(g, 60);
  check(pf.riding === true, "player should be riding the platform");
  check(g.player.x > 25 * TS, "platform should carry the player to the right");
  const pfY = pf.rect.y;
  check(Math.abs(g.player.y - pfY) < 14, "player should stay on top of the platform");
}

/* ---------------- L8: playerOnly plate + turret/shadow ---------------- */
console.log("L8 Keep Out — playerOnly plate + turret");
{
  const g = gameStub(load(8));
  const d1 = g.level.doors[0];
  const d2 = g.level.doors[1];
  const turret = g.level.turrets[0];
  // playerOnly toggle: only the player can flip it
  placeShadow(g, 35, 13);
  step(g, 12);
  check(d2.open === false, "shadow must NOT trigger playerOnly toggle");
  placePlayer(g, 35, 13);
  step(g, 12);
  check(d2.open === true, "player should toggle door2 open");
  // hold plate for the shadow + turret fires
  placeShadow(g, 22, 13);
  step(g, 12);
  check(d1.open === true, "shadow should hold door1 open");
  step(g, 160);
  const bolts = g.level.projectiles.filter((p) => p.kind === "turret");
  check(bolts.length >= 1, "turret should have fired");
  check(bolts.every((b) => b.vx > 0), "turret should fire to the right");
  // shadow absorbs a bolt
  placeShadow(g, 26, 13);
  g.level.projectiles.length = 0;
  g.level.projectiles.push({ x: 26 * TS, y: 13 * TS - TS / 2, vx: 180, vy: 0, dir: 1, speed: 180, r: 7, kind: "turret" });
  step(g, 3);
  check(g.level.projectiles.length === 0, "shadow should absorb the projectile");
  check(g.player.alive === true, "player should survive the absorbed projectile");
}

/* ---------------- L9: gate + walker patrol + chaser chases ---------------- */
console.log("L9 The Gauntlet — walker + chaser");
{
  const g = gameStub(load(9));
  const gate = g.level.gates[0];
  placeShadow(g, 23, 13);
  step(g, 12);
  check(gate.active === true, "shadow on projector should open gate");
  const walker = g.level.enemies[0];
  const x0 = walker.px;
  step(g, 60);
  check(Math.abs(walker.px - x0) > 2, "walker should be patrolling");
  // chaser should chase the player
  const chaser = g.level.enemies[1];
  placePlayer(g, 44, 13); // right of the chaser
  step(g, 30);
  check(chaser.px > 43 * TS, "chaser should move toward the player");
}

/* ---------------- L10: chaser, flyer bobs, watcher fires aimed bolts ---------------- */
console.log("L10 Predators — chaser/flyer/watcher");
{
  const g = gameStub(load(10));
  const chaser = g.level.enemies[0];
  const flyer = g.level.enemies[1];
  const watcher = g.level.enemies[3];
  placePlayer(g, 17, 13); // within the chaser's chase range (range 8)
  step(g, 30);
  check(chaser.px > 464, "chaser should move toward the player");
  const fy0 = flyer.py;
  step(g, 60);
  check(Math.abs(flyer.py - fy0) > 1, "flyer should bob vertically");
  check(flyer.py >= flyer.minY * TS && flyer.py <= flyer.maxY * TS, "flyer should stay in its vertical range");
  // the chaser reaches the player, so re-place to the watcher's right
  placePlayer(g, 44, 13);
  g.level.projectiles.length = 0; // clear bolts from the randomized early fire
  watcher.watcherT = 2.55; // deterministic: fires on the very next frames
  step(g, 8); // bolt is still in flight when checked
  const bolts = g.level.projectiles.filter((p) => p.kind === "watcher");
  check(bolts.length >= 1, "watcher should fire aimed bolts");
  if (bolts.length) {
    const b = bolts[0];
    check(b.vx > 0, "watcher should aim at the player (right)");
    check(b.vy > 0, "bolt should have downward velocity");
  }
}

/* ---------------- L11: keys + hold door + watcher ---------------- */
console.log("L11 The Vault — keys and timed door");
{
  const g = gameStub(load(11));
  const d1 = g.level.doors[0];
  const d2 = g.level.doors[1];
  const d3 = g.level.doors[2];
  placePlayer(g, 6, 13); // stand on the floor beneath key1
  step(g, 3);
  check(g.player.keys === 1, "player should pick up key1");
  placePlayer(g, 16, 13); // unlock door1
  step(g, 3);
  check(d1.open === true, "key should unlock door1");
  placePlayer(g, 30, 13); // stand on the floor beneath key2
  step(g, 3);
  check(g.player.keys === 1, "player should pick up key2");
  // hold door needs the shadow
  placePlayer(g, 23, 13); // on the hold plate
  placeShadow(g, 23, 13);
  step(g, 12);
  check(d2.open === true, "shadow on pad should open door2");
  g.shadow.visible = false;
  placePlayer(g, 40, 13);
  step(g, 40);
  check(d2.open === false, "timed door should close after everyone leaves");
}

/* ---------------- L12: everything combined ---------------- */
console.log("L12 The Longest Echo — finale");
{
  const g = gameStub(load(12));
  const d1 = g.level.doors[0];
  const d3 = g.level.doors[1];
  const gate = g.level.gates[0];
  // hold the pad for the shadow, then gate, then key route
  placePlayer(g, 11, 13);
  step(g, 3);
  check(d1.open === true, "player should open door1 via pad");
  placeShadow(g, 24, 13);
  step(g, 12);
  check(gate.active === true, "shadow should open the gate");
  placePlayer(g, 44, 13); // stand on the floor beneath the key
  step(g, 3);
  check(g.player.keys === 1, "player should pick up the key");
  placePlayer(g, 48, 13); // final lock
  step(g, 3);
  check(d3.open === true, "key should unlock the final door");
  const flyer = g.level.enemies[1];
  check(flyer.py >= flyer.minY * TS && flyer.py <= flyer.maxY * TS, "flyer should stay in range");
}

console.log("\n" + checks + " checks, " + failures + " failures");
process.exit(failures === 0 ? 0 : 1);
