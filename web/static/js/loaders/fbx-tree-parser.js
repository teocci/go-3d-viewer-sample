/**
 * Parse the FBXTree object returned by the BinaryParser or TextParser and return a Group
 *
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-18
 */
import NURBSCurve from '../curves/nurbs-curve.js'
import * as FBXUtils from './fbx-utils.js'

let fbxTree
let connections
let sceneGraph

export default class FBXTreeParser {
    constructor(textureLoader, manager) {
        fbxTree = null
        this.textureLoader = textureLoader
        this.manager = manager
    }

    parse(tree) {
        fbxTree = tree

        connections = this.parseConnections()

        const images = this.parseImages()
        const textures = this.parseTextures(images)
        const materials = this.parseMaterials(textures)
        const deformers = this.parseDeformers()
        const geometryMap = new GeometryParser().parse(deformers)

        this.parseScene(deformers, geometryMap, materials)

        return sceneGraph

    }

    /**
     * Parses FBXTree.Connections which holds parent-child connections between
     * objects (e.g. material -> texture, model->geometry )
     * and details the connection type
     *
     * @returns {Map<any, any>}
     */
    parseConnections() {
        const connectionMap = new Map()
        console.log({fbxTree})

        if ('Connections' in fbxTree) {
            const rawConnections = fbxTree.Connections.connections

            rawConnections.forEach(rawConnection => {
                const fromID = rawConnection[0]
                const toID = rawConnection[1]
                const relationship = rawConnection[2]

                if (!connectionMap.has(fromID)) {
                    connectionMap.set(fromID, {
                        parents: [],
                        children: [],
                    })
                }

                const parentRelationship = {ID: toID, relationship: relationship}
                connectionMap.get(fromID).parents.push(parentRelationship)

                if (!connectionMap.has(toID)) {
                    connectionMap.set(toID, {
                        parents: [],
                        children: [],
                    })
                }

                const childRelationship = {ID: fromID, relationship: relationship}
                connectionMap.get(toID).children.push(childRelationship)
            })
        }

        return connectionMap
    }

    /**
     * Parse FBXTree.Objects.Video for embedded image data
     * These images are connected into textures in FBXTree.Objects.Textures
     * via FBXTree.Connections.
     *
     * @returns {{}}
     */
    parseImages() {
        const images = {}
        const blobs = {}

        if ('Video' in fbxTree.Objects) {
            const videoNodes = fbxTree.Objects.Video
            for (const nodeID in videoNodes) {
                const videoNode = videoNodes[nodeID]
                const id = parseInt(nodeID)
                images[id] = videoNode.RelativeFilename || videoNode.Filename

                // raw image data is in videoNode.Content
                if ('Content' in videoNode) {
                    const arrayBufferContent = (videoNode.Content instanceof ArrayBuffer) && (videoNode.Content.byteLength > 0)
                    const base64Content = (typeof videoNode.Content === 'string') && (videoNode.Content !== '')

                    if (arrayBufferContent || base64Content) {
                        blobs[videoNode.RelativeFilename || videoNode.Filename] = this.parseImage(videoNodes[nodeID])
                    }
                }
            }
        }

        for (const id in images) {
            const filename = images[id]

            if (blobs[filename] !== undefined) images[id] = blobs[filename]
            else images[id] = images[id].split('\\').pop()
        }

        return images
    }

    /**
     * Parse embedded image data in FBXTree.Video.Content
     *
     * @param videoNode
     * @returns {string|null}
     */
    parseImage(videoNode) {
        const content = videoNode.Content
        const fileName = videoNode.RelativeFilename || videoNode.Filename
        const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()

        let type
        switch (extension) {
            case 'bmp':
                type = 'image/bmp'
                break

            case 'jpg':
            case 'jpeg':
                type = 'image/jpeg'
                break

            case 'png':
                type = 'image/png'
                break

            case 'tif':
                type = 'image/tiff'
                break

            case 'tga':
                if (this.manager.getHandler('.tga') === null) {
                    console.warn('FBXLoader: TGA loader not found, skipping ', fileName)
                }

                type = 'image/tga'
                break

            default:
                console.warn('FBXLoader: Image type "' + extension + '" is not supported.')
                return null
        }

        if (typeof content === 'string') { // ASCII format
            return 'data:' + type + 'base64,' + content

        } else { // Binary Format
            const array = new Uint8Array(content)
            return window.URL.createObjectURL(new Blob([array], {type: type}))
        }
    }

    /**
     * Parse nodes in FBXTree.Objects.Texture
     * These contain details such as UV scaling, cropping, rotation etc. and are
     * connected into images in FBXTree.Objects.Video
     *
     * @param images
     * @returns {Map<any, any>}
     */
    parseTextures(images) {
        const textureMap = new Map()

        if ('Texture' in fbxTree.Objects) {
            const textureNodes = fbxTree.Objects.Texture
            for (const nodeID in textureNodes) {
                const texture = this.parseTexture(textureNodes[nodeID], images)
                textureMap.set(parseInt(nodeID), texture)
            }
        }

        return textureMap
    }

    /**
     * Parse individual node in FBXTree.Objects.Texture
     *
     * @param textureNode
     * @param images
     * @returns {Texture}
     */
    parseTexture(textureNode, images) {
        const texture = this.loadTexture(textureNode, images)

        texture.ID = textureNode.id
        texture.name = textureNode.attrName

        const wrapModeU = textureNode.WrapModeU
        const wrapModeV = textureNode.WrapModeV

        const valueU = wrapModeU !== undefined ? wrapModeU.value : 0
        const valueV = wrapModeV !== undefined ? wrapModeV.value : 0

        // http://download.autodesk.com/us/fbx/SDKdocs/FBX_SDK_Help/files/fbxsdkref/class_k_fbx_texture.html#889640e63e2e681259ea81061b85143a
        // 0: repeat(default), 1: clamp
        texture.wrapS = valueU === 0 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
        texture.wrapT = valueV === 0 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping

        if ('Scaling' in textureNode) {
            const values = textureNode.Scaling.value

            texture.repeat.x = values[0]
            texture.repeat.y = values[1]
        }

        if ('Translation' in textureNode) {
            const values = textureNode.Translation.value

            texture.offset.x = values[0]
            texture.offset.y = values[1]
        }

        return texture
    }

    /**
     * Load a texture specified as a blob or data URI, or via an external URL using TextureLoader
     *
     * @param textureNode
     * @param images
     * @returns {Texture}
     */
    loadTexture(textureNode, images) {
        let fileName

        const currentPath = this.textureLoader.path
        const children = connections.get(textureNode.id).children

        if (children !== undefined && children.length > 0 && images[children[0].ID] !== undefined) {
            fileName = images[children[0].ID]
            if (fileName.indexOf('blob:') === 0 || fileName.indexOf('data:') === 0) {
                this.textureLoader.setPath(undefined)
            }
        }

        let texture

        const extension = textureNode.FileName.slice(-3).toLowerCase()
        if (extension === 'tga') {
            const loader = this.manager.getHandler('.tga')
            if (loader === null) {
                console.warn('FBXLoader: TGA loader not found, creating placeholder texture for', textureNode.RelativeFilename)
                texture = new THREE.Texture()
            } else {
                loader.setPath(this.textureLoader.path)
                texture = loader.load(fileName)
            }

        } else if (extension === 'psd') {
            console.warn('FBXLoader: PSD textures are not supported, creating placeholder texture for', textureNode.RelativeFilename)
            texture = new THREE.Texture()
        } else {
            texture = this.textureLoader.load(fileName)
        }

        this.textureLoader.setPath(currentPath)

        return texture
    }

    /**
     * Parse nodes in FBXTree.Objects.Material
     *
     * @param textureMap
     * @returns {Map<any, any>}
     */
    parseMaterials(textureMap) {
        const materialMap = new Map()
        if ('Material' in fbxTree.Objects) {
            const materialNodes = fbxTree.Objects.Material
            for (const nodeID in materialNodes) {
                const material = this.parseMaterial(materialNodes[nodeID], textureMap)

                if (material !== null) materialMap.set(parseInt(nodeID), material)
            }
        }

        return materialMap
    }

    /**
     * Parse single node in FBXTree.Objects.Material
     * Materials are connected to texture maps in FBXTree.Objects.Textures
     * FBX format currently only supports Lambert and Phong shading models
     *
     * @param materialNode
     * @param textureMap
     * @returns {null|*}
     */
    parseMaterial(materialNode, textureMap) {
        const ID = materialNode.id
        const name = materialNode.attrName
        let type = materialNode.ShadingModel

        // Case where FBX wraps shading model in property object.
        if (typeof type === 'object') {
            type = type.value
        }

        // Ignore unused materials which don't have any connections.
        if (!connections.has(ID)) return null

        const parameters = this.parseParameters(materialNode, textureMap, ID)

        let material
        switch (type.toLowerCase()) {
            case 'phong':
                material = new THREE.MeshPhongMaterial()
                break
            case 'lambert':
                material = new THREE.MeshLambertMaterial()
                break
            default:
                console.warn('THREE.FBXLoader: unknown material type "%s". Defaulting to THREE.MeshPhongMaterial.', type)
                material = new THREE.MeshPhongMaterial()
                break
        }

        material.setValues(parameters)
        material.name = name

        return material
    }

