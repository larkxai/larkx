# 📡 Larkx.ai API (Phase 1)

This document outlines the **Phase 1 REST API contract** for Larkx.ai — the agent-powered last-mile submission service for builder-made mobile apps.

---

## ✅ Authentication

- Method: `Bearer` token (JWT)
- Scope: user-level apps only

---

## 📦 API Endpoints

### 🔹 1. Apps (Organization-scoped)

#### `POST /organizations/{orgId}/apps` — Create app
```json
{
  "name": "My App",
  "bundleId": "com.example.myapp",
  "packageName": "com.example.myapp"
}
```

#### `GET /organizations/{orgId}/apps/{appId}` — Get app  
#### `GET /organizations/{orgId}/apps` — List apps  
#### `PATCH /organizations/{orgId}/apps/{appId}` — Update app

---

### 🔹 2. Store Credentials (Organization-scoped)

#### `POST /organizations/{orgId}/apps/{appId}/credentials` — Upsert secrets

#### `GET /organizations/{orgId}/apps/{appId}/credentials` — Fetch credentials mask

```json
{
  "ios": {
    "issuerId": "abc",
    "keyId": "xyz",
    "p8": "-----BEGIN PRIVATE KEY-----\n..."
  },
  "android": {
    "serviceAccountJson": { ... }
  }
}
```

---

### 🔹 3. Binaries (.aab / .ipa) (Organization-scoped)

#### `POST /organizations/{orgId}/apps/{appId}/binaries` — Initiate presigned upload

```json
{
  "platform": "android",
  "versionName": "1.0.0",
  "versionCode": 1
}
```

#### `POST /organizations/{orgId}/apps/{appId}/binaries/{binaryId}/finalize` — Confirm upload

#### `GET /organizations/{orgId}/apps/{appId}/binaries` — List binaries for app
#### `GET /organizations/{orgId}/apps/{appId}/binaries/{binaryId}` — Get binary by ID

---

### 🔹 4. Content Versions (Organization-scoped)

#### `POST /organizations/{orgId}/apps/{appId}/content` — Submit store metadata & assets snapshot

#### `GET /organizations/{orgId}/apps/{appId}/content` — List content versions
#### `GET /organizations/{orgId}/apps/{appId}/content/{contentVersionId}` — Get content version by ID

```json
{
  "semver": "2025.09.11.1",
  "locales": {
    "en-US": {
      "title": "My App",
      "shortDescription": "One line summary..."
    }
  },
  "assets": {
    "icon": { "ios1024": "s3://...", "play512": "s3://..." },
    "featureGraphic": "s3://...",
    "screenshots": {
      "android": { "phone": ["s3://..."] }
    }
  },
  "compliance": {
    "privacyPolicyUrl": "https://...",
    "exportCompliance": true
  }
}
```

---

### 🔹 5. Preflight (Organization-scoped)

#### `POST /organizations/{orgId}/apps/{appId}/preflight`
```json
{
  "binaryId": "bin_001",
  "contentVersionId": "cnt_001",
  "platform": "android"
}
```

---

### 🔹 6. Submissions (Organization-scoped)

#### `POST /organizations/{orgId}/apps/{appId}/submissions`
```json
{
  "binaryId": "bin_001",
  "contentVersionId": "cnt_001",
  "platform": "android",
  "android": { "track": "internal" }
}
```

#### `POST /organizations/{orgId}/apps/{appId}/submissions/{id}/resubmit`

#### `GET /organizations/{orgId}/apps/{appId}/submissions` — List submissions for app
#### `GET /organizations/{orgId}/apps/{appId}/submissions/{id}` — Get submission by ID

---

### 🔹 7. History (Organization-scoped)

#### `GET /organizations/{orgId}/apps/{appId}/history` — Timeline of binary/content/submission events

---

### 🔹 8. Users

#### `GET /users` — List users
#### `GET /users/{id}` — Get user by ID

---

### 🔹 9. Organizations

#### `GET /organizations/current` — Get active organization for current user/session

---

## 🧱 TypeScript Models

All models use snake-free camelCase JSON.

### `App`
```ts
interface App {
  id: string; // app_*
  name: string;
  bundleId?: string;
  packageName?: string;
}
```

### `Binary`
```ts
interface Binary {
  id: string;
  platform: 'android' | 'ios';
  versionName: string;
  versionCode?: number;
  buildNumber?: number;
  uploadedAt?: string;
}
```

### `ContentVersion`
```ts
interface ContentVersion {
  id: string;
  semver: string;
  locales: Record<string, { title?: string; shortDescription?: string }>;
  assets: {
    icon?: { ios1024?: string; play512?: string };
    screenshots?: { ios?: any; android?: any };
  };
  compliance: { privacyPolicyUrl: string; exportCompliance: boolean };
}
```

### `Submission`
```ts
interface Submission {
  id: string;
  binaryId: string;
  contentVersionId: string;
  status: 'processing' | 'in_review' | 'approved' | 'rejected';
  history: { ts: string; event: string }[];
}
```

### `User`
```ts
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | string;
  lastLoginAt?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### `Organization`
```ts
interface Team {
  id: string;
  name: string;
  logoUrl?: string;
}

interface Organization {
  id: string;
  name: string;
  teams: Team[];
  currentPlan: { name: string; features: string[] };
  createdAt: string;
  updatedAt: string;
}
```

---

## 🧪 Swagger Setup (NestJS)

### Install
```bash
pnpm add @nestjs/swagger swagger-ui-express
```

### In `main.ts`
```ts
const config = new DocumentBuilder()
  .setTitle('Larkx.ai API')
  .setDescription('Last-mile publishing API')
  .setVersion('1.0.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('/docs', app, document);
```

### Decorate DTOs
```ts
export class CreateAppDto {
  @ApiProperty({ example: 'My App' })
  name: string;

  @ApiProperty({ example: 'com.example.myapp', required: false })
  bundleId?: string;
}
```

---

## 📫 Contact

Contact: `yourname@larkx.ai`  
Twitter/X: [@yourhandle](https://twitter.com/yourhandle)