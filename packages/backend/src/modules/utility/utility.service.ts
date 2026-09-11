import { Injectable } from '@nestjs/common';
import { RemoteAccessDto } from './dto/utility.dto';

@Injectable()
export class UtilityService {
  async getRemoteAccessInfo(): Promise<RemoteAccessDto> {
    const data = {
      ultraviewer: {
        downloadUrl: 'https://ultraviewer.net/en/download.html',
        subtitle: 'Only supported for Windows client',
      },
      ssh: {
        host: 'smritimegh.local',
        port: 25432,
        username: 'smadmin',
        password: 'SM@dmin@098',
        connectionHelp: {
          windows: 'ssh -p 25432 smadmin@smritimegh.local',
          linux: 'ssh -p 25432 smadmin@smritimegh.local',
          mac: 'ssh -p 25432 smadmin@smritimegh.local',
          putty: 'putty.exe -P 25432 smadmin@smritimegh.local',
        },
      },
    };

    return RemoteAccessDto.parse(data, { reportOnly: true });
  }
}
