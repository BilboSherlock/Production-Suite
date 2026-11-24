'use strict';
/* A tiny test harness shared by the Node runner (tests/run.js) and the
   browser page (tests/index.html). No dependencies, no build step. */
const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }
class AssertionError extends Error { }
function assert(cond, msg = 'expected true') { if (!cond) throw new AssertionError(msg); }
const show = v => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
function eq(actual, expected, msg) {
  if (show(actual) !== show(expected)) throw new AssertionError(`${msg ? msg + ': ' : ''}expected ${show(expected)}, got ${show(actual)}`);
}

/* fakes for the app's globals, so view models run without a browser page */
function fakeStore(P) { return { P, touches: 0, touch() { this.touches++; } }; }
function fakeProject(extra = {}) { return Object.assign({ id: 'p1', title: 'Test', people: [], tasks: [] }, extra); }

async function runTests(report = console.log) {
  let pass = 0; const fails = [];
  for (const t of TESTS) {
    try { await t.fn(); pass++; report(`  ok    ${t.name}`); }
    catch (e) { fails.push({ name: t.name, error: e }); report(`  FAIL  ${t.name}\n        ${e && e.message || e}`); }
  }
  report(`\n${pass} passed, ${fails.length} failed`);
  return { pass, fails };
}
