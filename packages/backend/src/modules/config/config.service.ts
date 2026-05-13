import path from 'node:path';
import * as yaml from 'yaml';
import { Injectable } from '@nestjs/common';
import { ConfigurationService } from '@/core/config/configuration.service';
import { FilesystemService } from '@/core/filesystem/filesystem.service';
import { AppsService } from '@/modules/apps/apps.service';
import { createAppUrn } from '@/common/helpers/app-helpers';
import fs from 'node:fs';

const STATE_DIR = '/data/state';
const DEMO_DIR = path.join(process.cwd(), 'json');

@Injectable()
export class ConfigService {
  constructor(
    private readonly config: ConfigurationService,
    private readonly fs: FilesystemService,
    private readonly apps: AppsService,
  ) {}

  async getInternalIp() {
    const conf = this.config.getConfig();
    // internalIp is exposed on the root level and in userSettings.listenIp
    return conf.internalIp || conf.userSettings.internalIp || '127.0.0.1';
  }

  async getFrigateStatus() {
    return this.getAppStatusByName('frigate');
  }

  async getJellyfinStatus() {
    return this.getAppStatusByName('jellyfin');
  }

  async getInstalledAppsForUsb() {
    const apps = ['nextcloud', 'jellyfin', 'immich'];
    const installed = await this.apps.getInstalledApps();
    const result: Record<string, boolean> = {};
    
    for (const appName of apps) {
      const app = installed.find((a) => a?.app?.appName === appName);
      result[appName] = !!app;
    }
    
    return result;
  }

  private async getAppStatusByName(name: string) {
    const installed = await this.apps.getInstalledApps();
    const app = installed.find((a) => a?.app?.appName === name);
    if (!app) return { installed: false } as const;
    const urn = createAppUrn(name as 'frigate' | 'jellyfin', app.app.appStoreSlug);
    return { installed: true, urn } as const;
  }

  private async getFrigateAppDataDir() {
    const status = await this.getFrigateStatus();
    if (!status.installed || !status.urn) throw new Error('Frigate is not installed');

    const { directories } = this.config.getConfig();
    const [appName, appStoreId] = ['frigate', status.urn.split(':')[1]];

    const dataDir = path.join(directories.appDataDir, appStoreId, appName);
    return dataDir;
  }

  async readFrigateConfig(): Promise<{ cameras: Array<{ name: string; ip?: string; user?: string; password?: string; objects?: string[]; record?: boolean; inputs?: Array<{ path: string; roles: string[] }> }>; }> {
    const base = await this.getFrigateAppDataDir();
    // Use only the primary path: frigate/data/config/config.yml
    const filePath = path.join(base, 'data', 'config', 'config.yml');

    if (!await this.fs.pathExists(filePath)) {
      // Nothing yet; return empty cameras
      return { cameras: [] };
    }

    const text = (await this.fs.readTextFile(filePath)) || '';
    let data: any = {};
    try {
      data = yaml.parse(text || '') || {};
    } catch (_) {
      data = {};
    }

    const out: Array<{ name: string; ip?: string; user?: string; password?: string; objects?: string[]; record?: boolean; inputs?: Array<{ path: string; roles: string[] }> }> = [];
    if (data?.cameras && typeof data.cameras === 'object') {
      for (const [name, cfg] of Object.entries<any>(data.cameras)) {
        const inputs: Array<{ path: string; roles: string[] }> = [];
        
        // Extract inputs from ffmpeg configuration
        if (Array.isArray(cfg?.ffmpeg?.inputs)) {
          cfg.ffmpeg.inputs.forEach((input: any) => {
            const rolesRaw = Array.isArray(input.roles) ? input.roles : [];
            const roles = rolesRaw.map((r: any) => String(r).toLowerCase());
            const validRoles = roles.filter((r: string) => ['detect', 'record', 'audio'].includes(r));
            inputs.push({
              path: input.path || '',
              roles: validRoles,
            });
          });
        }
        
        // Best-effort extraction of ip/user/password from first RTSP path for backward compatibility
        let ip = '';
        let user: string | undefined;
        let password: string | undefined;
        const pathStr = inputs[0]?.path || '';
        // Regex to extract user, password, ip/host, port, and the full path
        const m = String(pathStr).match(/^rtsp:\/\/(([^:\/@]+)(:([^\/@]+))?@)?([^\/:]+)(:\d+)?(\/.*)?$/);
        if (m) {
          user = m[2];
          password = m[4];
          ip = m[5];
        } else {
          // Try to extract just the host/ip from the path
          const simpleMatch = String(pathStr).match(/^rtsp:\/\/(.*?)(\/|$)/);
          if (simpleMatch) {
            ip = simpleMatch[1];
          }
        }
        
        // Extract objects from objects.track structure
        let objects: string[] = [];
        if (cfg?.objects?.track && Array.isArray(cfg.objects.track)) {
          objects = cfg.objects.track;
        } else if (Array.isArray(cfg?.detect?.objects)) {
          // Fallback to old structure for backward compatibility
          objects = cfg.detect.objects;
        }
        
        const record = Boolean(cfg?.record?.enabled ?? true);
        out.push({ name, ip, user, password, objects, record, inputs });
      }
    }

    return { cameras: out };
  }

