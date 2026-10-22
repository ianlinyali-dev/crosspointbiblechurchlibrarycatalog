// ==========================================
// CROSSPOINT BIBLE CHURCH LIBRARY - SCRIPT.JS
// ==========================================

const API_URL = "https://script.google.com/macros/s/AKfycbxbdtpv-cAJVkvVHUSC_dspsRQWjkL0PwS4wrAm7Mc0ZcIAGXTxkqlX7-2b8n0y2gzVZg/exec";

// Master metadata cache (prevents N/A pages)
let localBooksMetadata = [];

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

// Modal Targets
let targetIssueBorrow = null;
let targetReturnBorrow = null;
let targetEditMember = null;
let currentCirculationFilter = 'All';

// Admin Settings
let churchLibrarySettings = JSON.parse(localStorage.getItem('cbc_admin_settings')) || {
    adminName: "Library Coordinator",
    adminPhone: "+254 704 486 616"
};

document.addEventListener('DOMContentLoaded', () => {
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    updateUserAuthUI();
    updateLibrarianUI();

    // 1. INSTANT FAST LOAD: Load local books.json immediately (0.05s)
    loadInstantLocalCatalog();

    // 2. BACKGROUND SYNC: Fetch live copies and borrows from Google Sheets
    fetchLibraryData();

    // Search and category listeners
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    if (searchInput) searchInput.addEventListener('input', handleSearchAndFilter);
    if (categoryFilter) categoryFilter.addEventListener('change', handleSearchAndFilter);
});

// Helper: Formats dates cleanly
function cleanDate(val) {
    if (!val) return '—';
    const str = String(val).trim();
    if (str.includes('T')) return str.split('T')[0];
    return str;
}

// Helper: Clean time formatting (Removes 1899-12-30 bug)
function cleanTime(val) {
    if (!val) return '10:00';
    let str = String(val).trim();
    if (str.includes('T')) {
        const timePart = str.split('T')[1];
        if (timePart) return timePart.substring(0, 5);
    }
    if (str.includes('1899-12-30')) return '10:00';
    return str.substring(0, 5);
}

// Helper: Phone standardizer
function formatPhoneForWhatsApp(phone) {
    if (!phone) return null;
    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '254' + clean.substring(1);
    else if (!clean.startsWith('254') && clean.length === 9) clean = '254' + clean;
    return clean.length >= 10 ? clean : null;
}

// DYNAMIC INVENTORY CALCULATION
function calculateAvailableCopies(bookId, fallbackCopies) {
    const book = allBooks.find(b => b.id == bookId);
    const total = book ? (parseInt(book.totalCopies) || parseInt(book.copies) || 1) : (parseInt(fallbackCopies) || 1);

    const activeLoans = allBorrows.filter(b => 
        b.BookID == bookId && 
        b.Type !== 'Onsite' && 
        ['Approved', 'Active'].includes((b.Status || '').trim())
    ).length;

    return Math.max(0, total - activeLoans);
}

// Instant Fast Load from local books.json
function loadInstantLocalCatalog() {
    fetch('books.json')
        .then(r => r.json())
        .then(fallback => {
            localBooksMetadata = fallback;
            if (allBooks.length === 0) {
                allBooks = fallback.map(normalizeBook);
                filteredBooks = allBooks;
                initCatalog();
            }
        })
        .catch(e => console.warn("Local JSON load error:", e));
}

// Background sync from Google Sheets API
function fetchLibraryData() {
    fetch(`${API_URL}?action=getAllData`)
        .then(res => res.json())
        .then(data => {
            const rawBooks = data.books || [];
            allMembers = data.members || [];
            allBorrows = data.borrows || [];
            allGroups = data.groups || [];

            if (currentUser) {
                const refreshed = allMembers.find(m => (m.MemberID || '').toString().toUpperCase() === currentUser.id.toUpperCase());
                if (refreshed) {
                    currentUser.phone = refreshed.Phone || '';
                    localStorage.setItem('cbc_user', JSON.stringify(currentUser));
                    updateUserAuthUI();
                }
            }

            if (rawBooks.length > 0) {
                allBooks = rawBooks.map(normalizeBook);
                filteredBooks = allBooks;
                initCatalog();
            } else if (localBooksMetadata.length > 0) {
                // Auto seed empty sheet
                fetch(API_URL, {
                    method: "POST",
                    body: JSON.stringify({ action: "seedBooks", books: localBooksMetadata })
                });
            }

            checkUserDueAlerts();
            renderCirculationCounts();
            updateGroupBadges();
            if (isLibrarianActive) renderAdminTables();
        })
        .catch(err => {
            console.warn("API Error, relying on local catalog:", err);
        });
}

