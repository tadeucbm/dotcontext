import {
  HostHarnessHookAdapter,
  type HarnessHookResponse,
  type HostHookAdapterOptions,
} from '../../shared';

export type CodexHookEvent = unknown;
export type CodexHookResponse = HarnessHookResponse;
export interface CodexHookAdapterOptions<TEnvelope = CodexHookEvent>
  extends HostHookAdapterOptions<TEnvelope> {}

export class CodexHarnessHookAdapter<TEnvelope = CodexHookEvent>
  extends HostHarnessHookAdapter<TEnvelope> {
  constructor(options: CodexHookAdapterOptions<TEnvelope>) {
    super('codex', options);
  }
}

export function createCodexHookAdapter<TEnvelope = CodexHookEvent>(
  options: CodexHookAdapterOptions<TEnvelope>
): CodexHarnessHookAdapter<TEnvelope> {
  return new CodexHarnessHookAdapter<TEnvelope>(options);
}
