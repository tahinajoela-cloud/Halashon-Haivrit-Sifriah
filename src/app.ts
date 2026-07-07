/**
 * Halashon Haivrit Sifriah - App Core
 * Offline-first Hebrew-French-Malagasy Interactive Language PWA
 * Powered by IndexedDB, LocalStorage, Custom Font Injection, and Dynamic Quizzing
 */

// ==========================================
// 1. DATA TYPES & INTERFACES
// ==========================================

interface Book {
  id: string;
  name: string;
  type: 'manual' | 'import';
  dateAdded: number;
}

interface ContentRow {
  id: string;
  bookId: string;
  niveauName: string;
  hebrewTitle: string;
  phoneticTitle: string;
  frenchTitle: string;
  malagasyTitle: string;
  categoryLesson: string;
  hebrew: string;
  phonetic: string;
  french: string;
  malagasy: string;
  rowOrder?: number;
  lessonNumber?: string;
}

interface FontItem {
  id: string;
  name: string;
  fileName: string;
  data: string; // Base64 encoding of font binary
}

// ==========================================
// 2. INDEXEDDB DATABASE MANAGER
// ==========================================

class DBManager {
  private dbName = 'HalashonHaivritDB';
  private version = 1;
  private db: IDBDatabase | null = null;

  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('IndexedDB open error');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        
        // Books Store
        if (!db.objectStoreNames.contains('books')) {
          db.createObjectStore('books', { keyPath: 'id' });
        }

        // Content Rows Store (Our unified data source)
        if (!db.objectStoreNames.contains('rows')) {
          const rowStore = db.createObjectStore('rows', { keyPath: 'id' });
          rowStore.createIndex('bookId', 'bookId', { unique: false });
          rowStore.createIndex('niveauName', 'niveauName', { unique: false });
          rowStore.createIndex('hebrewTitle', 'hebrewTitle', { unique: false });
        }

        // Custom Fonts Store
        if (!db.objectStoreNames.contains('fonts')) {
          db.createObjectStore('fonts', { keyPath: 'id' });
        }
      };
    });
  }

  // --- BOOK OPERATIONS ---
  getBooks(): Promise<Book[]> {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const transaction = this.db.transaction('books', 'readonly');
      const store = transaction.objectStore('books');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }

  addBook(book: Book): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const transaction = this.db.transaction('books', 'readwrite');
      const store = transaction.objectStore('books');
      store.put(book);
      transaction.oncomplete = () => resolve();
    });
  }

  deleteBook(id: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const transaction = this.db.transaction(['books', 'rows'], 'readwrite');
      
      // Delete book record
      transaction.objectStore('books').delete(id);
      
      // Cascade delete all rows belonging to book
      const rowStore = transaction.objectStore('rows');
      const index = rowStore.index('bookId');
      const request = index.getAllKeys(IDBKeyRange.only(id));
      
      request.onsuccess = () => {
        const keys = request.result || [];
        keys.forEach(key => rowStore.delete(key));
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  deleteLevel(bookId: string, niveauName: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const transaction = this.db.transaction('rows', 'readwrite');
      const store = transaction.objectStore('rows');
      const index = store.index('bookId');
      const request = index.getAll(IDBKeyRange.only(bookId));
      
      request.onsuccess = () => {
        const rows = request.result || [];
        const matching = rows.filter(r => r.niveauName === niveauName);
        matching.forEach(row => store.delete(row.id));
      };
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  deleteLesson(bookId: string, niveauName: string, hebrewTitle: string, phoneticTitle: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const transaction = this.db.transaction('rows', 'readwrite');
      const store = transaction.objectStore('rows');
      const index = store.index('bookId');
      const request = index.getAll(IDBKeyRange.only(bookId));
      
      request.onsuccess = () => {
        const rows = request.result || [];
        const matching = rows.filter(r => 
          r.niveauName === niveauName && 
          r.hebrewTitle === hebrewTitle && 
          r.phoneticTitle === phoneticTitle
        );
        matching.forEach(row => store.delete(row.id));
      };
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  // --- ROW OPERATIONS (Our Core Database) ---
  getAllRows(): Promise<ContentRow[]> {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const transaction = this.db.transaction('rows', 'readonly');
      const store = transaction.objectStore('rows');
      const request = store.getAll();
      request.onsuccess = () => {
        const rows = request.result || [];
        rows.sort((a, b) => (a.rowOrder ?? 0) - (b.rowOrder ?? 0));
        resolve(rows);
      };
      request.onerror = () => resolve([]);
    });
  }

  getRowsByBook(bookId: string): Promise<ContentRow[]> {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const transaction = this.db.transaction('rows', 'readonly');
      const store = transaction.objectStore('rows');
      const index = store.index('bookId');
      const request = index.getAll(IDBKeyRange.only(bookId));
      request.onsuccess = () => {
        const rows = request.result || [];
        rows.sort((a, b) => (a.rowOrder ?? 0) - (b.rowOrder ?? 0));
        resolve(rows);
      };
      request.onerror = () => resolve([]);
    });
  }

  addRowsBulk(rows: ContentRow[]): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db || rows.length === 0) return resolve();
      const transaction = this.db.transaction('rows', 'readwrite');
      const store = transaction.objectStore('rows');
      
      rows.forEach(row => store.put(row));
      
      transaction.oncomplete = () => resolve();
    });
  }

  addRow(row: ContentRow): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const transaction = this.db.transaction('rows', 'readwrite');
      const store = transaction.objectStore('rows');
      store.put(row);
      transaction.oncomplete = () => resolve();
    });
  }

  deleteRow(id: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const transaction = this.db.transaction('rows', 'readwrite');
      const store = transaction.objectStore('rows');
      store.delete(id);
      transaction.oncomplete = () => resolve();
    });
  }

  // --- CUSTOM FONTS OPERATIONS ---
  getFonts(): Promise<FontItem[]> {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const transaction = this.db.transaction('fonts', 'readonly');
      const store = transaction.objectStore('fonts');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }

  addFont(font: FontItem): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const transaction = this.db.transaction('fonts', 'readwrite');
      const store = transaction.objectStore('fonts');
      store.put(font);
      transaction.oncomplete = () => resolve();
    });
  }

  deleteFont(id: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const transaction = this.db.transaction('fonts', 'readwrite');
      const store = transaction.objectStore('fonts');
      store.delete(id);
      transaction.oncomplete = () => resolve();
    });
  }
}

const db = new DBManager();

// ==========================================
// 3. APP STATE & NAVIGATION
// ==========================================

const state = {
  currentLevel: 1, // 1: Library, 2: Niveaux, 3: Lessons, 4: Lesson page
  selectedBookId: '',
  selectedNiveauName: '',
  selectedLesson: {
    hebrewTitle: '',
    phoneticTitle: '',
    frenchTitle: '',
    malagasyTitle: '',
    lessonNumber: ''
  },
  
  navigationHistory: [] as number[],
  searchMode: false,
  importedFileParsedData: [] as any[],
  importedFileName: '',
  importedHeaders: [] as string[],
  importTargetType: 'new-book' as 'new-book' | 'current-book' | 'current-level',

  // Preferences (Saved in LocalStorage)
  preferences: {
    selectedHebrewFont: 'default',
    fsInterface: 16,
    fsHebrew: 24,
    fsPhonetic: 16,
    fsFrench: 16,
    fsMalagasy: 16
  }
};

// ==========================================
// 4. HELPER UTILITIES
// ==========================================

