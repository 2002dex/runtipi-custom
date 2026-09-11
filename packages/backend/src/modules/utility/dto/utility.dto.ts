import { type } from 'arktype';
import { createArkDto } from 'nestjs-arktype';

const connectionHelpSchema = type({
  windows: 'string',
  linux: 'string',
  mac: 'string',
  putty: 'string',
});

const sshInfoSchema = type({
  host: 'string',
  port: 'number',
  username: 'string',
  password: 'string',
  connectionHelp: connectionHelpSchema,
});

const ultraviewerInfoSchema = type({
  downloadUrl: 'string',
  subtitle: 'string',
});

const remoteAccessSchema = type({
  ultraviewer: ultraviewerInfoSchema,
  ssh: sshInfoSchema,
});

export class RemoteAccessDto extends createArkDto(remoteAccessSchema, { name: 'RemoteAccessDto' }) {}
