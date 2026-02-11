/**
 * Tests for ClawJudge Verifier
 */

const { verify } = require('../src/index');
const { detectLanguage } = require('../src/evaluators/code');
const { generateVerdict } = require('../src/verdict');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('ClawJudge Verifier', () => {
  let tempDir;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clawjudge-test-'));
  });
  
  afterEach(async () => {
    await fs.remove(tempDir);
  });
  
  describe('Language Detection', () => {
    test('detects Node.js from package.json', async () => {
      await fs.writeJson(path.join(tempDir, 'package.json'), { name: 'test' });
      expect(detectLanguage(tempDir)).toBe('nodejs');
    });
    
    test('detects Python from requirements.txt', async () => {
      await fs.writeFile(path.join(tempDir, 'requirements.txt'), 'requests\nflask');
      expect(detectLanguage(tempDir)).toBe('python');
    });
    
    test('detects Solidity from .sol files', async () => {
      await fs.writeFile(path.join(tempDir, 'Contract.sol'), 'pragma solidity ^0.8.0;');
      expect(detectLanguage(tempDir)).toBe('solidity');
    });
    
    test('returns null for unknown projects', async () => {
      expect(detectLanguage(tempDir)).toBeNull();
    });
  });
  
  describe('Verdict Generation', () => {
    test('returns PASS for perfect results', () => {
      const results = {
        compilation: { passed: true },
        tests: { passed: true, total: 10, passing: 10, found: true },
        coverage: { passed: true, percentage: 85, threshold: 70 },
        security: { vulnerabilities: 0, critical: 0, high: 0 },
        requirements: { matches: { 'req1': true, 'req2': true }, total: 2, met: 2, missed: 0 }
      };
      
      const verdict = generateVerdict(results, {});
      expect(verdict.verdict).toBe('PASS');
      expect(verdict.score).toBeGreaterThanOrEqual(80);
    });
    
    test('returns FAIL for compilation failure', () => {
      const results = {
        compilation: { passed: false, error: 'Syntax error' },
        tests: { found: false },
        coverage: { percentage: 0 },
        security: { vulnerabilities: 0 },
        requirements: { matches: {}, total: 0, met: 0, missed: 0 }
      };
      
      const verdict = generateVerdict(results, {});
      expect(verdict.verdict).toBe('FAIL');
    });
    
    test('returns PARTIAL for mixed results', () => {
      const results = {
        compilation: { passed: true },
        tests: { passed: false, total: 10, passing: 5, failing: 5, found: true },
        coverage: { passed: false, percentage: 50, threshold: 70 },
        security: { vulnerabilities: 0 },
        requirements: { matches: { 'req1': true, 'req2': false }, total: 2, met: 1, missed: 1 }
      };
      
      const verdict = generateVerdict(results, {});
      expect(verdict.verdict).toBe('PARTIAL');
    });
    
    test('returns FAIL for critical security issues', () => {
      const results = {
        compilation: { passed: true },
        tests: { passed: true, total: 10, passing: 10, found: true },
        coverage: { passed: true, percentage: 80 },
        security: { vulnerabilities: 1, critical: 1, high: 0 },
        requirements: { matches: {}, total: 0, met: 0, missed: 0 }
      };
      
      const verdict = generateVerdict(results, {});
      expect(verdict.verdict).toBe('FAIL');
    });
  });
  
  describe('Integration', () => {
    test('verifies simple Node.js project', async () => {
      // Create a minimal Node.js project
      await fs.writeJson(path.join(tempDir, 'package.json'), {
        name: 'test-project',
        version: '1.0.0',
        scripts: {
          test: 'node -e "console.log(\\"Tests: 1 passed\\")"'
        }
      });
      
      const verdict = await verify({
        submission: tempDir,
        requirements: [],
        language: 'nodejs',
        timeout: 60
      });
      
      expect(verdict).toHaveProperty('verdict');
      expect(verdict).toHaveProperty('score');
      expect(verdict).toHaveProperty('checks');
    });
    
    test('handles invalid submission gracefully', async () => {
      const verdict = await verify({
        submission: '/nonexistent/path',
        requirements: [],
        timeout: 10
      });
      
      expect(verdict.verdict).toBe('ERROR');
      expect(verdict.error).toBeDefined();
    });
  });
});
