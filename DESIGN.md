# ClinicFlow design system

Stack: plain HTML, CSS and JavaScript. No Bootstrap, no React, no build tools, no icon library. Chart.js (CDN) is used only on pages with charts.
Every page has its own `.html`, `.css` and `.js` file. There is NO shared stylesheet.

This project already has pages that use older `cf-` classes and `--cf-*` variables with the font Nunito Sans. We are restyling them in place to this design. Keep each page's file name, markup structure, JavaScript behavior, data and links. Change only styling, and class names where needed to match this file.

How to apply this file:
- Paste sections 1, 2 and 3 at the top of every page's CSS file. Keep the token block (section 1) identical on every page.
- Add page-specific CSS after them. You may delete component CSS a page does not use, but never the tokens.
- Replace each page's old token block with section 1. Old token names that no longer exist (for example `--cf-accent`, `--cf-accent-strong`, `--cf-font-head`) must be replaced everywhere they are used with the new tokens.
- Replace the font Nunito Sans with Plus Jakarta Sans on every page.
- Icons: keep the icons the project already uses (inline SVG). Do not add an icon library.

---

## Look

- Flat. No gradients anywhere. Small corner radii (4 to 10px). Pills only for badges and filter tabs.
- Font: Plus Jakarta Sans. Big numbers use weight 800 and `tabular-nums`.
- Colors: charcoal, light gray page, lime, lavender. Light and dark mode with a Sun/Moon toggle. Both themes must look good.
- Cards carry color instead of staying white. A card's color tells you what it is:
  - lime card = the important thing right now (Called ticket, Now serving)
  - lavender card = waiting and information
  - yellow card = Near
  - charcoal card = charts and counters
  - white card = neutral content and long lists (service list, waiting rows)
- Text on lime and lavender cards is always `#151515`, in both themes. Those cards look the same in light and dark mode.
- One filled primary button per screen. Primary is charcoal with white text in light mode, lime with dark text in dark mode.
- Destructive buttons (Cancel ticket) are outline red. Never filled.
- Status is never shown by color alone. Every badge has a dot and a text label.
- Never use lime as text color on white or gray. Lime is only a fill, with dark text on it.

## Ticket state to card color

| State | Card | Badge |
|---|---|---|
| Waiting | `cf-card-lavender` | `cf-badge-ink` (black, white text) |
| Near | `cf-card-near` | `cf-near` |
| Called | `cf-card-lime` | `cf-badge-ink-lime` (black, lime text) |
| Completed | `cf-card` (white) | `cf-completed` |
| Skipped | `cf-card` (white) | `cf-skipped` |
| Cancelled / Expired | `cf-card` (white) | `cf-cancelled` |

Service queue status badges: `cf-open`, `cf-paused`, `cf-closed`.

## Screens

**Patient (phones).** No sidebar. Header with small "Hi, User" text above the page title, and the Sun/Moon toggle. Ticket card with service name, big ticket number, state badge, two stat boxes (Position, Est. wait), progress bar, "N people ahead of you". Below it: "I'm here" (primary) and "Cancel ticket" (danger outline). Bottom tab bar: Home, Ticket, History, Profile.

**Staff console (desktop).** Floating panels: top bar, sidebar, main. Top bar has the service picker, the queue status badge and the theme toggle. Main has: Pause and Close queue buttons, three stat cards (Waiting in lavender, Avg. wait in white, Served in charcoal), a lime "Now serving" card with Complete, Skip (ink outline) and Call next (ink filled), filter pills (Waiting, Called, Done), "Add walk-in" button, then the queue rows. The Near row is yellow.

**Admin dashboard (desktop).** Same shell. Stat cards in lime, lavender, white and charcoal. A charcoal card with a Chart.js bar chart (lavender bars, highlight bar in lime). A white card listing services with Open, Paused or Closed badges. Admin also has Services, Users, Records and Settings pages that reuse the same cards, rows, forms and badges.

**Now Serving board (TV).** Header bar with "Room 2 · General consultation" on ONE line, an Open badge and a clock. Below: a big lime card with "Now serving" and the current number on ONE line (`G-012`, never wrapped), plus a "Please go to Room 2" chip. Next to it: a "Next up" list where the first item is lavender and the rest are white. No theme toggle button on screen: theme comes from `?theme=light` or `?theme=dark` (default dark), and the T key flips it.

---

## 1. Tokens

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

