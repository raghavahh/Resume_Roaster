// @ts-check
import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** PRD C3 / T7: text is rendered as text, never as HTML. */
const htmlSinkBans = [
  {
    selector: 'AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]',
    message: 'Never assign HTML strings. Render as text only (PRD T7).',
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: 'Never insert HTML strings. Render as text only (PRD T7).',
  },
  {
    selector:
      "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
    message: 'document.write is banned (PRD T7).',
  },
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML is banned. Render as text only (PRD T7).',
  },
];

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.astro/**',
      '**/.wrangler/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // PRD D3 rule 2: explicit encapsulation on every member.
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'explicit', overrides: { constructors: 'no-public' } },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      // PRD D3 rule 10: no unchecked casts (`as const` is still allowed).
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      // PRD D3 rule 1: small units.
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true }],
      'no-restricted-syntax': ['error', ...htmlSinkBans],
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // PRD D3 rule 9: the domain is pure. No I/O, no ambient time or randomness.
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'fetch',
          'process',
          'window',
          'document',
          'localStorage',
          'sessionStorage',
          'crypto',
        ].map((name) => ({
          name,
          message: 'packages/domain must stay pure: inject this through a port.',
        })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Inject a Clock instead.' },
        { object: 'Math', property: 'random', message: 'Inject a random source instead.' },
      ],
      'no-restricted-syntax': [
        'error',
        ...htmlSinkBans,
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Inject a Clock instead of reading the current time.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/test/**/*.ts'],
    rules: { 'max-lines-per-function': 'off', 'max-lines': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
