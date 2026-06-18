(() => {
  const body = document.body;
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.querySelector('.menu-toggle');
  const closeTriggers = document.querySelectorAll('[data-close-menu]');
  const logo = document.querySelector('[data-logo]');
  const navLinks = [...document.querySelectorAll('.sidebar-nav a')];
  const sections = [...document.querySelectorAll('main section[id]')];
  const currentSection = document.querySelector('[data-current-section]');
  const timeline = document.querySelector('.timeline');
  const timelineMarkers = timeline ? [...timeline.querySelectorAll('.timeline-marker')] : [];
  const mobileQuery = window.matchMedia('(max-width: 1024px)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let logoTimer;

  const replayLogo = () => {
    if (!logo || reduceMotion.matches) return;
    window.clearTimeout(logoTimer);
    logo.classList.remove('is-replaying');
    void logo.offsetWidth;
    logo.classList.add('is-replaying');
    logoTimer = window.setTimeout(() => logo.classList.remove('is-replaying'), 1500);
  };

  const syncSidebarMode = () => {
    if (!sidebar) return;
    if (mobileQuery.matches) {
      sidebar.inert = !sidebar.classList.contains('is-open');
    } else {
      sidebar.inert = false;
      sidebar.classList.remove('is-open');
      body.classList.remove('menu-open');
      menuToggle?.setAttribute('aria-expanded', 'false');
    }
  };

  const openMenu = () => {
    sidebar.classList.add('is-open');
    body.classList.add('menu-open');
    menuToggle.setAttribute('aria-expanded', 'true');
    sidebar.inert = false;
    sidebar.querySelector('.sidebar-close')?.focus({ preventScroll: true });
  };

  const closeMenu = (restoreFocus = false) => {
    sidebar.classList.remove('is-open');
    body.classList.remove('menu-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    if (mobileQuery.matches) sidebar.inert = true;
    if (restoreFocus) menuToggle.focus({ preventScroll: true });
  };

  menuToggle?.addEventListener('click', openMenu);
  closeTriggers.forEach((trigger) => trigger.addEventListener('click', () => closeMenu()));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('is-open')) {
      closeMenu(true);
    }
  });

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      if (mobileQuery.matches) closeMenu();
    });
  });

  logo?.addEventListener('click', replayLogo);

  const setActiveSection = (id) => {
    navLinks.forEach((link) => {
      const active = link.getAttribute('href') === `#${id}`;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });

    const activeLink = navLinks.find((link) => link.getAttribute('href') === `#${id}`);
    if (activeLink && currentSection) {
      currentSection.textContent = activeLink.querySelector('span').textContent;
    }
  };

  let scrollTicking = false;

  const updateActiveSection = () => {
    const marker = window.innerHeight * 0.32;
    let activeSection = sections[0];

    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= marker) activeSection = section;
    });

    if (activeSection) setActiveSection(activeSection.id);
  };

  const updateTimelineProgress = () => {
    if (!timeline || timelineMarkers.length < 2) return;

    const timelineRect = timeline.getBoundingClientRect();
    const firstMarkerRect = timelineMarkers[0].getBoundingClientRect();
    const lastMarkerRect = timelineMarkers[timelineMarkers.length - 1].getBoundingClientRect();
    const start = firstMarkerRect.top - timelineRect.top + (firstMarkerRect.height / 2);
    const end = lastMarkerRect.top - timelineRect.top + (lastMarkerRect.height / 2);
    const length = Math.max(end - start, 1);
    const readingLine = window.innerHeight * 0.5;
    const progress = Math.min(Math.max((readingLine - timelineRect.top - start) / length, 0), 1);

    timeline.style.setProperty('--timeline-start', `${start}px`);
    timeline.style.setProperty('--timeline-length', `${length}px`);
    timeline.style.setProperty('--timeline-progress', progress.toFixed(4));
  };

  const updateScrollState = () => {
    updateActiveSection();
    updateTimelineProgress();
    scrollTicking = false;
  };

  const queueScrollUpdate = () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(updateScrollState);
  };

  window.addEventListener('scroll', queueScrollUpdate, { passive: true });
  window.addEventListener('resize', queueScrollUpdate, { passive: true });
  window.addEventListener('load', queueScrollUpdate, { once: true });

  mobileQuery.addEventListener('change', syncSidebarMode);
  syncSidebarMode();
  updateScrollState();

  if (!mobileQuery.matches) {
    window.setTimeout(replayLogo, 300);
  }
})();
