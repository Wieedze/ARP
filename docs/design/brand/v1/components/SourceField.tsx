/**
 * SourceField — the ARP landing hero field.
 *
 * The Source mark carried outward: a Saffron core, then `rings` concentric rings.
 * Ring k holds 6k dots (the mark's rule). The gap between rings shrinks from the
 * centre to the rim by `ratio`, dot size falls off smoothly, and each ring turns at
 * its own speed, alternating direction. A stake sends one wave out from the core.
 *
 * Values frozen from the design session: rings 22 · ratio 8 · first 0.52 · wave 0.20 · every 10 s.
 *
 * Dependencies: three, @react-three/fiber (v9 for React 19). Lazy-load the route or the
 * component so the landing's first paint does not wait on three.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const PAPER = "#E6E8E6";
const GREY = "#5A5F64";
const SAFFRON = "#FFB020";

export type SourceFieldProps = {
    /** Number of rings around the core. */
    rings?: number;
    /** Gap next to the core divided by the gap at the rim. 1 = even spacing. */
    ratio?: number;
    /** Radius of the first ring, in field units (the rim sits at 3.6). */
    first?: number;
    /** Thickness of the stake wave, in field units. */
    waveWidth?: number;
    /** Seconds between automatic waves. 0 disables them. */
    waveEvery?: number;
    /** Change this value to send a wave, e.g. after a confirmed stake. */
    waveKey?: number;
    /** Fired on every wave, automatic or not. */
    onWave?: () => void;
    /** Where the field sits in the frame. Defaults to the desktop hero (right of the copy). */
    offset?: [number, number];
    scale?: number;
    className?: string;
};

const RIM = 3.6;

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aTier;
  attribute float aSeed;
  uniform float uTime;
  uniform float uWaveT;
  uniform float uWaveW;
  uniform float uPix;
  uniform float uScale;
  varying float vTier;
  varying float vWave;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float r = length(wp.xyz - origin) / max(uScale, 0.001);
    float since = uTime - uWaveT;
    float front = since * 2.4;
    float w = exp(-pow((r - front) / uWaveW, 2.0)) * step(0.0, since) * clamp(1.0 - since / 2.6, 0.0, 1.0);
    vec4 mv = viewMatrix * wp;
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.9 + 0.1 * sin(uTime * 1.1 + aSeed * 6.283);
    gl_PointSize = aSize * uPix * twinkle * (1.0 + w * 0.8) * (6.0 / -mv.z);
    vTier = aTier;
    vWave = w;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uPaper;
  uniform vec3 uGrey;
  uniform vec3 uAcc;
  varying float vTier;
  varying float vWave;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float edge = smoothstep(0.5, 0.42, d);
    vec3 base = mix(uPaper, uGrey, smoothstep(0.55, 1.0, vTier));
    vec3 col = mix(base, uAcc, clamp(vWave * 1.4, 0.0, 1.0));
    float alpha = edge * mix(1.0, 0.4, vTier) + vWave * 0.4;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

type Ring = { geometry: THREE.BufferGeometry; speed: number };

function buildRings(count: number, ratio: number, first: number): Ring[] {
    const out: Ring[] = [];
    for (let k = 1; k <= count; k++) {
        const u = count > 1 ? (k - 1) / (count - 1) : 0;
        // Gap shrinks linearly from `ratio` at the core to 1 at the rim, normalised so f(1) = 1.
        const f = (ratio * u - ((ratio - 1) * u * u) / 2) / ((ratio + 1) / 2);
        const radius = first + (RIM - first) * f;
        const n = 6 * k;
        const fall = Math.pow(1 - u, 1.1);
        const size = 2 + 10.5 * fall;
        const pos = new Float32Array(n * 3);
        const sizes = new Float32Array(n).fill(size);
        const tiers = new Float32Array(n).fill(u);
        const seeds = new Float32Array(n);
        for (let j = 0; j < n; j++) {
            const a = (2 * Math.PI * j) / n - Math.PI / 2;
            pos[j * 3] = radius * Math.cos(a);
            pos[j * 3 + 1] = radius * Math.sin(a);
            seeds[j] = (((Math.sin((k * 97 + j) * 78.233) * 43758.5453) % 1) + 1) % 1;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
        g.setAttribute("aTier", new THREE.BufferAttribute(tiers, 1));
        g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
        out.push({ geometry: g, speed: ((k % 2 ? 1 : -1) * 2 * Math.PI) / (36 + k * 9) });
    }
    return out;
}

function usePrefersReducedMotion(): boolean {
    const [reduce, setReduce] = useState(
        () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const on = () => setReduce(mq.matches);
        mq.addEventListener("change", on);
        return () => mq.removeEventListener("change", on);
    }, []);
    return reduce;
}

