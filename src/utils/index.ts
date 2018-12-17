import {ChangeEvent} from 'react';
import accepts from 'attr-accept'

export const supportMultiple =
  typeof document !== 'undefined' && document && document.createElement
    ? 'multiple' in document.createElement('input')
    : true

type DragOrInputEvent = React.DragEvent | ChangeEvent<HTMLInputElement>;

export function getDataTransferItems(event: DragOrInputEvent): Array<File | DataTransferItem> {
  let dataTransferItemsList: any = []

  if (isDragEvent(event)) {
    const dt = event.dataTransfer

    // NOTE: Only the 'drop' event has access to DataTransfer.files,
    // otherwise it will always be empty
    if (dt.files && dt.files.length) {
      dataTransferItemsList = dt.files
    } else if (dt.items && dt.items.length) {
      // During the drag even the dataTransfer.files is null
      // but Chrome implements some drag store, which is accesible via dataTransfer.items
      dataTransferItemsList = dt.items
    }
  } else if (isInputEvent(event)) {
    dataTransferItemsList = event.target.files
  }

  // Convert from FileList/DataTransferItemsList to the native Array
  return Array.prototype.slice.call(dataTransferItemsList)
}

function isDragEvent(evt: DragOrInputEvent): evt is React.DragEvent {
  return (evt as any).dataTransfer;
}

function isInputEvent(evt: DragOrInputEvent): evt is ChangeEvent<HTMLInputElement> {
  return event.target && (event.target as any).files
}


// Firefox versions prior to 53 return a bogus MIME type for every file drag, so dragovers with
// that MIME type will always be accepted
export function fileAccepted(file: File | DataTransferItem, accept) {
  return file.type === 'application/x-moz-file' || accepts(file, accept)
}

export function fileMatchSize(file: File, maxSize?: number, minSize?: number) {
  return file.size <= maxSize && file.size >= minSize
}

export function allFilesAccepted(files: Array<File | DataTransferItem>, accept) {
  return files.every(file => fileAccepted(file, accept))
}

export function isDragDataWithFiles(evt: DragOrInputEvent) {
  if (!isDragEvent(evt)) {
    return true
  }
  // https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/types
  // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types#file
  return Array.prototype.every.call(
    evt.dataTransfer.types,
    type => type === 'Files' || type === 'application/x-moz-file'
  )
}

// Allow the entire document to be a drag target
export function onDocumentDragOver(evt: DragEvent) {
  evt.preventDefault()
}

function isIe(userAgent: string) {
  return userAgent.indexOf('MSIE') !== -1 || userAgent.indexOf('Trident/') !== -1
}

function isEdge(userAgent: string) {
  return userAgent.indexOf('Edge/') !== -1
}

export function isIeOrEdge(userAgent: string = window.navigator.userAgent) {
  return isIe(userAgent) || isEdge(userAgent)
}

/**
 * This is intended to be used to compose event handlers
 * They are executed in order until one of them calls `event.preventDefault()`.
 * Not sure this is the best way to do this, but it seems legit.
 * @param fns Event handler functions
 * @return An event handler to add to an element
 */
export function composeEventHandlers(...fns: Array<(...args: any[]) => void>) {
  return (event: any, ...args: any[]) =>
    fns.some(fn => {
      fn && fn(event, ...args)
      return event.defaultPrevented
    })
}
