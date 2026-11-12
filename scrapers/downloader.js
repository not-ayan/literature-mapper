/**
 * Dynamic resolution of ScraperAPI (https://www.scraperapi.com/) and ScholarAPI (https://scholarapi.net/).
 */
export function getScraperApiKey(customKey = '') {
    if (customKey && typeof customKey === 'string' && customKey.trim() && !customKey.startsWith('sch_')) {
        return customKey.trim();
    }
    if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem('scraper_api_key') 
            || window.localStorage.getItem('atlas_scraper_api_key');
        if (stored && stored.trim() && !stored.startsWith('sch_')) return stored.trim();
    }
    if (typeof process !== 'undefined' && process.env) {
        const envKey = process.env.SCRAPER_API_KEY;
        if (envKey && envKey.trim() && !envKey.startsWith('sch_')) return envKey.trim();
    }
    return 'af0593431a4ef35ca542ee9212db5a9a';
}

export function getScholarApiKey(customKey = '') {
    if (customKey && typeof customKey === 'string' && customKey.trim() && customKey.startsWith('sch_')) {
        return customKey.trim();
    }
    if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem('scholar_api_key');
        if (stored && stored.trim()) return stored.trim();
    }
    if (typeof process !== 'undefined' && process.env) {
        const envKey = process.env.SCHOLAR_API_KEY;
        if (envKey && envKey.trim()) return envKey.trim();
    }
    return 'sch_mAiQQtczkb6WVbs1TCRCAOWgT3V21fCq';
}

const SCRAPER_API_KEY = getScraperApiKey();
const SCHOLAR_API_KEY = getScholarApiKey();


// Wait until the DOM is fully loaded, then attach the event listener to the button if element exists
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('fetch-references-btn');
        if (btn) {
            btn.addEventListener('click', runReferenceFinder);
        }
    });
}

/**
 * Pipeline Stage 1: Fetch and parse the local mock AI configuration profile.
 */
export async function runReferenceFinder() {
    const resultsContainer = document.getElementById('references-results');
    if (!resultsContainer) return;

    // Set UI to intermediate loading state
    resultsContainer.innerHTML = '<div class="status-message loading">Reading dynamic configuration from keywords.json...</div>';

    try {
        // Fetch the local JSON profile
        const response = await fetch('./keywords.json');

        // Error handling for missing local profile configurations
        if (!response.ok) {
            throw new Error(`Could not access keywords.json (HTTP Status: ${response.status}). Ensure your local web server is running.`);
        }

        const aiJsonData = await response.json();

        // Check to ensure array structures exist
        if (!aiJsonData.keywords || aiJsonData.keywords.length === 0) {
            resultsContainer.innerHTML = '<div class="status-message error">Data Validation Error: "keywords" array is missing or empty inside keywords.json.</div>';
            return;
        }

        // Update loading state with data from the JSON file
        resultsContainer.innerHTML = `<div class="status-message loading">Keywords extracted! Querying OpenAlex API for: <strong>${aiJsonData.keywords.join(', ')}</strong>...</div>`;

        // Proceed to the next step in the processing pipeline
        await searchResearchPapers(aiJsonData);

    } catch (error) {
        console.error('Execution Halted:', error);

        // Distinct tip rendering for common browser CORS blockages during offline testing
        let standardErrorMessage = error.message;
        if (window.location.protocol === 'file:') {
            standardErrorMessage += "<br><br><strong>Tip:</strong> Browser APIs block client-side requests when opening files directly via file://. Please use an extension like VS Code Live Server or run a local node server.";
        }

        resultsContainer.innerHTML = `<div class="status-message error"><strong>Initialization Failed:</strong> ${standardErrorMessage}</div>`;
    }
}

/**
 * Pipeline Stage 2: Transform keywords into clean expressions and fetch matching data from API.
 * This is extended to accept progress and logging callbacks, and to save papers directly to OPFS.
 */
/**
 * Helper: Search OpenAlex
 */
async function searchOpenAlex(keywords, maxResults) {
    const searchQuery = keywords.map(k => k.trim()).join(' ');
    const apiUrl = `https://api.openalex.org/works?search=${encodeURIComponent(searchQuery)}&per_page=${maxResults}`;
    try {
        const apiResponse = await fetch(apiUrl);
        if (!apiResponse.ok) return [];
        const payload = await apiResponse.json();
        const papers = payload.results || [];
        return papers.map(paper => ({
            id: paper.id,
            title: paper.title || 'Untitled Research Profile',
            publication_year: paper.publication_year || 'N/A',
            doi: paper.doi || paper.id || '#',
            authorships: paper.authorships || [],
            best_oa_location: paper.best_oa_location || paper.primary_location || paper.open_access || null,
            source: 'OpenAlex'
        }));
    } catch (e) {
        console.error('OpenAlex search error:', e);
        return [];
    }
}

/**
 * Helper: Search arXiv
 */
async function searchArxiv(keywords, maxResults) {
    const searchQuery = keywords.map(k => `all:"${k.trim()}"`).join(' AND ');
    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}&max_results=${maxResults}`;
    try {
        let res;
        try {
            res = await fetch(url);
        } catch (fetchErr) {
            console.warn('arXiv direct fetch failed (likely CORS), retrying via corsproxy.io:', fetchErr);
            const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
            res = await fetch(proxyUrl);
        }
        if (!res.ok) return [];
        const xmlText = await res.text();
        if (typeof DOMParser !== 'undefined') {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlText, 'text/xml');
            const entries = Array.from(doc.getElementsByTagName('entry'));
            return entries.map((entry, index) => {
                const id = entry.getElementsByTagName('id')[0]?.textContent || '';
                const title = entry.getElementsByTagName('title')[0]?.textContent?.replace(/\s+/g, ' ').trim() || '';
                const published = entry.getElementsByTagName('published')[0]?.textContent || '';
                const year = published ? new Date(published).getFullYear() : 'N/A';
                const authorNodes = Array.from(entry.getElementsByTagName('author'));
                const authorships = authorNodes.map(node => ({
                    author: { display_name: node.getElementsByTagName('name')[0]?.textContent || 'Unknown' }
                }));
                const links = Array.from(entry.getElementsByTagName('link'));
                const pdfLinkNode = links.find(l => l.getAttribute('title') === 'pdf' || l.getAttribute('type') === 'application/pdf');
                const pdfUrl = pdfLinkNode ? pdfLinkNode.getAttribute('href') : '';
                return {
                    id: id || `arxiv_${index}`,
                    title,
                    publication_year: year,
                    doi: id,
                    authorships,
                    best_oa_location: pdfUrl ? { pdf_url: pdfUrl } : null,
                    source: 'arXiv'
                };
            });
        } else {
            // High-fidelity regex parsing for Node.js
            const entryBlocks = xmlText.match(/<entry>[\s\S]*?<\/entry>/g) || [];
            return entryBlocks.map((entryXml, index) => {
                const idMatch = entryXml.match(/<id>([\s\S]*?)<\/id>/);
                const id = idMatch ? idMatch[1].trim() : '';
                const titleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/);
                const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : 'Untitled';
                const pubMatch = entryXml.match(/<published>([\s\S]*?)<\/published>/);
                const year = pubMatch ? new Date(pubMatch[1].trim()).getFullYear() : 'N/A';
                const authorMatches = [...entryXml.matchAll(/<name>([\s\S]*?)<\/name>/g)];
                const authorships = authorMatches.map(m => ({ author: { display_name: m[1].trim() } }));
                const pdfMatch = entryXml.match(/href="([^"]+)"[^>]*?title="pdf"/i) || entryXml.match(/title="pdf"[^>]*?href="([^"]+)"/i);
                let pdfUrl = pdfMatch ? pdfMatch[1] : '';
                if (!pdfUrl && id.includes('arxiv.org/abs/')) {
                    pdfUrl = id.replace('/abs/', '/pdf/') + '.pdf';
                }
                return {
                    id: id || `arxiv_${index}`,
                    title,
                    publication_year: year,
                    doi: id,
                    authorships,
                    best_oa_location: pdfUrl ? { pdf_url: pdfUrl } : null,
                    source: 'arXiv'
                };
            });
        }
    } catch (e) {
        console.error('arXiv search error:', e);
        return [];
    }
}

/**
 * Helper: Search Crossref
 */
async function searchCrossref(keywords, maxResults) {
    const searchQuery = keywords.map(k => k.trim()).join(' ');
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(searchQuery)}&rows=${maxResults}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const items = data.message?.items || [];
        return items.map((item, index) => {
            const doi = item.DOI ? `https://doi.org/${item.DOI}` : '';
            const title = item.title?.[0] || 'Untitled';
            const year = item.created?.['date-parts']?.[0]?.[0] || 'N/A';
            const authorships = (item.author || []).map(a => ({
                author: { display_name: `${a.given || ''} ${a.family || ''}`.trim() }
            }));
            const linkList = item.link || [];
            const pdfLinkNode = linkList.find(l => l['content-type'] === 'application/pdf');
            const pdfUrl = pdfLinkNode ? pdfLinkNode.URL : '';
            return {
                id: doi || `crossref_${index}`,
                title,
                publication_year: year,
                doi: doi,
                authorships,
                best_oa_location: pdfUrl ? { pdf_url: pdfUrl } : null,
                source: 'Crossref'
            };
        });
    } catch (e) {
        console.error('Crossref search error:', e);
        return [];
    }
}

