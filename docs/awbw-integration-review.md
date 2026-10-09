# AWBW integration review — source evidence, not independent server verification

Reviewed the user's `awbw-inspection-1741140.json` and `awbw-snapshot-1741140.json`. Raw uploads and account-specific snapshots are not committed to the repository.

## Findings from the supplied public source

- `/js/lib/game.js` creates `new WebSocket(`${wsUrl}/${wsServerBranch}/game/${gameId}`)` and sends JSON through `emitData(socket, data)` → `socket.send(JSON.stringify(data))` (around lines 1345 and 3071).
- HTTP `POST /api/game/fetch_actions.php` receives `{ gameId, stateTime }` and returns actions missed while connecting (around line 1425). It is not the move submission endpoint.
- Wait/move sends `{ action: 'Move', path, playerID, unitID }` (around line 1967). Paths are numeric nodes, converted through `x = node % maxX`, `y = floor(node / maxX)`.
- Capture sends `{ action: 'Capt', path, playerID, unitID }` (around line 1872).
- Attack sends `{ action: 'Fire', attacker: { playerID, unitID, path }, defender: { playerID, unitID } }` (around line 2465). Pipe seam attacks use a separate action.
- Purchase sends `{ action: 'Build', playerID, unitID, buildingID }` (around line 2852). This unitID identifies a generic purchase type, not an existing battlefield unit.
- End turn sends `{ action: 'End', playerID }` (around line 7567); response handling includes the `NextTurn` action. An outgoing End must not be treated as an acknowledged NextTurn.
- Server WebSocket messages are parsed as JSON. Errors use `err`. Successful messages are iterated by object key and their events queued for response handlers (around lines 1374–1388). A transport send is not proof that the server accepted an order.
- `/js/lib/map_renderer.js` renders terrain to a canvas, at 16 logical pixels per tile. The official selector is `#map-background`, inside `#gamemap`. Fog is a separate `#fog-canvas` layer at z-index 104; terrain is at 99. Buildings and units are DOM overlays.

## Problems caught in our first bridge

The uploaded HTTP evidence contains four requests and **no actual order submission/acknowledgment**. Our original inspector missed WebSocket traffic entirely. The snapshot contains only 72 sprite layers, lacks the terrain canvas, and includes sidebar icons; its 32×19 bounding box is not reliable map geometry.

Version 0.3 therefore observes native WebSocket sends and receives, and captures the official terrain/fog canvases plus visible map images into a pixel frame using the canvas's native dimensions. Sidebar elements are excluded by the known map root. It exports no cookie/header values and creates no sockets or orders of its own. Legacy heuristic capture remains only for nonstandard fixtures/pages without the known canvas.

The pixel frame is a read-only mirror, not structured state for issuing orders. It refreshes periodically; it does not promise smooth unit animations or independently verified fog rules. Screenshot capture can fail if the browser marks the canvas as tainted. Such failure is reported rather than silently dropping the canvas.

## Verification status

- Official frontend source contracts: reviewed.
- Local movement/combat/capture/purchase/turn engine: tested, simplified practice rules only.
- Canvas dimensions, fog stacking, sidebar exclusion, WebSocket observation, sanitization, and zero additional sends: tested with a source-shaped browser fixture.
- Real server acknowledgments for native orders: not present in this export.
- Authentication, active-player permissions, stale turns, duplicate submissions, game reconnection, and independently submitted orders: **not server verified**.

Live orders stay disabled. Deployment remains on hold per the user's request.

## Next evidence

Install the updated bridge, reload the same game, and export another snapshot/inspection. It now captures the canvas and WebSocket traffic. Use the official game normally if desired; do not take an extra irreversible match action solely for collection. Observe order requests/response events when ordinary play provides them, or use a designated test match for controlled verification. No password or Netlify deployment is needed.

## Follow-up export validation

The next supplied export contains a `field-command-snapshot-v2` PNG frame at **21×19 logical tiles**, and the entire original terrain/fog/building/unit image is present. Importing that real snapshot into the handheld client renders 399 read-only tiles and keeps order controls disabled. The WebSocket hook recorded three incoming messages: Pause, JoinRoom, and ActivityUpdate. There are no outgoing commands or Move/Fire/Capt/Build/NextTurn server outcomes in this capture. Thus canvas capture and passive connection observation are confirmed on the actual site; independent gameplay remains unverified.

