/* Shadow Self — the shadow: a rolling 2-second replay of the player.
   The ring buffer records one state per physics step; the shadow reads
   the slot from exactly DELAY steps ago, in real time.                 */
(function () {
  "use strict";

  const DELAY_SECONDS = 2;
  const STEP_RATE = 60;
  const N = Math.round(DELAY_SECONDS * STEP_RATE); // 120 slots

  class ShadowSystem {
    constructor(game) {
      this.game = game;
      this.buf = new Array(N).fill(null);
      this.step = 0;

      // replay state
      this.x = 0;
      this.y = 0;
      this.prevX = 0;
      this.prevY = 0;
      this.vx = 0;
      this.vy = 0;
      this.onGround = true;
      this.facing = 1;

      this.fade = 0; // materialize fade 0..1
      this.visible = false;
      this.arrived = false;
      this.runPhase = 0;
      this.trail = [];
    }

    rect() {
      return { x: this.x - 11, y: this.y - 46, w: 22, h: 46 };
    }

    clear() {
      this.buf.fill(null);
      this.step = 0;
      this.visible = false;
      this.fade = 0;
      this.arrived = false;
      this.trail.length = 0;
    }

    /* record the player's current state; returns the state from 2s ago */
    record(state) {
      const i = this.step % N;
      const old = this.buf[i];
      this.buf[i] = state;
      this.step++;
      return old;
    }

    /* update the shadow from the state recorded exactly 2 seconds ago */
    update(dt, s) {
      if (!s) {
        this.visible = false;
        this.fade = Math.max(0, this.fade - dt * 3);
        return;
      }

      this.prevX = this.x;
      this.prevY = this.y;
      this.x = s.x;
      this.y = s.y;
      this.vx = s.vx;
      this.vy = s.vy;
      this.onGround = s.onGround;
      this.facing = s.facing;

      if (this.onGround && Math.abs(this.vx) > 40) this.runPhase += dt * (Math.abs(this.vx) / 40);
      else this.runPhase += dt * 2;

      // visibility: in world bounds
      const lvl = this.game.level;
      const inBounds =
        this.x > -60 && this.x < lvl.wPx + 60 && this.y > -60 && this.y < lvl.hPx + 80;

      if (inBounds) {
        this.visible = true;
        if (!this.arrived) {
          this.arrived = true;
          this.game.fx.spawnRing(this.x, this.y, "#7aa2ff");
          this.game.fx.spawnBurst(this.x, this.y, "materialize", 20);
          this.game.Sound.shadowArrive();
          this.game.ui.toast("Your shadow has arrived — +2s behind you", 3);
        }
        this.fade = Math.min(1, this.fade + dt * 4);
      } else {
        this.visible = false;
        this.fade = Math.max(0, this.fade - dt * 3);
      }

      // trail (ghost afterimages)
      this.trail.push({ x: this.x, y: this.y, facing: this.facing, age: 0 });
      if (this.trail.length > 9) this.trail.shift();
      for (const t of this.trail) t.age += dt;
    }

    _action() {
      if (!this.onGround) return this.vy < 0 ? "jump" : "fall";
      if (Math.abs(this.vx) > 40) return "run";
      return "idle";
    }

    draw(ctx, alpha) {
      if (!this.visible || this.fade <= 0.02) return;
      const interpX = this.prevX + (this.x - this.prevX) * alpha;
      const interpY = this.prevY + (this.y - this.prevY) * alpha;

      // ghost trail
      for (const t of this.trail) {
        const a = Math.max(0, 0.14 - t.age * 0.02) * this.fade;
        if (a <= 0) continue;
        window.drawCharacter(ctx, t.x, t.y, {
          facing: t.facing,
          action: this._action(),
          runPhase: this.runPhase,
          idleBob: t.age * 3,
          alpha: a,
          palette: window.PAL_SHADOW,
          ghost: 1,
          vx: this.vx,
          time: this.game.time,
        });
      }

      // shadow ring / timer marker under feet
      ctx.save();
      ctx.globalAlpha = this.fade * 0.8;
      ctx.strokeStyle = "#5f7fe0";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(interpX, interpY, 16, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = this.fade * 0.5;
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.ellipse(interpX, interpY, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // the shadow silhouette (with a slight cyan rim via double draw)
      window.drawCharacter(ctx, interpX, interpY, {
        facing: this.facing,
        action: this._action(),
        runPhase: this.runPhase,
        idleBob: this.game.time * 0.5,
        alpha: this.fade * 0.55,
        palette: window.PAL_SHADOW,
        ghost: 0,
        vx: this.vx,
        time: this.game.time,
      });
    }
  }

  window.ShadowSystem = ShadowSystem;
  window.SHADOW_DELAY = DELAY_SECONDS;
})();
