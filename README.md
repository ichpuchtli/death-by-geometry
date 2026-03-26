# Death by Geometry

A fast-paced arcade shooter inspired by [Geometry Wars](https://en.wikipedia.org/wiki/Geometry_Wars). Survive endless waves of geometric enemies, rack up points, and see how long you can last.

**Play now:** [https://ichpuchtli.github.io/death-by-geometry/](https://ichpuchtli.github.io/death-by-geometry/)

## About

Death by Geometry started as a Python/Pygame desktop game and has been reborn as a browser-based experience with WebGL rendering, bloom post-processing, and dual-stick touch controls for mobile.

The original game was written by Sam Macpherson using Python 2 and Pygame — a love letter to the frenetic neon chaos of Geometry Wars. This web port faithfully recreates the gameplay while adding modern visual effects and mobile support.

### Original Python Version (2013)

![Original Screenshot](http://i.imgur.com/SZOcEMb.png)
![Original Screenshot](http://i.imgur.com/tXiEBnk.png)
![Original Screenshot](http://i.imgur.com/ocPjulM.png)

The original used sprite-based rendering with Pygame, custom vector math, and a particle system. It ran fullscreen on desktop with keyboard + mouse controls.

## How to Play

| Input | Desktop | Mobile |
|-------|---------|--------|
| Move | WASD | Left stick |
| Aim | Mouse | Right stick |
| Shoot | Left click | Right stick deflection |
| Mute | M | — |

Destroy enemies to score points. Your weapons upgrade automatically as your score increases:

| Score | Weapon |
|-------|--------|
| 0 | Single shot |
| 10,000 | Faster fire rate |
| 25,000 | Dual shot |
| 50,000 | Faster dual shot |
| 150,000 | Triple shot |

## Enemy Types

- **Rhombus** — Basic tracker, follows you relentlessly
- **Pinwheel** — Bounces off walls, unpredictable movement
- **Square** — Splits into two smaller squares on death
- **Circle** — Fast and aggressive, spawned by bosses and large enemies
- **Triangle** — Spawns a ring of circles when destroyed
- **Octagon** — Tough, leads its shots, spawns circles on death
- **DeathStar** — Boss enemy. Takes 20 hits. Attracts nearby enemies. Spawns circles

## Web Version

Built with TypeScript and WebGL, bundled with Vite. Installable as a PWA for fullscreen play on mobile.

### Run locally

```bash
cd web
npm install
npm run dev
```

### Build

```bash
cd web
npm run build
```

## Original Python Version

Requires Python 2.x and Pygame 1.9.x.

```bash
python app.py
```

## License

MIT License

## Author

Sam Macpherson
