import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunBudget } from '../../lib/gongzhi/agent/budget.ts';

test('programmatic ceilings count attempted steps and queries', () => {
  const budget = createRunBudget({ signal: new AbortController().signal });
  try {
    for (let n = 0; n < 4; n++) budget.beginModelStep();
    assert.throws(() => budget.beginModelStep(), { code: 'model_budget' });
    budget.beginSearch();
    budget.beginSearch();
    assert.throws(() => budget.beginSearch(), { code: 'search_budget' });
    assert.deepEqual(budget.usage(), { modelSteps: 4, searches: 2 });
  } finally { budget.dispose(); }
});

test('a caller cannot increase the hard 60 second deadline', () => {
  let now = 100;
  const budget = createRunBudget({ signal: new AbortController().signal, deadlineAt: 999_999, now: () => now });
  try {
    assert.equal(budget.deadlineAt, 60_100);
    now = 60_100;
    assert.throws(() => budget.beginSearch(), { code: 'timed_out' });
    assert.equal(budget.signal.aborted, true);
  } finally { budget.dispose(); }
});

test('disconnect cancels all future model and tool work', () => {
  const request = new AbortController();
  const budget = createRunBudget({ signal: request.signal });
  try {
    request.abort();
    assert.equal(budget.signal.aborted, true);
    assert.throws(() => budget.beginModelStep(), { code: 'cancelled' });
    assert.throws(() => budget.beginSearch(), { code: 'cancelled' });
  } finally { budget.dispose(); }
});

test('request already disconnected before setup cannot run', () => {
  const request = new AbortController();
  request.abort();
  const budget = createRunBudget({ signal: request.signal });
  try { assert.throws(() => budget.check(), { code: 'cancelled' }); } finally { budget.dispose(); }
});
