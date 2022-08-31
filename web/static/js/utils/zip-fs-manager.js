/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-19
 */
import ZipFsUtil from './zip-fs-util.js'
import ZipDirectoryEntry from './zip-directory-entry.js'

export default class ZipFSManager {
    constructor() {
        this.resetFS()
    }

    resetFS() {
        this.entries = []
        this.root = new ZipDirectoryEntry(this)
    }

    remove(entry) {
        ZipFsUtil.detach(entry)
        this.entries[entry.id] = null
    }

    find(fullPath) {
        const paths = fullPath.split('/')
        let node = this.root

        for (const path of paths) {
            node = node.getChildByName(path)
        }

        return node
    }

    getById(id) {
        return this.entries[id]
    }

    importBlob(blob, onend, onerror) {
        this.resetFS()
        this.root.importBlob(blob, onend, onerror)
    }

    importText(text, onend, onerror) {
        this.resetFS()
        this.root.importText(text, onend, onerror)
    }

    importData64URI(dataURI, onend, onerror) {
        this.resetFS()
        this.root.importData64URI(dataURI, onend, onerror)
    }

    exportBlob(onend, onprogress, onerror) {
        this.root.exportBlob(onend, onprogress, onerror)
    }

    exportText(onend, onprogress, onerror) {
        this.root.exportText(onend, onprogress, onerror)
    }

    exportFileEntry(fileEntry, onend, onprogress, onerror) {
        this.root.exportFileEntry(fileEntry, onend, onprogress, onerror)
    }

    exportData64URI(onend, onprogress, onerror) {
        this.root.exportData64URI(onend, onprogress, onerror)
    }
}