# Field Command

A GBA-style browser interface for your existing Advance Wars By Web account and games. This is the standalone [AWBW-GBA-MOBILE](https://github.com/alphastack1/AWBW-GBA-MOBILE) repository. Future development happens here; the earlier storage copy is preserved.

## Intended mobile experience

The current goal is **open the Netlify link → sign in to AWBW → play your existing games**, on iPhone and Android, with no extension, userscript, downloads or asset collection for either player. The site now opens a hosted AWBW sign-in form. Its backend forwards the native login request and keeps a separate encrypted, expiring session for each player. Game lists come from that session. Positive real-account sign-in is awaiting a player check; hosted gameplay is still in development. The handheld battlefield is currently local practice.

The handheld interface now includes movement-route previews and animation, movement/threat overlays, a damage/counterattack forecast before Fire, terrain cover, unit intel, a unit roster, battle record, context-sensitive B/A controls and motion preferences. Forecasts and combat use simplified practice rules. They are not AWBW's damage calculator.

Netlify's read-only `/api/awbw/status` function reaches AWBW's public home, game list and game page. It collects sanitized login/client metadata and checks the anonymous socket handshake without credentials or game commands. Public page/handshake success does not verify authenticated login, account isolation or accepted gameplay orders. See [hosted integration status](docs/hosted-integration.md).

## Existing browser integration (optional fallback)

Use the same self-contained `awbw-bridge.user.js` on both platforms:

1. **iPhone/iPad:** Install [Userscripts for Safari](https://apps.apple.com/us/app/userscripts/id1463298887), enable it in Safari extensions, and allow it on `awbw.amarriner.com`. Open the `.user.js` download URL in Safari and choose the installation prompt in Userscripts. Alternatively save the file to the folder selected in the Userscripts app. This follows the project's [iOS installation guide](https://github.com/quoid/userscripts#ios-ipados).
2. **Android:** Use Firefox with [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/) or another page-context userscript manager available in your browser's add-on list, and install the same file. Chrome for Android does not run desktop Chrome extensions.
3. Disable the earlier Field Command bridge/dashboard script if installed, or replace its contents with the new bundle. Keep only one Field Command game script active.
4. Sign into AWBW normally in that browser, then open [Your Games](https://awbw.amarriner.com/yourgames.php). Field Command displays your game list. Open a game and its handheld view starts automatically in the same tab.

Each friend installs the same file and uses their own AWBW account. The 530 unique image files are included in the download; nobody needs the asset collector, an asset ZIP, a password shared with the developer, or Netlify. There is no tab opt-in or repeated order-confirmation dialog.

The interface is tested at a phone viewport with touch emulation in Chromium. **Real Safari/iOS and Android browser/add-on behavior remains to be checked on devices.** Extension injection timing, page CSP, storage availability, and browser suspension can differ. The bridge can attach to the official existing socket if the manager runs after page scripts. A normal browser bookmark is appropriate; a home-screen PWA may run without its browser add-on and cannot be assumed to work.

## Playing

Tap your ready unit, choose a highlighted destination, then tap **Wait** or **Capture**. Tap an empty production property you own and choose a unit to build. **Menu → End AWBW turn** sends the turn-ending order directly. Selecting a unit or destination only previews; choosing the action issues the real order once.

Movement paths and capture eligibility come from AWBW's existing rule helpers. Purchases use its unit list, bans, labs, CO cost multiplier and funds. Commands use the official page's already authenticated WebSocket through `emitData`. No separate socket, password store or rules clone is used for live play. Board updates come from AWBW, with fog and visible sprites preserved.

The bridge blocks spectators, other players' turns, spent/unseen units, replay mode, ongoing animations, queued updates, disconnected sockets, changed/expired previews, duplicate requests and overlapping submissions. An uncertain outcome after timeout or disconnect locks further orders until you inspect AWBW and reload. It never retries a game command automatically.

**Current live actions:** Move/Wait, Capture, Build, End. Combat, CO powers, transport actions, tag turns and teleport paths still use **AWBW controls ↗**, which returns to the original page in the same tab. This is not yet a complete live AWBW replacement.

Native real-game recordings confirm the outgoing shapes and corresponding event sequence for these four actions. The new adapter/UI is tested against controlled server/browser fixtures, **not yet against AWBW's live server from the new controls**. No new orders were issued to the user's live match during development. The static site is connected to Netlify; live-server verification remains outstanding.

## Development

Requirements: Node 22+, Python 3, Python Playwright and Chromium. From this folder:

```sh
npm ci
npm run dev
npm run build
npm test
npm run package-mobile
```

The server defaults to port 5173. Browser tests use the running server. If another project occupies that port, use `PORT=5175 npm run dev` and `FIELD_COMMAND_BASE_URL=http://localhost:5175 npm test` to test this checkout. Build generates the self-contained userscript, static site in `dist/`, and optional desktop extension in `extension-dist/`. The mobile archive contains the script and installation guide. User game exports stay outside the repository.

`npm test` covers practice, paths, cover/damage forecast consistency, mobile interactions, asset integrity/import, fog-filtered snapshots, official socket observation, origin/source checks, live order previews, direct Move/Capture/Build/End, rejection, cursor persistence, the same-tab mobile bundle and hosted diagnostic safety. These checks do not simulate a real iPhone or authenticate against AWBW.

`npm run test:deployment` fetches the deployed files with verified TLS and renders those exact responses and their CSP in Chromium. The cloud's proxy CA is missing from Chromium's trust store, so this replay checks deployed bytes and interface behavior; it does not verify Chromium's direct HTTPS connection. No certificate verification is disabled and no browser trust store is changed.

Review an export without sending anything:

```sh
npm run review-inspection -- /path/to/awbw-inspection.json
```

## Optional desktop Chrome extension

```sh
npm run package-extension
```

Extract `field-command-chrome.zip`, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`. The popup opens your AWBW games/account; the game uses the same handheld interface. Disable the userscript when using the extension to avoid duplicate hooks. This package is for desktop Chrome, not phone Chrome.

`npm run test:extension` exercises an actual MV3 installation separately. This cloud browser's administrator policy blocks loading unpacked extensions, so that installed-extension test is **blocked, not passed** here. The package is an optional preview; it has not been published to the Chrome Web Store.

## Netlify hosting

The connected site is [awbw-gba.netlify.app](https://awbw-gba.netlify.app). Deploy branch: `main`. Base directory: repository root (leave empty). Build command: `npm run build`. Publish directory: `dist`. Node 22 is pinned in `netlify.toml`.

`npm run package` also generates `field-command-site.zip` for manual Netlify Drop. Static hosting provides practice, downloads and optional cross-tab viewing; Netlify Functions provide the server-side integration work. A static page cannot read AWBW's cookies or control a cross-origin login iframe by itself. The current live bridge uses browser integration; the hosted account service keeps each player's separate AWBW session. The user manages the Netlify connection; pushing this repository can trigger its automatic deployments.

The earlier `operations.html` dashboard and asset workbench remain as development tools. The original images' authorship/reuse terms are not established by their availability on AWBW; source URLs and hashes remain in `assets/catalog.json`.
