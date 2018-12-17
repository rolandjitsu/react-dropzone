import React, {
  ChangeEvent,
  Component,
  FocusEvent,
  HTMLAttributes,
  HTMLProps,
  InputHTMLAttributes,
  KeyboardEvent,
  MouseEvent
} from 'react'

import PropTypes from 'prop-types'

import {
  isDragDataWithFiles,
  supportMultiple,
  fileAccepted,
  allFilesAccepted,
  fileMatchSize,
  onDocumentDragOver,
  getDataTransferItems as defaultGetDataTransferItem,
  isIeOrEdge,
  composeEventHandlers
} from './utils'


class Dropzone extends Component<DropzoneProps, State> {
  state: State = {
    draggedFiles: [],
    acceptedFiles: [],
    rejectedFiles: []
  }

  dragTargets: EventTarget[] = []
  draggedFiles: Files | null;
  node?: HTMLElement;
  input?: HTMLInputElement;

  componentDidMount() {
    const { preventDropOnDocument } = this.props

    if (preventDropOnDocument) {
      document.addEventListener('dragover', onDocumentDragOver, false)
      document.addEventListener('drop', this.onDocumentDrop, false)
    }

    window.addEventListener('focus', this.onFileDialogCancel, false)
  }

  componentWillUnmount() {
    const { preventDropOnDocument } = this.props
    if (preventDropOnDocument) {
      document.removeEventListener('dragover', onDocumentDragOver)
      document.removeEventListener('drop', this.onDocumentDrop)
    }

    window.removeEventListener('focus', this.onFileDialogCancel, false)
  }

  isFileDialogActive = false

  onDocumentDrop = (evt: DragEvent) => {
    if (this.node && this.node.contains(evt.target as HTMLElement)) {
      // if we intercepted an event for our instance, let it propagate down to the instance's onDrop handler
      return
    }
    evt.preventDefault()
    this.dragTargets = []
  }

  onDragStart = (evt: React.DragEvent) => {
    evt.persist()
    if (this.props.onDragStart && isDragDataWithFiles(evt)) {
      this.props.onDragStart.call(this, evt)
    }
  }

  onDragEnter = (evt: React.DragEvent) => {
    evt.preventDefault()

    // Count the dropzone and any children that are entered.
    if (this.dragTargets.indexOf(evt.target) === -1) {
      this.dragTargets.push(evt.target)
    }

    evt.persist()

    if (isDragDataWithFiles(evt)) {
      Promise.resolve(this.props.getDataTransferItems(evt)).then(draggedFiles => {
        if (evt.isPropagationStopped()) {
          return
        }

        this.setState({
          draggedFiles,
          // Do not rely on files for the drag state. It doesn't work in Safari.
          isDragActive: true
        })
      })

      if (this.props.onDragEnter) {
        this.props.onDragEnter.call(this, evt)
      }
    }
  }

  onDragOver = (evt: React.DragEvent) => {
    // eslint-disable-line class-methods-use-this
    evt.preventDefault()
    evt.persist()

    if (this.props.onDragOver && isDragDataWithFiles(evt)) {
      this.props.onDragOver.call(this, evt)
    }

    return false
  }

  onDragLeave = (evt: React.DragEvent) => {
    evt.preventDefault()
    evt.persist()

    // Only deactivate once the dropzone and all children have been left.
    this.dragTargets = this.dragTargets.filter(el => el !== evt.target && this.node.contains(el as HTMLElement))
    if (this.dragTargets.length > 0) {
      return
    }

    // Clear dragging files state
    this.setState({
      isDragActive: false,
      draggedFiles: []
    })

    if (this.props.onDragLeave && isDragDataWithFiles(evt)) {
      this.props.onDragLeave.call(this, evt)
    }
  }

