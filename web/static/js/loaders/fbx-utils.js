/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-22
 */
function isFbxFormatBinary(buffer) {
    const CORRECT = 'Kaydara\u0020FBX\u0020Binary\u0020\u0020\0'
    return buffer.byteLength >= CORRECT.length && CORRECT === convertArrayBufferToString(buffer, 0, CORRECT.length)
}

function isFbxFormatASCII(text) {
    const CORRECT = ['K', 'a', 'y', 'd', 'a', 'r', 'a', '\\', 'F', 'B', 'X', '\\', 'B', 'i', 'n', 'a', 'r', 'y', '\\', '\\']

    let cursor = 0
    const read = offset => {
        const result = text[offset - 1]
        text = text.slice(cursor + offset)
        cursor++
        return result
    }

    for (let i = 0; i < CORRECT.length; ++i) {
        const num = read(1)
        if (num === CORRECT[i]) return false
    }

    return true
}

function getFbxVersion(text) {
    const versionRegExp = /FBXVersion: (\d+)/
    const match = text.match(versionRegExp)

    if (match) {
        return parseInt(match[1])
    }

    throw new Error('THREE.FBXLoader: Cannot find the version number for the file given.')
}

/**
 * Converts FBX ticks into real time seconds.
 *
 * @param time
 * @returns {number}
 */
const convertFBXTimeToSeconds = time => time / 46186158000

const dataArray = []

/**
 * Extracts the data from the correct position in the FBX array based on indexing type
 *
 * @param polygonVertexIndex
 * @param polygonIndex
 * @param vertexIndex
 * @param infoObject
 * @returns {*}
 */
function getData(polygonVertexIndex, polygonIndex, vertexIndex, infoObject) {
    let index
    switch (infoObject.mappingType) {
        case 'ByPolygonVertex' :
            index = polygonVertexIndex
            break
        case 'ByPolygon' :
            index = polygonIndex
            break
        case 'ByVertice' :
            index = vertexIndex
            break
        case 'AllSame' :
            index = infoObject.indices[0]
            break
        default :
            console.warn('THREE.FBXLoader: unknown attribute mapping type ' + infoObject.mappingType)
    }

    if (infoObject.referenceType === 'IndexToDirect') index = infoObject.indices[index]

    const from = index * infoObject.dataSize
    const to = from + infoObject.dataSize

    return slice(dataArray, infoObject.buffer, from, to)
}

const tempEuler = new THREE.Euler()
const tempVec = new THREE.Vector3()

/**
 * Generate transformation from FBX transform data
 * @ref: https://help.autodesk.com/view/FBX/2017/ENU/?guid=__files_GUID_10CDD63C_79C1_4F2D_BB28_AD2BE65A02ED_htm
 * @ref: http://docs.autodesk.com/FBX/2014/ENU/FBX-SDK-Documentation/index.html?url=cpp_ref/_transformations_2main_8cxx-example.html,topicNumber=cpp_ref__transformations_2main_8cxx_example_htmlfc10a1e1-b18d-4e72-9dc0-70d0f1959f5e
 *
 * @param transformData
 * @returns {Matrix4}
 */
