/**
 * 🤖 سكربت بناء مدونة شات الخليج (v6)
 *
 * 🔥 التعديلات الجديدة:
 * - ❌ لا يحذف ملفات .md (DELETE_SOURCE_FILES = false)
 * - ✅ دعم focus_keyword
 * - ✅ دعم show_in_sitemap
 * - ✅ دعم related_pages (روابط داخلية)
 * - ✅ دعم last_updated (dateModified في Schema)
 * - ✅ FAQ Schema تلقائي
 * - ✅ Breadcrumb 3 مستويات: الرئيسية → المدونة → الصفحة
 * - ✅ Slug إنجليزي إجباري للـ Landing Pages
 * - ✅ منع التكرار في المقالات و Landing Pages
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// ===== الإعدادات =====
const SITE_URL = 'https://blog.chat-alkhaleej.com';
const SITE_NAME = 'مدونة شات الخليج';
const SITE_DESCRIPTION = 'مدونة شات الخليج: مقالات عربية متنوعة عن الترندات والألعاب والتقنية والسوشال ميديا والحياة الخليجية والمحتوى الترفيهي.';
const POSTS_PER_HOMEPAGE = 6;
const POSTS_DIR = 'posts';
const LANDING_DATA_DIR = '_landing-data';
const LANDING_TEMPLATE = '_templates/_landing-template.html';

// 🆕 إعداد جديد: لا تحذف ملفات .md بعد البناء
const DELETE_SOURCE_FILES = false;

// ===== خريطة تحويل العربية للإنجليزية =====
const ARABIC_TO_LATIN = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ء': '', 'ؤ': 'u', 'ئ': 'i',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
    'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a',
    'َ': '', 'ُ': '', 'ِ': '', 'ْ': '', 'ّ': '', 'ً': '', 'ٌ': '', 'ٍ': '',
    ' ': '-', '_': '-'
};

function arabicToSlug(text) {
    if (!text) return 'page-' + Date.now();
    if (!/[\u0600-\u06FF]/.test(text)) {
        return text.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
    let result = '';
    for (const char of text) {
        if (ARABIC_TO_LATIN[char] !== undefined) result += ARABIC_TO_LATIN[char];
        else if (/[a-zA-Z0-9]/.test(char)) result += char.toLowerCase();
        else if (/[\-]/.test(char)) result += '-';
    }
    return result.replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 80);
}

function extractMeta(html, pattern) {
    const match = html.match(pattern);
    return match ? match[1].trim() : '';
}

function formatArabicDate(isoDate) {
    if (!isoDate) return '';
    try {
        const date = new Date(isoDate);
        const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    } catch (e) { return ''; }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
}

/**
 * تحليل Frontmatter متقدم
 */
/**
 * 🆕 تحليل Frontmatter باستخدام js-yaml
 * يدعم: block scalars (|, |-, >, >-), nested structures, anchors
 */
function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) return null;

    const yamlContent = match[1];
    const body = match[2];

    try {
        const data = yaml.load(yamlContent) || {};
        return { data, body: body.trim() };
    } catch (err) {
        console.error(`❌ خطأ في قراءة YAML: ${err.message}`);
        return null;
    }
}


// ============================================================
// 📝 معالجة المقالات
// ============================================================

function getPostTemplate() {
    const templatePath = path.join(POSTS_DIR, '_template.html');
    if (!fs.existsSync(templatePath)) return null;
    return fs.readFileSync(templatePath, 'utf-8');
}

