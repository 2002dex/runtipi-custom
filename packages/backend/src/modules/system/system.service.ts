import { execSync } from 'node:child_process';
import { ConfigurationService } from '@/core/config/configuration.service';
import { FilesystemService } from '@/core/filesystem/filesystem.service';
import { LoggerService } from '@/core/logger/logger.service';
import { Injectable } from '@nestjs/common';
import si from 'systeminformation';
import path from 'node:path';

@Injectable()
export class SystemService {
  constructor(
    private readonly logger: LoggerService,
    private readonly config: ConfigurationService,
    private readonly filesystem: FilesystemService,
  ) {}

  public async getSystemLoad() {
    const { currentLoad } = await si.currentLoad();

    const memResult = { total: 0, used: 0, available: 0 };

    try {
      const memInfo = await this.filesystem.readTextFile('/host/proc/meminfo');

      memResult.total = Number(memInfo?.toString().match(/MemTotal:\s+(\d+)/)?.[1] ?? 0) * 1024;
      memResult.available = Number(memInfo?.toString().match(/MemAvailable:\s+(\d+)/)?.[1] ?? 0) * 1024;
      memResult.used = memResult.total - memResult.available;
    } catch (e) {
      this.logger.error(`Unable to read /host/proc/meminfo: ${e}`);
    }

    // Prefer ZFS pool stats if available
    let diskUsed = 0;
    let diskSize = 0;
    let percentUsed = 0;
    let zpoolName: string | undefined;
    let zpoolHealth: string | undefined;
    let zpoolCap: number | undefined;

    try {
      // 1) Prefer reading precomputed status from host file updated by cron (no shell exec)
      try {
        const dirs = this.config.get('directories') || {};
        const stateDir = (dirs.dataDir) ? (path.join(dirs.dataDir || '', 'state')) : '/data/state';
        const primaryPath = path.join(stateDir, 'system_status.tmp');
        const fallbackPath = path.join(stateDir, 'system_status');
        const statusText =
          (await this.filesystem.readTextFile(primaryPath).catch(() => '')) ??
          (await this.filesystem.readTextFile(fallbackPath).catch(() => '')) ??
          '';
        const trimmed = statusText.toString().trim();
        if (trimmed) {
          let parsed: any = null;
          try {
            parsed = JSON.parse(trimmed);
          } catch (_) {
            parsed = null;
          }
          if (parsed && typeof parsed === 'object') {
            // Expected format:
            // {
            //   timestamp: string,
            //   pools: [{ name, size, alloc, free, cap, health }],
            //   totalSize: number, totalAlloc: number, totalFree: number, percentUsed: number
            // }
            const pools: any[] = Array.isArray(parsed.pools) ? parsed.pools : [];
            if (pools.length > 0) {
              const names = pools.map((p) => String(p?.name || '')).filter(Boolean);
              zpoolName = names.length === 1 ? names[0] : names.length > 1 ? 'multiple' : zpoolName;
              const healthOrder = ['OFFLINE', 'FAULTED', 'DEGRADED', 'SUSPENDED', 'ONLINE'];
              let worstIdx = healthOrder.indexOf('ONLINE');
              for (const p of pools) {
                const idx = healthOrder.indexOf(String(p?.health || '').toUpperCase());
                if (idx !== -1 && (worstIdx === -1 || idx < worstIdx)) worstIdx = idx;
              }
              if (worstIdx !== -1) zpoolHealth = healthOrder[worstIdx];
            }

            const tSize = Number(parsed.totalSize);
            const tAlloc = Number(parsed.totalAlloc);
            const pUsed = Number(parsed.percentUsed);
            if (Number.isFinite(tSize) && Number.isFinite(tAlloc)) {
              diskSize = Math.round(tSize / 1024 / 1024 / 1024);
              diskUsed = Math.round(tAlloc / 1024 / 1024 / 1024);
              if (Number.isFinite(pUsed)) {
                percentUsed = Math.min(100, Math.max(0, Math.round(pUsed)));
              } else {
                percentUsed = tSize > 0 ? Math.round((tAlloc / tSize) * 100) : 0;
              }
            }

            const capVal = Number(parsed.cap ?? parsed.capacity ?? parsed.percentUsed);
            if (Number.isFinite(capVal)) zpoolCap = Math.min(100, Math.max(0, Math.round(capVal)));
          } else {
            // Try to extract from text (fallback)
            const poolMatch = trimmed.match(/\bpool\s*:?\s*([\w-]+)/i);
            if (poolMatch) zpoolName = zpoolName || poolMatch[1];
            const stateMatch = trimmed.match(/\bstate\s*:?\s*([A-Za-z]+)/i);
            const candidates = ['ONLINE', 'OFFLINE', 'DEGRADED', 'FAULTED', 'SUSPENDED'];
            let found = stateMatch ? stateMatch[1].toUpperCase() : undefined;
            if (!found) {
              for (const c of candidates) {
                if (trimmed.toUpperCase().includes(c)) { found = c; break; }
              }
            }
            if (found) zpoolHealth = found;
            const capMatch = trimmed.match(/\bcap\s*:?\s*(\d{1,3})%/i) || trimmed.match(/(\d{1,3})%\s*used/i);
            if (capMatch) zpoolCap = Math.min(100, Math.max(0, Number(capMatch[1])));
          }
        }
      } catch (_) {
        // ignore file read errors
      }
    } catch (e) {
      this.logger.warn(`zpool not available or failed: ${e}`);
    }

    if (!diskSize) {
      // Select the most relevant filesystem:
      // - Prefer ZFS mounts
      // - Prefer mounts under /data or /app-data
      try {
        const mounts = await si.fsSize();
        const preferred = mounts
          .filter((m) => !!m && typeof m.size === 'number')
          .sort((a, b) => (b.size ?? 0) - (a.size ?? 0));

        const pick = preferred.find((m) => (m as any).type?.toLowerCase?.() === 'zfs' && (m.mount?.startsWith('/data') || m.mount?.startsWith('/app-data')))
          || preferred.find((m) => m.mount?.startsWith('/data'))
          || preferred.find((m) => (m as any).type?.toLowerCase?.() === 'zfs')
          || preferred[0];

        if (pick) {
          const usedGiB = Math.round(((pick as any).used ?? ((pick.size ?? 0) - (pick.available ?? 0))) / 1024 / 1024 / 1024);
          const sizeGiB = Math.round((pick.size ?? 0) / 1024 / 1024 / 1024);
          diskSize = sizeGiB;
          diskUsed = usedGiB;
          percentUsed = sizeGiB > 0 ? Math.round((usedGiB / sizeGiB) * 100) : 0;
        }
      } catch (e) {
        this.logger.warn(`fsSize fallback failed: ${e}`);
        const [disk0] = await si.fsSize();
        const disk = disk0 ?? { available: 0, size: 0 } as { available: number; size: number };
        const diskFree = Math.round((disk.available ?? 0) / 1024 / 1024 / 1024);
        diskSize = Math.round((disk.size ?? 0) / 1024 / 1024 / 1024);
        diskUsed = Math.max(0, diskSize - diskFree);
        percentUsed = diskSize > 0 ? Math.round((diskUsed / diskSize) * 100) : 0;
      }
    }

    const memoryTotal = Math.round(Number(memResult.total) / 1024 / 1024 / 1024);
    const memoryFree = Math.round(Number(memResult.available) / 1024 / 1024 / 1024);
    const percentUsedMemory = memoryTotal > 0 ? Math.round(((memoryTotal - memoryFree) / memoryTotal) * 100) : 0;

    // If zpool health is still unknown, try reading /proc kstats (works in most containers)
    if (!zpoolHealth) {
      try {
        const out = execSync(
          `sh -lc 'for d in /proc/spl/kstat/zfs/*; do [ -f "$d/state" ] && echo $(basename "$d") $(cat "$d/state"); done'`,
          { stdio: 'pipe' },
        )
          .toString()
          .trim();
        if (out) {
          const lines = out.split('\n').filter(Boolean);
          const healthOrder = ['OFFLINE', 'FAULTED', 'DEGRADED', 'SUSPENDED', 'ONLINE'];
          let worstIdx = healthOrder.indexOf('ONLINE');
          const names: string[] = [];
          for (const line of lines) {
            const [name, state] = line.split(/\s+/, 2);
            if (name) names.push(name);
            const idx = healthOrder.indexOf((state ?? '').toUpperCase());
            if (idx !== -1 && (worstIdx === -1 || idx < worstIdx)) worstIdx = idx;
          }
          if (!zpoolName && names.length) zpoolName = names.length === 1 ? names[0] : 'multiple';
          if (worstIdx !== -1) zpoolHealth = healthOrder[worstIdx];
        }
      } catch (_) {
        // ignore
      }
    }

    return {
      diskUsed: diskUsed || 0,
      diskSize: diskSize || 0,
      percentUsed: percentUsed || 0,
      cpuLoad: currentLoad || 0,
      memoryTotal: memoryTotal || 0,
      percentUsedMemory: percentUsedMemory || 0,
      zpoolName,
      zpoolHealth,
      zpoolCap: zpoolCap ?? percentUsed,
    };
  }

