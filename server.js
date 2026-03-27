require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Twilio
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('[SYSTEM] Twilio initialized for actual SMS delivery.');
} else {
    console.log('[SYSTEM] Twilio credentials missing in .env. Falling back to terminal mock SMS.');
}

// Hardcoded Admins (Requested: 4 members)
const ADMIN_USERS = [
    { username: 'SAI KRISHNA', password: '12345' },
    { username: 'CRIS G', password: '12345' },
    { username: 'VISHNU', password: '12345' },
    { username: 'RIJO', password: '12345' }
];

// In-memory state for 3 parking slots
let slots = [
  { id: 1, status: 'available', bookedBy: null, phone: null, vehicleInfo: null, checkInCode: null, bookingTime: null, warningSent: false },
  { id: 2, status: 'available', bookedBy: null, phone: null, vehicleInfo: null, checkInCode: null, bookingTime: null, warningSent: false },
  { id: 3, status: 'available', bookedBy: null, phone: null, vehicleInfo: null, checkInCode: null, bookingTime: null, warningSent: false }
];

let pendingOtps = {};

// 1. Get all slots (Public format - hides PII)
app.get('/api/slots', (req, res) => {
  res.json(slots.map(s => ({
    id: s.id,
    status: s.status,
    vehicleInfo: s.vehicleInfo ? 'HIDDEN' : null // Omit PII for public UX
  })));
});

// 2. Request OTP for booking
app.post('/api/book/request-otp', async (req, res) => {
  const { slotId, name, phone, vehicleNumber } = req.body;
  
  if (!slotId || !name || !phone || !vehicleNumber) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const slot = slots.find(s => s.id === parseInt(slotId));
  if (!slot) {
    return res.status(404).json({ success: false, message: 'Slot not found.' });
  }
  
  if (slot.status !== 'available') {
    return res.status(400).json({ success: false, message: 'Slot is already booked or occupied.' });
  }

  const mockOtp = Math.floor(1000 + Math.random() * 9000).toString();
  
  pendingOtps[phone] = {
    otp: mockOtp,
    slotId: parseInt(slotId),
    name,
    phone,
    vehicleNumber
  };

  if (twilioClient) {
      try {
          // ensure phone has standard E.164 format roughly, if not prepend +
          const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
          await twilioClient.messages.create({
              body: `Your SmartPark prototype OTP for Slot ${slotId} is ${mockOtp}.`,
              from: process.env.TWILIO_PHONE_NUMBER,
              to: formattedPhone
          });
          console.log(`[REAL SMS] OTP sent via Twilio to ${formattedPhone}`);
          res.json({ success: true, message: 'OTP sent successfully to your phone.' });
      } catch (err) {
          console.error('[TWILIO ERROR]', err.message);
          res.status(500).json({ success: false, message: `Twilio Error: ${err.message}. Check your console.` });
      }
  } else {
      console.log(`[MOCK SMS] OTP for ${name} (${phone}) to book Slot ${slotId} is: ${mockOtp}`);
      res.json({ success: true, message: 'OTP sent successfully. Check server console for mock OTP.' });
  }
});

// 3. Verify OTP
app.post('/api/book/verify-otp', (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone and OTP are required.' });

  const pending = pendingOtps[phone];
  if (!pending) return res.status(400).json({ success: false, message: 'No pending booking found for this phone number.' });
  if (pending.otp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP.' });

  const slot = slots.find(s => s.id === pending.slotId);
  if (slot.status !== 'available') {
    delete pendingOtps[phone];
    return res.status(400).json({ success: false, message: 'Slot was booked by someone else in the meantime.' });
  }

  // Confirm booking
  const checkInCode = Math.floor(1000 + Math.random() * 9000).toString();
  slot.status = 'booked';
  slot.bookedBy = pending.name;
  slot.phone = pending.phone;
  slot.vehicleInfo = pending.vehicleNumber;
  slot.checkInCode = checkInCode;
  slot.bookingTime = Date.now();
  slot.warningSent = false;

  delete pendingOtps[phone];
  console.log(`[BOOKING COMPLETE] Slot ${slot.id} successfully booked by ${slot.bookedBy} (${slot.vehicleInfo}) - Code: ${checkInCode}`);
  res.json({ success: true, message: 'Booking confirmed successfully!', checkInCode: checkInCode, slotId: slot.id });
});

// 4. ESP32 Update API 
app.post('/api/esp32/update', (req, res) => {
  const { slotId, status } = req.body;
  if (!slotId || !['available', 'occupied', 'booked'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid data.' });
  }

  const slot = slots.find(s => s.id === parseInt(slotId));
  if (slot) {
    slot.status = status;
    if (status === 'available') {
      slot.bookedBy = null;
      slot.phone = null;
      slot.vehicleInfo = null;
      slot.checkInCode = null;
      slot.bookingTime = null;
      slot.warningSent = false;
    }
    console.log(`[ESP32 SYNC] Slot ${slotId} status updated to ${status}`);
    res.json({ success: true, message: 'Slot updated from ESP32.' });
  } else {
    res.status(404).json({ success: false, message: 'Slot not found' });
  }
});

// === ADMIN ROUTES ===

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const admin = ADMIN_USERS.find(user => user.username === username && user.password === password);
    
    if (admin) {
        // Prototype token
        res.json({ success: true, token: 'prototype_admin_token_' + username, username: username });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
});

// Admin Slots Data (Protected Endpoint)
app.get('/api/admin/slots', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer prototype_admin_token_')) {
        return res.status(403).json({ success: false, message: 'Unauthorized. Admin access required.' });
    }

    // Return the full slots array including PII
    res.json({ success: true, data: slots });
});

