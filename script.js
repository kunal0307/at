// ========================================================
// ⚠️ GOOGLE APPS SCRIPT WEB APP URL:
// ========================================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx18RsLIFpkfA1nUrwINLYr8SbVwqn8tTPtYcAYHKpit6I0FrF9i6uzDaFbYrCf_ZDQ/exec";

let currentUser = null;
let liveLocation = "Getting location...";
let currentCalDate = new Date();
let selectedDateKey = null;

let activePunchType = null;
let cameraStream = null;
let employeeAttendanceHistory = {};

// TIME CLEANER: 1899 Date ko Clean Time me convert karta hai
function cleanTimeString(rawTime) {
    if (!rawTime || rawTime === '--:--:--') return '--:--:--';
    if (rawTime.includes("GMT") || rawTime.includes("1899")) {
        const d = new Date(rawTime);
        if (!isNaN(d.getTime())) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    }
    return rawTime;
}

// 1. LIVE GPS TRACKER
function captureLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                liveLocation = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                const locEl = document.getElementById('locTxt');
                if (locEl) locEl.innerText = `Location: ${liveLocation}`;
            },
            () => {
                liveLocation = "Location Denied";
                const locEl = document.getElementById('locTxt');
                if (locEl) locEl.innerText = "Location access denied";
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }
}

// 2. DYNAMIC PROFILE UPDATE
function updateUserProfileUI(user) {
    document.getElementById('uName').innerText = user.name || '--';
    document.getElementById('uRole').innerText = user.role || 'Field Executive';
    document.getElementById('uCode').innerText = user.id || '--';
    document.getElementById('uMobile').innerText = user.mobile || '--';
    document.getElementById('uManager').innerText = user.manager || 'Mr. Amit Kumar';

    const photoEl = document.getElementById('uPhoto');
    photoEl.src = user.photo ? user.photo : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';

    const mgrTel = `tel:${user.managerPhone || '+919811122233'}`;
    const hrTel = `tel:${user.hrPhone || '+919844455566'}`;
    document.getElementById('btnCallMgrDash').href = mgrTel;
    document.getElementById('btnCallHrDash').href = hrTel;
    document.getElementById('btnCallMgrModal').href = mgrTel;
    document.getElementById('btnCallHrModal').href = hrTel;
}

// 3. GOOGLE SHEET LOGIN
async function handleLogin() {
    const idInput = document.getElementById('loginId').value.trim().toUpperCase();
    const passInput = document.getElementById('loginPass').value.trim();
    const errorEl = document.getElementById('errorMsg');
    const btn = document.getElementById('btnSignIn');

    errorEl.innerText = "";

    if (!idInput || !passInput) {
        errorEl.innerText = "Employee ID aur Password dono dalein!";
        return;
    }

    btn.innerText = "Connecting...";
    btn.disabled = true;

    try {
        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "login",
                loginId: idInput,
                password: passInput
            })
        });

        const result = await res.json();

        if (!result.success) {
            errorEl.innerText = result.message;
            return;
        }

        localStorage.removeItem('current_sheet_user');
        employeeAttendanceHistory = {};

        currentUser = result.user;
        localStorage.setItem('current_sheet_user', JSON.stringify(currentUser));

        updateUserProfileUI(currentUser);

        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashSection').style.display = 'flex';

        captureLocation();
        await syncAttendanceUI();

    } catch (err) {
        console.error(err);
        errorEl.innerText = "Connection Failed! Web App URL check karein.";
    } finally {
        btn.innerText = "Sign in";
        btn.disabled = false;
    }
}

function formatDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// 4. CAMERA & WATERMARK CAPTURE
async function openPunchCamera(type) {
    activePunchType = type;
    document.getElementById('cameraTitle').innerText = `Live Punch ${type}`;
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');

    modal.style.display = 'flex';

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false
        });
        video.srcObject = cameraStream;
    } catch (err) {
        alert("Camera permission allow karein selfie punch ke liye!");
        closePunchCamera();
    }
}