:root,
[data-theme="light"] {
  --cf-bg: #E3E3E3;
  --cf-panel: #FFFFFF;
  --cf-surface: #FFFFFF;
  --cf-surface-2: #F0F0F0;
  --cf-text: #151515;
  --cf-text-muted: #6E6E6E;
  --cf-border: #D2D2D2;
  --cf-line: #9A9A9A;

  --cf-primary: #1F1F1F;
  --cf-on-primary: #FFFFFF;
  --cf-lime: #D9F26B;
  --cf-on-lime: #151515;
  --cf-lavender: #9D90EE;
  --cf-lavender-soft: #B9AFF3;
  --cf-charcoal: #1F1F1F;
  --cf-ink: #151515;

  --cf-danger: #C62F2F;
  --cf-danger-soft: #FBE0E0;

  --cf-waiting-bg: #CFC8F7;   --cf-waiting-fg: #2A2170;
  --cf-near-bg: #FFEFA8;      --cf-near-fg: #6B5200;
  --cf-called-bg: #151515;    --cf-called-fg: #D9F26B;
  --cf-completed-bg: #CDEBD3; --cf-completed-fg: #1B5E2E;
  --cf-skipped-bg: #E0E0E0;   --cf-skipped-fg: #444444;
  --cf-cancelled-bg: #FBE0E0; --cf-cancelled-fg: #9B2222;
  --cf-open-bg: #D9F26B;      --cf-open-fg: #2B3A00;
  --cf-paused-bg: #FFEFA8;    --cf-paused-fg: #6B5200;
  --cf-closed-bg: #FBE0E0;    --cf-closed-fg: #9B2222;

  --cf-radius-sm: 4px;
  --cf-radius: 6px;
  --cf-radius-lg: 8px;
  --cf-radius-xl: 10px;
  --cf-radius-pill: 999px;
  --cf-shadow-sm: 0 1px 2px rgba(0, 0, 0, .06);
  --cf-shadow-md: 0 6px 18px rgba(0, 0, 0, .10);

  --cf-space-1: 4px;  --cf-space-2: 8px;  --cf-space-3: 12px;
  --cf-space-4: 16px; --cf-space-5: 24px; --cf-space-6: 32px; --cf-space-7: 48px;

  --cf-font: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
}

[data-theme="dark"] {
  --cf-bg: #161616;
  --cf-panel: #232323;
  --cf-surface: #232323;
  --cf-surface-2: #2E2E2E;
  --cf-text: #F2F2F2;
  --cf-text-muted: #A0A0A0;
  --cf-border: #383838;
  --cf-line: #6A6A6A;

  --cf-primary: #D9F26B;
  --cf-on-primary: #151515;
  --cf-lavender: #B9AFF3;
  --cf-charcoal: #303030;

  --cf-danger: #FF8A80;
  --cf-danger-soft: #4A1D1D;

  --cf-waiting-bg: #3A3560;   --cf-waiting-fg: #CFC8F7;
  --cf-near-bg: #4A3F10;      --cf-near-fg: #FFE27A;
  --cf-called-bg: #D9F26B;    --cf-called-fg: #151515;
  --cf-completed-bg: #1F3A28; --cf-completed-fg: #8FE0A6;
  --cf-skipped-bg: #3C3C3C;   --cf-skipped-fg: #C8C8C8;
  --cf-cancelled-bg: #4A1D1D; --cf-cancelled-fg: #FF9C94;
  --cf-open-bg: #3A4416;      --cf-open-fg: #D9F26B;
  --cf-paused-bg: #4A3F10;    --cf-paused-fg: #FFE27A;
  --cf-closed-bg: #4A1D1D;    --cf-closed-fg: #FF9C94;

  --cf-shadow-sm: 0 1px 2px rgba(0, 0, 0, .4);
  --cf-shadow-md: 0 6px 18px rgba(0, 0, 0, .45);
}
```

## 2. Base and shell

```css
body { font-family: var(--cf-font); color: var(--cf-text); background: var(--cf-bg); min-height: 100vh; }
h1, h2, h3, h4 { font-weight: 800; letter-spacing: -.02em; }

.cf-app { padding: var(--cf-space-4); }
.cf-panel { background: var(--cf-panel); border: 1px solid var(--cf-border); border-radius: var(--cf-radius-xl); }
.cf-topbar { display: flex; align-items: center; gap: var(--cf-space-4); padding: var(--cf-space-3) var(--cf-space-5); }
.cf-layout { display: grid; grid-template-columns: 240px 1fr; gap: var(--cf-space-4); margin-top: var(--cf-space-4); }
.cf-sidebar { padding: var(--cf-space-3); display: flex; flex-direction: column; gap: 4px; min-height: calc(100vh - 110px); }
.cf-main { padding: var(--cf-space-5); }