    /**
     * Parse FBX material and return parameters suitable for a three.js material
     * Also parse the texture map and return any textures associated with the material
     *
     * @param materialNode
     * @param textureMap
     * @param ID
     * @returns {{}}
     */
    parseParameters(materialNode, textureMap, ID) {
        const parameters = {}

        if (materialNode.BumpFactor) {
            parameters.bumpScale = materialNode.BumpFactor.value
        }

        if (materialNode.Diffuse) {
            parameters.color = new THREE.Color().fromArray(materialNode.Diffuse.value)
        } else if (materialNode.DiffuseColor && (materialNode.DiffuseColor.type === 'Color' || materialNode.DiffuseColor.type === 'ColorRGB')) {
            // The blender exporter exports diffuse here instead of in materialNode.Diffuse
            parameters.color = new THREE.Color().fromArray(materialNode.DiffuseColor.value)
        }

        if (materialNode.DisplacementFactor) {
            parameters.displacementScale = materialNode.DisplacementFactor.value
        }

        if (materialNode.Emissive) {
            parameters.emissive = new THREE.Color().fromArray(materialNode.Emissive.value)
        } else if (materialNode.EmissiveColor && (materialNode.EmissiveColor.type === 'Color' || materialNode.EmissiveColor.type === 'ColorRGB')) {
            // The blender exporter exports an emissive color here instead of in materialNode.Emissive
            parameters.emissive = new THREE.Color().fromArray(materialNode.EmissiveColor.value)
        }

        if (materialNode.EmissiveFactor) {
            parameters.emissiveIntensity = parseFloat(materialNode.EmissiveFactor.value)
        }

        if (materialNode.Opacity) {
            parameters.opacity = parseFloat(materialNode.Opacity.value)
        }

        if (parameters.opacity < 1.0) {
            parameters.transparent = true
        }

        if (materialNode.ReflectionFactor) {
            parameters.reflectivity = materialNode.ReflectionFactor.value
        }

        if (materialNode.Shininess) {
            parameters.shininess = materialNode.Shininess.value
        }

        if (materialNode.Specular) {
            parameters.specular = new THREE.Color().fromArray(materialNode.Specular.value)
        } else if (materialNode.SpecularColor && materialNode.SpecularColor.type === 'Color') {
            // The blender exporter exports specular color here instead of in materialNode.Specular
            parameters.specular = new THREE.Color().fromArray(materialNode.SpecularColor.value)
        }

        const scope = this
        connections.get(ID).children.forEach(child => {
            const type = child.relationship

            switch (type) {
                case 'Bump':
                    parameters.bumpMap = scope.getTexture(textureMap, child.ID)
                    break

                case 'Maya|TEX_ao_map':
                    parameters.aoMap = scope.getTexture(textureMap, child.ID)
                    break

                case 'DiffuseColor':
                case 'Maya|TEX_color_map':
                    parameters.map = scope.getTexture(textureMap, child.ID)
                    if (parameters.map !== undefined) {
                        parameters.map.encoding = THREE.sRGBEncoding
                    }

                    break
                case 'DisplacementColor':
                    parameters.displacementMap = scope.getTexture(textureMap, child.ID)
                    break
                case 'EmissiveColor':
                    parameters.emissiveMap = scope.getTexture(textureMap, child.ID)
                    if (parameters.emissiveMap !== undefined) {
                        parameters.emissiveMap.encoding = THREE.sRGBEncoding
                    }
                    break

                case 'NormalMap':
                case 'Maya|TEX_normal_map':
                    parameters.normalMap = scope.getTexture(textureMap, child.ID)
                    break

                case 'ReflectionColor':
                    parameters.envMap = scope.getTexture(textureMap, child.ID)
                    if (parameters.envMap !== undefined) {
                        parameters.envMap.mapping = THREE.EquirectangularReflectionMapping
                        parameters.envMap.encoding = THREE.sRGBEncoding
                    }

                    break

                case 'SpecularColor':
                    parameters.specularMap = scope.getTexture(textureMap, child.ID)
                    if (parameters.specularMap !== undefined) {
                        parameters.specularMap.encoding = THREE.sRGBEncoding
                    }

                    break

                case 'TransparentColor':
                case 'TransparencyFactor':
                    parameters.alphaMap = scope.getTexture(textureMap, child.ID)
                    parameters.transparent = true
                    break

                case 'AmbientColor':
                case 'ShininessExponent': // AKA glossiness map
                case 'SpecularFactor': // AKA specularLevel
                case 'VectorDisplacementColor': // NOTE: Seems to be a copy of DisplacementColor
                default:
                    console.warn('THREE.FBXLoader: %s map is not supported in three.js, skipping texture.', type)
                    break
            }
        })

        return parameters
    }

    /**
     * Get a texture from the textureMap for use by a material.
     *
     * @param textureMap
     * @param id
     * @returns {*}
     */
    getTexture(textureMap, id) {
        // if the texture is a layered texture, just use the first layer and issue a warning
        if ('LayeredTexture' in fbxTree.Objects && id in fbxTree.Objects.LayeredTexture) {
            console.warn('THREE.FBXLoader: layered textures are not supported in three.js. Discarding all but first layer.')
            id = connections.get(id).children[0].ID
        }

        return textureMap.get(id)
    }

    /**
     * Parse nodes in FBXTree.Objects.Deformer
     * Deformer node can contain skinning or Vertex Cache animation data, however only skinning is supported here
     * Generates map of Skeleton-like objects for use later when generating and binding skeletons.
     *
     * @returns {{skeletons: {}, morphTargets: {}}}
     */
    parseDeformers() {
        const skeletons = {}
        const morphTargets = {}

        if ('Deformer' in fbxTree.Objects) {
            const deformerNodes = fbxTree.Objects.Deformer
            for (const nodeID in deformerNodes) {
                const deformerNode = deformerNodes[nodeID]
                const relationships = connections.get(parseInt(nodeID))

                if (deformerNode.attrType === 'Skin') {
                    const skeleton = this.parseSkeleton(relationships, deformerNodes)
                    skeleton.ID = nodeID

                    if (relationships.parents.length > 1) console.warn('THREE.FBXLoader: skeleton attached to more than one geometry is not supported.')
                    skeleton.geometryID = relationships.parents[0].ID

                    skeletons[nodeID] = skeleton
                } else if (deformerNode.attrType === 'BlendShape') {
                    const morphTarget = {
                        id: nodeID,
                    }

                    morphTarget.rawTargets = this.parseMorphTargets(relationships, deformerNodes)
                    morphTarget.id = nodeID

                    if (relationships.parents.length > 1) console.warn('THREE.FBXLoader: morph target attached to more than one geometry is not supported.')

                    morphTargets[nodeID] = morphTarget
                }
            }
        }
        return {
            skeletons: skeletons,
            morphTargets: morphTargets,
        }
    }

    /**
     * Parse single nodes in FBXTree.Objects.Deformer
     * The top level skeleton node has type 'Skin' and sub nodes have type 'Cluster'
     * Each skin node represents a skeleton and each cluster node represents a bone
     *
     * @param relationships
     * @param deformerNodes
     * @returns {{bones: *[], rawBones: *[]}}
     */
    parseSkeleton(relationships, deformerNodes) {
        const rawBones = []

        relationships.children.forEach(child => {
            const boneNode = deformerNodes[child.ID]
            if (boneNode.attrType !== 'Cluster') return

            const rawBone = {
                ID: child.ID,
                indices: [],
                weights: [],
                transformLink: new THREE.Matrix4().fromArray(boneNode.TransformLink.a),
                // transform: new THREE.Matrix4().fromArray( boneNode.Transform.a ),
                // linkMode: boneNode.Mode,
            }

            if ('Indexes' in boneNode) {
                rawBone.indices = boneNode.Indexes.a
                rawBone.weights = boneNode.Weights.a
            }

            rawBones.push(rawBone)
        })

        return {
            rawBones: rawBones,
            bones: [],
        }
    }

    /**
     * The top level morph deformer node has type "BlendShape" and sub nodes have type "BlendShapeChannel"
     *
     * @param relationships
     * @param deformerNodes
     * @returns {*[]}
     */
    parseMorphTargets(relationships, deformerNodes) {
        const rawMorphTargets = []
        for (let i = 0; i < relationships.children.length; i++) {
            const child = relationships.children[i]
            const morphTargetNode = deformerNodes[child.ID]
            const rawMorphTarget = {
                name: morphTargetNode.attrName,
                initialWeight: morphTargetNode.DeformPercent,
                id: morphTargetNode.id,
                fullWeights: morphTargetNode.FullWeights.a,
            }

            if (morphTargetNode.attrType !== 'BlendShapeChannel') return

            rawMorphTarget.geoID = connections.get(parseInt(child.ID)).children.filter(child => {
                return child.relationship === undefined
            })[0].ID

            rawMorphTargets.push(rawMorphTarget)
        }

        return rawMorphTargets
    }

