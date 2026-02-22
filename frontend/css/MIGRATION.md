# ParliScan Design System — Migration Guide

## Overview

This guide is for **Claude Code** (or a developer) to apply the new design language
to ParliScan's existing vanilla HTML/CSS/JS codebase. The approach is incremental — 
swap tokens first, then restyle components one section at a time.

---

## Files in this package

| File | Purpose |
|------|---------|
| `parliscan-tokens.css` | CSS custom properties (colours, spacing, typography, radii, etc.) |
| `parliscan-components.css` | Reusable class-based component styles |
| `MIGRATION.md` | This file — step-by-step instructions |

---

## Pre-requisites

1. **Add the DM Sans font** to your HTML `<head>`:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
   ```

2. **Copy both CSS files** into `frontend/css/`:
   ```
   frontend/css/parliscan-tokens.css
   frontend/css/parliscan-components.css
   ```

3. **Link them in your HTML** before your existing `styles.css`:
   ```html
   <link rel="stylesheet" href="css/parliscan-tokens.css">
   <link rel="stylesheet" href="css/parliscan-components.css">
   <link rel="stylesheet" href="css/styles.css">
   ```
   Loading order matters: tokens first, then components, then your existing styles
   (which you'll gradually thin out).

---

## Step-by-step migration

### Phase 1: Token swap (30 minutes)

Replace the existing `:root` variables in `styles.css` with references to the new tokens.

**Claude Code prompt:**
> Open `frontend/css/styles.css`. Find the `:root` block. For each existing custom 
> property, map it to the closest `--ps-*` token from `parliscan-tokens.css`. 
> Replace the old values but keep the old variable names as aliases so nothing breaks.
> For example: `--primary: var(--ps-accent);`

Common mappings (adapt to your actual variable names):

| Your existing variable | New token |
|----------------------|-----------|
| `--primary` | `var(--ps-accent)` |
| `--accent` | `var(--ps-accent)` |
| `--bg`, `--background` | `var(--ps-bg-base)` |
| `--bg-secondary`, `--bg-card` | `var(--ps-bg-raised)` |
| `--text`, `--text-primary` | `var(--ps-text-primary)` |
| `--text-secondary`, `--text-muted` | `var(--ps-text-secondary)` |
| `--border` | `var(--ps-border-default)` |
| `--border-light` | `var(--ps-border-faint)` |
| `--success` | `var(--ps-success)` |
| `--warning` | `var(--ps-warning)` |
| `--danger`, `--error` | `var(--ps-danger)` |

After this phase, the app should immediately look darker and more cohesive, 
even before touching any component styles.

---

### Phase 2: Layout restructure — Sidebar (1 hour)

The biggest structural change. Your current app likely uses tabs at the top. 
The new design uses a left sidebar.

**Claude Code prompt:**
> Restructure the main layout to use a left sidebar navigation. 
> Wrap the entire app in a flex container (class `ps-app`). 
> Move the tab navigation into an `<aside class="ps-sidebar">` element using 
> the classes from `parliscan-components.css`. 
> The main content area should be `<main class="ps-main">`.
> Keep all existing tab-switching JS logic — just change the HTML structure 
> and swap the click targets.

**Key HTML structure:**
```html
<div class="ps-app">
  <aside class="ps-sidebar">
    <div class="ps-sidebar__logo">...</div>
    <nav class="ps-sidebar__nav">
      <button class="ps-sidebar__nav-item ps-sidebar__nav-item--active" data-tab="scanner">
        <span class="ps-sidebar__nav-icon">⊘</span> Scanner
      </button>
      <button class="ps-sidebar__nav-item" data-tab="calendar">
        <span class="ps-sidebar__nav-icon">▦</span> Calendar
      </button>
      <!-- ... etc -->
    </nav>
    <div class="ps-sidebar__footer">
      <div class="ps-status">
        <span class="ps-status__dot ps-status__dot--connected"></span>
        API Connected
      </div>
    </div>
  </aside>
  <main class="ps-main">
    <header class="ps-header">
      <h1 class="ps-heading">Scanner</h1>
    </header>
    <div class="ps-content">
      <!-- Tab content goes here -->
    </div>
  </main>
