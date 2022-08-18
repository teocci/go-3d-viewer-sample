/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-12
 */
import * as PLYParser from './ply-parser.js'

export default class PYLLoader extends THREE.Loader {
    static TAG = 'ply'

    constructor(manager) {
        super(manager)

        this.propertyNameMapping = {}
    }

    load(url, onLoad, onProgress, onError) {
        const ctx = this

        const loader = new THREE.FileLoader(this.manager)
        loader.setPath(this.path)
        loader.setResponseType('arraybuffer')
        loader.setRequestHeader(this.requestHeader)
        loader.setWithCredentials(this.withCredentials)
        loader.load(url, text => {
            try {
                onLoad(ctx.parse(text))
            } catch (e) {
                if (onError) onError(e)
                else console.error(e)

                ctx.manager.itemError(url)
            }
        }, onProgress, onError)
    }

    setPropertyNameMapping(mapping) {
        this.propertyNameMapping = mapping
    }

    parse(data) {
        const ctx = this
        let geometry

        if (data instanceof ArrayBuffer) {
            const text = THREE.LoaderUtils.decodeText(new Uint8Array(data))
            const header = PLYParser.parseHeader(text, ctx)

            geometry = header.format === 'ascii' ? PLYParser.parseASCII(text, header) : PLYParser.parseBinary(data, header)
        } else {
            geometry = PLYParser.parseASCII(data, PLYParser.parseHeader(data, ctx))
        }

        return geometry
    }
}