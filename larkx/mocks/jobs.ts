export const mockJobs = [
  {
    id: "job-1",
    title: "Frontend Developer",
    agents: [
      { id: "a1", type: "FormAgent", order: 1, config: { fields: [
        { name: "fullName", label: "Full Name", type: "text", required: true },
        { name: "hasLicense", label: "Do you have a driver's license?", type: "boolean" }
      ]}},
      { id: "a2", type: "ScreeningAgent", order: 2, config: { minExperience: 3 } },
      { id: "a3", type: "ReminderAgent", order: 3, config: { delayHours: 48 }, passive: true }
    ]
  }
]; 