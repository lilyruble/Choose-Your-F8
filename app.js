const input = document.getElementById('destiny-input');
const fateOutput = document.getElementById('fate-output');
const dareOutput = document.getElementById('dare-output');
const form = document.getElementById('fate-form');
const promptOverlay = document.getElementById('prompt-overlay');
const shakeHint = document.getElementById('shake-hint');
const modelViewer = document.getElementById('magic-8-ball');
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === ''
    ? 'http://localhost:8080'
    : 'https://lucky8-fate-api-588925072046.us-central1.run.app';
/* Default ominous chrome-grey center; category colors override after first ask. */
const FALLBACK_THEME_COLOR = '#4a4d52';
let motionPermissionRequested = false;
let oracleRequestInFlight = false;

function setupMobileKeyboardSpacing() {
    if (!window.visualViewport) return;

    const syncKeyboardOffset = () => {
        const viewportDiff = window.innerHeight - window.visualViewport.height;
        const isKeyboardOpen = viewportDiff > 120;
        const keyboardOffset = isKeyboardOpen ? `${Math.min(viewportDiff * 0.5, 180)}px` : '0px';
        document.documentElement.style.setProperty('--keyboard-offset', keyboardOffset);
        document.body.classList.toggle('keyboard-open', isKeyboardOpen);
    };

    window.visualViewport.addEventListener('resize', syncKeyboardOffset);
    window.visualViewport.addEventListener('scroll', syncKeyboardOffset);
    syncKeyboardOffset();
}

