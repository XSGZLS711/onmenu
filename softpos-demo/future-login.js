// Apply the approved Future Connect design to the main sign-in form.
(() => {
  const form = document.getElementById('loginForm');
  if (!form) return;
  document.documentElement.classList.add('future-login');
  const brand = document.createElement('div');
  brand.className = 'future-brand';
  const logo = document.createElement('img');
  logo.src = 'images/softpos-logo-supplied.png';
  logo.alt = 'SoftPOS';
  logo.width = 128;
  logo.height = 128;
  brand.append(logo);
  form.prepend(brand);
  const hero = document.createElement('aside');
  hero.className = 'future-hero';
  hero.innerHTML = '<div class="future-hero-art" aria-hidden="true"></div><div class="future-hero-copy"><p class="future-kicker">SOFTPOS - FUTURE CONNECTS</p><h2><span data-i18n>Your Vision.</span><span data-i18n>Our Technology.</span></h2><div class="future-hero-line" aria-hidden="true"></div></div>';
  form.before(hero);
  const footer = document.createElement('p');
  footer.className = 'future-footer';
  footer.innerHTML = 'Powered by <strong>SOFTNET SOLUTIONS</strong>';
  form.after(footer);
})();
