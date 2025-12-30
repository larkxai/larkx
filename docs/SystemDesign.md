# 🧱 System Design — Larkx

## Deployment
- Single VPS
- Docker Compose
- Fully self-managed
- No Kubernetes (by design)

### Compose Services (recommended)
- `web` (Next.js)
- `api` (NestJS)
- `db` (PostgreSQL)
- `worker` (optional background jobs: submissions, polling, generation)
- `storage` (local volume or S3-compatible later)

---

## Architecture
Browser → Next.js → NextAuth → NestJS API

### Runtime Responsibilities
- **Next.js**
  - UI + server actions (optional)
  - NextAuth session management
  - calls NestJS with user session token
- **NestJS API**
  - app/release domain logic
  - validation + orchestration
  - store integrations
  - AI generation triggers
- **Worker (optional but recommended)**
  - long-running jobs (upload processing, parsing, screenshot generation, submission polling)
  - retries/backoff

---

## Core Services

### AI Agent
- Content generation (descriptions, keywords, privacy/support drafts)
- Rejection explanation (plain English + recommended fix plan)
- Autofix suggestions (where safe)

### Validation Engine
- Binary parsing (package/bundle id, version, build number, min sdk, etc.)
- Asset checks (sizes, aspect ratios, formats)
- Store preflight rules (baseline compliance checks)

### Submission Orchestrator
- Keeps iOS/Android release in sync
- Version bumping rules
- Submission lifecycle tracking
- Rejection → fix → resubmit loop

### Store Integrations
- Google Play Developer API
- App Store Connect API (ASC)

---

## Storage

### PostgreSQL (core tables)
- `users`
- `apps`
- `store_credentials`
- `binaries`
- `content_versions`
- `submissions`
- `submission_events` (timeline / history)
- `audit_logs`

### File Storage
- Local or attached volume (Phase 1)
  - builds: `.aab` / `.ipa`
  - generated screenshots
  - uploaded screenshots
  - store metadata exports (optional)
- Keep storage path abstracted so you can swap to S3-compatible later.

---

## Authentication
- NextAuth.js (OAuth / Email providers)

### Authorization Rules
- A user can access only:
  - apps they own
  - apps they are a member of (if/when teams added)
- All endpoints are **app-scoped**.

---

# 📡 API (Phase 1) — Detailed Contract

## Conventions

### Base URL
`/api/v1`

### Headers
- `Authorization: Bearer <token>` (if using direct API auth)
- `Content-Type: application/json`

