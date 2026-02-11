/**
 * Test Runner Check
 * 
 * Runs test suites and reports results.
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

/**
 * Run test check
 * @param {string} projectPath - Path to project
 * @param {string} language - Project language
 * @returns {Promise<Object>} Test check result
 */
async function runTestCheck(projectPath, language) {
  try {
    switch (language) {
      case 'nodejs':
        return await checkNodeTests(projectPath);
      case 'python':
        return await checkPythonTests(projectPath);
      case 'solidity':
        return await checkSolidityTests(projectPath);
      case 'rust':
        return await checkRustTests(projectPath);
      default:
        return {
          passed: false,
          found: false,
          error: `Unsupported language: ${language}`,
          details: 'Test check not implemented for this language'
        };
    }
  } catch (error) {
    return {
      passed: false,
      found: false,
      error: error.message,
      details: `Test execution failed: ${error.message}`
    };
  }
}

/**
 * Check Node.js tests
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkNodeTests(projectPath) {
  const packageJson = await fs.readJson(path.join(projectPath, 'package.json'));
  const scripts = packageJson.scripts || {};
  
  // Check if test script exists
  if (!scripts.test || scripts.test === 'echo "Error: no test specified"') {
    return {
      passed: false,
      found: false,
      details: 'No test script defined in package.json'
    };
  }
  
  // Detect test framework
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const hasJest = deps.jest;
  const hasMocha = deps.mocha;
  const hasVitest = deps.vitest;
  
  try {
    const output = execSync('npm test', {
      cwd: projectPath,
      timeout: 60000,
      encoding: 'utf8'
    });
    
    // Parse test results
    const result = parseTestOutput(output, { hasJest, hasMocha, hasVitest });
    result.framework = hasJest ? 'jest' : hasMocha ? 'mocha' : hasVitest ? 'vitest' : 'unknown';
    result.found = true;
    
    return result;
    
  } catch (error) {
    // Tests might fail but still give us output
    if (error.stdout || error.message) {
      const output = error.stdout || error.message;
      const result = parseTestOutput(output, { hasJest, hasMocha, hasVitest });
      result.framework = hasJest ? 'jest' : hasMocha ? 'mocha' : hasVitest ? 'vitest' : 'unknown';
      result.found = true;
      return result;
    }
    
    return {
      passed: false,
      found: false,
      error: 'Test execution failed',
      details: error.message
    };
  }
}

/**
 * Parse test output for results
 * @param {string} output - Test command output
 * @param {Object} frameworks - Detected frameworks
 * @returns {Object} Parsed results
 */
function parseTestOutput(output, frameworks) {
  // Jest format: "Tests: 10 passed, 2 failed, 12 total"
  const jestMatch = output.match(/Tests?:\s*(\d+)\s*passed,?\s*(\d+)\s*failed,?\s*(\d+)\s*total/i);
  if (jestMatch) {
    const passing = parseInt(jestMatch[1]);
    const failing = parseInt(jestMatch[2]);
    const total = parseInt(jestMatch[3]);
    return {
      passed: failing === 0,
      total,
      passing,
      failing,
      details: `${passing}/${total} tests passing`
    };
  }
  
  // Mocha format: "10 passing (2s)" or "8 passing (2s) 2 failing"
  const mochaPassing = output.match(/(\d+)\s+passing/);
  const mochaFailing = output.match(/(\d+)\s+failing/);
  if (mochaPassing) {
    const passing = parseInt(mochaPassing[1]);
    const failing = mochaFailing ? parseInt(mochaFailing[1]) : 0;
    const total = passing + failing;
    return {
      passed: failing === 0,
      total,
      passing,
      failing,
      details: `${passing}/${total} tests passing`
    };
  }
  
  // Generic pass/fail detection
  if (output.includes('pass')) {
    return {
      passed: !output.includes('fail'),
      details: 'Tests executed (output parsing incomplete)',
      raw: output.slice(0, 500)
    };
  }
  
  return {
    passed: false,
    details: 'Could not parse test results',
    raw: output.slice(0, 500)
  };
}