function hexToRgbTriplet(hex) {
    if (!hex || typeof hex !== 'string') return '74, 77, 82';
    let h = hex.trim().replace('#', '');
    if (h.length === 3) {
        h = h.split('').map((c) => c + c).join('');
    }
    if (h.length !== 6) return '74, 77, 82';
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return '74, 77, 82';
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function applyMysticGlow(newColor) {
    const hex = newColor || FALLBACK_THEME_COLOR;
    const root = document.documentElement;
    root.style.setProperty('--theme-glow-color', hex);
    root.style.setProperty('--theme-glow-rgb', hexToRgbTriplet(hex));
}

function inferThemeColorFromQuestion(question) {
    const q = question.toLowerCase();
    if (/(career|job|work|promotion|business|interview|salary|startup)/.test(q)) return '#4285F4';
    if (/(create|creative|innovation|build|art|idea|learn|study|design)/.test(q)) return '#FBBC04';
    if (/(love|date|relationship|romance|partner|ex|crush|social|friend)/.test(q)) return '#EA4335';
    if (/(personal|habit|confidence|growth|fear|wellness|mindset)/.test(q)) return '#34A853';
    return FALLBACK_THEME_COLOR;
}

function parseFatePayload(data, question) {
    if (data && typeof data === 'object' && (data.omen || data.fate) && data.dare) {
        return {
            omen: String(data.omen || data.fate).trim(),
            dare: String(data.dare).trim(),
            category: String(data.category || 'Unknown').trim(),
            themeColor: data.themeColor || inferThemeColorFromQuestion(question)
        };
    }

    const rawText = (data && data.text) ? String(data.text).trim() : '';

    if (!rawText) {
        return {
            omen: 'Signals are unclear.',
            dare: 'Take one brave step now.',
            category: 'Unknown',
            themeColor: inferThemeColorFromQuestion(question)
        };
    }

    try {
        const parsed = JSON.parse(rawText);
        if (parsed && (parsed.omen || parsed.fate) && parsed.dare) {
            return {
                omen: String(parsed.omen || parsed.fate).trim(),
                dare: String(parsed.dare).trim(),
                category: String(parsed.category || 'Unknown').trim(),
                themeColor: parsed.themeColor || inferThemeColorFromQuestion(question)
            };
        }
    } catch (err) {
        // Fallback to tagged text parsing.
    }

    const [fatePart, darePart] = rawText.split('[DARE]:');
    const omen = fatePart.replace('[FATE]:', '').replace('[OMEN]:', '').trim();
    const dare = darePart ? darePart.trim() : 'Trust your instinct.';
    return {
        omen: omen || 'Signals are unclear.',
        dare,
        category: 'Unknown',
        themeColor: inferThemeColorFromQuestion(question)
    };
}

function setPromptOverlayVisibility() {
    if (!promptOverlay) return;
    const hasText = input.value.trim().length > 0;
    promptOverlay.style.opacity = hasText ? '0' : '1';
}

function triggerShakeAnimation() {
    if (!modelViewer) return;
    gsap.killTweensOf(modelViewer);
    gsap.fromTo(modelViewer, { x: -6 }, { x: 6, duration: 0.07, yoyo: true, repeat: 5, ease: 'power1.inOut' });
}

function maybeShowShakeHint() {
    const shouldShow = input.value.trim().length > 5 && document.activeElement === input;
    shakeHint.classList.toggle('visible', shouldShow);
}

function initShakeTracking() {
    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;
    const threshold = 15;

    window.addEventListener('devicemotion', (event) => {
        const acc = event.accelerationIncludingGravity;
        if (!acc || typeof acc.x !== 'number') return;

        const deltaX = Math.abs(lastX - acc.x);
        const deltaY = Math.abs(lastY - acc.y);
        const typedEnough = input.value.trim().length > 5;

        if ((deltaX + deltaY) > threshold && typedEnough) {
            triggerShakeAnimation();
            form.requestSubmit();
        }

        lastX = acc.x;
        lastY = acc.y;
        lastZ = acc.z;
    });
}

async function ensureMotionPermission() {
    if (motionPermissionRequested) return;
    motionPermissionRequested = true;

    const needsPermission = typeof DeviceMotionEvent !== 'undefined'
        && typeof DeviceMotionEvent.requestPermission === 'function';
    if (!needsPermission) return;

    try {
        await DeviceMotionEvent.requestPermission();
    } catch (err) {
        // Ignore permission denial.
    }
}

async function askTheOracle(question) {
    const SYSTEM_PROMPT = `You are "Lucky 8 Fate," a digital Oracle for risk-takers.
Return JSON only in this exact shape:
{"category":"...","omen":"...","dare":"...","themeColor":"#RRGGBB"}

Rules:
1) If malicious/illegal: category="Unknown", omen="The path is dark.", dare="This is a mistake. Turn away.", themeColor="#4285F4".
2) Category mapping:
- Career => themeColor="#4285F4"
- Innovation/Creativity => themeColor="#FBBC04"
- Social/Romance => themeColor="#EA4335"
- Personal Growth => themeColor="#34A853"
3) If user asks passive "Will I..." question, reframe omen toward agency.
4) omen must be cryptic and concise, dare must be a specific low-stakes action.
5) Keep response tight and action-oriented.`;

    try {
        gsap.to([fateOutput, dareOutput], { opacity: 0, duration: 0.2 });
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
        fateOutput.innerText = payload.omen;
        dareOutput.innerText = `DARE: ${payload.dare}`;

        gsap.to([fateOutput, dareOutput], { opacity: 1, duration: 1, delay: 0.5 });

    } catch (err) {
        applyMysticGlow(FALLBACK_THEME_COLOR);
        fateOutput.innerText = "THE ORACLE IS RESTING.";
        dareOutput.innerText = "Come back tomorrow.";
        gsap.to([fateOutput, dareOutput], { opacity: 1, duration: 1 });
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || oracleRequestInFlight) return;
    oracleRequestInFlight = true;
    shakeHint.classList.remove('visible');
    triggerShakeAnimation();
    try {
        await askTheOracle(question);
        input.value = '';
        setPromptOverlayVisibility();
    } finally {
        oracleRequestInFlight = false;
    }
});

/* Enter / Return submits the same as tapping "Ask" (iOS Return key with enterkeyhint="send"). */
input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const value = input.value.trim();
    if (!value) return;
    e.preventDefault();
    form.requestSubmit();
});

input.addEventListener('input', () => {
    setPromptOverlayVisibility();
    maybeShowShakeHint();
});

input.addEventListener('focus', async () => {
    await ensureMotionPermission();
    maybeShowShakeHint();
});

input.addEventListener('blur', () => {
    shakeHint.classList.remove('visible');
    setPromptOverlayVisibility();
});

applyMysticGlow(FALLBACK_THEME_COLOR);
setupMobileKeyboardSpacing();
initShakeTracking();
setPromptOverlayVisibility();

// Snap any accidental scroll back to origin — prevents Chrome/Safari
// from showing a scroll indicator when dynamic content causes a transient reflow.
window.addEventListener('scroll', () => window.scrollTo(0, 0), { passive: true });