// #region Imports

import type { ChangeSet } from '@pixel-brewery/wortlaut-contracts';
import type { ChangeSetApplier } from '../changes/ChangeSetApplier.js';
import type { ReviewList } from '../changes/ReviewList.js';
import type { IUseCase, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * Applies a pending change set. A conflict leaves it in the review list, so the user can look at it or discard it.
 *
 * @internal
 */
export class ApplyChangeSetUseCase implements IUseCase<{ id: string }, ChangeSet> {
  // #region Fields

  public readonly command = 'changes.apply';

  private readonly _reviewList: ReviewList;
  private readonly _applier: ChangeSetApplier;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ApplyChangeSetUseCase` class.
   *
   * @param reviewList The review list.
   * @param applier The applier.
   */
  public constructor(reviewList: ReviewList, applier: ChangeSetApplier) {
    this._reviewList = reviewList;
    this._applier = applier;
  }

  // #endregion

  // #region Methods

  /**
   * @override
   */
  public execute(options: { id: string }): Promise<IUseCaseOutput<ChangeSet>> {
    const changeSet = this._reviewList.get(options.id);

    // The review list follows within the journal's cover: after a crash the set is finished and gone from it, or still in it.
    this._applier.apply(changeSet, () => this._reviewList.remove(changeSet.id));

    const applied: ChangeSet = { ...changeSet, state: 'applied' };

    return Promise.resolve({
      result: applied,
      data: { id: applied.id, files: applied.files.map((file) => file.path) },
      handledChangeSet: applied,
    });
  }

  // #endregion
}

/**
 * Removes a pending change set without writing anything.
 *
 * @internal
 */
export class DiscardChangeSetUseCase implements IUseCase<{ id: string }, ChangeSet> {
  // #region Fields

  public readonly command = 'changes.discard';

  private readonly _reviewList: ReviewList;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `DiscardChangeSetUseCase` class.
   *
   * @param reviewList The review list.
   */
  public constructor(reviewList: ReviewList) {
    this._reviewList = reviewList;
  }

  // #endregion

  // #region Methods

  /**
   * @override
   */
  public execute(options: { id: string }): Promise<IUseCaseOutput<ChangeSet>> {
    const changeSet = this._reviewList.get(options.id);

    this._reviewList.remove(changeSet.id);

    const discarded: ChangeSet = { ...changeSet, state: 'discarded' };

    return Promise.resolve({
      result: discarded,
      data: { id: discarded.id },
      handledChangeSet: discarded,
    });
  }

  // #endregion
}