  async writeFrigateConfig(body: { cameras: Array<{ name: string; ip?: string; user?: string; password?: string; objects?: string[]; record?: boolean; inputs?: Array<{ path: string; roles: string[] }> }>; }) {
    const base = await this.getFrigateAppDataDir();
    // Use only the primary path: frigate/data/config/config.yml
    const filePath = path.join(base, 'data', 'config', 'config.yml');

    // Read existing config to preserve non-camera sections
    let existingConfig: any = {};
    if (await this.fs.pathExists(filePath)) {
      const text = (await this.fs.readTextFile(filePath)) || '';
      try {
        existingConfig = yaml.parse(text || '') || {};
      } catch (_) {
        existingConfig = {};
      }
    }

    // Build cameras config from the provided cameras
    const cameras: any = {};
    for (const cam of body.cameras) {
      let inputs: Array<{ path: string; roles: string[] }> = [];
      
      if (cam.inputs && cam.inputs.length > 0) {
        // Use the provided inputs (normalize roles to lowercase and filter valid)
        inputs = cam.inputs.map((input) => {
          const roles = Array.from(new Set((input.roles || []).map((r: any) => String(r).toLowerCase()))).filter((r) => ['detect', 'record', 'audio'].includes(r));
          return {
            path: input.path,
            roles,
          };
        });
      } else if (cam.ip) {
        // Fallback to old behavior for backward compatibility
        const auth = cam.user ? `${encodeURIComponent(cam.user)}${cam.password ? `:${encodeURIComponent(cam.password)}` : ''}@` : '';
        const url = `rtsp://${auth}${cam.ip}`;
        inputs = [{ path: url, roles: ['detect', ...(cam.record !== false ? ['record'] : [])] }];
      }
      
      cameras[cam.name] = {
        ffmpeg: {
          inputs: inputs,
        },
        objects: {
          track: cam.objects ?? ['person']
        },
        detect: { enabled: true },
        record: { enabled: cam.record !== false },
      };
    }

    // Preserve existing config structure, only update cameras
    const finalConfig = {
      ...existingConfig,
      cameras
    };

    // Ensure parent dir exists
    await this.fs.createDirectory(path.dirname(filePath));

    const yamlText = yaml.stringify(finalConfig);
    await this.fs.writeTextFile(filePath, yamlText);
  }

  // ====== Duplicates helpers (file-based state) ======
  private getStateDir() {
    try {
      const dirs = this.config.getConfig()?.directories || {};
      // prefer explicit dataDir + '/state', fallback to constant
      if (dirs.dataDir) return path.join(dirs.dataDir, 'state');
    } catch {}
    return STATE_DIR;
  }

  async listUsersFromState(): Promise<string[]> {
    const primary = path.join(this.getStateDir(), 'user_list.json');
    const fallback = path.join(DEMO_DIR, 'user_list.json');
    const file = await this.fs.pathExists(primary) ? primary : fallback;
    try {
      const text = await this.fs.readTextFile(file);
      const arr = JSON.parse(text || '[]');
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((it: any) => it && typeof it === 'object' && typeof it.user === 'string')
        .map((it: any) => String(it.user));
    } catch {
      return [];
    }
  }

  private async loadUserMap(): Promise<Record<string, string>> {
    const primary = path.join(this.getStateDir(), 'user_list.json');
    const fallback = path.join(DEMO_DIR, 'user_list.json');
    const file = await this.fs.pathExists(primary) ? primary : fallback;
    try {
      const text = await this.fs.readTextFile(file);
      const arr = JSON.parse(text || '[]');
      const map: Record<string, string> = {};
      if (Array.isArray(arr)) {
        for (const it of arr) {
          if (it && typeof it === 'object' && typeof it.user === 'string' && typeof it.path === 'string') {
            map[String(it.user)] = String(it.path);
          }
        }
      }
      return map;
    } catch {
      return {};
    }
  }

