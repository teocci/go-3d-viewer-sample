import zip from '../libs/zip/zip.js'
import ZipEntry from './zip-entry.js'

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
        if (!writer || (writer.constructor === this.Writer && this.data)) onend(this.data)
        else {
            if (!this.reader) this.reader = new this.Reader(this.data, onerror)
            this.reader.init(() => {
                writer.init(() => {
                    that.bufferedCopy(that.reader, writer, onend, onprogress, onerror)
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