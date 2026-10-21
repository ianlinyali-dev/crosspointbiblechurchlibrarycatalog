// ==========================================
// CROSSPOINT BIBLE CHURCH LIBRARY - SCRIPT.JS
// ==========================================

const API_URL = "https://script.google.com/macros/s/AKfycbxbdtpv-cAJVkvVHUSC_dspsRQWjkL0PwS4wrAm7Mc0ZcIAGXTxkqlX7-2b8n0y2gzVZg/exec";

// App State
let allBooks = [];
let filteredBooks = [];
let allMembers = [];
let allBorrows = [];
let allGroups = [];
let displayedCount = 0;
const BOOKS_PER_PAGE = 6;
let currentUser = JSON.parse(localStorage.getItem('cbc_user')) || null;
let isLibrarianActive = sessionStorage.getItem('cbc_librarian_active') === 'true';
let activeBookForAction = null;

// Modal Action Targets
let targetIssueBorrow = null;
let targetReturnBorrow = null;
let currentCirculationFilter = 'All';

document.addEventListener('DOMContentLoaded', () => {
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    updateUserAuthUI();
    updateLibrarianUI();
    fetchLibraryData();

    // Catalog search & filter
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    if (searchInput) searchInput.addEventListener('input', handleSearchAndFilter);
    if (categoryFilter) categoryFilter.addEventListener('change', handleSearchAndFilter);

    // Issue condition other box toggle
    const issueSelect = document.getElementById('issue-condition-select');
    if (issueSelect) {
        issueSelect.addEventListener('change', (e) => {
            const box = document.getElementById('issue-condition-other-box');
            if (box) box.classList.toggle('hidden', e.target.value !== 'Other');
        });
    }
});

// Helper: Normalize Date strings
function cleanDate(val) {
    if (!val) return '—';
    const str = String(val).trim();
    if (str.includes('T')) return str.split('T')[0];
    return str;
}

// Fetch all sheets from Google Apps Script
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
            const rawBooks = data.books || [];
            allMembers = data.members || [];
            allBorrows = data.borrows || [];
            allGroups = data.groups || [];

            if (rawBooks.length === 0) {
                fetch('books.json')
                    .then(r => r.json())
                    .then(fallback => {
                        allBooks = fallback.map(normalizeBook);
                        filteredBooks = allBooks;
                        initCatalog();
                        // Seed back into Google Sheet
                        fetch(API_URL, {
                            method: "POST",
                            body: JSON.stringify({ action: "seedBooks", books: fallback })
                        });
                    });
            } else {
                allBooks = rawBooks.map(normalizeBook);
                filteredBooks = allBooks;
                initCatalog();
            }

            checkUserDueAlerts();
            if (isLibrarianActive) renderAdminTables();
        })
        .catch(err => {
            console.warn("API Error, fallback to books.json:", err);
            fetch('books.json')
                .then(r => r.json())
                .then(fallback => {
                    allBooks = fallback.map(normalizeBook);
                    filteredBooks = allBooks;
                    initCatalog();
                });
        });
}

function normalizeBook(raw) {
    return {
        id: raw.id || raw.BookID || 1,
        title: raw.title || raw.Title || 'Untitled',
        author: raw.author || raw.Author || 'Unknown Author',
        category: raw.category || raw.Category || 'General',
        publicationDate: raw.publicationDate || raw.PublicationDate || 'N/A',
        copies: (raw.AvailableCopies !== undefined && raw.AvailableCopies !== "") ? parseInt(raw.AvailableCopies) : (parseInt(raw.copies) || 1),
        pages: raw.pages || raw.Pages || 'N/A',
        classification: raw.classification || raw.Classification || 'Borrowable',
        description: raw.description || raw.Description || '',
        image: raw.image || raw.ImageURL || 'images/churchdiscipline.jpeg'
    };
}

// Catalog Card Renderer
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
        const isBorrowable = (book.classification || '').toLowerCase().includes('borrowable');
        const badgeClass = isBorrowable ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';
        const copies = parseInt(book.copies) || 0;

        let shortDesc = book.description || '';
        if (shortDesc.length > 110) shortDesc = shortDesc.substring(0, 110).trim() + '...';

        const activeGroup = allGroups.find(g => g.BookID == book.id && g.Status === 'Open');
        let groupHTML = '';
        if (activeGroup) {
            const joinedMembers = activeGroup.JoinedMemberIDs ? activeGroup.JoinedMemberIDs.toString().split(',').filter(Boolean) : [];
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
            (book.category || '').toLowerCase().includes(query);
        const matchesCat = cat === "" || (book.category || '') === cat;
        return matchesQuery && matchesCat;
    });

    initCatalog();
}

