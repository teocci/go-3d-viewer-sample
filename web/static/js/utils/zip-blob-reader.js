/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-19
 */

import zip from '../libs/zip/zip.js'

export default class ZipBlobReader extends zip.Reader {
    constructor(entry) {
        super(entry)

        this.checkCrc32 = false

        let blobReader
        const that = this

        const init = callback => {
            that.size = entry.uncompressedSize
            callback()
        }

        const getData = callback => {
            if (that.data) callback()
            else entry.getData(new zip.BlobWriter(), data => {
                that.data = data
                blobReader = new zip.BlobReader(data)
                callback()
            }, null, that.checkCrc32)
        }

        const readUint8Array = (index, length, callback, onerror) => {
            getData(() => {
                blobReader.readUint8Array(index, length, callback, onerror)
            }, onerror)
        }

        this.size = 0
        this.init = init
        this.readUint8Array = readUint8Array
    }
}