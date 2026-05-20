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
  const camBtn = document.getElementById("toggle-cam");
  const switchCamBtn = document.getElementById("switch-cam");
  const recordBtn = document.getElementById("toggle-record");
  const leaveBtn = document.getElementById("leave-button");

  const tiles = new Map();

  let room = null;
  let videoDevices = [];
  let currentVideoDeviceId = null;

  joinBtn.addEventListener("click", async () => {
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
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const details = await res.json();
      await connect(details.serverUrl, details.participantToken);
    } catch (err) {
      errorEl.textContent = String(err.message || err);
      joinBtn.disabled = false;
    }
  });

  async function connect(serverUrl, token) {
    room = new LK.Room({
      adaptiveStream: true,
      dynacast: true,
    });

    room
      .on(LK.RoomEvent.TrackSubscribed, handleTrackSubscribed)
      .on(LK.RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
      .on(LK.RoomEvent.ParticipantConnected, ensureTile)
      .on(LK.RoomEvent.ParticipantDisconnected, removeParticipantTile)
      .on(LK.RoomEvent.LocalTrackPublished, handleLocalTrackPublished)
      .on(LK.RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished)
      .on(LK.RoomEvent.Disconnected, () => {
        status.textContent = "Disconnected.";
      });

    await room.connect(serverUrl, token);
    await room.localParticipant.setCameraEnabled(true);
    await room.localParticipant.setMicrophoneEnabled(true);

    prejoin.hidden = true;
    roomEl.hidden = false;
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
    tile.dataset.participant = id;

    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = (participant.name || participant.identity || "?")
      .slice(0, 1)
      .toUpperCase();
    tile.appendChild(placeholder);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = (participant.name || participant.identity) + (isLocal ? " (you)" : "");
    tile.appendChild(name);

    grid.appendChild(tile);
    tiles.set(id, tile);
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
    attachTrack(track, participant, false);
  }

  function handleTrackUnsubscribed(track) {
    track.detach().forEach((el) => el.remove());
  }

  function handleLocalTrackPublished(publication, participant) {
    if (publication.track) attachTrack(publication.track, participant, true);
  }

  function handleLocalTrackUnpublished(publication) {
    if (publication.track) publication.track.detach().forEach((el) => el.remove());
  }

  function attachTrack(track, participant, isLocal) {
    const tile = ensureTile(participant, isLocal);
    if (track.kind === "video") {
      const ph = tile.querySelector(".placeholder");
      if (ph) ph.remove();
      const el = track.attach();
      if (isLocal) {
        el.muted = true;
        el.style.transform = "scaleX(-1)";
      }
      tile.insertBefore(el, tile.firstChild);
    } else if (track.kind === "audio" && !isLocal) {
      const el = track.attach();
      tile.appendChild(el);
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

  if (recordBtn && window.RECORD_ENDPOINT) {
    recordBtn.addEventListener("click", async () => {
      const recording = recordBtn.dataset.state === "on";
      const path = recording ? "/stop" : "/start";
      try {
        const res = await fetch(`${window.RECORD_ENDPOINT}${path}?roomName=${encodeURIComponent(window.ROOM_NAME)}`);
        if (!res.ok) throw new Error(await res.text());
        recordBtn.dataset.state = recording ? "off" : "on";
        recordBtn.textContent = recording ? "⏺ Record" : "⏹ Stop recording";
      } catch (err) {
        status.textContent = "Recording error: " + (err.message || err);
      }
    });
  }

  leaveBtn.addEventListener("click", async () => {
    if (room) await room.disconnect();
    window.location.href = "/";
  });
})();