/**
 * Helper: Search PMC (PubMed Central)
 */
async function searchPMC(keywords, maxResults) {
    const searchQuery = keywords.map(k => k.trim()).join(' ');
    try {
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${encodeURIComponent(searchQuery)}&retmode=json&retmax=${maxResults}`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) return [];
        const searchData = await searchRes.json();
        const ids = searchData.esearchresult?.idlist || [];
        if (ids.length === 0) return [];

        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pmc&id=${ids.join(',')}&retmode=json`;
        const summaryRes = await fetch(summaryUrl);
        if (!summaryRes.ok) return [];
        const summaryData = await summaryRes.json();
        const results = summaryData.result || {};

        return ids.map((id, index) => {
            const item = results[id] || {};
            const title = item.title || 'Untitled';
            const year = item.pubdate ? item.pubdate.split(' ')[0].split('-')[0] : 'N/A';
            const authorships = (item.authors || []).map(a => ({
                author: { display_name: a.name || 'Unknown' }
            }));
            const pmcid = item.articleids?.find(ai => ai.idtype === 'pmcid')?.value || `PMC${id}`;
            const cleanPmcid = pmcid.startsWith('PMC') ? pmcid : `PMC${pmcid}`;
            const pdfUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/${cleanPmcid}/pdf/`;
            const doi = item.articleids?.find(ai => ai.idtype === 'doi')?.value
                ? `https://doi.org/${item.articleids.find(ai => ai.idtype === 'doi').value}`
                : `https://ncbi.nlm.nih.gov/pmc/articles/${cleanPmcid}/`;
            return {
                id: `pmc_${id}`,
                title,
                publication_year: year,
                doi: doi,
                authorships,
                best_oa_location: { pdf_url: pdfUrl },
                source: 'PubMed Central'
            };
        });
    } catch (e) {
        console.error('PMC search error:', e);
        return [];
    }
}



/**
 * Helper: Search ScholarAPI.net (https://scholarapi.net/docs/api)
 * Official high-speed academic register with full-text metadata and direct PDF endpoints.
 */
async function searchScholarApi(keywords, maxResults, customScholarApiKey = '', log = null) {
    const limit = maxResults;
    const key = getScholarApiKey(customScholarApiKey);
    const searchQuery = keywords.map(k => k.trim()).join(' ');

    const backendUrl = `http://localhost:8000/api/scholarapi/search?q=${encodeURIComponent(searchQuery)}&limit=${limit}`;
    const directUrl = `https://scholarapi.net/api/v1/search?q=${encodeURIComponent(searchQuery)}&limit=${limit}`;

    try {
        log?.(`[ScholarAPI.net] Querying ScholarAPI register for "${searchQuery}"...`, true);
        let response;
        try {
            response = await fetch(backendUrl, {
                headers: key ? { 'X-API-Key': key } : {}
            });
        } catch {
            if (!key) return [];
            response = await fetch(directUrl, {
                headers: { 'X-API-Key': key, 'Accept': 'application/json' }
            });
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            log?.(`[ScholarAPI.net] Query returned HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 100)}` : ''}`, false);
            return [];
        }
        const data = await response.json();
        const results = data.results || [];
        log?.(`[ScholarAPI.net] Found ${results.length} papers in ScholarAPI register.`, results.length > 0);

        return results.map(item => {
            const authorships = (item.authors || []).map(a => ({
                author: { display_name: typeof a === 'string' ? a : (a.name || 'Unknown') }
            }));
            let year = 'N/A';
            if (item.published_date) {
                const parsed = new Date(item.published_date).getFullYear();
                if (!isNaN(parsed)) year = parsed;
            } else if (item.published_date_raw) {
                const match = item.published_date_raw.match(/\b(19\d\d|20\d\d)\b/);
                if (match) year = match[1];
            }

            return {
                id: `scholarapi_${item.id}`,
                scholar_id: item.id,
                title: item.title || 'Untitled',
                publication_year: year,
                doi: item.doi ? (item.doi.startsWith('http') ? item.doi : `https://doi.org/${item.doi}`) : (item.url || null),
                authorships,
                best_oa_location: {
                    pdf_url: item.has_pdf ? `http://localhost:8000/api/scholarapi/pdf/${item.id}` : null
                },
                source: 'ScholarAPI.net'
            };
        });
    } catch (e) {
        log?.(`[ScholarAPI.net] Search error: ${e.message}`, false);
        return [];
    }
}


/**
 * Helper: Search Google Scholar using ScraperAPI
 */
async function searchGoogleScholar(keywords, maxResults, customScraperApiKey = '', log = null) {
    const limit = maxResults;
    const searchQuery = keywords.map(k => k.trim()).join(' ');
    const scholarUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(searchQuery)}&hl=en`;
    const activeApiKey = getScraperApiKey(customScraperApiKey);
    if (!activeApiKey) {
        log?.(`[ScraperAPI] No API key configured. Skipping Google Scholar search.`, false);
        return [];
    }
    const scraperApiUrl = `https://api.scraperapi.com/?api_key=${activeApiKey}&url=${encodeURIComponent(scholarUrl)}`;

    
    try {
        log?.(`[ScraperAPI] Querying Google Scholar through ScraperAPI...`, true);
        const response = await fetch(scraperApiUrl);
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            log?.(`[ScraperAPI] Google Scholar request failed with status ${response.status}${errorText ? `: ${errorText.slice(0, 120)}` : ''}`, false);
            return [];
        }
        const htmlText = await response.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const results = doc.querySelectorAll('.gs_r.gs_or.gs_scl');
        log?.(`[ScraperAPI] Google Scholar returned ${results.length} raw results.`, results.length > 0);
        
        const papers = [];
        for (let i = 0; i < Math.min(results.length, limit); i++) {
            const row = results[i];
            
            // Title & Link
            const titleNode = row.querySelector('.gs_rt a');
            const title = titleNode ? titleNode.textContent.trim() : row.querySelector('.gs_rt')?.textContent.trim() || 'Untitled';
            const doi = titleNode ? titleNode.getAttribute('href') : '#';
            
            // Metadata (Author - Publisher - Year)
            const metaNode = row.querySelector('.gs_a');
            const metaText = metaNode ? metaNode.textContent : '';
            const parts = metaText.split('-');
            const authorPart = parts[0] || 'Unknown Authors';
            const yearPart = parts[1] || '';
            const yearMatch = yearPart.match(/\b(19|20)\d{2}\b/);
            const year = yearMatch ? yearMatch[0] : 'N/A';
            
            const authorships = authorPart.split(',').map(name => ({
                author: { display_name: name.trim() }
            }));
            
            // PDF Link
            const pdfNode = row.querySelector('.gs_or_ggsl a');
            const pdfUrl = pdfNode ? pdfNode.getAttribute('href') : '';
            
            papers.push({
                id: `scholar_${i}_${Date.now()}`,
                title: title,
                publication_year: year,
                doi: doi,
                authorships: authorships,
                best_oa_location: pdfUrl ? { pdf_url: pdfUrl } : null,
                source: 'Google Scholar'
            });
        }
        return papers;
    } catch (e) {
        console.error('Google Scholar scraping failed:', e);
        log?.(`[ScraperAPI] Google Scholar scraping failed: ${e.message}`, false);
        return [];
    }
}

