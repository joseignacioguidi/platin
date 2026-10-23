import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/src/generated',
      '**/dist',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            { sourceTag: 'type:domain', onlyDependOnLibsWithTags: [] },
            {
              sourceTag: 'type:contracts',
              onlyDependOnLibsWithTags: ['type:domain'],
            },
            { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:domain'] },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['type:contracts', 'type:domain'],
            },
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['type:ui', 'type:contracts', 'type:domain'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {
      // `any` only with a justifying comment and an eslint-disable for that line.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
