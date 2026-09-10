# 🎮 Shadow Game

> *A puzzle-platformer where your only ally is who you were **2 seconds ago**.*

<p align="center">
  <a href="https://haseeb35.github.io/Shadow-Game/">
    <img src="https://img.shields.io/badge/🕹️%20PLAY-NOW-%2300FF87?style=for-the-badge&logo=gamepad&logoColor=white&labelColor=000&color=00FF87&label=PLAY" alt="Play Now"/>
  </a>
  <a href="https://haseeb35.github.io/Shadow-Game/">
    <img src="https://img.shields.io/badge/🌐%20LIVE-%23FF0066?style=for-the-badge&logo=github-pages&logoColor=white&labelColor=FF0066&label=LIVE&color=FF0066" alt="Live Demo"/>
  </a>
  <a href="https://github.com/Haseeb35/Shadow-Game">
    <img src="https://img.shields.io/badge/⭐%20STAR-%23FFD700?style=for-the-badge&logo=github&logoColor=white&labelColor=FFD700&label=STAR&color=FFD700" alt="GitHub Stars"/>
  </a>
</p>

<p align="center">
  <a href="https://haseeb35.github.io/Shadow-Game/">
    <img src="https://img.shields.io/badge/🔴-LIVE-%23FF0000?style=for-the-badge&logo=live&labelColor=FF0000&color=FF0000&label=ONLINE&logoColor=white" alt="Live Online"/>
  </a>
  <a href="https://haseeb35.github.io/Shadow-Game/">
    <img src="https://img.shields.io/badge/🎯-OPEN%20GAME-%2300FFFF?style=for-the-badge&logo=target&logoColor=white&labelColor=00FFFF&label=PLAY&color=00FFFF" alt="Open Game"/>
  </a>
  <a href="https://github.com/Haseeb35/Shadow-Game/stargazers">
    <img src="https://img.shields.io/github/stars/Haseeb35/Shadow-Game?style=for-the-badge&color=FFD700&labelColor=24292F&logo=github&label=Stars&logoColor=white" alt="GitHub Stars"/>
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-100%25-%23F7DF1E?style=for-the-badge&logo=javascript&logoColor=black&color=F7DF1E" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/Canvas-API-%23000?style=for-the-badge&logo=html5&logoColor=white&color=000" alt="Canvas"/>
  <img src="https://img.shields.io/badge/WebAudio-Sound-%23FC3D39?style=for-the-badge&logo=webaudio&logoColor=white&color=FC3D39" alt="WebAudio"/>
  <img src="https://img.shields.io/badge/MIT-License-%23000?style=for-the-badge&logo=open-source-initiative&logoColor=white&color=000" alt="MIT License"/>
</p>

<p align="center">
  <a href="https://haseeb35.github.io/Shadow-Game/">
    <img src="https://img.shields.io/badge/▶️%20START%20GAMING-%23FF4500?style=for-the-badge&logo=play-circle&logoColor=white&labelColor=FF4500&labelColor=FF4500&color=FF4500&label=PLAY%20NOW&label=white&logo=play" alt="Start Gaming"/>
  </a>
</p>

Your shadow replays your exact movements — every jump, every step — two seconds late. You cannot touch it and it cannot touch you, but it *can* hold switches, open shadow-only doors, block patrolling guards, absorb turret fire, and shatter fragile floors. Plan ahead, then let your past self do the work.

Your shadow replays your exact movements — every jump, every step — two seconds late. You cannot touch it and it cannot touch you, but it *can* hold switches, open shadow-only doors, block patrolling guards, absorb turret fire, and shatter fragile floors. Plan ahead, then let your past self do the work.

## Play

Open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari).
The game also works when opened directly via `file://`, thanks to the embedded
level data fallback.

- **Move** — Arrow keys / `A D`
- **Jump** — `Space` / `W` / `ArrowUp` (tap for short hop, hold for full height)
- **Fast-fall** — `S` / `ArrowDown` while airborne
- **Pause** — `P` / `Esc`
- **Restart** — `R`
- **Mute** — `M`
- **Touch** — on-screen buttons plus swipe-up to jump

## The mechanics

| Object | Player | Shadow |
| --- | --- | --- |
| Switch pad | presses it | presses it too (some pads are shadow-only) |
| Player-only pad | presses it | ignores it |
| Door | blocked | passes through and opens it via pads |
| Locked door | opens it with a golden key | passes through once open |
| Golden key | picks it up and carries it | — |
| Light-gate | blocked | activates it by standing on its projector |
| Fragile floor | safe | cracks and shatters it |
| Spring | bounces off it | bounces off it too |
| Moving platform | rides it | rides it too |
| Guard (walker) | stomp or avoid | blocks it and makes it turn |
| Chaser | outrun, or stomp it | blocks it and makes it turn |
| Bat (flyer) | avoid | blocks it |
| Watcher eye | dodge its aimed bolts | absorbs the bolts |
| Turret bolt | deadly | absorbs it |

Everything is puzzle-first: to reach the goal you must first *be* somewhere so
that, two seconds from now, your shadow is there too.

## Levels

1. **First Steps** — doors and pads
2. **The Echo** — leave your shadow on the switch
3. **Blocked** — the shadow-only toggle and a guard
4. **Keyed Entry** — golden keys and locked doors
5. **Fragile Ground** — a floor that fears your shadow
6. **The Locked Light** — shadow-activated gates
7. **Spring Heels** — springs and a moving platform
8. **Keep Out** — turrets, a player-only switch, and the shadow as a shield
9. **The Gauntlet** — guard, gate, platform, and a chaser
10. **Predators** — a chaser, bats, and a watcher eye
11. **The Vault** — two locks and a timed door
12. **The Longest Echo** — everything at once

Best times and unlocked levels are saved in `localStorage`.

## Project layout

```
index.html            game shell + touch controls
style.css             fullscreen canvas + mobile UI
src/audio.js          procedural WebAudio sound
src/level.js          tile grid, collision, level loader
src/entities.js       pads, doors, gates, keys, springs, platforms, enemies, turrets
src/player.js         physics + character rendering
src/shadow.js         the 2-second replay system
src/ui.js             menus, HUD, hints, overlays
src/main.js           game loop, camera, particles, rendering
levels/level1-12.json level data
levels/embedded.js    generated fallback (runs via file://)
tools/gen-levels.js   generates all 12 levels from their specs
tools/build-embedded.js  regenerates the embedded fallback
tools/validate-levels.js structural checks for every level
tools/sim-test.js     headless mechanics simulation tests
```

## Regenerating the levels

After editing the level specs in `tools/gen-levels.js`:

```sh
node tools/gen-levels.js       # writes levels/level1-12.json
node tools/build-embedded.js   # regenerates the embedded fallback
node tools/validate-levels.js  # structural checks
node tools/sim-test.js         # mechanics simulation tests
```

## Notes

- No dependencies, no assets, no network — 100% vanilla JS + Canvas.
- The level grid is 32px per tile; rows are padded to the longest row, so keep
  every row the same length for readability.
