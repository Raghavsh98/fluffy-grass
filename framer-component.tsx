import { addPropertyControls, ControlType } from "framer"
import { useEffect, useRef } from "react"

// Global declarations for Three.js and dat.GUI loaded from CDN
declare global {
    interface Window {
        THREE: any
        dat: any
    }
}

// Grass Material class converted for Framer
class GrassMaterial {
    material: any
    uniforms: { [key: string]: { value: any } } = {
        uTime: { value: 0 },
        uEnableShadows: { value: true },
        uShadowDarkness: { value: 0.5 },
        uGrassLightIntensity: { value: 0.7 },
        uNoiseScale: { value: 2.4 },
        uPlayerPosition: { value: new window.THREE.Vector3() },
        baseColor: { value: new window.THREE.Color("#313f1b") },
        tipColor1: { value: new window.THREE.Color("#9bd38d") },
        tipColor2: { value: new window.THREE.Color("#1f352a") },
        noiseTexture: { value: new window.THREE.Texture() },
        grassAlphaTexture: { value: new window.THREE.Texture() },
    }

    constructor() {
        this.material = new window.THREE.MeshLambertMaterial({
            side: window.THREE.DoubleSide,
            color: 0x229944,
            transparent: true,
            alphaTest: 0.1,
            shadowSide: 1,
        })
        this.setupGrassMaterial(this.material)
    }

    update(delta: number) {
        this.uniforms.uTime.value = delta
    }