// Periodic background check for 2-hour expiry limit
setInterval(async () => {
    // 5 minutes in milliseconds for rapid prototype testing
    const TIME_LIMIT_MS = 5 * 60 * 1000; 
    
    for (const slot of slots) {
        if ((slot.status === 'booked' || slot.status === 'occupied') && slot.bookingTime && !slot.warningSent) {
            if (Date.now() - slot.bookingTime > TIME_LIMIT_MS) {
                slot.warningSent = true;
                const messageBody = `SmartPark Alert: Your 5-minute parking limit for Slot ${slot.id} has expired. If you continue parking, extra fees will be collected.`;
                
                if (twilioClient && slot.phone) {
                    try {
                        const formattedPhone = slot.phone.startsWith('+') ? slot.phone : `+${slot.phone}`;
                        await twilioClient.messages.create({
                            body: messageBody,
                            from: process.env.TWILIO_PHONE_NUMBER,
                            to: formattedPhone
                        });
                        console.log(`[REAL SMS LIMIT EXCEEDED] Warning sent to ${formattedPhone}`);
                    } catch (err) {
                        console.error('[TWILIO ERROR] Expiry warning failed:', err.message);
                    }
                } else {
                    console.log(`[MOCK SMS LIMIT EXCEEDED] ${messageBody} (Sent to ${slot.phone})`);
                }
            }
        }
    }
}, 60000); // Check every 60 seconds

// Staff Verify Check-In API
app.post('/api/staff/verify-checkin', (req, res) => {
    const { slotId, checkInCode } = req.body;
    if (!slotId || !checkInCode) {
        return res.status(400).json({ success: false, message: 'Slot ID and Check-In Code are required.' });
    }

    const slot = slots.find(s => s.id === parseInt(slotId));
    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found.' });

    if (slot.status !== 'booked') {
        return res.status(400).json({ success: false, message: 'Slot is not currently booked.' });
    }

    if (slot.checkInCode !== checkInCode.toString()) {
        return res.status(400).json({ success: false, message: 'Invalid Check-In Code.' });
    }

    // Transition from 'booked' to 'occupied'
    slot.status = 'occupied';
    slot.checkInCode = null; // Clear code so it can't be reused
    console.log(`[STAFF CHECK-IN] Slot ${slotId} verified and is now physically occupied.`);

    res.json({ success: true, message: 'Check-In verified! Slot is now physically occupied.' });
});

// User Cancel API
app.post('/api/book/cancel', (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required.' });

    const slot = slots.find(s => s.phone === phone && s.status === 'booked');
    if (!slot) return res.status(404).json({ success: false, message: 'No active booking found for this phone number.' });

    // Free the slot
    slot.status = 'available';
    slot.bookedBy = null;
    slot.phone = null;
    slot.vehicleInfo = null;
    slot.checkInCode = null;
    slot.bookingTime = null;
    slot.warningSent = false;

    console.log(`[USER CANCELLATION] Booking for ${phone} cancelled.`);
    res.json({ success: true, message: 'Booking cancelled successfully.' });
});

// Admin Free Slot API
app.post('/api/admin/free-slot', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer prototype_admin_token_')) {
        return res.status(403).json({ success: false, message: 'Unauthorized. Admin access required.' });
    }

    const { slotId } = req.body;
    const slot = slots.find(s => s.id === parseInt(slotId));
    
    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found.' });

    if (slot.status === 'available') {
        return res.status(400).json({ success: false, message: 'Slot is already available.' });
    }

    // Force free the slot
    slot.status = 'available';
    slot.bookedBy = null;
    slot.phone = null;
    slot.vehicleInfo = null;
    slot.checkInCode = null;

    console.log(`[ADMIN CANCELLATION] Slot ${slotId} force freed by Admin.`);
    res.json({ success: true, message: 'Slot successfully freed.' });
});

app.listen(PORT, () => {
  console.log(`Smart Parking Server is running on http://localhost:${PORT}`);
});
