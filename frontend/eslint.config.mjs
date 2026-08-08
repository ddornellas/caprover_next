import pluginJs from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
    {
        ignores: ['.next/**', 'legacy/**', 'node_modules/**'],
    },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'no-control-regex': 'off',
        },
    },
]
