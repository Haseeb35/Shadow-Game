/* Shadow Self — level data loading, grid parsing and tile collision */
(function () {
  "use strict";

  const TS = 32; // tile size in design units (px)

  /* ------------------------------------------------------------------ */
  /* Level class: holds parsed grid + entities                           */
  /* ------------------------------------------------------------------ */
  class Level {
    constructor(def) {
      this.def = def;
      this.name = def.name || "Untitled";
      this.hint = def.hint || "";
      this.subtitle = def.subtitle || "";

      const rows = def.tiles.map((r) => r.replace(/ /g, "."));
      this.height = rows.length;
      this.width = Math.max(...rows.map((r) => r.length));
      this.wPx = this.width * TS;
      this.hPx = this.height * TS;
      this.TS = TS;

      const n = this.width * this.height;
      this.solid = new Uint8Array(n);
      this.oneWay = new Uint8Array(n);
      this.spike = new Uint8Array(n);
      this.doorTiles = new Int16Array(n).fill(-1);
      this.gateTiles = new Int16Array(n).fill(-1);
      this.fragileMap = new Int16Array(n).fill(-1);
      this.fragile = [];
      this.platformTiles = new Int16Array(n).fill(-1);
      this.springMap = new Int16Array(n).fill(-1);
      this.springs = [];
      this.keys = [];

      this.spawn = { x: 2, y: this.height - 2 };
      this.goal = null;
      this.checkpoints = [];

      // first pass: static tiles, spawn/goal/checkpoints
      for (let ty = 0; ty < this.height; ty++) {
        const row = rows[ty];
        for (let tx = 0; tx < row.length; tx++) {
          const ch = row[tx];
          const i = ty * this.width + tx;
          switch (ch) {
            case "#":
              this.solid[i] = 1;
              break;
            case "-":
              this.oneWay[i] = 1;
              break;
            case "X":
              this.spike[i] = 1;
              break;
            case "S":
              this.spawn = { x: tx + 0.5, y: ty };
              this.solid[i] = 1;
              break;
            case "G":
              this.goal = { x: tx + 0.5, y: ty };
              this.solid[i] = 1;
              break;
            case "P":
              this.checkpoints.push({ x: tx + 0.5, y: ty, tileX: tx, tileY: ty });
              this.solid[i] = 1;
              break;
            case "F":
              this._addFragile(n, tx, ty);
              break;
            case "^":
              this.solid[i] = 1;
              this._addSpring(n, tx, ty);
              break;
            case "K":
              this.keys.push({ x: tx, y: ty, taken: false, t: Math.random() * 6 });
              break;
            default:
              break;
          }
        }
      }
      if (!this.goal) this.goal = { x: this.width - 2, y: this.height - 2 };

      // fragile tiles (expanded per tile; only the shadow's weight breaks them)
      if (Array.isArray(def.fragile)) {
        def.fragile.forEach((f) => {
          for (let dy = 0; dy < f.h; dy++) {
            for (let dx = 0; dx < f.w; dx++) {
              this._addFragile(n, f.x + dx, f.y + dy);
            }
          }
        });
      }

      // springs (bounce whoever lands on them)
      if (Array.isArray(def.springs)) {
        def.springs.forEach((s) => this._addSpring(n, s.x, s.y, s.power));
      }

      // keys (pickups that open locked doors)
      if (Array.isArray(def.keys)) {
        def.keys.forEach((k) => this.keys.push({ x: k.x, y: k.y, taken: false, t: Math.random() * 6 }));
      }

      // moving platforms (follow a waypoint path, carry the player)
      this.platforms = (def.platforms || []).map((p, i) => {
        const wp = p.path && p.path.length ? p.path : [{ x: p.x, y: p.y }, { x: p.x + 3, y: p.y }];
        const pts = wp.map((w) => ({ x: w.x * TS, y: w.y * TS }));
        const segLens = [];
        let totalLen = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const dx = pts[i + 1].x - pts[i].x;
          const dy = pts[i + 1].y - pts[i].y;
          const l = Math.sqrt(dx * dx + dy * dy);
          segLens.push(l);
          totalLen += l;
        }
        return {
          idx: i,
          w: p.w || 2,
          h: p.h || 1,
          path: pts,
          segLens,
          totalLen,
          speed: p.speed || 1, // tiles per second
          t: 0,
          loop: !!p.loop,
          x: pts[0].x,
          y: pts[0].y,
          rect: { x: pts[0].x, y: pts[0].y, w: (p.w || 2) * TS, h: (p.h || 1) * TS },
          dx: 0,
          dy: 0,
          riding: false,
        };
      });
      this.syncPlatforms();

      // plates
      this.plates = (def.plates || []).map((p, i) => ({
        id: "p" + i,
        x: p.x,
        y: p.y,
        w: p.w || 1,
        h: p.h || 1,
        type: p.type || "hold",
        shadowOnly: !!p.shadowOnly,
        playerOnly: !!p.playerOnly,
        targets: p.targets || [],
        rect: {
          x: p.x * TS,
          y: p.y * TS - 4,
          w: (p.w || 1) * TS,
          h: 8,
        },
        pressed: false,
        wasPressed: false,
        flash: 0,
      }));

      // doors
      this.doors = (def.doors || []).map((d, i) => ({
        id: d.id || ("door" + i),
        idx: i,
        x: d.x,
        y: d.y,
        w: d.w,
        h: d.h,
        key: !!d.key,
        open: false,
        timer: 0,
        rect: { x: d.x * TS, y: d.y * TS, w: d.w * TS, h: d.h * TS },
      }));
      // assign door tiles
      this.doors.forEach((d) => {
        for (let dy = 0; dy < d.h; dy++)
          for (let dx = 0; dx < d.w; dx++) {
            const tx = d.x + dx;
            const ty = d.y + dy;
            const idx = ty * this.width + tx;
            if (idx >= 0 && idx < n) this.doorTiles[idx] = d.idx;
          }
      });

      // gates
      this.gates = (def.gates || []).map((g, i) => {
        const pr = g.projector || { x: g.x - 1, y: g.y + g.h };
        return {
          idx: i,
          x: g.x,
          y: g.y,
          w: g.w,
          h: g.h,
          rect: { x: g.x * TS, y: g.y * TS, w: g.w * TS, h: g.h * TS },
          projector: {
            x: pr.x,
            y: pr.y,
            rect: {
              x: pr.x * TS,
              y: pr.y * TS - 4,
              w: TS,
              h: 8,
            },
          },
          active: false,
          timer: 0,
          flash: 0,
        };
      });
      this.gates.forEach((g) => {
        for (let dy = 0; dy < g.h; dy++)
          for (let dx = 0; dx < g.w; dx++) {
            const tx = g.x + dx;
            const ty = g.y + dy;
            const idx = ty * this.width + tx;
            if (idx >= 0 && idx < n) this.gateTiles[idx] = g.idx;
          }
      });

      // enemies (types: walker patrol / chaser / flyer / watcher)
      this.enemies = (def.enemies || []).map((e, i) => ({
        idx: i,
        type: e.type || "walker",
        x: e.x,
        y: e.y,
        min: e.min,
        max: e.max,
        w: (e.w || 1) * TS - 6,
        h: (e.h || 1) * TS - 4,
        dir: e.dir || 1,
        dirV: 1,
        speed: e.speed || 80,
        range: e.range || 6,
        minY: e.minY,
        maxY: e.maxY,
        period: e.period || 2.2,
        watcherT: (e.period || 2.2) * 0.55 + i * 0.3,
        vx: 0,
        dead: false,
        deadTimer: 0,
        walk: Math.random() * Math.PI * 2,
        flash: 0,
        rect: null,
      }));

      // turrets (fire projectiles; shadow absorbs them)
      this.turrets = (def.turrets || []).map((t, i) => ({
        idx: i,
        x: t.x,
        y: t.y,
        dir: t.dir || 1,
        period: t.period || 2.4,
        speed: t.speed || 220,
        timer: (t.period || 2.4) * 0.6 + i * 0.4,
        flash: 0,
        flashTime: 0.35,
      }));

      this.projectiles = [];
    }

    /* ---- tile helpers ---- */
    idx(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return -1;
      return ty * this.width + tx;
    }

    isSolid(tx, ty) {
      const i = this.idx(tx, ty);
      if (i < 0) return true;
      if (this.solid[i]) return true;
      const di = this.doorTiles[i];
      if (di >= 0 && !this.doors[di].open) return true;
      const gi = this.gateTiles[i];
      if (gi >= 0 && !this.gates[gi].active) return true;
      const fi = this.fragileMap[i];
      if (fi >= 0 && this.fragile[fi].state < 3) return true;
      const pi = this.platformTiles[i];
      if (pi >= 0) return true;
      return false;
    }

    springAt(tx, ty) {
      const i = this.idx(tx, ty);
      return i >= 0 ? this.springMap[i] : -1;
    }

    _addSpring(n, tx, ty, power) {
      const idx = ty * this.width + tx;
      if (idx < 0 || idx >= n || this.springMap[idx] >= 0) return;
      this.springMap[idx] = this.springs.length;
      this.springs.push({ x: tx, y: ty, power: power || 900, cool: 0, t: Math.random() * 6 });
    }

    /* re-mark the tiles each moving platform currently covers (call every frame) */
    syncPlatforms() {
      this.platformTiles.fill(-1);
      for (const pf of this.platforms) {
        const tx0 = Math.floor(pf.rect.x / TS);
        const ty0 = Math.floor(pf.rect.y / TS);
        const tx1 = Math.floor((pf.rect.x + pf.rect.w - 0.01) / TS);
        const ty1 = Math.floor((pf.rect.y + pf.rect.h - 0.01) / TS);
        for (let ty = ty0; ty <= ty1; ty++)
          for (let tx = tx0; tx <= tx1; tx++) {
            const idx = this.idx(tx, ty);
            if (idx >= 0) this.platformTiles[idx] = pf.idx;
          }
      }
    }

    /* advance a platform's t parameter and return its current top-left position */
    _platformPos(pf) {
      const pts = pf.path;
      if (pts.length <= 1) return { x: pts[0].x, y: pts[0].y };
      let d = pf.t;
      if (pf.loop) {
        const total = pf.totalLen;
        d = ((d % total) + total) % total;
        for (let i = 0; i < pf.segLens.length; i++) {
          if (d <= pf.segLens[i]) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            const k = pf.segLens[i] === 0 ? 0 : d / pf.segLens[i];
            return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
          }
          d -= pf.segLens[i];
        }
        return { x: pts[0].x, y: pts[0].y };
      }
      // ping-pong
      const total = pf.totalLen;
      const maxT = total * 2;
      let tt = ((d % maxT) + maxT) % maxT;
      if (tt > total) tt = total * 2 - tt;
      for (let i = 0; i < pf.segLens.length; i++) {
        if (tt <= pf.segLens[i]) {
          const a = pts[i];
          const b = pts[i + 1];
          const k = pf.segLens[i] === 0 ? 0 : tt / pf.segLens[i];
          return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        }
        tt -= pf.segLens[i];
      }
      return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
    }

    isOneWay(tx, ty) {
      const i = this.idx(tx, ty);
      return i >= 0 && this.oneWay[i] === 1;
    }

    isSpike(tx, ty) {
      const i = this.idx(tx, ty);
      return i >= 0 && this.spike[i] === 1;
    }

    _addFragile(n, tx, ty) {
      const idx = ty * this.width + tx;
      if (idx < 0 || idx >= n || this.fragileMap[idx] >= 0) return;
      this.fragileMap[idx] = this.fragile.length;
      this.fragile.push({
        x: tx,
        y: ty,
        w: 1,
        h: 1,
        rect: { x: tx * TS, y: ty * TS - 2, w: TS, h: 34 },
        state: 0, // 0 intact, 1 cracked, 2 breaking, 3 gone
        standTimer: 0,
        breakingTimer: 0,
      });
    }

    /* move a rect by dx,dy resolving collisions.
       r = {x,y,w,h} (x,y = top-left)
       returns {hitX, hitY, onGround, hitCeiling, left, right} */
    moveRect(r, dx, dy, opts) {
      opts = opts || {};
      const res = { hitX: false, hitY: false, onGround: false, hitCeiling: false, left: false, right: false };

      // --- X axis ---
      if (dx !== 0) {
        let nx = r.x + dx;
        if (dx > 0) {
          const edge = nx + r.w;
          const tx = Math.floor(edge / TS);
          const tyTop = Math.floor(r.y / TS);
          const tyBot = Math.floor((r.y + r.h - 0.01) / TS);
          for (let ty = tyTop; ty <= tyBot; ty++) {
            if (this.isSolid(tx, ty)) {
              nx = tx * TS - r.w - 0.001;
              res.hitX = true;
              res.right = true;
              break;
            }
          }
        } else if (dx < 0) {
          const tx = Math.floor(nx / TS);
          const tyTop = Math.floor(r.y / TS);
          const tyBot = Math.floor((r.y + r.h - 0.01) / TS);
          for (let ty = tyTop; ty <= tyBot; ty++) {
            if (this.isSolid(tx, ty)) {
              nx = (tx + 1) * TS + 0.001;
              res.hitX = true;
              res.left = true;
              break;
            }
          }
        }
        r.x = nx;
      }

      // --- Y axis ---
      if (dy !== 0) {
        let ny = r.y + dy;
        if (dy > 0) {
          // falling
          const edge = ny + r.h;
          const ty = Math.floor(edge / TS);
          const txL = Math.floor(r.x / TS);
          const txR = Math.floor((r.x + r.w - 0.01) / TS);
          for (let tx = txL; tx <= txR; tx++) {
            const solid = this.isSolid(tx, ty);
            const ow = this.isOneWay(tx, ty);
            const prevBottom = r.y + r.h;
            const tileTop = ty * TS;
            if (solid || (ow && opts.oneWay !== false && prevBottom <= tileTop + 0.5)) {
              if (ow && !solid) {
                if (prevBottom <= tileTop + 0.5 && prevBottom > tileTop - 0.5) continue;
              }
              ny = ty * TS - r.h - 0.001;
              res.hitY = true;
              res.onGround = true;
              break;
            }
          }
        } else if (dy < 0) {
          // rising
          const ty = Math.floor(ny / TS);
          const txL = Math.floor(r.x / TS);
          const txR = Math.floor((r.x + r.w - 0.01) / TS);
          for (let tx = txL; tx <= txR; tx++) {
            if (this.isSolid(tx, ty)) {
              ny = (ty + 1) * TS + 0.001;
              res.hitY = true;
              res.hitCeiling = true;
              break;
            }
          }
        }
        r.y = ny;
      }

      return res;
    }

    /* does rect overlap any spike tile */
    overlapsSpikes(r) {
      const txL = Math.floor(r.x / TS);
      const txR = Math.floor((r.x + r.w - 0.01) / TS);
      const tyT = Math.floor(r.y / TS);
      const tyB = Math.floor((r.y + r.h - 0.01) / TS);
      for (let ty = tyT; ty <= tyB; ty++)
        for (let tx = txL; tx <= txR; tx++)
          if (this.isSpike(tx, ty)) return true;
      return false;
    }

    /* rect overlapping a plate? returns plate or null */
    overlapsPlate(r) {
      for (const p of this.plates) {
        if (aabb(p.rect, r)) return p;
      }
      return null;
    }

    /* is a point within a rect */
    pointInRect(px, py, rect) {
      return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
    }
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ------------------------------------------------------------------ */
  /* Loader: try JSON via fetch, fall back to embedded copies            */
  /* ------------------------------------------------------------------ */
  const Levels = {
    data: null,

    async init() {
      const emb = window.EMBEDDED_LEVELS || [];
      const total = emb.length || 8;
      const arr = [];
      let ok = true;
      for (let i = 1; i <= total; i++) {
        try {
          const r = await fetch("levels/level" + i + ".json");
          if (!r.ok) throw new Error("missing");
          arr.push(await r.json());
        } catch (e) {
          ok = false;
          break;
        }
      }
      if (ok && arr.length) this.data = arr;
      else if (emb.length) this.data = emb;
      else throw new Error("No level data available");
      return this.data.length;
    },

    count() {
      return this.data ? this.data.length : 0;
    },

    build(index) {
      return new Level(this.data[index]);
    },
  };

  window.Levels = Levels;
  window.Level = Level;
})();
