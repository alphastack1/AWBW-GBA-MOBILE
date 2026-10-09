# Hosted AWBW integration

The accepted product flow is the same for the owner and their friend: open `https://awbw-gba.netlify.app`, sign in to an existing AWBW account, choose a game and play through the handheld interface. Players should not install an extension/userscript or collect assets. Earlier browser-integration packages are an optional development fallback, not the target onboarding experience.

## Verified

- The standalone GitHub repository deploys static files and Netlify Functions automatically.
- A deployed function receives HTTP 200 from AWBW's public home, Your Games and the supplied game page.
- Public login uses client-side bindings, so the HTML form's default method/action alone is not a login contract. Diagnostics collect input bindings and sanitized client structure without cookies or values.
- The game client uses an AWBW WebSocket for orders; `fetch_actions.php` is a catch-up read endpoint. Sending an HTTP move request to a guessed endpoint would not implement the native protocol.
- The diagnostic function checks a fixed anonymous WebSocket upgrade and closes the connection immediately. It never sends game frames. A successful anonymous connection is separate from authenticated order eligibility.
- Local handheld UI and bridge fixtures exercise direct actions, single submission, stale state, server rejection and uncertain outcomes. They do not establish live-server success.

## Hosted account service

The site's entry page is now the sign-in form. `POST /api/awbw/account?action=login` follows the reviewed native `/logincheck.php` form-encoded username/password request and requires both its `1` response and a signed-in Your Games page. HTTP 200 by itself cannot establish a session. Positive real-account access still needs a player sign-in; fixture success is not that check.

`GET` actions `session` and `games` return the current player and their game list. `POST logout` requires the app's CSRF token and clears its session. It does not log out the player's separate AWBW browser tab. Passwords are not saved or logged. Upstream cookies are encrypted with AES-GCM in an eight-hour Secure/HttpOnly/SameSite application cookie; each player has a separate cookie jar. Netlify's `FIELD_COMMAND_SESSION_KEY` is a private Functions secret. The administrative Netlify token is never supplied to the app.

The mobile form, rejected credentials, separate player sessions, tamper/expiry rejection, escaped game titles, filters and logout are covered by local checks. Game links currently open AWBW's original controls. Hosted gameplay has not been implemented or verified yet.

## Backend work required

1. Exercise the deployed form with a player's real AWBW account. The login contract and session isolation are implemented and fixture-tested; verify accepted credentials and the actual account page/cookie behavior before claiming real sign-in works.
2. Verify the real Your Games/Your Turn lists and session expiry/logout with that account and a second player's account.
3. Read authenticated game/account data through that session and preserve AWBW's player/fog visibility. Render only data that this authenticated viewer is entitled to see.
4. Verify an authenticated socket handshake and typed outcomes. Netlify Functions cannot act as a persistent WebSocket server. Test short-lived outbound socket connections for a single order with HTTP catch-up reads; if AWBW's authentication/connection model requires a persistent gateway, add that hosted service. Do not assume either approach works before exercising the real protocol.
5. Keep exact current-player, ownership, path, funds and state checks, a single pending command, no automatic gameplay retries, and explicit rejected versus uncertain results. Never expose an arbitrary upstream URL proxy.
6. Verify ordinary authenticated play and Safari/Android behavior before calling this a live replacement. Combat, powers and transport need their real AWBW rule/data contracts; practice forecasts are not suitable for live orders.

## Deployed diagnostics

`GET /api/awbw/status` performs fixed, public, read-only requests. It returns status and sanitized public client metadata, never login passwords, cookie/header values or game orders. Non-GET requests receive 405. It is a development check, not an account API or a sign-in success indicator.

Agent observability uses a securely bound `NETLIFY_AUTH_TOKEN` restricted to `api.netlify.com`. A saved field or masked screenshot is not proof of runtime access; verify a read-only Netlify API request before using it to inspect deploys or modify site configuration.
