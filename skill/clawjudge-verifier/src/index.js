/**
 * ClawJudge Verifier - Main Entry Point
 * 
 * Automated code and deliverable verification for bounty submissions.
 */

const path = require('path');
const fs = require('fs-extra');
const tmp = require('tmp');
const simpleGit = require('simple-git');

const { detectLanguage } = require('./evaluators/code');
const { runCompilationCheck } = require('./checks/compile');
const { runTestCheck } = require('./checks/tests');
const { runLintCheck } = require('./checks/lint');
const { runSecurityCheck } = require('./checks/security');
const { runCoverageCheck } = require('./checks/coverage');
const { matchRequirements } = require('./evaluators/content');
const { generateVerdict } = require('./verdict');

// Default configuration
const DEFAULT_CONFIG = {
  timeout: parseInt(process.env.CLAWJUDGE_TIMEOUT) || 180,
  coverageThreshold: parseInt(process.env.CLAWJUDGE_COVERAGE_MIN) || 70,
  verbose: process.env.CLAWJUDGE_VERBOSE === 'true',
  tempDir: process.env.CLAWJUDGE_TEMP_DIR || tmp.tmpdir
};

/**
 * Main verification function
 * @param {Object} options - Verification options
 * @param {string} options.submission - GitHub URL, file path, or inline code
 * @param {string[]} options.requirements - Array of requirement strings
 * @param {string} options.bounty_type - Type of bounty (code, data, content)
 * @param {string} options.language - Language override (auto, nodejs, python, solidity)
 * @param {number} options.coverage_threshold - Coverage threshold percentage
 * @param {number} options.timeout - Timeout in seconds
 * @returns {Promise<Object>} Verdict object
 */
async function verify(options) {
  const startTime = Date.now();
  const config = { ...DEFAULT_CONFIG, ...options };
  
  let tempDir = null;
  let projectPath = null;
  
  try {
    // Step 1: Prepare submission
    const prepResult = await prepareSubmission(options.submission, config);
    projectPath = prepResult.path;
    tempDir = prepResult.tempDir;
    
    // Step 2: Detect language
    const language = options.language === 'auto' || !options.language
      ? detectLanguage(projectPath)
      : options.language;
    
    if (!language) {
      return {
        verdict: 'ERROR',
        score: 0,
        error: 'Could not detect project language. Please specify explicitly.',
        checks: {},
        reasoning: 'Language detection failed. No package.json, requirements.txt, or .sol files found.',
        recommendation: 'Specify language explicitly or ensure project has standard config files.'
      };
    }
    
    // Step 3: Run all checks
    const checkTimeout = Math.floor(config.timeout / 5); // Divide timeout among checks
    
    const [
      compilationResult,
      testResult,
      lintResult,
      securityResult,
      coverageResult
    ] = await Promise.all([
      runWithTimeout(runCompilationCheck(projectPath, language), checkTimeout, 'compilation'),
      runWithTimeout(runTestCheck(projectPath, language), checkTimeout, 'tests'),
      runWithTimeout(runLintCheck(projectPath, language), checkTimeout, 'linting'),
      runWithTimeout(runSecurityCheck(projectPath, language), checkTimeout, 'security'),
      runWithTimeout(runCoverageCheck(projectPath, language, config.coverageThreshold), checkTimeout, 'coverage')
    ]);
    
    // Step 4: Match requirements (uses LLM for subjective evaluation)
    const requirementsResult = await matchRequirements(
      projectPath,
      options.requirements || [],
      language
    );
    
    // Step 5: Generate verdict
    const verdict = generateVerdict({
      compilation: compilationResult,
      tests: testResult,
      lint: lintResult,
      security: securityResult,
      coverage: coverageResult,
      requirements: requirementsResult
    }, config);
    
    verdict.metadata = {
      duration: Date.now() - startTime,
      language,
      timestamp: new Date().toISOString()
    };
    
    return verdict;
    
  } catch (error) {
    return {
      verdict: 'ERROR',
      score: 0,
      error: error.message,
      checks: {},
      reasoning: `Verification failed with error: ${error.message}`,
      recommendation: 'Check submission format and try again. Ensure repository is accessible.'
    };
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        await fs.remove(tempDir);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Prepare submission for verification
 * @param {string} submission - GitHub URL, file path, or inline code
 * @param {Object} config - Configuration
 * @returns {Promise<{path: string, tempDir: string|null}>}
 */
async function prepareSubmission(submission, config) {
  // GitHub URL
  if (submission.includes('github.com') || submission.includes('gitlab.com')) {
    const tempDir = tmp.dirSync({ dir: config.tempDir, unsafeCleanup: true }).name;
    const git = simpleGit(tempDir);
    
    // Handle different GitHub URL formats
    let repoUrl = submission;
    if (submission.includes('github.com') && !submission.endsWith('.git')) {
      repoUrl = submission.replace(/\/+$/, '') + '.git';
    }
    
    await git.clone(repoUrl, tempDir, ['--depth', '1']);
    
    // Find the actual project directory (might be nested)
    const entries = await fs.readdir(tempDir);
    const subdirs = [];
    for (const entry of entries) {
      const fullPath = path.join(tempDir, entry);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory() && !entry.startsWith('.')) {
        subdirs.push(fullPath);
      }
    }
    
    // If only one subdirectory and it looks like a project, use it
    if (subdirs.length === 1) {
      const hasPackageJson = await fs.pathExists(path.join(subdirs[0], 'package.json'));
      const hasRequirements = await fs.pathExists(path.join(subdirs[0], 'requirements.txt'));
      if (hasPackageJson || hasRequirements) {
        return { path: subdirs[0], tempDir };
      }
    }
    
    return { path: tempDir, tempDir };
  }
  
  // Local file path
  if (await fs.pathExists(submission)) {
    const stat = await fs.stat(submission);
    if (stat.isDirectory()) {
      return { path: submission, tempDir: null };
    }
    // Single file - create temp dir and copy
    const tempDir = tmp.dirSync({ dir: config.tempDir, unsafeCleanup: true }).name;
    await fs.copy(submission, path.join(tempDir, path.basename(submission)));
    return { path: tempDir, tempDir };
  }
  
  // Inline code - write to temp file
  const tempDir = tmp.dirSync({ dir: config.tempDir, unsafeCleanup: true }).name;
  await fs.writeFile(path.join(tempDir, 'submission.js'), submission);
  return { path: tempDir, tempDir };
}

/**
 * Run a function with timeout
 * @param {Promise} promise - Promise to run
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} checkName - Name of check for error message
 * @returns {Promise<Object>}
 */
async function runWithTimeout(promise, timeoutSec, checkName) {
  const timeoutMs = timeoutSec * 1000;
  
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`${checkName} timed out after ${timeoutSec}s`)), timeoutMs)
    )
  ]).catch(error => ({
    passed: false,
    error: error.message,
    details: `${checkName} check failed: ${error.message}`
  }));
}

module.exports = {
  verify,
  DEFAULT_CONFIG
};