function generateUUID(): string {
  return 'u_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function escapeHTMLAttr(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

// Read renaming mappings from localStorage
function getRenamedBook(bookId: string, defaultName: string): string {
  const map = JSON.parse(localStorage.getItem('renamed_books') || '{}');
  return map[bookId] || defaultName;
}

function saveRenamedBook(bookId: string, newName: string) {
  const map = JSON.parse(localStorage.getItem('renamed_books') || '{}');
  map[bookId] = newName;
  localStorage.setItem('renamed_books', JSON.stringify(map));
}

function getRenamedNiveau(bookId: string, oldName: string): string {
  const map = JSON.parse(localStorage.getItem('renamed_niveaux') || '{}');
  const key = `${bookId}_${oldName}`;
  return map[key] || oldName;
}

function saveRenamedNiveau(bookId: string, oldName: string, newName: string) {
  const map = JSON.parse(localStorage.getItem('renamed_niveaux') || '{}');
  const key = `${bookId}_${oldName}`;
  map[key] = newName;
  localStorage.setItem('renamed_niveaux', JSON.stringify(map));
}

function getRenamedCategory(categoryName: string): string {
  const map = JSON.parse(localStorage.getItem('renamed_categories') || '{}');
  return map[categoryName] || categoryName;
}

function saveRenamedCategory(oldName: string, newName: string) {
  const map = JSON.parse(localStorage.getItem('renamed_categories') || '{}');
  map[oldName] = newName;
  localStorage.setItem('renamed_categories', JSON.stringify(map));
}

// UI notification utility
function showToast(message: string, isError = false) {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-100 px-5 py-3 rounded-xl shadow-xl font-medium text-xs flex items-center gap-2 border animate-fade-in ${
    isError 
    ? 'bg-rose-50 text-rose-800 border-rose-200 shadow-rose-100' 
    : 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-100'
  }`;
  toast.innerHTML = `<i class="fa-solid ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'} text-base"></i> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ==========================================
// 5. CUSTOM FONTS & TYPOGRAPHY MANAGER
// ==========================================

async function applyCustomFonts() {
  const fonts = await db.getFonts();
  const styleTag = document.getElementById('dynamic-fonts') as HTMLStyleElement;
  
  if (styleTag) {
    styleTag.innerHTML = fonts.map(f => `
      @font-face {
        font-family: '${f.name}';
        src: url('data:font/opentype;base64,${f.data}');
      }
    `).join('\n');
  }

  // Update selection dropdown in settings
  const select = document.getElementById('settings-hebrew-font') as HTMLSelectElement;
  if (select) {
    // Clear dynamic options
    const defaultOption = select.options[0];
    select.innerHTML = '';
    select.appendChild(defaultOption);

    fonts.forEach(f => {
      const option = document.createElement('option');
      option.value = f.name;
      option.textContent = f.name;
      if (state.preferences.selectedHebrewFont === f.name) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  // Apply actual font choice CSS variable
  const activeFont = state.preferences.selectedHebrewFont;
  const fontValue = activeFont === 'default' ? '"Inter", sans-serif' : `"${activeFont}", sans-serif`;
  document.documentElement.style.setProperty('--ff-hebrew', fontValue);
}

function applyFontSizes() {
  const prefs = state.preferences;
  document.documentElement.style.setProperty('--fs-interface', `${prefs.fsInterface}px`);
  document.documentElement.style.setProperty('--fs-hebrew', `${prefs.fsHebrew}px`);
  document.documentElement.style.setProperty('--fs-phonetic', `${prefs.fsPhonetic}px`);
  document.documentElement.style.setProperty('--fs-french', `${prefs.fsFrench}px`);
  document.documentElement.style.setProperty('--fs-malagasy', `${prefs.fsMalagasy}px`);

  // Update settings range value badges
  const labelsMap = {
    'interface': prefs.fsInterface,
    'hebrew': prefs.fsHebrew,
    'phonetic': prefs.fsPhonetic,
    'french': prefs.fsFrench,
    'malagasy': prefs.fsMalagasy
  };

  Object.entries(labelsMap).forEach(([key, val]) => {
    const el = document.getElementById(`label-size-${key}`);
    if (el) el.textContent = `${val}px`;
    const input = document.getElementById(`size-${key}`) as HTMLInputElement;
    if (input) input.value = String(val);
  });
}

function loadPreferences() {
  const stored = localStorage.getItem('sifriah_preferences');
  if (stored) {
    try {
      state.preferences = { ...state.preferences, ...JSON.parse(stored) };
    } catch (e) {
      console.error('Error loading preferences');
    }
  }
  applyFontSizes();
}

function savePreferences() {
  localStorage.setItem('sifriah_preferences', JSON.stringify(state.preferences));
  applyFontSizes();
  applyCustomFonts();
}

// ==========================================
// 6. ROUTER & VIEWS RENDERING
// ==========================================

function navigateTo(level: number) {
  if (state.currentLevel !== level && !state.searchMode) {
    state.navigationHistory.push(state.currentLevel);
  }
  state.currentLevel = level;
  state.searchMode = false;

  // Sync breadcrumbs visibility
  const bcBook = document.getElementById('breadcrumb-book')!;
  const bcNiveau = document.getElementById('breadcrumb-niveau')!;
  const bcLesson = document.getElementById('breadcrumb-lesson')!;
  const bcSeps = document.querySelectorAll('.breadcrumb-sep');

  // Hide everything first
  bcBook.classList.add('hidden');
  bcNiveau.classList.add('hidden');
  bcLesson.classList.add('hidden');
  bcSeps.forEach(s => s.classList.add('hidden'));

  if (level >= 2) {
    bcSeps[0].classList.remove('hidden');
    bcBook.classList.remove('hidden');
    db.getBooks().then(books => {
      const book = books.find(b => b.id === state.selectedBookId);
      bcBook.textContent = getRenamedBook(state.selectedBookId, book ? book.name : 'Book');
    });
  }
  if (level >= 3) {
    bcSeps[1].classList.remove('hidden');
    bcNiveau.classList.remove('hidden');
    bcNiveau.textContent = getRenamedNiveau(state.selectedBookId, state.selectedNiveauName);
  }
  if (level >= 4) {
    bcSeps[2].classList.remove('hidden');
    bcLesson.classList.remove('hidden');
    bcLesson.textContent = state.selectedLesson.phoneticTitle || 'Lesson';
  }

  // Toggle views
  const views = ['view-level-1', 'view-level-2', 'view-level-3', 'view-level-4', 'view-search-results'];
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.classList.add('hidden');
  });

  const activeViewId = `view-level-${level}`;
  const activeView = document.getElementById(activeViewId);
  if (activeView) activeView.classList.remove('hidden');

  // Clear global search input when returning to default routing
  const searchInput = document.getElementById('global-search') as HTMLInputElement;
  if (searchInput) {
    searchInput.value = '';
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
  }

  // Render contents
  switch (level) {
    case 1: renderLevel1(); break;
    case 2: renderLevel2(); break;
    case 3: renderLevel3(); break;
    case 4: renderLevel4(); break;
  }
}

// Render Level 1: Library overview
async function renderLevel1() {
  const booksGrid = document.getElementById('books-grid')!;
  const placeholder = document.getElementById('no-books-placeholder')!;
  
  booksGrid.innerHTML = '';
  const books = await db.getBooks();
  const allRows = await db.getAllRows();

  if (books.length === 0) {
    placeholder.classList.remove('hidden');
    booksGrid.classList.add('hidden');
    return;
  }

  placeholder.classList.add('hidden');
  booksGrid.classList.remove('hidden');

  books.sort((a, b) => b.dateAdded - a.dateAdded).forEach(book => {
    const bookRows = allRows.filter(r => r.bookId === book.id);
    
    // Count lessons and levels
    const levelsSet = new Set(bookRows.map(r => r.niveauName));
    const lessonsSet = new Set(bookRows.map(r => r.hebrewTitle));

    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl border border-slate-200/85 p-5 shadow-xs hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer flex flex-col justify-between group relative animate-fade-in';
    card.id = `book-card-${book.id}`;
    card.innerHTML = `
      <div class="space-y-4">
        <!-- Card Icon & Badges -->
        <div class="flex items-start justify-between">
          <div class="w-12 h-12 rounded-xl ${book.type === 'import' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'} flex items-center justify-center text-xl transition-colors group-hover:bg-indigo-600 group-hover:text-white">
            <i class="fa-solid ${book.type === 'import' ? 'fa-file-excel' : 'fa-pen-ruler'}"></i>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${book.type === 'import' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}">${book.type}</span>
          </div>
        </div>

        <!-- Book Text Info -->
        <div class="space-y-1">
          <h4 class="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">${getRenamedBook(book.id, book.name)}</h4>
          <p class="text-xs text-slate-400">Added: ${new Date(book.dateAdded).toLocaleDateString()}</p>
        </div>

        <!-- Stats Bar -->
        <div class="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100 text-center text-slate-500">
          <div>
            <span class="block text-xs font-bold text-slate-900">${levelsSet.size}</span>
            <span class="text-[9px] uppercase font-bold tracking-wider text-slate-400">Levels</span>
          </div>
          <div>
            <span class="block text-xs font-bold text-slate-900">${lessonsSet.size}</span>
            <span class="text-[9px] uppercase font-bold tracking-wider text-slate-400">Lessons</span>
          </div>
          <div>
            <span class="block text-xs font-bold text-slate-900">${bookRows.length}</span>
            <span class="text-[9px] uppercase font-bold tracking-wider text-slate-400">Entries</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-slate-50">
        <button class="rename-book-btn p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs transition-all cursor-pointer" data-id="${book.id}" title="Rename Book">
          <i class="fa-solid fa-signature"></i>
        </button>
        <button class="delete-book-btn p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs transition-all cursor-pointer" data-id="${book.id}" title="Delete Book">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    // Clicking card (except actions) triggers navigation
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.delete-book-btn') || target.closest('.rename-book-btn')) {
        return;
      }
      state.selectedBookId = book.id;
      navigateTo(2);
    });

    booksGrid.appendChild(card);
  });

  // Attach event listeners to action buttons
  document.querySelectorAll('.delete-book-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id!;
      const currentName = (btn.closest('.group')!.querySelector('h4')!.textContent || '').trim();
      openDeleteBookModal(id, currentName);
    });
  });

  document.querySelectorAll('.rename-book-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id!;
      const currentName = (btn.closest('.group')!.querySelector('h4')!.textContent || '').trim();
      openRenameBookModal(id, currentName);
    });
  });
}

// Render Level 2: List Niveaux (derived from rows)
async function renderLevel2() {
  const activeBook = document.getElementById('active-book-title')!;
  const meta = document.getElementById('active-book-meta')!;
  const grid = document.getElementById('niveaux-grid')!;

  grid.innerHTML = '';
  
  const books = await db.getBooks();
  const book = books.find(b => b.id === state.selectedBookId);
  const renamedTitle = getRenamedBook(state.selectedBookId, book ? book.name : 'Unknown Book');
  activeBook.textContent = renamedTitle;
  
  const rows = await db.getRowsByBook(state.selectedBookId);
  
  // Calculate level-specific numbers
  const niveauMap = new Map<string, { lessons: Set<string>; count: number }>();
  rows.forEach(r => {
    if (!niveauMap.has(r.niveauName)) {
      niveauMap.set(r.niveauName, { lessons: new Set(), count: 0 });
    }
    const bucket = niveauMap.get(r.niveauName)!;
    bucket.lessons.add(r.hebrewTitle);
    bucket.count++;
  });

  const uniqueNiveaux = Array.from(niveauMap.keys());
  meta.textContent = `${uniqueNiveaux.length} levels mapped in this digital library`;

  uniqueNiveaux.forEach(oldNiveauName => {
    const stat = niveauMap.get(oldNiveauName)!;
    const renamedNiveauName = getRenamedNiveau(state.selectedBookId, oldNiveauName);

    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer flex flex-col justify-between group animate-fade-in';
    card.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">
            <i class="fa-solid fa-layer-group"></i>
          </div>
          <span class="text-[10px] font-mono text-slate-400">ID: ${oldNiveauName.substring(0, 10)}</span>
        </div>

        <div class="space-y-1">
          <h4 class="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">${renamedNiveauName}</h4>
          ${renamedNiveauName !== oldNiveauName ? `<p class="text-[10px] font-medium text-slate-400 italic">Original: ${oldNiveauName}</p>` : ''}
        </div>

        <div class="flex items-center gap-4 text-xs text-slate-500 pt-3 border-t border-slate-100">
          <div><span class="font-bold text-slate-800">${stat.lessons.size}</span> Lessons</div>
          <div><span class="font-bold text-slate-800">${stat.count}</span> Cards</div>
        </div>
      </div>

      <div class="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-slate-50">
        <button class="rename-niveau-btn p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs transition-all cursor-pointer" data-oldname="${escapeHTMLAttr(oldNiveauName)}" title="Rename Niveau">
          <i class="fa-solid fa-signature"></i>
        </button>
        <button class="delete-niveau-btn p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs transition-all cursor-pointer" data-oldname="${escapeHTMLAttr(oldNiveauName)}" title="Delete Niveau">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.rename-niveau-btn') || target.closest('.delete-niveau-btn')) {
        return;
      }
      state.selectedNiveauName = oldNiveauName;
      navigateTo(3);
    });

    grid.appendChild(card);
  });

  // Level operations
  document.querySelectorAll('.rename-niveau-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const oldName = (btn as HTMLElement).dataset.oldname!;
      const currentLabel = getRenamedNiveau(state.selectedBookId, oldName);
      openRenameLevelModal(state.selectedBookId, oldName, currentLabel);
    });
  });

  document.querySelectorAll('.delete-niveau-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const oldName = (btn as HTMLElement).dataset.oldname!;
      openDeleteLevelModal(state.selectedBookId, oldName);
    });
  });
}

// Render Level 3: Lessons inside selected level
async function renderLevel3() {
  const title = document.getElementById('active-niveau-title')!;
  const meta = document.getElementById('active-niveau-meta')!;
  const grid = document.getElementById('lessons-grid')!;
  const placeholder = document.getElementById('no-lessons-placeholder')!;

  grid.innerHTML = '';

  const mappedTitle = getRenamedNiveau(state.selectedBookId, state.selectedNiveauName);
  title.textContent = mappedTitle;

  const rows = await db.getRowsByBook(state.selectedBookId);
  const niveauRows = rows.filter(r => r.niveauName === state.selectedNiveauName);

  // Group unique lessons based on HebrewTitle + PhoneticTitle
  const lessonMap = new Map<string, {
    hebrewTitle: string;
    phoneticTitle: string;
    frenchTitle: string;
    malagasyTitle: string;
    rows: ContentRow[];
  }>();

  niveauRows.forEach(row => {
    const key = `${row.hebrewTitle}_${row.phoneticTitle}`;
    if (!lessonMap.has(key)) {
      lessonMap.set(key, {
        hebrewTitle: row.hebrewTitle,
        phoneticTitle: row.phoneticTitle,
        frenchTitle: row.frenchTitle,
        malagasyTitle: row.malagasyTitle,
        rows: []
      });
    }
    lessonMap.get(key)!.rows.push(row);
  });

  const uniqueLessons = Array.from(lessonMap.values());
  meta.textContent = `${uniqueLessons.length} modules available for study in this level`;

  if (uniqueLessons.length === 0) {
    placeholder.classList.remove('hidden');
    grid.classList.add('hidden');
    return;
  }

  placeholder.classList.add('hidden');
  grid.classList.remove('hidden');

  uniqueLessons.forEach(les => {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer flex flex-col justify-between group animate-fade-in';
    card.innerHTML = `
      <div class="space-y-4">
        <!-- Badge and Lesson Number -->
        <div class="flex items-start justify-between">
          <div class="flex flex-wrap items-center gap-1.5">
            ${les.rows[0]?.lessonNumber ? `<span class="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">${escapeHTMLAttr(les.rows[0].lessonNumber)}</span>` : ''}
          </div>
          <span class="text-[10px] font-mono text-slate-400 font-semibold">${les.rows.length} cards</span>
        </div>

        <!-- Hebrew Display -->
        <div class="text-center py-2 bg-slate-50 rounded-xl border border-slate-50 space-y-1">
          <h4 class="text-xl font-bold font-display text-slate-950 text-center text-hebrew" style="direction: rtl;">${les.hebrewTitle}</h4>
          <p class="text-xs text-slate-500 font-medium text-phonetic">${les.phoneticTitle}</p>
        </div>

        <!-- English/French translations mapping in list -->
        <div class="text-xs text-slate-500 space-y-1 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
          <div class="text-center pb-1 border-b border-slate-200/50">
            <span class="text-[9px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">French</span>
            <span class="font-semibold text-slate-800 text-french block text-center">${les.frenchTitle}</span>
          </div>
          <div class="text-center pt-1">
            <span class="text-[9px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Malagasy</span>
            <span class="font-semibold text-slate-800 text-malagasy block text-center">${les.malagasyTitle}</span>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-slate-50">
        <button class="delete-lesson-btn p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs transition-all cursor-pointer" data-hebrew="${escapeHTMLAttr(les.hebrewTitle)}" data-phonetic="${escapeHTMLAttr(les.phoneticTitle)}" title="Delete Lesson">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.delete-lesson-btn')) {
        return;
      }
      state.selectedLesson = {
        hebrewTitle: les.hebrewTitle,
        phoneticTitle: les.phoneticTitle,
        frenchTitle: les.frenchTitle,
        malagasyTitle: les.malagasyTitle,
        lessonNumber: les.rows[0]?.lessonNumber || ''
      };
      navigateTo(4);
    });

    grid.appendChild(card);
  });

  document.querySelectorAll('.delete-lesson-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const heb = (btn as HTMLElement).dataset.hebrew!;
      const pho = (btn as HTMLElement).dataset.phonetic!;
      if (confirm(`Are you sure you want to delete the lesson "${pho}" (${heb})? All content cards inside will be deleted.`)) {
        await db.deleteLesson(state.selectedBookId, state.selectedNiveauName, heb, pho);
        showToast('Lesson deleted successfully');
        renderLevel3();
      }
    });
  });
}

