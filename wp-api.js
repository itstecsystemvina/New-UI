/**
 * wp-api.js — S-Tec System Vina
 * Shared WordPress REST API configuration & helpers
 * ─────────────────────────────────────────────────
 *
 * HOW TO GENERATE AN APPLICATION PASSWORD (do this once):
 *   1. Log into WordPress Admin
 *   2. Go to Users → Profile → scroll to "Application Passwords"
 *   3. Type a name e.g. "S-Tec Frontend Admin" → click Add New
 *   4. Copy the password shown (it only appears once)
 *   5. Use your WP username + that password when logging into the admin panels
 *
 * STAGING SETUP:
 *   - Upload all files to: stecsystemvina.com.vn/staging/
 *   - The API URL below points to the live WP install — no changes needed
 *   - Same domain = no CORS issues
 */

const STEC_WP = {

  // WordPress REST API base URL — do not add trailing slash
  apiBase: 'https://stecsystemvina.com.vn/wp-json/wp/v2',

  // Category slugs (from WP Admin → Posts → Categories)
  categories: {
    news:    'tin-tuc',
    careers: 'thong-tin-tuyen-dung',
  },

  // Number of posts per page on public listing pages
  perPage: 9,

  // ── Auth helpers ──────────────────────────────────────────────────────────
  // Stores credentials in localStorage under these keys (admin panels only)
  storageKeys: {
    username: 'stec_wp_user',
    password: 'stec_wp_pass',   // Application Password, NOT the WP login password
  },

  getAuthHeader() {
    const u = localStorage.getItem(this.storageKeys.username);
    const p = localStorage.getItem(this.storageKeys.password);
    if (!u || !p) return null;
    return 'Basic ' + btoa(u + ':' + p);
  },

  saveCredentials(username, appPassword) {
    localStorage.setItem(this.storageKeys.username, username);
    localStorage.setItem(this.storageKeys.password, appPassword);
  },

  clearCredentials() {
    localStorage.removeItem(this.storageKeys.username);
    localStorage.removeItem(this.storageKeys.password);
  },

  isLoggedIn() {
    return !!(
      localStorage.getItem(this.storageKeys.username) &&
      localStorage.getItem(this.storageKeys.password)
    );
  },

  // ── API methods ───────────────────────────────────────────────────────────

  // Fetch category object by slug — returns { id, name, slug, count }
  async getCategoryBySlug(slug) {
    const res = await fetch(`${this.apiBase}/categories?slug=${slug}`);
    const data = await res.json();
    if (!data.length) throw new Error(`Category not found: ${slug}`);
    return data[0];
  },

  // Fetch paginated posts for a category ID
  // Returns { posts, totalPages, total }
  async getPosts(categoryId, page = 1, perPage = this.perPage) {
    const res = await fetch(
      `${this.apiBase}/posts?categories=${categoryId}&page=${page}&per_page=${perPage}&_embed&orderby=date&order=desc`
    );
    if (!res.ok) throw new Error('Failed to fetch posts');
    const posts      = await res.json();
    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1');
    const total      = parseInt(res.headers.get('X-WP-Total') || '0');
    return { posts, totalPages, total };
  },

  // Fetch a single post by ID
  async getPost(id) {
    const res = await fetch(`${this.apiBase}/posts/${id}?_embed`);
    if (!res.ok) throw new Error('Post not found');
    return res.json();
  },

  // Create a new post (requires auth)
  async createPost({ title, content, excerpt, status, categoryId, featuredImageId }) {
    const auth = this.getAuthHeader();
    if (!auth) throw new Error('Not authenticated');
    const body = { title, content, excerpt, status, categories: [categoryId] };
    if (featuredImageId) body.featured_media = featuredImageId;
    const res = await fetch(`${this.apiBase}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to create post');
    }
    return res.json();
  },

  // Update an existing post (requires auth)
  async updatePost(id, { title, content, excerpt, status, featuredImageId }) {
    const auth = this.getAuthHeader();
    if (!auth) throw new Error('Not authenticated');
    const body = { title, content, excerpt, status };
    if (featuredImageId !== undefined) body.featured_media = featuredImageId;
    const res = await fetch(`${this.apiBase}/posts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to update post');
    }
    return res.json();
  },

  // Delete a post (requires auth) — force=true skips trash
  async deletePost(id, force = false) {
    const auth = this.getAuthHeader();
    if (!auth) throw new Error('Not authenticated');
    const res = await fetch(`${this.apiBase}/posts/${id}?force=${force}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to delete post');
    }
    return res.json();
  },

  // Upload a media file (requires auth)
  async uploadMedia(file) {
    const auth = this.getAuthHeader();
    if (!auth) throw new Error('Not authenticated');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${this.apiBase}/media`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Disposition': `attachment; filename="${file.name}"` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to upload media');
    }
    return res.json(); // returns { id, source_url, ... }
  },

  // Verify credentials against WP (uses /users/me endpoint)
  async verifyCredentials(username, appPassword) {
    const header = 'Basic ' + btoa(username + ':' + appPassword);
    const res = await fetch(`${this.apiBase.replace('/wp/v2', '')}/wp/v2/users/me`, {
      headers: { Authorization: header },
    });
    return res.ok;
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Extract featured image URL from an _embedded post, with fallback
  getFeaturedImage(post, size = 'medium_large') {
    try {
      const sizes = post._embedded['wp:featuredmedia'][0].media_details.sizes;
      return (sizes[size] || sizes.full || sizes.medium).source_url;
    } catch {
      return null;
    }
  },

  // Strip HTML tags from WP excerpt/content
  stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  },

  // Format a WP date string to DD/MM/YYYY
  formatDate(dateString) {
    const d = new Date(dateString);
    return `${String(d.getDate()).padStart(2,'0')} / ${String(d.getMonth()+1).padStart(2,'0')} / ${d.getFullYear()}`;
  },

  formatDateShort(dateString) {
    const d = new Date(dateString);
    const months = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
    return { day: d.getDate(), month: months[d.getMonth()] };
  },
};
