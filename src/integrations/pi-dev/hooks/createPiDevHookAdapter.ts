import {
  HostHarnessHookAdapter,
  type HarnessHookResponse,
  type HostHookAdapterOptions,
} from '../../shared';

export type PiDevHookEvent = unknown;
export type PiDevHookResponse = HarnessHookResponse;
export interface PiDevHookAdapterOptions<TEnvelope = PiDevHookEvent>
  extends HostHookAdapterOptions<TEnvelope> {}

export class PiDevHarnessHookAdapter<TEnvelope = PiDevHookEvent>
  extends HostHarnessHookAdapter<TEnvelope> {
  constructor(options: PiDevHookAdapterOptions<TEnvelope>) {
    super('pi-dev', options);
  }
}

export function createPiDevHookAdapter<TEnvelope = PiDevHookEvent>(
  options: PiDevHookAdapterOptions<TEnvelope>
): PiDevHarnessHookAdapter<TEnvelope> {
  return new PiDevHarnessHookAdapter<TEnvelope>(options);
}
