# 📄 Product Requirements Document (PRD)  
## Larkx — AI Release Control Center

This document defines **what we are building and why**.  
It focuses on **user value, scope, and behavior**, not implementation details.

---

## 1. Product Vision

### Core Vision
Larkx is a **single control center** for managing App Store & Google Play releases, designed for **non-technical founders**.

Instead of learning store rules, formats, and rejection workflows, users rely on an **AI Release Agent** that guides, validates, submits, and fixes releases automatically.

---

## 2. Problem Statement

Publishing mobile apps today is:
- Complex and slow
- Fragmented across iOS and Android
- Hard to understand when rejected
- Dependent on technical or design help

### Key Pain Points
- Store requirements are unclear and change frequently
- Rejection messages are vague and technical
- iOS and Android require separate workflows
- Asset preparation (screenshots, metadata) is time-consuming
- Versioning mistakes cause repeated rejections

For non-technical founders, this creates:
- Long delays
- High frustration
- Abandoned releases

---

## 3. Solution Overview

Larkx provides:
- One interface for iOS + Android releases
- An AI agent that:
  - explains what is missing
  - generates required assets
  - validates before submission
  - handles rejection → fix → resubmit loops

The user uploads a build.  
Larkx handles the rest.

---

## 4. Target Users

### Primary Users
- Non-technical founders
- No-code / low-code builders
- Indie hackers without mobile experience

### Secondary Users
- Small agencies shipping apps for clients
- Product managers validating app ideas

### Explicit Non-Users (Phase 1)
- Large enterprises
- Teams requiring SSO / SCIM
- Companies needing advanced CI/CD

---

## 5. Product Scope by Phase

---

## Phase 1 — MVP: Upload → Submit → Resubmit

### Goal
Enable users to submit `.aab` or `.ipa` files to app stores **with zero technical knowledge**.

Success = user reaches “Approved” without external help.

---

### 5.1 Core User Flow (Phase 1)

1. User creates an app
2. Connects App Store / Google Play credentials
3. Uploads build file
4. Larkx validates build & requirements
5. Larkx generates missing assets (optional)
6. User submits release
7. Larkx tracks status
8. If rejected:
   - explains why
   - suggests fixes
   - guides resubmission

---

### 5.2 Core Features

#### 🚨 Rejection Handling (Critical Feature)

- Plain-English explanation of rejection reasons
- AI-generated summary of:
  - what failed
  - why it failed
  - what to change
- Actionable fix checklist
- One-click guided resubmission

This is the **core differentiator** of Larkx.

---

#### 🎯 First-Time Setup & Onboarding

- Guided onboarding flow
- Step-by-step store connection wizard
- Inline explanations for required data
- Early validation before submission

Goal: users should never feel “stuck”.

---

#### 📱 Multi-App Management

- Unified dashboard of all apps
- Each app shows:
  - last submission status
  - current version
  - next required action
- Submission history per app

---

#### 📸 AI Content Generation

Optional but strongly encouraged:

- Screenshot generation for required device sizes
- Store descriptions (short + long)
- Keyword suggestions
- Privacy policy and support page drafts

User can:
- accept
- edit
- replace manually

AI assists, never blocks.

---

#### 🔄 Unified Store Management

- Single submission flow for iOS + Android
- Consistent versioning guidance
- Metadata parity checks between stores
- Platform-specific rules handled internally

---

#### 🛡 Pre-Release Validation

Before submission:
- Asset size & format checks
- Metadata completeness checks
- Common policy compliance checks
- Versioning conflict detection

Blocking issues are surfaced **before** store submission.

---

## 6. UX Principles (Product-Level)

- One task per screen
- Clear progress indicators
- Calm, non-alarming language
- Always show:
  - current status
  - next step
  - reason for blocking

AI guidance must feel **supportive**, not opaque.

---

## 7. Out of Scope (Phase 1)

Explicitly not included:
- App building or compilation
- In-app analytics
- Ads or monetization tools
- Enterprise SSO
- Kubernetes or multi-region infra

---

## 8. Phase 2 — Optimization Loop

### Goal
Help users **improve store performance**, not just submit apps.

Planned capabilities:
- A/B testing for:
  - titles
  - descriptions
  - screenshots
- Unified analytics view
- AI optimization suggestions
- Auto-promotion of winning variants

Phase 2 focuses on **growth after approval**.

---

## 9. Phase 3 — CI/CD Automation (Optional)

### Goal
Automate the entire pipeline from code to store.

Potential features:
- GitHub / GitLab integration
- Build automation
- Signing automation
- One-click deploy from source

Phase 3 is optional and **not required for product success**.

---

## 10. Success Metrics (Phase 1)

Primary:
- % of users who successfully submit an app
- % of rejected apps successfully resubmitted
- Time from upload → approval

Secondary:
- Reduction in resubmission cycles
- User-reported clarity of rejection explanations
- Retention across multiple releases

---

## 11. Product Positioning (One-Liner)

> **Larkx is an AI-powered control center that submits, fixes, and resubmits mobile apps to App Store and Google Play — so non-technical founders don’t have to.**

---

## 12. Guiding Principle

If a user needs to Google:
> “Why did Apple reject my app?”

Then Larkx has failed.

Everything required to succeed should already be explained inside the product.