// ==========================================
// USER AUTH & "MY REQUESTS" DASHBOARD
// ==========================================

function updateUserAuthUI() {
    const container = document.getElementById('user-auth-badge');
    if (!container) return;

    if (currentUser) {
        container.innerHTML = `
            <div class="flex items-center space-x-2 text-xs">
                <button onclick="openMyRequestsModal()" class="bg-church-100 hover:bg-church-200 border border-church-300 px-3 py-1.5 rounded-xl font-bold text-church-900 flex items-center gap-1.5 shadow-sm">
                    <i class="fa-solid fa-user-circle text-amber-700"></i> ${currentUser.name}
                    <span class="bg-amber-200 text-church-800 px-1.5 py-0.5 rounded text-[10px] uppercase">${currentUser.designation}</span>
                </button>
                <button onclick="logoutUser()" class="text-red-600 hover:text-red-800 text-xs font-semibold px-2">Logout</button>
            </div>`;
    } else {
        container.innerHTML = `
            <button onclick="openLoginModal()" class="bg-church-800 hover:bg-church-900 text-white text-xs px-3.5 py-2 rounded-xl font-bold transition shadow-sm flex items-center gap-1.5">
                <i class="fa-solid fa-id-card"></i> Member Sign In
            </button>`;
    }
}

function loginMember() {
    const id = document.getElementById('login-id').value.trim().toUpperCase();
    const name = document.getElementById('login-name').value.trim().toLowerCase();

    if (!id || !name) {
        alert("Please provide both Member ID and Full Name.");
        return;
    }

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
        alert(`Welcome back, ${currentUser.name}!`);
    } else {
        alert("Credentials not found in church records. Please contact the church librarian to get registered.");
    }
}

function logoutUser() {
    localStorage.removeItem('cbc_user');
    currentUser = null;
    updateUserAuthUI();
    document.getElementById('alert-banner').classList.add('hidden');
}

// Display Member's personal loan requests status
function openMyRequestsModal() {
    if (!currentUser) return;
    const list = document.getElementById('my-requests-list');
    const myLoans = allBorrows.filter(b => b.MemberID == currentUser.id);

    if (myLoans.length === 0) {
        list.innerHTML = `<p class="text-church-600 py-6 text-center italic">You have no active loan requests or borrowed books.</p>`;
    } else {
        list.innerHTML = myLoans.map(b => {
            let statusBadge = '';
            if (b.Status === 'Pending') {
                statusBadge = `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">🟡 Pending Librarian Approval</span>`;
            } else if (b.Status === 'Approved') {
                statusBadge = `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">🔵 Approved (Ready for Pickup at Church)</span>`;
            } else if (b.Status === 'Active') {
                statusBadge = `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">🟢 Active Loan (Due: ${cleanDate(b.DueDate)})</span>`;
            } else {
                statusBadge = `<span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">Returned</span>`;
            }

            return `
                <div class="p-3 bg-church-50 rounded-xl border border-church-200 flex justify-between items-center">
                    <div>
                        <p class="font-bold text-church-900">${b.BookTitle}</p>
                        <p class="text-[11px] text-church-600">Pickup Date: ${cleanDate(b.PickupDate)} (${b.PickupTime || '10:00'})</p>
                    </div>
                    <div>${statusBadge}</div>
                </div>`;
        }).join('');
    }

    document.getElementById('my-requests-modal').classList.remove('hidden');
}

function checkUserDueAlerts() {
    if (!currentUser) return;
    const userLoans = allBorrows.filter(b => b.MemberID == currentUser.id && b.Status === 'Active');
    const banner = document.getElementById('alert-banner');
    const msg = document.getElementById('alert-message');

    if (userLoans.length > 0 && banner && msg) {
        const loan = userLoans[0];
        msg.innerHTML = `<strong>Loan Notice:</strong> You currently have <em>"${loan.BookTitle}"</em> checked out. Return Due Date: <strong>${cleanDate(loan.DueDate)}</strong>.`;
        banner.classList.remove('hidden');
    }
}

