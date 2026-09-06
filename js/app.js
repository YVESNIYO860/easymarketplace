const DRAWER_SETTINGS_KEY = 'isokoHubDrawerSettings';
const ADMIN_EMAIL = 'yvesniyonkuru2022@gmail.com';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAdminUser(user = getCurrentUser()) {
  const email = user?.email || '';
  return Boolean(user?.role === 'admin' || email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

function getDrawerUiSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(DRAWER_SETTINGS_KEY) || '{}');
    return {
      theme: ['light', 'dark'].includes(stored.theme) ? stored.theme : 'light',
      compactMode: Boolean(stored.compactMode),
      reducedMotion: Boolean(stored.reducedMotion),
      highContrast: Boolean(stored.highContrast)
    };
  } catch (err) {
    return { theme: 'light', compactMode: false, reducedMotion: false, highContrast: false };
  }
}

function applyDrawerUiSettings(settings = getDrawerUiSettings()) {
  const resolvedTheme = ['light', 'dark'].includes(settings.theme) ? settings.theme : 'light';

  document.body.dataset.theme = resolvedTheme;
  document.documentElement.dataset.theme = resolvedTheme;
  document.body.classList.toggle('compact-mode', Boolean(settings.compactMode));
  document.body.classList.toggle('reduced-motion', Boolean(settings.reducedMotion));
  document.body.classList.toggle('high-contrast', Boolean(settings.highContrast));

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.content = resolvedTheme === 'dark' ? '#020617' : '#0f172a';
  }
}

function saveDrawerUiSettings(settings) {
  localStorage.setItem(DRAWER_SETTINGS_KEY, JSON.stringify(settings));
  applyDrawerUiSettings(settings);
}

// Immediate offline guard: show an overlay as early as possible when offline
(function () {
  try {
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
      const overlay = document.createElement('div');
      overlay.id = 'offline-overlay-immediate';
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '2147483647';
      overlay.style.background = 'rgba(3,7,18,0.98)';
      overlay.style.color = '#fff';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.fontFamily = 'sans-serif';
      overlay.innerHTML = `
        <div style="max-width:520px;text-align:center;padding:24px">
          <img src="assets/logo.png" alt="IsokoHub" style="width:80px;height:80px;margin-bottom:12px;opacity:.95">
          <h2 style="margin:6px 0 12px;font-size:20px">You're offline</h2>
          <p style="margin:0 0 18px;opacity:.95">IsokoHub requires an internet connection to load. Please reconnect to continue.</p>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
            <button id="offline-immediate-retry" style="padding:10px 16px;border-radius:6px;border:0;background:#2563eb;color:#fff">Retry</button>
            <button id="offline-immediate-continue" style="padding:10px 16px;border-radius:6px;border:1px solid #334155;background:transparent;color:#fff">Continue offline</button>
          </div>
        </div>
      `;

      const appendOverlay = () => {
        try {
          if (!document.body) return document.addEventListener('DOMContentLoaded', appendOverlay);
          document.body.appendChild(overlay);
        } catch (e) {}
      };
      appendOverlay();

      const retryBtn = () => document.getElementById('offline-immediate-retry');
      const continueBtn = () => document.getElementById('offline-immediate-continue');

      const wired = setInterval(() => {
        if (retryBtn()) {
          clearInterval(wired);
          retryBtn().addEventListener('click', () => {
            if (navigator.onLine) {
              overlay.remove();
              window.location.reload();
            } else {
              retryBtn().textContent = 'Still offline';
              setTimeout(() => { if (retryBtn()) retryBtn().textContent = 'Retry'; }, 1400);
            }
          });
          continueBtn().addEventListener('click', () => {
            overlay.remove();
          });
        }
      }, 100);

      window.addEventListener('online', () => {
        try { overlay.remove(); } catch (e) {}
        window.location.reload();
      });
    }
  } catch (err) {
    // ignore
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  setupConsoleFilter();
  // If offline, show offline UI and skip normal initialization
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    showOfflineOverlay();
    return;
  }

  addDependencies();
  setupLoaderLogic();
  ensurePwaMetaTags();
  registerServiceWorker();
  setupInstallPrompt();
  applyDrawerUiSettings(getDrawerUiSettings());

  const siteHeaderRoot = document.getElementById('site-header-root');
  if (siteHeaderRoot) {
    siteHeaderRoot.innerHTML = '';
  }

  renderNavbar();
  setupSupabaseAuthRefresh();
  renderFooter();
  setupStickyHeader();

  if (typeof logSiteVisit === 'function') {
    logSiteVisit().catch(() => {});
  }
});

function setupConsoleFilter() {
  try {
    if (!window || window.location == null) return;
    const hostname = window.location.hostname || '';
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
    // Allow verbose logs on local dev only
    if (isLocal) return;

    window.ISOKO_DEBUG = window.ISOKO_DEBUG === true;

    const originalLog = console.log.bind(console);
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);

    const sensitivePatterns = [
      /supabase/i,
      /site_visits/i,
      /foxfyzytxcuxsncaawwb\.supabase\.co/i,
      /Supabase client/i,
      /Could not find the table/i
    ];

    function shouldSuppress(args) {
      if (window.ISOKO_DEBUG) return false;
      try {
        const joined = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        return sensitivePatterns.some((rx) => rx.test(joined));
      } catch (e) {
        return false;
      }
    }

    console.log = function (...args) {
      if (shouldSuppress(args)) return;
      originalLog(...args);
    };

    console.warn = function (...args) {
      if (shouldSuppress(args)) return;
      originalWarn(...args);
    };

    console.error = function (...args) {
      if (shouldSuppress(args)) return;
      originalError(...args);
    };
  } catch (err) {
    // ignore failures setting up console filter
  }
}

