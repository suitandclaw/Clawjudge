/**
 * Stats Routes
 * 
 * GET /api/v1/stats - Platform statistics
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../models/database');

/**
 * GET /api/v1/stats
 * Get platform statistics
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    
    // Get counts
    const stats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          (SELECT COUNT(*) FROM verifications) as total_verifications,
          (SELECT COUNT(*) FROM verifications WHERE status = 'completed') as completed_verifications,
          (SELECT COUNT(*) FROM bounties) as total_bounties,
          (SELECT COUNT(*) FROM bounties WHERE status = 'open') as open_bounties,
          (SELECT COUNT(*) FROM judges WHERE is_active = 1) as active_judges,
          (SELECT COUNT(*) FROM submissions) as total_submissions,
          (SELECT COUNT(*) FROM verdicts) as total_verdicts
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    // Get recent verification stats
    const verificationStats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT verdict, COUNT(*) as count
        FROM verifications
        WHERE status = 'completed'
        GROUP BY verdict
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json({
      platform: 'ClawJudge',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      counts: {
        verifications: {
          total: stats.total_verifications,
          completed: stats.completed_verifications,
          by_verdict: verificationStats.reduce((acc, row) => {
            acc[row.verdict] = row.count;
            return acc;
          }, {})
        },
        bounties: {
          total: stats.total_bounties,
          open: stats.open_bounties
        },
        judges: {
          active: stats.active_judges
        },
        submissions: {
          total: stats.total_submissions
        },
        verdicts: {
          total: stats.total_verdicts
        }
      }
    });
    
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

module.exports = router;
