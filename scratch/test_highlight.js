const { lowlight } = require('lowlight/lib/core');
const cpp = require('highlight.js/lib/languages/cpp');
lowlight.registerLanguage('cpp', cpp);

const code = 'cout << "hello\\nworld";';
console.log('Original Code String:', JSON.stringify(code));

const ast = lowlight.highlight('cpp', code);
console.log('Parsed AST:', JSON.stringify(ast, null, 2));
