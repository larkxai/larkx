# 🚀 Larkx — AI Agent for Last-Mile App Deployment

Larkx is an AI-powered platform that helps no-code and low-code mobile app creators (e.g., FlutterFlow, Vibecoding) submit their exported `.aab` / `.ipa` files directly to the App Store and Google Play — with automatic metadata generation, screenshot validation, and full submission + rejection handling.

---

## 🧭 Vision

We’re building an agentic system that takes builder-made apps from “exported” to “live” — and beyond.

---

## 📦 Phase 1 — MVP: Upload, Submit, Resubmit

> 🎯 Goal: Help no-code users submit their `.aab` or `.ipa` files to app stores with zero technical knowledge.

### ✅ Core Features

- **Upload Build**
- **Store Connection**
- **AI Metadata Generation**
- **Screenshot Upload + Validation**
- **Submission Engine**
- **Rejection Handling**
- **Preflight Validation**
- **Versioned Metadata Model**

---

## 📈 Phase 2 — A/B Testing & Analytics Loop

> 🎯 Goal: Optimize store performance using data and AI — not just submit, but grow.

### ✅ Core Features

- **Store Analytics Pull**
- **A/B Testing Engine**
- **Performance Dashboard**
- **AI Optimization Suggestions**
- **Growth Automation**

---

## ⚙️ Phase 3 — Full CI/CD Integration (Optional)

> 🎯 Goal: Automate everything from code push → build → store submission.

### ✅ Planned Features

- **CI Build Pipelines**
- **Signing Automation**
- **GitHub/GitLab Integration**
- **One-Click Deployment from Source**

---

## 🧱 Technical Architecture (Phase 1)

```
User
 └── Web UI
       ├── Upload .aab/.ipa
       ├── Connect Store Accounts
       ├── Fill/Generate Metadata
       ├── Upload Screenshots
       └── Submit

API Server (NestJS)
 ├── Binary Parser (.aab/.ipa)
 ├── Metadata Generator (OpenAI)
 ├── Submission Orchestrator
 ├── Preflight Validator
 └── Store API Integrations
       ├── Google Play Developer API
       └── App Store Connect API

Storage
 ├── S3 (uploads: binaries, screenshots, icons)
 └── RDS/Postgres (apps, binaries, content versions, submission history)

Secrets
 └── AWS KMS or Vault (p8 files, Google service JSONs)

Queue/Workers (optional scale)
 └── Submission queue
```

---

## 📡 API Overview (Phase 1)

### 🔐 Auth
- JWT-based or Clerk/Auth0 tokens
- Scopes: user-level apps only

---

### 🧱 App Management

#### `POST /apps`
Create new app record

#### `GET /apps/:id`
Get app metadata

---

### 🔑 Store Credentials

#### `POST /apps/:id/credentials`
Upsert store credentials (Play + iOS)

---

### 📦 Build Upload

#### `POST /apps/:id/binaries`
Upload `.aab` or `.ipa` (presigned URL flow)

---

### 📝 Content Versions

#### `POST /apps/:id/content`
Create a metadata + asset snapshot

---

### 🚀 Submit

#### `POST /apps/:id/submissions`
Submit build + metadata to store

---

### 📊 Submission Status

#### `GET /apps/:id/submissions/:sid`
Status: `processing`, `in_review`, `approved`, `rejected`

---

### 🔁 Resubmit

#### `POST /apps/:id/submissions/:sid/resubmit`
Auto-bumps version if needed and re-pushes with new content

---

### 📜 History

#### `GET /apps/:id/history`
Timeline of binaries, content versions, and submissions

---

## 🛡 Security & Storage

- 🔒 Credentials: Encrypted using KMS or Vault
- 📁 Files: Stored on S3 with short-lived presigned URLs
- ✅ Preflight: Validates all assets/metadata before submission
- 📜 Audit logs: Every submission/edit is tracked by user

---

## 🛠️ Stack

| Layer       | Tech                                      |
|-------------|-------------------------------------------|
| Frontend    | Next.js + Tailwind + ShadCN               |
| Backend     | NestJS (Node.js)                          |
| File Storage| AWS S3                                    |
| Secrets     | AWS KMS or Vault                          |
| Store API   | Google Play Developer API, ASC API        |
| AI          | OpenAI (gpt-4o)                           |
| DB          | PostgreSQL (Prisma or TypeORM)            |

---

## 🔮 Roadmap Summary

| Phase | Focus                                        |
|-------|----------------------------------------------|
| 1️⃣   | Upload .aab/.ipa → Submit → Resubmit         |
| 2️⃣   | A/B test metadata/screenshots → Promote best |
| 3️⃣   | GitHub + CI Build + Auto Deploy              |

---

## 📫 Contact

Questions, collabs, or early access?  
Email: **artem.dudynskiy@gmail.com**  
Twitter/X: [@yourhandle](https://twitter.com/larkx)