// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import { mcpClientName, type ChangeSet, type Finding } from '@pixel-brewery/wortlaut-contracts';
import { CatalogEditor, type ResourceMode } from '@pixel-brewery/wortlaut-core';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * The options of a proposal, as a run record keeps them. The values stay in the change set.
 *
 * @internal
 */
export interface IProposeTranslationsOptions {
  locale: string;
  count: number;
  client: string;
}

/**
 * A catalog with the rows a proposal has for it.
 *
 * @internal
 */
export interface IProposedTarget {
  path: string;
  basePath: string;
  type: ResourceMode;
  entries: ReadonlyArray<readonly [key: string, value: string]>;
}

/**
 * Leaves checked translations of an assistant in the review list. What is already waiting for the same catalog goes into the
 * same change set, so a proposal in several parts is one thing to review, and approving it does not make the rest conflict.
 *
 * @internal
 */
export class ProposeTranslationsUseCase implements IUseCase<IProposeTranslationsOptions, null> {
  // #region Fields

  public readonly command = 'translations.propose';

  private readonly _targets: ReadonlyArray<IProposedTarget>;
  private readonly _merged: ReadonlyArray<ChangeSet>;
  private readonly _findings: ReadonlyArray<Finding>;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ProposeTranslationsUseCase` class.
   *
   * @param targets The catalogs with their rows.
   * @param merged The pending change sets this one takes over.
   * @param findings What a reviewer should know about the rows.
   */
  public constructor(
    targets: ReadonlyArray<IProposedTarget>,
    merged: ReadonlyArray<ChangeSet>,
    findings: ReadonlyArray<Finding>,
  ) {
    this._targets = targets;
    this._merged = merged;
    this._findings = findings;
  }

  // #endregion

  // #region Methods

  /**
   * @override
   */
  public detail(options: IProposeTranslationsOptions): string {
    return `${mcpClientName(options.client)}: translations for ${options.locale}`;
  }

  /**
   * @override
   */
  public execute(
    options: IProposeTranslationsOptions,
    context: IUseCaseContext,
  ): Promise<IUseCaseOutput<null>> {
    const waiting = new Map(
      this._merged.flatMap((changeSet) =>
        changeSet.files.map((file) => [file.path, file.newContent] as const),
      ),
    );

    for (const [path, content] of waiting) {
      context.changes.propose(path, content);
    }

    for (const target of this._targets) {
      context.changes.propose(target.path, this.compose(target, waiting.get(target.path) ?? null));
    }

    for (const finding of [
      ...this._merged.flatMap((changeSet) => changeSet.findings),
      ...this._findings,
    ]) {
      context.changes.addFinding(finding);
    }

    context.logger.log(`Proposed ${options.count} translations for ${options.locale}`);

    return Promise.resolve({
      result: null,
      data: { count: options.count, locale: options.locale },
    });
  }

  /**
   * @private
   */
  private compose(target: IProposedTarget, waiting: string | null): string {
    const current = waiting ?? (existsSync(target.path) ? readFileSync(target.path, 'utf8') : null);

    return current === null
      ? CatalogEditor.createLike(readFileSync(target.basePath, 'utf8'), target.type, target.entries)
      : CatalogEditor.setValues(current, target.type, target.entries);
  }

  // #endregion
}
