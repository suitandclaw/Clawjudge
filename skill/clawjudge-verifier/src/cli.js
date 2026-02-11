#!/usr/bin/env node

/**
 * ClawJudge Verifier CLI
 * 
 * Command-line interface for code verification.
 */

const { Command } = require('commander');
const fs = require('fs-extra');
const path = require('path');
const { verify } = require('./index');

const program = new Command();

program
  .name('clawjudge-verifier')
  .description('Automated code and deliverable verification for bounty submissions')
  .version('0.1.0');

program
  .command('verify')
  .description('Verify a code submission')
  .requiredOption('-s, --submission <path>', 'Path to submission (file, directory, or GitHub URL)')
  .option('-r, --requirements <file>', 'Path to requirements file (one per line)')
  .option('-l, --language <lang>', 'Language (nodejs, python, solidity)', 'auto')
  .option('-t, --type <type>', 'Bounty type', 'code')
  .option('-c, --coverage <threshold>', 'Coverage threshold %', '70')
  .option('-o, --output <file>', 'Output file for verdict JSON')
  .option('--timeout <seconds>', 'Timeout in seconds', '180')
  .option('--verbose', 'Verbose output')
  .action(async (options) => {
    try {
      // Read requirements if file provided
      let requirements = [];
      if (options.requirements) {
        const reqContent = await fs.readFile(options.requirements, 'utf8');
        requirements = reqContent.split('\n').filter(line => line.trim());
      }
      
      // Set environment variables
      if (options.verbose) {
        process.env.CLAWJUDGE_VERBOSE = 'true';
      }
      process.env.CLAWJUDGE_TIMEOUT = options.timeout;
      process.env.CLAWJUDGE_COVERAGE_MIN = options.coverage;
      
      console.log('🔍 Verifying submission...');
      console.log(`   Submission: ${options.submission}`);
      console.log(`   Language: ${options.language}`);
      console.log(`   Requirements: ${requirements.length}`);
      console.log('');
      
      const startTime = Date.now();
      
      const verdict = await verify({
        submission: options.submission,
        requirements,
        bounty_type: options.type,
        language: options.language,
        coverage_threshold: parseInt(options.coverage),
        timeout: parseInt(options.timeout)
      });
      
      const duration = Date.now() - startTime;
      
      // Print results
      console.log('─'.repeat(50));
      console.log(`VERDICT: ${verdict.verdict}`);
      console.log(`SCORE: ${verdict.score}/100`);
      console.log(`TIME: ${duration}ms`);
      console.log('─'.repeat(50));
      console.log('');
      
      // Print checks
      if (verdict.checks.compilation) {
        const status = verdict.checks.compilation.passed ? '✅' : '❌';
        console.log(`${status} Compilation: ${verdict.checks.compilation.details || verdict.checks.compilation.error || 'N/A'}`);
      }
      
      if (verdict.checks.tests) {
        const status = verdict.checks.tests.passed ? '✅' : verdict.checks.tests.found ? '⚠️' : '⚪';
        const details = verdict.checks.tests.found 
          ? `${verdict.checks.tests.passing}/${verdict.checks.tests.total} passing`
          : verdict.checks.tests.details || 'No tests';
        console.log(`${status} Tests: ${details}`);
      }
      
      if (verdict.checks.coverage) {
        const status = verdict.checks.coverage.passed ? '✅' : '⚠️';
        console.log(`${status} Coverage: ${verdict.checks.coverage.percentage || 0}% (threshold: ${verdict.checks.coverage.threshold}%)`);
      }
      
      if (verdict.checks.security) {
        const status = verdict.checks.security.vulnerabilities === 0 ? '✅' : '⚠️';
        const vulns = verdict.checks.security.vulnerabilities || 0;
        console.log(`${status} Security: ${vulns} vulnerabilities`);
      }
      
      if (Object.keys(verdict.checks.requirements).length > 0) {
        const reqMet = Object.values(verdict.checks.requirements).filter(v => v).length;
        const reqTotal = Object.keys(verdict.checks.requirements).length;
        const status = reqMet === reqTotal ? '✅' : '⚠️';
        console.log(`${status} Requirements: ${reqMet}/${reqTotal} met`);
      }
      
      console.log('');
      console.log('Reasoning:');
      console.log(verdict.reasoning);
      console.log('');
      console.log('Recommendation:');
      console.log(verdict.recommendation);
      
      // Save to file if requested
      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(verdict, null, 2));
        console.log('');
        console.log(`💾 Verdict saved to ${options.output}`);
      }
      
      // Exit with appropriate code
      process.exit(verdict.verdict === 'PASS' ? 0 : verdict.verdict === 'PARTIAL' ? 1 : 2);
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(3);
    }
  });

program
  .command('example')
  .description('Show example verdict output')
  .action(() => {
    const example = {
      verdict: 'PARTIAL',
      score: 72,
      checks: {
        compilation: {
          passed: true,
          details: 'npm install + npm run build succeeded'
        },
        tests: {
          passed: true,
          total: 12,
          passing: 11,
          failing: 1
        },
        coverage: {
          percentage: 68,
          threshold: 70,
          passed: false
        },
        security: {
          vulnerabilities: 0,
          warnings: 2,
          details: ['outdated dependency: lodash@4.17.20']
        },
        requirements: {
          'REST API with CRUD endpoints': true,
          'Authentication middleware': true,
          'Database migrations': false,
          'Test coverage above 70%': false
        }
      },
      reasoning: 'Code compiles and passes 11/12 tests. Coverage at 68% below 70% threshold. No security vulnerabilities found. Missing database migration scripts per requirements.',
      recommendation: 'PARTIAL release at 70% — core functionality acceptable, address coverage and migrations before final approval.'
    };
    
    console.log(JSON.stringify(example, null, 2));
  });

program.parse();
