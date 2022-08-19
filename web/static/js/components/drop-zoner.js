/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-17
 */
import ZipFSManager from '../utils/zip-fs-manager.js'

export default class DropZoner {
    /**
     * @param  {Element} placeholder
     */
    constructor(placeholder) {
        this.placeholder = placeholder

        this.dropperElement = null
        this.inputElement = null

        this.initElements()

        this.listeners = {
            drop: [],
            dropstart: [],
            droperror: [],
        }

        this.onDrag = this.onDrag.bind(this)
        this.onDragEnd = this.onDragEnd.bind(this)
        this.onDragEnter = this.onDragEnter.bind(this)
        this.onDragLeave = this.onDragLeave.bind(this)
        this.onDragOver = this.onDragOver.bind(this)
        this.onDragStart = this.onDragStart.bind(this)
        this.onDrop = this.onDrop.bind(this)

        this.onSelect = this.onSelect.bind(this)

        this.placeholder.drag = this.onDrag
        this.placeholder.dragend = this.onDragEnd
        this.placeholder.dragenter = this.onDragEnter
        this.placeholder.dragleave = this.onDragLeave
        this.placeholder.ondragover = this.onDragOver
        this.placeholder.ondragstart = this.onDragStart
        this.placeholder.ondrop = this.onDrop

        this.inputElement.onchange = this.onSelect
    }

    initElements() {
        const dropperElement = document.createElement('div')
        dropperElement.classList.add('dropper')

        const p = document.createElement('p')
        p.textContent = 'Drag a stl or fbx file to be loaded here.'

        const selectorElement = document.createElement('div')
        selectorElement.classList.add('file-selector')

        const input = document.createElement('input')
        input.id = 'file-input'
        input.type = 'file'
        input.id = 'file-input'
        input.name = 'model'
        input.accept = '.fbx,.stl'

        const label = document.createElement('label')
        label.for = 'file-input'

        const image = document.createElement('img')
        image.src = './img/upload-btn.svg'
        image.alt = 'upload-btn'

        const span = document.createElement('span')
        span.textContent = 'Upload'

        dropperElement.appendChild(p)
        label.append(image, span)
        selectorElement.append(input, label)

        this.placeholder.append(dropperElement, selectorElement)

        this.dropperElement = dropperElement
        this.inputElement = input
    }

    /**
     * @param  {string}   type
     * @param  {Function} callback
     * @return {DropZoner}
     */
    on(type, callback) {
        this.listeners[type].push(callback)
        return this
    }

    /**
     * @param  {string} type
     * @param  {Object} data
     * @return {DropZoner}
     */
    emit(type, data) {
        this.listeners[type].forEach(callback => callback(data))

        return this
    }

    /**
     * Destroys the instance.
     */
    destroy() {
        const placeholder = this.placeholder
        const inputElement = this.inputElement



        placeholder.drag = this.onDrag
        placeholder.dragend = this.onDragEnd
        placeholder.dragenter = this.onDragEnter
        placeholder.dragleave = this.onDragLeave
        placeholder.ondragover = this.onDragOver
        placeholder.ondragstart = this.onDragStart
        placeholder.ondrop = this.onDrop

        inputElement.removeEventListener('change', this.onSelect)

        delete this.placeholder
        delete this.inputElement
        delete this.listeners
    }

    /**
     *
     * @param {Event} e
     */
    preventDefaults(e) {
        e.stopPropagation()
        e.preventDefault()
    }

    /**
     *
     * @param {DragEvent} event
     */
    onDrag(event) {
        this.preventDefaults(event)
    }

    /**
     *
     * @param {DragEvent} event
     */
    onDragEnd(event) {
        this.preventDefaults(event)
    }

    /**
     *
     * @param {DragEvent} event
     */
    onDragEnter(event) {
        this.preventDefaults(event)

        this.placeholder.textContent = ''
    }

    /**
     *
     * @param {DragEvent} event
     */
    onDragLeave(event) {
        this.preventDefaults(event)
    }

    /**
     *
     * @param {DragEvent} event
     */
    onDragOver(event) {
        this.preventDefaults(event)

        event.dataTransfer.dropEffect = 'copy' // Explicitly show this is a copy.
    }

    /**
     *
     * @param {DragEvent} event
     */
    onDragStart(event) {
        this.preventDefaults(event)
    }