// Render Level 4: Selected Lesson Full Page with grouped Categories and cards
async function renderLevel4() {
  const headerHebrew = document.getElementById('lesson-header-hebrew')!;
  const headerPhonetic = document.getElementById('lesson-header-phonetic')!;
  const headerFrench = document.getElementById('lesson-header-french')!;
  const headerMalagasy = document.getElementById('lesson-header-malagasy')!;
  const headerCategory = document.getElementById('lesson-header-category')!;
  const categoriesContainer = document.getElementById('lesson-content-categories')!;
  const placeholder = document.getElementById('no-rows-placeholder')!;

  categoriesContainer.innerHTML = '';

  const { hebrewTitle, phoneticTitle, frenchTitle, malagasyTitle } = state.selectedLesson;
  headerHebrew.textContent = hebrewTitle;
  headerPhonetic.textContent = phoneticTitle;
  headerFrench.textContent = frenchTitle;
  headerMalagasy.textContent = malagasyTitle;

  const rows = await db.getRowsByBook(state.selectedBookId);
  const lessonRows = rows.filter(r => 
    r.niveauName === state.selectedNiveauName && 
    r.hebrewTitle === hebrewTitle && 
    r.phoneticTitle === phoneticTitle
  );

  const headerNumber = document.getElementById('lesson-header-number')!;
  const activeLessonNum = lessonRows.length > 0 ? (lessonRows[0].lessonNumber || '') : (state.selectedLesson.lessonNumber || '');
  if (activeLessonNum) {
    headerNumber.textContent = activeLessonNum;
    headerNumber.classList.remove('hidden');
  } else {
    headerNumber.classList.add('hidden');
  }

  // Do not show category above the title, hide it
  headerCategory.classList.add('hidden');

  if (lessonRows.length === 0) {
    placeholder.classList.remove('hidden');
    categoriesContainer.classList.add('hidden');
    return;
  }

  placeholder.classList.add('hidden');
  categoriesContainer.classList.remove('hidden');

  // Group rows by categoryLesson
  const categoryGroups = new Map<string, ContentRow[]>();
  lessonRows.forEach(row => {
    const cat = row.categoryLesson || 'Uncategorized';
    if (!categoryGroups.has(cat)) {
      categoryGroups.set(cat, []);
    }
    categoryGroups.get(cat)!.push(row);
  });

  categoryGroups.forEach((rowsInGroup, categoryName) => {
    const section = document.createElement('div');
    section.className = 'space-y-4 animate-fade-in';
    
    // Header for the specific grouped category
    const headerWrapper = document.createElement('div');
    headerWrapper.className = 'flex items-center justify-between border-b border-slate-200 pb-2 mb-4';
    
    const displayCategoryName = getRenamedCategory(categoryName);

    headerWrapper.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
        <h4 class="text-base font-extrabold text-slate-800 tracking-tight font-display uppercase">${displayCategoryName}</h4>
        ${displayCategoryName !== categoryName ? `<span class="text-[10px] text-slate-400 italic">(${categoryName})</span>` : ''}
      </div>
      <button class="rename-category-btn px-2 py-1 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 text-xs font-semibold rounded-lg transition-all cursor-pointer" data-category="${escapeHTMLAttr(categoryName)}">
        <i class="fa-solid fa-signature mr-1"></i> Rename Category
      </button>
    `;

    section.appendChild(headerWrapper);

    // Cards Grid for rows
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';

    rowsInGroup.forEach(row => {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 hover:shadow-xs transition-all relative group animate-fade-in';
      card.innerHTML = `
        <div class="space-y-4 text-center">
          <!-- Hebrew card title (large, centered, RTL) -->
          <div class="text-3xl font-bold py-2 font-display text-slate-950 text-hebrew select-all leading-normal" style="direction: rtl;">
            ${row.hebrew}
          </div>
          <!-- Phonetic transcription -->
          <p class="text-sm font-semibold text-slate-500 text-phonetic">${row.phonetic}</p>

          <!-- Separator -->
          <div class="w-12 h-0.5 bg-indigo-100/60 mx-auto rounded"></div>

          <!-- French and Malagasy translations -->
          <div class="grid grid-cols-2 gap-2 text-xs pt-1">
            <div class="bg-slate-50 rounded-lg p-2 border border-slate-100/50">
              <span class="text-[9px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">French</span>
              <span class="font-medium text-slate-700 text-french block text-center">${row.french}</span>
            </div>
            <div class="bg-slate-50 rounded-lg p-2 border border-slate-100/50">
              <span class="text-[9px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Malagasy</span>
              <span class="font-medium text-slate-700 text-malagasy block text-center">${row.malagasy}</span>
            </div>
          </div>
        </div>

        <!-- Row Edit/Delete controllers -->
        <div class="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-slate-100">
          <button class="edit-row-btn p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs transition-all cursor-pointer" data-id="${row.id}">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="delete-row-btn p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs transition-all cursor-pointer" data-id="${row.id}">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

    section.appendChild(grid);
    categoriesContainer.appendChild(section);
  });

  // Attach event handlers
  document.querySelectorAll('.rename-category-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const orig = (btn as HTMLElement).dataset.category!;
      const currentLabel = getRenamedCategory(orig);
      const newName = prompt(`Enter a display name for the category "${currentLabel}":`, currentLabel);
      if (newName && newName.trim() !== '') {
        saveRenamedCategory(orig, newName.trim());
        showToast('Category renamed in UI');
        renderLevel4();
      }
    });
  });

  document.querySelectorAll('.edit-row-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = (btn as HTMLElement).dataset.id!;
      const row = lessonRows.find(r => r.id === id);
      if (row) {
        openContentRowModal(row);
      }
    });
  });

  document.querySelectorAll('.delete-row-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = (btn as HTMLElement).dataset.id!;
      if (confirm('Delete this card? This cannot be undone.')) {
        await db.deleteRow(id);
        showToast('Card deleted successfully');
        renderLevel4();
      }
    });
  });
}

// ==========================================
// 7. REAL-TIME GLOBAL SEARCH BAR
// ==========================================

async function performSearch(query: string) {
  const container = document.getElementById('search-results-container')!;
  const desc = document.getElementById('search-query-desc')!;
  
  container.innerHTML = '';
  desc.textContent = `Showing results matching "${query}"`;

  if (!query.trim()) {
    return;
  }

  const allRows = await db.getAllRows();
  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  // Filter rows
  const matches = allRows.filter(row => {
    const fieldsToSearch = [
      row.hebrew,
      row.phonetic,
      row.french,
      row.malagasy,
      row.hebrewTitle,
      row.phoneticTitle,
      row.frenchTitle,
      row.malagasyTitle,
      row.niveauName,
      row.categoryLesson
    ].map(f => (f || '').toLowerCase());

    return searchTerms.every(term => 
      fieldsToSearch.some(field => field.includes(term))
    );
  });

  if (matches.length === 0) {
    container.innerHTML = `
      <div class="py-16 text-center bg-white border border-slate-100 rounded-2xl space-y-3">
        <div class="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-400">
          <i class="fa-solid fa-magnifying-glass text-lg"></i>
        </div>
        <p class="text-sm font-semibold text-slate-700">No results found</p>
        <p class="text-xs text-slate-400 max-w-xs mx-auto">Try refining your Hebrew spelling, phonetic sounds, or translation queries.</p>
      </div>
    `;
    return;
  }

  // Group search results by Book -> Lesson
  const books = await db.getBooks();
  const resultsByLesson = new Map<string, {
    book: Book | undefined;
    niveauName: string;
    hebrewTitle: string;
    phoneticTitle: string;
    rows: ContentRow[];
  }>();

  matches.forEach(row => {
    const key = `${row.bookId}_${row.niveauName}_${row.hebrewTitle}`;
    if (!resultsByLesson.has(key)) {
      resultsByLesson.set(key, {
        book: books.find(b => b.id === row.bookId),
        niveauName: row.niveauName,
        hebrewTitle: row.hebrewTitle,
        phoneticTitle: row.phoneticTitle,
        rows: []
      });
    }
    resultsByLesson.get(key)!.rows.push(row);
  });

  resultsByLesson.forEach((lesGroup, key) => {
    const groupCard = document.createElement('div');
    groupCard.className = 'bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs hover:border-indigo-300 hover:shadow-xs transition-all animate-fade-in';
    
    const displayBookName = lesGroup.book ? getRenamedBook(lesGroup.book.id, lesGroup.book.name) : 'Unknown Book';
    const displayNiveauName = getRenamedNiveau(lesGroup.book?.id || '', lesGroup.niveauName);

    groupCard.innerHTML = `
      <!-- Context breadcrumb in search results -->
      <div class="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        <span><i class="fa-solid fa-book"></i> ${displayBookName}</span>
        <i class="fa-solid fa-chevron-right text-[8px]"></i>
        <span><i class="fa-solid fa-layer-group"></i> ${displayNiveauName}</span>
        <i class="fa-solid fa-chevron-right text-[8px]"></i>
        <span class="text-indigo-600 font-extrabold"><i class="fa-solid fa-circle-play"></i> Lesson: ${lesGroup.phoneticTitle} (${lesGroup.hebrewTitle})</span>
      </div>

      <!-- Action Button to go to Lesson -->
      <div class="flex items-center justify-between border-b border-slate-50 pb-2 mb-2">
        <h4 class="text-sm font-bold text-slate-950 font-display">${lesGroup.phoneticTitle} - ${lesGroup.hebrewTitle}</h4>
        <button class="go-to-lesson-btn px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1">
          Open Lesson <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>

      <!-- List of matching entries inside -->
      <div class="space-y-3">
        ${lesGroup.rows.map(row => `
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-100/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div class="text-center sm:text-left space-y-1">
              <div class="text-lg font-bold text-slate-900 text-hebrew" style="direction: rtl;">${row.hebrew}</div>
              <div class="font-medium text-slate-500 italic text-phonetic">${row.phonetic}</div>
            </div>
            <div class="grid grid-cols-2 gap-3 shrink-0 text-[11px] font-medium text-slate-600">
              <div class="bg-white px-2.5 py-1 rounded border border-slate-200/50 text-french">FR: <span class="font-semibold text-slate-800">${row.french}</span></div>
              <div class="bg-white px-2.5 py-1 rounded border border-slate-200/50 text-malagasy">MG: <span class="font-semibold text-slate-800">${row.malagasy}</span></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    groupCard.querySelector('.go-to-lesson-btn')?.addEventListener('click', () => {
      // Set selections and route
      state.selectedBookId = lesGroup.book?.id || '';
      state.selectedNiveauName = lesGroup.niveauName;
      state.selectedLesson = {
        hebrewTitle: lesGroup.hebrewTitle,
        phoneticTitle: lesGroup.phoneticTitle,
        frenchTitle: '', // filled during renderLevel4
        malagasyTitle: '', // filled during renderLevel4
        lessonNumber: ''
      };
      
      // Look up full titles
      const matchedRow = lesGroup.rows[0];
      if (matchedRow) {
        state.selectedLesson.frenchTitle = matchedRow.frenchTitle;
        state.selectedLesson.malagasyTitle = matchedRow.malagasyTitle;
        state.selectedLesson.lessonNumber = matchedRow.lessonNumber || '';
      }

      state.searchMode = false;
      navigateTo(4);
    });

    container.appendChild(groupCard);
  });
}

