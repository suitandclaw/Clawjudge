/**
 * Judge Agent - Qualitative Evaluation
 * 
 * Adds LLM-based qualitative assessment to the verifier.
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Run qualitative evaluation on a submission
 * @param {string} projectPath - Path to project
 * @param {string} language - Project language
 * @param {Object} objectiveResults - Results from objective checks
 * @returns {Promise<Object>} Qualitative assessment
 */
async function evaluateQualitative(projectPath, language, objectiveResults) {
  const assessment = {
    code_readability: await assessReadability(projectPath, language),
    architecture: await assessArchitecture(projectPath, language),
    documentation: await assessDocumentation(projectPath),
    testing_quality: await assessTestingQuality(projectPath, language, objectiveResults),
    notes: []
  };
  
  // Generate summary notes
  const notes = [];
  
  if (assessment.code_readability.score < 5) {
    notes.push('Code readability could be improved — consider adding comments and using consistent naming.');
  }
  
  if (assessment.architecture.score < 5) {
    notes.push('Architecture could benefit from better separation of concerns.');
  }
  
  if (assessment.documentation.score < 5) {
    notes.push('Documentation is sparse — add README usage examples and inline code comments.');
  }
  
  if (notes.length === 0) {
    notes.push('Well-structured codebase with good practices overall.');
  }
  
  assessment.notes = notes.join(' ');
  
  return assessment;
}

/**
 * Assess code readability
 * @param {string} projectPath - Project path
 * @param {string} language - Language
 * @returns {Promise<Object>} Readability score and notes
 */
async function assessReadability(projectPath, language) {
  const files = await getSourceFiles(projectPath, language);
  
  let totalLines = 0;
  let commentedLines = 0;
  let longFunctions = 0;
  
  for (const file of files.slice(0, 10)) { // Sample first 10 files
    try {
      const content = await fs.readFile(path.join(projectPath, file), 'utf8');
      const lines = content.split('\n');
      totalLines += lines.length;
      
      // Count comment lines
      commentedLines += lines.filter(line => 
        line.trim().startsWith('//') || 
        line.trim().startsWith('#') ||
        line.trim().startsWith('*') ||
        line.trim().startsWith('/*')
      ).length;
      
      // Check for long functions (simple heuristic)
      let inFunction = false;
      let functionLines = 0;
      
      for (const line of lines) {
        if (line.match(/^(function|const|async function|def)\s+\w+/)) {
          inFunction = true;
          functionLines = 0;
        }
        if (inFunction) {
          functionLines++;
          if (functionLines > 50) {
            longFunctions++;
            inFunction = false;
          }
        }
        if (line.trim() === '}' || line.trim() === 'end') {
          inFunction = false;
        }
      }
      
    } catch (e) {
      // Skip unreadable files
    }
  }
  
  // Calculate score (0-10)
  const commentRatio = totalLines > 0 ? commentedLines / totalLines : 0;
  let score = 5; // Base score
  
  // Bonus for comments
  if (commentRatio > 0.1) score += 2;
  if (commentRatio > 0.2) score += 1;
  
  // Penalty for long functions
  if (longFunctions > 0) score -= 2;
  if (longFunctions > 3) score -= 2;
  
  score = Math.max(0, Math.min(10, score));
  
  return {
    score,
    comment_ratio: Math.round(commentRatio * 100),
    long_functions: longFunctions,
    files_analyzed: files.length
  };
}

/**
 * Assess architecture quality
 * @param {string} projectPath - Project path
 * @param {string} language - Language
 * @returns {Promise<Object>} Architecture score
 */
async function assessArchitecture(projectPath, language) {
  const structure = await analyzeStructure(projectPath);
  
  let score = 5; // Base score
  
  // Check for good practices
  if (structure.hasSrcDir) score += 1;
  if (structure.hasTestDir) score += 1;
  if (structure.hasConfigFiles) score += 1;
  if (structure.isModular) score += 1;
  
  // Penalties
  if (structure.allInRoot) score -= 2;
  if (structure.noSeparation) score -= 2;
  
  score = Math.max(0, Math.min(10, score));
  
  return {
    score,
    structure: {
      has_source_dir: structure.hasSrcDir,
      has_test_dir: structure.hasTestDir,
      has_config: structure.hasConfigFiles,
      is_modular: structure.isModular
    }
  };
}

/**
 * Assess documentation quality
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Documentation score
 */
