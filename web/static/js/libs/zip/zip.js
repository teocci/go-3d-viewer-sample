/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-19
 */

import {Deflater} from './deflate.js'
import {Inflater} from './inflate.js'

const ERR_BAD_FORMAT = 'File format is not recognized.'
const ERR_CRC = 'CRC failed.'
const ERR_ENCRYPTED = 'File contains encrypted entry.'
const ERR_ZIP64 = 'File is using Zip64 (4gb+ file size).'
const ERR_READ = 'Error while reading zip file.'
const ERR_WRITE = 'Error while writing zip file.'
const ERR_WRITE_DATA = 'Error while writing file data.'
const ERR_READ_DATA = 'Error while reading file data.'
const ERR_DUPLICATED_NAME = 'File already exists.'

const CHUNK_SIZE = 512 * 1024

const TEXT_PLAIN = 'text/plain'

let appendABViewSupported
try {
    appendABViewSupported = new Blob([new DataView(new ArrayBuffer(0))]).size === 0
} catch (e) {
}

function Crc32() {
    this.crc = -1
}

Crc32.prototype.append = function append(data) {
    const table = this.table
    let crc = this.crc | 0
    for (let offset = 0, len = data.length | 0; offset < len; offset++)
        crc = (crc >>> 8) ^ table[(crc ^ data[offset]) & 0xFF]
    this.crc = crc
}
Crc32.prototype.get = function get() {
    return ~this.crc
}
Crc32.prototype.table = (() => {
    const table = [] // Uint32Array is actually slower than []
    let i, j, t
    for (i = 0; i < 256; i++) {
        t = i
        for (j = 0; j < 8; j++)
            if (t & 1) t = (t >>> 1) ^ 0xEDB88320
            else t = t >>> 1

        table[i] = t
    }

    return table
})()

// "no-op" codec
function NOOP() {}

NOOP.prototype.append = function append(bytes, onprogress) {
    return bytes
}
NOOP.prototype.flush = function flush() {}

function blobSlice(blob, index, length) {
    if (index < 0 || length < 0 || index + length > blob.size)
        throw new RangeError(`offset:${index}, length:${length}, size:${blob.size}`)
    if (blob.slice) return blob.slice(index, index + length)
    else if (blob.webkitSlice) return blob.webkitSlice(index, index + length)
    else if (blob.mozSlice) return blob.mozSlice(index, index + length)
    else if (blob.msSlice) return blob.msSlice(index, index + length)
}

function getDataHelper(byteLength, bytes) {
    let dataBuffer, dataArray
    dataBuffer = new ArrayBuffer(byteLength)
    dataArray = new Uint8Array(dataBuffer)
    if (bytes) dataArray.set(bytes, 0)

    return {
        buffer: dataBuffer,
        array: dataArray,
        view: new DataView(dataBuffer),
    }
}

// Readers
function Reader() {}

function TextReader(text) {
    const that = this
    let blobReader

    function init(callback, onerror) {
        const blob = new Blob([text], {
            type: TEXT_PLAIN,
        })
        blobReader = new BlobReader(blob)
        blobReader.init(() => {
            that.size = blobReader.size
            callback()
        }, onerror)
    }

    function readUint8Array(index, length, callback, onerror) {
        blobReader.readUint8Array(index, length, callback, onerror)
    }

    that.size = 0
    that.init = init
    that.readUint8Array = readUint8Array
}

TextReader.prototype = new Reader()
TextReader.prototype.constructor = TextReader

function Data64URIReader(dataURI) {
    const that = this
    let dataStart

    function init(callback) {
        let dataEnd = dataURI.length
        while (dataURI.charAt(dataEnd - 1) === '=') dataEnd--

        dataStart = dataURI.indexOf(',') + 1
        that.size = Math.floor((dataEnd - dataStart) * 0.75)

        callback()
    }

    function readUint8Array(index, length, callback) {
        const data = getDataHelper(length)
        const start = Math.floor(index / 3) * 4
        const end = Math.ceil((index + length) / 3) * 4
        const bytes = self.atob(dataURI.substring(start + dataStart, end + dataStart))
        const delta = index - Math.floor(start / 4) * 3
        for (let i = delta; i < delta + length; i++) data.array[i - delta] = bytes.charCodeAt(i)

        callback(data.array)
    }

    that.size = 0
    that.init = init
    that.readUint8Array = readUint8Array
}

