/**
 * The attribute that marks an element as a place to drop a folder on.
 *
 * @public
 */
export const FOLDER_DROP_ATTRIBUTE = 'data-folder-drop';

/**
 * Returns whether a drop event landed on an element that takes folders. A drop anywhere else is ignored.
 *
 * @public
 * @param path The composed path of the event.
 * @returns `true` when a drop target is in the path.
 */
export function isFolderDropTarget(path: ReadonlyArray<EventTarget>): boolean {
    return path.some((target) => typeof (target as Element).hasAttribute === 'function' && (target as Element).hasAttribute(FOLDER_DROP_ATTRIBUTE));
}
