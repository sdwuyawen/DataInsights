let currentPage = 1;
let totalPages = 1;
let currentDataset = null;
let columns = [];

function parseDatasetPath(path) {
    // Handle full URLs like https://huggingface.co/datasets/openai/openai_humaneval
    if (path.includes('huggingface.co/datasets/')) {
        const match = path.match(/huggingface\.co\/datasets\/(.+)/);
        if (match) {
            return match[1];
        }
    }
    // Handle @https://huggingface.co/datasets/openai/openai_humaneval format
    if (path.startsWith('@https://')) {
        return parseDatasetPath(path.substring(1));
    }
    // Return as is if it's already in the correct format (e.g., openai/openai_humaneval)
    return path;
}

function showLoading(show) {
    document.getElementById('loadingProgress').style.display = show ? 'block' : 'none';
}

function updateStats(totalRows, currentPage, totalPages, pageSize) {
    const statsElement = document.getElementById('datasetStats');
    const totalRowsElement = document.getElementById('totalRows');
    const currentPageElement = document.getElementById('currentPageNum');
    const totalPagesElement = document.getElementById('totalPages');
    const showingRowsElement = document.getElementById('showingRows');
    
    if (!statsElement || !currentDataset || !currentDataset.data || currentDataset.data.length === 0) {
        if (statsElement) {
            statsElement.style.display = 'none';
        }
        return;
    }

    // Get all row numbers from the current data
    const rowNumbers = currentDataset.data.map(row => row._index);
    
    // Check if the row numbers are consecutive
    const isConsecutive = rowNumbers.every((num, i) => {
        return i === 0 || num === rowNumbers[i - 1] + 1;
    });
    
    let rowDisplay;
    if (rowNumbers.length === 1) {
        // If there's only one row, just show its number
        rowDisplay = rowNumbers[0].toString();
    } else if (isConsecutive) {
        // If consecutive, show range
        rowDisplay = `${rowNumbers[0]} to ${rowNumbers[rowNumbers.length - 1]}`;
    } else {
        // If not consecutive, show discrete numbers
        rowDisplay = rowNumbers.join(', ');
    }
    
    // Update all elements
    statsElement.style.display = 'block';
    if (totalRowsElement) totalRowsElement.textContent = currentDataset.total_rows;
    if (currentPageElement) currentPageElement.textContent = currentPage;
    if (totalPagesElement) totalPagesElement.textContent = totalPages;
    if (showingRowsElement) showingRowsElement.textContent = rowDisplay;
}

