// API Configuration
const API_URL = '/api';
let currentUser = null;
let authToken = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    loadDashboardData();
});

function initializeApp() {
    // Check for saved auth token
    authToken = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');

    if (authToken && userData) {
        currentUser = JSON.parse(userData);
        updateUIForLoggedInUser();
    }

    // Initialize smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Highlight active nav link based on scroll
    window.addEventListener('scroll', updateActiveNavLink);
}

function updateActiveNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const scrollY = window.pageYOffset;

    sections.forEach(section => {
        const sectionHeight = section.offsetHeight;
        const sectionTop = section.offsetTop - 100;
        const sectionId = section.getAttribute('id');

        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
            });
            document.querySelector(`.nav-link[href="#${sectionId}"]`)?.classList.add('active');
        }
    });
}

function setupEventListeners() {
    // Navigation
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    if (hamburger) {
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }

    // Single file upload
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('codeFile');
    const analyzeForm = document.getElementById('analyzeForm');

    if (uploadArea) {
        uploadArea.addEventListener('click', () => fileInput.click());

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelect(files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    if (analyzeForm) {
        analyzeForm.addEventListener('submit', handleAnalyzeSubmit);
    }

    // Batch file upload
    const batchUploadArea = document.getElementById('batchUploadArea');
    const batchFiles = document.getElementById('batchFiles');
    const batchForm = document.getElementById('batchForm');

    if (batchUploadArea) {
        batchUploadArea.addEventListener('click', () => batchFiles.click());

        batchUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            batchUploadArea.classList.add('dragover');
        });

        batchUploadArea.addEventListener('dragleave', () => {
            batchUploadArea.classList.remove('dragover');
        });

        batchUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            batchUploadArea.classList.remove('dragover');
            handleBatchFileSelect(e.dataTransfer.files);
        });

        batchFiles.addEventListener('change', (e) => {
            handleBatchFileSelect(e.target.files);
        });
    }

    if (batchForm) {
        batchForm.addEventListener('submit', handleBatchAnalyze);
    }

    // Login/Register Modal
    setupAuthModal();
}

function handleFileSelect(file) {
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');

    // Validate file type
    const allowedExtensions = /\.(py|ipynb)$/i;
    if (!allowedExtensions.test(file.name)) {
        alert('Please select a Python file (.py) or Jupyter notebook (.ipynb)');
        return;
    }

    // Update UI
    fileName.textContent = file.name;
    fileInfo.style.display = 'flex';

    // Store file for form submission
    const fileInput = document.getElementById('codeFile');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
}

function removeFile() {
    const fileInfo = document.getElementById('fileInfo');
    const fileInput = document.getElementById('codeFile');

    fileInfo.style.display = 'none';
    fileInput.value = '';
}

async function handleAnalyzeSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const fileInput = document.getElementById('codeFile');

    if (!fileInput.files[0]) {
        alert('Please select a Python file to analyze');
        return;
    }

    // Add user ID if logged in
    if (currentUser) {
        formData.append('userId', currentUser.id);
    }

    try {
        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        submitBtn.disabled = true;

        const response = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            displayAnalysisResults(result.analysis);
            // Reload dashboard data
            loadDashboardData();
        } else {
            alert(result.error || 'Analysis failed');
        }

        // Reset button
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;

    } catch (error) {
        console.error('Error:', error);
        alert('Failed to analyze code. Please try again.');
    }
}

