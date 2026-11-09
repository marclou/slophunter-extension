# Chrome Web Store listing

Everything the Chrome Web Store dashboard asks for, ready to paste. Images in this folder come from `node dev/store-assets.mjs` (the real extension on real x.com).

## Package

`slophunter-extension-v<version>.zip` from the GitHub release for that tag (built by `.github/workflows/release.yml`), or `node scripts/build.mjs` locally. Same bytes either way.

## Store listing

**Name:** SlopHunter

**Summary** (manifest `description`, 95/132 characters):

> Flag AI slop replies on X in one click. Earn from sponsor-funded bounties for confirmed reports.

**Description:**

```
SlopHunter adds a small 💩 next to replies on x.com.

See a reply you think is AI slop? Click 💩. One click spends one bullet and flags it.

When enough hunters flag the same reply, it's confirmed by hunters and everyone who flagged it earns points. Early flags earn more points. You earn from sponsor-funded bounties for confirmed reports, in proportion to your points.

• 10 bullets per rolling hour, each back 60 minutes after you use it
• The popup shows your estimated earnings this week, points, rank, confirmed reports and bullets
• Sign in with X on slophunter.vercel.app, then click Connect

Private by design
• Sends nothing until you click 💩, then only that reply's post ID and author handle
• Never reads reply text, your timeline or your messages
• Never touches X cookies or passwords, and never posts, likes, follows or reports anything on X
• Runs only on x.com. No ads, no trackers.

Open source, and the store package is reproducible from the code:
github.com/marclou/slophunter-extension
```

**Category:** Lifestyle → Social Networking (not Games)

**Language:** English

**Graphic assets:**

| Field | File |
| --- | --- |
| Store icon (128×128) | `icon-128.png` |
| Screenshots (1280×800) | `screenshots/1-flag.png`, `screenshots/2-popup.png` |
| Small promo tile (440×280) | `promo-440x280.png` |
| Marquee promo tile (1400×560) | `promo-1400x560.png` |

**Official URL:** none. **Homepage URL:** `https://slophunter.vercel.app`. **Support URL:** `https://github.com/marclou/slophunter-extension/issues`.

**Mature content:** No.

## Privacy practices

**Single purpose:**

> Flag AI slop replies on x.com for the SlopHunter community and see your hunting stats.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Keeps the hunter's SlopHunter token, stats and recent flags on their computer so the 💩 buttons and the popup work. |
| Host permission `https://x.com/*` (content script) | Adds the 💩 button next to replies on x.com and, when the hunter clicks it, reads that reply's post ID and author handle to flag it. |

**Remote code:** No, I am not using remote code. All JavaScript ships in the package; the API returns JSON only.

**Data usage**, what the extension collects:

| Type | Collected | What |
| --- | --- | --- |
| Personally identifiable information | Yes | The hunter's X user ID and handle |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | Yes | The hunter's SlopHunter token |
| Personal communications | No | |
| Location | No | |
| Web history | No | |
| User activity | Yes | Flags: which reply, when |
| Website content | Yes | Flagged replies' post IDs and author handles |

Certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://slophunter.vercel.app/privacy`

## Distribution

Free, public, all regions. Visibility: public once Marc submits.

Before submitting:

- The production domain is final, and `homepage_url` and `externally_connectable` in `src/manifest.json` use it (changing it later means a new version and review).
- The website's `EXTENSION_IDS` includes the store item's ID (shown once the item is created as a draft).
- Marc's Chrome Web Store account: developer registration paid, 2-Step Verification on, contact email verified, trader or non-trader declared (EU).
