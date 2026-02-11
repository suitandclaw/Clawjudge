/**
 * Content Evaluator - Requirements matching
 * 
 * Uses LLM to compare deliverables against requirements.
 * This is the subjective evaluation component.
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Match project deliverables against requirements
 * @param {string} projectPath - Path to project
 * @param {string[]} requirements - Array of requirement strings
 * @param {string} language - Project language
 * @returns {Promise<Object>} Requirements match results
 */
async function matchRequirements(projectPath, requirements, language) {
  const results = {};
  
  // Gather project info for LLM context
  const projectInfo = await gatherProjectInfo(projectPath, language);
  
  // For each requirement, determine if it's met
  for (const req of requirements) {
    results[req] = await evaluateRequirement(req, projectInfo);
  }
  
  return {
    matches: results,
    total: requirements.length,
    met: Object.values(results).filter(v => v).length,
    missed: Object.values(results).filter(v => !v).length
  };
}

/**
 * Gather project information for evaluation
 * @param {string} projectPath - Project path
 * @param {string} language - Project language
 * @returns {Promise<Object>} Project info
 */
async function gatherProjectInfo(projectPath, language) {
  const info = {
    language,
    files: [],
    structure: {},
    readme: null,
    hasTests: false,
    hasDocs: false
  };
  
  try {
    // Get file list
    const entries = await fs.readdir(projectPath, { recursive: true });
    info.files = entries.filter(e => !e.includes('node_modules') && !e.includes('.git'));
    
    // Check for README
    const readmeFiles = ['README.md', 'README.txt', 'README', 'readme.md'];
    for (const readme of readmeFiles) {
      const readmePath = path.join(projectPath, readme);
      if (await fs.pathExists(readmePath)) {
        info.readme = await fs.readFile(readmePath, 'utf8');
        info.hasDocs = true;
        break;
      }
    }
    
    // Check for tests
    const testPatterns = ['test', 'tests', 'spec', '__tests__'];
    info.hasTests = info.files.some(f => testPatterns.some(p => f.toLowerCase().includes(p)));
    
    // Get package info if available
    const packagePath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(packagePath)) {
      const pkg = await fs.readJson(packagePath);
      info.structure.dependencies = Object.keys(pkg.dependencies || {});
      info.structure.devDependencies = Object.keys(pkg.devDependencies || {});
      info.structure.scripts = Object.keys(pkg.scripts || {});
    }
    
    // Sample source files for content analysis
    const sourceFiles = info.files
      .filter(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.py'))
      .slice(0, 5);
    
    info.codeSamples = [];
    for (const file of sourceFiles) {
      try {
        const content = await fs.readFile(path.join(projectPath, file), 'utf8');
        info.codeSamples.push({ file, content: content.slice(0, 1000) });
      } catch (e) {
        // Skip files that can't be read
      }
    }
    
  } catch (error) {
    // Return partial info on error
  }
  
  return info;
}

/**
 * Evaluate a single requirement against project info
 * @param {string} requirement - Requirement description
 * @param {Object} projectInfo - Project information
 * @returns {boolean} Whether requirement is met
 */
function evaluateRequirement(requirement, projectInfo) {
  const req = requirement.toLowerCase();
  
  // Check for common requirement patterns
  
  // API/REST endpoints
  if (req.includes('api') || req.includes('rest') || req.includes('endpoint')) {
    const hasRoutes = projectInfo.files.some(f => 
      f.includes('route') || f.includes('api') || f.includes('controller')
    );
    const hasExpress = projectInfo.structure.dependencies?.includes('express');
    const hasFastify = projectInfo.structure.dependencies?.includes('fastify');
    return hasRoutes || hasExpress || hasFastify;
  }
  
  // Authentication
  if (req.includes('auth') || req.includes('login') || req.includes('jwt')) {
    const hasAuthFiles = projectInfo.files.some(f => 
      f.includes('auth') || f.includes('login') || f.includes('passport') || f.includes('jwt')
    );
    const hasAuthDeps = ['passport', 'jsonwebtoken', 'bcrypt', 'auth'].some(dep =>
      projectInfo.structure.dependencies?.includes(dep)
    );
    return hasAuthFiles || hasAuthDeps;
  }
  
  // Database
  if (req.includes('database') || req.includes('db') || req.includes('mongo') || req.includes('sql')) {
    const hasDbFiles = projectInfo.files.some(f => 
      f.includes('model') || f.includes('schema') || f.includes('migration')
    );
    const hasDbDeps = ['mongoose', 'sequelize', 'prisma', 'typeorm', 'mongodb'].some(dep =>
      projectInfo.structure.dependencies?.includes(dep)
    );
    return hasDbFiles || hasDbDeps;
  }
  
  // Tests
  if (req.includes('test') || req.includes('coverage')) {
    return projectInfo.hasTests;
  }
  
  // Documentation
  if (req.includes('doc') || req.includes('readme')) {
    return projectInfo.hasDocs;
  }
  
  // CLI tool
  if (req.includes('cli') || req.includes('command line')) {
    const hasCliFiles = projectInfo.files.some(f => f.includes('cli') || f.includes('bin'));
    const hasBinScript = projectInfo.structure.scripts?.includes('bin');
    return hasCliFiles || hasBinScript;
  }
  
  // Default: check if any file matches keywords
  const keywords = req.split(/\s+/).filter(w => w.length > 3);
  return keywords.some(keyword => 
    projectInfo.files.some(f => f.toLowerCase().includes(keyword))
  );
}

module.exports = {
  matchRequirements
};
