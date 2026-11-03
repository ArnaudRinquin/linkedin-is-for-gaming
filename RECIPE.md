# Recipe: LinkedIn is for Gaming

How this extension is built and how to make your own. Written for an agent told "build me one of these". For install/usage see [README.md](README.md).

## Pitch

Chrome MV3 extension that reduces linkedin.com to its daily games (Queens, Tango, Zip, Mini Sudoku, Pinpoint, Crossclimb, Patches, Wend). Default **games-only mode**: every non-game page redirects to `/games/`, LinkedIn chrome is hidden, the hub gets a hero title and a full connections leaderboard under each game card. **LinkedIn mode** (one click): normal LinkedIn with a fixed game bar on top showing today's ✓, solve times and the next unplayed game. No permissions, no backend, no data collection: everything comes from LinkedIn's own API using the user's session. For people who open LinkedIn only for the puzzles.

## Ingredients

| Thing | For |
|---|---|
| Chrome (MV3) | Runtime. Content scripts only, zero `permissions` in `manifest.json` |
| Plain JS + CSS, no bundler | `redirect.js`, `games.js`, `games.css` load as-is |
| Node 20 + npm | Build zip, upload, asset generation |
| `zip` CLI | `npm run build` |
| `chrome-webstore-upload-cli` (dev dep) | Upload/publish to the Chrome Web Store |
| `playwright` (dev dep), installed Chrome | `npm run assets`: store screenshots + promo tiles (`channel: "chrome"`, no browser download) |
| Chrome Web Store developer account ($5) | Publishing |
| GitHub Actions | Tag-triggered release |
| A LinkedIn account | Testing; leaderboards need connections who play |

Secrets (names only):
- GitHub repo secrets: `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`. Mapped to env `EXTENSION_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` for the upload CLI in `.github/workflows/release.yml`.
- OAuth credentials generated with https://github.com/fregante/chrome-webstore-upload-keys (see `store/listing.md`).

## Architecture

```
linkedin.com page (document_start)
  ├─ redirect.js ── lifg_off cookie? no → non-game/non-auth path → location.replace("/games/")
  ├─ games.css  ─── hides chrome, gated on html.lifg-on / html.lifg-games
  └─ games.js
       ├─ sets html classes (lifg-on, lifg-games) at document_start → no flash
       ├─ fetch /voyager/api/graphql (same-origin, csrf-token = JSESSIONID cookie)
       │    ├─ voyagerIdentityDashGameEntryPoints  → per-game puzzleId, solved, hub order, memberId
       │    └─ voyagerIdentityDashGameConnectionsEntities → connections leaderboard (top 10)
       ├─ localStorage play:timeElapsed:(member,gameType,puzzle) → own solve time
       └─ render: hero (games-only, hub) | #lifg-bar (LinkedIn mode) | .lifg-lb under hub cards
```

Key files:
- `manifest.json`: one content script entry on `*://www.linkedin.com/*` and `*://linkedin.com/*`, `run_at: document_start`, js `redirect.js` + `games.js`, css `games.css`.
- `redirect.js`: allowlist regex (`games`, `login`, `checkpoint`, `uas`, `authwall`, `signup`, `m/logout`, `legal`, `psettings`), top frame only.
- `games.js`: `GAMES` map (gameTypeId → slug/name/icon), `HUB_QUERY`, `LB_QUERY_ID`, `fetchStates`, `fetchLeaderboard`, `timeFor`, `render`, `renderHero`, `decorateHub`, `liftToolbar`, `flipMode`.
- `games.css`: chrome hides, bar/hero/leaderboard styles.
- `scripts/take-screenshots.mjs` + `store/promo-tiles.html`: store assets.
- `store/listing.md` (listing copy, publishing steps, privacy answers), `store/privacy.md`.
- `.github/workflows/release.yml`: tag → build → upload+publish → GitHub release with zip.

Game type IDs: 1 Pinpoint, 2 Crossclimb, 3 Queens, 4 Wend, 5 Tango, 6 Zip, 7 Mini Sudoku, 8 Patches.

## Build your own

1. `mkdir my-ext && cd my-ext && npm init -y`; `npm i -D chrome-webstore-upload-cli playwright`. Copy `package.json` scripts (`build`, `upload`, `release`, `assets`).
2. Write `manifest.json` like this repo's: MV3, icons 16/48/128, a single `content_scripts` entry at `document_start`. Request no permissions.
3. `redirect.js`: bail if in an iframe or if the mode cookie says paused; otherwise `location.replace` anything outside your allowlist. Keep all auth paths allowed or users can't log in.
4. `games.js` skeleton (see real file):
   - singleton guard on `documentElement` attribute;
   - read mode cookie, set `html` gate classes immediately;
   - API helper: `fetch` with `csrf-token` header from the `JSESSIONID` cookie and `accept: application/vnd.linkedin.normalized+json+2.1`;
   - to find query IDs, open DevTools on linkedin.com/games and copy the `queryId=` of the graphql calls the hub and "See full leaderboard" make;
   - parse `included[]` entries of `$type` `com.linkedin.voyager.dash.identity.game.Game`; solved = `gameStoredRecord.gamePlayState` starts with `END`; memberId from `entityUrn` `urn:li:fsd_game:(member,gameType,puzzle)`;
   - render on DOMContentLoaded, refresh on `visibilitychange` and every 60s, decorate on a fixed 2s interval.