### Standard Error Shape
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable summary",
    "details": { "field": "reason" }
  }
}
```

### Status Codes
- `200 OK` read/update success
- `201 Created` new resource created
- `202 Accepted` async job accepted
- `400 Bad Request` invalid payload
- `401 Unauthorized` missing/invalid auth
- `403 Forbidden` no access to resource
- `404 Not Found` unknown resource id
- `409 Conflict` state conflict (e.g., version already exists)
- `422 Unprocessable Entity` validation fails (preflight rules)
- `429 Too Many Requests` rate limited
- `500` / `502` upstream store/API failures

### Pagination
`?limit=50&cursor=<opaque>`
```json
{ "items": [], "nextCursor": "..." }
```

### Idempotency (recommended for submissions)
`Idempotency-Key: <uuid>`

---

## Data Models (high-level)

### App
```json
{
  "id": "app_123",
  "name": "My App",
  "platforms": ["ios", "android"],
  "bundleId": "com.company.myapp",
  "createdAt": "2025-12-30T10:00:00Z",
  "updatedAt": "2025-12-30T10:00:00Z"
}
```

### Store Credentials
```json
{
  "hasGooglePlay": true,
  "hasAppStoreConnect": true,
  "updatedAt": "2025-12-30T10:00:00Z"
}
```

### Binary
```json
{
  "id": "bin_123",
  "appId": "app_123",
  "platform": "android",
  "fileType": "aab",
  "versionName": "1.2.0",
  "buildNumber": 120,
  "sha256": "....",
  "storagePath": "binaries/app_123/bin_123.aab",
  "status": "uploaded",
  "createdAt": "2025-12-30T10:00:00Z"
}
```

### Content Version
```json
{
  "id": "cnt_123",
  "appId": "app_123",
  "platform": "ios",
  "locale": "en-US",
  "title": "Larkx",
  "subtitle": "Release control center",
  "description": "...",
  "keywords": ["release", "app store"],
  "privacyPolicyUrl": "https://...",
  "supportUrl": "https://...",
  "screenshots": [
    { "device": "iphone_6_5", "path": "assets/..." }
  ],
  "createdAt": "2025-12-30T10:00:00Z"
}
```

### Submission
```json
{
  "id": "sub_123",
  "appId": "app_123",
  "platforms": ["ios", "android"],
  "binaryIds": { "ios": "bin_9", "android": "bin_2" },
  "contentVersionIds": { "ios": "cnt_9", "android": "cnt_2" },
  "status": "processing",
  "storeStatus": {
    "ios": { "state": "in_review", "lastCheckedAt": "..." },
    "android": { "state": "processing", "lastCheckedAt": "..." }
  },
  "createdAt": "2025-12-30T10:00:00Z"
}
```

Internal statuses:
- `processing`
- `in_review`
- `approved`
- `rejected`

---

# Endpoints

## Create App
### `POST /apps`
**Request**
```json
{
  "name": "My App",
  "platforms": ["ios", "android"],
  "bundleId": "com.company.myapp"
}
```
**Response (201)**
```json
{ "app": { "id": "app_123", "name": "My App", "platforms": ["ios","android"], "bundleId": "com.company.myapp" } }
```

---

## Get App
### `GET /apps/:id`
**Response (200)**
```json
{
  "app": {
    "id": "app_123",
    "name": "My App",
    "platforms": ["ios", "android"],
    "bundleId": "com.company.myapp",
    "credentials": { "hasGooglePlay": true, "hasAppStoreConnect": false },
    "latestSubmission": { "id": "sub_123", "status": "in_review" }
  }
}
```

---

## Upsert Store Credentials
### `POST /apps/:id/credentials`
**Request**
```json
{
  "googlePlay": {
    "serviceAccountJson": "{...}",
    "packageName": "com.company.myapp"
  },
  "appStoreConnect": {
    "issuerId": "xxxxx",
    "keyId": "ABCD1234",
    "privateKeyPem": "-----BEGIN PRIVATE KEY-----..."
  }
}
```
**Response (200)**
```json
{
  "credentials": {
    "hasGooglePlay": true,
    "hasAppStoreConnect": true
  }
}
```

---

## Build Upload (2-step flow)

### `POST /apps/:id/binaries`
**Request**
```json
{
  "platform": "android",
  "fileType": "aab",
  "fileName": "app-release.aab",
  "fileSize": 12345678,
  "sha256": "optional-but-recommended"
}
```
**Response (201)**
```json
{
  "binary": { "id": "bin_123", "status": "awaiting_upload" },
  "upload": {
    "method": "PUT",
    "url": "https://<upload-url-or-local-signed-endpoint>",
    "headers": { "Content-Type": "application/octet-stream" },
    "expiresInSeconds": 900
  }
}
```

### `POST /apps/:id/binaries/:binaryId/complete`
Marks upload complete and triggers parsing/validation.
**Response (202)**
```json
{ "binary": { "id": "bin_123", "status": "processing" } }
```

### `GET /apps/:id/binaries/:binaryId`
**Response (200)**
```json
{
  "binary": {
    "id": "bin_123",
    "platform": "android",
    "fileType": "aab",
    "status": "ready",
    "versionName": "1.2.0",
    "buildNumber": 120
  },
  "preflight": {
    "ok": true,
    "errors": [],
    "warnings": [
      { "code": "MISSING_64BIT", "message": "64-bit support check recommended" }
    ]
  }
}
```

---

## Content Versions
### `POST /apps/:id/content`
**Request**
```json
{
  "platform": "ios",
  "locale": "en-US",
  "title": "Larkx",
  "subtitle": "Single control center for releases",
  "description": "Long description...",
  "keywords": ["app store", "release", "submit"],
  "privacyPolicyUrl": "https://example.com/privacy",
  "supportUrl": "https://example.com/support",
  "screenshots": [
    { "device": "iphone_6_5", "path": "uploads/tmp/shot1.png" }
  ]
}
```
**Response (201)**
```json
{ "contentVersion": { "id": "cnt_123", "platform": "ios", "locale": "en-US" } }
```

---

## Submit
### `POST /apps/:id/submissions`
**Request**
```json
{
  "platforms": ["ios", "android"],
  "binaryIds": { "ios": "bin_ios_1", "android": "bin_and_1" },
  "contentVersionIds": { "ios": "cnt_ios_1", "android": "cnt_and_1" },
  "release": { "track": "production", "phasedRelease": false }
}
```
**Response (202)**
```json
{ "submission": { "id": "sub_123", "status": "processing" } }
```

---

## Submission Status
### `GET /apps/:id/submissions/:sid`
**Response (200)**
```json
{
  "submission": {
    "id": "sub_123",
    "status": "rejected",
    "storeStatus": {
      "ios": {
        "state": "rejected",
        "rejection": {
          "raw": "Store message...",
          "aiSummary": "Apple rejected because ...",
          "actionItems": [
            { "type": "metadata", "message": "Update privacy policy URL" }
          ]
        }
      },
      "android": { "state": "approved" }
    }
  }
}
```

---

## Resubmit
### `POST /apps/:id/submissions/:sid/resubmit`
**Request**
```json
{
  "platforms": ["ios"],
  "changes": {
    "contentVersionId": "cnt_ios_2",
    "binaryId": "bin_ios_2"
  },
  "autoVersionBump": true
}
```
**Response (202)**
```json
{ "submission": { "id": "sub_124", "status": "processing" } }
```

---

## History / Timeline
### `GET /apps/:id/history?limit=50&cursor=...`
**Response (200)**
```json
{
  "items": [
    { "type": "binary_uploaded", "id": "bin_1", "createdAt": "..." },
    { "type": "content_created", "id": "cnt_1", "createdAt": "..." },
    { "type": "submission_created", "id": "sub_1", "createdAt": "..." },
    { "type": "store_event", "platform": "ios", "message": "In review", "createdAt": "..." }
  ],
  "nextCursor": null
}
```

---

## Security Notes

### Secrets Handling
- Encrypt store credentials at rest
- Never log raw credentials
- Redact secrets in error payloads

### File Upload Safety
- Restrict allowed file types and max sizes
- Verify checksum if provided
- Parse in a sandboxed worker

### Audit Logging
Record:
- credential changes
- submissions/resubmissions
- diff summaries
- timestamps + request ids

---

## Observability (recommended)
- Structured logs with requestId
- Job state machine logs (queued/running/succeeded/failed)
- Store API rate limit + error dashboards