Data64URIReader.prototype = new Reader()
Data64URIReader.prototype.constructor = Data64URIReader

function BlobReader(blob) {
    const that = this

    function init(callback) {
        that.size = blob.size
        callback()
    }

    function readUint8Array(index, length, callback, onerror) {
        const reader = new FileReader()
        reader.onload = e => {
            callback(new Uint8Array(e.target.result))
        }
        reader.onerror = onerror

        try {
            reader.readAsArrayBuffer(blobSlice(blob, index, length))
        } catch (e) {
            onerror(e)
        }
    }

    that.size = 0
    that.init = init
    that.readUint8Array = readUint8Array
}

BlobReader.prototype = new Reader()
BlobReader.prototype.constructor = BlobReader

// Writers

function Writer() {
}

Writer.prototype.getData = callback => {
    callback(this.data)
}

function TextWriter(encoding) {
    const that = this
    let blob

    function init(callback) {
        blob = new Blob([], {
            type: TEXT_PLAIN,
        })
        callback()
    }

    function writeUint8Array(array, callback) {
        blob = new Blob([blob, appendABViewSupported ? array : array.buffer], {
            type: TEXT_PLAIN,
        })
        callback()
    }

    function getData(callback, onerror) {
        const reader = new FileReader()
        reader.onload = e => {
            callback(e.target.result)
        }
        reader.onerror = onerror
        reader.readAsText(blob, encoding)
    }

    that.init = init
    that.writeUint8Array = writeUint8Array
    that.getData = getData
}

TextWriter.prototype = new Writer()
TextWriter.prototype.constructor = TextWriter

function Data64URIWriter(contentType) {
    const that = this
    let data = '', pending = ''

    const init = callback => {
        data += `data:${(contentType || '')};base64,`
        callback()
    }

    const writeUint8Array = (array, callback) => {
        let i, dataString = pending
        const delta = pending.length
        pending = ''

        for (i = 0; i < (Math.floor((delta + array.length) / 3) * 3) - delta; i++) {
            dataString += String.fromCharCode(array[i])
        }

        for (; i < array.length; i++) pending += String.fromCharCode(array[i])

        if (dataString.length > 2) data += self.btoa(dataString)
        else pending = dataString

        callback()
    }

    const getData = callback => {
        callback(`${data}${self.btoa(pending)}`)
    }

    that.init = init
    that.writeUint8Array = writeUint8Array
    that.getData = getData
}

Data64URIWriter.prototype = new Writer()
Data64URIWriter.prototype.constructor = Data64URIWriter

function BlobWriter(contentType) {
    const that = this
    let blob

    function init(callback) {
        blob = new Blob([], {
            type: contentType,
        })
        callback()
    }

    function writeUint8Array(array, callback) {
        blob = new Blob([blob, appendABViewSupported ? array : array.buffer], {
            type: contentType,
        })
        callback()
    }

    function getData(callback) {
        callback(blob)
    }

    that.init = init
    that.writeUint8Array = writeUint8Array
    that.getData = getData
}

BlobWriter.prototype = new Writer()
BlobWriter.prototype.constructor = BlobWriter

/**
 * inflate/deflate core functions
 * @param worker {Worker} web worker for the task.
 * @param initialMessage {Object} initial message to be sent to the worker. should contain
 *   sn(serial number for distinguishing multiple tasks sent to the worker), and codecClass.
 *   This function may add more properties before sending.
 * @param reader
 * @param writer
 * @param offset
 * @param size
 * @param onprogress
 * @param onend
 * @param onreaderror
 * @param onwriteerror
 */
