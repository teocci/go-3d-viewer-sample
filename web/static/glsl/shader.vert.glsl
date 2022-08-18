/**
 * Vert Shader
 */

attribute vec4 tangent;

uniform float time;

#ifdef USE_LOGDEPTHBUF
    #ifdef USE_LOGDEPTHBUF_EXT
        varying float vFragDepth;
    #endif
    uniform float logDepthBufFC;
#endif

#ifdef DISPLACEMENT
    uniform float displacementBaseMag;
    uniform float displacementBaseBias;
    #ifdef DISPLACEMENT_TEXTURE
        uniform float displacementMag;
        uniform float displacementBias;
        uniform sampler2D displacementTexture;
        uniform int displacementUVChannel;
        uniform vec2 displacementTextureOffset;
        uniform vec2 displacementTextureScale;
        uniform vec2 displacementTexturePan;
    #endif
#endif

varying vec4 vNormal_VS;

#ifdef USE_LIGHTING
    #if (defined(NORMAL_TEXTURE) || defined(DISPLACEMENT_TEXTURE_RGBA)) && !defined(DEPTH_PASS)
        varying vec4 vTangent_VS;
        varying vec4 vBinormal_VS;
    #endif
#endif

varying vec4 vUv;
varying vec4 vPosition_VS;
varying vec4 vPosition_WS;

#if !defined(DEPTH_PASS)
    #if defined(USE_COLOR) && defined(DIFFUSE_COLOR)
        varying vec3 vColor;
    #endif
    #if defined(USE_SHADOWMAP) && defined(USE_LIGHTING)
        #if MAX_SHADOWS > 0
            varying vec4 vShadowCoord[MAX_SHADOWS];
            uniform mat4 shadowMatrix[MAX_SHADOWS];
        #endif
    #endif
#endif

#ifdef USE_SKINNING
    uniform mat4 bindMatrix;
    uniform mat4 bindMatrixInverse;

    #ifdef BONE_TEXTURE
        uniform sampler2D boneTexture;
        uniform int boneTextureWidth;
        uniform int boneTextureHeight;

        mat4 getBoneMatrix(const in float i) {
            float j = i * 4.0;
            float x = mod(j, float(boneTextureWidth));
            float y = floor(j / float(boneTextureHeight));

            float dx = 1.0 / float(boneTextureWidth);
            float dy = 1.0 / float(boneTextureHeight);

            y = dy * (y + 0.5);

            vec4 v1 = texture2D(boneTexture, vec2(dx * (x + 0.5), y));
            vec4 v2 = texture2D(boneTexture, vec2(dx * (x + 1.5), y));
            vec4 v3 = texture2D(boneTexture, vec2(dx * (x + 2.5), y));
            vec4 v4 = texture2D(boneTexture, vec2(dx * (x + 3.5), y));

            mat4 bone = mat4(v1, v2, v3, v4);

            return bone;
        }
    #else
        uniform mat4 boneGlobalMatrices[MAX_BONES];

        mat4 getBoneMatrix(const in float i) {
            mat4 bone = boneGlobalMatrices[int(i)];
            return bone;
        }
    #endif
#endif


vec3 mulVectorByMatrix4x4(in vec3 v, in mat4 m) {
    return (v.x * m[0] + (v.y * m[1] + (v.z * m[2]))).xyz;
}

vec4 mulPointByMatrix4x4(in vec3 v, in mat4 m) {
    return v.x * m[0] + (v.y * m[1] + (v.z * m[2] + m[3]));
}

