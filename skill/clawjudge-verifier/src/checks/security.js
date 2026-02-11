/**
 * Security Check
 * 
 * Scans for known vulnerabilities.
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

/**
 * Run security check
 * @param {string} projectPath - Path to project
 * @param {string} language - Project language
 * @returns {Promise<Object>} Security check result
 */
async function runSecurityCheck(projectPath, language) {
  try {
    switch (language) {
      case 'nodejs':
        return await checkNodeSecurity(projectPath);
      case 'python':
        return await checkPythonSecurity(projectPath);
      case 'solidity':
        return await checkSoliditySecurity(projectPath);
      default:
        return {
          passed: true,
          vulnerabilities: 0,
          warnings: 0,
          details: 'Security scan not implemented for this language'
        };
    }
  } catch (error) {
    return {
      passed: false,
      vulnerabilities: 0,
      warnings: 0,
      error: error.message,
      details: `Security check failed: ${error.message}`
    };
  }
}

/**
 * Check Node.js security with npm audit
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkNodeSecurity(projectPath) {
  try {
    const output = execSync('npm audit --json', {
      cwd: projectPath,
      timeout: 30000,
      encoding: 'utf8'
    });
    
    const audit = JSON.parse(output);
    
    // Count vulnerabilities by severity
    const vulnerabilities = audit.vulnerabilities || {};
    let critical = 0;
    let high = 0;
    let moderate = 0;
    let low = 0;
    const details = [];
    
    for (const [name, info] of Object.entries(vulnerabilities)) {
      const severity = info.severity || 'low';
      
      switch (severity) {
        case 'critical':
          critical++;
          break;
        case 'high':
          high++;
          break;
        case 'moderate':
          moderate++;
          break;
        case 'low':
          low++;
          break;
      }
      
      if (details.length < 5) {
        details.push(`${name}: ${severity} - ${info.via?.[0]?.title || 'No details'}`);
      }
    }
    
    const total = critical + high + moderate + low;
    
    return {
      passed: critical === 0 && high === 0,
      vulnerabilities: total,
      critical,
      high,
      moderate,
      low,
      details: total > 0 ? details : 'No vulnerabilities found'
    };
    
  } catch (error) {
    // npm audit exits with non-zero if vulnerabilities found
    if (error.stdout) {
      try {
        const audit = JSON.parse(error.stdout);
        const vulnerabilities = audit.vulnerabilities || {};
        
        let critical = 0;
        let high = 0;
        let moderate = 0;
        let low = 0;
        const details = [];
        
        for (const [name, info] of Object.entries(vulnerabilities)) {
          const severity = info.severity || 'low';
          
          switch (severity) {
            case 'critical':
              critical++;
              break;
            case 'high':
              high++;
              break;
            case 'moderate':
              moderate++;
              break;
            case 'low':
              low++;
              break;
          }
          
          if (details.length < 5) {
            details.push(`${name}: ${severity}`);
          }
        }
        
        const total = critical + high + moderate + low;
        
        return {
          passed: critical === 0 && high === 0,
          vulnerabilities: total,
          critical,
          high,
          moderate,
          low,
          details: total > 0 ? details : 'No vulnerabilities found'
        };
      } catch (e) {
        // Failed to parse
      }
    }
    
    return {
      passed: false,
      vulnerabilities: 0,
      warnings: 0,
      error: 'npm audit failed',
      details: error.message
    };
  }
}

/**
 * Check Python security with pip-audit
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkPythonSecurity(projectPath) {
  try {
    // Try to install pip-audit if not present
    try {
      execSync('pip install pip-audit', {
        timeout: 30000,
        stdio: 'pipe'
      });
    } catch (e) {
      // May already be installed
    }
    
    const output = execSync('pip-audit --format=json', {
      cwd: projectPath,
      timeout: 30000,
      encoding: 'utf8'
    });
    
    const audit = JSON.parse(output);
    const vulnerabilities = audit.vulnerabilities || [];
    
    const details = vulnerabilities.slice(0, 5).map(v => 
      `${v.name}: ${v.vuln_id}`
    );
    
    return {
      passed: vulnerabilities.length === 0,
      vulnerabilities: vulnerabilities.length,
      details: vulnerabilities.length > 0 ? details : 'No vulnerabilities found'
    };
    
  } catch (error) {
    return {
      passed: true,
      vulnerabilities: 0,
      warnings: 0,
      details: 'pip-audit not available'
    };
  }
}

/**
 * Check Solidity security with basic pattern matching
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Check result
 */
async function checkSoliditySecurity(projectPath) {
  const files = await fs.readdir(projectPath);
  const solFiles = files.filter(f => f.endsWith('.sol'));
  
  const issues = [];
  
  for (const file of solFiles) {
    const content = await fs.readFile(path.join(projectPath, file), 'utf8');
    
    // Check for tx.origin usage
    if (content.includes('tx.origin')) {
      issues.push(`${file}: Uses tx.origin (can be vulnerable to phishing)`);
    }
    
    // Check for block.timestamp reliance
    if (content.match(/block\.timestamp\s*[<>=]/)) {
      issues.push(`${file}: Relies on block.timestamp for comparisons`);
    }
    
    // Check for unchecked sends
    if (content.match(/\.send\(|\.transfer\(/)) {
      issues.push(`${file}: Uses send() or transfer() without checking return value`);
    }
    
    // Check for self-destruct
    if (content.includes('selfdestruct')) {
      issues.push(`${file}: Contains selfdestruct`);
    }
    
    // Check for delegatecall
    if (content.includes('delegatecall')) {
      issues.push(`${file}: Uses delegatecall (high risk)`);
    }
  }
  
  return {
    passed: issues.length === 0,
    vulnerabilities: issues.length,
    warnings: issues.length,
    details: issues.length > 0 ? issues : 'No obvious security issues found'
  };
}

module.exports = {
  runSecurityCheck
};