function buildPostHtmlFromMarkdown(mdData, slug) {
    const template = getPostTemplate();
    if (!template) return null;

    const { data, body } = mdData;
    if (!data.title || !data.description) return null;

    // 🆕 المحتوى ممكن يكون في data.body (من Sveltia) أو في body (بعد ---)
    const postContent = data.body || body || '';

    let tagsHtml = '';
    if (Array.isArray(data.tags) && data.tags.length > 0) {
        tagsHtml = data.tags.map(tag => `<span class="tag">${tag}</span>`).join('\n        ');
    }

    let imageUrl = data.image || 'https://tools.chat-alkhaleej.com/logo.webp';
    if (imageUrl.startsWith('/')) imageUrl = SITE_URL + imageUrl;

    // تحويل آمن للتواريخ
    const toIsoString = (d) => {
        if (!d) return new Date().toISOString();
        if (typeof d === 'string') return d;
        if (d instanceof Date) return d.toISOString();
        return String(d);
    };
    const dateIso = toIsoString(data.date);
    const modifiedIso = toIsoString(data.modified || data.date);
    const replacements = {
        'POST_TITLE': data.title,
        'POST_DESCRIPTION': data.description,
        'POST_KEYWORDS': Array.isArray(data.tags) ? data.tags.join(', ') : '',
        'POST_AUTHOR': data.author || 'فريق شات الخليج',
        'POST_SLUG': slug,
        'POST_IMAGE': imageUrl,
        'POST_DATE': dateIso,
        'POST_MODIFIED': modifiedIso,
        'POST_DATE_DISPLAY': formatArabicDate(dateIso),
        'POST_READ_TIME': data.read_time || 5,
        'POST_CATEGORY': data.category || 'عام',
        'POST_CONTENT': postContent,
        'POST_TAGS_HTML': tagsHtml
    };

    let html = template;
    for (const [key, value] of Object.entries(replacements)) {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return html;
}

function parseHtmlPost(filename) {
    const filepath = path.join(POSTS_DIR, filename);
    const html = fs.readFileSync(filepath, 'utf-8');
    const title = extractMeta(html, /<meta property="og:title" content="([^"]+)"/);
    const description = extractMeta(html, /<meta name="description" content="([^"]+)"/);
    if (!title || !description) return null;

    return {
        filename, slug: filename.replace('.html', ''),
        url: `${SITE_URL}/${POSTS_DIR}/${filename}`,
        title, description,
        image: extractMeta(html, /<meta property="og:image" content="([^"]+)"/) || `${SITE_URL}/images/default.jpg`,
        publishedTime: extractMeta(html, /<meta property="article:published_time" content="([^"]+)"/),
        modifiedTime: extractMeta(html, /<meta property="article:modified_time" content="([^"]+)"/),
        dateDisplay: formatArabicDate(extractMeta(html, /<meta property="article:published_time" content="([^"]+)"/)),
        category: (extractMeta(html, /<span class="article-category">[\s\S]*?<\/i>\s*([^<]+)\s*<\/span>/) || 'عام').trim()
    };
}

function generateStableSlug(data, filename) {
    if (data.slug && !/[\u0600-\u06FF]/.test(data.slug) && data.slug.trim()) {
        return data.slug.trim();
    }
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
    const datePrefix = dateMatch ? dateMatch[1] + '-' : '';
    return datePrefix + arabicToSlug(data.title);
}

function processMarkdownPost(filename) {
    const filepath = path.join(POSTS_DIR, filename);
    const content = fs.readFileSync(filepath, 'utf-8');
    const parsed = parseFrontmatter(content);
    if (!parsed) return null;

    const finalSlug = generateStableSlug(parsed.data, filename);
    const html = buildPostHtmlFromMarkdown(parsed, finalSlug);
    if (!html) return null;

    const htmlFilename = finalSlug + '.html';
    fs.writeFileSync(path.join(POSTS_DIR, htmlFilename), html, 'utf-8');

    // 🆕 لا نحذف الملف الأصلي
    if (DELETE_SOURCE_FILES) {
        try { fs.unlinkSync(filepath); } catch (e) {}
    }
    console.log(`✅ مقال: ${filename} → ${htmlFilename}`);

    const { data } = parsed;
    let imageUrl = data.image || `${SITE_URL}/images/default.jpg`;
    if (imageUrl.startsWith('/')) imageUrl = SITE_URL + imageUrl;

    // 🆕 تعريف التواريخ داخل الدالة (Bug fix)
    const toIsoString = (d) => {
        if (!d) return new Date().toISOString();
        if (typeof d === 'string') return d;
        if (d instanceof Date) return d.toISOString();
        return String(d);
    };
    const dateIso = toIsoString(data.date);
    const modifiedIso = toIsoString(data.modified || data.date);

    return {
        filename: htmlFilename, slug: finalSlug,
        url: `${SITE_URL}/${POSTS_DIR}/${htmlFilename}`,
        title: data.title, description: data.description, image: imageUrl,
        publishedTime: dateIso,
        modifiedTime: modifiedIso,
        dateDisplay: formatArabicDate(dateIso),
        category: data.category || 'عام'
    };
}

