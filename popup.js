const langSelect = document.getElementById('langSelect');
const voiceSelect = document.getElementById('voiceSelect');
const toggleBtn = document.getElementById('toggleBtn');
let allVoices = [];

function init() {
    allVoices = speechSynthesis.getVoices();
    if (allVoices.length === 0) return;

    const languages = [...new Set(allVoices.map(v => v.lang))].sort();

    // Check storage for language, voice, and the enable toggle
    chrome.storage.sync.get(['selectedLang', 'selectedVoice', 'isEnabled'], (result) => {
        // Toggle setup (Default to true/ON if it has never been set)
        const isEnabled = result.isEnabled !== false; 
        updateToggleUI(isEnabled);

        const currentLang = result.selectedLang || (languages.includes('en-US') ? 'en-US' : languages[0]);
        
        langSelect.innerHTML = '';
        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang;
            
            try {
                const langName = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang);
                option.textContent = `${langName} (${lang})`;
            } catch {
                option.textContent = lang; 
            }
            
            if (lang === currentLang) option.selected = true;
            langSelect.appendChild(option);
        });

        updateVoices(currentLang, result.selectedVoice);
    });
}

function updateVoices(lang, savedVoice) {
    voiceSelect.innerHTML = '';
    const filteredVoices = allVoices.filter(v => v.lang === lang);

    filteredVoices.forEach(voice => {
        const option = document.createElement('option');
        option.textContent = voice.name;
        option.value = voice.name;
        if (voice.name === savedVoice) option.selected = true;
        voiceSelect.appendChild(option);
    });

    if (filteredVoices.length > 0 && !filteredVoices.some(v => v.name === savedVoice)) {
        voiceSelect.selectedIndex = 0; 
        chrome.storage.sync.set({ selectedVoice: filteredVoices[0].name }); 
    }
}

function updateToggleUI(isEnabled) {
    if (isEnabled) {
        toggleBtn.textContent = 'ON';
        toggleBtn.classList.remove('off');
    } else {
        toggleBtn.textContent = 'OFF';
        toggleBtn.classList.add('off');
    }
}

toggleBtn.addEventListener('click', () => {
    chrome.storage.sync.get(['isEnabled'], (result) => {
        const newState = result.isEnabled === false ? true : false;
        chrome.storage.sync.set({ isEnabled: newState });
        updateToggleUI(newState);
    });
});

langSelect.addEventListener('change', (e) => {
    const newLang = e.target.value;
    chrome.storage.sync.set({ selectedLang: newLang });
    updateVoices(newLang, null); 
});

voiceSelect.addEventListener('change', (e) => {
    chrome.storage.sync.set({ selectedVoice: e.target.value });
});

init();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = init;
}