    /**
     * Create the main THREE.Group() to be returned by the loader
     *
     * @param deformers
     * @param geometryMap
     * @param materialMap
     */
    parseScene(deformers, geometryMap, materialMap) {
        sceneGraph = new THREE.Group()

        const modelMap = this.parseModels(deformers.skeletons, geometryMap, materialMap)
        const modelNodes = fbxTree.Objects.Model
        const scope = this
        modelMap.forEach(model => {
            const modelNode = modelNodes[model.ID]
            scope.setLookAtProperties(model, modelNode)

            const parentConnections = connections.get(model.ID).parents
            parentConnections.forEach(connection => {
                const parent = modelMap.get(connection.ID)
                if (parent !== undefined) parent.add(model)
            })

            if (model.parent === null) {
                sceneGraph.add(model)
            }
        })

        this.bindSkeleton(deformers.skeletons, geometryMap, modelMap)
        this.createAmbientLight()

        sceneGraph.traverse(node => {
            if (node.userData.transformData) {
                if (node.parent) {
                    node.userData.transformData.parentMatrix = node.parent.matrix
                    node.userData.transformData.parentMatrixWorld = node.parent.matrixWorld
                }

                const transform = FBXUtils.generateTransform(node.userData.transformData)

                node.applyMatrix4(transform)
                node.updateWorldMatrix()
            }
        })

        const animations = new AnimationParser().parse()

        // if all the models where already combined in a single group, just return that
        if (sceneGraph.children.length === 1 && sceneGraph.children[0].isGroup) {
            sceneGraph.children[0].animations = animations
            sceneGraph = sceneGraph.children[0]
        }

        sceneGraph.animations = animations
    }

    /**
     * Parse nodes in FBXTree.Objects.Model
     *
     * @param skeletons
     * @param geometryMap
     * @param materialMap
     * @returns {Map<any, any>}
     */
    parseModels(skeletons, geometryMap, materialMap) {
        const modelMap = new Map()
        const modelNodes = fbxTree.Objects.Model

        for (const nodeID in modelNodes) {
            const id = parseInt(nodeID)
            const node = modelNodes[nodeID]
            const relationships = connections.get(id)

            let model = this.buildSkeleton(relationships, skeletons, id, node.attrName)
            if (!model) {
                switch (node.attrType) {
                    case 'Camera':
                        model = this.createCamera(relationships)
                        break
                    case 'Light':
                        model = this.createLight(relationships)
                        break
                    case 'Mesh':
                        model = this.createMesh(relationships, geometryMap, materialMap)
                        break
                    case 'NurbsCurve':
                        model = this.createCurve(relationships, geometryMap)
                        break
                    case 'LimbNode':
                    case 'Root':
                        model = new THREE.Bone()
                        break
                    case 'Null':
                    default:
                        model = new THREE.Group()
                        break
                }

                model.name = node.attrName ? THREE.PropertyBinding.sanitizeNodeName(node.attrName) : ''
                model.ID = id
            }

            this.getTransformData(model, node)
            modelMap.set(id, model)
        }

        return modelMap
    }

    /**
     *
     * @param relationships
     * @param skeletons
     * @param id
     * @param name
     * @returns {null}
     */
    buildSkeleton(relationships, skeletons, id, name) {
        let bone = null

        relationships.parents.forEach(parent => {
            for (const ID in skeletons) {
                const skeleton = skeletons[ID]
                skeleton.rawBones.forEach((rawBone, i) => {
                    if (rawBone.ID === parent.ID) {
                        const subBone = bone
                        bone = new THREE.Bone()
                        bone.matrixWorld.copy(rawBone.transformLink)
                        // set name and id here - otherwise in cases where "subBone" is created it will not have a name / id
                        bone.name = name ? THREE.PropertyBinding.sanitizeNodeName(name) : ''
                        bone.ID = id

                        skeleton.bones[i] = bone

                        // In cases where a bone is shared between multiple meshes
                        // duplicate the bone here and and it as a child of the first bone
                        if (subBone !== null) {
                            bone.add(subBone)
                        }
                    }
                })
            }
        })

        return bone
    }

    /**
     * Create a PerspectiveCamera or OrthographicCamera
     *
     * @param relationships
     * @returns {Object3D}
     */
    createCamera(relationships) {
        let model
        let cameraAttribute

        relationships.children.forEach(child => {
            const attr = fbxTree.Objects.NodeAttribute[child.ID]
            if (attr !== undefined) {
                cameraAttribute = attr
            }
        })

        if (cameraAttribute === undefined) {
            model = new THREE.Object3D()
        } else {
            let type = 0
            if (cameraAttribute.CameraProjectionType !== undefined && cameraAttribute.CameraProjectionType.value === 1) {
                type = 1
            }

            let nearClippingPlane = 1
            if (cameraAttribute.NearPlane !== undefined) {
                nearClippingPlane = cameraAttribute.NearPlane.value / 1000
            }

            let farClippingPlane = 1000
            if (cameraAttribute.FarPlane !== undefined) {
                farClippingPlane = cameraAttribute.FarPlane.value / 1000
            }

            let width = window.innerWidth
            let height = window.innerHeight

            if (cameraAttribute.AspectWidth !== undefined && cameraAttribute.AspectHeight !== undefined) {
                width = cameraAttribute.AspectWidth.value
                height = cameraAttribute.AspectHeight.value
            }

            const aspect = width / height

            let fov = 45
            if (cameraAttribute.FieldOfView !== undefined) {
                fov = cameraAttribute.FieldOfView.value
            }

            const focalLength = cameraAttribute.FocalLength ? cameraAttribute.FocalLength.value : null

            switch (type) {
                case 0: // Perspective
                    model = new THREE.PerspectiveCamera(fov, aspect, nearClippingPlane, farClippingPlane)
                    if (focalLength !== null) model.setFocalLength(focalLength)
                    break
                case 1: // Orthographic
                    model = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, nearClippingPlane, farClippingPlane)
                    break
                default:
                    console.warn('THREE.FBXLoader: Unknown camera type ' + type + '.')
                    model = new THREE.Object3D()
                    break
            }
        }

