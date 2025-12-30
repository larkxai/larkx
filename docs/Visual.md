# 🎨 Visual Design Guidelines  
## Larkx (MVP)

This document defines **directional visual guidance** for Larkx.  
It is **not a final design specification**.

The goal is to ensure consistency, focus, and clarity while building the MVP.

---

## 1. Design Principles

- Dark-theme–first
- Minimal, tool-focused UI
- High signal-to-noise ratio
- Content > decoration
- Optimized for **scanning and decision-making**, not browsing

The UI should feel:
- Calm
- Trustworthy
- Analytical
- Founder-oriented

Larkx should feel like a **control center**, not a marketing site.

---

## 2. Theme & Framework

- **Theme:** Dark
- **Styling:** Tailwind CSS
- **Component library:** shadcn/ui

Responsibilities:
- **Tailwind CSS**
  - Layout
  - Spacing
  - Color tokens
  - Responsive behavior
- **shadcn/ui**
  - Accessible UI primitives
  - Composable components
  - Consistent interaction patterns

Avoid custom UI frameworks or heavy overrides.

---

## 3. Color Roles (Dark Theme)

### Backgrounds
- **App background:** near-black / very dark neutral (e.g. slate-950)
- **Surfaces / cards:** slightly elevated dark gray (e.g. slate-900 / slate-800)

### Text
- **Primary text:** near-white (high contrast)
- **Secondary text:** muted gray
- **Disabled / hint text:** low-contrast gray

Text must always remain readable in low-light environments.

---

### Brand / Primary Color
- Used for:
  - Primary actions (Submit, Continue, Fix & Resubmit)
  - Active states
  - Key highlights
- Should be **restrained**
- Must not overpower content

Primary color is an accent, not decoration.

---

### Accent Colors
Used sparingly for:
- Status indicators
- “New” or “Attention” badges
- Release state highlights

### State Colors
- **Success:** muted green
- **Warning:** muted amber
- **Error:** muted red

Avoid neon, saturated, or aggressive colors.

---

## 4. Accessibility Considerations

- Maintain sufficient contrast for all text
- Never rely on color alone to convey meaning
- Interactive elements must have:
  - Clear hover states
  - Visible focus states
- Font sizes must remain readable at default zoom

Dark theme must remain usable for long working sessions.

---

## 5. Layout & Components

### Expected Usage of shadcn/ui

Core components:
- Buttons
- Badges
- Cards
- Inputs & Selects
- Tabs / filters
- Dropdowns
- Dialogs / sheets
- Steppers (for flows)

Components should:
- Be composable
- Remain visually lightweight
- Respect shadcn defaults wherever possible

Avoid building custom primitives unless strictly necessary.

---

## 6. Interaction & UX Notes

- Primary flows should be **wizard-based**
  - Onboarding
  - Store connection
  - Submission
  - Resubmission
- Progress must always be visible
- AI guidance should be:
  - Contextual
  - Inline
  - Calm (never alarming)

### Loading States
- Prefer skeletons over spinners
- Avoid blocking UI where possible

### Empty States
- Explain *why* content is missing
- Suggest the next action clearly

---

## 7. Visual Anti-Goals

- ❌ No gradient-heavy marketing UI
- ❌ No glassmorphism
- ❌ No dashboard clutter
- ❌ No decorative animations
- ❌ No unnecessary charts

Larkx should feel like a **serious operational tool**, not a landing page builder or analytics vanity dashboard.

---

## 8. Mental Model

Larkx UI should feel like:
- A release checklist
- A control panel
- A guided assistant

Not like:
- A design tool
- A CMS
- A marketing site
