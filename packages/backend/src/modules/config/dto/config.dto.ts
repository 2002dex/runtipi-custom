import { type } from 'arktype';
import { createArkDto } from 'nestjs-arktype';

/* ---------- Info ---------- */
const infoSchema = type({
  internalIp: 'string',
});

export class InfoDto extends createArkDto(infoSchema, { name: 'InfoDto' }) {}

/* ---------- AppStatus ---------- */
const appStatusSchema = type({
  installed: 'boolean',
  urn: 'string?',
});

export class AppStatusDto extends createArkDto(appStatusSchema, { name: 'AppStatusDto' }) {}

/* ---------- CameraInput ---------- */
const cameraInputSchema = type({
  path: 'string',
  roles: type('string[]').default(() => []),
});

export class CameraInputDto extends createArkDto(cameraInputSchema, { name: 'CameraInputDto' }) {}

/* ---------- Camera ---------- */
const cameraSchema = type({
  name: 'string',
  ip: 'string?',
  user: 'string?',
  password: 'string?',
  inputs: type({ path: 'string', roles: type('string[]').default(() => []) })
    .array()
    .default(() => []),
  objects: type('string[]').default(() => []),
  record: type('boolean').default(true),
});

export class CameraDto extends createArkDto(cameraSchema, { name: 'CameraDto' }) {}

/* ---------- FrigateConfig ---------- */
const frigateConfigSchema = type({
  cameras: cameraSchema.array(),
});

export class FrigateConfigDto extends createArkDto(frigateConfigSchema, { name: 'FrigateConfigDto' }) {}

/* ---------- SyncResponse ---------- */
const syncResponseSchema = type({
  success: 'boolean',
  message: 'string?',
});

export class SyncResponseDto extends createArkDto(syncResponseSchema, { name: 'SyncResponseDto' }) {}

/* ---------- Username / SetUser ---------- */
const usernameSchema = type({
  username: 'string > 0',
});

export class UsernameDto extends createArkDto(usernameSchema, { name: 'UsernameDto' }) {}
export class SetUserDto extends createArkDto(usernameSchema, { name: 'SetUserDto' }) {}

/* ---------- FileEntry ---------- */
const fileEntrySchema = type({
  path: 'string',
  type: 'string',
  is_original: 'boolean?',
});

export class FileEntryDto extends createArkDto(fileEntrySchema, { name: 'FileEntryDto' }) {}

/* ---------- Entries ---------- */
const entriesSchema = type({
  entries: fileEntrySchema.array(),
});

export class EntriesDto extends createArkDto(entriesSchema, { name: 'EntriesDto' }) {}

/* ---------- SelectedWrite ---------- */
const selectedWriteSchema = type({
  selected: fileEntrySchema.array(),
});

export class SelectedWriteDto extends createArkDto(selectedWriteSchema, { name: 'SelectedWriteDto' }) {}

/* ---------- UsersList ---------- */
const usersListSchema = type({
  users: 'string[]',
});

export class UsersListDto extends createArkDto(usersListSchema, { name: 'UsersListDto' }) {}

/* ---------- OkPath ---------- */
const okPathSchema = type({
  ok: 'boolean',
  path: 'string?',
});

export class OkPathDto extends createArkDto(okPathSchema, { name: 'OkPathDto' }) {}

/* ---------- OkCount ---------- */
const okCountSchema = type({
  ok: 'boolean',
  count: 'number',
});

export class OkCountDto extends createArkDto(okCountSchema, { name: 'OkCountDto' }) {}

/* ---------- OkOnly ---------- */
const okOnlySchema = type({
  ok: 'boolean',
});

export class OkOnlyDto extends createArkDto(okOnlySchema, { name: 'OkOnlyDto' }) {}

/* ---------- External USB ---------- */
const usbDeviceSchema = type({
  device: 'string',
  model: 'string | null | undefined',
  size: 'string | null | undefined',
  mountpoint: 'string | null | undefined',
  uuid: 'string | null | undefined',
  label: 'string | null | undefined',
});

const usbListSchema = type({
  devices: usbDeviceSchema.array(),
  error: 'string?',
});

