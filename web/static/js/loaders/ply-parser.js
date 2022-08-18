/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-01
 */

function makePLYElementProperty(values, nameMapping) {
    const property = {type: values[0]}

    if (property.type === 'list') {
        property.name = values[3]
        property.countType = values[1]
        property.itemType = values[2]
    } else {
        property.name = values[1]
    }

    if (property.name in nameMapping) {
        property.name = nameMapping[property.name]
    }

    return property
}

/**
 *
 * @param data
 * @param ctx
 * @returns {{objInfo: string, comments: *[], headerLength: number, elements: *[]}}
 */
function parseHeader(data, ctx) {
    const patternHeader = /^ply([\s\S]*)end_header(\r\n|\r|\n)/
    const result = patternHeader.exec(data)

    let headerText = ''
    let headerLength = 0

    if (result !== null) {
        headerText = result[1]
        headerLength = new Blob([result[0]]).size
    }

    const header = {
        comments: [],
        elements: [],
        headerLength: headerLength,
        objInfo: '',
    }

    const lines = headerText.split(/\r\n|\r|\n/)
    let currentElement

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]
        line = line.trim()

        if (line === '') continue

        const lineValues = line.split(/\s+/)
        const lineType = lineValues.shift()
        line = lineValues.join(' ')

        switch (lineType) {
            case 'format':
                header.format = lineValues[0]
                header.version = lineValues[1]

                break
            case 'comment':
                header.comments.push(line)

                break
            case 'element':
                if (currentElement !== undefined) header.elements.push(currentElement)

                currentElement = {}
                currentElement.name = lineValues[0]
                currentElement.count = parseInt(lineValues[1])
                currentElement.properties = []

                break
            case 'property':
                currentElement.properties.push(makePLYElementProperty(lineValues, ctx.propertyNameMapping))

                break
            case 'obj_info':
                header.objInfo = line

                break
            default:
                console.log('unhandled', lineType, lineValues)
        }
    }

    if (currentElement !== undefined) header.elements.push(currentElement)

    return header
}

/**
 * Parse ASCII numbers
 *
 * @param n
 * @param type
 * @returns {number}
 */
function parseASCIINumber(n, type) {
    switch (type) {
        case 'char':
        case 'uchar':
        case 'short':
        case 'ushort':
        case 'int':
        case 'uint':
        case 'int8':
        case 'uint8':
        case 'int16':
        case 'uint16':
        case 'int32':
        case 'uint32':
            return parseInt(n)

        case 'float':
        case 'double':
        case 'float32':
        case 'float64':
            return parseFloat(n)
    }
}

/**
 *
 * @param properties
 * @param line
 * @returns {{}}
 */
function parseASCIIElement(properties, line) {
    const values = line.split(/\s+/)
    const element = {}

    for (let i = 0; i < properties.length; i++) {
        if (properties[i].type === 'list') {
            const list = []
            const n = parseASCIINumber(values.shift(), properties[i].countType)

            for (let j = 0; j < n; j++) {
                list.push(parseASCIINumber(values.shift(), properties[i].itemType))
            }

            element[properties[i].name] = list
        } else {
            element[properties[i].name] = parseASCIINumber(values.shift(), properties[i].type)
        }
    }

    return element

}

/**
 * PLY ascii format specification, as per http://en.wikipedia.org/wiki/PLY_(file_format)
 *
 * @param data
 * @param header
 * @returns {THREE.BufferGeometry}
 */
function parseASCII(data, header) {
    const buffer = {
        indices: [],
        vertices: [],
        normals: [],
        uvs: [],
        faceVertexUvs: [],
        colors: [],
    }

    let result
    const patternBody = /end_header\s([\s\S]*)$/
    let body = ''
    if ((result = patternBody.exec(data)) !== null) body = result[1]

    const lines = body.split(/\r\n|\r|\n/)
    let currentElement = 0
    let currentElementCount = 0

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]
        line = line.trim()
        if (line === '') continue

        if (currentElementCount >= header.elements[currentElement].count) {
            currentElement++
            currentElementCount = 0
        }

        const element = parseASCIIElement(header.elements[currentElement].properties, line)
        handleElement(buffer, header.elements[currentElement].name, element)
        currentElementCount++
    }

    return postProcess(buffer)
}

function postProcess(buffer) {
    let geometry = new THREE.BufferGeometry()
    // mandatory buffer data

    if (buffer.indices.length > 0) geometry.setIndex(buffer.indices)
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.vertices, 3))

    // optional buffer data
    if (buffer.normals.length > 0) {
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffer.normals, 3))
    }

    if (buffer.uvs.length > 0) {
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffer.uvs, 2))
    }

    if (buffer.colors.length > 0) {
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffer.colors, 3))
    }

    if (buffer.faceVertexUvs.length > 0) {
        geometry = geometry.toNonIndexed()
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffer.faceVertexUvs, 2))
    }

    geometry.computeBoundingSphere()

    return geometry
}

const _color = new THREE.Color()

