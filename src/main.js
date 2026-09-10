/* Shadow Self — game loop, camera, particles, rendering, state machine */
(function () {
  "use strict";

  const TS = 32;
  const VIEW_H = 540;
  const STEP = 1 / 60;
  const DELAY_SECONDS = 2;

  const STORAGE_BEST = "shadowself.best";
  const STORAGE_UNLOCK = "shadowself.unlocked";

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function hash2(x, y) {
    let h = x * 374761393 + y * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  class Game {
    constructor() {
      this.canvas = document.getElementById("game");
      this.ctx = this.canvas.getContext("2d");
      this.Sound = window.Sound;

      this.state = "loading";
      this.level = null;
      this.player = null;
      this.shadow = null;
      this.entities = null;
      this.ui = new window.UI(this);
      this.levelCount = 0;
      this.currentLevel = 0;
      this.timer = 0;
      this.checkpointTime = 0;
      this.checkpoint = null;

      this.isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

      // input
      this.input = { left: false, right: false, jumpHeld: false, jumpDown: false, down: false };
      this.pointerX = 0;
      this.pointerY = 0;

      // fx
      this.particles = [];
      this.shakeMag = 0;
      this.flashColor = null;
      this.flashAmt = 0;
      this.hitStopT = 0;
      this.deathT = 0;
      this.winT = 0;

      // camera / view
      this.camX = 0;
      this.camY = 0;
      this.viewW = 960;
      this.viewH = VIEW_H;
      this._scale = 1;
      this._dpr = 1;
      this._cssW = 0;
      this._cssH = 0;

      this.time = 0;
      this.ambientT = 0;
      this._acc = 0;
      this._last = performance.now();

      this.bestTimes = this._loadBest();
      this.unlocked = this._loadUnlocked();

      // animate backdrop on menus
      this.menuT = 0;
    }

    /* ---------------- persistence ---------------- */
    _loadBest() {
      try {
        const v = JSON.parse(localStorage.getItem(STORAGE_BEST) || "null");
        if (Array.isArray(v)) return v;
      } catch (e) {}
      return [];
    }
    _saveBest() {
      try {
        localStorage.setItem(STORAGE_BEST, JSON.stringify(this.bestTimes));
      } catch (e) {}
    }
    _loadUnlocked() {
      try {
        const v = parseInt(localStorage.getItem(STORAGE_UNLOCK), 10);
        if (!isNaN(v)) return v;
      } catch (e) {}
      return 0;
    }
    _saveUnlocked() {
      try {
        localStorage.setItem(STORAGE_UNLOCK, String(this.unlocked));
      } catch (e) {}
    }

    /* ---------------- state ---------------- */
    setState(s) {
      this.state = s;
      if (s === "menu") this.menuT = 0;
      if (s === "playing") {
        this.Sound.setEnabled(this.Sound.enabled);
      }
    }

    startSelect() {
      this.ui.selectPage = 0;
      this.setState("select");
    }

    startLevel(i) {
      if (i > this.unlocked) return;
      this.currentLevel = i;
      this.buildLevel();
      this.setState("playing");
      this.ui.showHint(6);
    }

    buildLevel() {
      const idx = this.currentLevel;
      this.level = window.Levels.build(idx);
      this.levelCount = window.Levels.count();
      this.player = new window.Player(this, this.level.spawn);
      this.shadow = new window.ShadowSystem(this);
      this.entities = new window.Entities(this);
      this.checkpoint = null;
      this.checkpointTime = 0;
      this.timer = 0;
      this.particles = [];
      this.shakeMag = 0;
      this.flashAmt = 0;
      this.hitStopT = 0;
      this.camX = this._clampCamX(this.player.x - this.viewW / 2);
      this.camY = this.level.hPx - this.viewH + 24;
      if (this.camY < 0) this.camY = 0;
    }

    restartLevel() {
      this.buildLevel();
      this.setState("playing");
      this.ui.showHint(4);
    }

    resume() {
      if (this.state === "paused") this.setState("playing");
      this.Sound.init();
    }

    onPlayerDeath() {
      if (this.state !== "playing") return;
      this.state = "dying";
      this.deathT = 0;
    }

    onWin() {
      if (this.state !== "playing") return;
      this.state = "win";
      this.winT = 0;
      this.Sound.win();
      this.fx.spawnBurst(this.player.x, this.player.y, "confetti", 70);
      const n = this.currentLevel;
      if (this.bestTimes[n] === null || this.bestTimes[n] === undefined || this.timer < this.bestTimes[n]) {
        this.bestTimes[n] = this.timer;
        this._saveBest();
      }
      if (n === this.unlocked && n + 1 < this.levelCount) {
        this.unlocked = n + 1;
        this._saveUnlocked();
      }
    }

    /* ---------------- fixed-step world update ---------------- */
    updateFixed(dt) {
      if (this.state === "playing") {
        this.timer += dt;
        if (this.hitStopT > 0) {
          this.hitStopT -= dt;
          return;
        }
        this._updateWorld(dt);
      } else if (this.state === "dying") {
        this.deathT += dt;
        if (this.deathT > 1.0) this.restartLevel();
      } else if (this.state === "win") {
        this.winT += dt;
      }
    }

    _updateWorld(dt) {
      const p = this.player;
      this.entities.updatePlatforms(dt);
      p.update(dt, this.input);
      if (p.alive && this.state === "playing") {
        const old = this.shadow.record({
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          onGround: p.onGround,
          facing: p.facing,
        });
        this.shadow.update(dt, old);
        this.entities.update(dt);
      } else {
        this.shadow.update(dt, null);
      }
      this.input.jumpDown = false;

      // camera
      const target = p.x + p.facing * 46 - this.viewW / 2;
      const targetClamped = this._clampCamX(target);
      this.camX = lerp(this.camX, targetClamped, Math.min(1, dt * 7));
      this.camY = this.level.hPx - this.viewH + 24;
      if (this.camY < 0) this.camY = 0;
    }

    _clampCamX(x) {
      if (!this.level) return x;
      if (this.level.wPx <= this.viewW) return -(this.viewW - this.level.wPx) / 2;
      return clamp(x, 0, this.level.wPx - this.viewW);
    }

    /* ---------------- per-frame fx update (render rate) ---------------- */
    updateFree(dt) {
      this.time += dt;
      this.menuT += dt;
      this.ambientT += dt;
      this.shakeMag = Math.max(0, this.shakeMag - dt * 30);
      this.flashAmt = Math.max(0, this.flashAmt - dt * 1.6);
      this.ui.update(dt);

      // particles
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const pt = ps[i];
        pt.life -= dt;
        if (pt.life <= 0) {
          ps.splice(i, 1);
          continue;
        }
        pt.vy += pt.grav * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.rot += pt.vr * dt;
        if (pt.drag) {
          pt.vx *= 1 - pt.drag * dt;
          pt.vy *= 1 - pt.drag * dt;
        }
      }
    }

    /* ---------------- fx API (used by entities/player) ---------------- */
    fx = {
      spawnBurst: (x, y, type, count) => this._burst(x, y, type, count),
      spawnRing: (x, y, color) => this._ring(x, y, color),
      shake: (m) => (this.shakeMag = Math.max(this.shakeMag, m)),
      flash: (color, amt) => {
        this.flashColor = color;
        this.flashAmt = Math.max(this.flashAmt, amt);
      },
      hitStop: (s) => (this.hitStopT = Math.max(this.hitStopT, s)),
    };

    _burst(x, y, type, count) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 160;
        const p = {
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (type === "confetti" ? 80 : 40),
          life: 0.4 + Math.random() * 0.6,
          maxLife: 1,
          size: 2 + Math.random() * 4,
          color: this._burstColor(type),
          grav: type === "shard" || type === "confetti" ? 900 : type === "dust" || type === "land" ? -60 : 300,
          drag: 1.5,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 12,
          shape: type === "shard" || type === "confetti" ? "rect" : "circle",
          additive: type === "plate" || type === "gate" || type === "materialize" || type === "absorb" || type === "death" || type === "spark",
        };
        this.particles.push(p);
      }
    }

    _burstColor(type) {
      switch (type) {
        case "jump":
        case "land":
        case "respawn":
          return "rgba(180,210,255,0.7)";
        case "dust":
          return "rgba(160,185,230,0.5)";
        case "plate":
          return "rgba(110,247,192,0.9)";
        case "gate":
          return "rgba(122,224,255,0.9)";
        case "crack":
          return "rgba(200,210,235,0.8)";
        case "shard":
          return "rgba(170,180,215,0.9)";
        case "doorOpen":
          return "rgba(56,232,255,0.8)";
        case "doorClose":
          return "rgba(255,95,122,0.8)";
        case "enemyPop":
          return "rgba(255,107,107,0.9)";
        case "death":
          return "rgba(255,95,122,0.95)";
        case "materialize":
        case "absorb":
        case "muzzle":
        case "fizzle":
          return "rgba(150,190,255,0.9)";
        case "checkpoint":
          return "rgba(255,209,102,0.95)";
        case "key":
        case "lockOpen":
          return "rgba(255,209,102,0.95)";
        case "spring":
          return "rgba(159,247,255,0.9)";
        case "confetti": {
          const c = ["#ff5f7a", "#37e5ff", "#ffd166", "#6ef7c0", "#b78bff", "#ff9d6b"];
          return c[(Math.random() * c.length) | 0];
        }
        default:
          return "rgba(200,220,255,0.8)";
      }
    }

    _ring(x, y, color) {
      this.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        life: 0.5,
        maxLife: 0.5,
        size: 6,
        color: color || "#7aa2ff",
        grav: 0,
        drag: 0,
        rot: 0,
        vr: 0,
        shape: "ring",
        additive: true,
      });
    }

    /* ---------------- render ---------------- */
    render(alpha) {
      const ctx = this.ctx;
      const w = this._cssW;
      const h = this._cssH;
      if (w === 0 || h === 0) return;

      ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);

      const view = {
        x: this.camX,
        y: this.camY,
        w: this.viewW,
        h: this.viewH,
        cx: this.camX + this.viewW / 2,
        cy: this.camY + this.viewH / 2,
      };

      // background (screen space)
      this._drawBackground(ctx, w, h);

      // world transform
      const shX = (Math.random() - 0.5) * this.shakeMag;
      const shY = (Math.random() - 0.5) * this.shakeMag;
      ctx.setTransform(
        this._dpr * this._scale,
        0,
        0,
        this._dpr * this._scale,
        (-this.camX + shX) * this._dpr * this._scale,
        (-this.camY + shY) * this._dpr * this._scale
      );

      if (this.level) {
        this._drawLevel(ctx, view);
        if (this.state === "playing" || this.state === "paused" || this.state === "dying" || this.state === "win") {
          this._drawEntities(ctx);
          this._drawShadow(ctx, alpha);
          if (this.player) this.player.draw(ctx, {});
        }
      }

      // particles (world space)
      this._drawParticles(ctx);

      // UI — drawn in view space so it anchors/centers on the viewport
      ctx.setTransform(
        this._dpr * this._scale,
        0,
        0,
        this._dpr * this._scale,
        (-this.camX) * this._dpr * this._scale,
        (-this.camY) * this._dpr * this._scale
      );
      this.ui.draw(ctx, view);

      // foreground vignette (screen space)
      ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      this._drawVignette(ctx, w, h);

      // flash
      if (this.flashAmt > 0) {
        ctx.globalAlpha = Math.min(1, this.flashAmt);
        ctx.fillStyle = this.flashColor || "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }

    _drawBackground(ctx, w, h) {
      // sky
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#060918");
      g.addColorStop(0.55, "#0d1430");
      g.addColorStop(1, "#1a2350");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // stars
      const starCount = 90;
      ctx.fillStyle = "#cfe4ff";
      for (let i = 0; i < starCount; i++) {
        const sx = hash2(i, 7) * w;
        const sy = hash2(i, 13) * h * 0.55;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 1.5 + i));
        ctx.globalAlpha = 0.25 + 0.5 * tw;
        const r = hash2(i, 31) * 1.4 + 0.4;
        ctx.fillRect(sx, sy, r, r);
      }
      ctx.globalAlpha = 1;

      // moon
      const mx = w * 0.8;
      const my = h * 0.16;
      const mg = ctx.createRadialGradient(mx, my, 8, mx, my, 90);
      mg.addColorStop(0, "rgba(230,240,255,0.9)");
      mg.addColorStop(0.25, "rgba(200,220,255,0.35)");
      mg.addColorStop(1, "rgba(200,220,255,0)");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#dfe9ff";
      ctx.beginPath();
      ctx.arc(mx, my, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(180,200,235,0.7)";
      ctx.beginPath();
      ctx.arc(mx - 8, my - 5, 5, 0, Math.PI * 2);
      ctx.arc(mx + 7, my + 6, 4, 0, Math.PI * 2);
      ctx.arc(mx + 3, my - 10, 3, 0, Math.PI * 2);
      ctx.fill();

      // parallax ridges
      this._ridge(ctx, w, h, 0.18, h * 0.62, 30, "#101735", 1);
      this._ridge(ctx, w, h, 0.34, h * 0.72, 48, "#161e40", 2);
      this._ridge(ctx, w, h, 0.55, h * 0.84, 60, "#1d2750", 3);
    }

    _ridge(ctx, w, h, par, baseY, amp, color, seed) {
      const off = -this.camX * par + this.camX * 0.5 * par + this.camX * 0;
      const px0 = off;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 80; x += 24) {
        const wx = x - off;
        const n =
          Math.sin(wx * 0.008 + seed * 9) * 0.6 +
          Math.sin(wx * 0.021 + seed * 3) * 0.3 +
          Math.sin(wx * 0.043 + seed * 7) * 0.1;
        const y = baseY + amp * n;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      void px0;
    }

    _drawVignette(ctx, w, h) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,10,0.5)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    /* ---------------- level / entities rendering ---------------- */
    _drawLevel(ctx, view) {
      const lvl = this.level;
      const tx0 = Math.max(0, Math.floor(view.x / TS) - 1);
      const tx1 = Math.min(lvl.width - 1, Math.ceil((view.x + view.w) / TS) + 1);
      const ty0 = Math.max(0, Math.floor(view.y / TS) - 1);
      const ty1 = Math.min(lvl.height - 1, Math.ceil((view.y + view.h) / TS) + 1);

      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const i = ty * lvl.width + tx;
          const x = tx * TS;
          const y = ty * TS;
          if (lvl.solid[i]) {
            this._drawSolidTile(ctx, tx, ty, x, y);
          } else if (lvl.oneWay[i]) {
            this._drawOneWay(ctx, x, y);
          } else if (lvl.spike[i]) {
            this._drawSpike(ctx, x, y);
          }
          const di = lvl.doorTiles[i];
          if (di >= 0) this._drawDoor(ctx, lvl.doors[di], x, y);
          const gi = lvl.gateTiles[i];
          if (gi >= 0) this._drawGate(ctx, lvl.gates[gi], x, y);
          const fi = lvl.fragileMap[i];
          if (fi >= 0 && lvl.fragile[fi].state < 3) this._drawFragile(ctx, lvl.fragile[fi], x, y);
        }
      }

      // checkpoints
      for (const cp of lvl.checkpoints) {
        this._drawCheckpoint(ctx, cp);
      }
      // goal
      this._drawGoal(ctx, lvl.goal);
      // plates
      for (const p of lvl.plates) this._drawPlate(ctx, p);
      // gate projectors
      for (const g of lvl.gates) this._drawGateProjector(ctx, g);
      // springs
      for (const sp of lvl.springs) this._drawSpring(ctx, sp);
      // keys
      for (const k of lvl.keys) if (!k.taken) this._drawKey(ctx, k);
      // moving platforms
      for (const pf of lvl.platforms) this._drawPlatform(ctx, pf);
    }

    _drawSolidTile(ctx, tx, ty, x, y) {
      ctx.fillStyle = "#20294e";
      ctx.fillRect(x, y, TS, TS);
      // top face
      ctx.fillStyle = "#2c3764";
      ctx.fillRect(x, y, TS, 4);
      ctx.fillStyle = "#3a4a7e";
      ctx.fillRect(x, y, TS, 1.5);
      // subtle border
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x, y + TS - 2, TS, 2);
      // speckles
      const h1 = hash2(tx, ty);
      if (h1 > 0.55) {
        ctx.fillStyle = "rgba(90,120,200,0.18)";
        ctx.fillRect(x + 6 + h1 * 18, y + 10 + (h1 * 20) % 14, 3, 3);
        ctx.fillRect(x + 18 - h1 * 8, y + 20 + (h1 * 12) % 8, 2, 2);
      }
      // face sheen
      if (ty > 0 && !this.level.solid[(ty - 1) * this.level.width + tx]) {
        ctx.fillStyle = "rgba(122,224,255,0.06)";
        ctx.fillRect(x, y, TS, TS);
      }
    }

    _drawOneWay(ctx, x, y) {
      ctx.fillStyle = "rgba(46,60,110,0.9)";
      ctx.fillRect(x, y, TS, 7);
      ctx.fillStyle = "#3a4a7e";
      ctx.fillRect(x, y, TS, 2);
      // supports
      ctx.fillStyle = "rgba(46,60,110,0.5)";
      ctx.fillRect(x + 3, y + 7, 3, 8);
      ctx.fillRect(x + TS - 6, y + 7, 3, 8);
    }

    _drawSpike(ctx, x, y) {
      ctx.save();
      const g = ctx.createLinearGradient(x, y + TS, x, y);
      g.addColorStop(0, "#7a1e33");
      g.addColorStop(1, "#ff5f7a");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + TS);
      ctx.lineTo(x + TS / 2, y + 6);
      ctx.lineTo(x + TS - 2, y + TS);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,180,195,0.8)";
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 12);
      ctx.lineTo(x + 14, y + TS);
      ctx.lineTo(x + 18, y + TS);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    _drawDoor(ctx, d, x, y) {
      const key = !!d.key;
      const main = key ? "255,209,102" : "255,95,122";
      const bright = key ? "255,236,170" : "159,247,255";
      if (d.open) {
        // open frame
        ctx.fillStyle = `rgba(${main},0.06)`;
        ctx.fillRect(x, y, TS, TS);
        ctx.fillStyle = `rgba(${main},0.5)`;
        ctx.fillRect(x, y, 2, TS);
        ctx.fillRect(x + TS - 2, y, 2, TS);
        if (Math.sin(this.time * 4 + x * 0.3) > 0.85) {
          ctx.fillStyle = bright;
          ctx.fillRect(x + TS / 2 - 1, y + 6, 2, 4);
        }
      } else {
        // closed energy wall
        ctx.fillStyle = "rgba(40,18,8,0.55)";
        ctx.fillRect(x, y, TS, TS);
        const grd = ctx.createLinearGradient(x, y, x, y + TS);
        grd.addColorStop(0, `rgba(${main},0.55)`);
        grd.addColorStop(1, `rgba(${main},0.18)`);
        ctx.fillStyle = grd;
        ctx.fillRect(x, y, TS, TS);
        ctx.strokeStyle = `rgba(${main},0.8)`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1);
        // pulsing core
        const pu = 0.5 + 0.5 * Math.sin(this.time * 3 + x);
        ctx.fillStyle = `rgba(${main},${0.2 + pu * 0.25})`;
        ctx.fillRect(x + 6, y + 6, TS - 12, TS - 12);
        // keyhole on key doors
        if (key) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,240,190,0.9)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(x + TS / 2, y + TS / 2 - 4, 3.4, 0, Math.PI * 2);
          ctx.moveTo(x + TS / 2, y + TS / 2 - 0.6);
          ctx.lineTo(x + TS / 2, y + TS / 2 + 6);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    _drawGateProjector(ctx, g) {
      const pr = g.projector.rect;
      const x = pr.x;
      const y = pr.y;
      const w = pr.w;
      const h = pr.h;
      const gx = g.rect.x + g.rect.w / 2;
      const gy = g.rect.y + g.rect.h;
      const on = g.active;
      ctx.save();
      // light beam toward the gate
      const grad = ctx.createLinearGradient(x + w / 2, y, gx, gy);
      grad.addColorStop(0, on ? "rgba(122,224,255,0.4)" : "rgba(122,224,255,0.16)");
      grad.addColorStop(1, "rgba(122,224,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + w - 2, y);
      ctx.lineTo(gx + 5, gy);
      ctx.lineTo(gx - 5, gy);
      ctx.closePath();
      ctx.fill();
      // projector pad
      ctx.shadowColor = "#7ae0ff";
      ctx.shadowBlur = on ? 16 : 8;
      ctx.fillStyle = on ? "rgba(122,224,255,0.9)" : "rgba(60,90,140,0.55)";
      ctx.fillRect(x + 1, y, w - 2, h);
      ctx.fillStyle = on ? "rgba(220,250,255,0.95)" : "rgba(150,180,220,0.4)";
      ctx.fillRect(x + 1, y, w - 2, 2);
      ctx.restore();
    }

    _drawGate(ctx, ga, x, y) {
      if (ga.active) {
        // open passage
        ctx.fillStyle = "rgba(90,190,255,0.05)";
        ctx.fillRect(x, y, TS, TS);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(90,190,255,0.3)";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
        ctx.setLineDash([]);
        if (Math.sin(this.time * 5 + x * 0.5) > 0.8) {
          ctx.fillStyle = "rgba(159,247,255,0.7)";
          ctx.fillRect(x + TS / 2 - 1, y + 4, 2, 4);
        }
      } else {
        // closed barrier
        const a = 0.5 + Math.sin(this.time * 4 + x) * 0.12;
        ctx.fillStyle = "rgba(20,50,80,0.6)";
        ctx.fillRect(x, y, TS, TS);
        const grd = ctx.createLinearGradient(x, y, x + TS, y);
        grd.addColorStop(0, `rgba(90,170,255,${0.4 + a * 0.2})`);
        grd.addColorStop(1, `rgba(56,120,220,${0.2 + a * 0.2})`);
        ctx.fillStyle = grd;
        ctx.fillRect(x, y, TS, TS);
        ctx.strokeStyle = "rgba(122,200,255,0.7)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1);
        // shimmer lines
        ctx.strokeStyle = `rgba(180,230,255,${0.2 + a * 0.3})`;
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 6);
        ctx.lineTo(x + TS - 6, y + 6);
        ctx.moveTo(x + 6, y + TS - 6);
        ctx.lineTo(x + TS - 6, y + TS - 6);
        ctx.stroke();
      }
    }

    _drawFragile(ctx, f, x, y) {
      ctx.fillStyle = "#454e6e";
      ctx.fillRect(x, y, TS, TS);
      ctx.fillStyle = "#5a6488";
      ctx.fillRect(x, y, TS, 3);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(x, y + TS - 2, TS, 2);
      if (f.state === 1 || f.state === 2) {
        ctx.strokeStyle = "rgba(190,205,235,0.85)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 8);
        ctx.lineTo(x + 14, y + 14);
        ctx.lineTo(x + 10, y + 24);
        ctx.moveTo(x + 26, y + 6);
        ctx.lineTo(x + 20, y + 18);
        ctx.lineTo(x + 26, y + 28);
        ctx.moveTo(x + 14, y + 14);
        ctx.lineTo(x + 22, y + 10);
        ctx.stroke();
        // shake when breaking
        if (f.state === 2) {
          const sh = Math.sin(this.time * 40) * 1.5;
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.fillRect(x + 6 + sh, y + 2, 4, 2);
        }
      }
    }

    _drawCheckpoint(ctx, cp) {
      const x = cp.x * TS;
      const y = cp.y * TS;
      ctx.save();
      ctx.fillStyle = "rgba(20,28,60,0.9)";
      ctx.fillRect(x - 6, y - 8, 12, 8);
      if (cp.activated) {
        ctx.shadowColor = "#ffd166";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#ffd166";
      } else {
        ctx.shadowColor = "#5a6a92";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "#5a6a92";
      }
      ctx.beginPath();
      ctx.arc(x, y - 12, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    _drawGoal(ctx, goal) {
      const x = goal.x * TS;
      const y = goal.y * TS;
      ctx.save();
      ctx.shadowColor = "#ffd166";
      ctx.shadowBlur = 22 + Math.sin(this.time * 3) * 6;
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 18, y - 4);
      ctx.lineTo(x - 18, y - 52);
      ctx.quadraticCurveTo(x - 18, y - 64, x, y - 64);
      ctx.quadraticCurveTo(x + 18, y - 64, x + 18, y - 52);
      ctx.lineTo(x + 18, y - 4);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,209,102,0.4)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 12, y - 14, 24, 12);
      ctx.fillStyle = "rgba(255,209,102,0.15)";
      ctx.fillRect(x - 12, y - 14, 24, 12);
      // sparkle
      if (Math.sin(this.time * 5) > 0.4) {
        ctx.fillStyle = "#fff6d8";
        ctx.beginPath();
        ctx.arc(x + Math.sin(this.time * 7) * 10, y - 40 + Math.cos(this.time * 9) * 8, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    _drawPlate(ctx, p) {
      const pressed = p.pressed;
      const x = p.x * TS;
      const y = p.y * TS;
      const col = p.playerOnly ? "176,113,255" : p.shadowOnly ? "122,160,255" : "110,247,192";
      const lit = p.playerOnly ? "#b071ff" : p.shadowOnly ? "#7aa0ff" : "#6ef7c0";
      ctx.save();
      if (pressed) {
        ctx.shadowColor = lit;
        ctx.shadowBlur = 18;
        ctx.fillStyle = `rgba(${col},0.9)`;
        ctx.fillRect(x + 2, y - 6, p.w * TS - 4, 5);
        ctx.fillStyle = "rgba(220,240,255,0.9)";
        ctx.fillRect(x + 2, y - 6, p.w * TS - 4, 2);
      } else {
        ctx.fillStyle = "rgba(60,90,140,0.5)";
        ctx.fillRect(x + 2, y - 5, p.w * TS - 4, 4);
      }
      // rim
      ctx.strokeStyle = pressed ? `rgba(${col},0.8)` : "rgba(90,130,200,0.4)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 2, y - 6, p.w * TS - 4, 5);
      ctx.restore();
    }

    _drawSpring(ctx, sp) {
      const x = sp.x * TS;
      const y = sp.y * TS;
      const c = sp.cool > 0 ? Math.min(1, sp.cool / 0.35) : 0; // compression 0..1
      ctx.save();
      const padY = y - 10 + c * 12;
      // coil between the pad and the base
      ctx.strokeStyle = "rgba(122,224,255,0.85)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const yy = padY + 6 + i * 4;
        if (yy > y - 2) break;
        ctx.beginPath();
        ctx.moveTo(x + 6, yy);
        ctx.lineTo(x + TS - 6, yy);
        ctx.stroke();
      }
      // base
      ctx.fillStyle = "#2a3760";
      ctx.fillRect(x + 3, y - 2, TS - 6, 4);
      // pad
      ctx.fillStyle = "#4a5a8e";
      ctx.fillRect(x + 3, padY, TS - 6, 7);
      ctx.fillStyle = "#9ff7ff";
      ctx.fillRect(x + 3, padY, TS - 6, 2);
      ctx.restore();
    }

    _drawKey(ctx, k) {
      const x = k.x * TS + TS / 2;
      const y = k.y * TS + TS / 2;
      const bob = Math.sin(this.time * 3 + k.t) * 4;
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.shadowColor = "#ffd166";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(-6, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(0, -2, 12, 4);
      ctx.fillRect(7, 2, 3, 5);
      ctx.fillRect(4, 2, 3, 3);
      ctx.restore();
      if (Math.sin(this.time * 6 + k.t * 2) > 0.55) {
        ctx.save();
        ctx.fillStyle = "#fff6d8";
        ctx.beginPath();
        ctx.arc(x + 6 + Math.sin(this.time * 8 + k.t) * 4, y + bob - 10, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    _drawPlatform(ctx, pf) {
      const x = pf.rect.x;
      const y = pf.rect.y;
      const w = pf.rect.w;
      const h = pf.rect.h;
      ctx.save();
      ctx.fillStyle = "#2c3764";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#3a4a7e";
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = "rgba(122,224,255,0.25)";
      ctx.fillRect(x, y + h - 2, w, 2);
      ctx.shadowColor = "#37e5ff";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "rgba(56,232,255,0.85)";
      const gl = x + (Math.sin(this.time * 3) * 0.5 + 0.5) * (w - 14);
      ctx.fillRect(gl, y + h - 8, 14, 4);
      ctx.shadowBlur = 0;
      if (Math.abs(pf.dx) > 0.3 || Math.abs(pf.dy) > 0.3) {
        ctx.strokeStyle = "rgba(159,247,255,0.9)";
        ctx.lineWidth = 2;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const a = Math.atan2(pf.dy, pf.dx);
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10);
        ctx.lineTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawEntities(ctx) {
      const lvl = this.level;
      // turrets
      for (const t of lvl.turrets) this._drawTurret(ctx, t);
      // projectiles
      for (const pr of lvl.projectiles) this._drawProjectile(ctx, pr);
      // enemies
      for (const e of lvl.enemies) this._drawEnemy(ctx, e);
    }

    _drawTurret(ctx, t) {
      const baseY = t.y * TS; // base row top
      const facing = t.dir;
      ctx.save();
      // base mount
      ctx.fillStyle = "#22103a";
      roundRect(ctx, t.x * TS + 2, baseY - 30, TS - 4, 30, 6);
      ctx.fill();
      // barrel
      const bx = t.x * TS + TS / 2;
      const by = baseY - 20;
      ctx.strokeStyle = "#3a1457";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + facing * 22, by);
      ctx.stroke();
      // core
      const charge = Math.min(1, t.timer / t.period);
      if (t.flash > 0) {
        ctx.shadowColor = "#ff7ae0";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "#ffe0f6";
      } else {
        ctx.fillStyle = `rgba(255,122,224,${0.4 + charge * 0.5})`;
      }
      ctx.beginPath();
      ctx.arc(bx, by, 5.5, 0, Math.PI * 2);
      ctx.fill();
      // telegraph when about to fire
      if (charge > 0.72) {
        ctx.fillStyle = "rgba(255,122,224,0.18)";
        ctx.fillRect(bx + facing * 8, by - 5, facing * (t.speed * 0.25), 10);
      }
      ctx.restore();
    }

    _drawProjectile(ctx, pr) {
      ctx.save();
      const col = pr.kind === "watcher" ? "#ffb347" : "#ff7ae0";
      const inner = pr.kind === "watcher" ? "#fff3e0" : "#fff0fa";
      ctx.shadowColor = col;
      ctx.shadowBlur = 16;
      const g = ctx.createRadialGradient(pr.x, pr.y, 1, pr.x, pr.y, pr.r);
      g.addColorStop(0, inner);
      g.addColorStop(0.4, col);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    _drawEnemy(ctx, e) {
      if (e.dead) {
        if (e.deadTimer < 0.4) {
          ctx.globalAlpha = Math.max(0, 1 - e.deadTimer * 2.5);
          ctx.fillStyle = "rgba(255,107,107,0.8)";
          ctx.beginPath();
          ctx.arc(e.px, e.py - e.h / 2, 12 * (1 - e.deadTimer * 2), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        return;
      }
      if (e.type === "chaser") return this._drawChaser(ctx, e);
      if (e.type === "flyer") return this._drawFlyer(ctx, e);
      if (e.type === "watcher") return this._drawWatcher(ctx, e);
      this._drawWalker(ctx, e);
    }

    _drawWalker(ctx, e) {
      const x = e.px - e.w / 2;
      const y = e.py - e.h;
      const bob = Math.abs(Math.sin(e.walk)) * 2;
      ctx.save();
      ctx.translate(e.px, e.py);
      ctx.shadowColor = "rgba(255,80,80,0.5)";
      ctx.shadowBlur = e.flash > 0 ? 20 : 10;
      // legs
      ctx.strokeStyle = "#5a1018";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      const sw = Math.sin(e.walk * 2) * 6;
      ctx.beginPath();
      ctx.moveTo(-7, -e.h + 12 - bob);
      ctx.lineTo(-7 + sw, -4);
      ctx.moveTo(7, -e.h + 12 - bob);
      ctx.lineTo(7 - sw, -4);
      ctx.stroke();
      // body
      ctx.fillStyle = "#b3242b";
      roundRect(ctx, -e.w / 2, -e.h + 6 - bob, e.w, e.h - 10, 8);
      ctx.fill();
      ctx.fillStyle = "#8c1a22";
      roundRect(ctx, -e.w / 2, -e.h + 6 - bob, e.w, 8, 4);
      ctx.fill();
      // head
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(0, -e.h + 4 - bob, 9, 0, Math.PI * 2);
      ctx.fill();
      // angry eyes
      ctx.fillStyle = "#1a0508";
      ctx.beginPath();
      ctx.arc(-4, -e.h + 3 - bob, 2.2, 0, Math.PI * 2);
      ctx.arc(4, -e.h + 3 - bob, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd0d0";
      ctx.beginPath();
      ctx.arc(-4.6, -e.h + 2.4 - bob, 0.8, 0, Math.PI * 2);
      ctx.arc(3.4, -e.h + 2.4 - bob, 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    _drawChaser(ctx, e) {
      const bob = Math.abs(Math.sin(e.walk)) * 3;
      ctx.save();
      ctx.translate(e.px, e.py);
      ctx.scale(e.dir === 0 ? 1 : e.dir, 1);
      ctx.shadowColor = "rgba(122,60,255,0.5)";
      ctx.shadowBlur = e.flash > 0 ? 20 : 10;
      // spikes
      ctx.fillStyle = "#9b5cff";
      for (let i = 0; i < 3; i++) {
        const sx = -e.w / 2 + 4 + i * 9;
        ctx.beginPath();
        ctx.moveTo(sx, -e.h + 8 - bob);
        ctx.lineTo(sx + 5, -e.h - 4 - bob);
        ctx.lineTo(sx + 10, -e.h + 8 - bob);
        ctx.closePath();
        ctx.fill();
      }
      // body
      ctx.fillStyle = "#7b2bd6";
      roundRect(ctx, -e.w / 2, -e.h + 8 - bob, e.w, e.h - 10, 6);
      ctx.fill();
      ctx.fillStyle = "#5a1da8";
      roundRect(ctx, -e.w / 2, -e.h + 8 - bob, e.w, 6, 3);
      ctx.fill();
      // head + eye
      ctx.fillStyle = "#c79bff";
      ctx.beginPath();
      ctx.arc(e.dir * 8, -e.h + 4 - bob, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a0b33";
      ctx.beginPath();
      ctx.arc(e.dir * 10, -e.h + 3 - bob, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    _drawFlyer(ctx, e) {
      const flap = Math.sin(this.time * 12 + e.idx);
      ctx.save();
      ctx.translate(e.px, e.py);
      ctx.scale(e.dir === 0 ? 1 : e.dir, 1);
      ctx.shadowColor = "rgba(60,200,255,0.45)";
      ctx.shadowBlur = e.flash > 0 ? 18 : 8;
      ctx.fillStyle = "#2a3f6e";
      ctx.save();
      ctx.rotate(-flap * 0.8);
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.quadraticCurveTo(14, -18 - flap * 6, 22, -4 - flap * 4);
      ctx.lineTo(10, -2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.rotate(flap * 0.8);
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.quadraticCurveTo(-14, -18 - flap * 6, -22, -4 - flap * 4);
      ctx.lineTo(-10, -2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // body
      ctx.fillStyle = "#1c2c52";
      ctx.beginPath();
      ctx.ellipse(0, -6, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // ears
      ctx.fillStyle = "#c07bff";
      ctx.beginPath();
      ctx.moveTo(-5, -14);
      ctx.lineTo(-3, -20);
      ctx.lineTo(-1, -13);
      ctx.moveTo(5, -14);
      ctx.lineTo(3, -20);
      ctx.lineTo(1, -13);
      ctx.fill();
      // eyes
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(-3, -8, 1.6, 0, Math.PI * 2);
      ctx.arc(3, -8, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    _drawWatcher(ctx, e) {
      const cx = e.px;
      const cy = e.py - e.h / 2;
      const charge = Math.min(1, (e.watcherT || 0) / e.period);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.shadowColor = "rgba(255,179,71,0.5)";
      ctx.shadowBlur = e.flash > 0 ? 22 : 12;
      ctx.fillStyle = "#3a3152";
      ctx.beginPath();
      ctx.ellipse(0, 0, e.w / 2 + 2, e.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#241d38";
      ctx.fillRect(-e.w / 2 - 2, e.h / 2 - 3, e.w + 4, 5);
      // big eye tracking the player
      ctx.fillStyle = "#1a1430";
      ctx.beginPath();
      ctx.arc(e.dir * 4, -2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = charge > 0.72 ? "#ffb347" : "#ff8f4d";
      ctx.beginPath();
      ctx.arc(e.dir * 5, -2, 5 + charge * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff3e0";
      ctx.beginPath();
      ctx.arc(e.dir * 6, -3, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    _drawShadow(ctx, alpha) {
      if (this.shadow) this.shadow.draw(ctx, alpha);
    }

    _drawParticles(ctx) {
      const ps = this.particles;
      for (const pt of ps) {
        const a = Math.max(0, pt.life / pt.maxLife);
        ctx.save();
        ctx.globalAlpha = a;
        if (pt.additive) ctx.globalCompositeOperation = "lighter";
        if (pt.shape === "rect") {
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.rot);
          ctx.fillStyle = pt.color;
          ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size * 0.7);
        } else if (pt.shape === "ring") {
          const prog = 1 - pt.life / pt.maxLife;
          ctx.strokeStyle = pt.color;
          ctx.lineWidth = 3 * (1 - prog);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4 + prog * 34, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size * (0.5 + a * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    /* ---------------- resize ---------------- */
    resize() {
      const cssW = window.innerWidth;
      const cssH = window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
      this._dpr = dpr;
      this._cssW = cssW;
      this._cssH = cssH;
      this._scale = cssH / VIEW_H;
      this.viewW = cssW / this._scale;
      this.viewH = VIEW_H;
      if (this.level) {
        this.camY = this.level.hPx - this.viewH + 24;
        if (this.camY < 0) this.camY = 0;
        this.camX = this._clampCamX(this.camX);
      }
    }

    /* ---------------- boot ---------------- */
    async boot() {
      try {
        this.levelCount = await window.Levels.init();
      } catch (e) {
        document.body.innerHTML = "<div style='color:#fff;padding:40px;font-family:monospace'>" + "Failed to load level data: " + e.message + "</div>";
        return;
      }
      this.resize();
      window.addEventListener("resize", () => this.resize());
      window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 120));
      this._bindInput();
      this.setState("menu");
      requestAnimationFrame(this._frame);
    }

    _bindInput() {
      window.addEventListener("keydown", (e) => {
        const k = e.key;
        this.Sound.init();
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(k)) e.preventDefault();
        if (k === "ArrowLeft" || k === "a" || k === "A") this.input.left = true;
        if (k === "ArrowRight" || k === "d" || k === "D") this.input.right = true;
        if (k === "ArrowUp" || k === "w" || k === "W" || k === " ") {
          if (!this.input.jumpHeld) this.input.jumpDown = true;
          this.input.jumpHeld = true;
        }
        if (k === "ArrowDown" || k === "s" || k === "S") this.input.down = true;

        if (k === "Enter") {
          if (this.state === "menu") this.startSelect();
          else if (this.state === "select") this.startLevel(this.currentLevel);
          else if (this.state === "win" && this.currentLevel + 1 < this.levelCount) this.startLevel(this.currentLevel + 1);
        }
        if ((k === "p" || k === "P" || k === "Escape")) {
          if (this.state === "playing") this.setState("paused");
          else if (this.state === "paused") this.setState("playing");
        }
        if (k === "r" || k === "R") {
          if (this.state === "playing" || this.state === "paused" || this.state === "dying") this.restartLevel();
        }
        if (k === "m" || k === "M") {
          this.Sound.setEnabled(!this.Sound.enabled);
          this.Sound.uiClick();
        }
      });
      window.addEventListener("keyup", (e) => {
        const k = e.key;
        if (k === "ArrowLeft" || k === "a" || k === "A") this.input.left = false;
        if (k === "ArrowRight" || k === "d" || k === "D") this.input.right = false;
        if (k === "ArrowUp" || k === "w" || k === "W" || k === " ") this.input.jumpHeld = false;
        if (k === "ArrowDown" || k === "s" || k === "S") this.input.down = false;
      });

      // pointer for UI + swipe-jump
      let swipeStartY = 0;
      let swipeStartT = 0;
      this.canvas.addEventListener("pointerdown", (e) => {
        this.Sound.init();
        const wp = this._toWorld(e.clientX, e.clientY);
        this.pointerX = wp.x;
        this.pointerY = wp.y;
        if (this.state !== "playing") {
          if (!this.ui.click(wp.x, wp.y)) {
            // clicking empty space on menu → start
            if (this.state === "menu") this.startSelect();
            else if (this.state === "select") this.startLevel(this.unlocked);
          }
        }
        swipeStartY = e.clientY;
        swipeStartT = performance.now();
      });
      this.canvas.addEventListener("pointermove", (e) => {
        const wp = this._toWorld(e.clientX, e.clientY);
        this.pointerX = wp.x;
        this.pointerY = wp.y;
      });
      this.canvas.addEventListener("pointerup", (e) => {
        if (this.state === "playing" && this.isTouch) {
          const dy = swipeStartY - e.clientY;
          const dt = performance.now() - swipeStartT;
          if (dy > 44 && dt < 320) {
            this.input.jumpDown = true;
            this.input.jumpHeld = true;
            setTimeout(() => (this.input.jumpHeld = false), 160);
          }
        }
      });
      this.canvas.addEventListener("pointercancel", () => {});
      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

      // touch buttons
      const bindBtn = (id, onDown, onUp) => {
        const el = document.getElementById(id);
        if (!el) return;
        const press = (e) => {
          e.preventDefault();
          el.classList.add("pressed");
          if (el.setPointerCapture) {
            try {
              el.setPointerCapture(e.pointerId);
            } catch (err) {}
          }
          onDown();
        };
        const release = () => {
          el.classList.remove("pressed");
          onUp();
        };
        el.addEventListener("pointerdown", press);
        el.addEventListener("pointerup", release);
        el.addEventListener("pointercancel", release);
        el.addEventListener("pointerleave", release);
      };
      bindBtn("btn-left", () => (this.input.left = true), () => (this.input.left = false));
      bindBtn("btn-right", () => (this.input.right = true), () => (this.input.right = false));
      bindBtn(
        "btn-jump",
        () => {
          if (!this.input.jumpHeld) this.input.jumpDown = true;
          this.input.jumpHeld = true;
        },
        () => (this.input.jumpHeld = false)
      );

      window.addEventListener("blur", () => {
        if (this.state === "playing") this.setState("paused");
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.state === "playing") this.setState("paused");
      });
    }

    _toWorld(clientX, clientY) {
      return {
        x: this.camX + (clientX / this._cssW) * this.viewW,
        y: this.camY + (clientY / this._cssH) * this.viewH,
      };
    }

    _frame = (now) => {
      const dtRaw = (now - this._last) / 1000;
      this._last = now;
      const dt = Math.min(dtRaw, 0.05);

      // fixed-step simulation
      this._acc += dt;
      let n = 0;
      while (this._acc >= STEP && n < 4) {
        this.updateFixed(STEP);
        this._acc -= STEP;
        n++;
      }
      if (n === 4) this._acc = 0;
      const alpha = Math.min(1, this._acc / STEP);

      // per-frame update
      this.updateFree(dt);

      this.render(alpha);
      requestAnimationFrame(this._frame);
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  window.Game = Game;
})();

window.addEventListener("DOMContentLoaded", () => {
  const game = new window.Game();
  window.game = game;
  game.boot();
});
