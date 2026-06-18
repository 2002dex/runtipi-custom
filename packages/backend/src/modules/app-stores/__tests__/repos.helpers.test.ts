import path from 'node:path';
import { DATA_DIR } from '@/common/constants';
import { ConfigurationService } from '@/core/config/configuration.service';
import { FilesystemService } from '@/core/filesystem/filesystem.service';
import { LoggerService } from '@/core/logger/logger.service';
import { ReposHelpers } from '@/modules/app-stores/repos.helpers';
import * as Sentry from '@sentry/nestjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

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

vi.mock('isomorphic-git/http/node', () => ({
  default: {},
}));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

describe('ReposHelpers', () => {
  let configuration: MockProxy<ConfigurationService>;
  let filesystem: MockProxy<FilesystemService>;
  let helper: ReposHelpers;

  beforeEach(() => {
    vi.clearAllMocks();

    configuration = mock<ConfigurationService>();
    filesystem = mock<FilesystemService>();

    configuration.get.calledWith('directories').mockReturnValue({
      dataDir: DATA_DIR,
      appDir: '/app',
      appDataDir: '/app-data',
    });

    helper = new ReposHelpers(mock<LoggerService>(), configuration, filesystem);
  });

  it('keeps the existing repo cache when fetch fails', async () => {
    const repoPath = path.join(DATA_DIR, 'repos', 'migrated');

    filesystem.pathExists.mockImplementation(async (filePath) => filePath === repoPath);
    gitMock.currentBranch.mockResolvedValue('main');
    gitMock.fetch.mockRejectedValue(new Error('Request timed out'));

    const result = await helper.pullRepo('https://github.com/runtipi/runtipi-appstore', 'migrated');

    expect(result.success).toBe(false);
    expect(filesystem.removeDirectory).not.toHaveBeenCalledWith(repoPath);
    expect(gitMock.clone).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('does not delete the existing repo when a fresh clone fails', async () => {
    const repoPath = path.join(DATA_DIR, 'repos', 'migrated');

    filesystem.pathExists.mockImplementation(async (filePath) => filePath === repoPath);
    gitMock.currentBranch.mockResolvedValue(undefined);
    gitMock.clone.mockRejectedValue(new Error('Request timed out'));

    const result = await helper.pullRepo('https://github.com/runtipi/runtipi-appstore', 'migrated');

    expect(result.success).toBe(false);
    expect(filesystem.removeDirectory).not.toHaveBeenCalledWith(repoPath);
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
