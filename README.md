# 🎮 LinkedIn is for Gaming

[![LinkedIn is for gaming](store/promo/marquee-promo-tile.jpg)](https://chromewebstore.google.com/detail/dpjdldibnlfjlladnpfdncijbilclibn)

LinkedIn, minus LinkedIn. Just the daily games.

**→ [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/dpjdldibnlfjlladnpfdncijbilclibn)**

Two modes, toggled from the page:

**Games-only mode** (default)
- Every LinkedIn page except the games (and login) redirects to `/games/`
- Global nav, "Games" header, messaging bubble, and other chrome are stripped — plain puzzles
- Hub hero: "LinkedIn is for gaming 🎮" with a "🐵 Show LinkedIn" toggle next to it
- Full connections leaderboard (rank, names, times, 💎 flawless, top 10) under every hub card

**LinkedIn mode** ("🐵 Show LinkedIn")
- Normal LinkedIn, no redirect — but a LinkedIn-styled game bar sits on every page
  above LinkedIn's own nav: all 8 games, today's ✓ + solve time, next game in blue,
  🏆 brand when the day is cleared, and "🙈 Hide LinkedIn" to switch back
- Game pages stay plain-faced in both modes

## Install

**[Chrome Web Store](https://chromewebstore.google.com/detail/dpjdldibnlfjlladnpfdncijbilclibn/)** (in review)

Or from source:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this folder

## How it works

- `redirect.js` — bounces any non-game LinkedIn path to `/games/` (login/checkpoint/authwall paths are allowed through)
- `games.css` — hides LinkedIn chrome on the hub (Ember app) and game pages (React app), styles the bar
- `games.js` — fetches per-game solved-state from LinkedIn's own Voyager API
  (`voyagerIdentityDashGameEntryPoints`, the same call the hub makes), leaderboards from
  `voyagerIdentityDashGameConnectionsEntities` (rank/time window around you, same data as
  the results page), and reads solve times from the games'
  `play:timeElapsed:(member,gameType,puzzle)` localStorage keys
- Toggle state lives in a `lifg_off` cookie on linkedin.com (localStorage doesn't work:
  LinkedIn runs a janitor that deletes keys not on its allowlist); the chrome-hiding CSS
  is gated on an `html.lifg-on` class set at document_start

Game type IDs: 1 Pinpoint, 2 Crossclimb, 3 Queens, 4 Wend, 5 Tango, 6 Zip, 7 Mini Sudoku, 8 Patches.

Notes:
- Solve times are per-device (localStorage); solved-state is cross-device (API)
- If LinkedIn rotates the API `queryId`, the bar degrades gracefully (chips without state)
