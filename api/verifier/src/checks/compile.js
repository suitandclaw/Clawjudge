/**
 * Compilation Check
 * 
 * Verifies the project compiles/builds successfully.
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

/**
 * Run compilation check
 * @param {string} projectPath - Path to project
 * @param {string} language - Project language
 * @returns {Promise<Object>} Compilation check result
 */
async function runCompilationCheck(projectPath, language) {
  try {
    switch (language) {
      case 'nodejs':
        return await checkNodeBuild(projectPath);
      case 'python':
        return await checkPythonBuild(projectPath);
      case 'solidity':
        return await checkSolidityBuild(projectPath);
      case 'rust':
        return await checkRustBuild(projectPath);
      default:
        return {
          passed: false,
          error: `Unsupported language: ${language}`,
          details: 'Compilation check not implemented for this language'
        };
    }
  } catch (error) {
    return {
      passed: false,
      error: error.message,
      details: `Compilation failed: ${error.message}`
    };
  }
}

/**
 * Check Node.js project build
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkNodeBuild(projectPath) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  
  if (!await fs.pathExists(packageJsonPath)) {
    return {
      passed: false,
      error: 'No package.json found',
      details: 'Not a valid Node.js project'
    };
  }
  
  const packageJson = await fs.readJson(packageJsonPath);
  
  // Install dependencies
  try {
    execSync('npm install', {
      cwd: projectPath,
      timeout: 60000,
      stdio: 'pipe'
    });
  } catch (error) {
    return {
      passed: false,
      error: 'npm install failed',
      details: error.message
    };
  }
  
  // Check for build script
  const hasBuildScript = packageJson.scripts?.build || packageJson.scripts?.compile;
  const hasStartScript = packageJson.scripts?.start;
  
  // Try to build
  if (hasBuildScript) {
    try {
      execSync('npm run build', {
        cwd: projectPath,
        timeout: 60000,
        stdio: 'pipe'
      });
      return {
        passed: true,
        details: 'npm install + npm run build succeeded',
        hasBuildScript: true
      };
    } catch (error) {
      return {
        passed: false,
        error: 'Build script failed',
        details: error.message
      };
    }
  }
  
  // For Hardhat projects
  if (packageJson.devDependencies?.hardhat || packageJson.dependencies?.hardhat) {
    try {
      execSync('npx hardhat compile', {
        cwd: projectPath,
        timeout: 60000,
        stdio: 'pipe'
      });
      return {
        passed: true,
        details: 'Hardhat compile succeeded',
        framework: 'hardhat'
      };
    } catch (error) {
      return {
        passed: false,
        error: 'Hardhat compile failed',
        details: error.message
      };
    }
  }
  
  // No build script - check if it's a simple node project
  if (hasStartScript) {
    // Try to at least validate syntax
    const mainFile = packageJson.main || 'index.js';
    const mainPath = path.join(projectPath, mainFile);
    
    if (await fs.pathExists(mainPath)) {
      try {
        execSync(`node --check "${mainFile}"`, {
          cwd: projectPath,
          timeout: 10000,
          stdio: 'pipe'
        });
        return {
          passed: true,
          details: 'Node.js syntax validation passed (no build script)',
          note: 'No build script defined, validated syntax only'
        };
      } catch (error) {
        return {
          passed: false,
          error: 'Syntax error in main file',
          details: error.message
        };
      }
    }
  }
  
  return {
    passed: true,
    details: 'Dependencies installed, no build required',
    note: 'No build script detected'
  };
}

/**
 * Check Python project build
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkPythonBuild(projectPath) {
  // Check for syntax errors in Python files
  try {
    const { execSync } = require('child_process');
    
    // Try to compile all Python files
    execSync('python3 -m py_compile **/*.py', {
      cwd: projectPath,
      timeout: 30000,
      stdio: 'pipe',
      shell: true
    });
    
    return {
      passed: true,
      details: 'Python syntax validation passed'
    };
  } catch (error) {
    return {
      passed: false,
      error: 'Python syntax error',
      details: error.message
    };
  }
}

/**
 * Check Solidity project build
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkSolidityBuild(projectPath) {
  const hardhatConfigPath = path.join(projectPath, 'hardhat.config.js');
  const foundryConfigPath = path.join(projectPath, 'foundry.toml');
  
  if (await fs.pathExists(hardhatConfigPath)) {
    try {
      execSync('npx hardhat compile', {
        cwd: projectPath,
        timeout: 120000,
        stdio: 'pipe'
      });
      return {
        passed: true,
        details: 'Hardhat compile succeeded',
        framework: 'hardhat'
      };
    } catch (error) {
      return {
        passed: false,
        error: 'Hardhat compile failed',
        details: error.message
      };
    }
  }
  
  if (await fs.pathExists(foundryConfigPath)) {
    try {
      execSync('forge build', {
        cwd: projectPath,
        timeout: 120000,
        stdio: 'pipe'
      });
      return {
        passed: true,
        details: 'Foundry build succeeded',
        framework: 'foundry'
      };
    } catch (error) {
      return {
        passed: false,
        error: 'Foundry build failed',
        details: error.message
      };
    }
  }
  
  return {
    passed: false,
    error: 'No Hardhat or Foundry config found',
    details: 'Could not determine build system for Solidity project'
  };
}

/**
 * Check Rust project build
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkRustBuild(projectPath) {
  try {
    execSync('cargo check', {
      cwd: projectPath,
      timeout: 120000,
      stdio: 'pipe'
    });
    
    return {
      passed: true,
      details: 'Cargo check succeeded'
    };
  } catch (error) {
    return {
      passed: false,
      error: 'Cargo check failed',
      details: error.message
    };
  }
}

module.exports = {
  runCompilationCheck
};
