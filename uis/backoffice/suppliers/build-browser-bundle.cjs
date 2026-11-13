const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

for (const bundle of ['supplier-utils', 'auth-session']) {
  const sourcePath = path.join(__dirname, 'src', `${bundle}.ts`);
  const outputPath = path.join(__dirname, 'dist', `${bundle}.js`);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      strict: true,
    },
    fileName: sourcePath,
  });
  fs.writeFileSync(outputPath, `(() => {\nconst exports = {};\n${result.outputText}\n})();\n`);
}
