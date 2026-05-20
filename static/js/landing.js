(function () {
  const carousel = document.getElementById("feature-carousel");
  if (!carousel) return;

  const slides = carousel.querySelectorAll(".showcase-slide");
  const dots = carousel.querySelectorAll(".dot");
  const prevBtn = document.getElementById("carousel-prev");
  const nextBtn = document.getElementById("carousel-next");
  let current = 0;
  let timer = null;
  const AUTO_MS = 5500;

  function show(idx) {
    current = (idx + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle("active", i === current));
    dots.forEach((d, i) => {
      d.classList.toggle("active", i === current);
      d.setAttribute("aria-selected", i === current ? "true" : "false");
    });
  }

  function startAuto() {
    stopAuto();
    timer = setInterval(() => show(current + 1), AUTO_MS);
  }

  function stopAuto() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  prevBtn.addEventListener("click", () => { show(current - 1); startAuto(); });
  nextBtn.addEventListener("click", () => { show(current + 1); startAuto(); });
  dots.forEach((d, i) => d.addEventListener("click", () => { show(i); startAuto(); }));

  carousel.addEventListener("mouseenter", stopAuto);
  carousel.addEventListener("mouseleave", startAuto);
  carousel.addEventListener("focusin", stopAuto);
  carousel.addEventListener("focusout", startAuto);

  startAuto();
})();