function closePunchCamera() {
    document.getElementById('cameraModal').style.display = 'none';
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

function captureAndStampPunch() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('stampCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = 400;
    canvas.height = 300;

    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(0, canvas.height - 85, canvas.width, 85);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px Inter, Arial";
    ctx.fillText(`PUNCH ${activePunchType}: ${timeStr} | ${dateStr}`, 12, canvas.height - 58);

    ctx.font = "12px Inter, Arial";
    ctx.fillStyle = "#93c5fd";
    ctx.fillText(`EMP: ${currentUser.name} (${currentUser.id})`, 12, canvas.height - 35);

    ctx.fillStyle = "#facc15";
    ctx.font = "11px Inter, Arial";
    ctx.fillText(`📍 Loc: ${liveLocation}`, 12, canvas.height - 14);

    const stampedPhotoData = canvas.toDataURL('image/jpeg', 0.60);

    closePunchCamera();
    commitAttendancePunch(activePunchType, timeStr, stampedPhotoData);
}

// 5. COMMIT PUNCH
async function commitAttendancePunch(type, timeStr, photoData) {
    const now = new Date();
    const dateKey = formatDateKey(now);

    const inBtn = document.getElementById('punchInBtn');
    const outBtn = document.getElementById('punchOutBtn');

    if (type === 'IN') inBtn.innerText = "Saving...";
    if (type === 'OUT') outBtn.innerText = "Saving...";
    inBtn.disabled = true;
    outBtn.disabled = true;

    if (!employeeAttendanceHistory[dateKey]) {
        employeeAttendanceHistory[dateKey] = {};
    }
    if (type === 'IN') {
        employeeAttendanceHistory[dateKey].in = { time: timeStr, loc: liveLocation, photo: "Uploading..." };
    } else if (type === 'OUT') {
        employeeAttendanceHistory[dateKey].out = { time: timeStr, loc: liveLocation, photo: "Uploading..." };
    }

    try {
        const payload = {
            action: "punch",
            empId: currentUser.id,
            empName: currentUser.name,
            type: type,
            date: dateKey,
            time: timeStr,
            location: liveLocation,
            photoBase64: photoData
        };

        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (result.success) {
            if (type === 'IN') {
                employeeAttendanceHistory[dateKey].in.photo = result.photoUrl;
            } else if (type === 'OUT') {
                employeeAttendanceHistory[dateKey].out.photo = result.photoUrl;
                const inTime = employeeAttendanceHistory[dateKey].in ? cleanTimeString(employeeAttendanceHistory[dateKey].in.time) : '--:--';
                document.getElementById('modalInTime').innerText = inTime;
                document.getElementById('modalOutTime').innerText = cleanTimeString(timeStr);
                document.getElementById('completionModal').style.display = 'flex';
            }

            alert(`Punch ${type} successfully recorded!`);
        } else {
            alert("Upload failed: " + result.message);
        }

    } catch (err) {
        console.error("Punch error:", err);
        alert("Server network slow hai, par punch local save ho gaya hai.");
    } finally {
        await syncAttendanceUI();
    }
}

function closeCompletionModal() {
    document.getElementById('completionModal').style.display = 'none';
}

// 6. HISTORY FETCH (CURRENT USER ONLY)
async function fetchUserAttendanceHistory() {
    if (!currentUser) return;

    try {
        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "getHistory",
                empId: currentUser.id
            })
        });
        const result = await res.json();
        if (result.success) {
            employeeAttendanceHistory = result.records || {};
        }
    } catch (err) {
        console.error("Attendance history load error:", err);
    }
}

// 7. SYNC PUNCH UI & STRICT RULES
async function syncAttendanceUI() {
    const inBtn = document.getElementById('punchInBtn');
    const outBtn = document.getElementById('punchOutBtn');
    const limitMsg = document.getElementById('punchLimitMsg');
    const todayKey = formatDateKey(new Date());

    inBtn.innerHTML = '<i class="ph ph-camera"></i> Punch In';
    outBtn.innerHTML = '<i class="ph ph-camera"></i> Punch Out';

    await fetchUserAttendanceHistory();

    const todayData = employeeAttendanceHistory[todayKey];
    limitMsg.className = "punch-limit-msg";

    if (!todayData || !todayData.in) {
        inBtn.disabled = false;
        outBtn.disabled = true;
        limitMsg.style.display = "none";
        document.getElementById('barIn').innerText = '--:--:--';
        document.getElementById('barOut').innerText = '--:--:--';
    } else if (todayData.in && !todayData.out) {
        inBtn.disabled = true;
        outBtn.disabled = false;
        limitMsg.className = "punch-limit-msg limit-working";
        limitMsg.innerText = "⏳ Punch In recorded. Shift end par punch out karein.";
        document.getElementById('barIn').innerText = cleanTimeString(todayData.in.time);
        document.getElementById('barOut').innerText = '--:--:--';
    } else {
        inBtn.disabled = true;
        outBtn.disabled = true;
        limitMsg.className = "punch-limit-msg limit-completed";
        limitMsg.innerText = "✓ Today's punch completed! Next punch tomorrow.";
        document.getElementById('barIn').innerText = cleanTimeString(todayData.in.time);
        document.getElementById('barOut').innerText = cleanTimeString(todayData.out.time);
    }
}

