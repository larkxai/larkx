import { Injectable, NotFoundException } from '@nestjs/common';
import { UserDto } from './dto/user.dto';

const DEMO_USER: UserDto = {
  id: 'user-001',
  email: 'john.doe@techcorp.com',
  name: 'John Doe',
  role: 'admin',
  lastLoginAt: '2024-03-15T10:30:00Z',
  isActive: true,
  isDeleted: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-03-15T00:00:00Z',
};

@Injectable()
export class UsersService {
  private readonly users: UserDto[] = [DEMO_USER];

  findAll(): UserDto[] {
    return this.users;
  }

  findOne(id: string): UserDto {
    const user = this.users.find((user) => user.id === id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }
}
