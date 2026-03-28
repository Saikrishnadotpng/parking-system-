document.addEventListener('DOMContentLoaded', () => {
    // Hardcoded production URL for standalone Staff Portal connecting to active Render Database
    const API_BASE = 'https://parking-system-1-w3d5.onrender.com/api';
    const form = document.getElementById('checkin-form');
    const errorDiv = document.getElementById('checkin-error');
    const successDiv = document.getElementById('checkin-success');
    const btn = form.querySelector('button');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.textContent = '';
        successDiv.textContent = '';
        
        const checkInCode = document.getElementById('checkin-code').value.trim();

        btn.disabled = true;
        btn.textContent = 'Verifying...';

        try {
            const res = await fetch(`${API_BASE}/staff/verify-checkin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkInCode })
            });
            const data = await res.json();

            if (data.success) {
                successDiv.textContent = '✅ ' + data.message;
                form.reset();
            } else {
                errorDiv.textContent = data.message;
            }
        } catch (err) {
            errorDiv.textContent = 'Server connection failed.';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Verify & Check-In';
        }
    });
});
