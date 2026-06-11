# Antiyoy Web

A browser port of [Antiyoy](https://play.google.com/store/apps/details?id=yio.tro.antiyoy) — the hex-based turn strategy game by **yiotro** — rebuilt in TypeScript/React with an aggressive AI opponent and full mobile support.

**Live:** [antiyoy.glasscube.uz](https://antiyoy.glasscube.uz)

---

## Gameplay

Capture hexagonal territory, grow your economy through provinces, and destroy your opponent's capital.

### Economy

Each owned tile generates **1 gold/turn**. Farm tiles generate **4 gold/turn** but cost more as you build more (inflation). Soldiers cost upkeep every turn — overextend and your army starves.

| Unit | Strength | Cost | Upkeep/turn |
|------|----------|------|-------------|
| Peasant | 1 | 10 | 2 |
| Spearman | 2 | 20 | 6 |
| Knight | 3 | 30 | 18 |
| Baron | 4 | 40 | 54 |

| Structure | Defense | Cost | Upkeep/turn |
|-----------|---------|------|-------------|
| Capital | 1 | — | 0 |
| Tower | 2 | 15 | 1 |
| Strong Tower | 3 | 35 | 6 |
| Farm | 0 | 12+ | 0 |

### Rules

- **Attack**: move a unit onto an enemy tile if your unit's strength exceeds the tile's defense (unit + adjacent friendly structures).
- **Merge**: drop a unit onto a friendly unit to combine their strengths (max 4). Works even if the target already moved this turn.
- **Movement range**: peasants reach up to 3 hexes; all other ranks reach up to 4.
- **Farms** can only be built adjacent to a capital or another farm.
- **Towers** can be upgraded to Strong Towers by building on top of an existing tower.
- **Province split**: if you lose tiles that divide your territory, the weaker fragment loses its capital and gold.
- **Elimination**: destroy a player's last capital to eliminate them.

### Controls

**Desktop**

| Action | Control |
|--------|---------|
| Select / move unit | Click tile |
| End turn | **Enter** |
| Undo / cancel | **Delete** |
| Buy peasant / spearman / knight / baron | **1 / 2 / 3 / 4** |

**Mobile**

- Floating button stack (bottom-right): cycle soldier rank → cycle structure → end turn
- Floating undo/cancel button (bottom-left)
- Pinch-to-zoom and drag-to-pan on the map

---

## Tech Stack

| | |
|-|-|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS v3 |
| Rendering | SVG (pointy-top axial hex grid) |
| AI | Hand-written aggressive minimax-style heuristics |

### Architecture

```
src/
  lib/
    hexMath.ts       — axial coordinates, neighbors, pixel positions
    constants.ts     — unit/structure stats, map sizes, economy constants
    mapGenerator.ts  — procedural hex map with balanced starting positions
    gameEngine.ts    — pure state machine (move, buy, capture, economy, fixProvinces)
    ai.ts            — AI turn runner (phase 1: move, phase 2: buy+attack-spawn)
    sound.ts         — singleton audio cache with browser autoplay handling
  components/
    HexGrid.tsx      — SVG renderer, zoom/pan, defense chain visualizer
    TopBar.tsx       — desktop nav + mobile collapsible menu
    BottomPanel.tsx  — desktop buy/undo panel
    MobileControls.tsx — floating mobile action buttons
    GameOverlay.tsx  — win/lose screen
    LogPanel.tsx     — action log sidebar
  hooks/
    useGame.ts       — game loop, AI orchestration, undo stack
  types/index.ts     — shared TypeScript types
```

**Key design choices:**
- All game state is plain JSON — `cloneState()` deep-clones for every mutation, making undo trivial and eliminating shared-reference bugs.
- Province identity is structural (flood-fill), not stored — `fixProvinces` re-derives it after every capture.
- AI runs async with small `sleep()` delays so the UI stays responsive during the enemy turn.

---

## Local Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview production build locally
```

---

## Deployment (Vercel)

1. Push to GitHub.
2. Import the repo in [vercel.com](https://vercel.com).
3. Framework preset: **Vite** (auto-detected).
4. In your Vercel project → Settings → Domains, add `antiyoy.glasscube.uz` and point a CNAME at `cname.vercel-dns.com`.

No environment variables required.

---

## Credits

- Original game: **[Antiyoy](https://github.com/yiotro/Antiyoy)** by yiotro (Android, open-source)
- AI logic inspired by the original Java `AiMaster` implementation
- Web port: [Nodirbek Bokiev](https://glasscube.uz)