</div>
```

---

### Phase 3: Component restyling (do one at a time)

Work through each section, replacing old classes with new `ps-*` classes.
Always preserve the JS functionality.

#### 3a. Tables (Scanner results, Stakeholders, Alerts)

**Claude Code prompt:**
> Restyle the results table in the Scanner view. Replace the existing table 
> markup/classes with `ps-table` classes from the component library. 
> Use `ps-member` for the name+party column, `ps-badge--accent` for topic pills, 
> and `ps-badge` for type indicators. Keep all existing JS click handlers and 
> data-binding intact.

#### 3b. Filter chips (Sources, Topics)

**Claude Code prompt:**
> Replace the existing source/topic checkboxes or toggles with `ps-chip` elements 
> inside a `ps-filter-bar`. Use `ps-chip--active` for selected state. 
> The existing JS that tracks selected sources/topics should toggle the 
> `ps-chip--active` class instead of checking/unchecking boxes.

#### 3c. Buttons

**Claude Code prompt:**
> Replace all button styles with `ps-btn` variants. 
> Primary actions (Run Scan) → `ps-btn ps-btn--primary`.
> Secondary actions (+ Add, + New Alert) → `ps-btn ps-btn--secondary`.
> Cancel / minor actions → `ps-btn ps-btn--ghost`.
> Small buttons → add `ps-btn--sm`.

#### 3d. Search bars

**Claude Code prompt:**
> Restyle all search/filter inputs using `ps-search` and `ps-search__input`.
> Add `ps-search__hint` for keyboard shortcut hints if desired.

#### 3e. Calendar view

**Claude Code prompt:**
> Restyle the calendar/events list using `ps-day-group__label` for date headers 
> and `ps-event-row` for individual events. Use `ps-badge` for event type 
> and `ps-badge--warning` for Lords indicators.

#### 3f. Forms (Alert creation, settings)

**Claude Code prompt:**
> Restyle all form inputs using `ps-input`, `ps-select`, and `ps-textarea`.
> These should pick up the dark background, subtle border, and indigo focus 
> ring automatically.

---

### Phase 4: Cleanup (30 minutes)

**Claude Code prompt:**
> Review `frontend/css/styles.css` and identify any rules that are now 
> overridden by the new component classes. Comment them out (don't delete yet) 
> and verify the app still looks correct. List any remaining old styles 
> that haven't been migrated.

---

## Quick reference: class name cheat sheet

### Layout
- `ps-app` → Root flex container
- `ps-sidebar` → Left sidebar
- `ps-main` → Main content area
- `ps-header` → Top bar within main
- `ps-content` → Scrollable content area

### Sidebar
- `ps-sidebar__nav-item` → Nav button
- `ps-sidebar__nav-item--active` → Active nav button
- `ps-sidebar__nav-icon` → Icon inside nav button
- `ps-status` → Status indicator in footer
- `ps-status__dot--connected` / `--disconnected` → Status dot

### Buttons
- `ps-btn--primary` → Solid indigo (main actions)
- `ps-btn--secondary` → Outlined indigo (secondary actions)
- `ps-btn--ghost` → Minimal (cancel, back)
- `ps-btn--sm` → Small size modifier

### Chips / Toggles
- `ps-chip` → Filter toggle
- `ps-chip--active` → Active state
- `ps-chip-group` → Labelled group wrapper

### Badges
- `ps-badge` → Default neutral
- `ps-badge--accent` → Indigo (topics)
- `ps-badge--success` → Green (active status)
- `ps-badge--warning` → Amber (Lords, paused)
- `ps-badge--muted` → Subtle grey

### Tables
- `ps-table` → Table element
- `ps-table-wrapper` → Scrollable wrapper
- `ps-member` → Name + party dot cell
- `ps-party-dot--labour` (etc.) → Party colour dots

### Inputs
- `ps-search__input` → Search field
- `ps-input` → General text input
- `ps-select` → Dropdown select
- `ps-textarea` → Multi-line input

---

## Tips for Claude Code sessions

1. **Always work on one section at a time.** Don't try to restyle everything in one go.
2. **Test after each phase.** Open the app in a browser after each change.
3. **Preserve JS.** The golden rule: never remove event listeners, API calls, or state 
   management. Only change HTML structure and CSS classes.
4. **Use git.** Commit after each phase so you can roll back if needed.
5. **Reference the prototype.** If something looks off, open the React prototype 
   (`parliscan-redesign.jsx`) side-by-side to compare spacing and colours.