        return model
    }

    /**
     * Create a DirectionalLight, PointLight or SpotLight
     *
     * @param relationships
     * @returns {Object3D}
     */
    createLight(relationships) {
        let model
        let lightAttribute

        relationships.children.forEach(child => {
            const attr = fbxTree.Objects.NodeAttribute[child.ID]
            if (attr !== undefined) {
                lightAttribute = attr
            }
        })

        if (lightAttribute === undefined) {
            model = new THREE.Object3D()
        } else {
            // LightType can be undefined for Point lights
            let type = lightAttribute.LightType === undefined ? 0 : lightAttribute.LightType.value

            let color = 0xffffff
            if (lightAttribute.Color !== undefined) {
                color = new THREE.Color().fromArray(lightAttribute.Color.value)
            }

            let intensity = (lightAttribute.Intensity === undefined) ? 1 : lightAttribute.Intensity.value / 100
            // light disabled
            if (lightAttribute.CastLightOnObject !== undefined && lightAttribute.CastLightOnObject.value === 0) {
                intensity = 0
            }

            let distance = 0
            if (lightAttribute.FarAttenuationEnd !== undefined) {
                if (lightAttribute.EnableFarAttenuation !== undefined && lightAttribute.EnableFarAttenuation.value === 0) {
                    distance = 0
                } else {
                    distance = lightAttribute.FarAttenuationEnd.value
                }
            }

            // TODO: could this be calculated linearly from FarAttenuationStart to FarAttenuationEnd?
            const decay = 1

            switch (type) {
                case 0: // Point
                    model = new THREE.PointLight(color, intensity, distance, decay)
                    break

                case 1: // Directional
                    model = new THREE.DirectionalLight(color, intensity)
                    break

                case 2: // Spot
                    let angle = Math.PI / 3
                    if (lightAttribute.InnerAngle !== undefined) {
                        angle = THREE.THREE.MathUtils.degToRad(lightAttribute.InnerAngle.value)
                    }

                    let penumbra = 0
                    if (lightAttribute.OuterAngle !== undefined) {
                        // TODO: this is not correct - FBX calculates outer and inner angle in degrees
                        // with OuterAngle > InnerAngle && OuterAngle <= Math.PI
                        // while three.js uses a penumbra between (0, 1) to attenuate the inner angle
                        penumbra = THREE.THREE.MathUtils.degToRad(lightAttribute.OuterAngle.value)
                        penumbra = Math.max(penumbra, 1)
                    }

                    model = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay)
                    break
                default:
                    console.warn('THREE.FBXLoader: Unknown light type ' + lightAttribute.LightType.value + ', defaulting to a PointLight.')
                    model = new THREE.PointLight(color, intensity)
                    break
            }

            if (lightAttribute.CastShadows !== undefined && lightAttribute.CastShadows.value === 1) model.castShadow = true
        }

        return model
    }

    /**
     *
     * @param relationships
     * @param geometryMap
     * @param materialMap
     * @returns {Mesh}
     */
    createMesh(relationships, geometryMap, materialMap) {
        let model
        let geometry = null
        let material
        const materials = []

        // get geometry and materials(s) from connections
        relationships.children.forEach(child => {
            if (geometryMap.has(child.ID)) {
                geometry = geometryMap.get(child.ID)
            }

            if (materialMap.has(child.ID)) {
                materials.push(materialMap.get(child.ID))
            }
        })

        if (materials.length > 1) {
            material = materials
        } else if (materials.length > 0) {
            material = materials[0]
        } else {
            material = new THREE.MeshPhongMaterial({color: 0xcccccc})
            materials.push(material)
        }

        if ('color' in geometry.attributes) {
            materials.forEach(material => {
                material.vertexColors = true
            })
        }

        if (geometry.FBX_Deformer) {
            model = new THREE.SkinnedMesh(geometry, material)
            model.normalizeSkinWeights()
        } else {
            model = new THREE.Mesh(geometry, material)
        }

        return model

    }

    /**
     *
     * @param relationships
     * @param geometryMap
     * @returns {Line|*}
     */
    createCurve(relationships, geometryMap) {
        const geometry = relationships.children.reduce((geo, child) => {
            if (geometryMap.has(child.ID)) geo = geometryMap.get(child.ID)
            return geo
        }, null)

        // FBX does not list materials for Nurbs lines, so we'll just put our own in here.
        const material = new THREE.LineBasicMaterial({color: 0x3300ff, linewidth: 1})
        return new THREE.Line(geometry, material)
    }

    /**
     *
     * @param model
     * @param modelNode
     */
    getTransformData(model, modelNode) {
        const transformData = {}

        if ('InheritType' in modelNode) transformData.inheritType = parseInt(modelNode.InheritType.value)

        if ('RotationOrder' in modelNode) transformData.eulerOrder = FBXUtils.getEulerOrder(modelNode.RotationOrder.value)
        else transformData.eulerOrder = 'ZYX'

        if ('Lcl_Translation' in modelNode) transformData.translation = modelNode.Lcl_Translation.value

        if ('PreRotation' in modelNode) transformData.preRotation = modelNode.PreRotation.value
        if ('Lcl_Rotation' in modelNode) transformData.rotation = modelNode.Lcl_Rotation.value
        if ('PostRotation' in modelNode) transformData.postRotation = modelNode.PostRotation.value

        if ('Lcl_Scaling' in modelNode) transformData.scale = modelNode.Lcl_Scaling.value

        if ('ScalingOffset' in modelNode) transformData.scalingOffset = modelNode.ScalingOffset.value
        if ('ScalingPivot' in modelNode) transformData.scalingPivot = modelNode.ScalingPivot.value

        if ('RotationOffset' in modelNode) transformData.rotationOffset = modelNode.RotationOffset.value
        if ('RotationPivot' in modelNode) transformData.rotationPivot = modelNode.RotationPivot.value

        model.userData.transformData = transformData

    }

    /**
     *
     * @param model
     * @param modelNode
     */
    setLookAtProperties(model, modelNode) {
        if ('LookAtProperty' in modelNode) {
            const children = connections.get(model.ID).children
            children.forEach(child => {
                if (child.relationship === 'LookAtProperty') {
                    const lookAtTarget = fbxTree.Objects.Model[child.ID]

                    if ('Lcl_Translation' in lookAtTarget) {
                        const pos = lookAtTarget.Lcl_Translation.value
                        // DirectionalLight, SpotLight
                        if (model.target !== undefined) {
                            model.target.position.fromArray(pos)
                            sceneGraph.add(model.target)
                        } else { // Cameras and other Object3Ds
                            model.lookAt(new THREE.Vector3().fromArray(pos))
                        }
                    }
                }
            })
        }
    }

    /**
     *
     * @param skeletons
     * @param geometryMap
     * @param modelMap
     */
    bindSkeleton(skeletons, geometryMap, modelMap) {
        const bindMatrices = this.parsePoseNodes()

        for (const ID in skeletons) {
            const skeleton = skeletons[ID]
            const parents = connections.get(parseInt(skeleton.ID)).parents

            parents.forEach(parent => {
                if (geometryMap.has(parent.ID)) {
                    const geoID = parent.ID
                    const geoRelationships = connections.get(geoID)

                    geoRelationships.parents.forEach(geoConnParent => {
                        if (modelMap.has(geoConnParent.ID)) {
                            const model = modelMap.get(geoConnParent.ID)
                            model.bind(new THREE.Skeleton(skeleton.bones), bindMatrices[geoConnParent.ID])
                        }
                    })
                }
            })
        }
    }

    /**
     *
     * @returns {{}}
     */
    parsePoseNodes() {
        const bindMatrices = {}

        if ('Pose' in fbxTree.Objects) {
            const BindPoseNode = fbxTree.Objects.Pose
            for (const nodeID in BindPoseNode) {
                if (BindPoseNode[nodeID].attrType === 'BindPose' && BindPoseNode[nodeID].NbPoseNodes > 0) {
                    const poseNodes = BindPoseNode[nodeID].PoseNode
                    if (Array.isArray(poseNodes)) {
                        poseNodes.forEach(poseNode => {
                            bindMatrices[poseNode.Node] = new THREE.Matrix4().fromArray(poseNode.Matrix.a)
                        })
                    } else {
                        bindMatrices[poseNodes.Node] = new THREE.Matrix4().fromArray(poseNodes.Matrix.a)
                    }
                }
            }
        }

        return bindMatrices
    }

    /**
     * Parse ambient color in FBXTree.GlobalSettings - if it's not set to black (default), create an ambient light
     */
    createAmbientLight() {
        if ('GlobalSettings' in fbxTree && 'AmbientColor' in fbxTree.GlobalSettings) {
            const ambientColor = fbxTree.GlobalSettings.AmbientColor.value
            const r = ambientColor[0]
            const g = ambientColor[1]
            const b = ambientColor[2]

            if (r !== 0 || g !== 0 || b !== 0) {
                const color = new THREE.Color(r, g, b)
                sceneGraph.add(new THREE.AmbientLight(color, 1))
            }
        }
    }
}

/**
 * Parse Geometry data from FBXTree and return map of BufferGeometries
 */
class GeometryParser {
    /**
     * Parse nodes in FBXTree.Objects.Geometry
     *
     * @param deformers
     * @returns {Map<any, any>}
     */
    parse(deformers) {
        const geometryMap = new Map()
        if ('Geometry' in fbxTree.Objects) {
            const geoNodes = fbxTree.Objects.Geometry
            for (const nodeID in geoNodes) {
                const relationships = connections.get(parseInt(nodeID))
                const geo = this.parseGeometry(relationships, geoNodes[nodeID], deformers)

                geometryMap.set(parseInt(nodeID), geo)
            }
        }

        return geometryMap
    }

    /**
     * Parse single node in FBXTree.Objects.Geometry
     *
     * @param relationships
     * @param geoNode
     * @param deformers
     * @returns {*|BufferGeometry}
     */
    parseGeometry(relationships, geoNode, deformers) {
        switch (geoNode.attrType) {
            case 'Mesh':
                return this.parseMeshGeometry(relationships, geoNode, deformers)
            case 'NurbsCurve':
                return this.parseNurbsGeometry(geoNode)
        }
    }

    /**
     * Parse single node mesh geometry in FBXTree.Objects.Geometry
     *
     * @param relationships
     * @param geoNode
     * @param deformers
     */
    parseMeshGeometry(relationships, geoNode, deformers) {
        const skeletons = deformers.skeletons
        const morphTargets = []

        const modelNodes = relationships.parents.map(parent => {
            return fbxTree.Objects.Model[parent.ID]
        })

        // don't create geometry if it is not associated with any models
        if (modelNodes.length === 0) return

        const skeleton = relationships.children.reduce((skeleton, child) => {
            if (skeletons[child.ID] !== undefined) skeleton = skeletons[child.ID]
            return skeleton
        }, null)

        relationships.children.forEach(child => {
            if (deformers.morphTargets[child.ID] !== undefined) {
                morphTargets.push(deformers.morphTargets[child.ID])
            }
        })

        // Assume one model and get the preRotation from that
        // if there is more than one model associated with the geometry this may cause problems
        const modelNode = modelNodes[0]
        const transformData = {}

        if ('RotationOrder' in modelNode) transformData.eulerOrder = FBXUtils.getEulerOrder(modelNode.RotationOrder.value)
        if ('InheritType' in modelNode) transformData.inheritType = parseInt(modelNode.InheritType.value)

        if ('GeometricTranslation' in modelNode) transformData.translation = modelNode.GeometricTranslation.value
        if ('GeometricRotation' in modelNode) transformData.rotation = modelNode.GeometricRotation.value
        if ('GeometricScaling' in modelNode) transformData.scale = modelNode.GeometricScaling.value

        const transform = FBXUtils.generateTransform(transformData)

        return this.genGeometry(geoNode, skeleton, morphTargets, transform)
    }

