/* =========================================================
   Lead-Key — вся интерактивность на ванильном JS.
   Модули: меню, плавная прокрутка, scroll-reveal, счётчики,
   слайдеры, аккордеон, «читать ещё», валидация форм, cookie.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- 1. Бургер-меню ---------- */
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      const open = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('is-open');
        burger.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- 2. Появление при скролле ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- 3. Анимация счётчиков ---------- */
  function formatNumber(n, group) {
    if (group) return Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
    return String(Math.round(n));
  }
  function animateCounter(el) {
    const target = parseFloat(el.dataset.target) || 0;
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const group = el.dataset.group === '1';
    const duration = 1600;
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = prefix + formatNumber(target * eased, group) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const counters = document.querySelectorAll('.counter');
  if ('IntersectionObserver' in window && counters.length) {
    const co = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { animateCounter(e.target); obs.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { co.observe(el); });
  } else {
    counters.forEach(animateCounter);
  }

  /* ---------- 4. Слайдеры (сертификаты, отзывы) ---------- */
  document.querySelectorAll('[data-slider]').forEach(function (slider) {
    const viewport = slider.querySelector('.slider__viewport');
    const track = slider.querySelector('.slider__track');
    const slides = track ? track.children : [];
    const prev = slider.querySelector('[data-prev]');
    const next = slider.querySelector('[data-next]');
    if (!track || !slides.length) return;

    let index = 0;

    function gap() {
      return parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
    }
    function step() { return slides[0].offsetWidth + gap(); }
    function visibleCount() {
      return Math.max(1, Math.round((viewport.offsetWidth + gap()) / step()));
    }
    function maxIndex() { return Math.max(0, slides.length - visibleCount()); }

    function update() {
      if (index > maxIndex()) index = maxIndex();
      track.style.transform = 'translateX(' + (-index * step()) + 'px)';
      if (prev) prev.style.opacity = index <= 0 ? '.4' : '1';
      if (next) next.style.opacity = index >= maxIndex() ? '.4' : '1';
    }

    if (prev) prev.addEventListener('click', function () { index = Math.max(0, index - 1); update(); });
    if (next) next.addEventListener('click', function () { index = Math.min(maxIndex(), index + 1); update(); });

    // Свайп на тач-устройствах
    let startX = 0, dragging = false;
    viewport.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; dragging = true; }, { passive: true });
    viewport.addEventListener('touchend', function (e) {
      if (!dragging) return; dragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      if (dx < -40) index = Math.min(maxIndex(), index + 1);
      else if (dx > 40) index = Math.max(0, index - 1);
      update();
    });

    let resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(update, 150);
    });
    update();
  });

  /* ---------- 5. «Читать ещё» в отзывах ---------- */
  document.querySelectorAll('.review__expand').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const text = btn.parentElement.querySelector('.review__text');
      if (!text) return;
      const expanded = text.classList.toggle('is-expanded');
      btn.textContent = expanded ? 'Свернуть' : 'Читать еще';
    });
  });

  /* ---------- 6. FAQ-аккордеон ---------- */
  document.querySelectorAll('.accordion__head').forEach(function (head) {
    head.addEventListener('click', function () {
      const item = head.parentElement;
      const body = item.querySelector('.accordion__body');
      const open = item.classList.toggle('is-open');
      body.style.maxHeight = open ? body.scrollHeight + 'px' : '0';
    });
  });

  /* ---------- 7. Формы: маска телефона, валидация, отправка ---------- */
  function maskPhone(input) {
    input.addEventListener('input', function () {
      let digits = input.value.replace(/\D/g, '');
      if (digits.startsWith('8')) digits = '7' + digits.slice(1);
      if (!digits.startsWith('7')) digits = '7' + digits;
      digits = digits.slice(0, 11);
      let out = '+7';
      if (digits.length > 1) out += ' (' + digits.slice(1, 4);
      if (digits.length >= 4) out += ') ' + digits.slice(4, 7);
      if (digits.length >= 7) out += '-' + digits.slice(7, 9);
      if (digits.length >= 9) out += '-' + digits.slice(9, 11);
      input.value = out;
    });
  }

  // Отправка заявки на сервер
  function submitLead(data) {
    return fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(r) {
      if (!r.ok) throw new Error('Submit failed');
      return r.json();
    });
  }

  document.querySelectorAll('.lead-form').forEach(function (form) {
    const phone = form.querySelector('input[type="tel"]');
    if (phone) maskPhone(phone);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      let valid = true;

      const name = form.querySelector('input[name="name"]');
      if (name && !name.value.trim()) { name.classList.add('is-error'); valid = false; }
      else if (name) name.classList.remove('is-error');

      if (phone) {
        const digits = phone.value.replace(/\D/g, '');
        if (digits.length < 11) { phone.classList.add('is-error'); valid = false; }
        else phone.classList.remove('is-error');
      }

      const agree = form.querySelector('input[name="agree_pd"]');
      if (agree && !agree.checked) {
        valid = false;
        agree.closest('.lead-form__check').style.color = '#FF4053';
      } else if (agree) {
        agree.closest('.lead-form__check').style.color = '';
      }

      if (!valid) return;

      const data = {};
      form.querySelectorAll('input').forEach(function (i) {
        data[i.name] = i.type === 'checkbox' ? i.checked : i.value;
      });

      submitLead(data).then(function () {
        const success = form.querySelector('.lead-form__success');
        form.querySelectorAll('input').forEach(function (i) {
          if (i.type === 'checkbox') i.checked = false; else i.value = '';
        });
        if (success) {
          success.hidden = false;
          setTimeout(function () { success.hidden = true; }, 6000);
        }
      });
    });
  });

  /* ---------- 8. Cookie-уведомление ---------- */
  const cookie = document.getElementById('cookie');
  const cookieOk = document.getElementById('cookieOk');
  if (cookie && cookieOk) {
    let accepted = false;
    try { accepted = localStorage.getItem('lk-cookie') === '1'; } catch (e) {}
    if (!accepted) cookie.hidden = false;
    cookieOk.addEventListener('click', function () {
      cookie.hidden = true;
      try { localStorage.setItem('lk-cookie', '1'); } catch (e) {}
    });
  }

  /* ---------- 9. Корректировка якорей под высоту шапки ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      const id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });

})();
