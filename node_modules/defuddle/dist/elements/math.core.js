"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mathRules = exports.createCleanMathEl = void 0;
const math_base_1 = require("./math.base");
const createCleanMathEl = (doc, mathData, latex, isBlock) => {
    const cleanMathEl = doc.createElement('math');
    cleanMathEl.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
    cleanMathEl.setAttribute('display', isBlock ? 'block' : 'inline');
    cleanMathEl.setAttribute('data-latex', latex || '');
    // First try to use existing MathML content
    if (mathData?.mathml) {
        const tempDiv = doc.createElement('div');
        tempDiv.innerHTML = mathData.mathml;
        const mathContent = tempDiv.querySelector('math');
        if (mathContent) {
            cleanMathEl.innerHTML = mathContent.innerHTML;
        }
    }
    // If no MathML content but we have LaTeX, store it as text content
    else if (latex) {
        cleanMathEl.textContent = latex;
    }
    return cleanMathEl;
};
exports.createCleanMathEl = createCleanMathEl;
function hasHTMLElementProps(el) {
    return 'classList' in el && 'getAttribute' in el && 'querySelector' in el;
}
// Find math elements
exports.mathRules = [
    {
        selector: math_base_1.mathSelectors,
        element: 'math',
        transform: (el, doc) => {
            if (!hasHTMLElementProps(el))
                return el;
            const mathData = (0, math_base_1.getMathMLFromElement)(el);
            const latex = (0, math_base_1.getBasicLatexFromElement)(el);
            const isBlock = (0, math_base_1.isBlockDisplay)(el);
            const cleanMathEl = (0, exports.createCleanMathEl)(doc, mathData, latex, isBlock);
            // Clean up any associated math scripts after we've extracted their content
            if (el.parentElement) {
                // Remove all math-related scripts and previews
                const mathElements = el.parentElement.querySelectorAll(`
					/* MathJax scripts and previews */
					script[type^="math/"],
					.MathJax_Preview,

					/* External math library scripts */
					script[type="text/javascript"][src*="mathjax"],
					script[type="text/javascript"][src*="katex"]
				`);
                mathElements.forEach(el => el.remove());
            }
            return cleanMathEl;
        }
    }
];
//# sourceMappingURL=math.core.js.map