  onDrop = (evt: React.DragEvent) => {
    const {
      onDrop,
      onDropAccepted,
      onDropRejected,
      multiple,
      accept,
      getDataTransferItems
    } = this.props

    // Stop default browser behavior
    evt.preventDefault()

    // Persist event for later usage
    evt.persist()

    // Reset the counter along with the drag on a drop.
    this.dragTargets = []
    this.isFileDialogActive = false

    // Clear files value
    this.draggedFiles = null

    // Reset drag state
    this.setState({
      isDragActive: false,
      draggedFiles: []
    })

    if (isDragDataWithFiles(evt)) {
      Promise.resolve(getDataTransferItems(evt)).then(fileList => {
        const acceptedFiles = []
        const rejectedFiles = []

        if (evt.isPropagationStopped()) {
          return
        }

        fileList.forEach(file => {
          if (
            fileAccepted(file, accept) &&
            fileMatchSize(file, this.props.maxSize, this.props.minSize)
          ) {
            acceptedFiles.push(file)
          } else {
            rejectedFiles.push(file)
          }
        })

        if (!multiple && acceptedFiles.length > 1) {
          // if not in multi mode add any extra accepted files to rejected.
          // This will allow end users to easily ignore a multi file drop in "single" mode.
          rejectedFiles.push(...acceptedFiles.splice(0))
        }

        // Update `acceptedFiles` and `rejectedFiles` state
        // This will make children render functions receive the appropriate
        // values
        this.setState({ acceptedFiles, rejectedFiles }, () => {
          if (onDrop) {
            onDrop.call(this, acceptedFiles, rejectedFiles, evt)
          }

          if (rejectedFiles.length > 0 && onDropRejected) {
            onDropRejected.call(this, rejectedFiles, evt)
          }

          if (acceptedFiles.length > 0 && onDropAccepted) {
            onDropAccepted.call(this, acceptedFiles, evt)
          }
        })
      })
    }
  }

  onClick = (evt: MouseEvent) => {
    const { onClick, disableClick } = this.props

    // if onClick prop is given, run it first
    if (onClick) {
      onClick.call(this, evt)
    }

    // if disableClick is not set and the event hasn't been default prefented within
    // the onClick listener, open the file dialog
    if (!disableClick && !evt.isDefaultPrevented()) {
      evt.stopPropagation()

      // in IE11/Edge the file-browser dialog is blocking, ensure this is behind setTimeout
      // this is so react can handle state changes in the onClick prop above above
      // see: https://github.com/react-dropzone/react-dropzone/issues/450
      if (isIeOrEdge()) {
        setTimeout(this.open, 0)
      } else {
        this.open()
      }
    }
  }

  onInputElementClick = (evt: MouseEvent<HTMLInputElement>) => {
    evt.stopPropagation()
  }

  onFileDialogCancel = () => {
    // timeout will not recognize context of this method
    const { onFileDialogCancel } = this.props
    // execute the timeout only if the FileDialog is opened in the browser
    if (this.isFileDialogActive) {
      setTimeout(() => {
        if (this.input != null) {
          // Returns an object as FileList
          const { files } = this.input

          if (!files.length) {
            this.isFileDialogActive = false

            if (typeof onFileDialogCancel === 'function') {
              onFileDialogCancel()
            }
          }
        }
      }, 300)
    }
  }

  onFocus = (evt: FocusEvent) => {
    const { onFocus } = this.props
    if (onFocus) {
      onFocus.call(this, evt)
    }
    if (!evt.isDefaultPrevented()) {
      this.setState({ isFocused: true })
    }
  }

  onBlur = (evt: FocusEvent) => {
    const { onBlur } = this.props
    if (onBlur) {
      onBlur.call(this, evt)
    }
    if (!evt.isDefaultPrevented()) {
      this.setState({ isFocused: false })
    }
  }

  onKeyDown = (evt: KeyboardEvent) => {
    const { onKeyDown } = this.props
    if (onKeyDown) {
      onKeyDown.call(this, evt)
    }
    if (!evt.isDefaultPrevented() && (evt.keyCode === 32 || evt.keyCode === 13)) {
      evt.preventDefault()
      this.open()
    }
  }

  composeHandler = handler => {
    if (this.props.disabled) {
      return null
    }
    return handler
  }

  getRootProps = ({
    refKey = 'ref',
    onKeyDown,
    onFocus,
    onBlur,
    onClick,
    onDragStart,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    ...rest
  }: DropzoneRootProps = {}) => ({
    onKeyDown: this.composeHandler(
      onKeyDown ? composeEventHandlers(onKeyDown, this.onKeyDown) : this.onKeyDown
    ),
    onFocus: this.composeHandler(
      onFocus ? composeEventHandlers(onFocus, this.onFocus) : this.onFocus
    ),
    onBlur: this.composeHandler(onBlur ? composeEventHandlers(onBlur, this.onBlur) : this.onBlur),
    onClick: this.composeHandler(
      onClick ? composeEventHandlers(onClick, this.onClick) : this.onClick
    ),
    onDragStart: this.composeHandler(
      onDragStart ? composeEventHandlers(onDragStart, this.onDragStart) : this.onDragStart
    ),
    onDragEnter: this.composeHandler(
      onDragEnter ? composeEventHandlers(onDragEnter, this.onDragEnter) : this.onDragEnter
    ),
    onDragOver: this.composeHandler(
      onDragOver ? composeEventHandlers(onDragOver, this.onDragOver) : this.onDragOver
    ),
    onDragLeave: this.composeHandler(
      onDragLeave ? composeEventHandlers(onDragLeave, this.onDragLeave) : this.onDragLeave
    ),
    onDrop: this.composeHandler(onDrop ? composeEventHandlers(onDrop, this.onDrop) : this.onDrop),
    [refKey]: this.setNodeRef,
    tabIndex: this.props.disabled ? -1 : 0,
    ...rest
    }) as DropzoneRootProps

