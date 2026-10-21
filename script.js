https://script.google.com/macros/s/AKfycbxbdtpv-cAJVkvVHUSC_dspsRQWjkL0PwS4wrAm7Mc0ZcIAGXTxkqlX7-2b8n0y2gzVZg/exec
const API_URL = "PASTE_YOUR_APPS_SCRIPT_URL_HERE";

// Global App State
let allBooks = [];
let filteredBooks = [];
let allMembers = [];
let allBorrows = [];
let allGroups = [];
let displayedCount = 0;
const BOOKS_PER_PAGE = 6;
let currentUser = JSON.parse(localStorage.getItem('cbc_user')) || null;
let activeBookForAction = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-year').textContent = new Date().getFullYear();
    updateUserAuthUI();
    fetchLibraryData();

    // Search and filter listeners
    document.getElementById('search-input').addEventListener('input', handleSearchAndFilter);
    document.getElementById('category-filter').addEventListener('change', handleSearchAndFilter);
});

// Fetch all data from Google Sheets API
function fetchLibraryData() {
    const grid = document.getElementById('book-grid');
    grid.innerHTML = `
        <div class="col-span-full text-center py-16 text-church-600">
            <i class="fa-solid fa-spinner fa-spin text-3xl mb-2"></i>
            <p class="text-sm">Connecting to church library catalog...</p>
        </div>`;

    fetch(`${API_URL}?action=getAllData`)
        .then(res => res.json())
        .then(data => {
            allBooks = data.books && data.books.length > 0 ? data.books : [];
            allMembers = data.members || [];
            allBorrows = data.borrows || [];
            allGroups = data.groups || [];

            // If Google Sheet Books is empty, load fallback books.json
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
            console.error("API error:", err);
            // Fallback to local books.json
            fetch('books.json').then(r => r.json()).then(fallback => {
                allBooks = fallback;
                filteredBooks = fallback;
                initCatalog();
            });
        });
}

function initCatalog() {
    displayedCount = 0;
    document.getElementById('book-grid').innerHTML = '';
    loadMoreBooks();
}