/**
 * Helper: Search Semantic Scholar
 * Free public API, excellent for academic papers with DOIs and often direct PDF URLs
 */
async function searchSemanticScholar(keywords, maxResults) {
    const searchQuery = keywords.map(k => k.trim()).join(' ');
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(searchQuery)}&limit=${maxResults}&fields=paperId,title,authors,year,doi,openAccessPdf,externalIds`;
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const papers = data.data || [];
        return papers.map((paper, index) => {
            const doi = paper.doi ? (paper.doi.startsWith('http') ? paper.doi : `https://doi.org/${paper.doi}`) : '';
            const pdfUrl = paper.openAccessPdf?.url || '';
            const authorships = (paper.authors || []).map(a => ({
                author: { display_name: a.name || 'Unknown' }
            }));
            return {
                id: paper.paperId || `semantic_${index}`,
                title: paper.title || 'Untitled',
                publication_year: paper.year || 'N/A',
                doi: doi || `#`,
                authorships: authorships,
                best_oa_location: pdfUrl ? { pdf_url: pdfUrl } : null,
                source: 'Semantic Scholar'
            };
        });
    } catch (e) {
        console.error('Semantic Scholar search error:', e);
        return [];
    }
}

/**
 * Helper: Search CORE (aggregates open access research)
 * Requires API key (free tier available)
 */
async function searchCORE(keywords, maxResults) {
    // CORE API requires authentication. For now, use a basic unauthenticated search via their search endpoint
    const searchQuery = keywords.map(k => k.trim()).join(' ');
    try {
        // Using CORE's public search endpoint (no API key required for basic search)
        const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(searchQuery)}&limit=${maxResults}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const works = data.results || [];
        return works.map((work, index) => {
            const doi = work.doi ? (work.doi.startsWith('http') ? work.doi : `https://doi.org/${work.doi}`) : '';
            const pdfUrl = work.fullTextUrl || (work.urls && work.urls[0]) || '';
            const authorships = (work.authors || []).map(a => ({
                author: { display_name: a.name || a || 'Unknown' }
            }));
            return {
                id: work.id || `core_${index}`,
                title: work.title || 'Untitled',
                publication_year: work.yearPublished || work.publishedDate?.split('-')[0] || 'N/A',
                doi: doi || `#`,
                authorships: authorships,
                best_oa_location: pdfUrl ? { pdf_url: pdfUrl } : null,
                source: 'CORE'
            };
        });
    } catch (e) {
        console.error('CORE search error:', e);
        return [];
    }
}

/**
 * Helper: Search PapersWithCode (great for ML/AI papers with implementations)
 */
async function searchPapersWithCode(keywords, maxResults) {
    const searchQuery = keywords.map(k => k.trim()).join(' ');
    try {
        // PapersWithCode API search endpoint
        const url = `https://paperswithcode.com/api/v1/papers/?search=${encodeURIComponent(searchQuery)}&page_size=${maxResults}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const papers = data.results || [];
        return papers.map((paper, index) => {
            const arxivId = paper.arxiv_id || '';
            const arxivDoi = arxivId ? `https://arxiv.org/abs/${arxivId}` : '#';
            const pdfUrl = arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : '';
            const authorships = (paper.authors || []).map(a => ({
                author: { display_name: a.name || 'Unknown' }
            }));
            return {
                id: paper.id || `pwc_${index}`,
                title: paper.title || 'Untitled',
                publication_year: paper.first_published ? new Date(paper.first_published).getFullYear() : 'N/A',
                doi: arxivDoi,
                authorships: authorships,
                best_oa_location: pdfUrl ? { pdf_url: pdfUrl } : null,
                source: 'PapersWithCode'
            };
        });
    } catch (e) {
        console.error('PapersWithCode search error:', e);
        return [];
    }
}

/**
 * Helper: Search DOAJ (Directory of Open Access Journals)
 * Focuses on open access journals
 */
async function searchDOAJ(keywords, maxResults) {
    const searchQuery = keywords.map(k => k.trim()).join(' ');
    try {
        // DOAJ API search endpoint
        const url = `https://doaj.org/api/v2/articles/search?q=${encodeURIComponent(searchQuery)}&pageSize=${maxResults}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const articles = data.results || [];
        return articles.map((article, index) => {
            const bibjson = article.bibjson || {};
            const doi = bibjson.identifier?.find(id => id.type === 'doi')?.id || '';
            const doiUrl = doi ? (doi.startsWith('http') ? doi : `https://doi.org/${doi}`) : '#';
            const pdfUrl = bibjson.link?.find(l => l.type === 'fulltext')?.url || '';
            const authors = bibjson.author || [];
            const authorships = authors.map(a => ({
                author: { display_name: a.name || 'Unknown' }
            }));
            return {
                id: article.id || `doaj_${index}`,
                title: bibjson.title || 'Untitled',
                publication_year: bibjson.year || 'N/A',
                doi: doiUrl,
                authorships: authorships,
                best_oa_location: pdfUrl ? { pdf_url: pdfUrl } : null,
                source: 'DOAJ'
            };
        });
    } catch (e) {
        console.error('DOAJ search error:', e);
        return [];
    }
}

function normalizeDoi(rawDoi) {
    if (!rawDoi || rawDoi === '#') return '';
    const text = String(rawDoi).trim();
    const doiMatch = text.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
    if (!doiMatch) return '';
    return doiMatch[0].replace(/[),.;\]]+$/g, '');
}

// ---------------------------------------------------------------------------
// Sci-Hub Scraper — JavaScript port of openbytedev/scihub-scraper-cli
// https://github.com/openbytedev/scihub-scraper-cli
// ---------------------------------------------------------------------------

/** Known stable Sci-Hub mirrors used as a hardcoded seed list. */
const SCIHUB_SEED_MIRRORS = [
    'https://sci-hub.se',
    'https://sci-hub.st',
    'https://sci-hub.ru',
];

/**
 * Fetches the current list of working Sci-Hub base URLs from the community
 * wiki (https://sci-hub.41610.org) and merges them with the hardcoded seeds.
 * Mirrors the behaviour of `fetch_base_urls` in the scihub_scraper crate.
 *
 * @returns {Promise<string[]>} Array of base URL strings (no trailing slash).
 */
async function fetchSciHubBaseUrls() {
    const urls = new Set(SCIHUB_SEED_MIRRORS);
    try {
        // The community wiki exposes a plain JSON list of active mirrors.
        const wikiUrl = 'https://sci-hub.41610.org/sci-hub.json';
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(wikiUrl)}`;
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
            const json = await res.json();
            // The JSON is an array of objects like { url: 'https://sci-hub.se' }
            // or just an array of strings depending on which endpoint responds.
            const entries = Array.isArray(json) ? json : [];
            for (const entry of entries) {
                const raw = typeof entry === 'string' ? entry : (entry.url || entry.domain || '');
                if (raw) {
                    const base = raw.startsWith('http') ? raw : `https://${raw}`;
                    urls.add(base.replace(/\/+$/, ''));
                }
            }
        }
    } catch (_) {
        // Fall back to the hardcoded seed list silently.
    }
    return Array.from(urls);
}

