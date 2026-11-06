/**
 * The fixed channels between the renderer and main. A renderer cannot choose any other.
 *
 * @public
 */
export const IPC_CHANNELS = Object.freeze({
  request: 'wortlaut:request',
  event: 'wortlaut:event',
  folderDrop: 'wortlaut:folder-drop',
});
