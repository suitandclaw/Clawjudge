#!/usr/bin/env node
/**
 * ClawJudge Verifier CLI
 * Command-line interface for code verification
 */

const { Command } = require('commander');
const { verify } = require('./index');

const program = new Command();

program
  .name('clawjudge-verifier')
  .description('Automated code verification for bounty submissions')
  .version('0.1.0');

program
  .command('verify')
  .description('Verify a code submission')
  .requiredOption('-r, --repo <url>', 'GitHub repository URL')
  .requiredOption('-req, --requirements <list>', 'Comma-separated requirements list')
  .option('-t, --type <type>', 'Bounty type (code|data|content)', 'code')
  .action(async (options) => {
    try {
      const requirements = options.requirements.split(',').map(r => r.trim());
      console.log(`Verifying ${options.repo}...`);
      console.log(`Requirements: ${requirements.join(', ')}`);
      console.log('---');
      
      const result = await verify(options.repo, requirements, options.type);
      
      console.log('\n' + JSON.stringify(result, null, 2));
      
      // Exit with appropriate code
      process.exit(result.verdict === 'PASS' ? 0 : result.verdict === 'PARTIAL' ? 1 : 2);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(3);
    }
  });

program
  .command('check')
  .description('Quick check if repo compiles')
  .requiredOption('-r, --repo <url>', 'GitHub repository URL')
  .action(async (options) => {
    try {
      const result = await verify(options.repo, ['Compiles successfully'], 'code');
      console.log(result.verdict === 'PASS' ? '✅ Compiles' : '❌ Does not compile');
      process.exit(result.verdict === 'PASS' ? 0 : 1);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
