# AWBW-GBA-MOBILE

This repository is the active home for Field Command. Work at its root; do not make new AWBW changes in the earlier storage repository. Preserve private snapshot/inspection exports outside Git.

Install with `npm ci` (use `--cache /tmp/field-command-npm-cache` in this cloud). Build with `npm run build`. Start the local server with `npm run dev`, then run `npm test`. Netlify uses `main`, repository root, Node 22, build command `npm run build`, publish directory `dist`.

If another project already uses port 5173, run `PORT=5175 npm run dev` and `FIELD_COMMAND_BASE_URL=http://localhost:5175 npm test` to test this checkout. Do not accidentally test the old storage server.

The product target is open Netlify → sign in → play on iPhone/Android, with no player-side installation. The site now opens its hosted sign-in form. Login/session isolation and game lists have fixture coverage; positive real-account access is awaiting user sign-in. Hosted live orders are incomplete. Existing userscripts/extensions are an optional fallback. Work toward a hosted per-player session service, never store AWBW passwords or the administrative Netlify token in frontend files. Read docs/hosted-integration.md before changing authentication or transport.

Existing browser integration uses the player's own authenticated AWBW page/socket. Keep server validation, ownership checks, stale/duplicate guards and fog filtering. Choosing an action submits it directly; the user rejected additional opt-in/confirmation dialogs. A target selection/damage preview followed by Fire is an action selection, not an extra confirmation dialog. Never use practice damage calculations to issue real AWBW orders.

Real phone/browser-add-on and live-server execution remain unverified. Fixture tests and retained recordings do not establish those outcomes. The optional `npm run test:extension` is blocked in this managed cloud browser by policy disallowing unpacked extension installation.

Each cloud task already has an isolated checkout. Do not create a Git worktree unless the user explicitly requests one.
