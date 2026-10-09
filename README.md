# Field Command

A GBA-style mobile interface for your existing **Advance Wars By Web** account, games and opponents.

**[Open Field Command](https://awbw-gba.netlify.app) → sign in with your AWBW account → open a game.** Your friend uses the same link and their own account. No extension, downloads or asset collection are needed.

## Playing

- Tap a ready unit to preview its movement range, then choose a destination and **Wait**, **Capture** or **Damage check → Fire**.
- Tap an empty production property you own to choose a unit and see its price.
- Use **Move range**, **Attack range** and **Info** to inspect units. Damage previews show AWBW's damage and counterattack ranges.
- **B** backs through previews without moving a unit. **A** selects the highlighted action; the D-pad moves the cursor or menu selection.
- Open **Menu** for the unit roster, refresh and **End AWBW turn**. Choosing an order sends it once, without another confirmation dialog.

The map updates from AWBW and keeps your pan position. When no turn is waiting, the lobby opens **All Games**. After session expiry, signing in returns you to your game.

## Current status

**Early preview.** Real sign-in, the owner's game list, battlefield, units, CO and funds have been confirmed. The hosted backend also verified AWBW's authenticated player connection.

Hosted **Move/Wait, Capture, Build, Fire and End Turn** have server and browser fixture coverage. **An accepted real gameplay order from these hosted controls still needs verification on the owner's next ordinary turn.** Fixture success does not establish live-server acceptance or real iPhone/Android behavior.

CO powers, transport actions, silos, pipe-seam attacks, tag turns and teleport paths are not available in the hosted controls yet. **AWBW controls ↗** in the menu opens the original game for those actions. Local practice uses simplified rules; real-game previews use AWBW's native movement helpers and calculator.

## Development

Requirements: Node **22.12+**, Python 3, Python Playwright and Chromium.

```sh
npm ci
npm run build
npm run dev
```

With the local server running:

```sh
npm test
```

If port 5173 is occupied, start `PORT=5177 npm run dev` and test with `FIELD_COMMAND_BASE_URL=http://localhost:5177 npm test`. Check the process working directory before reusing a server; the earlier storage project may still be running.

Tests cover account/session isolation, fog filtering, native ranges and calculator contracts, mobile flows, stale/duplicate orders, server outcomes and bundled assets. They use controlled accounts and game responses and issue no real AWBW orders.

Netlify deploys `main` from the repository root with `npm run build`, `dist`, and Node 22. Functions need the private `FIELD_COMMAND_SESSION_KEY`; passwords are not stored or logged. Never add credentials or private game exports to Git.

`npm run test:deployment` fetches deployed responses with verified TLS and renders those bytes in Chromium. This cloud browser lacks the proxy CA, so the test uses response replay and does not claim a direct Chromium HTTPS connection.

See [hosted integration and verification](docs/hosted-integration.md), [visual references](docs/gba-visual-references.md) and [optional browser packages](docs/legacy-browser-integration.md). Development belongs in this standalone repository; the earlier storage copy is preserved. Artwork source URLs and hashes are in [assets/catalog.json](assets/catalog.json); availability on AWBW does not establish redistribution permission.
