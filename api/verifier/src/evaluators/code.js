/**
 * Code Evaluator - Language Detection
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Detect programming language from project files
 * @param {string} projectPath - Path to project directory
 * @returns {string|null} Language identifier or null if unknown
 */
function detectLanguage(projectPath) {
  // Check for package.json (Node.js)
  if (fs.pathExistsSync(path.join(projectPath, 'package.json'))) {
    return 'nodejs';
  }
  
  // Check for Python files
  if (fs.pathExistsSync(path.join(projectPath, 'requirements.txt')) ||
      fs.pathExistsSync(path.join(projectPath, 'setup.py')) ||
      fs.pathExistsSync(path.join(projectPath, 'pyproject.toml'))) {
    return 'python';
  }
  
  // Check for Solidity files
  const files = fs.readdirSync(projectPath);
  if (files.some(f => f.endsWith('.sol'))) {
    return 'solidity';
  }
  
  // Check for Rust
  if (fs.pathExistsSync(path.join(projectPath, 'Cargo.toml'))) {
    return 'rust';
  }
  
  // Check file extensions as fallback
  const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.ts')).length;
  const pyFiles = files.filter(f => f.endsWith('.py')).length;
  
  if (jsFiles > pyFiles) return 'nodejs';
  if (pyFiles > jsFiles) return 'python';
  
  return null;
}

/**
 * Get file extensions for a language
 * @param {string} language - Language identifier
 * @returns {string[]} Array of file extensions
 */
function getLanguageExtensions(language) {
  const extensions = {
    nodejs: ['.js', '.ts', '.jsx', '.tsx', '.mjs'],
    python: ['.py', '.pyw'],
    solidity: ['.sol'],
    rust: ['.rs']
  };
  return extensions[language] || [];
}

/**
 * Count lines of code in project
 * @param {string} projectPath - Path to project
 * @param {string} language - Language identifier
 * @returns {Promise<number>} Line count
 */
async function countLines(projectPath, language) {
  const extensions = getLanguageExtensions(language);
  let totalLines = 0;
  
  async function countDir(dir) {
    const entries = await fs.readdir(dir);
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory() && entry !== 'node_modules' && entry !== '.git') {
        await countDir(fullPath);
      } else if (stat.isFile() && extensions.some(ext => entry.endsWith(ext))) {
        const content = await fs.readFile(fullPath, 'utf8');
        totalLines += content.split('\n').length;
      }
    }
  }
  
  await countDir(projectPath);
  return totalLines;
}

module.exports = {
  detectLanguage,
  getLanguageExtensions,
  countLines
};
