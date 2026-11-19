#!/usr/bin/env node
/**
 * Builds the classic-script browser bundle of the single NexovaAuth module:
 *   ../suppliers/src/auth-session.ts -> ../suppliers/dist/auth-session.js
 * The bundle is loaded with a plain <script> by both private pages (inventory SPA and supplier
 * directory) and exposes `window.NexovaAuth`. Same transpile+IIFE approach as the original bundle.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../../suppliers/src/auth-session.ts');
const outputPath = path.resolve(__dirname, '../../suppliers/dist/auth-session.js');
const result = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true },
  fileName: sourcePath,
});
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `(() => {\nconst exports = {};\n${result.outputText}\n})();\n`);
console.log(`NexovaAuth bundle: ${path.relative(process.cwd(), outputPath)}`);