// ==========================================
// BORROWING & DETAILS WORKFLOW
// ==========================================

function openBookModal(book) {
    activeBookForAction = book;
    document.getElementById('modal-title').textContent = book.title;
    document.getElementById('modal-img').src = book.image;
    document.getElementById('modal-author').textContent = book.author;
    document.getElementById('modal-category').textContent = book.category;
    document.getElementById('modal-pubdate').textContent = book.publicationDate;
    document.getElementById('modal-pages').textContent = book.pages + " pages";
    document.getElementById('modal-copies').textContent = book.copies;
    document.getElementById('modal-description').textContent = book.description || 'No description available.';

    const classificationEl = document.getElementById('modal-classification');
    const isBorrowable = (book.classification || '').toLowerCase().includes('borrowable');
    const isPastor = currentUser && (currentUser.designation || '').toLowerCase() === 'pastor';
    const copies = parseInt(book.copies) || 0;

    classificationEl.textContent = book.classification;
    classificationEl.className = isBorrowable ? "inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800" : "inline-block px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800";

    const actionBtn = document.getElementById('modal-action-btn');

    if (copies <= 0 && isBorrowable) {
        actionBtn.className = "px-4 py-2 bg-gray-400 text-white rounded-xl text-xs font-bold cursor-not-allowed";
        actionBtn.innerHTML = `<span>Out of Stock</span>`;
        actionBtn.onclick = null;
    } else if (isBorrowable) {
        actionBtn.className = "px-4 py-2 bg-church-800 hover:bg-church-900 text-white rounded-xl text-xs font-bold shadow transition";
        actionBtn.innerHTML = `<span>Request to Borrow</span>`;
        actionBtn.onclick = () => openBorrowForm(false);
    } else {
        if (isPastor) {
            actionBtn.className = "px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow transition";
            actionBtn.innerHTML = `<span>Borrow (Pastor Privilege)</span>`;
            actionBtn.onclick = () => openBorrowForm(true);
        } else {
            actionBtn.className = "px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold shadow transition";
            actionBtn.innerHTML = `<span>Schedule Onsite Reading</span>`;
            actionBtn.onclick = () => openOnsiteScheduleForm();
        }
    }

    document.getElementById('book-modal').classList.remove('hidden');
}

function openBorrowForm(isPastorPrivilege) {
    if (!currentUser) {
        alert("Please sign in with your Member ID and Full Name first.");
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
    pDate.setDate(pDate.getDate() + 14);
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
        memberPhone: currentUser.phone || '',
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
            alert(`Borrow request sent to the church librarian! Status: PENDING APPROVAL.\n\nYou can track this under 'My Book Requests'.`);
            closeModal('borrow-modal');
            fetchLibraryData();
        } else {
            alert("Error: " + res.message);
        }
    })
    .catch(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = "Confirm Borrow Request";
        alert("Request processed! Please confirm pickup with the church librarian.");
        closeModal('borrow-modal');
        fetchLibraryData();
    });
}

function openOnsiteScheduleForm() {
    if (!currentUser) {
        alert("Please sign in with your Member ID and Full Name first.");
        openLoginModal();
        return;
    }
    closeModal('book-modal');
    document.getElementById('onsite-book-title').textContent = activeBookForAction.title;
    document.getElementById('onsite-modal').classList.remove('hidden');
}

function submitOnsiteSchedule() {
    const date = document.getElementById('onsite-date').value;
    const time = document.getElementById('onsite-time').value;
    if (!date || !time) {
        alert("Please specify reading date and time.");
        return;
    }

    const payload = {
        action: "submitBorrow",
        bookId: activeBookForAction.id,
        bookTitle: activeBookForAction.title,
        memberId: currentUser.id,
        memberName: currentUser.name,
        memberPhone: currentUser.phone || '',
        borrowType: "Onsite",
        pickupDate: date,
        pickupTime: time
    };

    fetch(API_URL, { method: "POST", body: JSON.stringify(payload) })
        .then(() => {
            alert(`Your reading desk reservation for ${date} at ${time} is recorded!`);
            closeModal('onsite-modal');
            fetchLibraryData();
        });
}