Version 0.4 also extracts unit details from known `.game-unit[data-unit-id]` elements and the official `unitsInfo` fields (ID, owner, x/y, unit name, HP/fuel/ammo, moved flag). Units beneath the fog layer on a masked tile are excluded from structured details. It exposes only read-only player/turn IDs and always forces `canSendOrders: false`. Those new details are tested with source-shaped fixtures, not claimed to be verified by the older real export.

## Ordinary-turn recording reviewed 2026-10-09

The latest supplied recording contains 27 WebSocket frames: 12 outgoing gameplay commands and 15 incoming events. The gameplay sequence is six Move, three Capt, two Build, and one End. Each outgoing command is immediately followed (among gameplay frames) by the expected event; End is followed by NextTurn. Four Move responses retain samples whose unit ID and entire coordinate path exactly match the sent flattened path using the 21-tile map width. The remaining events retain schemas, so their individual unit/building results cannot be checked numerically. No Fire/combat command is present. No rejection event is observed; absence of rejections does not verify error handling.

Both standalone and inspection snapshots pass the client validator as 21×19 maps on day 12. These exports do not include structured `game` unit/player metadata, so they cannot validate the newer bridge's unit-detail extraction or active-player identity checks. Private exports are kept outside the repository.

This confirms native official commands and corresponding server-event shapes during real play. Sequence correlation is not a unique acknowledgment ID, and it does not verify independently submitted orders, replay protection, stale-state handling, or reconnection behavior. The review CLI now reports WebSocket event matches separately from HTTP success flags, which are inapplicable to these socket events. Live orders remain disabled and Netlify deployment remains on hold. A separate test match is unavailable; further integration should use the existing official browser session and local replay/preview validation before proposing any live command.

## Version 0.5: orders through the original session, mobile first

Earlier disabled-order statements above describe older builds. This version reuses the official authenticated socket and reviewed rule helpers; it does not create an independent backend session. Opening Field Command activates this bridge implicitly. The user requested direct gameplay, so there is no tab opt-in or per-order confirmation dialog. Choosing Wait/Capture, a purchase, or End Turn issues the action once. Unit/destination selection remains a reversible preview.

The bridge alone creates short-lived preview tokens and commands. The client cannot supply its own player ID, path or raw order body. Immediately before emission it rechecks the current player, socket, replay/animation/queue status, own-unit state, funds/version and recomputed official eligibility. Every observed gameplay frame invalidates previous proposals. Duplicate request IDs are consumed once. Only one order can wait for an outcome; unrelated native activity prevents ambiguous correlation. Timeout, synchronous send failure and disconnect lock further orders with no retry. Server errors are distinct from uncertain outcomes. Correlation checks the moved unit/owner, capture tile, new unit owner/name/tile, or changed NextTurn player; no unique server request-ID guarantee is claimed.

The self-contained mobile userscript now includes the client and original artwork, launches in the same AWBW tab, and reads the native Your Games/Your Turn lists. It uses page-context injection and can attach to a socket created before injection. Phone viewport sizing is restored when returning to original controls. Safari Userscripts/iPhone and a Firefox Android userscript manager are the intended install routes; their real-device behavior remains unverified. A separate static login iframe cannot expose AWBW cookies or DOM to the hosted app through normal cross-origin browser access.

24 Node checks and eight Chromium browser flows pass, including direct Move/Capture/Build/End messages, matching events, rejection, source/origin checks, stale/duplicate prevention, bundled images, mobile viewport, preserved cursor, read-only imports and game-list sanitization. These are controlled fixtures; AWBW live-server execution from these new controls and iOS Safari remain unverified. Combat, powers, transport, tag turns and teleport paths use original controls. An optional Chrome MV3 package exists for desktop; loading it in this cloud browser is blocked by administrator policy (`Loading of unpacked extensions is disabled by the administrator`), so its installation test is not passed. Deployment remains on hold and private uploads are not committed.

## Standalone repository migration

The project now lives at the root of `alphastack1/AWBW-GBA-MOBILE`, on `main`. The user has authorized connecting it to `https://awbw-gba.netlify.app`; previous deployment-hold statements describe earlier work. Netlify publishes the static site, scripts and shared downloads. This does not remove the local browser integration requirement or establish real phone/live-order verification. Private exports were excluded from the migration, and the storage copy was preserved.