  public async getLocalCertificate() {
    const { dataDir } = this.config.get('directories');
    const filePath = `${dataDir}/traefik/tls/cert.pem`;

    if (await this.filesystem.pathExists(filePath)) {
      const file = await this.filesystem.readTextFile(filePath);
      return file;
    }
  }
  
  public async restartSmritimegh() {
    try {
      // Resolve state directory from configured dataDir (defaults to /data)
      const { dataDir } = this.config.get('directories');
      const stateDir = `${dataDir}/state`;
      const commandFilePath = `${stateDir}/command.txt`;

      const ok = await this.filesystem.writeTextFile(commandFilePath, 'restart');

      if (!ok) {
        this.logger.error(`Failed to write restart command to ${commandFilePath}`);
        return {
          success: false,
          message: 'Failed to queue restart command',
        };
      }

      this.logger.info(`Wrote restart command to ${commandFilePath}`);
      return {
        success: true,
        message: 'Restart command written to state file',
      };
    } catch (error) {
      this.logger.error(`Unexpected error while writing restart command: ${error}`);
      return {
        success: false,
        message: `Unexpected error while writing restart command: ${error}`,
      };
    }
  }

  public async updateSmritimegh() {
    try {
      // Resolve state directory from configured dataDir (defaults to /data)
      const { dataDir } = this.config.get('directories');
      const stateDir = `${dataDir}/state`;
      const commandFilePath = `${stateDir}/command.txt`;

      const ok = await this.filesystem.writeTextFile(commandFilePath, 'update');

      if (!ok) {
        this.logger.error(`Failed to write restart command to ${commandFilePath}`);
        return {
          success: false,
          message: 'Failed to queue restart command',
        };
      }

      this.logger.info(`Wrote restart command to ${commandFilePath}`);
      return {
        success: true,
        message: 'Restart command written to state file',
      };
    } catch (error) {
      this.logger.error(`Unexpected error while writing restart command: ${error}`);
      return {
        success: false,
        message: `Unexpected error while writing restart command: ${error}`,
      };
    }
  }
}
