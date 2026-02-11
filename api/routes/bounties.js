/**
 * Bounty Routes
 * 
 * POST /api/v1/bounties - Register a bounty
 * GET /api/v1/bounties/:id - Get bounty details
 * POST /api/v1/bounties/:id/submit - Submit deliverables
 * GET /api/v1/bounties/:id/status - Get bounty status
 */

const express = require('express');
const router = express.Router();
const { Bounty, Submission, Verdict } = require('../models/database');

/**
 * POST /api/v1/bounties
 * Register a new bounty
 */
router.post('/', async (req, res) => {
  try {
    const { title, description, requirements, reward_amount, reward_token, poster_address, deadline } = req.body;
    
    // Validate required fields
    if (!title || !description || !requirements || !reward_amount || !poster_address) {
      return res.status(400).json({ 
        error: 'Missing required fields: title, description, requirements, reward_amount, poster_address' 
      });
    }
    
    // Create bounty
    const bountyId = await Bounty.create({
      title,
      description,
      requirements,
      reward_amount,
      reward_token: reward_token || 'USDC',
      poster_address,
      deadline
    });
    
    res.status(201).json({
      id: bountyId,
      status: 'created',
      message: 'Bounty registered successfully'
    });
    
  } catch (error) {
    console.error('Create bounty error:', error);
    res.status(500).json({ error: 'Failed to create bounty', message: error.message });
  }
});

/**
 * GET /api/v1/bounties/:id
 * Get bounty details and verdicts
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get bounty
    const bounty = await Bounty.getById(id);
    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }
    
    // Get submissions
    const submissions = await Submission.getByBountyId(id);
    
    // Get verdicts for each submission
    const submissionsWithVerdicts = await Promise.all(
      submissions.map(async (sub) => {
        const verdicts = await Verdict.getBySubmissionId(sub.id);
        return { ...sub, verdicts };
      })
    );
    
    res.json({
      ...bounty,
      submissions: submissionsWithVerdicts
    });
    
  } catch (error) {
    console.error('Get bounty error:', error);
    res.status(500).json({ error: 'Failed to get bounty', message: error.message });
  }
});

/**
 * POST /api/v1/bounties/:id/submit
 * Submit deliverables for a bounty
 */
router.post('/:id/submit', async (req, res) => {
  try {
    const { id } = req.params;
    const { worker_address, submission_url, submission_type } = req.body;
    
    // Validate
    if (!worker_address || !submission_url) {
      return res.status(400).json({ error: 'worker_address and submission_url are required' });
    }
    
    // Check bounty exists
    const bounty = await Bounty.getById(id);
    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }
    
    // Create submission
    const submissionId = await Submission.create({
      bounty_id: id,
      worker_address,
      submission_url,
      submission_type: submission_type || 'github'
    });
    
    res.status(201).json({
      id: submissionId,
      bounty_id: id,
      status: 'submitted',
      message: 'Deliverables submitted successfully. Awaiting judge evaluation.'
    });
    
  } catch (error) {
    console.error('Submit deliverables error:', error);
    res.status(500).json({ error: 'Failed to submit deliverables', message: error.message });
  }
});

/**
 * GET /api/v1/bounties/:id/status
 * Get bounty status summary
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    
    const bounty = await Bounty.getById(id);
    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }
    
    const submissions = await Submission.getByBountyId(id);
    
    // Calculate status
    const pendingSubmissions = submissions.filter(s => s.status === 'pending').length;
    const evaluatedSubmissions = submissions.filter(s => s.status === 'evaluated').length;
    
    res.json({
      bounty_id: id,
      status: bounty.status,
      submissions: {
        total: submissions.length,
        pending: pendingSubmissions,
        evaluated: evaluatedSubmissions
      },
      reward: {
        amount: bounty.reward_amount,
        token: bounty.reward_token
      }
    });
    
  } catch (error) {
    console.error('Get bounty status error:', error);
    res.status(500).json({ error: 'Failed to get bounty status', message: error.message });
  }
});

module.exports = router;
