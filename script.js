let allBooks = [];
let filteredBooks = [];
let displayedCount = 0;
const BOOKS_PER_PAGE = 6;
let currentUser = null;
let currentSelectedBook = null;
let groupReadingQueue = [];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-year').textContent = new Date().getFullYear();

    // Mobile menu toggle logic
    const menuBtn = document.getElementById('menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    menuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });

    // Check stored user session
    const savedUser = localStorage.getItem('cbc_member_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        updateAuthUI();
    }

    // Load book catalog data
    fetch('books.json')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            allBooks = data;
            filteredBooks = data;
            initCatalog();
        })
        .catch(error => {
            console.error('Error loading book catalog:', error);
            document.getElementById('book-grid').innerHTML = `
                <div class="col-span-full text-center py-10 text-red-600">
                    <p>Failed to load books catalog. Please ensure books.json is correctly configured.</p>
                </div>`;
        });

    document.getElementById('search-input').addEventListener('input', handleSearchAndFilter);
    document.getElementById('category-filter').addEventListener('change', handleSearchAndFilter);
});

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
        const isBorrowable = book.classification.toLowerCase() === 'borrowable';
        const badgeClass = isBorrowable ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';

        let shortDesc = book.description || '';
        if (shortDesc.length > 110) {
            shortDesc = shortDesc.substring(0, 110).trim() + '...';
        }

        // Fix pages rendering display ensuring it reads property properly
        const pageCountText = book.pages ? `${book.pages} pages` : 'N/A pages';

        const card = document.createElement('div');
        card.className = "bg-white border border-church-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer";
        card.onclick = () => openModal(book);

        card.innerHTML = `
            <div>
                <div class="h-60 bg-church-50 overflow-hidden relative p-2.5 flex items-center justify-center border-b border-church-100">
                    <img src="${book.image}" alt="${book.title}" loading="lazy" class="w-full h-full object-contain group-hover:scale-105 transition duration-300 drop-shadow-sm">
                    <span class="absolute top-3 right-3 text-[11px] font-semibold px-2.5 py-0.5 rounded-full shadow-sm ${badgeClass}">
                        ${book.classification}
                    </span>
                </div>
                <div class="p-5 space-y-2">
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-medium text-church-600 uppercase tracking-wide truncate pr-2">${book.category}</span>
                        <span class="text-church-500 shrink-0"><i class="fa-solid fa-book-open mr-1"></i>${pageCountText}</span>
                    </div>
                    <h3 class="font-bold text-church-900 text-base leading-snug group-hover:text-church-600 transition">${book.title}</h3>
                    <p class="text-xs text-church-700 font-medium">By ${book.author}</p>
                    <p class="text-xs text-church-600 pt-0.5 leading-relaxed">${shortDesc}</p>
                </div>
            </div>
            <div class="px-5 pb-4 pt-3 border-t border-church-100 flex items-center justify-between text-xs">
                <span class="text-church-800 font-medium"><i class="fa-solid fa-copy mr-1 text-church-600"></i> ${book.copies} available</span>
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
    const selectedCategory = document.getElementById('category-filter').value;

    filteredBooks = allBooks.filter(book => {
        const matchesQuery = 
            book.title.toLowerCase().includes(query) ||
            book.author.toLowerCase().includes(query) ||
            book.category.toLowerCase().includes(query) ||
            (book.keywords && book.keywords.some(kw => kw.toLowerCase().includes(query)));

        const matchesCategory = selectedCategory === "" || book.category === selectedCategory;

        return matchesQuery && matchesCategory;
    });

    initCatalog();
}

function openModal(book) {
    currentSelectedBook = book;
    document.getElementById('modal-title').textContent = book.title;
    document.getElementById('modal-img').src = book.image;
    document.getElementById('modal-author').textContent = book.author;
    document.getElementById('modal-category').textContent = book.category;
    document.getElementById('modal-pubdate').textContent = book.publicationDate;
    document.getElementById('modal-pages').textContent = book.pages ? `${book.pages} pages` : 'N/A';
    document.getElementById('modal-copies').textContent = book.copies;
    
    const classificationEl = document.getElementById('modal-classification');
    classificationEl.textContent = book.classification;

    const borrowBtn = document.getElementById('modal-borrow-btn');

    if(book.classification.toLowerCase() === 'borrowable') {
        classificationEl.className = "inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800";
        borrowBtn.style.display = "flex";
        
        // Restriction check: Must be signed in to fill borrow form
        borrowBtn.onclick = (e) => {
            if (!currentUser) {
                e.preventDefault();
                closeModal();
                openAuthModal();
                alert("Please sign in as a member first before requesting to borrow books.");
            }
        };
        borrowBtn.href = "https://forms.gle/uEmyzCdZ3qiRpFyv9";
        borrowBtn.target = "_blank";
        borrowBtn.className = "px-4 py-2 bg-church-800 hover:bg-church-900 text-white rounded-xl text-xs font-medium shadow transition flex items-center space-x-1.5";
        borrowBtn.innerHTML = `<span>Fill Borrow Form</span> <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>`;
    } else {
        classificationEl.className = "inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800";
        borrowBtn.style.display = "flex";
        borrowBtn.href = "#";
        borrowBtn.removeAttribute("target");
        borrowBtn.className = "px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-medium shadow transition flex items-center space-x-1.5";
        borrowBtn.innerHTML = `<span>Read Room Only</span> <i class="fa-solid fa-triangle-exclamation text-[10px]"></i>`;
        borrowBtn.onclick = (e) => {
            e.preventDefault();
            alert("This item is restricted to Onsite Reading Room use only within Crosspoint Bible Church, Kiamunyi.");
        };
    }

    document.getElementById('modal-description').textContent = book.description || 'No description available.';
    document.getElementById('book-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('book-modal').classList.add('hidden');
}

// Authentication handling (No email collection required)
function openAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
    document.getElementById('auth-modal').classList.add('flex');
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('auth-modal').classList.remove('flex');
}

function handleMemberSignIn(event) {
    event.preventDefault();
    const name = document.getElementById('member-name').value.trim();
    const phone = document.getElementById('member-phone').value.trim();

    currentUser = { name, phone };
    localStorage.setItem('cbc_member_user', JSON.stringify(currentUser));
    
    updateAuthUI();
    closeAuthModal();
    alert(`Welcome to the library catalog, ${name}! You are now signed in.`);
}

function updateAuthUI() {
    const authBtnDesktop = document.getElementById('auth-nav-btn');
    const authBtnMobile = document.getElementById('mobile-auth-btn');

    if (currentUser) {
        const displayText = `<i class="fa-solid fa-user-check mr-1"></i> ${currentUser.name.split(' ')[0]}`;
        authBtnDesktop.innerHTML = displayText;
        authBtnMobile.innerHTML = displayText;
        authBtnDesktop.className = "bg-emerald-700 hover:bg-emerald-800 text-white text-xs px-3.5 py-2 rounded-lg shadow transition";
        authBtnMobile.className = "w-full bg-emerald-700 text-white py-2 rounded-lg text-xs font-medium shadow";
    }
}

// Professional Librarian Admin PIN Portal
function triggerLibrarianPortal() {
    document.getElementById('librarian-modal').classList.remove('hidden');
    document.getElementById('librarian-modal').classList.add('flex');
}

function closeLibrarianModal() {
    document.getElementById('librarian-modal').classList.add('hidden');
    document.getElementById('librarian-modal').classList.remove('flex');
}

function verifyLibrarianPin(event) {
    event.preventDefault();
    const pin = document.getElementById('librarian-pin-input').value.trim();
    
    // Default demo PIN: 2026 (You can customize this)
    if (pin === "2026") {
        closeLibrarianModal();
        alert("Librarian Authorization Successful! Admin Dashboard mode active.");
        window.open("https://forms.gle/uEmyzCdZ3qiRpFyv9", "_blank"); // Linked to admin management form
    } else {
        alert("Incorrect security PIN. Access denied.");
        document.getElementById('librarian-pin-input').value = "";
    }
}

// Group Reading Queue Features (Restriction enforced: requires sign-in)
function addToGroupReading() {
    if (!currentUser) {
        closeModal();
        openAuthModal();
        alert("Please sign in first to add books to a Group Reading queue.");
        return;
    }

    if (currentSelectedBook && !groupReadingQueue.some(b => b.id === currentSelectedBook.id)) {
        groupReadingQueue.push(currentSelectedBook);
        updateGroupReadingUI();
        closeModal();
        alert(`"${currentSelectedBook.title}" has been added to your group reading queue.`);
    } else {
        alert("This book is already in your group reading schedule queue.");
    }
}

function updateGroupReadingUI() {
    const listContainer = document.getElementById('group-reading-list');
    document.getElementById('group-count').textContent = groupReadingQueue.length;
    document.getElementById('mobile-group-count').textContent = groupReadingQueue.length;

    if (groupReadingQueue.length === 0) {
        listContainer.innerHTML = `
            <div class="col-span-full bg-white/70 border border-church-200 p-4 rounded-xl text-xs text-church-600 italic">
                No books scheduled for group reading yet. Click "Details" on any book card to add it to your session queue.
            </div>`;
        return;
    }

    listContainer.innerHTML = '';
    groupReadingQueue.forEach(book => {
        const item = document.createElement('div');
        item.className = "bg-white p-3.5 rounded-xl border border-church-200 shadow-sm flex items-center space-x-3";
        item.innerHTML = `
            <img src="${book.image}" class="w-12 h-16 object-contain bg-church-50 rounded border border-church-100 p-0.5 shrink-0">
            <div class="flex-grow overflow-hidden">
                <span class="text-[10px] font-semibold text-church-600 uppercase">${book.category}</span>
                <h4 class="text-xs font-bold text-church-900 truncate">${book.title}</h4>
                <p class="text-[11px] text-church-700">By ${book.author}</p>
            </div>
            <button onclick="removeFromGroup(${book.id})" class="text-red-600 hover:text-red-800 text-xs px-2 py-1" title="Remove">&times;</button>
        `;
        listContainer.appendChild(item);
    });
}

function removeFromGroup(id) {
    groupReadingQueue = groupReadingQueue.filter(b => b.id !== id);
    updateGroupReadingUI();
}

function openGroupPlannerModal() {
    if (!currentUser) {
        openAuthModal();
        alert("Please sign in first to schedule group reading sessions.");
        return;
    }
    if (groupReadingQueue.length === 0) {
        alert("Your group reading queue is empty. Please add at least one book before scheduling a session.");
        return;
    }
    document.getElementById('group-planner-modal').classList.remove('hidden');
    document.getElementById('group-planner-modal').classList.add('flex');
}

function closeGroupPlannerModal() {
    document.getElementById('group-planner-modal').classList.add('hidden');
    document.getElementById('group-planner-modal').classList.remove('flex');
}

function submitGroupSchedule(event) {
    event.preventDefault();
    const groupName = document.getElementById('group-name').value;
    const groupDate = document.getElementById('group-date').value;

    alert(`Success! Session booked for "${groupName}" starting on ${groupDate} with ${groupReadingQueue.length} books queued. God bless your fellowship!`);
    closeGroupPlannerModal();
    groupReadingQueue = [];
    updateGroupReadingUI();
}

// Policies
function openPolicyModal(type) {
    const modalTitle = document.getElementById('policy-modal-title');
    const modalBody = document.getElementById('policy-modal-body');

    if (type === 'terms') {
        modalTitle.textContent = "Terms of Service & Library Guidelines";
        modalBody.innerHTML = `
            <p><strong>1. Standard Borrowing Duration:</strong> All borrowable books can be checked out for a maximum standard period of <strong>two (2) weeks (14 days)</strong>.</p>
            <p><strong>2. Book Safety & Care:</strong> Borrowers are entirely responsible for maintaining the physical safety and cleanliness of borrowed books.</p>
            <p><strong>3. Onsite-Only Materials:</strong> Reference items must be read within designated church reading spaces at Kiamunyi, Nakuru.</p>
        `;
    } else if (type === 'privacy') {
        modalTitle.textContent = "Privacy Policy";
        modalBody.innerHTML = `
            <p><strong>1. Data Collection:</strong> Crosspoint Bible Church collects member names and phone numbers solely for library management.</p>
            <p><strong>2. Confidentiality:</strong> Your information is handled securely and never distributed to third parties.</p>
        `;
    }

    document.getElementById('policy-modal').classList.add('flex');
    document.getElementById('policy-modal').classList.remove('hidden');
}

function closePolicyModal() {
    document.getElementById('policy-modal').classList.add('hidden');
    document.getElementById('policy-modal').classList.remove('flex');
}

window.onclick = function(event) {
    if (event.target === document.getElementById('book-modal')) closeModal();
    if (event.target === document.getElementById('policy-modal')) closePolicyModal();
    if (event.target === document.getElementById('auth-modal')) closeAuthModal();
    if (event.target === document.getElementById('librarian-modal')) closeLibrarianModal();
    if (event.target === document.getElementById('group-planner-modal')) closeGroupPlannerModal();
}
