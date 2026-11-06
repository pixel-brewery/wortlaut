// #region Imports

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC_CHANNELS } from '@pixel-brewery/wortlaut-contracts';
import { z } from 'zod';
import { isFolderDropTarget } from './bridge/FolderDrop.js';
import { createPreloadBridge } from './bridge/PreloadBridge.js';

// #endregion

// A sandboxed preload may not compile code at runtime, so validation runs without generated functions.
z.config({ jitless: true });

contextBridge.exposeInMainWorld('wortlaut', Object.freeze(createPreloadBridge(ipcRenderer)));

// The path of a dropped folder goes straight to main, which answers with a token. The renderer never sees it.
window.addEventListener(
  'drop',
  (event) => {
    const file = event.dataTransfer?.files[0];

    if (file && isFolderDropTarget(event.composedPath())) {
      ipcRenderer.send(IPC_CHANNELS.folderDrop, webUtils.getPathForFile(file));
    }
  },
  true,
);
