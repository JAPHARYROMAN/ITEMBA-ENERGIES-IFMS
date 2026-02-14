
# IFMS Enterprise UI Rules

## Spacing & Layout
- **Grid System**: Standard 4px baseline. Use Tailwind spacing scale (4, 6, 8, 12, 16).
- **Page Container**: Max-width `7xl` (1280px) for content areas.
- **Breakpoints**: 
  - Mobile: < 640px (Sidebar hidden/collapsed)
  - Desktop: > 1024px (Standard view)

## Card Usage
- All data containers should use the `bg-card` class with `border-border`.
- Shadows should be subtle (`shadow-sm`) except for active overlays.
- Border radius: `var(--radius)` (Default 0.5rem / 8px).

## Table Design
- **Header**: Use `bg-muted/50` for table headers with uppercase bold labels.
- **Content**: Horizontal separators only (`divide-y divide-border`).
- **Interactive**: Hover states on rows are mandatory for readability.

## Typography
- **Primary Font**: 'Inter', sans-serif.
- **Hierarchy**:
  - H1: 30px (2xl), Bold, tracking-tight.
  - Body: 14px (sm), Regular.
  - Labels: 12px (xs) or 10px (tiny), Bold/Medium.

## Colors & Semantic UI
- **Primary**: Corporate Blue (`#3b82f6` light / `#3b82f6` dark).
- **Success**: Emerald for positive trends/completion.
- **Danger**: Rose for negative trends/alerts.
- **Warning**: Amber for pending/flagged states.
- **Neutrals**: Slate/Zinc palette for borders, backgrounds, and muted text.

## Accessibility
- Minimum contrast ratio 4.5:1 for body text.
- Focus rings: `ring-1 ring-primary` on all interactive elements.
- ARIA: Correct roles for sidebar, navigation, and live regions (AI insights).
