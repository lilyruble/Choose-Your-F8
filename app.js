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

// Exposed so the focus handler can re-sync after iOS keyboard animation settles
let syncKeyboard = null;

function setupMobileKeyboardSpacing() {
    if (!window.visualViewport) return;
    const form = document.getElementById('fate-form');

    syncKeyboard = () => {
        if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
        const keyboardHeight = window.innerHeight - window.visualViewport.height;
        const isKeyboardOpen = keyboardHeight > 120;
        document.body.classList.toggle('keyboard-open', isKeyboardOpen);
        document.documentElement.style.setProperty('--keyboard-offset', isKeyboardOpen ? `${Math.min(keyboardHeight, 420)}px` : '0px');
        // Inline bottom overrides CSS so the form pins just above the keyboard edge
        if (form) form.style.bottom = isKeyboardOpen ? `${keyboardHeight + 12}px` : '';
    };

    window.visualViewport.addEventListener('resize', syncKeyboard);
    window.visualViewport.addEventListener('scroll', syncKeyboard);
    syncKeyboard();
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
    // Romance checked first — "ask out", "text them", "dm" etc. must not fall into career
    if (/(ask.*out|text.*him|text.*her|dm.*them|ask.*on a date|love|date|relationship|romance|partner|ex|crush|social|friend|feelings for)/.test(q)) return '#EA4335';
    if (/(career|job|work|promotion|business|interview|salary|startup)/.test(q)) return '#4285F4';
    if (/(create|creative|innovation|build|art|idea|learn|study|design)/.test(q)) return '#FBBC04';
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
    const SYSTEM_PROMPT = `You are "Lucky 8 Fate," a digital Oracle for bold risk-takers.
Return JSON only in this exact shape:
{"category":"...","omen":"...","dare":"...","themeColor":"#RRGGBB"}

Spirit — these omens are a creative pool. You are NOT required to quote them verbatim. Echo their energy, remix their words, or let them inspire the tone of your omen. Match the weight of the omen to the stakes of the question: a mundane ask ("should I go to the gym") earns a gentle nudge; a high-stakes leap earns something heavy and inevitable. Never force a dramatic omen onto a small ask.

Low stakes / gentle nudges:
- You never know if you don't try
- One step is all it takes
- Begin and the rest follows
- Motion beats hesitation
- Show up and see what happens
- Even a small spark lights a room
- Curiosity never loses
- The attempt is the answer
- Try it once, decide later
- Every start was once a first step
- The door is already open
- Small moves, big shifts
- Progress lives in the attempt
- Just go. See what happens.
- The answer is already in you

Medium stakes / momentum:
- Action creates opportunity
- Trust your intuition
- If you never ask, the answer will always be no
- You miss 100% of the shots you don't take
- Take the risk or lose the chance
- We only regret the chances we don't take
- Step out in the face of uncertainty
- What's the best that could happen?
- Move first, overthink later
- The path reveals itself to those who walk it
- Leap and the net appears
- Doors open for those who knock
- Momentum is its own reward
- Hesitation is the thief of possibility
- Readiness is a myth — go anyway
- If not now, then when?
- Your instinct knows before your mind does
- Courage is contagious — start it
- The world bends toward the decisive
- Initiative is its own advantage
- Done is better than perfect
- Imperfect action beats perfect inaction
- Start before you're ready
- Clarity comes from doing, not thinking
- Regret is more expensive than risk
- Every great story started with a yes
- Your fear is just excitement without direction
- Overthinking is procrastination in disguise
- The risk you avoid is the life you forfeit
- Patience is not the same as waiting
- You already know. You just haven't moved yet.
- The window is open — climb through it
- Indecision is still a decision
- The bolder the move, the clearer the path

High stakes / bold leaps:
- Fortune favors the brave
- Audacity gets you far
- The bigger the risk, the bigger the reward
- The more risk you take, the luckier you get
- Act boldly and unseen forces will come to your aid
- Success is not a comfortable process
- Grow resilience to failure
- If you're too scared to do it, do it ironically
- Fortune is only found outside the comfort zone
- The timid never changed the world
- Greatness lives past the point of fear
- The universe rewards the audacious
- Bet on yourself — the odds are better than you think
- Every empire was built on a single bold move
- The safe path leads to a safe and forgettable life
- Burn the boats
- All in is the only way in
- Your biggest risk is never trying
- Discomfort is the tuition for growth
- Carve your own path — the map is wrong anyway
- Courage compounds
- History remembers the ones who dared
- Ships are safe in harbor but that's not what ships are for
- The world belongs to those who show up ready to lose
- Comfort is the enemy of growth
- You were not built to stay small
- The leap of faith has a landing — you just can't see it yet
- Scars are proof you were in the arena
- Most people talk. Few people do. Be few.
- The moment of maximum fear is the moment to move

Relationships / social:
- Love without armor
- The heart that risks everything gains everything
- Vulnerability is the beginning of connection
- Say the thing you're afraid to say
- You can't lose what was never guaranteed — so bet
- Show up fully and let them decide
- Rejection is just redirection
- Ask. The worst is a no you already have.
- Hearts open to those who arrive open
- The right person will never make you feel foolish for asking
- Silence is not safety — it's just a slower no

Personal growth:
- You already know what to do
- Identity follows action, not the reverse
- Fear is the compass — go that direction
- Growth is always uncomfortable until it isn't
- The obstacle is the path
- Every day you don't is a day you decide not to
- Your future self is watching — choose accordingly
- The hardest conversation is with the part of you that wants to stay small
- The version of you that hesitates is not the version you want to be
- Build the version of yourself you'd be proud of
- Stop asking for permission to become who you already are
- You are not the same person who was afraid last time
- Change is not a risk — staying the same is

Creative / innovation:
- Make the thing. Decide if it's good later.
- The idea that won't leave you alone is the one
- Build the thing no one asked for but everyone needed
- Art doesn't wait for permission
- Innovation begins where convention ends
- The weird idea is the right idea
- If it excites and terrifies you in equal measure, make it
- Originality is just persistence in a world of copies
- The world needs your strange vision
- Create first, criticize never

Business / career:
- The deal doesn't close itself
- Execution is the only currency that matters
- No one gets discovered sitting still
- Your next opportunity is one conversation away
- Ambition without action is just daydreaming
- The meeting you're afraid to request is the one that changes everything
- Market your value or let someone else define it
- The raise you don't ask for you definitely won't get
- Your competition is already making the move you're delaying
- Timing the market is less important than being in it
- First mover advantage is real — move
- The pitch that doesn't go out never gets a yes
- Build it and go find them

Rules:
1) If malicious/illegal: category="Unknown", omen="The path is dark.", dare="This is a mistake. Turn away.", themeColor="#4285F4".
2) Category mapping:
- Career => themeColor="#4285F4"
- Innovation/Creativity => themeColor="#FBBC04"
- Social/Romance => themeColor="#EA4335"
- Personal Growth => themeColor="#34A853"
- Any question about asking someone out, texting a crush, pursuing feelings, dating, or romantic interest of ANY kind: ALWAYS Social/Romance (#EA4335), regardless of the person's name or profession.
3) If user asks passive "Will I..." reframe omen toward agency and ownership.
4) omen: 8 words or fewer, cryptic, echoes the chosen Spirit omen in tone and weight — matched to the stakes of their question.
5) dare: directly name the specific thing they mentioned (the person, job, city, decision, fear). Give one concrete action they can do today — not generic advice, but a precise move tied to their exact situation.
6) Both omen and dare must feel inevitable, not optional.`;

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
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, 0)));
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
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, 0)));
    // iOS keyboard animation takes ~300ms; re-sync once it has fully settled
    setTimeout(() => syncKeyboard && syncKeyboard(), 350);
});

input.addEventListener('blur', () => {
    shakeHint.classList.remove('visible');
    setPromptOverlayVisibility();
});

applyMysticGlow(FALLBACK_THEME_COLOR);
setupMobileKeyboardSpacing();
initShakeTracking();
setPromptOverlayVisibility();

// Block all scroll gestures — touchmove covers mobile, wheel covers desktop trackpad/mouse.
// Non-passive so preventDefault() is honoured by the browser.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
// Snap back anything the browser may scroll programmatically (e.g. keyboard focus).
window.addEventListener('scroll', () => window.scrollTo(0, 0));