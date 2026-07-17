// LinkedIn is for Gaming — send everything that isn't games or auth to /games/
(function () {
  if (window !== window.top) return;
  // mode cookie, not localStorage — LinkedIn's storage janitor wipes foreign keys
  if (/(?:^|;\s*)lifg_off=1/.test(document.cookie)) return; // extension paused
  var p = location.pathname;
  // allowed: games, and everything needed to log in / out
  var allowed = /^\/(games([/?#]|$)|login|checkpoint|uas|authwall|signup|m\/logout|legal|psettings)/;
  if (!allowed.test(p)) location.replace("/games/");
})();