  async writeSelectedUserPath(username: string): Promise<{ ok: boolean; path?: string }> {
    const map = await this.loadUserMap();
    const p = map[username];
    if (!p) return { ok: false };
    const stateDir = this.getStateDir();
    const filePath = path.join(stateDir, 'path.txt');
    const userFilePath = path.join(stateDir, 'selected_user.txt');
    await this.fs.createDirectory(stateDir);
    await this.fs.writeTextFile(filePath, p);
    // Persist the selected username so we can match rmlint output files per user
    await this.fs.writeTextFile(userFilePath, username);
    return { ok: true, path: p };
  }

  private async findRmlintFile(): Promise<string | null> {
    // Pick the latest rmlint-output-<username>-*.json from the state dir when a user is selected,
    // falling back to any rmlint-output-*.json if no username is available.
    //
    // IMPORTANT: rmlint can take a long time to scan (especially on large Nextcloud user directories).
    // The UI expects this function to *wait* until an output file is generated.

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // By default we wait indefinitely (timeout disabled), because the UI shows a loading state until
    // the rmlint output is ready. Set RMLINT_OUTPUT_WAIT_TIMEOUT_MS to enforce a hard upper bound.
    // Use 0 to disable the timeout.
    const timeoutMs = Number(process.env.RMLINT_OUTPUT_WAIT_TIMEOUT_MS ?? 0);
    const pollIntervalMs = Number(process.env.RMLINT_OUTPUT_WAIT_POLL_MS ?? 1000);
    const stableForMs = Number(process.env.RMLINT_OUTPUT_STABLE_FOR_MS ?? 1500);

    const startedAt = Date.now();

    // Read selected username (written by writeSelectedUserPath). We'll use it to prefer per-user output.
    const dir = this.getStateDir();

    // If path.txt exists, treat its mtime as the "scan trigger" timestamp. This avoids returning stale
    // output files that might still be present from a previous run.
    let minOutputMtimeMs = 0;
    const pathFile = path.join(dir, 'path.txt');
    try {
      const st = await fs.promises.stat(pathFile);
      minOutputMtimeMs = st.mtimeMs;
    } catch {
      minOutputMtimeMs = 0;
    }

    let username: string | null = null;
    const userFile = path.join(dir, 'selected_user.txt');
    try {
      if (await this.fs.pathExists(userFile)) {
        const raw = await this.fs.readTextFile(userFile);
        const trimmed = (raw || '').trim();
        if (trimmed) username = trimmed;
      }
    } catch {
      username = null;
    }

    // Build a regex based on whether we have a username
    const basePattern = '^rmlint-output-';
    let pattern: RegExp;
    if (username) {
      const escapedUser = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(`${basePattern}${escapedUser}-.*\\.json$`);
    } else {
      pattern = /^rmlint-output-.*\.json$/;
    }

    // Wait for a candidate file to appear and become stable (size/mtime unchanged for stableForMs).
    let lastPath: string | null = null;
    let lastMtimeMs: number | null = null;
    let lastSize: number | null = null;
    let stableSince: number | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (timeoutMs > 0 && Date.now() - startedAt > timeoutMs) return null;

      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        const candidates = entries
          .filter((e) => e.isFile() && pattern.test(e.name))
          .map((e) => path.join(dir, e.name));

        if (candidates.length > 0) {
          // Find the newest candidate by mtime (async, avoids statSync blocking the event loop)
          let newest: { file: string; mtimeMs: number } | null = null;
          for (const file of candidates) {
            try {
              const st = await fs.promises.stat(file);
              if (minOutputMtimeMs > 0 && st.mtimeMs < minOutputMtimeMs) continue;
              if (!newest || st.mtimeMs > newest.mtimeMs) newest = { file, mtimeMs: st.mtimeMs };
            } catch {
              // ignore transient stat errors
            }
          }

          if (newest?.file) {
            try {
              const st = await fs.promises.stat(newest.file);
              const same = lastPath === newest.file && lastMtimeMs === st.mtimeMs && lastSize === st.size;

              if (!same) {
                lastPath = newest.file;
                lastMtimeMs = st.mtimeMs;
                lastSize = st.size;
                stableSince = Date.now();
              } else if (stableSince && Date.now() - stableSince >= stableForMs) {
                // Only return non-empty files; empty files are likely still being written.
                if (st.size > 0) return newest.file;
              }
            } catch {
              // ignore and keep polling
            }
          }
        }
      } catch {
        // Likely state dir not created yet; keep polling.
      }

