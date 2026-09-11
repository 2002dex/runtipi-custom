import { describe, expect, it } from 'vitest';
import { UtilityController } from '../utility.controller';
import { UtilityService } from '../utility.service';

describe('UtilityModule', () => {
  const service = new UtilityService();
  const controller = new UtilityController(service);

  it('should return remote access info with ultraviewer and static ssh credentials', async () => {
    const res = await controller.getRemoteAccess();

    expect(res.ultraviewer.downloadUrl).toBe('https://ultraviewer.net/en/download.html');
    expect(res.ultraviewer.subtitle).toBe('Only supported for Windows client');

    expect(res.ssh.host).toBe('smritimegh.local');
    expect(res.ssh.port).toBe(25432);
    expect(res.ssh.username).toBe('smadmin');
    expect(res.ssh.password).toBe('SM@dmin@098');

    expect(res.ssh.connectionHelp.windows).toBe('ssh -p 25432 smadmin@smritimegh.local');
    expect(res.ssh.connectionHelp.linux).toBe('ssh -p 25432 smadmin@smritimegh.local');
    expect(res.ssh.connectionHelp.mac).toBe('ssh -p 25432 smadmin@smritimegh.local');
    expect(res.ssh.connectionHelp.putty).toBe('putty.exe -P 25432 smadmin@smritimegh.local');
  });
});