function handleElement(buffer, elementName, element) {
    const findAttrName = names => names.find(n => n in element)

    const attrX = findAttrName(['x', 'px', 'posx']) ?? 'x'
    const attrY = findAttrName(['y', 'py', 'posy']) ?? 'y'
    const attrZ = findAttrName(['z', 'pz', 'posz']) ?? 'z'
    const attrNX = findAttrName(['nx', 'normalx'])
    const attrNY = findAttrName(['ny', 'normaly'])
    const attrNZ = findAttrName(['nz', 'normalz'])
    const attrS = findAttrName(['s', 'u', 'texture_u', 'tx'])
    const attrT = findAttrName(['t', 'v', 'texture_v', 'ty'])
    const attrR = findAttrName(['red', 'diffuse_red', 'r', 'diffuse_r'])
    const attrG = findAttrName(['green', 'diffuse_green', 'g', 'diffuse_g'])
    const attrB = findAttrName(['blue', 'diffuse_blue', 'b', 'diffuse_b'])

    if (elementName === 'vertex') {
        buffer.vertices.push(element[attrX], element[attrY], element[attrZ])

        if (attrNX !== null && attrNY !== null && attrNZ !== null) {
            buffer.normals.push(element[attrNX], element[attrNY], element[attrNZ])
        }

        if (attrS !== null && attrT !== null) {
            buffer.uvs.push(element[attrS], element[attrT])
        }

        if (attrR !== null && attrG !== null && attrB !== null) {
            _color.setRGB(
                element[attrR] / 255.0,
                element[attrG] / 255.0,
                element[attrB] / 255.0,
            ).convertSRGBToLinear()

            buffer.colors.push(_color.r, _color.g, _color.b)
        }
    } else if (elementName === 'face') {
        const vertex_indices = element.vertex_indices || element.vertex_index // issue #9338
        const texcoord = element.texcoord

        if (vertex_indices.length === 3) {
            buffer.indices.push(vertex_indices[0], vertex_indices[1], vertex_indices[2])
            if (texcoord && texcoord.length === 6) {
                buffer.faceVertexUvs.push(texcoord[0], texcoord[1])
                buffer.faceVertexUvs.push(texcoord[2], texcoord[3])
                buffer.faceVertexUvs.push(texcoord[4], texcoord[5])
            }
        } else if (vertex_indices.length === 4) {
            buffer.indices.push(vertex_indices[0], vertex_indices[1], vertex_indices[3])
            buffer.indices.push(vertex_indices[1], vertex_indices[2], vertex_indices[3])
        }
    }
}

function binaryRead(data, at, type, little_endian) {
    switch (type) {

        // correspondences for non-specific length types here match ply:
        case 'int8':
        case 'char':
            return [data.getInt8(at), 1]
        case 'uint8':
        case 'uchar':
            return [data.getUint8(at), 1]
        case 'int16':
        case 'short':
            return [data.getInt16(at, little_endian), 2]
        case 'uint16':
        case 'ushort':
            return [data.getUint16(at, little_endian), 2]
        case 'int32':
        case 'int':
            return [data.getInt32(at, little_endian), 4]
        case 'uint32':
        case 'uint':
            return [data.getUint32(at, little_endian), 4]
        case 'float32':
        case 'float':
            return [data.getFloat32(at, little_endian), 4]
        case 'float64':
        case 'double':
            return [data.getFloat64(at, little_endian), 8]
    }
}

function binaryReadElement(data, at, properties, littleEndian) {
    const element = {}
    let result, read = 0

    const l = properties.length
    for (let i = 0; i < l; i++) {
        if (properties[i].type === 'list') {
            const list = []
            result = binaryRead(data, at + read, properties[i].countType, littleEndian)
            const n = result[0]
            read += result[1]
            for (let j = 0; j < n; j++) {
                result = binaryRead(data, at + read, properties[i].itemType, littleEndian)
                list.push(result[0])
                read += result[1]
            }

            element[properties[i].name] = list
        } else {
            result = binaryRead(data, at + read, properties[i].type, littleEndian)
            element[properties[i].name] = result[0]
            read += result[1]
        }
    }

    return [element, read]
}

function parseBinary(buffer, header) {
    const data = {
        indices: [],
        vertices: [],
        normals: [],
        uvs: [],
        faceVertexUvs: [],
        colors: [],
    }

    const littleEndian = (header.format === 'binary_little_endian')
    const body = new DataView(buffer, header.headerLength)

    let result, loc = 0
    for (let currentElement = 0; currentElement < header.elements.length; currentElement++) {
        for (let currentElementCount = 0; currentElementCount < header.elements[currentElement].count; currentElementCount++) {
            result = binaryReadElement(body, loc, header.elements[currentElement].properties, littleEndian)
            loc += result[1]
            const element = result[0]

            handleElement(data, header.elements[currentElement].name, element)
        }
    }

    return postProcess(data)
}

export {
    makePLYElementProperty,
    parseHeader,
    parseASCIINumber,
    parseASCIIElement,
    parseASCII,
    postProcess,
    handleElement,
    binaryRead,
    binaryReadElement,
    parseBinary,
}