function loadMoreBooks() {
    const grid = document.getElementById('book-grid');
    const loadMoreContainer = document.getElementById('load-more-container');
    const noResults = document.getElementById('no-results');

    if (filteredBooks.length === 0) {
        noResults.classList.remove('hidden');
        loadMoreContainer.classList.add('hidden');
        return;
    } else {
        noResults.classList.add('hidden');
    }

    const nextBatch = filteredBooks.slice(displayedCount, displayedCount + BOOKS_PER_PAGE);

    nextBatch.forEach(book => {
        const isBorrowable = (book.classification || '').toLowerCase().includes('borrowable');
        const badgeClass = isBorrowable ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';
        const copies = parseInt(book.copies) || 0;

        let shortDesc = book.description || '';
        if (shortDesc.length > 110) shortDesc = shortDesc.substring(0, 110).trim() + '...';

        // Check if book has an active group reading
        const activeGroup = allGroups.find(g => g.BookID == book.id && g.Status === 'Open');
        let groupHTML = '';
        if (activeGroup) {
            const joinedCount = activeGroup.JoinedMemberIDs ? activeGroup.JoinedMemberIDs.toString().split(',').length : 1;
            const remaining = activeGroup.MaxLimit - joinedCount;
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
                        ${book.classification}
                    </span>
                </div>
                <div class="p-5 space-y-2">
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-medium text-church-600 uppercase tracking-wide">${book.category}</span>
                        <span class="text-church-500"><i class="fa-solid fa-book-open mr-1"></i>${book.pages} pages</span>
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
    if (displayedCount >= filteredBooks.length) {
        loadMoreContainer.classList.add('hidden');
    } else {
        loadMoreContainer.classList.remove('hidden');
    }
}

function handleSearchAndFilter() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const cat = document.getElementById('category-filter').value;

    filteredBooks = allBooks.filter(book => {
        const matchesQuery = 
            (book.title || '').toLowerCase().includes(query) ||
            (book.author || '').toLowerCase().includes(query) ||
            (book.category || '').toLowerCase().includes(query);
        const matchesCat = cat === "" || book.category === cat;
        return matchesQuery && matchesCat;
    });

    initCatalog();
}

// User Auth Management (ID + Name)
function updateUserAuthUI() {
    const container = document.getElementById('user-auth-badge');
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
    const id = document.getElementById('login-id').value.trim().toUpperCase();
    const name = document.getElementById('login-name').value.trim().toLowerCase();

    if (!id || !name) {
        alert("Please enter both Member ID and Full Name.");
        return;
    }

    // Match with members fetched from Google Sheets
    const matched = allMembers.find(m => 
        m.MemberID.toString().toUpperCase() === id && 
        m.FullName.toString().trim().toLowerCase() === name
    );

    if (matched) {
        currentUser = {
            id: matched.MemberID,
            name: matched.FullName,
            designation: matched.Designation,
            phone: matched.Phone
        };
        localStorage.setItem('cbc_user', JSON.stringify(currentUser));
        updateUserAuthUI();
        closeModal('login-modal');
        checkUserDueAlerts();
        alert(`Welcome, ${currentUser.name}!`);
    } else {
        alert("Member ID and Name do not match our church records. Please contact the church librarian to get registered.");
    }
}

function logoutUser() {
    localStorage.removeItem('cbc_user');
    currentUser = null;
    updateUserAuthUI();
    document.getElementById('alert-banner').classList.add('hidden');
}

// Check for overdue or upcoming books for logged in user
function checkUserDueAlerts() {
    if (!currentUser) return;
    const userLoans = allBorrows.filter(b => b.MemberID == currentUser.id && b.Status === 'Active');
    if (userLoans.length > 0) {
        const banner = document.getElementById('alert-banner');
        const alertMsg = document.getElementById('alert-message');
        const loan = userLoans[0];
        alertMsg.innerHTML = `Reminder: You have <strong>${loan.BookTitle}</strong> checked out. Due date is <strong>${loan.DueDate}</strong>.`;
        banner.classList.remove('hidden');
    }
}

// Book Details & Action Modal
function openBookModal(book) {
    activeBookForAction = book;
    document.getElementById('modal-title').textContent = book.title;
    document.getElementById('modal-img').src = book.image;
    document.getElementById('modal-author').textContent = book.author;
    document.getElementById('modal-category').textContent = book.category;
    document.getElementById('modal-pubdate').textContent = book.publicationDate;
    document.getElementById('modal-pages').textContent = (book.pages || 'N/A') + " pages";
    document.getElementById('modal-copies').textContent = book.copies;
    document.getElementById('modal-description').textContent = book.description || 'No description available.';

    const classificationEl = document.getElementById('modal-classification');
    const isBorrowable = (book.classification || '').toLowerCase().includes('borrowable');
    const isPastor = currentUser && currentUser.designation.toLowerCase() === 'pastor';
    const copies = parseInt(book.copies) || 0;

    classificationEl.textContent = book.classification;
    classificationEl.className = isBorrowable ? "inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800" : "inline-block px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800";

    const actionBtn = document.getElementById('modal-action-btn');

    if (copies <= 0 && isBorrowable) {
        actionBtn.className = "px-4 py-2 bg-gray-400 text-white rounded-xl text-sm font-medium cursor-not-allowed";
        actionBtn.innerHTML = `<span>Out of Stock</span>`;
        actionBtn.onclick = null;
    } else if (isBorrowable) {
        actionBtn.className = "px-4 py-2 bg-church-800 hover:bg-church-900 text-white rounded-xl text-sm font-medium shadow transition";
        actionBtn.innerHTML = `<span>Request to Borrow</span>`;
        actionBtn.onclick = () => openBorrowForm(false);
    } else {
        // Onsite only book
        if (isPastor) {
            actionBtn.className = "px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-sm font-medium shadow transition";
            actionBtn.innerHTML = `<span>Borrow (Pastor Privilege)</span>`;
            actionBtn.onclick = () => openBorrowForm(true);
        } else {
            actionBtn.className = "px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-sm font-medium shadow transition";
            actionBtn.innerHTML = `<span>Schedule Onsite Reading</span>`;
            actionBtn.onclick = () => openOnsiteScheduleForm();
        }
    }

    document.getElementById('book-modal').classList.remove('hidden');
}

// Open Borrow Form
function openBorrowForm(isPastorPrivilege) {
    if (!currentUser) {
        alert("Please log in with your Member ID and Name first.");
        openLoginModal();
        return;
    }
    closeModal('book-modal');

    document.getElementById('borrow-book-title').textContent = activeBookForAction.title;
    document.getElementById('borrow-member-info').textContent = `${currentUser.name} (${currentUser.id} • ${currentUser.designation})`;

    const pickupInput = document.getElementById('borrow-pickup-date');
    const returnDisplay = document.getElementById('borrow-return-date');

    // Default to today
    const today = new Date().toISOString().split('T')[0];
    pickupInput.value = today;
    updateCalculatedDueDate(today);

    pickupInput.onchange = (e) => updateCalculatedDueDate(e.target.value);

    document.getElementById('borrow-modal').classList.remove('hidden');
}

function updateCalculatedDueDate(pickupDateStr) {
    if (!pickupDateStr) return;
    const pDate = new Date(pickupDateStr);
    pDate.setDate(pDate.getDate() + 14); // 2 weeks
    document.getElementById('borrow-return-date').textContent = pDate.toISOString().split('T')[0];
}

// Submit Borrow Request to Apps Script
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
    submitBtn.textContent = "Submitting...";

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
        submitBtn.disabled = false;
        submitBtn.textContent = "Confirm Borrow Request";
        if (res.status === "success") {
            alert(`Request received! Please pick up the book at Crosspoint Bible Church on ${pickupDate} at ${pickupTime}. Return date is: ${res.dueDate}`);
            closeModal('borrow-modal');
            fetchLibraryData();
        } else {
            alert("Error: " + res.message);
        }
    })
    .catch(err => {
        submitBtn.disabled = false;
        submitBtn.textContent = "Confirm Borrow Request";
        alert("Network error submitting request.");
    });
}