    private setupGrassMaterial(material: any) {
        material.onBeforeCompile = (shader: any) => {
            shader.uniforms = {
                ...shader.uniforms,
                uTime: this.uniforms.uTime,
                uTipColor1: this.uniforms.tipColor1,
                uTipColor2: this.uniforms.tipColor2,
                uBaseColor: this.uniforms.baseColor,
                uEnableShadows: this.uniforms.uEnableShadows,
                uShadowDarkness: this.uniforms.uShadowDarkness,
                uGrassLightIntensity: this.uniforms.uGrassLightIntensity,
                uNoiseScale: this.uniforms.uNoiseScale,
                uNoiseTexture: this.uniforms.noiseTexture,
                uGrassAlphaTexture: this.uniforms.grassAlphaTexture,
            }

            shader.vertexShader = `
                #include <common>
                #include <fog_pars_vertex>
                #include <shadowmap_pars_vertex>
                uniform sampler2D uNoiseTexture;
                uniform float uNoiseScale;
                uniform float uTime;
                
                varying vec3 vColor;
                varying vec2 vGlobalUV;
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                varying vec2 vWindColor;
                
                void main() {
                    #include <color_vertex>
                    #include <begin_vertex>
                    #include <project_vertex>
                    #include <fog_vertex>
                    #include <beginnormal_vertex>
                    #include <defaultnormal_vertex>
                    #include <worldpos_vertex>
                    #include <shadowmap_vertex>

                    vec2 uWindDirection = vec2(1.0,1.0);
                    float uWindAmp = 0.1;
                    float uWindFreq = 50.;
                    float uSpeed = 1.0;
                    float uNoiseFactor = 5.50;
                    float uNoiseSpeed = 0.001;

                    vec2 windDirection = normalize(uWindDirection);
                    vec4 modelPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);

                    float terrainSize = 100.;
                    vGlobalUV = (terrainSize-vec2(modelPosition.xz))/terrainSize;

                    vec4 noise = texture2D(uNoiseTexture,vGlobalUV+uTime*uNoiseSpeed);

                    float sinWave = sin(uWindFreq*dot(windDirection, vGlobalUV) + noise.g*uNoiseFactor + uTime * uSpeed) * uWindAmp * (1.-uv.y);

                    float xDisp = sinWave;
                    float zDisp = sinWave;
                    modelPosition.x += xDisp;
                    modelPosition.z += zDisp;

                    modelPosition.y += exp(texture2D(uNoiseTexture,vGlobalUV * uNoiseScale).r) * 0.5 * (1.-uv.y);

                    vec4 viewPosition = viewMatrix * modelPosition;
                    vec4 projectedPosition = projectionMatrix * viewPosition;
                    gl_Position = projectedPosition;

                    vUv = vec2(uv.x,1.-uv.y);
                    vNormal = normalize(normalMatrix * normal);
                    vWindColor = vec2(xDisp,zDisp);
                    vViewPosition = mvPosition.xyz;
                }
            `

            shader.fragmentShader = `
                #include <alphatest_pars_fragment>
                #include <alphamap_pars_fragment>
                #include <fog_pars_fragment>
                #include <common>
                #include <packing>
                #include <lights_pars_begin>
                #include <shadowmap_pars_fragment>
                #include <shadowmask_pars_fragment>
                
                uniform float uTime;
                uniform vec3 uBaseColor;
                uniform vec3 uTipColor1;
                uniform vec3 uTipColor2;
                uniform sampler2D uGrassAlphaTexture;
                uniform sampler2D uNoiseTexture;
                uniform float uNoiseScale;
                uniform int uEnableShadows;
                uniform float uGrassLightIntensity;
                uniform float uShadowDarkness;
                
                varying vec3 vColor;
                varying vec2 vUv;
                varying vec2 vGlobalUV;
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                varying vec2 vWindColor;
                
                void main() {
                    vec4 grassAlpha = texture2D(uGrassAlphaTexture,vUv);
                    vec4 grassVariation = texture2D(uNoiseTexture, vGlobalUV * uNoiseScale);
                    vec3 tipColor = mix(uTipColor1,uTipColor2,grassVariation.r);
                    
                    vec4 diffuseColor = vec4( mix(uBaseColor,tipColor,vUv.y), step(0.1,grassAlpha.r) );
                    vec3 grassFinalColor = diffuseColor.rgb * uGrassLightIntensity;
                    
                    vec3 geometryPosition = vViewPosition;
                    vec3 geometryNormal = vNormal;
                    vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
                    vec3 geometryClearcoatNormal;
                    IncidentLight directLight;
                    float shadow = 0.0;
                    float currentShadow = 0.0;
                    float NdotL;
                    
                    if(uEnableShadows == 1){
                        #if ( NUM_DIR_LIGHTS > 0) 
                            DirectionalLight directionalLight;
                        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
                            DirectionalLightShadow directionalLightShadow;
                        #endif
                            #pragma unroll_loop_start
                            for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
                                directionalLight = directionalLights[ i ];
                                getDirectionalLightInfo( directionalLight, directLight );
                                directionalLightShadow = directionalLightShadows[ i ];
                                currentShadow = getShadow( directionalShadowMap[ i ], 
                                    directionalLightShadow.shadowMapSize, 
                                    directionalLightShadow.shadowBias, 
                                    directionalLightShadow.shadowRadius, 
                                    vDirectionalShadowCoord[ i ] );
                                currentShadow = all( bvec2( directLight.visible, receiveShadow ) ) ? currentShadow : 1.0;
                                float weight = clamp( pow( length( vDirectionalShadowCoord[ i ].xy * 2. - 1. ), 4. ), .0, 1. );
                                shadow += mix( currentShadow, 1., weight);
                            }
                            #pragma unroll_loop_end
                        #endif
                        grassFinalColor = mix(grassFinalColor , grassFinalColor * uShadowDarkness,  1.-shadow) ;
                    } else{
                        grassFinalColor = grassFinalColor ;
                    }
                    diffuseColor.rgb = clamp(diffuseColor.rgb*shadow,0.0,1.0);

                    #include <alphatest_fragment>
                    gl_FragColor = vec4(grassFinalColor ,1.0);
                    
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                    #include <fog_fragment>
                }
            `
        }
    }

    setupTextures(grassAlphaTexture: any, noiseTexture: any) {
        this.uniforms.grassAlphaTexture.value = grassAlphaTexture
        this.uniforms.noiseTexture.value = noiseTexture
    }
}

