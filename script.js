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
let targetEditMember = null;
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

    // Issue condition 'Other' toggle
    const issueSelect = document.getElementById('issue-condition-select');
    if (issueSelect) {
        issueSelect.addEventListener('change', (e) => {
            const box = document.getElementById('issue-condition-other-box');
            if (box) box.classList.toggle('hidden', e.target.value !== 'Other');
        });
    }
});

function cleanDate(val) {
    if (!val) return '—';
    const str = String(val).trim();
    if (str.includes('T')) return str.split('T')[0];
    return str;
}

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
            renderCirculationCounts();
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
            const joinedMembers = (activeGroup.JoinedMemberIDs || "").toString().split(',').filter(Boolean);
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
            phone: matched.Phone || '',
            email: matched.Email || ''
        };
        localStorage.setItem('cbc_user', JSON.stringify(currentUser));
        updateUserAuthUI();
        closeModal('login-modal');
        checkUserDueAlerts();
        alert(`Welcome back, ${currentUser.name}! You can borrow up to ${currentUser.designation === 'Pastor' ? '4' : '2'} books.`);
    } else {
        alert("Credentials not found in church records. Please register with the librarian.");
    }
}

function logoutUser() {
    localStorage.removeItem('cbc_user');
    currentUser = null;
    updateUserAuthUI();
    document.getElementById('alert-banner').classList.add('hidden');
}