// ==========================================
// 8. POP-UP MODALS SYSTEM
// ==========================================

const backdrop = document.getElementById('modal-backdrop')!;

function openModal(modalId: string) {
  const modal = document.getElementById(modalId)!;
  backdrop.classList.remove('pointer-events-none');
  backdrop.classList.add('opacity-100');
  
  modal.classList.remove('pointer-events-none');
  modal.classList.add('opacity-100', 'scale-100');
  modal.classList.remove('scale-90');
}

function closeModal() {
  backdrop.classList.add('pointer-events-none');
  backdrop.classList.remove('opacity-100');
  
  const modals = document.querySelectorAll('[id^="modal-"]');
  modals.forEach(modal => {
    modal.classList.add('pointer-events-none');
    modal.classList.remove('opacity-100', 'scale-100');
    modal.classList.add('scale-90');
  });

  // Specifically reset Quiz panel state if closed
  resetQuizState();
}

// Open modal to add/edit content rows
function openContentRowModal(rowToEdit?: ContentRow) {
  const modalTitle = document.getElementById('row-modal-title')!;
  const saveBtn = document.getElementById('row-save-btn')!;
  const form = document.getElementById('content-row-form') as HTMLFormElement;
  
  form.reset();

  // Load active CategoryLesson automatically as a helpful hint
  const catInput = document.getElementById('row-category') as HTMLInputElement;
  catInput.value = state.selectedLesson.hebrewTitle ? 'Phrases' : '';

  if (rowToEdit) {
    modalTitle.textContent = 'Edit Content Card';
    saveBtn.textContent = 'Save Changes';
    
    (document.getElementById('edit-row-id') as HTMLInputElement).value = rowToEdit.id;
    (document.getElementById('edit-row-order') as HTMLInputElement).value = rowToEdit.rowOrder !== undefined ? String(rowToEdit.rowOrder) : '';
    (document.getElementById('row-hebrew') as HTMLInputElement).value = rowToEdit.hebrew;
    (document.getElementById('row-phonetic') as HTMLInputElement).value = rowToEdit.phonetic;
    (document.getElementById('row-french') as HTMLInputElement).value = rowToEdit.french;
    (document.getElementById('row-malagasy') as HTMLInputElement).value = rowToEdit.malagasy;
    catInput.value = rowToEdit.categoryLesson;
  } else {
    modalTitle.textContent = 'Add Entry Card';
    saveBtn.textContent = 'Save Entry';
    (document.getElementById('edit-row-id') as HTMLInputElement).value = '';
    (document.getElementById('edit-row-order') as HTMLInputElement).value = '';
    
    // Get last category in this lesson as a smart prefill
    db.getRowsByBook(state.selectedBookId).then(rows => {
      const lessonRows = rows.filter(r => 
        r.niveauName === state.selectedNiveauName && 
        r.hebrewTitle === state.selectedLesson.hebrewTitle
      );
      if (lessonRows.length > 0) {
        catInput.value = lessonRows[lessonRows.length - 1].categoryLesson;
      }
    });
  }

  openModal('modal-content-row');
}

function openRenameBookModal(bookId: string, currentName: string) {
  (document.getElementById('rename-book-id') as HTMLInputElement).value = bookId;
  (document.getElementById('rename-book-input') as HTMLInputElement).value = currentName;
  openModal('modal-rename-book');
}

function openDeleteBookModal(bookId: string, currentName: string) {
  (document.getElementById('delete-book-id') as HTMLInputElement).value = bookId;
  document.getElementById('delete-book-name-display')!.textContent = currentName;
  openModal('modal-delete-book');
}

function openRenameLevelModal(bookId: string, oldName: string, currentLabel: string) {
  (document.getElementById('rename-level-book-id') as HTMLInputElement).value = bookId;
  (document.getElementById('rename-level-old-name') as HTMLInputElement).value = oldName;
  (document.getElementById('rename-level-input') as HTMLInputElement).value = currentLabel;
  openModal('modal-rename-level');
}

function openDeleteLevelModal(bookId: string, oldName: string) {
  (document.getElementById('delete-level-book-id') as HTMLInputElement).value = bookId;
  (document.getElementById('delete-level-old-name') as HTMLInputElement).value = oldName;
  const currentLabel = getRenamedNiveau(bookId, oldName);
  document.getElementById('delete-level-name-display')!.textContent = currentLabel;
  openModal('modal-delete-level');
}

// ==========================================
// 9. EXCEL & CSV IMPORT + HEADER MAPPING LOGIC
// ==========================================

async function handleFileSelected(file: File) {
  state.importedFileName = file.name;
  state.importedFileParsedData = [];
  state.importedHeaders = [];

  const reader = new FileReader();

  if (file.name.endsWith('.json')) {
    reader.onload = async (e) => {
      try {
        const text = (e.target?.result as string) || '';
        const data = JSON.parse(text);
        await importJSONBackup(data);
      } catch (err) {
        console.error(err);
        showToast('Invalid JSON file or parsing error', true);
      }
    };
    reader.readAsText(file);
  } else if (file.name.endsWith('.csv')) {
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      const parsed = parseCSV(text);
      if (parsed.length > 0) {
        state.importedHeaders = parsed[0];
        state.importedFileParsedData = parsed.slice(1);
        setupMappingModal();
      } else {
        showToast('Empty CSV file detected', true);
      }
    };
    reader.readAsText(file);
  } else {
    // Handle binary XLSX / XLS
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      try {
        const workbook = (window as any).XLSX.read(data, { type: 'array' });
        
        // Populate sheet selector if multi-sheet
        const sheetContainer = document.getElementById('mapping-sheet-container')!;
        const sheetSelect = document.getElementById('mapping-sheet-select') as HTMLSelectElement;
        
        sheetSelect.innerHTML = '';
        workbook.SheetNames.forEach(name => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          sheetSelect.appendChild(opt);
        });

        if (workbook.SheetNames.length > 1) {
          sheetContainer.classList.remove('hidden');
        } else {
          sheetContainer.classList.add('hidden');
        }

        const parseSheet = (sheetName: string) => {
          const worksheet = workbook.Sheets[sheetName];
          const rawRows = (window as any).XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          if (rawRows.length > 0) {
            state.importedHeaders = rawRows[0].map(h => String(h || '').trim());
            state.importedFileParsedData = rawRows.slice(1);
            setupMappingModal();
          } else {
            showToast('Selected sheet is empty', true);
          }
        };

        // Initial parse of first sheet
        parseSheet(workbook.SheetNames[0]);

        // Sheet selection changed event
        sheetSelect.onchange = () => {
          parseSheet(sheetSelect.value);
        };

      } catch (err) {
        console.error(err);
        showToast('Could not parse Excel spreadsheet binary', true);
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

// Clean CSV Parsing supporting escape quotes and delimiters
function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  const lines = text.split(/\r?\n/);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const row: string[] = [];
    let insideQuote = false;
    let entry = '';

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        row.push(entry.trim());
        entry = '';
      } else {
        entry += char;
      }
    }
    row.push(entry.trim());
    result.push(row);
  }
  return result;
}

// Populate the mapping modal drop downs
function setupMappingModal() {
  document.getElementById('mapping-filename')!.textContent = state.importedFileName;
  
  const dropdowns = document.querySelectorAll('.mapping-dropdown') as NodeListOf<HTMLSelectElement>;
  
  dropdowns.forEach(select => {
    select.innerHTML = '<option value="">-- Choose Column --</option>';
    state.importedHeaders.forEach((header, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = `${header} (Col ${idx + 1})`;
      select.appendChild(opt);
    });

    // Handle change to validate form and enable Save button
    select.onchange = validateMapping;
  });

  // Open the modal
  openModal('modal-column-mapping');
  
  // Trigger smart auto-mapping initially
  autoMapColumns();
}

function autoMapColumns() {
  const dropdowns = document.querySelectorAll('.mapping-dropdown') as NodeListOf<HTMLSelectElement>;
  
  // Fuzzy match keywords to map targets automatically
  const mappingRules: { [key: string]: string[] } = {
    Level: ['level', 'niveau', 'sheet', 'tier', 'grade'],
    HebrewTitle: ['hebrewtitle', 'titrehebreu', 'lessonhebrew', 'leconhebreu', 'lesson_hebrew', 'hebrew_title'],
    PhoneticTitle: ['phonetictitle', 'titrephonetique', 'lessonphonetic', 'phonetictitle', 'phonetic_title'],
    FrenchTitle: ['frenchtitle', 'titrefrancais', 'lessonfrench', 'french_title', 'fr_title'],
    MalagasyTitle: ['malagasytitle', 'titremalgache', 'lessonmalagasy', 'malagasy_title', 'mg_title'],
    LessonNumber: ['lessonnumber', 'num', 'numero', 'nouveau', 'lesson_no', 'lesson_number', 'chapitre', 'chapter', 'id_lesson', 'no', 'number'],
    CategoryLesson: ['categorylesson', 'category', 'categorie', 'catégorie', 'lesson_category'],
    Hebrew: ['hebrew', 'hebreu', 'hébreu', 'wordhebrew', 'text_hebrew'],
    Phonetic: ['phonetic', 'phonétique', 'phonetique', 'pronunciation'],
    French: ['french', 'francais', 'français', 'translation_fr', 'traduction'],
    Malagasy: ['malagasy', 'malgache', 'translation_mg', 'dika_teny']
  };

  dropdowns.forEach(select => {
    const field = select.dataset.field!;
    const keywords = mappingRules[field];
    
    let matchedIdx = -1;
    for (let i = 0; i < state.importedHeaders.length; i++) {
      const headerText = state.importedHeaders[i].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (keywords.some(kw => headerText.includes(kw) || kw.includes(headerText))) {
        matchedIdx = i;
        break;
      }
    }

    if (matchedIdx !== -1) {
      select.value = String(matchedIdx);
    }
  });

  validateMapping();
}

