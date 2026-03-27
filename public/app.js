document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') && window.location.port !== '3000' ? 'http://localhost:3000/api' : '/api';
    const slotsContainer = document.getElementById('slots-container');
    
    // Modals
    const bookingModal = document.getElementById('booking-modal');
    const otpModal = document.getElementById('otp-modal');
    const successOverlay = document.getElementById('success-overlay');
    
    // Forms
    const bookingForm = document.getElementById('booking-form');
    const otpForm = document.getElementById('otp-form');
    
    // Elements
    const selectedSlotIdSpan = document.getElementById('selected-slot-id');
    const bookingError = document.getElementById('booking-error');
    const otpError = document.getElementById('otp-error');
    const reqOtpBtn = document.getElementById('request-otp-btn');
    const verifyOtpBtn = document.getElementById('verify-otp-btn');
    
    let currentSlot = null;
    let currentUserPhone = null;

    // Fetch and render slots periodically
    async function fetchSlots() {
        try {
            const res = await fetch(`${API_BASE}/slots`);
            const slots = await res.json();
            renderSlots(slots);
        } catch (error) {
            console.error('Failed to fetch slots', error);
        }
    }

    function renderSlots(slots) {
        // Remove initial loader placeholder if it persists
        const loader = slotsContainer.querySelector('.loader');
        if (loader) loader.remove();
        
        const availableCount = slots.filter(s => s.status === 'available').length;
        const summaryBadge = document.getElementById('availability-summary');
        if (summaryBadge) {
            summaryBadge.textContent = `${availableCount} of ${slots.length} slots available right now`;
            if (availableCount === 0) {
                summaryBadge.style.color = 'var(--color-occupied)';
                summaryBadge.style.borderColor = 'rgba(248, 81, 73, 0.4)';
                summaryBadge.style.background = 'rgba(248, 81, 73, 0.15)';
            } else {
                summaryBadge.style.color = 'var(--color-available)';
                summaryBadge.style.borderColor = 'rgba(46, 160, 67, 0.4)';
                summaryBadge.style.background = 'rgba(46, 160, 67, 0.15)';
            }
        }

        slots.forEach((slot, index) => {
            const stateDisplay = slot.status === 'available' ? 'Available' 
                : (slot.status === 'booked' ? 'Booked' : 'Occupied');
            
            const btnClass = slot.status === 'available' ? 'action-btn book' : 'action-btn disabled';
            const btnText = slot.status === 'available' ? 'Book Now' : 'Unavailable';
            
            let card = document.getElementById(`slot-card-${slot.id}`);
            
            if (!card) {
                // Initialize card safely only on first load
                card = document.createElement('div');
                card.id = `slot-card-${slot.id}`;
                card.className = `slot-card ${slot.status}`;
                card.style.animationDelay = `${index * 0.1}s`;
                
                card.innerHTML = `
                    <div class="slot-id">0${slot.id}</div>
                    <div class="slot-status">${stateDisplay}</div>
                    <button class="${btnClass}" data-id="${slot.id}">${btnText}</button>
                `;
                
                // Mount single event listeners permanently
                card.addEventListener('click', () => {
                    if (card.classList.contains('available')) openBookingModal(slot.id);
                });
                const btn = card.querySelector('button');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (card.classList.contains('available')) openBookingModal(slot.id);
                });
                
                slotsContainer.appendChild(card);
            } else {
                // To prevent annoying visual blinking recalculations, gracefully diff the properties
                if (!card.classList.contains(slot.status)) {
                    card.className = `slot-card ${slot.status}`;
                    card.querySelector('.slot-status').textContent = stateDisplay;
                    const btn = card.querySelector('button');
                    btn.className = btnClass;
                    btn.textContent = btnText;
                }
            }
        });
    }

    // Polling every 2 seconds for real-time ESP32 sync feel
    fetchSlots();
    setInterval(fetchSlots, 2000);

    // Booking Flow
    function openBookingModal(slotId) {
        currentSlot = slotId;
        selectedSlotIdSpan.textContent = `0${slotId}`;
        bookingForm.reset();
        bookingError.textContent = '';
        bookingModal.classList.add('active');
    }

    document.getElementById('close-booking').addEventListener('click', () => {
        bookingModal.classList.remove('active');
    });

    document.getElementById('close-otp').addEventListener('click', () => {
        otpModal.classList.remove('active');
    });

    // Request OTP
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const phone = document.getElementById('phone').value;
        const vehicleNumber = document.getElementById('vehicle').value;
        const arrivalTime = document.getElementById('arrival-time').value;
        const durationHours = document.getElementById('duration').value;
        
        reqOtpBtn.disabled = true;
        reqOtpBtn.textContent = 'Sending...';
        
        try {
            const res = await fetch(`${API_BASE}/book/request-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slotId: currentSlot, name, phone, vehicleNumber, arrivalTime, durationHours })
            });
            const data = await res.json();
            
            if (data.success) {
                currentUserPhone = phone;
                bookingModal.classList.remove('active');
                openOtpModal();
            } else {
                bookingError.textContent = data.message;
            }
        } catch (error) {
            bookingError.textContent = 'Server error. Try again.';
        } finally {
            reqOtpBtn.disabled = false;
            reqOtpBtn.textContent = 'Request OTP';
        }
    });

    function openOtpModal() {
        otpForm.reset();
        otpError.textContent = '';
        otpModal.classList.add('active');
        document.querySelector('.otp-digit').focus();
    }

    // OTP Input UI functionality (Auto focus next input)
    const otpInputs = document.querySelectorAll('.otp-digit');
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            // Remove non-numeric characters
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            if (e.target.value.length === 1) {
                if (index < otpInputs.length - 1) otpInputs[index + 1].focus();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                otpInputs[index - 1].focus();
            }
        });
    });

    // Verify OTP
    otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let otp = '';
        otpInputs.forEach(input => otp += input.value);
        
        if (otp.length !== 4) {
            otpError.textContent = 'Please enter a 4-digit OTP';
            return;
        }

        verifyOtpBtn.disabled = true;
        verifyOtpBtn.textContent = 'Verifying...';
        
        try {
            const res = await fetch(`${API_BASE}/book/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: currentUserPhone, otp })
            });
            const data = await res.json();
            
            if (data.success) {
                otpModal.classList.remove('active');
                showSuccess(data.checkInCode);
                fetchSlots(); // Immediately refresh UI
            } else {
                otpError.textContent = data.message;
            }
        } catch (error) {
            otpError.textContent = 'Verification failed. Try again.';
        } finally {
            verifyOtpBtn.disabled = false;
            verifyOtpBtn.textContent = 'Verify & Book';
        }
    });

    function showSuccess(code) {
        document.getElementById('display-checkin-code').textContent = code || 'N/A';
        successOverlay.classList.add('active');
    }

    document.getElementById('close-success-btn').addEventListener('click', () => {
        successOverlay.classList.remove('active');
    });

    // Cancel logic
    const cancelModal = document.getElementById('cancel-modal');
    const cancelForm = document.getElementById('cancel-form');
    const cancelError = document.getElementById('cancel-error');

    document.getElementById('open-cancel-btn').addEventListener('click', () => {
        cancelForm.reset();
        cancelError.textContent = '';
        cancelModal.classList.add('active');
    });
    
    document.getElementById('close-cancel').addEventListener('click', () => {
        cancelModal.classList.remove('active');
    });

    cancelForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('cancel-phone').value;
        const btn = document.getElementById('cancel-submit-btn');
        btn.textContent = 'Cancelling...';
        btn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/book/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const data = await res.json();
            if (data.success) {
                cancelModal.classList.remove('active');
                alert('Booking successfully cancelled!');
                fetchSlots();
            } else {
                cancelError.textContent = data.message;
            }
        } catch (error) {
            cancelError.textContent = 'Connection error.';
        } finally {
            btn.textContent = 'Cancel Booking';
            btn.disabled = false;
        }
    });

});
