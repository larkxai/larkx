import { ApiProperty } from '@nestjs/swagger';

export class TeamDto {
  @ApiProperty({ example: 'team1' })
  id: string;

  @ApiProperty({ example: 'Engineering' })
  name: string;

  @ApiProperty({ example: 'https://example.com/logo.png', required: false })
  logoUrl?: string;
}

export class OrganizationDto {
  @ApiProperty({ example: 'org1' })
  id: string;

  @ApiProperty({ example: 'Acme Corp' })
  name: string;

  @ApiProperty({ type: TeamDto, isArray: true })
  teams: TeamDto[];

  @ApiProperty({
    example: { name: 'Pro', features: ['Unlimited Users', 'Analytics'] },
  })
  currentPlan: {
    name: string;
    features: string[];
  };

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-03-15T00:00:00Z' })
  updatedAt: string;
}
