(function () {
  const startBtn = document.getElementById("start-voice");
  const meetingCodeInput = document.getElementById("meeting-code");
  const joinMeetingBtn = document.getElementById("join-meeting");

  function generateRoomId() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const r = (n) => {
      let out = "";
      for (let i = 0; i < n; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
      return out;
    };
    return `${r(4)}-${r(4)}`;
  }

  startBtn.addEventListener("click", () => {
    const roomId = window.SUGGESTED_ROOM_ID || generateRoomId();
    window.location.href = `/voice/${roomId}/`;
  });

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
    const code = raw.replace(/^\/+|\/+$/g, "").replace(/^rooms\//, "");
    window.location.href = `/voice/${encodeURIComponent(code)}/`;
  }
})();
