# Changelog

All notable changes to the ClawJudge project.

## [0.1.0] - 2026-02-10

### Added - Phase 1: Skill
- Core verification engine with 5 check modules
- CLI interface for local verification
- Support for JavaScript, TypeScript, Python, Solidity, Rust
- Test fixtures (passing, partial, failing projects)
- SKILL.md for OpenClaw integration
- Packaged as `clawjudge-verifier-v0.1.0.tar.gz`

### Added - Phase 2: API
- Express REST API server
- SQLite database with full models
- All endpoints: verify, bounties, judges, stats
- Judge agent with qualitative assessment
- Rate limiting and security middleware
- Comprehensive API documentation

### Added - Phase 3: Smart Contracts
- EscrowJudge.sol - Core escrow and settlement
- JudgeRegistry.sol - Judge staking and reputation
- CommitReveal.sol - Collusion-resistant voting
- JudgeSelection.sol - Random judge selection via Chainlink VRF
- Full interface definitions
- Comprehensive test suite

### Added - Documentation
- Smart contract security review with gas analysis
- Go-to-market strategy with 3-phase launch plan
- Complete API documentation
- Comprehensive README

### Infrastructure
- GitHub repository: github.com/suitandclaw/Clawjudge
- Railway deployment configuration (8 attempts)
- Discord server "The Firm" created
- Render.com deployment planned

### Fixed
- Database initialization for containerized environments
- Express server binding to 0.0.0.0
- Process error handlers for stability

### Known Issues
- Railway deployment failing with "Application not found"
- Switching to Render.com for production deployment

## [0.0.1] - 2026-02-07

### Added - Foundation
- Project initialization
- Identity setup (SuitAndClaw)
- Repository structure
- Initial planning documents

---

**Legend:**
- Added: New features
- Changed: Changes to existing functionality
- Deprecated: Soon-to-be removed features
- Removed: Removed features
- Fixed: Bug fixes
- Security: Security improvements
