/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-12
 */
import OBJParserState from './obj-parser-state.js'

export default class OBJLoader extends THREE.Loader {
    static TAG = 'obj'

    // o object_name | g group_name
    static OBJECT_PATTERN = /^[og]\s*(.+)?/
    // mtllib file_reference
    static MATERIAL_LIBRARY_PATTERN = /^mtllib /
    // usemtl material_name
    static MATERIAL_USE_PATTERN = /^usemtl /
    // usemap map_name
    static MAP_USE_PATTERN = /^usemap /
    static FACE_VERTEX_DATA_SEPARATOR_PATTERN = /\s+/

    _color = new THREE.Color()

    constructor(manager) {
        super(manager)
        this.materials = null
    }

    load(url, onLoad, onProgress, onError) {
        const scope = this

        const loader = new THREE.FileLoader(this.manager)
        loader.setPath(this.path)
        loader.setRequestHeader(this.requestHeader)
        loader.setWithCredentials(this.withCredentials)
        loader.load(url, function (text) {
            try {
                onLoad(scope.parse(text))
            } catch (e) {
                if (onError) {
                    onError(e)
                } else {
                    console.error(e)
                }

                scope.manager.itemError(url)
            }
        }, onProgress, onError)
    }

    setMaterials(materials) {
        this.materials = materials
        return this
    }

