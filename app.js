let scene, camera, renderer, ball;
const input = document.getElementById('destiny-input');
const fateOutput = document.getElementById('fate-output');
const dareOutput = document.getElementById('dare-output');
const API_BASE_URL = 'https://lucky8-fate-api-588925072046.us-central1.run.app';

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
window.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 0.5;
    const y = (e.clientY / window.innerHeight - 0.5) * 0.5;
    gsap.to(ball.rotation, { y: x * 3, x: y * 3, duration: 0.8 });
});

// Input handling
input.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
        const question = input.value;
        input.value = '';
        shakeBall();
        getFate(question);
    }
});

function shakeBall() {
    gsap.to(ball.position, { x: 0.1, yoyo: true, repeat: 10, duration: 0.05 });
    gsap.to([fateOutput, dareOutput], { opacity: 0, duration: 0.3 });
}

async function getFate(question) {
    const SYSTEM_PROMPT = `You are "Lucky 8 Fate," a digital Oracle for risk-takers. Edgy, wise, action-oriented. 
    1. If malicious/illegal: [FATE]: The path is dark. [DARE]: This is a mistake. Turn away.
    2. Otherwise: [FATE]: 3-5 word cryptic fortune. [DARE]: One specific low-stakes micro-challenge.
    3. 10% chance: Give a "Rejection Dare" (e.g. ask for a discount).
    MAX 40 WORDS TOTAL. Tone: Vibe-coded.`;

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
        const text = data.text;

        const [fatePart, darePart] = text.split('[DARE]:');

        fateOutput.innerText = fatePart.replace('[FATE]:', '').trim();
        dareOutput.innerText = darePart ? `DARE: ${darePart.trim()}` : 'DARE: Trust your instinct.';

        gsap.to([fateOutput, dareOutput], { opacity: 1, duration: 1, delay: 0.5 });

    } catch (err) {
        fateOutput.innerText = "THE ORACLE IS RESTING.";
        dareOutput.innerText = "Come back tomorrow.";
        gsap.to([fateOutput, dareOutput], { opacity: 1, duration: 1 });
    }
}

init();