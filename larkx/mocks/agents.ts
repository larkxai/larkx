export const mockJobs: Job[] = [
  {
    id: 'job1',
    title: 'Software Engineer',
    agents: [
      {
        id: 'agent1',
        type: 'FormAgent',
        order: 1,
        config: {
          fields: [
            { name: 'fullName', label: 'Full Name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'experience', label: 'Years of Experience', type: 'number', required: true },
          ],
        },
      },
      {
        id: 'agent2',
        type: 'ReminderAgent',
        order: 2,
        isPassive: true,
        config: {
          message: 'Please complete your application',
          delay: '24h',
        },
      },
    ],
  },
  {
    id: 'job2',
    title: 'Product Manager',
    agents: [
      {
        id: 'agent3',
        type: 'FormAgent',
        order: 1,
        config: {
          fields: [
            { name: 'fullName', label: 'Full Name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'portfolio', label: 'Portfolio URL', type: 'url', required: true },
          ],
        },
      },
    ],
  },
];

export const mockCandidates: Candidate[] = [
  {
    id: 'candidate1',
    jobId: 'job1',
    formData: {
      fullName: 'John Doe',
      email: 'john@example.com',
      experience: '5',
    },
    completedAgents: ['agent1'],
    currentStage: 'form_submitted',
    createdAt: new Date('2024-03-15'),
  },
  {
    id: 'candidate2',
    jobId: 'job2',
    formData: {
      fullName: 'Jane Smith',
      email: 'jane@example.com',
      portfolio: 'https://janesmith.com',
    },
    completedAgents: ['agent3'],
    currentStage: 'form_submitted',
    createdAt: new Date('2024-03-16'),
  },
]; 