function launchWorkerProcess(worker, initialMessage, reader, writer, offset, size, onprogress, onend, onreaderror, onwriteerror) {
    const sn = initialMessage.sn
    let chunkIndex = 0, index, outputSize, crc

    const onflush = () => {
        worker.removeEventListener('message', onmessage, false)
        onend(outputSize, crc)
    }

    const onmessage = event => {
        const message = event.data, data = message.data, err = message.error
        if (err) {
            err.toString = () => { return `Error: ${this.message}` }
            onreaderror(err)

            return
        }

        if (message.sn !== sn) return
        if (typeof message.codecTime === 'number') worker.codecTime += message.codecTime // should be before onflush()
        if (typeof message.crcTime === 'number') worker.crcTime += message.crcTime

        switch (message.type) {
            case 'append':
                if (data) {
                    outputSize += data.length
                    writer.writeUint8Array(data, () => {
                        step()
                    }, onwriteerror)
                } else step()

                break
            case 'flush':
                crc = message.crc
                if (data) {
                    outputSize += data.length
                    writer.writeUint8Array(data, () => {
                        onflush()
                    }, onwriteerror)
                } else onflush()

                break
            case 'progress':
                if (onprogress) onprogress(index + message.loaded, size)

                break
            case 'importScripts': //no need to handle here
            case 'newTask':
            case 'echo':

                break
            default:
                console.warn('zip.js:launchWorkerProcess: unknown message: ', message)
        }
    }

    const step = () => {
        index = chunkIndex * CHUNK_SIZE
        // use `<=` instead of `<`, because `size` may be 0.
        if (index <= size) {
            reader.readUint8Array(offset + index, Math.min(CHUNK_SIZE, size - index), array => {
                if (onprogress) onprogress(index, size)

                const msg = index === 0 ? initialMessage : {sn: sn}
                msg.type = 'append'
                msg.data = array

                // posting a message with transferable will fail on IE10
                try {
                    worker.postMessage(msg, [array.buffer])
                } catch (ex) {
                    worker.postMessage(msg) // retry without transferable
                }
                chunkIndex++
            }, onreaderror)
        } else {
            worker.postMessage({
                sn,
                type: 'flush',
            })
        }
    }

    outputSize = 0
    worker.addEventListener('message', onmessage, false)
    step()
}

function launchProcess(process, reader, writer, offset, size, crcType, onprogress, onend, onreaderror, onwriteerror) {
    const crcInput = crcType === 'input',
        crcOutput = crcType === 'output',
        crc = new Crc32()
    let chunkIndex = 0, index, outputSize = 0

    function step() {
        let outputData
        index = chunkIndex * CHUNK_SIZE
        if (index < size)
            reader.readUint8Array(offset + index, Math.min(CHUNK_SIZE, size - index), inputData => {
                let outputData
                try {
                    outputData = process.append(inputData, loaded => {
                        if (onprogress) onprogress(index + loaded, size)
                    })
                } catch (e) {
                    onreaderror(e)
                    return
                }
                if (outputData) {
                    outputSize += outputData.length
                    writer.writeUint8Array(outputData, () => {
                        chunkIndex++
                        setTimeout(step, 1)
                    }, onwriteerror)
                    if (crcOutput) crc.append(outputData)
                } else {
                    chunkIndex++
                    setTimeout(step, 1)
                }

                if (crcInput) crc.append(inputData)

                if (onprogress) onprogress(index, size)
            }, onreaderror)
        else {
            try {
                outputData = process.flush()
            } catch (e) {
                onreaderror(e)
                return
            }

            if (outputData) {
                if (crcOutput) crc.append(outputData)

                outputSize += outputData.length
                writer.writeUint8Array(outputData, () => {
                    onend(outputSize, crc.get())
                }, onwriteerror)
            } else onend(outputSize, crc.get())
        }
    }

    step()
}

function inflate(worker, sn, reader, writer, offset, size, computeCrc32, onend, onprogress, onreaderror, onwriteerror) {
    const crcType = computeCrc32 ? 'output' : 'none'
    if (Zip.useWebWorkers) {
        const initialMessage = {
            sn,
            codecClass: '_zipjs_Inflater',
            crcType,
        }
        launchWorkerProcess(worker, initialMessage, reader, writer, offset, size, onprogress, onend, onreaderror, onwriteerror)
    } else launchProcess(new Inflater(), reader, writer, offset, size, crcType, onprogress, onend, onreaderror, onwriteerror)
}

