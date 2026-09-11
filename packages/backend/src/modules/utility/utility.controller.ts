import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@/modules/auth/auth.guard';
import { UtilityService } from './utility.service';
import { RemoteAccessDto } from './dto/utility.dto';

@Controller('utility')
@UseGuards(AuthGuard)
export class UtilityController {
  constructor(private readonly utilityService: UtilityService) {}

  @Get('remote-access')
  @ApiResponse({ type: RemoteAccessDto })
  async getRemoteAccess(): Promise<RemoteAccessDto> {
    return this.utilityService.getRemoteAccessInfo();
  }
}
