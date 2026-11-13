const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const sourcePath = path.join(__dirname, 'src', 'supplier-utils.ts');
const outputPath = path.join(__dirname, 'dist', 'supplier-utils.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const result = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    strict: true,
  },
  fileName: sourcePath,
});
fs.writeFileSync(outputPath, `const exports = {};\n${result.outputText}`);