void main() {
    vUv.xy = uv;
    vUv.y = 1.0 - vUv.y;
    vUv.zw = uv2;
    vUv.w = 1.0 - vUv.w;

    #ifdef DISPLACEMENT
        float texDisplacement;
        #ifdef DISPLACEMENT_TEXTURE
            vec2 displacementUV = vUv.xy * displacementTextureScale + displacementTextureOffset + displacementTexturePan * time;

            vec4 displacementMap = texture2D(displacementTexture, displacementUV);
            texDisplacement = displacementMag * displacementMap.x + displacementMag * (displacementBias * 0.5 - 0.5);
        #else
            #ifdef DISPLACEMENT_TEXTURE_RGBA
            vec2 displacementUV = vUv.xy * displacementTextureScale + displacementTextureOffset + displacementTexturePan * time;
            vec4 displacementMap = texture2D(displacementTexture, displacementUV);

            texDisplacement = displacementMag * displacementMap.a + displacementMag * (displacementBias * 0.5 - 0.5);
            #endif
        #endif

        float displacementAmount = displacementBaseMag * displacementBaseBias + texDisplacement;
        vec4 displacedPosition = vec4((normal * displacementAmount) + position.xyz, 1.0);

        #else
        vec4 displacedPosition = vec4(position, 1.0);
    #endif

    vec3 vNormal = normal;
    vec3 vTangent = tangent.xyz;

    #ifdef USE_SKINNING
        mat4 boneMatX = getBoneMatrix(skinIndex.x);
        mat4 boneMatY = getBoneMatrix(skinIndex.y);
        mat4 boneMatZ = getBoneMatrix(skinIndex.z);
        mat4 boneMatW = getBoneMatrix(skinIndex.w);

        mat4 skinMatrix = mat4(0.0);
        skinMatrix += skinWeight.x * boneMatX;
        skinMatrix += skinWeight.y * boneMatY;
        skinMatrix += skinWeight.z * boneMatZ;
        skinMatrix += skinWeight.w * boneMatW;
        skinMatrix  = bindMatrixInverse * skinMatrix * bindMatrix;

        vNormal = (skinMatrix * vec4(vNormal, 0.0)).xyz;
        vTangent = (skinMatrix * vec4(vTangent, 0.0)).xyz;

        vec4 skinVertex    = bindMatrix * displacedPosition;
        displacedPosition  = boneMatX * skinVertex * skinWeight.x;
        displacedPosition += boneMatY * skinVertex * skinWeight.y;
        displacedPosition += boneMatZ * skinVertex * skinWeight.z;
        displacedPosition += boneMatW * skinVertex * skinWeight.w;
        displacedPosition  = bindMatrixInverse * displacedPosition;
    #endif

    vPosition_VS = -(modelViewMatrix * displacedPosition);
    vPosition_WS = modelMatrix * displacedPosition;

    #ifdef USE_BILLBOARDING
        gl_Position = projectionMatrix * (viewMatrix * vec4(0.0, 0.0, 0.0, 1.0) + vPosition_VS);
    #else
        gl_Position = projectionMatrix * modelViewMatrix * displacedPosition;
    #endif

    #ifdef USE_FISHEYE
        vec4 tempPoint = modelViewMatrix * displacedPosition;
        gl_Position.xy = tempPoint.xy / length(tempPoint.xyz);
    #endif

    #if defined(USE_LOGDEPTHBUF) && !defined(DEPTH_PASS)
        gl_Position.z = log2(max(1e-6, gl_Position.w + 1.0)) * logDepthBufFC;
        #ifdef USE_LOGDEPTHBUF_EXT
            vFragDepth = 1.0 + gl_Position.w;
        #else
            gl_Position.z = (gl_Position.z - 1.0) * gl_Position.w;
        #endif
    #endif

    #if !defined(DEPTH_PASS)
        #if defined(USE_COLOR)
            #if defined(DIFFUSE_COLOR)
                #ifdef GAMMA_INPUT
                    vColor = color * color;
                #else
                    vColor = color;
                #endif
            #else
                vPosition_VS.w += color.x;
                vPosition_VS.w -= color.x;
            #endif
        #endif

        vNormal_VS.xyz = normalize((vec4(normalMatrix * vNormal, 0)).xyz);

        #ifdef FLIP_SIDED
        vNormal_VS = -vNormal_VS;
        #endif

        #ifdef USE_LIGHTING
            #if (LIGHTING_MODEL == 1) && (defined(NORMAL_TEXTURE) || defined(DISPLACEMENT_TEXTURE_RGBA))
                vTangent_VS.xyz = normalize((vec4(normalMatrix * vTangent.xyz, 0)).xyz);
                vBinormal_VS.xyz = cross(vNormal_VS.xyz, vTangent_VS.xyz) * tangent.w / clamp(abs(tangent.w), 0.0, 1.0);

                #if defined(PARALLAX_MAPPING) || defined(DISPLACEMENT_TEXTURE_RGBA)
                    mat3 mTangentToView = mat3(vTangent_VS.xyz, vBinormal_VS.xyz, vNormal_VS.xyz);
                    vec3 eyeVector_VS = vPosition_VS.xyz;
                    vec3 eyeVector_TS = eyeVector_VS * mTangentToView;

                    vTangent_VS.w = eyeVector_TS.x;
                    vBinormal_VS.w = eyeVector_TS.y;
                    vNormal_VS.w = eyeVector_TS.z;
                #endif

                #if defined(DISPLACEMENT_TEXTURE_RGBA)
                    vNormal_VS.xyz = mTangentToWorld * displacementMap.xyz;
                #endif
            #endif

            #ifdef USE_SHADOWMAP
                #if MAX_SHADOWS > 0
                    for (int i = 0; i < MAX_SHADOWS; i ++) {
                        #ifdef USE_MORPHTARGETS
                            vShadowCoord[i] = shadowMatrix[i] * modelMatrix * vec4(morphed, 1.0);
                        #else
                            vShadowCoord[i] = shadowMatrix[i] * modelMatrix * displacedPosition;
                        #endif
                    }
                #endif
            #endif
        #endif
    #endif
}
