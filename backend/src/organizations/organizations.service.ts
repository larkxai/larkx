import { Injectable } from '@nestjs/common';
import { OrganizationDto } from './dto/organization.dto';

const DEMO_ORGANIZATION: OrganizationDto[] = [
  {
    id: 'org1',
    name: 'Acme Corp',
    teams: [
      {
        id: 'team1',
        name: 'Ahcub LLC',
        logoUrl: 'https://example.com/engineering.png',
      },
    ],
    currentPlan: {
      name: 'Enterprise',
      features: ['Unlimited Users', 'Advanced Analytics', 'Custom Workflows'],
    },
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-03-15').toISOString(),
  },
];

@Injectable()
export class OrganizationsService {
  private readonly organizations: OrganizationDto[] = DEMO_ORGANIZATION;

  getCurrent(): OrganizationDto {
    // In a real application, this would be determined by the authenticated user's context
    return this.organizations[0];
  }
}
