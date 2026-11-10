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
            speechSynthesis.resume();
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

    u.onboundary = (e) => {
        if (utterance === u) charOffset = offset + e.charIndex;
    };
    // Ignore end events from utterances we replaced (e.g. on speed change)
    u.onend = () => {
        if (utterance === u) removeUI();
    };

    utterance = u;
    speechSynthesis.speak(u);
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

function removeUI() {
    if (container) {
        container.remove();
        container = null;
    }
}