    parse(text) {
        const state = new OBJParserState()

        if (text.indexOf('\r\n') !== -1) {
            // This is faster than String.split with regex that splits on both
            text = text.replace(/\r\n/g, '\n')
        }

        if (text.indexOf('\\\n') !== -1) {
            // join lines separated by a line continuation character (\)
            text = text.replace(/\\\n/g, '')
        }

        const lines = text.split('\n')

        let result = []
        for (let i = 0, l = lines.length; i < l; i++) {
            const line = lines[i].trimStart()

            if (line.length === 0) continue

            const lineFirstChar = line.charAt(0)
            // @todo invoke passed in handler if any
            if (lineFirstChar === '#') continue

            if (lineFirstChar === 'v') {
                const data = line.split(OBJLoader.FACE_VERTEX_DATA_SEPARATOR_PATTERN)

                switch (data[0]) {
                    case 'v':
                        state.vertices.push(
                            parseFloat(data[1]),
                            parseFloat(data[2]),
                            parseFloat(data[3]),
                        )
                        if (data.length >= 7) {
                            this._color.setRGB(
                                parseFloat(data[4]),
                                parseFloat(data[5]),
                                parseFloat(data[6]),
                            ).convertSRGBToLinear()

                            state.colors.push(this._color.r, this._color.g, this._color.b)
                        } else {
                            // if no colors are defined, add placeholders so color and vertex indices match
                            state.colors.push(undefined, undefined, undefined)
                        }

                        break
                    case 'vn':
                        state.normals.push(
                            parseFloat(data[1]),
                            parseFloat(data[2]),
                            parseFloat(data[3]),
                        )

                        break
                    case 'vt':
                        state.uvs.push(
                            parseFloat(data[1]),
                            parseFloat(data[2]),
                        )

                        break
                }

            } else if (lineFirstChar === 'f') {
                const lineData = line.slice(1).trim()
                const vertexData = lineData.split(OBJLoader.FACE_VERTEX_DATA_SEPARATOR_PATTERN)
                const faceVertices = []

                // Parse the face vertex data into an easy to work with format
                for (let j = 0, jl = vertexData.length; j < jl; j++) {
                    const vertex = vertexData[j]

                    if (vertex.length > 0) {
                        const vertexParts = vertex.split('/')
                        faceVertices.push(vertexParts)
                    }
                }

                // Draw an edge between the first vertex and all subsequent vertices to form an n-gon
                const v1 = faceVertices[0]

                for (let j = 1, jl = faceVertices.length - 1; j < jl; j++) {
                    const v2 = faceVertices[j]
                    const v3 = faceVertices[j + 1]

                    state.addFace(
                        v1[0], v2[0], v3[0],
                        v1[1], v2[1], v3[1],
                        v1[2], v2[2], v3[2],
                    )
                }
            } else if (lineFirstChar === 'l') {
                const lineParts = line.substring(1).trim().split(' ')
                let lineVertices = []
                const lineUVs = []

                if (line.indexOf('/') === -1) {
                    lineVertices = lineParts
                } else {
                    for (let li = 0, llen = lineParts.length; li < llen; li++) {
                        const parts = lineParts[li].split('/')

                        if (parts[0] !== '') lineVertices.push(parts[0])
                        if (parts[1] !== '') lineUVs.push(parts[1])
                    }
                }

                state.addLineGeometry(lineVertices, lineUVs)
            } else if (lineFirstChar === 'p') {
                const lineData = line.slice(1).trim()
                const pointData = lineData.split(' ')

                state.addPointGeometry(pointData)
            } else if ((result = OBJLoader.OBJECT_PATTERN.exec(line)) !== null) {
                // o object_name
                // or
                // g group_name

                // WORKAROUND: https://bugs.chromium.org/p/v8/issues/detail?id=2869
                // let name = result[ 0 ].slice( 1 ).trim();
                const name = (` ${result[0].slice(1).trim()}`).slice(1)

                state.startObject(name)
            } else if (OBJLoader.MATERIAL_USE_PATTERN.test(line)) {
                // material
                state.object.startMaterial(line.substring(7).trim(), state.materialLibraries)

            } else if (OBJLoader.MATERIAL_LIBRARY_PATTERN.test(line)) {
                // mtl file
                state.materialLibraries.push(line.substring(7).trim())
            } else if (OBJLoader.MAP_USE_PATTERN.test(line)) {
                // the line is parsed but ignored since the loader assumes textures are defined MTL files
                // (according to https://www.okino.com/conv/imp_wave.htm, 'usemap' is the old-style Wavefront texture reference method)

                console.warn('THREE.OBJLoader: Rendering identifier "usemap" not supported. Textures must be defined in MTL files.')
            } else if (lineFirstChar === 's') {
                result = line.split(' ')
                /**
                 * smooth shading
                 * @todo Handle files that have varying smooth values for a set of faces inside one geometry,
                 * but does not define a usemtl for each face set.
                 * This should be detected and a dummy material created (later MultiMaterial and geometry groups).
                 * This requires some care to not create extra material on each smooth value for "normal" obj files.
                 * where explicit usemtl defines geometry groups.
                 * Example asset: examples/models/obj/cerberus/Cerberus.obj
                 *
                 * http://paulbourke.net/dataformats/obj/
                 *
                 * From chapter "Grouping" Syntax explanation "s group_number":
                 * "group_number is the smoothing group number. To turn off smoothing groups, use a value of 0 or off.
                 * Polygonal elements use group numbers to put elements in different smoothing groups. For free-form
                 * surfaces, smoothing groups are either turned on or off; there is no difference between values greater
                 * than 0."
                 */
                if (result.length > 1) {
                    const value = result[1].trim().toLowerCase()
                    state.object.smooth = (value !== '0' && value !== 'off')
                } else {
                    // ZBrush can produce "s" lines #11707
                    state.object.smooth = true
                }

                const material = state.object.currentMaterial()
                if (material) material.smooth = state.object.smooth

            } else {
                // Handle null terminated files without exception
                if (line === '\0') continue

                console.warn('THREE.OBJLoader: Unexpected line: "' + line + '"')
            }
        }

        state.finalize()

        const container = new THREE.Group()
        container.materialLibraries = [].concat(state.materialLibraries)

        const hasPrimitives = !(state.objects.length === 1 && state.objects[0].geometry.vertices.length === 0)

        if (hasPrimitives === true) {
            for (let i = 0, l = state.objects.length; i < l; i++) {
                const object = state.objects[i]
                const geometry = object.geometry
                const materials = object.materials
                const isLine = (geometry.type === 'Line')
                const isPoints = (geometry.type === 'Points')

                let hasVertexColors = false

                // Skip o/g line declarations that did not follow with any faces
                if (geometry.vertices.length === 0) continue

                const bufferGeometry = new THREE.BufferGeometry()
                bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(geometry.vertices, 3))

                if (geometry.normals.length > 0) {
                    bufferGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(geometry.normals, 3))
                }

                if (geometry.colors.length > 0) {
                    hasVertexColors = true
                    bufferGeometry.setAttribute('color', new THREE.Float32BufferAttribute(geometry.colors, 3))
                }

                if (geometry.hasUVIndices === true) {
                    bufferGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(geometry.uvs, 2))
                }