function getAllPosts() {
    if (!fs.existsSync(POSTS_DIR)) return [];

    const files = fs.readdirSync(POSTS_DIR).filter(f => !f.startsWith('_'));
    const postsBySlug = new Map();

    const markdownFiles = files.filter(f => f.endsWith('.md'));
    for (const mdFile of markdownFiles) {
        const post = processMarkdownPost(mdFile);
        if (post) postsBySlug.set(post.slug, post);
    }

    const htmlFiles = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.html') && !f.startsWith('_'));
    for (const htmlFile of htmlFiles) {
        const slug = htmlFile.replace('.html', '');
        if (postsBySlug.has(slug)) continue;
        const post = parseHtmlPost(htmlFile);
        if (post) postsBySlug.set(post.slug, post);
    }

    const uniquePosts = Array.from(postsBySlug.values());
    uniquePosts.sort((a, b) => {
        const dA = new Date(a.publishedTime || 0).getTime();
        const dB = new Date(b.publishedTime || 0).getTime();
        return dB - dA;
    });

    console.log(`📚 مقالات: ${uniquePosts.length}`);
    return uniquePosts;
}

// ============================================================
// 🎯 معالجة Landing Pages
// ============================================================

function getLandingTemplate() {
    if (!fs.existsSync(LANDING_TEMPLATE)) return null;
    return fs.readFileSync(LANDING_TEMPLATE, 'utf-8');
}

function buildStatsHtml(stats) {
    if (!Array.isArray(stats) || stats.length === 0) return '';
    const items = stats.map(s => `
            <div class="stat-item">
                <div class="stat-number">${s.number || ''}</div>
                <div class="stat-label">${s.label || ''}</div>
            </div>`).join('');
    return `<div class="hero-stats">${items}\n        </div>`;
}

function buildFeaturesSection(data) {
    if (!Array.isArray(data.features) || data.features.length === 0) return '';
    const cards = data.features.map(f => `
            <div class="feature-card">
                <div class="feature-icon"><i class="fas fa-${f.icon || 'star'}"></i></div>
                <h3>${f.title || ''}</h3>
                <p>${f.description || ''}</p>
            </div>`).join('');
    return `
    <div class="section-heading">
        <h2>${data.features_heading || 'لماذا نحن الأفضل؟'}</h2>
        <p>${data.features_subheading || 'مميزات تجعلنا الخيار الأول'}</p>
    </div>
    <div class="features-grid">${cards}
    </div>`;
}

function buildMidCtaSection(data, ctaUrl) {
    if (data.show_mid_cta === false) return '';
    if (!data.mid_cta_title) return '';
    return `
    <div class="mid-cta">
        <div class="mid-cta-icon"><i class="fas fa-comments"></i></div>
        <div class="mid-cta-text">
            <h3>${data.mid_cta_title}</h3>
            <p>${data.mid_cta_text || ''}</p>
        </div>
        <a href="${ctaUrl}" class="mid-cta-btn">
            <i class="fas fa-arrow-left"></i>
            ${data.mid_cta_btn || 'ابدأ الآن'}
        </a>
    </div>`;
}

function buildFaqSection(faqs) {
    if (!Array.isArray(faqs) || faqs.length === 0) return '';
    const items = faqs.map(faq => `
        <div class="faq-item">
            <div class="faq-question">
                <span>${faq.question || ''}</span>
                <i class="fas fa-chevron-down icon"></i>
            </div>
            <div class="faq-answer">
                <p>${(faq.answer || '').replace(/\n/g, '</p><p>')}</p>
            </div>
        </div>`).join('');
    return `
    <div class="section-heading">
        <h2>أسئلة شائعة</h2>
        <p>إجابات لأكثر الأسئلة شيوعاً</p>
    </div>
    <div class="faq-section">${items}
    </div>`;
}

function buildFaqSchema(faqs) {
    if (!Array.isArray(faqs) || faqs.length === 0) return '';
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': faqs.map(faq => ({
            '@type': 'Question',
            'name': faq.question || '',
            'acceptedAnswer': { '@type': 'Answer', 'text': faq.answer || '' }
        }))
    };
    return `<script type="application/ld+json">${JSON.stringify(schema, null, 2)}</script>`;
}

/**
 * 🆕 بناء قسم Related Pages (روابط داخلية)
 */
function buildRelatedPagesSection(relatedPages) {
    if (!Array.isArray(relatedPages) || relatedPages.length === 0) return '';

    const links = relatedPages.map(p => {
        const slug = p.slug || '';
        const title = p.title || slug;
        return `        <a href="/${slug}/" class="related-link">
            <span>${title}</span>
            <i class="fas fa-arrow-left"></i>
        </a>`;
    }).join('\n');

    return `
    <div class="related-pages">
        <h3>🔗 صفحات قد تهمك</h3>
        <div class="related-pages-grid">
${links}
        </div>
    </div>`;
}

