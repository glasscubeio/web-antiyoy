# Antiyoy Web

A browser port of [Antiyoy](https://play.google.com/store/apps/details?id=yio.tro.antiyoy) — the hex-based turn strategy game by **yiotro** — rebuilt in TypeScript/React with aggressive AI opponents, organic map generation, and full mobile support.

**Live:** [antiyoy.glasscube.uz](https://antiyoy.glasscube.uz)

---

## Gameplay

Capture hexagonal territory, grow your economy through provinces, and destroy every opponent's capital.

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
- **Province split**: if you lose tiles that divide your territory, each fragment of ≥ 2 tiles gets its own capital and separate economy. Single isolated tiles are immediately abandoned.
- **Elimination**: destroy a player's last capital to eliminate them.

### Game Modes

- **1 vs 1** — you versus one AI opponent.
- **Multi Enemy** — up to 3 AIs on small maps, 6 on medium, 9 on large (everyone takes turns round-robin). Click **New Game** to choose.

### Controls

**Desktop**

| Action | Key(s) |
|--------|--------|
| Select / move unit | Click tile |
| End turn | **Enter** or **J** |
| Undo / cancel action | **Backspace**, **U**, or **Delete** |
| Cancel action only | **Esc** or **Z** |
| Cycle soldiers | **S** (peasant → spearman → knight → baron → cancel) |
| Cycle structures | **T** (farm → tower → strong tower → cancel) |
| Direct unit buy | **1 / 2 / 3 / 4** |

**Mobile**

- **Soldier button** (bottom-right): tap to cycle through ranks; tap end to cancel.
- **Structure button**: tap to cycle farm → tower → strong tower; tap end to cancel.
- **▶ End Turn** button.
- **↩ Undo/Cancel** button (bottom-left, appears when needed).
- **?** button opens the in-game rules reference.
- Pinch-to-zoom and drag-to-pan on the map.

### Settings

Click **⚙ Settings** (desktop top-right, or ⋮ menu on mobile) to:
- Choose your **army color** — takes effect on the next new game.
- Toggle **sound effects** and **music**.

### Map Generation

Maps use organic radial + sinusoidal boundary generation with peninsula blobs — each map looks different. Larger maps use more Fourier modes, creating more complex coastlines with bays and peninsulas.

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
    constants.ts     — unit/structure stats, map sizes, economy constants, color palettes
    mapGenerator.ts  — organic hex map: radial+sinusoidal boundary, peninsula blobs
    gameEngine.ts    — pure state machine (move, buy, capture, economy, fixProvinces)
    ai.ts            — AI turn runner (phase 1: move, phase 2: buy+attack-spawn)
    sound.ts         — singleton audio cache with browser autoplay handling
  components/
    HexGrid.tsx      — SVG renderer, zoom/pan, defense chain visualizer
    TopBar.tsx       — desktop nav + mobile collapsible menu + settings/rules buttons
    BottomPanel.tsx  — desktop buy/undo panel with keyboard hints
    MobileControls.tsx — floating mobile action buttons + rules shortcut
    GameOverlay.tsx  — win screen → opens new game modal
    LogPanel.tsx     — action log sidebar
  hooks/
    useGame.ts       — game loop, AI orchestration, undo stack, keyboard shortcuts
  types/index.ts     — shared TypeScript types
  App.tsx            — modals: New Game (mode + enemy count), Settings, Rules
```

**Key design choices:**
- All game state is plain JSON — `cloneState()` deep-clones for every mutation, making undo trivial and eliminating shared-reference bugs.
- Province identity is structural (flood-fill), not stored — `fixProvinces` re-derives it after every capture.
- Fragments with < 2 tiles are automatically abandoned (single isolated cells cannot sustain a capital).
- Each connected province has its own gold pool — separated territory runs completely independent economies.
- AI runs async with small `sleep()` delays so the UI stays responsive during enemy turns; multi-AI games each run in sequence.
- Tower defense visualization chains through adjacent towers up to distance 2.

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
