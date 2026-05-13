import { Module } from '@nestjs/common';
import { ConfigurationModule } from '@/core/config/configuration.module';
import { FilesystemModule } from '@/core/filesystem/filesystem.module';
import { AppsModule } from '@/modules/apps/apps.module';
import { AppLifecycleModule } from '@/modules/app-lifecycle/app-lifecycle.module';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';

@Module({
  imports: [AppsModule, ConfigurationModule, FilesystemModule, AppLifecycleModule],
  controllers: [ConfigController],
  providers: [ConfigService],
})
export class ConfigModule {}