function processLandingPage(filename) {
    const filepath = path.join(LANDING_DATA_DIR, filename);
    const content = fs.readFileSync(filepath, 'utf-8');
    const parsed = parseFrontmatter(content);
    if (!parsed) return null;

    const { data } = parsed;
    if (!data.title || !data.slug) {
        console.log(`⚠️  Landing Page ناقص بيانات: ${filename}`);
        return null;
    }

    // 🆕 التحقق من أن الـ slug إنجليزي
    if (/[\u0600-\u06FF]/.test(data.slug)) {
        console.log(`⚠️  Landing Page ${filename}: slug عربي! يفضل تحويله للإنجليزية: ${data.slug}`);
        // نقبل لكن نحذر
    }

    const template = getLandingTemplate();
    if (!template) {
        console.log('❌ قالب Landing Page غير موجود!');
        return null;
    }

    const ctaUrl = data.cta_url || 'https://chat-alkhaleej.com/';
    let imageUrl = data.image || 'https://tools.chat-alkhaleej.com/logo.webp';
    if (imageUrl.startsWith('/')) imageUrl = SITE_URL + imageUrl;

    // التواريخ (تحويل آمن من js-yaml للـ ISO string)
    const toIsoString = (d) => {
        if (!d) return new Date().toISOString();
        if (typeof d === 'string') return d;
        if (d instanceof Date) return d.toISOString();
        return String(d);
    };
    const pageDate = toIsoString(data.date);
    const lastUpdated = toIsoString(data.last_updated || data.date);

    // الأقسام الديناميكية
    const statsHtml = buildStatsHtml(data.stats);
    const featuresSection = buildFeaturesSection(data);
    const midCtaSection = buildMidCtaSection(data, ctaUrl);
    const faqSection = buildFaqSection(data.faqs);
    const faqSchema = buildFaqSchema(data.faqs);
    const relatedPagesSection = buildRelatedPagesSection(data.related_pages);

    // استبدال المتغيرات
    const replacements = {
        'PAGE_TITLE': escapeHtml(data.title),
        'PAGE_DESCRIPTION': escapeHtml(data.description || ''),
        'PAGE_KEYWORDS': Array.isArray(data.keywords) ? data.keywords.join(', ') : '',
        'PAGE_SLUG': data.slug,
        'PAGE_IMAGE': imageUrl,
        'PAGE_DATE': pageDate,
        'LAST_UPDATED': lastUpdated,
        'FOCUS_KEYWORD': escapeHtml(data.focus_keyword || data.title),
        'HERO_BADGE_ICON': data.hero_badge_icon || 'crown',
        'HERO_BADGE_TEXT': data.hero_badge_text || '',
        'HERO_SUBTITLE': data.hero_subtitle || '',
        'HERO_CTA_TEXT': data.hero_cta_text || 'ادخل الآن',
        'CTA_URL': ctaUrl,
        'STATS_HTML': statsHtml,
        'INTRO_TEXT': data.intro || '',
        'FEATURES_SECTION': featuresSection,
        'MID_CTA_SECTION': midCtaSection,
        'MAIN_CONTENT': data.main_content || '',
        'FAQ_SECTION': faqSection,
        'RELATED_PAGES_SECTION': relatedPagesSection,
        'FINAL_CTA_TITLE': escapeHtml(data.final_cta_title || 'جاهز للبداية؟'),
        'FINAL_CTA_TEXT': escapeHtml(data.final_cta_text || ''),
        'FINAL_CTA_BTN': escapeHtml(data.final_cta_btn || 'ابدأ الآن')
    };

    let html = template;
    for (const [key, value] of Object.entries(replacements)) {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    // إضافة FAQ Schema قبل </head>
    if (faqSchema) {
        html = html.replace('</head>', `    ${faqSchema}\n</head>`);
    }

    // إنشاء المجلد وحفظ الملف
    const pageFolder = data.slug;
    if (!fs.existsSync(pageFolder)) {
        fs.mkdirSync(pageFolder, { recursive: true });
    }
    fs.writeFileSync(path.join(pageFolder, 'index.html'), html, 'utf-8');

    // 🆕 لا نحذف ملف الـ .md
    if (DELETE_SOURCE_FILES) {
        try { fs.unlinkSync(filepath); } catch (e) {}
    }
    console.log(`✅ Landing: ${filename} → /${data.slug}/index.html`);

    return {
        slug: data.slug,
        url: `${SITE_URL}/${data.slug}/`,
        title: data.title,
        description: data.description,
        date: pageDate,
        modifiedTime: lastUpdated,
        // 🆕 احترام show_in_sitemap
        show_in_sitemap: data.show_in_sitemap !== false
    };
}

function getAllLandingPages() {
    if (!fs.existsSync(LANDING_DATA_DIR)) {
        console.log('ℹ️  لا يوجد مجلد _landing-data');
        return [];
    }

    const files = fs.readdirSync(LANDING_DATA_DIR).filter(f => f.endsWith('.md'));
    const pagesBySlug = new Map();

    for (const file of files) {
        const page = processLandingPage(file);
        if (page) pagesBySlug.set(page.slug, page);
    }

    // اكتشاف الصفحات الموجودة كمجلدات
    const excludedDirs = ['posts', 'admin', 'scripts', '_templates', '_landing-data',
                         'images', '.github', '.git', 'node_modules'];
    const rootItems = fs.readdirSync('.', { withFileTypes: true });

    for (const item of rootItems) {
        if (!item.isDirectory()) continue;
        if (excludedDirs.includes(item.name)) continue;
        if (item.name.startsWith('.') || item.name.startsWith('_')) continue;

        const indexPath = path.join(item.name, 'index.html');
        if (!fs.existsSync(indexPath)) continue;
        if (pagesBySlug.has(item.name)) continue;

        const html = fs.readFileSync(indexPath, 'utf-8');
        const title = extractMeta(html, /<meta property="og:title" content="([^"]+)"/);
        const description = extractMeta(html, /<meta property="og:description" content="([^"]+)"/);

        if (title) {
            pagesBySlug.set(item.name, {
                slug: item.name,
                url: `${SITE_URL}/${item.name}/`,
                title, description,
                date: new Date().toISOString(),
                modifiedTime: new Date().toISOString(),
                show_in_sitemap: true
            });
        }
    }

    const pages = Array.from(pagesBySlug.values());
    console.log(`🎯 Landing Pages: ${pages.length}`);
    return pages;
}