// Onsite Reading Modal
function openOnsiteScheduleForm() {
    if (!currentUser) {
        alert("Please log in with your Member ID and Name first.");
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
        alert("Please specify both date and time.");
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
        alert(`Your reading slot at Crosspoint study corner is booked for ${date} at ${time}. See you there!`);
        closeModal('onsite-modal');
        fetchLibraryData();
    });
}

// Group Reading Logic
function openGroupModal(groupId) {
    const group = allGroups.find(g => g.GroupID == groupId);
    if (!group) return;

    document.getElementById('grp-book-title').textContent = group.BookTitle;
    document.getElementById('grp-leader').textContent = group.LeaderName;
    document.getElementById('grp-notes').textContent = group.MeetingNotes || "No extra instructions.";
    
    const members = group.JoinedMemberIDs ? group.JoinedMemberIDs.toString().split(',') : [];
    document.getElementById('grp-capacity').textContent = `${members.length} / ${group.MaxLimit} members joined`;

    const joinBtn = document.getElementById('btn-join-group');
    joinBtn.onclick = () => joinGroupReading(group.GroupID);

    document.getElementById('group-modal').classList.remove('hidden');
}

function joinGroupReading(groupId) {
    if (!currentUser) {
        alert("Please log in first to join this reading group.");
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
    });
}

// Create Group Reading
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
        alert("Group reading created successfully!");
        closeModal('create-group-modal');
        fetchLibraryData();
    });
}

// Librarian Admin Panel
function checkAdminAccess() {
    const pin = prompt("Enter Librarian Admin PIN:");
    if (pin === "1234") { // Default PIN (change in production)
        document.getElementById('admin-panel').classList.remove('hidden');
        renderAdminTables();
    } else if (pin !== null) {
        alert("Incorrect PIN.");
    }
}

