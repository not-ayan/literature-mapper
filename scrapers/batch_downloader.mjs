/**
 * Batch Downloader & Ingestion Script for Smart Literature Claim Mapper
 * Utilizes downloader.js to search multi-source registers (OpenAlex, arXiv, Crossref, PMC, etc.),
 * download real academic PDFs via the 5-tier proxy fallback chain, and ingest them into
 * the Claim Mapper backend knowledge base.
 */
import { searchResearchPapers, fetchPaperPdfBlob } from './downloader.js';

const TARGET_TOTAL_PAPERS = 50;
const API_BASE = 'http://127.0.0.1:8000/api';

const TOPIC_REGISTRY = [
  { genre: 'AI & Transformers', keywords: ['transformer', 'self-attention', 'deep learning'] },
  { genre: 'RAG & Vector Retrieval', keywords: ['retrieval-augmented generation', 'dense retrieval', 'knowledge intensive'] },
  { genre: 'Model Optimization', keywords: ['parameter-efficient', 'low-rank adaptation', 'quantization'] },
  { genre: 'Reinforcement Learning', keywords: ['reinforcement learning', 'policy gradient', 'markov decision process'] },
  { genre: 'Computer Vision', keywords: ['convolutional neural network', 'vision transformer', 'object detection'] },
  { genre: 'Biomedicine & Genomics', keywords: ['bioinformatics', 'genomic sequence', 'protein folding'] },
  { genre: 'Neuroscience', keywords: ['neural circuit', 'cortical representations', 'synaptic plasticity'] },
  { genre: 'Climate Science', keywords: ['climate modeling', 'greenhouse gas', 'carbon capture'] },
  { genre: 'Quantum Computing', keywords: ['quantum computing', 'superconducting qubits', 'quantum error correction'] },
  { genre: 'AI Ethics & Alignment', keywords: ['algorithmic fairness', 'machine learning bias', 'trustworthy ai'] },
  { genre: 'Astrophysics & Cosmology', keywords: ['gravitational waves', 'exoplanet detection', 'cosmic microwave'] },
  { genre: 'Cybersecurity & Cryptography', keywords: ['post-quantum cryptography', 'differential privacy', 'adversarial robustness'] },
  { genre: 'Graph Representation Learning', keywords: ['graph neural networks', 'message passing', 'knowledge graph'] },
  { genre: 'Robotics & Control Systems', keywords: ['autonomous robotics', 'motion planning', 'sim-to-real transfer'] },
  { genre: 'Materials Science & Energy', keywords: ['lithium ion battery', 'solid state electrolyte', 'perovskite solar'] }
];

async function getStats() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/stats`);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function uploadPaperBlob(blob, filename) {
  const formData = new FormData();
  formData.append('file', blob, filename);
  const res = await fetch(`${API_BASE}/papers/upload`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Upload failed HTTP ${res.status}: ${errText.slice(0, 100)}`);
  }
  return await res.json();
}

