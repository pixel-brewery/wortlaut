// #region Imports

import { bootstrapApplication } from '@angular/platform-browser';
import { ShellConfig } from './configuration/ShellConfig';
import { ShellView } from './views/ShellView';

// #endregion

bootstrapApplication(ShellView, ShellConfig).catch((error: unknown) => {
  const message = document.createElement('p');

  message.textContent = `Wortlaut could not start: ${error instanceof Error ? error.message : 'Unknown error'}`;
  document.body.replaceChildren(message);
});
