// Pit Wall Tech Actions

document.addEventListener('DOMContentLoaded', () => {
    // Live UTC Clock
    const clockElement = document.getElementById('clock');
    
    function updateClock() {
        const now = new Date();
        const hours = String(now.getUTCHours()).padStart(2, '0');
        const minutes = String(now.getUTCMinutes()).padStart(2, '0');
        const seconds = String(now.getUTCSeconds()).padStart(2, '0');
        if(clockElement) {
            clockElement.textContent = `${hours}:${minutes}:${seconds} UTC`;
        }
    }
    
    if (clockElement) {
        updateClock();
        setInterval(updateClock, 1000);
    }
});

// Role Switcher for Prototype
function switchRole(role) {
    if (role === 'admin') {
        window.location.href = 'admin_dashboard.html';
    } else if (role === 'user') {
        window.location.href = 'user_dashboard.html';
    }
}