function deflate(worker, sn, reader, writer, level, onend, onprogress, onreaderror, onwriteerror) {
    const crcType = 'input'
    if (Zip.useWebWorkers) {
        const initialMessage = {
            sn: sn,
            options: {level: level},
            codecClass: '_zipjs_Deflater',
            crcType: crcType,
        }
        launchWorkerProcess(worker, initialMessage, reader, writer, 0, reader.size, onprogress, onend, onreaderror, onwriteerror)
    } else
        launchProcess(new Deflater(), reader, writer, 0, reader.size, crcType, onprogress, onend, onreaderror, onwriteerror)
}

function copy(worker, sn, reader, writer, offset, size, computeCrc32, onend, onprogress, onreaderror, onwriteerror) {
    const crcType = 'input'
    if (Zip.useWebWorkers && computeCrc32) {
        const initialMessage = {
            sn: sn,
            codecClass: '_zipjs_NOOP',
            crcType: crcType,
        }
        launchWorkerProcess(worker, initialMessage, reader, writer, offset, size, onprogress, onend, onreaderror, onwriteerror)
    } else
        launchProcess(new NOOP(), reader, writer, offset, size, crcType, onprogress, onend, onreaderror, onwriteerror)
}

// ZipReader

function decodeASCII(str) {
    const extendedASCII = ['\u00C7', '\u00FC', '\u00E9', '\u00E2', '\u00E4', '\u00E0', '\u00E5', '\u00E7', '\u00EA', '\u00EB',
        '\u00E8', '\u00EF', '\u00EE', '\u00EC', '\u00C4', '\u00C5', '\u00C9', '\u00E6', '\u00C6', '\u00F4', '\u00F6', '\u00F2', '\u00FB', '\u00F9',
        '\u00FF', '\u00D6', '\u00DC', '\u00F8', '\u00A3', '\u00D8', '\u00D7', '\u0192', '\u00E1', '\u00ED', '\u00F3', '\u00FA', '\u00F1', '\u00D1',
        '\u00AA', '\u00BA', '\u00BF', '\u00AE', '\u00AC', '\u00BD', '\u00BC', '\u00A1', '\u00AB', '\u00BB', '_', '_', '_', '\u00A6', '\u00A6',
        '\u00C1', '\u00C2', '\u00C0', '\u00A9', '\u00A6', '\u00A6', '+', '+', '\u00A2', '\u00A5', '+', '+', '-', '-', '+', '-', '+', '\u00E3',
        '\u00C3', '+', '+', '-', '-', '\u00A6', '-', '+', '\u00A4', '\u00F0', '\u00D0', '\u00CA', '\u00CB', '\u00C8', 'i', '\u00CD', '\u00CE',
        '\u00CF', '+', '+', '_', '_', '\u00A6', '\u00CC', '_', '\u00D3', '\u00DF', '\u00D4', '\u00D2', '\u00F5', '\u00D5', '\u00B5', '\u00FE',
        '\u00DE', '\u00DA', '\u00DB', '\u00D9', '\u00FD', '\u00DD', '\u00AF', '\u00B4', '\u00AD', '\u00B1', '_', '\u00BE', '\u00B6', '\u00A7',
        '\u00F7', '\u00B8', '\u00B0', '\u00A8', '\u00B7', '\u00B9', '\u00B3', '\u00B2', '_', ' ']
    let i, out = '', charCode
    for (i = 0; i < str.length; i++) {
        charCode = str.charCodeAt(i) & 0xFF
        if (charCode > 127) out += extendedASCII[charCode - 128]
        else out += String.fromCharCode(charCode)
    }

    return out
}

function decodeUTF8(string) {
    return decodeURIComponent(escape(string))
}

function getString(bytes) {
    let i, str = ''
    for (i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])

    return str
}

function getDate(timeRaw) {
    const date = (timeRaw & 0xffff0000) >> 16, time = timeRaw & 0x0000ffff
    try {
        return new Date(
            1980 + ((date & 0xFE00) >> 9),
            ((date & 0x01E0) >> 5) - 1,
            date & 0x001F,
            (time & 0xF800) >> 11,
            (time & 0x07E0) >> 5,
            (time & 0x001F) * 2,
            0,
        )
    } catch (e) {
    }
}

