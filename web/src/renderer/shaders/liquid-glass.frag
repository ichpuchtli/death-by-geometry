precision highp float;

// Liquid Glass — refractive/translucent material passes over a rendered scene, inspired by
// Apple's "Liquid Glass" aesthetic: the background is bent + magnified through the material,
// light disperses into a chromatic edge, and a specular highlight + fresnel rim give it the
// wet, gel-like depth. Up to 9 circular "lenses" are composited in one pass; each picks a
// variant param-set so the Glass Lab can show them side by side.

varying vec2 v_texCoord;

uniform sampler2D u_scene;
uniform float u_aspect;      // width / height (so a UV circle stays round)
uniform float u_time;
uniform int   u_count;
uniform vec2  u_center[9];   // lens centers in UV
uniform float u_radius[9];   // lens radii in y-normalized units
uniform float u_variant[9];  // variant id per lens (0..7)
uniform vec2  u_light;        // 2D light direction

// Live tuning multipliers (Glass Lab knobs; all default 1.0) applied on top of the
// per-variant param sets so a chosen look can be dialed in before porting.
uniform float u_tMag;
uniform float u_tRef;
uniform float u_tChr;
uniform float u_tSpec;
uniform float u_tRim;
uniform float u_tFrost;

vec3 sampleBlur(vec2 uv, float amt) {
  vec3 s = texture2D(u_scene, uv).rgb * 0.36;
  s += texture2D(u_scene, uv + vec2(amt, 0.0)).rgb * 0.16;
  s += texture2D(u_scene, uv - vec2(amt, 0.0)).rgb * 0.16;
  s += texture2D(u_scene, uv + vec2(0.0, amt)).rgb * 0.16;
  s += texture2D(u_scene, uv - vec2(0.0, amt)).rgb * 0.16;
  return s;
}

void main() {
  vec2 uv = v_texCoord;
  vec3 col = texture2D(u_scene, uv).rgb;

  for (int i = 0; i < 9; i++) {
    if (i >= u_count) break;
    vec2 c = u_center[i];
    float R = u_radius[i];
    vec2 p = uv - c;
    p.x *= u_aspect;                 // aspect-correct → circular
    float dist = length(p);
    float nr = dist / R;             // 0 center → 1 edge
    if (nr > 1.0) continue;
    vec2 dir = dist > 1e-4 ? p / dist : vec2(0.0);
    vec2 dirUV = vec2(dir.x / u_aspect, dir.y); // back to uv space

    float v = u_variant[i];

    // --- variant parameter sets ---
    float magnify = 0.35;   // convex(+)/concave(-) magnification of the center
    float refract = 0.06;   // edge refraction offset (× R)
    float edgeBias = 2.5;   // how rim-concentrated the refraction is
    float chroma = 0.5;     // chromatic dispersion (× refraction)
    float frost = 0.0;      // frost blur radius (uv)
    float specGain = 0.7;   // specular highlight strength
    float shininess = 30.0;
    float rimGain = 0.5;    // fresnel rim brightness
    float tintAmt = 0.06;   // translucent tint mix
    vec3  tint = vec3(0.6, 0.8, 1.0);

    if (v < 0.5) {            // 0 · Clear lens (pure optics)
      magnify = 0.5; refract = 0.05; chroma = 0.2; specGain = 0.25; rimGain = 0.3; tintAmt = 0.03;
    } else if (v < 1.5) {     // 1 · Liquid droplet (the signature)
      magnify = 0.4; refract = 0.09; chroma = 0.9; specGain = 1.0; shininess = 40.0; rimGain = 0.85; tintAmt = 0.05;
    } else if (v < 2.5) {     // 2 · Frosted
      frost = 0.018; magnify = 0.15; refract = 0.03; specGain = 0.3; rimGain = 0.4; tintAmt = 0.2;
    } else if (v < 3.5) {     // 3 · Chromatic edge (Apple colored rim)
      magnify = 0.12; refract = 0.05; edgeBias = 4.0; chroma = 1.8; specGain = 0.3; rimGain = 0.6; tintAmt = 0.03;
    } else if (v < 4.5) {     // 4 · Concave (pinch)
      magnify = -0.55; refract = 0.05; chroma = 0.4; specGain = 0.4; rimGain = 0.5; tintAmt = 0.05;
    } else if (v < 5.5) {     // 5 · Gel gloss (wet plastic)
      magnify = 0.25; refract = 0.04; chroma = 0.3; specGain = 1.5; shininess = 10.0; rimGain = 0.6; tintAmt = 0.1; tint = vec3(0.85, 0.92, 1.0);
    } else if (v < 6.5) {     // 6 · Bubble (thin shell)
      magnify = 0.08; refract = 0.06; edgeBias = 5.0; chroma = 1.4; specGain = 1.2; shininess = 60.0; rimGain = 1.0; tintAmt = 0.02;
    } else {                  // 7 · Deep magnify (thick convex)
      magnify = 0.8; refract = 0.05; chroma = 0.5; specGain = 0.6; rimGain = 0.5; tintAmt = 0.05;
    }

    // Live tuning multipliers (all 1.0 by default).
    magnify *= u_tMag; refract *= u_tRef; chroma *= u_tChr;
    specGain *= u_tSpec; rimGain *= u_tRim; frost *= u_tFrost;

    // Refraction: convex/concave magnify pulls the sampled uv toward the center, and an
    // edge-concentrated push along the surface normal bends the rim.
    float lens = 1.0 - nr * nr;                  // 1 center → 0 edge
    vec2 base = c + (uv - c) * (1.0 - magnify * lens);
    float edgeOff = refract * pow(nr, edgeBias);
    vec2 sUV = base + dirUV * edgeOff;

    vec3 g;
    if (frost > 0.0) {
      g = sampleBlur(sUV, frost);
    } else {
      vec2 cd = dirUV * (edgeOff * chroma);      // chromatic split along the bend
      g.r = texture2D(u_scene, sUV + cd).r;
      g.g = texture2D(u_scene, sUV).g;
      g.b = texture2D(u_scene, sUV - cd).b;
    }

    // Translucent tint.
    g = mix(g, g * tint + tint * 0.04, tintAmt);

    // Spherical-cap normal → specular highlight + fresnel rim.
    float h = sqrt(max(0.0, 1.0 - nr * nr));
    vec3 N = normalize(vec3(dir * nr, h));
    vec3 L = normalize(vec3(u_light, 0.85));
    float spec = pow(max(0.0, dot(N, L)), shininess) * specGain;
    float rim = pow(nr, 3.0) * rimGain;
    g += spec + rim * vec3(0.8, 0.9, 1.0);

    float edge = smoothstep(1.0, 0.92, nr);       // antialiased boundary
    col = mix(col, g, edge);
  }

  gl_FragColor = vec4(col, 1.0);
}
