// Loaded as a classic script by the content script and imported for its side
// effect by the service worker and popup, so it must not use `export`.
(() => {
  const MINUTE = 60_000;

  function bulletsNow(bullets, now = Date.now()) {
    const max = bullets?.max ?? 10;
    const reloads = (bullets?.reloadsAt ?? []).map(Date.parse).filter(Number.isFinite);
    const waiting = reloads.filter((time) => time > now).sort((a, b) => a - b);
    const left = Math.min(max, (bullets?.remaining ?? 0) + reloads.length - waiting.length);
    return { left, max, next: waiting[0] ?? null };
  }

  // Same wording as the site's dashboard.
  function formatReload(ms) {
    return `+1 in ${Math.max(1, Math.ceil(ms / MINUTE))} min`;
  }

  function formatMoney(cents) {
    const dollars = (cents ?? 0) / 100;
    return dollars.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: dollars >= 1000 ? 0 : 2,
      minimumFractionDigits: dollars >= 1000 ? 0 : 2,
    });
  }

  globalThis.SH = Object.freeze({ bulletsNow, formatReload, formatMoney });
})();