function readCommonHeader(entry, data, index, centralDirectory, onerror) {
    entry.version = data.view.getUint16(index, true)
    entry.bitFlag = data.view.getUint16(index + 2, true)
    entry.compressionMethod = data.view.getUint16(index + 4, true)
    entry.lastModDateRaw = data.view.getUint32(index + 6, true)
    entry.lastModDate = getDate(entry.lastModDateRaw)
    if ((entry.bitFlag & 0x01) === 0x01) {
        onerror(ERR_ENCRYPTED)
        return
    }

    if (centralDirectory || (entry.bitFlag & 0x0008) !== 0x0008) {
        entry.crc32 = data.view.getUint32(index + 10, true)
        entry.compressedSize = data.view.getUint32(index + 14, true)
        entry.uncompressedSize = data.view.getUint32(index + 18, true)
    }

    if (entry.compressedSize === 0xFFFFFFFF || entry.uncompressedSize === 0xFFFFFFFF) {
        onerror(ERR_ZIP64)
        return
    }

    entry.filenameLength = data.view.getUint16(index + 22, true)
    entry.extraFieldLength = data.view.getUint16(index + 24, true)
}

function createZipReader(reader, callback, onerror) {
    let inflateSN = 0

    function Entry() {
    }

    Entry.prototype.getData = function (writer, onend, onprogress, checkCrc32) {
        const that = this

        const testCrc32 = crc32 => {
            const dataCrc32 = getDataHelper(4)
            dataCrc32.view.setUint32(0, crc32)
            return that.crc32 === dataCrc32.view.getUint32(0)
        }

        const getWriterData = (uncompressedSize, crc32) => {
            if (checkCrc32 && !testCrc32(crc32))
                onerror(ERR_CRC)
            else
                writer.getData(data => {
                    onend(data)
                })
        }

        const onreaderror = err => {
            onerror(err || ERR_READ_DATA)
        }

        const onwriteerror = err => {
            onerror(err || ERR_WRITE_DATA)
        }

        reader.readUint8Array(that.offset, 30, function (bytes) {
            const data = getDataHelper(bytes.length, bytes)
            if (data.view.getUint32(0) !== 0x504b0304) {
                onerror(ERR_BAD_FORMAT)

                return
            }
            readCommonHeader(that, data, 4, false, onerror)

            let dataOffset = that.offset + 30 + that.filenameLength + that.extraFieldLength
            writer.init(() => {
                if (that.compressionMethod === 0)
                    copy(that._worker, inflateSN++, reader, writer, dataOffset, that.compressedSize, checkCrc32, getWriterData, onprogress, onreaderror, onwriteerror)
                else
                    inflate(that._worker, inflateSN++, reader, writer, dataOffset, that.compressedSize, checkCrc32, getWriterData, onprogress, onreaderror, onwriteerror)
            }, onwriteerror)
        }, onreaderror)
    }

    function seekEOCDR(eocdrCallback) {
        // "End of central directory record" is the last part of a zip archive, and is at least 22 bytes long.
        // Zip file comment is the last part of EOCDR and has max length of 64KB,
        // so we only have to search the last 64K + 22 bytes of a archive for EOCDR signature (0x06054b50).
        const EOCDR_MIN = 22
        if (reader.size < EOCDR_MIN) {
            onerror(ERR_BAD_FORMAT)
            return
        }
        const ZIP_COMMENT_MAX = 256 * 256, EOCDR_MAX = EOCDR_MIN + ZIP_COMMENT_MAX

        // In most cases, the EOCDR is EOCDR_MIN bytes long
        doSeek(EOCDR_MIN, () => {
            // If not found, try within EOCDR_MAX bytes
            doSeek(Math.min(EOCDR_MAX, reader.size), () => {
                onerror(ERR_BAD_FORMAT)
            })
        })

        // seek last length bytes of file for EOCDR
        function doSeek(length, eocdrNotFoundCallback) {
            reader.readUint8Array(reader.size - length, length, function (bytes) {
                for (let i = bytes.length - EOCDR_MIN; i >= 0; i--) {
                    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
                        eocdrCallback(new DataView(bytes.buffer, i, EOCDR_MIN))
                        return
                    }
                }
                eocdrNotFoundCallback()
            }, () => {
                onerror(ERR_READ)
            })
        }
    }

    const zipReader = {
        getEntries: function (callback) {
            const worker = this._worker
            // look for End of central directory record
            seekEOCDR(function (dataView) {
                let datalength, fileslength
                datalength = dataView.getUint32(16, true)
                fileslength = dataView.getUint16(8, true)
                if (datalength < 0 || datalength >= reader.size) {
                    onerror(ERR_BAD_FORMAT)
                    return
                }

                reader.readUint8Array(datalength, reader.size - datalength, bytes => {
                    const entries = [], data = getDataHelper(bytes.length, bytes)
                    let i, index = 0, entry, filename, comment

                    for (i = 0; i < fileslength; i++) {
                        entry = new Entry()
                        entry._worker = worker
                        if (data.view.getUint32(index) !== 0x504b0102) {
                            onerror(ERR_BAD_FORMAT)
                            return
                        }

                        readCommonHeader(entry, data, index + 6, true, onerror)

                        entry.commentLength = data.view.getUint16(index + 32, true)
                        entry.directory = ((data.view.getUint8(index + 38) & 0x10) === 0x10)
                        entry.offset = data.view.getUint32(index + 42, true)

                        filename = getString(data.array.subarray(index + 46, index + 46 + entry.filenameLength))
                        entry.filename = ((entry.bitFlag & 0x0800) === 0x0800) ? decodeUTF8(filename) : decodeASCII(filename)
                        if (!entry.directory && entry.filename.charAt(entry.filename.length - 1) === '/') entry.directory = true

                        comment = getString(data.array.subarray(index + 46 + entry.filenameLength + entry.extraFieldLength, index + 46
                            + entry.filenameLength + entry.extraFieldLength + entry.commentLength))
                        entry.comment = ((entry.bitFlag & 0x0800) === 0x0800) ? decodeUTF8(comment) : decodeASCII(comment)
                        entries.push(entry)

                        index += 46 + entry.filenameLength + entry.extraFieldLength + entry.commentLength
                    }

                    callback(entries)
                }, err => {
                    onerror(ERR_READ)
                })
            })
        },
        close: callback => {
            if (this._worker) {
                this._worker.terminate()
                this._worker = null
            }

            if (callback) callback()
        },
        _worker: null,
    }

    if (!Zip.useWebWorkers) callback(zipReader)
    else {
        createWorker('inflater',
            worker => {
                zipReader._worker = worker
                callback(zipReader)
            },
            err => {
                onerror(err)
            },
        )
    }
}

