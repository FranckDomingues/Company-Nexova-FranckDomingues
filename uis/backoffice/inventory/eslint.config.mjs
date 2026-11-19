import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const nodeGlobals = Object.fromEntries(['process', 'console', 'setTimeout', 'clearTimeout', 'fetch', 'WebSocket', 'URL', 'URLSearchParams', 'Buffer', 'require', '__dirname', 'module', 'globalThis']
  .map(name => [name, name === 'module' ? 'writable' : 'readonly']));

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['e2e/**/*.mjs', '**/*.cjs'], languageOptions: { globals: nodeGlobals } },
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
);