    /**
     * Generate a BufferGeometry from a node in FBXTree.Objects.Geometry
     *
     * @param geoNode
     * @param skeleton
     * @param morphTargets
     * @param preTransform
     * @returns {BufferGeometry}
     */
    genGeometry(geoNode, skeleton, morphTargets, preTransform) {
        const geo = new THREE.BufferGeometry()
        if (geoNode.attrName) geo.name = geoNode.attrName

        const geoInfo = this.parseGeoNode(geoNode, skeleton)
        const buffers = this.genBuffers(geoInfo)

        const positionAttribute = new THREE.Float32BufferAttribute(buffers.vertex, 3)
        positionAttribute.applyMatrix4(preTransform)

        geo.setAttribute('position', positionAttribute)
        if (buffers.colors.length > 0) {
            geo.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3))
        }

        if (skeleton) {
            geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(buffers.weightsIndices, 4))
            geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(buffers.vertexWeights, 4))

            // used later to bind the skeleton to the model
            geo.FBX_Deformer = skeleton
        }

        if (buffers.normal.length > 0) {
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(preTransform)
            const normalAttribute = new THREE.Float32BufferAttribute(buffers.normal, 3)
            normalAttribute.applyNormalMatrix(normalMatrix)

            geo.setAttribute('normal', normalAttribute)
        }

        buffers.uvs.forEach((uvBuffer, i) => {
            // The first uv buffer is just called 'uv'
            // subsequent uv buffers are called 'uv1', 'uv2', ...
            let name = (i === 0) ? 'uv' : `uv${(i + 1)}`
            geo.setAttribute(name, new THREE.Float32BufferAttribute(buffers.uvs[i], 2))
        })

        if (geoInfo.material && geoInfo.material.mappingType !== 'AllSame') {
            // Convert the material indices of each vertex into rendering groups on the geometry.
            let prevMaterialIndex = buffers.materialIndex[0]
            let startIndex = 0

            buffers.materialIndex.forEach((currentIndex, i) => {
                if (currentIndex !== prevMaterialIndex) {
                    geo.addGroup(startIndex, i - startIndex, prevMaterialIndex)

                    prevMaterialIndex = currentIndex
                    startIndex = i
                }
            })

            // the loop above doesn't add the last group, do that here.
            if (geo.groups.length > 0) {
                const lastGroup = geo.groups[geo.groups.length - 1]
                const lastIndex = lastGroup.start + lastGroup.count

                if (lastIndex !== buffers.materialIndex.length) {
                    geo.addGroup(lastIndex, buffers.materialIndex.length - lastIndex, prevMaterialIndex)
                }
            }

            // case where there are multiple materials but the whole geometry is only
            // using one of them
            if (geo.groups.length === 0) {
                geo.addGroup(0, buffers.materialIndex.length, buffers.materialIndex[0])
            }
        }

        this.addMorphTargets(geo, geoNode, morphTargets, preTransform)

        return geo
    }

    /**
     *
     * @param geoNode
     * @param skeleton
     * @returns {{}}
     */
    parseGeoNode(geoNode, skeleton) {
        const geoInfo = {}
        geoInfo.vertexPositions = geoNode.Vertices !== undefined ? geoNode.Vertices.a : []
        geoInfo.vertexIndices = geoNode.PolygonVertexIndex !== undefined ? geoNode.PolygonVertexIndex.a : []

        if (geoNode.LayerElementColor) {
            geoInfo.color = this.parseVertexColors(geoNode.LayerElementColor[0])
        }

        if (geoNode.LayerElementMaterial) {
            geoInfo.material = this.parseMaterialIndices(geoNode.LayerElementMaterial[0])
        }

        if (geoNode.LayerElementNormal) {
            geoInfo.normal = this.parseNormals(geoNode.LayerElementNormal[0])
        }

        if (geoNode.LayerElementUV) {
            geoInfo.uv = []

            let i = 0
            while (geoNode.LayerElementUV[i]) {
                if (geoNode.LayerElementUV[i].UV) {
                    geoInfo.uv.push(this.parseUVs(geoNode.LayerElementUV[i]))
                }
                i++
            }
        }

        geoInfo.weightTable = {}
        if (skeleton !== null) {
            geoInfo.skeleton = skeleton
            skeleton.rawBones.forEach((rawBone, i) => {
                // loop over the bone's vertex indices and weights
                rawBone.indices.forEach((index, j) => {
                    if (geoInfo.weightTable[index] === undefined) geoInfo.weightTable[index] = []
                    geoInfo.weightTable[index].push({
                        id: i,
                        weight: rawBone.weights[j],
                    })
                })
            })
        }

        return geoInfo
    }

    /**
     *
     * @param geoInfo
     * @returns {{normal: *[], vertexWeights: *[], uvs: *[], materialIndex: *[], vertex: *[], weightsIndices: *[], colors: *[]}}
     */
    genBuffers(geoInfo) {
        const buffers = {
            vertex: [],
            normal: [],
            colors: [],
            uvs: [],
            materialIndex: [],
            vertexWeights: [],
            weightsIndices: [],
        }

        let polygonIndex = 0
        let faceLength = 0
        let displayedWeightsWarning = false

        // these will hold data for a single face
        let facePositionIndexes = []
        let faceNormals = []
        let faceColors = []
        let faceUVs = []
        let faceWeights = []
        let faceWeightIndices = []

        const scope = this
        geoInfo.vertexIndices.forEach((vertexIndex, polygonVertexIndex) => {
            let materialIndex
            let endOfFace = false

            // Face index and vertex index arrays are combined in a single array
            // A cube with quad faces looks like this:
            // PolygonVertexIndex: *24 {
            //  a: 0, 1, 3, -3, 2, 3, 5, -5, 4, 5, 7, -7, 6, 7, 1, -1, 1, 7, 5, -4, 6, 0, 2, -5
            //  }
            // Negative numbers mark the end of a face - first face here is 0, 1, 3, -3
            // to find index of last vertex bit shift the index: ^ - 1
            if (vertexIndex < 0) {
                vertexIndex = vertexIndex ^ -1 // equivalent to ( x * -1 ) - 1
                endOfFace = true
            }

            let weightIndices = []
            let weights = []

            facePositionIndexes.push(vertexIndex * 3, vertexIndex * 3 + 1, vertexIndex * 3 + 2)

            if (geoInfo.color) {
                const data = FBXUtils.getData(polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.color)
                faceColors.push(data[0], data[1], data[2])
            }

            if (geoInfo.skeleton) {
                if (geoInfo.weightTable[vertexIndex] !== undefined) {
                    geoInfo.weightTable[vertexIndex].forEach(wt => {
                        weights.push(wt.weight)
                        weightIndices.push(wt.id)
                    })
                }

                if (weights.length > 4) {
                    if (!displayedWeightsWarning) {
                        console.warn('THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights.')
                        displayedWeightsWarning = true
                    }

                    const wIndex = [0, 0, 0, 0]
                    const Weight = [0, 0, 0, 0]

                    weights.forEach((weight, weightIndex) => {
                        let currentWeight = weight
                        let currentIndex = weightIndices[weightIndex]

                        Weight.forEach((comparedWeight, comparedWeightIndex, comparedWeightArray) => {
                            if (currentWeight > comparedWeight) {
                                comparedWeightArray[comparedWeightIndex] = currentWeight
                                currentWeight = comparedWeight

                                const tmp = wIndex[comparedWeightIndex]
                                wIndex[comparedWeightIndex] = currentIndex
                                currentIndex = tmp
                            }
                        })
                    })

                    weightIndices = wIndex
                    weights = Weight
                }

                // if the weight array is shorter than 4 pad with 0s
                while (weights.length < 4) {
                    weights.push(0)
                    weightIndices.push(0)
                }

                for (let i = 0; i < 4; ++i) {
                    faceWeights.push(weights[i])
                    faceWeightIndices.push(weightIndices[i])
                }
            }

            if (geoInfo.normal) {
                const data = FBXUtils.getData(polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.normal)
                faceNormals.push(data[0], data[1], data[2])
            }

            if (geoInfo.material && geoInfo.material.mappingType !== 'AllSame') {
                materialIndex = FBXUtils.getData(polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.material)[0]
            }

            if (geoInfo.uv) {
                geoInfo.uv.forEach((uv, i) => {
                    const data = FBXUtils.getData(polygonVertexIndex, polygonIndex, vertexIndex, uv)
                    if (faceUVs[i] === undefined) {
                        faceUVs[i] = []
                    }

                    faceUVs[i].push(data[0])
                    faceUVs[i].push(data[1])
                })
            }

            faceLength++
            if (endOfFace) {
                scope.genFace(buffers, geoInfo, facePositionIndexes, materialIndex, faceNormals, faceColors, faceUVs, faceWeights, faceWeightIndices, faceLength)

                polygonIndex++
                faceLength = 0

                // reset arrays for the next face
                facePositionIndexes = []
                faceNormals = []
                faceColors = []
                faceUVs = []
                faceWeights = []
                faceWeightIndices = []
            }
        })

        return buffers
    }

    /**
     * Generate data for a single face in a geometry. If the face is a quad then split it into 2 tris
     *
     * @param buffers
     * @param geoInfo
     * @param facePositionIndexes
     * @param materialIndex
     * @param faceNormals
     * @param faceColors
     * @param faceUVs
     * @param faceWeights
     * @param faceWeightIndices
     * @param faceLength
     */
    genFace(buffers, geoInfo, facePositionIndexes, materialIndex, faceNormals, faceColors, faceUVs, faceWeights, faceWeightIndices, faceLength) {
        for (let i = 2; i < faceLength; i++) {
            buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[0]])
            buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[1]])
            buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[2]])

            buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[(i - 1) * 3]])
            buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[(i - 1) * 3 + 1]])
            buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[(i - 1) * 3 + 2]])

            buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i * 3]])
            buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i * 3 + 1]])
            buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i * 3 + 2]])

            if (geoInfo.skeleton) {

                buffers.vertexWeights.push(faceWeights[0])
                buffers.vertexWeights.push(faceWeights[1])
                buffers.vertexWeights.push(faceWeights[2])
                buffers.vertexWeights.push(faceWeights[3])

                buffers.vertexWeights.push(faceWeights[(i - 1) * 4])
                buffers.vertexWeights.push(faceWeights[(i - 1) * 4 + 1])
                buffers.vertexWeights.push(faceWeights[(i - 1) * 4 + 2])
                buffers.vertexWeights.push(faceWeights[(i - 1) * 4 + 3])

                buffers.vertexWeights.push(faceWeights[i * 4])
                buffers.vertexWeights.push(faceWeights[i * 4 + 1])
                buffers.vertexWeights.push(faceWeights[i * 4 + 2])
                buffers.vertexWeights.push(faceWeights[i * 4 + 3])

                buffers.weightsIndices.push(faceWeightIndices[0])
                buffers.weightsIndices.push(faceWeightIndices[1])
                buffers.weightsIndices.push(faceWeightIndices[2])
                buffers.weightsIndices.push(faceWeightIndices[3])

                buffers.weightsIndices.push(faceWeightIndices[(i - 1) * 4])
                buffers.weightsIndices.push(faceWeightIndices[(i - 1) * 4 + 1])
                buffers.weightsIndices.push(faceWeightIndices[(i - 1) * 4 + 2])
                buffers.weightsIndices.push(faceWeightIndices[(i - 1) * 4 + 3])

                buffers.weightsIndices.push(faceWeightIndices[i * 4])
                buffers.weightsIndices.push(faceWeightIndices[i * 4 + 1])
                buffers.weightsIndices.push(faceWeightIndices[i * 4 + 2])
                buffers.weightsIndices.push(faceWeightIndices[i * 4 + 3])

            }

            if (geoInfo.color) {
                buffers.colors.push(faceColors[0])
                buffers.colors.push(faceColors[1])
                buffers.colors.push(faceColors[2])

                buffers.colors.push(faceColors[(i - 1) * 3])
                buffers.colors.push(faceColors[(i - 1) * 3 + 1])
                buffers.colors.push(faceColors[(i - 1) * 3 + 2])

                buffers.colors.push(faceColors[i * 3])
                buffers.colors.push(faceColors[i * 3 + 1])
                buffers.colors.push(faceColors[i * 3 + 2])
            }

            if (geoInfo.material && geoInfo.material.mappingType !== 'AllSame') {
                buffers.materialIndex.push(materialIndex)
                buffers.materialIndex.push(materialIndex)
                buffers.materialIndex.push(materialIndex)
            }

            if (geoInfo.normal) {
                buffers.normal.push(faceNormals[0])
                buffers.normal.push(faceNormals[1])
                buffers.normal.push(faceNormals[2])

                buffers.normal.push(faceNormals[(i - 1) * 3])
                buffers.normal.push(faceNormals[(i - 1) * 3 + 1])
                buffers.normal.push(faceNormals[(i - 1) * 3 + 2])

                buffers.normal.push(faceNormals[i * 3])
                buffers.normal.push(faceNormals[i * 3 + 1])
                buffers.normal.push(faceNormals[i * 3 + 2])
            }

            if (geoInfo.uv) {
                geoInfo.uv.forEach((uv, j) => {
                    if (buffers.uvs[j] === undefined) buffers.uvs[j] = []

                    buffers.uvs[j].push(faceUVs[j][0])
                    buffers.uvs[j].push(faceUVs[j][1])

                    buffers.uvs[j].push(faceUVs[j][(i - 1) * 2])
                    buffers.uvs[j].push(faceUVs[j][(i - 1) * 2 + 1])

                    buffers.uvs[j].push(faceUVs[j][i * 2])
                    buffers.uvs[j].push(faceUVs[j][i * 2 + 1])
                })
            }
        }
    }

    /**
     *
     * @param parentGeo
     * @param parentGeoNode
     * @param morphTargets
     * @param preTransform
     */
    addMorphTargets(parentGeo, parentGeoNode, morphTargets, preTransform) {
        if (morphTargets.length === 0) return

        parentGeo.morphTargetsRelative = true
        parentGeo.morphAttributes.position = []
        // parentGeo.morphAttributes.normal = [] // not implemented

        const scope = this
        morphTargets.forEach(morphTarget => {
            morphTarget.rawTargets.forEach(rawTarget => {
                const morphGeoNode = fbxTree.Objects.Geometry[rawTarget.geoID]
                if (morphGeoNode !== undefined) {
                    scope.genMorphGeometry(parentGeo, parentGeoNode, morphGeoNode, preTransform, rawTarget.name)
                }
            })
        })
    }

    /**
     * A morph geometry node is similar to a standard  node, and the node is also contained
     * in FBXTree.Objects.Geometry, however it can only have attributes for position, normal
     * and a special attribute Index defining which vertices of the original geometry are affected
     * Normal and position attributes only have data for the vertices that are affected by the morph
     *
     * @param parentGeo
     * @param parentGeoNode
     * @param morphGeoNode
     * @param preTransform
     * @param name
     */
    genMorphGeometry(parentGeo, parentGeoNode, morphGeoNode, preTransform, name) {
        const vertexIndices = (parentGeoNode.PolygonVertexIndex !== undefined) ? parentGeoNode.PolygonVertexIndex.a : []
        const morphPositionsSparse = (morphGeoNode.Vertices !== undefined) ? morphGeoNode.Vertices.a : []
        const indices = (morphGeoNode.Indexes !== undefined) ? morphGeoNode.Indexes.a : []

        const length = parentGeo.attributes.position.count * 3
        const morphPositions = new Float32Array(length)

        for (let i = 0; i < indices.length; i++) {
            const morphIndex = indices[i] * 3

            morphPositions[morphIndex] = morphPositionsSparse[i * 3]
            morphPositions[morphIndex + 1] = morphPositionsSparse[i * 3 + 1]
            morphPositions[morphIndex + 2] = morphPositionsSparse[i * 3 + 2]
        }

        // TODO: add morph normal support
        const morphGeoInfo = {
            vertexIndices: vertexIndices,
            vertexPositions: morphPositions,
        }

        const morphBuffers = this.genBuffers(morphGeoInfo)
        const positionAttribute = new THREE.Float32BufferAttribute(morphBuffers.vertex, 3)
        positionAttribute.name = name || morphGeoNode.attrName
        positionAttribute.applyMatrix4(preTransform)

        parentGeo.morphAttributes.position.push(positionAttribute)
    }

    /**
     * Parse normal from FBXTree.Objects.Geometry.LayerElementNormal if it exists
     *
     * @param NormalNode
     * @returns {{indices: *[], mappingType: *, dataSize: number, referenceType: *, buffer: *}}
     */
    parseNormals(NormalNode) {
        const mappingType = NormalNode.MappingInformationType
        const referenceType = NormalNode.ReferenceInformationType
        const buffer = NormalNode.Normals.a
        let indexBuffer = []

        if (referenceType === 'IndexToDirect') {
            if ('NormalIndex' in NormalNode) {
                indexBuffer = NormalNode.NormalIndex.a
            } else if ('NormalsIndex' in NormalNode) {
                indexBuffer = NormalNode.NormalsIndex.a
            }
        }

        return {
            dataSize: 3,
            buffer: buffer,
            indices: indexBuffer,
            mappingType: mappingType,
            referenceType: referenceType,
        }

    }

    /**
     * Parse UVs from FBXTree.Objects.Geometry.LayerElementUV if it exists
     *
     * @param UVNode
     * @returns {{indices: *[], mappingType: *, dataSize: number, referenceType: *, buffer: *}}
     */
    parseUVs(UVNode) {
        const mappingType = UVNode.MappingInformationType
        const referenceType = UVNode.ReferenceInformationType
        const buffer = UVNode.UV.a
        let indexBuffer = []
        if (referenceType === 'IndexToDirect') {
            indexBuffer = UVNode.UVIndex.a
        }

        return {
            dataSize: 2,
            buffer: buffer,
            indices: indexBuffer,
            mappingType: mappingType,
            referenceType: referenceType,
        }
    }

    /**
     * Parse Vertex Colors from FBXTree.Objects.Geometry.LayerElementColor if it exists
     *
     * @param ColorNode
     * @returns {{indices: *[], mappingType: *, dataSize: number, referenceType: *, buffer: *}}
     */
    parseVertexColors(ColorNode) {
        const mappingType = ColorNode.MappingInformationType
        const referenceType = ColorNode.ReferenceInformationType
        const buffer = ColorNode.Colors.a
        let indexBuffer = []

        if (referenceType === 'IndexToDirect') {
            indexBuffer = ColorNode.ColorIndex.a
        }

        return {
            dataSize: 4,
            buffer: buffer,
            indices: indexBuffer,
            mappingType: mappingType,
            referenceType: referenceType,
        }
    }

    /**
     * Parse mapping and material data in FBXTree.Objects.Geometry.LayerElementMaterial if it exists
     *
     * @param node
     * @returns {{indices: number[], mappingType: string, dataSize: number, referenceType: *, buffer: number[]}|{indices: *[], mappingType: *, dataSize: number, referenceType: *, buffer: *}}
     */
    parseMaterialIndices(node) {
        const mappingType = node.MappingInformationType
        const referenceType = node.ReferenceInformationType

        if (mappingType === 'NoMappingInformation') {
            return {
                dataSize: 1,
                buffer: [0],
                indices: [0],
                mappingType: 'AllSame',
                referenceType: referenceType,
            }
        }

        const materialIndexBuffer = node.Materials.a
        // Since materials are stored as indices, there's a bit of a mismatch between FBX and what
        // we expect.So we create an intermediate buffer that points to the index in the buffer,
        // for conforming with the other functions we've written for other data.
        const materialIndices = []

        for (let i = 0; i < materialIndexBuffer.length; ++i) {
            materialIndices.push(i)
        }

        return {
            dataSize: 1,
            buffer: materialIndexBuffer,
            indices: materialIndices,
            mappingType: mappingType,
            referenceType: referenceType,
        }
    }

    /**
     * Generate a NurbGeometry from a node in FBXTree.Objects.Geometry
     *
     * @param geoNode
     * @returns {BufferGeometry}
     */
    parseNurbsGeometry(geoNode) {
        if (NURBSCurve === undefined) {
            console.error('THREE.FBXLoader: The loader relies on NURBSCurve for any nurbs present in the model. Nurbs will show up as empty geometry.')
            return new THREE.BufferGeometry()
        }

        const order = parseInt(geoNode.Order)
        if (isNaN(order)) {
            console.error('THREE.FBXLoader: Invalid Order %s given for geometry ID: %s', geoNode.Order, geoNode.id)
            return new THREE.BufferGeometry()
        }

        const degree = order - 1

        const knots = geoNode.KnotVector.a
        const controlPoints = []
        const pointsValues = geoNode.Points.a

        for (let i = 0, l = pointsValues.length; i < l; i += 4) {
            controlPoints.push(new Vector4().fromArray(pointsValues, i))
        }

        let startKnot, endKnot

        if (geoNode.Form === 'Closed') {
            controlPoints.push(controlPoints[0])
        } else if (geoNode.Form === 'Periodic') {
            startKnot = degree
            endKnot = knots.length - 1 - startKnot
            for (let i = 0; i < degree; ++i) {
                controlPoints.push(controlPoints[i])
            }
        }

        const curve = new NURBSCurve(degree, knots, controlPoints, startKnot, endKnot)
        const points = curve.getPoints(controlPoints.length * 12)

        return new THREE.BufferGeometry().setFromPoints(points)
    }
}

