import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserDto } from './dto/user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOkResponse({ type: UserDto, isArray: true })
  findAll(): UserDto[] {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  findOne(@Param('id') id: string): UserDto {
    return this.usersService.findOne(id);
  }
}
