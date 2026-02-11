/**
 * ClawJudge API Server
 * 
 * REST API for code verification and bounty management.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { initializeDatabase } = require('./models/database');
const verifyRoutes = require('./routes/verify');
const bountyRoutes = require('./routes/bounties');
const judgeRoutes = require('./routes/judges');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Stricter rate limit for verification endpoint
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 verifications per minute
  message: { error: 'Verification rate limit exceeded.' }
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Documentation
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'ClawJudge API',
    version: '0.1.0',
    endpoints: {
      'POST /api/v1/verify': 'Submit code for verification',
      'GET /api/v1/verify/:id': 'Get verification result by ID',
      'POST /api/v1/bounties': 'Register a bounty for evaluation',
      'GET /api/v1/bounties/:id': 'Get bounty details + verdicts',
      'POST /api/v1/bounties/:id/submit': 'Submit deliverables for judging',
      'GET /api/v1/bounties/:id/status': 'Current bounty status',
      'POST /api/v1/judges/register': 'Register as judge agent',
      'GET /api/v1/judges': 'List judges with stats',
      'GET /api/v1/judges/:id': 'Judge profile and verdict history',
      'GET /api/v1/stats': 'Platform statistics'
    }
  });
});

// Routes
app.use('/api/v1/verify', verifyLimiter, verifyRoutes);
app.use('/api/v1/bounties', bountyRoutes);
app.use('/api/v1/judges', judgeRoutes);
app.use('/api/v1/stats', statsRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    console.log(`Starting ClawJudge API...`);
    console.log(`PORT env: ${process.env.PORT || 'not set (using default)'}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    
    await initializeDatabase();
    console.log('Database initialized successfully');
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ ClawJudge API server running on 0.0.0.0:${PORT}`);
      console.log(`✓ Health check: http://0.0.0.0:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

startServer();
