// Cyberpunk JS interactions

document.addEventListener('DOMContentLoaded', () => {
    // Fill ticker with repeating text to make it infinite
    const ticker = document.getElementById('ticker-text');
    if (ticker) {
        const originalText = ticker.innerText;
        ticker.innerText = Array(5).fill(originalText).join(' ');
    }
});
