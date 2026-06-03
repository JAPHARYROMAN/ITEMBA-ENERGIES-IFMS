import React from 'react';

/* ================================================================
   Context-free field primitives
   ----------------------------------------------------------------
   These are thin, standardized wrappers around the native form
   elements. Unlike the components in Fields.tsx, they do NOT use
   react-hook-form context and do NOT render their own label/error
   layout. They simply forward every native prop (including the
   spread result of `register(...)`, controlled `value`/`onChange`,
   `onKeyDown`, `aria-label`, `min`/`max`/`step`, custom `className`,
   etc.) to the underlying element.

   They exist so that form files can satisfy the
   `ifms/no-raw-form-inputs` rule without changing the surrounding
   custom markup or behavior of inputs that the higher-level
   label-rendering wrappers in Fields.tsx cannot represent:
     - bare `useForm` forms (no FormProvider) with their own labels
     - inline table/grid cells with custom width + keyboard nav
     - inputs controlled by local React state
     - static display-only inputs

   The rule (`eslint-rules/no-raw-form-inputs.js`) allows raw
   elements inside any file under `components/ifms/forms/`, so the
   raw elements below are intentionally permitted here.
   ================================================================ */

export type FieldInputProps = React.InputHTMLAttributes<HTMLInputElement>;
export type FieldTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
export type FieldSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  children?: React.ReactNode;
};

/**
 * FieldInput — pass-through <input>. Forwards a ref and every native
 * prop. Use for register-spread, controlled, or static inputs that
 * need custom layout the Fields.tsx wrappers cannot provide.
 */
export const FieldInput = React.forwardRef<HTMLInputElement, FieldInputProps>(
  (props, ref) => <input ref={ref} {...props} />,
);
FieldInput.displayName = 'FieldInput';

/**
 * FieldTextarea — pass-through <textarea>.
 */
export const FieldTextarea = React.forwardRef<HTMLTextAreaElement, FieldTextareaProps>(
  (props, ref) => <textarea ref={ref} {...props} />,
);
FieldTextarea.displayName = 'FieldTextarea';

/**
 * FieldSelect — pass-through <select>.
 */
export const FieldSelect = React.forwardRef<HTMLSelectElement, FieldSelectProps>(
  ({ children, ...props }, ref) => (
    <select ref={ref} {...props}>
      {children}
    </select>
  ),
);
FieldSelect.displayName = 'FieldSelect';
