import zip from '../libs/zip/zip.js'
import ZipFsUtil from './zip-fs-util.js'

/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-19
 */

export default class ZipEntry {
    static CHUNK_SIZE = 512 * 1024

    constructor(fs, name, params, parent) {
        if (fs.root && parent && parent.getChildByName(name)) throw 'Entry filename already exists.'

        params = params ?? {}

        this.fs = fs
        this.name = name
        this.id = fs.entries.length
        this.parent = parent
        this.children = []
        this.zipVersion = params.zipVersion || 0x14
        this.uncompressedSize = 0

        fs.entries.push(this)

        if (parent) this.parent.children.push(this)
    }

    addFileEntryToZip(zipEntry, fileEntry, onend, onerror) {
        const getChildren = (fileEntry, callback) => {
            if (fileEntry.isDirectory) fileEntry.createReader().readEntries(callback)
            if (fileEntry.isFile) callback([])
        }

        const process = (zipEntry, fileEntry, onend) => {
            getChildren(fileEntry, children => {
                let childIndex = 0

                const addChild = child => {
                    const nextChild = childFileEntry => {
                        process(childFileEntry, child, () => {
                            childIndex++
                            processChild()
                        })
                    }

                    if (child.isDirectory) nextChild(zipEntry.addDirectory(child.name))
                    if (child.isFile) child.file((file) => {
                        const childZipEntry = zipEntry.addBlob(child.name, file)
                        childZipEntry.uncompressedSize = file.size
                        nextChild(childZipEntry)
                    }, onerror)
                }

                const processChild = () => {
                    const child = children[childIndex]
                    if (child) addChild(child)
                    else onend()
                }

                processChild()
            })
        }

        if (fileEntry.isDirectory) process(zipEntry, fileEntry, onend)
        else fileEntry.file(file => {
            zipEntry.addBlob(fileEntry.name, file)
            onend()
        }, onerror)
    }

    detach(entry) {
        const children = entry.parent.children
        children.forEach((child, index) => {
            if (child.id === entry.id) children.splice(index, 1)
        })
    }

    getTotalSize(entry) {
        let size = 0
        const process = entry => {
            size += entry.uncompressedSize ?? 0
            entry.children.forEach(process)
        }

        process(entry)

        return size
    }

    bufferedCopy(reader, writer, onend, onprogress, onerror) {
        let chunkIndex = 0

        const stepCopy = () => {
            const index = chunkIndex * ZipEntry.CHUNK_SIZE
            if (onprogress) onprogress(index, reader.size)
            if (index >= reader.size) writer.getData(onend)
            else {
                reader.readUint8Array(index, Math.min(ZipEntry.CHUNK_SIZE, reader.size - index), array => {
                    writer.writeUint8Array(new Uint8Array(array), () => {
                        chunkIndex++
                        stepCopy()
                    })
                }, onerror)
            }
        }

        stepCopy()
    }

    initReaders(entry, onend, onerror) {
        let index = 0

        const next = () => {
            index++
            if (index < entry.children.length) process(entry.children[index])
            else onend()
        }

        const process = child => {
            if (child.directory) this.initReaders(child, next, onerror)
            else {
                child.reader = new child.Reader(child.data, onerror)
                child.reader.init(() => {
                    child.uncompressedSize = child.reader.size
                    next()
                })
            }
        }

        if (entry.children.length) process(entry.children[index])
        else onend()
    }

    getFileEntry(fileEntry, onend, onprogress, onerror, checkCrc32) {
        const that = this
        const size = this.getTotalSize(that)

        this.initReaders(that, () => {
            that.readIntoFileEntry(fileEntry, that, onend, onprogress, onerror, size, checkCrc32)
        }, onerror)
    }


    readIntoFileEntry(fileEntry, entry, onend, onprogress, onerror, totalSize, checkCrc32) {
        let currentIndex = 0

        const process = (fileEntry, entry, onend, onprogress, onerror, totalSize) => {
            let childIndex = 0

            const addChild = child => {
                const nextChild = childFileEntry => {
                    currentIndex += child.uncompressedSize || 0
                    process(childFileEntry, child, () => {
                        childIndex++
                        processChild()
                    }, onprogress, onerror, totalSize)
                }

                if (child.directory)
                    fileEntry.getDirectory(child.name, {
                        create: true,
                    }, nextChild, onerror)
                else
                    fileEntry.getFile(child.name, {
                        create: true,
                    }, function (file) {
                        child.getData(new zip.FileWriter(file, ZipFsUtil.getMimeType(child.name)), nextChild, index => {
                            if (onprogress) onprogress(currentIndex + index, totalSize)
                        }, checkCrc32)
                    }, onerror)
            }

            const processChild = () => {
                const child = entry.children[childIndex]
                if (child) addChild(child)
                else onend()
            }

            processChild()
        }

        if (entry.directory) process(fileEntry, entry, onend, onprogress, onerror, totalSize)
        else entry.getData(new zip.FileWriter(fileEntry, ZipFsUtil.getMimeType(entry.name)), onend, onprogress, checkCrc32)
    }

    moveTo(target) {
        if (!target.directory) throw 'Target entry is not a directory.'
        if (target.isDescendantOf(this)) throw 'Entry is a ancestor of target entry.'
        if (target.getChildByName(this.name)) throw 'Entry filename already exists.'
        if (this === target) return

        this.detach(this)
        this.parent = target
        target.children.push(this)
    }

    getFullPath() {
        let path = this.name, entry = this.parent
        while (entry) {
            path = (entry.name ? `${entry.name}/` : '') + path
            entry = entry.parent
        }

        return path
    }

    isDescendantOf(ancestor) {
        let entry = this.parent
        while (entry && entry.id !== ancestor.id) entry = entry.parent ?? false

        return entry
    }
}