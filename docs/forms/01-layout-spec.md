# IFMS Global Form Layout Specification

## Container: `FormShell`

Every form **must** be wrapped in `<FormShell>`. It provides:

- **Max width**: `max-w-4xl` (default) or `max-w-6xl` (with `wide` prop)
- **Padding**: `px-6 pt-6 pb-12`
- **Header**: Title + description + optional status badge
- **Sticky actions**: Desktop-only sticky footer bar; non-sticky on mobile
- **Error banner**: Slot for `<FormErrorBanner>` above content

```tsx
<FormShell
  title="Create Invoice"
  description="Revenue Recognition"
  status={mutation.isPending ? 'loading' : 'idle'}
  actions={<PermissionGuard>…buttons…</PermissionGuard>}
>
  {/* sections */}
</FormShell>
```

## Sections: `FormSection`

Groups related fields with a title and optional description.

- **Grid**: `grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6`
- **Spacing between sections**: `space-y-12` (provided by FormShell)

```tsx
<FormSection title="Identity" description="Core identifiers.">
  <TextField name="name" label="Name" required />
  <TextField name="code" label="Code" required />
</FormSection>
```

## Grid Helpers

| Component   | Purpose                              | Usage                                      |
|-------------|--------------------------------------|--------------------------------------------|
| `FormGrid`  | Generic 2-col grid inside a section  | `<FormGrid>…</FormGrid>`                   |
| `FieldRow`  | Full-width row spanning both columns | `<FieldRow>…</FieldRow>` or `fullWidth`    |

## Responsive Rules

1. **Mobile** (`< md`): Single column, non-sticky actions, full-width fields
2. **Tablet** (`md`): 2-column grid, sticky actions appear
3. **Desktop** (`lg+`): Side panels allowed (e.g. `grid-cols-12` with `col-span-8` + `col-span-4`)

## Spacing Tokens

| Token         | Value   | Used For                    |
|---------------|---------|------------------------------|
| `gap-x-8`    | 2rem    | Column gap in FormSection    |
| `gap-y-6`    | 1.5rem  | Row gap in FormSection       |
| `space-y-12` | 3rem    | Between FormSections         |
| `pb-12`      | 3rem    | Bottom padding in FormShell  |

## Accessibility

- All inputs **must** have visible `<label>` elements above them
- Error messages use `role="alert"` and `aria-describedby`
- Required fields show `<RequiredMark>` (red asterisk)
- Focus rings: `focus:ring-2 focus:ring-primary/40 focus:border-primary`

## UX Guards

| Component              | Purpose                                           |
|------------------------|---------------------------------------------------|
| `UnsavedChangesGuard`  | Warns on navigation when `isDirty` is true        |
| `PermissionGuard`      | Hides actions when user lacks write permission     |
| `FormErrorBanner`      | Displays root-level validation errors              |
| `FormSubmitState`      | Shows spinner + label during submission            |
