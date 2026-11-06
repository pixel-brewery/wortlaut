// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import type {
  ChangeSet,
  ChangeSetFile,
  ReviewDetail,
  ReviewDetailRequest,
  ReviewFile,
  ReviewItem,
  ReviewLine,
  WorkspaceRecord,
} from '@pixel-brewery/wortlaut-contracts';
import { structuredPatch } from 'diff';
import { PathResolver } from '../paths/PathResolver.js';
import type { WorkspaceService } from '../workspaces/WorkspaceService.js';
import { ChangeSetBuilder } from './ChangeSetBuilder.js';
import type { ReviewList } from './ReviewList.js';

// #endregion

/**
 * The most lines of a diff that one file shows.
 */
const MAX_DIFF_LINES = 4000;

/**
 * The most diff text one file preview exposes, including a file with a single very long line.
 */
const MAX_DIFF_TEXT_LENGTH = 128 * 1024;

/**
 * How long working out one diff may take.
 */
const DIFF_TIMEOUT_MS = 2000;

/**
 * The review list as Review shows it: paths only as display values, with a true word on what changed since a set was built.
 *
 * @public
 */
export class ReviewService {
  // #region Fields

  private readonly _reviewList: ReviewList;
  private readonly _workspaces: WorkspaceService;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ReviewService` class.
   *
   * @param reviewList The review list.
   * @param workspaces The workspaces.
   */
  public constructor(reviewList: ReviewList, workspaces: WorkspaceService) {
    this._reviewList = reviewList;
    this._workspaces = workspaces;
  }

  // #endregion

  // #region Methods

  /**
   * Lists the pending change sets of a workspace, newest first.
   *
   * @public
   * @param workspaceId The workspace.
   * @returns The list.
   */
  public list(workspaceId: string): Array<ReviewItem> {
    const workspace = this._workspaces.require(workspaceId);

    return this.pendingOf(workspace)
      .map((changeSet) => this.itemOf(changeSet, workspace))
      .reverse();
  }

  /**
   * Counts the pending change sets of a workspace.
   *
   * @public
   * @param workspaceId The workspace.
   * @returns The number.
   */
  public count(workspaceId: string): number {
    return this.pendingOf(this._workspaces.require(workspaceId)).length;
  }

  /**
   * Returns a pending change set with its diffs.
   *
   * @public
   * @param id The change set.
   * @param paging The requested file previews; omitted fields preserve the complete detail.
   * @returns The details.
   * @throws EngineError when the review list does not hold it.
   */
  public detail(
    id: string,
    paging?: Pick<ReviewDetailRequest, 'fileOffset' | 'fileLimit'>,
  ): ReviewDetail {
    const changeSet = this._reviewList.get(id);
    const workspace = this.workspaceOf(changeSet);
    const offset = paging?.fileOffset ?? 0;
    const files = changeSet.files.slice(
      offset,
      paging?.fileLimit === undefined ? undefined : offset + paging.fileLimit,
    );

    return {
      ...this.itemOf(changeSet, workspace),
      files: files.map((file) => this.fileOf(file)),
      findings: changeSet.findings.map((finding) => finding.message),
    };
  }

  /**
   * Removes older pending change sets that a new one repeats, so running a command twice leaves one thing to review.
   *
   * @public
   * @param changeSet The new change set.
   */
  public removeRepeats(changeSet: ChangeSet): void {
    const fingerprint = (candidate: ChangeSet): string =>
      candidate.files
        .map((file) => `${file.path}:${file.oldHash}:${file.newHash}`)
        .sort((a, b) => a.localeCompare(b))
        .join('|');
    const own = fingerprint(changeSet);

    for (const candidate of this._reviewList.list()) {
      if (
        candidate.id !== changeSet.id &&
        candidate.source.command === changeSet.source.command &&
        fingerprint(candidate) === own
      ) {
        this._reviewList.remove(candidate.id);
      }
    }
  }

  /**
   * Works out the diff of a file of a change that is only being looked at.
   *
   * @public
   * @param file The file.
   * @returns The file with its diff.
   */
  public previewFile(file: ChangeSetFile): ReviewFile {
    return this.fileOf(file);
  }

  /**
   * @private
   */
  private pendingOf(workspace: WorkspaceRecord): Array<ChangeSet> {
    const folders = [
      ...workspace.repositories,
      ...workspace.projects.map((project) => project.folder),
    ];

    return this._reviewList
      .list()
      .filter((changeSet) =>
        folders.some((folder) => PathResolver.isInside(folder, changeSet.cwd)),
      );
  }

  /**
   * @private
   */
  private workspaceOf(changeSet: ChangeSet): WorkspaceRecord | null {
    return (
      this._workspaces
        .all()
        .find((workspace) =>
          [...workspace.repositories, ...workspace.projects.map((project) => project.folder)].some(
            (folder) => PathResolver.isInside(folder, changeSet.cwd),
          ),
        ) ?? null
    );
  }

  /**
   * @private
   */
  private itemOf(changeSet: ChangeSet, workspace: WorkspaceRecord | null): ReviewItem {
    return {
      id: changeSet.id,
      command: changeSet.source.command,
      surface: changeSet.source.surface,
      detail: changeSet.source.detail,
      createdAt: changeSet.createdAt,
      projectName:
        workspace?.projects.find((project) => PathResolver.isInside(project.folder, changeSet.cwd))
          ?.name ?? null,
      partial: changeSet.partial,
      fileCount: changeSet.files.length,
      findingCount: changeSet.findings.length,
      conflicts: changeSet.files
        .filter((file) => this.hasChanged(file))
        .map((file) => file.displayPath),
    };
  }

  /**
   * @private
   */
  private hasChanged(file: ChangeSetFile): boolean {
    const hash = existsSync(file.path) ? ChangeSetBuilder.hash(readFileSync(file.path)) : null;

    return hash !== file.oldHash;
  }

  /**
   * Works out the diff of a file. A change too big to work out in time, such as a sort of a very large catalog, shows its
   * size without its lines.
   *
   * @private
   */
  private fileOf(file: ChangeSetFile): ReviewFile {
    const patch = structuredPatch('', '', file.oldContent ?? '', file.newContent, '', '', {
      context: 3,
      timeout: DIFF_TIMEOUT_MS,
    }) as ReturnType<typeof structuredPatch> | undefined;
    const base = {
      file: file.displayPath,
      action: file.action,
      hasConflict: this.hasChanged(file),
    };

    if (!patch) {
      return {
        ...base,
        additions: file.newContent.split('\n').length,
        deletions: (file.oldContent ?? '').split('\n').length,
        hunks: [],
        truncated: true,
      };
    }

    const hunks = new Array<{ lines: Array<ReviewLine> }>();
    let additions = 0;
    let deletions = 0;
    let shown = 0;
    let shownText = 0;
    let truncated = false;

    for (const hunk of patch.hunks) {
      const lines = new Array<ReviewLine>();
      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      for (const line of hunk.lines) {
        const sign = line[0];

        if (sign === '\\') {
          continue;
        }

        if (sign === '+') {
          additions++;
        } else if (sign === '-') {
          deletions++;
        }

        if (shown >= MAX_DIFF_LINES || shownText >= MAX_DIFF_TEXT_LENGTH) {
          truncated = true;
        } else {
          const text = line.slice(1);
          const remaining = MAX_DIFF_TEXT_LENGTH - shownText;
          const preview = text.slice(0, remaining);

          if (preview.length < text.length) {
            truncated = true;
          }

          shown++;
          shownText += preview.length;
          lines.push({
            kind: sign === '+' ? 'add' : sign === '-' ? 'remove' : 'context',
            text: preview,
            oldLine: sign === '+' ? null : oldLine,
            newLine: sign === '-' ? null : newLine,
          });
        }

        oldLine += sign === '+' ? 0 : 1;
        newLine += sign === '-' ? 0 : 1;
      }

      if (lines.length > 0) {
        hunks.push({ lines });
      }
    }

    return { ...base, additions, deletions, hunks, truncated };
  }

  // #endregion
}
