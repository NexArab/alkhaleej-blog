/**
 * 🤖 سكربت بناء مدونة شات الخليج التلقائي
 *
 * هذا السكربت يشتغل تلقائياً عند نشر أي مقال جديد:
 * 1. يقرأ كل المقالات من مجلد /posts/
 * 2. يستخرج البيانات من كل مقال (العنوان، الوصف، الصورة، التاريخ، التصنيف)
 * 3. يحدّث index.html (يضيف قسم أحدث المقالات)
 * 4. يبني archive.html (صفحة كل المقالات)
 * 5. يبني sitemap.xml
 * 6. يبني rss.xml
 */

const fs = require('fs');
const path = require('path');

// ===== الإعدادات =====
const SITE_URL = 'https://blog.chat-alkhaleej.com';
const SITE_NAME = 'مدونة شات الخليج';
const SITE_DESCRIPTION = 'مدونة شات الخليج: مقالات عربية متنوعة عن الترندات والألعاب والتقنية والسوشال ميديا والحياة الخليجية والمحتوى الترفيهي.';
const POSTS_PER_HOMEPAGE = 6; // عدد المقالات في الصفحة الرئيسية
const POSTS_DIR = 'posts';

// ===== الأدوات المساعدة =====

/**
 * استخراج قيمة من HTML باستخدام Regex
 */
function extractMeta(html, pattern) {
    const match = html.match(pattern);
    return match ? match[1].trim() : '';
}

/**
 * تنسيق التاريخ بالعربي
 */
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
 * قراءة وتحليل مقال واحد
 */
function parsePost(filename) {
    const filepath = path.join(POSTS_DIR, filename);
    const html = fs.readFileSync(filepath, 'utf-8');

    // استخراج البيانات
    const title = extractMeta(html, /<meta property="og:title" content="([^"]+)"/);
    const description = extractMeta(html, /<meta name="description" content="([^"]+)"/);
    const image = extractMeta(html, /<meta property="og:image" content="([^"]+)"/);
    const publishedTime = extractMeta(html, /<meta property="article:published_time" content="([^"]+)"/);
    const modifiedTime = extractMeta(html, /<meta property="article:modified_time" content="([^"]+)"/);
    const category = extractMeta(html, /<span class="article-category">[\s\S]*?<\/i>\s*([^<]+)\s*<\/span>/);

    // التحقق من الحقول الأساسية
    if (!title || !description) {
        console.log(`⚠️  تخطي: ${filename} (ناقص بيانات)`);
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

/**
 * قراءة كل المقالات
 */
function getAllPosts() {
    if (!fs.existsSync(POSTS_DIR)) {
        console.log('⚠️  مجلد posts غير موجود');
        return [];
    }

    const files = fs.readdirSync(POSTS_DIR)
        .filter(f => f.endsWith('.html') && !f.startsWith('_')); // تجاهل القوالب

    const posts = files
        .map(parsePost)
        .filter(p => p !== null)
        .sort((a, b) => {
            // ترتيب من الأحدث للأقدم
            const dateA = new Date(a.publishedTime || 0).getTime();
            const dateB = new Date(b.publishedTime || 0).getTime();
            return dateB - dateA;
        });

    console.log(`📚 تم العثور على ${posts.length} مقال`);
    return posts;
}

/**
 * بناء بطاقة مقال HTML
 */
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

/**
 * تحديث index.html بآخر المقالات
 */
function updateIndex(posts) {
    const indexPath = 'index.html';
    if (!fs.existsSync(indexPath)) {
        console.log('⚠️  index.html غير موجود');
        return;
    }

    let html = fs.readFileSync(indexPath, 'utf-8');

    // بناء قسم المقالات
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

    // استبدال المحتوى بين POSTS_START و POSTS_END
    const regex = /<!-- POSTS_START -->[\s\S]*?<!-- POSTS_END -->/;
    const replacement = `<!-- POSTS_START -->${postsSection}
        <!-- POSTS_END -->`;

    if (regex.test(html)) {
        html = html.replace(regex, replacement);
        fs.writeFileSync(indexPath, html, 'utf-8');
        console.log(`✅ تم تحديث index.html بـ ${Math.min(posts.length, POSTS_PER_HOMEPAGE)} مقال`);
    } else {
        console.log('⚠️  لم يتم العثور على علامات POSTS_START/END في index.html');
    }
}

/**
 * بناء sitemap.xml
 */
function buildSitemap(posts) {
    const today = new Date().toISOString().split('T')[0];

    let urls = [
        // الصفحات الأساسية
        { loc: `${SITE_URL}/`, lastmod: today, changefreq: 'daily', priority: '1.0' },
        { loc: `${SITE_URL}/archive.html`, lastmod: today, changefreq: 'daily', priority: '0.8' }
    ];

    // إضافة كل مقال
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

/**
 * بناء rss.xml
 */
function buildRss(posts) {
    const buildDate = new Date().toUTCString();
    const latestPosts = posts.slice(0, 20); // آخر 20 مقال

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

/**
 * بناء صفحة الأرشيف (archive.html)
 */
function buildArchive(posts) {
    // قراءة index.html كقالب للأرشيف
    const indexHtml = fs.readFileSync('index.html', 'utf-8');

    // بناء قائمة كل المقالات
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

/**
 * بناء robots.txt
 */
function buildRobots() {
    const content = `User-agent: *
Allow: /

# لا تفهرس القوالب
Disallow: /posts/_template.html

# Sitemap
Sitemap: ${SITE_URL}/sitemap.xml
`;

    fs.writeFileSync('robots.txt', content, 'utf-8');
    console.log('✅ تم بناء robots.txt');
}

// ===== التنفيذ =====
console.log('🚀 بدء بناء مدونة شات الخليج...\n');

const posts = getAllPosts();
updateIndex(posts);
buildArchive(posts);
buildSitemap(posts);
buildRss(posts);
buildRobots();

console.log('\n✨ اكتمل البناء بنجاح!');
console.log(`📊 إجمالي المقالات: ${posts.length}`);
