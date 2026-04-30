(function () {
  const LK = window.LivekitClient;
  if (!LK) {
    document.body.innerText = "LiveKit client SDK failed to load.";
    return;
  }

  const grid = document.getElementById("participant-grid");
  const status = document.getElementById("status");
  const micBtn = document.getElementById("toggle-mic");
  const camBtn = document.getElementById("toggle-cam");
  const switchCamBtn = document.getElementById("switch-cam");
  const leaveBtn = document.getElementById("leave-button");

  const tiles = new Map();
  let room = null;
  let videoDevices = [];
  let currentVideoDeviceId = null;

  init().catch((err) => {
    status.textContent = "Connection failed: " + (err.message || err);
  });

  async function init() {
    if (!window.LIVEKIT_URL || !window.LIVEKIT_TOKEN) {
      status.textContent = "Missing serverUrl or token.";
      return;
    }
    room = new LK.Room({ adaptiveStream: true, dynacast: true });
    room
      .on(LK.RoomEvent.TrackSubscribed, (track, _pub, p) => attachTrack(track, p, false))
      .on(LK.RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()))
      .on(LK.RoomEvent.ParticipantConnected, (p) => ensureTile(p, false))
      .on(LK.RoomEvent.ParticipantDisconnected, removeTile)
      .on(LK.RoomEvent.LocalTrackPublished, (pub, p) => pub.track && attachTrack(pub.track, p, true))
      .on(LK.RoomEvent.Disconnected, () => (status.textContent = "Disconnected."));

    await room.connect(window.LIVEKIT_URL, window.LIVEKIT_TOKEN);
    await room.localParticipant.setCameraEnabled(true);
    await room.localParticipant.setMicrophoneEnabled(true);
    status.textContent = `Connected to ${room.name}`;
    ensureTile(room.localParticipant, true);
    room.remoteParticipants.forEach((p) => ensureTile(p, false));

    await refreshVideoDevices();
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", refreshVideoDevices);
    }
  }

  async function refreshVideoDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
      const track = room && room.localParticipant.getTrackPublication(LK.Track.Source.Camera);
      const settings = track && track.track && track.track.mediaStreamTrack
        ? track.track.mediaStreamTrack.getSettings()
        : null;
      currentVideoDeviceId = (settings && settings.deviceId) || (videoDevices[0] && videoDevices[0].deviceId) || null;
      if (switchCamBtn) switchCamBtn.hidden = videoDevices.length < 2;
    } catch (_) {
      if (switchCamBtn) switchCamBtn.hidden = true;
    }
  }

  function ensureTile(participant, isLocal) {
    const id = participant.identity || participant.sid;
    if (tiles.has(id)) return tiles.get(id);
    const tile = document.createElement("div");
    tile.className = "tile" + (isLocal ? " local" : " remote");
    const ph = document.createElement("div");
    ph.className = "placeholder";
    ph.textContent = (participant.name || participant.identity || "?").slice(0, 1).toUpperCase();
    tile.appendChild(ph);
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = (participant.name || participant.identity) + (isLocal ? " (you)" : "");
    tile.appendChild(name);
    grid.appendChild(tile);
    tiles.set(id, tile);
    return tile;
  }

  function removeTile(participant) {
    const id = participant.identity || participant.sid;
    const tile = tiles.get(id);
    if (tile) {
      tile.remove();
      tiles.delete(id);
    }
  }

  function attachTrack(track, participant, isLocal) {
    const tile = ensureTile(participant, isLocal);
    if (track.kind === "video") {
      const ph = tile.querySelector(".placeholder");
      if (ph) ph.remove();
      const el = track.attach();
      if (isLocal) el.muted = true;
      tile.insertBefore(el, tile.firstChild);
    } else if (track.kind === "audio" && !isLocal) {
      tile.appendChild(track.attach());
    }
  }

  micBtn.addEventListener("click", async () => {
    if (!room) return;
    const next = micBtn.dataset.state !== "on";
    await room.localParticipant.setMicrophoneEnabled(next);
    micBtn.dataset.state = next ? "on" : "off";
    micBtn.textContent = next ? "🎤 Mute" : "🎤 Unmute";
  });

  camBtn.addEventListener("click", async () => {
    if (!room) return;
    const next = camBtn.dataset.state !== "on";
    await room.localParticipant.setCameraEnabled(next);
    camBtn.dataset.state = next ? "on" : "off";
    camBtn.textContent = next ? "📷 Camera off" : "📷 Camera on";
  });

  if (switchCamBtn) {
    switchCamBtn.addEventListener("click", async () => {
      if (!room || videoDevices.length < 2) return;
      switchCamBtn.disabled = true;
      try {
        const idx = videoDevices.findIndex((d) => d.deviceId === currentVideoDeviceId);
        const next = videoDevices[(idx + 1) % videoDevices.length];
        await room.switchActiveDevice("videoinput", next.deviceId);
        currentVideoDeviceId = next.deviceId;
      } catch (err) {
        status.textContent = "Camera switch failed: " + (err.message || err);
      } finally {
        switchCamBtn.disabled = false;
      }
    });
  }

  leaveBtn.addEventListener("click", async () => {
    if (room) await room.disconnect();
    window.location.href = "/";
  });
})();
