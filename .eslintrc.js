module.exports = {
    env: {
      browser: true,
      mocha: true,
    },
    extends: ['airbnb', 'plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'prettier'],
    settings: {
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
      'import/resolver': {
        typescript: {},
      },
    },
    rules: {
      'no-console': 0,
      'no-param-reassign': [1, { "props": false }],
      'react/jsx-filename-extension': [2, { extensions: ['.js', '.jsx', '.ts', '.tsx'] }],
      'import/no-extraneous-dependencies': [2, { devDependencies: ['**/test.tsx', '**/test.ts'] }],
      '@typescript-eslint/indent': [2, 2],
      '@typescript-eslint/no-use-before-define': 0,
      // TODO: Eliminate by refining global property injection.
      '@typescript-eslint/no-non-null-assertion': 0,

      // I don't like that being enforced
      'lines-between-class-members': 0,

      // prevent HTML code in JSX from being stretched too much
      'react/jsx-one-expression-per-line': [1, { 'allow': 'single-child' }],

      // allow interface names to have a leading I
      '@typescript-eslint/interface-name-prefix': 0,

      // allow to use parseInt with default radix value
      'radix': 0,

      // copied over from airbnb, but increased from 100 to 120
      'max-len': ['warn', 120, 2, {
        ignoreUrls: true,
        ignoreComments: false,
        ignoreRegExpLiterals: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
      }],

      // a problem for very old browsers only
      'no-multi-str': 0,

      // we love alerts ;-)
      'no-alert': 0,

      // allows to be a bit more concise, yet explicit
      'no-return-assign': ['warn', 'except-parens'],

      // disabled because it complains where there's no reason for complaining
      'jsx-a11y/label-has-associated-control': 0,
    },
  };
