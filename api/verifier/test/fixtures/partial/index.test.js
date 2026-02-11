/**
 * Tests for partial project - intentionally has some failures
 */

const { add, subtract, multiply } = require('./index');

describe('Math operations', () => {
  test('add works', () => {
    expect(add(2, 3)).toBe(5);
  });
  
  test('subtract works', () => {
    expect(subtract(5, 3)).toBe(2);
  });
  
  // This test will fail (intentionally)
  test('multiply works (fails intentionally)', () => {
    expect(multiply(2, 3)).toBe(6); // This will fail because multiply has a bug
  });
  
  // Another failing test
  test('edge case fails', () => {
    expect(add(-1, 1)).toBe(0);
    expect(subtract(0, 0)).toBe(1); // Wrong expectation
  });
});