    /**
     * References:
     * - https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/items
     * - https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files
     * - https://code.flickr.net/2012/12/10/drag-n-drop/
     * - https://stackoverflow.com/q/44842247/1314762
     *
     * @param {DragEvent} event
     */
    onDrop(event) {
        this.preventDefaults(event)

        this.emit('dropstart')

        const files = Array.from(event.dataTransfer.files ?? [])
        const items = Array.from(event.dataTransfer.items ?? [])

        const filesCount = files.length
        const itemsCount = items.length

        console.log(`File Count: ${filesCount}\n`)
        console.log(`Items Count: ${itemsCount}\n`)

        if (filesCount === 0 && itemsCount === 0) {
            this.fail('Required drag-and-drop APIs are not supported in this browser.')
            return
        }

        // Prefer .items, which allow folder traversal if necessary.
        if (itemsCount > 0) {
            const entries = items.map(item => item.webkitGetAsEntry())
            if (entries[0].name.match(/\.zip$/)) {
                this.loadZip(items[0].getAsFile())
            } else {
                this.loadNextEntry(new Map(), entries)
            }

            return
        }

        // Fall back to .files, since folders can't be traversed.
        if (filesCount === 1 && files[0].name.match(/\.zip$/)) {
            this.loadZip(files[0])
        }

        this.emit('drop', {files: new Map(files.map(file => [file.name, file]))})
    }

    /**
     *
     * @param  {Event} e
     */
    onSelect(e) {
        this.emit('dropstart')

        // HTML file inputs do not seem to support folders, so assume this is a flat file list.
        const files = [].slice.call(this.inputElement.files)

        // Automatically decompress a zip archive if it is the only file given.
        if (files.length === 1 && this.isZip(files[0])) {
            this.loadZip(files[0])
            return
        }

        const fileMap = new Map()
        files.forEach(file => fileMap.set(file.webkitRelativePath ?? file.name, file))
        this.emit('drop', {files: fileMap})
    }

    /**
     * Iterates through a list of FileSystemEntry objects, creates the fileMap
     * tree, and emits the result.
     *
     * @param  {Map<string, File>} fileMap
     * @param  {Array<FileSystemEntry>} entries
     */
    loadNextEntry(fileMap, entries) {
        const entry = entries.pop()

        if (!entry) {
            this.emit('drop', {files: fileMap})
            return
        }

        if (entry.isFile) {
            const onSuccess = file => {
                fileMap.set(entry.fullPath, file)
                this.loadNextEntry(fileMap, entries)
            }
            const onError = () => console.error('Could not load file: %s', entry.fullPath)
            entry.file(onSuccess, onError)
        } else if (entry.isDirectory) {
            // readEntries() must be called repeatedly until it stops returning results.
            // https://www.w3.org/TR/2012/WD-file-system-api-20120417/#the-directoryreader-interface
            // https://bugs.chromium.org/p/chromium/issues/detail?id=378883
            const reader = entry.createReader()
            const readerCallback = newEntries => {
                if (newEntries.length) {
                    entries = entries.concat(newEntries)
                    reader.readEntries(readerCallback)
                } else {
                    this.loadNextEntry(fileMap, entries)
                }
            }
            reader.readEntries(readerCallback)
        } else {
            console.warn('Unknown asset type: ' + entry.fullPath)
            this.loadNextEntry(fileMap, entries)
        }
    }

    /**
     * Inflates a File in .ZIP format, creates the fileMap tree, and emits the
     * result.
     * @param  {File} file
     */
    loadZip(file) {
        const pending = []
        const fileMap = new Map()
        const archive = new ZipFSManager()

        const traverse = node => {
            if (node.directory) {
                node.children.forEach(traverse)
            } else if (node.name[0] !== '.') {
                pending.push(new Promise(resolve => {
                    node.getData(new zip.BlobWriter(), blob => {
                        blob.name = node.name
                        fileMap.set(node.getFullname(), blob)
                        resolve()
                    })
                }))
            }
        }

        archive.importBlob(file, () => {
            traverse(archive.root)
            Promise.all(pending).then(() => {
                this.emit('drop', {files: fileMap, archive: file})
            })
        })
    }

    /**
     * @param  {File} file
     * @return {Boolean}
     */
    isZip(file) {
        return file.type === 'application/zip' || file.name.match(/\.zip$/)
    }

    /**
     * @param {string} message
     * @throws
     */
    fail(message) {
        this.emit('droperror', {message: message})
    }
}