// ==========================================
// LIBRARIAN PORTAL MANAGEMENT & TABS
// ==========================================

function toggleLibrarianAccess() {
    if (isLibrarianActive) {
        exitLibrarianConsole();
        return;
    }
    const pin = prompt("Enter Librarian Admin PIN:");
    if (pin === "1234") {
        isLibrarianActive = true;
        sessionStorage.setItem('cbc_librarian_active', 'true');
        updateLibrarianUI();
        renderAdminTables();
        window.location.hash = "admin-panel";
    } else if (pin !== null) {
        alert("Incorrect PIN. Access denied.");
    }
}

function exitLibrarianConsole() {
    isLibrarianActive = false;
    sessionStorage.removeItem('cbc_librarian_active');
    updateLibrarianUI();
    window.location.hash = "catalog";
}

function updateLibrarianUI() {
    const panel = document.getElementById('admin-panel');
    const btnLabel = document.getElementById('librarian-btn-label');
    const toggleBtn = document.getElementById('btn-librarian-toggle');

    if (isLibrarianActive) {
        if (panel) panel.classList.remove('hidden');
        if (btnLabel) btnLabel.textContent = "Exit Librarian Mode";
        if (toggleBtn) toggleBtn.className = "bg-amber-100 border border-amber-300 text-amber-900 text-xs px-3 py-2 rounded-xl font-bold transition flex items-center space-x-1.5 shadow-sm";
    } else {
        if (panel) panel.classList.add('hidden');
        if (btnLabel) btnLabel.textContent = "Librarian";
        if (toggleBtn) toggleBtn.className = "border border-church-300 hover:border-church-700 text-church-800 text-xs px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 shadow-sm";
    }
}

function switchAdminTab(tabName) {
    const tabs = ['circulation', 'members', 'analytics'];
    tabs.forEach(t => {
        const win = document.getElementById(`admin-window-${t}`);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (win) win.classList.toggle('hidden', t !== tabName);
        if (btn) {
            if (t === tabName) {
                btn.className = "admin-tab-btn active px-4 py-2 rounded-xl text-xs font-bold bg-church-800 text-white shadow-sm flex items-center gap-2";
            } else {
                btn.className = "admin-tab-btn px-4 py-2 rounded-xl text-xs font-bold bg-church-100 text-church-800 hover:bg-church-200 flex items-center gap-2";
            }
        }
    });

    if (tabName === 'analytics') {
        applyAnalyticsTimelineFilter();
    }
}

function filterCirculationStatus(status) {
    currentCirculationFilter = status;
    document.querySelectorAll('.circ-filter-btn').forEach(b => {
        if (b.textContent.trim().startsWith(status)) {
            b.className = "circ-filter-btn active text-xs px-3 py-1 rounded-lg bg-church-200 font-bold";
        } else {
            b.className = "circ-filter-btn text-xs px-3 py-1 rounded-lg bg-church-100 hover:bg-church-200";
        }
    });
    renderCirculationTable();
}

function renderAdminTables() {
    renderCirculationTable();
    renderMembersTable();
    applyAnalyticsTimelineFilter();
}

