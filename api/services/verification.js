/**
 * Verification Service
 * 
 * Wraps the Phase 1 ClawHub skill for API use.
 */

const path = require('path');
const { verify } = require('../verifier/src/index');
const { Verification } = require('../models/database');

/**
 * Submit code for verification
 * @param {Object} data - Verification request
 * @returns {Promise<Object>} Verification result
 */
async function submitVerification(data) {
  // Create verification record
  const verificationId = await Verification.create({
    submission_url: data.submission,
    submission_type: data.submission_type || 'github',
    requirements: data.requirements || [],
    language: data.language || 'auto'
  });
  
  // Run verification in background
  runVerification(verificationId, data);
  
  // Return immediately with ID
  return {
    id: verificationId,
    status: 'pending',
    message: 'Verification in progress. Check status via GET /api/v1/verify/' + verificationId
  };
}

/**
 * Run verification asynchronously
 * @param {string} id - Verification ID
 * @param {Object} data - Verification data
 */
async function runVerification(id, data) {
  try {
    const result = await verify({
      submission: data.submission,
      requirements: data.requirements || [],
      bounty_type: data.bounty_type || 'code',
      language: data.language || 'auto',
      coverage_threshold: data.coverage_threshold || 70,
      timeout: data.timeout || 180
    });
    
    // Update verification record
    await Verification.update(id, {
      status: 'completed',
      verdict: result.verdict,
      score: result.score,
      checks: result.checks,
      reasoning: result.reasoning,
      recommendation: result.recommendation,
      completed_at: new Date().toISOString()
    });
    
    // Trigger webhooks if configured
    await triggerWebhooks('verification.completed', { id, result });
    
  } catch (error) {
    console.error('Verification failed:', error);
    
    await Verification.update(id, {
      status: 'failed',
      verdict: 'ERROR',
      score: 0,
      reasoning: `Verification failed: ${error.message}`,
      completed_at: new Date().toISOString()
    });
    
    await triggerWebhooks('verification.failed', { id, error: error.message });
  }
}

/**
 * Get verification result
 * @param {string} id - Verification ID
 * @returns {Promise<Object>} Verification result
 */
async function getVerification(id) {
  const verification = await Verification.getById(id);
  
  if (!verification) {
    throw new Error('Verification not found');
  }
  
  return {
    id: verification.id,
    status: verification.status,
    submission: {
      url: verification.submission_url,
      type: verification.submission_type
    },
    requirements: verification.requirements,
    verdict: verification.verdict,
    score: verification.score,
    checks: verification.checks,
    reasoning: verification.reasoning,
    recommendation: verification.recommendation,
    created_at: verification.created_at,
    completed_at: verification.completed_at
  };
}

/**
 * Trigger webhooks for an event
 * @param {string} event - Event type
 * @param {Object} data - Event data
 */
async function triggerWebhooks(event, data) {
  // TODO: Implement webhook calling
  // For now, just log
  console.log(`Webhook: ${event}`, data);
}

module.exports = {
  submitVerification,
  getVerification
};