/**
 * Parse animation data from FBXTree
 */
class AnimationParser {
    /**
     * Take raw animation clips and turn them into three.js animation clips
     *
     * @returns {*[]}
     */
    parse() {
        const animationClips = []
        const rawClips = this.parseClips()
        if (rawClips !== undefined) {
            for (const key in rawClips) {
                const rawClip = rawClips[key]
                const clip = this.addClip(rawClip)
                animationClips.push(clip)
            }
        }

        return animationClips
    }

    /**
     *
     * @returns {{}|undefined}
     */
    parseClips() {
        // since the actual transformation data is stored in FBXTree.Objects.AnimationCurve,
        // if this is undefined we can safely assume there are no animations
        if (fbxTree.Objects.AnimationCurve === undefined) return undefined

        const curveNodesMap = this.parseAnimationCurveNodes()
        this.parseAnimationCurves(curveNodesMap)

        const layersMap = this.parseAnimationLayers(curveNodesMap)
        return this.parseAnimStacks(layersMap)

    }

    /**
     * Parse nodes in FBXTree.Objects.AnimationCurveNode
     * each AnimationCurveNode holds data for an animation transform for a model (e.g. left arm rotation )
     * and is referenced by an AnimationLayer
     * @returns {Map<any, any>}
     */
    parseAnimationCurveNodes() {
        const rawCurveNodes = fbxTree.Objects.AnimationCurveNode
        const curveNodesMap = new Map()

        for (const nodeID in rawCurveNodes) {
            const rawCurveNode = rawCurveNodes[nodeID]

            if (rawCurveNode.attrName.match(/S|R|T|DeformPercent/) !== null) {
                const curveNode = {
                    id: rawCurveNode.id,
                    attr: rawCurveNode.attrName,
                    curves: {},
                }

                curveNodesMap.set(curveNode.id, curveNode)
            }
        }

        return curveNodesMap
    }

