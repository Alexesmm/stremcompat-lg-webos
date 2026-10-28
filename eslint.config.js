'use strict';

// Correctness-only lint: undefined and unused names, redeclarations and unreachable
// code. Formatting is Prettier's job. Browser code must stay ES5 for Chromium 38.
var globals = require('globals');

var correctness = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none' }],
  'no-redeclare': 'error',
  'no-unreachable': 'error',
  'no-dupe-keys': 'error'
};

// ES5 code idiomatically repeats 'var i' in sibling loops; that is legal and harmless.
var browserCorrectness = Object.assign({}, correctness, { 'no-redeclare': 'off' });

module.exports = [
  {
    ignores: ['node_modules/**', '.build/**', '.cache/**', 'dist/**', 'service/server.js', 'service/bin/**', 'src/ui/**']
  },
  {
    // Node 18 local server and its modules.
    files: ['service/tvserver.js', 'service/server/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
    rules: correctness
  },
  {
    // Bootstrap for the TV's system Node.js 0.12.
    files: ['service/launch.js', 'service/profile.js'],
    languageOptions: { ecmaVersion: 5, sourceType: 'commonjs', globals: globals.node },
    rules: correctness
  },
  {
    // The generated interface bundle (src/ui modules share one scope, so lint the bundle).
    files: ['service/beta-app.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: Object.assign({}, globals.browser, { PalmServiceBridge: 'readonly' })
    },
    rules: browserCorrectness
  },
  {
    // Player client: wrapped by tvserver.js in an IIFE after the per-stream constants.
    files: ['service/player/player-client.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      parserOptions: { ecmaFeatures: { globalReturn: true } },
      globals: Object.assign({}, globals.browser, {
        PalmServiceBridge: 'readonly',
        URL: 'readonly', ADDON: 'readonly', QUALITY: 'readonly', TITLE: 'readonly', TYPE: 'readonly',
        ID: 'readonly', VID: 'readonly', LOGO: 'readonly', BG: 'readonly', POSTER: 'readonly',
        SEEN: 'readonly', SEPT: 'readonly', NEXTVID: 'readonly', NEXTHREF: 'readonly', BACK: 'readonly',
        NEXTTITLE: 'readonly', NEXTTHUMB: 'readonly', SNAME: 'readonly', CERT: 'readonly',
        COMPAT: 'readonly', SERVICE_ID: 'readonly', APP_PORT: 'readonly'
      })
    },
    rules: browserCorrectness
  },
  {
    files: ['scripts/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
    rules: correctness
  }
];
