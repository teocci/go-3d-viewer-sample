/**
 * FBXTree holds a representation of the FBX data, returned by the TextParser (FBX ASCII format)
 * and BinaryParser (FBX Binary format)
 *
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-18
 */
export default class FBXTree {
    add( key, val ) {
        this[ key ] = val
    }
}