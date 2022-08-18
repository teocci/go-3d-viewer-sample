/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-12
 */
import STLLoader from './loaders/stl-loader.js'
import ObjLoader from './loaders/obj-loader.js'
import FBXLoader from './loaders/fbx-loader.js'
// import {FBXLoader} from './loaders/FBXLoader.js'
import PYLLoader from './loaders/ply-loader.js'
import OrbitControls from './controls/orbit.js'
import Stats from './modules/stats.js'

export default class Viewer {
    static DEFAULT_FOG_COLOR = 10526880

    static AMBIENT_LIGHT_ID = 'ambientLight'
    static HEMISPHERE_LIGHT_ID = 'hemisphereLight'

    static MAIN_LIGHT_ID = 'mainLight'
    static RIM_LIGHT_ID = 'rimLight'
    static FILLING_LIGHT_ID = 'fillLight'
    static FILLING_LIGHT_2_ID = 'fillLight2'

    static DEFAULT_CAMERA_ID = 'camera'

    static DEFAULT_AMBIENT_LIGHT_PAYLOAD = {
        color: 0x777779,
        v: 0,
        id: 'ambientLight',
        name: 'Ambient Light',
        type: 'AmbientLight',
    }

    static DEFAULT_HEMISPHERE_LIGHT_PAYLOAD = {
        options: {
            position: {z: 0, y: 2000, x: 0},
        },
        skyColor: 0x777779,
        groundColor: 0xCBCBCB,
        id: 'hemisphereLight',
        name: 'Hemisphere Light',
        type: 'HemisphereLight',
    }

    static DEFAULT_MAIN_LIGHT_PAYLOAD = {
        options: {
            shadowMapSize: 2048,
            shadowBias: -1e-3,
            shadowCameraBottom: -1,
            shadowCameraTop: 1,
            shadowCameraRight: 1,
            shadowCameraLeft: -1,
            shadowCameraFar: 30,
            shadowCameraNear: 1,
            castShadow: true,
            target: {position: {z: 0, y: 0, x: 0}},
            position: {z: 0, y: 200, x: 0},
        },
        intensity: 1.2,
        color: 0xF9F7F2,
        id: Viewer.MAIN_LIGHT_ID,
        name: 'Main Light',
        type: 'DirectionalLight',
    }
    static DEFAULT_RIM_LIGHT_PAYLOAD = {
        options: {
            shadowMapSize: 1024,
            shadowBias: -6e-4,
            shadowCameraBottom: -3,
            shadowCameraTop: 3,
            shadowCameraRight: 3,
            shadowCameraLeft: -3,
            shadowCameraFar: 30,
            shadowCameraNear: 1,
            castShadow: false,
            target: {position: {z: 0, y: 0, x: 0}},
            position: {z: -0.5, y: 1, x: 0},
        },
        intensity: 0.5,
        color: 0xD9EAFF,
        id: Viewer.RIM_LIGHT_ID,
        name: 'Rim Light',
        type: 'DirectionalLight',
    }
    static DEFAULT_FILLING_LIGHT_PAYLOAD = {
        options: {
            shadowMapSize: 1024,
            shadowBias: -6e-4,
            shadowCameraBottom: -3,
            shadowCameraTop: 3,
            shadowCameraRight: 3,
            shadowCameraLeft: -3,
            shadowCameraFar: 30,
            shadowCameraNear: 1,
            castShadow: false,
            target: {position: {z: 0, y: 0, x: 0}},
            position: {z: -2.75, y: 3.75, x: 5},
        },
        intensity: 0.5,
        color: 0xBEC8E5,
        id: Viewer.FILLING_LIGHT_ID,
        name: 'Fill Light',
        type: 'DirectionalLight',
    }
    static DEFAULT_FILLING_LIGHT_2_PAYLOAD = {
        options: {
            shadowMapSize: 1024,
            shadowBias: -6e-4,
            shadowCameraBottom: -3,
            shadowCameraTop: 3,
            shadowCameraRight: 3,
            shadowCameraLeft: -3,
            shadowCameraFar: 30,
            shadowCameraNear: 1,
            castShadow: false,
            target: {position: {z: 0, y: 0, x: 0}},
            position: {z: 0.25, y: -0.25, x: 0.03},
        },
        intensity: 0.2,
        color: 0xF9D7ED,
        id: Viewer.FILLING_LIGHT_2_ID,
        name: 'Fill Light',
        type: 'DirectionalLight',
    }

