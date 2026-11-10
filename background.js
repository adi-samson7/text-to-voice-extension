// Background service worker: lets the extension read selected text in places
// where content scripts can't run (e.g. Chrome's built-in PDF viewer).
// Uses the right-click context menu + chrome.tts.

const READ_ID = 'tts-read-selection';
const PAUSE_ID = 'tts-pause';
const STOP_ID = 'tts-stop';
const SPEED_PARENT_ID = 'tts-speed';
const SPEEDS = [1, 1.25, 1.5, 2];
const ALL_CONTEXTS = ['page', 'selection', 'frame'];

let currentText = '';
let charOffset = 0;   // approx. position in currentText (for restarting on speed change)
let isPaused = false;
let isSpeaking = false;

function getRate(cb) {
    chrome.storage.sync.get(['speechRate'], (r) => cb(SPEEDS.includes(r.speechRate) ? r.speechRate : 1));
}

function createMenus() {
    getRate((rate) => {
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: READ_ID,
                title: '🔊 Read selection aloud',
                contexts: ['selection']
            });
            chrome.contextMenus.create({
                id: PAUSE_ID,
                title: '⏸ Pause',
                contexts: ALL_CONTEXTS
            });
            chrome.contextMenus.create({
                id: STOP_ID,
                title: '⏹ Stop reading',
                contexts: ALL_CONTEXTS
            });
            chrome.contextMenus.create({
                id: SPEED_PARENT_ID,
                title: '⚡ Speed',
                contexts: ALL_CONTEXTS
            });
            SPEEDS.forEach((s) => {
                chrome.contextMenus.create({
                    id: `${SPEED_PARENT_ID}-${s}`,
                    parentId: SPEED_PARENT_ID,
                    title: `${s}x`,
                    type: 'radio',
                    checked: s === rate,
                    contexts: ALL_CONTEXTS
                });
            });
        });
    });
}

function setPausedUI(paused) {
    isPaused = paused;
    chrome.contextMenus.update(PAUSE_ID, { title: paused ? '▶ Resume' : '⏸ Pause' });
}

// Speak currentText from `offset` at `rate`.
function speakFrom(offset, rate) {
    chrome.storage.sync.get(['selectedVoice'], (result) => {
        chrome.tts.stop();
        charOffset = offset;
        const options = {
            rate,
            onEvent: (event) => {
                if (event.type === 'word' && typeof event.charIndex === 'number') {
                    charOffset = offset + event.charIndex;
                } else if (event.type === 'end' || event.type === 'error') {
                    isSpeaking = false;
                    setPausedUI(false);
                }
            }
        };
        if (result.selectedVoice) options.voiceName = result.selectedVoice;
        isSpeaking = true;
        setPausedUI(false);
        chrome.tts.speak(currentText.slice(offset), options);
    });
}

chrome.runtime.onInstalled.addListener(createMenus);
chrome.runtime.onStartup.addListener(createMenus);

chrome.contextMenus.onClicked.addListener((info) => {
    const id = String(info.menuItemId);

    if (id === STOP_ID) {
        chrome.tts.stop();
        isSpeaking = false;
        setPausedUI(false);
        return;
    }

    if (id === PAUSE_ID) {
        if (!isSpeaking) return;
        if (isPaused) {
            chrome.tts.resume();
            setPausedUI(false);
        } else {
            chrome.tts.pause();
            setPausedUI(true);
        }
        return;
    }

    if (id.startsWith(`${SPEED_PARENT_ID}-`)) {
        const rate = parseFloat(id.slice(SPEED_PARENT_ID.length + 1));
        chrome.storage.sync.set({ speechRate: rate });
        // Rate can't change mid-utterance: restart from the current position
        if (isSpeaking && currentText) speakFrom(charOffset, rate);
        return;
    }

    if (id === READ_ID && info.selectionText) {
        const text = info.selectionText.trim();
        if (!text) return;
        currentText = text;
        getRate((rate) => speakFrom(0, rate));
    }
});
