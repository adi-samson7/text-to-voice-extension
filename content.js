let container = null;
let selectedText = "";
let utterance = null;
let playBtn, pauseBtn, stopBtn;
let isPaused = false; 

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
    
    container.appendChild(playBtn);
    container.appendChild(pauseBtn);
    container.appendChild(stopBtn);
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

            utterance = new SpeechSynthesisUtterance(selectedText);
            if (chosenVoice) {
                utterance.voice = chosenVoice;
            }

            pauseBtn.style.display = 'flex';
            stopBtn.style.display = 'flex';
            
            playBtn.innerHTML = '🔊 Reading...';
            playBtn.style.cursor = 'default';
            playBtn.onclick = null; 
            
            utterance.onend = () => {
                removeUI();
            };
            
            speechSynthesis.speak(utterance);
        });
    });
}

function removeUI() {
    if (container) {
        container.remove();
        container = null;
    }
}