# Hosted AWBW integration

The normal flow is open [Field Command](https://awbw-gba.netlify.app), sign into an existing AWBW account, choose a game and play in the handheld interface. Friends use their own accounts. Earlier browser packages are optional fallbacks; players collect no assets.

## Verification evidence

- GitHub `main` deploys the static app and Netlify Functions automatically.
- The owner confirmed positive real-account sign-in, their game list, and the hosted map, units, CO and funds.
- A real hosted read confirmed AWBW's `JoinRoom.playerId` equals the authenticated viewer. This probe sends no game commands.
- Netlify Blobs health exercises duplicate, stale and successful conditional writes with strong reads, then removes its probe.
- A TLS-verified, public calculator POST using synthetic Infantry inputs returned native damage and counterattack ranges. It used no account cookies or game ID and issued no order.
- Local server/browser fixtures cover native inspection, calculator payloads, Move/Wait, Capture, Build, Fire, End, turn revocation, rejected/uncertain outcomes and one submission under concurrent/duplicate requests.

**No accepted real order from the hosted controls has been verified.** The owner's current match was on the opponent's turn during development. Verification must use an ordinary order on the owner's next turn, then check the native event and fresh battlefield. Controlled fixtures do not establish live-server acceptance, a second friend's account or physical Safari/Android behavior.

## Account service

`POST /api/awbw/account?action=login` uses the reviewed native `/logincheck.php` form-encoded request. Both its `1` response and a signed-in Your Games page are required. HTTP 200 alone is insufficient. Passwords are neither saved nor logged.

Each player has a separate upstream cookie jar encrypted with AES-GCM in an eight-hour Secure/HttpOnly/SameSite app cookie. `FIELD_COMMAND_SESSION_KEY` is a private Functions secret. The administrative Netlify token never reaches the frontend. JSON POSTs require the exact app origin and the signed session's CSRF token.

GET `session` and `games` return account/session information and owned game links. POST `logout` clears this app session; it does not log out a separate AWBW browser tab. Expired gameplay sessions return to hosted sign-in with the requested game retained; returning to it requires membership in the fresh game list.

## Viewer-specific battlefield and previews

GET `game` verifies membership and the actual authenticated viewer. It parses curated JSON declarations without executing upstream HTML or scripts. Fog-hidden enemies, submerged enemies and cargo are excluded. The native terrain renderer and bundled art render the entitled view. Missing unit art uses a fixed, cookie-free same-origin image endpoint.

GET `inspect` uses reviewed AWBW movement, terrain, fuel and range helpers. POST `forecast` calls the fixed native calculator endpoint with the reviewed payload and returns typed damage/counter ranges. Both are read-only. Practice rules never determine real orders. Public DTOs omit raw account records and hidden unit IDs.

## Hosted orders

POST `plan` produces a signed, expiring offer for the selected unit, production property or turn. It binds account, session, game, native world version and offered choices. The client sends the token and selected choice, never an arbitrary wire command.

POST `commit` reserves that offer and claims a persistent per-account/game gate using conditional Netlify Blobs writes. Separate function instances and sign-ins share the gate. A short-lived outbound AWBW socket must confirm the exact viewer through JoinRoom. Immediately before sending, the service re-reads the authenticated game and recomputes the native offer. It sends one native frame, with no automatic retry.

A matching typed event is followed by a fresh authenticated battlefield read. If the map has not caught up, the gate stays pending; a later refresh can reconcile the stored event and visible result without sending another order. Unknown outcomes stay locked: elapsed time or a guessed map change cannot authorize a retry. Private readback expectations remain in the server receipt and never enter the API or public health.

Current commands are **Move/Wait, Capt, Build, Fire and End**. Native movement costs, path adjacency, ownership, current turn, spent state, capture eligibility, funds, CO prices, bans/labs, ammo and target eligibility are checked. Indirect Fire uses the native empty path. Teleport routes and unsupported actions are rejected. CO powers, transport, silos, pipe-seam attacks and tag turns still require the original controls.

Netlify Functions do not host a persistent socket server. This implementation opens a single-order outbound socket and catches up through fresh HTTP game reads. Authentication is verified live; acceptance of new orders remains the outstanding check.

## Diagnostics and deployment

GET `/api/awbw/status` performs fixed public reads and returns sanitized client/transport/storage health. It accepts no arbitrary upstream URL, account password or command. `lastHostedRead` records parse/socket/turn status; `lastHostedOrder`, once present, records outcome, whether one frame was submitted and whether readback matched. These records omit accounts, game IDs, cookies, coordinates and board data.

The securely bound `NETLIFY_AUTH_TOKEN` is restricted to `api.netlify.com` for deployment inspection. A masked saved field alone is not proof of access; runtime read-only API access has been verified. Deployment smoke tests use TLS-verified response replay because Chromium lacks this cloud proxy's CA. Optional unpacked-extension testing is blocked by managed browser policy and is not passed.
