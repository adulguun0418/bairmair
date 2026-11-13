// Lints the shared packages. Each app (Expo, Next.js) brings its own framework config.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/.next/**',
      '**/.expo/**',
      'apps/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/**/*.tsx'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    // Node scripts run by hand or by package scripts (e.g. supabase/scripts).
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly' },
    },
  },
  {
    // three.js objects (camera, controls, materials) are mutable by design, and
    // react-three-fiber code updates them in place every frame. This React Compiler rule
    // assumes immutable values and does not apply to them.
    files: ['packages/viewer/src/3d/**/*.tsx'],
    rules: { 'react-hooks/immutability': 'off' },
  },
);
