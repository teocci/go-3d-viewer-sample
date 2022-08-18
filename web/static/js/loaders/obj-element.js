/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-18
 */
import BaseMaterial from './base-material.js'

export default class OBJElement {
    constructor(name, fromDeclaration) {
        this.name = name ?? ''
        this.fromDeclaration = fromDeclaration !== false
        this.geometry = {
            vertices: [],
            normals: [],
            colors: [],
            uvs: [],
            hasUVIndices: false
        }
        this.materials = []
        this.smooth = true
    }

    startMaterial(name, libraries) {
        const previous = this._finalize(false)
        const material = new BaseMaterial(this.materials.length)
        material.mtllib = Array.isArray(libraries) && libraries.length > 0 ? libraries[libraries.length - 1] : ''
        material.smooth = previous?.smooth ?? this.smooth
        material.groupStart = previous?.groupEnd ?? 0

        // New usemtl declaration overwrites an inherited material, except if faces were declared
        // after the material, then it must be preserved for proper MultiMaterial continuation.
        if (previous && (previous.inherited || previous.groupCount <= 0)) this.materials.splice(previous.index, 1)

        this.materials.push(material)

        return material
    }

    currentMaterial() {
        if (this.materials.length > 0) return this.materials[this.materials.length - 1]

        return undefined
    }

    _finalize(end) {
        const lastMultiMaterial = this.currentMaterial()

        if (lastMultiMaterial && lastMultiMaterial.groupEnd === -1) {
            lastMultiMaterial.groupEnd = this.geometry.vertices.length / 3
            lastMultiMaterial.groupCount = lastMultiMaterial.groupEnd - lastMultiMaterial.groupStart
            lastMultiMaterial.inherited = false
        }

        // Ignore objects tail materials if no face declarations
        // followed them before a new o/g started.
        if (end && this.materials.length > 1) {
            for (let mi = this.materials.length - 1; mi >= 0; mi--) {
                if (this.materials[mi].groupCount <= 0) this.materials.splice(mi, 1)
            }
        }

        // Guarantee at least one empty material, this makes the creation
        // later more straight forward.
        if (end && this.materials.length === 0) {
            this.materials.push({
                name: '',
                smooth: this.smooth
            })
        }

        return lastMultiMaterial
    }
}