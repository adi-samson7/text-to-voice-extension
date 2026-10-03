const langSelect = document.getElementById('langSelect');
const voiceSelect = document.getElementById('voiceSelect');
let allVoices = [];

function init() {
    allVoices = speechSynthesis.getVoices();
    if (allVoices.length === 0) return;

    // Get unique language codes and sort them
    const languages = [...new Set(allVoices.map(v => v.lang))].sort();

    // Load saved preferences
    chrome.storage.sync.get(['selectedLang', 'selectedVoice'], (result) => {
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

    // FIX: If the currently saved voice doesn't belong to the newly selected language,
    // immediately force-save the first voice in the new language list to storage.
    if (filteredVoices.length > 0 && !filteredVoices.some(v => v.name === savedVoice)) {
        voiceSelect.selectedIndex = 0; // Update the UI to show the first option
        chrome.storage.sync.set({ selectedVoice: filteredVoices[0].name }); // Save to storage
    }
}

// When Language changes, save the new language and wipe the old voice preference
langSelect.addEventListener('change', (e) => {
    const newLang = e.target.value;
    chrome.storage.sync.set({ selectedLang: newLang });
    updateVoices(newLang, null); // Passing null forces it to pick a fresh voice
});

// When Voice changes, update storage
voiceSelect.addEventListener('change', (e) => {
    chrome.storage.sync.set({ selectedVoice: e.target.value });
});

init();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = init;
}