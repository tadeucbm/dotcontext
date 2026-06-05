import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import {
  migrateLegacyContextLayout,
  resetLegacyMigrationCacheForTests,
} from '../legacyLayoutMigration';
import { resolveRuntimeLayout } from '../pathHelpers';

describe('migrateLegacyContextLayout', () => {
  let tempDir: string;
  let contextPath: string;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    resetLegacyMigrationCacheForTests();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-layout-'));
    contextPath = path.join(tempDir, '.context');
    await fs.ensureDir(contextPath);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    await fs.remove(tempDir);
  });

  /** Seed the legacy `.context/harness` + `.context/workflow` durable artifacts. */
  async function seedLegacyLayout(taskId: string): Promise<void> {
    const legacyHarness = path.join(contextPath, 'harness');
    const legacyWorkflow = path.join(contextPath, 'workflow');
    await fs.outputJson(path.join(legacyHarness, 'policy.json'), {
      from: 'legacy',
    });
    await fs.outputJson(path.join(legacyHarness, 'workflows', 'prevc.json'), {
      phase: 'P',
    });
    await fs.outputJson(
      path.join(legacyHarness, 'contracts', 'tasks', `${taskId}.json`),
      { id: taskId },
    );
    await fs.outputJson(
      path.join(legacyWorkflow, 'collaboration-sessions.json'),
      { sessions: [] },
    );
  }

  it('moves durable artifacts to the new layout and removes the legacy ones', async () => {
    const taskId = 'task-alpha';
    await seedLegacyLayout(taskId);

    await migrateLegacyContextLayout(contextPath);

    const layout = resolveRuntimeLayout(contextPath);
    const newTaskFile = path.join(layout.contractTasksDir, `${taskId}.json`);

    // New locations exist with the migrated contents.
    expect(await fs.pathExists(layout.policyFile)).toBe(true);
    expect(await fs.readJson(layout.policyFile)).toEqual({ from: 'legacy' });
    expect(await fs.pathExists(layout.prevcFile)).toBe(true);
    expect(await fs.readJson(layout.prevcFile)).toEqual({ phase: 'P' });
    expect(await fs.pathExists(newTaskFile)).toBe(true);
    expect(await fs.readJson(newTaskFile)).toEqual({ id: taskId });
    expect(await fs.pathExists(layout.collaborationFile)).toBe(true);
    expect(await fs.readJson(layout.collaborationFile)).toEqual({ sessions: [] });

    // Legacy locations are gone.
    const legacyHarness = path.join(contextPath, 'harness');
    const legacyWorkflow = path.join(contextPath, 'workflow');
    expect(await fs.pathExists(path.join(legacyHarness, 'policy.json'))).toBe(false);
    expect(
      await fs.pathExists(path.join(legacyHarness, 'workflows', 'prevc.json')),
    ).toBe(false);
    expect(
      await fs.pathExists(path.join(legacyHarness, 'contracts')),
    ).toBe(false);
    expect(
      await fs.pathExists(path.join(legacyWorkflow, 'collaboration-sessions.json')),
    ).toBe(false);
  });

  it('is idempotent: a re-run does not throw and leaves files in place', async () => {
    const taskId = 'task-beta';
    await seedLegacyLayout(taskId);

    await migrateLegacyContextLayout(contextPath);
    // Reset the cache so the second pass actually re-evaluates the layout.
    resetLegacyMigrationCacheForTests();
    await expect(migrateLegacyContextLayout(contextPath)).resolves.toBeUndefined();

    const layout = resolveRuntimeLayout(contextPath);
    const newTaskFile = path.join(layout.contractTasksDir, `${taskId}.json`);
    expect(await fs.pathExists(layout.policyFile)).toBe(true);
    expect(await fs.pathExists(layout.prevcFile)).toBe(true);
    expect(await fs.pathExists(newTaskFile)).toBe(true);
    expect(await fs.pathExists(layout.collaborationFile)).toBe(true);
  });

  it('does not overwrite a diverged new location: the new copy wins', async () => {
    const layout = resolveRuntimeLayout(contextPath);

    // Both legacy and new policy.json exist with different contents.
    await fs.outputJson(path.join(contextPath, 'harness', 'policy.json'), {
      source: 'legacy',
    });
    await fs.outputJson(layout.policyFile, { source: 'new' });

    await expect(migrateLegacyContextLayout(contextPath)).resolves.toBeUndefined();

    // The new location is untouched (it wins); the legacy copy is left in place.
    expect(await fs.readJson(layout.policyFile)).toEqual({ source: 'new' });
    expect(
      await fs.readJson(path.join(contextPath, 'harness', 'policy.json')),
    ).toEqual({ source: 'legacy' });
  });
});
