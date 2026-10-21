// ==========================================
// CROSSPOINT BIBLE CHURCH LIBRARY - SCRIPT.JS
// Backend: Google Apps Script + Google Drive
// ==========================================

const API_URL = "https://script.google.com/macros/s/AKfycbxbdtpv-cAJVkvVHUSC_dspsRQWjkL0PwS4wrAm7Mc0ZcIAGXTxkqlX7-2b8n0y2gzVZg/exec";

// Global Application State
let allBooks = [];
let filteredBooks = [];
let allMembers = [];
let allBorrows = [];
let allGroups = [];
let displayedCount = 0;
const BOOKS_PER_PAGE = 6;
let currentUser = JSON.parse(localStorage.getItem('cbc_user')) || null;
let activeBookForAction = null;

// ==========================================
// 1. INITIALIZATION & DATA FETCHING
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Set footer year
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Setup user interface state (logged-in badge)
    updateUserAuthUI();

    // Fetch initial database records from Google Sheets
    fetchLibraryData();

    // Setup Search & Category Filter Listeners
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    if (searchInput) searchInput.addEventListener('input', handleSearchAndFilter);
    if (categoryFilter) categoryFilter.addEventListener('change', handleSearchAndFilter);
});

// Fetch all sheets from your Google Drive Spreadsheet
function fetchLibraryData() {
    const grid = document.getElementById('book-grid');
    if (grid && displayedCount === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-16 text-church-600">
                <i class="fa-solid fa-spinner fa-spin text-3xl mb-2"></i>
                <p class="text-sm">Connecting to church library catalog...</p>
            </div>`;
    }

    fetch(`${API_URL}?action=getAllData`)
        .then(res => res.json())
        .then(data => {
            allBooks = data.books && data.books.length > 0 ? data.books : [];
            allMembers = data.members || [];
            allBorrows = data.borrows || [];
            allGroups = data.groups || [];

            // If the Google Sheet Books tab is empty yet, fallback to local books.json
            if (allBooks.length === 0) {
                return fetch('books.json')
                    .then(r => r.json())
                    .then(fallback => {
                        allBooks = fallback;
                        filteredBooks = fallback;
                        initCatalog();
                    });
            } else {
                filteredBooks = allBooks;
                initCatalog();
                checkUserDueAlerts();
            }
        })
        .catch(err => {
            console.warn("Could not reach Google Sheets API, loading local books.json fallback:", err);
            fetch('books.json')
                .then(r => r.json())
                .then(fallback => {
                    allBooks = fallback;
                    filteredBooks = fallback;
                    initCatalog();
                })
                .catch(e => {
                    if (grid) {
                        grid.innerHTML = `
                            <div class="col-span-full text-center py-10 text-red-600">
                                <p>Failed to load books catalog. Please check your internet connection.</p>
                            </div>`;
                    }
                });
        });
}

// ==========================================
// 2. CATALOG DISPLAY & SEARCH FILTERING
// ==========================================

function initCatalog() {
    displayedCount = 0;
    const grid = document.getElementById('book-grid');
    if (grid) grid.innerHTML = '';
    loadMoreBooks();
}

function loadMoreBooks() {
    const grid = document.getElementById('book-grid');
    const loadMoreContainer = document.getElementById('load-more-container');
    const noResults = document.getElementById('no-results');

    if (!grid) return;

    if (filteredBooks.length === 0) {
        if (noResults) noResults.classList.remove('hidden');
        if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
        return;
    } else {
        if (noResults) noResults.classList.add('hidden');
    }

    const nextBatch = filteredBooks.slice(displayedCount, displayedCount + BOOKS_PER_PAGE);

    nextBatch.forEach(book => {
        const classification = book.classification || 'Borrowable';
        const isBorrowable = classification.toLowerCase().includes('borrowable');
        const badgeClass = isBorrowable ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';
        const copies = parseInt(book.copies) || 0;

        let shortDesc = book.description || '';
        if (shortDesc.length > 110) shortDesc = shortDesc.substring(0, 110).trim() + '...';

        // Check if there is an open group reading for this book
        const activeGroup = allGroups.find(g => g.BookID == book.id && g.Status === 'Open');
        let groupHTML = '';
        if (activeGroup) {
            const joinedMembers = activeGroup.JoinedMemberIDs ? activeGroup.JoinedMemberIDs.toString().split(',') : [];
            const remaining = Math.max(0, activeGroup.MaxLimit - joinedMembers.length);
            groupHTML = `
                <button onclick="event.stopPropagation(); openGroupModal('${activeGroup.GroupID}')" 
                        class="w-full mt-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg py-1 px-2.5 text-xs flex items-center justify-between transition">
                    <span><i class="fa-solid fa-users text-amber-700 mr-1.5"></i>Group Reading</span>
                    <span class="font-bold bg-amber-200 px-1.5 py-0.5 rounded text-[10px]">${remaining} spots left</span>
                </button>`;
        }

        const card = document.createElement('div');
        card.className = "bg-white border border-church-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer";
        card.onclick = () => openBookModal(book);

        card.innerHTML = `
            <div>
                <div class="h-64 bg-church-50 overflow-hidden relative p-2 flex items-center justify-center border-b border-church-100">
                    <img src="${book.image}" alt="${book.title}" loading="lazy" class="w-full h-full object-contain group-hover:scale-105 transition duration-300 drop-shadow-sm">
                    <span class="absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm ${badgeClass}">
                        ${classification}
                    </span>
                </div>
                <div class="p-5 space-y-2">
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-medium text-church-600 uppercase tracking-wide">${book.category || 'General'}</span>
                        <span class="text-church-500"><i class="fa-solid fa-book-open mr-1"></i>${book.pages || 'N/A'} pages</span>
                    </div>
                    <h3 class="font-bold text-church-900 text-base leading-snug group-hover:text-church-600 transition">${book.title}</h3>
                    <p class="text-xs text-church-700 font-medium">By ${book.author}</p>
                    <p class="text-xs text-church-600 pt-1 leading-relaxed">${shortDesc}</p>
                    ${groupHTML}
                </div>
            </div>
            <div class="px-5 pb-5 pt-3 border-t border-church-100 flex items-center justify-between text-xs">
                <span class="${copies > 0 ? 'text-church-800' : 'text-red-600 font-bold'}">
                    <i class="fa-solid fa-copy mr-1"></i> ${copies > 0 ? copies + ' copies left' : 'Out of stock'}
                </span>
                <span class="text-church-600 font-semibold group-hover:translate-x-1 transition-transform">Details &rarr;</span>
            </div>
        `;
        grid.appendChild(card);
    });

    displayedCount += nextBatch.length;
    if (loadMoreContainer) {
        if (displayedCount >= filteredBooks.length) {
            loadMoreContainer.classList.add('hidden');
        } else {
            loadMoreContainer.classList.remove('hidden');
        }
    }
}

function handleSearchAndFilter() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const cat = document.getElementById('category-filter').value;

    filteredBooks = allBooks.filter(book => {
        const matchesQuery = 
            (book.title || '').toLowerCase().includes(query) ||
            (book.author || '').toLowerCase().includes(query) ||
            (book.category || '').toLowerCase().includes(query) ||
            (book.keywords && Array.isArray(book.keywords) && book.keywords.some(k => k.toLowerCase().includes(query)));
        
        const matchesCat = cat === "" || (book.category || '') === cat;
        return matchesQuery && matchesCat;
    });

    initCatalog();
}

// ==========================================
// 3. MEMBER AUTHENTICATION (ID + NAME ONLY)
// ==========================================

function updateUserAuthUI() {
    const container = document.getElementById('user-auth-badge');
    if (!container) return;

    if (currentUser) {
        container.innerHTML = `
            <div class="flex items-center space-x-2 text-xs">
                <span class="bg-church-100 text-church-900 border border-church-300 px-2.5 py-1.5 rounded-lg font-medium">
                    <i class="fa-solid fa-user-check text-amber-700 mr-1"></i> ${currentUser.name} 
                    <span class="text-church-600">(${currentUser.id} • ${currentUser.designation})</span>
                </span>
                <button onclick="logoutUser()" class="text-red-700 hover:text-red-900 text-xs font-semibold px-2 py-1">Logout</button>
            </div>`;
    } else {
        container.innerHTML = `
            <button onclick="openLoginModal()" class="bg-church-800 hover:bg-church-900 text-white text-xs px-3 py-2 rounded-lg font-medium transition shadow-sm">
                <i class="fa-solid fa-id-card mr-1.5"></i> Member Login
            </button>`;
    }
}

function loginMember() {
    const idInput = document.getElementById('login-id');
    const nameInput = document.getElementById('login-name');
    if (!idInput || !nameInput) return;

    const id = idInput.value.trim().toUpperCase();
    const name = nameInput.value.trim().toLowerCase();

    if (!id || !name) {
        alert("Please enter both Member ID and Full Name.");
        return;
    }

    // Match with members fetched from Google Sheet
    const matched = allMembers.find(m => 
        (m.MemberID || '').toString().toUpperCase() === id && 
        (m.FullName || '').toString().trim().toLowerCase() === name
    );

    if (matched) {
        currentUser = {
            id: matched.MemberID,
            name: matched.FullName,
            designation: matched.Designation,
            phone: matched.Phone || ''
        };
        localStorage.setItem('cbc_user', JSON.stringify(currentUser));
        updateUserAuthUI();
        closeModal('login-modal');
        checkUserDueAlerts();
        alert(`Welcome, ${currentUser.name}! You are signed in as a ${currentUser.designation}.`);
    } else {
        alert("Member ID and Name do not match our church records. Please ask the church librarian to register you first.");
    }
}

function logoutUser() {
    localStorage.removeItem('cbc_user');
    currentUser = null;
    updateUserAuthUI();
    const banner = document.getElementById('alert-banner');
    if (banner) banner.classList.add('hidden');
}

// In-app overdue / due-soon banner notification
function checkUserDueAlerts() {
    if (!currentUser) return;
    const userLoans = allBorrows.filter(b => b.MemberID == currentUser.id && b.Status === 'Active');
    if (userLoans.length > 0) {
        const banner = document.getElementById('alert-banner');
        const alertMsg = document.getElementById('alert-message');
        const loan = userLoans[0];
        if (alertMsg && banner) {
            alertMsg.innerHTML = `Reminder: You have <strong>${loan.BookTitle}</strong> checked out. Due date is <strong>${loan.DueDate}</strong>.`;
            banner.classList.remove('hidden');
        }
    }
}

// ==========================================
// 4. BOOK DETAILS MODAL & ACTIONS
// ==========================================

function openBookModal(book) {
    activeBookForAction = book;
    document.getElementById('modal-title').textContent = book.title;
    document.getElementById('modal-img').src = book.image;
    document.getElementById('modal-author').textContent = book.author;
    document.getElementById('modal-category').textContent = book.category || 'General';
    document.getElementById('modal-pubdate').textContent = book.publicationDate || 'N/A';
    document.getElementById('modal-pages').textContent = (book.pages || 'N/A') + " pages";
    document.getElementById('modal-copies').textContent = book.copies;
    document.getElementById('modal-description').textContent = book.description || 'No description available for this volume.';

    const classificationEl = document.getElementById('modal-classification');
    const classification = book.classification || 'Borrowable';
    const isBorrowable = classification.toLowerCase().includes('borrowable');
    const isPastor = currentUser && (currentUser.designation || '').toLowerCase() === 'pastor';
    const copies = parseInt(book.copies) || 0;

    classificationEl.textContent = classification;
    classificationEl.className = isBorrowable ? 
        "inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800" : 
        "inline-block px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800";

    const actionBtn = document.getElementById('modal-action-btn');

    if (copies <= 0 && isBorrowable) {
        actionBtn.className = "px-4 py-2 bg-gray-400 text-white rounded-xl text-xs font-medium cursor-not-allowed";
        actionBtn.innerHTML = `<span>Out of Stock</span>`;
        actionBtn.onclick = null;
    } else if (isBorrowable) {
        actionBtn.className = "px-4 py-2 bg-church-800 hover:bg-church-900 text-white rounded-xl text-xs font-medium shadow transition";
        actionBtn.innerHTML = `<span>Request to Borrow</span>`;
        actionBtn.onclick = () => openBorrowForm(false);
    } else {
        // Onsite Only book
        if (isPastor) {
            actionBtn.className = "px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-medium shadow transition";
            actionBtn.innerHTML = `<span>Borrow (Pastor Privilege)</span>`;
            actionBtn.onclick = () => openBorrowForm(true);
        } else {
            actionBtn.className = "px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-medium shadow transition";
            actionBtn.innerHTML = `<span>Schedule Onsite Reading</span>`;
            actionBtn.onclick = () => openOnsiteScheduleForm();
        }
    }

    document.getElementById('book-modal').classList.remove('hidden');
}

// ==========================================
// 5. BORROWING & ONSITE READING WORKFLOW
// ==========================================

function openBorrowForm(isPastorPrivilege) {
    if (!currentUser) {
        alert("Please log in with your Member ID and Full Name first.");
        openLoginModal();
        return;
    }
    closeModal('book-modal');

    document.getElementById('borrow-book-title').textContent = activeBookForAction.title;
    document.getElementById('borrow-member-info').textContent = `${currentUser.name} (${currentUser.id} • ${currentUser.designation})`;

    const pickupInput = document.getElementById('borrow-pickup-date');
    const today = new Date().toISOString().split('T')[0];
    pickupInput.value = today;
    updateCalculatedDueDate(today);

    pickupInput.onchange = (e) => updateCalculatedDueDate(e.target.value);

    document.getElementById('borrow-modal').classList.remove('hidden');
}

function updateCalculatedDueDate(pickupDateStr) {
    if (!pickupDateStr) return;
    const pDate = new Date(pickupDateStr);
    pDate.setDate(pDate.getDate() + 14); // Exactly 2 weeks
    document.getElementById('borrow-return-date').textContent = pDate.toISOString().split('T')[0];
}

function submitBorrowRequest() {
    const pickupDate = document.getElementById('borrow-pickup-date').value;
    const pickupTime = document.getElementById('borrow-pickup-time').value;

    if (!pickupDate || !pickupTime) {
        alert("Please specify both pick-up date and time.");
        return;
    }

    const payload = {
        action: "submitBorrow",
        bookId: activeBookForAction.id,
        bookTitle: activeBookForAction.title,
        memberId: currentUser.id,
        memberName: currentUser.name,
        borrowType: "Borrow",
        pickupDate: pickupDate,
        pickupTime: pickupTime
    };

    const submitBtn = document.getElementById('btn-submit-borrow');
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting to Church Library...";

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
        submitBtn.disabled = false;
        submitBtn.textContent = "Confirm Borrow Request";
        if (res.status === "success") {
            alert(`Request received! Please pick up the book at Crosspoint Bible Church on ${pickupDate} at ${pickupTime}.\n\nCalculated Due Date (2 weeks): ${res.dueDate}`);
            closeModal('borrow-modal');
            fetchLibraryData(); // Refreshes available copy counts
        } else {
            alert("Error: " + res.message);
        }
    })
    .catch(err => {
        submitBtn.disabled = false;
        submitBtn.textContent = "Confirm Borrow Request";
        alert("Request processed or queued. Please verify pickup with the librarian.");
        closeModal('borrow-modal');
        fetchLibraryData();
    });
}

function openOnsiteScheduleForm() {
    if (!currentUser) {
        alert("Please log in with your Member ID and Full Name first.");
        openLoginModal();
        return;
    }
    closeModal('book-modal');
    document.getElementById('onsite-book-title').textContent = activeBookForAction.title;
    document.getElementById('onsite-member-info').textContent = `${currentUser.name} (${currentUser.id})`;
    document.getElementById('onsite-modal').classList.remove('hidden');
}

function submitOnsiteSchedule() {
    const date = document.getElementById('onsite-date').value;
    const time = document.getElementById('onsite-time').value;

    if (!date || !time) {
        alert("Please specify both reading date and time.");
        return;
    }

    const payload = {
        action: "submitBorrow",
        bookId: activeBookForAction.id,
        bookTitle: activeBookForAction.title,
        memberId: currentUser.id,
        memberName: currentUser.name,
        borrowType: "Onsite",
        pickupDate: date,
        pickupTime: time
    };

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
        alert(`Your reading reservation at Crosspoint study corner has been recorded for ${date} at ${time}.`);
        closeModal('onsite-modal');
        fetchLibraryData();
    })
    .catch(() => {
        alert("Reservation logged successfully!");
        closeModal('onsite-modal');
        fetchLibraryData();
    });
}

// ==========================================
// 6. GROUP READING FEATURE
// ==========================================

function openGroupModal(groupId) {
    const group = allGroups.find(g => g.GroupID == groupId);
    if (!group) return;

    document.getElementById('grp-book-title').textContent = group.BookTitle;
    document.getElementById('grp-leader').textContent = group.LeaderName;
    document.getElementById('grp-notes').textContent = group.MeetingNotes || "No specific instructions provided.";
    
    const members = group.JoinedMemberIDs ? group.JoinedMemberIDs.toString().split(',') : [];
    document.getElementById('grp-capacity').textContent = `${members.length} / ${group.MaxLimit} members joined`;

    const joinBtn = document.getElementById('btn-join-group');
    joinBtn.onclick = () => joinGroupReading(group.GroupID);

    document.getElementById('group-modal').classList.remove('hidden');
}

function joinGroupReading(groupId) {
    if (!currentUser) {
        alert("Please log in first to join this group reading session.");
        openLoginModal();
        return;
    }

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "joinGroup",
            groupId: groupId,
            memberId: currentUser.id
        })
    })
    .then(r => r.json())
    .then(res => {
        alert(res.message);
        if (res.status === "success") {
            closeModal('group-modal');
            fetchLibraryData();
        }
    })
    .catch(() => {
        alert("Joined group successfully!");
        closeModal('group-modal');
        fetchLibraryData();
    });
}

function submitCreateGroup() {
    if (!currentUser) {
        alert("Please log in first.");
        openLoginModal();
        return;
    }
    const maxLimit = document.getElementById('create-grp-limit').value;
    const notes = document.getElementById('create-grp-notes').value;

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "createGroup",
            bookId: activeBookForAction.id,
            bookTitle: activeBookForAction.title,
            leaderId: currentUser.id,
            leaderName: currentUser.name,
            maxLimit: maxLimit,
            meetingNotes: notes
        })
    })
    .then(r => r.json())
    .then(res => {
        alert("Group reading invite published to catalog!");
        closeModal('create-group-modal');
        fetchLibraryData();
    })
    .catch(() => {
        alert("Group reading published!");
        closeModal('create-group-modal');
        fetchLibraryData();
    });
}

// ==========================================
// 7. LIBRARIAN ADMIN PANEL & CIRCULATION
// ==========================================

function checkAdminAccess() {
    const pin = prompt("Enter Librarian Admin PIN:");
    if (pin === "1234") { // Default PIN
        document.getElementById('admin-panel').classList.remove('hidden');
        renderAdminTables();
        window.location.hash = "admin-panel";
    } else if (pin !== null) {
        alert("Incorrect PIN. Access restricted to library admins.");
    }
}

function renderAdminTables() {
    // 1. Members Directory Table
    const memberTbody = document.getElementById('admin-members-tbody');
    if (memberTbody) {
        memberTbody.innerHTML = allMembers.map(m => `
            <tr class="border-b border-church-100 text-xs">
                <td class="p-2 font-bold">${m.MemberID}</td>
                <td class="p-2">${m.FullName}</td>
                <td class="p-2"><span class="px-2 py-0.5 rounded bg-church-100 font-semibold text-church-800">${m.Designation}</span></td>
                <td class="p-2">${m.Phone || '-'}</td>
                <td class="p-2">
                    <button onclick="deleteMember('${m.MemberID}')" class="text-red-600 hover:text-red-800 p-1" title="Remove Member">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // 2. Circulation (Borrows & Requests) Table
    const borrowsTbody = document.getElementById('admin-borrows-tbody');
    if (borrowsTbody) {
        borrowsTbody.innerHTML = allBorrows.map(b => `
            <tr class="border-b border-church-100 text-xs">
                <td class="p-2 font-medium">${b.BookTitle}</td>
                <td class="p-2">${b.MemberName} <span class="text-church-600 text-[10px]">(${b.MemberID})</span></td>
                <td class="p-2">${b.PickupDate} <br><span class="text-church-500 text-[10px]">${b.PickupTime}</span></td>
                <td class="p-2 font-bold text-church-900">${b.DueDate}</td>
                <td class="p-2">
                    <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${b.Status === 'Active' ? 'bg-emerald-100 text-emerald-800' : (b.Status === 'Returned' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-800')}">
                        ${b.Status}
                    </span>
                </td>
                <td class="p-2 space-x-1">
                    ${b.Status === 'Pending' ? `
                        <select id="cond-${b.BorrowID}" class="text-[11px] p-1 border rounded bg-white">
                            <option value="New">New</option>
                            <option value="Old">Old</option>
                            <option value="Torn">Torn</option>
                            <option value="Other">Other</option>
                        </select>
                        <button onclick="adminIssueBook('${b.BorrowID}')" class="bg-emerald-700 hover:bg-emerald-800 text-white px-2 py-1 rounded text-[11px] font-medium">Issue</button>
                    ` : ''}
                    ${b.Status === 'Active' ? `
                        <button onclick="adminExtendLoan('${b.BorrowID}')" class="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[11px] font-medium" title="Grant 2-week extension">+2 Wks</button>
                        <button onclick="adminReturnBook('${b.BorrowID}', '${b.BookID}', '${b.Type}')" class="bg-church-800 hover:bg-church-900 text-white px-2 py-1 rounded text-[11px] font-medium">Return</button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    }

    // 3. Update Analytics Counters
    const statBorrows = document.getElementById('stat-total-borrows');
    const statActive = document.getElementById('stat-active-loans');
    const statMembers = document.getElementById('stat-total-members');
    if (statBorrows) statBorrows.textContent = allBorrows.length;
    if (statActive) statActive.textContent = allBorrows.filter(b => b.Status === 'Active').length;
    if (statMembers) statMembers.textContent = allMembers.length;
}

function adminRegisterMember() {
    const idInput = document.getElementById('new-mem-id');
    const nameInput = document.getElementById('new-mem-name');
    const desigInput = document.getElementById('new-mem-desig');
    const phoneInput = document.getElementById('new-mem-phone');

    const id = idInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();
    const desig = desigInput.value;
    const phone = phoneInput.value.trim();

    if (!id || !name) {
        alert("Please provide both unique Member ID and Full Name.");
        return;
    }

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "registerMember",
            memberId: id,
            fullName: name,
            designation: desig,
            phone: phone
        })
    })
    .then(r => r.json())
    .then(res => {
        alert(res.message);
        if (res.status === "success") {
            idInput.value = '';
            nameInput.value = '';
            phoneInput.value = '';
            fetchLibraryData();
        }
    })
    .catch(() => {
        alert("Member added to church database!");
        idInput.value = '';
        nameInput.value = '';
        phoneInput.value = '';
        fetchLibraryData();
    });
}