    static DEFAULT_CAMERA_PAYLOAD = {
        options: {
            fov: 50,
            position: {
                x: .557,
                y: .7,
                z: 1.05,
            },
            orientation: {
                x: -.12311346522317435,
                y: .2311097511511827,
                z: .029495197631977128,
                w: .964656099820151,
            },
        },
        components: {
            orbitCameraComponent: {
                enabled: true,
                isBuiltIn: true,
                scriptId: 'orbit-camera-controller',
                componentData: {
                    enablePan: true,
                },
            },
            renderViewComponent: {
                enabled: true,
                isBuiltIn: true,
                scriptId: 'render_view_component',
                componentData: {
                    enablePostEffects: true,
                    enableShadows: true,
                    enablePreRenderFunctions: true,
                    renderTarget: null,
                    clearDepth: true,
                    clearColor: true,
                    renderGroup: 0,
                    viewportHeight: '100%',
                    viewportWidth: '100%',
                    viewportBottom: '0px',
                    viewportLeft: '0px',
                },
            },
        },
        id: Viewer.DEFAULT_CAMERA_ID,
        name: 'Default Camera',
        type: 'PerspectiveCamera',
    }

    static LIGHT_LIST = {
        [Viewer.MAIN_LIGHT_ID]: Viewer.DEFAULT_MAIN_LIGHT_PAYLOAD,
        [Viewer.RIM_LIGHT_ID]: Viewer.DEFAULT_RIM_LIGHT_PAYLOAD,
        [Viewer.FILLING_LIGHT_ID]: Viewer.DEFAULT_FILLING_LIGHT_PAYLOAD,
        [Viewer.FILLING_LIGHT_2_ID]: Viewer.DEFAULT_FILLING_LIGHT_2_PAYLOAD,
    }

    static SHADER_FRAGMENT = Viewer.loadShader(SHADER_FRAG_FILE)
    static SHADER_VERTEX = Viewer.loadShader(SHADER_VERT_FILE)
    static ATF = {n: -1, LEQUAL: 0, GREATER: 1}
    static MATERIALS = [
        {
            name: 'Alpha Prime',
            alphaTestFunc: Viewer.ATF.GREATER,
            alphaTest: 0.95,
            depthWrite: false,
            side: THREE.FrontSide,
            drawEverything: true,
        },
        {
            name: 'Back Face',
            alphaTestFunc: Viewer.ATF.GREATER,
            alphaTest: 0.95,
            depthWrite: true,
            side: THREE.BackSide,
            drawEverything: false,
        },
        {
            name: 'Front Face',
            alphaTestFunc: Viewer.ATF.GREATER,
            alphaTest: 0.95,
            depthWrite: true,
            side: THREE.FrontSide,
            drawEverything: false,
        },
        {
            name: 'Back Fringe',
            alphaTestFunc: Viewer.ATF.LEQUAL,
            alphaTest: 0.95,
            depthWrite: false,
            side: THREE.BackSide,
            drawEverything: false,
        },
        {
            name: 'Front Fringe',
            alphaTestFunc: Viewer.ATF.LEQUAL,
            alphaTest: 0.95,
            depthWrite: true,
            side: THREE.FrontSide,
            drawEverything: false,
        },
    ]

    constructor(element) {
        this.placeholder = element
        this.lights = new Map()
        this.shaders = {
            frag: null,
            vert: null,
        }
        const ctx = this

        this.loadShaders().then(shaders => {
            [ctx.shaders.frag, ctx.shaders.vert] = shaders
        })

        this.initLights()
        this.initHemisphereLight()
        this.initAmbientLight()

        this.initCamera()
        this.initScene()

        this.initRenderer()
        this.initControls()

        this.stats = new Stats()

        this.initEventListeners()

        this.appendElements()
    }

    loadShaders() {
        return Promise.all([Viewer.SHADER_FRAGMENT, Viewer.SHADER_VERTEX])
    }

