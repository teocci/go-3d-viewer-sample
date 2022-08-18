/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-18
 */
export default class BaseMaterial {
    constructor(index, name) {
        this.index = index
        this.name = name ?? ''
        this.mtllib = ''
        this.smooth = false
        this.groupStart = 0
        this.groupEnd = -1
        this.groupCount = -1
        this.inherited = false
    }

    clone(index) {
        const cloned = new BaseMaterial(typeof index === 'number' ? index : this.index)
        cloned.name = this.name
        cloned.mtllib = this.mtllib
        cloned.smooth = this.smooth

        return cloned
    }
}