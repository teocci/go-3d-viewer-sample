/**
* Frag Uber Shader
*/

#define ALPHA_TEST_LEQUAL 0
#define ALPHA_TEST_GREATER 1
#define DEPTH_TEST_LESS 0
#define DEPTH_TEST_EQUAL 1

uniform float time;
uniform int renderModeNormals;
uniform float opacity;

const mat3 InverseLogLuvMatrix = mat3(6.0014, -2.7008, -1.7996, -1.3320, 3.1029, -5.7721, .3008, -1.0882, 5.6268);

vec3 HDRDecodeLOGLUV(in vec4 vLogLuv) {
    float Le = vLogLuv.z * 255. + vLogLuv.w;
    vec3 Xp_Y_XYZp;
    Xp_Y_XYZp.y = exp2((Le - 127.) / 2.);
    Xp_Y_XYZp.z = Xp_Y_XYZp.y / vLogLuv.y;
    Xp_Y_XYZp.x = vLogLuv.x * Xp_Y_XYZp.z;
    vec3 vRGB = InverseLogLuvMatrix * Xp_Y_XYZp;
    return vRGB;
}

vec3 HDRDecodeRGBM(vec4 rgbm) {
    return 9. * rgbm.rgb * rgbm.a;
}

vec3 HDRDecodeRGBD(vec4 rgbd) {
    return rgbd.rgb / max(rgbd.a, .003);
}

vec3 HDRDecodeRGBE(vec4 rgbe) {
    float f = exp2(rgbe.w * 255. - (128. + 0.));
    return rgbe.rgb * f;
}

#define GAMMA_VALUE 2.2
vec3 gamma(vec3 val) {
    return pow(val, vec3(1. / GAMMA_VALUE));
}

vec3 degamma(vec3 val) {
    return pow(val, vec3(GAMMA_VALUE));
}

#ifdef USE_LOGDEPTHBUF
uniform float logDepthBufFC;
    #ifdef USE_LOGDEPTHBUF_EXT
#extension GL_EXT_frag_depth:enable
varying float vFragDepth;
    #endif
#endif

#ifdef ALPHATEST
uniform float alphaTest;
uniform int alphaTestFunc;
#endif

#ifdef DIFFUSE_COLOR
uniform vec3 diffuseColor;
uniform float colorOpacity;
    #if defined(DIFFUSE_COLOR)&&defined(DIFFUSE_TEXTURE)
uniform int alphaBlendMode;
uniform int colorBlend;
uniform int diffuseTextureChannel;
uniform sampler2D diffuseTexture;
uniform int diffuseUVChannel;
uniform vec2 diffuseTextureOffset;
uniform vec2 diffuseTextureScale;
uniform vec2 diffuseTexturePan;
    #endif

    #if!defined(DEPTH_PASS)
        #ifdef AO_TEXTURE
uniform sampler2D aoTexture;
uniform int aoUVChannel;
uniform vec2 aoTextureOffset;
uniform vec2 aoTextureScale;
uniform vec2 aoTexturePan;
        #endif
    #endif
#else
const vec3 diffuseColor = vec3(0.);
const float colorOpacity = 1.;
#endif

#if!defined(DEPTH_PASS)
uniform vec4 screenDimensions;
    #ifdef RIM_LIGHTING
uniform vec3 rimColor;
uniform float rimPower;
    #endif

    #ifdef SPECULAR_COLOR
uniform vec3 specularColor;

        #ifdef SPECULAR_TEXTURE
uniform sampler2D specularTexture;
uniform int specularUVChannel;
uniform vec2 specularTextureOffset;
uniform vec2 specularTextureScale;
uniform vec2 specularTexturePan;
        #endif

        #if defined(PHONG_SPECULAR)||defined(FUSE_SPECULAR)
uniform float specularIntensity;
uniform float gloss;
        #endif
    #endif

    #ifdef REFLECTIONS
uniform float reflectionFresnel;
uniform float reflectionBias;
float reflectionFactor = reflectionBias * reflectionBias;
        #if(REFLECTIONS==0)
uniform samplerCube environmentTexture;
        #else
uniform sampler2D environmentTexture2D;
        #endif
    #endif

    #if defined(USE_COLOR)&&defined(DIFFUSE_COLOR)
varying vec3 vColor;
    #endif

    #ifdef NORMAL_TEXTURE
uniform float normalScale;
uniform sampler2D normalTexture;
uniform int normalUVChannel;
uniform vec2 normalTextureOffset;
uniform vec2 normalTextureScale;
uniform vec2 normalTexturePan;
uniform bool normalTextureFlipY;
uniform bool normalTextureFlipX;
        #ifdef PARALLAX_MAPPING
uniform float parallaxScale;
        #endif
    #endif

    #ifdef EMISSIVE_COLOR
uniform vec3 emissiveColor;
uniform float emissiveIntensity;
        #ifdef EMISSIVE_TEXTURE
uniform sampler2D emissiveTexture;
uniform int emissiveUVChannel;
uniform vec2 emissiveTextureOffset;
uniform vec2 emissiveTextureScale;
uniform vec2 emissiveTexturePan;
        #endif
    #endif

    #ifdef SCATTERING
        #ifdef TRANSLUCENT_SCATTERING
uniform vec3 scatterColor;
uniform float scatterScale;
        #elif defined(LOCAL_SCATTERING)
uniform vec3 scatterColor;
uniform float scatterLocalScale;
        #endif

        #ifdef SSS_TEXTURE
uniform sampler2D sssTexture;
uniform int sssUVChannel;
uniform vec2 sssTextureOffset;
uniform vec2 sssTextureScale;
uniform vec2 sssTexturePan;
        #endif
    #endif

    #ifdef IRIDESCENT_LAYER
