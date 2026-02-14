# IFMS Global Form Design System

## Design Rules
- **Consistency**: All forms must use the `FormShell`, `FormSection`, and standardized fields from `/components/ifms/forms`.
- **Density**: Use "Enterprise Comfort" spacing. 16px (4 units) between fields, 32px (8 units) between sections.
- **Sectioning**: Max 12 inputs per section. Groups of 4-6 are preferred for cognitive load management.
- **Navigation**: Support full keyboard navigation (Tab/Shift+Tab). Submit on Enter for single-section forms.

## Validation Patterns
- **Library**: Zod + React Hook Form.
- **Timing**: Validation triggers on blur (first touch) or on submit. 
- **Feedback**: First error must be scrolled into view and focused upon a failed submission.
- **Required Fields**: Indicated by a red asterisk. `aria-required` must be set.

## Read-Only States
- **Auditor Role**: The `PermissionGuard` component automatically disables all inputs and hides action buttons if the user role is `auditor`.
- **Computed Fields**: Use `ReadOnlyField` for values calculated by the system.

## Examples
### Create vs Edit
- **Create**: Uses "Save" and "Save & New". "Save & New" resets the form but maintains context.
- **Edit**: Includes `FormFooterMeta` showing record creation and update history.

### Wizard / Multi-step
- Use the same `FormSection` primitives but wrapped in a state-managed step container.
