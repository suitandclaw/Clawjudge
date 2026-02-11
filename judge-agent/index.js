/**
 * Judge Agent - Main Entry Point
 * 
 * Wraps the Phase 1 verifier with qualitative assessment.
 */

const { verify } = require('../skill/clawjudge-verifier/src/index');
const { evaluateQualitative } = require('./qualitative/assessment');

/**
 * Run full judge evaluation on a submission
 * @param {Object} options - Evaluation options
 * @returns {Promise<Object>} Complete verdict with qualitative assessment
 */
async function evaluate(options) {
  // Step 1: Run objective verification (Phase 1)
  const objectiveResult = await verify({
    submission: options.submission,
    requirements: options.requirements || [],
    bounty_type: options.bounty_type || 'code',
    language: options.language || 'auto',
    coverage_threshold: options.coverage_threshold || 70,
    timeout: options.timeout || 180
  });
  
  // If verification errored, return early
  if (objectiveResult.verdict === 'ERROR') {
    return {
      ...objectiveResult,
      qualitative: null,
      judge_notes: 'Objective verification failed. Qualitative assessment skipped.'
    };
  }
  
  // Step 2: Run qualitative assessment
  let qualitativeResult = null;
  try {
    qualitativeResult = await evaluateQualitative(
      options.projectPath, // This would need to be passed or extracted
      options.language || 'auto',
      objectiveResult.checks
    );
  } catch (error) {
    console.error('Qualitative assessment failed:', error);
    // Continue without qualitative data
  }
  
  // Step 3: Generate combined verdict
  const combinedScore = calculateCombinedScore(
    objectiveResult.score,
    qualitativeResult
  );
  
  // Step 4: Generate judge reasoning
  const reasoning = generateJudgeReasoning(objectiveResult, qualitativeResult);
  
  // Step 5: Generate recommendation
  const recommendation = generateJudgeRecommendation(
    objectiveResult,
    qualitativeResult,
    combinedScore
  );
  
  return {
    verdict: objectiveResult.verdict, // Verdict based on objective criteria
    score: combinedScore,
    checks: objectiveResult.checks,
    qualitative: qualitativeResult,
    reasoning,
    recommendation,
    metadata: {
      ...objectiveResult.metadata,
      evaluated_at: new Date().toISOString()
    }
  };
}

/**
 * Calculate combined score from objective and qualitative
 * @param {number} objectiveScore - Objective score (0-100)
 * @param {Object} qualitative - Qualitative assessment
 * @returns {number} Combined score (0-100)
 */
function calculateCombinedScore(objectiveScore, qualitative) {
  if (!qualitative) {
    return objectiveScore;
  }
  
  // Weight: 70% objective, 30% qualitative
  const qualScores = [
    qualitative.code_readability?.score || 5,
    qualitative.architecture?.score || 5,
    qualitative.documentation?.score || 5,
    qualitative.testing_quality?.score || 5
  ];
  
  const qualAverage = qualScores.reduce((a, b) => a + b, 0) / qualScores.length;
  const qualScore = (qualAverage / 10) * 100; // Convert 0-10 to 0-100
  
  return Math.round((objectiveScore * 0.7) + (qualScore * 0.3));
}

/**
 * Generate judge reasoning
 * @param {Object} objective - Objective result
 * @param {Object} qualitative - Qualitative result
 * @returns {string} Reasoning text
 */
function generateJudgeReasoning(objective, qualitative) {
  const parts = [objective.reasoning];
  
  if (qualitative) {
    parts.push(`\n\nQualitative Assessment:`);
    parts.push(`Code Readability: ${qualitative.code_readability?.score}/10`);
    parts.push(`Architecture: ${qualitative.architecture?.score}/10`);
    parts.push(`Documentation: ${qualitative.documentation?.score}/10`);
    parts.push(`Testing Quality: ${qualitative.testing_quality?.score}/10`);
    
    if (qualitative.notes) {
      parts.push(`\nNotes: ${qualitative.notes}`);
    }
  }
  
  return parts.join('\n');
}

/**
 * Generate judge recommendation
 * @param {Object} objective - Objective result
 * @param {Object} qualitative - Qualitative result
 * @param {number} combinedScore - Combined score
 * @returns {string} Recommendation
 */
function generateJudgeRecommendation(objective, qualitative, combinedScore) {
  // Start with objective recommendation
  let rec = objective.recommendation;
  
  // Add qualitative context if available
  if (qualitative) {
    const avgQual = (
      (qualitative.code_readability?.score || 5) +
      (qualitative.architecture?.score || 5) +
      (qualitative.documentation?.score || 5) +
      (qualitative.testing_quality?.score || 5)
    ) / 4;
    
    if (avgQual < 5 && objective.verdict === 'PASS') {
      rec += ' Note: Code passes objective checks but qualitative assessment suggests room for improvement in readability and documentation.';
    }
    
    if (avgQual > 8 && objective.verdict === 'PARTIAL') {
      rec += ' Despite objective failures, code quality is high — consider partial payment with rework requested.';
    }
  }
  
  return rec;
}

module.exports = {
  evaluate
};