// 8. CALENDAR VIEW
async function openCalendarView() {
    currentCalDate = new Date();
    document.getElementById('dashSection').style.display = 'none';
    document.getElementById('calendarSection').style.display = 'flex';

    await fetchUserAttendanceHistory();
    renderCalendar();
    selectCalendarDate(formatDateKey(new Date()));
}

function closeCalendarView() {
    document.getElementById('calendarSection').style.display = 'none';
    document.getElementById('dashSection').style.display = 'flex';
}

function changeMonth(delta) {
    currentCalDate.setMonth(currentCalDate.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('monthYearTitle').innerText = `${monthNames[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const grid = document.getElementById('daysGrid');
    grid.innerHTML = "";

    for (let i = 0; i < firstDayIndex; i++) {
        grid.innerHTML += `<div class="calendar-day empty"></div>`;
    }

    const todayKey = formatDateKey(new Date());

    for (let day = 1; day <= totalDays; day++) {
        const dateObj = new Date(year, month, day);
        const dateKey = formatDateKey(dateObj);
        const isToday = (dateKey === todayKey) ? 'today' : '';
        const isSelected = (dateKey === selectedDateKey) ? 'selected' : '';
        const hasPunch = !!employeeAttendanceHistory[dateKey];

        const dayEl = document.createElement('div');
        dayEl.className = `calendar-day ${isToday} ${isSelected}`;
        dayEl.innerText = day;
        dayEl.onclick = () => selectCalendarDate(dateKey);

        if (hasPunch) {
            const dot = document.createElement('div');
            dot.className = 'att-dot';
            dayEl.appendChild(dot);
        }

        grid.appendChild(dayEl);
    }
}

function selectCalendarDate(dateKey) {
    selectedDateKey = dateKey;
    renderCalendar();

    document.getElementById('selectedDateTitle').innerText = dateKey;
    const statusPill = document.getElementById('selectedDateStatus');
    const gridContent = document.getElementById('detailGridContent');

    const dayRecord = employeeAttendanceHistory[dateKey];

    if (!dayRecord || !dayRecord.in) {
        statusPill.className = "status-pill pill-absent";
        statusPill.innerText = "No Punch";
        gridContent.innerHTML = `<div style="grid-column: span 2; text-align: center; color: #94a3b8; font-size: 0.8rem; padding: 12px;">Is date ko ${currentUser ? currentUser.name : 'user'} ka koi punch record nahi hai.</div>`;
        return;
    }

    const isCompleted = !!dayRecord.out;
    statusPill.className = `status-pill ${isCompleted ? 'pill-completed' : 'pill-working'}`;
    statusPill.innerText = isCompleted ? 'Completed' : 'Working';

    gridContent.innerHTML = `
        <div class="time-box">
            <span style="color:#16a34a; font-weight:bold;">🟢 Punch In Time</span>
            <b>${cleanTimeString(dayRecord.in.time)}</b>
            <small style="color:#64748b; font-size:0.68rem;">📍 ${dayRecord.in.loc}</small>
            ${dayRecord.in.photo && dayRecord.in.photo !== 'No Photo' ? `<a href="${dayRecord.in.photo}" target="_blank" class="photo-link-btn">View Drive Photo</a>` : ''}
        </div>
        <div class="time-box">
            <span style="color:#dc2626; font-weight:bold;">🔴 Punch Out Time</span>
            <b>${dayRecord.out ? cleanTimeString(dayRecord.out.time) : '--:--:--'}</b>
            ${dayRecord.out ? `<small style="color:#64748b; font-size:0.68rem;">📍 ${dayRecord.out.loc}</small>` : ''}
            ${dayRecord.out && dayRecord.out.photo && dayRecord.out.photo !== 'No Photo' ? `<a href="${dayRecord.out.photo}" target="_blank" class="photo-link-btn">View Drive Photo</a>` : '<div style="color:#94a3b8; font-size:0.7rem; margin-top:10px;">Pending Out</div>'}
        </div>
    `;
}

// 9. LOGOUT
function logout() {
    localStorage.removeItem('current_sheet_user');
    currentUser = null;
    employeeAttendanceHistory = {};

    closePunchCamera();
    closeCompletionModal();

    document.getElementById('loginId').value = "";
    document.getElementById('loginPass').value = "";
    document.getElementById('errorMsg').innerText = "";

    document.getElementById('dashSection').style.display = 'none';
    document.getElementById('calendarSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'flex';
}

// 10. AUTO LOGIN ON REFRESH
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('current_sheet_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        updateUserProfileUI(currentUser);

        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashSection').style.display = 'flex';

        captureLocation();
        syncAttendanceUI();
    }
});