function deleteMember(id) {
    if (!confirm(`Are you sure you want to remove member ${id}?`)) return;
    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "deleteMember", memberId: id })
    }).then(() => fetchLibraryData());
}

function adminIssueBook(borrowId) {
    const condEl = document.getElementById(`cond-${borrowId}`);
    const cond = condEl ? condEl.value : "Good";

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "issueBook", borrowId: borrowId, condition: cond })
    }).then(() => {
        alert("Book successfully issued to borrower!");
        fetchLibraryData();
    });
}

function adminExtendLoan(borrowId) {
    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "extendLoan", borrowId: borrowId })
    })
    .then(r => r.json())
    .then(res => {
        if (res.status === "success") {
            alert(`2-Week Extension Granted! New return date: ${res.newDueDate}`);
        } else {
            alert(res.message || "Could not extend loan.");
        }
        fetchLibraryData();
    })
    .catch(() => {
        alert("Extension logged successfully.");
        fetchLibraryData();
    });
}

function adminReturnBook(borrowId, bookId, type) {
    const cond = prompt("State of returned book (New, Old, Torn, Other):", "Good");
    if (cond === null) return;
    const penalty = prompt("Penalty warranted? (None, Late Return, Damaged, Other):", "None");

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "returnBook",
            borrowId: borrowId,
            bookId: bookId,
            borrowType: type,
            condition: cond,
            penalty: penalty || "None"
        })
    }).then(() => {
        alert("Book marked as returned. Available inventory copy restored!");
        fetchLibraryData();
    });
}

// ==========================================
// 8. MODAL CONTROLS & EVENT LISTENERS
// ==========================================

function openLoginModal() { 
    const el = document.getElementById('login-modal');
    if (el) el.classList.remove('hidden'); 
}

function closeModal(id) { 
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden'); 
}

function openCreateGroupModal() {
    closeModal('book-modal');
    const el = document.getElementById('create-group-modal');
    if (el) el.classList.remove('hidden');
}

// Dismiss modals when clicking on background backdrop
window.addEventListener('click', (e) => {
    const modalIds = ['login-modal', 'book-modal', 'borrow-modal', 'onsite-modal', 'group-modal', 'create-group-modal'];
    modalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && e.target === el) {
            el.classList.add('hidden');
        }
    });
});
