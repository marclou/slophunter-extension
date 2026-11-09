// Synthetic x.com pages that mirror the structure of X's web app (November
// 2026): posts are <article>s wrapped in div[role=link][data-href], with
// data-engagement-action buttons. Accounts and text are made up.

const AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23cfd9de'/></svg>";

export function post({ id, author, text, replyingTo, quote, isFocal = false }) {
  const header = `
    <div class="@container/post-actions flex items-start">
      <div class="x-middot-group">
        <div class="flex items-center gap-1">
          <span><a href="/${author}"><div class="font-bold">${author[0].toUpperCase()}${author.slice(1)}</div></a></span>
          <span><a href="/${author}"><span>@${author}</span></a></span>
        </div>
        ${isFocal ? "" : `<span><a href="/${author}/status/${id}">9m</a></span>`}
      </div>
      <div><button type="button" aria-label="More" aria-haspopup="menu" data-slot="xds-menu-trigger">···</button></div>
    </div>`;
  const context = replyingTo ? `<div dir="auto" class="text-subtext2">Replying to <a href="https://x.com/${replyingTo}">@${replyingTo}</a></div>` : "";
  const quoted = quote ? `<div class="flex flex-col gap-3"><div role="link" data-href="/${quote.author}/status/${quote.id}" tabindex="0"><article class="group/post">${quote.replyingTo ? `<div dir="auto">Replying to <a href="https://x.com/${quote.replyingTo}">@${quote.replyingTo}</a></div>` : ""}<a href="/${quote.author}"><span>@${quote.author}</span></a><div dir="auto">${quote.text}</div></article></div></div>` : '<div class="flex flex-col gap-3"></div>';
  const article = `
    <article class="group/post flex flex-col">
      <div class="flex gap-2">
        <div class="relative flex w-10"><div data-post-avatar="true"><a href="/${author}"><div class="x-avatar"><img alt="@${author}" src="${AVATAR}" width="40" height="40"></div></a></div></div>
        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex flex-col gap-0.5">${header}${context}<div dir="auto"><span>${text}</span></div></div>
          ${quoted}
          ${isFocal ? `<a href="/${author}/status/${id}"><time>10:15 AM · Nov 9, 2026</time></a>` : ""}
          <div role="group" aria-label="2 replies, 1 repost, 5 likes" class="flex h-5">
            <div data-engagement-action="reply" class="flex-1"><a href="/compose/post?in_reply_to=${id}">↩</a></div>
            <div data-engagement-action="retweet" class="flex-1"><button type="button" aria-haspopup="menu">⟲</button></div>
            <div data-engagement-action="like" class="flex-1"><button type="button">♡</button></div>
            ${isFocal ? "" : '<div data-engagement-action="generic" class="flex-1"><button type="button">▥</button></div>'}
            <div class="flex shrink-0 items-center"><div><span data-engagement-action="bookmark"><button type="button">⌑</button></span></div><button data-engagement-action="share" type="button">⇪</button></div>
          </div>
        </div>
      </div>
    </article>`;
  return isFocal ? `<li><div>${article}</div></li>` : `<li><div><div role="link" data-href="/${author}/status/${id}" tabindex="0">${article}</div></div></li>`;
}

function page(timelineId, items) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>X</title>
<style>
  body { margin: 0; font: 15px/1.4 system-ui; background: rgb(255,255,255); color: rgb(15,20,25); }
  main { max-width: 600px; margin: 0 auto; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { border-bottom: 1px solid #eff3f4; padding: 12px 16px; }
  .flex { display: flex; } .flex-col { flex-direction: column; } .flex-1 { flex: 1; } .gap-2 { gap: 8px; }
  .items-center { align-items: center; } .shrink-0 { flex-shrink: 0; } .w-10 { width: 40px; } .min-w-0 { min-width: 0; }
  [role="group"] { margin-top: 8px; height: 36px; align-items: center; color: rgb(83,100,113); }
  [role="group"] button, [role="group"] a { all: unset; cursor: pointer; padding: 0 8px; }
  .x-avatar img { border-radius: 50%; }
  h2 { font-size: 20px; margin: 16px; }
</style></head>
<body><main><section><div id="${timelineId}"><ul>${items.join("")}</ul></div></section></main>
<script>
  window.__navigations = [];
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-href]");
    if (link) window.__navigations.push(link.dataset.href);
  });
</script>
</body></html>`;
}

// A post's page: the focal post, its replies, then recommended posts.
export const statusPage = () =>
  page("urt:conversation:1000000000000000001:none:default", [
    post({ id: "1000000000000000001", author: "alice", text: "Shipping a new feature today.", isFocal: true }),
    post({ id: "1000000000000000002", author: "bob", text: "Great insight! This is a game-changer. 🚀" }),
    post({ id: "1000000000000000003", author: "carol", text: "Congrats Alice" }),
    post({ id: "1000000000000000004", author: "hunter", text: "Nice one" }),
    post({ id: "1000000000000000007", author: "dave", text: "Absolutely! Consistency is key. What's your top tip?" }),
    '<li><h2 role="heading">Discover more</h2></li>',
    post({ id: "1000000000000000009", author: "erin", text: "Unrelated recommended post" }),
  ]);

// A timeline: one original post, one reply, one quote of a reply.
export const homePage = () =>
  page("urt:home:following", [
    post({ id: "2000000000000000001", author: "frank", text: "Original post, not a reply" }),
    post({ id: "2000000000000000002", author: "gina", text: "Love this! So true. 💯", replyingTo: "frank" }),
    post({ id: "2000000000000000003", author: "hank", text: "Look at this", quote: { id: "2000000000000000002", author: "gina", text: "Love this! So true. 💯", replyingTo: "frank" } }),
  ]);