uniform vec3 diffuseColor2;
uniform float twoToneExponent;
uniform float metallicExponent;
uniform float metallicMultiplier;
        #ifdef IRIDESCENT_TEXTURE
uniform sampler2D iridescentTexture;
        #endif
    #endif
#endif

varying vec4 vUv;
varying vec4 vPosition_VS;
varying vec4 vPosition_WS;

#if!defined(DEPTH_PASS)
    #if defined(NORMAL_TEXTURE)&&defined(USE_LIGHTING)
        #if(LIGHTING_MODEL==1)
varying vec4 vTangent_VS;
varying vec4 vBinormal_VS;
        #endif
    #endif

varying vec4 vNormal_VS;
uniform vec3 ambientLightColor;

    #ifdef USE_LIGHTING
uniform int doubleSidedLighting;
        #if(LIGHTING_MODEL==1)
            #if MAX_DIR_LIGHTS>0
uniform vec3 directionalLightColor[MAX_DIR_LIGHTS];
uniform vec3 directionalLightDirection[MAX_DIR_LIGHTS];
            #endif

            #if MAX_POINT_LIGHTS>0
uniform vec3 pointLightPosition[MAX_POINT_LIGHTS];
uniform float pointLightDistance[MAX_POINT_LIGHTS];
uniform vec3 pointLightColor[MAX_POINT_LIGHTS];
            #endif
        #endif

        #ifdef USE_SHADOWMAP
            #if MAX_SHADOWS>0
uniform sampler2D shadowMap[MAX_SHADOWS];
uniform vec2 shadowMapSize[MAX_SHADOWS];
uniform float shadowBias[MAX_SHADOWS];
varying vec4 vShadowCoord[MAX_SHADOWS];
            #endif

float unpackDepth(const in vec4 rgba_depth) {
    const vec4 bit_shift = vec4(1. / (256. * 256. * 256.), 1. / (256. * 256.), 1. / 256., 1.);
    float depth = dot(rgba_depth, bit_shift);
    return depth;
}
            #endif
        #endif

        #ifdef USE_FOG
uniform vec3 fogColor;
uniform float fogDensity;
        #endif

        #ifdef SPECULAR_COLOR
            #ifdef FUSE_SPECULAR
vec3 FuseSpecular(float specPower, float NdotH, float HdotL, float NdotL) {
    float FG = .25 / (pow(NdotH, 3.) + 1. / 32.);
    float D = .5 * (specPower + 1.) * pow(NdotH, specPower);
    float DFG = D * FG;
    float specular = NdotL * DFG;
    return vec3(specular);
}
            #endif

            #ifdef PHONG_SPECULAR
vec2 LightingFuncGGX_FV(float dotLH, float roughness) {
    float alpha = roughness * roughness;

    float F_a, F_b;
    float dotLH5 = pow(1. - dotLH, 5.);
    F_a = 1.;
    F_b = dotLH5;

    float vis;
    float k = alpha / 2.;
    float k2 = k * k;
    float invK2 = 1. - k2;
    vis = 1. / (dotLH * dotLH * invK2 + k2);

    return vec2(F_a * vis, F_b * vis);
}

float LightingFuncGGX_D(float dotNH, float roughness) {
    float alpha = roughness * roughness;
    float alphaSqr = alpha * alpha;
    float pi = 3.14159;
    float denom = dotNH * dotNH * (alphaSqr - 1.) + 1.;

    float D = alphaSqr / (pi * denom * denom);
    return D;
}

float SpecularFuncGGX(in float roughness, in float dotNH, in float dotLH, in float dotNL) {
    dotNH = clamp(dotNH, 0., 1.);
    dotLH = clamp(dotLH, 0., 1.);
    dotNL = clamp(dotNL, 0., 1.);

    float D = LightingFuncGGX_D(dotNH, roughness);
    vec2 FV_helper = LightingFuncGGX_FV(dotLH, roughness);
                #ifdef REFLECTIONS
    float FV = reflectionFactor * FV_helper.x + (1. - reflectionFactor) * FV_helper.y;
                #else
    float FV = FV_helper.x;
                #endif
    float specular = dotNL * D * FV;

    return specular;
}
            #endif
        #endif

        #ifdef LOCAL_SCATTERING
void calculateLocalScattering(in vec3 lightDirection, in float NdotL, out float diffuseWeight, in vec3 normal_Scatter, out float scatterWeight) {
    float NdotL_Scatter = dot(normal_Scatter, lightDirection);
    float diffuseWeightHalf = clamp(.5 * NdotL_Scatter + .5, 0., 1.);

    scatterWeight = diffuseWeightHalf;

    diffuseWeight = clamp(mix(NdotL_Scatter, NdotL, .15), 0., 1.);
}
        #endif
    #endif

    #ifdef DEPTH_PASS
vec4 pack_depth(const in float depth) {
    const vec4 bit_shift = vec4(256. * 256. * 256., 256. * 256., 256., 1.);
    const vec4 bit_mask = vec4(0., 1. / 256., 1. / 256., 1. / 256.);

    vec4 res = mod(depth * bit_shift * vec4(255), vec4(256)) / vec4(255);
    res = res.xxyz * -bit_mask + res;

    return res;
}
    #endif