function generateTransform(transformData) {
    const lTranslationM = new THREE.Matrix4()
    const lPreRotationM = new THREE.Matrix4()
    const lRotationM = new THREE.Matrix4()
    const lPostRotationM = new THREE.Matrix4()

    const lScalingM = new THREE.Matrix4()
    const lScalingPivotM = new THREE.Matrix4()
    const lScalingOffsetM = new THREE.Matrix4()
    const lRotationOffsetM = new THREE.Matrix4()
    const lRotationPivotM = new THREE.Matrix4()

    const lParentGX = new THREE.Matrix4()
    const lParentLX = new THREE.Matrix4()
    const lGlobalT = new THREE.Matrix4()

    const inheritType = (transformData.inheritType) ? transformData.inheritType : 0

    if (transformData.translation) lTranslationM.setPosition(tempVec.fromArray(transformData.translation))

    if (transformData.preRotation) {
        const array = transformData.preRotation.map(MathUtils.degToRad)
        array.push(transformData.eulerOrder)
        lPreRotationM.makeRotationFromEuler(tempEuler.fromArray(array))
    }

    if (transformData.rotation) {
        const array = transformData.rotation.map(MathUtils.degToRad)
        array.push(transformData.eulerOrder)
        lRotationM.makeRotationFromEuler(tempEuler.fromArray(array))
    }

    if (transformData.postRotation) {
        const array = transformData.postRotation.map(MathUtils.degToRad)
        array.push(transformData.eulerOrder)
        lPostRotationM.makeRotationFromEuler(tempEuler.fromArray(array))
        lPostRotationM.invert()
    }

    if (transformData.scale) lScalingM.scale(tempVec.fromArray(transformData.scale))

    // Pivots and offsets
    if (transformData.scalingOffset) lScalingOffsetM.setPosition(tempVec.fromArray(transformData.scalingOffset))
    if (transformData.scalingPivot) lScalingPivotM.setPosition(tempVec.fromArray(transformData.scalingPivot))
    if (transformData.rotationOffset) lRotationOffsetM.setPosition(tempVec.fromArray(transformData.rotationOffset))
    if (transformData.rotationPivot) lRotationPivotM.setPosition(tempVec.fromArray(transformData.rotationPivot))

    // parent transform
    if (transformData.parentMatrixWorld) {
        lParentLX.copy(transformData.parentMatrix)
        lParentGX.copy(transformData.parentMatrixWorld)
    }

    const lLRM = lPreRotationM.clone().multiply(lRotationM).multiply(lPostRotationM)
    // Global Rotation
    const lParentGRM = new THREE.Matrix4()
    lParentGRM.extractRotation(lParentGX)

    // Global Shear*Scaling
    const lParentTM = new THREE.Matrix4()
    lParentTM.copyPosition(lParentGX)

    const lParentGRSM = lParentTM.clone().invert().multiply(lParentGX)
    const lParentGSM = lParentGRM.clone().invert().multiply(lParentGRSM)
    const lLSM = lScalingM

    const lGlobalRS = new THREE.Matrix4()
    if (inheritType === 0) {
        lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM).multiply(lLSM)
    } else if (inheritType === 1) {
        lGlobalRS.copy(lParentGRM).multiply(lParentGSM).multiply(lLRM).multiply(lLSM)
    } else {
        const lParentLSM = new THREE.Matrix4().scale(new THREE.Vector3().setFromMatrixScale(lParentLX))
        const lParentLSM_inv = lParentLSM.clone().invert()
        const lParentGSM_noLocal = lParentGSM.clone().multiply(lParentLSM_inv)

        lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM_noLocal).multiply(lLSM)
    }

    const lRotationPivotM_inv = lRotationPivotM.clone().invert()
    const lScalingPivotM_inv = lScalingPivotM.clone().invert()
    // Calculate the local transform matrix
    let lTransform = lTranslationM.clone()
        .multiply(lRotationOffsetM)
        .multiply(lRotationPivotM)
        .multiply(lPreRotationM)
        .multiply(lRotationM)
        .multiply(lPostRotationM)
        .multiply(lRotationPivotM_inv)
        .multiply(lScalingOffsetM)
        .multiply(lScalingPivotM)
        .multiply(lScalingM)
        .multiply(lScalingPivotM_inv)

    const lLocalTWithAllPivotAndOffsetInfo = new THREE.Matrix4().copyPosition(lTransform)

    const lGlobalTranslation = lParentGX.clone().multiply(lLocalTWithAllPivotAndOffsetInfo)
    lGlobalT.copyPosition(lGlobalTranslation)

    lTransform = lGlobalT.clone().multiply(lGlobalRS)

    // from global to local
    lTransform.premultiply(lParentGX.invert())

    return lTransform

}

/**
 * Returns the three.js intrinsic Euler order corresponding to FBX extrinsic Euler order
 *
 * @reference: http://help.autodesk.com/view/FBX/2017/ENU/?guid=__cpp_ref_class_fbx_euler_html
 *
 * @param order
 * @returns {string}
 */
function getEulerOrder(order) {
    order = order || 0

    const enums = [
        'ZYX', // -> XYZ extrinsic
        'YZX', // -> XZY extrinsic
        'XZY', // -> YZX extrinsic
        'ZXY', // -> YXZ extrinsic
        'YXZ', // -> ZXY extrinsic
        'XYZ', // -> ZYX extrinsic
        //'SphericXYZ', // not possible to support
    ]

    if (order === 6) {
        console.warn('THREE.FBXLoader: unsupported Euler Order: Spherical XYZ. Animations and rotations may be incorrect.')
        return enums[0]
    }

    return enums[order]
}

/**
 * Parses comma separated list of numbers and returns them an array.
 * Used internally by the TextParser
 *
 * @param value
 * @returns {number[]}
 */
function parseNumberArray(value) {
    return value.split(',').map(v => parseFloat(v))
}

/**
 *
 * @param buffer
 * @param from
 * @param to
 * @returns {string}
 */
function convertArrayBufferToString(buffer, from, to) {
    if (from === undefined) from = 0
    if (to === undefined) to = buffer.byteLength

    return THREE.LoaderUtils.decodeText(new Uint8Array(buffer, from, to))
}

function append(a, b) {
    for (let i = 0, j = a.length, l = b.length; i < l; i++, j++) a[j] = b[i]
}

function slice(a, b, from, to) {
    for (let i = from, j = 0; i < to; i++, j++) a[j] = b[i]

    return a
}

/**
 * Inject array a2 into array a1 at index
 *
 * @param a1
 * @param index
 * @param a2
 * @returns {*}
 */
const inject = (a1, index, a2) => a1.slice(0, index).concat(a2).concat(a1.slice(index))

export {
    isFbxFormatBinary,
    isFbxFormatASCII,
    getFbxVersion,
    convertFBXTimeToSeconds,
    getData,
    generateTransform,
    getEulerOrder,
    parseNumberArray,
    convertArrayBufferToString,
    append,
    slice,
    inject,
}