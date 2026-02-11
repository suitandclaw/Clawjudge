/**
 * Judge Routes
 * 
 * POST /api/v1/judges/register - Register as judge
 * GET /api/v1/judges - List judges
 * GET /api/v1/judges/:id - Get judge profile
 */

const express = require('express');
const router = express.Router();
const { Judge, Verdict } = require('../models/database');

/**
 * POST /api/v1/judges/register
 * Register as a judge agent
 */
router.post('/register', async (req, res) => {
  try {
    const { address, name, stake_amount } = req.body;
    
    // Validate
    if (!address) {
      return res.status(400).json({ error: 'address is required' });
    }
    
    // Check if already registered
    const existing = await Judge.getByAddress(address);
    if (existing) {
      return res.status(409).json({ 
        error: 'Judge already registered',
        judge_id: existing.id
      });
    }
    
    // Create judge
    const judgeId = await Judge.create({
      address,
      name: name || `Judge_${address.slice(0, 8)}`,
      stake_amount: stake_amount || 0
    });
    
    res.status(201).json({
      id: judgeId,
      address,
      name: name || `Judge_${address.slice(0, 8)}`,
      reputation_score: 500,
      message: 'Judge registered successfully'
    });
    
  } catch (error) {
    console.error('Register judge error:', error);
    res.status(500).json({ error: 'Failed to register judge', message: error.message });
  }
});

/**
 * GET /api/v1/judges
 * List all judges with stats
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const judges = await Judge.list(parseInt(limit), parseInt(offset));
    
    res.json({
      judges: judges.map(j => ({
        id: j.id,
        address: j.address,
        name: j.name,
        reputation_score: j.reputation_score,
        total_verdicts: j.total_verdicts,
        accuracy: j.total_verdicts > 0 
          ? Math.round((j.correct_verdicts / j.total_verdicts) * 100)
          : null,
        is_active: j.is_active === 1,
        last_active: j.last_active
      })),
      count: judges.length
    });
    
  } catch (error) {
    console.error('List judges error:', error);
    res.status(500).json({ error: 'Failed to list judges', message: error.message });
  }
});

/**
 * GET /api/v1/judges/:id
 * Get judge profile and verdict history
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get judge by address or id
    let judge = await Judge.getByAddress(id);
    if (!judge) {
      // Try by ID
      // Note: We'd need a getById method in the model
      return res.status(404).json({ error: 'Judge not found' });
    }
    
    // Get recent verdicts (we'd need a method to get verdicts by judge)
    // For now, return basic stats
    
    res.json({
      id: judge.id,
      address: judge.address,
      name: judge.name,
      reputation_score: judge.reputation_score,
      stats: {
        total_verdicts: judge.total_verdicts,
        correct_verdicts: judge.correct_verdicts,
        accuracy: judge.total_verdicts > 0 
          ? Math.round((j.correct_verdicts / j.total_verdicts) * 100)
          : null
      },
      stake: judge.stake_amount,
      is_active: judge.is_active === 1,
      created_at: judge.created_at,
      last_active: judge.last_active
    });
    
  } catch (error) {
    console.error('Get judge error:', error);
    res.status(500).json({ error: 'Failed to get judge', message: error.message });
  }
});

module.exports = router;
