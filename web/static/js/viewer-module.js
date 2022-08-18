import STLLoader from './loaders/stl-loader.js'
import OBJLoader from './loaders/obj-loader.js'
import FBXLoader from './loaders/fbx-loader.js'
import PYLLoader from './loaders/ply-loader.js'
import Viewer from './viewer.js'
import DropZoner from './components/drop-zoner.js'

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
        this.initViewers()

        console.log({viewers: this.viewers})
    }

    initElement() {
        this.placeholder = document.getElementById('main')
        this.viewerElement = null
        this.spinnerElement = null

        const dropZonerElement = document.getElementById('drop-zoner')
        this.dropZoner = new DropZoner(dropZonerElement)
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

    /**
     * Loads a fileset provided by user action.
     * @param  {Map<string, File>} fileMap
     */
    loadFile(fileMap) {
        let rootFile
        let rootPath
        Array.from(fileMap).forEach(([path, file]) => {
            if (file.name.match(/\.(stl|fbx)$/)) {
                rootFile = file
                rootPath = path.replace(file.name, '')
            }
        })

        if (!rootFile) {
            this.onError(new Error('No .stl or .fbx asset found.'))
        }

        // this.view(rootFile, rootPath, fileMap)

        console.log('ready to load')
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
            message = 'Missing texture: ' + error.target.src.split('/').pop()
        }
        console.error(message)
        console.error(error)
    }
    showSpinner () {
        // this.spinnerEl.style.display = '';
    }

    hideSpinner () {
        // this.spinnerEl.style.display = 'none';
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