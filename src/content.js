// Runs on https://x.com only. It reads the page to place 💩 buttons and sends
// nothing until the hunter clicks one; then only that reply's post ID and
// author handle go to the service worker, which talks to the SlopHunter API.
(() => {
  "use strict";

  if (globalThis.__slophunter) return;
  globalThis.__slophunter = true;

  const { SH } = globalThis;
  const STATUS_PATH = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,20})\/?$/;
  const STATUS_PAGE = /^\/[A-Za-z0-9_]{1,15}\/status\/(\d{1,20})/;
  const PROFILE_HREF = /^(?:https:\/\/(?:www\.)?x\.com)?\/([A-Za-z0-9_]{1,15})\/?$/i;
  const NOT_HANDLES = new Set(["home", "explore", "notifications", "messages", "i", "settings", "search", "compose", "hashtag", "bookmarks", "lists", "communities", "premium", "jobs", "tos", "privacy"]);
  const BUBBLE_MS = 2400;
  const SCAN_MS = 80;
  const REASONS = { premium: "X Premium only", review: "In review", suspended: "Suspended" };

  const STYLE = `
    :host { all: initial; display: inline-flex; align-items: center; flex: none; }
    .shot {
      all: unset; position: relative; display: inline-grid; place-items: center;
      width: 34px; height: 34px; border-radius: 999px; cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background-color .16s ease, transform .12s ease;
    }
    .emoji {
      font: 16px/1 "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
      filter: grayscale(1); opacity: .5;
      transition: filter .16s ease, opacity .16s ease, transform .2s cubic-bezier(.3, 1.6, .6, 1);
    }
    .ring { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; }
    .shot:hover { background: rgba(180, 83, 42, .12); }
    .shot:hover .emoji, .shot:focus-visible .emoji { filter: none; opacity: 1; transform: scale(1.12); }
    .shot:active { transform: scale(.9); }
    .shot:focus-visible { outline: 2px solid #B4532A; outline-offset: 1px; }
    .shot[data-state="flagged"] { background: rgba(180, 83, 42, .18); }
    .shot[data-state="confirmed"] { background: rgba(196, 154, 66, .22); box-shadow: inset 0 0 0 1.5px rgba(196, 154, 66, .8); }
    .shot[data-state="flagged"] .emoji, .shot[data-state="confirmed"] .emoji { filter: none; opacity: 1; }
    .shot[data-state="invalidated"] .emoji { opacity: .25; }
    .shot.fired .ring { animation: ring .55s ease-out; }
    .shot.fired .emoji { animation: recoil .45s cubic-bezier(.3, 1.5, .5, 1); }
    .shot.shake { animation: shake .32s ease; }
    @keyframes ring { from { box-shadow: 0 0 0 0 rgba(180, 83, 42, .55); } to { box-shadow: 0 0 0 12px rgba(180, 83, 42, 0); } }
    @keyframes recoil { 30% { transform: scale(1.38) rotate(-8deg); } 60% { transform: scale(.94) rotate(3deg); } }
    @keyframes shake { 20% { transform: translateX(-3px); } 40% { transform: translateX(3px); } 60% { transform: translateX(-2px); } 80% { transform: translateX(2px); } }

    .bubble {
      position: fixed; left: 0; top: 0; z-index: 1;
      display: flex; align-items: center; gap: 8px; padding: 8px 11px;
      border-radius: 999px; background: #2B1E14; color: #F6EFE1;
      font: 600 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      font-variant-numeric: tabular-nums; white-space: nowrap;
      box-shadow: 0 8px 24px rgba(43, 30, 20, .28);
      opacity: 0; transform: translate(-50%, calc(-100% - 6px)) scale(.96);
      transition: opacity .16s ease, transform .2s cubic-bezier(.2, .9, .3, 1.2);
      pointer-events: none;
    }
    .bubble.below { transform: translate(-50%, 6px) scale(.96); }
    .bubble.show { opacity: 1; transform: translate(-50%, calc(-100% - 10px)); }
    .bubble.below.show { transform: translate(-50%, 10px); }
    :host([data-theme="dark"]) .bubble { background: #F6EFE1; color: #2B1E14; box-shadow: 0 8px 24px rgba(0, 0, 0, .5); }
    .pips { display: flex; gap: 3px; }
    .pip { width: 5px; height: 12px; border-radius: 3px; background: linear-gradient(#E9C979, #B38A3E); }
    .pip.spent { background: none; box-shadow: inset 0 0 0 1px currentColor; opacity: .3; }
    .wait { opacity: .7; }
    .wait.empty { opacity: 1; color: #E0705F; }
    :host([data-theme="dark"]) .wait.empty { color: #9E3B32; }
    .points { color: #E9C979; font-weight: 700; }
    :host([data-theme="dark"]) .points { color: #9A7428; }
    .connect {
      all: unset; pointer-events: auto; cursor: pointer; padding: 6px 12px; margin: -3px -5px;
      border-radius: 999px; background: #B4532A; color: #FBF6EC; font-weight: 700;
    }
    .connect:hover { background: #9C4322; }
    .connect:focus-visible { outline: 2px solid #E9C979; outline-offset: 2px; }

    @media (prefers-reduced-motion: reduce) {
      .shot, .emoji, .bubble { transition: none; }
      .shot.fired .ring, .shot.fired .emoji, .shot.shake { animation: none; }
    }
  `;

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(STYLE);

  // Events on our buttons stop at window, before X's own listeners: X never
  // reacts to them, and React can't hydrate (and re-create) the post mid-click.
  const SHIELDED = ["pointerover", "pointerout", "pointerdown", "pointerup", "mouseover", "mouseout", "mousedown", "mouseup", "click", "dblclick", "auxclick", "touchstart", "touchend", "keydown", "keyup", "keypress", "focusin", "focusout"];

  const entries = new WeakMap();
  const hostEntries = new WeakMap();
  const buttons = new Set();
  let me = null;
  let reports = new Map();
  let theme = "light";
  let themeCheckedAt = 0;
  let badgeTimer = 0;
  let scanQueued = false;

  const layer = createLayer();
  const observer = new MutationObserver(queueScan);

  chrome.storage.local.get("me").then(({ me: stored }) => {
    use(stored);
    scan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !("me" in changes)) return;
    use(changes.me.newValue);
    scan();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  for (const type of SHIELDED) addEventListener(type, shield, true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) send({ type: "refresh" });
  });
  send({ type: "refresh" });

  function use(stored) {
    me = stored ?? null;
    reports = new Map((me?.reports ?? []).map((r) => [r.postId, r]));
    scheduleBadge();
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => {
      scanQueued = false;
      scan();
    }, SCAN_MS);
  }

  function scan() {
    if (!isAlive()) return shutdown();
    checkTheme();
    for (const entry of buttons) if (!entry.host.isConnected) buttons.delete(entry);
    const items = [...document.querySelectorAll("article")].map((article) => ({ article, post: readPost(article) }));
    const thread = readThread(items.filter((item) => item.post));
    for (const { article, post } of items) decorate(article, post, thread);
  }

  function decorate(article, post, thread) {
    const isWanted = post && !isOwnPost(post) && isReply(article, post, thread);
    let entry = entries.get(article);

    if (!isWanted) {
      if (entry) {
        entry.host.remove();
        buttons.delete(entry);
        entries.delete(article);
      }
      return;
    }

    if (!entry) {
      entry = createButton();
      entries.set(article, entry);
    }
    buttons.add(entry);
    entry.postId = post.id;
    entry.author = post.author;
    if (!post.bar.contains(entry.host)) place(entry.host, post.bar);
    paint(entry);
  }

  // A post is the outermost <article>; quoted posts nest inside it.
  function readPost(article) {
    if (article.parentElement?.closest("article")) return null;
    const bar = [...article.querySelectorAll('[role="group"]')].filter((el) => isOwn(el, article)).pop();
    if (!bar) return null;
    const href = article.closest("[data-href]")?.getAttribute("data-href") ?? permalink(article);
    const match = href && STATUS_PATH.exec(href);
    return match ? { id: match[2], author: match[1], bar } : null;
  }

  function permalink(article) {
    const links = [...article.querySelectorAll('a[href*="/status/"]')].filter((a) => isOwn(a, article) && STATUS_PATH.test(a.getAttribute("href")));
    return (links.find((a) => a.querySelector("time")) ?? links[0])?.getAttribute("href") ?? null;
  }

  function isOwn(el, article) {
    return el.closest("article") === article && el.closest("[data-href]") === article.closest("[data-href]");
  }

  function isOwnPost(post) {
    return Boolean(me?.user?.username) && me.user.username.toLowerCase() === post.author.toLowerCase();
  }

  // A post's page shows the post, the posts it replies to above it, and its
  // replies below, then any section X adds after them (recommended posts).
  // X unmounts posts scrolled far away, so the post itself may be missing.
  function readThread(items) {
    const focalId = STATUS_PAGE.exec(location.pathname)?.[1];
    if (!focalId) return null;
    const root = document.querySelector('[id^="urt:conversation:"]') ?? document.querySelector('[data-testid="primaryColumn"]') ?? document.querySelector("main");
    if (!root) return null;
    const posts = items.filter(({ article }) => root.contains(article)).map(({ article }) => article);
    const focal = items.find(({ article, post }) => post.id === focalId && root.contains(article))?.article;
    const heading = posts[0] && [...root.querySelectorAll('h2, [role="heading"]')].find((h) => !h.closest("article") && posts[0].compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { posts, focalId, hasPostsAboveFocal: posts.indexOf(focal) > 0, heading };
  }

  function isReply(article, post, thread) {
    const index = thread ? thread.posts.indexOf(article) : -1;
    const isAboveHeading = !thread?.heading || thread.heading.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_PRECEDING;
    if (index >= 0 && isAboveHeading) {
      if (post.id === thread.focalId) return index > 0 || hasReplyContext(article, post);
      // Above a reply's page, only the topmost post is not a reply.
      return !(index === 0 && thread.hasPostsAboveFocal);
    }
    return hasReplyContext(article, post);
  }

  // Elsewhere (home, notifications, search, profiles) a reply shows a
  // "Replying to @handle" line right under its header. Matched by structure,
  // not text, so it works in every language.
  function hasReplyContext(article, post) {
    const author = post.author.toLowerCase();
    const links = [...article.querySelectorAll("a[href]")].filter((a) => isOwn(a, article));
    const handleOf = (a) => PROFILE_HREF.exec(a.getAttribute("href"))?.[1].toLowerCase();
    const isMention = (a) => {
      const handle = handleOf(a);
      return Boolean(handle) && !NOT_HANDLES.has(handle) && a.textContent.trim().startsWith("@");
    };

    if (article.matches('[data-testid="tweet"]')) {
      return links.some((a) => isMention(a) && handleOf(a) !== author && !a.closest('[data-testid="User-Name"], [data-testid="tweetText"], [data-testid="Tweet-User-Avatar"]'));
    }

    const authorLink = links.find((a) => isMention(a) && handleOf(a) === author);
    if (!authorLink) return false;
    let block = authorLink;
    while (block.parentElement && block.parentElement !== article && !block.parentElement.contains(post.bar)) block = block.parentElement;
    const header = [...block.children].find((child) => child.contains(authorLink));
    const next = header?.nextElementSibling;
    return Boolean(next) && links.some((a) => next.contains(a) && isMention(a) && handleOf(a) !== author);
  }

  function place(host, bar) {
    const share = bar.querySelector('[data-engagement-action="share"]');
    const cluster = share?.parentElement;
    if (cluster && cluster !== bar && bar.contains(cluster)) cluster.insertBefore(host, cluster.firstChild);
    else bar.append(host);
  }

  function createButton() {
    const host = document.createElement("span");
    host.className = "slophunter";
    const root = host.attachShadow({ mode: "closed" });
    root.adoptedStyleSheets = [sheet];

    const button = document.createElement("button");
    button.type = "button";
    button.className = "shot";
    const ring = document.createElement("span");
    ring.className = "ring";
    const emoji = document.createElement("span");
    emoji.className = "emoji";
    emoji.textContent = "💩";
    emoji.setAttribute("aria-hidden", "true");
    button.append(ring, emoji);
    root.append(button);

    const entry = { host, button, postId: null, author: null };
    button.addEventListener("animationend", () => button.classList.remove("fired", "shake"));
    hostEntries.set(host, entry);
    return entry;
  }

  // Outside a closed shadow root, events from inside it target the host.
  function shield(event) {
    const entry = hostEntries.get(event.target);
    if (!entry) return;
    event.stopPropagation();
    if (event.type === "click") shoot(entry);
  }

  function paint(entry) {
    const report = reports.get(entry.postId);
    const state = !report ? "idle" : report.status === "confirmed" ? "confirmed" : report.status === "invalidated" ? "invalidated" : "flagged";
    const label = { idle: "Flag as AI slop", flagged: "Flagged", confirmed: "Confirmed by hunters", invalidated: "Flag closed" }[state];
    if (entry.button.dataset.state !== state) entry.button.dataset.state = state;
    if (entry.button.title !== label) {
      entry.button.title = label;
      entry.button.setAttribute("aria-label", label);
      entry.button.setAttribute("aria-pressed", String(state !== "idle"));
    }
    if (entry.host.dataset.theme !== theme) entry.host.dataset.theme = theme;
  }

  function paintPost(postId) {
    for (const entry of buttons) if (entry.postId === postId) paint(entry);
  }

  async function shoot(entry) {
    const { button, postId, author } = entry;
    if (!me) return say(button, connectView(), 5000);
    if (reports.has(postId)) return say(button, ammoView());
    if (!me.user?.eligible) {
      shake(button);
      return say(button, textView(REASONS[me.user?.reason] ?? REASONS.review));
    }
    if (SH.bulletsNow(me.bullets).left < 1) {
      shake(button);
      return say(button, ammoView());
    }

    const previous = me;
    me = { ...me, bullets: spendOne(me.bullets) };
    reports.set(postId, { postId, status: "pending", points: 0 });
    paintPost(postId);
    button.classList.remove("shake");
    button.classList.add("fired");
    say(button, ammoView());

    const res = await send({ type: "report", postId, authorUsername: author });
    if (res?.report) {
      reports.set(postId, res.report);
      paintPost(postId);
      if (res.report.points > 0) say(button, ammoView(res.report.points));
      return;
    }

    if (res?.error === "closed") {
      reports.set(postId, { postId, status: "invalidated", points: 0 });
      return paintPost(postId);
    }

    me = res?.bullets ? { ...previous, bullets: res.bullets } : previous;
    reports.delete(postId);
    paintPost(postId);
    shake(button);
    if (res?.error === "unauthorized") return say(button, connectView(), 5000);
    if (res?.error === "no_bullets") return say(button, ammoView());
    if (res?.error === "not_eligible" || res?.error === "suspended") return say(button, textView(REASONS[res.reason ?? (res.error === "suspended" ? "suspended" : "premium")]));
    if (res?.error === "own_post") return entry.host.remove();
  }

  function spendOne(bullets) {
    const now = Date.now();
    const { left, max } = SH.bulletsNow(bullets, now);
    const waiting = (bullets?.reloadsAt ?? []).filter((t) => Date.parse(t) > now);
    return { max, remaining: left - 1, reloadsAt: [...waiting, new Date(now + 3_600_000).toISOString()] };
  }

  function shake(button) {
    button.classList.remove("fired", "shake");
    void button.offsetWidth;
    button.classList.add("shake");
  }

  // Bubble shown next to a button: bullets left and the next reload.
  function ammoView(points = 0) {
    const { left, max, next } = SH.bulletsNow(me?.bullets);
    const view = document.createDocumentFragment();
    if (points > 0) view.append(el("span", "points", `+${points}`));
    const pips = el("span", "pips");
    pips.setAttribute("aria-label", `${left} of ${max} bullets`);
    for (let i = 0; i < max; i++) pips.append(el("span", i < left ? "pip" : "pip spent"));
    view.append(pips);
    if (next) view.append(el("span", left ? "wait" : "wait empty", `↻ ${SH.formatWait(next - Date.now())}`));
    return view;
  }

  function connectView() {
    const button = el("button", "connect", "Connect X");
    button.type = "button";
    button.addEventListener("click", () => {
      send({ type: "connect" });
      hideBubble();
    });
    return button;
  }

  function textView(text) {
    return el("span", "", text);
  }

  function createLayer() {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0 auto auto 0;width:0;height:0;z-index:2147483000;";
    const root = host.attachShadow({ mode: "closed" });
    root.adoptedStyleSheets = [sheet];
    const bubble = el("div", "bubble");
    bubble.setAttribute("role", "status");
    root.append(bubble);
    document.documentElement.append(host);
    addEventListener("scroll", hideBubble, { passive: true });
    return { host, bubble, timer: 0 };
  }

  function say(button, content, ms = BUBBLE_MS) {
    const { host, bubble } = layer;
    if (!host.isConnected) document.documentElement.append(host);
    host.dataset.theme = theme;
    bubble.replaceChildren(content);
    const rect = button.getBoundingClientRect();
    const isBelow = rect.top < 64;
    bubble.classList.toggle("below", isBelow);
    bubble.style.left = `${rect.left + rect.width / 2}px`;
    bubble.style.top = `${isBelow ? rect.bottom : rect.top}px`;
    bubble.classList.remove("show");
    void bubble.offsetWidth;
    bubble.classList.add("show");
    clearTimeout(layer.timer);
    layer.timer = setTimeout(hideBubble, ms);
  }

  function hideBubble() {
    layer.bubble.classList.remove("show");
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function checkTheme() {
    const now = Date.now();
    if (now - themeCheckedAt < 2000) return;
    themeCheckedAt = now;
    const background = [document.body, document.documentElement]
      .map((node) => node && getComputedStyle(node).backgroundColor)
      .find((color) => color && !/rgba\(.*,\s*0\)$|transparent/.test(color));
    const [r, g, b] = (background?.match(/\d+(\.\d+)?/g) ?? [255, 255, 255]).map(Number);
    const next = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? "dark" : "light";
    if (next === theme) return;
    theme = next;
    for (const entry of buttons) paint(entry);
  }

  function scheduleBadge() {
    clearTimeout(badgeTimer);
    const { next } = SH.bulletsNow(me?.bullets);
    if (!next) return;
    badgeTimer = setTimeout(() => {
      send({ type: "badge" });
      scheduleBadge();
    }, Math.min(next - Date.now() + 500, 2 ** 31 - 1));
  }

  function send(message) {
    return new Promise((resolve) => {
      if (!isAlive()) return resolve(null);
      try {
        chrome.runtime.sendMessage(message, (res) => {
          void chrome.runtime.lastError;
          resolve(res ?? null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function isAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  // The extension was updated or removed: leave X as it was.
  function shutdown() {
    observer.disconnect();
    for (const type of SHIELDED) removeEventListener(type, shield, true);
    clearTimeout(badgeTimer);
    for (const entry of buttons) entry.host.remove();
    buttons.clear();
    layer.host.remove();
  }
})();
