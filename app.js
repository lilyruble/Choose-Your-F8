let scene, camera, renderer, ball;
const input = document.getElementById('destiny-input');
const fateOutput = document.getElementById('fate-output');
const dareOutput = document.getElementById('dare-output');
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === ''
    ? 'http://localhost:8080'
    : 'https://lucky8-fate-api-588925072046.us-central1.run.app';;
const placeholderPrompts = [
    'Should I send that risky text?',
    'Should I sign up for that marathon?',
    'Should I start the business today?'
];
let placeholderIndex = 0;
const FALLBACK_THEME_COLOR = '#FBC02D';

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Chrome Sphere with Iridescence
    const geometry = new THREE.SphereGeometry(2, 64, 64);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0x111111,
        metalness: 1,
        roughness: 0.1,
        clearcoat: 1,
        iridescence: 1,
        iridescenceIOR: 1.5,
    });
    ball = new THREE.Mesh(geometry, material);
    scene.add(ball);

    const light = new THREE.PointLight(0x4444ff, 2, 50);
    light.position.set(5, 5, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    camera.position.z = 5;
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// Mouse movement interaction
// window.addEventListener('mousemove', (e) => {
//     const x = (e.clientX / window.innerWidth - 0.5) * 0.5;
//     const y = (e.clientY / window.innerHeight - 0.5) * 0.5;
//     gsap.to(ball.rotation, { y: x * 3, x: y * 3, duration: 0.8 });
// });

// Input handling
input.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
        const question = input.value;
        input.value = '';
        // shakeBall();
        getFate(question);
    }
});

function startPlaceholderRotation() {
    if (!input) return;

    setInterval(() => {
        if (document.activeElement === input || input.value.trim()) return;
        placeholderIndex = (placeholderIndex + 1) % placeholderPrompts.length;
        input.placeholder = placeholderPrompts[placeholderIndex];
    }, 2800);
}

function applyMysticGlow(newColor) {
    const root = document.documentElement;
    root.style.setProperty('--theme-glow-color', newColor || FALLBACK_THEME_COLOR);
}

function inferThemeColorFromQuestion(question) {
    const q = question.toLowerCase();
    if (/(love|date|relationship|romance|partner|ex|crush)/.test(q)) return '#880E4F';
    if (/(career|job|work|promotion|business|interview|salary|startup)/.test(q)) return '#1565C0';
    if (/(personal|habit|confidence|fear|family|friend|boundary|no)/.test(q)) return '#2E7D32';
    if (/(health|fitness|marathon|workout|sleep|diet|wellness|vitality)/.test(q)) return '#7B1FA2';
    return FALLBACK_THEME_COLOR;
}

function parseFatePayload(data, question) {
    if (data && typeof data === 'object' && data.fate && data.dare) {
        return {
            fate: String(data.fate).trim(),
            dare: String(data.dare).trim(),
            themeColor: data.themeColor || inferThemeColorFromQuestion(question)
        };
    }

    const rawText = (data && data.text) ? String(data.text).trim() : '';

    if (!rawText) {
        return {
            fate: 'Signals are unclear.',
            dare: 'Take one brave step now.',
            themeColor: inferThemeColorFromQuestion(question)
        };
    }

    try {
        const parsed = JSON.parse(rawText);
        if (parsed && parsed.fate && parsed.dare) {
            return {
                fate: String(parsed.fate).trim(),
                dare: String(parsed.dare).trim(),
                themeColor: parsed.themeColor || inferThemeColorFromQuestion(question)
            };
        }
    } catch (err) {
        // Fallback to tagged text parsing.
    }

    const [fatePart, darePart] = rawText.split('[DARE]:');
    const fate = fatePart.replace('[FATE]:', '').trim();
    const dare = darePart ? darePart.trim() : 'Trust your instinct.';
    return {
        fate: fate || 'Signals are unclear.',
        dare,
        themeColor: inferThemeColorFromQuestion(question)
    };
}

// function shakeBall() {
//     gsap.to(ball.position, { x: 0.1, yoyo: true, repeat: 10, duration: 0.05 });
//     gsap.to([fateOutput, dareOutput], { opacity: 0, duration: 0.3 });
// }

async function getFate(question) {
    const SYSTEM_PROMPT = `You are "Lucky 8 Fate," a digital Oracle for risk-takers.
Return JSON only in this exact shape:
{"category":"...","fate":"...","dare":"...","themeColor":"#RRGGBB"}

Rules:
1) If malicious/illegal: category="The Unknown", fate="The path is dark.", dare="This is a mistake. Turn away.", themeColor="#FBC02D".
2) Category + fear focus + tone mapping:
- Physical Vitality | Physical limits / starting routines | Grounding & Primal | themeColor="#7B1FA2"
- Intellectual Curiosity | Imposter syndrome / learning | Crisp & Expanding | themeColor="#1565C0"
- Radical Candor | Boundaries / saying 'No' | Sharp & Courageous | themeColor="#880E4F"
- Digital Detox | FOMO / being offline | Zen & Minimalist | themeColor="#2E7D32"
3) If question does not clearly fit a category: use category="The Unknown", make fate especially cryptic, and dare a random act of courage. themeColor="#FBC02D".
4) If user asks passive "Will I..." question, gently reframe fate toward user agency.
5) fate must be 3-8 words; dare must be one specific low-stakes micro-challenge.
6) Keep total response concise and action-oriented.`;

    try {
        const response = await fetch(`${API_BASE_URL}/fate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: `${SYSTEM_PROMPT}\nUser Question: ${question}`
            })
        });

        if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`);
        }

        const data = await response.json();
        const payload = parseFatePayload(data, question);
        applyMysticGlow(payload.themeColor);
        fateOutput.innerText = payload.fate;
        dareOutput.innerText = `DARE: ${payload.dare}`;

        gsap.to([fateOutput, dareOutput], { opacity: 1, duration: 1, delay: 0.5 });

    } catch (err) {
        applyMysticGlow(FALLBACK_THEME_COLOR);
        fateOutput.innerText = "THE ORACLE IS RESTING.";
        dareOutput.innerText = "Come back tomorrow.";
        gsap.to([fateOutput, dareOutput], { opacity: 1, duration: 1 });
    }
}

// init();
startPlaceholderRotation();