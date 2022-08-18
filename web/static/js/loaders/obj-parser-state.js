/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-18
 */
import ObjElement from './obj-element.js'

export default class OBJParserState {
    _vA = new THREE.Vector3()
    _vB = new THREE.Vector3()
    _vC = new THREE.Vector3()

    _ab = new THREE.Vector3()
    _cb = new THREE.Vector3()

    objects = []
    object = {}

    vertices = []
    normals = []
    colors = []
    uvs = []

    materials = {}
    materialLibraries = []

    constructor(name, fromDeclaration) {
        this.startObject(name, fromDeclaration)
    }

    startObject(name, fromDeclaration) {
        name = name ?? ''
        fromDeclaration = fromDeclaration ?? false

        // If the current object (initial from reset) is not from a g/o declaration in the parsed
        // file. We need to use it for the first parsed g/o to keep things in sync.
        if (this.object && this.object.fromDeclaration === false) {
            this.object.name = name
            this.object.fromDeclaration = fromDeclaration !== false

            return
        }

        const previousMaterial = this.object && typeof this.object.currentMaterial === 'function' ? this.object.currentMaterial() : undefined

        if (this.object && typeof this.object._finalize === 'function') {
            this.object._finalize(true)
        }

        this.object = new ObjElement(name, fromDeclaration )

        /**
         * Inherit previous objects material.
         * Spec tells us that a declared material must be set to all objects until a new material is declared.
         * If an usemtl declaration is encountered while this new object is being parsed, it will
         * overwrite the inherited material. Exception being that there was already face declarations
         * to the inherited material, then it will be preserved for proper MultiMaterial continuation.
         */
        if (previousMaterial && previousMaterial.name && typeof previousMaterial.clone === 'function') {
            const declared = previousMaterial.clone(0)
            declared.inherited = true

            this.object.materials.push(declared)
        }

        this.objects.push(this.object)
    }

    finalize() {
        if (this.object && typeof this.object._finalize === 'function') {

            this.object._finalize(true)
        }
    }

    parseVertexIndex(value, len) {
        const index = parseInt(value, 10)
        return (index >= 0 ? index - 1 : index + len / 3) * 3
    }

    parseNormalIndex(value, len) {
        const index = parseInt(value, 10)
        return (index >= 0 ? index - 1 : index + len / 3) * 3

    }

    parseUVIndex(value, len) {
        const index = parseInt(value, 10)
        return (index >= 0 ? index - 1 : index + len / 2) * 2

    }

    addVertex(a, b, c) {
        const src = this.vertices
        const dst = this.object.geometry.vertices

        this.addVN(src, dst, a, b, c)
    }

    addNormal(a, b, c) {
        const src = this.normals
        const dst = this.object.geometry.normals

        this.addVN(src, dst, a, b, c)
    }

    addVN(src, dst, a, b, c) {
        dst.push(src[a + 0], src[a + 1], src[a + 2])
        dst.push(src[b + 0], src[b + 1], src[b + 2])
        dst.push(src[c + 0], src[c + 1], src[c + 2])
    }

    addVertexPoint(a) {
        const src = this.vertices
        const dst = this.object.geometry.vertices

        dst.push(src[a + 0], src[a + 1], src[a + 2])
    }

    addVertexLine(a) {
        const src = this.vertices;
        const dst = this.object.geometry.vertices;

        dst.push(src[a + 0], src[a + 1], src[a + 2])
    }

    addFaceNormal(a, b, c) {
        const src = this.vertices
        const dst = this.object.geometry.normals

        this._vA.fromArray(src, a)
        this._vB.fromArray(src, b)
        this._vC.fromArray(src, c)

        this._cb.subVectors(this._vC, this._vB)
        this._ab.subVectors(this._vA, this._vB)
        this._cb.cross(this._ab)

        this._cb.normalize()

        dst.push(this._cb.x, this._cb.y, this._cb.z)
        dst.push(this._cb.x, this._cb.y, this._cb.z)
        dst.push(this._cb.x, this._cb.y, this._cb.z)
    }

    addColor(a, b, c) {
        const src = this.colors;
        const dst = this.object.geometry.colors;

        if (src[a] !== undefined) dst.push(src[a + 0], src[a + 1], src[a + 2]);
        if (src[b] !== undefined) dst.push(src[b + 0], src[b + 1], src[b + 2]);
        if (src[c] !== undefined) dst.push(src[c + 0], src[c + 1], src[c + 2]);
    }

    addUV(a, b, c) {
        const src = this.uvs
        const dst = this.object.geometry.uvs

        dst.push(src[a + 0], src[a + 1])
        dst.push(src[b + 0], src[b + 1])
        dst.push(src[c + 0], src[c + 1])
    }

    addDefaultUV() {
        const dst = this.object.geometry.uvs

        dst.push(0, 0)
        dst.push(0, 0)
        dst.push(0, 0)
    }

    addUVLine(a) {
        const src = this.uvs
        const dst = this.object.geometry.uvs

        dst.push(src[a + 0], src[a + 1])
    }

    addFace(a, b, c, ua, ub, uc, na, nb, nc) {
        const vLen = this.vertices.length

        let ia = this.parseVertexIndex(a, vLen)
        let ib = this.parseVertexIndex(b, vLen)
        let ic = this.parseVertexIndex(c, vLen)

        this.addVertex(ia, ib, ic)
        this.addColor(ia, ib, ic)

        // normals
        if (na !== undefined && na !== '') {
            const nLen = this.normals.length

            ia = this.parseNormalIndex(na, nLen)
            ib = this.parseNormalIndex(nb, nLen)
            ic = this.parseNormalIndex(nc, nLen)

            this.addNormal(ia, ib, ic)
        } else {
            this.addFaceNormal(ia, ib, ic)
        }

        // uvs
        if (ua !== undefined && ua !== '') {
            const uvLen = this.uvs.length

            ia = this.parseUVIndex(ua, uvLen)
            ib = this.parseUVIndex(ub, uvLen)
            ic = this.parseUVIndex(uc, uvLen)

            this.addUV(ia, ib, ic)

            this.object.geometry.hasUVIndices = true
        } else {
            // add placeholder values (for inconsistent face definitions)
            this.addDefaultUV()
        }
    }

    addPointGeometry(vertices) {
        this.object.geometry.type = 'Points'

        const vLen = this.vertices.length
        for (let vi = 0, l = vertices.length; vi < l; vi++) {
            const index = this.parseVertexIndex(vertices[vi], vLen)

            this.addVertexPoint(index)
            this.addColor(index)
        }
    }

    addLineGeometry(vertices, uvs) {
        this.object.geometry.type = 'Line'

        const vLen = this.vertices.length
        const uvLen = this.uvs.length

        for (let vi = 0, l = vertices.length; vi < l; vi++) {
            this.addVertexLine(this.parseVertexIndex(vertices[vi], vLen))
        }

        for (let uvi = 0, l = uvs.length; uvi < l; uvi++) {
            this.addUVLine(this.parseUVIndex(uvs[uvi], uvLen))
        }
    }
}