import { Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { LoadDto, RestartDto, UpdateDto } from './dto/system.dto';
import { SystemService } from './system.service';
import { ApiResponse } from '@nestjs/swagger';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @UseGuards(AuthGuard)
  @Get('/load')
  @ApiResponse({ type: LoadDto })
  async systemLoad() {
    const res = await this.systemService.getSystemLoad();
    return LoadDto.parse(res, { reportOnly: true });
  }

  @Get('/certificate')
  async downloadLocalCertificate(@Res() res: Response) {
    const cert = await this.systemService.getLocalCertificate();

    res.set({
      'Content-Type': 'application/x-pem-file',
      'Content-Disposition': 'attachment; filename=cert.pem',
    });

    return res.send(cert);
  }
  
  @Post('/restart')
  @UseGuards(AuthGuard)
  @ApiResponse({ type: RestartDto })
  async restartSystem(): Promise<RestartDto> {
    const res = await this.systemService.restartSmritimegh();
    return res;
  }

  @Post('/update')
  @UseGuards(AuthGuard)
  @ApiResponse({ type: UpdateDto })
  async updateSystem(): Promise<UpdateDto> {
    const res = await this.systemService.updateSmritimegh();
    return res;
  }
}
