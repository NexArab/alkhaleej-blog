/**
 * 🤖 سكربت بناء مدونة شات الخليج التلقائي (v2)
 *
 * يدعم نوعين من المقالات:
 * 1. مقالات HTML قديمة (يقرأها من <meta> tags)
 * 2. مقالات Markdown جديدة من Sveltia CMS (يقرأها من Frontmatter)
 *
 * المقالات الـ Markdown تتحوّل تلقائياً لـ HTML كامل بقالب موحّد
 */

const fs = require('fs');
const path = require('path');

// ===== الإعدادات =====
const SITE_URL = 'https://blog.chat-alkhaleej.com';
const SITE_NAME = 'مدونة شات الخليج';
const SITE_DESCRIPTION = 'مدونة شات الخليج: مقالات عربية متنوعة عن الترندات والألعاب والتقنية والسوشال ميديا والحياة الخليجية والمحتوى الترفيهي.';
const POSTS_PER_HOMEPAGE = 6;
const POSTS_DIR = 'posts';

// ===== الأدوات المساعدة =====

function extractMeta(html, pattern) {
    const match = html.match(pattern);
    return match ? match[1].trim() : '';
}

function formatArabicDate(isoDate) {
    if (!isoDate) return '';
    try {
        const date = new Date(isoDate);
        const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    } catch (e) {
        return '';
    }
}

/**
 * تحليل Frontmatter (YAML في الأعلى) - بسيط بدون مكتبات
 */