function displayAnalysisResults(analysis) {
    const resultsDiv = document.getElementById('analysisResult');
    const resultContent = resultsDiv.querySelector('.result-content');

    // Calculate metrics badges
    const getComplexityBadge = (complexity) => {
        if (complexity <= 10) return { class: 'good', text: 'Low' };
        if (complexity <= 20) return { class: 'warning', text: 'Medium' };
        return { class: 'danger', text: 'High' };
    };

    const getNestingBadge = (nesting) => {
        if (nesting <= 3) return { class: 'good', text: 'Good' };
        if (nesting === 4) return { class: 'warning', text: 'Warning' };
        return { class: 'danger', text: 'Deep' };
    };

    const getDocBadge = (ratio) => {
        if (ratio >= 0.2) return { class: 'good', text: 'Good' };
        if (ratio >= 0.1) return { class: 'warning', text: 'Fair' };
        return { class: 'danger', text: 'Poor' };
    };

    const complexityBadge = getComplexityBadge(analysis.complexity || 0);
    const nestingBadge = getNestingBadge(analysis.maxNesting || 0);
    const docBadge = getDocBadge(analysis.docstringRatio || 0);

    // Build HTML for results
    const html = `
        <div class="result-header">
            <h4>${analysis.fileName}</h4>
            <div class="quality-score-circle">
                <svg viewBox="0 0 36 36" class="circular-chart">
                    <path class="circle-bg"
                        d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path class="circle"
                        stroke="${analysis.qualityScore > 70 ? '#27ae60' : analysis.qualityScore > 50 ? '#f39c12' : '#e74c3c'}"
                        stroke-dasharray="${analysis.qualityScore}, 100"
                        d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <text x="18" y="20.35" class="percentage">${analysis.qualityScore}%</text>
                </svg>
                <span class="score-label">Quality Score</span>
            </div>
        </div>

        <div class="metrics-overview">
            <div class="metric-tile">
                <span class="metric-name">Lines of Code</span>
                <span class="metric-value">${analysis.codeLines || 0}</span>
            </div>
            <div class="metric-tile">
                <span class="metric-name">Total Lines</span>
                <span class="metric-value">${analysis.totalLines || 0}</span>
            </div>
            <div class="metric-tile">
                <span class="metric-name">Comment Lines</span>
                <span class="metric-value">${analysis.commentLines || 0}</span>
            </div>
            <div class="metric-tile">
                <span class="metric-name">Blank Lines</span>
                <span class="metric-value">${analysis.blankLines || 0}</span>
            </div>
        </div>

        <div class="complexity-metrics">
            <h5>Complexity Metrics</h5>
            <div class="complexity-items">
                <div class="complexity-item">
                    <span class="label">Cyclomatic Complexity:</span>
                    <span class="value">${analysis.complexity || 0}</span>
                    <span class="badge ${complexityBadge.class}">${complexityBadge.text}</span>
                </div>
                <div class="complexity-item">
                    <span class="label">Max Nesting Depth:</span>
                    <span class="value">${analysis.maxNesting || 0}</span>
                    <span class="badge ${nestingBadge.class}">${nestingBadge.text}</span>
                </div>
                <div class="complexity-item">
                    <span class="label">Documentation Coverage:</span>
                    <span class="value">${((analysis.docstringRatio || 0) * 100).toFixed(1)}%</span>
                    <span class="badge ${docBadge.class}">${docBadge.text}</span>
                </div>
            </div>
        </div>

        ${analysis.functions && analysis.functions.length > 0 ? `
            <div class="functions-list">
                <h5>Functions Found (${analysis.functions.length})</h5>
                <div class="function-tags">
                    ${analysis.functions.map(func => `
                        <span class="function-tag"><i class="fas fa-function"></i> ${func}</span>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        ${analysis.classes && analysis.classes.length > 0 ? `
            <div class="classes-list">
                <h5>Classes Found (${analysis.classes.length})</h5>
                <div class="class-tags">
                    ${analysis.classes.map(cls => `
                        <span class="class-tag"><i class="fas fa-cube"></i> ${cls}</span>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        ${analysis.suggestions && analysis.suggestions.length > 0 ? `
            <div class="suggestions-panel">
                <h5><i class="fas fa-lightbulb"></i> Recommendations</h5>
                <ul class="suggestions-list">
                    ${analysis.suggestions.map(suggestion => `
                        <li>${suggestion}</li>
                    `).join('')}
                </ul>
            </div>
        ` : ''}

        <div class="action-buttons">
            <button class="btn btn-secondary" onclick="downloadReport('${analysis.fileName}')">
                <i class="fas fa-download"></i> Download Report
            </button>
            <button class="btn btn-primary" onclick="analyzeAnother()">
                <i class="fas fa-redo"></i> Analyze Another
            </button>
        </div>
    `;

    resultContent.innerHTML = html;
    resultsDiv.style.display = 'block';

    // Add styles for results
    addResultStyles();

    // Scroll to results
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function addResultStyles() {
    if (document.getElementById('resultStyles')) return;

    const styles = `
        <style id="resultStyles">
            .result-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 2rem;
                padding-bottom: 1rem;
                border-bottom: 2px solid var(--border-color);
            }

            .quality-score-circle {
                text-align: center;
            }

            .circular-chart {
                width: 100px;
                height: 100px;
                display: block;
            }

            .circle-bg {
                fill: none;
                stroke: #eee;
                stroke-width: 3.8;
            }

            .circle {
                fill: none;
                stroke-width: 2.8;
                stroke-linecap: round;
                animation: progress 1s ease-out forwards;
            }

            @keyframes progress {
                0% {
                    stroke-dasharray: 0 100;
                }
            }

            .percentage {
                fill: var(--dark-color);
                font-size: 0.5em;
                text-anchor: middle;
                font-weight: bold;
            }

            .score-label {
                display: block;
                margin-top: 0.5rem;
                font-size: 0.9rem;
                color: var(--text-color);
            }

            .metrics-overview {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 1rem;
                margin-bottom: 2rem;
            }

            .metric-tile {
                background: var(--light-color);
                padding: 1.5rem;
                border-radius: 8px;
                text-align: center;
            }

            .metric-name {
                display: block;
                font-size: 0.9rem;
                color: var(--text-color);
                margin-bottom: 0.5rem;
            }

            .metric-value {
                display: block;
                font-size: 1.8rem;
                font-weight: bold;
                color: var(--primary-color);
            }

            .complexity-metrics {
                background: var(--light-color);
                padding: 1.5rem;
                border-radius: 8px;
                margin-bottom: 2rem;
            }

            .complexity-metrics h5 {
                margin-bottom: 1rem;
                color: var(--dark-color);
            }

            .complexity-items {
                display: flex;
                flex-direction: column;
                gap: 1rem;
            }

            .complexity-item {
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .complexity-item .label {
                flex: 1;
                color: var(--text-color);
            }

            .complexity-item .value {
                font-weight: bold;
                color: var(--dark-color);
            }

            .badge {
                padding: 0.25rem 0.75rem;
                border-radius: 20px;
                font-size: 0.85rem;
                font-weight: 500;
            }

            .badge.good {
                background: rgba(39, 174, 96, 0.1);
                color: var(--success-color);
            }

            .badge.warning {
                background: rgba(243, 156, 18, 0.1);
                color: var(--warning-color);
            }

            .badge.danger {
                background: rgba(231, 76, 60, 0.1);
                color: var(--danger-color);
            }

            .functions-list, .classes-list {
                margin-bottom: 2rem;
            }

            .functions-list h5, .classes-list h5 {
                margin-bottom: 1rem;
                color: var(--dark-color);
            }

            .function-tags, .class-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
            }

            .function-tag, .class-tag {
                background: var(--primary-color);
                color: white;
                padding: 0.5rem 1rem;
                border-radius: 20px;
                font-size: 0.9rem;
            }

            .suggestions-panel {
                background: rgba(255, 212, 59, 0.1);
                padding: 1.5rem;
                border-radius: 8px;
                margin-bottom: 2rem;
            }

            .suggestions-panel h5 {
                color: var(--dark-color);
                margin-bottom: 1rem;
            }

            .suggestions-list {
                list-style: none;
                padding-left: 0;
            }

            .suggestions-list li {
                padding: 0.5rem 0;
                padding-left: 1.5rem;
                position: relative;
                color: var(--text-color);
            }

            .suggestions-list li:before {
                content: '→';
                position: absolute;
                left: 0;
                color: var(--warning-color);
            }

            .action-buttons {
                display: flex;
                gap: 1rem;
                justify-content: center;
            }
        </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
}

function handleBatchFileSelect(files) {
    const fileList = document.getElementById('batchFileList');
    const analyzeBtn = document.getElementById('batchAnalyzeBtn');
    const batchFilesInput = document.getElementById('batchFiles');

    // Filter only Python files
    const pythonFiles = Array.from(files).filter(file => /\.(py|ipynb)$/i.test(file.name));

    if (pythonFiles.length === 0) {
        alert('Please select Python files (.py) or Jupyter notebooks (.ipynb)');
        return;
    }

    if (pythonFiles.length > 10) {
        alert('Please select up to 10 files at a time');
        return;
    }

    // Update file input
    const dataTransfer = new DataTransfer();
    pythonFiles.forEach(file => dataTransfer.items.add(file));
    batchFilesInput.files = dataTransfer.files;

    // Update UI
    fileList.innerHTML = pythonFiles.map((file, index) => `
        <div class="batch-file-item">
            <span><i class="fab fa-python"></i> ${file.name}</span>
            <span class="file-size">${(file.size / 1024).toFixed(2)} KB</span>
        </div>
    `).join('');

    analyzeBtn.disabled = false;
}

async function handleBatchAnalyze(e) {
    e.preventDefault();

    const formData = new FormData();
    const files = document.getElementById('batchFiles').files;

    if (files.length === 0) {
        alert('Please select files to analyze');
        return;
    }

    for (let i = 0; i < files.length; i++) {
        formData.append('codeFiles', files[i]);
    }

    try {
        const submitBtn = document.getElementById('batchAnalyzeBtn');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing Files...';
        submitBtn.disabled = true;

        const response = await fetch(`${API_URL}/analyze-batch`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            displayBatchResults(result.results);
        } else {
            alert(result.error || 'Batch analysis failed');
        }

        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;

    } catch (error) {
        console.error('Error:', error);
        alert('Failed to analyze files. Please try again.');
    }
}

function displayBatchResults(results) {
    const resultsDiv = document.getElementById('batchResults');
    const resultsList = document.getElementById('batchResultsList');

    // Calculate summary statistics
    const successfulAnalyses = results.filter(r => r.status === 'success');
    const filesAnalyzed = successfulAnalyses.length;
    const avgComplexity = successfulAnalyses.reduce((sum, r) => sum + (r.metrics.complexity || 0), 0) / filesAnalyzed || 0;
    const totalLOC = successfulAnalyses.reduce((sum, r) => sum + (r.metrics.codeLines || 0), 0);

    // Update summary
    document.getElementById('filesAnalyzed').textContent = filesAnalyzed;
    document.getElementById('avgBatchComplexity').textContent = avgComplexity.toFixed(1);
    document.getElementById('totalBatchLOC').textContent = totalLOC;

    // Display individual results
    resultsList.innerHTML = results.map(result => {
        if (result.status === 'success') {
            return `
                <div class="batch-result-item success">
                    <h4>${result.fileName}</h4>
                    <div class="batch-metrics">
                        <span>LOC: ${result.metrics.codeLines}</span>
                        <span>Complexity: ${result.metrics.complexity}</span>
                        <span>Functions: ${result.metrics.functions ? result.metrics.functions.length : 0}</span>
                    </div>
                    ${result.suggestions && result.suggestions.length > 0 ? `
                        <div class="batch-suggestions">
                            ${result.suggestions.map(s => `<div class="suggestion-item">• ${s}</div>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            return `
                <div class="batch-result-item failed">
                    <h4>${result.fileName}</h4>
                    <div class="error-message">Analysis failed: ${result.error}</div>
                </div>
            `;
        }
    }).join('');

    resultsDiv.style.display = 'block';
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

function exportBatchResults() {
    // Export results to CSV
    const results = document.getElementById('batchResultsList').textContent;
    const csv = 'File,LOC,Complexity,Functions,Suggestions\n' + results;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'code_analysis_results.csv';
    a.click();
}

async function loadDashboardData() {
    try {
        const response = await fetch(`${API_URL}/statistics`);
        const data = await response.json();

        // Update statistics
        document.getElementById('totalAnalyses').textContent = data.totalAnalyses || 0;
        document.getElementById('avgComplexity').textContent = data.averageComplexity || 0;
        document.getElementById('filesProcessed').textContent = data.totalAnalyses || 0;

        // Calculate average quality score
        const avgQuality = Math.max(0, Math.min(100, 100 - (data.averageComplexity * 3)));
        document.getElementById('avgQualityScore').textContent = `${avgQuality.toFixed(0)}%`;

        // Update recent analyses
        const recentList = document.getElementById('recentAnalysesList');
        if (data.recentAnalyses && data.recentAnalyses.length > 0) {
            recentList.innerHTML = data.recentAnalyses.map(analysis => `
                <div class="analysis-item">
                    <div class="analysis-info">
                        <strong>${analysis.project_name}</strong>
                        <span class="file-name">${analysis.file_name}</span>
                    </div>
                    <div class="analysis-metric">
                        <span class="metric-label">Complexity</span>
                        <span class="metric-value">${analysis.complexity || 'N/A'}</span>
                    </div>
                    <div class="analysis-date">
                        ${new Date(analysis.created_at).toLocaleDateString()}
                    </div>
                </div>
            `).join('');
        } else {
            recentList.innerHTML = '<p>No analyses yet. Start by analyzing your first Python file!</p>';
        }

        // Update charts
        updateCharts(data);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function updateCharts(data) {
    // Complexity Distribution Chart
    const complexityCtx = document.getElementById('complexityChart');
    if (complexityCtx) {
        new Chart(complexityCtx, {
            type: 'bar',
            data: {
                labels: ['Low (1-10)', 'Medium (11-20)', 'High (>20)'],
                datasets: [{
                    label: 'Files',
                    data: [
                        Math.floor(Math.random() * 20) + 10,
                        Math.floor(Math.random() * 15) + 5,
                        Math.floor(Math.random() * 10) + 2
                    ],
                    backgroundColor: [
                        'rgba(39, 174, 96, 0.6)',
                        'rgba(243, 156, 18, 0.6)',
                        'rgba(231, 76, 60, 0.6)'
                    ],
                    borderColor: [
                        'rgba(39, 174, 96, 1)',
                        'rgba(243, 156, 18, 1)',
                        'rgba(231, 76, 60, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // Quality Trends Chart
    const qualityCtx = document.getElementById('qualityChart');
    if (qualityCtx) {
        const labels = [];
        const qualityData = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
            qualityData.push(Math.floor(Math.random() * 20) + 70);
        }

        new Chart(qualityCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quality Score',
                    data: qualityData,
                    borderColor: '#3776ab',
                    backgroundColor: 'rgba(55, 118, 171, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }
}

function setupAuthModal() {
    const loginBtn = document.getElementById('loginBtn');
    const loginModal = document.getElementById('loginModal');
    const closeModal = document.querySelector('.close');
    const showRegister = document.getElementById('showRegister');
    const showLogin = document.getElementById('showLogin');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentUser) {
                logout();
            } else {
                loginModal.style.display = 'block';
            }
        });
    }

    if (closeModal) {
        closeModal.addEventListener('click', () => {
            loginModal.style.display = 'none';
        });
    }

    if (showRegister) {
        showRegister.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
        });
    }

    if (showLogin) {
        showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.style.display = 'none';
            loginForm.style.display = 'block';
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    window.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            loginModal.style.display = 'none';
        }
    });
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('userData', JSON.stringify(currentUser));

            updateUIForLoggedInUser();
            document.getElementById('loginModal').style.display = 'none';
            loadDashboardData();
        } else {
            alert(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please try again.');
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('userData', JSON.stringify(currentUser));

            updateUIForLoggedInUser();
            document.getElementById('loginModal').style.display = 'none';
            loadDashboardData();
        } else {
            alert(data.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('Registration failed. Please try again.');
    }
}

function updateUIForLoggedInUser() {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.textContent = `Logout (${currentUser.name})`;
    }
}

function logout() {
    currentUser = null;
    authToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.textContent = 'Login';
    }

    loadDashboardData();
}

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

function downloadReport(fileName) {
    // Create a text report
    const report = `Code Analysis Report - ${fileName}\n` +
        `Generated: ${new Date().toLocaleString()}\n\n` +
        `[Analysis details would go here]`;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}_analysis_report.txt`;
    a.click();
}

function analyzeAnother() {
    // Reset form and hide results
    document.getElementById('analyzeForm').reset();
    document.getElementById('fileInfo').style.display = 'none';
    document.getElementById('analysisResult').style.display = 'none';
    scrollToSection('analyze');
}