async function loadDataset() {
    const rawPath = document.getElementById('datasetPath').value;
    const datasetPath = parseDatasetPath(rawPath);
    const isLocal = document.querySelector('input[name="datasetSource"]:checked').value === 'local';
    const pageSize = document.getElementById('pageSize').value;
    const effectivePageSize = pageSize === 'all' ? 1000000 : parseInt(pageSize);
    const currentFilters = getCurrentFilters();
    
    try {
        showLoading(true);
        
        // First, get the columns if we don't have them yet
        if (!columns || columns.length === 0) {
            const columnsResponse = await fetch(`/api/dataset/columns?dataset_path=${encodeURIComponent(datasetPath)}&is_local=${isLocal}`);
            if (!columnsResponse.ok) {
                const error = await columnsResponse.json();
                throw new Error(error.detail || 'Failed to load dataset columns');
            }
            const columnsData = await columnsResponse.json();
            columns = columnsData.columns;
            
            // Create filter inputs only when columns are first loaded
            createFilterInputs();
        }
        
        console.log('Sending request with filters:', currentFilters); // Debug log
        
        // Load the dataset with filters
        const response = await fetch('/api/dataset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                dataset_path: datasetPath,
                is_local: isLocal,
                page: currentPage,
                page_size: effectivePageSize,
                filters: currentFilters
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to load dataset');
        }
        
        const data = await response.json();
        console.log('Received filtered data:', data); // Debug log
        
        currentDataset = data;
        totalPages = data.total_pages;
        
        // Update stats with the actual row numbers from the filtered data
        updateStats(data.total_rows, data.current_page, data.total_pages, effectivePageSize);
        
        // Update the table
        updateTable(data.data, (currentPage - 1) * effectivePageSize);
        updatePagination();
        
    } catch (error) {
        console.error('Error loading dataset:', error);
        alert('Error loading dataset: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function createFilterInputs() {
    const filterInputs = document.getElementById('filterInputs');
    const filtersContainer = document.getElementById('filters');
    const filtersBody = document.getElementById('filtersBody');
    const regexColumnSelect = document.getElementById('regexColumn');
    filterInputs.innerHTML = '';
    
    if (!columns || columns.length === 0) {
        filtersContainer.style.display = 'none';
        return;
    }

    // Show the filters container but preserve its expanded/collapsed state
    filtersContainer.style.display = 'block';
    // Only set display: none if it wasn't previously expanded by the user
    if (filtersBody.style.display !== 'block') {
        filtersBody.style.display = 'none';
        document.querySelector('.expand-icon').classList.remove('expanded');
    }

    // Update regex column dropdown
    regexColumnSelect.innerHTML = '<option value="">Select Column</option>';
    columns.forEach(column => {
        const option = document.createElement('option');
        option.value = column;
        option.textContent = column;
        regexColumnSelect.appendChild(option);
    });

    // Create a container for filters
    const filtersDiv = document.createElement('div');
    filtersDiv.className = 'row';
    
    columns.forEach(column => {
        const div = document.createElement('div');
        div.className = 'col-md-6 mb-3';
        
        // Create a select element for predefined options
        const select = document.createElement('select');
        select.className = 'form-select mb-2';
        select.id = `filter-select-${column}`;
        
        // Add default option
        select.innerHTML = `
            <option value="">All ${column}</option>
            <option value="custom">Custom Filter...</option>
        `;
        
        // Create custom input (initially hidden)
        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.className = 'form-control';
        customInput.id = `filter-${column}`;
        customInput.placeholder = `Filter ${column}...`;
        customInput.style.display = 'none';
        
        // Add event listener for select change
        select.addEventListener('change', () => {
            if (select.value === 'custom') {
                customInput.style.display = 'block';
                customInput.focus();
            } else {
                customInput.style.display = 'none';
                customInput.value = '';
            }
        });
        
        div.innerHTML = `<label class="form-label">${column}</label>`;
        div.appendChild(select);
        div.appendChild(customInput);
        
        filtersDiv.appendChild(div);
        
        // Fetch unique values for this column
        updateFilterOptions(column, select);
    });
    
    filterInputs.appendChild(filtersDiv);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function updateFilterOptions(column, select) {
    try {
        const rawPath = document.getElementById('datasetPath').value;
        const datasetPath = parseDatasetPath(rawPath);
        const isLocal = document.querySelector('input[name="datasetSource"]:checked').value === 'local';

        // Fetch unique values from backend
        const response = await fetch(`/api/dataset/unique-values?dataset_path=${encodeURIComponent(datasetPath)}&column=${encodeURIComponent(column)}&is_local=${isLocal}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch unique values');
        }
        
        const uniqueValues = await response.json();
        
        // Keep only the first two options (All and Custom)
        select.innerHTML = select.innerHTML.split('\n').slice(0, 2).join('\n');
        
        // Add the unique values
        uniqueValues.values
            .filter(value => value !== null && value !== undefined && String(value).trim())
            .sort()
            .forEach(value => {
                const option = document.createElement('option');
                const strValue = String(value);
                option.value = strValue;
                option.textContent = strValue.length > 50 ? strValue.slice(0, 47) + '...' : strValue;
                select.appendChild(option);
            });
        
    } catch (error) {
        console.error('Error updating filter options:', error);
        // Keep the default options in case of error
        select.innerHTML = `
            <option value="">All ${column}</option>
            <option value="custom">Custom Filter...</option>
        `;
    }
}

function getCurrentFilters() {
    const filters = {};
    if (!columns || columns.length === 0) {
        return filters;
    }
    
    // Get regex filter if set
    const regexColumn = document.getElementById('regexColumn').value;
    const regexPattern = document.getElementById('regexPattern').value;
    if (regexColumn && regexPattern) {
        filters[`${regexColumn}_regex`] = regexPattern;
    }
    
    // Get regular filters
    columns.forEach(column => {
        const select = document.getElementById(`filter-select-${column}`);
        const input = document.getElementById(`filter-${column}`);
        
        if (select) {
            if (select.value === 'custom') {
                // For custom filter, use the input value if it exists and is not empty
                if (input && input.value.trim()) {
                    filters[column] = input.value.trim();
                }
            } else if (select.value && select.value !== '') {
                // For dropdown selection, use the selected value if it's not empty
                filters[column] = select.value;
            }
        }
    });
    
    console.log('Current filters:', filters); // Debug log
    return filters;
}

function updateTable(data, startIndex) {
    const tableContainer = document.getElementById('tableBody');
    tableContainer.innerHTML = '';
    
    if (!data || data.length === 0) {
        tableContainer.innerHTML = '<div class="text-center">No data available</div>';
        return;
    }
    
    // Create a container for all cards
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'cards-container';
    
    // Create a card for each row
    data.forEach((row, rowIndex) => {
        const card = document.createElement('div');
        card.className = 'data-card';
        
        // Add row number as header (using absolute index)
        const rowHeader = document.createElement('div');
        rowHeader.className = 'data-row';
        // Use row._index if available (for filtered data) or calculate from startIndex
        const displayRowNumber = row._index !== undefined ? row._index : startIndex + rowIndex;
        rowHeader.innerHTML = `<div class="data-label">Row ${displayRowNumber}</div>`;
        card.appendChild(rowHeader);
        
        // Add each field
        Object.entries(row).forEach(([key, value]) => {
            // Skip the _index field in display
            if (key === '_index') return;
            
            const rowDiv = document.createElement('div');
            rowDiv.className = 'data-row';
            
            const labelDiv = document.createElement('div');
            labelDiv.className = 'data-label';
            labelDiv.textContent = key;
            rowDiv.appendChild(labelDiv);
            
            const valueDiv = document.createElement('div');
            valueDiv.className = 'data-value';
            
            if (typeof value === 'object' && value !== null) {
                // Handle dictionary/object values
                const dictContainer = document.createElement('div');
                dictContainer.className = 'dict-container';
                
                if (Array.isArray(value)) {
                    // Handle array values
                    const arrayContainer = document.createElement('div');
                    arrayContainer.className = 'array-container';
                    value.forEach((item, index) => {
                        const itemDiv = document.createElement('div');
                        itemDiv.className = 'array-item';
                        if (typeof item === 'object' && item !== null) {
                            itemDiv.appendChild(createDictDisplay(item, `Item ${index + 1}`));
                        } else if (typeof item === 'string' && (item.includes('\n') || item.includes('def ') || item.includes('import '))) {
                            // Handle code content in array items
                            const escapedValue = item
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;')
                                .replace(/'/g, '&#039;');
                            itemDiv.innerHTML = `<pre class="code-block"><code class="language-python">${escapedValue}</code></pre>`;
                        } else {
                            itemDiv.textContent = JSON.stringify(item);
                        }
                        arrayContainer.appendChild(itemDiv);
                    });
                    dictContainer.appendChild(arrayContainer);
                } else {
                    // Handle dictionary values
                    dictContainer.appendChild(createDictDisplay(value, key));
                }
                valueDiv.appendChild(dictContainer);
            } else if (typeof value === 'string' && (value.includes('\n') || value.includes('def ') || value.includes('import '))) {
                // Escape HTML to prevent XSS
                const escapedValue = value
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
                valueDiv.innerHTML = `<pre class="code-block"><code class="language-python">${escapedValue}</code></pre>`;
            } else {
                valueDiv.textContent = value;
            }
            
            rowDiv.appendChild(valueDiv);
            card.appendChild(rowDiv);
        });
        
        cardsContainer.appendChild(card);
    });
    
    tableContainer.appendChild(cardsContainer);
    
    // Apply Prism syntax highlighting
    Prism.highlightAll();
}

// Helper function to create dictionary display
function createDictDisplay(dict, title) {
    const container = document.createElement('div');
    container.className = 'dict-display';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'dict-title';
    titleDiv.textContent = title;
    container.appendChild(titleDiv);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'dict-content';
    
    Object.entries(dict).forEach(([dictKey, dictValue]) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'dict-item';
        
        const keySpan = document.createElement('span');
        keySpan.className = 'dict-key';
        keySpan.textContent = dictKey + ': ';
        itemDiv.appendChild(keySpan);
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'dict-value';
        
        if (typeof dictValue === 'object' && dictValue !== null) {
            if (Array.isArray(dictValue)) {
                const arrayContainer = document.createElement('div');
                arrayContainer.className = 'array-container';
                dictValue.forEach((item, index) => {
                    const arrayItem = document.createElement('div');
                    arrayItem.className = 'array-item';
                    if (typeof item === 'object' && item !== null) {
                        arrayItem.appendChild(createDictDisplay(item, `Item ${index + 1}`));
                    } else if (typeof item === 'string' && (item.includes('\n') || item.includes('def ') || item.includes('import '))) {
                        // Handle code content in array items
                        const escapedValue = item
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#039;');
                        arrayItem.innerHTML = `<pre class="code-block"><code class="language-python">${escapedValue}</code></pre>`;
                    } else {
                        arrayItem.textContent = JSON.stringify(item);
                    }
                    arrayContainer.appendChild(arrayItem);
                });
                valueSpan.appendChild(arrayContainer);
            } else {
                valueSpan.appendChild(createDictDisplay(dictValue, dictKey));
            }
        } else if (typeof dictValue === 'string' && (dictValue.includes('\n') || dictValue.includes('def ') || dictValue.includes('import '))) {
            // Handle code content in dictionary values
            const escapedValue = dictValue
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            valueSpan.innerHTML = `<pre class="code-block"><code class="language-python">${escapedValue}</code></pre>`;
        } else {
            valueSpan.textContent = JSON.stringify(dictValue);
        }
        
        itemDiv.appendChild(valueSpan);
        contentDiv.appendChild(itemDiv);
    });
    
    container.appendChild(contentDiv);
    return container;
}

function updatePagination() {
    const pagination = document.getElementById('pagination');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const pageNumbersSection = document.getElementById('pageNumbersSection');
    const startEllipsis = document.getElementById('startEllipsis');
    const endEllipsis = document.getElementById('endEllipsis');
    const firstPageSection = document.getElementById('firstPageSection');
    const lastPageSection = document.getElementById('lastPageSection');
    const lastPageLink = document.getElementById('lastPageLink');
    
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }
    
    pagination.style.display = 'block';
    
    // Update last page number
    lastPageLink.textContent = totalPages;
    lastPageLink.onclick = () => goToPage(totalPages);
    
    // Calculate the range of page numbers to show
    let start, end;
    const VISIBLE_PAGES = 5; // Number of page numbers to show (excluding first/last)
    
    if (totalPages <= VISIBLE_PAGES + 2) {
        // If total pages is small enough, show all pages
        start = 1;
        end = totalPages;
        startEllipsis.style.display = 'none';
        endEllipsis.style.display = 'none';
        firstPageSection.style.display = 'none';
        lastPageSection.style.display = 'none';
    } else {
        // Calculate start and end based on current page
        if (currentPage <= Math.ceil(VISIBLE_PAGES / 2)) {
            // Near the start
            start = 1;
            end = VISIBLE_PAGES;
            startEllipsis.style.display = 'none';
            endEllipsis.style.display = 'list-item';
            firstPageSection.style.display = 'none';
        } else if (currentPage >= totalPages - Math.floor(VISIBLE_PAGES / 2)) {
            // Near the end
            start = totalPages - VISIBLE_PAGES + 1;
            end = totalPages;
            startEllipsis.style.display = 'list-item';
            endEllipsis.style.display = 'none';
            lastPageSection.style.display = 'none';
        } else {
            // In the middle
            start = currentPage - Math.floor(VISIBLE_PAGES / 2);
            end = currentPage + Math.floor(VISIBLE_PAGES / 2);
            startEllipsis.style.display = 'list-item';
            endEllipsis.style.display = 'list-item';
        }
    }
    
    // Generate page numbers
    pageNumbersSection.innerHTML = '';
    for (let i = start; i <= end; i++) {
        const li = document.createElement('li');
        li.className = `page-item${i === currentPage ? ' active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" onclick="return goToPage(${i})">${i}</a>`;
        pageNumbersSection.appendChild(li);
    }
    
    // Update prev/next buttons
    prevPage.classList.toggle('disabled', currentPage === 1);
    nextPage.classList.toggle('disabled', currentPage === totalPages);
    
    // Show/hide first and last page buttons based on the range
    if (start > 1) {
        firstPageSection.style.display = 'list-item';
    }
    if (end < totalPages) {
        lastPageSection.style.display = 'list-item';
    }
    
    // Update visibility of ellipses based on the range
    startEllipsis.style.display = start > 2 ? 'list-item' : 'none';
    endEllipsis.style.display = end < totalPages - 1 ? 'list-item' : 'none';
}

function goToPage(page) {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
        currentPage = page;
        loadDataset();
    }
    return false; // Prevent default link behavior
}

function changePage(delta) {
    return goToPage(currentPage + delta);
}

// Update clearFilters to include regex filter
function clearFilters() {
    if (!columns) return;
    
    // Clear regex filter
    document.getElementById('regexColumn').value = '';
    document.getElementById('regexPattern').value = '';
    
    // Clear regular filters
    columns.forEach(column => {
        const select = document.getElementById(`filter-select-${column}`);
        const input = document.getElementById(`filter-${column}`);
        if (select) {
            select.value = '';
        }
        if (input) {
            input.value = '';
            input.style.display = 'none';
        }
    });
    
    // Reset to first page and reload dataset
    currentPage = 1;
    loadDataset();
}

// Add this new function to apply filters
async function applyFilters() {
    try {
        currentPage = 1;
        const filters = getCurrentFilters();
        console.log('Applying filters:', filters); // Debug log
        await loadDataset();
    } catch (error) {
        console.error('Error applying filters:', error);
        alert('Error applying filters: ' + error.message);
    }
}

function goToPageInput() {
    const input = document.getElementById('goToPageInput');
    const page = parseInt(input.value);
    
    if (isNaN(page) || page < 1 || page > totalPages) {
        alert(`Please enter a valid page number between 1 and ${totalPages}`);
        return;
    }
    
    goToPage(page);
    input.value = ''; // Clear the input after navigation
}

function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Update the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', () => {
    // Set default dataset path if empty
    const datasetPathInput = document.getElementById('datasetPath');
    if (!datasetPathInput.value) {
        datasetPathInput.value = '@https://huggingface.co/datasets/openai/openai_humaneval';
    }

    // Add event listener for page size changes
    document.getElementById('pageSize').addEventListener('change', () => {
        currentPage = 1; // Reset to first page when changing page size
        loadDataset();
    });

    // Add event listener for Enter key in go to page input
    document.getElementById('goToPageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            goToPageInput();
        }
    });

    // Add event listener for filters expand/collapse
    const filtersHeader = document.getElementById('filtersHeader');
    const filtersBody = document.getElementById('filtersBody');
    const expandIcon = filtersHeader.querySelector('.expand-icon');

    filtersHeader.addEventListener('click', () => {
        const isExpanded = filtersBody.style.display !== 'none';
        filtersBody.style.display = isExpanded ? 'none' : 'block';
        expandIcon.classList.toggle('expanded', !isExpanded);
    });

    // Add event listeners for filter buttons
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearFilters);
    }
    
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
    }

    // Add scroll event listener for Go to Top button
    const goToTopBtn = document.getElementById('goToTopBtn');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            goToTopBtn.style.display = 'flex';
        } else {
            goToTopBtn.style.display = 'none';
        }
    });
}); 