function openMyRequestsModal() {
    if (!currentUser) return;
    const list = document.getElementById('my-requests-list');
    const myLoans = allBorrows.filter(b => b.MemberID == currentUser.id);

    if (myLoans.length === 0) {
        list.innerHTML = `<p class="text-church-600 py-6 text-center italic">You have no active loan requests or borrowed books.</p>`;
    } else {
        list.innerHTML = myLoans.map(b => {
            let statusBadge = '';
            const st = (b.Status || '').trim();
            if (st === 'Pending') statusBadge = `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">🟡 Pending Approval</span>`;
            else if (st === 'Approved') statusBadge = `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">🔵 Approved (Ready for Pickup at Church)</span>`;
            else if (st === 'Active') statusBadge = `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">🟢 Active Loan (Due: ${cleanDate(b.DueDate)})</span>`;
            else if (st === 'Cancelled') statusBadge = `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">❌ Cancelled</span>`;
            else statusBadge = `<span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">Returned</span>`;

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
// BORROWING & DETAILS WORKFLOW WITH STRICT RULES
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

    // STRICT BORROWING LIMIT CHECK
    // Pastors max 4 books; Regular members max 2 books
    const activeUserLoans = allBorrows.filter(b => 
        b.MemberID == currentUser.id && 
        ['Pending', 'Approved', 'Active'].includes((b.Status || '').trim())
    );
    const isPastor = (currentUser.designation || '').toLowerCase() === 'pastor';
    const maxLimit = isPastor ? 4 : 2;

    if (activeUserLoans.length >= maxLimit) {
        alert(`BORROWING LIMIT REACHED:\n\nYou already have ${activeUserLoans.length} active or pending book request(s).\nThe maximum limit is ${maxLimit} books for ${currentUser.designation}s.\nPlease return or cancel your existing books before requesting new ones.`);
        return;
    }

    closeModal('book-modal');

    document.getElementById('borrow-book-title').textContent = activeBookForAction.title;
    document.getElementById('borrow-member-info').textContent = `${currentUser.name} (${currentUser.id} • ${currentUser.designation})`;

    const pickupInput = document.getElementById('borrow-pickup-date');
    const dueInput = document.getElementById('borrow-due-date');
    const todayStr = new Date().toISOString().split('T')[0];

    // STRICT DATE RULE 1: Cannot select a date in the past
    pickupInput.min = todayStr;
    pickupInput.value = todayStr;

    // Calculate default return date: 14 days ahead
    updateStrictDateBoundaries(todayStr);

    pickupInput.onchange = (e) => {
        if (e.target.value < todayStr) {
            alert("Pick-up date cannot be in the past!");
            e.target.value = todayStr;
        }
        updateStrictDateBoundaries(e.target.value);
    };

    dueInput.onchange = (e) => {
        const pDate = new Date(pickupInput.value);
        const selDueDate = new Date(e.target.value);
        const maxDue = new Date(pDate);
        maxDue.setDate(pDate.getDate() + 14);

        if (selDueDate < pDate) {
            alert("Return date cannot be earlier than the pick-up date!");
            e.target.value = pickupInput.value;
        } else if (selDueDate > maxDue) {
            alert("Return date cannot exceed the standard 14-day limit!");
            e.target.value = maxDue.toISOString().split('T')[0];
        }
    };

    document.getElementById('borrow-modal').classList.remove('hidden');
}

function updateStrictDateBoundaries(pickupDateStr) {
    const pickup = new Date(pickupDateStr);
    const dueInput = document.getElementById('borrow-due-date');

    // STRICT DATE RULE 2: Minimum return date is the pickup date (same day)
    dueInput.min = pickupDateStr;

    // STRICT DATE RULE 3: Maximum return date is 14 days after pickup
    const maxDate = new Date(pickup);
    maxDate.setDate(pickup.getDate() + 14);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    dueInput.max = maxDateStr;
    dueInput.value = maxDateStr; // Default to full 14 days
}

function submitBorrowRequest() {
    const pickupDate = document.getElementById('borrow-pickup-date').value;
    const pickupTime = document.getElementById('borrow-pickup-time').value;
    const dueDate = document.getElementById('borrow-due-date').value;

    if (!pickupDate || !pickupTime || !dueDate) {
        alert("Please ensure pick-up date, time, and return date are all filled.");
        return;
    }

    if (dueDate < pickupDate) {
        alert("Return date cannot be before pick-up date.");
        return;
    }

    const payload = {
        action: "submitBorrow",
        bookId: activeBookForAction.id,
        bookTitle: activeBookForAction.title,
        memberId: currentUser.id,
        memberName: currentUser.name,
        memberPhone: currentUser.phone || '',
        memberEmail: currentUser.email || '',
        borrowType: "Borrow",
        pickupDate: pickupDate,
        pickupTime: pickupTime,
        dueDate: dueDate
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
        submitBtn.textContent = "Confirm Request";
        if (res.status === "success") {
            alert(`Request logged! It is now PENDING APPROVAL by the church librarian.\n\nReturn Date: ${dueDate}`);
            closeModal('borrow-modal');
            fetchLibraryData();
        } else {
            alert("Error: " + res.message);
        }
    })
    .catch(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = "Confirm Request";
        alert("Request processed! Please confirm with the librarian.");
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
    
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('onsite-date');
    dateInput.min = todayStr;
    dateInput.value = todayStr;

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
        memberEmail: currentUser.email || '',
        borrowType: "Onsite",
        pickupDate: date,
        pickupTime: time,
        dueDate: date
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
        if (btnLabel) btnLabel.textContent = "Exit Admin";
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
        if (b.textContent.trim().startsWith(status) || (status === 'All' && b.textContent.includes('All'))) {
            b.className = "circ-filter-btn active text-xs px-3 py-1.5 rounded-lg bg-church-200 font-bold";
        } else {
            b.className = "circ-filter-btn text-xs px-3 py-1.5 rounded-lg bg-church-100 hover:bg-church-200";
        }
    });
    renderCirculationTable();
}

function renderCirculationCounts() {
    const pending = allBorrows.filter(b => (b.Status || '').trim() === 'Pending').length;
    const approved = allBorrows.filter(b => (b.Status || '').trim() === 'Approved').length;
    const active = allBorrows.filter(b => (b.Status || '').trim() === 'Active').length;
    const returned = allBorrows.filter(b => (b.Status || '').trim() === 'Returned').length;

    const elBadge = document.getElementById('badge-pending-count');
    if (elBadge) elBadge.textContent = pending;

    const cAll = document.getElementById('count-all');
    const cPend = document.getElementById('count-pending');
    const cAppr = document.getElementById('count-approved');
    const cAct = document.getElementById('count-active');
    const cRet = document.getElementById('count-returned');

    if (cAll) cAll.textContent = allBorrows.length;
    if (cPend) cPend.textContent = pending;
    if (cAppr) cAppr.textContent = approved;
    if (cAct) cAct.textContent = active;
    if (cRet) cRet.textContent = returned;
}

function renderAdminTables() {
    renderCirculationCounts();
    renderCirculationTable();
    renderMembersTable();
    applyAnalyticsTimelineFilter();
}

// 1. Circulation Table Renderer (STRICT STAGES)
function renderCirculationTable() {
    const tbody = document.getElementById('admin-borrows-tbody');
    if (!tbody) return;

    let displayList = allBorrows;
    if (currentCirculationFilter !== 'All') {
        displayList = allBorrows.filter(b => (b.Status || '').trim().toLowerCase() === currentCirculationFilter.toLowerCase());
    }

    if (displayList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-church-500 italic">No loan records found in this category.</td></tr>`;
        return;
    }

    tbody.innerHTML = displayList.map(b => {
        const st = (b.Status || '').trim();
        let statusBadge = '';
        if (st === 'Pending') statusBadge = `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">🟡 Pending Approval</span>`;
        else if (st === 'Approved') statusBadge = `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">🔵 Approved / Ready</span>`;
        else if (st === 'Active') statusBadge = `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">🟢 Active (Checked Out)</span>`;
        else if (st === 'Cancelled') statusBadge = `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">❌ Cancelled</span>`;
        else statusBadge = `<span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-semibold">Returned</span>`;

        // Direct Contact (WhatsApp + Optional Email)
        const waPickup = `sendWhatsAppDirect('${b.MemberPhone}', 'approved', '${b.BookTitle}', '${b.MemberName}')`;
        const waReminder = `sendWhatsAppDirect('${b.MemberPhone}', 'dueSoon', '${b.BookTitle}', '${b.MemberName}', '${cleanDate(b.DueDate)}')`;
        const mailClick = b.MemberEmail ? `mailto:${b.MemberEmail}?subject=Crosspoint%20Library%20Book%20Notice&body=Hello%20${encodeURIComponent(b.MemberName)},` : null;

        let contactHTML = `
            <div class="flex items-center space-x-1">
                <button onclick="${waPickup}" class="text-emerald-700 hover:text-emerald-900 px-1.5 py-1 border rounded bg-emerald-50 text-[11px] font-bold" title="Send WhatsApp">
                    <i class="fa-brands fa-whatsapp text-sm text-emerald-600"></i> WhatsApp
                </button>
                ${mailClick ? `
                    <a href="${mailClick}" class="text-church-700 hover:text-church-900 p-1 border rounded bg-church-50" title="Send Email">
                        <i class="fa-solid fa-envelope"></i>
                    </a>` : ''}
            </div>`;

        // Circulation Actions per Stage
        let actionButtons = '';
        if (st === 'Pending') {
            actionButtons = `
                <button onclick="adminApproveRequest('${b.BorrowID}', '${b.BookID}', '${b.Type}', '${b.MemberPhone}', '${b.MemberEmail}', '${b.MemberName}', '${b.BookTitle}')" class="bg-blue-700 hover:bg-blue-800 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition mr-1">
                    Approve
                </button>
                <button onclick="adminCancelRequest('${b.BorrowID}', '${b.BookID}', '${b.Type}', '${b.MemberEmail}', '${b.MemberName}', '${b.BookTitle}')" class="bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded-lg text-xs font-semibold">
                    Cancel
                </button>`;
        } else if (st === 'Approved') {
            actionButtons = `
                <button onclick="openIssueModal('${b.BorrowID}')" class="bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition mr-1">
                    Issue Book
                </button>
                <button onclick="adminCancelRequest('${b.BorrowID}', '${b.BookID}', '${b.Type}', '${b.MemberEmail}', '${b.MemberName}', '${b.BookTitle}')" class="bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded-lg text-xs font-semibold">
                    Unclaimed
                </button>`;
        } else if (st === 'Active') {
            actionButtons = `
                <button onclick="adminExtendLoan('${b.BorrowID}')" class="bg-church-600 hover:bg-church-700 text-white px-2 py-1 rounded-lg text-xs font-semibold mr-1" title="Grant 2-week extension">
                    +2 Wks
                </button>
                <button onclick="openReturnModal('${b.BorrowID}')" class="bg-church-900 hover:bg-black text-white px-2.5 py-1 rounded-lg text-xs font-bold transition">
                    Return
                </button>`;
        }

        return `
            <tr class="hover:bg-church-50 transition">
                <td class="p-3 font-bold text-church-900">${b.BookTitle}</td>
                <td class="p-3">
                    <p class="font-bold">${b.MemberName}</p>
                    <p class="text-[10px] text-church-600">${b.MemberID} • ${b.MemberPhone || 'No Phone'}</p>
                </td>
                <td class="p-3 text-church-700">${cleanDate(b.PickupDate)}<br><span class="text-[10px] text-church-500">${b.PickupTime || '10:00'}</span></td>
                <td class="p-3 font-bold text-church-900">${cleanDate(b.DueDate)}</td>
                <td class="p-3">${statusBadge}</td>
                <td class="p-3 text-church-600 text-[11px]">${b.ConditionIssued ? `Out: <strong>${b.ConditionIssued}</strong>` : '—'}</td>
                <td class="p-3">${contactHTML}</td>
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
            <td class="p-3"><span class="px-2 py-0.5 rounded bg-church-100 font-semibold text-xs">${m.Designation}</span></td>
            <td class="p-3">${m.Phone || '—'}</td>
            <td class="p-3 text-church-600">${m.Email || '—'}</td>
            <td class="p-3">
                <div class="flex items-center space-x-2">
                    ${m.Phone ? `
                        <button onclick="sendCustomWhatsApp('${m.Phone}', '${m.FullName}')" class="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 text-xs">
                            <i class="fa-brands fa-whatsapp text-sm"></i> Chat
                        </button>` : ''}
                    <button onclick="openEditMemberModal('${m.MemberID}')" class="text-church-600 hover:text-church-900 text-xs underline">
                        Edit Contact
                    </button>
                </div>
            </td>
            <td class="p-3 text-right">
                <button onclick="deleteMember('${m.MemberID}')" class="text-red-600 hover:text-red-800 p-1" title="Delete Member">
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
                <td class="p-3 text-church-600">${b.Notes || b.Penalty || 'None'}</td>
            </tr>
        `).join('');
    }

    document.getElementById('stat-period-borrows').textContent = filtered.length;
    document.getElementById('stat-total-members').textContent = allMembers.length;

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

function adminApproveRequest(borrowId, bookId, type, phone, email, name, title) {
    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "approveBorrow",
            borrowId: borrowId,
            bookId: bookId,
            borrowType: type,
            memberEmail: email,
            memberName: name,
            bookTitle: title
        })
    })
    .then(r => r.json())
    .then(res => {
        alert(res.message);
        if (phone && confirm("Would you like to send a WhatsApp notification confirming their approval?")) {
            sendWhatsAppDirect(phone, 'approved', title, name);
        }
        fetchLibraryData();
    });
}

