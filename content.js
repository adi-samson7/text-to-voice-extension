let container = null;
let selectedText = "";
let utterance = null;
let playBtn, pauseBtn, stopBtn, speedBtn;
let isPaused = false;
const SPEEDS = [1, 1.25, 1.5, 2];
let speechRate = 1;      // synced with chrome.storage so the right-click menu shares it
chrome.storage.sync.get(['speechRate'], (r) => {
    if (SPEEDS.includes(r.speechRate)) speechRate = r.speechRate;
});
let charOffset = 0;      // approx. position in selectedText, used to resume on speed change
let activeVoice = null;
let leftTab = false;      // true if this tab was hidden while a reading was active

// --- NEW: Pre-warm voices in the background so they are ready on the first click ---
let allVoices = window.speechSynthesis.getVoices();
if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
        allVoices = window.speechSynthesis.getVoices();
    };
}
// ----------------------------------------------------------------------------------

document.addEventListener('mouseup', (e) => {
    if (container && container.contains(e.target)) return;

    setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text && text.length > 0) {
            chrome.storage.sync.get(['isEnabled'], (result) => {
                if (result.isEnabled !== false) {
                    selectedText = text;
                    showPlayButton(selection);
                }
            });
        }
    }, 10);
});

document.addEventListener('mousedown', (e) => {
    if (container && !container.contains(e.target)) {
        removeUI();
        speechSynthesis.cancel();
    }
});

function showPlayButton(selection) {
    removeUI(); 
    isPaused = false; 
    
    container = document.createElement('div');
    container.id = 'minimal-tts-ext-container';
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    container.style.top = `${window.scrollY + rect.bottom + 8}px`;
    container.style.left = `${window.scrollX + rect.left + (rect.width / 2) - 40}px`;
    
    playBtn = document.createElement('button');
    playBtn.innerHTML = '🔊 Read';
    playBtn.className = 'tts-btn';
    playBtn.onclick = startReading;
    
    pauseBtn = document.createElement('button');
    pauseBtn.innerHTML = '⏸';
    pauseBtn.className = 'tts-btn tts-ctrl';
    pauseBtn.style.display = 'none'; 
    pauseBtn.onclick = () => {
        if (isPaused) {
            if (leftTab || !speechSynthesis.speaking) {
                // Another tab used the shared speech engine meanwhile, so our
                // utterance is gone: start again from the last spoken word.
                leftTab = false;
                speechSynthesis.cancel();
                speakFrom(charOffset);
            } else {
                speechSynthesis.resume();
            }
            isPaused = false;
            pauseBtn.innerHTML = '⏸';
            playBtn.innerHTML = '🔊 Reading...'; 
        } else {
            speechSynthesis.pause();
            isPaused = true;
            pauseBtn.innerHTML = '▶';
            playBtn.innerHTML = '🔊 Paused...'; 
        }
    };
    
    stopBtn = document.createElement('button');
    stopBtn.innerHTML = '⏹';
    stopBtn.className = 'tts-btn tts-ctrl';
    stopBtn.style.display = 'none';
    stopBtn.onclick = () => {
        speechSynthesis.cancel();
        removeUI();
    };
    
    speedBtn = document.createElement('button');
    speedBtn.innerHTML = `${speechRate}x`;
    speedBtn.className = 'tts-btn tts-ctrl';
    speedBtn.style.display = 'none';
    speedBtn.onclick = toggleSpeed;

    container.appendChild(playBtn);
    container.appendChild(pauseBtn);
    container.appendChild(stopBtn);
    container.appendChild(speedBtn);
    document.body.appendChild(container);
}

