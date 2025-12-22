import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ example: 'user-001' })
  id: string;

  @ApiProperty({ example: 'john.doe@acme.com' })
  email: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: 'admin', enum: ['admin', 'user'] })
  role: string;

  @ApiProperty({ example: '2024-03-15T10:30:00Z', required: false })
  lastLoginAt: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: false })
  isDeleted: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-03-15T00:00:00Z' })
  updatedAt: string;
}
