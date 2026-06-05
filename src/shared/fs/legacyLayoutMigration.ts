/**
 * Legacy `.context` layout migration.
 *
 * The on-disk data folder was reorganized from a single `.context/harness`
 * (which mixed authored config with generated state) into:
 *   - `.context/config`  — authored config (policy.json, sensors.json)
 *   - `.context/runtime` — generated state (sessions, workflows, …)
 *
 * Durable artifacts (config + workflow state + contracts) are migrated in place
 * on first access so existing checkouts keep working. Contracts are durable too:
 * prevc.json bindings reference task contracts by id, so they must travel with
 * the workflow state. Ephemeral, gitignored state (sessions, traces, artifacts,
 * datasets, replays) is intentionally NOT migrated — it regenerates, and the old
 * session layout (flat files) does not map cleanly onto the new per-session
 * folders.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { resolveRuntimeLayout } from './pathHelpers';

// `completed` holds paths whose migration has fully finished. `inflight` holds
// the in-progress async migration per path so concurrent async callers await the
// same operation instead of short-circuiting on a "started but not finished"
// flag. The sync variant performs its own blocking moves, so it is correct on
// its own and only needs to consult `completed` to avoid redundant work.
const completed = new Set<string>();
const inflight = new Map<string, Promise<void>>();

// Tracks `from -> to` pairs whose divergence has already been reported, so the
// warning is emitted once per pair regardless of how many sync/async passes run.
const warnedDivergences = new Set<string>();

interface Move {
  from: string;
  to: string;
}

/**
 * Report — once per `from`/`to` pair — that both the legacy and new locations
 * hold data. The new layout wins and the legacy copy is left untouched; we never
 * overwrite or merge.
 */
function warnDivergence(from: string, to: string): void {
  const key = from + '\0' + to;
  if (warnedDivergences.has(key)) {
    return;
  }
  warnedDivergences.add(key);
  console.warn(
    '[dotcontext] legacy .context layout divergence: both ' +
      from +
      ' (legacy) and ' +
      to +
      ' (new) exist; the new location wins and the legacy copy is left untouched.',
  );
}

/**
 * Durable artifacts to relocate from the legacy layout. Order does not matter;
 * each move is guarded by source-exists / destination-missing checks.
 */
function legacyMoves(contextPath: string): Move[] {
  const layout = resolveRuntimeLayout(contextPath);
  const legacyHarness = path.join(contextPath, 'harness');
  const legacyWorkflow = path.join(contextPath, 'workflow');

  return [
    // Authored config: harness/{policy,sensors}.json -> config/
    { from: path.join(legacyHarness, 'policy.json'), to: layout.policyFile },
    { from: path.join(legacyHarness, 'sensors.json'), to: layout.sensorsFile },
    // Durable workflow state: harness/workflows -> runtime/workflows
    { from: path.join(legacyHarness, 'workflows', 'prevc.json'), to: layout.prevcFile },
    { from: path.join(legacyHarness, 'workflows', 'archive'), to: layout.workflowsArchiveDir },
    // Durable contracts: prevc bindings reference task contracts by id, so the
    // contracts dir must travel with the workflow state.
    { from: path.join(legacyHarness, 'contracts'), to: layout.contractsDir },
    // Collaboration + plan tracking: workflow/ -> runtime/workflows/
    {
      from: path.join(legacyWorkflow, 'collaboration-sessions.json'),
      to: layout.collaborationFile,
    },
    { from: path.join(legacyWorkflow, 'plans.json'), to: path.join(layout.workflowsDir, 'plans.json') },
    {
      from: path.join(legacyWorkflow, 'plan-tracking'),
      to: path.join(layout.workflowsDir, 'plan-tracking'),
    },
  ];
}

/**
 * Migrate durable artifacts from the legacy `.context/harness` layout to the
 * config/runtime split. Idempotent and memoized per `.context` path.
 */
export async function migrateLegacyContextLayout(contextPath: string): Promise<void> {
  const resolved = path.resolve(contextPath);
  if (completed.has(resolved)) {
    return;
  }
  const existing = inflight.get(resolved);
  if (existing) {
    return existing;
  }

  const run = (async () => {
    try {
      for (const { from, to } of legacyMoves(resolved)) {
        if (from === to) {
          continue;
        }
        const fromExists = await fs.pathExists(from);
        const toExists = await fs.pathExists(to);
        if (!fromExists) {
          continue;
        }
        if (toExists) {
          // Divergence: both legacy and new locations hold data. The new layout
          // wins; the legacy copy is left untouched (no overwrite, no merge).
          warnDivergence(from, to);
          continue;
        }
        await fs.ensureDir(path.dirname(to));
        await fs.move(from, to, { overwrite: false });
      }
      completed.add(resolved);
    } catch (err) {
      // Best-effort: a failed migration must never block normal operation.
      // Leaving `resolved` out of `completed` lets a later call retry.
      console.warn(
        '[dotcontext] legacy .context layout migration failed (best-effort, will retry): ' +
          (err && (err as Error).message ? (err as Error).message : String(err)),
      );
    } finally {
      inflight.delete(resolved);
    }
  })();

  inflight.set(resolved, run);
  return run;
}

/**
 * Synchronous counterpart for sync read paths (status detection, CLI).
 * Shares the memoization cache with the async version.
 */
export function migrateLegacyContextLayoutSync(contextPath: string): void {
  const resolved = path.resolve(contextPath);
  if (completed.has(resolved)) {
    return;
  }

  try {
    for (const { from, to } of legacyMoves(resolved)) {
      if (from === to) {
        continue;
      }
      const fromExists = fs.existsSync(from);
      const toExists = fs.existsSync(to);
      if (!fromExists) {
        continue;
      }
      if (toExists) {
        // Divergence: both legacy and new locations hold data. The new layout
        // wins; the legacy copy is left untouched (no overwrite, no merge).
        warnDivergence(from, to);
        continue;
      }
      fs.ensureDirSync(path.dirname(to));
      fs.moveSync(from, to, { overwrite: false });
    }
    completed.add(resolved);
  } catch (err) {
    // Best-effort: leave `resolved` uncompleted so a later call retries.
    console.warn(
      '[dotcontext] legacy .context layout migration failed (best-effort, will retry): ' +
        (err && (err as Error).message ? (err as Error).message : String(err)),
    );
  }
}

/**
 * Test-only: reset the memoization cache.
 */
export function resetLegacyMigrationCacheForTests(): void {
  completed.clear();
  inflight.clear();
  warnedDivergences.clear();
}
