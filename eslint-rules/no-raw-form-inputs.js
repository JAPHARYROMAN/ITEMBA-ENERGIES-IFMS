/**
 * ESLint Rule: no-raw-form-inputs
 * 
 * Prevents direct usage of <input>, <select>, and <textarea> inside form components.
 * All form inputs must use the standardized field wrappers from @/components/ifms/forms/Fields.
 *
 * Usage (when ESLint is added to the project):
 * 
 *   // eslint.config.js
 *   import noRawFormInputs from './eslint-rules/no-raw-form-inputs.js';
 *   
 *   export default [
 *     {
 *       plugins: { 'ifms': { rules: { 'no-raw-form-inputs': noRawFormInputs } } },
 *       rules: { 'ifms/no-raw-form-inputs': 'warn' },
 *       files: ['components/forms/**', 'components/pos/**'],
 *     }
 *   ];
 *
 * Allowed exceptions:
 *   - Files inside components/ifms/forms/ (the wrapper implementations themselves)
 *   - Elements with a {/* eslint-disable-next-line ifms/no-raw-form-inputs *\/} comment
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow raw <input>, <select>, <textarea> in form files. Use field wrappers from Fields.tsx instead.',
      recommended: true,
    },
    messages: {
      noRawInput: 'Avoid raw <input>. Use TextField, NumberField, MoneyField, etc. from "@/components/ifms/forms/Fields".',
      noRawSelect: 'Avoid raw <select>. Use SelectField or ComboboxField from "@/components/ifms/forms/Fields".',
      noRawTextarea: 'Avoid raw <textarea>. Use TextareaField from "@/components/ifms/forms/Fields".',
    },
    schema: [],
  },

  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';

    // Allow the wrapper implementations themselves
    if (filename.includes('ifms/forms/')) return {};

    return {
      JSXOpeningElement(node) {
        const name = node.name?.name;
        if (!name) return;

        if (name === 'input') {
          context.report({ node, messageId: 'noRawInput' });
        } else if (name === 'select') {
          context.report({ node, messageId: 'noRawSelect' });
        } else if (name === 'textarea') {
          context.report({ node, messageId: 'noRawTextarea' });
        }
      },
    };
  },
};

export default rule;
