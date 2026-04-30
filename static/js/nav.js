(function () {
  const toggle = document.getElementById("nav-toggle");
  const menu = document.getElementById("nav-menu");
  if (!toggle || !menu) return;

  function setOpen(open) {
    if (open) {
      menu.removeAttribute("hidden");
      toggle.setAttribute("aria-expanded", "true");
    } else {
      menu.setAttribute("hidden", "");
      toggle.setAttribute("aria-expanded", "false");
    }
  }

  toggle.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const isOpen = !menu.hasAttribute("hidden");
    setOpen(!isOpen);
  });

  document.addEventListener("click", (ev) => {
    if (!menu.contains(ev.target) && ev.target !== toggle && !toggle.contains(ev.target)) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") setOpen(false);
  });

  // Highlight the current section
  const path = window.location.pathname.replace(/\/+$/, "");
  menu.querySelectorAll(".nav-item").forEach((item) => {
    const href = item.getAttribute("href").replace(/\/+$/, "");
    if (href === path) item.classList.add("active");
  });
})();