5. `games.css`: every hide rule prefixed with `html.lifg-on` (or `html.lifg-games` for game-page-only hides). Use `!important`; LinkedIn's specificity wins otherwise.
6. Load unpacked at `chrome://extensions` (Developer mode) and iterate.
7. Assets: adapt `scripts/take-screenshots.mjs` (persistent profile in `.playwright-profile/`, gitignored; first run asks you to log in) and `store/promo-tiles.html`; `npm run assets`.
8. Publish: `npm run build` → upload zip manually in the dev console once, fill listing from `store/listing.md`, submit. Then add the 4 repo secrets, copy `.github/workflows/release.yml`.
9. Release: bump `version` in `manifest.json` and `package.json`, `git tag vX.Y.Z && git push --tags`. Workflow fails if tag ≠ manifest version.

## Design decisions & gotchas

- **Mode in a cookie, not localStorage.** LinkedIn runs a storage janitor that deletes localStorage keys not on its allowlist, so the toggle silently vanished. `lifg_off` cookie on `.linkedin.com`, 1-year max-age, `SameSite=Lax`; toggle sets it and reloads.
- **Gate CSS on an html class set at `document_start`.** Avoids a flash of LinkedIn chrome and lets one stylesheet serve both modes.
- **Scope `#interop-outlet` hide to game pages.** It hosts the messaging bubble on game pages but the post composer on Ember pages (feed). Hiding it globally made "Start a post" silently no-op in LinkedIn mode (commit `00c8c44`).
- **No MutationObserver.** Decoration runs on a fixed 2s `setInterval`; a fixed cadence can't feedback-loop. `decorateHub` must be idempotent: leaderboard boxes carry a `data-lifg-v` version stamp and are only rebuilt when `lbVersion` changes. A rebuild-every-tick version once looped the tab to death.
- **Singleton guard** (`data-lifg` on `<html>`): two injected copies re-rendering the same nodes fight forever.
- **Two LinkedIn front-ends.** Hub is Ember, game pages are React (`#root`). Different selectors per page: hub cards `a.ps-game-entrypoint-card` / `li.pr-game-hub__card`, hub container `.pr-game-web__main-container`, game header `#root header`.
- **Hidden header still reserves space.** Game page grid keeps a 52px first row; `liftToolbar` walks up from `#root header` and rewrites `grid-template-rows` to `0px …`.
- **Ember re-renders eat injected nodes**; the interval re-adds the hero.
- **Leaderboard query.** Use the full "See full leaderboard" query, not the 3-row snapshot. The game URN must be fully %-encoded (`: ( ) ,`) inside the Rest.li `variables` tuple. Drop rows with null `ranking` (opted-out/nudge rows). Score is `timeElapsed` (seconds) or `totalGuessCount` (guess-based games). Names come from `included[]` profiles.
- **Hub order from the API.** Order is derived from URNs in the response so it matches the hub; `DEFAULT_ORDER` is the fallback.
- **Solve times are per-device** (read from the game app's localStorage keys); solved-state is cross-device (API).
- **Degrade gracefully.** If LinkedIn rotates a `queryId`, fetches fail and the bar renders chips without state. Expect to update hashes in `games.js`.
- **Leaderboards refetch at most every 5 min**, and only on the hub.
- **LinkedIn mode bar** is `position: fixed` at max-ish z-index; LinkedIn's `#global-nav` gets `top: 52px` and body `margin-top: 52px`. Link colors need `!important` overrides for `:visited` etc.
- **Store name risk.** Chrome Web Store may reject names starting with a trademark; fallbacks listed in `store/listing.md`. Say "not affiliated".
- **Release workflow needs `permissions: contents: write`** to create the GitHub release (commit `ca6ff9f`).
- **Known stale bit:** `scripts/take-screenshots.mjs` `setMode` still writes `localStorage["lifg:off"]`, but the extension reads the `lifg_off` cookie. Set the cookie instead if you reuse the script.

## Ways to adapt it

- **Other site, same pattern:** swap the `matches`, the redirect allowlist, the chrome selectors in `games.css`, and the API calls. Redirect + class-gated CSS + cookie toggle works for any "only keep section X" extension.
- **Different games subset:** edit `GAMES` / `DEFAULT_ORDER` in `games.js`.
- **More data:** other Voyager graphql queries can be called the same way (same-origin fetch + csrf header); find them in DevTools.
- **Export scores:** `fetchStates`/`fetchLeaderboard` already have puzzle IDs, solved state, times and connection ranks. Sending them elsewhere would need host permissions and changes to `store/privacy.md`.