async function assessDocumentation(projectPath) {
  const readmeFiles = ['README.md', 'README.txt', 'readme.md', 'README'];
  let hasReadme = false;
  let readmeLength = 0;
  let hasExamples = false;
  
  for (const readme of readmeFiles) {
    const readmePath = path.join(projectPath, readme);
    if (await fs.pathExists(readmePath)) {
      hasReadme = true;
      const content = await fs.readFile(readmePath, 'utf8');
      readmeLength = content.length;
      hasExamples = content.includes('example') || content.includes('```');
      break;
    }
  }
  
  // Check for inline documentation
  const files = await fs.readdir(projectPath);
  const sourceFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.py'));
  
  let hasInlineDocs = false;
  for (const file of sourceFiles.slice(0, 5)) {
    try {
      const content = await fs.readFile(path.join(projectPath, file), 'utf8');
      if (content.includes('@param') || content.includes('/**') || content.includes('"""')) {
        hasInlineDocs = true;
        break;
      }
    } catch (e) {}
  }
  
  let score = 0;
  if (hasReadme) score += 3;
  if (readmeLength > 500) score += 2;
  if (hasExamples) score += 2;
  if (hasInlineDocs) score += 3;
  
  score = Math.min(10, score);
  
  return {
    score,
    has_readme: hasReadme,
    readme_length: readmeLength,
    has_examples: hasExamples,
    has_inline_docs: hasInlineDocs
  };
}

/**
 * Assess testing quality
 * @param {string} projectPath - Project path
 * @param {string} language - Language
 * @param {Object} objectiveResults - Objective test results
 * @returns {Promise<Object>} Testing quality score
 */
async function assessTestingQuality(projectPath, language, objectiveResults) {
  const tests = objectiveResults.tests || {};
  
  let score = 0;
  
  if (tests.found) {
    score += 3; // Has tests
    
    // Coverage
    if (tests.total > 0) {
      const passRate = tests.passing / tests.total;
      if (passRate > 0.9) score += 4;
      else if (passRate > 0.7) score += 2;
      else if (passRate > 0.5) score += 1;
    }
    
    // Test variety
    const testFiles = await getTestFiles(projectPath);
    if (testFiles.length > 1) score += 2;
    if (testFiles.length > 3) score += 1;
  }
  
  score = Math.min(10, score);
  
  return {
    score,
    has_tests: tests.found,
    test_count: tests.total || 0,
    pass_rate: tests.total ? tests.passing / tests.total : 0
  };
}

/**
 * Analyze project structure
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Structure analysis
 */
async function analyzeStructure(projectPath) {
  const entries = await fs.readdir(projectPath);
  const stats = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(projectPath, entry);
      const stat = await fs.stat(fullPath);
      return { name: entry, isDirectory: stat.isDirectory() };
    })
  );
  
  const dirs = stats.filter(s => s.isDirectory).map(s => s.name);
  const files = stats.filter(s => !s.isDirectory).map(s => s.name);
  
  return {
    hasSrcDir: dirs.includes('src') || dirs.includes('lib'),
    hasTestDir: dirs.includes('test') || dirs.includes('tests') || dirs.includes('__tests__'),
    hasConfigFiles: files.some(f => 
      f === 'package.json' || f === '.eslintrc.js' || f === 'tsconfig.json'
    ),
    isModular: dirs.length > 2,
    allInRoot: files.length > 10 && dirs.length < 3,
    noSeparation: !dirs.includes('src') && !dirs.includes('lib') && files.length > 20
  };
}

/**
 * Get source files for a language
 * @param {string} projectPath - Project path
 * @param {string} language - Language
 * @returns {Promise<string[]>} List of source files
 */
async function getSourceFiles(projectPath, language) {
  const extensions = {
    nodejs: ['.js', '.ts', '.jsx', '.tsx'],
    python: ['.py'],
    solidity: ['.sol'],
    rust: ['.rs']
  };
  
  const exts = extensions[language] || ['.js'];
  const files = [];
  
  async function scanDir(dir) {
    const entries = await fs.readdir(dir);
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory() && 
          !entry.startsWith('.') && 
          entry !== 'node_modules' && 
          entry !== 'dist' &&
          entry !== 'build') {
        await scanDir(fullPath);
      } else if (stat.isFile() && exts.some(ext => entry.endsWith(ext))) {
        files.push(path.relative(projectPath, fullPath));
      }
    }
  }
  
  await scanDir(projectPath);
  return files;
}

/**
 * Get test files
 * @param {string} projectPath - Project path
 * @returns {Promise<string[]>} List of test files
 */
async function getTestFiles(projectPath) {
  const files = [];
  
  async function scanDir(dir) {
    const entries = await fs.readdir(dir);
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory() && 
          !entry.startsWith('.') && 
          entry !== 'node_modules') {
        await scanDir(fullPath);
      } else if (stat.isFile() && 
          (entry.includes('.test.') || 
           entry.includes('.spec.') || 
           entry.includes('_test.'))) {
        files.push(path.relative(projectPath, fullPath));
      }
    }
  }
  
  try {
    await scanDir(projectPath);
  } catch (e) {}
  
  return files;
}

module.exports = {
  evaluateQualitative
};
