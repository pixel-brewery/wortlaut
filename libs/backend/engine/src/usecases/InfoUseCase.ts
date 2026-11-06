// #region Imports

import { arch, cpus, platform, totalmem } from 'node:os';
import type { IUseCase, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * What `info` reports about this machine.
 *
 * @public
 */
export interface IInfoResult {
  platform: string;
  arch: string;
  cpus: number;
  totalMemory: number;
}

/**
 * Reports the machine.
 *
 * @internal
 */
export class InfoUseCase implements IUseCase<Record<string, never>, IInfoResult> {
  public readonly command = 'info';

  /**
   * @override
   */
  public execute(): Promise<IUseCaseOutput<IInfoResult>> {
    const result: IInfoResult = {
      platform: platform(),
      arch: arch(),
      cpus: cpus().length,
      totalMemory: totalmem(),
    };

    return Promise.resolve({ result, data: result });
  }
}
