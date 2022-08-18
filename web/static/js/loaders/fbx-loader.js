/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-12
 */
import BinaryParser from './binary-parser.js'
import TextParser from './text-parser.js'
import FBXTreeParser from './fbx-tree-parser.js'
import * as FBXUtils from './fbx-utils.js'


let fbxTree
export default class FBXLoader extends THREE.Loader {
    static TAG = 'fbx'

    constructor(manager) {
        super(manager)
    }

    load(url, onLoad, onProgress, onError) {
        const scope = this

        const path = (scope.path === '') ? THREE.LoaderUtils.extractUrlBase(url) : scope.path

        const loader = new THREE.FileLoader(this.manager)
        loader.setPath(scope.path)
        loader.setResponseType('arraybuffer')
        loader.setRequestHeader(scope.requestHeader)
        loader.setWithCredentials(scope.withCredentials)

        loader.load(url, buffer => {
            try {
                onLoad(scope.parse(buffer, path))
            } catch (e) {
                if (onError) {
                    onError(e)
                } else {
                    console.error(e)
                }

                scope.manager.itemError(url);
            }
        }, onProgress, onError);
    }

    parse(buffer, path) {
        if (FBXUtils.isFbxFormatBinary(buffer)) {
            fbxTree = new BinaryParser().parse(buffer)
        } else {
            const FBXText = FBXUtils.convertArrayBufferToString(buffer)

            if (!FBXUtils.isFbxFormatASCII(FBXText)) {
                throw new Error('THREE.FBXLoader: Unknown format.')
            }

            if (FBXUtils.getFbxVersion(FBXText) < 7000) {
                throw new Error(`THREE.FBXLoader: FBX version not supported, FileVersion: ${FBXUtils.getFbxVersion(FBXText)}`)
            }

            fbxTree = new TextParser().parse(FBXText)
        }

        // console.log( fbxTree )
        const textureLoader = new THREE.TextureLoader(this.manager).setPath(this.resourcePath || path).setCrossOrigin(this.crossOrigin)

        return new FBXTreeParser(textureLoader, this.manager).parse(fbxTree)
    }
}