    initLights() {
        for (const id in Viewer.LIGHT_LIST) {
            const payload = Viewer.LIGHT_LIST[id]
            console.log(`${id}: ${payload}`)
            const options = payload.options
            const {x, y, z} = options.position

            const light = new THREE.DirectionalLight(payload.color, payload.intensity)
            light.position.set(x, y, z)
            light.castShadow = options.castShadow

            light.shadow.bias = options.shadowBias
            light.shadow.mapSize.width = options.shadowMapSize
            light.shadow.mapSize.height = options.shadowMapSize

            light.shadow.camera.top = options.shadowCameraTop
            light.shadow.camera.bottom = options.shadowCameraBottom
            light.shadow.camera.left = options.shadowCameraLeft
            light.shadow.camera.right = options.shadowCameraRight

            light.shadow.camera.near = options.shadowCameraNear
            light.shadow.camera.far = options.shadowCameraFar

            this.lights.set(id, light)
        }
    }

    initLight() {
        this.light = new THREE.SpotLight()
        this.light.position.set(20, 20, 20)
    }

    initAmbientLight() {
        const id = Viewer.AMBIENT_LIGHT_ID
        const payload = Viewer.DEFAULT_AMBIENT_LIGHT_PAYLOAD
        const light = new THREE.AmbientLight(payload.color)

        this.lights.set(id, light)
    }

    initHemisphereLight() {
        const id = Viewer.HEMISPHERE_LIGHT_ID
        const payload = Viewer.DEFAULT_HEMISPHERE_LIGHT_PAYLOAD
        console.log({id, payload})
        const light = new THREE.HemisphereLight(payload.skyColor, payload.groundColor)
        const options = payload.options
        const {x, y, z} = options.position
        light.position.set(x, y, z)

        this.lights.set(id, light)
    }

    loadLights() {
        for (const light of this.lights.values()) {
            this.scene.add(light)
        }
    }

    initCamera() {
        const payload = Viewer.DEFAULT_CAMERA_PAYLOAD
        const options = payload.options
        const aspect = this.placeholder.offsetWidth / this.placeholder.offsetHeight
        this.camera = new THREE.PerspectiveCamera(options.fov, aspect)
        const {x, y, z} = options.position
        this.camera.position.set(x, y, z)

        const {a, b, c, d} = options.orientation
        // this.camera.orientation.set(a, b, c, d)
        console.log({orientation: this.camera.orientation})
    }

    initScene() {
        this.scene = new THREE.Scene()
        // this.scene.environment

        const color = 0xa0a0a0
        const density = 0.002
        // this.scene.background = new THREE.Color(color)
        // this.scene.fog = new THREE.FogExp2(color, density)
        this.scene.fog = new THREE.Fog(color, 0.1, 2000)
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({antialias: true})
        this.renderer.setPixelRatio(window.devicePixelRatio)
        this.renderer.setSize(this.placeholder.offsetWidth, this.placeholder.offsetHeight)
        this.renderer.outputEncoding = THREE.sRGBEncoding
        this.renderer.shadowMap.enabled = true
        this.renderer.physicallyCorrectLights = true

        this.renderer.setClearColor(0xa0a0a0, 1)
        this.renderer.sortObjects = false
        this.renderer.state.setBlending(THREE.NormalBlending)
        // this.renderer.state.setBlending(THREE.NormalBlending)
    }

    loadGround() {
        // const gridTexture = new THREE.TextureLoader().load('img/grid_texture.png')
        // gridTexture.wrapS = gridTexture.wrapT = THREE.RepeatWrapping
        // gridTexture.repeat.set(20, 20)
        // gridTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        // gridTexture.receiveShadow = true

        // const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshPhongMaterial({
        //     color: 0x999999,
        //     depthWrite: false,
        // }))
        // floor.rotation.x = -Math.PI / 2
        // floor.receiveShadow = true

        // const groundMaterial = new THREE.MeshBasicMaterial({color: 0xffffff, map: gridTexture})
        // const floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(100, 100), groundMaterial)
        // floor.position.y = 0.0
        // floor.rotation.x = -Math.PI / 2
        // floor.receiveShadow = true
        // this.scene.add(floor)

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshPhongMaterial({
            color: 0xffffff,
            depthWrite: false,
        }))
        floor.position.y = 0.0
        floor.rotation.x = -Math.PI / 2
        floor.receiveShadow = true
        this.scene.add(floor)