/**
 * Given a DOI, fetches the Sci-Hub paper page for that DOI, parses the HTML
 * to locate the PDF download URL, and returns it.
 *
 * Replicates the HTML scraping selectors used by the scihub_scraper Rust crate:
 *   - `#buttons [onclick]`  → extract URL from onclick="location.href='...'"
 *   - `#pdf`                → src attribute of the embedded PDF viewer
 *   - `embed[src]`          → fallback embed element
 *   - `a[href]` near download buttons
 *
 * Mirrors are tried in order; the first successful PDF URL is returned.
 *
 * @param {string} rawDoi  - Raw DOI string (may include https://doi.org/ prefix).
 * @param {Function} log   - Logging callback.
 * @returns {Promise<string>} Resolved PDF URL, or empty string on failure.
 */
async function fetchSciHubPdfUrl(rawDoi, log) {
    const doi = normalizeDoi(rawDoi);
    if (!doi) return '';

    log(`[Sci-Hub] Resolving PDF for DOI: ${doi}`, true);

    let mirrors;
    try {
        mirrors = await fetchSciHubBaseUrls();
    } catch (_) {
        mirrors = SCIHUB_SEED_MIRRORS;
    }

    for (const mirror of mirrors) {
        const sciHubUrl = `${mirror}/${doi}`;
        log(`[Sci-Hub] Trying mirror: ${sciHubUrl}`, false);

        try {
            // Fetch Sci-Hub page through CORS proxy since Sci-Hub blocks direct
            // browser requests with restrictive CORS headers.
            const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(sciHubUrl)}`;
            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
            if (!res.ok) {
                log(`[Sci-Hub] Mirror ${mirror} returned HTTP ${res.status}. Trying next.`, false);
                continue;
            }

            const html = await res.text();
            if (!html || html.trim().length < 100) {
                log(`[Sci-Hub] Mirror ${mirror} returned empty page. Trying next.`, false);
                continue;
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Check if the page is a "not found" or CAPTCHA page.
            const bodyText = (doc.body?.textContent || '').toLowerCase();
            if (bodyText.includes('article not found') || bodyText.includes('not found on sci-hub')) {
                log(`[Sci-Hub] Article not found on ${mirror}. Trying next.`, false);
                continue;
            }

            let pdfUrl = '';

            // Strategy 1: #buttons [onclick] — primary download button
            // onclick value looks like: location.href='//sci-hub.se/...pdf'
            const onclickBtn = doc.querySelector('#buttons [onclick]');
            if (onclickBtn) {
                const onclick = onclickBtn.getAttribute('onclick') || '';
                const match = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
                if (match) pdfUrl = match[1];
            }

            // Strategy 2: #pdf embed/iframe src
            if (!pdfUrl) {
                const pdfEmbed = doc.querySelector('#pdf');
                if (pdfEmbed) {
                    pdfUrl = pdfEmbed.getAttribute('src') || '';
                }
            }

            // Strategy 3: embed[src] — generic PDF embed
            if (!pdfUrl) {
                const embedEl = doc.querySelector('embed[src]');
                if (embedEl) {
                    pdfUrl = embedEl.getAttribute('src') || '';
                }
            }

            // Strategy 4: iframe[src] containing .pdf
            if (!pdfUrl) {
                const iframes = Array.from(doc.querySelectorAll('iframe[src]'));
                const pdfIframe = iframes.find(el => (el.getAttribute('src') || '').includes('.pdf'));
                if (pdfIframe) pdfUrl = pdfIframe.getAttribute('src') || '';
            }

            // Strategy 5: any <a href> with .pdf that is near a download context
            if (!pdfUrl) {
                const allLinks = Array.from(doc.querySelectorAll('a[href]'));
                const pdfLink = allLinks.find(el => {
                    const href = el.getAttribute('href') || '';
                    return href.includes('.pdf') || href.includes('/pdf/');
                });
                if (pdfLink) pdfUrl = pdfLink.getAttribute('href') || '';
            }

            if (!pdfUrl) {
                log(`[Sci-Hub] No PDF URL found in page from ${mirror}. Trying next.`, false);
                continue;
            }

            // Normalise the URL — Sci-Hub often returns protocol-relative or path-relative URLs.
            if (pdfUrl.startsWith('//')) {
                pdfUrl = `https:${pdfUrl}`;
            } else if (pdfUrl.startsWith('/')) {
                pdfUrl = `${mirror}${pdfUrl}`;
            } else if (!pdfUrl.startsWith('http')) {
                pdfUrl = `${mirror}/${pdfUrl}`;
            }

            log(`[Sci-Hub] Found PDF URL: ${pdfUrl}`, true);
            return pdfUrl;

        } catch (err) {
            log(`[Sci-Hub] Error fetching from ${mirror}: ${err.message}. Trying next.`, false);
        }
    }

    log(`[Sci-Hub] All mirrors exhausted. Could not locate PDF.`, false);
    return '';
}

function isLikelyPdfUrl(url) {
    if (!url) return false;
    const cleanUrl = String(url).split('#')[0].split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.pdf') || cleanUrl.endsWith('/pdf') || cleanUrl.includes('/pdf/');
}

function getOpenAlexPdfUrl(work) {
    const locations = [
        work?.best_oa_location,
        work?.primary_location,
        ...(Array.isArray(work?.locations) ? work.locations : [])
    ].filter(Boolean);

    for (const location of locations) {
        if (location?.pdf_url) return location.pdf_url;
        if (isLikelyPdfUrl(location?.landing_page_url)) return location.landing_page_url;
    }

    if (isLikelyPdfUrl(work?.open_access?.oa_url)) {
        return work.open_access.oa_url;
    }

    return '';
}

async function resolveOpenPdfUrlFromDoi(rawDoi, log) {
    const doi = normalizeDoi(rawDoi);
    if (!doi) return '';

    const doiUrl = `https://doi.org/${doi}`;
    log(`[PDF Resolver] No direct PDF URL in metadata. Resolving DOI through open-access sources: ${doi}`, false);

    try {
        const openAlexUrl = `https://api.openalex.org/works/${encodeURIComponent(doiUrl)}`;
        const response = await fetch(openAlexUrl);
        if (response.ok) {
            const work = await response.json();
            const pdfUrl = getOpenAlexPdfUrl(work);
            if (pdfUrl) {
                log(`[PDF Resolver] OpenAlex found an open PDF URL.`, true);
                return pdfUrl;
            }
            log(`[PDF Resolver] OpenAlex found the DOI, but no open PDF URL was listed.`, false);
        } else {
            log(`[PDF Resolver] OpenAlex DOI lookup failed with status ${response.status}.`, false);
        }
    } catch (err) {
        log(`[PDF Resolver] OpenAlex DOI lookup failed: ${err.message}`, false);
    }

    try {
        const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
        const response = await fetch(crossrefUrl);
        if (response.ok) {
            const data = await response.json();
            const links = data?.message?.link || [];
            const pdfLink = links.find(link => link?.URL && (
                link['content-type'] === 'application/pdf' || isLikelyPdfUrl(link.URL)
            ));
            if (pdfLink?.URL) {
                log(`[PDF Resolver] Crossref found a PDF URL.`, true);
                return pdfLink.URL;
            }
            log(`[PDF Resolver] Crossref found the DOI, but no PDF link was listed.`, false);
        } else {
            log(`[PDF Resolver] Crossref DOI lookup failed with status ${response.status}.`, false);
        }
    } catch (err) {
        log(`[PDF Resolver] Crossref DOI lookup failed: ${err.message}`, false);
    }

    return '';
}

/**
 * Enrichment Stage: Resolve missing PDFs via Sci-Hub for papers without direct PDF URLs.
 * This function mutates the papers array in place, adding Sci-Hub PDF URLs where available.
 *
 * @param {Array} papers - Array of paper objects to enrich.
 * @param {Function} log - Logging callback.
 */
async function enrichPapersWithSciHubPdfs(papers, log) {
    const papersNeedingPdf = papers.filter(paper => {
        const hasPdfUrl = paper.best_oa_location?.pdf_url || 
                         (Array.isArray(paper.locations) && 
                          paper.locations.some(loc => loc?.pdf_url));
        return !hasPdfUrl && paper.doi;
    });

    if (papersNeedingPdf.length === 0) {
        log(`[Sci-Hub Enrichment] All papers already have PDF URLs. Skipping Sci-Hub resolution.`, false);
        return;
    }

    log(`[Sci-Hub Enrichment] Attempting to resolve ${papersNeedingPdf.length} papers without direct PDF access...`, true);

    // Process papers in parallel batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < papersNeedingPdf.length; i += batchSize) {
        const batch = papersNeedingPdf.slice(i, i + batchSize);
        const batchPromises = batch.map(async (paper) => {
            try {
                const pdfUrl = await fetchSciHubPdfUrl(paper.doi, (msg) => {
                    // Silent logging for enrichment step to avoid clutter
                });
                if (pdfUrl) {
                    if (!paper.best_oa_location) {
                        paper.best_oa_location = {};
                    }
                    paper.best_oa_location.pdf_url = pdfUrl;
                    paper.source = (paper.source || 'Unknown') + ' + Sci-Hub';
                    log(`[Sci-Hub Enrichment] Resolved PDF for "${paper.title.substring(0, 50)}..."`, true);
                }
            } catch (err) {
                // Silent failure for enrichment; paper remains without PDF URL
            }
        });

        await Promise.all(batchPromises);
    }

    log(`[Sci-Hub Enrichment] Enrichment pass completed.`, true);
}