// Normalizes book and cross-references missing pages from books.json
function normalizeBook(raw) {
    const total = parseInt(raw.TotalCopies) || parseInt(raw.copies) || 1;
    const bId = raw.id || raw.BookID || 1;

    // Cross-reference with local master json to prevent "N/A pages"
    const master = localBooksMetadata.find(b => b.id == bId || b.title == (raw.title || raw.Title));
    const pagesCount = (raw.Pages && raw.Pages !== 'N/A' && raw.Pages !== 0) ? raw.Pages : (master ? master.pages : (raw.pages || 'N/A'));

    return {
        id: bId,
        title: raw.title || raw.Title || (master ? master.title : 'Untitled'),
        author: raw.author || raw.Author || (master ? master.author : 'Unknown Author'),
        category: raw.category || raw.Category || (master ? master.category : 'General'),
        publicationDate: raw.publicationDate || raw.PublicationDate || (master ? master.publicationDate : 'N/A'),
        totalCopies: total,
        copies: total,
        pages: pagesCount,
        classification: raw.classification || raw.Classification || (master ? master.classification : 'Borrowable'),
        description: raw.description || raw.Description || (master ? master.description : ''),
        image: raw.image || raw.ImageURL || (master ? master.image : 'images/churchdiscipline.jpeg')
    };
}

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
        const copies = calculateAvailableCopies(book.id, book.copies);

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
                    <i class="fa-solid fa-copy mr-1"></i> ${copies > 0 ? copies + ' copies available' : 'Out of stock'}
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

// User Auth Management (Desktop & Mobile Sync)
function updateUserAuthUI() {
    const desktopContainer = document.getElementById('user-auth-badge');
    const mobileContainer = document.getElementById('mobile-user-auth-badge');

    let html = '';
    if (currentUser) {
        html = `
            <div class="flex items-center space-x-2 text-xs">
                <button onclick="openMyRequestsModal()" class="bg-church-100 hover:bg-church-200 border border-church-300 px-3 py-1.5 rounded-xl font-bold text-church-900 flex items-center gap-1.5 shadow-sm">
                    <i class="fa-solid fa-user-circle text-amber-700"></i> ${currentUser.name}
                    <span class="bg-amber-200 text-church-800 px-1.5 py-0.5 rounded text-[10px] uppercase">${currentUser.designation}</span>
                </button>
                <button onclick="logoutUser()" class="text-red-600 hover:text-red-800 text-xs font-semibold px-2">Logout</button>
            </div>`;
    } else {
        html = `
            <button onclick="openLoginModal()" class="bg-church-800 hover:bg-church-900 text-white text-xs px-3.5 py-2 rounded-xl font-bold transition shadow-sm flex items-center gap-1.5">
                <i class="fa-solid fa-id-card"></i> Member Sign In
            </button>`;
    }

    if (desktopContainer) desktopContainer.innerHTML = html;
    if (mobileContainer) mobileContainer.innerHTML = html;
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
        alert(`Welcome back, ${currentUser.name}! You can borrow up to ${currentUser.designation === 'Pastor' ? '4' : '2'} books.`);
    } else {
        alert("Credentials not found in church records. Please register with the librarian.");
    }
}

