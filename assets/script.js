(() => {
  const body = document.body;
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.querySelector('.menu-toggle');
  const closeTriggers = document.querySelectorAll('[data-close-menu]');
  const logo = document.querySelector('[data-logo]');
  const navLinks = [...document.querySelectorAll('.sidebar-nav a')];
  const sections = [...document.querySelectorAll('main section[id]')];
  const currentSection = document.querySelector('[data-current-section]');
  const mobileQuery = window.matchMedia('(max-width: 1024px)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let logoTimer;
  let mobileLogoPlayed = false;

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

    if (!mobileLogoPlayed) {
      mobileLogoPlayed = true;
      window.setTimeout(replayLogo, 120);
    }
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
    scrollTicking = false;
  };

  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(updateActiveSection);
  }, { passive: true });

  mobileQuery.addEventListener('change', syncSidebarMode);
  syncSidebarMode();
  updateActiveSection();

  if (!mobileQuery.matches) {
    window.setTimeout(replayLogo, 300);
  }
})();