// Validate that required dropdowns are mapped
function validateMapping() {
  const dropdowns = document.querySelectorAll('.mapping-dropdown') as NodeListOf<HTMLSelectElement>;
  let isValid = true;

  dropdowns.forEach(select => {
    const field = select.dataset.field!;
    // Core vocabulary content (Hebrew, French, Malagasy) is always required
    const isRequired = 
      field === 'Hebrew' || 
      field === 'French' || 
      field === 'Malagasy' ||
      ((state.importTargetType === 'new-book' || state.importTargetType === 'current-book') && 
       (field === 'Level' || field === 'HebrewTitle'));

    if (isRequired && select.value === '') {
      isValid = false;
    }
  });

  const saveBtn = document.getElementById('mapping-save-btn') as HTMLButtonElement;
  saveBtn.disabled = !isValid;
}

// Process mapped arrays into standard DB entries
async function processMappedImport() {
  const dropdowns = document.querySelectorAll('.mapping-dropdown') as NodeListOf<HTMLSelectElement>;
  const mappings: { [key: string]: number } = {};

  dropdowns.forEach(select => {
    if (select.value !== '') {
      mappings[select.dataset.field!] = Number(select.value);
    }
  });

  let bookId = state.selectedBookId;
  const isNewBook = (state.importTargetType === 'new-book') || !bookId;

  if (isNewBook) {
    bookId = 'book_' + Date.now();
    // Use file name without extension as default Book Name
    const cleanBookName = state.importedFileName.replace(/\.[^/.]+$/, "");

    const book: Book = {
      id: bookId,
      name: cleanBookName,
      type: 'import',
      dateAdded: Date.now()
    };
    await db.addBook(book);
  }

  const rowsToInsert: ContentRow[] = [];
  const cleanFileName = state.importedFileName.replace(/\.[^/.]+$/, "");

  state.importedFileParsedData.forEach((rawRow, idx) => {
    const getValue = (field: string) => {
      const idxMapped = mappings[field];
      if (idxMapped === undefined || idxMapped === null) return '';
      const val = rawRow[idxMapped];
      return val !== undefined && val !== null ? String(val).trim() : '';
    };

    const hebrew = getValue('Hebrew');
    // Skip empty lines
    if (!hebrew) return;

    // Determine target Level name
    let targetNiveau = '';
    if (state.importTargetType === 'current-level') {
      targetNiveau = state.selectedNiveauName;
    } else {
      targetNiveau = getValue('Level');
    }
    if (!targetNiveau) {
      targetNiveau = state.selectedNiveauName || 'Level 1';
    }

    // Determine lesson titles with sensible defaults
    const hebrewTitle = getValue('HebrewTitle') || `Lesson - ${cleanFileName}`;
    const phoneticTitle = getValue('PhoneticTitle') || `Lesson - ${cleanFileName}`;
    const frenchTitle = getValue('FrenchTitle') || `Lesson - ${cleanFileName}`;
    const malagasyTitle = getValue('MalagasyTitle') || `Lesson - ${cleanFileName}`;
    const categoryLesson = getValue('CategoryLesson') || 'Vocabulary';
    const lessonNumber = getValue('LessonNumber');

    const row: ContentRow = {
      id: generateUUID(),
      bookId: bookId,
      niveauName: targetNiveau,
      hebrewTitle: hebrewTitle,
      phoneticTitle: phoneticTitle,
      frenchTitle: frenchTitle,
      malagasyTitle: malagasyTitle,
      categoryLesson: categoryLesson,
      hebrew: hebrew,
      phonetic: getValue('Phonetic'),
      french: getValue('French'),
      malagasy: getValue('Malagasy'),
      rowOrder: idx,
      lessonNumber: lessonNumber
    };

    rowsToInsert.push(row);
  });

  if (rowsToInsert.length === 0) {
    showToast('No valid data entries found in sheet', true);
    return;
  }

  // Write to IndexedDB
  await db.addRowsBulk(rowsToInsert);

  closeModal();
  showToast(`Successfully imported ${rowsToInsert.length} vocabulary rows!`);
  
  if (isNewBook) {
    state.selectedBookId = bookId;
    navigateTo(2);
  } else {
    // Refresh the active level view to display newly imported data
    if (state.currentLevel === 2) {
      renderLevel2();
    } else if (state.currentLevel === 3) {
      renderLevel3();
    } else if (state.currentLevel === 4) {
      renderLevel4();
    }
  }
}

// Helper to initiate browser file download of JSON structure
function downloadJSON(data: any, filename: string) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Handler for importing JSON backup files
async function importJSONBackup(data: any) {
  if (!data || typeof data !== 'object') {
    showToast('Invalid import data format', true);
    return;
  }

  if (data.type === 'halashon_sifriah_full_library') {
    const books = data.books || [];
    const rows = data.rows || [];
    
    for (let b of books) {
      await db.addBook(b);
    }
    await db.addRowsBulk(rows);
    showToast(`Successfully imported full library (${books.length} Books, ${rows.length} Cards)!`);
    navigateTo(1);
    renderLevel1();
  } 
  else if (data.type === 'halashon_sifriah_book') {
    const book = data.book;
    const rows = data.rows || [];
    
    if (!book || !book.id) {
      showToast('Invalid book format in JSON', true);
      return;
    }
    
    await db.addBook(book);
    await db.addRowsBulk(rows);
    showToast(`Successfully imported book "${book.name}" (${rows.length} Cards)!`);
    navigateTo(1);
    renderLevel1();
  } 
  else if (data.type === 'halashon_sifriah_level') {
    const rows = data.rows || [];
    if (rows.length === 0) {
      showToast('No cards found in level JSON', true);
      return;
    }
    
    // If inside a specific book, import into that book, else create an import book
    const targetBookId = state.selectedBookId || 'book_imported_' + Date.now();
    
    // Ensure book exists if creating a new one
    if (targetBookId.startsWith('book_imported_')) {
      await db.addBook({
        id: targetBookId,
        name: 'Imported Levels Book',
        type: 'import',
        dateAdded: Date.now()
      });
    }

    const rowsToInsert = rows.map((r: any) => ({
      ...r,
      id: r.id || generateUUID(),
      bookId: targetBookId
    }));
    
    await db.addRowsBulk(rowsToInsert);
    showToast(`Successfully imported ${rowsToInsert.length} cards into book!`);
    
    if (state.currentLevel === 2) {
      renderLevel2();
    } else if (state.currentLevel === 3) {
      renderLevel3();
    } else {
      state.selectedBookId = targetBookId;
      navigateTo(2);
    }
  } 
  else {
    showToast('Unknown or unsupported JSON backup type', true);
  }
}

// Export Entire Library
async function exportFullLibrary() {
  const books = await db.getBooks();
  const rows = await db.getAllRows();
  const exportData = {
    type: 'halashon_sifriah_full_library',
    version: 1,
    exportedAt: Date.now(),
    books: books,
    rows: rows
  };
  downloadJSON(exportData, 'halashon_sifriah_full_library.json');
  showToast('Full library exported successfully!');
}

// Export Current Active Book
async function exportActiveBook() {
  if (!state.selectedBookId) {
    showToast('No active book selected for export', true);
    return;
  }
  const books = await db.getBooks();
  const activeBook = books.find(b => b.id === state.selectedBookId);
  const bookName = activeBook ? activeBook.name : 'Book';
  const rows = await db.getRowsByBook(state.selectedBookId);
  
  const exportData = {
    type: 'halashon_sifriah_book',
    version: 1,
    exportedAt: Date.now(),
    book: activeBook || { id: state.selectedBookId, name: bookName, type: 'import', dateAdded: Date.now() },
    rows: rows
  };
  
  const cleanName = bookName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  downloadJSON(exportData, `halashon_sifriah_book_${cleanName}.json`);
  showToast(`Book "${bookName}" exported successfully!`);
}

// Export Current Active Level (Niveau)
async function exportActiveLevel() {
  if (!state.selectedBookId || !state.selectedNiveauName) {
    showToast('No active level selected for export', true);
    return;
  }
  const rows = await db.getRowsByBook(state.selectedBookId);
  const levelRows = rows.filter(r => r.niveauName === state.selectedNiveauName);
  
  const exportData = {
    type: 'halashon_sifriah_level',
    version: 1,
    exportedAt: Date.now(),
    bookId: state.selectedBookId,
    niveauName: state.selectedNiveauName,
    rows: levelRows
  };
  
  const cleanName = state.selectedNiveauName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  downloadJSON(exportData, `halashon_sifriah_level_${cleanName}.json`);
  showToast(`Level "${state.selectedNiveauName}" exported successfully!`);
}

// ==========================================
// 10. INTERACTIVE QUIZ ENGINE
// ==========================================

interface QuizQuestion {
  promptWord: string;
  phoneticHint: string;
  correctAnswer: string;
  correctAnswerFrench?: string;
  correctAnswerMalagasy?: string;
  options: string[];
  rowId: string;
}

let activeQuizMode: 'multiple-choice' | 'flashcards' = 'multiple-choice';
let quizQuestions: QuizQuestion[] = [];
let quizIndex = 0;
let quizScore = 0;
let quizHasAnswered = false;

async function startQuizSession() {
  const rows = await db.getRowsByBook(state.selectedBookId);
  const lessonRows = rows.filter(r => 
    r.niveauName === state.selectedNiveauName && 
    r.hebrewTitle === state.selectedLesson.hebrewTitle && 
    r.phoneticTitle === state.selectedLesson.phoneticTitle
  );

  if (lessonRows.length === 0) {
    showToast('Add content entries to this lesson first before quizzing!', true);
    return;
  }

  const directionSelect = document.getElementById('quiz-direction') as HTMLSelectElement;
  const direction = directionSelect.value; // 'hebrew-to-translation' | 'translation-to-hebrew'

  // Load all other items from same book or DB to use as mock distractors
  const distractorsPool = rows.length > 5 ? rows : await db.getAllRows();

  // Map into questions structures
  quizQuestions = lessonRows.map(row => {
    let promptWord = '';
    let phoneticHint = '';
    let correctAnswer = '';
    let correctAnswerFrench = '';
    let correctAnswerMalagasy = '';

    if (direction === 'hebrew-to-translation') {
      promptWord = row.hebrew;
      phoneticHint = row.phonetic;
      // Combine French & Malagasy translations as the answer
      correctAnswer = `${row.french} / ${row.malagasy}`;
      correctAnswerFrench = row.french;
      correctAnswerMalagasy = row.malagasy;
    } else {
      promptWord = `${row.french} / ${row.malagasy}`;
      phoneticHint = '';
      correctAnswer = row.hebrew;
    }

    // Generate distractors
    const optionsSet = new Set<string>();
    optionsSet.add(correctAnswer);

    // Pull random options until we have 4 options
    let attempts = 0;
    while (optionsSet.size < Math.min(4, distractorsPool.length) && attempts < 100) {
      attempts++;
      const randRow = distractorsPool[Math.floor(Math.random() * distractorsPool.length)];
      let distVal = '';
      if (direction === 'hebrew-to-translation') {
        distVal = `${randRow.french} / ${randRow.malagasy}`;
      } else {
        distVal = randRow.hebrew;
      }
      if (distVal && distVal.trim() !== '') {
        optionsSet.add(distVal);
      }
    }

    // Shuffle options
    const options = Array.from(optionsSet).sort(() => Math.random() - 0.5);

    return {
      promptWord,
      phoneticHint,
      correctAnswer,
      correctAnswerFrench,
      correctAnswerMalagasy,
      options,
      rowId: row.id
    };
  });

  // Shuffle questions order
  quizQuestions.sort(() => Math.random() - 0.5);

  // Setup panel layout
  quizIndex = 0;
  quizScore = 0;

  document.getElementById('quiz-setup-panel')!.classList.add('hidden');
  document.getElementById('quiz-results-panel')!.classList.add('hidden');
  
  const activePanel = document.getElementById('quiz-active-panel')!;
  activePanel.classList.remove('hidden');

  renderQuizQuestion();
}

