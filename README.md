# 🚀 Larkx — Single Control Center for App Store Releases

Larkx is the one window that manages App Store & Google Play releases for non-technical founders. Upload your build file, and our AI agent handles everything else — from generating screenshots and metadata to handling rejections and keeping your releases perfectly synchronized.

---

## 🧭 Vision

**Core Vision:** A single control center (one window) for managing app releases across Android and iOS, focused on non-technical founders and no-code developers.

**The Problem:** Publishing to App Store and Google Play is painful and slow, especially when you don't have technical skills, designers, or time to handle rejections and multiple store management.

**The Solution:** An AI Agent that guides you through what's missing, builds and validates everything automatically, generates store assets using AI, performs pre-release checks, and keeps Android and iOS releases synchronized — all from one place.

---

## 📦 Phase 1 — MVP: Upload, Submit, Resubmit

> 🎯 Goal: Help non-technical founders submit their `.aab` or `.ipa` files to app stores with zero technical knowledge.

### ✅ Core Features

#### 🚨 **Rejection Handling** (Most Critical)
- **Plain English explanations** of rejection reasons
- **One-click auto-fix** for common issues
- **Guided resubmission** with version bumps

#### 🎯 **First-Time Setup**
- **Guided onboarding** with AI explanations
- **Step-by-step wizard** for store connections
- **Smart validation** to catch issues early

#### 📱 **Multiple Apps Management**
- **Unified dashboard** for all your apps
- **Bulk operations** across multiple releases
- **Release tracking** and status monitoring

#### 📸 **AI Content Generation**
- **Screenshot generation** for all required devices
- **Store descriptions** optimized for discovery
- **Privacy policies** created automatically
- **Metadata optimization** with keyword research

#### 🔄 **Unified Store Management**
- **Single interface** for both App Store and Google Play
- **Synchronized releases** across platforms
- **Consistent versioning** and metadata

#### 🛡️ **Pre-Release Validation**
- **Compliance checking** before submission
- **Asset validation** and auto-resizing
- **Policy compliance** verification

---

## 📈 Phase 2 — A/B Testing & Analytics Loop

> 🎯 Goal: Optimize store performance using data and AI — not just submit, but grow.

### ✅ Planned Features

- **Variant Testing** for titles and screenshots
- **Store Analytics Integration** from both platforms
- **Performance Dashboard** with unified metrics
- **AI Optimization Suggestions** based on data
- **Auto-Promote Winners** of A/B tests

---

## ⚙️ Phase 3 — Full CI/CD Integration (Optional)

> 🎯 Goal: Automate everything from code push → build → store submission.

### ✅ Planned Features

- **Code → Build → Submit** automation
- **Signing Automation** for certificates
- **GitHub/GitLab Integration** with webhooks
- **One-Click Deployment** from source code

---

## 🧱 Technical Architecture (Phase 1)

```
Non-Technical Founder
 └── Single Control Center (Web UI)
       ├── Upload Build File
       ├── AI-Guided Setup
       ├── AI Content Generation
       ├── Pre-Release Validation
       └── Submit to Both Stores

AI Agent (NestJS)
 ├── Build File Parser (.aab/.ipa)
 ├── Content Generator (OpenAI)
 ├── Screenshot Generator (AI)
 ├── Rejection Handler (AI)
 ├── Submission Orchestrator
 └── Store API Integrations
       ├── Google Play Developer API
       └── App Store Connect API

Storage
 ├── S3 (builds, screenshots, generated assets)
 └── PostgreSQL (apps, releases, submission history)

Security
 └── Encrypted Storage (store credentials, certificates)
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

## 🎨 Design System

Larkx follows a modern, professional design system built on top of **shadcn/ui** components with a custom dark theme optimized for developer tools and SaaS applications.

### 🎯 Design Principles

- **Professional & Trustworthy**: Clean, minimal interface that builds confidence for app store submissions
- **Accessibility First**: High contrast ratios, keyboard navigation, and screen reader support
- **Developer-Focused**: Dark theme by default with syntax highlighting and technical aesthetics
- **Consistent & Scalable**: Component-based architecture with design tokens

### 🌈 Color Palette

#### **Primary Colors**
- **Primary**: `#6366f1` (Indigo) - Main CTA buttons, highlights, and brand elements
- **Secondary**: `#3b82f6` (Blue) - Supporting elements and secondary actions
- **Accent**: `#1e293b` (Dark Slate) - Borders, dividers, and subtle accents

#### **Background System**
- **Dark Mode Default**: `slate-950` to `slate-900` gradient backgrounds
- **Card Surfaces**: Semi-transparent `slate-900/60` with backdrop blur
- **Borders**: `white/10` opacity for subtle separation

#### **Text Hierarchy**
- **Primary Text**: `slate-100` (High contrast white)
- **Secondary Text**: `slate-300` (Medium contrast)
- **Muted Text**: `slate-400` (Lower contrast for descriptions)

### 🧩 Component Library

Built on **shadcn/ui** with custom styling:

#### **Core Components**
- **Buttons**: Multiple variants (primary, secondary, ghost, outline)
- **Cards**: Elevated surfaces with subtle borders and backdrop blur
- **Badges**: Status indicators and feature highlights
- **Inputs**: Form controls with focus states and validation
- **Navigation**: Sticky header with backdrop blur and clean typography

#### **Layout Patterns**
- **Grid System**: Responsive 12-column grid with consistent spacing
- **Container**: Max-width containers with responsive padding
- **Spacing**: 4px base unit with consistent scale (4, 8, 12, 16, 24, 32px)

### 🎭 Visual Elements

#### **Typography**
- **Font Stack**: System fonts (Arial, Helvetica, sans-serif) for performance
- **Headings**: Bold, high-contrast with proper hierarchy
- **Body Text**: Optimized line-height and letter-spacing for readability

#### **Icons**
- **Icon Library**: Lucide React for consistent, scalable icons
- **Usage**: Functional icons that enhance UX (upload, store, rocket, etc.)
- **Sizing**: Consistent 16px, 20px, 24px sizes based on context

#### **Effects**
- **Backdrop Blur**: Subtle blur effects for overlays and navigation
- **Gradients**: Smooth color transitions for backgrounds and buttons
- **Shadows**: Layered shadow system for depth and hierarchy

### 📱 Responsive Design

- **Mobile-First**: Optimized for mobile devices with touch-friendly interactions
- **Breakpoints**: 
  - Mobile: `< 768px`
  - Tablet: `768px - 1024px`
  - Desktop: `> 1024px`
- **Touch Targets**: Minimum 44px for interactive elements

### 🎨 Brand Identity

#### **Logo & Branding**
- **Logo**: Gradient icon with sparkles symbol (indigo to blue)
- **Brand Colors**: Indigo (`#6366f1`) and Blue (`#3b82f6`) gradients
- **Typography**: Clean, modern sans-serif with tight letter spacing

#### **Voice & Tone**
- **Professional**: Clear, concise copy that builds trust
- **Helpful**: AI-focused messaging that emphasizes automation
- **Confident**: Bold claims backed by clear value propositions

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
| 1️⃣   | Single Control Center → AI Handles Everything |
| 2️⃣   | A/B Testing → Auto-Optimize Store Performance |
| 3️⃣   | Code → Build → Deploy (Optional CI/CD)       |

---

## 📫 Contact

Questions, collabs, or early access?  
Email: **artem.dudynskiy@gmail.com**  
Twitter/X: [@yourhandle](https://twitter.com/larkx)


