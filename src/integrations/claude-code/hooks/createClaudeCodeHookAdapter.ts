import {
  HostHarnessHookAdapter,
  type HarnessHookResponse,
  type HostHookAdapterOptions,
} from '../../shared';

export type ClaudeCodeHookEvent = unknown;
export type ClaudeCodeHookResponse = HarnessHookResponse;
export interface ClaudeCodeHookAdapterOptions<TEnvelope = ClaudeCodeHookEvent>
  extends HostHookAdapterOptions<TEnvelope> {}

export class ClaudeCodeHarnessHookAdapter<TEnvelope = ClaudeCodeHookEvent>
  extends HostHarnessHookAdapter<TEnvelope> {
  constructor(options: ClaudeCodeHookAdapterOptions<TEnvelope>) {
    super('claude-code', options);
  }
}

export function createClaudeCodeHookAdapter<TEnvelope = ClaudeCodeHookEvent>(
  options: ClaudeCodeHookAdapterOptions<TEnvelope>
): ClaudeCodeHarnessHookAdapter<TEnvelope> {
  return new ClaudeCodeHarnessHookAdapter<TEnvelope>(options);
}
