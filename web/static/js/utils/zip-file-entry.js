import ZipEntry from './zip-entry.js'
import zip from '../libs/zip/zip.js'

/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-19
 */
export default class ZipFileEntry extends ZipEntry {
    constructor(fs, name, params, parent) {
        super(fs, name, params, parent)

        this.Reader = params.Reader
        this.Writer = params.Writer
        this.data = params.data

        if (params.getData) {
            this.getData = params.getData
        }
    }

    getData(writer, onend, onprogress, onerror) {
        const that = this
        if (!writer || (writer.constructor === that.Writer && that.data)) onend(that.data)
        else {
            if (!that.reader) that.reader = new that.Reader(that.data, onerror)
            that.reader.init(() => {
                writer.init(() => {
                    this.bufferedCopy(that.reader, writer, onend, onprogress, onerror)
                }, onerror)
            })
        }
    }

    getText(onend, onprogress, checkCrc32, encoding) {
        this.getData(new zip.TextWriter(encoding), onend, onprogress, checkCrc32)
    }

    getBlob(mimeType, onend, onprogress, checkCrc32) {
        this.getData(new zip.BlobWriter(mimeType), onend, onprogress, checkCrc32)
    }

    getData64URI(mimeType, onend, onprogress, checkCrc32) {
        this.getData(new zip.Data64URIWriter(mimeType), onend, onprogress, checkCrc32)
    }
}