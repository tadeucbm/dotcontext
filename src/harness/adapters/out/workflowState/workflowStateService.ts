/**
 * Harness Workflow State Service
 *
 * Canonical persistence for workflow orchestration state. PREVC status now
 * lives under .context/runtime/workflows and legacy status.yaml is only read
 * for migration.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import type { PrevcStatus } from '../../../domain/workflow/types';
import { resolveRuntimeLayout, type RuntimeLayout } from '../../../../shared/fs/pathHelpers';
import {
  migrateLegacyContextLayout,
  migrateLegacyContextLayoutSync,
} from '../../../../shared/fs/legacyLayoutMigration';

export interface HarnessWorkflowStateServiceOptions {
  contextPath: string;
}

export interface WorkflowHarnessBinding {
  workflowName: string;
  sessionId: string;
  activeTaskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessWorkflowRecord {
  version: 2;
  workflowType: 'prevc';
  updatedAt: string;
  status: PrevcStatus;
  binding: WorkflowHarnessBinding | null;
}

export class HarnessWorkflowStateService {
  constructor(private readonly options: HarnessWorkflowStateServiceOptions) {}

  private get contextPath(): string {
    return path.resolve(this.options.contextPath);
  }

  private get layout(): RuntimeLayout {
    return resolveRuntimeLayout(this.contextPath);
  }

  private get workflowsPath(): string {
    return this.layout.workflowsDir;
  }

  private get currentPath(): string {
    return this.layout.prevcFile;
  }

  private get archivePath(): string {
    return this.layout.workflowsArchiveDir;
  }

  private get legacyBindingPath(): string {
    return path.join(this.contextPath, 'workflow', 'harness-session.json');
  }

  private async ensureMigrated(): Promise<void> {
    await migrateLegacyContextLayout(this.contextPath);
  }

  private ensureMigratedSync(): void {
    migrateLegacyContextLayoutSync(this.contextPath);
  }

  private async ensureLayout(): Promise<void> {
    await this.ensureMigrated();
    await fs.ensureDir(this.workflowsPath);
  }

  private normalizeBinding(value: unknown): WorkflowHarnessBinding | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as Partial<WorkflowHarnessBinding>;
    if (
      typeof candidate.workflowName !== 'string' ||
      candidate.workflowName.length === 0 ||
      typeof candidate.sessionId !== 'string' ||
      candidate.sessionId.length === 0 ||
      typeof candidate.createdAt !== 'string' ||
      candidate.createdAt.length === 0 ||
      typeof candidate.updatedAt !== 'string' ||
      candidate.updatedAt.length === 0
    ) {
      return null;
    }

    return {
      workflowName: candidate.workflowName,
      sessionId: candidate.sessionId,
      activeTaskId: typeof candidate.activeTaskId === 'string' && candidate.activeTaskId.length > 0
        ? candidate.activeTaskId
        : undefined,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    };
  }

  private normalizeRecord(
    record: unknown,
    legacyBinding: WorkflowHarnessBinding | null
  ): HarnessWorkflowRecord {
    const candidate = record as Partial<HarnessWorkflowRecord> & { status?: PrevcStatus };
    if (!candidate || typeof candidate !== 'object' || !candidate.status) {
      throw new Error('Invalid harness workflow record');
    }

    return {
      version: 2,
      workflowType: 'prevc',
      updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt.length > 0
        ? candidate.updatedAt
        : new Date().toISOString(),
      status: candidate.status,
      binding: this.normalizeBinding(candidate.binding) ?? legacyBinding,
    };
  }

  private async readLegacyBinding(): Promise<WorkflowHarnessBinding | null> {
    if (!(await fs.pathExists(this.legacyBindingPath))) {
      return null;
    }

    try {
      const binding = await fs.readJson(this.legacyBindingPath);
      return this.normalizeBinding(binding);
    } catch {
      return null;
    }
  }

  private readLegacyBindingSync(): WorkflowHarnessBinding | null {
    if (!fs.existsSync(this.legacyBindingPath)) {
      return null;
    }

    try {
      const binding = fs.readJsonSync(this.legacyBindingPath);
      return this.normalizeBinding(binding);
    } catch {
      return null;
    }
  }

  private async writeRecord(record: HarnessWorkflowRecord): Promise<void> {
    await this.ensureLayout();
    await fs.writeJson(this.currentPath, record, { spaces: 2 });
    if (await fs.pathExists(this.legacyBindingPath)) {
      await fs.remove(this.legacyBindingPath);
    }
  }

  async exists(): Promise<boolean> {
    await this.ensureMigrated();
    return fs.pathExists(this.currentPath);
  }

  existsSync(): boolean {
    this.ensureMigratedSync();
    return fs.existsSync(this.currentPath);
  }

  async loadRecord(): Promise<HarnessWorkflowRecord> {
    await this.ensureMigrated();
    const raw = await fs.readJson(this.currentPath);
    const legacyBinding = await this.readLegacyBinding();
    const record = this.normalizeRecord(raw, legacyBinding);

    const shouldRewrite =
      (raw as Partial<HarnessWorkflowRecord>).version !== 2 ||
      (legacyBinding !== null && this.normalizeBinding((raw as Partial<HarnessWorkflowRecord>).binding) === null);

    if (shouldRewrite) {
      await this.writeRecord(record);
    }

    return record;
  }

  async load(): Promise<PrevcStatus> {
    const record = await this.loadRecord();
    return record.status;
  }

  loadRecordSync(): HarnessWorkflowRecord {
    this.ensureMigratedSync();
    const raw = fs.readJsonSync(this.currentPath);
    const legacyBinding = this.readLegacyBindingSync();
    return this.normalizeRecord(raw, legacyBinding);
  }

  loadSync(): PrevcStatus {
    const record = this.loadRecordSync();
    return record.status;
  }

  async save(status: PrevcStatus): Promise<void> {
    const binding = (await this.exists())
      ? (await this.loadRecord()).binding
      : await this.readLegacyBinding();
    const record: HarnessWorkflowRecord = {
      version: 2,
      workflowType: 'prevc',
      updatedAt: new Date().toISOString(),
      status,
      binding,
    };
    await this.writeRecord(record);
  }

  async getBinding(): Promise<WorkflowHarnessBinding | null> {
    if (!(await this.exists())) {
      return this.readLegacyBinding();
    }

    return (await this.loadRecord()).binding;
  }

  async saveBinding(binding: WorkflowHarnessBinding | null): Promise<void> {
    if (!(await this.exists())) {
      throw new Error('Workflow status not found. Initialize a workflow before binding a harness session.');
    }

    const record = await this.loadRecord();
    record.binding = binding;
    record.updatedAt = new Date().toISOString();
    await this.writeRecord(record);
  }

  async remove(): Promise<void> {
    if (await fs.pathExists(this.currentPath)) {
      await fs.remove(this.currentPath);
    }
    if (await fs.pathExists(this.legacyBindingPath)) {
      await fs.remove(this.legacyBindingPath);
    }
  }

  async archive(name: string): Promise<void> {
    await fs.ensureDir(this.archivePath);
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (await fs.pathExists(this.currentPath)) {
      await fs.move(
        this.currentPath,
        path.join(this.archivePath, `${safeName}-${timestamp}.json`)
      );
    }
    if (await fs.pathExists(this.legacyBindingPath)) {
      await fs.move(
        this.legacyBindingPath,
        path.join(this.archivePath, `${safeName}-${timestamp}.legacy-binding.json`)
      );
    }
  }
}