void main() {
    #if defined(USE_LOGDEPTHBUF)&&defined(USE_LOGDEPTHBUF_EXT)
    gl_FragDepthEXT = log2(vFragDepth) * logDepthBufFC * .5;
    #endif
    vec2 uvOffset = vec2(0., 0.);

    #if!defined(DEPTH_PASS)&&defined(USE_LIGHTING)
        #ifdef NORMAL_TEXTURE
    vec2 vNormalUv = mix(vUv.xy, vUv.zw, float(normalUVChannel));
    vNormalUv = vNormalUv * normalTextureScale + normalTextureOffset + normalTexturePan * time;

            #ifdef PARALLAX_MAPPING
    const float n = 6.;
    float step = 1. / n;
    float height = 1.;
    float parallaxDepth = texture2D(normalTexture, vNormalUv).a;
    float fragColorMult = 1.;
    float darkeningAmount = parallaxScale * 35.;

    vec3 eyeVector_TS = normalize(vec3(vTangent_VS.w, vBinormal_VS.w, vNormal_VS.w));
    vec2 dt = vec2(-1., 1.) * eyeVector_TS.xy * parallaxScale / (n * eyeVector_TS.z);
    vec2 t = vec2(0., 0.);
    bool isSet = false;
    for(float i = 0.; i < n; i++) {
        if(parallaxDepth > height && !isSet) {
            isSet = true;
            uvOffset = t;
            fragColorMult -= darkeningAmount * .2 * i;
        }
        height -= step;
        t += dt;
        parallaxDepth = texture2D(normalTexture, vNormalUv + t).a;
    }
            #endif
    vec3 normalTex = texture2D(normalTexture, vNormalUv + uvOffset).xyz;
        #endif
    #endif

    #if defined(DIFFUSE_COLOR)&&defined(DIFFUSE_TEXTURE)
    vec2 vDiffuseUv = mix(vUv.xy, vUv.zw, float(diffuseUVChannel));
    vDiffuseUv = vDiffuseUv * diffuseTextureScale + diffuseTextureOffset + uvOffset + diffuseTexturePan * time;
    vec4 diffuseTex = texture2D(diffuseTexture, vDiffuseUv);
        #ifdef GAMMA_INPUT
    diffuseTex.xyz = degamma(diffuseTex.xyz);
        #endif
    #endif

    #if!defined(DEPTH_PASS)
        #if defined(SPECULAR_COLOR)&&defined(SPECULAR_TEXTURE)
    vec2 vSpecularUv = mix(vUv.xy, vUv.zw, float(specularUVChannel));
    vSpecularUv = vSpecularUv * specularTextureScale + specularTextureOffset + uvOffset + specularTexturePan * time;
    vec4 specularTex = texture2D(specularTexture, vSpecularUv);
        #endif

        #if defined(EMISSIVE_COLOR)&&defined(EMISSIVE_TEXTURE)
    vec2 vEmissiveUv = mix(vUv.xy, vUv.zw, float(emissiveUVChannel));
    vEmissiveUv = vEmissiveUv * emissiveTextureScale + emissiveTextureOffset + uvOffset + emissiveTexturePan * time;
    vec3 emissiveTex = texture2D(emissiveTexture, vEmissiveUv).xyz;
            #ifdef GAMMA_INPUT
    emissiveTex = degamma(emissiveTex);
            #endif
        #endif

        #if defined(DIFFUSE_COLOR)&&defined(AO_TEXTURE)
    vec2 vAOUv = mix(vUv.xy, vUv.zw, float(aoUVChannel));
    vAOUv = vAOUv * aoTextureScale + aoTextureOffset + uvOffset + aoTexturePan * time;
    vec3 aoTex = texture2D(aoTexture, vAOUv).xyz;
        #endif

        #if defined(SCATTERING)&&defined(SSS_TEXTURE)
    vec2 vSSSUv = mix(vUv.xy, vUv.zw, float(sssUVChannel));
    vSSSUv = vSSSUv * sssTextureScale + sssTextureOffset + uvOffset + sssTexturePan * time;
    vec3 sssTex = texture2D(sssTexture, vSSSUv).xyz;
            #ifdef GAMMA_INPUT
    sssTex = degamma(sssTex);
            #endif
        #endif

    vec3 eyeVector_VS = normalize(vPosition_VS.xyz);
        #if defined(NORMAL_TEXTURE)&&defined(USE_LIGHTING)
            #if(LIGHTING_MODEL==1)
    normalTex.xy = normalTex.xy * 2. - 1.;

    if(normalTextureFlipY) {
        normalTex *= vec3(1., -1., 1.);
    }

    if(normalTextureFlipX) {
        normalTex *= vec3(-1., 1., 1.);
    }

    normalTex.xy *= normalScale;

    mat3 T2V_Transform = mat3(vTangent_VS.xyz, vBinormal_VS.xyz, vNormal_VS.xyz);
    vec3 normal_VS = T2V_Transform * normalTex;
    normal_VS = normalize(normal_VS);

            #ifdef LOCAL_SCATTERING
    vec3 normal_Scatter = normal_VS;
            #endif
        #endif
    #else
    vec3 normal_VS = normalize(vNormal_VS.xyz);
        #ifdef LOCAL_SCATTERING
    vec3 normal_Scatter = normal_VS;
        #endif
    #endif

    #if defined(USE_LIGHTING)
    #endif

    #ifdef DOUBLE_SIDED
    normal_VS = normal_VS * (-1. + 2. * float(gl_FrontFacing));
    #endif
    float NdotV = dot(eyeVector_VS, normal_VS);

    #ifdef SPECULAR_COLOR
    float glossValue;
        #ifdef SPECULAR_TEXTURE
            #if defined(PHONG_SPECULAR)||defined(FUSE_SPECULAR)
    glossValue = gloss * specularTex.a;
            #endif
        #elif defined(PHONG_SPECULAR)||defined(FUSE_SPECULAR)
    glossValue = gloss;
        #endif
    #endif

    #ifdef REFLECTIONS
    float mipBias = 0.;
        #ifdef SPECULAR_COLOR
    mipBias = (1. - glossValue) * 5.;
        #endif
    vec3 cameraToVertex = normalize(vPosition_WS.xyz - cameraPosition);
    vec3 vReflectWorldSpace = (vec4(reflect(cameraToVertex, (vec4(normal_VS, 0.) * viewMatrix).xyz), 0.)).xyz;

        #if(REFLECTIONS==0)
    vec4 reflectedColor = textureCube(environmentTexture, vec3(vReflectWorldSpace.x, vReflectWorldSpace.yz), mipBias);
        #elif(REFLECTIONS==1)
    vec4 reflectedColor = texture2D(environmentTexture2D, vReflectWorldSpace.xy * vec2(.5, -.5) + .5, mipBias);
        #elif(REFLECTIONS==2)
    vec4 reflectedColor = texture2D(environmentTexture2D, vec2(-1., 1.) * (gl_FragCoord.xy - screenDimensions.xy) / screenDimensions.zw, mipBias);
        #elif(REFLECTIONS==3)
    vec2 sampleUV;
    sampleUV.y = clamp(vReflectWorldSpace.y * -.5 + .5, 0., 1.);
    sampleUV.x = atan(vReflectWorldSpace.z, vReflectWorldSpace.x) * .15915494309189533576888376337251 + .5;

    vec4 reflectedColor = texture2D(environmentTexture2D, sampleUV, mipBias);
        #endif

        #if defined(ENVMAP_HDR_INPUT)
            #if(ENVMAP_HDR_INPUT==HDR_TYPE_RGBM)
    reflectedColor.xyz = HDRDecodeRGBM(reflectedColor);
            #elif(ENVMAP_HDR_INPUT==HDR_TYPE_RGBD)
    reflectedColor.xyz = HDRDecodeRGBD(reflectedColor);
            #elif(ENVMAP_HDR_INPUT==HDR_TYPE_RGBE)
    reflectedColor.xyz = HDRDecodeRGBE(reflectedColor);
            #elif(ENVMAP_HDR_INPUT==HDR_TYPE_LOGLUV)
    reflectedColor.xyz = HDRDecodeLOGLUV(reflectedColor);
        #else

        #ifdef GAMMA_INPUT
    reflectedColor.xyz = degamma(reflectedColor.xyz);
        #endif
    #endif
    #endif
    #elif defined(IRIDESCENT_LAYER)&&defined(IRIDESCENT_TEXTURE)
    vec3 cameraToVertex = normalize(vPosition_WS.xyz - cameraPosition);
    vec3 vReflectWorldSpace = (vec4(reflect(cameraToVertex, (vec4(normal_VS, 0.) * viewMatrix).xyz), 0.)).xyz;
    #endif

    #ifdef REFLECTIONS
    #endif

    #ifdef IRIDESCENT_LAYER
    float twoToneFactor = pow(abs(NdotV), twoToneExponent);
    #ifdef IRIDESCENT_TEXTURE
    vec3 iridescentTex = texture2D(iridescentTexture, vec2(twoToneFactor, vReflectWorldSpace.y * .5 + .5)).xyz;
    #ifdef GAMMA_INPUT
    iridescentTex = degamma(iridescentTex);
    #endif
    vec3 baseColor = mix(diffuseColor, diffuseColor2, twoToneFactor) * iridescentTex;
    #else
    vec3 baseColor = mix(diffuseColor, diffuseColor2, twoToneFactor);
    #endif
    #else
    vec3 baseColor = diffuseColor;
    #endif

    #if defined(USE_COLOR)&&defined(DIFFUSE_COLOR)
    baseColor *= vColor;
    #endif

    #if defined(DIFFUSE_COLOR)&&defined(DIFFUSE_TEXTURE)
    vec3 diffuseColorValue = diffuseTex.xyz;
    #if defined(ALPHATEST)
    if(alphaTestFunc == ALPHA_TEST_GREATER && diffuseTex.a <= alphaTest)
        discard;
    if(alphaTestFunc == ALPHA_TEST_LEQUAL && diffuseTex.a > alphaTest)
        discard;
    #endif

    #ifdef ALPHA_BLENDMODE
    #if(ALPHA_BLENDMODE==1)
    if(colorBlend != 0) {
        diffuseColorValue = diffuseTex.xyz * baseColor;
    } else {
        diffuseColorValue = mix(baseColor, diffuseTex.xyz, diffuseTex.a);
    }
    #else
    diffuseColorValue = diffuseTex.xyz * baseColor;
    #endif

    #if defined(ALPHATEST)
    #if(ALPHA_BLENDMODE==2)
    if(diffuseTex.a < float(ALPHATEST))
        discard;
    #endif
    #endif
    #endif
    float textureOpacity = clamp(float(alphaBlendMode) + diffuseTex.a, 0., 1.);
    float colorOpacityValue = colorOpacity * textureOpacity;
    #elif defined(DIFFUSE_COLOR)
    vec3 diffuseColorValue = baseColor;
    float colorOpacityValue = colorOpacity;
    #endif
    #endif
    #if defined(DEPTH_PASS)
    #if defined(DIFFUSE_TEXTURE)&&defined(ALPHATEST)
    #if(ALPHA_BLENDMODE==2)
    if(diffuseTex.a < float(ALPHATEST)) {
        discard;
    } else {
        gl_FragColor = pack_depth(gl_FragCoord.z);
    }
    #endif
    #else
    gl_FragColor = pack_depth(gl_FragCoord.z);
    #endif
    #else
    #if defined(SPECULAR_COLOR)&&defined(SPECULAR_TEXTURE)
    vec3 specularColorValue = specularTex.xyz * specularColor;
    #elif defined(SPECULAR_COLOR)
    vec3 specularColorValue = specularColor;
    #endif

    float totalOpacityValue = opacity;

    #ifdef SCATTERING
    #ifdef SSS_TEXTURE
    vec3 scatterColorValue = scatterColor * sssTex;
    #else
    vec3 scatterColorValue = scatterColor;
    #endif
    #ifdef LOCAL_SCATTERING
    scatterColorValue *= scatterLocalScale * .5;
    #endif
    #endif

    vec3 totalDiffuse = vec3(0., 0., 0.);
    vec3 totalSpecular = vec3(0.);
    vec3 totalOther = vec3(0.);

    #ifdef USE_LIGHTING
    #ifdef USE_SHADOWMAP
    #if MAX_SHADOWS>0&&(defined(DIFFUSE_COLOR)||defined(SPECULAR_COLOR))
    float shadowValues[MAX_SHADOWS];
    #ifdef TRANSLUCENT_SCATTERING
    float shadowValuesScatter[MAX_SHADOWS];
    #endif

    #ifdef SHADOWMAP_DEBUG
    vec3 shadowColour = vec3(1.);
    #endif

    #ifdef SHADOWMAP_CASCADE
    for(int s = 0; s < MAX_SHADOWS; s++) {
        shadowValues[s] = 1.;
    }
    #endif

    #ifdef SHADOWMAP_DEBUG
    vec3 frustumColors[3];
    frustumColors[0] = vec3(1., .5, 0.);
    frustumColors[1] = vec3(0., 1., .8);
    frustumColors[2] = vec3(0., .5, 1.);
    #endif

    #ifdef SHADOWMAP_CASCADE
    int inFrustumCount = 0;
    #endif

    float fDepth;

    int frustumIndex = 0;

    for(int s = 0; s < MAX_SHADOWS; s++) {
        vec3 shadowCoord = vShadowCoord[s].xyz / vShadowCoord[s].w;
        bvec4 inFrustumVec = bvec4(shadowCoord.x >= 0., shadowCoord.x <= 1., shadowCoord.y >= 0., shadowCoord.y <= 1.);
        bool inFrustum = all(inFrustumVec);

        #ifdef SHADOWMAP_CASCADE
        inFrustumCount += int(inFrustum);
        bvec3 frustumTestVec = bvec3(inFrustum, inFrustumCount == 1, shadowCoord.z <= 1.);
        #else
        bvec2 frustumTestVec = bvec2(inFrustum, shadowCoord.z <= 1.);
        #endif

        bool frustumTest = all(frustumTestVec);

        if(frustumTest) {
            shadowCoord.z += shadowBias[s];
            #ifdef SHADOWMAP_TYPE_PCF_SOFT
            float shadow = 0.;

            float xPixelOffset = 1. / shadowMapSize[s].x;
            float yPixelOffset = 1. / shadowMapSize[s].y;

            float dx0 = -1. * xPixelOffset;
            float dy0 = -1. * yPixelOffset;
            float dx1 = 1. * xPixelOffset;
            float dy1 = 1. * yPixelOffset;

            mat3 shadowKernel;
            mat3 depthKernel;

            depthKernel[0][0] = unpackDepth(texture2D(shadowMap[s], shadowCoord.xy + vec2(dx0, dy0)));
            depthKernel[0][1] = unpackDepth(texture2D(shadowMap[s], shadowCoord.xy + vec2(dx0, 0.)));
            depthKernel[0][2] = unpackDepth(texture2D(shadowMap[s], shadowCoord.xy + vec2(dx0, dy1)));
            depthKernel[1][0] = unpackDepth(texture2D(shadowMap[s], shadowCoord.xy + vec2(0., dy0)));
            depthKernel[1][1] = unpackDepth(texture2D(shadowMap[s], shadowCoord.xy));
            depthKernel[1][2] = unpackDepth(texture2D(shadowMap[s], shadowCoord.xy + vec2(0., dy1)));
            depthKernel[2][0] = unpackDepth(texture2D(shadowMap[s], shadowCoord.xy + vec2(dx1, dy0)));
            depthKernel[2][1] = unpackDepth(texture2D(shadowMap[s], shadowCoord.xy + vec2(dx1, 0.)));
            depthKernel[2][2] = unpackDepth(texture2D(shadowMap[s], shadowCoord.xy + vec2(dx1, dy1)));

            vec3 shadowZ = vec3(shadowCoord.z);
            shadowKernel[0] = vec3(lessThan(depthKernel[0], shadowZ));
            shadowKernel[0] *= vec3(.25);

            shadowKernel[1] = vec3(lessThan(depthKernel[1], shadowZ));
            shadowKernel[1] *= vec3(.25);

            shadowKernel[2] = vec3(lessThan(depthKernel[2], shadowZ));
            shadowKernel[2] *= vec3(.25);

            vec2 fractionalCoord = 1. - fract(shadowCoord.xy * shadowMapSize[s].xy);

            shadowKernel[0] = mix(shadowKernel[1], shadowKernel[0], fractionalCoord.x);
            shadowKernel[1] = mix(shadowKernel[2], shadowKernel[1], fractionalCoord.x);

            vec4 shadowValueVector;
            shadowValueVector.x = mix(shadowKernel[0][1], shadowKernel[0][0], fractionalCoord.y);
            shadowValueVector.y = mix(shadowKernel[0][2], shadowKernel[0][1], fractionalCoord.y);
            shadowValueVector.z = mix(shadowKernel[1][1], shadowKernel[1][0], fractionalCoord.y);
            shadowValueVector.w = mix(shadowKernel[1][2], shadowKernel[1][1], fractionalCoord.y);

            shadow = dot(shadowValueVector, vec4(1.));

            #ifdef SHADOWMAP_CASCADE
            shadowValues[0] *= (1. - shadow);
            #else
            shadowValues[s] = (1. - shadow);
            #endif

            #ifdef TRANSLUCENT_SCATTERING
            depthKernel[0] = mix(depthKernel[1], depthKernel[0], fractionalCoord.x);
            depthKernel[1] = mix(depthKernel[2], depthKernel[1], fractionalCoord.x);

            vec4 depthValues;
            depthValues.x = mix(depthKernel[0][1], depthKernel[0][0], fractionalCoord.y);
            depthValues.y = mix(depthKernel[0][2], depthKernel[0][1], fractionalCoord.y);
            depthValues.z = mix(depthKernel[1][1], depthKernel[1][0], fractionalCoord.y);
            depthValues.w = mix(depthKernel[1][2], depthKernel[1][1], fractionalCoord.y);
            float totalDepth = dot(depthValues, vec4(1.));
            float depthAvg = totalDepth / 4.;
            float exponent = (shadowCoord.z - depthAvg) * shadow;

            exponent = clamp(exponent, 0., 1000.) * 1000.;
            shadowValuesScatter[s] = exp((1. - scatterScale) * -exponent);
            #endif
            #elif defined(SHADOWMAP_TYPE_PCF)
            float shadow = 0.;
            const float shadowDelta = 1. / 9.;

            float xPixelOffset = 1. / shadowMapSize[s].x;
            float yPixelOffset = 1. / shadowMapSize[s].y;

            float dx0 = -1.25 * xPixelOffset;
            float dy0 = -1.25 * yPixelOffset;
            float dx1 = 1.25 * xPixelOffset;
            float dy1 = 1.25 * yPixelOffset;

            float totalDepth = 0.;

            fDepth = unpackDepth(texture2DProj(shadowMap[s], vec4(shadowCoord.xy + vShadowCoord[s].w * vec2(dx0, dy0), .05, vShadowCoord[s].w)));
            if(fDepth < shadowCoord.z)
                shadow += shadowDelta;
            totalDepth += fDepth;

            fDepth = unpackDepth(texture2DProj(shadowMap[s], vec4(shadowCoord.xy + vShadowCoord[s].w * vec2(0., dy0), .05, vShadowCoord[s].w)));
            if(fDepth < shadowCoord.z)
                shadow += shadowDelta;
            totalDepth += fDepth;

            fDepth = unpackDepth(texture2DProj(shadowMap[s], vec4(shadowCoord.xy + vShadowCoord[s].w * vec2(dx1, dy0), .05, vShadowCoord[s].w)));
            if(fDepth < shadowCoord.z)
                shadow += shadowDelta;
            totalDepth += fDepth;

            fDepth = unpackDepth(texture2DProj(shadowMap[s], vec4(shadowCoord.xy + vShadowCoord[s].w * vec2(dx0, 0.), .05, vShadowCoord[s].w)));
            if(fDepth < shadowCoord.z)
                shadow += shadowDelta;
            totalDepth += fDepth;

            fDepth = unpackDepth(texture2DProj(shadowMap[s], vec4(shadowCoord.xy, .05, vShadowCoord[s].w)));
            if(fDepth < shadowCoord.z)
                shadow += shadowDelta;
            totalDepth += fDepth;

            fDepth = unpackDepth(texture2DProj(shadowMap[s], vec4(shadowCoord.xy + vShadowCoord[s].w * vec2(dx1, 0.), .05, vShadowCoord[s].w)));
            if(fDepth < shadowCoord.z)
                shadow += shadowDelta;
            totalDepth += fDepth;

            fDepth = unpackDepth(texture2DProj(shadowMap[s], vec4(shadowCoord.xy + vShadowCoord[s].w * vec2(dx0, dy1), .05, vShadowCoord[s].w)));
            if(fDepth < shadowCoord.z)
                shadow += shadowDelta;
            totalDepth += fDepth;

            fDepth = unpackDepth(texture2DProj(shadowMap[s], vec4(shadowCoord.xy + vShadowCoord[s].w * vec2(0., dy1), .05, vShadowCoord[s].w)));
            if(fDepth < shadowCoord.z)
                shadow += shadowDelta;
            totalDepth += fDepth;

            fDepth = unpackDepth(texture2DProj(shadowMap[s], vec4(shadowCoord.xy + vShadowCoord[s].w * vec2(dx1, dy1), .05, vShadowCoord[s].w)));
            if(fDepth < shadowCoord.z)
                shadow += shadowDelta;
            totalDepth += fDepth;

            #ifdef SHADOWMAP_CASCADE
            shadowValues[0] *= (1. - shadow);
            #else
            shadowValues[s] = (1. - shadow);
            #endif

            #ifdef TRANSLUCENT_SCATTERING
            float depthAvg = totalDepth / 9.;
            float exponent = (shadowCoord.z - depthAvg) * shadow;

            exponent = clamp(exponent, 0., 1000.) * 1000.;
            shadowValuesScatter[s] = exp((1. - scatterScale) * -exponent);
            #endif
            #else

            vec4 rgbaDepth = texture2DProj(shadowMap[s], vec4(vShadowCoord[s].w * (shadowCoord.xy), .05, vShadowCoord[s].w));

            float fDepth = unpackDepth(rgbaDepth);

            if(fDepth < shadowCoord.z) {
                #ifdef SHADOWMAP_CASCADE
                shadowValues[0] *= 0.;
                #else
                shadowValues[s] = 0.;
                #endif
            } else {
                shadowValues[s] = 1.;
            }
            #ifdef TRANSLUCENT_SCATTERING

            float exponent = (shadowCoord.z - fDepth);
            exponent = clamp(exponent, 0., 1000.) * 1000.;
            shadowValuesScatter[s] = exp((1. - scatterScale) * -exponent);
            #endif
            #endif
        } else {
            shadowValues[s] = 1.;
            #ifdef TRANSLUCENT_SCATTERING
            shadowValuesScatter[s] = 1.;
            #endif
        }
        #ifdef SHADOWMAP_DEBUG
        #ifdef SHADOWMAP_CASCADE
        if(inFrustum && inFrustumCount == 1)
            shadowColour = frustumColors[s];
        #else
        if(inFrustum)
            shadowColour = frustumColors[s];
        #endif
        #endif
    }
    #endif
    #endif
    #if(LIGHTING_MODEL==1)
    #if MAX_POINT_LIGHTS>0
    vec3 pointDiffuse;

    for(int p = 0; p < MAX_POINT_LIGHTS; p++) {
        vec3 pointVector_WS = pointLightPosition[p] - vPosition_WS.xyz;
        float pointVecLength = length(pointVector_WS);
        float pointDistance = 1. - clamp((pointVecLength / pointLightDistance[p]), 0., 1.);

        vec3 pointVector_VS = normalize((viewMatrix * vec4(pointVector_WS, 0.)).xyz);

        pointDiffuse = vec3(0.);
        float diffuseWeight;

        float NdotL = dot(normal_VS, pointVector_VS);
        float NdotL_sat = clamp(NdotL, 0., 1.);

        #ifdef LOCAL_SCATTERING
        float scatterWeight;
        calculateLocalScattering(pointVector_VS, NdotL, diffuseWeight, normal_Scatter, scatterWeight);
        #elif defined(TRANSLUCENT_SCATTERING)
        float scatterWeight = 1.;
        diffuseWeight = clamp(NdotL, 0., 1.);
        #else
        diffuseWeight = clamp(NdotL, 0., 1.);
        #endif

        #if defined(PHONG_SPECULAR)||defined(IRIDESCENT_LAYER)||defined(FUSE_SPECULAR)
        vec3 h = pointVector_VS + eyeVector_VS;
        vec3 H = normalize(h);
        float NdotH = dot(normal_VS, H);
        #endif

        #ifdef DIFFUSE_COLOR
        pointDiffuse = vec3(diffuseWeight);
        #endif

        #ifdef IRIDESCENT_LAYER
        float pointMetallicWeight = pow(clamp(NdotH, 0., 1.), metallicExponent) * NdotL_sat;
        pointDiffuse += pointMetallicWeight * metallicMultiplier;
        #endif

        #ifdef DIFFUSE_COLOR
        pointDiffuse *= diffuseColorValue;
        #endif

        #if defined(SCATTERING)
        pointDiffuse = scatterWeight * scatterColorValue + pointDiffuse;
        #endif

        #ifdef SPECULAR_COLOR
        #if defined(PHONG_SPECULAR_SIMPLE)
        float specPower = pow(8192., glossValue);
        vec3 specWeight = specularColorValue * 20. * max(pow(NdotH, specPower), 0.) * NdotL_sat * glossValue;

        #elif defined(FUSE_SPECULAR)
        vec3 specWeight = specularColorValue * FuseSpecular(glossValue, NdotH, HdotL, NdotL);

        #elif defined(PHONG_SPECULAR)
        float HdotL = dot(H, pointVector_VS);

        vec3 specWeight = specularColorValue * SpecularFuncGGX(1.01 - glossValue, NdotH, HdotL, NdotL);

        #endif
        totalSpecular = pointLightColor[p] * specWeight * pointDistance + totalSpecular;
        #endif

        #ifdef RIM_LIGHTING
        float rimPow = clamp(1. - abs(NdotV), 0., 1.);
        float VdotL = dot(eyeVector_VS, pointVector_VS);
        rimPow *= clamp(VdotL, 0., 1.);
        rimPow = pow(rimPow, rimPower);

        pointDiffuse = rimPow * rimColor + pointDiffuse;
        #endif

        pointDiffuse *= pointDistance * pointLightColor[p];
        totalDiffuse += pointDiffuse;
    }
    #endif

    #if MAX_DIR_LIGHTS>0
    for(int i = 0; i < MAX_DIR_LIGHTS; i++) {
        vec3 lightDirection_VS = (viewMatrix * vec4(directionalLightDirection[i], 0.)).xyz;
        float shadowValue = 1.;
        float shadowValueScatter = 1.;

        #if defined(USE_SHADOWMAP)&&(MAX_SHADOWS>0)&&(defined(DIFFUSE_COLOR)||defined(SPECULAR_COLOR))
        if(i < MAX_SHADOWS) {
            shadowValue = shadowValues[i];
        }
        #endif
        #if defined(USE_SHADOWMAP)&&(MAX_SHADOWS>0)
        if(i < MAX_SHADOWS) {
            #ifdef TRANSLUCENT_SCATTERING
            shadowValueScatter = shadowValuesScatter[i];
            #endif
        }
        #endif

        float diffuseWeight;

        float NdotL = dot(normal_VS, lightDirection_VS);
        float NdotL_sat = clamp(NdotL, 0., 1.);

        #ifdef LOCAL_SCATTERING
        float scatterWeight;
        calculateLocalScattering(lightDirection_VS, NdotL, diffuseWeight, normal_Scatter, scatterWeight);
        #else
        diffuseWeight = NdotL_sat;
        #endif

        #ifdef TRANSLUCENT_SCATTERING
        totalDiffuse += shadowValueScatter * scatterColorValue * directionalLightColor[i];
        #endif

        #if defined(LOCAL_SCATTERING)
        totalDiffuse += scatterWeight * scatterColorValue * directionalLightColor[i];
        #endif

        #if defined(PHONG_SPECULAR)||defined(IRIDESCENT_LAYER)||defined(FUSE_SPECULAR)
        vec3 h = lightDirection_VS + eyeVector_VS;
        vec3 H = normalize(h);
        float NdotH = dot(normal_VS, H);
        #endif

        #ifdef SPECULAR_COLOR
        #if defined(PHONG_SPECULAR_SIMPLE)
        float specPower = pow(8192., glossValue);
        vec3 specWeight = specularColorValue * 20. * max(pow(NdotH, specPower), 0.) * NdotL_sat * glossValue;
        #elif defined(FUSE_SPECULAR)
        float HdotL = dot(H, lightDirection_VS);
        vec3 specWeight = specularColorValue * FuseSpecular(glossValue, NdotH, HdotL, NdotL);
        #elif defined(PHONG_SPECULAR)
        float HdotL = dot(H, lightDirection_VS);
        vec3 specWeight = specularColorValue * SpecularFuncGGX(1.01 - glossValue, NdotH, HdotL, NdotL);
        #endif
        totalSpecular = (directionalLightColor[i]) * (specWeight * shadowValue * specularIntensity) + totalSpecular;
        #endif

        #ifdef DIFFUSE_COLOR
        vec3 diffuse = vec3(diffuseWeight);
            #ifdef IRIDESCENT_LAYER
        float dirMetallicWeight = pow(clamp(NdotH, 0., 1.), metallicExponent) * NdotL_sat;
        diffuse += dirMetallicWeight * metallicMultiplier;
            #endif
        diffuse *= diffuseColorValue * directionalLightColor[i] * shadowValue;
        totalDiffuse += diffuse;
        #endif

        #ifdef RIM_LIGHTING
        float rimPow = clamp(1. - abs(NdotV), 0., 1.);
        float VdotL = dot(-eyeVector_VS, lightDirection_VS);
        rimPow *= clamp(VdotL, 0., 1.);
        rimPow = pow(rimPow, rimPower);
            #ifdef DIFFUSE_COLOR
        totalDiffuse += rimPow * rimColor * diffuseColorValue * directionalLightColor[i];
            #else
        totalDiffuse += rimPow * rimColor * directionalLightColor[i];
            #endif
        #endif

        #if defined(USE_SHADOWMAP)&&defined(SHADOWMAP_DEBUG)
            #ifdef DIFFUSE_COLOR
        totalDiffuse *= shadowColour;
            #endif
            #ifdef SPECULAR_COLOR
        totalSpecular *= shadowColour;
            #endif
        #endif

    }
    #endif
        #endif
    #endif

        #if defined(REFLECTIONS)&&defined(SPECULAR_COLOR)
    reflectedColor *= vec4(specularColorValue, 1.);
        #endif

        #ifdef DIFFUSE_COLOR
            #ifdef USE_LIGHTING
    totalDiffuse += ambientLightColor * diffuseColorValue;
            #else
    totalDiffuse += diffuseColorValue;
            #endif

            #ifdef AO_TEXTURE
    totalDiffuse *= aoTex;
            #endif
        #else
    float colorOpacityValue = 1.;
        #endif

    float finalAlpha = colorOpacityValue;
        #ifdef REFLECTIONS
    float fresnel = clamp((pow(1. - NdotV, 5.)) * reflectionFresnel + reflectionFactor, 0., 1.);
    vec3 reflectance_term = reflectedColor.xyz * fresnel;
    finalAlpha += clamp(fresnel, 0., 1.);
        #endif

        #if defined(SPECULAR_COLOR)
    finalAlpha += clamp(dot(totalSpecular, vec3(.3333)), 0., 1.);
        #endif
    finalAlpha *= totalOpacityValue;

    if(renderModeNormals == 1) {
        normal_VS.xyz = .5 * normal_VS.xyz + .5;
        gl_FragColor = vec4(normal_VS.xyz, 1.);
    } else {
        vec3 finalColor = totalDiffuse;
        #if defined(REFLECTIONS)
        finalColor += reflectance_term;
        #endif

        #if defined(SPECULAR_COLOR)
        finalColor += totalSpecular;
        #endif

        #ifdef PARALLAX_MAPPING
        finalColor *= fragColorMult;
        #endif

        #ifdef EMISSIVE_COLOR
            #ifdef EMISSIVE_TEXTURE
        finalColor = emissiveIntensity * emissiveTex.xyz * emissiveColor + finalColor;
            #else
        finalColor = emissiveIntensity * emissiveColor + finalColor;
            #endif
        #endif

        #ifdef GAMMA_OUTPUT
        finalColor = gamma(finalColor);
        #endif
        gl_FragColor = vec4(finalColor, finalAlpha);

        #if defined(USE_FOG)
            #ifdef USE_LOGDEPTHBUF_EXT
        float depth = gl_FragDepthEXT / gl_FragCoord.w;
            #else
        float depth = gl_FragCoord.z / gl_FragCoord.w;
            #endif

            #ifdef FOG_EXP2
        const float LOG2 = 1.442695;
        float fogFactor = exp2(-fogDensity * fogDensity * depth * depth * LOG2);
        fogFactor = 1. - clamp(fogFactor, 0., 1.);
            #else
        float fogFactor = smoothstep(fogNear, fogFar, depth);
            #endif
        gl_FragColor = mix(gl_FragColor, vec4(fogColor, gl_FragColor.w), fogFactor);
        #endif

        #ifdef LOG_LUV
        gl_FragColor = LogLuvEncode(gl_FragColor.xyz);
        #endif
    }
    #endif
}