/**
 * Pipeline Stage 2: Transform keywords into clean expressions and fetch matching data from API.
 * This is extended to accept progress and logging callbacks, and to save papers directly to OPFS.
 */
export async function searchResearchPapers(aiJson, onLog = null, onProgress = null, workspaceDirHandle = null) {
    const keywords = aiJson.keywords || [];
    const targetDownloads = aiJson.downloadLimit || aiJson.limit || 20;

    const log = (msg, isGreen = false) => {
        if (onLog) {
            onLog(msg, isGreen);
        } else {
            console.log(msg);
        }
    };

    const updateProgress = (pct) => {
        if (onProgress) onProgress(pct);
    };

    if (keywords.length === 0) {
        log('Error: No keywords provided for scholarly search.', false);
        return [];
    }

    log(`[${new Date().toLocaleTimeString()}] Starting literature search for keywords: ${keywords.join(', ')}`);
    updateProgress(10);

    log(`[${new Date().toLocaleTimeString()}] Querying registers: OpenAlex, arXiv, Crossref, PubMed Central, ScholarAPI.net, Google Scholar, Semantic Scholar, CORE, PapersWithCode, DOAJ, and Sci-Hub...`);
    updateProgress(20);
    try {
        const customScraperApiKey = getScraperApiKey(aiJson.scraperApiKey || '');
        const customScholarApiKey = getScholarApiKey(aiJson.scholarApiKey || '');
        // Ask each source for a wider pool so the crawler can keep going until enough papers convert successfully
        const perSourceLimit = targetDownloads * 4;
        const [openAlexRes, arxivRes, crossrefRes, pmcRes, scholarApiRes, googleScholarRes, semanticScholarRes, coreRes, papersWithCodeRes, doajRes] = await Promise.all([
            searchOpenAlex(keywords, perSourceLimit),
            searchArxiv(keywords, perSourceLimit),
            searchCrossref(keywords, perSourceLimit),
            searchPMC(keywords, perSourceLimit),
            searchScholarApi(keywords, perSourceLimit, customScholarApiKey, log),
            searchGoogleScholar(keywords, perSourceLimit, customScraperApiKey, log),
            searchSemanticScholar(keywords, perSourceLimit),
            searchCORE(keywords, perSourceLimit),
            searchPapersWithCode(keywords, perSourceLimit),
            searchDOAJ(keywords, perSourceLimit)
        ]);

        log(`[${new Date().toLocaleTimeString()}] Retrieved papers from registers:
  • OpenAlex: ${openAlexRes.length} found
  • arXiv: ${arxivRes.length} found
  • Crossref: ${crossrefRes.length} found
  • PubMed Central: ${pmcRes.length} found
  • ScholarAPI.net: ${scholarApiRes.length} found
  • Google Scholar: ${googleScholarRes.length} found
  • Semantic Scholar: ${semanticScholarRes.length} found
  • CORE: ${coreRes.length} found
  • PapersWithCode: ${papersWithCodeRes.length} found
  • DOAJ: ${doajRes.length} found`);
        updateProgress(45);

        // Enrichment: Resolve missing PDFs via Sci-Hub mirrors
        log(`[${new Date().toLocaleTimeString()}] Post-processing: Attempting to resolve missing PDFs via Sci-Hub mirrors...`);
        const allPapersBeforeEnrich = [...openAlexRes, ...arxivRes, ...crossrefRes, ...pmcRes, ...scholarApiRes, ...googleScholarRes, ...semanticScholarRes, ...coreRes, ...papersWithCodeRes, ...doajRes];
        await enrichPapersWithSciHubPdfs(allPapersBeforeEnrich, log);


        const allPapers = allPapersBeforeEnrich;
        const seenTitles = new Set();
        const seenDois = new Set();
        const uniquePapers = [];

        for (const paper of allPapers) {
            const cleanTitle = paper.title.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanDoi = paper.doi ? paper.doi.toLowerCase().trim() : '';

            const isDuplicate = seenTitles.has(cleanTitle) || (cleanDoi && cleanDoi !== '#' && seenDois.has(cleanDoi));
            if (!isDuplicate) {
                seenTitles.add(cleanTitle);
                if (cleanDoi && cleanDoi !== '#') seenDois.add(cleanDoi);
                uniquePapers.push(paper);
            }
        }

        const papers = uniquePapers;
        log(`[${new Date().toLocaleTimeString()}] Deduplication complete. Normalized to ${papers.length} unique papers.`);
        updateProgress(60);

        if (papers.length === 0) {
            log(`[${new Date().toLocaleTimeString()}] No articles matching keywords were found. Try adjusting keywords.`, false);
            updateProgress(100);
            return [];
        }

        // Save papers to OPFS if browser storage is available
        let savedCount = 0;
        if (workspaceDirHandle || (typeof navigator !== 'undefined' && navigator.storage?.getDirectory)) {
            log(`[${new Date().toLocaleTimeString()}] Saving papers to Origin Private File System (OPFS)...`);
            savedCount = await savePapersToOPFS(papers, log, updateProgress, workspaceDirHandle);
            log(`[${new Date().toLocaleTimeString()}] Success: ${savedCount} papers saved in OPFS.`, true);
        }
        updateProgress(100);

        // Try to update UI container if active in DOM
        if (typeof document !== 'undefined') {
            const resultsContainer = document.getElementById('references-results');
            if (resultsContainer) {
                displayPapers(papers);
            }
        }

        return papers;

    } catch (error) {
        log(`[${new Date().toLocaleTimeString()}] Search pipeline error: ${error.message}`, false);
        updateProgress(100);
        throw error;
    }
}

/**
 * Saves downloaded papers list and individual paper details to OPFS.
 */