function isHebrewText(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

function setQuizElementText(element: HTMLElement, text: string) {
  element.textContent = text;
  if (isHebrewText(text)) {
    element.classList.add('text-hebrew');
    element.style.direction = 'rtl';
  } else {
    element.classList.remove('text-hebrew');
    element.style.direction = 'ltr';
  }
}

function renderQuizQuestion() {
  quizHasAnswered = false;
  
  const current = quizQuestions[quizIndex];
  
  document.getElementById('quiz-current-index')!.textContent = String(quizIndex + 1);
  document.getElementById('quiz-total-questions')!.textContent = String(quizQuestions.length);
  document.getElementById('quiz-current-score')!.textContent = String(quizScore);

  // Progress percentage
  const progressPercent = ((quizIndex) / quizQuestions.length) * 100;
  document.getElementById('quiz-progress-fill')!.style.width = `${progressPercent}%`;

  if (activeQuizMode === 'multiple-choice') {
    document.getElementById('question-card-mc')!.classList.remove('hidden');
    document.getElementById('question-card-fc')!.classList.add('hidden');
    document.getElementById('quiz-options-container')!.classList.remove('hidden');
    document.getElementById('quiz-flashcard-controls')!.classList.add('hidden');

    const qWord = document.getElementById('quiz-question-word')!;
    setQuizElementText(qWord, current.promptWord);

    const sub = document.getElementById('quiz-question-subword')!;
    if (current.phoneticHint) {
      sub.classList.remove('hidden');
      sub.textContent = current.phoneticHint;
    } else {
      sub.classList.add('hidden');
    }

    // Generate options button elements
    const optContainer = document.getElementById('quiz-options-container')!;
    optContainer.innerHTML = '';

    current.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'w-full text-left p-4 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/10 rounded-xl font-medium text-xs sm:text-sm transition-all cursor-pointer active:scale-98 animate-fade-in text-justify-center';
      btn.textContent = opt;

      const hasHeb = isHebrewText(opt);
      if (hasHeb) {
        btn.classList.add('text-hebrew');
        btn.style.direction = 'rtl';
      } else {
        btn.classList.remove('text-hebrew');
        btn.style.direction = 'ltr';
      }

      btn.addEventListener('click', () => {
        if (quizHasAnswered) return;
        quizHasAnswered = true;

        if (opt === current.correctAnswer) {
          btn.className = 'w-full text-left p-4 border-2 border-emerald-500 bg-emerald-50 text-emerald-800 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-default text-justify-center';
          if (hasHeb) {
            btn.classList.add('text-hebrew');
            btn.style.direction = 'rtl';
          } else {
            btn.style.direction = 'ltr';
          }
          btn.innerHTML = `<i class="fa-solid fa-circle-check mx-2"></i> ${opt}`;
          quizScore++;
          showToast('Correct translation!');
        } else {
          btn.className = 'w-full text-left p-4 border-2 border-rose-500 bg-rose-50 text-rose-800 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-default text-justify-center';
          if (hasHeb) {
            btn.classList.add('text-hebrew');
            btn.style.direction = 'rtl';
          } else {
            btn.style.direction = 'ltr';
          }
          btn.innerHTML = `<i class="fa-solid fa-circle-xmark mx-2"></i> ${opt}`;
          
          // Highlight correct answer button
          const btns = optContainer.querySelectorAll('button');
          btns.forEach(b => {
            if (b.textContent?.trim() === current.correctAnswer.trim()) {
              b.className = 'w-full text-left p-4 border-2 border-emerald-500 bg-emerald-50 text-emerald-800 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-default text-justify-center';
              const correctHasHeb = isHebrewText(current.correctAnswer);
              if (correctHasHeb) {
                b.classList.add('text-hebrew');
                b.style.direction = 'rtl';
              } else {
                b.style.direction = 'ltr';
              }
              b.innerHTML = `<i class="fa-solid fa-circle-check mx-2"></i> ${current.correctAnswer}`;
            }
          });
          showToast('Incorrect answer', true);
        }

        // Delay and trigger next
        setTimeout(nextQuizQuestion, 1200);
      });

      optContainer.appendChild(btn);
    });

  } else {
    // Flashcard Quiz Module
    document.getElementById('question-card-mc')!.classList.add('hidden');
    document.getElementById('question-card-fc')!.classList.remove('hidden');
    document.getElementById('quiz-options-container')!.classList.add('hidden');
    document.getElementById('quiz-flashcard-controls')!.classList.remove('hidden');

    // Reset card flipped status
    const cardInner = document.getElementById('flashcard-inner')!;
    cardInner.classList.remove('flipped');

    // Load word cards texts
    const fcQ = document.getElementById('fc-question-text')!;
    setQuizElementText(fcQ, current.promptWord);

    const fcH = document.getElementById('fc-question-hint')!;
    fcH.textContent = current.phoneticHint || '';
    
    // Set answer backs
    const fcAF = document.getElementById('fc-answer-french')!;
    const ansF = current.correctAnswerFrench || current.correctAnswer;
    setQuizElementText(fcAF, ansF);

    const fcAM = document.getElementById('fc-answer-malagasy')!;
    const ansM = current.correctAnswerMalagasy || '';
    setQuizElementText(fcAM, ansM);
  }
}

function nextQuizQuestion() {
  quizIndex++;
  if (quizIndex < quizQuestions.length) {
    renderQuizQuestion();
  } else {
    finishQuizSession();
  }
}

function finishQuizSession() {
  document.getElementById('quiz-active-panel')!.classList.add('hidden');
  const results = document.getElementById('quiz-results-panel')!;
  results.classList.remove('hidden');

  document.getElementById('quiz-final-score')!.textContent = String(quizScore);
  document.getElementById('quiz-final-total')!.textContent = String(quizQuestions.length);

  const percentage = Math.round((quizScore / quizQuestions.length) * 100);
  document.getElementById('quiz-final-percentage')!.textContent = `${percentage}% Accuracy`;

  const trophy = document.getElementById('quiz-trophy-icon')!;
  if (percentage >= 80) {
    trophy.className = 'w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center text-amber-500 text-3xl mx-auto animate-bounce shadow-md border border-amber-200';
    trophy.innerHTML = '<i class="fa-solid fa-trophy"></i>';
  } else if (percentage >= 50) {
    trophy.className = 'w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-500 text-3xl mx-auto shadow-md border border-blue-200';
    trophy.innerHTML = '<i class="fa-solid fa-medal"></i>';
  } else {
    trophy.className = 'w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 text-3xl mx-auto shadow-md border border-slate-200';
    trophy.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
  }
}

function resetQuizState() {
  document.getElementById('quiz-setup-panel')!.classList.remove('hidden');
  document.getElementById('quiz-active-panel')!.classList.add('hidden');
  document.getElementById('quiz-results-panel')!.classList.add('hidden');
}


// ==========================================
// 11. INITIALIZATION & BINDINGS
// ==========================================

async function initializeApp() {
  // Connect database
  await db.init();

  // Seed sample Book if database is empty on first use
  const books = await db.getBooks();
  if (books.length === 0) {
    const sampleBookId = 'sample_book_hebrew_greetings';
    const sampleBook: Book = {
      id: sampleBookId,
      name: 'Modern Hebrew Greetings',
      type: 'manual',
      dateAdded: Date.now()
    };
    
    // Default manual rows seed matching required fields schema
    const sampleRows: ContentRow[] = [
      {
        id: generateUUID(),
        bookId: sampleBookId,
        niveauName: 'Niveau A1 (Beginner)',
        hebrewTitle: 'שלום וברכה',
        phoneticTitle: 'Shalom u-Vrakha',
        frenchTitle: 'Bonjour et Bénédiction',
        malagasyTitle: 'Salama sy Fitahiana',
        categoryLesson: 'Phrases',
        hebrew: 'שָׁלוֹם',
        phonetic: 'Shalom',
        french: 'Bonjour / Paix / Salut',
        malagasy: 'Salama / Fiadanana',
        rowOrder: 1
      },
      {
        id: generateUUID(),
        bookId: sampleBookId,
        niveauName: 'Niveau A1 (Beginner)',
        hebrewTitle: 'שלום וברכה',
        phoneticTitle: 'Shalom u-Vrakha',
        frenchTitle: 'Bonjour et Bénédiction',
        malagasyTitle: 'Salama sy Fitahiana',
        categoryLesson: 'Phrases',
        hebrew: 'מַה שְּׁלוֹמְךָ?',
        phonetic: 'Ma shlomkha?',
        french: 'Comment vas-tu? (m)',
        malagasy: 'Manao ahoana ianao? (lehilahy)',
        rowOrder: 2
      },
      {
        id: generateUUID(),
        bookId: sampleBookId,
        niveauName: 'Niveau A1 (Beginner)',
        hebrewTitle: 'שלום וברכה',
        phoneticTitle: 'Shalom u-Vrakha',
        frenchTitle: 'Bonjour et Bénédiction',
        malagasyTitle: 'Salama sy Fitahiana',
        categoryLesson: 'Phrases',
        hebrew: 'מַה שְּׁלוֹמֵךְ?',
        phonetic: 'Ma shlemekh?',
        french: 'Comment vas-tu? (f)',
        malagasy: 'Manao ahoana ianao? (vehivavy)',
        rowOrder: 3
      },
      {
        id: generateUUID(),
        bookId: sampleBookId,
        niveauName: 'Niveau A1 (Beginner)',
        hebrewTitle: 'שלום וברכה',
        phoneticTitle: 'Shalom u-Vrakha',
        frenchTitle: 'Bonjour et Bénédiction',
        malagasyTitle: 'Salama sy Fitahiana',
        categoryLesson: 'Vocabularies',
        hebrew: 'תּוֹדָה רַבָּה',
        phonetic: 'Toda raba',
        french: 'Merci beaucoup',
        malagasy: 'Misaotra betsaka',
        rowOrder: 4
      },
      {
        id: generateUUID(),
        bookId: sampleBookId,
        niveauName: 'Niveau A1 (Beginner)',
        hebrewTitle: 'שלום וברכה',
        phoneticTitle: 'Shalom u-Vrakha',
        frenchTitle: 'Bonjour et Bénédiction',
        malagasyTitle: 'Salama sy Fitahiana',
        categoryLesson: 'Vocabularies',
        hebrew: 'בְּבַקָּשָׁה',
        phonetic: 'Bevakasha',
        french: 'S’il vous plaît / De rien',
        malagasy: 'Azafady / Tsy misy fisaorana',
        rowOrder: 5
      }
    ];

    await db.addBook(sampleBook);
    await db.addRowsBulk(sampleRows);
  }

  // Load UI preferences
  loadPreferences();
  initTheme();
  await applyCustomFonts();

  // Go to Library view
  navigateTo(1);

  // Set up all interactive event listeners
  setupEventListeners();

  // Setup PWA service worker offline caching
  registerServiceWorker();
}

// Set up PWA Service Worker offline registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Create sw.js file to support perfect offline service
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          console.log('Halashon Sifriah ServiceWorker registered');
        })
        .catch(err => {
          console.error('ServiceWorker registration failure', err);
        });
    });
  }
}

