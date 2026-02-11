/**
 * Coverage Check
 * 
 * Reports test coverage percentage.
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

/**
 * Run coverage check
 * @param {string} projectPath - Path to project
 * @param {string} language - Project language
 * @param {number} threshold - Coverage threshold percentage
 * @returns {Promise<Object>} Coverage check result
 */
async function runCoverageCheck(projectPath, language, threshold = 70) {
  try {
    switch (language) {
      case 'nodejs':
        return await checkNodeCoverage(projectPath, threshold);
      case 'python':
        return await checkPythonCoverage(projectPath, threshold);
      case 'solidity':
        return await checkSolidityCoverage(projectPath, threshold);
      default:
        return {
          passed: false,
          percentage: 0,
          threshold,
          details: 'Coverage check not implemented for this language'
        };
    }
  } catch (error) {
    return {
      passed: false,
      percentage: 0,
      threshold,
      error: error.message,
      details: `Coverage check failed: ${error.message}`
    };
  }
}

/**
 * Check Node.js test coverage
 * @param {string} projectPath - Project path
 * @param {number} threshold - Coverage threshold
 * @returns {Promise<Object>} Check result
 */
async function checkNodeCoverage(projectPath, threshold) {
  const packageJson = await fs.readJson(path.join(projectPath, 'package.json'));
  const scripts = packageJson.scripts || {};
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  // Check if jest is available
  const hasJest = deps.jest;
  
  if (!hasJest) {
    return {
      passed: false,
      percentage: 0,
      threshold,
      details: 'Jest not found, cannot calculate coverage'
    };
  }
  
  // Check for coverage script
  if (scripts['test:coverage'] || (scripts.test && scripts.test.includes('coverage'))) {
    try {
      const output = execSync('npm run test:coverage', {
        cwd: projectPath,
        timeout: 120000,
        encoding: 'utf8'
      });
      
      return parseCoverageOutput(output, threshold);
      
    } catch (error) {
      if (error.stdout) {
        return parseCoverageOutput(error.stdout, threshold);
      }
    }
  }
  
  // Try running jest with coverage directly
  try {
    const output = execSync('npx jest --coverage', {
      cwd: projectPath,
      timeout: 120000,
      encoding: 'utf8'
    });
    
    return parseCoverageOutput(output, threshold);
    
  } catch (error) {
    if (error.stdout) {
      return parseCoverageOutput(error.stdout, threshold);
    }
    
    return {
      passed: false,
      percentage: 0,
      threshold,
      details: 'Failed to run coverage: ' + error.message
    };
  }
}

/**
 * Parse coverage output from various formats
 * @param {string} output - Test output
 * @param {number} threshold - Coverage threshold
 * @returns {Object} Parsed coverage
 */
function parseCoverageOutput(output, threshold) {
  // Jest format: "All files | 78.5 | 65.2 | 82.1 | 78.5 |"
  const jestMatch = output.match(/All files\s*\|\s*([\d.]+)/);
  if (jestMatch) {
    const percentage = parseFloat(jestMatch[1]);
    return {
      passed: percentage >= threshold,
      percentage: Math.round(percentage),
      threshold,
      details: `${percentage.toFixed(1)}% coverage (threshold: ${threshold}%)`
    };
  }
  
  // Alternative format: "Statements: 78.5%"
  const stmtMatch = output.match(/Statements:\s*([\d.]+)%/);
  if (stmtMatch) {
    const percentage = parseFloat(stmtMatch[1]);
    return {
      passed: percentage >= threshold,
      percentage: Math.round(percentage),
      threshold,
      details: `${percentage.toFixed(1)}% statement coverage`
    };
  }
  
  return {
    passed: false,
    percentage: 0,
    threshold,
    details: 'Could not parse coverage output'
  };
}

/**
 * Check Python test coverage
 * @param {string} projectPath - Project path
 * @param {number} threshold - Coverage threshold
 * @returns {Promise<Object>} Check result
 */
async function checkPythonCoverage(projectPath, threshold) {
  try {
    const output = execSync('python3 -m pytest --cov=. --cov-report=term-missing', {
      cwd: projectPath,
      timeout: 120000,
      encoding: 'utf8',
      shell: true
    });
    
    // Parse pytest-cov output
    // Format: "TOTAL 123 45 63%"
    const totalMatch = output.match(/TOTAL\s+\d+\s+\d+\s+([\d.]+)%/);
    
    if (totalMatch) {
      const percentage = parseFloat(totalMatch[1]);
      return {
        passed: percentage >= threshold,
        percentage: Math.round(percentage),
        threshold,
        details: `${percentage.toFixed(1)}% coverage`
      };
    }
    
    return {
      passed: false,
      percentage: 0,
      threshold,
      details: 'Could not parse coverage'
    };
    
  } catch (error) {
    return {
      passed: false,
      percentage: 0,
      threshold,
      details: 'pytest-cov not available or failed'
    };
  }
}

/**
 * Check Solidity test coverage
 * @param {string} projectPath - Project path
 * @param {number} threshold - Coverage threshold
 * @returns {Promise<Object>} Check result
 */
async function checkSolidityCoverage(projectPath, threshold) {
  // Check for hardhat-coverage plugin
  const packageJson = await fs.readJson(path.join(projectPath, 'package.json'));
  const hasCoveragePlugin = packageJson.devDependencies?.['solidity-coverage'];
  
  if (!hasCoveragePlugin) {
    return {
      passed: false,
      percentage: 0,
      threshold,
      details: 'solidity-coverage plugin not installed'
    };
  }
  
  try {
    const output = execSync('npx hardhat coverage', {
      cwd: projectPath,
      timeout: 120000,
      encoding: 'utf8'
    });
    
    // Parse coverage output
    // Format varies by plugin version
    const coverageMatch = output.match(/([\d.]+)%/);
    if (coverageMatch) {
      const percentage = parseFloat(coverageMatch[1]);
      return {
        passed: percentage >= threshold,
        percentage: Math.round(percentage),
        threshold,
        details: `${percentage.toFixed(1)}% coverage`
      };
    }
    
    return {
      passed: false,
      percentage: 0,
      threshold,
      details: 'Could not parse coverage output'
    };
    
  } catch (error) {
    return {
      passed: false,
      percentage: 0,
      threshold,
      details: 'Coverage check failed'
    };
  }
}

module.exports = {
  runCoverageCheck
};
