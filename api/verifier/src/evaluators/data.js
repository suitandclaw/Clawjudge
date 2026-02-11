/**
 * Data Evaluator - JSON/CSV validation
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Validate JSON data
 * @param {string} data - JSON string or file path
 * @returns {Object} Validation result
 */
function validateJSON(data) {
  try {
    const parsed = JSON.parse(data);
    return {
      valid: true,
      type: getJSONType(parsed),
      keys: Object.keys(parsed),
      itemCount: Array.isArray(parsed) ? parsed.length : 1
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Get type description of JSON data
 * @param {*} data - Parsed JSON
 * @returns {string} Type description
 */
function getJSONType(data) {
  if (Array.isArray(data)) {
    if (data.length === 0) return 'empty_array';
    return `array_of_${typeof data[0]}s`;
  }
  if (typeof data === 'object' && data !== null) {
    return 'object';
  }
  return typeof data;
}

/**
 * Validate CSV data
 * @param {string} data - CSV string or file path
 * @returns {Object} Validation result
 */
function validateCSV(data) {
  const lines = data.trim().split('\n');
  
  if (lines.length === 0) {
    return { valid: false, error: 'Empty CSV' };
  }
  
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).filter(line => line.trim());
  
  // Check for consistent column counts
  const columnCounts = rows.map(row => row.split(',').length);
  const inconsistent = columnCounts.some(count => count !== headers.length);
  
  return {
    valid: !inconsistent,
    headers,
    rowCount: rows.length,
    columnCount: headers.length,
    consistentColumns: !inconsistent
  };
}

/**
 * Detect data format from content or file
 * @param {string} content - File content or path
 * @returns {string} Format type
 */
function detectDataFormat(content) {
  if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
    return 'json';
  }
  if (content.includes(',') && content.split('\n').length > 1) {
    return 'csv';
  }
  return 'unknown';
}

module.exports = {
  validateJSON,
  validateCSV,
  detectDataFormat
};