const usbSelectSchema = type({
  device: 'string > 0',
});

const usbOpSchema = type({
  ok: 'boolean',
  error: 'string?',
});

const usbAppSelectSchema = type({
  app: 'string > 0',
});

const usbSelectedSchema = type({
  device: 'string | null | undefined',
  app: 'string | null | undefined',
  mounted: 'boolean',
});

const installedAppsSchema = type({
  nextcloud: 'boolean',
  jellyfin: 'boolean',
  immich: 'boolean',
});

export class UsbListDto extends createArkDto(usbListSchema, { name: 'UsbListDto' }) {}
export class UsbSelectDto extends createArkDto(usbSelectSchema, { name: 'UsbSelectDto', input: true }) {}
export class UsbOpDto extends createArkDto(usbOpSchema, { name: 'UsbOpDto' }) {}
export class UsbAppSelectDto extends createArkDto(usbAppSelectSchema, { name: 'UsbAppSelectDto', input: true }) {}
export class UsbSelectedDto extends createArkDto(usbSelectedSchema, { name: 'UsbSelectedDto' }) {}
export class InstalledAppsDto extends createArkDto(installedAppsSchema, { name: 'InstalledAppsDto' }) {}

/* ---------- Time Machine ---------- */
const timeMachineConfigSchema = type({
  enabled: 'boolean',
  quota: 'string > 0',
});

const timeMachineStatusSchema = type({
  enabled: 'boolean',
  quota: 'string',
  username: 'string',
  password: 'string',
  share: 'string',
  mountpoint: 'string',
  status: 'string',
  message: 'string?',
  error: 'string?',
});

export class TimeMachineConfigDto extends createArkDto(timeMachineConfigSchema, { name: 'TimeMachineConfigDto', input: true }) {}
export class TimeMachineStatusDto extends createArkDto(timeMachineStatusSchema, { name: 'TimeMachineStatusDto' }) {}

/* ---------- SMB Shares ---------- */
const smbShareSchema = type({
  id: 'string > 0',
  name: 'string > 0',
  quota: 'string > 0',
  type: 'string?',
  dataset: 'string?',
  mountpoint: 'string?',
});

const smbShareUpdateSchema = type({
  name: 'string?',
  quota: 'string?',
  type: 'string?',
});

const smbSharesConfigSchema = type({
  enabled: 'boolean',
  password: 'string?',
  deleteShares: type('string[]').default(() => []),
  shares: smbShareSchema.array(),
});

const smbShareStatusSchema = type({
  id: 'string',
  name: 'string',
  quota: 'string',
  type: 'string',
  dataset: 'string',
  mountpoint: 'string',
});

const smbQuotaDetailsSchema = type({
  id: 'string?',
  share: 'string?',
  dataset: 'string?',
  requestedQuota: 'string?',
  currentQuota: 'string?',
  currentUsed: 'string?',
  zfsError: 'string?',
});

const smbSharesStatusSchema = type({
  enabled: 'boolean',
  username: 'string',
  shares: smbShareSchema.array(),
  appliedShares: smbShareStatusSchema.array(),
  passwordSet: 'boolean',
  storageTotalBytes: 'number',
  storageFreeBytes: 'number',
  status: 'string',
  message: 'string?',
  error: 'string?',
  quotaDetails: smbQuotaDetailsSchema.optional(),
});

export class SmbSharesConfigDto extends createArkDto(smbSharesConfigSchema, { name: 'SmbSharesConfigDto', input: true }) {}
export class SmbShareUpdateDto extends createArkDto(smbShareUpdateSchema, { name: 'SmbShareUpdateDto', input: true }) {}
export class SmbSharesStatusDto extends createArkDto(smbSharesStatusSchema, { name: 'SmbSharesStatusDto' }) {}

/* ---------- IPv6 Verify ---------- */
const ipv6VerifySchema = type({
  supported: 'boolean',
  ipv6: 'string?',
  message: 'string',
});

export class Ipv6VerifyDto extends createArkDto(ipv6VerifySchema, { name: 'Ipv6VerifyDto' }) {}
