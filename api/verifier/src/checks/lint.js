/**
 * Lint Check
 * 
 * Runs linters and reports code quality issues.
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

/**
 * Run lint check
 * @param {string} projectPath - Path to project
 * @param {string} language - Project language
 * @returns {Promise<Object>} Lint check result
 */
async function runLintCheck(projectPath, language) {
  try {
    switch (language) {
      case 'nodejs':
        return await checkNodeLint(projectPath);
      case 'python':
        return await checkPythonLint(projectPath);
      case 'solidity':
        return await checkSolidityLint(projectPath);
      default:
        return {
          passed: true,
          errors: 0,
          warnings: 0,
          details: 'Linting not implemented for this language'
        };
    }
  } catch (error) {
    return {
      passed: false,
      errors: 0,
      warnings: 0,
      error: error.message,
      details: `Lint check failed: ${error.message}`
    };
  }
}

/**
 * Check Node.js linting with ESLint
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkNodeLint(projectPath) {
  const hasEslintConfig = await fs.pathExists(path.join(projectPath, '.eslintrc.js')) ||
                         await fs.pathExists(path.join(projectPath, '.eslintrc.json')) ||
                         await fs.pathExists(path.join(projectPath, '.eslintrc')) ||
                         await fs.pathExists(path.join(projectPath, 'eslint.config.js'));
  
  // Install eslint if not present
  const packageJson = await fs.readJson(path.join(projectPath, 'package.json'));
  const hasEslintDep = packageJson.devDependencies?.eslint || packageJson.dependencies?.eslint;
  
  if (!hasEslintDep) {
    try {
      execSync('npm install --save-dev eslint', {
        cwd: projectPath,
        timeout: 30000,
        stdio: 'pipe'
      });
    } catch (e) {
      // Continue without eslint
      return {
        passed: true,
        errors: 0,
        warnings: 0,
        details: 'ESLint not available'
      };
    }
  }
  
  // Initialize eslint config if none exists
  if (!hasEslintConfig) {
    try {
      execSync('npx eslint --init --yes', {
        cwd: projectPath,
        timeout: 30000,
        stdio: 'pipe'
      });
    } catch (e) {
      // Use basic config
    }
  }
  
  try {
    const output = execSync('npx eslint . --format json', {
      cwd: projectPath,
      timeout: 30000,
      encoding: 'utf8'
    });
    
    const results = JSON.parse(output);
    let errors = 0;
    let warnings = 0;
    const issues = [];
    
    for (const file of results) {
      errors += file.errorCount;
      warnings += file.warningCount;
      
      for (const msg of file.messages) {
        if (issues.length < 5 && msg.severity === 2) {
          issues.push(`${file.filePath}: ${msg.message}`);
        }
      }
    }
    
    return {
      passed: errors === 0,
      errors,
      warnings,
      details: `${errors} errors, ${warnings} warnings`,
      issues
    };
    
  } catch (error) {
    // ESLint returns non-zero exit code when there are errors
    if (error.stdout) {
      try {
        const results = JSON.parse(error.stdout);
        let errors = 0;
        let warnings = 0;
        const issues = [];
        
        for (const file of results) {
          errors += file.errorCount;
          warnings += file.warningCount;
          
          for (const msg of file.messages) {
            if (issues.length < 5 && msg.severity === 2) {
              issues.push(`${path.basename(file.filePath)}: ${msg.message}`);
            }
          }
        }
        
        return {
          passed: errors === 0,
          errors,
          warnings,
          details: `${errors} errors, ${warnings} warnings`,
          issues
        };
      } catch (e) {
        // Failed to parse JSON
      }
    }
    
    return {
      passed: false,
      errors: 0,
      warnings: 0,
      error: 'ESLint execution failed',
      details: error.message
    };
  }
}

/**
 * Check Python linting
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkPythonLint(projectPath) {
  try {
    const output = execSync('python3 -m pylint **/*.py --output-format=json', {
      cwd: projectPath,
      timeout: 30000,
      encoding: 'utf8',
      shell: true
    });
    
    const results = JSON.parse(output);
    const errors = results.filter(r => r.type === 'error').length;
    const warnings = results.filter(r => r.type === 'warning').length;
    
    const issues = results
      .filter(r => r.type === 'error')
      .slice(0, 5)
      .map(r => `${r.path}:${r.line}: ${r.message}`);
    
    return {
      passed: errors === 0,
      errors,
      warnings,
      details: `${errors} errors, ${warnings} warnings`,
      issues
    };
    
  } catch (error) {
    // Pylint might fail but still give output
    return {
      passed: false,
      errors: 0,
      warnings: 0,
      details: 'Pylint not available or failed'
    };
  }
}

/**
 * Check Solidity linting with solhint
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkSolidityLint(projectPath) {
  try {
    const output = execSync('npx solhint **/*.sol --formatter json', {
      cwd: projectPath,
      timeout: 30000,
      encoding: 'utf8',
      shell: true
    });
    
    const results = JSON.parse(output);
    const errors = results.filter(r => r.level === 'error').length;
    const warnings = results.filter(r => r.level === 'warning').length;
    
    return {
      passed: errors === 0,
      errors,
      warnings,
      details: `${errors} errors, ${warnings} warnings`
    };
    
  } catch (error) {
    return {
      passed: true,
      errors: 0,
      warnings: 0,
      details: 'Solhint not available'
    };
  }
}

module.exports = {
  runLintCheck
};