function adminCancelRequest(borrowId, bookId, type, email, name, title) {
    const reason = prompt("Reason for cancellation (e.g. Unclaimed after 3 days / Member cancelled):", "Unclaimed pickup");
    if (reason === null) return;

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "cancelBorrow",
            borrowId: borrowId,
            bookId: bookId,
            borrowType: type,
            reason: reason,
            memberEmail: email,
            memberName: name,
            bookTitle: title
        })
    })
    .then(r => r.json())
    .then(res => {
        alert(res.message);
        fetchLibraryData();
    });
}

function openIssueModal(borrowId) {
    const borrow = allBorrows.find(b => b.BorrowID === borrowId);
    if (!borrow) return;
    targetIssueBorrow = borrow;

    document.getElementById('issue-modal-book').textContent = borrow.BookTitle;
    document.getElementById('issue-modal-member').textContent = `${borrow.MemberName} (${borrow.MemberID})`;
    
    // Auto populate today as physical checkout date
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('issue-date-input').value = todayStr;

    document.getElementById('issue-modal').classList.remove('hidden');
}

function confirmAdminIssue() {
    if (!targetIssueBorrow) return;
    const condSelect = document.getElementById('issue-condition-select').value;
    const condOther = document.getElementById('issue-condition-other').value.trim();
    const finalCond = condSelect === 'Other' && condOther ? condOther : condSelect;
    const issueDate = document.getElementById('issue-date-input').value;

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "issueBook",
            borrowId: targetIssueBorrow.BorrowID,
            bookId: targetIssueBorrow.BookID,
            borrowType: targetIssueBorrow.Type,
            condition: finalCond,
            issuedDate: issueDate
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
    
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('return-date-input').value = todayStr;

    document.getElementById('return-modal').classList.remove('hidden');
}

