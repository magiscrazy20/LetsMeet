(function () {
  const LK = window.LivekitClient;
  if (!LK) {
    document.body.innerText = "LiveKit client SDK failed to load.";
    return;
  }

  const prejoin = document.getElementById("prejoin");
  const roomEl = document.getElementById("room");
  const stream = document.getElementById("chat-stream");
  const status = document.getElementById("status");
  const errorEl = document.getElementById("prejoin-error");
  const nameInput = document.getElementById("participant-name");
  const joinBtn = document.getElementById("join-button");
  const composer = document.getElementById("chat-composer");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const peopleCount = document.getElementById("people-count");
  const leaveBtn = document.getElementById("leave-button");

  let room = null;
  let myName = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Track the last rendered chat message so consecutive messages from the same
  // sender (within a short window) can be grouped: name/time on the first only,
  // avatar on the last only.
  const GROUP_WINDOW_MS = 5 * 60 * 1000;
  let lastMsg = null;

  joinBtn.addEventListener("click", joinRoom);
  nameInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") joinRoom();
  });

  async function joinRoom() {
    const name = (nameInput.value || "").trim();
    if (!name) {
      errorEl.textContent = "Please enter a name.";
      return;
    }
    errorEl.textContent = "";
    joinBtn.disabled = true;
    myName = name;
    try {
      const url = new URL(window.CONNECTION_DETAILS_ENDPOINT, window.location.origin);
      url.searchParams.set("roomName", window.ROOM_NAME);
      url.searchParams.set("participantName", name);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(await res.text());
      const details = await res.json();
      await connect(details.serverUrl, details.participantToken);
    } catch (err) {
      errorEl.textContent = String(err.message || err);
      joinBtn.disabled = false;
    }
  }

  async function connect(serverUrl, token) {
    room = new LK.Room({ adaptiveStream: false, dynacast: false });

    room
      .on(LK.RoomEvent.DataReceived, handleDataReceived)
      .on(LK.RoomEvent.ParticipantConnected, (p) => {
        addSystemMessage(`${p.name || p.identity} joined`);
        updatePeopleCount();
      })
      .on(LK.RoomEvent.ParticipantDisconnected, (p) => {
        addSystemMessage(`${p.name || p.identity} left`);
        updatePeopleCount();
      })
      .on(LK.RoomEvent.Disconnected, () => {
        status.textContent = "Disconnected.";
        sendBtn.disabled = true;
        input.disabled = true;
      });

    await room.connect(serverUrl, token);
    // Chat-only: no camera, no microphone
    await room.localParticipant.setCameraEnabled(false);
    await room.localParticipant.setMicrophoneEnabled(false);

    prejoin.hidden = true;
    roomEl.hidden = false;
    status.textContent = "Connected — messages are end-to-end via LiveKit data channels";
    addSystemMessage(`You joined as ${myName}`);
    updatePeopleCount();
    setTimeout(() => input.focus(), 50);
  }

  composer.addEventListener("submit", (ev) => {
    ev.preventDefault();
    sendMessage();
  });

  input.addEventListener("input", () => {
    sendBtn.disabled = input.value.trim().length === 0;
  });
  sendBtn.disabled = true;

  async function sendMessage() {
    if (!room) return;
    const text = input.value.trim();
    if (!text) return;
    const payload = {
      kind: "chat",
      text,
      sender: myName,
      ts: Date.now(),
    };
    try {
      const data = encoder.encode(JSON.stringify(payload));
      await room.localParticipant.publishData(data, { reliable: true });
      addMessage({ ...payload, isMine: true });
      input.value = "";
      sendBtn.disabled = true;
      input.focus();
    } catch (err) {
      status.textContent = "Send failed: " + (err.message || err);
    }
  }

  function handleDataReceived(payload, participant) {
    try {
      const msg = JSON.parse(decoder.decode(payload));
      if (!msg || msg.kind !== "chat" || typeof msg.text !== "string") return;
      addMessage({
        text: msg.text,
        sender: msg.sender || (participant && (participant.name || participant.identity)) || "?",
        ts: msg.ts || Date.now(),
        isMine: false,
      });
    } catch (_) {
      /* ignore malformed payloads */
    }
  }

  function addMessage({ text, sender, ts, isMine }) {
    const grouped =
      lastMsg &&
      lastMsg.sender === sender &&
      lastMsg.isMine === isMine &&
      ts - lastMsg.ts < GROUP_WINDOW_MS;

    // The new message is now the "last" in its group, so the previous one
    // hides its avatar.
    if (grouped) lastMsg.el.classList.add("avatar-hidden");

    const msg = document.createElement("div");
    msg.className = "msg" + (isMine ? " me" : "") + (grouped ? " grouped" : "");

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = (sender || "?").slice(0, 1);

    const body = document.createElement("div");
    body.className = "msg-body";

    if (!grouped) {
      const meta = document.createElement("div");
      meta.className = "msg-meta";
      meta.innerHTML = `<span>${escapeHtml(sender)}</span><span>${formatTime(ts)}</span>`;
      body.appendChild(meta);
    }

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;
    body.appendChild(bubble);

    msg.appendChild(avatar);
    msg.appendChild(body);
    stream.appendChild(msg);
    stream.scrollTop = stream.scrollHeight;

    lastMsg = { sender, isMine, ts, el: msg };
  }

  function addSystemMessage(text) {
    const msg = document.createElement("div");
    msg.className = "msg system";
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;
    msg.appendChild(bubble);
    stream.appendChild(msg);
    stream.scrollTop = stream.scrollHeight;
    // System messages break any active group.
    lastMsg = null;
  }

  function updatePeopleCount() {
    if (!room) return;
    peopleCount.textContent = String(room.remoteParticipants.size + 1);
  }

  function formatTime(ts) {
    const d = new Date(ts);
    let h = d.getHours();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${mm} ${ampm}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  if (leaveBtn) {
    leaveBtn.addEventListener("click", async () => {
      if (room) {
        try { await room.disconnect(); } catch (_) {}
      }
      window.location.href = "/chat/";
    });
  }
})();
