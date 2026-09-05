# UI / UX Design Plan

## Design Philosophy

> **"Feels like a premium dev tool, not a student project."**

Three principles:
1. **Minimal surface** — the popup does one thing per screen, no clutter
2. **Instant feedback** — every action has a visible response within 200ms
3. **Dark-first** — developers live in dark mode; this is the default

---

## Color Palette

```
Background base:    #0d1117   (GitHub dark — familiar to devs)
Surface card:       #161b22   (slightly lighter panel)
Border:             #30363d   (subtle separator)
Accent green:       #10b981   (success, connected state)
Accent orange:      #f97316   (LeetCode brand color)
Accent blue:        #3b82f6   (interactive elements, links)
Text primary:       #e6edf3   (high contrast)
Text secondary:     #8b949e   (labels, captions)
Error red:          #ef4444
```

---

## Typography

- **Font:** `Inter` (loaded via `@font-face` from bundled woff2, no CDN)
- **Fallback:** `system-ui, -apple-system, sans-serif`
- **Sizes:** 11px (caption) / 13px (body) / 15px (heading) / 20px (logo)
- **Weight:** 400 (body), 500 (labels), 600 (headings), 700 (logo)

---

## Popup Dimensions

- **Width:** 360px (fixed)
- **Min-height:** 480px
- **Max-height:** 560px (scrollable content inside)

---

## The 3 Views

### View 1 — Setup (first launch)

```
┌─────────────────────────────────────┐
│  ⬡  GitGrind              v1.0.0   │  ← logo + version
│  Sync LeetCode → GitHub             │  ← tagline
├─────────────────────────────────────┤
│                                     │
│  Connect your GitHub account        │  ← section heading
│                                     │
│  ┌─────────────────────────────┐    │
│  │ ghp_xxxxxxxxxxxxxxxxxxxx    │    │  ← PAT input (password type)
│  └─────────────────────────────┘    │
│  [?] How to create a token          │  ← link to GitHub docs
│                                     │
│  ┌─────────────────────────────┐    │
│  │  ✓  Connect to GitHub       │    │  ← primary CTA button
│  └─────────────────────────────┘    │
│                                     │
│  Needs: repo scope                  │  ← helper text
└─────────────────────────────────────┘
```

**Interactions:**
- PAT input shows/hides with eye icon toggle
- "Connect" button shows spinner while validating
- On success: green flash + auto-advance to View 2
- On failure: red shake animation + error message inline

---

### View 2 — Repo Picker

```
┌─────────────────────────────────────┐
│  ⬡  GitGrind                        │
│  Connected as @username  ✓          │  ← green badge
├─────────────────────────────────────┤
│                                     │
│  Choose a repository                │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ ▼  my-leetcode-solutions    │    │  ← styled <select>
│  └─────────────────────────────┘    │
│                                     │
│  ── or ──                           │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  + Create new repo          │    │  ← secondary button
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  → Start Syncing            │    │  ← primary CTA
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

**Interactions:**
- Repo list loads with skeleton shimmer while fetching
- "Create new repo" opens an inline text input (no new page)
- "Start Syncing" saves selection and transitions to View 3

---

### View 3 — Dashboard (active state)

```
┌─────────────────────────────────────┐
│  ⬡  GitGrind              ● Live    │  ← green pulsing dot
├─────────────────────────────────────┤
│                                     │
│  📁  username/my-leetcode-solutions │  ← repo link (clickable)
│                                     │
├─────────────────────────────────────┤
│                                     │
│  Problems Solved                    │
│                                     │
│   ┌──────┐  ┌──────┐  ┌──────┐     │
│   │  42  │  │  18  │  │  12  │     │
│   │ Easy │  │ Med  │  │ Hard │     │
│   └──────┘  └──────┘  └──────┘     │
│                                     │
│  Last synced: Two Sum  2m ago       │  ← last sync info
│                                     │
├─────────────────────────────────────┤
│  [⚙ Settings]        [Disconnect]  │
└─────────────────────────────────────┘
```

**Interactions:**
- Repo name is a clickable link → opens GitHub repo in new tab
- Stats cards have a subtle count-up animation on open
- "Last synced" updates in real-time from `chrome.storage.local`
- "Disconnect" shows a confirmation inline (no modal)
- Settings expands an inline panel (no new view)

---

## Settings Panel (inline, inside View 3)

```
┌─────────────────────────────────────┐
│  Settings                      ✕   │
│                                     │
│  Auto-sync on Accept                │
│  ○────────────────────●  ON         │  ← toggle
│                                     │
│  Only sync first accepted           │
│  ○────────────────────●  ON         │  ← toggle (skip re-submissions)
│                                     │
│  Custom commit message              │
│  ┌─────────────────────────────┐    │
│  │ [Accepted] {title} ...      │    │  ← textarea with variable chips
│  └─────────────────────────────┘    │
│  Variables: {title} {runtime}       │
│             {memory} {difficulty}   │
│                                     │
│  [Save Settings]                    │
└─────────────────────────────────────┘
```

---

## Micro-interactions & Animations

| Trigger | Animation |
|---------|-----------|
| View transition | `opacity 0→1` + `translateY(8px→0)` over 200ms |
| Button click | Scale `1 → 0.97` on press, back on release |
| Error state | Horizontal shake (3 cycles, 300ms total) |
| Success state | Green border flash + checkmark icon swap |
| Badge update | Extension icon badge fades in ✓ green, clears after 5s |
| Skeleton loader | Shimmer gradient animation on repo list |
| Stats cards | Count-up from 0 to value over 600ms on popup open |
| Live dot | Slow pulse (`opacity 1 → 0.4 → 1`) every 2s |

---

## What We Are NOT Doing (UX Simplifications)

| Removed Feature | Reason |
|----------------|--------|
| Difficulty subfolders toggle | Adds confusion, not needed for v1 |
| Language subfolders toggle | Same |
| Timestamp filenames toggle | Power-user feature, Phase 2 |
| Solution post auto-commit | Out of scope |
| Welcome page (separate tab) | Unnecessary — popup is enough |
| Social links in popup | Clutter |

---

## Accessibility

- All interactive elements have `:focus-visible` outlines
- Color is never the only indicator (icons + text always accompany color)
- Minimum touch target: 36px height
- Contrast ratio: all text meets WCAG AA (4.5:1 minimum)
