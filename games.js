// LinkedIn is for Gaming — game switcher bar, scores & leaderboards
(function () {
  "use strict";

  // singleton guard: if another copy of this script already runs in this
  // document (duplicate extension entry, double injection), bail out — two
  // copies re-rendering the same nodes can fight each other forever
  if (document.documentElement.hasAttribute("data-lifg")) return;
  document.documentElement.setAttribute("data-lifg", "1");

  // mode lives in a cookie: LinkedIn runs a localStorage janitor that deletes
  // keys not on its allowlist, so localStorage silently loses the toggle
  var OFF = /(?:^|;\s*)lifg_off=1/.test(document.cookie);
  // gate for the chrome-hiding CSS; runs at document_start so there's no flash
  if (!OFF) document.documentElement.classList.add("lifg-on");
  // game pages get extra hides (header, messaging bubble) in both modes
  if (/^\/games([/?#]|$)/.test(location.pathname))
    document.documentElement.classList.add("lifg-games");

  // gameTypeId -> game (order below is the fallback if the API is down;
  // real order comes from the API response, which matches the hub)
  var GAMES = {
    4: { slug: "wend", name: "Wend", icon: "🧭" },
    8: { slug: "patches", name: "Patches", icon: "🧩" },
    6: { slug: "zip", name: "Zip", icon: "⚡" },
    7: { slug: "mini-sudoku", name: "Mini Sudoku", icon: "🔢" },
    5: { slug: "tango", name: "Tango", icon: "🌓" },
    3: { slug: "queens", name: "Queens", icon: "👑" },
    2: { slug: "crossclimb", name: "Crossclimb", icon: "🪜" },
    1: { slug: "pinpoint", name: "Pinpoint", icon: "📍" },
  };
  var DEFAULT_ORDER = [4, 8, 6, 7, 5, 3, 2, 1];

  var HUB_QUERY =
    "/voyager/api/graphql?includeWebMetadata=true" +
    "&variables=(gameEntryPointType:GAME_HUB)" +
    "&queryId=voyagerIdentityDashGameEntryPoints.4666a73a66c1a9663577e1c37f1ac13a";
  // full connections leaderboard (the "See full leaderboard" query), not the
  // 3-row snapshot around the member
  var LB_QUERY_ID =
    "voyagerIdentityDashGameConnectionsEntities.a5fed1d462445e698d896bd5563fed9c";
  var LB_MAX_ROWS = 10;

  // state.games: { gameTypeId: { puzzleId, solved } }
  // state.lb:    { gameTypeId: [{rank, name, me, score, flawless}] }
  var state = { order: DEFAULT_ORDER, games: {}, memberId: null, lb: {} };
  var lbFetchedAt = 0;
  // bumped when leaderboard data changes; decorateHub only rebuilds a box
  // whose stamp is outdated, so the periodic tick is a no-op most of the time
  var lbVersion = 0;

  function csrfToken() {
    var m = document.cookie.match(/JSESSIONID="?([^";]+)/);
    return m ? m[1] : null;
  }

  function apiGet(url) {
    return fetch(url, {
      headers: {
        "csrf-token": csrfToken(),
        accept: "application/vnd.linkedin.normalized+json+2.1",
      },
    }).then(function (r) {
      if (!r.ok) throw new Error("api " + r.status);
      return r.json();
    });
  }

  function fetchStates() {
    return apiGet(HUB_QUERY).then(function (j) {
      var included = (j.included || []).filter(function (i) {
        return i.$type === "com.linkedin.voyager.dash.identity.game.Game";
      });
      var games = {};
      included.forEach(function (g) {
        games[g.gameTypeId] = {
          puzzleId: g.puzzleId,
          solved:
            g.gameStoredRecord &&
            /^END/.test(g.gameStoredRecord.gamePlayState || ""),
        };
        var m = (g.entityUrn || "").match(/fsd_game:\(([^,]+),/);
        if (m) state.memberId = m[1];
      });
      var order = [];
      var urns =
        JSON.stringify(j.data).match(/urn:li:fsd_game:\([^)]+\)/g) || [];
      urns.forEach(function (u) {
        var m = u.match(/,(\d+),\d+\)$/);
        if (m && order.indexOf(+m[1]) < 0 && GAMES[+m[1]]) order.push(+m[1]);
      });
      if (Object.keys(games).length) state.games = games;
      if (order.length >= 4) state.order = order;
    });
  }

  // Rest.li needs the urn fully %-encoded inside the variables tuple
  function encodeUrn(u) {
    return u
      .replace(/:/g, "%3A")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
      .replace(/,/g, "%2C");
  }

  function fetchLeaderboard(gameTypeId) {
    var info = state.games[gameTypeId];
    if (!info || !state.memberId) return Promise.resolve();
    var urn = encodeUrn(
      "urn:li:fsd_game:(" +
        state.memberId +
        "," +
        gameTypeId +
        "," +
        info.puzzleId +
        ")"
    );
    return apiGet(
      "/voyager/api/graphql?includeWebMetadata=true&variables=(gameUrn:" +
        urn +
        ",start:0,count:25)&queryId=" +
        LB_QUERY_ID
    ).then(function (j) {
      var data = (j.data && j.data.data) || {};
      var boxKey = Object.keys(data).filter(function (k) {
        return k.indexOf("identityDashGameConnectionsEntities") === 0;
      })[0];
      var box = boxKey && data[boxKey];
      if (!box || !box.elements) return;
      var profiles = {};
      (j.included || []).forEach(function (i) {
        if (i.firstName !== undefined) {
          profiles[i.entityUrn] = (
            (i.firstName || "") +
            " " +
            (i.lastName || "")
          ).trim();
        }
      });
      state.lb[gameTypeId] = box.elements
        .filter(function (el) {
          return el.ranking != null; // opted-out / nudge rows have no rank
        })
        .slice(0, LB_MAX_ROWS)
        .map(function (el) {
          var pUrn =
            (el.playerDetails && el.playerDetails.player
              ? el.playerDetails.player["*profile"]
              : "") || "";
          var me = pUrn.indexOf(state.memberId) >= 0;
          var score = "";
          if (el.gameScore) {
            if (el.gameScore.timeElapsed != null)
              score = fmtSec(el.gameScore.timeElapsed);
            else if (el.gameScore.totalGuessCount != null)
              score =
                el.gameScore.totalGuessCount +
                " guess" +
                (el.gameScore.totalGuessCount > 1 ? "es" : "");
          }
          return {
            rank: el.ranking,
            name: me ? "You" : profiles[pUrn] || "Connection",
            me: me,
            score: score,
            flawless: !!el.isFlawless,
          };
        });
    });
  }

  function fetchAllLeaderboards() {
    lbFetchedAt = Date.now();
    return Promise.all(
      state.order.map(function (id) {
        return fetchLeaderboard(id).catch(function () {});
      })
    ).then(function () {
      lbVersion++;
    });
  }

  // solve time (ms) for a given game+puzzle, from the play app's localStorage
  function timeFor(gameTypeId, puzzleId) {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var m = k && k.match(/^play:timeElapsed:\((\d+),(\d+),(\d+)\)$/);
        if (m && +m[2] === gameTypeId && (!puzzleId || +m[3] === puzzleId)) {
          var v = parseInt(localStorage.getItem(k), 10);
          if (v > 0) return v;
        }
      }
    } catch (e) {}
    return null;
  }

  function fmtSec(s) {
    return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }
  function fmtMs(ms) {
    return fmtSec(Math.round(ms / 1000));
  }

  function currentSlug() {
    var m = location.pathname.match(/^\/games\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function flipMode() {
    document.cookie =
      "lifg_off=" +
      (OFF ? "0" : "1") +
      "; path=/; domain=.linkedin.com; max-age=31536000; SameSite=Lax";
    location.reload();
  }

  // games-only mode, hub page: big hero title + the way back to real LinkedIn
  function renderHero() {
    var existing = document.getElementById("lifg-hero");
    if (OFF || !/^\/games\/?$/.test(location.pathname)) {
      if (existing) existing.remove();
      return;
    }
    // mount inside LinkedIn's hub container so the hero lines up with the
    // tiles at any viewport width; fall back to <main> until it renders
    var host =
      document.querySelector(".pr-game-web__main-container") ||
      document.querySelector("main");
    if (!host) return;
    if (existing && existing.isConnected) {
      if (existing.parentElement !== host) host.prepend(existing);
      return;
    }
    var hero = document.createElement("div");
    hero.id = "lifg-hero";
    var h = document.createElement("h1");
    h.className = "lifg-hero-title";
    var b = document.createElement("b");
    b.textContent = "LinkedIn";
    h.appendChild(b);
    h.appendChild(document.createTextNode(" is for gaming 🎮"));
    var tog = document.createElement("button");
    tog.className = "lifg-hero-toggle";
    tog.type = "button";
    tog.textContent = "🐵 Show LinkedIn";
    tog.title = "Pause the extension and browse normal LinkedIn";
    tog.addEventListener("click", flipMode);
    hero.appendChild(h);
    hero.appendChild(tog);
    host.prepend(hero);
  }

  // games-only mode, play pages: the hidden LinkedIn header still owns a
  // fixed 52px grid row in the app layout — collapse it so the game toolbar
  // slides up into the freed space (idempotent: once collapsed, the rows no
  // longer start with 52px and this is a no-op)
  function liftToolbar() {
    if (OFF) return;
    var header = document.querySelector("#root header");
    var p = header && header.parentElement;
    while (p && p !== document.body) {
      var s = getComputedStyle(p);
      if (s.display === "grid" && /^52px /.test(s.gridTemplateRows)) {
        var rest = s.gridTemplateRows.split(" ").slice(1);
        p.style.setProperty(
          "grid-template-rows",
          rest.length === 1 ? "0px 1fr" : "0px " + rest.join(" "),
          "important"
        );
        return;
      }
      p = p.parentElement;
    }
  }

  function render() {
    var bar = document.getElementById("lifg-bar");
    // games-only mode: no bar — the hub is the navigation
    if (!OFF) {
      if (bar) bar.remove();
      renderHero();
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "lifg-bar";
      document.documentElement.appendChild(bar);
    }
    bar.textContent = "";

    var brand = document.createElement("a");
    brand.className = "lifg-brand";
    brand.href = "/games/";
    bar.appendChild(brand);

    var slug = currentSlug();
    var nextDone = false;
    var allSolved = true;

    state.order.forEach(function (id) {
      var g = GAMES[id];
      if (!g) return;
      var info = state.games[id] || {};
      var solved = !!info.solved;
      if (!solved) allSolved = false;

      var chip = document.createElement("a");
      chip.className = "lifg-chip";
      chip.href = "/games/" + g.slug + "/";

      var label = g.icon + " " + g.name;
      if (solved) {
        chip.classList.add("lifg-done");
        label = "✓ " + label;
      } else if (!nextDone) {
        chip.classList.add("lifg-next");
        nextDone = true;
        label = "▶ " + label;
      }
      if (slug === g.slug) chip.classList.add("lifg-current");
      chip.appendChild(document.createTextNode(label));

      var ms = solved ? timeFor(id, info.puzzleId) : null;
      if (ms) {
        var t = document.createElement("span");
        t.className = "lifg-time";
        t.textContent = fmtMs(ms);
        chip.appendChild(t);
      }
      bar.appendChild(chip);
    });

    allSolved = allSolved && Object.keys(state.games).length > 0;
    brand.textContent = allSolved ? "🏆 Games" : "🎮 Games";
    brand.title = allSolved ? "All done today!" : "LinkedIn is for Gaming";

    var tog = document.createElement("button");
    tog.id = "lifg-toggle";
    tog.type = "button";
    tog.textContent = "🙈 Hide LinkedIn";
    tog.title = "Back to games-only mode";
    tog.addEventListener("click", flipMode);
    bar.appendChild(tog);
  }

  // "✓ time" badge + connections leaderboard under each hub card.
  // MUST be idempotent: called from a fixed-rate interval, and every code
  // path that writes to the DOM is guarded so a steady-state call changes
  // nothing (a rebuild-every-tick here once looped the whole tab to death)
  function decorateHub() {
    if (!/^\/games\/?$/.test(location.pathname)) return;
    var bySlug = {};
    Object.keys(GAMES).forEach(function (id) {
      bySlug[GAMES[id].slug] = +id;
    });
    document
      .querySelectorAll("a.ps-game-entrypoint-card")
      .forEach(function (card) {
        var m = (card.getAttribute("href") || "").match(/\/games\/([^/?#]+)/);
        var id = m && bySlug[m[1]];
        if (!id) return;
        var rows = state.lb[id];
        if (rows && rows.length && card.parentElement) {
          var existing = card.parentElement.querySelector(".lifg-lb");
          if (existing && existing.getAttribute("data-lifg-v") === String(lbVersion))
            return; // up to date — do not touch the DOM
          var box = existing || document.createElement("div");
          box.textContent = "";
          box.className = "lifg-lb";
          box.setAttribute("data-lifg-v", String(lbVersion));
          var title = document.createElement("div");
          title.className = "lifg-lb-title";
          title.textContent = "Leaderboard";
          box.appendChild(title);
          rows.forEach(function (r) {
            var row = document.createElement("div");
            row.className = "lifg-lb-row" + (r.me ? " lifg-me" : "");
            var rank = document.createElement("span");
            rank.className = "lifg-lb-rank";
            rank.textContent =
              r.rank === 1
                ? "🥇"
                : r.rank === 2
                ? "🥈"
                : r.rank === 3
                ? "🥉"
                : "#" + r.rank;
            var name = document.createElement("span");
            name.className = "lifg-lb-name";
            name.textContent = r.name;
            row.appendChild(rank);
            row.appendChild(name);
            if (r.flawless) {
              var f = document.createElement("span");
              f.className = "lifg-lb-flaw";
              f.textContent = "💎";
              f.title = "Flawless";
              row.appendChild(f);
            }
            var score = document.createElement("span");
            score.className = "lifg-lb-score";
            score.textContent = r.score;
            row.appendChild(score);
            box.appendChild(row);
          });
          if (!existing)
            card.parentElement.insertBefore(box, card.nextSibling);
        }
      });
  }

  function refresh(withLb) {
    fetchStates()
      .then(function () {
        if (
          withLb &&
          /^\/games\/?$/.test(location.pathname) &&
          Date.now() - lbFetchedAt > 5 * 60 * 1000
        ) {
          return fetchAllLeaderboards();
        }
      })
      .then(done, done);
    function done() {
      render();
      decorateHub();
    }
  }

  function start() {
    render(); // instant, with fallback order
    refresh(true);

    // fixed-rate decorate tick — deliberately NOT a MutationObserver: a
    // fixed cadence cannot feedback-loop no matter what mutates the page.
    setInterval(function () {
      try {
        decorateHub();
        renderHero(); // Ember re-renders can eat the hero — re-add if gone
        liftToolbar();
      } catch (e) {}
    }, 2000);

    // pick up newly finished games
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh(true);
    });
    setInterval(function () {
      refresh(false);
    }, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