/**
 * Check Python tests
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkPythonTests(projectPath) {
  // Check for pytest
  try {
    const output = execSync('python3 -m pytest -v', {
      cwd: projectPath,
      timeout: 60000,
      encoding: 'utf8'
    });
    
    // Parse pytest output
    const passedMatch = output.match(/(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);
    
    const passing = passedMatch ? parseInt(passedMatch[1]) : 0;
    const failing = failedMatch ? parseInt(failedMatch[1]) : 0;
    
    return {
      passed: failing === 0,
      found: true,
      framework: 'pytest',
      total: passing + failing,
      passing,
      failing,
      details: `${passing}/${passing + failing} tests passing`
    };
    
  } catch (error) {
    if (error.stdout) {
      const output = error.stdout;
      const passedMatch = output.match(/(\d+) passed/);
      const failedMatch = output.match(/(\d+) failed/);
      
      if (passedMatch || failedMatch) {
        const passing = passedMatch ? parseInt(passedMatch[1]) : 0;
        const failing = failedMatch ? parseInt(failedMatch[1]) : 0;
        return {
          passed: failing === 0,
          found: true,
          framework: 'pytest',
          total: passing + failing,
          passing,
          failing,
          details: `${passing}/${passing + failing} tests passing`
        };
      }
    }
    
    return {
      passed: false,
      found: false,
      error: 'pytest failed or not found',
      details: error.message
    };
  }
}

/**
 * Check Solidity tests
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkSolidityTests(projectPath) {
  const hardhatConfigPath = path.join(projectPath, 'hardhat.config.js');
  
  if (!await fs.pathExists(hardhatConfigPath)) {
    return {
      passed: false,
      found: false,
      details: 'Hardhat not found, cannot run Solidity tests'
    };
  }
  
  try {
    const output = execSync('npx hardhat test', {
      cwd: projectPath,
      timeout: 120000,
      encoding: 'utf8'
    });
    
    // Parse Hardhat test output
    const passingMatch = output.match(/(\d+) passing/);
    
    if (passingMatch) {
      const passing = parseInt(passingMatch[1]);
      return {
        passed: !output.includes('failing'),
        found: true,
        framework: 'hardhat',
        total: passing,
        passing,
        failing: output.match(/(\d+) failing/) ? parseInt(output.match(/(\d+) failing/)[1]) : 0,
        details: `${passing} tests passing`
      };
    }
    
    return {
      passed: !output.includes('Error'),
      found: true,
      details: 'Tests executed'
    };
    
  } catch (error) {
    return {
      passed: false,
      found: true,
      error: 'Hardhat test failed',
      details: error.message
    };
  }
}

/**
 * Check Rust tests
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkRustTests(projectPath) {
  try {
    const output = execSync('cargo test', {
      cwd: projectPath,
      timeout: 120000,
      encoding: 'utf8'
    });
    
    // Parse cargo test output
    const testMatch = output.match(/test result: (ok|FAILED)\. (\d+) passed; (\d+) failed/);
    
    if (testMatch) {
      const passed = testMatch[1] === 'ok';
      const total = parseInt(testMatch[2]) + parseInt(testMatch[3]);
      const passing = parseInt(testMatch[2]);
      const failing = parseInt(testMatch[3]);
      
      return {
        passed,
        found: true,
        framework: 'cargo',
        total,
        passing,
        failing,
        details: `${passing}/${total} tests passing`
      };
    }
    
    return {
      passed: !output.includes('FAILED'),
      found: true,
      details: 'Tests executed'
    };
    
  } catch (error) {
    return {
      passed: false,
      found: true,
      error: 'Cargo test failed',
      details: error.message
    };
  }
}

module.exports = {
  runTestCheck
};
