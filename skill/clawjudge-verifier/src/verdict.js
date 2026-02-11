/**
 * Verdict Generator
 * 
 * Aggregates all check results and generates final verdict.
 */

/**
 * Generate final verdict from check results
 * @param {Object} results - All check results
 * @param {Object} config - Configuration
 * @returns {Object} Final verdict
 */
function generateVerdict(results, config) {
  const { compilation, tests, lint, security, coverage, requirements } = results;
  
  // Calculate weighted score
  // compilation: 25%, tests: 25%, security: 20%, requirements: 20%, coverage: 10%
  const weights = {
    compilation: 0.25,
    tests: 0.25,
    security: 0.20,
    requirements: 0.20,
    coverage: 0.10
  };
  
  let score = 0;
  
  // Compilation score (0 or 100)
  if (compilation?.passed) {
    score += weights.compilation * 100;
  }
  
  // Test score (based on pass rate)
  if (tests?.found) {
    const passRate = tests.total > 0 ? (tests.passing / tests.total) : 0;
    score += weights.tests * passRate * 100;
  }
  
  // Security score (0 if critical/high vulns, 100 otherwise)
  if (security) {
    const hasCritical = (security.critical > 0) || (security.high > 0);
    if (!hasCritical) {
      score += weights.security * 100;
    }
  }
  
  // Requirements score
  if (requirements?.matches) {
    const reqCount = Object.keys(requirements.matches).length;
    const metCount = requirements.met || 0;
    const reqRate = reqCount > 0 ? (metCount / reqCount) : 0;
    score += weights.requirements * reqRate * 100;
  }
  
  // Coverage score
  if (coverage?.percentage !== undefined) {
    const coverageScore = Math.min(coverage.percentage, 100);
    score += weights.coverage * coverageScore;
  }
  
  // Round score
  score = Math.round(score);
  
  // Determine verdict
  const hasCriticalFailure = !compilation?.passed || (security?.critical > 0) || (security?.high > 0);
  const allRequirementsMet = requirements?.missed === 0;
  
  let verdict;
  if (score >= 80 && !hasCriticalFailure && allRequirementsMet) {
    verdict = 'PASS';
  } else if (score >= 50 && !hasCriticalFailure) {
    verdict = 'PARTIAL';
  } else {
    verdict = 'FAIL';
  }
  
  // Generate reasoning
  const reasoning = generateReasoning(results, score, verdict);
  
  // Generate recommendation
  const recommendation = generateRecommendation(results, score, verdict);
  
  return {
    verdict,
    score,
    checks: {
      compilation: formatCheck(compilation),
      tests: formatCheck(tests),
      coverage: formatCheck(coverage),
      security: formatCheck(security),
      requirements: requirements?.matches || {}
    },
    reasoning,
    recommendation
  };
}

/**
 * Format check result for output
 * @param {Object} check - Check result
 * @returns {Object} Formatted check
 */
function formatCheck(check) {
  if (!check) {
    return { passed: false, details: 'Check not run' };
  }
  
  // Remove internal fields
  const { error, ...formatted } = check;
  return formatted;
}

/**
 * Generate reasoning string
 * @param {Object} results - Check results
 * @param {number} score - Final score
 * @param {string} verdict - Verdict
 * @returns {string} Reasoning
 */
function generateReasoning(results, score, verdict) {
  const parts = [];
  
  // Compilation
  if (results.compilation?.passed) {
    parts.push('Code compiles successfully.');
  } else {
    parts.push(`Compilation failed: ${results.compilation?.error || 'unknown error'}.`);
  }
  
  // Tests
  if (results.tests?.found) {
    parts.push(`${results.tests.passing}/${results.tests.total} tests passing.`);
  } else {
    parts.push('No test suite detected.');
  }
  
  // Coverage
  if (results.coverage?.percentage !== undefined) {
    const meetsThreshold = results.coverage.passed ? 'meets' : 'below';
    parts.push(`Coverage at ${results.coverage.percentage}% ${meetsThreshold} threshold.`);
  }
  
  // Security
  if (results.security?.vulnerabilities > 0) {
    const critical = results.security.critical || 0;
    const high = results.security.high || 0;
    if (critical > 0 || high > 0) {
      parts.push(`${critical} critical and ${high} high vulnerabilities found.`);
    } else {
      parts.push('No critical vulnerabilities found.');
    }
  } else {
    parts.push('No security vulnerabilities found.');
  }
  
  // Requirements
  if (results.requirements?.total > 0) {
    const met = results.requirements.met || 0;
    const total = results.requirements.total;
    const missed = results.requirements.missed || 0;
    parts.push(`${met}/${total} requirements met.`);
    if (missed > 0) {
      const missedList = Object.entries(results.requirements.matches)
        .filter(([, met]) => !met)
        .map(([req]) => req)
        .slice(0, 2);
      if (missedList.length > 0) {
        parts.push(`Missing: ${missedList.join(', ')}${missed > 2 ? '...' : ''}`);
      }
    }
  }
  
  return parts.join(' ');
}

/**
 * Generate recommendation string
 * @param {Object} results - Check results
 * @param {number} score - Final score
 * @param {string} verdict - Verdict
 * @returns {string} Recommendation
 */
function generateRecommendation(results, score, verdict) {
  switch (verdict) {
    case 'PASS':
      return 'All checks passed. Bounty approved for full payment.';
      
    case 'PARTIAL':
      const issues = [];
      
      if (!results.compilation?.passed) {
        issues.push('compilation issues');
      }
      if (results.tests?.failing > 0) {
        issues.push('failing tests');
      }
      if (results.requirements?.missed > 0) {
        issues.push('missing requirements');
      }
      if (results.coverage?.passed === false) {
        issues.push('low coverage');
      }
      
      const percentage = Math.round(score);
      if (issues.length > 0) {
        return `Partial release at ${percentage}% — ${issues.join(', ')} present but core functionality acceptable.`;
      }
      return `Partial release at ${percentage}% — review specific findings before payment.`;
      
    case 'FAIL':
      if (!results.compilation?.passed) {
        return 'Submission rejected — does not compile. Worker must fix build issues and resubmit.';
      }
      if (results.security?.critical > 0 || results.security?.high > 0) {
        return 'Submission rejected — security vulnerabilities must be addressed before approval.';
      }
      if (score < 50) {
        return 'Submission rejected — quality threshold not met. Significant rework required.';
      }
      return 'Submission rejected — does not meet minimum requirements.';
      
    default:
      return 'Review verdict details and make manual determination.';
  }
}

module.exports = {
  generateVerdict
};
