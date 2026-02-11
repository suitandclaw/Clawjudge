/**
 * Tests for passing project
 */

const { add } = require('./index');

describe('Math operations', () => {
  test('adds 2 + 3 to equal 5', () => {
    expect(add(2, 3)).toBe(5);
  });
  
  test('adds negative numbers', () => {
    expect(add(-1, -1)).toBe(-2);
  });
  
  test('adds zero', () => {
    expect(add(0, 5)).toBe(5);
  });
});
