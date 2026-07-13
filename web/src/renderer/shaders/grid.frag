precision mediump float;
varying float v_displacement;
varying float v_velocity;
varying float v_wellDepth;

uniform vec3 u_colorBase;
uniform vec3 u_colorStretch;
uniform vec3 u_colorCompress;
uniform float u_baseAlpha;

void main() {
    // Static baseline opacity (tunable). The velocity glow + well-depth boosts below add on
    // top, so the calm fabric stays subtle while the reactive parts (ripples, wells) still pop.
    float alpha = u_baseAlpha;

    // Color shift based on displacement
    float t = clamp(v_displacement / 40.0, 0.0, 1.0);
    vec3 color = mix(u_colorBase, u_colorStretch, t);

    // Velocity-based glow (shimmering on rebounds)
    float vGlow = clamp(v_velocity / 200.0, 0.0, 1.0);
    color += vec3(vGlow * 0.3);
    alpha += vGlow * 0.4;

    // Spacetime fabric effect: depth coloring + rim glow
    if (v_wellDepth > 0.01) {
        // Depth darkening — mix toward dark indigo
        vec3 depthColor = vec3(0.05, 0.02, 0.15);
        color = mix(color, depthColor, v_wellDepth * 0.7);

        // Rim glow — bright blue-white band at well edge
        float rimBand = smoothstep(0.0, 0.15, v_wellDepth) * (1.0 - smoothstep(0.15, 0.4, v_wellDepth));
        vec3 rimColor = vec3(0.3, 0.6, 1.0);
        color += rimColor * rimBand * 1.2;

        // Alpha boost — grid lines more visible in wells
        alpha += v_wellDepth * 0.3;
    }

    alpha = min(alpha, 1.0);
    gl_FragColor = vec4(color, alpha);
}
