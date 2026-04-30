(function () {
  const LK = window.LivekitClient;
  if (!LK) {
    document.body.innerText = "LiveKit client SDK failed to load.";
    return;
  }

  const prejoin = document.getElementById("prejoin");
  const roomEl = document.getElementById("room");
  const grid = document.getElementById("participant-grid");
  const status = document.getElementById("status");
  const errorEl = document.getElementById("prejoin-error");
  const nameInput = document.getElementById("participant-name");
  const joinBtn = document.getElementById("join-button");
  const micBtn = document.getElementById("toggle-mic");
  const speakerBtn = document.getElementById("toggle-speaker");
  const leaveBtn = document.getElementById("leave-button");
  const elapsedEl = document.getElementById("elapsed");

  const tiles = new Map();
  let room = null;
  let elapsedTimer = null;
  let startedAt = 0;

  // Mobile devices default to earpiece (lower volume, ear-level) and expose a
  // button to switch to loudspeaker. Desktop stays on full speaker.
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  let speakerOn = !isMobile;
  updateSpeakerButtonVisual();

  // The speaker button has different semantics on mobile vs desktop:
  // - Mobile: default = earpiece (button looks neutral), red = speakerphone on
  // - Desktop: default = audible (neutral), red = muted output
  function updateSpeakerButtonVisual() {
    if (!speakerBtn) return;
    if (isMobile) {
      speakerBtn.dataset.state = speakerOn ? "off" : "on";
      speakerBtn.title = speakerOn ? "Speakerphone on (tap for earpiece)" : "Earpiece (tap for speaker)";
      speakerBtn.setAttribute(
        "aria-label",
        speakerOn ? "Switch to earpiece" : "Switch to speakerphone",
      );
    } else {
      speakerBtn.dataset.state = speakerOn ? "on" : "off";
      speakerBtn.title = speakerOn ? "Speaker on" : "Speaker off";
      speakerBtn.setAttribute("aria-label", speakerOn ? "Mute speaker" : "Unmute speaker");
    }
  }

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
    room = new LK.Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      },
      publishDefaults: {
        audioPreset: (LK.AudioPresets && LK.AudioPresets.music) || undefined,
        red: true,
        dtx: true,
      },
    });

    room
      .on(LK.RoomEvent.TrackSubscribed, handleTrackSubscribed)
      .on(LK.RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
      .on(LK.RoomEvent.ParticipantConnected, (p) => ensureTile(p, false))
      .on(LK.RoomEvent.ParticipantDisconnected, removeParticipantTile)
      .on(LK.RoomEvent.TrackMuted, (_pub, p) => updateMute(p))
      .on(LK.RoomEvent.TrackUnmuted, (_pub, p) => updateMute(p))
      .on(LK.RoomEvent.TrackPublished, (_pub, p) => updateMute(p))
      .on(LK.RoomEvent.TrackUnpublished, (_pub, p) => updateMute(p))
      .on(LK.RoomEvent.LocalTrackPublished, (_pub, p) => updateMute(p))
      .on(LK.RoomEvent.LocalTrackUnpublished, (_pub, p) => updateMute(p))
      .on(LK.RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged)
      .on(LK.RoomEvent.Disconnected, () => {
        status.textContent = "Disconnected.";
        stopElapsed();
      });

    await room.connect(serverUrl, token);
    // Voice-only: mic on, no camera
    await room.localParticipant.setMicrophoneEnabled(true);
    await room.localParticipant.setCameraEnabled(false);

    prejoin.hidden = true;
    roomEl.hidden = false;
    status.textContent = `Connected to ${room.name}`;

    ensureTile(room.localParticipant, true);
    room.remoteParticipants.forEach((p) => ensureTile(p, false));

    startElapsed();
  }

  function ensureTile(participant, isLocal) {
    const id = participant.identity || participant.sid;
    if (tiles.has(id)) return tiles.get(id);

    const tile = document.createElement("div");
    tile.className = "v-tile";
    tile.dataset.participant = id;

    const wrap = document.createElement("div");
    wrap.className = "v-avatar-wrap";

    const ring = document.createElement("div");
    ring.className = "v-ring";

    const avatar = document.createElement("div");
    avatar.className = "v-avatar";
    avatar.textContent = (participant.name || participant.identity || "?").slice(0, 1);

    const badge = document.createElement("div");
    badge.className = "v-mic-badge";
    badge.innerHTML = micBadgeSvg(true);

    wrap.appendChild(ring);
    wrap.appendChild(avatar);
    wrap.appendChild(badge);

    const name = document.createElement("div");
    name.className = "v-name";
    name.textContent = (participant.name || participant.identity) + (isLocal ? " (you)" : "");

    const sub = document.createElement("div");
    sub.className = "v-sub";
    sub.textContent = isLocal ? "Speaking from this device" : "Connected";

    tile.appendChild(wrap);
    tile.appendChild(name);
    tile.appendChild(sub);

    grid.appendChild(tile);
    tiles.set(id, tile);
    updateMute(participant);
    return tile;
  }

  function removeParticipantTile(participant) {
    const id = participant.identity || participant.sid;
    const tile = tiles.get(id);
    if (tile) {
      tile.remove();
      tiles.delete(id);
    }
  }

  function handleTrackSubscribed(track, _publication, participant) {
    if (track.kind === "audio") {
      const el = track.attach();
      el.autoplay = true;
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      applyAudioRouting(el);
      const tile = ensureTile(participant, false);
      tile.appendChild(el);
    }
    updateMute(participant);
  }

  function applyAudioRouting(el) {
    // Audio is never muted on connect — we only adjust volume.
    // On mobile: earpiece mode = quieter (~ear-level); speakerphone = full.
    // On desktop: speaker on = full, speaker off = silent.
    el.muted = false;
    if (isMobile) {
      el.volume = speakerOn ? 1.0 : 0.55;
    } else {
      el.volume = speakerOn ? 1.0 : 0.0;
    }
    // Try to route to the explicit speakerphone output if the browser supports it.
    if (isMobile && typeof el.setSinkId === "function") {
      const target = speakerOn ? "default" : "communications";
      el.setSinkId(target).catch(() => {});
    }
  }

  function handleTrackUnsubscribed(track) {
    track.detach().forEach((el) => el.remove());
  }

  function updateMute(participant) {
    const id = participant.identity || participant.sid;
    const tile = tiles.get(id);
    if (!tile) return;
    const pub = participant.getTrackPublication
      ? participant.getTrackPublication(LK.Track.Source.Microphone)
      : null;
    // Treat as muted only when the publication is actually muted or absent.
    // A remote track publication may briefly have no .track during subscription;
    // that should not flash a "muted" state.
    const muted = !pub || pub.isMuted;
    tile.classList.toggle("muted", muted);
    const badge = tile.querySelector(".v-mic-badge");
    if (badge) badge.innerHTML = micBadgeSvg(!muted);
  }

  function handleActiveSpeakersChanged(speakers) {
    const speakingIds = new Set(speakers.map((p) => p.identity || p.sid));
    tiles.forEach((tile, id) => {
      tile.classList.toggle("speaking", speakingIds.has(id));
    });
  }

  micBtn.addEventListener("click", async () => {
    if (!room) return;
    const next = micBtn.dataset.state !== "on";
    await room.localParticipant.setMicrophoneEnabled(next);
    micBtn.dataset.state = next ? "on" : "off";
    micBtn.setAttribute("aria-label", next ? "Mute microphone" : "Unmute microphone");
    micBtn.title = next ? "Mute" : "Unmute";
    updateMute(room.localParticipant);
  });

  speakerBtn.addEventListener("click", () => {
    speakerOn = !speakerOn;
    updateSpeakerButtonVisual();
    document.querySelectorAll(".v-tile audio").forEach(applyAudioRouting);
  });

  leaveBtn.addEventListener("click", async () => {
    if (room) await room.disconnect();
    window.location.href = "/voice/";
  });

  function startElapsed() {
    startedAt = Date.now();
    elapsedTimer = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      elapsedEl.textContent = `${mm}:${ss}`;
    }, 1000);
  }

  function stopElapsed() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function micBadgeSvg(on) {
    if (on) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><line x1="12" y1="18" x2="12" y2="22"></line></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="21" y2="21"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12"></path><path d="M15 11V6a3 3 0 0 0-5.66-1.4"></path><path d="M5 11a7 7 0 0 0 11.5 5.34"></path></svg>';
  }
})();
