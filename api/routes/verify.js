/**
 * Verification Routes
 * 
 * POST /api/v1/verify - Submit code for verification
 * GET /api/v1/verify/:id - Get verification result
 */

const express = require('express');
const router = express.Router();
const { submitVerification, getVerification } = require('../services/verification');

/**
 * POST /api/v1/verify
 * Submit code for verification
 */
router.post('/', async (req, res) => {
  try {
    const { submission, requirements, bounty_type, language, coverage_threshold, timeout } = req.body;
    
    // Validate required fields
    if (!submission) {
      return res.status(400).json({ error: 'submission is required' });
    }
    
    // Validate submission type
    const validTypes = ['github', 'gitlab', 'url', 'inline'];
    const submissionType = req.body.submission_type || 'github';
    if (!validTypes.includes(submissionType)) {
      return res.status(400).json({ error: `submission_type must be one of: ${validTypes.join(', ')}` });
    }
    
    // Submit verification
    const result = await submitVerification({
      submission,
      submission_type: submissionType,
      requirements: requirements || [],
      bounty_type: bounty_type || 'code',
      language: language || 'auto',
      coverage_threshold: coverage_threshold || 70,
      timeout: timeout || 180
    });
    
    res.status(202).json(result);
    
  } catch (error) {
    console.error('Verification submission error:', error);
    res.status(500).json({ error: 'Failed to submit verification', message: error.message });
  }
});

/**
 * GET /api/v1/verify/:id
 * Get verification result by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getVerification(id);
    res.json(result);
  } catch (error) {
    if (error.message === 'Verification not found') {
      return res.status(404).json({ error: 'Verification not found' });
    }
    console.error('Get verification error:', error);
    res.status(500).json({ error: 'Failed to get verification', message: error.message });
  }
});

module.exports = router;