// 1. Circulation Table Renderer
function renderCirculationTable() {
    const tbody = document.getElementById('admin-borrows-tbody');
    const badgePending = document.getElementById('badge-pending-count');
    if (!tbody) return;

    const pendingCount = allBorrows.filter(b => b.Status === 'Pending').length;
    if (badgePending) badgePending.textContent = pendingCount;

    let displayList = allBorrows;
    if (currentCirculationFilter !== 'All') {
        displayList = allBorrows.filter(b => b.Status === currentCirculationFilter);
    }

    if (displayList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-church-500 italic">No borrowing records match this category.</td></tr>`;
        return;
    }

    tbody.innerHTML = displayList.map(b => {
        // Status Badge
        let statusBadge = '';
        if (b.Status === 'Pending') statusBadge = `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">Pending Approval</span>`;
        else if (b.Status === 'Approved') statusBadge = `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">Approved / Ready</span>`;
        else if (b.Status === 'Active') statusBadge = `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">Active Loan</span>`;
        else statusBadge = `<span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">Returned</span>`;

        // Action Buttons
        let actionButtons = '';
        if (b.Status === 'Pending') {
            actionButtons = `
                <button onclick="adminApproveRequest('${b.BorrowID}', '${b.MemberPhone}', '${b.MemberName}', '${b.BookTitle}')" class="bg-blue-700 hover:bg-blue-800 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition">
                    Approve
                </button>`;
        } else if (b.Status === 'Approved') {
            actionButtons = `
                <button onclick="openIssueModal('${b.BorrowID}')" class="bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition">
                    Issue Book
                </button>`;
        } else if (b.Status === 'Active') {
            actionButtons = `
                <button onclick="adminExtendLoan('${b.BorrowID}')" class="bg-church-600 hover:bg-church-700 text-white px-2 py-1 rounded-lg text-xs font-semibold mr-1" title="Extend return date by 2 weeks">
                    +2 Wks
                </button>
                <button onclick="openReturnModal('${b.BorrowID}')" class="bg-church-900 hover:bg-black text-white px-2.5 py-1 rounded-lg text-xs font-bold transition">
                    Return
                </button>`;
        }

        // WhatsApp Triggers
        const waPickup = `sendWhatsAppDirect('${b.MemberPhone}', 'approved', '${b.BookTitle}', '${b.MemberName}')`;
        const waReminder = `sendWhatsAppDirect('${b.MemberPhone}', 'dueSoon', '${b.BookTitle}', '${b.MemberName}', '${cleanDate(b.DueDate)}')`;

        return `
            <tr class="hover:bg-church-50 transition">
                <td class="p-3 font-bold text-church-900">${b.BookTitle}</td>
                <td class="p-3">
                    <p class="font-medium">${b.MemberName}</p>
                    <p class="text-[10px] text-church-600">${b.MemberID} • ${b.MemberPhone || 'No Phone'}</p>
                </td>
                <td class="p-3 text-church-700">${cleanDate(b.PickupDate)}<br><span class="text-[10px] text-church-500">${b.PickupTime || '10:00'}</span></td>
                <td class="p-3 font-bold text-church-900">${cleanDate(b.DueDate)}</td>
                <td class="p-3">${statusBadge}</td>
                <td class="p-3 text-church-600 text-[11px]">${b.ConditionIssued || '—'}</td>
                <td class="p-3 space-x-1">
                    <button onclick="${waPickup}" class="text-emerald-700 hover:text-emerald-900 p-1 border rounded bg-emerald-50" title="Send WhatsApp: Ready for Pickup">
                        <i class="fa-brands fa-whatsapp text-sm"></i> Ready
                    </button>
                    ${b.Status === 'Active' ? `
                        <button onclick="${waReminder}" class="text-amber-700 hover:text-amber-900 p-1 border rounded bg-amber-50" title="Send WhatsApp: Due Soon Reminder">
                            <i class="fa-solid fa-clock text-sm"></i> Due
                        </button>
                    ` : ''}
                </td>
                <td class="p-3 text-right space-x-1">${actionButtons}</td>
            </tr>`;
    }).join('');
}

