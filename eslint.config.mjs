// Lints the shared packages. Each app (Expo, Next.js) brings its own framework config.
import js from '@eslint/js';
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
);
