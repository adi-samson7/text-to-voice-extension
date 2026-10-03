let container = null;
let selectedText = "";
let utterance = null;
let playBtn, pauseBtn, stopBtn;

document.addEventListener('mouseup', (e) => {
    if (container && container.contains(e.target)) return;

    setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text && text.length > 0) {
            selectedText = text;
            showPlayButton(selection);
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
        if (speechSynthesis.paused) {
            speechSynthesis.resume();
            pauseBtn.innerHTML = '⏸';
            playBtn.innerHTML = '🔊 Reading...'; 
        } else {
            speechSynthesis.pause();
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
    utterance = new SpeechSynthesisUtterance(selectedText);
    
    // Check storage for a custom voice before speaking
    chrome.storage.sync.get(['selectedVoice'], (result) => {
        if (result.selectedVoice) {
            const voices = speechSynthesis.getVoices();
            const chosenVoice = voices.find(v => v.name === result.selectedVoice);
            if (chosenVoice) {
                utterance.voice = chosenVoice;
            }
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
}

function removeUI() {
    if (container) {
        container.remove();
        container = null;
    }
}