                // Create materials
                const createdMaterials = []
                for (let mi = 0, miLen = materials.length; mi < miLen; mi++) {
                    const sourceMaterial = materials[mi]
                    const materialHash = `${sourceMaterial.name}_${sourceMaterial.smooth}_${hasVertexColors}`
                    let material = state.materials[materialHash]

                    if (this.materials !== null) {
                        material = this.materials.create(sourceMaterial.name)

                        // mtl etc. loaders probably can't create line materials correctly, copy properties to a line material.
                        if (isLine && material && !(material instanceof THREE.LineBasicMaterial)) {
                            const materialLine = new THREE.LineBasicMaterial()
                            THREE.Material.prototype.copy.call(materialLine, material)
                            materialLine.color.copy(material.color)
                            material = materialLine
                        } else if (isPoints && material && !(material instanceof THREE.PointsMaterial)) {
                            const materialPoints = new THREE.PointsMaterial({size: 10, sizeAttenuation: false})
                            THREE.Material.prototype.copy.call(materialPoints, material)
                            materialPoints.color.copy(material.color)
                            materialPoints.map = material.map
                            material = materialPoints
                        }
                    }

                    if (material === undefined) {
                        material = isLine ? new THREE.LineBasicMaterial() : isPoints ? new THREE.PointsMaterial({
                            size: 1,
                            sizeAttenuation: false,
                        }) : new THREE.MeshPhongMaterial()

                        material.name = sourceMaterial.name
                        material.flatShading = !sourceMaterial.smooth
                        material.vertexColors = hasVertexColors

                        state.materials[materialHash] = material
                    }

                    createdMaterials.push(material)
                }

                // Create mesh
                let mesh
                if (createdMaterials.length > 1) {
                    for (let mi = 0, miLen = materials.length; mi < miLen; mi++) {
                        const sourceMaterial = materials[mi]
                        bufferGeometry.addGroup(sourceMaterial.groupStart, sourceMaterial.groupCount, mi)
                    }

                    if (isLine) {
                        mesh = new THREE.LineSegments(bufferGeometry, createdMaterials)
                    } else if (isPoints) {
                        mesh = new THREE.Points(bufferGeometry, createdMaterials)
                    } else {
                        mesh = new THREE.Mesh(bufferGeometry, createdMaterials)
                    }
                } else {
                    if (isLine) {
                        mesh = new THREE.LineSegments(bufferGeometry, createdMaterials[0])
                    } else if (isPoints) {
                        mesh = new THREE.Points(bufferGeometry, createdMaterials[0])
                    } else {
                        mesh = new THREE.Mesh(bufferGeometry, createdMaterials[0])
                    }
                }

                mesh.name = object.name
                container.add(mesh)
            }
        } else {
            // if there is only the default parser state object with no geometry data, interpret data as point cloud
            if (state.vertices.length > 0) {
                const material = new THREE.PointsMaterial({size: 1, sizeAttenuation: false})
                const bufferGeometry = new THREE.BufferGeometry()
                bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(state.vertices, 3))
                if (state.colors.length > 0 && state.colors[0] !== undefined) {
                    bufferGeometry.setAttribute('color', new THREE.Float32BufferAttribute(state.colors, 3))
                    material.vertexColors = true
                }

                const points = new THREE.Points(bufferGeometry, material)
                container.add(points)
            }
        }

        return container
    }
}