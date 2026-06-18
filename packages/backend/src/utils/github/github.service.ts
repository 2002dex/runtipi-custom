import { CacheService } from '@/core/cache/cache.service';
import { ConfigurationService } from '@/core/config/configuration.service';
import { LoggerService } from '@/core/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import semver from 'semver';

const octokit = new Octokit({});

type ReleaseInfo = {
  tag_name: string;
  body: string;
  created_at: string;
  prerelease: boolean;
  draft: boolean;
};

type ParsedSource =
  | { provider: 'github'; owner: string; repo: string }
  | { provider: 'gitlab'; projectId: string; baseUrl: string };

@Injectable()
export class GithubService {
  constructor(
    private readonly cache: CacheService,
    private readonly logger: LoggerService,
    private readonly config: ConfigurationService,
  ) {}

  async timeout(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse a source string into a structured object describing the provider and project.
   *
   * Supported formats:
   *  - GitHub owner/repo:           "runtipi/runtipi"
   *  - GitHub URL:                  "https://github.com/runtipi/runtipi"
   *  - GitLab API URL (project):    "https://gitlab.com/api/v4/projects/<projectId>/releases/permalink/latest"
   *  - GitLab project URL:          "https://gitlab.com/example-public/RUNTIPI-APP-STORE"
   *  - GitLab API URL (releases):   "https://gitlab.com/api/v4/projects/<projectId>"
   */
  parseSource(owner: string, repo?: string): ParsedSource {
    // If repo is provided and owner doesn't look like a URL, treat as GitHub owner/repo
    if (repo && !owner.startsWith('http')) {
      return { provider: 'github', owner, repo };
    }

    // If owner is a URL, parse it
    if (owner.startsWith('http')) {
      try {
        const url = new URL(owner);
        const hostname = url.hostname.toLowerCase();

        // GitLab API URL: https://gitlab.com/api/v4/projects/<id>/...
        if (hostname.includes('gitlab')) {
          const apiMatch = url.pathname.match(/\/api\/v4\/projects\/(\d+)/);
          if (apiMatch) {
            return {
              provider: 'gitlab',
              projectId: apiMatch[1] as string,
              baseUrl: `${url.protocol}//${url.host}`,
            };
          }

          // GitLab project URL: https://gitlab.com/group/project
          const pathParts = url.pathname.split('/').filter(Boolean);
          if (pathParts.length >= 2) {
            const projectPath = encodeURIComponent(pathParts.join('/'));
            return {
              provider: 'gitlab',
              projectId: projectPath,
              baseUrl: `${url.protocol}//${url.host}`,
            };
          }
        }

        // GitHub URL: https://github.com/owner/repo
        if (hostname.includes('github')) {
          const pathParts = url.pathname.split('/').filter(Boolean);
          if (pathParts.length >= 2) {
            return { provider: 'github', owner: pathParts[0] as string, repo: pathParts[1] as string };
          }
        }
      } catch {
        // Fall through to default
      }
    }

    // Default: treat as GitHub owner/repo
    return { provider: 'github', owner, repo: repo || owner };
  }

  /**
   * Fetch a URL with a timeout using AbortController.
   */
  private async fetchWithTimeout(url: string, timeoutMs = 3000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Build a cache key that includes the provider and project identifier.
   */
  private getCacheKey(prefix: string, source: ParsedSource): string {
    if (source.provider === 'gitlab') {
      return `${prefix}:gitlab:${source.projectId}`;
    }
    return `${prefix}:github:${source.owner}/${source.repo}`;
  }

  // ─── GitLab helpers ──────────────────────────────────────────────

  private async getLatestReleaseFromGitlab(source: Extract<ParsedSource, { provider: 'gitlab' }>) {
    try {
      const url = `${source.baseUrl}/api/v4/projects/${source.projectId}/releases/permalink/latest`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        this.logger.debug(`GitLab API returned ${response.status} for latest release`);
        return null;
      }

      const data = (await response.json()) as { tag_name?: string; description?: string };
      return {
        version: data.tag_name ?? '',
        body: data.description ?? '',
      };
    } catch (err) {
      this.logger.debug('GitLab API call failed, will use empty cache', err);
      return null;
    }
  }

  private async getReleaseListFromGitlab(source: Extract<ParsedSource, { provider: 'gitlab' }>): Promise<ReleaseInfo[]> {
    try {
      const url = `${source.baseUrl}/api/v4/projects/${source.projectId}/releases?per_page=100`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        this.logger.debug(`GitLab API returned ${response.status} for release list`);
        return [];
      }

      const data = (await response.json()) as Array<{
        tag_name: string;
        description?: string;
        created_at: string;
        upcoming_release?: boolean;
      }>;

      return data.map((release) => ({
        tag_name: release.tag_name,
        body: release.description ?? '',
        created_at: release.created_at,
        prerelease: release.upcoming_release ?? false,
        draft: false, // GitLab doesn't have a draft concept for releases
      }));
    } catch (err) {
      this.logger.debug('GitLab API call failed, will use empty releases', err);
      return [];
    }
  }

