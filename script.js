let scene, camera, renderer, ball;
const input = document.getElementById('question-input');
const windowEl = document.getElementById('oracle-window');

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Chrome Sphere
    const geometry = new THREE.SphereGeometry(2, 64, 64);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 1,
        roughness: 0.05,
        envMapIntensity: 1
    });
    ball = new THREE.Mesh(geometry, material);
    scene.add(ball);

    // Lights
    const light = new THREE.PointLight(0x00f2ff, 2, 10);
    light.position.set(5, 5, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040, 2));

    camera.position.z = 5;
    animate();
}

// Mouse Follow Logic
window.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 0.5;
    const y = (e.clientY / window.innerHeight - 0.5) * 0.5;
    gsap.to(ball.rotation, { y: x * 2, x: y * 2, duration: 0.5 });
});

// The Shake & Ask
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && input.value.length > 3) {
        shakeBall();
        fetchOracleResponse(input.value);
    }
});

function shakeBall() {
    gsap.to(ball.position, { x: 0.1, yoyo: true, repeat: 10, duration: 0.05 });
    gsap.to(windowEl, { opacity: 0, duration: 0.2 });
}

async function fetchOracleResponse(question) {
    // Replace with your Vercel/Cloudflare worker URL to hide API Key
    const PROXY_URL = 'YOUR_WORKER_URL';

    // For now, simulated response:
    setTimeout(() => {
        document.getElementById('fate-text').innerText = "THE VOID SPEAKS YES";
        document.getElementById('dare-text').innerText = "DARE: Text your last missed call 'I'm in.' No context.";
        gsap.to(windowEl, { opacity: 1, duration: 1 });
    }, 1000);
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

init();