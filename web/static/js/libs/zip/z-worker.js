/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-24
 */
(function main(global) {
    'use strict'
    if (global.zWorkerInitialized) throw new Error('z-worker.js should be run only once')
    global.zWorkerInitialized = true

    addEventListener('message', function (event) {
        const message = event.data, type = message.type, sn = message.sn
        const handler = handlers[type]
        if (handler) {
            try {
                handler(message)
            } catch (e) {
                onError(type, sn, e)
            }
        }
        //for debug
        //postMessage({type: 'echo', originalType: type, sn: sn});
    })

    const handlers = {
        importScripts: doImportScripts,
        newTask,
        append: processData,
        flush: processData,
    }

    // deflater/inflater tasks indexed by serial numbers
    const tasks = {}

    async function doImportScripts(msg) {
        console.log({script: msg.scripts})

        if (msg.scripts && msg.scripts.length > 0) {
            const module = await import(msg.scripts)
        }

        postMessage({type: 'importScripts'})
    }

    function newTask(msg) {
        const CodecClass = global[msg.codecClass]
        const sn = msg.sn
        if (tasks[sn]) throw Error('duplicated sn')

        tasks[sn] = {
            codec: new CodecClass(msg.options),
            crcInput: msg.crcType === 'input',
            crcOutput: msg.crcType === 'output',
            crc: new Crc32(),
        }
        postMessage({type: 'newTask', sn: sn})
    }

    // performance may not be supported
    const now = global.performance ? global.performance.now.bind(global.performance) : Date.now

    function processData(msg) {
        const sn = msg.sn, type = msg.type, input = msg.data
        let task = tasks[sn]
        // allow creating codec on first append
        if (!task && msg.codecClass) {
            newTask(msg)
            task = tasks[sn]
        }
        const isAppend = type === 'append'
        let start = now()
        let output
        if (isAppend) {
            try {
                output = task.codec.append(input, function onprogress(loaded) {
                    postMessage({type: 'progress', sn: sn, loaded: loaded})
                })
            } catch (e) {
                delete tasks[sn]
                throw e
            }
        } else {
            delete tasks[sn]
            console.log({codec: task.codec})
            output = task.codec.flush()
        }
        const codecTime = now() - start

        start = now()
        if (input && task.crcInput) task.crc.append(input)
        if (output && task.crcOutput) task.crc.append(output)
        const crcTime = now() - start

        const rmsg = {type: type, sn: sn, codecTime: codecTime, crcTime: crcTime}
        const transferables = []
        if (output) {
            rmsg.data = output
            transferables.push(output.buffer)
        }

        if (!isAppend && (task.crcInput || task.crcOutput)) rmsg.crc = task.crc.get()

        // posting a message with transferable will fail on IE10
        try {
            postMessage(rmsg, transferables)
        } catch (ex) {
            postMessage(rmsg) // retry without transferable
        }
    }

    function onError(type, sn, e) {
        const msg = {
            type: type,
            sn: sn,
            error: formatError(e),
        }
        postMessage(msg)
    }

    function formatError(e) {
        return {message: e.message, stack: e.stack}
    }

    // Crc32 code copied from file zip.js
    function Crc32() {
        this.crc = -1
    }

    Crc32.prototype.append = function append(data) {
        const table = this.table
        let crc = this.crc | 0
        for (let offset = 0, len = data.length | 0; offset < len; offset++) {
            crc = (crc >>> 8) ^ table[(crc ^ data[offset]) & 0xFF]
        }
        this.crc = crc
    }

    Crc32.prototype.get = function get() {
        return ~this.crc
    }

    Crc32.prototype.table = (function () {
        const table = [] // Uint32Array is actually slower than []
        let i, j, t
        for (i = 0; i < 256; i++) {
            t = i
            for (j = 0; j < 8; j++) {
                if (t & 1) t = (t >>> 1) ^ 0xEDB88320
                else t = t >>> 1
            }
            table[i] = t
        }
        return table
    })()

    // "no-op" codec
    function NOOP() {}

    global._zipjs_NOOP = NOOP
    NOOP.prototype.append = function append(bytes, onprogress) {
        return bytes
    }
    NOOP.prototype.flush = function flush() {}
})(self)