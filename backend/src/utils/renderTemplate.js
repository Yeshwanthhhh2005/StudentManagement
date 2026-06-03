/**
 * Replace {{var}} placeholders in a template body with values from a student.
 * Unknown variables render as an empty string (never leaves a raw {{...}}).
 */
export function renderTemplate(content, vars = {}) {
  return content.replace(/{{\s*([\w.]+)\s*}}/g, (_m, key) => {
    const val = vars[key];
    return val === undefined || val === null ? '' : String(val);
  });
}

/**
 * Build the ordered positional variable array for a Meta template send,
 * given the template's declared variable order.
 */
export function buildTemplateVariables(variableNames = [], vars = {}) {
  return variableNames.map((name) => {
    const val = vars[name];
    return val === undefined || val === null ? '' : String(val);
  });
}

export default renderTemplate;
