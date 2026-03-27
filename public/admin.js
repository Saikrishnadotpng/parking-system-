document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = 'http://localhost:3000/api';
    
    const loginContainer = document.getElementById('login-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    
    const adminNameSpan = document.getElementById('admin-name');
    const logoutBtn = document.getElementById('logout-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const slotsBody = document.getElementById('admin-slots-body');

    // Check if already logged in locally
    const token = localStorage.getItem('admin_token');
    const username = localStorage.getItem('admin_user');
    
    if (token) {
        showDashboard(username);
    }

    // Login logic
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;
        
        const loginBtn = loginForm.querySelector('button[type="submit"]');
        loginBtn.textContent = 'Verifying...';
        loginBtn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });
            const data = await res.json();
            
            if (data.success) {
                localStorage.setItem('admin_token', data.token);
                localStorage.setItem('admin_user', data.username);
                showDashboard(data.username);
            } else {
                loginError.textContent = data.message;
            }
        } catch (error) {
            loginError.textContent = 'Server connection error.';
        } finally {
            loginBtn.textContent = 'Login';
            loginBtn.disabled = false;
        }
    });

    // Logout logic
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        loginForm.reset();
        dashboardContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
    });

    // Dashboard logic
    function showDashboard(username) {
        loginContainer.classList.add('hidden');
        dashboardContainer.classList.remove('hidden');
        adminNameSpan.textContent = username;
        fetchAdminData();
    }

    async function fetchAdminData() {
        const token = localStorage.getItem('admin_token');
        if (!token) return;

        refreshBtn.textContent = 'Refreshing...';
        
        try {
            const res = await fetch(`${API_BASE}/admin/slots`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            
            if (data.success) {
                renderTable(data.data);
            } else {
                // Unauthenticated / expired
                if (res.status === 401 || res.status === 403) {
                    logoutBtn.click();
                } else {
                    alert(data.message);
                }
            }
        } catch (error) {
            console.error('Failed to fetch admin data', error);
        } finally {
            refreshBtn.textContent = '🔄 Refresh Data';
        }
    }

    refreshBtn.addEventListener('click', fetchAdminData);

    function renderTable(slots) {
        slotsBody.innerHTML = '';
        slots.forEach(slot => {
            const tr = document.createElement('tr');
            
            const statusClass = `status-${slot.status}`;
            const statusDisplay = slot.status.charAt(0).toUpperCase() + slot.status.slice(1);
            
            const elapsedMins = slot.bookingTime ? Math.floor((Date.now() - slot.bookingTime) / 60000) : 0;
            const elapsedDisplay = slot.bookingTime ? `${elapsedMins}m` : '-';
            const timeBadge = (elapsedMins >= 5) ? `<span style="color:#f85149; font-weight:bold;">${elapsedDisplay} (OVERDUE)</span>` : `<span class="null-data">${elapsedDisplay}</span>`;

            tr.innerHTML = `
                <td><strong>0${slot.id}</strong></td>
                <td><span class="status-badge ${statusClass}">${statusDisplay}</span></td>
                <td>${slot.bookedBy || '<span class="null-data">-</span>'}</td>
                <td>${slot.phone || '<span class="null-data">-</span>'}</td>
                <td>${slot.vehicleInfo || '<span class="null-data">-</span>'}</td>
                <td><strong style="color:var(--color-primary); letter-spacing: 2px;">${slot.checkInCode || '-'}</strong></td>
                <td>${timeBadge}</td>
                <td>
                    ${
                        slot.status !== 'available' 
                        ? `<button class="btn logout-btn" style="padding:0.4rem 0.8rem; font-size:0.8rem; width:100%; white-space:nowrap;" onclick="freeSlot(${slot.id})">Free Slot</button>`
                        : '<span class="null-data">-</span>'
                    }
                </td>
            `;
            slotsBody.appendChild(tr);
        });
    }

    // Free Slot Action (Global scope)
    window.freeSlot = async function(slotId) {
        if (!confirm('Are you sure you want to force clear Slot ' + slotId + '? This will immediately delete the booking.')) return;
        
        const token = localStorage.getItem('admin_token');
        try {
            const res = await fetch(`${API_BASE}/admin/free-slot`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ slotId })
            });
            const data = await res.json();
            if (data.success) {
                fetchAdminData();
            } else {
                alert('Action failed: ' + data.message);
            }
        } catch (error) {
            alert('Server connection error.');
        }
    };

    // Auto-refresh every 2 seconds if dashboard is visible
    setInterval(() => {
        if (!dashboardContainer.classList.contains('hidden')) {
            fetchAdminData();
        }
    }, 2000);
});