function confirmAdminReturn() {
    if (!targetReturnBorrow) return;
    const cond = document.getElementById('return-condition-select').value;
    const penalty = document.getElementById('return-penalty-select').value;
    const returnDate = document.getElementById('return-date-input').value;

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "returnBook",
            borrowId: targetReturnBorrow.BorrowID,
            bookId: targetReturnBorrow.BookID,
            borrowType: targetReturnBorrow.Type,
            condition: cond,
            penalty: penalty,
            returnDate: returnDate
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
    const email = document.getElementById('new-mem-email').value.trim();

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
            phone: phone,
            email: email
        })
    })
    .then(r => r.json())
    .then(res => {
        alert(res.message);
        if (res.status === "success") {
            document.getElementById('new-mem-id').value = '';
            document.getElementById('new-mem-name').value = '';
            document.getElementById('new-mem-phone').value = '';
            document.getElementById('new-mem-email').value = '';
            fetchLibraryData();
        }
    });
}

function openEditMemberModal(memberId) {
    const m = allMembers.find(mem => mem.MemberID === memberId);
    if (!m) return;
    targetEditMember = m;

    document.getElementById('edit-mem-name').textContent = m.FullName;
    document.getElementById('edit-mem-id').textContent = m.MemberID;
    document.getElementById('edit-mem-phone').value = m.Phone || '';
    document.getElementById('edit-mem-email').value = m.Email || '';

    document.getElementById('edit-member-modal').classList.remove('hidden');
}