function showOfflineOverlay() {
  if (document.getElementById('offline-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'offline-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(3,7,18,0.95)';
  overlay.style.color = '#fff';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '99999';
  overlay.innerHTML = `
    <div style="max-width:520px;text-align:center;padding:24px">
      <img src="assets/logo.png" alt="IsokoHub" style="width:80px;height:80px;margin-bottom:12px;opacity:.95">
      <h2 style="margin:6px 0 12px;font-size:20px">You're offline</h2>
      <p style="margin:0 0 18px;opacity:.9">IsokoHub needs an internet connection to access live data. Please reconnect to continue.</p>
      <div style="display:flex;gap:8px;justify-content:center">
        <button id="offline-retry" style="padding:10px 16px;border-radius:6px;border:0;background:#2563eb;color:#fff">Retry</button>
        <button id="offline-continue" style="padding:10px 16px;border-radius:6px;border:1px solid #334155;background:transparent;color:#fff">Continue offline</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('offline-retry').addEventListener('click', () => {
    if (navigator.onLine) {
      overlay.remove();
      window.location.reload();
    } else {
      // quick visual feedback
      (document.getElementById('offline-retry')).textContent = 'Still offline';
      setTimeout(() => { (document.getElementById('offline-retry')).textContent = 'Retry'; }, 1400);
    }
  });

  document.getElementById('offline-continue').addEventListener('click', () => {
    overlay.remove();
  });

  window.addEventListener('online', () => {
    const el = document.getElementById('offline-overlay');
    if (el) el.remove();
  });
  window.addEventListener('offline', () => {
    if (!document.getElementById('offline-overlay')) showOfflineOverlay();
  });
}

function setupSupabaseAuthRefresh() {
  if (!window.supabase || !supabase?.auth || typeof supabase.auth.onAuthStateChange !== 'function') {
    return;
  }

  supabase.auth.onAuthStateChange((event, session) => {
    console.log('App auth state changed:', event);
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
      if (typeof renderNavbar === 'function') {
        renderNavbar();
      } else {
        window.location.reload();
      }
    }
  });
}

function ensurePwaMetaTags() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = 'manifest.json';
    document.head.appendChild(manifestLink);
  }

  if (!document.querySelector('meta[name="theme-color"]')) {
    const themeMeta = document.createElement('meta');
    themeMeta.name = 'theme-color';
    themeMeta.content = '#0f172a';
    document.head.appendChild(themeMeta);
  }

  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    const appleCapable = document.createElement('meta');
    appleCapable.name = 'apple-mobile-web-app-capable';
    appleCapable.content = 'yes';
    document.head.appendChild(appleCapable);
  }

  if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
    const mobileCapable = document.createElement('meta');
    mobileCapable.name = 'mobile-web-app-capable';
    mobileCapable.content = 'yes';
    document.head.appendChild(mobileCapable);
  }

  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const appleIcon = document.createElement('link');
    appleIcon.rel = 'apple-touch-icon';
    appleIcon.href = 'assets/icon-192.png';
    document.head.appendChild(appleIcon);
  }
}

let pwaDeferredPrompt = null;
let installPromptDismissed = false;
const INSTALL_PROMPT_DISMISS_KEY = 'isokoHubInstallPromptDismissed';

function setInstallUiState(isInstalling = false) {
  const installButtons = document.querySelectorAll('.install-nav-btn, .install-app-primary');
  installButtons.forEach((button) => {
    button.disabled = isInstalling;

    if (button.classList.contains('install-nav-btn')) {
      button.innerHTML = isInstalling
        ? '<i class="fa-solid fa-spinner fa-spin"></i><strong>Installing...</strong>'
        : '<i class="fa-solid fa-download"></i><strong>Install</strong>';
    }

    if (button.classList.contains('install-app-primary')) {
      button.textContent = isInstalling ? 'Installing...' : (button.dataset.defaultLabel || 'Install');
    }
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
    if (isLocalhost) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent);
}

function isIOSDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;
}

function getInstallGuide() {
  if (isIOSDevice()) {
    return {
      title: 'Install on iPhone',
      message: 'Tap Share and choose Add to Home Screen to keep IsokoHub like a real app.',
      actionLabel: 'Open guide',
      steps: [
        'Open IsokoHub in Safari',
        'Tap the Share button',
        'Choose Add to Home Screen'
      ]
    };
  }

  if (isAndroidDevice()) {
    return {
      title: 'Install on Android',
      message: 'Open the browser menu and tap Install app or Add to Home screen.',
      actionLabel: 'Install now',
      steps: [
        'Open IsokoHub in Chrome or Edge',
        'Tap the menu button',
        'Choose Install app or Add to Home screen'
      ]
    };
  }

  return {
    title: 'Install on desktop',
    message: 'Use your browser menu to install IsokoHub and launch it like an app.',
    actionLabel: 'Install now',
    steps: [
      'Open IsokoHub in Chrome, Edge or Firefox',
      'Open the browser menu',
      'Choose Install IsokoHub'
    ]
  };
}

function closeInstallGuideModal() {
  const modal = document.getElementById('install-guide-modal');
  if (modal) modal.remove();
}

function showInstallGuideModal() {
  if (document.getElementById('install-guide-modal')) return;

  const guide = getInstallGuide();
  const modal = document.createElement('div');
  modal.id = 'install-guide-modal';
  modal.className = 'install-guide-modal';
  modal.innerHTML = `
    <div class="install-guide-card">
      <button class="install-guide-close" onclick="closeInstallGuideModal()" aria-label="Close install guide">×</button>
      <div class="install-guide-icon">
        <i class="fa-solid fa-download"></i>
      </div>
      <h3>${guide.title}</h3>
      <p>${guide.message}</p>
      <ol>
        ${guide.steps.map((step) => `<li>${step}</li>`).join('')}
      </ol>
      <div class="install-guide-actions">
        <button class="install-guide-secondary" onclick="closeInstallGuideModal()">Maybe later</button>
        <button class="install-guide-primary" onclick="showInstallPrompt()">${guide.actionLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function closeAdPopup() {
  const modal = document.getElementById('ad-popup-modal');
  if (modal) modal.remove();
}

function dismissAdPopupPermanently(storageKey = 'isokoHubAdPopupDismissed') {
  localStorage.setItem(storageKey, 'true');
  closeAdPopup();
}

function showAdPopup(options = {}) {
  if (document.getElementById('ad-popup-modal')) return;

  const {
    title = 'Sponsored Deal',
    message = 'Discover our latest featured offer and get special pricing today.',
    imageUrl = 'assets/logo.png',
    ctaText = 'Shop Now',
    ctaUrl = 'products.html',
    dismissStorageKey = 'isokoHubAdPopupDismissed'
  } = options;

  const modal = document.createElement('div');
  modal.id = 'ad-popup-modal';
  modal.className = 'install-guide-modal';
  modal.innerHTML = `
    <div class="install-guide-card ad-popup-card">
      <button class="install-guide-close" onclick="closeAdPopup()" aria-label="Close ad popup">×</button>
      <div class="install-guide-icon" style="background: #2563eb; color: #fff;">
        <i class="fa-solid fa-bullhorn"></i>
      </div>
      <h3>${escapeHtml(title)}</h3>
      <div class="ad-popup-media">
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">
      </div>
      <p>${escapeHtml(message)}</p>
      <div class="install-guide-actions ad-popup-actions">
        <button class="install-guide-secondary" onclick="closeAdPopup()">Close</button>
        <button class="install-guide-secondary" onclick="dismissAdPopupPermanently('${escapeHtml(dismissStorageKey)}')">Don't show again</button>
        <a href="${escapeHtml(ctaUrl)}" class="install-guide-primary" onclick="closeAdPopup()">${escapeHtml(ctaText)}</a>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function setupInstallPrompt() {
  const isDismissed = localStorage.getItem(INSTALL_PROMPT_DISMISS_KEY) === 'true';
  installPromptDismissed = isDismissed;

  if (isInStandaloneMode()) {
    installPromptDismissed = true;
    hideInstallBanner();
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pwaDeferredPrompt = event;
  });

  window.addEventListener('appinstalled', () => {
    hideInstallBanner();
  });

  window.showInstallPrompt = async () => {
    closeInstallGuideModal();
    setInstallUiState(true);

    if (pwaDeferredPrompt) {
      try {
        setTimeout(() => {
          if (pwaDeferredPrompt) {
            pwaDeferredPrompt.prompt();
          }
        }, 250);

        const choice = await pwaDeferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          hideInstallBanner();
          closeInstallGuideModal();
        }
      } catch (error) {
        console.warn('Install prompt failed:', error);
      }
      pwaDeferredPrompt = null;
    } else {
      showInstallGuideModal();
    }

    setTimeout(() => setInstallUiState(false), 1400);
  };

  window.requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      const guide = getInstallGuide();
      showInstallBanner(true, guide.message, guide.title, guide.actionLabel);
      return;
    }

    if (Notification.permission === 'granted') {
      showInstallBanner(true, 'Notifications are already enabled for IsokoHub.', 'Alerts ready', 'Continue');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      showInstallBanner(true, 'Notifications are now enabled. You will get updates from IsokoHub.', 'Alerts ready', 'Continue');
    } else {
      showInstallBanner(true, 'Notifications were not enabled. You can still install the app and use it normally.', 'Alerts skipped', 'Continue');
    }
  };

  window.dismissInstallPrompt = () => {
    installPromptDismissed = true;
    localStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, 'true');
    hideInstallBanner();
    closeInstallGuideModal();
  };
}

function showInstallBanner(isFallback = false, message = 'Use IsokoHub as a quick app on your device.', title = 'Get the app view', actionLabel = 'Install') {
  if (document.getElementById('pwa-install-banner') || isInStandaloneMode() || installPromptDismissed) return;

  const guide = getInstallGuide();
  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.innerHTML = `
    <div class="install-app-badge">
      <img src="assets/logo.png" alt="IsokoHub logo">
    </div>
    <div class="install-app-content">
      <div class="install-app-title">${title}</div>
      <div class="install-app-copy">${message || guide.message}</div>
      <div class="install-app-actions">
        <button class="install-app-secondary" onclick="requestNotificationPermission()">Notify me</button>
        <button class="install-app-primary" onclick="showInstallPrompt()">${actionLabel}</button>
      </div>
    </div>
    <button class="install-app-close" onclick="dismissInstallPrompt()" aria-label="Close install prompt">×</button>
  `;
  document.body.appendChild(banner);
}

window.addEventListener('load', () => {
  const footerInstallLink = document.querySelector('.footer-install-col a[href="#"]');
  if (footerInstallLink) {
    footerInstallLink.addEventListener('click', (event) => {
      event.preventDefault();
      showInstallPrompt();
    });
  }
});

function hideInstallBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.remove();
}


const SUPPORT_EMAIL = 'yvesniyonkuru2022@gmail.com';

function openSupportMail(subject = 'IsokoHub Support', body = '', email = SUPPORT_EMAIL) {
  const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoLink;
}

function openSupportPage() {
  const isSupportPage = window.location.pathname.includes('support.html');
  if (isSupportPage) return;
  window.open('support.html', '_blank', 'noopener,noreferrer');
}

function setupStickyHeader() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  let ticking = false;
  let lastScrollY = window.scrollY;
  const mobileBottomNav = document.querySelector('.mobile-bottom-nav');

  const updateHeaderState = () => {
    const currentScrollY = window.scrollY;
    const shouldScroll = currentScrollY > 8;
    const shouldHide = currentScrollY > 70 && currentScrollY > lastScrollY + 4;
    const shouldShow = currentScrollY < lastScrollY - 4 || currentScrollY <= 20;

    navbar.classList.toggle('scrolled', shouldScroll);
    navbar.classList.toggle('is-hidden', shouldHide && !shouldShow);

    if (mobileBottomNav) {
      const isMobile = window.innerWidth <= 768;
      mobileBottomNav.classList.toggle('is-hidden', isMobile && shouldHide && !shouldShow);
    }

    const isSmall = window.innerWidth <= 480;
    const isTablet = window.innerWidth <= 768;
    const baseOffset = isSmall ? 92 : isTablet ? 96 : 100;
    const scrolledOffset = isSmall ? 72 : isTablet ? 76 : 80;
    const nextOffset = shouldScroll ? scrolledOffset : baseOffset;

    document.documentElement.style.setProperty('--header-offset', `${nextOffset}px`);
    document.documentElement.style.setProperty('--header-offset-scrolled', `${scrolledOffset}px`);
    lastScrollY = currentScrollY;
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(updateHeaderState);
      ticking = true;
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (!ticking) {
      window.requestAnimationFrame(updateHeaderState);
      ticking = true;
    }
  }, { passive: true });

  updateHeaderState();
}

function setupLoaderLogic() {
  const navEntry = performance.getEntriesByType("navigation")[0];
  const isReload = navEntry && navEntry.type === "reload";
  const hasSeenLoader = sessionStorage.getItem('loaderSeen');

  // Keep the normal app shell responsive on first load, but do not show a
  // splash-style intro animation before the site becomes usable.
  if (!hasSeenLoader || isReload) {
    sessionStorage.setItem('loaderSeen', 'true');
    hideStartupLoader();
  }
}

function showAppLoader(message = 'Loading IsokoHub...') {
  if (document.getElementById('app-data-loader')) return;
  renderDataLoader(message);
}

function hideAppLoader() {
  const loader = document.getElementById('app-data-loader');
  if (!loader) return;
  loader.classList.add('hidden');
  setTimeout(() => loader.remove(), 700);
}

function hideStartupLoader() {
  const loader = document.getElementById('app-startup-loader');
  if (!loader) return;
  loader.classList.add('hidden');
  setTimeout(() => loader.remove(), 700);
}

function addDependencies() {
  if (!document.getElementById('fontawesome-css')) {
    const link = document.createElement('link');
    link.id = 'fontawesome-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(link);
  }
}

function renderStartupLoader() {
  const loaderHTML = `
    <div id="app-startup-loader" class="app-loader-overlay" role="status" aria-live="polite">
      <div class="loader-card">
        <div class="loader-visual" aria-hidden="true">
          <div class="loader-ring"></div>
          <div class="loader-core">
            <img src="assets/logo.png" alt="">
          </div>
        </div>
        <div class="loader-title">IsokoHub</div>
        <div class="loader-dots" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div class="loader-subtext">Preparing your marketplace experience</div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('afterbegin', loaderHTML);
}

function renderDataLoader(message = 'Loading IsokoHub...') {
  const loaderHTML = `
    <div id="app-data-loader" class="app-loader-overlay data-loader" role="status" aria-live="polite">
      <div class="loader-card compact-loader">
        <div class="loader-visual" aria-hidden="true">
          <div class="loader-ring"></div>
          <div class="loader-core">
            <img src="assets/logo.png" alt="">
          </div>
        </div>
        <div class="loader-title">IsokoHub</div>
        <div class="loader-dots" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div class="loader-subtext">${message}</div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('afterbegin', loaderHTML);
}

function renderNavbar() {
  const user = getCurrentUser();
  const showInstallAction = !isInStandaloneMode();
  const isAdmin = isAdminUser(user);
  const isAdminPage = /admin\.html/.test(window.location.pathname);
  const settingsHref = user ? (isAdmin ? 'admin.html?tab=settings' : 'dashboard.html?view=settings') : 'login.html';
  const displayName = user ? (user.name || user.full_name || user.display_name || user.email?.split('@')[0] || 'User') : 'Sign In';
  const accountHref = user ? 'dashboard.html' : 'login.html';
  const accountClickHandler = user ? '' : "event.preventDefault(); window.location.href='login.html';";
  const navbarHTML = `
    <nav class="navbar">
      <!-- Top Tier: Branding, Search, Actions -->
      <div class="navbar-top">
        <div class="menu-trigger" id="side-menu-trigger">
          <i class="fa-solid fa-bars"></i>
          <span>All</span>
        </div>
        
        <a href="index.html" class="navbar-brand">
          <img src="assets/logo.png" alt="IsokoHub" class="site-logo" loading="eager" onerror="this.style.display='none'">
          <span>IsokoHub</span>
        </a>
        
        <form class="search-form" id="global-search-form" onsubmit="handleSearch(event)">
          <input type="text" class="search-input" id="global-search-input" placeholder="Search for products, brands and categories...">
          <button type="submit" class="search-btn">
            <i class="fa-solid fa-magnifying-glass"></i>
          </button>
        </form>

        <div class="navbar-actions">
          <a href="${accountHref}" class="nav-action-item" ${accountClickHandler ? `onclick="${accountClickHandler}"` : ''}>
            <span>Hello, ${user ? user.name : 'Sign in'}</span>
            <strong>Account</strong>
          </a>

          ${isAdminPage ? '' : `
          ${showInstallAction ? `
          <button type="button" class="nav-action-item install-nav-btn" onclick="showInstallPrompt()">
            <i class="fa-solid fa-download"></i>
            <strong>Install</strong>
          </button>
          ` : ''}
          `}



          <a href="#" class="nav-action-item cart-icon">
            <i class="fa-solid fa-cart-shopping" style="font-size: 1.5rem;"></i>
            <span class="cart-count">0</span>
            <strong>Cart</strong>
          </a>
        </div>
      </div>

      ${isAdminPage ? '' : `
      <div class="navbar-bottom">
        <a href="houses-rent.html" target="_blank" rel="noopener" style="color: #b45309; font-weight: 700; background: #fff7ed; padding: 0.3rem 0.7rem; border-radius: 999px; border: 1px solid #fdba74;">HOUSEHUB</a>
        <a href="sell.html" style="color: #febd69; font-weight: 700;">Sell on IsokoHub</a>
      </div>
      `}
    </nav>

    ${isAdminPage ? '' : `
    <nav class="mobile-bottom-nav" aria-label="Mobile navigation">
      <a href="index.html" class="mobile-bottom-nav-item"><i class="fa-solid fa-house"></i><span>Home</span></a>
      <a href="#" class="mobile-bottom-nav-item cart-icon"><i class="fa-solid fa-cart-shopping"></i><span>Cart</span><b class="cart-count">0</b></a>
      <a href="houses-rent.html" class="mobile-bottom-nav-item"><i class="fa-solid fa-building"></i><span>HouseHub</span></a>
      <a href="sell.html" class="mobile-bottom-nav-item"><i class="fa-solid fa-tag"></i><span>Sell</span></a>
      <a href="${accountHref}" class="mobile-bottom-nav-item" ${accountClickHandler ? `onclick="${accountClickHandler}"` : ''}><i class="fa-solid fa-user"></i><span>Account</span></a>
    </nav>
    `}

    <!-- Side Navigation Drawer (Amazon Style) -->
    <div class="side-drawer-overlay" id="side-drawer-overlay"></div>
    <div class="side-drawer" id="side-drawer">
      <div class="side-drawer-header">
        <a href="${accountHref}" class="side-drawer-profile-link" ${accountClickHandler ? `onclick="${accountClickHandler}"` : ''}>
          <div class="drawer-profile-card">
            <div class="drawer-profile-badge"><i class="fa-solid ${user ? 'fa-user-check' : 'fa-right-to-bracket'}"></i></div>
            <div class="drawer-user-info">
              <span class="drawer-user-greeting">${user ? 'Welcome back' : 'New here'}</span>
              <span class="drawer-user-name">${displayName}</span>
              <span class="drawer-user-status">${user ? 'Ready to shop and sell' : 'Sign in to continue'}</span>
            </div>
          </div>
        </a>
        <button class="close-drawer" id="close-drawer">&times;</button>
      </div>
      <div class="side-drawer-content">
        <div class="drawer-section drawer-dropdown">
          <h3 style="display:flex; align-items:center; justify-content:space-between; gap:0.6rem;" role="button" tabindex="0" aria-expanded="false"><span><i class="fa-solid fa-fire" style="color:#f97316"></i> Trending</span><i class="fa-solid fa-chevron-right dropdown-icon" style="opacity:0.5;"></i></h3>
          <div class="drawer-hidden">
            <ul>
              <li><a href="products.html">Best Sellers <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.5;"></i></a></li>
              <li><a href="products.html">New Releases <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.5;"></i></a></li>
              <li><a href="products.html">Movers & Shakers <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.5;"></i></a></li>
            </ul>
          </div>
        </div>
        
        <div class="drawer-section drawer-dropdown">
          <h3 style="display:flex; align-items:center; justify-content:space-between; gap:0.6rem;" role="button" tabindex="0" aria-expanded="false"><span><i class="fa-solid fa-microchip" style="color:#3b82f6"></i> High-Tech & Auto</span><i class="fa-solid fa-chevron-right dropdown-icon" style="opacity:0.5;"></i></h3>
          <div class="drawer-hidden">
            <ul>
              <li><a href="products.html?category=Electronics">Computers & Audio <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.5;"></i></a></li>
              <li><a href="products.html?category=Phones">Smartphones <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.5;"></i></a></li>
              <li><a href="products.html?category=Cars">Cars & Vehicles <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.5;"></i></a></li>
            </ul>
          </div>
        </div>
        
        <div class="drawer-section drawer-dropdown">
          <h3 style="display:flex; align-items:center; justify-content:space-between; gap:0.6rem;" role="button" tabindex="0" aria-expanded="false"><span><i class="fa-solid fa-house-chimney" style="color:#10b981"></i> Real Estate</span><i class="fa-solid fa-chevron-right dropdown-icon" style="opacity:0.5;"></i></h3>
          <div class="drawer-hidden">
            <ul>
              <li><a href="products.html?category=Houses%20%26%20Rents">Houses for Sale <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.5;"></i></a></li>
              <li><a href="products.html?category=Houses%20%26%20Rents">Apartments & Rents <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.5;"></i></a></li>
            </ul>
          </div>
        </div>
        
        <div class="drawer-section drawer-dropdown">
          <h3 style="display:flex; align-items:center; justify-content:space-between; gap:0.6rem;" role="button" tabindex="0" aria-expanded="false"><span><i class="fa-solid fa-gear" style="color:#64748b"></i> Help and Settings</span><i class="fa-solid fa-chevron-right dropdown-icon" style="opacity:0.5;"></i></h3>
          <div class="drawer-hidden">
            <ul>
              <li><a href="${user ? 'dashboard.html' : 'signup.html'}"><i class="fa-solid fa-circle-user" style="margin-right:0.5rem; opacity:0.7;"></i> Your Account <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.5;"></i></a></li>
              <li><a href="${settingsHref}"><i class="fa-solid fa-gear" style="margin-right:0.5rem; opacity:0.7;"></i> Settings <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.5;"></i></a></li>
              ${user ? `<li><a href="#" onclick="handleLogout(event)"><i class="fa-solid fa-right-from-bracket" style="margin-right:0.5rem; opacity:0.7;"></i> Logout</a></li>` : ''}
              ${isAdmin ? `<li><a href="admin.html"><i class="fa-solid fa-shield-halved" style="margin-right:0.5rem; opacity:0.7;"></i> Admin Dashboard <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.5;"></i></a></li>` : ''}
            </ul>
          </div>
        </div>

        <div class="drawer-section drawer-form-section">
          <h3><i class="fa-brands fa-whatsapp" style="color:#25d366"></i> WhatsApp Support</h3>
          <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 1rem;">Need help with a listing, account, or order? Message us directly on WhatsApp.</p>
          <a href="https://wa.me/250798269987" target="_blank" rel="noopener" class="btn btn-primary btn-block" style="padding: 0.8rem; border-radius: 8px;">Open WhatsApp</a>
        </div>
      </div>
    </div>
  `;
  const headerTarget = document.getElementById('site-header-root') || document.body;
  headerTarget.insertAdjacentHTML('beforeend', navbarHTML);

  const sideTrigger = document.getElementById('side-menu-trigger');
  const sideDrawer = document.getElementById('side-drawer');
  const drawerOverlay = document.getElementById('side-drawer-overlay');
  const closeBtn = document.getElementById('close-drawer');
  const settings = getDrawerUiSettings();
  const themeSelect = document.getElementById('drawer-theme-select');
  const compactToggle = document.getElementById('drawer-compact-toggle');
  const reducedMotionToggle = document.getElementById('drawer-reduced-motion-toggle');
  const highContrastToggle = document.getElementById('drawer-high-contrast-toggle');

  if (themeSelect) themeSelect.value = settings.theme;
  if (compactToggle) compactToggle.checked = Boolean(settings.compactMode);
  if (reducedMotionToggle) reducedMotionToggle.checked = Boolean(settings.reducedMotion);
  if (highContrastToggle) highContrastToggle.checked = Boolean(settings.highContrast);

  const handleDrawerSettingsChange = () => {
    const nextSettings = {
      theme: themeSelect ? themeSelect.value : settings.theme,
      compactMode: compactToggle ? compactToggle.checked : settings.compactMode,
      reducedMotion: reducedMotionToggle ? reducedMotionToggle.checked : settings.reducedMotion,
      highContrast: highContrastToggle ? highContrastToggle.checked : settings.highContrast
    };
    saveDrawerUiSettings(nextSettings);
  };

  [themeSelect, compactToggle, reducedMotionToggle, highContrastToggle].forEach((control) => {
    if (control) control.addEventListener('change', handleDrawerSettingsChange);
  });

  if (sideTrigger && sideDrawer && drawerOverlay) {
    sideTrigger.addEventListener('click', () => {
      sideDrawer.classList.add('active');
      drawerOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    });

    const closeMenu = () => {
      sideDrawer.classList.remove('active');
      drawerOverlay.classList.remove('active');
      document.body.style.overflow = 'auto';
    };

    [drawerOverlay, closeBtn].forEach(el => el.addEventListener('click', closeMenu));
  }

  const dropdownHeaders = document.querySelectorAll('.drawer-dropdown > h3');
  dropdownHeaders.forEach((header) => {
    const section = header.closest('.drawer-dropdown');
    const hiddenPanel = section ? section.querySelector('.drawer-hidden') : null;

    const toggleDropdown = () => {
      if (!section || !hiddenPanel) return;
      const expanded = section.classList.toggle('drawer-expanded');
      header.setAttribute('aria-expanded', expanded.toString());
    };

    header.addEventListener('click', toggleDropdown);
    header.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleDropdown();
      }
    });
  });

  
}

function renderFooter() {
  const footerHTML = `
    <div id="site-footer-root"></div>
    <footer class="footer">
      <div class="container footer-grid">
        <div class="footer-col">
          <h4>Get to Know Us</h4>
          <ul>
            <li><a href="about.html#careers">Careers</a></li>
            <li><a href="about.html#blog">Blog</a></li>
            <li><a href="about.html#about">About IsokoHub</a></li>
            <li><a href="admin-profile.html">About Admin</a></li>
            <li><a href="about.html#investor">Investor Relations</a></li>
            <li><a href="about.html#help">Help Center</a></li>
            <li><a href="terms.html">Terms &amp; Conditions</a></li>
            <li><a href="about.html#contact">Contact Us</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Make Money with Us</h4>
          <ul>
            <li><a href="sell.html">Sell on IsokoHub</a></li>
            <li><a href="#">Sell on IsokoHub Business</a></li>
            <li><a href="#">Apps on IsokoHub</a></li>
            <li><a href="#">Become an Affiliate</a></li>
            <li><a href="#">Advertise Your Products</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Let Us Help You</h4>
          <ul>
            <li><a href="dashboard.html">Your Account</a></li>
            <li><a href="products.html">Your Orders</a></li>
            <li><a href="about.html#help">Help Center</a></li>
            <li><a href="mailto:yvesniyonkuru2022@gmail.com">
              <i class="fa-solid fa-envelope"></i> Email Support
            </a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Follow Us</h4>
          <ul class="footer-socials" style="display:flex; gap:1rem; list-style:none; padding:0; margin-top:1rem; font-size:1.2rem;">
            <li><a href="https://www.facebook.com/profile.php?id=100073494818427&sk=friends" target="_blank" style="color:#1877f2;"><i class="fa-brands fa-facebook"></i></a></li>
            <li><a href="https://www.instagram.com/maverix_001/" target="_blank" style="color:#e4405f;"><i class="fa-brands fa-instagram"></i></a></li>
            <li><a href="https://x.com/best_shineboy" target="_blank" style="color:#ffffff;"><i class="fa-brands fa-x-twitter"></i></a></li>
            <li><a href="https://www.youtube.com/@Maverix1" target="_blank" style="color:#ff0000;"><i class="fa-brands fa-youtube"></i></a></li>
            <li><a href="https://www.linkedin.com/in/best-shineboy-3aa183383/" target="_blank" style="color:#0077b5;"><i class="fa-brands fa-linkedin"></i></a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <div class="container">
          <div class="footer-logo">Isoko<span>Hub</span></div>
          <p>&copy; ${new Date().getFullYear()} IsokoHub Marketplace. All rights reserved. <span style="opacity: 0.2; font-weight: 700; margin-left: 8px;">DESIGNED BY NIYONKURU YVES</span></p>
        </div>
      </div>
    </footer>
  `;
  const footerTarget = document.getElementById('site-footer-root') || document.body;
  footerTarget.insertAdjacentHTML('beforeend', footerHTML);
}

function handleSearch(e) {
  e.preventDefault();
  const query = document.getElementById('global-search-input').value.trim();
  if (query) {
    window.location.href = `products.html?q=${encodeURIComponent(query)}`;
  }
}

async function handleLogout(e) {
  e.preventDefault();
  const btn = e.currentTarget;
  const originalText = btn.textContent;
  btn.textContent = 'Signing out...';
  btn.disabled = true;

  try {
    // Try direct Supabase signOut first to ensure server-side session cleared
    if (window.supabase && supabase && supabase.auth && typeof supabase.auth.signOut === 'function') {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Supabase signOut error:', error);
        // fallback to local cleanup
      }
    } else if (typeof logoutSupabaseUser === 'function') {
      // fallback to helper if present
      await logoutSupabaseUser();
    }

    // Always clear local/session storage and redirect
    localStorage.removeItem('isokoHubCurrentUser');
    localStorage.removeItem(CART_KEY);
    sessionStorage.clear();
    // Force reload to ensure UI updates
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Logout failed:', err);
    btn.textContent = originalText;
    btn.disabled = false;
    alert('Logout failed. Please try again.');
  }
}

function getQueryParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// (Hero video injection removed — hero video is embedded directly in `index.html`)

// ---- Shopping Cart Logic ----
const CART_KEY = 'isokoHubCart';

function getCart() {
  const cartStr = localStorage.getItem(CART_KEY);
  return cartStr ? JSON.parse(cartStr) : [];
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartUI();
  // Dispatch custom event for other scripts to listen
  window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cart } }));
}

function addToCart(product) {
  const cart = getCart();
  const existingItem = cart.find(item => item.id === product.id);
  
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: Number(product.price) || 0,
      image: Array.isArray(product.image) ? product.image[0] : product.image,
      quantity: 1,
      seller_phone: product.seller_phone || product.sellerPhone || '',
      seller_email: product.seller_email || product.sellerEmail || '',
      delivery_cost: product.delivery_cost !== undefined ? product.delivery_cost : (product.deliveryCost || null),
      free_delivery: product.free_delivery === true || product.freeDelivery === true || false,
      // include seller/shop coordinates if available (lat/lng)
      seller_lat: product.seller_lat || product.sellerLat || (product.shop && product.shop.lat) || (product.shop && product.shop.latitude) || null,
      seller_lng: product.seller_lng || product.sellerLng || (product.shop && product.shop.lng) || (product.shop && product.shop.longitude) || null
    });
  }
  
  saveCart(cart);
  openCartDrawer();
}

function updateQuantity(productId, delta) {
  let cart = getCart();
  const item = cart.find(item => item.id === productId);
  
  if (item) {
    item.quantity += delta;
    if (item.quantity <= 0) {
      cart = cart.filter(i => i.id !== productId);
    }
    saveCart(cart);
  }
}

function removeFromCart(productId) {
  const cart = getCart().filter(item => item.id !== productId);
  saveCart(cart);
}

function updateCartUI() {
  const cart = getCart();
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  // Update header count
  const countEl = document.querySelector('.cart-count');
  if (countEl) {
    countEl.textContent = count;
    countEl.style.display = count > 0 ? 'inline-block' : 'none';
  }
  
  renderCartContent();
}

function openCartDrawer() {
  const cartDrawer = document.getElementById('cart-drawer');
  const overlay = document.getElementById('side-drawer-overlay');
  if (cartDrawer && overlay) {
    cartDrawer.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function renderCartContent() {
  const container = document.getElementById('cart-items-container');
  if (!container) return;
  
  const cart = getCart();
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  if (cart.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 4rem 2rem;">
        <i class="fa-solid fa-cart-shopping" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1.5rem;"></i>
        <h3 style="color: #64748b; margin-bottom: 1rem;">Your cart is empty</h3>
        <p style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 2rem;">Looks like you haven't added anything to your cart yet.</p>
        <button onclick="document.getElementById('close-cart').click()" class="btn btn-primary btn-block">Start Shopping</button>
      </div>
    `;
    document.getElementById('cart-subtotal').textContent = formatPrice(0);
    return;
  }
  
  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"80\" height=\"80\" viewBox=\"0 0 80 80\"><rect width=\"80\" height=\"80\" fill=\"%23f8fbff\"/><rect x=\"8\" y=\"8\" width=\"64\" height=\"64\" rx=\"12\" fill=\"%23ffffff\" stroke=\"%23dbeafe\" stroke-width=\"2\"/><circle cx=\"40\" cy=\"34\" r=\"14\" fill=\"%23e0f2fe\"/><path d=\"M24 60c8-14 16-14 32 0\" fill=\"%23bfdbfe\"/></svg>'">
      <div class="cart-item-details">
        <div class="cart-item-title">${item.name}</div>
        <div class="cart-item-price">${formatPrice(item.price)}</div>
        <div class="cart-item-actions">
          <div class="quantity-control">
            <button onclick="updateQuantity('${item.id}', -1)">-</button>
            <span>${item.quantity}</span>
            <button onclick="updateQuantity('${item.id}', 1)">+</button>
          </div>
          <button class="remove-item" onclick="removeFromCart('${item.id}')">Remove</button>
        </div>
      </div>
    </div>
  `).join('');
  
  document.getElementById('cart-subtotal').textContent = formatPrice(subtotal);
}

// Update the renderNavbar to include the Cart Drawer HTML
const originalRenderNavbar = renderNavbar;
renderNavbar = function() {
  originalRenderNavbar();
  
  const cartDrawerHTML = `
    <div class="side-drawer cart-drawer" id="cart-drawer">
      <div class="side-drawer-header">
        <i class="fa-solid fa-cart-shopping"></i>
        <span>Your Shopping Cart</span>
        <button class="close-drawer" id="close-cart">&times;</button>
      </div>
      <div class="side-drawer-content" style="flex:1; display:flex; flex-direction:column;">
        <div id="cart-items-container" style="flex:1; overflow-y:auto; padding: 1rem;">
          <!-- Items injected via JS -->
        </div>
        
        <div class="cart-footer" style="padding: 1.5rem; border-top: 1px solid var(--border-color); background: #f8fafc;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
            <strong style="font-size: 1.1rem;">Subtotal</strong>
            <strong id="cart-subtotal" style="font-size: 1.25rem; color: var(--text-dark);">0 RWF</strong>
          </div>
          <a href="checkout.html" class="btn btn-primary btn-block" style="padding: 1rem; border-radius: 8px; text-align:center; display:inline-block; text-decoration:none; color:#fff;">
            Proceed to Checkout
          </a>
          <p style="text-align:center; font-size: 0.8rem; color: #64748b; margin-top: 0.8rem;">
            Shipping and taxes calculated at checkout.
          </p>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', cartDrawerHTML);
  
  // Link Cart Icon Trigger
  const cartTriggers = document.querySelectorAll('.cart-icon');
  const closeCart = document.getElementById('close-cart');
  const cartDrawer = document.getElementById('cart-drawer');
  const overlay = document.getElementById('side-drawer-overlay');
  
  cartTriggers.forEach((cartTrigger) => {
    cartTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      openCartDrawer();
    });
  });
  
  const closeAllDrawers = () => {
    cartDrawer.classList.remove('active');
    document.getElementById('side-drawer').classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = 'auto';
  };
  
  if (closeCart) closeCart.addEventListener('click', closeAllDrawers);
  if (overlay) overlay.addEventListener('click', closeAllDrawers);
  
  updateCartUI();
};

// ---- Test Mode (Developer Mode) Logic ----
function isTestMode() {
  return localStorage.getItem('isokoHubTestMode') === 'true';
}

function toggleTestMode() {
  const current = isTestMode();
  localStorage.setItem('isokoHubTestMode', !current);
  location.reload();
}

function renderTestModeBanner() {
  if (!isTestMode()) return;
  const banner = document.createElement('div');
  banner.className = 'test-mode-banner';
  banner.innerHTML = `
    <i class="fa-solid fa-vial"></i> 
    <strong>TEST MODE ACTIVE</strong> &bull; Mock Data Enabled
    <button onclick="toggleTestMode()">Disable</button>
  `;
  document.body.prepend(banner);
}

// ---- Global Support Action ----
function renderGlobalSupportButton() {
  const isSupportPage = window.location.pathname.includes('support.html');
  if (isSupportPage) return;

  const btnHTML = `
    <button class="support-fab" onclick="openSupportPage()" title="WhatsApp Support">
      <i class="fa-brands fa-whatsapp"></i>
      <span>WhatsApp Support</span>
    </button>
  `;
  document.body.insertAdjacentHTML('beforeend', btnHTML);
}

function openSupportDrawer() {
  openSupportPage();
}

// Initialize Global UI Components
document.addEventListener('DOMContentLoaded', () => {
  renderTestModeBanner();
  renderGlobalSupportButton();
});
