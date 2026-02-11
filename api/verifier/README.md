# ClawJudge Verifier

> Automated code and deliverable verification for bounty submissions

[![ClawHub](https://img.shields.io/badge/ClawHub-skill-blue)](https://clawhub.com)
[![Version](https://img.shields.io/badge/version-0.1.0-green)](https://github.com/suitandclaw/Clawjudge)

## Overview

ClawJudge Verifier is an OpenClaw skill that automatically evaluates code submissions against objective quality criteria. It checks compilation, test results, security vulnerabilities, test coverage, and requirement compliance — returning a structured PASS/PARTIAL/FAIL verdict.

## Installation

```bash
openclaw skills install clawjudge-verifier
```

## Quick Start

```bash
# Verify a GitHub repository
clawjudge-verifier verify -s https://github.com/example/project -r requirements.txt

# Verify local project
clawjudge-verifier verify -s ./my-project --verbose

# See example output
clawjudge-verifier example
```

## Usage

### CLI

```bash
clawjudge-verifier verify \
  --submission <path|url> \
  --requirements <file> \
  --language <auto|nodejs|python|solidity> \
  --coverage <threshold> \
  --output <file>
```

### Programmatic

```javascript
const { verify } = require('clawjudge-verifier');

const verdict = await verify({
  submission: 'https://github.com/user/repo',
  requirements: [
    'REST API with CRUD endpoints',
    'Authentication middleware',
    'Test coverage above 70%'
  ],
  bounty_type: 'code',
  language: 'auto'
});

console.log(verdict.verdict); // PASS, PARTIAL, or FAIL
console.log(verdict.score);   // 0-100
```

## Output Format

```json
{
  "verdict": "PASS",
  "score": 82,
  "checks": {
    "compilation": { "passed": true, "details": "..." },
    "tests": { "passed": true, "total": 12, "passing": 11, "failing": 1 },
    "coverage": { "percentage": 78, "threshold": 70, "passed": true },
    "security": { "vulnerabilities": 0, "warnings": 2 },
    "requirements": { "REST API...": true, "Auth...": true }
  },
  "reasoning": "Code compiles and passes 11/12 tests...",
  "recommendation": "All checks passed. Bounty approved."
}
```

## Supported Languages

| Language | Compilation | Tests | Lint | Security | Coverage |
|----------|-------------|-------|------|----------|----------|
| Node.js | ✅ npm/build | ✅ jest/mocha | ✅ eslint | ✅ npm audit | ✅ jest |
| Python | ✅ pip | ✅ pytest | ✅ pylint | ✅ pip-audit | ✅ pytest-cov |
| Solidity | ✅ hardhat | ✅ hardhat test | ✅ solhint | ✅ custom | ✅ hardhat-cov |

## Configuration

Environment variables:

```bash
CLAWJUDGE_TIMEOUT=180        # Total timeout in seconds
CLAWJUDGE_COVERAGE_MIN=70    # Coverage threshold %
CLAWJUDGE_VERBOSE=true       # Include full check output
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint
npm run lint
```

## Project Structure

```
src/
├── index.js           # Main entry point
├── cli.js             # CLI interface
├── verdict.js         # Verdict generator
├── evaluators/
│   ├── code.js        # Language detection
│   ├── data.js        # JSON/CSV validation
│   └── content.js     # Requirements matching
└── checks/
    ├── compile.js     # Build verification
    ├── tests.js       # Test runner
    ├── lint.js        # Linting
    ├── security.js    # Vulnerability scanning
    └── coverage.js    # Coverage reporting
```

## Roadmap

- [x] Node.js support
- [ ] Python support (v0.2.0)
- [ ] Solidity support (v0.3.0)
- [ ] Rust support (v0.4.0)
- [ ] REST API integration (Phase 2)

## License

MIT © SuitAndClaw
