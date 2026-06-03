import {
  createClaudeCodeHookAdapter,
  createCodexHookAdapter,
  createPiDevHookAdapter,
} from '..';

describe('host hook integrations', () => {
  const runtime = {
    execute: jest.fn().mockResolvedValue({
      kind: 'json',
      data: { ok: true },
    }),
  };

  beforeEach(() => {
    runtime.execute.mockClear();
  });

  it.each([
    ['claude-code', createClaudeCodeHookAdapter],
    ['codex', createCodexHookAdapter],
    ['pi-dev', createPiDevHookAdapter],
  ])('creates a %s hook adapter over the generic harness hook contract', async (source, createAdapter) => {
    const adapter = createAdapter({ runtime });

    const response = await adapter.handle({
      tool: 'context',
      params: { action: 'check' },
    });

    expect(runtime.execute).toHaveBeenCalledWith({
      tool: 'context',
      params: { action: 'check' },
    });
    expect(response.ok).toBe(true);
    expect(response.source).toBe(source);
  });

  it('forces the host source after mapping the event envelope', async () => {
    const adapter = createCodexHookAdapter({
      runtime,
      mapEvent: (event: { operation: string }) => ({
        tool: 'context',
        source: 'claude-code',
        requestId: event.operation,
        params: { action: 'check' },
      }),
    });

    const response = await adapter.handle({ operation: 'op-1' });

    expect(runtime.execute).toHaveBeenCalledWith({
      tool: 'context',
      params: { action: 'check' },
    });
    expect(response.ok).toBe(true);
    expect(response.source).toBe('codex');
    expect(response.requestId).toBe('op-1');
  });
});
