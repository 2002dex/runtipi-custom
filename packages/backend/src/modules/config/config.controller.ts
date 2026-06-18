import { Body, Controller, Get, Post, Put, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@/modules/auth/auth.guard';
import { ConfigService as AppConfigService } from './config.service';
import { AppLifecycleService } from '@/modules/app-lifecycle/app-lifecycle.service';
import {
  InfoDto,
  AppStatusDto,
  FrigateConfigDto,
  SyncResponseDto,
  SetUserDto,
  EntriesDto,
  SelectedWriteDto,
  UsersListDto,
  OkPathDto,
  OkCountDto,
  OkOnlyDto,
  UsbListDto,
  UsbSelectDto,
  UsbOpDto,
  UsbAppSelectDto,
  UsbSelectedDto,
  InstalledAppsDto,
  TimeMachineConfigDto,
  TimeMachineStatusDto,
  SmbSharesConfigDto,
  SmbSharesStatusDto,
} from './dto/config.dto';

@Controller('config')
@UseGuards(AuthGuard)
export class ConfigController {
  constructor(private readonly cfg: AppConfigService, private readonly appLifecycle: AppLifecycleService) {}

  @Get('info')
  @ApiResponse({ type: InfoDto })
  async info(): Promise<InfoDto> {
    const internalIp = await this.cfg.getInternalIp();
    return InfoDto.parse({ internalIp }, { reportOnly: true });
  }

  @Get('frigate/status')
  @ApiResponse({ type: AppStatusDto })
  async frigateStatus(): Promise<AppStatusDto> {
    const res = await this.cfg.getFrigateStatus();
    return AppStatusDto.parse(res, { reportOnly: true });
  }

  @Get('jellyfin/status')
  @ApiResponse({ type: AppStatusDto })
  async jellyfinStatus(): Promise<AppStatusDto> {
    const res = await this.cfg.getJellyfinStatus();
    return AppStatusDto.parse(res, { reportOnly: true });
  }

  @Get('frigate/config')
  @ApiResponse({ type: FrigateConfigDto })
  async getFrigateConfig(): Promise<FrigateConfigDto> {
    const cfg = await this.cfg.readFrigateConfig();
    return FrigateConfigDto.parse(cfg, { reportOnly: true });
  }

  @Put('frigate/config')
  @ApiResponse({ type: AppStatusDto })
  async updateFrigateConfig(@Body() body: FrigateConfigDto): Promise<AppStatusDto> {
    const validatedBody = FrigateConfigDto.parse(body, { reportOnly: true });
    await this.cfg.writeFrigateConfig(validatedBody);
    // If Frigate is installed, trigger a restart using app-lifecycle
    const status = await this.cfg.getFrigateStatus();
    if (status.installed && status.urn) {
      await this.appLifecycle.restartApp({ appUrn: status.urn });
    }
    return AppStatusDto.parse({ installed: true, urn: status.urn }, { reportOnly: true });
  }

  @Post('sync/jellyfin')
  @ApiResponse({ type: SyncResponseDto })
  async syncJellyfin(): Promise<SyncResponseDto> {
    const status = await this.cfg.getJellyfinStatus();
    if (!status.installed || !status.urn) {
      throw new HttpException('Jellyfin is not installed', HttpStatus.BAD_REQUEST);
    }

    // const { stderr } = await execAsync('bash /data/media/sync_jellyfin.sh');
    // Restart Jellyfin after sync
    await this.appLifecycle.restartApp({ appUrn: status.urn });

    return SyncResponseDto.parse({ success: true }, { reportOnly: true });
  }

  @Get('timemachine')
  @ApiResponse({ type: TimeMachineStatusDto })
  async getTimeMachineConfig(): Promise<TimeMachineStatusDto> {
    const res = await this.cfg.getTimeMachineConfig();
    return TimeMachineStatusDto.parse(res, { reportOnly: true });
  }

  @Put('timemachine')
  @ApiResponse({ type: TimeMachineStatusDto })
  async updateTimeMachineConfig(@Body() body: TimeMachineConfigDto): Promise<TimeMachineStatusDto> {
    const validatedBody = TimeMachineConfigDto.parse(body, { reportOnly: true });
    try {
      const res = await this.cfg.writeTimeMachineConfig(validatedBody);
      return TimeMachineStatusDto.parse(res, { reportOnly: true });
    } catch (e: any) {
      throw new HttpException(e?.message || 'Invalid Time Machine configuration', HttpStatus.BAD_REQUEST);
    }
  }

  @Get('smb-shares')
  @ApiResponse({ type: SmbSharesStatusDto })
  async getSmbSharesConfig(): Promise<SmbSharesStatusDto> {
    const res = await this.cfg.getSmbSharesConfig();
    return SmbSharesStatusDto.parse(res, { reportOnly: true });
  }

  @Put('smb-shares')
  @ApiResponse({ type: SmbSharesStatusDto })
  async updateSmbSharesConfig(@Body() body: SmbSharesConfigDto): Promise<SmbSharesStatusDto> {
    const validatedBody = SmbSharesConfigDto.parse(body, { reportOnly: true });
    try {
      const res = await this.cfg.writeSmbSharesConfig(validatedBody);
      return SmbSharesStatusDto.parse(res, { reportOnly: true });
    } catch (e: any) {
      throw new HttpException(e?.message || 'Invalid SMB shares configuration', HttpStatus.BAD_REQUEST);
    }
  }

  // ===== Duplicates endpoints (file-based state) =====
  @Get('nextcloud/users')
  @ApiResponse({ type: UsersListDto })
  async getNextcloudUsers(): Promise<UsersListDto> {
    const users = await this.cfg.listUsersFromState();
    return UsersListDto.parse({ users }, { reportOnly: true });
  }

  @Post('duplicates/set-user')
  @ApiResponse({ type: OkPathDto })
  async setUser(@Body() body: SetUserDto): Promise<OkPathDto> {
    const validatedBody = SetUserDto.parse(body, { reportOnly: true });
    if (!validatedBody?.username) throw new HttpException('username is required', HttpStatus.BAD_REQUEST);
    const res = await this.cfg.writeSelectedUserPath(validatedBody.username);
    return OkPathDto.parse(res, { reportOnly: true });
  }

  @Get('duplicates/rmlint')
  @ApiResponse({ type: EntriesDto })
  async getRmlintEntries(): Promise<EntriesDto> {
    const res = await this.cfg.readRmlintEntries();
    return EntriesDto.parse(res, { reportOnly: true });
  }

  @Post('duplicates/selected')
  @ApiResponse({ type: OkCountDto })
  async writeSelected(@Body() body: SelectedWriteDto): Promise<OkCountDto> {
    const validatedBody = SelectedWriteDto.parse(body, { reportOnly: true });
    const res = await this.cfg.writeSelectedOutput(validatedBody.selected ?? []);
    return OkCountDto.parse(res, { reportOnly: true });
  }

  @Post('duplicates/remove-all')
  @ApiResponse({ type: OkOnlyDto })
  async removeAll(): Promise<OkOnlyDto> {
    const res = await this.cfg.removeAllSelected();
    return OkOnlyDto.parse(res, { reportOnly: true });
  }

  // ===== External USB endpoints (file-based state) =====
  @Get('usb/installed-apps')
  @ApiResponse({ type: InstalledAppsDto })
  async getInstalledAppsForUsb(): Promise<InstalledAppsDto> {
    const res = await this.cfg.getInstalledAppsForUsb();
    return InstalledAppsDto.parse(res, { reportOnly: true });
  }

  @Post('usb/scan')
  @ApiResponse({ type: UsbListDto })
  async scanUsb(): Promise<UsbListDto> {
    const res = await this.cfg.scanUsbDevices();
    return UsbListDto.parse(res, { reportOnly: true });
  }

  @Get('usb/selected')
  @ApiResponse({ type: UsbSelectedDto })
  async getSelectedUsb(): Promise<UsbSelectedDto> {
    const res = await this.cfg.getSelectedUsb();
    return UsbSelectedDto.parse(res, { reportOnly: true });
  }

  // Persist selection of a single USB device (no mount/unmount side effects).
  @Post('usb/select')
  @ApiResponse({ type: OkOnlyDto })
  async selectUsb(@Body() body: UsbSelectDto): Promise<OkOnlyDto> {
    const validatedBody = UsbSelectDto.parse(body, { reportOnly: true });
    if (!validatedBody?.device) throw new HttpException('device is required', HttpStatus.BAD_REQUEST);
    const res = await this.cfg.selectUsbDevice(validatedBody.device);
    return OkOnlyDto.parse(res, { reportOnly: true });
  }

  // Clear USB selection (used when user toggles the Select button off).
  @Post('usb/clear-selected')
  @ApiResponse({ type: OkOnlyDto })
  async clearSelectedUsb(): Promise<OkOnlyDto> {
    const res = await this.cfg.clearSelectedUsb();
    return OkOnlyDto.parse(res, { reportOnly: true });
  }

  // Persist the app choice for mounting the selected USB.
  @Post('usb/app')
  @ApiResponse({ type: OkOnlyDto })
  async setUsbApp(@Body() body: UsbAppSelectDto): Promise<OkOnlyDto> {
    const validatedBody = UsbAppSelectDto.parse(body, { reportOnly: true });
    if (!validatedBody?.app) throw new HttpException('app is required', HttpStatus.BAD_REQUEST);
    const res = await this.cfg.setSelectedUsbApp(validatedBody.app);
    if (!res.ok) {
      throw new HttpException(res.error || 'Invalid app', HttpStatus.BAD_REQUEST);
    }
    return OkOnlyDto.parse({ ok: true }, { reportOnly: true });
  }

  @Post('usb/mount')
  @ApiResponse({ type: UsbOpDto })
  async mountUsb(@Body() body: UsbSelectDto): Promise<UsbOpDto> {
    const validatedBody = UsbSelectDto.parse(body, { reportOnly: true });
    if (!validatedBody?.device) throw new HttpException('device is required', HttpStatus.BAD_REQUEST);
    const res = await this.cfg.mountUsbDevice(validatedBody.device);
    return UsbOpDto.parse(res, { reportOnly: true });
  }

  @Post('usb/unmount')
  @ApiResponse({ type: UsbOpDto })
  async unmountUsb(@Body() body: UsbSelectDto): Promise<UsbOpDto> {
    const validatedBody = UsbSelectDto.parse(body, { reportOnly: true });
    if (!validatedBody?.device) throw new HttpException('device is required', HttpStatus.BAD_REQUEST);
    const res = await this.cfg.unmountUsbDevice(validatedBody.device);
    return UsbOpDto.parse(res, { reportOnly: true });
  }
}