// ZipWriter

function encodeUTF8(string) {
    return unescape(encodeURIComponent(string))
}

function getBytes(str) {
    const array = []
    for (let i = 0; i < str.length; i++) array.push(str.charCodeAt(i))

    return array
}

function createZipWriter(writer, callback, onerror, dontDeflate) {
    const files = {}, filenames = []
    let deflateSN = 0, datalength = 0

    const onwriteerror = err => {
        onerror(err || ERR_WRITE)
    }

    const onreaderror = err => {
        onerror(err || ERR_READ_DATA)
    }

    const zipWriter = {
        add: function (name, reader, onend, onprogress, options) {
            let header, filename, date
            const worker = this._worker

            function writeHeader(callback) {
                let data
                date = options.lastModDate || new Date()
                header = getDataHelper(26)
                files[name] = {
                    headerArray: header.array,
                    directory: options.directory,
                    filename: filename,
                    offset: datalength,
                    comment: getBytes(encodeUTF8(options.comment || '')),
                }

                header.view.setUint32(0, 0x14000808)
                if (options.version) header.view.setUint8(0, options.version)
                if (!dontDeflate && options.level !== 0 && !options.directory) header.view.setUint16(4, 0x0800)
                header.view.setUint16(6, (((date.getHours() << 6) | date.getMinutes()) << 5) | date.getSeconds() / 2, true)
                header.view.setUint16(8, ((((date.getFullYear() - 1980) << 4) | (date.getMonth() + 1)) << 5) | date.getDate(), true)
                header.view.setUint16(22, filename.length, true)

                data = getDataHelper(30 + filename.length)
                data.view.setUint32(0, 0x504b0304)
                data.array.set(header.array, 4)
                data.array.set(filename, 30)
                datalength += data.array.length
                writer.writeUint8Array(data.array, callback, onwriteerror)
            }

            function writeFooter(compressedLength, crc32) {
                const footer = getDataHelper(16)
                datalength += compressedLength || 0
                footer.view.setUint32(0, 0x504b0708)
                if (typeof crc32 != 'undefined') {
                    header.view.setUint32(10, crc32, true)
                    footer.view.setUint32(4, crc32, true)
                }
                if (reader) {
                    footer.view.setUint32(8, compressedLength, true)
                    header.view.setUint32(14, compressedLength, true)
                    footer.view.setUint32(12, reader.size, true)
                    header.view.setUint32(18, reader.size, true)
                }
                writer.writeUint8Array(footer.array, () => {
                    datalength += 16
                    onend()
                }, onwriteerror)
            }

            function writeFile() {
                options = options || {}
                name = name.trim()
                if (options.directory && name.charAt(name.length - 1) !== '/') name += '/'
                if (files.hasOwnProperty(name)) {
                    onerror(ERR_DUPLICATED_NAME)
                    return
                }

                filename = getBytes(encodeUTF8(name))
                filenames.push(name)
                writeHeader(() => {
                    if (reader)
                        if (dontDeflate || options.level === 0) copy(
                            worker,
                            deflateSN++,
                            reader,
                            writer,
                            0,
                            reader.size,
                            true,
                            writeFooter,
                            onprogress,
                            onreaderror,
                            onwriteerror,
                        )
                        else deflate(worker,
                            deflateSN++,
                            reader,
                            writer,
                            options.level,
                            writeFooter,
                            onprogress,
                            onreaderror,
                            onwriteerror,
                        )
                    else writeFooter()
                }, onwriteerror)
            }

            if (reader) reader.init(writeFile, onreaderror)
            else writeFile()
        },
        close: function (callback) {
            if (this._worker) {
                this._worker.terminate()
                this._worker = null
            }

            let data, length = 0, index = 0, indexFilename, file
            for (indexFilename = 0; indexFilename < filenames.length; indexFilename++) {
                file = files[filenames[indexFilename]]
                length += 46 + file.filename.length + file.comment.length
            }

            data = getDataHelper(length + 22)
            for (indexFilename = 0; indexFilename < filenames.length; indexFilename++) {
                file = files[filenames[indexFilename]]
                data.view.setUint32(index, 0x504b0102)
                data.view.setUint16(index + 4, 0x1400)
                data.array.set(file.headerArray, index + 6)
                data.view.setUint16(index + 32, file.comment.length, true)
                if (file.directory)
                    data.view.setUint8(index + 38, 0x10)
                data.view.setUint32(index + 42, file.offset, true)
                data.array.set(file.filename, index + 46)
                data.array.set(file.comment, index + 46 + file.filename.length)
                index += 46 + file.filename.length + file.comment.length
            }

            data.view.setUint32(index, 0x504b0506)
            data.view.setUint16(index + 8, filenames.length, true)
            data.view.setUint16(index + 10, filenames.length, true)
            data.view.setUint32(index + 12, length, true)
            data.view.setUint32(index + 16, datalength, true)
            writer.writeUint8Array(data.array, () => {
                writer.getData(callback)
            }, onwriteerror)
        },
        _worker: null,
    }

    if (!Zip.useWebWorkers) callback(zipWriter)
    else {
        createWorker('deflater',
            worker => {
                zipWriter._worker = worker
                callback(zipWriter)
            },
            err => {
                onerror(err)
            },
        )
    }
}