async function main() {
  console.log('='.repeat(70));
  console.log('Batch Downloader & Knowledge Base Ingestion Engine');
  console.log(`Targeting ~${TARGET_TOTAL_PAPERS} total academic papers across multiple disciplines`);
  console.log('='.repeat(70));

  let currentStats = await getStats();
  let existingCount = currentStats?.total_papers || 0;
  console.log(`Current knowledge base contains: ${existingCount} papers`);

  if (existingCount >= TARGET_TOTAL_PAPERS) {
    console.log(`Knowledge base already has ${existingCount} papers (>= ${TARGET_TOTAL_PAPERS}).`);
    return;
  }

  const papersNeeded = TARGET_TOTAL_PAPERS - existingCount;
  console.log(`Downloading and ingesting ${papersNeeded} additional academic papers...\n`);

  let ingestedCount = 0;
  const seenDois = new Set();
  const seenTitles = new Set();

  try {
    const existingPapersRes = await fetch(`${API_BASE}/papers`);
    if (existingPapersRes.ok) {
      const existingPapers = await existingPapersRes.json();
      existingPapers.forEach(p => {
        if (p.title) seenTitles.add(p.title.toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (p.doi && p.doi !== '#') seenDois.add(p.doi.toLowerCase().trim());
      });
      console.log(`Preloaded ${existingPapers.length} existing papers into deduplication filter.`);
    }
  } catch (err) {
    console.warn("Could not preload papers list:", err.message);
  }

  for (const topic of TOPIC_REGISTRY) {
    if (existingCount + ingestedCount >= TARGET_TOTAL_PAPERS) break;

    console.log(`\n--- [Genre: ${topic.genre}] Searching for: ${topic.keywords.join(', ')} ---`);
    let candidates = [];
    try {
      candidates = await searchResearchPapers(
        { keywords: topic.keywords, limit: 10 },
        () => {},
        () => {}
      );
    } catch (searchErr) {
      console.warn(`Search error for ${topic.genre}:`, searchErr.message);
      continue;
    }

    console.log(`Found ${candidates.length} candidate papers for ${topic.genre}`);
    let perTopicCount = 0;

    // Prioritize direct PDF links and arXiv
    candidates.sort((a, b) => {
      const aDirect = (a.best_oa_location?.pdf_url?.includes('arxiv') || a.best_oa_location?.pdf_url?.endsWith('.pdf') || a.source === 'arXiv') ? 1 : 0;
      const bDirect = (b.best_oa_location?.pdf_url?.includes('arxiv') || b.best_oa_location?.pdf_url?.endsWith('.pdf') || b.source === 'arXiv') ? 1 : 0;
      return bDirect - aDirect;
    });

    for (const cand of candidates) {
      if (existingCount + ingestedCount >= TARGET_TOTAL_PAPERS) break;
      if (perTopicCount >= 3) break; // Diversify across all genres

      const normTitle = (cand.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normDoi = (cand.doi || '').toLowerCase().trim();

      if (!normTitle || seenTitles.has(normTitle) || (normDoi && normDoi !== '#' && seenDois.has(normDoi))) {
        continue;
      }
      seenTitles.add(normTitle);
      if (normDoi && normDoi !== '#') seenDois.add(normDoi);

      // Only attempt if it has an OA location or DOI
      if (!cand.best_oa_location?.pdf_url && (!cand.doi || cand.doi === '#')) {
        continue;
      }

      process.stdout.write(`Downloading: "${cand.title.slice(0, 52)}..." `);
      try {
        const downloadPromise = fetchPaperPdfBlob(cand, null);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Download exceeded 18s timeout')), 18000)
        );
        const { blob, filename } = await Promise.race([downloadPromise, timeoutPromise]);
        if (!blob || blob.size < 10000) {
          console.log(`[Skipped: PDF too small or empty (${blob?.size || 0} bytes)]`);
          continue;
        }

        process.stdout.write(`(${(blob.size / 1024).toFixed(0)} KB) -> Ingesting... `);
        await uploadPaperBlob(blob, filename);
        ingestedCount++;
        perTopicCount++;
        console.log(`[OK] (${existingCount + ingestedCount}/${TARGET_TOTAL_PAPERS})`);

        // Brief delay between downloads to be respectful of academic repositories
        await new Promise(r => setTimeout(r, 600));
      } catch (dlErr) {
        console.log(`[Failed: ${dlErr.message.slice(0, 45)}]`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Ingestion cycle completed. Uploaded ${ingestedCount} new papers.`);
  console.log('Waiting for background workers to finish claim and relation extraction...');

  // Wait for background tasks to complete
  for (let poll = 0; poll < 45; poll++) {
    await new Promise(r => setTimeout(r, 2000));
    const stats = await getStats();
    if (stats) {
      const pending = (stats.processing_status?.pending || 0) + (stats.processing_status?.processing || 0);
      process.stdout.write(`\rProcessing: ${stats.total_papers} papers in DB | ${stats.total_claims} claims | ${stats.total_relations} relations | pending: ${pending}   `);
      if (pending === 0 && stats.total_papers >= existingCount + ingestedCount) {
        console.log('\nAll papers processed successfully!');
        break;
      }
    }
  }

  const finalStats = await getStats();
  console.log('\nFinal Knowledge Base Metrics:');
  console.log(JSON.stringify(finalStats, null, 2));
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('Fatal batch downloader error:', err);
  process.exit(1);
});
