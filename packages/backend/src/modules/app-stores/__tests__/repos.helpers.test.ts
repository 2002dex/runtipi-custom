import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '@/common/constants';
import { ConfigurationService } from '@/core/config/configuration.service';
import { FilesystemService } from '@/core/filesystem/filesystem.service';
import { LoggerService } from '@/core/logger/logger.service';
import { ReposHelpers } from '@/modules/app-stores/repos.helpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

const gitMock = vi.hoisted(() => ({
  branch: vi.fn(),
  checkout: vi.fn(),
  clone: vi.fn(),
  currentBranch: vi.fn(),
  fetch: vi.fn(),
  resolveRef: vi.fn(),
}));

vi.mock('isomorphic-git', () => ({
  default: gitMock,
}));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

describe('ReposHelpers', () => {
  let helper: ReposHelpers;
  let filesystem: FilesystemService;

  beforeEach(() => {
    vi.clearAllMocks();

    const logger = mock<LoggerService>();
    const configuration = mock<ConfigurationService>();
    filesystem = new FilesystemService(logger);

    configuration.get.calledWith('directories').mockReturnValue({ dataDir: DATA_DIR, appDataDir: DATA_DIR, appDir: DATA_DIR } as any);

    helper = new ReposHelpers(logger, configuration, filesystem);
  });

  it('keeps an existing repo when fetch fails', async () => {
    const repoPath = path.join(DATA_DIR, 'repos', 'primary');
    await fs.promises.mkdir(repoPath, { recursive: true });

    gitMock.currentBranch.mockResolvedValue('main');
    gitMock.fetch.mockRejectedValue(new Error('getaddrinfo EAI_AGAIN github.com'));

    const result = await helper.pullRepo('https://github.com/example/store', 'primary');

    expect(result).toEqual({ success: false, message: 'getaddrinfo EAI_AGAIN github.com' });
    await expect(fs.promises.access(repoPath)).resolves.toBeUndefined();
    expect(gitMock.clone).not.toHaveBeenCalled();
  });
});