function saveMemberContact() {
    if (!targetEditMember) return;
    const phone = document.getElementById('edit-mem-phone').value.trim();
    const email = document.getElementById('edit-mem-email').value.trim();

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "updateMemberContact",
            memberId: targetEditMember.MemberID,
            phone: phone,
            email: email
        })
    })
    .then(r => r.json())
    .then(res => {
        alert("Member contact information updated!");
        closeModal('edit-member-modal');
        fetchLibraryData();
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
        alert("This member does not have a phone number on file.\n\nPlease click 'Edit Contact' in the Members Directory to add their WhatsApp number.");
        return;
    }

    let msg = "";
    if (type === 'approved') {
        msg = `Hello ${memberName}, your request for "${bookTitle}" at Crosspoint Bible Church Library has been APPROVED! Please pick it up at the church study desk in Kiamunyi.`;
    } else if (type === 'dueSoon') {
        msg = `Reminder from Crosspoint Bible Church Library: "${bookTitle}" is due on ${dueDate}. Please return it or request an extension.`;
    }

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function sendCustomWhatsApp(phone, memberName) {
    const cleanPhone = formatPhoneForWhatsApp(phone);
    if (!cleanPhone) {
        alert("No phone on file for this member.");
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
        alert("Please sign in first to join this reading group.");
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
    const ids = ['login-modal', 'book-modal', 'borrow-modal', 'onsite-modal', 'issue-modal', 'return-modal', 'group-modal', 'create-group-modal', 'my-requests-modal', 'edit-member-modal'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && e.target === el) el.classList.add('hidden');
    });
});
