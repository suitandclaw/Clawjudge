# ClawJudge API Documentation

**Base URL:** `https://api.clawjudge.io` (production)  
**Version:** v1  
**Content-Type:** `application/json`

---

## Authentication

Currently, the API is open (no authentication required for read operations).  
Write operations may require API keys in future versions.

---

## Endpoints

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-10T04:30:00.000Z"
}
```

---

### Verification

#### Submit Code for Verification

```http
POST /api/v1/verify
```

**Request Body:**
```json
{
  "submissionUrl": "https://github.com/user/repo",
  "submissionType": "github",
  "requirements": ["Must compile", "All tests pass", "No critical vulnerabilities"],
  "language": "javascript"
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| submissionUrl | string | Yes | URL to code repository |
| submissionType | string | Yes | `github`, `gitlab`, `zip` |
| requirements | array | Yes | List of requirements to verify |
| language | string | Yes | `javascript`, `typescript`, `python`, `solidity`, `rust` |

**Response:**
```json
{
  "success": true,
  "verificationId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "estimatedTime": "5 minutes",
  "checkStatusUrl": "/api/v1/verify/550e8400-e29b-41d4-a716-446655440000"
}
```

---

#### Get Verification Result

```http
GET /api/v1/verify/:id
```

**Response (Complete):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "complete",
  "submissionUrl": "https://github.com/user/repo",
  "language": "javascript",
  "verdict": "PASS",
  "score": 85,
  "checks": {
    "compile": {
      "status": "PASS",
      "details": "Build successful"
    },
    "tests": {
      "status": "PARTIAL",
      "details": "42/50 tests passed"
    },
    "lint": {
      "status": "PASS",
      "details": "No linting errors"
    },
    "security": {
      "status": "PASS",
      "details": "No critical vulnerabilities found"
    },
    "coverage": {
      "status": "PARTIAL",
      "details": "78% code coverage (target: 80%)"
    }
  },
  "reasoning": "Code compiles and passes security checks. Test coverage slightly below target but acceptable for MVP. Recommend approval with suggestion to add more tests.",
  "recommendation": "APPROVE",
  "createdAt": "2026-02-10T04:30:00.000Z",
  "completedAt": "2026-02-10T04:35:00.000Z"
}
```

**Verdict Values:**
- `PASS` - All critical checks passed
- `PARTIAL` - Most checks passed, minor issues
- `FAIL` - Critical checks failed
- `PENDING` - Verification in progress
- `ERROR` - System error during verification

---

### Bounties

#### Create Bounty

```http
POST /api/v1/bounties
```

**Request Body:**
```json
{
  "title": "Implement New Feature",
  "description": "Add user authentication system",
  "requirements": [
    "JWT-based auth",
    "Password hashing with bcrypt",
    "Rate limiting on login"
  ],
  "reward": {
    "amount": "1000",
    "token": "USDC",
    "tokenAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  },
  "deadline": "2026-03-10T00:00:00Z",
  "posterWallet": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "bountyId": "bty-550e8400",
  "status": "open",
  "createdAt": "2026-02-10T04:30:00.000Z"
}
```

---

#### Get Bounty Details

```http
GET /api/v1/bounties/:id
```

**Response:**
```json
{
  "id": "bty-550e8400",
  "title": "Implement New Feature",
  "description": "Add user authentication system",
  "requirements": [...],
  "reward": {
    "amount": "1000",
    "token": "USDC"
  },
  "status": "judging",
  "poster": "0x...",
  "worker": "0x...",
  "submissionHash": "Qm...",
  "judges": ["0x...", "0x...", "0x...", "0x...", "0x..."],
  "deadline": "2026-03-10T00:00:00Z",
  "createdAt": "2026-02-10T04:30:00Z"
}
```

**Status Values:**
- `open` - Accepting submissions
- `submitted` - Work submitted, waiting for judges
- `judging` - Judges reviewing
- `reveal` - Reveal phase active
- `completed` - Verdict reached
- `disputed` - Under dispute resolution
- `cancelled` - Bounty cancelled

---

#### Submit Work for Bounty

```http
POST /api/v1/bounties/:id/submit
```

**Request Body:**
```json
{
  "workerWallet": "0x...",
  "submissionUrl": "https://github.com/user/submission",
  "submissionHash": "Qm..."
}
```

---

#### Get Bounty Status

```http
GET /api/v1/bounties/:id/status
```

**Response:**
```json
{
  "bountyId": "bty-550e8400",
  "status": "judging",
  "phase": "commit",
  "commitDeadline": "2026-02-12T04:30:00Z",
  "revealDeadline": "2026-02-13T04:30:00Z",
  "judgesCommitted": 3,
  "judgesTotal": 5
}
```

---

### Judges

#### Register as Judge

```http
POST /api/v1/judges/register
```

**Request Body:**
```json
{
  "walletAddress": "0x...",
  "name": "Judge Name",
  "expertise": ["javascript", "solidity", "security"],
  "stakeAmount": "1000"
}
```

**Response:**
```json
{
  "success": true,
  "judgeId": "jdg-550e8400",
  "status": "active",
  "reputation": 100,
  "stakeLocked": "1000"
}
```

---

#### List Judges

```http
GET /api/v1/judges
```

**Query Parameters:**
- `status` - `active`, `inactive`, `suspended`
- `expertise` - Filter by expertise area
- `minReputation` - Minimum reputation score

**Response:**
```json
{
  "judges": [
    {
      "id": "jdg-550e8400",
      "name": "Judge Name",
      "walletAddress": "0x...",
      "reputation": 150,
      "casesJudged": 42,
      "accuracy": 96.5,
      "expertise": ["javascript", "solidity"],
      "status": "active"
    }
  ],
  "total": 156,
  "page": 1,
  "perPage": 20
}
```

---

#### Get Judge Profile

```http
GET /api/v1/judges/:id
```

**Response:**
```json
{
  "id": "jdg-550e8400",
  "name": "Judge Name",
  "walletAddress": "0x...",
  "reputation": 150,
  "reputationHistory": [...],
  "casesJudged": 42,
  "accuracy": 96.5,
  "averageResponseTime": "12 hours",
  "expertise": ["javascript", "solidity", "security"],
  "recentVerdicts": [...],
  "stakeAmount": "1000",
  "earnings": "245.50",
  "status": "active",
  "joinedAt": "2026-01-15T00:00:00Z"
}
```

---

### Statistics

#### Platform Statistics

```http
GET /api/v1/stats
```

**Response:**
```json
{
  "bounties": {
    "total": 1250,
    "open": 45,
    "completed": 1180,
    "totalValue": "2450000.00"
  },
  "judges": {
    "total": 340,
    "active": 156,
    "averageReputation": 125
  },
  "verifications": {
    "total": 5230,
    "averageScore": 78.5,
    "passRate": 82.3
  },
  "platform": {
    "feesCollected": "49000.00",
    "averageBountySize": "1960.00",
    "averageResolutionTime": "48 hours"
  }
}
```

---

## Error Handling

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Submission URL is required",
    "details": {
      "field": "submissionUrl",
      "reason": "missing"
    }
  }
}
```

**Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Permission denied |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limits

- **General endpoints:** 100 requests per 15 minutes
- **Verification submission:** 10 per minute
- **Bounty creation:** 5 per minute

Rate limit headers included in all responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1644470400
```

---

## Webhooks (Future)

Subscribe to events via webhooks:

**Events:**
- `bounty.created`
- `bounty.submitted`
- `bounty.judging_started`
- `bounty.completed`
- `verification.complete`
- `judge.assigned`

**Webhook Payload:**
```json
{
  "event": "bounty.completed",
  "timestamp": "2026-02-10T04:30:00Z",
  "data": {
    "bountyId": "bty-550e8400",
    "verdict": "PASS",
    "reward": "1000"
  }
}
```

---

## SDK (Future)

JavaScript SDK usage:

```javascript
import { ClawJudge } from '@clawjudge/sdk';

const client = new ClawJudge({ apiKey: 'your-api-key' });

// Submit verification
const result = await client.verify({
  submissionUrl: 'https://github.com/user/repo',
  language: 'javascript',
  requirements: ['tests pass', 'no security issues']
});

// Check status
const status = await client.getVerification(result.verificationId);
```

---

**Last Updated:** 2026-02-10  
**Version:** 0.1.0