  getInputProps = ({ refKey = 'ref', onChange, onClick, ...rest }: DropzoneInputProps = {}) => {
    const { accept, multiple, name } = this.props
    const inputProps = {
      accept,
      type: 'file',
      style: { display: 'none' },
      multiple: supportMultiple && multiple,
      onChange: composeEventHandlers(onChange, this.onDrop),
      onClick: composeEventHandlers(onClick, this.onInputElementClick),
      autoComplete: 'off',
      tabIndex: -1,
      [refKey]: this.setInputRef
    }
    if (name && name.length) {
      inputProps.name = name
    }
    return {
      ...inputProps,
      ...rest
    } as DropzoneInputProps;
  }

  setNodeRef = node => {
    this.node = node
  }

  setInputRef = input => {
    this.input = input
  }

  /**
   * Open system file upload dialog.
   *
   * @public
   */
  open = () => {
    this.isFileDialogActive = true
    if (this.input) {
      this.input.value = null
      this.input.click()
    }
  }

  render() {
    const { children, multiple, disabled } = this.props
    const { isDragActive, isFocused, draggedFiles, acceptedFiles, rejectedFiles } = this.state

    const filesCount = draggedFiles.length
    const isMultipleAllowed = multiple || filesCount <= 1
    const isDragAccept = filesCount > 0 && allFilesAccepted(draggedFiles, this.props.accept)
    const isDragReject = filesCount > 0 && (!isDragAccept || !isMultipleAllowed)

    return children({
      isDragActive,
      isDragAccept,
      isDragReject,
      draggedFiles,
      acceptedFiles,
      rejectedFiles,
      isFocused: isFocused && !disabled,
      getRootProps: this.getRootProps,
      getInputProps: this.getInputProps,
      open: this.open
    })
  }
}

export default Dropzone

export interface DropzoneProps extends Pick<HTMLProps<HTMLElement>, PropTypes> {
  children?: DropzoneRenderFunction;
  getDataTransferItems?(event: React.DragEvent | ChangeEvent<HTMLInputElement> | DragEvent | Event): Promise<Files>;
  onFileDialogCancel?(): void;
  onDrop?: DropFilesEventHandler;
  onDropAccepted?: DropFileEventHandler;
  onDropRejected?: DropFileEventHandler;
  maxSize?: number;
  minSize?: number;
  preventDropOnDocument?: boolean;
  disableClick?: boolean;
  disabled?: boolean;
}

type Files = Array<File | DataTransferItem>;

interface State {
  draggedFiles: Files;
  acceptedFiles: Files;
  rejectedFiles: Files;
  isDragActive?: boolean;
  isFocused?: boolean;
}

export interface DropzoneRootProps extends HTMLAttributes<HTMLElement> {
  refKey?: string;
  [key: string]: any;
}

export interface DropzoneInputProps extends InputHTMLAttributes<HTMLInputElement> {
  refKey?: string;
}

export type DropzoneRenderFunction = (x: DropzoneRenderArgs) => JSX.Element;
export type GetRootPropsFn = (props?: DropzoneRootProps) => DropzoneRootProps;
export type GetInputPropsFn = (props?: DropzoneInputProps) => DropzoneInputProps;

export type DropFileEventHandler = (
  acceptedOrRejected: Files,
  event: React.DragEvent
) => void;

export type DropFilesEventHandler = (
  accepted: Files,
  rejected: Files,
  event: React.DragEvent
) => void;

export type DropzoneRenderArgs = {
  draggedFiles: Files;
  acceptedFiles: Files;
  rejectedFiles: Files;
  isDragActive: boolean;
  isDragAccept: boolean;
  isDragReject: boolean;
  isFocused: boolean;
  getRootProps: GetRootPropsFn;
  getInputProps: GetInputPropsFn;
  open: () => void;
};

type PropTypes = "accept"
  | "multiple"
  | "name"
  | "onClick"
  | "onFocus"
  | "onBlur"
  | "onKeyDown"
  | "onDragStart"
  | "onDragEnter"
  | "onDragOver"
  | "onDragLeave";


