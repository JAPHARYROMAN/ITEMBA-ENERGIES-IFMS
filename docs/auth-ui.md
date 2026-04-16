# Auth UI Rules (IFMS)

This document defines UI/UX standards for authentication pages in IFMS:

- `/login`
- `/signup`
- `/forgot-password`

## 1) Layout and Structure

- Use `AuthShell` for all auth pages to keep responsive behavior consistent.
- Mobile-first order:
  1. Form panel
  2. Brand panel
- Desktop order:
  1. Brand panel (left)
  2. Form panel (right)
- Keep stable container sizing (`min-height`) to reduce layout shift when validation and server feedback appears.

## 2) Visual System

- Use existing IFMS design tokens (`bg-card`, `border-border`, `text-muted-foreground`, etc.).
- Avoid heavy gradients or decorative effects.
- Use subtle shadows and rounded corners for depth.
- Preserve high contrast text on form labels, inputs, and CTA buttons.

## 3) Forms and Validation

- Use React Hook Form + Zod for auth forms.
- Validation modes should be keyboard-friendly (`onBlur` or better).
- Show inline field-level validation near each field.
- Show form-level alert states in a reserved-height area to prevent page jump.

## 4) Interaction and Motion

- Buttons:
  - Include loading spinner in async submit states.
  - Include subtle press feedback (`active:scale-[0.99]`).
- Inputs:
  - Smooth focus transitions on border/ring/background.
  - Strong visible focus rings (`focus-visible:ring-*`).
- Password field:
  - Accessible show/hide toggle with `aria-label` and `aria-pressed`.

## 5) Accessibility Rules

- Every input must have an explicit `<label htmlFor="...">`.
- Validation errors should set `aria-invalid="true"` and connect via `aria-describedby`.
- Inline alert blocks must use `role="alert"` and `aria-live` where appropriate.
- Keep logical tab order and avoid focus traps on page-based auth routes.
- Enter key submission must work on all auth forms.

## 6) Security and Messaging

- Show this security reminder under password fields:
  - `Never share your password. Admins will never ask for it.`
- Forgot password success message should remain generic to avoid account enumeration:
  - `If an account exists, a reset link has been sent.`
- Provide explicit 429-friendly message for reset flow:
  - `Too many reset attempts. Please wait a moment and try again.`

## 7) Routing Expectations

- Authenticated users visiting `/login`, `/signup`, `/forgot-password` are redirected to `/app/dashboard`.
- Unauthenticated users visiting `/app/*` are redirected to `/login?next=...`.
- After successful login, redirect to `next` only when it is a safe internal app path (`/app/*`).
