import "./shared.js";

const { SH } = globalThis;
const SITE = new URL(chrome.runtime.getManifest().homepage_url).origin;
const REASONS = { premium: "X Premium only", review: "In review", suspended: "Suspended" };
const isCalm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

let me = null;
let shownCents = 0;
let isFirstPaint = true;

$("connect").href = `${SITE}/extension/connect?ext=${chrome.runtime.id}`;
$("dashboard").href = `${SITE}/dashboard`;
for (const link of document.querySelectorAll('[data-link="privacy"]')) link.href = `${SITE}/privacy`;

$("disconnect").addEventListener("click", () => chrome.runtime.sendMessage({ type: "disconnect" }));
$("avatar").addEventListener("error", () => $("avatar").classList.add("missing"));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("me" in changes || "token" in changes)) load();
});

await load();
chrome.runtime.sendMessage({ type: "refresh", popup: true });
setInterval(paintAmmo, 15_000);

async function load() {
  const stored = await chrome.storage.local.get(["token", "me"]);
  me = stored.token && stored.me ? stored.me : null;
  render();
}

function render() {
  document.body.classList.remove("loading");
  $("hunter").hidden = !me;
  $("welcome").hidden = Boolean(me);
  if (!me) {
    shownCents = 0;
    return;
  }

  const { user, week } = me;
  $("handle").textContent = `@${user.username}`;
  $("initial").textContent = user.username.slice(0, 1);
  if (!user.avatarUrl) $("avatar").classList.add("missing");
  else if ($("avatar").getAttribute("src") !== user.avatarUrl) {
    $("avatar").classList.remove("missing");
    $("avatar").src = user.avatarUrl;
  }

  countTo(week?.estimatedEarningsCents ?? 0);
  $("points").textContent = (week?.points ?? 0).toLocaleString("en-US");
  $("rank").textContent = week?.rank ? `#${week.rank.toLocaleString("en-US")}` : "–";
  $("confirmed").textContent = (week?.confirmedReports ?? 0).toLocaleString("en-US");

  $("ammo").hidden = !user.eligible;
  $("stamp").hidden = user.eligible;
  $("stamp").textContent = user.eligible ? "" : REASONS[user.reason] ?? REASONS.review;
  paintAmmo();
  isFirstPaint = false;
}

function paintAmmo() {
  if (!me?.user?.eligible) return;
  const { left, max, next } = SH.bulletsNow(me.bullets);
  const bullets = $("bullets");
  const shown = bullets.dataset.left === String(left) && bullets.children.length === max;
  if (!shown) {
    bullets.replaceChildren(
      ...Array.from({ length: max }, (_, i) => {
        const svg = $(i < left ? "bullet" : "bullet-spent").content.firstElementChild.cloneNode(true);
        svg.style.animationDelay = isFirstPaint ? `${0.18 + i * 0.03}s` : "0s";
        return svg;
      }),
    );
    bullets.dataset.left = String(left);
  }
  bullets.setAttribute("aria-label", `${left} of ${max} bullets`);
  $("reload").textContent = next ? SH.formatReload(next - Date.now()) : "Fully loaded";
}

function countTo(cents) {
  const from = shownCents;
  shownCents = cents;
  const earnings = $("earnings");
  if (isCalm || from === cents) {
    earnings.textContent = SH.formatMoney(cents);
    return;
  }
  const start = performance.now();
  const duration = 700;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    earnings.textContent = SH.formatMoney(Math.round(from + (cents - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
