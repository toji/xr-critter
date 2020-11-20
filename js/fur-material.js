import  * as THREE from "./third-party/three.js/build/three.module.js";

const FUR_SHELLS = 16;
const FUR_LENGTH = 0.05;
const GRAVITY = new THREE.Vector3(0, -1, 0);

const offsets = [];
for (let i = 1; i <= FUR_SHELLS; ++i) {
  offsets.push(i/FUR_SHELLS);
}
const OFFSET_ATTRIB = new THREE.InstancedBufferAttribute(new Float32Array(offsets), 1);

// Replace with a pre-generated texture
let FUR_TEXTURE = null;
function getFurTexture() {
  if (FUR_TEXTURE) { return FUR_TEXTURE; }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d', { alpha: true });

  for (let i = 0; i < 15000; ++i) {
    // r = hair 1/0
    // g = length
    // b = darkness
    ctx.fillStyle = "rgba(255," + Math.floor(Math.random() * 255) + ","+ Math.floor(Math.random() * 255) +",1)";

    ctx.fillRect((Math.random() * canvas.width), (Math.random() * canvas.height), Math.random() * 2, Math.random() * 2);
  }

  FUR_TEXTURE = new THREE.CanvasTexture(canvas, THREE.UVMapping, THREE.RepeatWrapping, THREE.RepeatWrapping);
  return FUR_TEXTURE;
}

export class FurMaterial extends THREE.MeshLambertMaterial {
  constructor(options) {
    super(options);

    const uniforms = {
      hairMap: { value: getFurTexture() },
      gravity: { value: GRAVITY },
      colliders: { value: options.colliders },
    };

    const colliderCount = options.colliders.length;

    this.onBeforeCompile = (shader, renderer) => {
      for (const uniformName of Object.keys(uniforms)) {
        shader.uniforms[uniformName] = uniforms[uniformName];
      }

      // Fur shader inspired by http://oos.moxiecode.com/js_webgl/fur/
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',`
          #include <common>
          attribute float instanceOffset;
          varying float vOffset;

          uniform vec3 gravity;
          uniform vec4 colliders[${colliderCount}];
        `)
        .replace('#include <skinning_vertex>', `
          #include <skinning_vertex>
          vec3 displacement = vec3(0.0,0.0,0.0);
          vec3 forceDirection = vec3(0.0,0.0,0.0);

          // "gravity"
          displacement = gravity + forceDirection;

          float displacementFactor = pow(instanceOffset, 1.0);

          vec3 furNormal = normal;
          furNormal += displacement*displacementFactor;

          transformed += normalize(furNormal) * instanceOffset * ${FUR_LENGTH};

          for (int i = 0; i < ${colliderCount}; ++i) {
            vec3 posToCollider = (modelMatrix * vec4(transformed, 1)).xyz - colliders[i].xyz;
            float dist = length(posToCollider);
            if (dist < colliders[i].w) {
              transformed += normalize(posToCollider) * colliders[i].w;
            }
          }

          vOffset = instanceOffset;
        `);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `
          #include <common>
          varying float vOffset;
          uniform sampler2D hairMap;
        `)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
          vec4 hairColor = texture2D(hairMap, vUv*10.0);
          // discard no hairs + above the max length
          if (hairColor.a <= 0.0 || hairColor.g < vOffset) {
            discard;
          }
          float furShadow = mix(0.5,hairColor.b*1.2,vOffset);
          vec4 diffuseColor = vec4( diffuse * furShadow, opacity );
        `);
    };
  }

  createMesh(geometry) {
    const instancedGeometry = new THREE.InstancedBufferGeometry();

    // Copy over the geometry's attributes
    Object.keys(geometry.attributes).forEach(attributeName=>{
      instancedGeometry.attributes[attributeName] = geometry.attributes[attributeName];
    })
    instancedGeometry.index = geometry.index;

    instancedGeometry.setAttribute('instanceOffset', OFFSET_ATTRIB);

    instancedGeometry.instancedCount = FUR_SHELLS;
    return new THREE.Mesh(instancedGeometry, this);
  }
}
