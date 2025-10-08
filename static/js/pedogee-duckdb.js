/**
 * Pedogee DuckDB WASM Shell
 * Custom-branded DuckDB implementation for Hugo sites
 * Based on: https://shell.duckdb.org/
 */

class PedogeeShell {
  constructor() {
    this.db = null;
    this.conn = null;
    this.currentResults = null;
    this.editor = null;
    this.initialize();
  }

  async initialize() {
    try {
      this.updateStatus('Initializing DuckDB WASM...', 'loading');
      
      // Get DuckDB bundles from CDN
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      
      // Select appropriate bundle for browser
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      
      // Create Web Worker
      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], 
        { type: 'text/javascript' })
      );
      const worker = new Worker(worker_url);
      
      // Initialize DuckDB
      const logger = new duckdb.ConsoleLogger();
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      
      // Create connection
      this.conn = await this.db.connect();
      
      // Set Pedogee custom macros
      await this.conn.query(`
        CREATE OR REPLACE MACRO pedogee_info() AS 
          'Pedogee Data Studio - DuckDB ' || version();
      `);
      
      this.updateStatus('Ready', 'ready');
      this.setupUI();
      this.log('✓ Pedogee Shell initialized');
      
    } catch (error) {
      this.updateStatus('Initialization Failed', 'error');
      this.displayError('Failed to initialize DuckDB: ' + error.message);
      console.error('Init error:', error);
    }
  }

  setupUI() {
    // Get editor element
    this.editor = document.getElementById('editor');
    
    // Run button
    document.getElementById('btn-run').addEventListener('click', () => 
      this.executeQuery()
    );
    
    // Clear button
    document.getElementById('btn-clear').addEventListener('click', () => 
      this.clearResults()
    );
    
    // Sample data button
    document.getElementById('btn-sample').addEventListener('click', () => 
      this.loadSampleData()
    );
    
    // Export buttons
    document.getElementById('btn-export-csv').addEventListener('click', () => 
      this.exportResults('csv')
    );
    document.getElementById('btn-export-json').addEventListener('click', () => 
      this.exportResults('json')
    );
    
    // Format SQL button
    document.getElementById('btn-format').addEventListener('click', () => 
      this.formatSQL()
    );
    
    // Copy SQL button
    document.getElementById('btn-copy').addEventListener('click', () => 
      this.copySQL()
    );
    
    // Keyboard shortcuts
    this.editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.executeQuery();
      }
      // Tab key for indentation
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        this.editor.value = 
          this.editor.value.substring(0, start) + 
          '  ' + 
          this.editor.value.substring(end);
        this.editor.selectionStart = this.editor.selectionEnd = start + 2;
      }
    });
    
    // Example query buttons
    document.querySelectorAll('.example-card').forEach(card => {
      card.addEventListener('click', () => {
        const query = card.dataset.query;
        this.editor.value = query;
        this.executeQuery();
      });
    });
  }

  async executeQuery() {
    const sql = this.editor.value.trim();
    if (!sql) {
      this.displayError('Please enter a SQL query');
      return;
    }

    try {
      this.updateStatus('Executing...', 'loading');
      const startTime = performance.now();
      
      // Execute query
      const result = await this.conn.query(sql);
      this.currentResults = result;
      
      const endTime = performance.now();
      const duration = ((endTime - startTime) / 1000).toFixed(3);
      
      // Display results
      this.renderResults(result);
      this.updateQueryTime(`⚡ ${duration}s`);
      this.updateStatus('Ready', 'ready');
      
    } catch (error) {
      this.displayError(error.message || error.toString());
      this.updateStatus('Ready', 'ready');
      this.updateQueryTime('');
    }
  }

  renderResults(result) {
    const container = document.getElementById('results');
    
    if (result.numRows === 0) {
      container.innerHTML = `
        <div class="info-message">
          <span class="info-icon">✓</span>
          <p>Query executed successfully</p>
          <p class="hint">No rows returned</p>
        </div>
      `;
      return;
    }

    // Convert to array of objects
    const rows = result.toArray().map(row => Object.fromEntries(row));
    const columns = Object.keys(rows[0]);
    
    let html = '<div class="table-wrapper"><table class="results-table">';
    
    // Header row
    html += '<thead><tr>';
    columns.forEach(col => {
      html += `<th>${this.escapeHtml(col)}</th>`;
    });
    html += '</tr></thead>';
    
    // Data rows
    html += '<tbody>';
    rows.forEach((row, idx) => {
      html += '<tr>';
      columns.forEach(col => {
        const value = row[col];
        html += `<td>${this.formatValue(value)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    
    // Footer with row count
    html += `<div class="results-footer">${result.numRows.toLocaleString()} row(s) returned</div>`;
    
    container.innerHTML = html;
  }

  displayError(message) {
    const container = document.getElementById('results');
    container.innerHTML = `
      <div class="error-message">
        <div class="error-icon">⚠️</div>
        <div class="error-content">
          <strong>Query Error</strong>
          <pre>${this.escapeHtml(message)}</pre>
        </div>
      </div>
    `;
  }

  clearResults() {
    document.getElementById('results').innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🦆</span>
        <p>Run a query to see results</p>
        <p class="hint">Try <kbd>Ctrl+Enter</kbd> to execute</p>
      </div>
    `;
    document.getElementById('query-time').textContent = '';
  }

  async loadSampleData() {
    const sampleSQL = `-- Pedogee Sample Dataset: Municipal Open Data
CREATE OR REPLACE TABLE city_trees AS
SELECT 
  unnest(range(1, 501)) as tree_id,
  (['Oak', 'Maple', 'Birch', 'Pine', 'Elm', 'Ash', 'Willow'])[1 + (random() * 7)::INT % 7] as species,
  (['Downtown', 'North Side', 'South Side', 'East End', 'West End'])[1 + (random() * 5)::INT % 5] as neighborhood,
  2000 + (random() * 25)::INT as year_planted,
  15 + (random() * 50)::INT as height_ft,
  random() * 100 as health_score;

-- Sample query
SELECT 
  neighborhood,
  COUNT(*) as tree_count,
  AVG(health_score)::INT as avg_health,
  AVG(height_ft)::INT as avg_height
FROM city_trees
GROUP BY neighborhood
ORDER BY tree_count DESC;`;
    
    this.editor.value = sampleSQL;
    await this.executeQuery();
  }

  async exportResults(format) {
    if (!this.currentResults || this.currentResults.numRows === 0) {
      alert('No results to export');
      return;
    }

    try {
      let data, filename, mimeType;
      
      if (format === 'csv') {
        // Convert to CSV
        const rows = this.currentResults.toArray().map(row => Object.fromEntries(row));
        const columns = Object.keys(rows[0]);
        
        let csv = columns.join(',') + '\n';
        rows.forEach(row => {
          csv += columns.map(col => {
            const val = row[col];
            if (val === null) return '';
            if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
              return '"' + val.replace(/"/g, '""') + '"';
            }
            return val;
          }).join(',') + '\n';
        });
        
        data = csv;
        filename = 'pedogee-results.csv';
        mimeType = 'text/csv';
        
      } else if (format === 'json') {
        const rows = this.currentResults.toArray().map(row => Object.fromEntries(row));
        data = JSON.stringify(rows, null, 2);
        filename = 'pedogee-results.json';
        mimeType = 'application/json';
      }
      
      // Create download
      const blob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (error) {
      alert('Export failed: ' + error.message);
    }
  }

  formatSQL() {
    // Basic SQL formatting
    let sql = this.editor.value;
    
    // Add newlines after keywords
    sql = sql.replace(/\b(SELECT|FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT)\b/gi, '\n$1');
    sql = sql.replace(/\bUNION\b/gi, '\n\nUNION\n');
    
    // Clean up multiple newlines
    sql = sql.replace(/\n{3,}/g, '\n\n');
    sql = sql.trim();
    
    this.editor.value = sql;
  }

  async copySQL() {
    try {
      await navigator.clipboard.writeText(this.editor.value);
      // Show feedback
      const btn = document.getElementById('btn-copy');
      const originalText = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    } catch (error) {
      alert('Failed to copy: ' + error.message);
    }
  }

  formatValue(value) {
    if (value === null) return '<span class="null-value">NULL</span>';
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value instanceof Date) return value.toISOString();
    return this.escapeHtml(String(value));
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  updateStatus(text, state) {
    const badge = document.getElementById('status-badge');
    badge.textContent = text;
    badge.className = 'status-badge ' + state;
  }

  updateQueryTime(text) {
    document.getElementById('query-time').textContent = text;
  }

  log(message) {
    console.log('[Pedogee Shell]', message);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.pedogeeShell = new PedogeeShell();
  });
} else {
  window.pedogeeShell = new PedogeeShell();
}