function resolveURLs(urls) {
    const a = document.createElement('a')
    return urls.map(url => {
        a.href = url
        return a.href
    })
}

const DEFAULT_WORKER_SCRIPTS = {
    deflater: ['z-worker.js', 'deflate.js'],
    inflater: ['z-worker.js', 'inflate.js'],
}

function createWorker(type, callback, onerror) {
    if (Zip.workerScripts !== null && Zip.workerScriptsPath !== null) {
        onerror(new Error('Either zip.workerScripts or zip.workerScriptsPath may be set, not both.'))
        return
    }
    let scripts
    if (Zip.workerScripts) {
        scripts = Zip.workerScripts[type]
        if (!Array.isArray(scripts)) {
            onerror(new Error(`zip.workerScripts.${type} is not an array!`))
            return
        }
        scripts = resolveURLs(scripts)
    } else {
        scripts = DEFAULT_WORKER_SCRIPTS[type].slice(0)
        scripts[0] = (Zip.workerScriptsPath || '') + scripts[0]
    }
    const worker = new Worker(scripts[0], {type: 'module'})
    // record total consumed time by inflater/deflater/crc32 in this worker
    worker.codecTime = worker.crcTime = 0
    worker.postMessage({type: 'importScripts', scripts: scripts.slice(1)})
    worker.addEventListener('message', onmessage)

    function onmessage(ev) {
        const msg = ev.data
        if (msg.error) {
            worker.terminate() // should before onerror(), because onerror() may throw.
            onerror(msg.error)
            return
        }
        if (msg.type === 'importScripts') {
            worker.removeEventListener('message', onmessage)
            worker.removeEventListener('error', errorHandler)
            callback(worker)
        }
    }

    // catch entry script loading error and other unhandled errors
    worker.addEventListener('error', errorHandler)

    function errorHandler(err) {
        worker.terminate()
        onerror(err)
    }
}

