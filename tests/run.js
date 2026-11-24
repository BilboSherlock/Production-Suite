'use strict';
/* Runs the tests in Node:  node tests/run.js
   Loads the app's model / view-model files the way the browser does — as
   plain scripts sharing one global scope — so no build step is needed.
   Only DOM-free layers are loaded (see js/mvvm.js). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const list = dir => fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js')).sort().map(f => path.join(dir, f)) : [];

const files = ['js/mvvm.js', ...list('js/models'), ...list('js/viewmodels'), 'tests/harness.js', ...list('tests').filter(f => f.endsWith('.test.js'))];
const ctx = vm.createContext({ console, setTimeout, clearTimeout });
for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });

vm.runInContext('runTests()', ctx).then(r => { process.exitCode = r.fails.length ? 1 : 0; });