type FieldProps = Required<Pick<SourceFieldProps, "rings" | "ratio" | "first" | "waveWidth" | "waveEvery">> & {
    waveKey?: number;
    onWave?: () => void;
    offset: [number, number];
    scale: number;
    motion: boolean;
    clickWave: number;
};

function Field({ rings, ratio, first, waveWidth, waveEvery, waveKey, onWave, offset, scale, motion, clickWave }: FieldProps) {
    const ringData = useMemo(() => buildRings(rings, ratio, first), [rings, ratio, first]);
    useEffect(() => () => ringData.forEach((r) => r.geometry.dispose()), [ringData]);

    const material = useMemo(
        () =>
            new THREE.ShaderMaterial({
                transparent: true,
                depthWrite: false,
                vertexShader,
                fragmentShader,
                uniforms: {
                    uTime: { value: 0 },
                    uWaveT: { value: -10 },
                    uWaveW: { value: waveWidth },
                    uPix: { value: 1 },
                    uScale: { value: scale },
                    uPaper: { value: new THREE.Color(PAPER) },
                    uGrey: { value: new THREE.Color(GREY) },
                    uAcc: { value: new THREE.Color(SAFFRON) },
                },
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );
    useEffect(() => () => material.dispose(), [material]);
    useEffect(() => {
        material.uniforms.uWaveW.value = waveWidth;
        material.uniforms.uScale.value = scale;
    }, [material, waveWidth, scale]);

    const groups = useRef<(THREE.Group | null)[]>([]);
    const clock = useRef(0);
    const nextAuto = useRef(1.2);

    const fire = () => {
        material.uniforms.uWaveT.value = clock.current;
        onWave?.();
    };
    // External trigger (a confirmed stake) and clicks on the canvas.
    useEffect(() => {
        if (waveKey !== undefined) fire();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waveKey]);
    useEffect(() => {
        if (clickWave > 0) fire();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clickWave]);

    useFrame((state, delta) => {
        const dt = Math.min(0.05, delta);
        material.uniforms.uPix.value = state.gl.getPixelRatio();
        if (motion) {
            clock.current += dt;
            ringData.forEach((r, i) => {
                const g = groups.current[i];
                if (g) g.rotation.z += r.speed * dt;
            });
            if (waveEvery > 0 && clock.current > nextAuto.current) {
                fire();
                nextAuto.current = clock.current + waveEvery;
            }
        }
        material.uniforms.uTime.value = clock.current;
    });

    return (
        <group position={[offset[0], offset[1], 0]} rotation={[-0.35, 0, 0]} scale={scale}>
            <mesh>
                <circleGeometry args={[0.1, 48]} />
                <meshBasicMaterial color={SAFFRON} />
            </mesh>
            {ringData.map((r, i) => (
                <group
                    key={`${rings}-${ratio}-${first}-${i}`}
                    ref={(el) => {
                        groups.current[i] = el;
                    }}
                >
                    <points geometry={r.geometry} material={material} />
                </group>
            ))}
        </group>
    );
}

export function SourceField({
    rings = 22,
    ratio = 8,
    first = 0.52,
    waveWidth = 0.2,
    waveEvery = 10,
    waveKey,
    onWave,
    offset = [1.6, 0],
    scale = 0.84,
    className,
}: SourceFieldProps) {
    const reduce = usePrefersReducedMotion();
    const [clickWave, setClickWave] = useState(0);
    return (
        <div className={className} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
            <Canvas
                dpr={[1, 2]}
                gl={{ antialias: true, alpha: true }}
                camera={{ position: [0, 0, 9], fov: 38, near: 0.1, far: 100 }}
                onPointerDown={() => setClickWave((n) => n + 1)}
                style={{ cursor: "pointer" }}
            >
                <Field
                    rings={rings}
                    ratio={ratio}
                    first={first}
                    waveWidth={waveWidth}
                    waveEvery={reduce ? 0 : waveEvery}
                    waveKey={waveKey}
                    onWave={onWave}
                    offset={offset}
                    scale={scale}
                    motion={!reduce}
                    clickWave={clickWave}
                />
            </Canvas>
        </div>
    );
}

export default SourceField;