function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) return null;

    const yamlContent = match[1];
    const body = match[2];

    const data = {};
    const lines = yamlContent.split(/\r?\n/);
    let currentKey = null;
    let multilineValue = [];
    let isMultiline = false;

    for (const line of lines) {
        const inlineArrayMatch = line.match(/^([a-z_]+):\s*\[(.*)\]$/);
        if (inlineArrayMatch) {
            const key = inlineArrayMatch[1];
            const items = inlineArrayMatch[2]
                .split(',')
                .map(s => s.trim().replace(/^["']|["']$/g, ''))
                .filter(s => s);
            data[key] = items;
            continue;
        }

        if (isMultiline && line.match(/^\s+-\s+/)) {
            multilineValue.push(line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, ''));
            continue;
        }

        if (isMultiline && !line.match(/^\s+-\s+/)) {
            data[currentKey] = multilineValue;
            isMultiline = false;
            multilineValue = [];
        }

        const keyValueMatch = line.match(/^([a-z_]+):\s*(.*)$/);
        if (keyValueMatch) {
            const key = keyValueMatch[1];
            let value = keyValueMatch[2].trim();

            if (value === '') {
                currentKey = key;
                isMultiline = true;
                multilineValue = [];
                continue;
            }

            value = value.replace(/^["']|["']$/g, '');

            if (value === 'true') value = true;
            else if (value === 'false') value = false;
            else if (/^\d+$/.test(value)) value = parseInt(value);

            data[key] = value;
        }
    }

    if (isMultiline && currentKey) {
        data[currentKey] = multilineValue;
    }

    return { data, body: body.trim() };
}

function getPostTemplate() {
    const templatePath = path.join(POSTS_DIR, '_template.html');
    if (!fs.existsSync(templatePath)) {
        console.log('⚠️  قالب المقال غير موجود');
        return null;
    }
    return fs.readFileSync(templatePath, 'utf-8');
}

function buildPostHtmlFromMarkdown(mdData, slug) {
    const template = getPostTemplate();
    if (!template) return null;

    const { data, body } = mdData;

    if (!data.title || !data.description) {
        console.log(`⚠️  مقال ناقص بيانات: ${slug}`);
        return null;
    }

    let tagsHtml = '';
    if (Array.isArray(data.tags) && data.tags.length > 0) {
        tagsHtml = data.tags
            .map(tag => `<span class="tag">${tag}</span>`)
            .join('\n        ');
    }

    let imageUrl = data.image || 'https://tools.chat-alkhaleej.com/logo.webp';
    if (imageUrl.startsWith('/')) {
        imageUrl = SITE_URL + imageUrl;
    }

    const dateIso = data.date || new Date().toISOString();
    const dateDisplay = formatArabicDate(dateIso);
    const modifiedIso = data.modified || dateIso;

    const replacements = {
        'POST_TITLE': data.title,
        'POST_DESCRIPTION': data.description,
        'POST_KEYWORDS': Array.isArray(data.tags) ? data.tags.join(', ') : '',
        'POST_AUTHOR': data.author || 'فريق شات الخليج',
        'POST_SLUG': slug,
        'POST_IMAGE': imageUrl,
        'POST_DATE': dateIso,
        'POST_MODIFIED': modifiedIso,
        'POST_DATE_DISPLAY': dateDisplay,
        'POST_READ_TIME': data.read_time || 5,
        'POST_CATEGORY': data.category || 'عام',
        'POST_CONTENT': body,
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
    const image = extractMeta(html, /<meta property="og:image" content="([^"]+)"/);
    const publishedTime = extractMeta(html, /<meta property="article:published_time" content="([^"]+)"/);
    const modifiedTime = extractMeta(html, /<meta property="article:modified_time" content="([^"]+)"/);
    const category = extractMeta(html, /<span class="article-category">[\s\S]*?<\/i>\s*([^<]+)\s*<\/span>/);

    if (!title || !description) {
        return null;
    }

    return {
        filename,
        slug: filename.replace('.html', ''),
        url: `${SITE_URL}/${POSTS_DIR}/${filename}`,
        title,
        description,
        image: image || `${SITE_URL}/images/default.jpg`,
        publishedTime,
        modifiedTime: modifiedTime || publishedTime,
        dateDisplay: formatArabicDate(publishedTime),
        category: category.trim() || 'عام'
    };
}

function processMarkdownPost(filename) {
    const filepath = path.join(POSTS_DIR, filename);
    const content = fs.readFileSync(filepath, 'utf-8');

    const parsed = parseFrontmatter(content);
    if (!parsed) {
        console.log(`⚠️  لا يمكن تحليل: ${filename}`);
        return null;
    }

    const slug = filename.replace(/\.md$/, '');
    const html = buildPostHtmlFromMarkdown(parsed, slug);
    if (!html) return null;

    const htmlFilename = slug + '.html';
    const htmlPath = path.join(POSTS_DIR, htmlFilename);
    fs.writeFileSync(htmlPath, html, 'utf-8');

    console.log(`✅ تم تحويل: ${filename} → ${htmlFilename}`);

    const { data } = parsed;
    let imageUrl = data.image || `${SITE_URL}/images/default.jpg`;
    if (imageUrl.startsWith('/')) {
        imageUrl = SITE_URL + imageUrl;
    }

    return {
        filename: htmlFilename,
        slug,
        url: `${SITE_URL}/${POSTS_DIR}/${htmlFilename}`,
        title: data.title,
        description: data.description,
        image: imageUrl,
        publishedTime: data.date,
        modifiedTime: data.modified || data.date,
        dateDisplay: formatArabicDate(data.date),
        category: data.category || 'عام'
    };
}

function getAllPosts() {
    if (!fs.existsSync(POSTS_DIR)) {
        console.log('⚠️  مجلد posts غير موجود');
        return [];
    }

    const files = fs.readdirSync(POSTS_DIR).filter(f => !f.startsWith('_'));
    const posts = [];

    const markdownFiles = files.filter(f => f.endsWith('.md'));
    for (const mdFile of markdownFiles) {
        const post = processMarkdownPost(mdFile);
        if (post) posts.push(post);
    }

    const htmlFiles = files.filter(f => f.endsWith('.html'));
    const processedSlugs = new Set(posts.map(p => p.slug));

    for (const htmlFile of htmlFiles) {
        const slug = htmlFile.replace('.html', '');
        if (processedSlugs.has(slug)) continue;

        const post = parseHtmlPost(htmlFile);
        if (post) posts.push(post);
    }

    posts.sort((a, b) => {
        const dateA = new Date(a.publishedTime || 0).getTime();
        const dateB = new Date(b.publishedTime || 0).getTime();
        return dateB - dateA;
    });

    console.log(`📚 إجمالي المقالات: ${posts.length}`);
    return posts;
}

function buildPostCard(post) {
    return `
            <a href="/${POSTS_DIR}/${post.filename}" class="post-card-link">
                <article class="post-card">
                    <img src="${post.image}" alt="${post.title}" class="post-card-img" loading="lazy" />
                    <div class="post-card-body">
                        <div class="post-card-date">
                            <i class="fas fa-calendar"></i>
                            ${post.dateDisplay}
                        </div>
                        <h3 class="post-card-title">${post.title}</h3>
                        <p class="post-card-desc">${post.description}</p>
                        <span class="post-card-read">
                            اقرأ المزيد
                            <i class="fas fa-arrow-left"></i>
                        </span>
                    </div>
                </article>
            </a>`;
}

function updateIndex(posts) {
    const indexPath = 'index.html';
    if (!fs.existsSync(indexPath)) {
        console.log('⚠️  index.html غير موجود');
        return;
    }

    let html = fs.readFileSync(indexPath, 'utf-8');

    let postsSection;
    if (posts.length === 0) {
        postsSection = `
        <div class="no-posts-yet">
            <i class="fas fa-feather-pointed"></i>
            <h3 style="color: var(--primary); margin-bottom: 10px;">لا توجد مقالات بعد</h3>
            <p>سيتم عرض أحدث المقالات هنا تلقائياً بعد نشر أول مقال.</p>
        </div>`;
    } else {
        const latestPosts = posts.slice(0, POSTS_PER_HOMEPAGE);
        postsSection = `
        <div class="latest-posts-grid">
${latestPosts.map(buildPostCard).join('\n')}
        </div>`;
    }

    const regex = /<!-- POSTS_START -->[\s\S]*?<!-- POSTS_END -->/;
    const replacement = `<!-- POSTS_START -->${postsSection}
        <!-- POSTS_END -->`;

    if (regex.test(html)) {
        html = html.replace(regex, replacement);
        fs.writeFileSync(indexPath, html, 'utf-8');
        console.log(`✅ تم تحديث index.html بـ ${Math.min(posts.length, POSTS_PER_HOMEPAGE)} مقال`);
    }
}

function buildSitemap(posts) {
    const today = new Date().toISOString().split('T')[0];
    let urls = [
        { loc: `${SITE_URL}/`, lastmod: today, changefreq: 'daily', priority: '1.0' },
        { loc: `${SITE_URL}/archive.html`, lastmod: today, changefreq: 'daily', priority: '0.8' }
    ];

    posts.forEach(post => {
        urls.push({
            loc: post.url,
            lastmod: (post.modifiedTime || post.publishedTime || today).split('T')[0],
            changefreq: 'weekly',
            priority: '0.7'
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
    console.log(`✅ تم بناء sitemap.xml (${urls.length} URLs)`);
}

function buildRss(posts) {
    const buildDate = new Date().toUTCString();
    const latestPosts = posts.slice(0, 20);

    const items = latestPosts.map(post => {
        const pubDate = post.publishedTime ? new Date(post.publishedTime).toUTCString() : buildDate;
        return `        <item>
            <title><![CDATA[${post.title}]]></title>
            <link>${post.url}</link>
            <guid isPermaLink="true">${post.url}</guid>
            <description><![CDATA[${post.description}]]></description>
            <pubDate>${pubDate}</pubDate>
            <category>${post.category}</category>
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
    console.log(`✅ تم بناء rss.xml (${latestPosts.length} مقال)`);
}

function buildArchive(posts) {
    let archiveContent;
    if (posts.length === 0) {
        archiveContent = `
        <div class="no-posts-yet">
            <i class="fas fa-feather-pointed"></i>
            <h3 style="color: var(--primary); margin-bottom: 10px;">لا توجد مقالات بعد</h3>
            <p>سيتم عرض المقالات هنا بعد النشر.</p>
        </div>`;
    } else {
        archiveContent = `
        <div class="latest-posts-grid">
${posts.map(buildPostCard).join('\n')}
        </div>`;
    }

    const archiveHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <link rel="icon" type="image/webp" href="https://tools.chat-alkhaleej.com/logo.webp">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>أرشيف المقالات | مدونة شات الخليج</title>
    <meta name="description" content="تصفّح جميع مقالات مدونة شات الخليج: مقالات عربية متنوعة عن الترندات والألعاب والتقنية والسوشال ميديا.">

    <link rel="canonical" href="${SITE_URL}/archive.html" />
    <link rel="alternate" type="application/rss+xml" title="مدونة الخليج RSS" href="${SITE_URL}/rss.xml" />

    <meta property="og:type" content="website" />
    <meta property="og:url" content="${SITE_URL}/archive.html" />
    <meta property="og:title" content="أرشيف المقالات | مدونة شات الخليج" />
    <meta property="og:description" content="تصفّح جميع مقالات مدونة شات الخليج" />
    <meta property="og:image" content="https://tools.chat-alkhaleej.com/logo.webp" />
    <meta property="og:locale" content="ar_SA" />

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

    <style>
        :root { --primary: #450C0C; --accent: #ffd86b; --white: #ffffff; --bg: #f8fafc; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; background-color: var(--bg); line-height: 1.6; color: #1e293b; padding-top: 75px; }

        .navbar { position: fixed; top: 0; right: 0; left: 0; z-index: 1000; background: rgba(69, 12, 12, 0.97); backdrop-filter: blur(6px); border-bottom: 3px solid var(--accent); padding: 10px 0; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
        .nav-container { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; }
        .nav-logo img { height: 45px; }
        .nav-links { display: flex; gap: 10px; list-style: none; }
        .nav-links a { color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 8px 14px; border-radius: 25px; transition: 0.3s; display: flex; align-items: center; gap: 7px; }
        .nav-links a i { color: var(--accent); }
        .nav-links a:hover, .nav-links a.active { background: var(--accent); color: var(--primary); }
        .nav-links a:hover i, .nav-links a.active i { color: var(--primary); }
        .nav-toggle { display: none; color: var(--accent); font-size: 24px; cursor: pointer; }

        @media (max-width: 850px) {
            .nav-links { position: fixed; top: 68px; right: -100%; width: 100%; background: var(--primary); flex-direction: column; padding: 20px; transition: 0.4s; text-align: center; border-bottom: 2px solid var(--accent); }
            .nav-links.active { right: 0; }
            .nav-toggle { display: block; }
        }

        header { background: linear-gradient(135deg, var(--primary) 0%, #631212 100%); padding: 50px 20px; text-align: center; border-bottom: 6px solid var(--accent); clip-path: polygon(0 0, 100% 0, 100% 95%, 0 100%); color: #fff; }
        header h1 { font-size: 32px; font-weight: 900; }
        header p { font-size: 16px; opacity: 0.9; margin-top: 10px; }

        .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
        .breadcrumb { background: var(--white); padding: 14px 22px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin-bottom: 25px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
        .breadcrumb a { color: var(--primary); text-decoration: none; font-weight: 700; }
        .breadcrumb span { color: #64748b; }

        .archive-stats { background: linear-gradient(135deg, #fffdf5 0%, #fff8e1 100%); border: 2px solid var(--accent); padding: 20px 25px; border-radius: 14px; margin-bottom: 30px; text-align: center; color: var(--primary); font-weight: 700; font-size: 16px; }
        .archive-stats strong { font-size: 22px; }

        .latest-posts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 25px; margin-bottom: 30px; }
        .post-card { background: var(--white); border-radius: 16px; overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,0.06); transition: all 0.3s ease; border-top: 5px solid var(--accent); display: flex; flex-direction: column; }
        .post-card:hover { transform: translateY(-8px); box-shadow: 0 18px 35px rgba(69, 12, 12, 0.15); border-top-color: var(--primary); }
        .post-card-link { text-decoration: none; color: inherit; display: flex; flex-direction: column; height: 100%; }
        .post-card-img { width: 100%; height: 180px; object-fit: cover; display: block; }
        .post-card-body { padding: 22px 20px; display: flex; flex-direction: column; flex: 1; }
        .post-card-date { font-size: 13px; color: #64748b; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
        .post-card-date i { color: var(--accent); }
        .post-card-title { font-size: 18px; font-weight: 800; color: var(--primary); margin-bottom: 12px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .post-card-desc { font-size: 14.5px; color: #475569; line-height: 1.7; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 15px; flex: 1; }
        .post-card-read { color: var(--primary); font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 6px; margin-top: auto; }
        .post-card:hover .post-card-read i { transform: translateX(-5px); }
        .post-card-read i { transition: 0.3s; }

        .no-posts-yet { background: var(--white); padding: 50px 30px; border-radius: 16px; text-align: center; color: #64748b; border: 2px dashed #e2e8f0; }
        .no-posts-yet i { font-size: 50px; color: var(--accent); margin-bottom: 15px; }

        footer { text-align: center; padding: 50px 20px; color: #64748b; font-size: 15px; border-top: 1px solid #e2e8f0; background: #fff; margin-top: 40px; }
        .footer-nav { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; max-width: 550px; margin: 0 auto 30px; }
        .footer-nav a { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 12px; text-decoration: none; color: var(--primary); font-weight: 700; font-size: 14px; transition: 0.3s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .footer-nav a i { color: var(--accent); font-size: 16px; }
        .footer-nav a:hover { background: var(--primary); color: #fff; border-color: var(--primary); }
        .nav-vip { border: 1.5px solid var(--accent) !important; background: #fffdf5 !important; }

        @media (max-width: 900px) { .latest-posts-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .latest-posts-grid { grid-template-columns: 1fr; } .footer-nav { grid-template-columns: 1fr; } header h1 { font-size: 24px; } }
    </style>
</head>
<body>

<nav class="navbar" role="navigation">
    <div class="nav-container">
        <a href="https://chat-alkhaleej.com/" class="nav-logo">
            <img src="https://tools.chat-alkhaleej.com/logo.webp" alt="شات الخليج" height="45">
        </a>
        <ul class="nav-links" id="navLinks">
            <li><a href="https://chat-alkhaleej.com/"><i class="fas fa-home"></i> الرئيسية</a></li>
            <li><a href="https://chat-alkhaleej.com/rooms/"><i class="fas fa-comments"></i> دليل الغرف</a></li>
            <li><a href="https://blog.chat-alkhaleej.com/" class="active"><i class="fas fa-newspaper"></i> المدونة</a></li>
            <li><a href="https://tools.chat-alkhaleej.com/"><i class="fas fa-tools"></i> الأدوات</a></li>
            <li><a href="https://games.chat-alkhaleej.com/"><i class="fas fa-gamepad"></i> الألعاب</a></li>
        </ul>
        <div class="nav-toggle" onclick="document.getElementById('navLinks').classList.toggle('active')"><i class="fas fa-bars"></i></div>
    </div>
</nav>

<header>
    <h1>📚 أرشيف جميع المقالات</h1>
    <p>تصفح كل ما نشرناه في مدونة شات الخليج</p>
</header>

<div class="container">

    <nav class="breadcrumb">
        <a href="https://chat-alkhaleej.com/">الرئيسية</a>
        <span>›</span>
        <a href="${SITE_URL}/">المدونة</a>
        <span>›</span>
        <span>الأرشيف</span>
    </nav>

    <div class="archive-stats">
        إجمالي المقالات المنشورة: <strong>${posts.length}</strong> مقال
    </div>
${archiveContent}

</div>

<footer>
    <div class="footer-nav">
        <a href="https://chat-alkhaleej.com/chat-support-gulf.html"><i class="fas fa-headset"></i> الدعم الفني</a>
        <a href="https://chat-alkhaleej.com/chat-faq-gulf.html"><i class="fas fa-question-circle"></i> الأسئلة الشائعة</a>
        <a href="https://chat-alkhaleej.com/chat-rules-gulf.html"><i class="fas fa-gavel"></i> القوانين</a>
        <a href="https://chat-alkhaleej.com/chat-vip-gulf.html" class="nav-vip"><i class="fas fa-gem"></i> اشتراكات VIP</a>
    </div>
    <p>حقوق النشر © 2026 موقع شات الخليج | دردشة الخليج | نجمع العرب تحت سقف واحد بصداقة وأمان.</p>
</footer>

</body>
</html>`;

    fs.writeFileSync('archive.html', archiveHtml, 'utf-8');
    console.log(`✅ تم بناء archive.html (${posts.length} مقال)`);
}

function buildRobots() {
    const content = `User-agent: *
Allow: /

# لا تفهرس القوالب
Disallow: /posts/_template.html

# لا تفهرس لوحة الأدمن
Disallow: /admin/

# Sitemap
Sitemap: ${SITE_URL}/sitemap.xml
`;

    fs.writeFileSync('robots.txt', content, 'utf-8');
    console.log('✅ تم بناء robots.txt');
}

// ===== التنفيذ =====
console.log('🚀 بدء بناء مدونة شات الخليج (v2)...\n');

const posts = getAllPosts();
updateIndex(posts);
buildArchive(posts);
buildSitemap(posts);
buildRss(posts);
buildRobots();

console.log('\n✨ اكتمل البناء بنجاح!');
console.log(`📊 إجمالي المقالات: ${posts.length}`);
