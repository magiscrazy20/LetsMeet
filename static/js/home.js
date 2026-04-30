(function () {
  const newMeetingBtn = document.getElementById("new-meeting");
  const newMeetingMenu = document.getElementById("new-meeting-menu");
  const meetingCodeInput = document.getElementById("meeting-code");
  const joinMeetingBtn = document.getElementById("join-meeting");
  const dialog = document.getElementById("meeting-link-dialog");
  const linkInput = document.getElementById("meeting-link-input");
  const copyLinkBtn = document.getElementById("copy-link");
  const closeDialogBtn = document.getElementById("close-dialog");

  // Toggle dropdown
  newMeetingBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const open = !newMeetingMenu.hasAttribute("hidden");
    setMenuOpen(!open);
  });

  document.addEventListener("click", (ev) => {
    if (!newMeetingMenu.contains(ev.target) && ev.target !== newMeetingBtn) {
      setMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      setMenuOpen(false);
      closeDialog();
    }
  });

  function setMenuOpen(open) {
    if (open) {
      newMeetingMenu.removeAttribute("hidden");
      newMeetingBtn.setAttribute("aria-expanded", "true");
    } else {
      newMeetingMenu.setAttribute("hidden", "");
      newMeetingBtn.setAttribute("aria-expanded", "false");
    }
  }

  // Menu actions
  newMeetingMenu.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      setMenuOpen(false);
      if (action === "later") {
        showLinkDialog();
      } else if (action === "instant") {
        startInstantMeeting();
      } else if (action === "schedule") {
        scheduleInGoogleCalendar();
      }
    });
  });

  function buildRoomUrl(roomId) {
    return `${window.location.origin}/rooms/${roomId}/`;
  }

  function startInstantMeeting() {
    const roomId = window.SUGGESTED_ROOM_ID || generateRoomId();
    window.location.href = `/rooms/${roomId}/`;
  }

  function showLinkDialog() {
    const roomId = window.SUGGESTED_ROOM_ID || generateRoomId();
    linkInput.value = buildRoomUrl(roomId);
    copyLinkBtn.textContent = "Copy";
    dialog.removeAttribute("hidden");
    setTimeout(() => {
      linkInput.focus();
      linkInput.select();
    }, 0);
  }

  function closeDialog() {
    dialog.setAttribute("hidden", "");
  }

  closeDialogBtn.addEventListener("click", closeDialog);
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) closeDialog();
  });

  copyLinkBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(linkInput.value);
      copyLinkBtn.textContent = "Copied!";
    } catch {
      linkInput.select();
      document.execCommand("copy");
      copyLinkBtn.textContent = "Copied!";
    }
    setTimeout(() => (copyLinkBtn.textContent = "Copy"), 1500);
  });

  function scheduleInGoogleCalendar() {
    const roomId = window.SUGGESTED_ROOM_ID || generateRoomId();
    const meetingUrl = buildRoomUrl(roomId);
    const start = nextHourFloor();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: "LiveKit Meet",
      details: `Join the meeting: ${meetingUrl}`,
      location: meetingUrl,
      dates: `${gcalDate(start)}/${gcalDate(end)}`,
    });
    window.open(
      `https://calendar.google.com/calendar/render?${params.toString()}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function nextHourFloor() {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  }

  function gcalDate(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
      d.getUTCFullYear().toString() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z"
    );
  }

  // Join input
  meetingCodeInput.addEventListener("input", () => {
    joinMeetingBtn.disabled = meetingCodeInput.value.trim().length === 0;
  });

  meetingCodeInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !joinMeetingBtn.disabled) {
      ev.preventDefault();
      joinFromCode();
    }
  });

  joinMeetingBtn.addEventListener("click", joinFromCode);

  function joinFromCode() {
    const raw = meetingCodeInput.value.trim();
    if (!raw) return;
    if (/^https?:\/\//i.test(raw)) {
      try {
        const u = new URL(raw);
        window.location.href = u.toString();
        return;
      } catch {}
    }
    const code = raw
      .replace(/^\/+|\/+$/g, "")
      .replace(/^rooms\//, "");
    window.location.href = `/rooms/${encodeURIComponent(code)}/`;
  }

  function randomString(length) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < length; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  function generateRoomId() {
    return `${randomString(4)}-${randomString(4)}`;
  }

  // Feature carousel
  const carousel = document.getElementById("feature-carousel");
  if (carousel) {
    const slides = carousel.querySelectorAll(".carousel-slide");
    const dots = carousel.querySelectorAll(".dot");
    const prevBtn = document.getElementById("carousel-prev");
    const nextBtn = document.getElementById("carousel-next");
    let current = 0;
    let timer = null;
    const AUTO_MS = 6000;

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

    prevBtn.addEventListener("click", () => {
      show(current - 1);
      startAuto();
    });
    nextBtn.addEventListener("click", () => {
      show(current + 1);
      startAuto();
    });
    dots.forEach((d, i) =>
      d.addEventListener("click", () => {
        show(i);
        startAuto();
      }),
    );

    carousel.addEventListener("mouseenter", stopAuto);
    carousel.addEventListener("mouseleave", startAuto);
    carousel.addEventListener("focusin", stopAuto);
    carousel.addEventListener("focusout", startAuto);

    startAuto();
  }
})();
