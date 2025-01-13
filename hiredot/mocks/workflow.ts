import { Workflow } from "../@types/workflow";

export const workflow: Workflow = {
  id: "1",
  name: "Initial Application Form",
  description: "Initial application form for candidates",
  version: "1.0.0",
  trigger: "candidate_applied",
  enabled: true,
  steps: [
    {
      id: "initial_form",
      name: "Initial Application Form",
      type: "form",
      version: "1.0.0",
      conditions: [],
      metadata: {
        description: "Initial application form for candidates",
        tags: ["application", "initial-screening"],
        expectedDuration: 15,
      },
      nextSteps: {
        conditions: [
          {
            condition: {
              logic: "AND",
              conditions: [
                {
                  field: "experience",
                  operator: "greater_than_equal",
                  value: "5-10",
                },
                {
                  field: "expected_salary",
                  operator: "not_equals",
                  value: "$150k+",
                },
              ],
            },
            then: "interview_scheduling",
            priority: 1,
          },
          {
            condition: {
              logic: "OR",
              conditions: [
                {
                  field: "experience",
                  operator: "less_than",
                  value: "5-10",
                },
                {
                  field: "expected_salary",
                  operator: "equals",
                  value: "$150k+",
                },
              ],
            },
            then: "rejection_thank_you",
            priority: 2,
          },
        ],
      },
    },
    {
      id: "interview_scheduling",
      name: "Interview Slot Selection",
      type: "scheduler",
      version: "1.0.0",
      conditions: [],
      metadata: {
        description: "Interview scheduling step",
        tags: ["interview", "scheduling"],
        expectedDuration: 30,
      },
      nextSteps: {
        default: "recruiter_decision",
      },
    },
    {
      id: "recruiter_decision",
      name: "Recruiter Decision",
      type: "form",
      version: "1.0.0",
      conditions: [],
      metadata: {
        description: "Recruiter decision step",
        tags: ["decision", "evaluation"],
        expectedDuration: 30,
      },
      nextSteps: {
        conditions: [
          {
            condition: {
              logic: "AND",
              conditions: [
                {
                  field: "decision",
                  operator: "equals",
                  value: "Send Test Assignment",
                },
              ],
            },
            then: "test_assignment",
          },
          {
            condition: {
              logic: "AND",
              conditions: [
                {
                  field: "decision",
                  operator: "equals",
                  value: "Reject",
                },
              ],
            },
            then: "rejection_thank_you",
          },
        ],
      },
    },
    {
      id: "test_assignment",
      name: "Test Assignment",
      type: "action",
      version: "1.0.0",
      conditions: [],
      metadata: {
        description: "Test assignment step",
        tags: ["test", "assignment"],
        expectedDuration: 30,
      },
      nextSteps: {
        default: "notify_recruiter",
      },
    },
    {
      id: "notify_recruiter",
      name: "Notify Recruiter of Test Submission",
      type: "action",
      version: "1.0.0",
      conditions: [],
      metadata: {
        description: "Notify recruiter about test assignment submission",
        tags: ["notification", "test-review"],
        expectedDuration: 5,
      },
      nextSteps: {
        default: "test_review_decision",
      },
      onError: {
        action: {
          type: "send_notification",
          config: {
            type: "send_notification",
            config: {
              to: ["hr_manager"],
              subject: "Failed to Notify Recruiter",
              message:
                "Failed to notify recruiter about test submission for {{candidate.name}}",
            },
          },
        },
      },
    },
    {
      id: "test_review_decision",
      name: "Test Review Decision",
      type: "form",
      version: "1.0.0",
      conditions: [],
      metadata: {
        description: "Recruiter reviews test assignment",
        tags: ["review", "decision"],
        expectedDuration: 60,
      },
      nextSteps: {
        conditions: [
          {
            condition: {
              logic: "AND",
              conditions: [
                {
                  field: "decision",
                  operator: "equals",
                  value: "Approved",
                },
              ],
            },
            then: "security_check",
          },
          {
            condition: {
              logic: "AND",
              conditions: [
                {
                  field: "decision",
                  operator: "equals",
                  value: "Rejected",
                },
              ],
            },
            then: "rejection_thank_you",
          },
        ],
      },
    },
    {
      id: "security_check",
      name: "Security Background Check",
      type: "action",
      version: "1.0.0",
      conditions: [],
      metadata: {
        description: "Security background check step",
        tags: ["security", "background-check"],
        expectedDuration: 7200,
      },
      nextSteps: {
        default: "security_check_result",
      },
    },
    {
      id: "security_check_result",
      name: "Security Check Result",
      type: "form",
      version: "1.0.0",
      conditions: [],
      metadata: {
        description: "Security check result step",
        tags: ["security", "result"],
        expectedDuration: 30,
      },
      nextSteps: {
        conditions: [
          {
            condition: {
              logic: "AND",
              conditions: [
                {
                  field: "security_status",
                  operator: "equals",
                  value: "Approved",
                },
              ],
            },
            then: "prepare_offer",
          },
          {
            condition: {
              logic: "AND",
              conditions: [
                {
                  field: "security_status",
                  operator: "equals",
                  value: "Rejected",
                },
              ],
            },
            then: "rejection_thank_you",
          },
        ],
      },
    },
    {
      id: "prepare_offer",
      name: "Prepare Offer",
      type: "action",
      version: "1.0.0",
      conditions: [],
      metadata: {
        description: "Prepare offer step",
        tags: ["offer", "preparation"],
        expectedDuration: 30,
      },
      nextSteps: {
        default: "offer_approval",
      },
    },
    {
      id: "rejection_thank_you",
      name: "Rejection",
      type: "action",
      version: "1.0.0",
      conditions: [],
      metadata: {
        description: "Rejection step",
        tags: ["rejection"],
        expectedDuration: 30,
      },
      nextSteps: {
        default: "workflow_end",
      },
    },
    {
      id: "background_check",
      name: "Background Check",
      type: "action",
      version: "1.0.0",
      conditions: [],
      metadata: {
        description: "Background verification process",
        tags: ["verification", "security"],
        expectedDuration: 7200,
      },
      nextSteps: {
        conditions: [
          {
            condition: {
              logic: "AND",
              conditions: [
                {
                  field: "background_check.status",
                  operator: "equals",
                  value: "completed",
                },
                {
                  field: "background_check.results.overall",
                  operator: "equals",
                  value: "clear",
                },
              ],
            },
            then: "prepare_offer",
            priority: 1,
          },
        ],
        default: "manual_review",
      },
      onError: {
        action: {
          type: "send_notification",
          config: {
            type: "send_notification",
            config: {
              to: ["hr_manager"],
              subject: "Background Check Error",
              message:
                "Background check failed for {{candidate.name}}. Error: {{error.message}}",
            },
          },
        },
        nextStep: "manual_review",
      },
    },
  ],
  isActive: true,
  isDeleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  visualState: {
    zoom: 0.5,
    position: {
      x: 394.74635873220745,
      y: 83.06390390866981
    },
    nodePositions: {
      initial_form: { x: 20, y: 20 },
      interview_scheduling: { x: 210, y: 220 },
      recruiter_decision: { x: 210, y: 420 },
      test_assignment: { x: 400, y: 620 },
      notify_recruiter: { x: 400, y: 820 },
      test_review_decision: { x: 400, y: 1020 },
      security_check: { x: 590, y: 1220 },
      security_check_result: { x: 590, y: 1420 },
      prepare_offer: { x: 765, y: 1620 },
      rejection_thank_you: { x: 210, y: 1620 },
      background_check: { x: 920, y: 1420 }
    }
  }
};