async function savePapersToOPFS(papersList, log, updateProgress, workspaceDirHandle = null) {
    let savedCount = 0;
    try {
        if (!workspaceDirHandle && (typeof navigator === 'undefined' || !navigator.storage?.getDirectory)) {
            return 0;
        }
        const root = workspaceDirHandle || await navigator.storage.getDirectory();

        // Save the summary list
        const summaryFileHandle = await root.getFileHandle('downloaded_articles.json', { create: true });
        const summaryWritable = await summaryFileHandle.createWritable();
        await summaryWritable.write(JSON.stringify(papersList, null, 2));
        await summaryWritable.close();

        const total = papersList.length;
        if (total === 0) return 0;

        let completed = 0;
        const CONCURRENCY = 4;
        for (let i = 0; i < papersList.length; i += CONCURRENCY) {
            const batch = papersList.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(async (paper, batchIdx) => {
                const globalIdx = i + batchIdx;
                const cleanId = paper.id.split('/').pop() || `id_${globalIdx}`;
                const fileName = `article_${cleanId}.json`;

                const fileHandle = await root.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(paper, null, 2));
                await writable.close();

                completed++;
                savedCount++;
                const currentPct = 50 + Math.round((completed / total) * 45); // scaling from 50% to 95%
                updateProgress(currentPct);

                // Log a snippet of the title
                const shortTitle = paper.title.length > 40 ? paper.title.substring(0, 40) + '...' : paper.title;
                log(`[${new Date().toLocaleTimeString()}] Saved "${shortTitle}" to OPFS.`, true);
            }));
        }

    } catch (err) {
        if (log) log(`[${new Date().toLocaleTimeString()}] OPFS write failed: ${err.message}`, false);
        console.error('Failed to save to OPFS:', err);
    }
    return savedCount;
}

/**
 * Pipeline Stage 3: Map API response records structurally into UI layout components.
 */
export function displayPapers(papersList) {
    const resultsContainer = document.getElementById('references-results');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = ''; // Clear prior states

    if (!papersList || papersList.length === 0) {
        resultsContainer.innerHTML = '<div class="status-message error">Zero Results Found: Try narrowing down or changing terms.</div>';
        return;
    }

    // Map rows into component instances
    papersList.forEach(paper => {
        const cardElement = document.createElement('div');
        cardElement.className = 'paper-card';

        // Safe evaluation metrics for string boundaries
        const fallbackTitle = paper.title || 'Untitled Research Profile';
        const fallbackYear = paper.publication_year || 'N/A';
        const fallbackURL = paper.doi || paper.id || '#';

        // Extract names cleanly from index collections
        const processedAuthors = paper.authorships && paper.authorships.length > 0
            ? paper.authorships.map(entry => entry.author.display_name).slice(0, 3).join(', ') + (paper.authorships.length > 3 ? ' et al.' : '')
            : 'Author context unlisted';

        // Inline payload deployment
        cardElement.innerHTML = `
      <h3 class="paper-title">
        <a href="${fallbackURL}" target="_blank" rel="noopener noreferrer">${fallbackTitle}</a>
      </h3>
      <p class="paper-metadata">
        <strong>Authors:</strong> ${processedAuthors} &nbsp;|&nbsp; <strong>Year:</strong> ${fallbackYear}
      </p>
    `;

        resultsContainer.appendChild(cardElement);
    });
}
/**
 * Helper: Convert DOCX ArrayBuffer to Markdown text in-memory.
 */
async function convertDocxToMarkdown(arrayBuffer, log) {
    try {
        log("[Markdown Converter] Loading Mammoth library for DOCX parsing...", true);
        
        // Dynamically load Mammoth from CDN
        if (typeof window !== 'undefined' && !window.mammoth) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error("Failed to load Mammoth from CDN."));
                document.head.appendChild(script);
            });
        }

        const mammoth = typeof window !== 'undefined' ? window.mammoth : null;
        if (!mammoth) {
            log("[Markdown Converter] Running in Node test environment without Mammoth. Mocking text extraction.", true);
            return "## Document Content\n\nMocked DOCX text content for testing purposes.";
        }

        log("[Markdown Converter] Extracting DOCX text layer...", true);
        const result = await mammoth.convertToMarkdown({ arrayBuffer: arrayBuffer });
        return result.value.trim();
    } catch (err) {
        log(`[Markdown Converter] DOCX conversion failed: ${err.message}`, false);
        console.error("DOCX-to-Markdown error:", err);
        return '';
    }
}

/**
 * Helper: Convert XLSX/XLS ArrayBuffer to Markdown text in-memory.
 */
async function convertXlsxToMarkdown(arrayBuffer, log) {
    try {
        log("[Markdown Converter] Loading SheetJS library for Excel parsing...", true);
        
        // Dynamically load SheetJS from CDN
        if (typeof window !== 'undefined' && !window.XLSX) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error("Failed to load SheetJS from CDN."));
                document.head.appendChild(script);
            });
        }

        const XLSX = typeof window !== 'undefined' ? window.XLSX : null;
        if (!XLSX) {
            log("[Markdown Converter] Running in Node test environment without SheetJS. Mocking text extraction.", true);
            return "## Spreadsheet Content\n\n| Mock Header 1 | Mock Header 2 |\n| --- | --- |\n| Mock Row 1 | Mock Row 2 |";
        }

        log("[Markdown Converter] Reading spreadsheet workbook sheets...", true);
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        let markdown = '';
        
        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            if (csv.trim()) {
                markdown += `## Sheet: ${sheetName}\n\n`;
                markdown += convertCsvToMarkdownTable(csv) + '\n\n';
            }
        }
        
        return markdown.trim();
    } catch (err) {
        log(`[Markdown Converter] Excel conversion failed: ${err.message}`, false);
        console.error("Excel-to-Markdown error:", err);
        return '';
    }
}

/**
 * Helper: Convert CSV text to a clean Markdown table format.
 */
function convertCsvToMarkdownTable(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return '';
    
    const parseCsvLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    };

    const rows = lines.map(line => parseCsvLine(line));
    const colCount = Math.max(...rows.map(row => row.length));
    if (colCount === 0) return '';
    
    const header = rows[0];
    while (header.length < colCount) {
        header.push(`Column ${header.length + 1}`);
    }
    
    let markdown = '';
    markdown += '| ' + header.join(' | ') + ' |\n';
    markdown += '| ' + Array(colCount).fill('---').join(' | ') + ' |\n';
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        while (row.length < colCount) {
            row.push('');
        }
        markdown += '| ' + row.join(' | ') + ' |\n';
    }
    
    return markdown;
}

/**
 * Helper: Convert PPTX/PPT ArrayBuffer to Markdown text in-memory by parsing Zip structures.
 */
async function convertPptxToMarkdown(arrayBuffer, log) {
    try {
        log("[Markdown Converter] Loading JSZip library for PPTX parsing...", true);
        
        // Dynamically load JSZip from CDN
        if (typeof window !== 'undefined' && !window.JSZip) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error("Failed to load JSZip from CDN."));
                document.head.appendChild(script);
            });
        }

        const JSZip = typeof window !== 'undefined' ? window.JSZip : null;
        if (!JSZip) {
            log("[Markdown Converter] Running in Node test environment without JSZip. Mocking PPTX parsing.", true);
            return "## Slide 1\n\nMocked PPTX text content for testing purposes.";
        }

        log("[Markdown Converter] Reading PPTX presentation zip archive...", true);
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        // Find all slide XML files
        const slideFiles = [];
        zip.forEach((relativePath, file) => {
            if (relativePath.match(/^ppt\/slides\/slide[0-9]+\.xml$/i)) {
                slideFiles.push({ path: relativePath, file });
            }
        });
        
        // Sort slides by number index (slide1.xml, slide2.xml...)
        slideFiles.sort((a, b) => {
            const numA = parseInt(a.path.match(/[0-9]+/)[0]);
            const numB = parseInt(b.path.match(/[0-9]+/)[0]);
            return numA - numB;
        });

        log(`[Markdown Converter] Found ${slideFiles.length} slides. Extracting text content...`, true);
        let markdown = '';
        
        for (let i = 0; i < slideFiles.length; i++) {
            const slide = slideFiles[i];
            const xmlText = await slide.file.async("text");
            
            // Extract text from <a:t> tags
            const textMatches = [...xmlText.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]);
            const slideText = textMatches.join(' ').replace(/\s+/g, ' ').trim();
            
            if (slideText) {
                markdown += `## Slide ${i + 1}\n\n${slideText}\n\n`;
            }
        }

        return markdown.trim();
    } catch (err) {
        log(`[Markdown Converter] PPTX conversion failed: ${err.message}`, false);
        console.error("PPTX-to-Markdown error:", err);
        return '';
    }
}