function renderAdminTables() {
    // 1. Members Table
    const memberTbody = document.getElementById('admin-members-tbody');
    memberTbody.innerHTML = allMembers.map(m => `
        <tr class="border-b border-church-100 text-xs">
            <td class="p-2 font-bold">${m.MemberID}</td>
            <td class="p-2">${m.FullName}</td>
            <td class="p-2">${m.Designation}</td>
            <td class="p-2">${m.Phone || '-'}</td>
            <td class="p-2">
                <button onclick="deleteMember('${m.MemberID}')" class="text-red-600 hover:text-red-800"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    // 2. Borrows & Requests Table
    const borrowsTbody = document.getElementById('admin-borrows-tbody');
    borrowsTbody.innerHTML = allBorrows.map(b => `
        <tr class="border-b border-church-100 text-xs">
            <td class="p-2 font-medium">${b.BookTitle}</td>
            <td class="p-2">${b.MemberName} (${b.MemberID})</td>
            <td class="p-2">${b.PickupDate} (${b.PickupTime})</td>
            <td class="p-2 font-bold">${b.DueDate}</td>
            <td class="p-2"><span class="px-2 py-0.5 rounded ${b.Status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${b.Status}</span></td>
            <td class="p-2 space-x-1">
                ${b.Status === 'Pending' ? `
                    <select id="cond-${b.BorrowID}" class="text-[11px] p-1 border rounded">
                        <option value="New">New</option>
                        <option value="Old">Old</option>
                        <option value="Torn">Torn</option>
                    </select>
                    <button onclick="adminIssueBook('${b.BorrowID}')" class="bg-emerald-700 text-white px-2 py-1 rounded text-[11px]">Issue</button>
                ` : ''}
                ${b.Status === 'Active' ? `
                    <button onclick="adminExtendLoan('${b.BorrowID}')" class="bg-blue-600 text-white px-2 py-1 rounded text-[11px]">+2 Wks</button>
                    <button onclick="adminReturnBook('${b.BorrowID}', '${b.BookID}', '${b.Type}')" class="bg-church-800 text-white px-2 py-1 rounded text-[11px]">Return</button>
                ` : ''}
            </td>
        </tr>
    `).join('');

    // 3. Analytics
    document.getElementById('stat-total-borrows').textContent = allBorrows.length;
    document.getElementById('stat-active-loans').textContent = allBorrows.filter(b => b.Status === 'Active').length;
    document.getElementById('stat-total-members').textContent = allMembers.length;
}

function adminRegisterMember() {
    const id = document.getElementById('new-mem-id').value.trim();
    const name = document.getElementById('new-mem-name').value.trim();
    const desig = document.getElementById('new-mem-desig').value;
    const phone = document.getElementById('new-mem-phone').value.trim();

    if (!id || !name) {
        alert("Please provide both ID and Full Name.");
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
            document.getElementById('new-mem-id').value = '';
            document.getElementById('new-mem-name').value = '';
            fetchLibraryData();
        }
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
    const cond = document.getElementById(`cond-${borrowId}`).value;
    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "issueBook", borrowId: borrowId, condition: cond })
    }).then(() => fetchLibraryData());
}

function adminExtendLoan(borrowId) {
    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "extendLoan", borrowId: borrowId })
    })
    .then(r => r.json())
    .then(res => {
        alert(res.status === "success" ? `Extended! New due date is ${res.newDueDate}` : res.message);
        fetchLibraryData();
    });
}

function adminReturnBook(borrowId, bookId, type) {
    const cond = prompt("Condition returned (New, Old, Torn, Other):", "Good");
    const penalty = prompt("Penalty warranted? (None, Late, Damaged):", "None");

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "returnBook",
            borrowId: borrowId,
            bookId: bookId,
            borrowType: type,
            condition: cond,
            penalty: penalty
        })
    }).then(() => fetchLibraryData());
}

// Modal UI Helpers
function openLoginModal() { document.getElementById('login-modal').classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openCreateGroupModal() {
    closeModal('book-modal');
    document.getElementById('create-group-modal').classList.remove('hidden');
}