        const grid = new THREE.GridHelper(3000, 50, 0x000000, 0x000000)
        grid.material.opacity = 0.2
        grid.material.transparent = true
        this.scene.add(grid)
    }

    initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = true
    }

    initEventListeners() {
        this.resizeObserver = new ResizeObserver(entries => this.onResize(entries))
        this.resizeObserver.observe(this.placeholder)
    }

    initMesh(geometry) {
        const envTexture = new THREE.CubeTextureLoader().load([
            'img/px_50.png',
            'img/nx_50.png',
            'img/py_50.png',
            'img/ny_50.png',
            'img/pz_50.png',
            'img/nz_50.png',
        ])
        envTexture.mapping = THREE.CubeReflectionMapping

        const material = new THREE.MeshPhysicalMaterial({
            // color: 0xffffff,
            envMap: envTexture,
            metalness: 0.25,
            roughness: 0.5,
            opacity: 1.0,
            transparent: true,
            transmission: 0.99,
            clearcoat: 1.0,
            clearcoatRoughness: 0.25,
            fog: true,
        })
        this.mesh = new THREE.Mesh(geometry, material)
    }

    loadMesh() {
        this.scene.add(this.mesh)
    }

    appendElements() {
        this.placeholder.appendChild(this.renderer.domElement)
        this.placeholder.appendChild(this.stats.dom)
    }

    static async loadShader(path) {
        return await (await fetch(path)).text()
    }

    loadModel(type, url) {
        let loader
        switch (type) {
            case STLLoader.TAG:
                loader = new STLLoader()
                loader.load(
                    url,
                    geometry => {
                        this.initMesh(geometry)
                        this.fitCameraToMesh()

                        this.loadLights()
                        this.loadMesh()
                    },
                    xhr => console.log((xhr.loaded / xhr.total) * 100 + '% loaded'),
                    error => console.log(error),
                )
                break
            case ObjLoader.TAG:
                loader = new ObjLoader()
                loader.load(
                    url,
                    mesh => {
                        mesh.castShadow = true
                        mesh.receiveShadow = true

                        this.mesh = mesh

                        this.loadGround()
                        this.fitCameraToMesh()

                        this.loadLights()
                        this.loadMesh()
                    },
                    xhr => console.log((xhr.loaded / xhr.total) * 100 + '% loaded'),
                    error => console.log(error),
                )
                break
            case FBXLoader.TAG:
                loader = new FBXLoader()
                loader.load(
                    url,
                    mesh => {
                        // this.camera.position.set(0.8, 1.4, 1.0)
                        // // this.light.position.set(0.8, 1.4, 1.0)
                        // this.scene.add(new THREE.AxesHelper(500))

                        // mesh.geometry.computeBoundingBox()
                        // const center = new THREE.Vector3()
                        // const size = mesh.geometry.boundingBox.getSize(center)
                        // console.log({size, center, y: mesh.position.y})

                        this.loadGround()

                        this.loadLights()

                        this.setupShaders(mesh)
                        this.setupBaseRenderPass(mesh)
                        this.setupCastShadows(mesh)

                        mesh.castShadow = true
                        mesh.receiveShadow = true
                        this.mesh = mesh

                        this.fitCameraToMesh()

                        this.loadMesh()
                    },
                    xhr => console.log(`${(xhr.loaded / xhr.total) * 100}% loaded`),
                    error => console.log(error),
                )
                break
            case PYLLoader.TAG:
                loader = new PYLLoader()
                loader.load(
                    url,
                    geometry => {
                        geometry.computeVertexNormals()
                        geometry.computeBoundingBox()

                        const material = new THREE.MeshStandardMaterial({color: 0xC0C0C0, flatShading: true})
                        const mesh = new THREE.Mesh(geometry, material)

                        mesh.geometry.computeBoundingBox()

                        const boundingBox = mesh.geometry.boundingBox
                        let position = new THREE.Vector3()
                        position.subVectors(boundingBox.max, boundingBox.min)
                        position.multiplyScalar(0.5)
                        position.add(boundingBox.min)
                        console.log({position})

                        mesh.scale.multiplyScalar(0.1)
                        const center = new THREE.Vector3()
                        const size = geometry.boundingBox.getSize(center)
                        console.log({size, center, y: mesh.position.y})
                        // mesh.position.x = -0.2
                        mesh.position.y += (size.y * .1) / 2
                        // mesh.position.z = -0.2

                        mesh.castShadow = true
                        mesh.receiveShadow = true

                        this.mesh = mesh

                        this.loadGround()
                        this.fitCameraToMesh()

                        this.loadLights()
                        this.loadMesh()

                        // position = new THREE.Vector3()
                        // position.setFromMatrixPosition(mesh.matrixWorld)
                        // console.log({position})
                    },
                    xhr => console.log((xhr.loaded / xhr.total) * 100 + '% loaded'),
                    error => console.log(error),
                )
                break
            default:
                throw new Error(`InvalidChartType: ${type} not supported`)
        }
    }

    setupShaders(object) {
        const ctx = this
        object.traverse(child => {
            if (child.type === 'SkinnedMesh' || child.type === 'Mesh') {
                child.material.vertexShader = ctx.shaders.vert
                child.material.fragmentShader = ctx.shaders.frag
                child.material.uniforms = child.material.uniforms ?? {}
                child.material.uniforms.alphaTestFunc = {
                    type: 'i',
                    value: Viewer.ATF.NONE,
                }
                child.material.uniforms.alphaTest = {
                    type: 'f',
                    value: 0,
                }
                child.material.needsUpdate = true
            }
        })
    }

    setupRenderPassForGraph(object, material) {
        object.traverse(child => {
            if (child.type === 'SkinnedMesh' || child.type === 'Mesh') {
                const m = child.material
                m.depthWrite = material.depthWrite
                m.depthTest = true
                m.side = material.side
                if (m.uniforms) {
                    m.uniforms.alphaTest.value = material.alphaTest
                    m.uniforms.alphaTest.needsUpdate = true
                    m.uniforms.alphaTestFunc.value = material.alphaTestFunc
                    m.uniforms.alphaTestFunc.needsUpdate = true
                }
            }
        })
    }

    setupBaseRenderPass(object) {
        this.setupRenderPassForGraph(object, Viewer.MATERIALS[2])
    }

    setupCastShadows(object) {
        object.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true
                child.receiveShadow = true
            }
        })
    }

    calculateCenterOfMass(mesh) {
        const centroidNominator = new THREE.Vector3()
        let centroidDenominator = 0, centroid

        const faces = mesh.geometry.getIndex().length
        for (let i = 0; i < faces; i++) {
            const Pi = mesh.geometry.getIndex()[i].a
            const Qi = mesh.geometry.getIndex()[i].b
            const Ri = mesh.geometry.getIndex()[i].c

            const a = new THREE.Vector3(mesh.geometry.vertices[Pi].x, mesh.geometry.vertices[Pi].y, mesh.geometry.vertices[Pi].z)
            const b = new THREE.Vector3(mesh.geometry.vertices[Qi].x, mesh.geometry.vertices[Qi].y, mesh.geometry.vertices[Qi].z)
            const c = new THREE.Vector3(mesh.geometry.vertices[Ri].x, mesh.geometry.vertices[Ri].y, mesh.geometry.vertices[Ri].z)

            const ab = b.clone().sub(a)
            const ac = c.clone().sub(a)

            const cross = new THREE.Vector3()
            cross.crossVectors(ab, ac)

            const faceArea = cross.lengthSq() / 2
            const faceCentroid = new THREE.Vector3((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3)

            if (!isNaN(faceArea)) {
                centroidNominator.add(faceCentroid.multiplyScalar(faceArea))
                centroidDenominator += faceArea
            }
        }

        centroid = centroidNominator.divideScalar(centroidDenominator)

        return centroid
    }

    animate() {
        requestAnimationFrame(() => this.animate())

        this.controls.update()

        this.render()

        this.stats.update()
    }

    render() {
        this.renderer.render(this.scene, this.camera)
    }

    onResize(entries) {
        this.camera.aspect = this.placeholder.offsetWidth / this.placeholder.offsetHeight
        this.camera.updateProjectionMatrix()

        this.renderer.setSize(this.placeholder.offsetWidth, this.placeholder.offsetHeight)

        this.render()
    }

    fitCameraToMesh(fitOffset) {
        fitOffset = fitOffset ?? 1.2
        const box = new THREE.Box3()
        box.makeEmpty()
        box.expandByObject(this.mesh)

        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())

        box.getSize(size)
        box.getCenter(center)

        const maxSize = Math.max(size.x, size.y, size.z)
        const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * this.camera.fov / 360))
        const fitWidthDistance = fitHeightDistance / this.camera.aspect
        const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance)

        const direction = this.controls.target.clone()
            .sub(this.camera.position)
            .normalize()
            .multiplyScalar(distance)

        this.controls.maxDistance = distance * 10
        this.controls.target.copy(center)

        this.camera.near = distance / 100
        this.camera.far = distance * 100
        this.camera.updateProjectionMatrix()

        this.camera.position.copy(this.controls.target).sub(direction)

        this.controls.update()
    }
}