function onerror_default(error) {
    console.error(error)
}

function FileWriter(fileEntry, contentType) {
    const that = this
    let writer

    const init = (callback, onerror) => {
        fileEntry.createWriter(function (fileWriter) {
            writer = fileWriter
            callback()
        }, onerror)
    }

    const writeUint8Array = (array, callback, onerror) => {
        const blob = new Blob([appendABViewSupported ? array : array.buffer], {
            type: contentType,
        })
        writer.onwrite = function () {
            writer.onwrite = null
            callback()
        }
        writer.onerror = onerror
        writer.write(blob)
    }

    const getData = callback => {
        fileEntry.file(callback)
    }

    that.init = init
    that.writeUint8Array = writeUint8Array
    that.getData = getData
}

FileWriter.prototype = new Writer()
FileWriter.prototype.constructor = FileWriter

const Zip = {
    Reader,
    Writer,
    BlobReader,
    Data64URIReader,
    TextReader,
    BlobWriter,
    Data64URIWriter,
    TextWriter,
    FileWriter,
    createReader: (reader, callback, onerror) => {
        onerror = onerror || onerror_default

        reader.init(() => {
            createZipReader(reader, callback, onerror)
        }, onerror)
    },
    createWriter: (writer, callback, onerror, dontDeflate) => {
        onerror = onerror || onerror_default
        dontDeflate = !!dontDeflate

        writer.init(() => {
            createZipWriter(writer, callback, onerror, dontDeflate)
        }, onerror)
    },
    useWebWorkers: true,
    /**
     * Directory containing the default worker scripts (z-worker.js, deflate.js, and inflate.js), relative to current base url.
     * E.g.: zip.workerScripts = './';
     */
    workerScriptsPath: null,
    /**
     * Advanced option to control which scripts are loaded in the Web worker. If this option is specified, then workerScriptsPath must not be set.
     * workerScripts.deflater/workerScripts.inflater should be arrays of urls to scripts for deflater/inflater, respectively.
     * Scripts in the array are executed in order, and the first one should be z-worker.js, which is used to start the worker.
     * All urls are relative to current base url.
     * E.g.:
     * zip.workerScripts = {
     *   deflater: ['z-worker.js', 'deflate.js'],
     *   inflater: ['z-worker.js', 'inflate.js']
     * };
     */
    workerScripts: {
        deflater: ['./js/libs/zip/z-worker.js', './js/libs/zip/deflate.js'],
        inflater: ['./js/libs/zip/z-worker.js', './js/libs/zip/inflate.js'],
    },
}
export default Zip