/**
 * Main Entrypoint: Convert any supported document binary format to Markdown text in-memory.
 */
export async function convertDocumentToMarkdown(arrayBuffer, filename, log) {
    const ext = filename.split('.').pop().toLowerCase();
    
    if (ext === 'pdf') {
        return await convertPdfToMarkdown(arrayBuffer, log);
    }
    
    if (ext === 'docx') {
        return await convertDocxToMarkdown(arrayBuffer, log);
    }

    if (ext === 'pptx' || ext === 'ppt') {
        return await convertPptxToMarkdown(arrayBuffer, log);
    }
    
    if (ext === 'csv') {
        const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : { decode: (buf) => Buffer.from(buf).toString('utf-8') };
        const csvText = decoder.decode(arrayBuffer);
        return convertCsvToMarkdownTable(csvText);
    }
    
    if (ext === 'xlsx' || ext === 'xls') {
        return await convertXlsxToMarkdown(arrayBuffer, log);
    }
    
    return '';
}

/**
 * Helper: Convert PDF ArrayBuffer/Uint8Array to Markdown text in-memory.
 */
export async function convertPdfToMarkdown(arrayBuffer, log) {
    try {
        log("[Markdown Converter] Initializing PDF.js library...", true);
        
        // Dynamically load PDF.js from CDN to avoid worker configuration issues in Vite/bundlers
        if (typeof window !== 'undefined' && !window.pdfjsLib) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
                script.onload = () => {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
                    resolve();
                };
                script.onerror = (err) => reject(new Error("Failed to load PDF.js from CDN."));
                document.head.appendChild(script);
            });
        }

        let pdfjs;
        if (typeof window !== 'undefined') {
            pdfjs = window.pdfjsLib;
        } else {
            try {
                const req = typeof require !== 'undefined' ? require : undefined;
                if (!req) throw new Error("require is not defined");
                const libName = 'pdfjs-dist';
                pdfjs = req(libName);
            } catch (e) {
                log("[Markdown Converter] Running in Node test environment without pdfjs-dist. Mocking text extraction.", true);
                return "## Page 1\n\nMocked parsed text content for testing purposes.";
            }
        }

        if (!pdfjs) {
            throw new Error("PDF.js library could not be resolved.");
        }

        log("[Markdown Converter] Loading PDF pages in-memory...", true);
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        log(`[Markdown Converter] PDF loaded successfully. Total pages: ${pdf.numPages}`, true);

        let markdownContent = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Join string items
            const pageText = textContent.items.map(item => item.str).join(' ');
            if (pageText.trim()) {
                markdownContent += `## Page ${i}\n\n${pageText.trim()}\n\n`;
            }
        }

        return markdownContent.trim();
    } catch (err) {
        log(`[Markdown Converter] Error converting PDF to markdown: ${err.message}`, false);
        console.error("PDF-to-Markdown conversion error:", err);
        return '';
    }
}

/**
 * Helper: Streams the PDF download and aborts early if it detects no text layer.
 * Returns an ArrayBuffer of the PDF content on success, or throws an error.
 */