.cf-nav-item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: var(--cf-radius); color: var(--cf-text); font-weight: 600; text-decoration: none; }
.cf-nav-item:hover { background: var(--cf-surface-2); }
.cf-nav-item.active { background: var(--cf-primary); color: var(--cf-on-primary); }

.cf-pill { padding: 6px 16px; border-radius: var(--cf-radius-pill); border: 1px solid var(--cf-border); background: var(--cf-surface); color: var(--cf-text-muted); font-weight: 600; font-size: .875rem; cursor: pointer; }
.cf-pill.active { background: var(--cf-primary); border-color: var(--cf-primary); color: var(--cf-on-primary); }

.cf-row { background: var(--cf-surface); border: 1px solid var(--cf-border); border-radius: var(--cf-radius-lg); padding: var(--cf-space-3) var(--cf-space-4); margin-bottom: var(--cf-space-3); }
.cf-row-near { background: var(--cf-near-bg); border-color: transparent; color: var(--cf-near-fg); }
```

## 3. Components

```css
/* Buttons */
.cf-btn { min-height: 44px; padding: 0 var(--cf-space-5); border-radius: var(--cf-radius); border: 1.5px solid transparent; font-family: var(--cf-font); font-weight: 700; font-size: .9375rem; display: inline-flex; align-items: center; justify-content: center; gap: var(--cf-space-2); cursor: pointer; transition: opacity .15s, transform .08s; }
.cf-btn:active { transform: translateY(1px); }
.cf-btn-primary { background: var(--cf-primary); color: var(--cf-on-primary); }
.cf-btn-primary:hover { opacity: .9; }
.cf-btn-outline { background: transparent; color: var(--cf-text); border-color: var(--cf-line); }
.cf-btn-danger { background: transparent; color: var(--cf-danger); border-color: var(--cf-danger); }
.cf-btn-ink { background: #151515; color: #FFFFFF; }                 /* on lime or lavender cards */
.cf-btn-ink-outline { background: transparent; color: #151515; border-color: #151515; }
.cf-btn-block { width: 100%; }

/* Cards */
.cf-card { background: var(--cf-surface); border: 1px solid var(--cf-border); border-radius: var(--cf-radius-lg); padding: var(--cf-space-4); }
.cf-card-raised { box-shadow: var(--cf-shadow-md); }
.cf-card-lime { background: var(--cf-lime); color: var(--cf-ink); border-color: transparent; }
.cf-card-lavender { background: var(--cf-lavender-soft); color: var(--cf-ink); border-color: transparent; }
.cf-card-near { background: var(--cf-near-bg); color: var(--cf-near-fg); border-color: transparent; }
.cf-card-dark { background: var(--cf-charcoal); color: #FFFFFF; border-color: transparent; }
.cf-text-muted { color: var(--cf-text-muted); font-size: .75rem; }
.cf-card-lime .cf-text-muted, .cf-card-lavender .cf-text-muted { color: rgba(21, 21, 21, .7); }
.cf-card-dark .cf-text-muted { color: #BDBDBD; }

.cf-stat { background: #FFFFFF; color: #151515; border-radius: var(--cf-radius); padding: var(--cf-space-3); text-align: center; }
.cf-stat-ink { background: #151515; color: #FFFFFF; }
.cf-stat b { display: block; font-size: 1.5rem; font-weight: 800; letter-spacing: -.02em; }
.cf-stat span { font-size: .75rem; opacity: .7; font-weight: 600; }

.cf-progress { height: 8px; background: rgba(21, 21, 21, .18); border-radius: 4px; overflow: hidden; }
.cf-progress > div { height: 100%; background: #151515; border-radius: 4px; }

/* Badges: always a dot plus a label */
.cf-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: var(--cf-radius-pill); font-size: .75rem; font-weight: 700; white-space: nowrap; }
.cf-badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.cf-waiting   { background: var(--cf-waiting-bg);   color: var(--cf-waiting-fg); }
.cf-near      { background: var(--cf-near-bg);      color: var(--cf-near-fg); }
.cf-called    { background: var(--cf-called-bg);    color: var(--cf-called-fg); }
.cf-completed { background: var(--cf-completed-bg); color: var(--cf-completed-fg); }
.cf-skipped   { background: var(--cf-skipped-bg);   color: var(--cf-skipped-fg); }
.cf-cancelled { background: var(--cf-cancelled-bg); color: var(--cf-cancelled-fg); }
.cf-open      { background: var(--cf-open-bg);      color: var(--cf-open-fg); }
.cf-paused    { background: var(--cf-paused-bg);    color: var(--cf-paused-fg); }
.cf-closed    { background: var(--cf-closed-bg);    color: var(--cf-closed-fg); }
.cf-badge-ink { background: #151515; color: #FFFFFF; }                /* on lavender cards */
.cf-badge-ink-lime { background: #151515; color: var(--cf-lime); }    /* on lime cards */

/* Forms */
.cf-label { display: block; font-size: .75rem; font-weight: 700; margin-bottom: 6px; }
.cf-input { width: 100%; min-height: 44px; padding: 0 var(--cf-space-3); background: var(--cf-surface); color: var(--cf-text); border: 1px solid var(--cf-border); border-radius: var(--cf-radius); font-family: var(--cf-font); font-size: 1rem; }
.cf-input:focus { outline: none; border-color: var(--cf-text); box-shadow: 0 0 0 3px var(--cf-lime); }
.cf-input.is-error { border-color: var(--cf-danger); }
.cf-error { color: var(--cf-danger); font-size: .8125rem; margin-top: 4px; }

/* Patient ticket and bottom tabs */
.cf-ticket-number { font-weight: 800; font-size: 3.5rem; text-align: center; letter-spacing: -.04em; line-height: 1.05; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cf-tabs { position: fixed; left: 0; right: 0; bottom: 0; display: flex; background: var(--cf-surface); border-top: 1px solid var(--cf-border); padding: 8px 6px calc(12px + env(safe-area-inset-bottom)); z-index: 10; }
.cf-tabs a { flex: 1; text-align: center; font-size: .6875rem; color: var(--cf-text-muted); text-decoration: none; }
.cf-tabs a.active { color: var(--cf-text); font-weight: 800; }
.cf-tabs a.active i { background: var(--cf-lime); color: var(--cf-on-lime); padding: 1px 14px; border-radius: var(--cf-radius-pill); }

/* Now Serving board (TV) */
.cf-board { min-height: 100vh; padding: 2vw; display: flex; flex-direction: column; gap: 1.5vw; }
.cf-board-top { display: flex; align-items: center; gap: 16px; background: var(--cf-surface); border: 1px solid var(--cf-border); border-radius: var(--cf-radius-xl); padding: 1vw 2vw; }
.cf-board-label { font-size: clamp(1.25rem, 3vw, 3rem); font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cf-board-clock { margin-left: auto; font-size: clamp(1.25rem, 3vw, 3rem); font-weight: 700; color: var(--cf-text-muted); white-space: nowrap; }
.cf-board-grid { flex: 1; display: grid; grid-template-columns: 1.6fr 1fr; gap: 1.5vw; }
.cf-board-main { container-type: inline-size; background: var(--cf-lime); color: var(--cf-on-lime); border-radius: var(--cf-radius-xl); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2vw; }
.cf-board-number { font-weight: 800; font-size: 14vw; font-size: 30cqw; letter-spacing: -.04em; line-height: 1; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cf-board-next { display: flex; flex-direction: column; gap: 1vw; }
.cf-board-next-item { background: var(--cf-surface); border: 1px solid var(--cf-border); border-radius: var(--cf-radius-lg); padding: 1vw 1.5vw; font-size: clamp(1.5rem, 3.5vw, 4rem); font-weight: 800; white-space: nowrap; display: flex; justify-content: space-between; align-items: center; }
.cf-board-next-item:first-child { background: var(--cf-lavender-soft); color: var(--cf-ink); border-color: transparent; }

/* Small helpers (replace Bootstrap utilities) */
.cf-center { text-align: center; }
.cf-bold { font-weight: 700; }
.cf-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--cf-space-2); }
.cf-mt-2 { margin-top: var(--cf-space-2); }
.cf-mt-3 { margin-top: var(--cf-space-3); }

/* Modal */
.cf-modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: none; align-items: center; justify-content: center; padding: var(--cf-space-4); z-index: 100; }
.cf-modal-backdrop.is-open { display: flex; }
.cf-modal { background: var(--cf-surface); color: var(--cf-text); border: 1px solid var(--cf-border); border-radius: var(--cf-radius-xl); padding: var(--cf-space-5); width: 100%; max-width: 360px; }
.cf-modal-actions { display: flex; gap: var(--cf-space-2); justify-content: flex-end; margin-top: var(--cf-space-4); }

/* Phones: hide sidebar (patients use the bottom tabs) */
@media (max-width: 768px) {
  .cf-layout { grid-template-columns: 1fr; }
  .cf-sidebar { display: none; }
  .cf-main { padding: var(--cf-space-4); padding-bottom: 88px; }
  .cf-topbar { padding: var(--cf-space-3) var(--cf-space-4); }
}
```

## 4. Theme JavaScript

Put this in the `<head>` of every page except the board, so there is no flash of the wrong theme.

```js
(function () {
  const saved = localStorage.getItem('cf-theme');
  const prefers = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', saved || prefers);
})();

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('cf-theme', next);
  document.dispatchEvent(new Event('cf-theme-change'));
}
```

The Sun/Moon button calls `toggleTheme()`. It shows the sun icon in light mode and the moon icon in dark mode. The theme attribute is `data-theme` on `<html>`. If the existing pages already use a different attribute or storage key, keep theirs and change the selectors in section 1 to match, the same way on every page.

Board page only (separate storage key, default dark, no toggle button):

```js
(function () {
  const fromUrl = new URLSearchParams(location.search).get('theme');
  const saved = localStorage.getItem('cf-board-theme');
  const theme = fromUrl || saved || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  if (fromUrl) localStorage.setItem('cf-board-theme', fromUrl);
})();

document.addEventListener('keydown', function (e) {
  if (e.key.toLowerCase() !== 't') return;
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('cf-board-theme', next);
});
```

## 5. Reference markup

Waiting ticket card:

```html
<div class="cf-card cf-card-lavender">
  <div class="cf-center cf-bold cf-text-muted">General consultation</div>
  <div class="cf-ticket-number">G-014</div>
  <div class="cf-center"><span class="cf-badge cf-badge-ink">Waiting</span></div>
  <div class="cf-grid-2 cf-mt-3">
    <div class="cf-stat cf-stat-ink"><b>4th</b><span>Position</span></div>
    <div class="cf-stat"><b>~15 min</b><span>Est. wait</span></div>
  </div>
  <div class="cf-progress cf-mt-3"><div style="width: 60%"></div></div>
  <div class="cf-center cf-text-muted cf-mt-2">3 people ahead of you</div>
</div>
<button class="cf-btn cf-btn-primary cf-btn-block cf-mt-3">I'm here</button>
<button class="cf-btn cf-btn-danger cf-btn-block cf-mt-2">Cancel ticket</button>
```

Called ticket card:

```html
<div class="cf-card cf-card-lime">
  <div class="cf-center cf-bold cf-text-muted">General consultation</div>
  <div class="cf-ticket-number">G-014</div>
  <div class="cf-center"><span class="cf-badge cf-badge-ink-lime">Called</span></div>
  <div class="cf-stat cf-stat-ink cf-mt-3"><span>Go to</span><b style="font-size: 2.5rem">Room 2</b></div>
  <div class="cf-center cf-text-muted cf-mt-2">Please go to the room now</div>
</div>
<button class="cf-btn cf-btn-primary cf-btn-block cf-mt-3">I'm on my way</button>
```

Confirmation modal (plain CSS and JS, open and close by toggling the `is-open` class):

```html
<div class="cf-modal-backdrop" id="cancel-modal">
  <div class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
    <h3 id="cancel-title">Cancel ticket G-014?</h3>
    <div class="cf-modal-actions">
      <button class="cf-btn cf-btn-outline">Keep ticket</button>
      <button class="cf-btn cf-btn-danger">Yes, cancel</button>
    </div>
  </div>
</div>
```

## 6. Chart.js

Read colors from the CSS variables so charts follow the theme, and rebuild the chart when the theme changes.

```js
function cfColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
// Bar chart on a .cf-card-dark card: bars use cfColor('--cf-lavender'),
// the highlighted bar uses cfColor('--cf-lime'), axis text uses '#BDBDBD'.
document.addEventListener('cf-theme-change', renderCharts); // renderCharts() destroys and recreates each chart
```

## 7. Rules for Claude Code

- Never hardcode a hex color in page CSS. Use a `--cf-*` token. The only exceptions are `#151515` and `#FFFFFF` on lime, lavender and charcoal cards, which are already inside the classes above.
- No gradients, and no radius above 10px except pills.
- No Bootstrap and no new libraries. Chart.js is only for charts.
- Every status has a badge with a dot and a text label.
- Mobile first for patient pages. They must work at 360px wide, with the bottom tab bar and `padding-bottom: 88px` on the content.
- Test every page in light and dark mode before saying it is done.
- If a token or class is missing, add it to this file first, then update every page that needs it. Do not invent one-off colors in a single page.
