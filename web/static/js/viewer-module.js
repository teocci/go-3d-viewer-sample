import STLLoader from './loaders/stl-loader.js'
import OBJLoader from './loaders/obj-loader.js'
import FBXLoader from './loaders/fbx-loader.js'
import PYLLoader from './loaders/ply-loader.js'
import Viewer from './viewer.js'
import DropZoner from './components/drop-zoner.js'
import Spinner from './components/spinner.js'
import Notifier from './components/notifier.js'

/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-14
 */
export default class ViewerModule {
    static FORMAT_LIST = [
        {type: STLLoader.TAG, url: STL_FILE},
        {type: FBXLoader.TAG, url: FBX_FILE},
    ]

    static get instance() {
        this._instance = this._instance ?? new ViewerModule()

        return this._instance
    }

    constructor() {
        this.viewers = new Map()

        this.initElement()
        this.initListeners()
        // this.initViewers()

        console.log({viewers: this.viewers})
    }

    initElement() {
        this.placeholder = document.getElementById('main')

        const dropZonerElement = document.getElementById('drop-zoner')
        const spinnerElement = document.getElementById('spinner')
        const notifierElement = document.getElementById('notifier')

        this.dropZoner = new DropZoner(dropZonerElement)
        this.spinner = new Spinner(spinnerElement)
        this.notifier = new Notifier(notifierElement)
    }

    initViewers() {
        ViewerModule.FORMAT_LIST.forEach(f => {
            const element = document.createElement('div')
            element.classList.add('viewer')
            this.placeholder.appendChild(element)

            const viewer = new Viewer(element)
            this.viewers.set(f.type, viewer)
        })
    }

    initListeners() {
        this.dropZoner.on('drop', ({files}) => this.loadFile(files))
        this.dropZoner.on('dropstart', () => this.showSpinner())
        this.dropZoner.on('droperror', () => this.hideSpinner())
    }

    initViewer(type) {
        const viewersElement = document.getElementById('viewers')

        const element = document.createElement('div')
        element.classList.add('viewer')
        viewersElement.appendChild(element)

        const viewer = new Viewer(element)
        this.viewer = viewer
        this.viewers.set(type, viewer)
    }

    /**
     * Loads a fileset provided by user action.
     * @param  {Map<string, File>} fileMap
     */
    loadFile(fileMap) {
        let fileInfo = null
        Array.from(fileMap).forEach(([path, file]) => {
            const name = file.name
            if (name.match(/\.(stl|fbx)$/)) {
                const lastDot = name.lastIndexOf('.')
                fileInfo = {
                    file,
                    name: name.substring(0, lastDot),
                    ext: name.substring(lastDot + 1),
                    path: path.replace(name, ''),
                }
            }
        })

        if (fileInfo == null) {
            this.onError(new Error('No .stl or .fbx asset found.'))
            return
        }

        this.loadModel(fileInfo, fileMap)
    }

    /**
     * Passes a model to the viewer, given file and resources.
     * @param  {Object} fileInfo
     * @param  {Map<string, File>} fileMap
     */
    loadModel(fileInfo, fileMap) {
        console.log({fileInfo})
        const type = fileInfo.ext

        this.initViewer(type)

        const viewer = this.viewer

        const fileURL = typeof fileInfo.file === 'string' ? fileInfo.file : URL.createObjectURL(fileInfo.file)

        const cleanup = () => {
            this.hideSpinner()
            if (typeof fileInfo.file === 'object') URL.revokeObjectURL(fileURL)
        }

        viewer.addListener(Viewer.LISTENER_LOADED, () => {
            cleanup()
            this.dropZoner.hide()
            this.notifier.success('Model loaded!')
        })
        viewer.addListener(Viewer.LISTENER_ERROR, cleanup)

        viewer.loadModel(type, fileURL)
        if (type !== FBXLoader.TAG) viewer.onResize()
        viewer.animate()
    }

    /**
     * @param  {Error|string} error
     */
    onError(error) {
        let message = (error ?? {}).message || error.toString()
        if (message.match(/ProgressEvent/)) {
            message = 'Unable to retrieve this file. Check JS console and browser network tab.'
        } else if (message.match(/Unexpected token/)) {
            message = `Unable to parse file content. Verify that this file is valid. Error: "${message}"`
        } else if (error && error.target && error.target instanceof Image) {
            message = `Missing texture: ${error.target.src.split('/').pop()}`
        }

        this.notifier.failure(message)
        // console.error(error)

        this.hideSpinner()
    }

    showSpinner() {
        this.spinner.show()
    }

    hideSpinner() {
        this.spinner.hide()
    }

    loadViewers() {
        ViewerModule.FORMAT_LIST.forEach(f => {
            const viewer = this.viewers.get(f.type)
            viewer.loadModel(f.type, f.url)
            if (f.type !== FBXLoader.TAG) viewer.onResize()
            viewer.animate()
        })
    }
}