// Attach all DOM interactive handlers
function setupEventListeners() {
  
  // Theme Toggle Button
  document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
  
  // Header Logo click takes back to Level 1
  document.getElementById('logo-btn')?.addEventListener('click', () => navigateTo(1));

  // Breadcrumbs navigation
  document.getElementById('breadcrumb-library')?.addEventListener('click', () => navigateTo(1));
  document.getElementById('breadcrumb-book')?.addEventListener('click', () => navigateTo(2));
  document.getElementById('breadcrumb-niveau')?.addEventListener('click', () => navigateTo(3));

  // Back button controls
  document.getElementById('back-to-library-btn')?.addEventListener('click', () => navigateTo(1));
  document.getElementById('back-to-niveaux-btn')?.addEventListener('click', () => navigateTo(2));
  document.getElementById('back-to-lessons-btn')?.addEventListener('click', () => navigateTo(3));

  // Modal backdrop click closes modals
  backdrop.addEventListener('click', closeModal);
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });

  // 1. ADD BOOK MANUALLY FORM
  document.getElementById('add-book-btn')?.addEventListener('click', () => openModal('modal-add-book'));
  document.getElementById('placeholder-add-book-btn')?.addEventListener('click', () => openModal('modal-add-book'));
  
  const addBookForm = document.getElementById('add-book-form') as HTMLFormElement;
  addBookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('new-book-name') as HTMLInputElement).value.trim();
    const niveauName = (document.getElementById('new-book-niveau') as HTMLInputElement).value.trim();
    const category = (document.getElementById('new-book-category') as HTMLInputElement).value.trim();

    if (!name || !niveauName || !category) return;

    const bookId = 'book_' + Date.now();
    const newBook: Book = {
      id: bookId,
      name,
      type: 'manual',
      dateAdded: Date.now()
    };

    // Store dummy content row matching schemas to seed Niveau, Lesson, and Categories lists
    const dummyRow: ContentRow = {
      id: generateUUID(),
      bookId: bookId,
      niveauName: niveauName,
      hebrewTitle: 'שלום (Example)',
      phoneticTitle: 'Shalom (Example)',
      frenchTitle: 'Bonjour / Paix',
      malagasyTitle: 'Salama / Fiadanana',
      categoryLesson: category,
      hebrew: 'שָׁלוֹם',
      phonetic: 'Shalom',
      french: 'Bonjour / Paix',
      malagasy: 'Salama / Fiadanana',
      rowOrder: Date.now()
    };

    await db.addBook(newBook);
    await db.addRow(dummyRow);

    addBookForm.reset();
    closeModal();
    showToast('New book and custom structures created successfully!');
    renderLevel1();
  });


  // 2. ADD NIVEAU FORM
  document.getElementById('add-niveau-btn')?.addEventListener('click', () => openModal('modal-add-niveau'));
  const addNiveauForm = document.getElementById('add-niveau-form') as HTMLFormElement;
  addNiveauForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('new-niveau-name') as HTMLInputElement).value.trim();
    if (!name) return;

    // Seed empty lesson so this level displays immediately
    const dummyRow: ContentRow = {
      id: generateUUID(),
      bookId: state.selectedBookId,
      niveauName: name,
      hebrewTitle: 'שלום (Example)',
      phoneticTitle: 'Shalom (Example)',
      frenchTitle: 'Bonjour',
      malagasyTitle: 'Salama',
      categoryLesson: 'Phrases',
      hebrew: 'שָׁלוֹם',
      phonetic: 'Shalom',
      french: 'Bonjour',
      malagasy: 'Salama',
      rowOrder: Date.now()
    };

    await db.addRow(dummyRow);
    addNiveauForm.reset();
    closeModal();
    showToast(`Level "${name}" added successfully`);
    renderLevel2();
  });


  // 3. ADD LESSON FORM
  document.getElementById('add-lesson-btn')?.addEventListener('click', () => openModal('modal-add-lesson'));
  document.getElementById('placeholder-add-lesson-btn')?.addEventListener('click', () => openModal('modal-add-lesson'));
  const addLessonForm = document.getElementById('add-lesson-form') as HTMLFormElement;
  addLessonForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hebrew = (document.getElementById('new-lesson-hebrew') as HTMLInputElement).value.trim();
    const phonetic = (document.getElementById('new-lesson-phonetic') as HTMLInputElement).value.trim();
    const french = (document.getElementById('new-lesson-french') as HTMLInputElement).value.trim();
    const malagasy = (document.getElementById('new-lesson-malagasy') as HTMLInputElement).value.trim();
    const category = (document.getElementById('new-lesson-category') as HTMLInputElement).value.trim();
    const lessonNumber = (document.getElementById('new-lesson-number') as HTMLInputElement).value.trim();

    if (!hebrew || !phonetic || !french || !malagasy || !category) return;

    // Seed first word card in the new lesson
    const firstRow: ContentRow = {
      id: generateUUID(),
      bookId: state.selectedBookId,
      niveauName: state.selectedNiveauName,
      hebrewTitle: hebrew,
      phoneticTitle: phonetic,
      frenchTitle: french,
      malagasyTitle: malagasy,
      categoryLesson: category,
      hebrew: hebrew, // seed with itself
      phonetic: phonetic,
      french: french,
      malagasy: malagasy,
      rowOrder: Date.now(),
      lessonNumber: lessonNumber || undefined
    };

    await db.addRow(firstRow);
    addLessonForm.reset();
    closeModal();
    showToast(`Lesson "${phonetic}" created with seed card!`);
    
    // Automatically open the newly created lesson
    state.selectedLesson = {
      hebrewTitle: hebrew,
      phoneticTitle: phonetic,
      frenchTitle: french,
      malagasyTitle: malagasy,
      lessonNumber: lessonNumber
    };
    navigateTo(4);
  });


  // 4. EDIT LESSON DETAILS HEADER
  document.getElementById('edit-lesson-details-btn')?.addEventListener('click', () => {
    (document.getElementById('edit-lesson-hebrew') as HTMLInputElement).value = state.selectedLesson.hebrewTitle;
    (document.getElementById('edit-lesson-phonetic') as HTMLInputElement).value = state.selectedLesson.phoneticTitle;
    (document.getElementById('edit-lesson-french') as HTMLInputElement).value = state.selectedLesson.frenchTitle;
    (document.getElementById('edit-lesson-malagasy') as HTMLInputElement).value = state.selectedLesson.malagasyTitle;
    (document.getElementById('edit-lesson-number') as HTMLInputElement).value = state.selectedLesson.lessonNumber || '';
    openModal('modal-edit-lesson');
  });

  const editLessonForm = document.getElementById('edit-lesson-form') as HTMLFormElement;
  editLessonForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hebrew = (document.getElementById('edit-lesson-hebrew') as HTMLInputElement).value.trim();
    const phonetic = (document.getElementById('edit-lesson-phonetic') as HTMLInputElement).value.trim();
    const french = (document.getElementById('edit-lesson-french') as HTMLInputElement).value.trim();
    const malagasy = (document.getElementById('edit-lesson-malagasy') as HTMLInputElement).value.trim();
    const lessonNumber = (document.getElementById('edit-lesson-number') as HTMLInputElement).value.trim();

    if (!hebrew || !phonetic) return;

    // Update all matching rows with new lesson descriptors in DB
    const rows = await db.getRowsByBook(state.selectedBookId);
    const oldHebrew = state.selectedLesson.hebrewTitle;
    const oldPhonetic = state.selectedLesson.phoneticTitle;

    const matchedRows = rows.filter(r => 
      r.niveauName === state.selectedNiveauName && 
      r.hebrewTitle === oldHebrew && 
      r.phoneticTitle === oldPhonetic
    );

    for (let row of matchedRows) {
      row.hebrewTitle = hebrew;
      row.phoneticTitle = phonetic;
      row.frenchTitle = french;
      row.malagasyTitle = malagasy;
      row.lessonNumber = lessonNumber || undefined;
      await db.addRow(row); // Put overwrite
    }

    state.selectedLesson = {
      hebrewTitle: hebrew,
      phoneticTitle: phonetic,
      frenchTitle: french,
      malagasyTitle: malagasy,
      lessonNumber: lessonNumber
    };

    closeModal();
    showToast('Lesson metadata updated');
    renderLevel4();
  });


  // 5. CONTENT ROW SUBMISSION (ADD / EDIT ROW)
  document.getElementById('add-row-btn')?.addEventListener('click', () => openContentRowModal());
  document.getElementById('placeholder-add-row-btn')?.addEventListener('click', () => openContentRowModal());
  
  const rowForm = document.getElementById('content-row-form') as HTMLFormElement;
  rowForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const editId = (document.getElementById('edit-row-id') as HTMLInputElement).value;
    const editOrderVal = (document.getElementById('edit-row-order') as HTMLInputElement).value;
    const editOrder = editOrderVal ? Number(editOrderVal) : Date.now();
    const hebrew = (document.getElementById('row-hebrew') as HTMLInputElement).value.trim();
    const phonetic = (document.getElementById('row-phonetic') as HTMLInputElement).value.trim();
    const french = (document.getElementById('row-french') as HTMLInputElement).value.trim();
    const malagasy = (document.getElementById('row-malagasy') as HTMLInputElement).value.trim();
    const category = (document.getElementById('row-category') as HTMLInputElement).value.trim();

    if (!hebrew || !phonetic || !category) return;

    const rowId = editId || generateUUID();
    const newRow: ContentRow = {
      id: rowId,
      bookId: state.selectedBookId,
      niveauName: state.selectedNiveauName,
      hebrewTitle: state.selectedLesson.hebrewTitle,
      phoneticTitle: state.selectedLesson.phoneticTitle,
      frenchTitle: state.selectedLesson.frenchTitle,
      malagasyTitle: state.selectedLesson.malagasyTitle,
      categoryLesson: category,
      hebrew,
      phonetic,
      french,
      malagasy,
      rowOrder: editOrder
    };

    await db.addRow(newRow);
    
    rowForm.reset();
    closeModal();
    showToast(editId ? 'Card updated successfully' : 'Card added successfully');
    renderLevel4();
  });


  // 6. DRAG AND DROP & FILE CHOOSE EVENT LISTENER
  const dropzone = document.getElementById('dropzone')!;
  const uploader = document.getElementById('file-uploader') as HTMLInputElement;

  dropzone.addEventListener('click', () => {
    state.importTargetType = 'new-book';
    uploader.click();
  });

  uploader.addEventListener('change', () => {
    if (uploader.files && uploader.files[0]) {
      handleFileSelected(uploader.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.className = 'border-2 border-dashed border-white rounded-xl p-6 text-center transition-all bg-indigo-500/30 cursor-pointer min-w-[280px] scale-102';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.className = 'border-2 border-dashed border-indigo-400/50 hover:border-white rounded-xl p-6 text-center transition-all bg-indigo-500/10 cursor-pointer min-w-[280px]';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.className = 'border-2 border-dashed border-indigo-400/50 hover:border-white rounded-xl p-6 text-center transition-all bg-indigo-500/10 cursor-pointer min-w-[280px]';
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      state.importTargetType = 'new-book';
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  // Export & Specific Level/Book Import Button Handlers
  document.getElementById('export-library-btn')?.addEventListener('click', exportFullLibrary);
  document.getElementById('export-book-btn')?.addEventListener('click', exportActiveBook);
  document.getElementById('export-level-btn')?.addEventListener('click', exportActiveLevel);

  document.getElementById('import-book-file-btn')?.addEventListener('click', () => {
    state.importTargetType = 'current-book';
    uploader.click();
  });

  document.getElementById('import-level-file-btn')?.addEventListener('click', () => {
    state.importTargetType = 'current-level';
    uploader.click();
  });

  // Active Book / Level Rename and Delete Header Handlers
  document.getElementById('active-book-rename-btn')?.addEventListener('click', async () => {
    if (!state.selectedBookId) return;
    const books = await db.getBooks();
    const activeBook = books.find(b => b.id === state.selectedBookId);
    const currentName = activeBook ? activeBook.name : 'Book';
    const currentLabel = getRenamedBook(state.selectedBookId, currentName);
    openRenameBookModal(state.selectedBookId, currentLabel);
  });

  document.getElementById('active-book-delete-btn')?.addEventListener('click', async () => {
    if (!state.selectedBookId) return;
    const books = await db.getBooks();
    const activeBook = books.find(b => b.id === state.selectedBookId);
    const currentName = activeBook ? activeBook.name : 'Book';
    openDeleteBookModal(state.selectedBookId, currentName);
  });

  document.getElementById('active-niveau-rename-btn')?.addEventListener('click', () => {
    if (!state.selectedBookId || !state.selectedNiveauName) return;
    const currentLabel = getRenamedNiveau(state.selectedBookId, state.selectedNiveauName);
    openRenameLevelModal(state.selectedBookId, state.selectedNiveauName, currentLabel);
  });

  document.getElementById('active-niveau-delete-btn')?.addEventListener('click', async () => {
    if (!state.selectedBookId || !state.selectedNiveauName) return;
    openDeleteLevelModal(state.selectedBookId, state.selectedNiveauName);
  });

  // 10. BOOK RENAME FORM SUBMIT
  const renameBookForm = document.getElementById('rename-book-form') as HTMLFormElement;
  renameBookForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = (document.getElementById('rename-book-id') as HTMLInputElement).value;
    const newName = (document.getElementById('rename-book-input') as HTMLInputElement).value.trim();
    if (newName) {
      saveRenamedBook(id, newName);
      closeModal();
      showToast('Book title updated successfully');
      if (state.currentLevel === 1) {
        renderLevel1();
      } else {
        navigateTo(state.currentLevel); // refresh current view
      }
    }
  });

  // 11. BOOK DELETE CONFIRM CLICK
  document.getElementById('confirm-delete-book-btn')?.addEventListener('click', async () => {
    const id = (document.getElementById('delete-book-id') as HTMLInputElement).value;
    if (id) {
      await db.deleteBook(id);
      closeModal();
      showToast('Book deleted successfully');
      if (state.currentLevel === 1) {
        renderLevel1();
      } else {
        navigateTo(1); // go back to library overview
      }
    }
  });

  // 12. LEVEL RENAME FORM SUBMIT
  const renameLevelForm = document.getElementById('rename-level-form') as HTMLFormElement;
  renameLevelForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const bookId = (document.getElementById('rename-level-book-id') as HTMLInputElement).value;
    const oldName = (document.getElementById('rename-level-old-name') as HTMLInputElement).value;
    const newName = (document.getElementById('rename-level-input') as HTMLInputElement).value.trim();
    if (newName) {
      saveRenamedNiveau(bookId, oldName, newName);
      closeModal();
      showToast('Niveau label updated');
      if (state.currentLevel === 2) {
        renderLevel2();
      } else {
        navigateTo(state.currentLevel); // refresh
      }
    }
  });

  // 13. LEVEL DELETE CONFIRM CLICK
  document.getElementById('confirm-delete-level-btn')?.addEventListener('click', async () => {
    const bookId = (document.getElementById('delete-level-book-id') as HTMLInputElement).value;
    const oldName = (document.getElementById('delete-level-old-name') as HTMLInputElement).value;
    if (bookId && oldName) {
      await db.deleteLevel(bookId, oldName);
      closeModal();
      showToast('Niveau and associated lessons removed');
      if (state.currentLevel === 2) {
        renderLevel2();
      } else {
        navigateTo(2); // go back to levels overview
      }
    }
  });

  // Apply column header mapping form
  const mappingForm = document.getElementById('mapping-form') as HTMLFormElement;
  mappingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    processMappedImport();
  });

  document.getElementById('auto-map-btn')?.addEventListener('click', autoMapColumns);


  // 7. REAL-TIME SEARCH MECHANISM
  const searchInput = document.getElementById('global-search') as HTMLInputElement;
  const clearSearchBtn = document.getElementById('clear-search-btn')!;
  
  searchInput.addEventListener('input', () => {
    const query = searchInput.value;
    if (query.trim() !== '') {
      clearSearchBtn.classList.remove('hidden');
      state.searchMode = true;
      
      // Hide standard router screens
      const views = ['view-level-1', 'view-level-2', 'view-level-3', 'view-level-4'];
      views.forEach(v => document.getElementById(v)!.classList.add('hidden'));
      
      document.getElementById('view-search-results')!.classList.remove('hidden');
      performSearch(query);
    } else {
      clearSearchBtn.classList.add('hidden');
      state.searchMode = false;
      document.getElementById('view-search-results')!.classList.add('hidden');
      
      // Return to active level view
      navigateTo(state.currentLevel);
    }
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    state.searchMode = false;
    document.getElementById('view-search-results')!.classList.add('hidden');
    navigateTo(state.currentLevel);
  });

  document.getElementById('close-search-results-btn')?.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    state.searchMode = false;
    document.getElementById('view-search-results')!.classList.add('hidden');
    navigateTo(state.currentLevel);
  });


  // 8. FONTS MANAGER MODAL CONTROLS
  document.getElementById('font-manager-btn')?.addEventListener('click', () => {
    renderFontsList();
    openModal('modal-font-manager');
  });

  const fontUploadForm = document.getElementById('font-upload-form') as HTMLFormElement;
  fontUploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (document.getElementById('font-display-name') as HTMLInputElement).value.trim();
    const fileInput = document.getElementById('font-file-input') as HTMLInputElement;
    const file = fileInput.files?.[0];

    if (!name || !file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      // Convert ArrayBuffer into Base64 string for storage
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const font: FontItem = {
        id: 'font_' + Date.now(),
        name,
        fileName: file.name,
        data: base64
      };

      await db.addFont(font);
      fontUploadForm.reset();
      showToast('Font registered successfully');
      
      await applyCustomFonts();
      renderFontsList();
    };
    reader.readAsArrayBuffer(file);
  });


  // 9. SETTINGS & TYPOGRAPHY ADJUSTMENTS
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    openModal('modal-settings');
  });

  // Range Slider values input binders
  const slidersMap = ['interface', 'hebrew', 'phonetic', 'french', 'malagasy'];
  slidersMap.forEach(key => {
    const range = document.getElementById(`size-${key}`) as HTMLInputElement;
    range.addEventListener('input', () => {
      const val = Number(range.value);
      
      // Update local values and apply
      if (key === 'interface') state.preferences.fsInterface = val;
      if (key === 'hebrew') state.preferences.fsHebrew = val;
      if (key === 'phonetic') state.preferences.fsPhonetic = val;
      if (key === 'french') state.preferences.fsFrench = val;
      if (key === 'malagasy') state.preferences.fsMalagasy = val;

      savePreferences();
    });
  });

  // Font choice selector change
  const fontSelect = document.getElementById('settings-hebrew-font') as HTMLSelectElement;
  fontSelect.addEventListener('change', () => {
    state.preferences.selectedHebrewFont = fontSelect.value;
    savePreferences();
  });

  // Reset defaults
  document.getElementById('reset-settings-btn')?.addEventListener('click', () => {
    state.preferences = {
      selectedHebrewFont: 'default',
      fsInterface: 16,
      fsHebrew: 24,
      fsPhonetic: 16,
      fsFrench: 16,
      fsMalagasy: 16
    };
    savePreferences();
    showToast('Preferences restored to default');
  });


  // 10. QUIZZING MODULE INTERACTIONS
  document.getElementById('start-quiz-btn')?.addEventListener('click', () => {
    resetQuizState();
    openModal('modal-quiz');
  });

  // Quiz game type picker cards
  const quizModeBtns = document.querySelectorAll('.quiz-mode-select-btn');
  quizModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activeQuizMode = (btn as HTMLElement).dataset.quizMode as 'multiple-choice' | 'flashcards';
      startQuizSession();
    });
  });

  // Flashcard element click to flip
  const flashcard = document.getElementById('question-card-fc')!;
  flashcard.addEventListener('click', () => {
    const inner = document.getElementById('flashcard-inner')!;
    inner.classList.toggle('flipped');
  });

  // Flashcard Know button
  document.getElementById('fc-know-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    quizScore++;
    showToast('Marked as Known!');
    nextQuizQuestion();
  });

  // Flashcard Study button
  document.getElementById('fc-study-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showToast('Added back to study stack', true);
    nextQuizQuestion();
  });

  // Close quiz modal
  document.getElementById('quiz-close-btn')?.addEventListener('click', closeModal);

  // Quiz final actions
  document.getElementById('quiz-retry-btn')?.addEventListener('click', () => {
    resetQuizState();
  });
  document.getElementById('quiz-exit-btn')?.addEventListener('click', closeModal);

}