      await sleep(pollIntervalMs);
    }
  }
  async readRmlintEntries(): Promise<{ entries: Array<{ path: string; type: string; is_original?: boolean }> }> {
    const file = await this.findRmlintFile();
    if (!file) return { entries: [] };

    // The output file may appear before the writer finishes flushing the JSON.
    // Retry parsing briefly to avoid returning an empty list due to a transient parse error.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const text = await this.fs.readTextFile(file);
        const data = JSON.parse(text || 'null');
        const entries: Array<{ path: string; type: string; is_original?: boolean }> = [];
        if (Array.isArray(data)) {
          for (const it of data) {
            if (it && typeof it === 'object' && typeof it.type === 'string' && typeof it.path === 'string') {
              entries.push({ path: it.path, type: it.type, is_original: Boolean((it as any).is_original) });
            }
          }
        }
        return { entries };
      } catch {
        // wait and retry
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return { entries: [] };
  }

  async writeSelectedOutput(selected: Array<{ path: string; type?: string; is_original?: boolean }>): Promise<{ ok: boolean; count: number }> {
    await this.fs.createDirectory(this.getStateDir());
    const file = path.join(this.getStateDir(), 'selected_output.json');
    await this.fs.writeTextFile(file, JSON.stringify(selected ?? [], null, 2));
    return { ok: true, count: (selected ?? []).length };
  }

  // ====== External USB helpers (file-based state) ======
  private async writeCommand(cmd: string) {
    const stateDir = this.getStateDir();
    await this.fs.createDirectory(stateDir);
    const cmdFile = path.join(stateDir, 'command.txt');
    await this.fs.writeTextFile(cmdFile, cmd);
    let mtimeMs = Date.now();
    try {
      const st = await fs.promises.stat(cmdFile);
      mtimeMs = st.mtimeMs;
    } catch {}
    return { cmdFile, mtimeMs };
  }

  /**
   * Persist the selected USB device to selected_usb.json without triggering mount/unmount.
   * Only a single device is stored; calling this again overwrites the previous selection.
   */
  async selectUsbDevice(device: string): Promise<{ ok: boolean; error?: string }> {
    const stateDir = this.getStateDir();
    await this.fs.createDirectory(stateDir);

    const usbList = path.join(stateDir, 'usb_list.json');
    let selected: any = { device };

    try {
      const text = await this.fs.readTextFile(usbList);
      const data = JSON.parse(text || 'null');
      const raw = (data && typeof data === 'object' && Array.isArray((data as any).devices)) ? (data as any).devices : [];
      const found = (raw as any[]).find((d) => d && typeof d === 'object' && d.device === device);
      if (found) selected = found;
    } catch {
      // Fallback to minimal payload with only device field.
    }

    await this.fs.writeTextFile(path.join(stateDir, 'selected_usb.json'), JSON.stringify(selected, null, 2));
    return { ok: true };
  }

  /**
   * Clear the USB selection while keeping a valid JSON structure.
   * This is used when the user toggles the Select button off.
   */
  async clearSelectedUsb(): Promise<{ ok: boolean }> {
    const stateDir = this.getStateDir();
    await this.fs.createDirectory(stateDir);
    await this.fs.writeTextFile(path.join(stateDir, 'selected_usb.json'), JSON.stringify({}, null, 2));
    return { ok: true };
  }

  /**
   * Persist the selected target app for the USB mount.
   * The shell scripts usb_mount.sh / usb_unmount.sh read selected_app.txt
   * and derive the mountpoint from it.
   */
  async setSelectedUsbApp(app: string): Promise<{ ok: boolean; error?: string }> {
    const normalized = app.trim().toLowerCase();
    const allowed = ['nextcloud', 'jellyfin', 'immich'];
    if (!allowed.includes(normalized)) {
      return { ok: false, error: 'Invalid app selection' };
    }

    const stateDir = this.getStateDir();
    await this.fs.createDirectory(stateDir);
    await this.fs.writeTextFile(path.join(stateDir, 'selected_app.txt'), normalized);
    return { ok: true };
  }

  /**
   * Read the last selected USB device and app from state files and
   * best-effort determine whether it is currently mounted.
   */
  async getSelectedUsb(): Promise<{ device: string | null; app: string | null; mounted: boolean }> {
    const stateDir = this.getStateDir();
    let device: string | null = null;
    let app: string | null = null;
    let mounted = false;

    // Read selected_usb.json
    try {
      const text = await this.fs.readTextFile(path.join(stateDir, 'selected_usb.json'));
      const data = JSON.parse(text || 'null');
      if (data && typeof data === 'object' && typeof (data as any).device === 'string') {
        const d = String((data as any).device).trim();
        if (d) device = d;
      }
    } catch {
      // ignore
    }

    // Read selected_app.txt
    try {
      const text = await this.fs.readTextFile(path.join(stateDir, 'selected_app.txt'));
      const trimmed = String(text || '').trim();
      if (trimmed) app = trimmed.toLowerCase();
    } catch {
      // ignore
    }

    if (device) {
      // Prefer usb_list.json if available to check mountpoint
      try {
        const text = await this.fs.readTextFile(path.join(stateDir, 'usb_list.json'));
        const data = JSON.parse(text || 'null');
        const raw = (data && typeof data === 'object' && Array.isArray((data as any).devices))
          ? (data as any).devices
          : [];
        const found = (raw as any[]).find((d: any) => d && typeof d === 'object' && d.device === device);
        if (found && found.mountpoint) mounted = true;
      } catch {
        // ignore and fall back
      }

      if (!mounted) {
        // Fallback: mount_status.json latest operation
        try {
          const text = await this.fs.readTextFile(path.join(stateDir, 'mount_status.json'));
          const data = JSON.parse(text || 'null');
          if (data && typeof data === 'object' && String((data as any).device || '') === device) {
            const op = String((data as any).operation ?? '').toLowerCase();
            const status = String((data as any).status ?? '').toLowerCase();
            if (status === 'success' && op === 'mount') {
              mounted = true;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    return { device, app, mounted };
  }

  private async readErrorStatusIfNewer(minMtimeMs: number): Promise<string | null> {
    const errFile = path.join(this.getStateDir(), 'error_status.json');
    try {
      const st = await fs.promises.stat(errFile);
      if (minMtimeMs > 0 && st.mtimeMs < minMtimeMs) return null;
      const text = await this.fs.readTextFile(errFile);
      const data = JSON.parse(text || 'null');
      const msg = (data && typeof data === 'object' && typeof (data as any).error === 'string') ? String((data as any).error) : null;
      return msg || null;
    } catch {
      return null;
    }
  }

  private async waitForStableFile(filePath: string, minMtimeMs: number, opts?: { timeoutMs?: number; pollMs?: number; stableForMs?: number }) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const timeoutMs = Number(opts?.timeoutMs ?? process.env.USB_OUTPUT_WAIT_TIMEOUT_MS ?? 0);
    const pollMs = Number(opts?.pollMs ?? process.env.USB_OUTPUT_WAIT_POLL_MS ?? 500);
    const stableForMs = Number(opts?.stableForMs ?? process.env.USB_OUTPUT_STABLE_FOR_MS ?? 1000);

    const startedAt = Date.now();
    let lastMtimeMs: number | null = null;
    let lastSize: number | null = null;
    let stableSince: number | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (timeoutMs > 0 && Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for USB output');

      try {
        const st = await fs.promises.stat(filePath);
        if (minMtimeMs > 0 && st.mtimeMs < minMtimeMs) {
          // too old (stale)
        } else if (st.size > 0) {
          const same = lastMtimeMs === st.mtimeMs && lastSize === st.size;
          if (!same) {
            lastMtimeMs = st.mtimeMs;
            lastSize = st.size;
            stableSince = Date.now();
          } else if (stableSince && Date.now() - stableSince >= stableForMs) {
            return;
          }
        }
      } catch {
        // file doesn't exist yet
      }

      // eslint-disable-next-line no-await-in-loop
      await sleep(pollMs);
    }
  }

  async scanUsbDevices(): Promise<{ devices: Array<{ device: string; model?: string | null; size?: string | null; mountpoint?: string | null; uuid?: string | null; label?: string | null }>; error?: string }> {
    const { mtimeMs } = await this.writeCommand('scan');

    const usbList = path.join(this.getStateDir(), 'usb_list.json');

    try {
      await this.waitForStableFile(usbList, mtimeMs);
    } catch (e: any) {
      const err = await this.readErrorStatusIfNewer(mtimeMs);
      return { devices: [], error: err || String(e) };
    }

    // If the script wrote an error, surface it.
    const err = await this.readErrorStatusIfNewer(mtimeMs);
    if (err) return { devices: [], error: err };

    try {
      const text = await this.fs.readTextFile(usbList);
      const data = JSON.parse(text || 'null');
      const raw = (data && typeof data === 'object' && Array.isArray((data as any).devices)) ? (data as any).devices : [];
      const devices = (raw as any[])
        .filter((d) => d && typeof d === 'object' && typeof d.device === 'string')
        .map((d) => ({
          device: String(d.device),
          model: d.model != null ? String(d.model) : null,
          size: d.size != null ? String(d.size) : null,
          mountpoint: d.mountpoint != null ? String(d.mountpoint) : null,
          uuid: d.uuid != null ? String(d.uuid) : null,
          label: d.label != null ? String(d.label) : null,
        }));
      return { devices };
    } catch {
      return { devices: [], error: 'Failed to parse usb_list.json' };
    }
  }


  async mountUsbDevice(device: string): Promise<{ ok: boolean; error?: string }> {
    const stateDir = this.getStateDir();
    await this.fs.createDirectory(stateDir);
    const usbList = path.join(this.getStateDir(), 'usb_list.json');
    const text = await this.fs.readTextFile(usbList);
    const data = JSON.parse(text || 'null');
    const raw = (data && typeof data === 'object' && Array.isArray((data as any).devices)) ? (data as any).devices : [];
    const selectedDevice = (raw as any[]).find((d) => d && typeof d === 'object' && d.device === device);
    await this.fs.writeTextFile(path.join(stateDir, 'selected_usb.json'), JSON.stringify(selectedDevice || { device }, null, 2));

    const { mtimeMs } = await this.writeCommand('mount');
    const statusFile = path.join(stateDir, 'mount_status.json');

    try {
      const timeoutMsEnv = Number(process.env.USB_MOUNT_WAIT_TIMEOUT_MS ?? 0);
      await this.waitForStableFile(statusFile, mtimeMs, {
        timeoutMs: Number.isFinite(timeoutMsEnv) && timeoutMsEnv > 0 ? timeoutMsEnv : 0,
      });
    } catch (e: any) {
      const err = await this.readErrorStatusIfNewer(mtimeMs);
      return { ok: false, error: err || String(e) };
    }

    const err = await this.readErrorStatusIfNewer(mtimeMs);
    if (err) return { ok: false, error: err };

    return { ok: true };
  }

  async unmountUsbDevice(device: string): Promise<{ ok: boolean; error?: string }> {
    const stateDir = this.getStateDir();
    await this.fs.createDirectory(stateDir);
    await this.fs.writeTextFile(path.join(stateDir, 'selected_usb.json'), JSON.stringify({ device }, null, 2));

    const { mtimeMs } = await this.writeCommand('unmount');
    const statusFile = path.join(stateDir, 'mount_status.json');

    try {
      const timeoutMsEnv = Number(process.env.USB_UNMOUNT_WAIT_TIMEOUT_MS ?? 0);
      await this.waitForStableFile(statusFile, mtimeMs, {
        timeoutMs: Number.isFinite(timeoutMsEnv) && timeoutMsEnv > 0 ? timeoutMsEnv : 0,
      });
    } catch (e: any) {
      const err = await this.readErrorStatusIfNewer(mtimeMs);
      return { ok: false, error: err || String(e) };
    }

    const err = await this.readErrorStatusIfNewer(mtimeMs);
    if (err) return { ok: false, error: err };

    return { ok: true };
  }

  async removeAllSelected(): Promise<{ ok: boolean }> {
    await this.fs.createDirectory(this.getStateDir());

    // 1) Read current selection and copy to trash.json
    const selectedFile = path.join(this.getStateDir(), 'selected_output.json');
    const trashFile = path.join(this.getStateDir(), 'trash.json');
    try {
      let selectedArr: any[] = [];
      if (await this.fs.pathExists(selectedFile)) {
        const text = await this.fs.readTextFile(selectedFile);
        const data = JSON.parse(text || '[]');
        if (Array.isArray(data)) selectedArr = data;
      }
      await this.fs.writeTextFile(trashFile, JSON.stringify(selectedArr, null, 2));
    } catch {}

    // 2) Write delete command
    await this.fs.writeTextFile(path.join(this.getStateDir(), 'command.txt'), 'delete');

    // 3) Remove any *.processed files
    try {
      const dir = this.getStateDir();
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.processed')) {
          try { await fs.promises.unlink(path.join(dir, e.name)); } catch {}
        }
      }
    } catch {}

    // 4) Clear selection file
    await this.fs.writeTextFile(selectedFile, JSON.stringify([], null, 2));

    return { ok: true };
  }
}
