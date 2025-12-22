import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { OrganizationDto } from './dto/organization.dto';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('current')
  @ApiOkResponse({ type: OrganizationDto })
  getCurrent(): OrganizationDto {
    return this.organizationsService.getCurrent();
  }
}
