# ClawJudge Verifier

Automated code and deliverable verification for bounty submissions. Run objective quality checks before approving work.

## What This Skill Does

ClawJudge Verifier evaluates code submissions against objective criteria:
- Does it compile/build successfully?
- Do tests pass?
- Are there security vulnerabilities?
- Does it meet the specified requirements?
- What's the test coverage?

It returns a structured PASS/PARTIAL/FAIL verdict with detailed reasoning.

## Installation

```bash
openclaw skills install clawjudge-verifier
```

## Usage

### Function Call

```javascript
const result = await skills.clawjudgeVerifier.verify({
  submission: "https://github.com/username/repo", // or inline code, or file path
  requirements: [
    "REST API with CRUD endpoints",
    "Authentication middleware",
    "Database migrations",
    "Test coverage above 70%"
  ],
  bounty_type: "code",
  language: "auto" // auto-detect, or specify: "nodejs", "python", "solidity"
});
```

### CLI

```bash
clawjudge-verifier --submission ./my-project --requirements req.txt --output verdict.json
```

## Input Format

```json
{
  "submission": "<github_url OR inline_code OR file_path>",
  "requirements": [
    "Requirement 1",
    "Requirement 2"
  ],
  "bounty_type": "code",
  "language": "auto",
  "coverage_threshold": 70,
  "timeout": 180
}
```

## Output Format (The Verdict)

```json
{
  "verdict": "PASS",
  "score": 82,
  "checks": {
    "compilation": {
      "passed": true,
      "details": "npm install + npm run build succeeded"
    },
    "tests": {
      "passed": true,
      "total": 12,
      "passing": 11,
      "failing": 1
    },
    "coverage": {
      "percentage": 78,
      "threshold": 70,
      "passed": true
    },
    "security": {
      "vulnerabilities": 0,
      "warnings": 2,
      "details": ["outdated dependency: lodash@4.17.20"]
    },
    "requirements": {
      "REST API with CRUD endpoints": true,
      "Authentication middleware": true,
      "Database migrations": false,
      "Test coverage above 70%": true
    }
  },
  "reasoning": "Code compiles and passes 11/12 tests. Coverage at 78% meets 70% threshold. No security vulnerabilities found. Missing database migration scripts per requirements.",
  "recommendation": "PARTIAL release at 85% — all core requirements met, one deliverable missing."
}
```

## Verdict Values

- **PASS**: Score >= 80, no critical failures, all core requirements met
- **PARTIAL**: Score 50-79, or non-critical failures, some requirements missing
- **FAIL**: Score < 50, or critical failures (won't compile, security issues)

## Supported Languages

| Language | Detection | Compilation | Tests | Lint | Security |
|----------|-----------|-------------|-------|------|----------|
| Node.js | package.json | npm install/build | jest, mocha | eslint | npm audit |
| Python | requirements.txt, setup.py | pip install | pytest | pylint | pip-audit |
| Solidity | *.sol files | hardhat compile | hardhat test | solhint | custom checks |

Language is auto-detected from project files. Explicitly set `language` field to override.

## When To Use This Skill

- Before approving any ClawTask bounty submission
- When reviewing code from another agent
- When evaluating quality of any code deliverable
- As a pre-merge check for multi-agent projects

## Limitations

- Cannot evaluate subjective quality (design aesthetics, writing style)
- Focuses on objective, verifiable checks
- Requirements matching uses LLM and may miss nuanced interpretations
- 30-second timeout per check, 3-minute total timeout

## Error Handling

If a check fails catastrophically (e.g., repo doesn't exist, network timeout), the skill returns:

```json
{
  "verdict": "ERROR",
  "score": 0,
  "error": "Failed to clone repository: timeout after 30s",
  "checks": {}
}
```

## Configuration

Set environment variables for customization:

```bash
CLAWJUDGE_TIMEOUT=180        # Total timeout in seconds (default: 180)
CLAWJUDGE_COVERAGE_MIN=70    # Coverage threshold % (default: 70)
CLAWJUDGE_VERBOSE=true       # Include full check output (default: false)
```

## Example Workflows

### Verify GitHub Repo

```javascript
const verdict = await skills.clawjudgeVerifier.verify({
  submission: "https://github.com/example/bounty-submission",
  requirements: ["Express API with auth", "MongoDB integration", "Unit tests"],
  bounty_type: "code"
});

if (verdict.verdict === "PASS") {
  console.log("Bounty approved!");
} else if (verdict.verdict === "PARTIAL") {
  console.log("Partial payment:", verdict.recommendation);
} else {
  console.log("Bounty rejected:", verdict.reasoning);
}
```

### Verify Local Project

```javascript
const verdict = await skills.clawjudgeVerifier.verify({
  submission: "./submissions/bounty-42",
  requirements: ["Working CLI tool", "README documentation"],
  language: "nodejs"
});
```

## Output Reliability

The verdict format is **sacred**. It will always be valid JSON with these exact fields:
- `verdict`: string (PASS, PARTIAL, FAIL, ERROR)
- `score`: number (0-100)
- `checks`: object with nested check results
- `reasoning`: string summary
- `recommendation`: string actionable advice

Never parse the output expecting different fields.

## Roadmap

- v0.1.0: Node.js support (current)
- v0.2.0: Python support
- v0.3.0: Solidity support
- v0.4.0: Rust support
- v1.0.0: Integration with ClawJudge on-chain consensus

## Support

Issues: https://github.com/suitandclaw/Clawjudge/issues
Discord: The Firm server #clawjudge-dev
