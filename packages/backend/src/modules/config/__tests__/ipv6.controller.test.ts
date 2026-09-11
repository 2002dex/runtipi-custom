import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../config.service';
import * as execHelpers from '@/common/helpers/exec-helpers';
import fs from 'node:fs';

describe('ConfigService - IPv6 verification', () => {
  const mockConfig = {
    getConfig: () => ({ internalIp: '192.168.1.100', userSettings: {} }),
  };
  const mockFs = {};
  const mockApps = {};

  const service = new ConfigService(
    mockConfig as any,
    mockFs as any,
    mockApps as any,
  );

  it('should return supported=true when curl returns a valid IPv6 address', async () => {
    vi.spyOn(execHelpers, 'execFileAsync').mockResolvedValue({
      stdout: '2001:db8:85a3::8a2e:370:7334\n',
      stderr: '',
    });

    const result = await service.verifyIpv6();
    expect(result.supported).toBe(true);
    expect(result.ipv6).toBe('2001:db8:85a3::8a2e:370:7334');
    expect(result.message).toBe('Supports Jitsi Meet');
  });

  it('should return supported=false when curl returns empty or non-IPv6 output', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(execHelpers, 'execFileAsync').mockResolvedValue({
      stdout: '',
      stderr: 'curl: (7) Failed to connect to ifconfig.me port 443: Connection refused',
    });

    const result = await service.verifyIpv6();
    expect(result.supported).toBe(false);
    expect(result.ipv6).toBeUndefined();
    expect(result.message).toBe('Does not support Jitsi Meet');
  });

  it('should return supported=false when execFileAsync throws a timeout error', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(execHelpers, 'execFileAsync').mockRejectedValue(new Error('Command timed out'));

    const result = await service.verifyIpv6();
    expect(result.supported).toBe(false);
    expect(result.message).toBe('Does not support Jitsi Meet');
  });
});