// Main Fluffy Grass class converted for Framer
class FluffyGrass {
    private loadingManager: any
    private textureLoader: any
    private gltfLoader: any
    private camera: any
    private renderer: any
    private scene: any
    private canvas: HTMLCanvasElement
    private orbitControls: any
    private gui: any
    private sceneGUI: any
    private sceneProps = {
        fogColor: "#eeeeee",
        terrainColor: "#5e875e",
        fogDensity: 0.045989,
    }
    private textures: { [key: string]: any } = {}
    private Uniforms = {
        uTime: { value: 0 },
        color: { value: new window.THREE.Color("#0000ff") },
    }
    private clock = new window.THREE.Clock()
    private terrainMat: any
    private grassGeometry = new window.THREE.BufferGeometry()
    private grassMaterial: GrassMaterial
    private grassCount = 8000

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas
        this.loadingManager = new window.THREE.LoadingManager()
        this.textureLoader = new window.THREE.TextureLoader(this.loadingManager)
        this.gltfLoader = new window.THREE.GLTFLoader(this.loadingManager)

        this.camera = new window.THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        )
        this.camera.position.set(21.43, 4.51, -7.31)
        this.scene = new window.THREE.Scene()

        this.scene.background = new window.THREE.Color(this.sceneProps.fogColor)
        this.scene.fog = new window.THREE.FogExp2(
            this.sceneProps.fogColor,
            this.sceneProps.fogDensity
        )

        this.renderer = new window.THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            precision: "highp",
        })
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.autoUpdate = true
        this.renderer.shadowMap.type = window.THREE.PCFSoftShadowMap
        this.renderer.outputColorSpace = window.THREE.SRGBColorSpace
        this.renderer.toneMapping = window.THREE.ACESFilmicToneMapping
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.scene.frustumCulled = true

        this.orbitControls = new window.THREE.OrbitControls(this.camera, canvas)
        this.orbitControls.autoRotate = false
        this.orbitControls.autoRotateSpeed = -0.5
        this.orbitControls.enableDamping = true
        this.orbitControls.enabled = false

        this.grassMaterial = new GrassMaterial()
        this.terrainMat = new window.THREE.MeshPhongMaterial({
            color: this.sceneProps.terrainColor,
        })

        this.init()
    }

    private init() {
        this.setupTextures()
        this.createSky()
        this.loadModels()
        this.addLights()
    }

    private createSky() {
        const skyGeometry = new window.THREE.SphereGeometry(500, 32, 32)
        const skyMaterial = new window.THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 0.5);
                }
            `,
            uniforms: {
                topColor: { value: new window.THREE.Color(0x87CEEB) },
                bottomColor: { value: new window.THREE.Color(0xE0F6FF) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            side: window.THREE.BackSide
        })

        const sky = new window.THREE.Mesh(skyGeometry, skyMaterial)
        this.scene.add(sky)
    }

    private addLights() {
        const ambientLight = new window.THREE.AmbientLight(0xffffff, 0.5)
        this.scene.add(ambientLight)

        const directionalLight = new window.THREE.DirectionalLight(0xffffff, 2)
        directionalLight.castShadow = true
        directionalLight.position.set(100, 100, 100)
        directionalLight.shadow.camera.far = 200
        directionalLight.shadow.camera.left = -50
        directionalLight.shadow.camera.right = 50
        directionalLight.shadow.camera.top = 50
        directionalLight.shadow.camera.bottom = -50
        directionalLight.shadow.mapSize.set(2048, 2048)

        this.scene.add(directionalLight)
    }

    private addGrass(surfaceMesh: any, grassGeometry: any) {
        const sampler = new window.THREE.MeshSurfaceSampler(surfaceMesh)
            .setWeightAttribute("color")
            .build()

        const grassInstancedMesh = new window.THREE.InstancedMesh(
            grassGeometry,
            this.grassMaterial.material,
            this.grassCount
        )
        grassInstancedMesh.receiveShadow = true

        const position = new window.THREE.Vector3()
        const quaternion = new window.THREE.Quaternion()
        const scale = new window.THREE.Vector3(1, 1, 1)
        const normal = new window.THREE.Vector3()
        const yAxis = new window.THREE.Vector3(0, 1, 0)
        const matrix = new window.THREE.Matrix4()

        for (let i = 0; i < this.grassCount; i++) {
            sampler.sample(position, normal)
            quaternion.setFromUnitVectors(yAxis, normal)
            const randomRotation = new window.THREE.Euler(0, Math.random() * Math.PI * 2, 0)
            const randomQuaternion = new window.THREE.Quaternion().setFromEuler(randomRotation)
            quaternion.multiply(randomQuaternion)
            matrix.compose(position, quaternion, scale)
            grassInstancedMesh.setMatrixAt(i, matrix)
        }

        this.scene.add(grassInstancedMesh)
    }

    private loadModels() {
        // Load terrain and grass models
        this.gltfLoader.load("https://fluffy-grass-8sfsmgxc0-raghavsh98s-projects.vercel.app/island.glb", (gltf: any) => {
            let terrainMesh: any
            gltf.scene.traverse((child: any) => {
                if (child instanceof window.THREE.Mesh) {
                    child.material = this.terrainMat
                    child.receiveShadow = true
                    child.geometry.scale(3, 3, 3)
                    terrainMesh = child
                }
            })
            this.scene.add(gltf.scene)

            this.gltfLoader.load("https://fluffy-grass-8sfsmgxc0-raghavsh98s-projects.vercel.app/grassLODs.glb", (gltf: any) => {
                gltf.scene.traverse((child: any) => {
                    if (child instanceof window.THREE.Mesh) {
                        if (child.name.includes("LOD00")) {
                            child.geometry.scale(5, 5, 5)
                            this.grassGeometry = child.geometry
                        }
                    }
                })
                this.addGrass(terrainMesh, this.grassGeometry)
            })
        })
    }

    private setupTextures() {
        this.textures.perlinNoise = this.textureLoader.load("https://fluffy-grass-8sfsmgxc0-raghavsh98s-projects.vercel.app/perlinnoise.webp")
        this.textures.perlinNoise.wrapS = this.textures.perlinNoise.wrapT = window.THREE.RepeatWrapping
        this.textures.grassAlpha = this.textureLoader.load("https://fluffy-grass-8sfsmgxc0-raghavsh98s-projects.vercel.app/grass.jpeg")
        this.grassMaterial.setupTextures(this.textures.grassAlpha, this.textures.perlinNoise)
    }

    public render() {
        this.Uniforms.uTime.value += this.clock.getDelta()
        this.grassMaterial.update(this.Uniforms.uTime.value)
        this.renderer.render(this.scene, this.camera)
        requestAnimationFrame(() => this.render())
        this.orbitControls.update()
    }

    public resize(width: number, height: number) {
        this.camera.aspect = width / height
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(width, height)
    }
}

// Framer Component
export function FluffyGrassComponent(props: any) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const sceneRef = useRef<FluffyGrass | null>(null)

    useEffect(() => {
        const loadDependencies = async () => {
            // Load Three.js
            if (!window.THREE) {
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r159/three.min.js')
            }
            
            // Load GLTFLoader
            if (!window.THREE.GLTFLoader) {
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.159.0/examples/jsm/loaders/GLTFLoader.js')
            }
            
            // Load OrbitControls
            if (!window.THREE.OrbitControls) {
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.159.0/examples/jsm/controls/OrbitControls.js')
            }
            
            // Load MeshSurfaceSampler
            if (!window.THREE.MeshSurfaceSampler) {
                await loadScript('https://cdn.jsdelivr.net/npm/three@0.159.0/addons/math/MeshSurfaceSampler.js')
            }

            if (canvasRef.current && !sceneRef.current) {
                sceneRef.current = new FluffyGrass(canvasRef.current)
                sceneRef.current.render()
            }
        }

        loadDependencies()
    }, [])

    useEffect(() => {
        const handleResize = () => {
            if (sceneRef.current && canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect()
                sceneRef.current.resize(rect.width, rect.height)
            }
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: "100%",
                height: "100%",
                display: "block"
            }}
        />
    )
}

// Helper function to load scripts
function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = src
        script.onload = () => resolve()
        script.onerror = reject
        document.head.appendChild(script)
    })
}

addPropertyControls(FluffyGrassComponent, {
    // Add controls if needed
}) 