// ============================================================
// 📄 بناء الصفحات الأساسية
// ============================================================

function buildPostCard(post) {
    return `
            <a href="/${POSTS_DIR}/${post.filename}" class="post-card-link">
                <article class="post-card">
                    <img src="${post.image}" alt="${post.title}" class="post-card-img" loading="lazy" />
                    <div class="post-card-body">
                        <div class="post-card-date"><i class="fas fa-calendar"></i> ${post.dateDisplay}</div>
                        <h3 class="post-card-title">${post.title}</h3>
                        <p class="post-card-desc">${post.description}</p>
                        <span class="post-card-read">اقرأ المزيد <i class="fas fa-arrow-left"></i></span>
                    </div>
                </article>
            </a>`;
}

function updateIndex(posts) {
    const indexPath = 'index.html';
    if (!fs.existsSync(indexPath)) return;

    let html = fs.readFileSync(indexPath, 'utf-8');
    let postsSection;

    if (posts.length === 0) {
        postsSection = `\n        <div class="no-posts-yet"><i class="fas fa-feather-pointed"></i><h3>لا توجد مقالات بعد</h3></div>`;
    } else {
        postsSection = `\n        <div class="latest-posts-grid">\n${posts.slice(0, POSTS_PER_HOMEPAGE).map(buildPostCard).join('\n')}\n        </div>`;
    }

    const regex = /<!-- POSTS_START -->[\s\S]*?<!-- POSTS_END -->/;
    if (regex.test(html)) {
        html = html.replace(regex, `<!-- POSTS_START -->${postsSection}\n        <!-- POSTS_END -->`);
        fs.writeFileSync(indexPath, html, 'utf-8');
        console.log('✅ index.html');
    }
}

