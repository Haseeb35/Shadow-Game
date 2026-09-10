/* Shadow Self — interactive level entities: plates, doors, gates,
   fragile floors, springs, keys, platforms, enemies, turrets, projectiles. */
(function () {
  "use strict";

  const TS = 32;

  class Entities {
    constructor(game) {
      this.game = game;
      this._doorById = {};
      game.level.doors.forEach((d) => (this._doorById[d.id] = d.idx));
      game.level.plates.forEach((p) => {
        p.targets = (p.targets || [])
          .map((id) => this._doorById[id])
          .filter((i) => i !== undefined);
      });
      // wire each door to the plates that open it (by index)
      const doorTargets = game.level.doors.map(() => []);
      game.level.plates.forEach((p, pi) => {
        (p.targets || []).forEach((di) => doorTargets[di].push(pi));
      });
      game.level.doors.forEach((d, di) => (d.targets = doorTargets[di]));
    }

    update(dt) {
      const g = this.game;
      this.updatePlates(g, dt);
      this.updateDoors(g, dt);
      this.updateGates(g, dt);
      this.updateFragile(g, dt);
      this.updateSprings(g, dt);
      this.updateKeys(g, dt);
      this.updateEnemies(g, dt);
      this.updateTurrets(g, dt);
      this.updateProjectiles(g, dt);
    }

    /* ---------------- moving platforms (runs BEFORE player physics) ------ */
    updatePlatforms(dt) {
      const g = this.game;
      for (const pf of g.level.platforms) {
        pf.t += pf.speed * TS * dt;
        const pos = g.level._platformPos(pf);
        pf.dx = pos.x - pf.x;
        pf.dy = pos.y - pf.y;
        pf.x = pos.x;
        pf.y = pos.y;
        pf.rect.x = pos.x;
        pf.rect.y = pos.y;
      }
      g.level.syncPlatforms();

      const p = g.player;
      if (!p || !p.alive) {
        for (const pf of g.level.platforms) pf.riding = false;
        return;
      }
      // carry the player along with whatever platform they were riding
      for (const pf of g.level.platforms) {
        if (pf.riding) {
          p.x += pf.dx;
          p.y += pf.dy;
        }
      }
      // decide riding state for the next frame (standing on top)
      for (const pf of g.level.platforms) {
        const r = p.rect();
        pf.riding =
          r.x + r.w > pf.rect.x + 2 &&
          r.x < pf.rect.x + pf.rect.w - 2 &&
          r.y + r.h >= pf.rect.y - 3 &&
          r.y + r.h <= pf.rect.y + 12;
      }
    }

    /* ---------------- plates ---------------- */
    updatePlates(g, dt) {
      const p = g.player;
      const sh = g.shadow;
      const pRect = p ? p.rect() : null;
      const sRect = sh && sh.visible ? sh.rect() : null;
      for (const pl of g.level.plates) {
        const pOn = pRect && aabb(pl.rect, pRect);
        const sOn = sRect && aabb(pl.rect, sRect);
        pl.pressed = pOn || sOn;
        // effective source: playerOnly → player only; shadowOnly → shadow only; else anyone
        const src = pl.playerOnly ? pOn : pl.shadowOnly ? sOn : pl.pressed;
        pl.src = src;
        if (pl.type === "toggle") {
          if (src && !pl.wasPressed) {
            pl.flash = 0.35;
            g.Sound.switchOn();
            g.fx.spawnBurst(pl.rect.x + pl.rect.w / 2, pl.rect.y + pl.rect.h / 2, "plate", 10);
            pl.targets.forEach((di) => {
              const d = g.level.doors[di];
              d.open = !d.open;
              d.timer = 0;
              this._doorFx(g, d);
            });
          } else if (!src && pl.wasPressed) {
            g.Sound.switchOff();
          }
          pl.wasPressed = src;
        } else {
          // hold
          pl.flash = Math.max(0, pl.flash - dt);
          if (pl.pressed && !pl.wasPressed) {
            pl.flash = 0.35;
            g.Sound.switchOn();
            g.fx.spawnBurst(pl.rect.x + pl.rect.w / 2, pl.rect.y + pl.rect.h / 2, "plate", 10);
          } else if (!pl.pressed && pl.wasPressed) {
            g.Sound.switchOff();
          }
          pl.wasPressed = pl.pressed;
        }
      }
    }

    /* ---------------- doors ---------------- */
    updateDoors(g, dt) {
      for (const d of g.level.doors) {
        // key doors are opened by updateKeys — leave those alone
        if (d.key) continue;
        // toggle plates flip the door directly in updatePlates — leave those alone
        const toggleControlled = d.targets.some((di) => {
          const p = g.level.plates[di];
          return p && p.type === "toggle";
        });
        if (toggleControlled) continue;
        // hold plates drive the door state
        const want = d.targets.some((di) => {
          const p = g.level.plates[di];
          return p && p.type === "hold" && p.src;
        });
        if (want) {
          d.timer = 0;
          if (!d.open) {
            d.open = true;
            this._doorFx(g, d);
          }
        } else if (d.open) {
          d.timer += dt;
          if (d.timer > 0.35) {
            d.open = false;
            this._doorFx(g, d, true);
          }
        }
      }
    }

    _doorFx(g, d, closing) {
      const cx = d.rect.x + d.rect.w / 2;
      const cy = d.rect.y + d.rect.h / 2;
      g.fx.spawnBurst(cx, cy, closing ? "doorClose" : "doorOpen", 16);
      g.fx.shake(closing ? 3 : 4);
      if (closing) g.Sound.doorClose();
      else g.Sound.doorOpen();
    }

    /* ---------------- gates (shadow platforms) ---------------- */
    updateGates(g, dt) {
      const sh = g.shadow;
      const sRect = sh && sh.visible ? sh.rect() : null;
      for (const ga of g.level.gates) {
        // only the shadow's presence on the projector opens the gate
        const occupied = sRect && aabb(ga.projector.rect, sRect);
        if (occupied) {
          ga.timer = 0;
          if (!ga.active) {
            ga.active = true;
            ga.flash = 0.4;
            g.Sound.gateActive();
            g.fx.spawnBurst(
              ga.rect.x + ga.rect.w / 2,
              ga.rect.y + ga.rect.h / 2,
              "gate",
              14
            );
          }
        } else {
          ga.timer += dt;
          if (ga.timer > 0.5) ga.active = false;
        }
        ga.flash = Math.max(0, ga.flash - dt);
      }
    }

    /* ---------------- fragile floors (shadow breaks) ---------------- */
    updateFragile(g, dt) {
      const sh = g.shadow;
      const sRect = sh && sh.visible ? sh.rect() : null;
      for (const f of g.level.fragile) {
        if (f.state >= 3) continue;
        const occupied = sRect && aabb(f.rect, sRect);
        if (occupied) {
          f.standTimer += dt;
          if (f.state === 0 && f.standTimer > 0.5) {
            f.state = 1;
            f.standTimer = 0;
            g.Sound.crack();
            g.fx.spawnBurst(f.rect.x + f.rect.w / 2, f.rect.y + f.rect.h / 2, "crack", 10);
            g.fx.shake(2);
          } else if (f.state === 1 && f.standTimer > 0.45) {
            f.state = 3;
            g.Sound.shatter();
            g.fx.spawnBurst(f.rect.x + f.rect.w / 2, f.rect.y + f.rect.h / 2, "shard", 22);
            g.fx.shake(7);
          }
        } else {
          f.standTimer = 0;
        }
      }
    }

    /* ---------------- springs ---------------- */
    updateSprings(g, dt) {
      for (const sp of g.level.springs) {
        sp.cool = Math.max(0, sp.cool - dt);
        sp.t += dt;
      }
    }

    /* ---------------- keys + locked doors ---------------- */
    updateKeys(g, dt) {
      const p = g.player;
      if (!p || !p.alive) return;
      const pRect = p.rect();
      for (const k of g.level.keys) {
        if (k.taken) continue;
        const kRect = { x: k.x * TS + 6, y: k.y * TS + 6, w: TS - 12, h: TS - 12 };
        if (aabb(kRect, pRect)) {
          k.taken = true;
          p.keys++;
          g.Sound.keyPickup();
          g.fx.spawnBurst(k.x * TS + TS / 2, k.y * TS + TS / 2, "key", 16);
          g.fx.spawnRing(k.x * TS + TS / 2, k.y * TS + TS / 2, "#ffd166");
          g.ui.toast("Key acquired", 1.5);
        }
      }
      for (const d of g.level.doors) {
        if (!d.key || d.open || p.keys <= 0) continue;
        // generous touch box so the player can unlock by walking up to it
        const touch = { x: d.rect.x - 4, y: d.rect.y - 4, w: d.rect.w + 8, h: d.rect.h + 8 };
        if (aabb(touch, pRect)) {
          d.open = true;
          p.keys--;
          g.Sound.lockOpen();
          g.fx.spawnBurst(d.rect.x + d.rect.w / 2, d.rect.y + d.rect.h / 2, "lockOpen", 20);
          g.fx.shake(4);
          g.fx.flash("#ffd166", 0.15);
          g.ui.toast("Key accepted — door open", 2);
        }
      }
    }

    /* ---------------- enemies ---------------- */
    updateEnemies(g, dt) {
      const p = g.player;
      const sh = g.shadow;
      const pRect = p && p.alive ? p.rect() : null;
      const sRect = sh && sh.visible ? sh.rect() : null;

      for (const e of g.level.enemies) {
        if (e.dead) {
          e.deadTimer += dt;
          continue;
        }
        e.walk += dt * 10;
        e.flash = Math.max(0, e.flash - dt);

        const r = this._enemyRect(e);
        if (e.type === "flyer") this._updateFlyer(g, e, r, dt, pRect);
        else if (e.type === "watcher") this._updateWatcher(g, e, r, dt, pRect);
        else this._updateGround(g, e, r, dt, sRect, pRect);
      }
    }

    /* walker / chaser: ground-bound, gravity, patrol or chase */
    _updateGround(g, e, r, dt, sRect, pRect) {
      const minX = e.min * TS;
      const maxX = e.max * TS + TS - e.w;
      let move = true;

      if (e.type === "chaser") {
        const p = g.player;
        if (p && p.alive) {
          const range = (e.range || 6) * TS;
          const dx = p.x - e.px;
          if (Math.abs(dx) < range && Math.abs(p.y - e.py) < 6 * TS) {
            e.dir = dx > 0 ? 1 : -1;
          } else {
            e.dir = 0;
            move = false;
          }
        } else {
          e.dir = 0;
          move = false;
        }
        if (e.min !== undefined) {
          if (r.x <= minX) e.dir = 1;
          else if (r.x + r.w >= maxX) e.dir = -1;
        }
      } else {
        if (r.x <= minX) {
          r.x = minX;
          e.dir = 1;
        } else if (r.x + r.w >= maxX) {
          r.x = maxX - r.w;
          e.dir = -1;
        }
      }

      // the shadow blocks ground enemies and turns them around
      if (move && sRect && aabb(sRect, r)) {
        e.dir *= -1;
        e.flash = 0.3;
        r.x += e.dir > 0 ? -2 : 2;
      }
      if (!move) e.dir = 0;

      const vx = e.dir * e.speed;
      const g2 = 1800;
      e.vy = (e.vy || 0) + g2 * dt;
      if (e.vy > 900) e.vy = 900;
      const res = g.level.moveRect(r, vx * dt, e.vy * dt, { oneWay: false });
      if (res.hitX) {
        e.dir *= -1;
        g.Sound.enemyTurn();
      }
      if (res.onGround) e.vy = 0;
      e.px = r.x + e.w / 2;
      e.py = r.y + e.h;

      this._enemyPlayerHit(g, e, r, dt, pRect);
    }

    /* flyer: no gravity, bobs vertically (and drifts), kills on touch */
    _updateFlyer(g, e, r, dt, pRect) {
      const minY = e.minY * TS;
      const maxY = e.maxY * TS;
      if (e.dirV > 0) {
        e.py += e.speed * dt;
        if (e.py >= maxY) {
          e.py = maxY;
          e.dirV = -1;
        }
      } else {
        e.py -= e.speed * dt;
        if (e.py <= minY) {
          e.py = minY;
          e.dirV = 1;
        }
      }
      if (e.min !== undefined && e.max !== undefined) {
        e.px += e.dir * e.speed * 0.4 * dt;
        if (e.px <= e.min * TS + TS / 2) {
          e.px = e.min * TS + TS / 2;
          e.dir = 1;
        }
        if (e.px >= e.max * TS + TS / 2) {
          e.px = e.max * TS + TS / 2;
          e.dir = -1;
        }
      }
      r.x = e.px - e.w / 2;
      r.y = e.py - e.h;
      this._enemyPlayerHit(g, e, r, dt, pRect);
    }

    /* watcher: stationary, aims at the player, fires aimed bolts */
    _updateWatcher(g, e, r, dt, pRect) {
      const p = g.player;
      if (p && p.alive) e.dir = p.x > e.px ? 1 : -1;
      e.watcherT = (e.watcherT || 0) + dt;
      if (e.watcherT >= e.period) {
        e.watcherT = 0;
        e.flash = 0.35;
        g.Sound.shoot();
        const cx = e.px;
        const cy = e.py - e.h / 2;
        const sp = e.speed || 200;
        const a = p && p.alive ? Math.atan2(p.y - cy, p.x - cx) : 0;
        g.level.projectiles.push({
          x: cx,
          y: cy,
          dir: e.dir,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          speed: sp,
          r: 7,
          kind: "watcher",
        });
        g.fx.spawnBurst(cx, cy, "muzzle", 6);
      }
      this._enemyPlayerHit(g, e, r, dt, pRect);
    }

    _enemyPlayerHit(g, e, r, dt, pRect) {
      if (!pRect) return;
      if (this._overlap(r, pRect)) {
        const p = g.player;
        const stomping =
          p.vy > 0 && p.rect().y + p.rect().h - p.vy * dt * 2 <= r.y + 10;
        if (stomping && !p.invuln) {
          e.dead = true;
          e.deadTimer = 0;
          p.vy = -380;
          g.fx.hitStop(0.05);
          g.Sound.stomp();
          g.fx.spawnBurst(e.px, e.py - e.h / 2, "enemyPop", 18);
          g.fx.shake(5);
        } else if (!p.invuln) {
          g.player.die();
        }
      }
    }

    _enemyRect(e) {
      if (e.px === undefined) {
        e.px = e.x * TS + TS / 2;
        e.py = e.y * TS;
        e.vy = 0;
      }
      return { x: e.px - e.w / 2, y: e.py - e.h, w: e.w, h: e.h };
    }

    _overlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    /* ---------------- turrets ---------------- */
    updateTurrets(g, dt) {
      for (const t of g.level.turrets) {
        t.flash = Math.max(0, t.flash - dt);
        t.timer += dt;
        if (t.timer >= t.period) {
          t.timer = 0;
          t.flash = t.flashTime;
          g.Sound.shoot();
          const py = t.y * TS - TS / 2; // body height above the base
          g.level.projectiles.push({
            x: t.x * TS + TS / 2 + (t.dir > 0 ? 20 : -20),
            y: py,
            dir: t.dir,
            vx: t.dir * t.speed,
            vy: 0,
            speed: t.speed,
            r: 7,
            kind: "turret",
          });
          g.fx.spawnBurst(g.level.projectiles[g.level.projectiles.length - 1].x, py, "muzzle", 6);
        }
      }
    }

    updateProjectiles(g, dt) {
      const list = g.level.projectiles;
      const sh = g.shadow;
      const sRect = sh && sh.visible ? sh.rect() : null;
      for (let i = list.length - 1; i >= 0; i--) {
        const pr = list[i];
        pr.x += (pr.vx || 0) * dt;
        pr.y += (pr.vy || 0) * dt;

        const rect = { x: pr.x - pr.r, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 };
        // walls
        const tx = Math.floor(pr.x / TS);
        const ty = Math.floor(pr.y / TS);
        const idx = g.level.idx(tx, ty);
        const blocked =
          idx >= 0 &&
          (g.level.solid[idx] ||
            (g.level.doorTiles[idx] >= 0 && !g.level.doors[g.level.doorTiles[idx]].open) ||
            (g.level.gateTiles[idx] >= 0 && !g.level.gates[g.level.gateTiles[idx]].active) ||
            (g.level.fragileMap[idx] >= 0 && g.level.fragile[g.level.fragileMap[idx]].state < 3) ||
            g.level.platformTiles[idx] >= 0);
        if (pr.x < -40 || pr.x > g.level.wPx + 40 || pr.y < -40 || pr.y > g.level.hPx + 40 || blocked) {
          g.fx.spawnBurst(pr.x, pr.y, "fizzle", 8);
          list.splice(i, 1);
          continue;
        }
        // shadow absorbs
        if (sRect && aabb(sRect, rect)) {
          g.Sound.projectileAbsorb();
          g.fx.spawnBurst(pr.x, pr.y, "absorb", 12);
          g.fx.spawnRing(pr.x, pr.y, "#7ae0ff");
          list.splice(i, 1);
          continue;
        }
        // player hit
        const p = g.player;
        if (p && p.alive && !p.invuln) {
          const pr2 = p.rect();
          if (aabb(rect, pr2)) {
            g.player.die();
            list.splice(i, 1);
          }
        }
      }
    }
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  window.Entities = Entities;
})();
