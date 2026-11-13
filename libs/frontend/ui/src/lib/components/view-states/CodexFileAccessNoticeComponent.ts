// #region Imports

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';

// #endregion

/**
 * Explains the file access of the Codex assistant before the user starts an AI action.
 */
@Component({
  selector: 'wortlaut-codex-file-access-notice',
  imports: [MessageComponent],
  template: `
    <mosaik-message
      variant="warning"
      header="Codex file access"
      content="When a run uses Codex, it can read local files outside this workspace. Its output may include text from those files. Review the output before saving or sharing it."
    />
  `,
  styles: ':host { display: contents; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodexFileAccessNoticeComponent {}
