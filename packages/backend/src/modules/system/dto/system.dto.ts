import { type } from 'arktype';
import { createArkDto } from 'nestjs-arktype';

const loadSchema = type({
  diskUsed: 'number = 0',
  diskSize: 'number = 0',
  percentUsed: 'number = 0',
  cpuLoad: 'number = 0',
  memoryTotal: 'number = 0',
  percentUsedMemory: 'number = 0',
  zpoolName: 'string | null | undefined',
  zpoolHealth: 'string | null | undefined',
  zpoolCap: 'number | null | undefined',
});

// Load
export class LoadDto extends createArkDto(loadSchema, { name: 'LoadDto' }) {}

// Restart
const restartSchema = type({
  success: 'boolean',
  message: 'string?',
});

// Update
const updateSchema = type({
  success: 'boolean',
  message: 'string?',
});

export class RestartDto extends createArkDto(restartSchema, { name: 'RestartDto' }) {}
export class UpdateDto extends createArkDto(updateSchema, { name: 'UpdateDto' }) {}