<p align="center"><img src="assets/icon.svg" width="88" alt=""></p>

<h1 align="center">SlopHunter for Chrome</h1>

<p align="center">One click on 💩 flags an AI slop reply on X.<br>When hunters confirm it, you earn from the week's sponsor-funded bounty.</p>

<p align="center"><a href="https://slophunter.vercel.app">slophunter.vercel.app</a></p>

---

- A small 💩 next to every reply on x.com. One click spends one bullet and flags the reply.
- 10 bullets per rolling hour. Each comes back 60 minutes after you use it.
- The popup shows your estimated earnings this week, points, rank, confirmed reports and bullets.

This repository is the whole extension. What you install from the Chrome Web Store is the [`src/`](src) folder, byte for byte. Here's [how to check](#verify-what-you-installed).

## What it sends

The extension talks to one server, the SlopHunter API at `https://slophunter.vercel.app/api/extension`, only from its background service worker, with a SlopHunter token and never with cookies.

| When | What is sent | Why |
| --- | --- | --- |
| You click **Connect** on the SlopHunter website | Nothing leaves the extension. The website hands it a SlopHunter token, kept in Chrome's extension storage on your computer. | To know it's you. |
| You click 💩 on a reply | That reply's post ID and its author's @handle. | To record your flag. The server adds your account, the time and your trust score at that moment. |
| You open the popup, and at most once a minute while x.com is open | A request for your own stats. | To show your bullets, stats and which replies you already flagged. |
| You click **Disconnect** | A request to revoke the token. | So the token stops working. |

Your X avatar in the popup loads from X's image server, like it does on x.com.

## What it never does

- Read or send reply text, images, your timeline, the list of posts on screen, page URLs or your browsing history. Buttons are placed locally, and "already flagged" is matched against your own flags, so the extension never tells the server what you look at.
- Touch X cookies, X passwords or X tokens, or ask for your X credentials. You sign in with X on the SlopHunter website, never in the extension.
- Call X's API or anything else on X's servers, or load x.com pages in the background.
- Post, like, repost, reply, follow, block, mute or report anything on X. It never clicks X's buttons.
- Read your messages.
- Run anywhere but x.com, or receive messages from any website other than SlopHunter.
- Show sponsors, ads or promotions, use analytics or trackers, or run code that isn't in this package.

## Permissions

| In `manifest.json` | Why |
| --- | --- |
| `permissions: ["storage"]` | Keeps your SlopHunter token, your stats and your recent flags on your computer. |
| `content_scripts` on `https://x.com/*` | Adds the 💩 next to replies on x.com, and nowhere else. |
| `externally_connectable` for `https://slophunter.vercel.app/*` | Lets the SlopHunter website hand over your token when you click Connect. No other site can message the extension. |

No host permissions, `tabs`, `cookies`, `scripting`, `webRequest` or `history`. The build fails if any of them shows up ([`scripts/build.mjs`](scripts/build.mjs)).

## Disconnect and delete your data

- **Disconnect this browser:** popup → Disconnect. The token is revoked and everything the extension stored is wiped. Uninstalling the extension also wipes it.
- **Disconnect every browser:** [dashboard](https://slophunter.vercel.app/dashboard) → Disconnect extension.
- **Delete your account:** [dashboard](https://slophunter.vercel.app/dashboard) → Delete my account. It revokes SlopHunter's access to X, deletes your profile and tokens, removes your public profile and anonymizes your reports, so other hunters' points don't change. Payout records are kept only as long as tax law requires.
- Or email [hi@marclou.com](mailto:hi@marclou.com).

Full details: [privacy policy](https://slophunter.vercel.app/privacy).

## Verify what you installed

The package is built without bundling, minifying or downloading anything: [`scripts/build.mjs`](scripts/build.mjs) zips `src/` with a fixed file order and timestamp, so the same source always gives the same bytes. Each release on GitHub has the zip, its SHA-256 and a signed build provenance.

```sh
git clone https://github.com/marclou/slophunter-extension
cd slophunter-extension
git checkout v1.0.0
node scripts/build.mjs          # prints the SHA-256: compare it with the release's SHA256SUMS
```

Check the copy the Chrome Web Store serves, file by file, against `src/`:

```sh
node scripts/verify.mjs --store <extension id>
```

The store adds its own signatures (`_metadata/`) and an `update_url` to the manifest. The script ignores those and compares every other byte.

Check that a release zip was built by GitHub Actions from this repository:

```sh
gh attestation verify slophunter-extension-v1.0.0.zip --repo marclou/slophunter-extension
```

Building and verifying need Node.js 22.12 or newer and nothing else: no `npm install`.

## Develop

```sh
npm install                                   # Playwright, for the end-to-end tests
npm run mock                                  # local SlopHunter API on http://127.0.0.1:8787
npm run dev                                   # dist/dev, pointed at the mock
npm run browser                               # Chromium with the dev build, on x.com
npm test                                      # unit tests
npm run test:e2e                              # Chromium + mock API + test pages
```

Or load `dist/dev` from `chrome://extensions` (Developer mode → Load unpacked). Dev builds have a fixed ID, `kkhehjjmafpclphfoifofbjnmiabmgif`, which the SlopHunter website accepts, so `npm run dev -- --site https://slophunter.vercel.app` gives a dev build that works with the real site.

## License

[MIT](LICENSE). Fonts in `src/fonts`: Ultra by Astigmatic ([Apache 2.0](src/fonts/LICENSE-Ultra.txt)) and Schibsted Grotesk by Schibsted ([SIL Open Font License](src/fonts/OFL-SchibstedGrotesk.txt)).
