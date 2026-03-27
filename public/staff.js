document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') && window.location.port !== '3000' ? 'http://localhost:3000/api' : '/api';
    const form = document.getElementById('checkin-form');
    const errorDiv = document.getElementById('checkin-error');
    const successDiv = document.getElementById('checkin-success');
    const btn = form.querySelector('button');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.textContent = '';
        successDiv.textContent = '';
        
        const slotId = document.getElementById('slot-id').value;
        const checkInCode = document.getElementById('checkin-code').value;

        btn.disabled = true;
        btn.textContent = 'Verifying...';

        try {
            const res = await fetch(`${API_BASE}/staff/verify-checkin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slotId, checkInCode })
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
            btn.textContent = 'Verify Access';
        }
    });
});
