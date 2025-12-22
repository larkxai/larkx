import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppsService } from './apps.service';
import { App, CreateAppRequest, CreateAppResponse } from '../typing';

@ApiTags('Apps')
@ApiBearerAuth()
@Controller('organizations/:orgId/apps')
export class AppsController {
  constructor(private readonly appsService: AppsService) {}

  @Get()
  @ApiOkResponse({ type: Object, isArray: true })
  list(@Param('orgId') orgId: string): App[] {
    return this.appsService.listByOrg(orgId);
  }

  @Post()
  @ApiCreatedResponse({ type: Object })
  create(@Param('orgId') orgId: string, @Body() body: CreateAppRequest): CreateAppResponse {
    return this.appsService.create(orgId, body);
  }
}


