/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-18
 */
export default class BinaryReader {
    constructor(buffer, littleEndian) {
        this.dv = new DataView(buffer)
        this.offset = 0
        this.littleEndian = littleEndian ?? true
    }

    getOffset() {
        return this.offset
    }

    size() {
        return this.dv.buffer.byteLength
    }

    skip(length) {
        this.offset += length
    }

    getUint8() {
        const value = this.dv.getUint8(this.offset)
        this.offset += 1

        return value
    }

    // seems like true/false representation depends on exporter.
    // true: 1 or 'Y'(=0x59), false: 0 or 'T'(=0x54)
    // then sees LSB.
    getBoolean() {
        return (this.getUint8() & 1) === 1
    }

    getBooleanArray(size) {
        const a = []
        for (let i = 0; i < size; i++) a.push(this.getBoolean())

        return a
    }

    getInt16() {
        const value = this.dv.getInt16(this.offset, this.littleEndian)
        this.offset += 2

        return value
    }

    getInt32() {
        const value = this.dv.getInt32(this.offset, this.littleEndian)
        this.offset += 4

        return value
    }

    getInt32Array(size) {
        const a = []
        for (let i = 0; i < size; i++) a.push(this.getInt32())

        return a
    }

    getUint32() {
        const value = this.dv.getUint32(this.offset, this.littleEndian)
        this.offset += 4

        return value
    }

    /**
     * JavaScript doesn't support 64-bit integer so calculate this here
     * 1 << 32 will return 1 so using multiply operation instead here.
     * There's a possibility that this method returns wrong value if the value
     * is out of the range between Number.MAX_SAFE_INTEGER and Number.MIN_SAFE_INTEGER.
     * TODO: safely handle 64-bit integer
     *
     * @returns {number}
     */
    getInt64() {
        let low, high
        if (this.littleEndian) {
            low = this.getUint32()
            high = this.getUint32()
        } else {
            high = this.getUint32()
            low = this.getUint32()
        }

        // calculate negative value
        if (high & 0x80000000) {
            high = ~high & 0xFFFFFFFF
            low = ~low & 0xFFFFFFFF

            if (low === 0xFFFFFFFF) high = (high + 1) & 0xFFFFFFFF
            low = (low + 1) & 0xFFFFFFFF

            return -(high * 0x100000000 + low)

        }

        return high * 0x100000000 + low
    }

    getInt64Array(size) {
        const a = []
        for (let i = 0; i < size; i++) a.push(this.getInt64())

        return a
    }

    /**
     * @note: see getInt64() comment
     *
     * @returns {number}
     */
    getUint64() {
        let low, high
        if (this.littleEndian) {
            low = this.getUint32()
            high = this.getUint32()
        } else {
            high = this.getUint32()
            low = this.getUint32()
        }

        return high * 0x100000000 + low
    }

    getFloat32() {
        const value = this.dv.getFloat32(this.offset, this.littleEndian)
        this.offset += 4

        return value
    }

    getFloat32Array(size) {
        const a = []
        for (let i = 0; i < size; i++) a.push(this.getFloat32())

        return a
    }

    getFloat64() {
        const value = this.dv.getFloat64(this.offset, this.littleEndian)
        this.offset += 8

        return value
    }

    getFloat64Array(size) {
        const a = []
        for (let i = 0; i < size; i++) a.push(this.getFloat64())

        return a
    }

    getArrayBuffer(size) {
        const value = this.dv.buffer.slice(this.offset, this.offset + size)
        this.offset += size

        return value
    }

    getString(size) {
        // note: safari 9 doesn't support Uint8Array.indexOf; create intermediate array instead
        let a = []
        for (let i = 0; i < size; i++) a[i] = this.getUint8()

        const nullByte = a.indexOf(0)
        if (nullByte >= 0) a = a.slice(0, nullByte)

        return THREE.LoaderUtils.decodeText(new Uint8Array(a))
    }
}