async function renderFontsList() {
  const container = document.getElementById('fonts-list')!;
  container.innerHTML = '';
  const fonts = await db.getFonts();

  if (fonts.length === 0) {
    container.innerHTML = `
      <div class="py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-400">
        No custom fonts uploaded.
      </div>
    `;
    return;
  }

  fonts.forEach(font => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-slate-50/50 text-xs hover:bg-slate-50 transition-all';
    row.innerHTML = `
      <div class="space-y-0.5">
        <span class="font-bold text-slate-800 font-display" style="font-family: '${font.name}', sans-serif;">${font.name}</span>
        <span class="block text-[10px] text-slate-400 font-medium">File: ${font.fileName}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="rename-font-btn px-2 py-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 font-bold rounded-lg transition-all cursor-pointer" data-id="${font.id}">
          <i class="fa-solid fa-signature"></i>
        </button>
        <button class="delete-font-btn px-2 py-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 font-bold rounded-lg transition-all cursor-pointer" data-id="${font.id}">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    row.querySelector('.rename-font-btn')?.addEventListener('click', async () => {
      const newName = prompt('Enter a new display name for this font:', font.name);
      if (newName && newName.trim() !== '') {
        font.name = newName.trim();
        await db.addFont(font);
        showToast('Font renamed');
        await applyCustomFonts();
        renderFontsList();
      }
    });

    row.querySelector('.delete-font-btn')?.addEventListener('click', async () => {
      if (confirm(`Delete the font "${font.name}"? This will revert Hebrew displays back to system font.`)) {
        await db.deleteFont(font.id);
        if (state.preferences.selectedHebrewFont === font.name) {
          state.preferences.selectedHebrewFont = 'default';
          savePreferences();
        }
        showToast('Font removed successfully');
        await applyCustomFonts();
        renderFontsList();
      }
    });

    container.appendChild(row);
  });
}

// ==========================================
// Theme Toggling & Initialization
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  const html = document.documentElement;
  const themeIcon = document.getElementById('theme-icon');
  
  if (savedTheme === 'dark') {
    html.classList.add('dark');
    if (themeIcon) {
      themeIcon.className = 'fa-solid fa-sun text-base text-amber-400';
    }
  } else {
    html.classList.remove('dark');
    if (themeIcon) {
      themeIcon.className = 'fa-solid fa-moon text-base';
    }
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  const themeIcon = document.getElementById('theme-icon');
  
  if (isDark) {
    html.classList.remove('dark');
    localStorage.setItem('theme', 'light');
    if (themeIcon) {
      themeIcon.className = 'fa-solid fa-moon text-base';
    }
    showToast('Light mode activated');
  } else {
    html.classList.add('dark');
    localStorage.setItem('theme', 'dark');
    if (themeIcon) {
      themeIcon.className = 'fa-solid fa-sun text-base text-amber-400';
    }
    showToast('Dark mode activated');
  }
}

// Apply theme immediately on load to prevent flash of light theme
initTheme();

// ==========================================
// 12. RUN INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', initializeApp);