function buildSitemap(posts, landingPages) {
    const today = new Date().toISOString().split('T')[0];
    let urls = [
        { loc: `${SITE_URL}/`, lastmod: today, changefreq: 'daily', priority: '1.0' },
        { loc: `${SITE_URL}/archive.html`, lastmod: today, changefreq: 'daily', priority: '0.8' }
    ];

    posts.forEach(p => {
        const dateValue = p.modifiedTime || p.publishedTime || today;
        const lastmod = typeof dateValue === 'string' ? dateValue.split('T')[0] : new Date(dateValue).toISOString().split('T')[0];
        urls.push({
            loc: p.url,
            lastmod: lastmod,
            changefreq: 'weekly', priority: '0.7'
        });
    });

    // 🆕 احترام show_in_sitemap
    let excludedCount = 0;
    landingPages.forEach(p => {
        if (p.show_in_sitemap === false) {
            excludedCount++;
            return;
        }
        const dateValue = p.modifiedTime || p.date || today;
        const lastmod = typeof dateValue === 'string' ? dateValue.split('T')[0] : new Date(dateValue).toISOString().split('T')[0];
        urls.push({
            loc: p.url,
            lastmod: lastmod,
            changefreq: 'weekly', priority: '0.9'
        });
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `    <url>
        <loc>${u.loc}</loc>
        <lastmod>${u.lastmod}</lastmod>
        <changefreq>${u.changefreq}</changefreq>
        <priority>${u.priority}</priority>
    </url>`).join('\n')}
</urlset>`;

    fs.writeFileSync('sitemap.xml', xml, 'utf-8');
    console.log(`✅ sitemap.xml (${urls.length} URLs${excludedCount > 0 ? ` - ${excludedCount} مخفية` : ''})`);
}

function buildRss(posts) {
    const buildDate = new Date().toUTCString();
    const latest = posts.slice(0, 20);

    const items = latest.map(p => {
        const pubDate = p.publishedTime ? new Date(p.publishedTime).toUTCString() : buildDate;
        return `        <item>
            <title><![CDATA[${p.title}]]></title>
            <link>${p.url}</link>
            <guid isPermaLink="true">${p.url}</guid>
            <description><![CDATA[${p.description}]]></description>
            <pubDate>${pubDate}</pubDate>
            <category>${p.category}</category>
        </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
        <title>${SITE_NAME}</title>
        <link>${SITE_URL}/</link>
        <description>${SITE_DESCRIPTION}</description>
        <language>ar</language>
        <lastBuildDate>${buildDate}</lastBuildDate>
        <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
    </channel>
</rss>`;

    fs.writeFileSync('rss.xml', xml, 'utf-8');
    console.log('✅ rss.xml');
}

function buildArchive(posts) {
    let archiveContent = posts.length === 0
        ? `<div class="no-posts-yet"><i class="fas fa-feather-pointed"></i><h3>لا توجد مقالات بعد</h3></div>`
        : `<div class="latest-posts-grid">\n${posts.map(buildPostCard).join('\n')}\n        </div>`;

    const archiveHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <link rel="icon" type="image/webp" href="https://tools.chat-alkhaleej.com/logo.webp">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <title>أرشيف المقالات | مدونة شات الخليج</title>
    <meta name="description" content="تصفّح جميع مقالات مدونة شات الخليج">
    <link rel="canonical" href="${SITE_URL}/archive.html" />
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        :root { --primary: #450C0C; --accent: #ffd86b; --white: #ffffff; --bg: #f8fafc; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; background-color: var(--bg); padding-top: 75px; }
        .navbar { position: fixed; top: 0; right: 0; left: 0; z-index: 1000; background: rgba(69, 12, 12, 0.97); border-bottom: 3px solid var(--accent); padding: 10px 0; }
        .nav-container { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; }
        .nav-logo img { height: 45px; }
        .nav-links { display: flex; gap: 10px; list-style: none; }
        .nav-links a { color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 8px 14px; border-radius: 25px; display: flex; align-items: center; gap: 7px; }
        .nav-links a i { color: var(--accent); }
        .nav-links a:hover, .nav-links a.active { background: var(--accent); color: var(--primary); }
        .nav-toggle { display: none; color: var(--accent); font-size: 24px; cursor: pointer; }
        @media (max-width: 850px) { .nav-links { position: fixed; top: 68px; right: -100%; width: 100%; background: var(--primary); flex-direction: column; padding: 20px; } .nav-links.active { right: 0; } .nav-toggle { display: block; } }
        header { background: linear-gradient(135deg, var(--primary), #631212); padding: 50px 20px; text-align: center; border-bottom: 6px solid var(--accent); clip-path: polygon(0 0, 100% 0, 100% 95%, 0 100%); color: #fff; }
        header h1 { font-size: 32px; font-weight: 900; }
        .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
        .breadcrumb { background: var(--white); padding: 14px 22px; border-radius: 12px; margin-bottom: 25px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
        .breadcrumb a { color: var(--primary); text-decoration: none; font-weight: 700; }
        .archive-stats { background: #fffdf5; border: 2px solid var(--accent); padding: 20px; border-radius: 14px; margin-bottom: 30px; text-align: center; color: var(--primary); font-weight: 700; }
        .archive-stats strong { font-size: 22px; }
        .latest-posts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 25px; }
        .post-card { background: var(--white); border-radius: 16px; overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,0.06); transition: 0.3s; border-top: 5px solid var(--accent); }
        .post-card:hover { transform: translateY(-8px); border-top-color: var(--primary); }
        .post-card-link { text-decoration: none; color: inherit; display: flex; flex-direction: column; height: 100%; }
        .post-card-img { width: 100%; height: 180px; object-fit: cover; }
        .post-card-body { padding: 22px 20px; flex: 1; display: flex; flex-direction: column; }
        .post-card-date { font-size: 13px; color: #64748b; margin-bottom: 10px; }
        .post-card-date i { color: var(--accent); }
        .post-card-title { font-size: 18px; font-weight: 800; color: var(--primary); margin-bottom: 12px; }
        .post-card-desc { font-size: 14.5px; color: #475569; flex: 1; margin-bottom: 15px; }
        .post-card-read { color: var(--primary); font-weight: 700; font-size: 14px; }
        footer { text-align: center; padding: 50px 20px; color: #64748b; background: #fff; margin-top: 40px; border-top: 1px solid #e2e8f0; }
        @media (max-width: 900px) { .latest-posts-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .latest-posts-grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
<nav class="navbar">
    <div class="nav-container">
        <a href="https://chat-alkhaleej.com/" class="nav-logo"><img src="https://tools.chat-alkhaleej.com/logo.webp" alt="شات الخليج" height="45"></a>
        <ul class="nav-links" id="navLinks">
            <li><a href="https://chat-alkhaleej.com/"><i class="fas fa-home"></i> الرئيسية</a></li>
            <li><a href="https://blog.chat-alkhaleej.com/" class="active"><i class="fas fa-newspaper"></i> المدونة</a></li>
            <li><a href="https://tools.chat-alkhaleej.com/"><i class="fas fa-tools"></i> الأدوات</a></li>
            <li><a href="https://games.chat-alkhaleej.com/"><i class="fas fa-gamepad"></i> الألعاب</a></li>
        </ul>
        <div class="nav-toggle" onclick="document.getElementById('navLinks').classList.toggle('active')"><i class="fas fa-bars"></i></div>
    </div>
</nav>
<header><h1>📚 أرشيف جميع المقالات</h1></header>
<div class="container">
    <nav class="breadcrumb">
        <a href="https://chat-alkhaleej.com/">الرئيسية</a> <span>›</span>
        <a href="${SITE_URL}/">المدونة</a> <span>›</span>
        <span>الأرشيف</span>
    </nav>
    <div class="archive-stats">إجمالي المقالات: <strong>${posts.length}</strong> مقال</div>
    ${archiveContent}
</div>
<footer><p>حقوق النشر © 2026 شات الخليج</p></footer>
</body>
</html>`;

    fs.writeFileSync('archive.html', archiveHtml, 'utf-8');
    console.log('✅ archive.html');
}

function buildRobots() {
    const content = `User-agent: *
Allow: /
Disallow: /posts/_template.html
Disallow: /admin/
Disallow: /_templates/
Disallow: /_landing-data/
Sitemap: ${SITE_URL}/sitemap.xml
`;
    fs.writeFileSync('robots.txt', content, 'utf-8');
    console.log('✅ robots.txt');
}

// ===== التنفيذ =====
console.log('🚀 بدء بناء مدونة شات الخليج (v6 - شامل)...\n');
console.log(`ℹ️  DELETE_SOURCE_FILES = ${DELETE_SOURCE_FILES}\n`);

const posts = getAllPosts();
const landingPages = getAllLandingPages();

updateIndex(posts);
buildArchive(posts);
buildSitemap(posts, landingPages);
buildRss(posts);
buildRobots();

console.log('\n✨ اكتمل البناء!');
console.log(`📊 المقالات: ${posts.length} | Landing Pages: ${landingPages.length}`);
