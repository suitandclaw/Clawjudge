/**
 * Partial Project - Has some failing tests and lower coverage
 */

function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

// Intentionally buggy function (not tested)
function multiply(a, b) {
  return a + b; // Bug: should be a * b
}

module.exports = { add, subtract, multiply };