async function downloadPdfWithStreamCheck(url, log, customScraperApiKey = '') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error("Download request timed out")), 12000);
    let response;
    try {
        response = await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
    if (!response.ok) {
        throw new Error(`Download returned status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.includes('application/pdf')) {
        throw new Error("Response content-type is not a PDF.");
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength !== null && parseInt(contentLength, 10) === 0) {
        throw new Error("PDF file is empty (0 bytes).");
    }

    const reader = response.body.getReader();
    const chunks = [];
    let receivedLength = 0;
    const CHECK_LIMIT = 512 * 1024; // Check first 512 KB
    let hasChecked = false;
    let isTextBased = false;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            chunks.push(value);
            receivedLength += value.length;

            if (!hasChecked && receivedLength >= CHECK_LIMIT) {
                // Combine chunks to inspect
                const combined = new Uint8Array(receivedLength);
                let position = 0;
                for (const chunk of chunks) {
                    combined.set(chunk, position);
                    position += chunk.length;
                }

                // Decode as latin1 to safely scan binary structure
                const decoder = new TextDecoder('latin1');
                const text = decoder.decode(combined);

                // Search for font-related PDF markers
                if (text.includes('/Font') || text.includes('/ToUnicode') || text.includes('/Tf') || text.includes('BT')) {
                    isTextBased = true;
                }

                hasChecked = true;

                if (!isTextBased) {
                    // Abort the connection immediately to save bandwidth
                    controller.abort();
                    throw new Error("Scanned PDF with no text layer detected. Skipping download.");
                }
            }
        }
    } catch (err) {
        controller.abort();
        throw err;
    }

    // Check again if the file was smaller than CHECK_LIMIT
    if (!hasChecked) {
        const combined = new Uint8Array(receivedLength);
        let position = 0;
        for (const chunk of chunks) {
            combined.set(chunk, position);
            position += chunk.length;
        }
        const decoder = new TextDecoder('latin1');
        const text = decoder.decode(combined);
        if (text.includes('/Font') || text.includes('/ToUnicode') || text.includes('/Tf') || text.includes('BT')) {
            isTextBased = true;
        } else {
            throw new Error("Scanned PDF with no text layer detected. Skipping download.");
        }
    }

    // Reconstruct the full file
    const finalBuffer = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
        finalBuffer.set(chunk, position);
        position += chunk.length;
    }
    return finalBuffer.buffer;
}

/**
 * Pipeline Stage 4: Download scholarly paper PDF via fallback proxies and save to workspace.
 * Returns { filename, sizeStr } on success, or throws an error.
 */
/**
 * Retrieves the raw PDF Blob using the 5-tier proxy and register fallback chain.
 * Returns { blob: Blob, filename: string }.
 */
export async function fetchPaperPdfBlob(paper, onLog = null, customScraperApiKey = '') {
    const log = (msg, isGreen = false) => {
        if (onLog) onLog(msg, isGreen);
    };

    let pdfUrl = paper.best_oa_location?.pdf_url || paper.primary_location?.pdf_url || paper.open_access?.oa_url;
    let blob;

    if (!pdfUrl) {
        pdfUrl = await resolveOpenPdfUrlFromDoi(paper.doi, log);
    }

    if (!pdfUrl) {
        throw new Error("No open PDF URL found for this paper DOI.");
    }

    // Upgrade http to https to prevent mixed-content blocks in browser context
    if (pdfUrl.startsWith('http://')) {
        pdfUrl = pdfUrl.replace('http://', 'https://');
    }

    log(`[PDF Crawler] Using PDF URL: ${pdfUrl}`, true);

    // Attempt 0: Direct ScholarAPI.net fetch if paper originates from ScholarAPI
    if (paper.scholar_id || (pdfUrl && pdfUrl.includes('scholarapi'))) {
        const scholarId = paper.scholar_id || (paper.id && paper.id.replace('scholarapi_', ''));
        const backendPdfUrl = `http://localhost:8000/api/scholarapi/pdf/${scholarId}`;
        const directPdfUrl = `https://scholarapi.net/api/v1/pdf/${scholarId}`;
        const sKey = getScholarApiKey(customScraperApiKey);

        try {
            log(`[PDF Crawler] Fetching high-speed PDF via ScholarAPI.net (${scholarId})...`, true);
            let res = await fetch(backendPdfUrl, { headers: sKey ? { 'X-API-Key': sKey } : {} });
            if (!res.ok) {
                res = await fetch(directPdfUrl, { headers: { 'X-API-Key': sKey } });
            }
            if (res.ok) {
                const buf = await res.arrayBuffer();
                const firstBytes = new Uint8Array(buf.slice(0, 4));
                const header = String.fromCharCode(firstBytes[0], firstBytes[1], firstBytes[2], firstBytes[3]);
                if (header === '%PDF') {
                    const blob = new Blob([buf], { type: 'application/pdf' });
                    log(`[PDF Crawler] Successfully downloaded PDF via ScholarAPI.net!`, true);
                    return { blob, filename: generateCleanFilename(paper.title) };
                }
            }
        } catch (sErr) {
            log(`[PDF Crawler] ScholarAPI direct fetch error: ${sErr.message}. Falling back to standard web mirrors...`, false);
        }
    }

    try {
        // Attempt 1: Direct fetch
        const arrayBuffer = await downloadPdfWithStreamCheck(pdfUrl, log, customScraperApiKey);

        const firstBytes = new Uint8Array(arrayBuffer.slice(0, 4));
        const header = String.fromCharCode(firstBytes[0], firstBytes[1], firstBytes[2], firstBytes[3]);
        if (header !== '%PDF') {
            throw new Error("Downloaded content is not a valid PDF (missing %PDF signature).");
        }
        blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    } catch (directErr) {
        log(`[PDF Crawler] Direct fetch failed: ${directErr.message}. Retrying via Proxy 1 (corsproxy.io)...`, false);
        try {
            // Attempt 2: CORS Proxy 1 (corsproxy.io)
            const proxyUrl1 = `https://corsproxy.io/?url=${encodeURIComponent(pdfUrl)}`;
            const arrayBuffer = await downloadPdfWithStreamCheck(proxyUrl1, log, customScraperApiKey);
            const firstBytes = new Uint8Array(arrayBuffer.slice(0, 4));
            const header = String.fromCharCode(firstBytes[0], firstBytes[1], firstBytes[2], firstBytes[3]);
            if (header !== '%PDF') {
                throw new Error("Proxy 1 response is not a valid PDF (missing %PDF signature).");
            }
            blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        } catch (proxy1Err) {
            log(`[PDF Crawler] Proxy 1 failed: ${proxy1Err.message}. Retrying via Proxy 2 (allorigins base64)...`, false);
            try {
                // Attempt 3: AllOrigins JSON API base64 bypass
                const proxyUrl2 = `https://api.allorigins.win/get?url=${encodeURIComponent(pdfUrl)}`;
                const jsonResponse = await fetch(proxyUrl2);
                if (!jsonResponse.ok) throw new Error(`AllOrigins JSON API returned status ${jsonResponse.status}`);
                const jsonData = await jsonResponse.json();
                if (!jsonData.contents || jsonData.contents.trim().length === 0) throw new Error("AllOrigins returned empty contents");

                const dataUri = jsonData.contents;
                const matches = dataUri.match(/^data:(.+);base64,(.+)$/);
                if (matches) {
                    const contentType = matches[1];
                    if (!contentType.includes('application/pdf')) {
                        throw new Error(`Proxy content is not a PDF (type: ${contentType}). The paper may be paywalled.`);
                    }
                    const base64Data = matches[2];
                    const byteCharacters = atob(base64Data);

                    // Check first 512KB of base64 data
                    const checkChars = byteCharacters.substring(0, Math.min(byteCharacters.length, 512 * 1024));
                    if (!checkChars.includes('/Font') && !checkChars.includes('/ToUnicode') && !checkChars.includes('/Tf') && !checkChars.includes('BT')) {
                        throw new Error("Scanned PDF with no text layer detected (via AllOrigins).");
                    }

                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    
                    if (byteArray.length < 4) {
                        throw new Error("Proxy 2 decoded content is empty or too short to be a PDF.");
                    }
                    const header = String.fromCharCode(byteArray[0], byteArray[1], byteArray[2], byteArray[3]);
                    if (header !== '%PDF') {
                        throw new Error("Proxy 2 decoded content is not a valid PDF (missing %PDF signature).");
                    }

                    blob = new Blob([byteArray], { type: 'application/pdf' });
                } else {
                    throw new Error("Could not parse PDF binary data from proxy.");
                }
            } catch (proxy2Err) {
                log(`[PDF Crawler] Proxy 2 failed: ${proxy2Err.message}. Retrying via ScraperAPI...`, false);
                try {
                    const activeApiKey = getScraperApiKey(customScraperApiKey);
                    const scraperApiUrl = `https://api.scraperapi.com/?api_key=${activeApiKey}&url=${encodeURIComponent(pdfUrl)}`;
                    const arrayBuffer = await downloadPdfWithStreamCheck(scraperApiUrl, log, customScraperApiKey);
                    const firstBytes = new Uint8Array(arrayBuffer.slice(0, 4));
                    const header = String.fromCharCode(firstBytes[0], firstBytes[1], firstBytes[2], firstBytes[3]);
                    if (header !== '%PDF') {
                        throw new Error("ScraperAPI response is not a valid PDF (missing %PDF signature).");
                    }
                    blob = new Blob([arrayBuffer], { type: 'application/pdf' });
                } catch (scraperErr) {
                    log(`[PDF Crawler] ScraperAPI failed: ${scraperErr.message}. Trying Sci-Hub as last resort...`, false);
                    try {
                        // Attempt 5: Sci-Hub scraper (port of openbytedev/scihub-scraper-cli)
                        const sciHubPdfUrl = await fetchSciHubPdfUrl(paper.doi, log);
                        if (!sciHubPdfUrl) {
                            throw new Error('Sci-Hub returned no PDF URL for this DOI.');
                        }
                        // Fetch the actual PDF through a CORS proxy
                        const sciHubProxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(sciHubPdfUrl)}`;
                        const arrayBuffer = await downloadPdfWithStreamCheck(sciHubProxyUrl, log, customScraperApiKey);
                        const firstBytes = new Uint8Array(arrayBuffer.slice(0, 4));
                        const header = String.fromCharCode(firstBytes[0], firstBytes[1], firstBytes[2], firstBytes[3]);
                        if (header !== '%PDF') {
                            throw new Error('Sci-Hub response is not a valid PDF (missing %PDF signature).');
                        }
                        blob = new Blob([arrayBuffer], { type: 'application/pdf' });
                        log(`[PDF Crawler] Sci-Hub download succeeded.`, true);
                    } catch (sciHubErr) {
                        throw new Error(`All PDF fallbacks exhausted. Sci-Hub also failed: ${sciHubErr.message}`);
                    }
                }
            }
        }
    }

    const cleanTitle = (paper.title || 'academic_paper')
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 50)
        .trim();
    const filename = `${cleanTitle}.pdf`;

    return { blob, filename };
}

export async function downloadPaperPDF(paper, workspaceDirHandle, onLog = null, customScraperApiKey = '') {
    const log = (msg, isGreen = false) => {
        if (onLog) onLog(msg, isGreen);
    };

    const { blob } = await fetchPaperPdfBlob(paper, onLog, customScraperApiKey);

    // Convert Blob to ArrayBuffer
    let arrayBuffer;
    if (blob instanceof Blob) {
        arrayBuffer = await blob.arrayBuffer();
    } else {
        arrayBuffer = blob;
    }

    // Convert PDF to Markdown text in-memory
    const markdownContent = await convertDocumentToMarkdown(arrayBuffer, 'paper.pdf', log);
    if (!markdownContent || markdownContent.trim().length === 0) {
        throw new Error("PDF contains no extractable text layer. Skipping save.");
    }

    const cleanTitle = paper.title
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 50)
        .trim();
    const filename = `${cleanTitle}.md`;

    if (!workspaceDirHandle) {
        throw new Error("No active workspace directory handle.");
    }
    const fileHandle = await workspaceDirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(markdownContent);
    await writable.close();

    const mdBlob = new Blob([markdownContent], { type: 'text/markdown' });
    let sizeStr = '0 KB';
    if (mdBlob.size > 1024 * 1024) {
        sizeStr = `${(mdBlob.size / (1024 * 1024)).toFixed(1)} MB`;
    } else {
        sizeStr = `${(mdBlob.size / 1024).toFixed(0)} KB`;
    }

    log(`[PDF Crawler] Successfully saved and converted "${filename}" to markdown!`, true);
    return { filename, sizeStr };
}
