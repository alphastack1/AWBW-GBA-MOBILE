# Optional browser integration

Use the [hosted app](https://awbw-gba.netlify.app) for the normal mobile flow. These earlier packages are an optional fallback for development. Hosted Fire is separate from the four-action native-page bridge described below.

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


## Optional desktop Chrome extension

```sh
npm run package-extension
```

Extract `field-command-chrome.zip`, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`. The popup opens your AWBW games/account; the game uses the same handheld interface. Disable the userscript when using the extension to avoid duplicate hooks. This package is for desktop Chrome, not phone Chrome.

`npm run test:extension` exercises an actual MV3 installation separately. This cloud browser's administrator policy blocks loading unpacked extensions, so that installed-extension test is **blocked, not passed** here. The package is an optional preview; it has not been published to the Chrome Web Store.

