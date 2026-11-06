// #region Imports

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// #endregion

/**
 * The root of the app: the outlet of the start screens and of the shell.
 */
@Component({
  selector: 'wortlaut-root',
  imports: [RouterOutlet],
  templateUrl: './ShellView.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellView {}
