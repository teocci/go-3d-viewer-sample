/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-19
 */
import ZipEntry from './zip-entry.js'
import zip from '../libs/zip/zip.js'
import ZipBlobReader from './zip-blob-reader.js'

export default class ZipDirectoryEntry extends ZipEntry {
    constructor(fs, name, params, parent) {
        super(fs, name, params, parent)

        this.directory = true
    }

    addDirectory(name) {
        return this.addChild(this, name, null, true)
    }

    addText(name, text) {
        return this.addChild(this, name, {
            data: text,
            Reader: zip.TextReader,
            Writer: zip.TextWriter,
        })
    }

    addBlob(name, blob) {
        return this.addChild(this, name, {
            data: blob,
            Reader: zip.BlobReader,
            Writer: zip.BlobWriter,
        })
    }

    addData64URI(name, dataURI) {
        return this.addChild(this, name, {
            data: dataURI,
            Reader: zip.Data64URIReader,
            Writer: zip.Data64URIWriter,
        })
    }

    addFileEntry(fileEntry, onend, onerror) {
        this.addFileEntryToZip(this, fileEntry, onend, onerror)
    }

    addData(name, params) {
        return this.addChild(this, name, params)
    }

    importBlob(blob, onend, onerror) {
        this.importZip(new zip.BlobReader(blob), onend, onerror)
    }

    importText(text, onend, onerror) {
        this.importZip(new zip.TextReader(text), onend, onerror)
    }

    importData64URI(dataURI, onend, onerror) {
        this.importZip(new zip.Data64URIReader(dataURI), onend, onerror)
    }

    exportBlob(onend, onprogress, onerror) {
        this.exportZip(new zip.BlobWriter('application/zip'), onend, onprogress, onerror)
    }

    exportText(onend, onprogress, onerror) {
        this.exportZip(new zip.TextWriter(), onend, onprogress, onerror)
    }

    exportFileEntry(fileEntry, onend, onprogress, onerror) {
        this.exportZip(new zip.FileWriter(fileEntry, 'application/zip'), onend, onprogress, onerror)
    }

    exportData64URI(onend, onprogress, onerror) {
        this.exportZip(new zip.Data64URIWriter('application/zip'), onend, onprogress, onerror)
    }

    importZip(reader, onend, onerror) {
        const that = this
        zip.createReader(reader, zipReader => {
            zipReader.getEntries(entries => {
                entries.forEach(entry => {
                    const path = entry.filename.split('/'), name = path.pop()
                    let parent = that
                    path.forEach(pathPart => {
                        parent = parent.getChildByName(pathPart) ?? new ZipDirectoryEntry(that.fs, pathPart, null, parent)
                    })

                    if (!entry.directory)
                        this.addChild(parent, name, {
                            data: entry,
                            Reader: ZipBlobReader,
                        })
                })
                onend()
            })
        }, onerror)
    }

    exportZip(writer, onend, onprogress, onerror) {
        const that = this
        this.initReaders(that, () => {
            zip.createWriter(writer, zipWriter => {
                that.exportZip(zipWriter, that, () => {
                    zipWriter.close(onend)
                }, onprogress, this.getTotalSize(that))
            }, onerror)
        }, onerror)
    }

    getChildByName(name) {
        for (const child of this.children) {
            if (child.name === name) return child
        }
    }
}