function startReading() {
    if (!selectedText) return;
    leftTab = false;

    speechSynthesis.cancel();
    isPaused = false; 
    
    chrome.storage.sync.get(['selectedVoice'], (result) => {
        // Use the pre-loaded voices array instead of fetching on the fly
        const voices = allVoices.length > 0 ? allVoices : speechSynthesis.getVoices();
        const chosenVoice = result.selectedVoice ? voices.find(v => v.name === result.selectedVoice) : null;
        
        chrome.i18n.detectLanguage(selectedText, (langData) => {
            const detectedLangCode = langData.languages.length > 0 ? langData.languages[0].language : 'und';
            
            const wordCount = selectedText.trim().split(/\s+/).length;
            
            if (chosenVoice && detectedLangCode !== 'und' && wordCount > 3) {
                const voiceBaseLang = chosenVoice.lang.split('-')[0]; 
                const detectedBaseLang = detectedLangCode.split('-')[0];

                if (detectedBaseLang !== voiceBaseLang) {
                    playBtn.innerHTML = '⚠️ Invalid Language';
                    playBtn.style.cursor = 'default';
                    playBtn.onclick = null;
                    
                    setTimeout(removeUI, 2000);
                    
                    return; 
                }
            }

            activeVoice = chosenVoice;
            charOffset = 0;

            pauseBtn.style.display = 'flex';
            stopBtn.style.display = 'flex';
            speedBtn.style.display = 'flex';

            playBtn.innerHTML = '🔊 Reading...';
            playBtn.style.cursor = 'default';
            playBtn.onclick = null;

            speakFrom(0);
        });
    });
}

// Speaks selectedText starting at the given character offset, at the current rate.
function speakFrom(offset) {
    const u = new SpeechSynthesisUtterance(selectedText.slice(offset));
    if (activeVoice) u.voice = activeVoice;
    u.rate = speechRate;

    let gotBoundary = false;

    u.onboundary = (e) => {
        if (utterance !== u) return;
        gotBoundary = true;
        charOffset = offset + e.charIndex;
    };
    // Ignore end events from utterances we replaced (e.g. on speed change)
    u.onend = () => {
        if (utterance === u) removeUI();
    };
    // Some voices never fire word boundary events. If none arrive shortly after
    // speech starts, estimate the position from time.
    u.onstart = () => {
        if (utterance !== u) return;
        setTimeout(() => {
            if (utterance === u && !gotBoundary) startEstimator(u, offset, () => gotBoundary);
        }, 700);
    };

    clearEstimator();
    utterance = u;
    speechSynthesis.speak(u);
}

// Position tracking for voices without word events (e.g. Google network voices).
// Not shown to the user; it only decides where to restart from when changing speed or
// resuming after another tab took over the speech engine. Rough: ~20 chars/second at 1x.
const ESTIMATED_CPS = 20;

let estimatorTimer = null;
function startEstimator(u, offset, hasBoundary) {
    clearEstimator();
    let elapsedMs = 700; // we waited this long before starting
    estimatorTimer = setInterval(() => {
        if (utterance !== u || hasBoundary()) return clearEstimator();
        if (isPaused || !speechSynthesis.speaking) return;
        elapsedMs += 100;
        let idx = offset + Math.floor((elapsedMs / 1000) * ESTIMATED_CPS * speechRate);
        idx = Math.min(idx, selectedText.length - 1);
        while (idx > 0 && !/\s/.test(selectedText[idx - 1])) idx--; // snap to word start
        charOffset = idx;
    }, 100);
}
function clearEstimator() {
    if (estimatorTimer) {
        clearInterval(estimatorTimer);
        estimatorTimer = null;
    }
}

function toggleSpeed() {
    speechRate = SPEEDS[(SPEEDS.indexOf(speechRate) + 1) % SPEEDS.length];
    speedBtn.innerHTML = `${speechRate}x`;
    chrome.storage.sync.set({ speechRate });

    // Rate can't change mid-utterance, so restart from the current position
    isPaused = false;
    pauseBtn.innerHTML = '⏸';
    playBtn.innerHTML = '🔊 Reading...';
    speechSynthesis.cancel();
    speakFrom(charOffset);
}

// The speech engine is shared by all tabs. If the user leaves this tab while it is
// reading/paused, another tab may cancel or replace our utterance.
document.addEventListener('visibilitychange', () => {
    if (document.hidden && container) leftTab = true;
});

function removeUI() {
    clearEstimator();
    if (container) {
        container.remove();
        container = null;
    }
}