function logoutUser() {
    localStorage.removeItem('cbc_user');
    currentUser = null;
    updateUserAuthUI();
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
            else if (st === 'Approved') statusBadge = `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">🔵 Approved (Ready for Pickup)</span>`;
            else if (st === 'Active') statusBadge = `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">🟢 Active Loan (Due: ${cleanDate(b.DueDate)})</span>`;
            else if (st === 'Cancelled') statusBadge = `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">❌ Cancelled</span>`;
            else statusBadge = `<span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">Returned</span>`;

            return `
                <div class="p-3 bg-church-50 rounded-xl border border-church-200 flex justify-between items-center">
                    <div>
                        <p class="font-bold text-church-900">${b.BookTitle}</p>
                        <p class="text-[11px] text-church-600">Pickup Date: ${cleanDate(b.PickupDate)} (${cleanTime(b.PickupTime)})</p>
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
        msg.innerHTML = `<strong>Loan Notice:</strong> You have <em>"${loan.BookTitle}"</em> checked out. Return Due Date: <strong>${cleanDate(loan.DueDate)}</strong>.`;
        banner.style.display = 'block';
    }
}

// STRICT SIGN-IN RESTRICTION CHECK
function requireMemberAuth(actionName) {
    if (!currentUser) {
        document.getElementById('login-modal-notice').innerHTML = 
            `<strong>Sign-in Required:</strong> Please sign in with your registered Member ID to ${actionName}.`;
        openLoginModal();
        return false;
    }
    return true;
}

// Borrowing & Details Workflow
function openBookModal(book) {
    activeBookForAction = book;
    document.getElementById('modal-title').textContent = book.title;
    document.getElementById('modal-img').src = book.image;
    document.getElementById('modal-author').textContent = book.author;
    document.getElementById('modal-category').textContent = book.category;
    document.getElementById('modal-pubdate').textContent = book.publicationDate;
    document.getElementById('modal-pages').textContent = book.pages + " pages";
    
    const copies = calculateAvailableCopies(book.id, book.copies);
    document.getElementById('modal-copies').textContent = copies;
    document.getElementById('modal-description').textContent = book.description || 'No description available.';

    const classificationEl = document.getElementById('modal-classification');
    const isBorrowable = (book.classification || '').toLowerCase().includes('borrowable');
    const isPastor = currentUser && (currentUser.designation || '').toLowerCase() === 'pastor';

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
        actionBtn.onclick = () => {
            if (requireMemberAuth("request to borrow books")) {
                openBorrowForm(false);
            }
        };
    } else {
        if (isPastor) {
            actionBtn.className = "px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow transition";
            actionBtn.innerHTML = `<span>Borrow (Pastor Privilege)</span>`;
            actionBtn.onclick = () => {
                if (requireMemberAuth("borrow onsite materials")) {
                    openBorrowForm(true);
                }
            };
        } else {
            actionBtn.className = "px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold shadow transition";
            actionBtn.innerHTML = `<span>Schedule Onsite Reading</span>`;
            actionBtn.onclick = () => {
                if (requireMemberAuth("schedule an onsite reading desk")) {
                    openOnsiteScheduleForm();
                }
            };
        }
    }

    document.getElementById('book-modal').classList.remove('hidden');
}

function openBorrowForm(isPastorPrivilege) {
    const activeUserLoans = allBorrows.filter(b => 
        b.MemberID == currentUser.id && 
        ['Pending', 'Approved', 'Active'].includes((b.Status || '').trim())
    );
    const isPastor = (currentUser.designation || '').toLowerCase() === 'pastor';
    const maxLimit = isPastor ? 4 : 2;

    if (activeUserLoans.length >= maxLimit) {
        alert(`BORROWING LIMIT REACHED:\n\nYou already have ${activeUserLoans.length} active or pending book request(s).\nThe maximum limit is ${maxLimit} books for ${currentUser.designation}s.\nPlease return or cancel existing books first.`);
        return;
    }

    closeModal('book-modal');

    document.getElementById('borrow-book-title').textContent = activeBookForAction.title;
    document.getElementById('borrow-member-info').textContent = `${currentUser.name} (${currentUser.id} • ${currentUser.designation})`;

    const pickupInput = document.getElementById('borrow-pickup-date');
    const dueInput = document.getElementById('borrow-due-date');
    const todayStr = new Date().toISOString().split('T')[0];

    pickupInput.min = todayStr;
    pickupInput.value = todayStr;

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
            alert("Return date cannot be earlier than pick-up date!");
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
    dueInput.min = pickupDateStr;

    const maxDate = new Date(pickup);
    maxDate.setDate(pickup.getDate() + 14);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    dueInput.max = maxDateStr;
    dueInput.value = maxDateStr;
}

function submitBorrowRequest() {
    const pickupDate = document.getElementById('borrow-pickup-date').value;
    const pickupTime = document.getElementById('borrow-pickup-time').value;
    const dueDate = document.getElementById('borrow-due-date').value;

    if (!pickupDate || !pickupTime || !dueDate) {
        alert("Please ensure pick-up date, time, and return date are all filled.");
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
        pickupTime: pickupTime,
        dueDate: dueDate
    };

    // Optimistic UI update
    const tempBorrowId = "BRW-" + new Date().getTime();
    allBorrows.unshift({
        BorrowID: tempBorrowId,
        BookID: activeBookForAction.id,
        BookTitle: activeBookForAction.title,
        MemberID: currentUser.id,
        MemberName: currentUser.name,
        MemberPhone: currentUser.phone || '',
        Type: "Borrow",
        PickupDate: pickupDate,
        PickupTime: pickupTime,
        DueDate: dueDate,
        Status: "Pending"
    });

    closeModal('borrow-modal');
    renderCirculationCounts();
    if (isLibrarianActive) renderAdminTables();
    initCatalog();
    alert(`Request received! Status: PENDING APPROVAL.\nReturn Date: ${dueDate}`);

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
    }).catch(e => console.warn("Background sync warning:", e));
}

function openOnsiteScheduleForm() {
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
        borrowType: "Onsite",
        pickupDate: date,
        pickupTime: time,
        dueDate: date
    };

    closeModal('onsite-modal');
    alert(`Your reading desk slot at Crosspoint Church for ${date} at ${time} is recorded!`);

    fetch(API_URL, { method: "POST", body: JSON.stringify(payload) })
        .then(() => fetchLibraryData());
}

// Professional Admin PIN Modal Controls
function openAdminPinModal() {
    if (isLibrarianActive) {
        exitLibrarianConsole();
        return;
    }
    const pinInput = document.getElementById('admin-pin-input');
    pinInput.value = '';
    document.getElementById('admin-pin-error').classList.add('hidden');
    document.getElementById('admin-pin-modal').classList.remove('hidden');
    setTimeout(() => pinInput.focus(), 100);
}

function submitAdminPin() {
    const entered = document.getElementById('admin-pin-input').value.trim();
    if (entered === "1234") {
        isLibrarianActive = true;
        sessionStorage.setItem('cbc_librarian_active', 'true');
        closeModal('admin-pin-modal');
        updateLibrarianUI();
        renderAdminTables();
        window.location.hash = "admin-panel";
    } else {
        document.getElementById('admin-pin-error').classList.remove('hidden');
        document.getElementById('admin-pin-input').value = '';
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
        if (st === 'Pending') statusBadge = `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">🟡 Pending</span>`;
        else if (st === 'Approved') statusBadge = `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">🔵 Approved</span>`;
        else if (st === 'Active') statusBadge = `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">🟢 Active</span>`;
        else if (st === 'Cancelled') statusBadge = `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">❌ Cancelled</span>`;
        else statusBadge = `<span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-semibold">Returned</span>`;

        const mem = allMembers.find(m => (m.MemberID || '').toString().toUpperCase() === (b.MemberID || '').toString().toUpperCase());
        const currentPhone = (mem && mem.Phone) ? mem.Phone : b.MemberPhone;

        let phoneDisplay = '';
        if (currentPhone) {
            phoneDisplay = `<span class="text-church-700 font-semibold">${currentPhone}</span>`;
        } else {
            phoneDisplay = `<button onclick="openEditMemberModal('${b.MemberID}')" class="text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 px-1.5 py-0.5 rounded font-bold text-[10px]">➕ Add Phone</button>`;
        }

        let actionButtons = '';
        if (st === 'Pending') {
            actionButtons = `
                <button onclick="adminApproveRequest('${b.BorrowID}', '${b.BookID}', '${b.Type}', '${currentPhone || ''}', '${b.MemberName}', '${b.BookTitle}')" class="bg-blue-700 hover:bg-blue-800 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition mr-1">
                    Approve
                </button>
                <button onclick="adminCancelRequest('${b.BorrowID}', '${b.BookID}', '${b.Type}', '${b.MemberName}', '${b.BookTitle}')" class="bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded-lg text-xs font-semibold">
                    Cancel
                </button>`;
        } else if (st === 'Approved') {
            actionButtons = `
                <button onclick="openIssueModal('${b.BorrowID}')" class="bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition mr-1">
                    Issue Book
                </button>
                <button onclick="adminCancelRequest('${b.BorrowID}', '${b.BookID}', '${b.Type}', '${b.MemberName}', '${b.BookTitle}')" class="bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded-lg text-xs font-semibold">
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
                    <p class="text-[10px] text-church-600">${b.MemberID} • ${phoneDisplay}</p>
                </td>
                <td class="p-3 text-church-700">${cleanDate(b.PickupDate)}<br><span class="text-[10px] text-church-500 font-bold">${cleanTime(b.PickupTime)}</span></td>
                <td class="p-3 font-bold text-church-900">${cleanDate(b.DueDate)}</td>
                <td class="p-3">${statusBadge}</td>
                <td class="p-3 text-church-600 text-[11px]">${b.ConditionIssued ? `Out: <strong>${b.ConditionIssued}</strong>` : '—'}</td>
                <td class="p-3">
                    <button onclick="triggerBorrowerWhatsApp('${b.MemberID}', '${b.MemberName}', '${b.BookTitle}', '${st}', '${cleanDate(b.DueDate)}')" 
                            class="text-emerald-700 hover:text-emerald-900 px-2 py-1 border border-emerald-300 rounded-lg bg-emerald-50 text-[11px] font-bold flex items-center gap-1">
                        <i class="fa-brands fa-whatsapp text-sm text-emerald-600"></i> WhatsApp
                    </button>
                </td>
                <td class="p-3 text-right space-x-1">${actionButtons}</td>
            </tr>`;
    }).join('');
}