// 2. Members Table Renderer
function renderMembersTable() {
    const tbody = document.getElementById('admin-members-tbody');
    if (!tbody) return;

    tbody.innerHTML = allMembers.map(m => `
        <tr class="hover:bg-church-50 transition">
            <td class="p-3 font-bold text-church-900">${m.MemberID}</td>
            <td class="p-3 font-medium">${m.FullName}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded bg-church-100 font-semibold">${m.Designation}</span></td>
            <td class="p-3">${m.Phone || '—'}</td>
            <td class="p-3">
                ${m.Phone ? `
                    <button onclick="sendCustomWhatsApp('${m.Phone}', '${m.FullName}')" class="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1">
                        <i class="fa-brands fa-whatsapp text-sm"></i> Message
                    </button>
                ` : '—'}
            </td>
            <td class="p-3 text-right">
                <button onclick="deleteMember('${m.MemberID}')" class="text-red-600 hover:text-red-800 p-1" title="Remove Member">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// 3. Timeline & Analytics Filter
function applyAnalyticsTimelineFilter() {
    const fromInput = document.getElementById('analytics-date-from');
    const toInput = document.getElementById('analytics-date-to');
    const queryInput = document.getElementById('analytics-search-query');
    const tbody = document.getElementById('analytics-borrows-tbody');

    const fromDate = fromInput && fromInput.value ? new Date(fromInput.value) : null;
    const toDate = toInput && toInput.value ? new Date(toInput.value) : null;
    const q = queryInput ? queryInput.value.toLowerCase().trim() : '';

    const filtered = allBorrows.filter(b => {
        const pDate = new Date(b.PickupDate);
        if (fromDate && pDate < fromDate) return false;
        if (toDate && pDate > toDate) return false;
        if (q) {
            const titleMatch = (b.BookTitle || '').toLowerCase().includes(q);
            const memberMatch = (b.MemberName || '').toLowerCase().includes(q);
            if (!titleMatch && !memberMatch) return false;
        }
        return true;
    });

    if (tbody) {
        tbody.innerHTML = filtered.map(b => `
            <tr>
                <td class="p-3 font-bold text-church-900">${b.BookTitle}</td>
                <td class="p-3">${b.MemberName} (${b.MemberID})</td>
                <td class="p-3">${cleanDate(b.PickupDate)}</td>
                <td class="p-3 font-bold">${cleanDate(b.DueDate)}</td>
                <td class="p-3"><span class="px-2 py-0.5 rounded bg-church-100 font-semibold">${b.Status}</span></td>
                <td class="p-3 text-church-600">${b.ConditionReturned || b.ConditionIssued || 'Good'} • Penalty: ${b.Penalty || 'None'}</td>
            </tr>
        `).join('');
    }

    // Stats
    document.getElementById('stat-period-borrows').textContent = filtered.length;
    document.getElementById('stat-total-members').textContent = allMembers.length;

    // Top Book calculation
    const counts = {};
    filtered.forEach(b => { counts[b.BookTitle] = (counts[b.BookTitle] || 0) + 1; });
    let topBook = "None";
    let max = 0;
    for (let title in counts) {
        if (counts[title] > max) { max = counts[title]; topBook = title; }
    }
    document.getElementById('stat-top-book').textContent = topBook;
}

// ==========================================
// LIBRARIAN CIRCULATION ACTIONS
// ==========================================

function adminApproveRequest(borrowId, phone, name, title) {
    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "approveBorrow", borrowId: borrowId })
    })
    .then(r => r.json())
    .then(res => {
        alert(res.message);
        if (confirm("Would you like to send a WhatsApp notification to the member confirming their approval?")) {
            sendWhatsAppDirect(phone, 'approved', title, name);
        }
        fetchLibraryData();
    });
}

function openIssueModal(borrowId) {
    const borrow = allBorrows.find(b => b.BorrowID === borrowId);
    if (!borrow) return;
    targetIssueBorrow = borrow;
    document.getElementById('issue-modal-book').textContent = borrow.BookTitle;
    document.getElementById('issue-modal-member').textContent = `${borrow.MemberName} (${borrow.MemberID})`;
    document.getElementById('issue-modal').classList.remove('hidden');
}

function confirmAdminIssue() {
    if (!targetIssueBorrow) return;
    const condSelect = document.getElementById('issue-condition-select').value;
    const condOther = document.getElementById('issue-condition-other').value.trim();
    const finalCond = condSelect === 'Other' && condOther ? condOther : condSelect;

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "issueBook",
            borrowId: targetIssueBorrow.BorrowID,
            bookId: targetIssueBorrow.BookID,
            borrowType: targetIssueBorrow.Type,
            condition: finalCond
        })
    })
    .then(r => r.json())
    .then(res => {
        alert(res.message);
        closeModal('issue-modal');
        fetchLibraryData();
    });
}

function openReturnModal(borrowId) {
    const borrow = allBorrows.find(b => b.BorrowID === borrowId);
    if (!borrow) return;
    targetReturnBorrow = borrow;
    document.getElementById('return-modal-book').textContent = borrow.BookTitle;
    document.getElementById('return-modal-issued-cond').textContent = borrow.ConditionIssued || 'Good';
    document.getElementById('return-modal').classList.remove('hidden');
}

function confirmAdminReturn() {
    if (!targetReturnBorrow) return;
    const cond = document.getElementById('return-condition-select').value;
    const penalty = document.getElementById('return-penalty-select').value;

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "returnBook",
            borrowId: targetReturnBorrow.BorrowID,
            bookId: targetReturnBorrow.BookID,
            borrowType: targetReturnBorrow.Type,
            condition: cond,
            penalty: penalty
        })
    })
    .then(r => r.json())
    .then(res => {
        alert(res.message);
        closeModal('return-modal');
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
            alert(`2-Week Extension Granted! New Due Date: ${res.newDueDate}`);
        } else {
            alert(res.message);
        }
        fetchLibraryData();
    });
}

function adminRegisterMember() {
    const id = document.getElementById('new-mem-id').value.trim().toUpperCase();
    const name = document.getElementById('new-mem-name').value.trim();
    const desig = document.getElementById('new-mem-desig').value;
    const phone = document.getElementById('new-mem-phone').value.trim();

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
            document.getElementById('new-mem-id').value = '';
            document.getElementById('new-mem-name').value = '';
            document.getElementById('new-mem-phone').value = '';
            fetchLibraryData();
        }
    });
}

function deleteMember(id) {
    if (!confirm(`Are you sure you want to delete member ${id}?`)) return;
    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "deleteMember", memberId: id })
    }).then(() => fetchLibraryData());
}

// ==========================================
// WHATSAPP NOTIFICATION ENGINE
// ==========================================

function formatPhoneForWhatsApp(phone) {
    if (!phone) return null;
    let clean = phone.toString().replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '254' + clean.substring(1);
    if (!clean.startsWith('254') && clean.length === 9) clean = '254' + clean;
    return clean;
}

function sendWhatsAppDirect(phone, type, bookTitle, memberName, dueDate) {
    const cleanPhone = formatPhoneForWhatsApp(phone);
    if (!cleanPhone) {
        alert("This member does not have a valid phone number recorded.");
        return;
    }

    let msg = "";
    if (type === 'approved') {
        msg = `Hello ${memberName}, your request for "${bookTitle}" at Crosspoint Bible Church Library has been APPROVED! Please pick it up at the church study desk.`;
    } else if (type === 'dueSoon') {
        msg = `Reminder from Crosspoint Bible Church Library: "${bookTitle}" is due on ${dueDate}. Please return or request an extension.`;
    }

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function sendCustomWhatsApp(phone, memberName) {
    const cleanPhone = formatPhoneForWhatsApp(phone);
    if (!cleanPhone) {
        alert("No phone recorded for this member.");
        return;
    }
    const msg = `Hello ${memberName}, this is the Crosspoint Bible Church Library coordinator.`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ==========================================
// GROUP READING ENGINE
// ==========================================

function openGroupModal(groupId) {
    const group = allGroups.find(g => g.GroupID == groupId);
    if (!group) return;

    document.getElementById('grp-book-title').textContent = group.BookTitle;
    document.getElementById('grp-leader').textContent = group.LeaderName;
    document.getElementById('grp-notes').textContent = group.MeetingNotes || "No notes.";

    const members = (group.JoinedMemberIDs || "").toString().split(',').filter(Boolean);
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
        body: JSON.stringify({ action: "joinGroup", groupId: groupId, memberId: currentUser.id })
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

function submitCreateGroup() {
    if (!currentUser) {
        alert("Please sign in first.");
        openLoginModal();
        return;
    }
    const limit = document.getElementById('create-grp-limit').value;
    const notes = document.getElementById('create-grp-notes').value;

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "createGroup",
            bookId: activeBookForAction.id,
            bookTitle: activeBookForAction.title,
            leaderId: currentUser.id,
            leaderName: currentUser.name,
            maxLimit: limit,
            meetingNotes: notes
        })
    })
    .then(r => r.json())
    .then(res => {
        alert("Group invite published to catalog!");
        closeModal('create-group-modal');
        fetchLibraryData();
    });
}

// UI Modal Helpers
function openLoginModal() { document.getElementById('login-modal').classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openCreateGroupModal() {
    closeModal('book-modal');
    document.getElementById('create-group-modal').classList.remove('hidden');
}

window.addEventListener('click', (e) => {
    const ids = ['login-modal', 'book-modal', 'borrow-modal', 'onsite-modal', 'issue-modal', 'return-modal', 'group-modal', 'create-group-modal', 'my-requests-modal'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && e.target === el) el.classList.add('hidden');
    });
});