  // ─── GitHub helpers ──────────────────────────────────────────────

  private async getLatestReleaseFromGithub(source: Extract<ParsedSource, { provider: 'github' }>) {
    const versionPromise = new Promise<{ version: string; body: string } | null>((resolve) => {
      octokit.rest.repos
        .getLatestRelease({
          owner: source.owner,
          repo: source.repo,
        })
        .then((res) => {
          resolve({
            version: res.data.tag_name,
            body: res.data.body ?? '',
          });
        })
        .catch((err) => {
          this.logger.debug('GitHub API call failed, will use empty cache', err);
          resolve(null);
        });
    });

    return Promise.race([versionPromise, this.timeout(3000).then(() => null)]);
  }

  private async getReleaseListFromGithub(source: Extract<ParsedSource, { provider: 'github' }>): Promise<ReleaseInfo[]> {
    const releasesPromise = new Promise<ReleaseInfo[]>((resolve) => {
      octokit.rest.repos
        .listReleases({
          owner: source.owner,
          repo: source.repo,
          per_page: 100,
        })
        .then((res) => {
          const fetchedReleases = res.data.map((release) => ({ ...release, body: release.body ?? '' }));
          resolve(fetchedReleases);
        })
        .catch((err) => {
          this.logger.debug('GitHub API call failed, will use empty releases', err);
          resolve([]);
        });
    });

    return Promise.race([releasesPromise, this.timeout(3000).then(() => [] as ReleaseInfo[])]);
  }

  // ─── Public API ──────────────────────────────────────────────────

  async getLatestRelease(owner: string, repo: string) {
    const currentVersion = this.config.getConfig().version;
    const source = this.parseSource(owner, repo);

    const cacheKeyVersion = this.getCacheKey('latestVersion', source);
    const cacheKeyBody = this.getCacheKey('latestVersionBody', source);

    let version = this.cache.get(cacheKeyVersion) ?? '';
    let body = this.cache.get(cacheKeyBody) ?? '';

    if (version) {
      return { version, body };
    }

    let result: { version: string; body: string } | null = null;

    if (source.provider === 'gitlab') {
      result = await this.getLatestReleaseFromGitlab(source);
    } else {
      result = await this.getLatestReleaseFromGithub(source);
    }

    this.cache.set(cacheKeyVersion, result?.version ?? currentVersion, 60 * 60);
    this.cache.set(cacheKeyBody, result?.body ?? '', 60 * 60);
    return result ?? { version: undefined, body: undefined };
  }

  async getReleasesSince(owner: string, repo: string, sinceTag: string) {
    try {
      const source = this.parseSource(owner, repo);
      let releases: ReleaseInfo[] = [];
      const cacheKey = this.getCacheKey(`releasesSince:${sinceTag}`, source);
      const cachedReleases = this.cache.get(cacheKey) ?? null;

      if (cachedReleases) {
        releases = JSON.parse(cachedReleases) as ReleaseInfo[];
      } else {
        if (source.provider === 'gitlab') {
          releases = await this.getReleaseListFromGitlab(source);
        } else {
          releases = await this.getReleaseListFromGithub(source);
        }

        this.cache.set(cacheKey, JSON.stringify(releases), 60 * 60);
      }

      const filtered = releases
        .filter((release) => release.tag_name !== sinceTag)
        .filter((release) => !release.prerelease)
        .filter((release) => !release.draft)
        .filter((release) => semver.gte(release.tag_name, sinceTag)) // only include releases with a greater version than sinceTag
        .sort((a, b) => {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
        .map((release) => ({
          version: release.tag_name,
          body: release.body ?? '',
        }));

      return filtered;
    } catch (error) {
      this.logger.error('Error fetching releases:', error);
      return [];
    }
  }
}