Dropzone.propTypes = {
  /**
   * Allow specific types of files. See https://github.com/okonet/attr-accept for more information.
   * Keep in mind that mime type determination is not reliable across platforms. CSV files,
   * for example, are reported as text/plain under macOS but as application/vnd.ms-excel under
   * Windows. In some cases there might not be a mime type set at all.
   * See: https://github.com/react-dropzone/react-dropzone/issues/276
   */
  accept: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),

  /**
   * Render function that renders the actual component
   *
   * @param {Object} props
   * @param {Function} props.getRootProps Returns the props you should apply to the root drop container you render
   * @param {Function} props.getInputProps Returns the props you should apply to hidden file input you render
   * @param {Function} props.open Open the native file selection dialog
   * @param {Boolean} props.isFocused Dropzone area is in focus
   * @param {Boolean} props.isDragActive Active drag is in progress
   * @param {Boolean} props.isDragAccept Dragged files are accepted
   * @param {Boolean} props.isDragReject Some dragged files are rejected
   * @param {Array} props.draggedFiles Files in active drag
   * @param {Array} props.acceptedFiles Accepted files
   * @param {Array} props.rejectedFiles Rejected files
   */
  children: PropTypes.func,

  /**
   * Disallow clicking on the dropzone container to open file dialog
   */
  disableClick: PropTypes.bool,

  /**
   * Enable/disable the dropzone entirely
   */
  disabled: PropTypes.bool,

  /**
   * If false, allow dropped items to take over the current browser window
   */
  preventDropOnDocument: PropTypes.bool,

  /**
   * Allow dropping multiple files
   */
  multiple: PropTypes.bool,

  /**
   * `name` attribute for the input tag
   */
  name: PropTypes.string,

  /**
   * Maximum file size (in bytes)
   */
  maxSize: PropTypes.number,

  /**
   * Minimum file size (in bytes)
   */
  minSize: PropTypes.number,

  /**
   * getDataTransferItems handler
   * @param {Event} event
   * @returns {Array} array of File objects
   */
  getDataTransferItems: PropTypes.func,

  /**
   * onClick callback
   * @param {Event} event
   */
  onClick: PropTypes.func,

  /**
   * onFocus callback
   */
  onFocus: PropTypes.func,

  /**
   * onBlur callback
   */
  onBlur: PropTypes.func,

  /**
   * onKeyDown callback
   */
  onKeyDown: PropTypes.func,

  /**
   * The `onDrop` method that accepts two arguments.
   * The first argument represents the accepted files and the second argument the rejected files.
   *
   * ```javascript
   * function onDrop(acceptedFiles, rejectedFiles) {
   *   // do stuff with files...
   * }
   * ```
   *
   * Files are accepted or rejected based on the `accept` prop.
   * This must be a valid [MIME type](http://www.iana.org/assignments/media-types/media-types.xhtml) according to [input element specification](https://www.w3.org/wiki/HTML/Elements/input/file) or a valid file extension.
   *
   * Note that the `onDrop` callback will always be called regardless if the dropped files were accepted or rejected.
   * You can use the `onDropAccepted`/`onDropRejected` props if you'd like to react to a specific event instead of the `onDrop` prop.
   *
   * The `onDrop` callback will provide you with an array of [Files](https://developer.mozilla.org/en-US/docs/Web/API/File) which you can then process and send to a server.
   * For example, with [SuperAgent](https://github.com/visionmedia/superagent) as a http/ajax library:
   *
   * ```javascript
   * function onDrop(acceptedFiles) {
   *   const req = request.post('/upload')
   *   acceptedFiles.forEach(file => {
   *     req.attach(file.name, file)
   *   })
   *   req.end(callback)
   * }
   * ```
   */
  onDrop: PropTypes.func,

  /**
   * onDropAccepted callback
   */
  onDropAccepted: PropTypes.func,

  /**
   * onDropRejected callback
   */
  onDropRejected: PropTypes.func,

  /**
   * onDragStart callback
   */
  onDragStart: PropTypes.func,

  /**
   * onDragEnter callback
   */
  onDragEnter: PropTypes.func,

  /**
   * onDragOver callback
   */
  onDragOver: PropTypes.func,

  /**
   * onDragLeave callback
   */
  onDragLeave: PropTypes.func,

  /**
   * Provide a callback on clicking the cancel button of the file dialog
   */
  onFileDialogCancel: PropTypes.func
}

Dropzone.defaultProps = {
  preventDropOnDocument: true,
  disabled: false,
  disableClick: false,
  multiple: true,
  maxSize: Infinity,
  minSize: 0,
  getDataTransferItems: defaultGetDataTransferItem
}