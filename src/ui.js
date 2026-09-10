/* Shadow Self — canvas UI: HUD, title, level select, pause, win, toasts */
(function () {
  "use strict";

  const FONT = "'Segoe UI', system-ui, sans-serif";

  class UI {
    constructor(game) {
      this.game = game;
      this.buttons = [];
      this.hover = null;
      this.toasts = [];
      this.hintTimer = 0;
      this.titleTime = 0;
      this.selectPage = 0;
    }

    toast(msg, dur) {
      this.toasts.push({ msg, dur: dur || 2.5, t: 0 });
      if (this.toasts.length > 3) this.toasts.shift();
    }

    update(dt) {
      this.titleTime += dt;
      for (const t of this.toasts) t.t += dt;
      this.toasts = this.toasts.filter((t) => t.t < t.dur);
      this.hintTimer = Math.max(0, this.hintTimer - dt);
    }

    showHint(sec) {
      this.hintTimer = sec;
    }

    /* ---------- drawing helpers ---------- */
    _text(ctx, str, x, y, o) {
      o = o || {};
      ctx.save();
      ctx.font = (o.weight || 700) + " " + (o.size || 20) + "px " + (o.font || FONT);
      if (o.letterSpacing) ctx.letterSpacing = o.letterSpacing + "px";
      else if (ctx.letterSpacing) ctx.letterSpacing = "0px";
      ctx.textAlign = o.align || "center";
      ctx.textBaseline = o.baseline || "middle";
      ctx.globalAlpha = o.alpha !== undefined ? o.alpha : 1;
      ctx.shadowColor = o.glow || "transparent";
      ctx.shadowBlur = o.glow ? 18 : 0;
      ctx.fillStyle = o.color || "#e8f6ff";
      ctx.fillText(str, x, y);
      ctx.restore();
    }

    _panel(ctx, x, y, w, h) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "rgba(18,24,52,0.96)");
      g.addColorStop(1, "rgba(8,12,30,0.96)");
      ctx.fillStyle = g;
      ctx.strokeStyle = "rgba(80,120,255,0.35)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, w, h, 16);
      ctx.fill();
      ctx.stroke();
      // top accent line
      ctx.strokeStyle = "rgba(56,232,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 1);
      ctx.lineTo(x + w - 16, y + 1);
      ctx.stroke();
      ctx.restore();
    }

    /* ---------- button ---------- */
    _button(ctx, b, view) {
      const hov = b === this.hover;
      ctx.save();
      ctx.globalAlpha = b.locked ? 0.4 : 1;
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      g.addColorStop(0, hov ? "#2b3a72" : "#1b2448");
      g.addColorStop(1, hov ? "#182150" : "#121a38");
      ctx.fillStyle = g;
      ctx.strokeStyle = hov ? "#7ae0ff" : "rgba(90,140,255,0.4)";
      ctx.lineWidth = hov ? 2.5 : 1.5;
      roundRect(ctx, b.x, b.y, b.w, b.h, b.round || 12);
      ctx.fill();
      ctx.stroke();
      if (hov && !b.locked) {
        ctx.strokeStyle = "rgba(122,224,255,0.25)";
        ctx.lineWidth = 8;
        roundRect(ctx, b.x, b.y, b.w, b.h, b.round || 12);
        ctx.stroke();
      }
      ctx.restore();
      if (b.icon && b.icon !== "") {
        this._text(ctx, b.icon, b.x + b.w / 2, b.y + b.h / 2 - (b.sub ? 8 : 0), {
          size: b.iconSize || 22,
          color: b.locked ? "#666" : "#9ff7ff",
        });
      }
      if (b.label) {
        this._text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 - (b.sub ? 8 : 0), {
          size: b.size || 18,
          color: b.locked ? "#77819f" : "#eaf6ff",
        });
      }
      if (b.sub) {
        this._text(ctx, b.sub, b.x + b.w / 2, b.y + b.h - 12, {
          size: b.subSize || 12,
          weight: 600,
          color: b.locked ? "#55607f" : "#8fb3d9",
          font: "monospace",
        });
      }
    }

    /* ---------- main draw dispatcher ---------- */
    draw(ctx, view) {
      this.buttons = [];
      const st = this.game.state;
      if (st === "menu") this._drawTitle(ctx, view);
      else if (st === "select") this._drawSelect(ctx, view);
      else if (st === "playing" || st === "paused" || st === "dying") this._drawGame(ctx, view);
      else if (st === "win") this._drawWin(ctx, view);
      // hover
      const hb = this.hit(this.game.pointerX, this.game.pointerY);
      this.hover = hb;
      this._drawToasts(ctx, view);
    }

    /* ---------- title ---------- */
    _drawTitle(ctx, view) {
      const cx = view.cx;
      const t = this.titleTime;
      const baseY = view.y + view.h * 0.32;

      // ambient glow
      ctx.save();
      const g = ctx.createRadialGradient(cx, baseY + 40, 10, cx, baseY + 40, 260);
      g.addColorStop(0, "rgba(56,180,255,0.16)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(view.x, view.y, view.w, view.h);
      ctx.restore();

      // shadow echo of the logo (thematically behind it)
      const off = 10 + Math.sin(t * 1.2) * 6;
      this._text(ctx, "SHADOW", cx + off, baseY + off, {
        size: 74,
        color: "rgba(20,26,60,0.9)",
        glow: "rgba(40,60,140,0.5)",
        letterSpacing: 14,
      });
      this._text(ctx, "SELF", cx + off, baseY + 64 + off, {
        size: 74,
        color: "rgba(20,26,60,0.9)",
        glow: "rgba(40,60,140,0.5)",
        letterSpacing: 14,
      });

      this._text(ctx, "SHADOW", cx, baseY, {
        size: 74,
        color: "#eaf6ff",
        glow: "rgba(56,232,255,0.6)",
      });
      this._text(ctx, "SELF", cx, baseY + 64, {
        size: 74,
        color: "#eaf6ff",
        glow: "rgba(56,232,255,0.6)",
      });

      this._text(ctx, "a puzzle-platformer where your only ally is", cx, baseY + 130, {
        size: 16,
        weight: 500,
        color: "#9fb6d9",
      });
      this._text(ctx, "who you were " + window.SHADOW_DELAY + " seconds ago", cx, baseY + 152, {
        size: 16,
        weight: 500,
        color: "#7ae0ff",
        glow: "rgba(56,232,255,0.4)",
      });

      // the pair (player + echo) standing on a platform
      const px = cx;
      const py = view.y + view.h * 0.72;
      ctx.save();
      ctx.fillStyle = "rgba(30,40,80,0.5)";
      ctx.fillRect(px - 70, py - 4, 140, 6);
      window.drawCharacter(ctx, px - 26, py, {
        facing: 1,
        action: "idle",
        runPhase: 0,
        idleBob: t,
        alpha: 0.55,
        palette: window.PAL_SHADOW,
        ghost: 1,
        time: t,
      });
      window.drawCharacter(ctx, px + 26, py, {
        facing: -1,
        action: "idle",
        runPhase: 0,
        idleBob: t * 0.5,
        palette: window.PAL_PLAYER,
        time: t,
      });
      ctx.restore();

      const bw = 220;
      const bh = 56;
      this.buttons.push({
        x: cx - bw / 2,
        y: view.y + view.h - 150,
        w: bw,
        h: bh,
        label: "PLAY",
        round: 28,
        size: 20,
        action: () => this.game.startSelect(),
      });
      this._button(ctx, this.buttons[0], view);

      this._text(ctx, "[ Enter ]  or  tap", cx, this.buttons[0].y + bh + 26, {
        size: 13,
        weight: 600,
        color: "#5a6a92",
        font: "monospace",
      });

      this._text(ctx, "ARROWS / A·D  move   •   SPACE jump   •   R restart   •   P pause", cx, view.y + view.h - 26, {
        size: 12,
        weight: 600,
        color: "#44507a",
        font: "monospace",
      });
    }

    /* ---------- level select ---------- */
    _drawSelect(ctx, view) {
      this._text(ctx, "SELECT A LEVEL", view.cx, view.y + view.h * 0.14, {
        size: 34,
        color: "#eaf6ff",
        glow: "rgba(56,232,255,0.4)",
      });

      const levelCount = this.game.levelCount;
      const unlocked = this.game.unlocked;
      const cols = 4;
      const rows = 2;
      const perPage = cols * rows;
      const gap = 18;
      const cw = Math.min(190, (view.w - gap * (cols + 1)) / cols);
      const ch = 118;
      const totalW = cols * cw + (cols - 1) * gap;
      const startX = view.cx - totalW / 2;
      const topY = view.y + view.h * 0.26;

      const totalPages = Math.max(1, Math.ceil(levelCount / perPage));
      if (this.selectPage >= totalPages) this.selectPage = totalPages - 1;
      const pageStart = this.selectPage * perPage;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = pageStart + r * cols + c;
          if (i >= levelCount) continue;
          const locked = i > unlocked;
          const x = startX + c * (cw + gap);
          const y = topY + r * (ch + gap);
          const b = {
            x,
            y,
            w: cw,
            h: ch,
            locked,
            label: String(i + 1).padStart(2, "0"),
            size: 30,
            sub: locked ? "LOCKED" : this.game.bestTimes[i] !== null && this.game.bestTimes[i] !== undefined ? this.game.bestTimes[i].toFixed(2) + "s" : "NEW",
            subSize: 13,
            round: 14,
            action: () => this.game.startLevel(i),
          };
          this.buttons.push(b);
          this._button(ctx, b, view);
          if (i === unlocked && !locked) {
            this._text(ctx, "▶", x + cw - 18, y + ch - 20, { size: 12, color: "#7ae0ff" });
          }
        }
      }

      // page navigation (only when there is more than one page)
      if (totalPages > 1) {
        const navY = topY + rows * (ch + gap) + 14;
        const prevB = {
          x: view.cx - 120,
          y: navY - 18,
          w: 60,
          h: 36,
          label: "◀",
          size: 16,
          round: 10,
          locked: this.selectPage <= 0,
          action: () => {
            if (this.selectPage > 0) this.selectPage--;
          },
        };
        const nextB = {
          x: view.cx + 60,
          y: navY - 18,
          w: 60,
          h: 36,
          label: "▶",
          size: 16,
          round: 10,
          locked: this.selectPage >= totalPages - 1,
          action: () => {
            if (this.selectPage < totalPages - 1) this.selectPage++;
          },
        };
        this.buttons.push(prevB, nextB);
        this._button(ctx, prevB, view);
        this._button(ctx, nextB, view);
        this._text(ctx, "PAGE " + (this.selectPage + 1) + " / " + totalPages, view.cx, navY, {
          size: 12,
          weight: 600,
          color: "#7d8fbf",
          font: "monospace",
        });
        this._text(ctx, "complete a level to unlock the next", view.cx, navY + 24, {
          size: 12,
          weight: 600,
          color: "#5a6a92",
          font: "monospace",
        });
      } else {
        this._text(ctx, "complete a level to unlock the next", view.cx, topY + rows * (ch + gap) + 20, {
          size: 12,
          weight: 600,
          color: "#5a6a92",
          font: "monospace",
        });
      }

      // back button
      const bb = {
        x: view.x + 24,
        y: view.y + view.h - 64,
        w: 110,
        h: 40,
        label: "◀ MENU",
        size: 14,
        round: 20,
        action: () => this.game.setState("menu"),
      };
      this.buttons.push(bb);
      this._button(ctx, bb, view);
    }

    /* ---------- gameplay HUD ---------- */
    _drawGame(ctx, view) {
      const g = this.game;
      const pad = 16;

      // timer
      this._text(ctx, formatTime(g.timer), view.x + pad, view.y + pad + 12, {
        size: 26,
        align: "left",
        color: "#dff5ff",
        glow: "rgba(56,232,255,0.35)",
        font: "monospace",
      });

      // keys carried
      if (g.player && g.player.keys > 0) {
        const kx = view.x + pad;
        const ky = view.y + pad + 44;
        ctx.save();
        ctx.fillStyle = "#ffd166";
        ctx.shadowColor = "#ffd166";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(kx + 4, ky, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(kx + 7, ky - 1.5, 12, 3);
        ctx.fillRect(kx + 14, ky + 1.5, 3, 5);
        ctx.restore();
        this._text(ctx, "× " + g.player.keys, kx + 26, ky, {
          size: 14,
          align: "left",
          color: "#ffd166",
          font: "monospace",
        });
      }

      // level name
      this._text(ctx, "LEVEL " + (g.currentLevel + 1) + " — " + g.level.name.toUpperCase(), view.cx, view.y + pad + 12, {
        size: 14,
        weight: 700,
        color: "#9fb6d9",
        font: "monospace",
      });

      // shadow status / sound
      const rightX = view.x + view.w - pad;
      const sndBtn = {
        x: rightX - 46,
        y: view.y + pad,
        w: 46,
        h: 34,
        icon: g.Sound.enabled ? "♫" : "✕",
        iconSize: 16,
        round: 10,
        action: () => {
          g.Sound.setEnabled(!g.Sound.enabled);
          g.Sound.uiClick();
        },
      };
      this.buttons.push(sndBtn);
      this._button(ctx, sndBtn, view);

      // shadow delay meter
      const mw = 160;
      const mx = view.cx - mw / 2;
      const my = view.y + view.h - 26;
      this._text(ctx, "SHADOW", mx, my, {
        size: 10,
        align: "left",
        color: "#5a6a92",
        font: "monospace",
      });
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(20,28,60,0.8)";
      ctx.fillRect(mx + 52, my - 4, mw, 8);
      const prog = Math.min(1, g.shadow.step / (window.SHADOW_DELAY * 60));
      const grad = ctx.createLinearGradient(mx + 52, 0, mx + 52 + mw, 0);
      grad.addColorStop(0, "#3b5bb8");
      grad.addColorStop(1, "#37e5ff");
      ctx.fillStyle = grad;
      ctx.fillRect(mx + 52, my - 4, mw * prog, 8);
      ctx.strokeStyle = "rgba(122,224,255,0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(mx + 52, my - 4, mw, 8);
      ctx.restore();
      this._text(ctx, g.shadow.visible ? "+" + window.SHADOW_DELAY.toFixed(1) + "s" : "+" + (window.SHADOW_DELAY - g.timer).toFixed(1) + "s", mx + 52 + mw + 10, my, {
        size: 11,
        align: "left",
        color: g.shadow.visible ? "#7ae0ff" : "#5a6a92",
        font: "monospace",
      });

      // hint (small, non-blocking, at the bottom of the screen)
      if (this.hintTimer > 0 && g.level.hint) {
        const a = Math.min(1, this.hintTimer / 0.5);
        this._text(ctx, g.level.hint, view.cx, view.y + view.h - 24, {
          size: 12,
          weight: 500,
          color: "#8fb3d9",
          alpha: a,
          font: "monospace",
        });
      }

      // pause overlay
      if (g.state === "paused") this._drawPause(ctx, view);
      if (g.state === "dying") this._drawDead(ctx, view);

      // touch hint
      if (g.isTouch) {
        this._text(ctx, "tap ◀ ▶ to move   •   ⤒ to jump", view.cx, view.y + view.h - 66, {
          size: 12,
          weight: 600,
          color: "#5a6a92",
          font: "monospace",
        });
      }
    }

    _drawPause(ctx, view) {
      this._dim(ctx, view, 0.6);
      const bw = 260;
      const bh = 320;
      const x = view.cx - bw / 2;
      const y = view.y + view.h * 0.28;
      this._panel(ctx, x, y, bw, bh);
      this._text(ctx, "PAUSED", view.cx, y + 34, { size: 24, color: "#eaf6ff", glow: "rgba(56,232,255,0.4)" });
      this._text(ctx, "your shadow is waiting for you", view.cx, y + 58, {
        size: 12,
        weight: 500,
        color: "#7d8fbf",
      });

      const items = [
        { label: "RESUME", action: () => this.game.resume() },
        { label: "RESTART LEVEL", action: () => this.game.restartLevel() },
        { label: "LEVEL SELECT", action: () => this.game.startSelect() },
        { label: this.game.Sound.enabled ? "SOUND: ON" : "SOUND: OFF", action: () => {
            this.game.Sound.setEnabled(!this.game.Sound.enabled);
            this.game.Sound.uiClick();
          } },
        { label: "QUIT TO MENU", action: () => this.game.setState("menu") },
      ];
      items.forEach((it, i) => {
        const b = {
          x: x + 20,
          y: y + 82 + i * 46,
          w: bw - 40,
          h: 38,
          label: it.label,
          size: 14,
          round: 10,
          action: it.action,
        };
        this.buttons.push(b);
        this._button(ctx, b, view);
      });
    }

    _drawDead(ctx, view) {
      this._dim(ctx, view, 0.35);
      this._text(ctx, "you faded…", view.cx, view.y + view.h * 0.4, {
        size: 30,
        color: "#ff8ba0",
        glow: "rgba(255,95,122,0.5)",
      });
      this._text(ctx, "your shadow forgets your last " + window.SHADOW_DELAY + " seconds", view.cx, view.y + view.h * 0.4 + 34, {
        size: 13,
        weight: 500,
        color: "#9fb6d9",
      });
    }

    _drawWin(ctx, view) {
      const g = this.game;
      this._dim(ctx, view, 0.5);
      const bw = 380;
      const bh = 300;
      const x = view.cx - bw / 2;
      const y = view.y + view.h * 0.24;
      this._panel(ctx, x, y, bw, bh);
      this._text(ctx, "LEVEL COMPLETE", view.cx, y + 40, {
        size: 26,
        color: "#9ff7ff",
        glow: "rgba(56,232,255,0.6)",
      });

      const isBest = g.bestTimes[g.currentLevel] !== null && g.bestTimes[g.currentLevel] === g.timer;
      this._text(ctx, "time  " + formatTime(g.timer), view.cx, y + 86, {
        size: 20,
        color: "#eaf6ff",
        font: "monospace",
      });
      if (isBest) {
        this._text(ctx, "★ NEW BEST ★", view.cx, y + 116, {
          size: 15,
          color: "#ffd166",
          glow: "rgba(255,209,102,0.6)",
        });
      } else if (g.bestTimes[g.currentLevel] !== null) {
        this._text(ctx, "best  " + formatTime(g.bestTimes[g.currentLevel]), view.cx, y + 116, {
          size: 14,
          color: "#7d8fbf",
          font: "monospace",
        });
      }

      const hasNext = g.currentLevel + 1 < g.levelCount;
      const next = {
        x: x + 24,
        y: y + 160,
        w: bw - 48,
        h: 46,
        label: hasNext ? "NEXT LEVEL  ▶" : "ALL LEVELS COMPLETE!",
        size: 16,
        round: 12,
        action: () => (hasNext ? g.startLevel(g.currentLevel + 1) : g.startSelect()),
      };
      const replay = {
        x: x + 24,
        y: y + 214,
        w: (bw - 48) / 2 - 5,
        h: 42,
        label: "↻ REPLAY",
        size: 14,
        round: 10,
        action: () => g.restartLevel(),
      };
      const menu = {
        x: x + bw / 2 + 1,
        y: y + 214,
        w: (bw - 48) / 2 - 5,
        h: 42,
        label: "LEVELS",
        size: 14,
        round: 10,
        action: () => g.startSelect(),
      };
      this.buttons.push(next, replay, menu);
      this._button(ctx, next, view);
      this._button(ctx, replay, view);
      this._button(ctx, menu, view);

      this._text(ctx, "your past self thanks you", view.cx, y + bh - 18, {
        size: 12,
        weight: 500,
        color: "#5a6a92",
      });
    }

    _dim(ctx, view, a) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = "#04060f";
      ctx.fillRect(view.x, view.y, view.w, view.h);
      ctx.restore();
    }

    _drawToasts(ctx, view) {
      let y = view.y + 64;
      for (const t of this.toasts) {
        const fadeIn = Math.min(1, t.t / 0.3);
        const fadeOut = Math.min(1, (t.dur - t.t) / 0.5);
        const a = Math.min(fadeIn, fadeOut);
        const w = Math.min(460, this._textW(t.msg, 15) + 40);
        this._panel(ctx, view.cx - w / 2, y, w, 40);
        this._text(ctx, t.msg, view.cx, y + 21, {
          size: 15,
          weight: 600,
          color: "#cfe6ff",
          alpha: a,
        });
        y += 50;
      }
    }

    _textW(str, size) {
      return str.length * size * 0.6;
    }

    /* ---------- pointer / click ---------- */
    hit(x, y) {
      for (let i = this.buttons.length - 1; i >= 0; i--) {
        const b = this.buttons[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
      }
      return null;
    }

    click(x, y) {
      const b = this.hit(x, y);
      if (b) {
        this.game.Sound.uiClick();
        if (b.action) b.action();
        return true;
      }
      return false;
    }
  }

  function formatTime(t) {
    const s = Math.max(0, t);
    const m = Math.floor(s / 60);
    const ss = (s - m * 60).toFixed(2);
    return (m > 0 ? m + ":" : "") + (m > 0 && ss < 10 ? "0" : "") + ss;
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

  window.UI = UI;
})();