function renderMembersTable() {
    const tbody = document.getElementById('admin-members-tbody');
    if (!tbody) return;

    tbody.innerHTML = allMembers.map(m => `
        <tr class="hover:bg-church-50 transition">
            <td class="p-3 font-bold text-church-900">${m.MemberID}</td>
            <td class="p-3 font-medium">${m.FullName}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded bg-church-100 font-semibold text-xs">${m.Designation}</span></td>
            <td class="p-3 font-semibold">${m.Phone || '—'}</td>
            <td class="p-3 text-right space-x-2">
                <button onclick="openEditMemberModal('${m.MemberID}')" class="text-church-700 hover:text-church-900 text-xs font-bold underline">
                    Edit Phone
                </button>
                <button onclick="deleteMember('${m.MemberID}')" class="text-red-600 hover:text-red-800 p-1" title="Delete Member">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

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

// Instant UI Action handlers
function adminApproveRequest(borrowId, bookId, type, phone, name, title) {
    const borrow = allBorrows.find(b => b.BorrowID === borrowId);
    if (borrow) borrow.Status = 'Approved';

    renderCirculationCounts();
    renderCirculationTable();
    initCatalog();

    if (phone && confirm("Request approved! Open WhatsApp to notify member?")) {
        sendWhatsAppDirect(phone, 'approved', title, name);
    }

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "approveBorrow",
            borrowId: borrowId,
            bookId: bookId,
            borrowType: type,
            memberName: name,
            bookTitle: title
        })
    }).catch(e => console.warn(e));
}

function adminCancelRequest(borrowId, bookId, type, name, title) {
    const reason = prompt("Reason for cancellation:", "Unclaimed pickup");
    if (reason === null) return;

    const borrow = allBorrows.find(b => b.BorrowID === borrowId);
    if (borrow) {
        borrow.Status = 'Cancelled';
        borrow.Notes = reason;
    }

    renderCirculationCounts();
    renderCirculationTable();
    initCatalog();

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "cancelBorrow",
            borrowId: borrowId,
            bookId: bookId,
            borrowType: type,
            reason: reason,
            memberName: name,
            bookTitle: title
        })
    }).catch(e => console.warn(e));
}

function openIssueModal(borrowId) {
    const borrow = allBorrows.find(b => b.BorrowID === borrowId);
    if (!borrow) return;
    targetIssueBorrow = borrow;

    document.getElementById('issue-modal-book').textContent = borrow.BookTitle;
    document.getElementById('issue-modal-member').textContent = `${borrow.MemberName} (${borrow.MemberID})`;
    document.getElementById('issue-date-input').value = new Date().toISOString().split('T')[0];
    document.getElementById('issue-modal').classList.remove('hidden');
}

function confirmAdminIssue() {
    if (!targetIssueBorrow) return;
    const cond = document.getElementById('issue-condition-select').value;
    const issueDate = document.getElementById('issue-date-input').value;

    targetIssueBorrow.Status = 'Active';
    targetIssueBorrow.ConditionIssued = cond;
    targetIssueBorrow.IssuedDate = issueDate;

    closeModal('issue-modal');
    renderCirculationCounts();
    renderCirculationTable();
    initCatalog();

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "issueBook",
            borrowId: targetIssueBorrow.BorrowID,
            bookId: targetIssueBorrow.BookID,
            borrowType: targetIssueBorrow.Type,
            condition: cond,
            issuedDate: issueDate
        })
    }).catch(e => console.warn(e));
}

function openReturnModal(borrowId) {
    const borrow = allBorrows.find(b => b.BorrowID === borrowId);
    if (!borrow) return;
    targetReturnBorrow = borrow;

    document.getElementById('return-modal-book').textContent = borrow.BookTitle;
    document.getElementById('return-date-input').value = new Date().toISOString().split('T')[0];
    document.getElementById('return-modal').classList.remove('hidden');
}

function confirmAdminReturn() {
    if (!targetReturnBorrow) return;
    const cond = document.getElementById('return-condition-select').value;
    const penalty = document.getElementById('return-penalty-select').value;
    const returnDate = document.getElementById('return-date-input').value;

    targetReturnBorrow.Status = 'Returned';
    targetReturnBorrow.ConditionReturned = cond;
    targetReturnBorrow.Penalty = penalty;
    targetReturnBorrow.ReturnDate = returnDate;

    closeModal('return-modal');
    renderCirculationCounts();
    renderCirculationTable();
    initCatalog();

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
    }).catch(e => console.warn(e));
}

function adminExtendLoan(borrowId) {
    const borrow = allBorrows.find(b => b.BorrowID === borrowId);
    if (!borrow) return;

    if (borrow.ExtensionUsed === true || borrow.ExtensionUsed === "TRUE") {
        alert("A 2-week extension has already been granted for this loan.");
        return;
    }

    const curDueDate = new Date(borrow.DueDate);
    curDueDate.setDate(curDueDate.getDate() + 14);
    borrow.DueDate = curDueDate.toISOString().split('T')[0];
    borrow.ExtensionUsed = true;

    renderCirculationTable();
    alert(`2-Week Extension Granted! New Due Date: ${borrow.DueDate}`);

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "extendLoan", borrowId: borrowId })
    }).catch(e => console.warn(e));
}

// Register Member (Strictly Phone Only)
function adminRegisterMember() {
    const id = document.getElementById('new-mem-id').value.trim().toUpperCase();
    const name = document.getElementById('new-mem-name').value.trim();
    const desig = document.getElementById('new-mem-desig').value;
    const rawPhone = document.getElementById('new-mem-phone').value.trim();

    if (!id || !name) {
        alert("Please provide both unique Member ID and Full Name.");
        return;
    }

    const formattedPhone = formatPhoneForWhatsApp(rawPhone) || rawPhone;

    const newMember = {
        MemberID: id,
        FullName: name,
        Designation: desig,
        Phone: formattedPhone
    };
    allMembers.push(newMember);
    renderMembersTable();

    document.getElementById('new-mem-id').value = '';
    document.getElementById('new-mem-name').value = '';
    document.getElementById('new-mem-phone').value = '';
    alert(`Member ${name} registered! WhatsApp messaging is enabled immediately.`);

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "registerMember",
            memberId: id,
            fullName: name,
            designation: desig,
            phone: formattedPhone
        })
    }).catch(e => console.warn(e));
}

function openEditMemberModal(memberId) {
    const m = allMembers.find(mem => (mem.MemberID || '').toString().toUpperCase() === memberId.toString().toUpperCase());
    if (!m) return;
    targetEditMember = m;

    document.getElementById('edit-mem-name').textContent = m.FullName;
    document.getElementById('edit-mem-id').textContent = m.MemberID;
    document.getElementById('edit-mem-phone').value = m.Phone || '';

    document.getElementById('edit-member-modal').classList.remove('hidden');
}

function saveMemberContact() {
    if (!targetEditMember) return;
    const rawPhone = document.getElementById('edit-mem-phone').value.trim();
    const formattedPhone = formatPhoneForWhatsApp(rawPhone) || rawPhone;

    targetEditMember.Phone = formattedPhone;

    allBorrows.forEach(b => {
        if ((b.MemberID || '').toString().toUpperCase() === targetEditMember.MemberID.toUpperCase()) {
            b.MemberPhone = formattedPhone;
        }
    });

    closeModal('edit-member-modal');
    renderMembersTable();
    renderCirculationTable();
    alert("Phone number updated!");

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "updateMemberContact",
            memberId: targetEditMember.MemberID,
            phone: formattedPhone
        })
    }).catch(e => console.warn(e));
}

function deleteMember(id) {
    if (!confirm(`Are you sure you want to delete member ${id}?`)) return;
    allMembers = allMembers.filter(m => m.MemberID !== id);
    renderMembersTable();

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "deleteMember", memberId: id })
    }).catch(e => console.warn(e));
}

// WhatsApp Notification Engine
function triggerBorrowerWhatsApp(memberId, memberName, bookTitle, stage, dueDate) {
    const mem = allMembers.find(m => (m.MemberID || '').toString().toUpperCase() === memberId.toString().toUpperCase());
    const phone = mem && mem.Phone ? mem.Phone : null;

    if (!phone) {
        alert(`No phone number on file for ${memberName} (${memberId}). Please add their number.`);
        openEditMemberModal(memberId);
        return;
    }

    if (stage === 'Approved') {
        sendWhatsAppDirect(phone, 'approved', bookTitle, memberName);
    } else if (stage === 'Active') {
        sendWhatsAppDirect(phone, 'dueSoon', bookTitle, memberName, dueDate);
    } else {
        sendWhatsAppDirect(phone, 'pending', bookTitle, memberName);
    }
}

function sendWhatsAppDirect(phone, type, bookTitle, memberName, dueDate) {
    const cleanPhone = formatPhoneForWhatsApp(phone);
    if (!cleanPhone) {
        alert("Invalid phone format. Please enter a valid number (e.g. 0712345678).");
        return;
    }

    let msg = "";
    if (type === 'approved') {
        msg = `Hello ${memberName},\n\nYour borrow request for "${bookTitle}" at Crosspoint Bible Church Library has been APPROVED!\n\nPlease collect your volume at the church study desk in Kiamunyi.\n\nBlessings,\n${churchLibrarySettings.adminName}`;
    } else if (type === 'dueSoon') {
        msg = `Reminder from Crosspoint Bible Church Library:\n\nHello ${memberName}, your borrowed book "${bookTitle}" is due on ${dueDate}. Please prepare to return it or request a 2-week extension.\n\nBlessings,\n${churchLibrarySettings.adminName}`;
    } else {
        msg = `Hello ${memberName}, this is regarding your library request for "${bookTitle}" at Crosspoint Bible Church.`;
    }

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Policy Modals (Terms & Privacy)
function openPolicyModal(type) {
    const modalTitle = document.getElementById('policy-modal-title');
    const modalBody = document.getElementById('policy-modal-body');

    if (type === 'terms') {
        modalTitle.textContent = "Terms of Service & Library Guidelines";
        modalBody.innerHTML = `
            <p><strong>1. Standard Borrowing Duration:</strong> All borrowable books can be checked out for a maximum standard period of <strong>two (2) weeks (14 days)</strong>. A one-time extension of 14 extra days may be granted by the librarian.</p>
            <p><strong>2. Book Safety & Care:</strong> Borrowers are entirely responsible for maintaining the physical safety and cleanliness of borrowed books. Please keep books away from liquids, extreme moisture, heat, and pets or young children who might tear pages.</p>
            <p><strong>3. Onsite-Only Materials:</strong> Volumes marked as "Onsite Only" (such as Biblical Doctrine and Concordances) are reference items intended exclusively to be read within designated church study spaces at Kiamunyi, Nakuru (with pastoral exemption).</p>
            <p><strong>4. Return Protocol:</strong> Books must be returned directly to the designated church library coordinator on or before the due date so others can benefit from reading them.</p>
        `;
    } else if (type === 'privacy') {
        modalTitle.textContent = "Privacy Policy";
        modalBody.innerHTML = `
            <p><strong>1. Confidentiality:</strong> Crosspoint Bible Church collects member names, unique IDs, and phone numbers strictly for book circulation management and return notifications.</p>
            <p><strong>2. Data Protection:</strong> Member contact records are private, restricted to library administration, and are never shared or sold to third parties.</p>
        `;
    }

    document.getElementById('policy-modal').classList.remove('hidden');
}

// Group Reading Directory & Badges
function updateGroupBadges() {
    const openGroups = allGroups.filter(g => g.Status === 'Open').length;
    const navEl = document.getElementById('nav-group-count');
    const mobEl = document.getElementById('mobile-nav-group-count');
    if (navEl) navEl.textContent = openGroups;
    if (mobEl) mobEl.textContent = openGroups;
}

function openAllGroupsModal() {
    const list = document.getElementById('all-groups-list');
    const openGroups = allGroups.filter(g => g.Status === 'Open');

    if (openGroups.length === 0) {
        list.innerHTML = `<p class="text-church-600 py-6 text-center italic">No reading circles are active right now. Click on any book in the catalog to start one!</p>`;
    } else {
        list.innerHTML = openGroups.map(g => {
            const members = (g.JoinedMemberIDs || "").toString().split(',').filter(Boolean);
            const remaining = Math.max(0, g.MaxLimit - members.length);
            return `
                <div class="p-3 bg-church-50 rounded-xl border border-church-200 flex justify-between items-center">
                    <div>
                        <p class="font-bold text-church-900">${g.BookTitle}</p>
                        <p class="text-[11px] text-church-600">Leader: <strong>${g.LeaderName}</strong> • Plan: ${g.MeetingNotes || 'At Church'}</p>
                        <p class="text-[10px] text-amber-800 font-semibold mt-1">${remaining} spots remaining out of ${g.MaxLimit}</p>
                    </div>
                    <button onclick="joinGroupReading('${g.GroupID}')" class="px-3 py-1.5 bg-church-800 hover:bg-church-900 text-white rounded-lg font-bold text-xs">
                        Join Circle
                    </button>
                </div>`;
        }).join('');
    }

    document.getElementById('all-groups-modal').classList.remove('hidden');
}

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
    if (!requireMemberAuth("join a reading group")) return;

    const group = allGroups.find(g => g.GroupID == groupId);
    if (!group) return;

    let members = (group.JoinedMemberIDs || "").toString().split(',').filter(Boolean);
    if (members.includes(currentUser.id)) {
        alert("You have already joined this group reading circle!");
        return;
    }

    members.push(currentUser.id);
    group.JoinedMemberIDs = members.join(',');
    if (members.length >= group.MaxLimit) group.Status = 'Full';

    closeModal('group-modal');
    closeModal('all-groups-modal');
    updateGroupBadges();
    initCatalog();
    alert("You have successfully joined the group reading circle!");

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "joinGroup", groupId: groupId, memberId: currentUser.id })
    }).catch(e => console.warn(e));
}

function openCreateGroupModal() {
    if (!requireMemberAuth("start a group reading circle")) return;
    closeModal('book-modal');
    document.getElementById('create-group-modal').classList.remove('hidden');
}

function submitCreateGroup() {
    if (!currentUser) return;
    const limit = document.getElementById('create-grp-limit').value;
    const notes = document.getElementById('create-grp-notes').value;

    const tempGroupId = "GRP-" + new Date().getTime();
    allGroups.push({
        GroupID: tempGroupId,
        BookID: activeBookForAction.id,
        BookTitle: activeBookForAction.title,
        LeaderID: currentUser.id,
        LeaderName: currentUser.name,
        MaxLimit: parseInt(limit),
        JoinedMemberIDs: currentUser.id,
        MeetingNotes: notes,
        Status: "Open"
    });

    closeModal('create-group-modal');
    updateGroupBadges();
    initCatalog();
    alert("Group reading circle published to the catalog!");

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
    }).catch(e => console.warn(e));
}

// Admin Settings
function openAdminSettingsModal() {
    document.getElementById('setting-admin-name').value = churchLibrarySettings.adminName || '';
    document.getElementById('setting-admin-phone').value = churchLibrarySettings.adminPhone || '';
    document.getElementById('admin-settings-modal').classList.remove('hidden');
}

function saveAdminSettings() {
    churchLibrarySettings = {
        adminName: document.getElementById('setting-admin-name').value.trim() || "Library Coordinator",
        adminPhone: document.getElementById('setting-admin-phone').value.trim() || "+254 704 486 616"
    };
    localStorage.setItem('cbc_admin_settings', JSON.stringify(churchLibrarySettings));
    alert("Church library official details saved!");
    closeModal('admin-settings-modal');
}

// UI Modal Controls
function openLoginModal() { document.getElementById('login-modal').classList.remove('hidden'); }
function closeModal(id) { 
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden'); 
}

window.addEventListener('click', (e) => {
    const ids = ['login-modal', 'book-modal', 'borrow-modal', 'onsite-modal', 'issue-modal', 'return-modal', 'group-modal', 'create-group-modal', 'my-requests-modal', 'edit-member-modal', 'admin-settings-modal', 'policy-modal', 'all-groups-modal', 'admin-pin-modal'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && e.target === el) el.classList.add('hidden');
    });
});
