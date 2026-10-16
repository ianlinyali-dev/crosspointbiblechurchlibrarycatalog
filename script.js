let allBooks = [];

document.addEventListener('DOMContentLoaded', () => {
    // Set dynamic footer copyright year
    document.getElementById('current-year').textContent = new Date().getFullYear();

    // Mobile menu toggle logic
    const menuBtn = document.getElementById('menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    menuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });

    // Load book data from books.json
    fetch('books.json')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            allBooks = data;
            displayBooks(allBooks);
        })
        .catch(error => {
            console.error('Error loading book catalog:', error);
            document.getElementById('book-grid').innerHTML = `
                <div class="col-span-full text-center py-10 text-red-600">
                    <p>Failed to load books catalog. Please ensure books.json is correctly configured.</p>
                </div>`;
        });

    // Setup Search & Category Filter Listeners
    document.getElementById('search-input').addEventListener('input', filterBooks);
    document.getElementById('category-filter').addEventListener('change', filterBooks);
});

// Render cards dynamically into the grid
function displayBooks(books) {
    const grid = document.getElementById('book-grid');
    const noResults = document.getElementById('no-results');
    grid.innerHTML = '';

    if (books.length === 0) {
        noResults.classList.remove('hidden');
        return;
    } else {
        noResults.classList.add('hidden');
    }

    books.forEach(book => {
        const isBorrowable = book.classification.toLowerCase() === 'borrowable';
        const badgeClass = isBorrowable ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';

        const card = document.createElement('div');
        card.className = "bg-white border border-church-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer";
        card.onclick = () => openModal(book);

        card.innerHTML = `
            <div>
                <div class="h-56 bg-church-100 overflow-hidden relative">
                    <img src="${book.image}" alt="${book.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                    <span class="absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm ${badgeClass}">
                        ${book.classification}
                    </span>
                </div>
                <div class="p-5 space-y-2">
                    <span class="text-xs font-medium text-church-600 uppercase tracking-wide">${book.category}</span>
                    <h3 class="font-bold text-church-900 text-base leading-snug group-hover:text-church-600 transition">${book.title}</h3>
                    <p class="text-xs text-church-700">By ${book.author}</p>
                </div>
            </div>
            <div class="px-5 pb-5 pt-2 border-t border-church-100 flex items-center justify-between text-xs">
                <span class="text-church-800 font-medium"><i class="fa-solid fa-copy mr-1 text-church-600"></i> ${book.copies} available</span>
                <span class="text-church-600 font-semibold group-hover:translate-x-1 transition-transform">Details &rarr;</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Filter engine checking text inputs and category dropdown selections
function filterBooks() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const selectedCategory = document.getElementById('category-filter').value;

    const filtered = allBooks.filter(book => {
        const matchesQuery = 
            book.title.toLowerCase().includes(query) ||
            book.author.toLowerCase().includes(query) ||
            book.category.toLowerCase().includes(query) ||
            (book.keywords && book.keywords.some(kw => kw.toLowerCase().includes(query)));

        const matchesCategory = selectedCategory === "" || book.category === selectedCategory;

        return matchesQuery && matchesCategory;
    });

    displayBooks(filtered);
}

// Book Details Modal handling logic
function openModal(book) {
    document.getElementById('modal-title').textContent = book.title;
    document.getElementById('modal-img').src = book.image;
    document.getElementById('modal-author').textContent = book.author;
    document.getElementById('modal-category').textContent = book.category;
    document.getElementById('modal-pubdate').textContent = book.publicationDate;
    document.getElementById('modal-copies').textContent = book.copies;
    
    const classificationEl = document.getElementById('modal-classification');
    classificationEl.textContent = book.classification;
    if(book.classification.toLowerCase() === 'borrowable') {
        classificationEl.className = "inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800";
        document.getElementById('modal-borrow-btn').style.display = "flex";
    } else {
        classificationEl.className = "inline-block px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800";
    }

    document.getElementById('modal-excerpt').textContent = book.excerpt;
    document.getElementById('book-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('book-modal').classList.add('hidden');
}

// Terms of Service & Privacy Policy Modal Handling
function openPolicyModal(type) {
    const modalTitle = document.getElementById('policy-modal-title');
    const modalBody = document.getElementById('policy-modal-body');

    if (type === 'terms') {
        modalTitle.textContent = "Terms of Service & Library Guidelines";
        modalBody.innerHTML = `
            <p><strong>1. Standard Borrowing Duration:</strong> All borrowable books can be checked out for a maximum standard period of <strong>two (2) weeks (14 days)</strong>. Extensions may be requested by contacting the library administrator.</p>
            <p><strong>2. Book Safety & Care:</strong> Borrowers are entirely responsible for maintaining the physical safety and cleanliness of borrowed books. Please keep books away from liquids, heavy moisture, extreme heat, and household pets or young children who might damage pages.</p>
            <p><strong>3. Onsite-Only Materials:</strong> Books marked as "Onsite Only" are reference items intended exclusively to be read within the designated church reading areas at Kiamunyi, Nakuru.</p>
            <p><strong>4. Return Protocol:</strong> Books must be returned directly to the designated church library coordinator or drop point on or before the due date so that other members of the congregation can also benefit from reading them.</p>
        `;
    } else if (type === 'privacy') {
        modalTitle.textContent = "Privacy Policy";
        modalBody.innerHTML = `
            <p><strong>1. Data Collection:</strong> When you fill out the book request form, Crosspoint Bible Church collects basic information such as your name, contact phone number, email address, and requested book titles.</p>
            <p><strong>2. Use of Information:</strong> This information is used strictly for library circulation management, tracking book loans, and communicating reminders regarding return dates.</p>
            <p><strong>3. Data Protection:</strong> Your personal information is handled with strict confidentiality by our church administration and will never be shared, sold, or distributed to any third parties.</p>
        `;
    }

    document.getElementById('policy-modal').classList.add('flex');
    document.getElementById('policy-modal').classList.remove('hidden');
}

function closePolicyModal() {
    document.getElementById('policy-modal').classList.add('hidden');
    document.getElementById('policy-modal').classList.remove('flex');
}

// Close modals when clicking outside window pane
window.onclick = function(event) {
    const bookModal = document.getElementById('book-modal');
    const policyModal = document.getElementById('policy-modal');
    if (event.target === bookModal) {
        closeModal();
    }
    if (event.target === policyModal) {
        closePolicyModal();
    }
}