    /**
     * Parse nodes in FBXTree.Objects.AnimationCurve and connect them up to
     * previously parsed AnimationCurveNodes. Each AnimationCurve holds data for a single animated
     * axis ( e.g. times and values of x rotation)
     *
     * @param curveNodesMap
     */
    parseAnimationCurves(curveNodesMap) {
        const rawCurves = fbxTree.Objects.AnimationCurve

        // TODO: Many values are identical up to roundoff error, but won't be optimised
        // e.g. position times: [0, 0.4, 0. 8]
        // position values: [7.23538335023477e-7, 93.67518615722656, -0.9982695579528809, 7.23538335023477e-7, 93.67518615722656, -0.9982695579528809, 7.235384487103147e-7, 93.67520904541016, -0.9982695579528809]
        // clearly, this should be optimised to
        // times: [0], positions [7.23538335023477e-7, 93.67518615722656, -0.9982695579528809]
        // this shows up in nearly every FBX file, and generally time array is length > 100
        for (const nodeID in rawCurves) {
            const animationCurve = {
                id: rawCurves[nodeID].id,
                times: rawCurves[nodeID].KeyTime.a.map(FBXUtils.convertFBXTimeToSeconds),
                values: rawCurves[nodeID].KeyValueFloat.a,
            }

            const relationships = connections.get(animationCurve.id)
            if (relationships !== undefined) {
                const animationCurveID = relationships.parents[0].ID
                const animationCurveRelationship = relationships.parents[0].relationship

                if (animationCurveRelationship.match(/X/)) {
                    curveNodesMap.get(animationCurveID).curves['x'] = animationCurve
                } else if (animationCurveRelationship.match(/Y/)) {
                    curveNodesMap.get(animationCurveID).curves['y'] = animationCurve
                } else if (animationCurveRelationship.match(/Z/)) {
                    curveNodesMap.get(animationCurveID).curves['z'] = animationCurve
                } else if (animationCurveRelationship.match(/d|DeformPercent/) && curveNodesMap.has(animationCurveID)) {
                    curveNodesMap.get(animationCurveID).curves['morph'] = animationCurve
                }
            }
        }
    }

    /**
     * Parse nodes in FBXTree.Objects.AnimationLayer. Each layers holds references
     * to various AnimationCurveNodes and is referenced by an AnimationStack node
     * note: theoretically a stack can have multiple layers, however in practice there always seems to be one per stack
     *
     * @param curveNodesMap
     * @returns {Map<any, any>}
     */
    parseAnimationLayers(curveNodesMap) {
        const layersMap = new Map()

        const rawLayers = fbxTree.Objects.AnimationLayer
        for (const nodeID in rawLayers) {
            const layerCurveNodes = []
            const connection = connections.get(parseInt(nodeID))
            if (connection !== undefined) {
                // all the animationCurveNodes used in the layer
                const children = connection.children
                children.forEach((child, i) => {
                    if (curveNodesMap.has(child.ID)) {
                        const curveNode = curveNodesMap.get(child.ID)

                        // check that the curves are defined for at least one axis, otherwise ignore the curveNode
                        if (curveNode.curves.x !== undefined || curveNode.curves.y !== undefined || curveNode.curves.z !== undefined) {
                            if (layerCurveNodes[i] === undefined) {
                                const modelID = connections.get(child.ID).parents.filter(parent => parent.relationship !== undefined)[0].ID
                                if (modelID !== undefined) {
                                    const rawModel = fbxTree.Objects.Model[modelID.toString()]
                                    if (rawModel === undefined) {
                                        console.warn('THREE.FBXLoader: Encountered a unused curve.', child)
                                        return
                                    }

                                    const node = {
                                        modelName: rawModel.attrName ? THREE.PropertyBinding.sanitizeNodeName(rawModel.attrName) : '',
                                        ID: rawModel.id,
                                        initialPosition: [0, 0, 0],
                                        initialRotation: [0, 0, 0],
                                        initialScale: [1, 1, 1],
                                    }

                                    sceneGraph.traverse(child => {
                                        if (child.ID === rawModel.id) {
                                            node.transform = child.matrix
                                            if (child.userData.transformData) node.eulerOrder = child.userData.transformData.eulerOrder
                                        }
                                    })

                                    if (!node.transform) node.transform = new THREE.Matrix4()

                                    // if the animated model is pre rotated, we'll have to apply the pre rotations to every
                                    // animation value as well
                                    if ('PreRotation' in rawModel) node.preRotation = rawModel.PreRotation.value
                                    if ('PostRotation' in rawModel) node.postRotation = rawModel.PostRotation.value

                                    layerCurveNodes[i] = node
                                }
                            }

                            if (layerCurveNodes[i]) layerCurveNodes[i][curveNode.attr] = curveNode
                        } else if (curveNode.curves.morph !== undefined) {
                            if (layerCurveNodes[i] === undefined) {
                                const deformerID = connections.get(child.ID).parents.filter(parent => parent.relationship !== undefined)[0].ID
                                const morpherID = connections.get(deformerID).parents[0].ID
                                const geoID = connections.get(morpherID).parents[0].ID

                                // assuming geometry is not used in more than one model
                                const modelID = connections.get(geoID).parents[0].ID
                                const rawModel = fbxTree.Objects.Model[modelID]

                                layerCurveNodes[i] = {
                                    modelName: rawModel.attrName ? THREE.PropertyBinding.sanitizeNodeName(rawModel.attrName) : '',
                                    morphName: fbxTree.Objects.Deformer[deformerID].attrName,
                                }
                            }

                            layerCurveNodes[i][curveNode.attr] = curveNode
                        }
                    }
                })

                layersMap.set(parseInt(nodeID), layerCurveNodes)
            }
        }

        return layersMap
    }

