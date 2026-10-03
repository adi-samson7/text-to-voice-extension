const voiceSelect = document.getElementById('voiceSelect');

function populateVoices() {
    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) return;

    voiceSelect.innerHTML = '';
    
    // Retrieve the previously saved voice from Chrome storage
    chrome.storage.sync.get(['selectedVoice'], (result) => {
        const savedVoice = result.selectedVoice;

        voices.forEach(voice => {
            const option = document.createElement('option');
            // Show the voice name and its language code
            option.textContent = `${voice.name} (${voice.lang})`;
            option.value = voice.name;
            
            if (voice.name === savedVoice) {
                option.selected = true;
            }
            voiceSelect.appendChild(option);
        });
    });
}

// Voices load asynchronously in the browser, so we listen for them to be ready
populateVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoices;
}

// Save the user's choice to storage immediately when changed
voiceSelect.addEventListener('change', (e) => {
    chrome.storage.sync.set({ selectedVoice: e.target.value });
});