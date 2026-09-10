/* Shadow Self — player physics, input and character rendering */
(function () {
  "use strict";

  const TS = 32;
  const GRAV = 2050;
  const MAX_FALL = 1180;
  const MAX_SPEED = 285;
  const ACC_GROUND = 2800;
  const ACC_AIR = 1700;
  const FRICTION = 2400;
  const JUMP_V = -690;
  const COYOTE = 0.1;
  const JUMP_BUFFER = 0.12;

  class Player {
    constructor(game, spawn) {
      this.game = game;
      this.w = 22;
      this.h = 46;
      this.x = spawn.x * TS;
      this.y = spawn.y * TS;
      this.vx = 0;
      this.vy = 0;
      this.facing = 1;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumpHeld = false;
      this.alive = true;
      this.invuln = 0;
      this.fastFall = false;
      this.keys = 0;

      this.runPhase = 0;
      this.squash = 0;
      this.stretch = 0;
      this.blinkT = 2 + Math.random() * 3;
      this.blink = false;
      this.blinkDur = 0;
      this.footstepT = 0;
      this.landImpulse = 0;
      this.wasOnGround = true;
      this.idleBob = 0;
    }

    rect() {
      return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }

    reset(spawn) {
      this.x = spawn.x * TS;
      this.y = spawn.y * TS;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.alive = true;
      this.invuln = 0;
      this.squash = 0;
      this.stretch = 0;
    }

    die() {
      if (!this.alive) return;
      this.alive = false;
      this.game.fx.spawnBurst(this.x, this.y - this.h / 2, "death", 30);
      this.game.fx.shake(9);
      this.game.fx.flash("#ff5f7a", 0.35);
      this.game.fx.hitStop(0.09);
      this.game.Sound.death();
      this.game.onPlayerDeath();
    }

    update(dt, input) {
      const lvl = this.game.level;

      // timers
      if (this.invuln > 0) this.invuln -= dt;
      if (this.squash > 0) this.squash -= dt * 4;
      if (this.stretch > 0) this.stretch -= dt * 4;
      this.coyote = this.onGround ? COYOTE : this.coyote - dt;
      if (input.jumpDown) this.jumpBuffer = JUMP_BUFFER;
      else this.jumpBuffer -= dt;

      // horizontal
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const accel = this.onGround ? ACC_GROUND : ACC_AIR;
      if (dir !== 0) {
        this.vx += dir * accel * dt;
        this.vx = clamp(this.vx, -MAX_SPEED, MAX_SPEED);
        this.facing = dir;
      } else {
        const fr = this.onGround ? FRICTION : 260;
        if (this.vx > 0) this.vx = Math.max(0, this.vx - fr * dt);
        else this.vx = Math.min(0, this.vx + fr * dt);
      }

      // vertical
      this.fastFall = input.down && !this.onGround;
      let g = GRAV;
      if (this.fastFall) g = GRAV * 1.7;
      this.vy += g * dt;
      if (this.vy > MAX_FALL) this.vy = MAX_FALL;

      // variable jump height
      if (input.jumpHeld === false && this.vy < 0 && this._wasHeld) {
        this.vy *= 0.5;
      }

      // jump
      if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
        this.vy = JUMP_V;
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.stretch = 1;
        this.fastFall = false;
        this.game.Sound.jump();
        this.game.fx.spawnBurst(this.x, this.y, "jump", 8);
      }

      this._wasHeld = !!input.jumpHeld;

      // integrate
      const r = this.rect();
      const wasGround = this.onGround;
      const fallSpeed = this.vy;
      const res = lvl.moveRect(r, this.vx * dt, this.vy * dt, { oneWay: true });
      this.onGround = res.onGround;

      // wall hit
      if (res.hitX) this.vx = 0;
      if (res.hitCeiling && this.vy < 0) this.vy = 0;
      if (res.onGround) {
        // springs launch instead of a normal landing
        const feetTx = Math.floor((r.x + r.w / 2) / TS);
        const feetTy = Math.floor((r.y + r.h + 0.5) / TS);
        const spIdx = lvl.springAt(feetTx, feetTy);
        if (spIdx >= 0 && fallSpeed > 60) {
          const s = lvl.springs[spIdx];
          this.vy = -s.power;
          this.onGround = false;
          s.cool = 0.35;
          this.stretch = 1;
          this.game.Sound.springBounce();
          this.game.fx.spawnBurst(r.x + r.w / 2, r.y + r.h, "spring", 12);
          this.game.fx.shake(3);
        } else {
          this.vy = 0;
          if (!wasGround) {
            this.squash = 1;
            this.game.fx.spawnBurst(this.x, this.y, "land", 7);
            this.game.Sound.land();
            if (fallSpeed > 520) this.game.fx.shake(3);
          }
        }
      }

      this.x = r.x + this.w / 2;
      this.y = r.y + this.h;

      // footstep
      if (this.onGround && Math.abs(this.vx) > 60) {
        this.runPhase += dt * (Math.abs(this.vx) / 40);
        this.footstepT -= dt;
        if (this.footstepT <= 0) {
          this.footstepT = 0.24;
          this.game.Sound.step();
          this.game.fx.spawnBurst(this.x - this.facing * 6, this.y - 2, "dust", 3);
        }
      } else {
        this.runPhase *= 0.96;
      }
      if (!this.onGround) this.runPhase += dt * 3;

      // blink
      this.blinkT -= dt;
      if (this.blinkT <= 0) {
        this.blink = true;
        this.blinkDur = 0.12;
        this.blinkT = 2 + Math.random() * 3.5;
      }
      if (this.blink) {
        this.blinkDur -= dt;
        if (this.blinkDur <= 0) this.blink = false;
      }

      this.idleBob += dt;

      // hazards
      if (this.alive) {
        if (lvl.overlapsSpikes(this.rect())) {
          this.die();
          return;
        }
        // out of bounds
        if (this.y > lvl.hPx + 60) {
          this.die();
          return;
        }
        // checkpoints
        for (const cp of lvl.checkpoints) {
          const cRect = { x: cp.x * TS - 10, y: cp.y * TS - 40, w: 20, h: 40 };
          if (!cp.activated && aabb(this.rect(), cRect)) {
            cp.activated = true;
            this.game.checkpoint = { x: cp.x, y: cp.y };
            this.game.checkpointTime = this.game.timer;
            this.game.Sound.checkpoint();
            this.game.fx.spawnBurst(cp.x * TS, cp.y * TS, "checkpoint", 16);
          }
        }
        // goal
        const goal = lvl.goal;
        const gRect = { x: goal.x * TS - 16, y: goal.y * TS - 64, w: 32, h: 64 };
        if (aabb(this.rect(), gRect)) {
          this.game.onWin();
        }
      }
    }

    /* render the character at world position (feet center) */
    draw(ctx, opts) {
      opts = opts || {};
      drawCharacter(ctx, this.x, this.y, {
        facing: opts.facing !== undefined ? opts.facing : this.facing,
        action: opts.action || this._action(),
        runPhase: this.runPhase,
        idleBob: this.idleBob,
        blink: this.blink,
        alpha: opts.alpha !== undefined ? opts.alpha : 1,
        palette: opts.palette || PAL_PLAYER,
        ghost: opts.ghost || 0,
        squash: opts.squash !== undefined ? opts.squash : this.squash,
        stretch: opts.stretch !== undefined ? opts.stretch : this.stretch,
        lean: opts.lean,
        vx: this.vx,
        time: this.game.time,
      });
    }

    _action() {
      if (!this.alive) return "dead";
      if (!this.onGround) return this.vy < 0 ? "jump" : "fall";
      if (Math.abs(this.vx) > 40) return "run";
      return "idle";
    }
  }

  /* Shared procedural character renderer — used by player AND shadow */
  function drawCharacter(ctx, x, y, o) {
    const time = o.time || 0;
    const alpha = o.alpha !== undefined ? o.alpha : 1;
    const palette = o.palette || PAL_PLAYER;
    const ghost = o.ghost || 0;
    const facing = o.facing !== undefined ? o.facing : 1;
    const action = o.action || "idle";
    const vx = o.vx || 0;
    const lean = o.lean !== undefined ? o.lean : clamp(vx / MAX_SPEED, -1, 1) * (action === "run" ? 0.35 : 0.15);
    const sq = o.squash || 0;
    const st = o.stretch || 0;
    const blink = o.blink;
    const idleBob = o.idleBob || 0;
    const runPhase = o.runPhase || 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.globalAlpha = alpha;
    const sy = 1 + sq * 0.28 - st * 0.22;
    const sx = 1 - sq * 0.2 + st * 0.14;
    ctx.scale(sx, sy);
    ctx.translate(0, (sq - st) * 6);

    let legSwing = 0;
    if (action === "run") legSwing = Math.sin(runPhase * 2) * 0.9;
    const inAir = action === "jump" || action === "fall";

    if (!ghost) {
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = 14;
    } else {
      ctx.shadowBlur = 0;
    }

    // torso
    ctx.fillStyle = palette.dark;
    roundRect(ctx, -9, -32, 18, 19, 6);
    ctx.fill();
    ctx.fillStyle = palette.fill;
    roundRect(ctx, -8, -31, 16, 17, 5);
    ctx.fill();
    // chest accent
    ctx.fillStyle = palette.accent;
    ctx.globalAlpha = alpha * 0.9;
    roundRect(ctx, -3, -29, 6, 6, 2);
    ctx.fill();
    ctx.globalAlpha = alpha;

    // head
    const headY = -40 + Math.sin(idleBob * 2) * (inAir ? 0 : 0.7);
    ctx.fillStyle = palette.dark;
    ctx.beginPath();
    ctx.arc(1, headY, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.fill;
    ctx.beginPath();
    ctx.arc(0.5, headY - 0.5, 8.4, 0, Math.PI * 2);
    ctx.fill();
    // headband
    ctx.fillStyle = palette.band;
    ctx.beginPath();
    ctx.arc(0.5, headY - 2, 8.4, Math.PI * 0.9, Math.PI * 1.1);
    ctx.lineTo(12 + Math.sin(time * 6) * 1.5 + lean * 8, headY - 6);
    ctx.lineTo(13 + Math.sin(time * 6) * 1.5 + lean * 8, headY - 2);
    ctx.closePath();
    ctx.fill();
    // eye
    if (blink && alpha > 0.6) {
      ctx.strokeStyle = palette.dark;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(2, headY + 1);
      ctx.lineTo(6, headY + 1);
      ctx.stroke();
    } else {
      ctx.fillStyle = palette.eye;
      ctx.beginPath();
      ctx.arc(5, headY, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // legs
    ctx.lineCap = "round";
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = 5.5;
    if (inAir) {
      const lift = action === "jump" ? -8 : 6;
      ctx.beginPath();
      ctx.moveTo(-4, -17);
      ctx.lineTo(-8, -9 + lift * 0.5);
      ctx.moveTo(4, -17);
      ctx.lineTo(8, -9 + lift * 0.5);
      ctx.stroke();
    } else if (action === "run") {
      ctx.beginPath();
      ctx.moveTo(-4, -17);
      ctx.lineTo(-4 + legSwing * 5, -2 + Math.max(0, legSwing) * -4);
      ctx.moveTo(4, -17);
      ctx.lineTo(4 - legSwing * 5, -2 + Math.max(0, -legSwing) * -4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-4, -17);
      ctx.lineTo(-4, -3);
      ctx.moveTo(4, -17);
      ctx.lineTo(4, -3);
      ctx.stroke();
    }
    // feet
    ctx.fillStyle = palette.dark;
    roundRect(ctx, -8, -3, 7, 3, 1.5);
    ctx.fill();
    roundRect(ctx, 1, -3, 7, 3, 1.5);
    ctx.fill();

    // arm
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (action === "jump") {
      ctx.moveTo(-6, -30);
      ctx.lineTo(-12, -36);
    } else if (action === "fall") {
      ctx.moveTo(-6, -30);
      ctx.lineTo(-11, -27);
    } else {
      ctx.moveTo(-7, -30);
      ctx.lineTo(-11, -23 + Math.sin(runPhase * 2) * 2);
    }
    ctx.stroke();

    ctx.restore();
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
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

  const PAL_PLAYER = {
    fill: "#37e5ff",
    dark: "#0b8cae",
    accent: "#9ff7ff",
    band: "#ff5f7a",
    eye: "#07121c",
    glow: "#37e5ff",
  };

  const PAL_SHADOW = {
    fill: "#0a0d18",
    dark: "#000000",
    accent: "#2a3a63",
    band: "#18213c",
    eye: "#4a5a8c",
    glow: "rgba(90,120,200,0.6)",
  };

  window.Player = Player;
  window.drawCharacter = drawCharacter;
  window.PAL_PLAYER = PAL_PLAYER;
  window.PAL_SHADOW = PAL_SHADOW;
})();