    /**
     * Parse nodes in FBXTree.Objects.AnimationStack. These are the top level node in the animation
     * hierarchy. Each Stack node will be used to create a AnimationClip
     *
     * @param layersMap
     * @returns {{}}
     */
    parseAnimStacks(layersMap) {
        // connect the stacks (clips) up to the layers
        const rawClips = {}

        const rawStacks = fbxTree.Objects.AnimationStack
        for (const nodeID in rawStacks) {
            const children = connections.get(parseInt(nodeID)).children

            if (children.length > 1) {
                // it seems like stacks will always be associated with a single layer. But just in case there are files
                // where there are multiple layers per stack, we'll display a warning
                console.warn('THREE.FBXLoader: Encountered an animation stack with multiple layers, this is currently not supported. Ignoring subsequent layers.')
            }

            const layer = layersMap.get(children[0].ID)
            rawClips[nodeID] = {
                name: rawStacks[nodeID].attrName,
                layer: layer,
            }
        }

        return rawClips
    }

    /**
     *
     * @param rawClip
     * @returns {AnimationClip}
     */
    addClip(rawClip) {
        let tracks = []

        const scope = this
        rawClip.layer.forEach(rawTracks => {
            tracks = tracks.concat(scope.generateTracks(rawTracks))
        })

        return new THREE.AnimationClip(rawClip.name, -1, tracks)
    }

    /**
     *
     * @param rawTracks
     * @returns {*[]}
     */
    generateTracks(rawTracks) {
        const tracks = []

        let initialPosition = new THREE.Vector3()
        let initialRotation = new THREE.Quaternion()
        let initialScale = new THREE.Vector3()

        if (rawTracks.transform) rawTracks.transform.decompose(initialPosition, initialRotation, initialScale)

        initialPosition = initialPosition.toArray()
        initialRotation = new THREE.Euler().setFromQuaternion(initialRotation, rawTracks.eulerOrder).toArray()
        initialScale = initialScale.toArray()

        if (rawTracks.T !== undefined && Object.keys(rawTracks.T.curves).length > 0) {
            const positionTrack = this.generateVectorTrack(rawTracks.modelName, rawTracks.T.curves, initialPosition, 'position')
            if (positionTrack !== undefined) tracks.push(positionTrack)
        }

        if (rawTracks.R !== undefined && Object.keys(rawTracks.R.curves).length > 0) {
            const rotationTrack = this.generateRotationTrack(rawTracks.modelName, rawTracks.R.curves, initialRotation, rawTracks.preRotation, rawTracks.postRotation, rawTracks.eulerOrder)
            if (rotationTrack !== undefined) tracks.push(rotationTrack)
        }

        if (rawTracks.S !== undefined && Object.keys(rawTracks.S.curves).length > 0) {
            const scaleTrack = this.generateVectorTrack(rawTracks.modelName, rawTracks.S.curves, initialScale, 'scale')
            if (scaleTrack !== undefined) tracks.push(scaleTrack)
        }

        if (rawTracks.DeformPercent !== undefined) {
            const morphTrack = this.generateMorphTrack(rawTracks)
            if (morphTrack !== undefined) tracks.push(morphTrack)
        }

        return tracks
    }

    /**
     *
     * @param modelName
     * @param curves
     * @param initialValue
     * @param type
     * @returns {VectorKeyframeTrack}
     */
    generateVectorTrack(modelName, curves, initialValue, type) {
        const times = this.getTimesForAllAxes(curves)
        const values = this.getKeyframeTrackValues(times, curves, initialValue)

        return new THREE.VectorKeyframeTrack(`${modelName}.${type}`, times, values)
    }

    /**
     *
     * @param modelName
     * @param curves
     * @param initialValue
     * @param preRotation
     * @param postRotation
     * @param eulerOrder
     * @returns {QuaternionKeyframeTrack}
     */
    generateRotationTrack(modelName, curves, initialValue, preRotation, postRotation, eulerOrder) {
        if (curves.x !== undefined) {
            this.interpolateRotations(curves.x)
            curves.x.values = curves.x.values.map(THREE.MathUtils.degToRad)
        }

        if (curves.y !== undefined) {
            this.interpolateRotations(curves.y)
            curves.y.values = curves.y.values.map(THREE.MathUtils.degToRad)
        }

        if (curves.z !== undefined) {
            this.interpolateRotations(curves.z)
            curves.z.values = curves.z.values.map(THREE.MathUtils.degToRad)
        }

        const times = this.getTimesForAllAxes(curves)
        const values = this.getKeyframeTrackValues(times, curves, initialValue)

        if (preRotation !== undefined) {
            preRotation = preRotation.map(THREE.MathUtils.degToRad)
            preRotation.push(eulerOrder)

            preRotation = new THREE.Euler().fromArray(preRotation)
            preRotation = new THREE.Quaternion().setFromEuler(preRotation)
        }

        if (postRotation !== undefined) {
            postRotation = postRotation.map(THREE.MathUtils.degToRad)
            postRotation.push(eulerOrder)

            postRotation = new THREE.Euler().fromArray(postRotation)
            postRotation = new THREE.Quaternion().setFromEuler(postRotation).invert()
        }

        const quaternion = new THREE.Quaternion()
        const euler = new THREE.Euler()

        const quaternionValues = []
        for (let i = 0; i < values.length; i += 3) {
            euler.set(values[i], values[i + 1], values[i + 2], eulerOrder)

            quaternion.setFromEuler(euler)

            if (preRotation !== undefined) quaternion.premultiply(preRotation)
            if (postRotation !== undefined) quaternion.multiply(postRotation)
            quaternion.toArray(quaternionValues, (i / 3) * 4)
        }

        return new THREE.QuaternionKeyframeTrack(`${modelName}.quaternion`, times, quaternionValues)
    }

    /**
     *
     * @param rawTracks
     * @returns {NumberKeyframeTrack}
     */
    generateMorphTrack(rawTracks) {
        const curves = rawTracks.DeformPercent.curves.morph
        const values = curves.values.map(val => val / 100)

        const morphNum = sceneGraph.getObjectByName(rawTracks.modelName).morphTargetDictionary[rawTracks.morphName]

        return new THREE.NumberKeyframeTrack(`${rawTracks.modelName}.${morphTargetInfluences[morphNum]}`, curves.times, values)
    }

    /**
     * For all animated objects, times are defined separately for each axis
     * Here we'll combine the times into one sorted array without duplicates
     *
     * @param curves
     * @returns {*[]}
     */
    getTimesForAllAxes(curves) {
        let times = []

        // first join together the times for each axis, if defined
        if (curves.x !== undefined) times = times.concat(curves.x.times)
        if (curves.y !== undefined) times = times.concat(curves.y.times)
        if (curves.z !== undefined) times = times.concat(curves.z.times)

        // then sort them
        times = times.sort((a, b) => a - b)

        // and remove duplicates
        if (times.length > 1) {
            let targetIndex = 1
            let lastValue = times[0]
            for (let i = 1; i < times.length; i++) {
                const currentValue = times[i]
                if (currentValue !== lastValue) {
                    times[targetIndex] = currentValue
                    lastValue = currentValue
                    targetIndex++
                }
            }

            times = times.slice(0, targetIndex)
        }

        return times
    }

    /**
     *
     * @param times
     * @param curves
     * @param initialValue
     * @returns {*[]}
     */
    getKeyframeTrackValues(times, curves, initialValue) {
        const prevValue = initialValue
        const values = []

        let xIndex = -1
        let yIndex = -1
        let zIndex = -1

        times.forEach(time => {
            if (curves.x) xIndex = curves.x.times.indexOf(time)
            if (curves.y) yIndex = curves.y.times.indexOf(time)
            if (curves.z) zIndex = curves.z.times.indexOf(time)

            // if there is an x value defined for this frame, use that
            if (xIndex !== -1) {
                const xValue = curves.x.values[xIndex]
                values.push(xValue)
                prevValue[0] = xValue
            } else {
                // otherwise use the x value from the previous frame
                values.push(prevValue[0])
            }

            if (yIndex !== -1) {
                const yValue = curves.y.values[yIndex]
                values.push(yValue)
                prevValue[1] = yValue
            } else {
                values.push(prevValue[1])
            }

            if (zIndex !== -1) {
                const zValue = curves.z.values[zIndex]
                values.push(zValue)
                prevValue[2] = zValue
            } else {
                values.push(prevValue[2])
            }
        })

        return values
    }

    /**
     * Rotations are defined as Euler angles which can have values  of any size
     * These will be converted to quaternions which don't support values greater than
     * PI, so we'll interpolate large rotations
     *
     * @param curve
     */
    interpolateRotations(curve) {
        for (let i = 1; i < curve.values.length; i++) {
            const initialValue = curve.values[i - 1]
            const valuesSpan = curve.values[i] - initialValue
            const absoluteSpan = Math.abs(valuesSpan)
            if (absoluteSpan >= 180) {
                const numSubIntervals = absoluteSpan / 180
                const step = valuesSpan / numSubIntervals
                let nextValue = initialValue + step

                const initialTime = curve.times[i - 1]
                const timeSpan = curve.times[i] - initialTime
                const interval = timeSpan / numSubIntervals
                let nextTime = initialTime + interval

                const interpolatedTimes = []
                const interpolatedValues = []

                while (nextTime < curve.times[i]) {
                    interpolatedTimes.push(nextTime)
                    nextTime += interval

                    interpolatedValues.push(nextValue)
                    nextValue += step
                }

                curve.times = FBXUtils.inject(curve.times, i, interpolatedTimes)
                curve.values = FBXUtils.inject(curve.values, i, interpolatedValues)
            }
        }
    }
}
