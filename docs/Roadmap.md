# 🛣 Product Roadmap — Larkx

This roadmap describes **what Larkx will become over time**, not a delivery schedule.  
Each phase is designed to unlock a **new level of user value**, not just more features.

---

## Phase 1 — AI Release Control Center (MVP)

### Goal
Enable non-technical founders to **successfully submit and resubmit mobile apps**
to App Store and Google Play **without external help**.

Success is defined by:
> A user reaching “Approved” status using only Larkx.

---

### Core Capabilities

#### Release Submission
- Upload `.aab` / `.ipa` build files
- Parse and validate build metadata
- Support both iOS and Android in a single flow

#### AI-Guided Validation
- Detect missing or invalid store requirements
- Surface blocking issues before submission
- Explain problems in plain language

#### Asset & Metadata Support
- Screenshot generation for required device sizes
- Store metadata generation (title, description, keywords)
- Privacy policy and support page drafts

#### Rejection Handling (Key Differentiator)
- Plain-English explanation of rejection messages
- AI-generated action items
- Guided resubmission flow
- Automatic version bump guidance

#### Unified Dashboard
- Multi-app support
- Submission status tracking
- Release history timeline
- Clear “next step” indicators

---

### Out of Scope (Phase 1)
- App compilation or build pipelines
- In-app analytics
- Ads or monetization tooling
- Enterprise auth (SSO / SCIM)
- Multi-region or Kubernetes infrastructure

---

### Phase 1 Exit Criteria
- Users can submit apps without technical help
- Majority of rejected apps are successfully resubmitted
- Rejection reasons are understood without Googling
- End-to-end flow works for both iOS and Android

---

## Phase 2 — Optimization & Growth Loop

### Goal
Help users **improve store performance after approval**, not just ship once.

This phase shifts Larkx from a *submission tool* to a *growth tool*.

---

### Core Capabilities

#### Store Performance Insights
- Unified analytics view across iOS and Android
- Track impressions, conversion rate, installs
- Compare performance across versions

#### A/B Testing
- Variant testing for:
  - App title
  - Description
  - Screenshots
- Store-native experimentation where available
- Version-aware experiments

#### AI Optimization Loop
- Analyze experiment results
- Generate improvement suggestions
- Recommend winning variants
- Auto-promote high-performing assets

---

### Phase 2 Exit Criteria
- Users actively iterate on store assets
- Measurable improvement in conversion rates
- AI recommendations are trusted and acted upon

---

## Phase 3 — CI/CD Automation (Optional)

### Goal
Provide full automation from **code → build → store submission**.

This phase is **optional** and only justified if users demand it.

---

### Core Capabilities

#### Source Control Integration
- GitHub / GitLab webhooks
- Trigger builds from commits or tags

#### Build & Signing Automation
- iOS & Android build pipelines
- Certificate and signing key management
- Version bump automation

#### One-Click Deployment
- Build, validate, and submit automatically
- Rollback-friendly release flow

---

### Phase 3 Guardrails
- Only implemented if:
  - Users explicitly request it
  - Maintenance cost is justified
- Must not complicate Phase 1 core UX

---

## Explicit Non-Goals

These are intentionally postponed or avoided:

- Kubernetes before clear scaling needs
- Enterprise SSO in early stages
- Generic DevOps tooling
- Becoming a full mobile CI platform

---

## Strategic Principle

> Larkx should solve **release pain first**,  
> **growth second**,  
> and **automation last**.

Anything that distracts from that order is deprioritized.
