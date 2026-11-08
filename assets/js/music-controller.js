(() => {
  const INSTANCE_KEY = "RadiantBlazeMusic";
  if (window[INSTANCE_KEY]) {
    window[INSTANCE_KEY].syncRoute();
    return;
  }

  const SETTINGS_KEY = "radiant-blaze-music-settings";
  const SESSION_KEY = "radiant-blaze-music-session";
  const collections = [
    { id: "Portfolio and Main Page", label: "Portfolio + Main" },
    { id: "Blogs and CTFs", label: "Blogs + CTFs" },
    { id: "Reading CTFs and Blogs", label: "Reading" },
  ];
  const supportedRepeatModes = ["off", "all", "one"];
  const PLAYBACK_STATES = Object.freeze({
    INITIALIZING: "INITIALIZING",
    LOADING: "LOADING",
    READY: "READY",
    ATTEMPTING: "ATTEMPTING",
    PLAYING: "PLAYING",
    BLOCKED: "BLOCKED",
    PAUSED: "PAUSED",
    ERROR: "ERROR",
  });
  const defaults = {
    enabled: true,
    volume: 0.30,
    shuffle: true,
    repeat: "off",
  };
  const state = {
    preferences: readSettings(),
    tracks: [],
    collection: "",
    queue: [],
    queueIndex: -1,
    history: [],
    historyIndex: -1,
    failed: new Set(),
    current: null,
    playing: false,
    loading: false,
    seeking: false,
    seekPointerId: null,
    loadId: 0,
    muted: false,
    previousVolume: null,
    context: null,
    analyser: null,
    gain: null,
    mediaSource: null,
    visualizerFrame: 0,
    autoplayPrompt: false,
    autoplayAttempting: false,
    autoplayRetryCount: 0,
    autoplayRequested: false,
    autoplayBlocked: false,
    playerCloseTimer: 0,
    trackChangeTimer: 0,
    renderedTrackId: "",
    playbackState: PLAYBACK_STATES.INITIALIZING,
    manifestPromise: null,
    preloadLink: null,
  };

  let audio = new Audio();
  const audioGraphs = new WeakMap();
  const audioListeners = new WeakSet();
  let lastSyncedRoute = null;
  let removeAutoplayGestureFallback = () => {};
  audio.preload = "none";
  audio.dataset.radiantBlazeMusic = "";
  audio.setAttribute("aria-hidden", "true");
  audio.tabIndex = -1;
  document.addEventListener("DOMContentLoaded", initialize, { once: true });


  function readSettings() {
    try {
      const savedValue = localStorage.getItem(SETTINGS_KEY);
      if (savedValue === null) {
        const legacyPreference = localStorage.getItem("radiant-blaze-music-enabled");
        return {
          ...defaults,
          enabled: legacyPreference === "false" ? false : legacyPreference === "true" ? true : defaults.enabled,
        };
      }
      const saved = JSON.parse(savedValue);
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { ...defaults };
      return {
        enabled: typeof saved.enabled === "boolean" ? saved.enabled : defaults.enabled,
        volume: Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : defaults.volume,
        shuffle: typeof saved.shuffle === "boolean" ? saved.shuffle : defaults.shuffle,
        repeat: supportedRepeatModes.includes(saved.repeat) ? saved.repeat : defaults.repeat,
      };
    } catch (error) {
      console.warn("[radiant-blaze:music] Saved settings could not be read.", error);
      return { ...defaults };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.preferences));
    } catch (error) {
      console.warn("[radiant-blaze:music] Preferences could not be saved.", error);
    }
  }

  function readSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      if (
        saved && typeof saved.trackId === "string" &&
        typeof saved.collection === "string"
      ) return saved;
    } catch (error) {
      console.warn("[radiant-blaze:music] Session track could not be restored.", error);
    }
    return null;
  }

  function persistSession() {
    if (!state.current) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        trackId: state.current.id,
        collection: state.collection,
      }));
    } catch (error) {
      console.warn("[radiant-blaze:music] Session track could not be saved.", error);
    }
  }

  function routeCollection(pathname = location.pathname) {
    let normalizedPath = pathname;
    try {
      normalizedPath = decodeURIComponent(pathname);
    } catch (error) {
      console.warn("[radiant-blaze:music] Route pathname could not be decoded.", error);
    }
    normalizedPath = normalizedPath.replace(/\\/g, "/");
    if (/\/portfolio(?:\/|\.html)?$/i.test(normalizedPath) || /^\/(?:index\.html)?$/i.test(normalizedPath)) {
      return collections[0].id;
    }
    if (/\/generated\/(?:posts|writeups)\//i.test(normalizedPath) || /\/pages\/(?:post|writeup)\.html$/i.test(normalizedPath)) {
      return collections[2].id;
    }
    if (/\/pages\/(?:blog|ctf|search)\.html$/i.test(normalizedPath)) return collections[1].id;
    return collections[0].id;
  }

  function initialize() {
    document.body.append(audio);
    mountInterface();
    bindEvents();
    state.collection = routeCollection();
    if (!state.preferences.enabled) {
      state.loading = false;
      render();
      return;
    }
    void loadManifest().catch((error) => {
      console.error("[radiant-blaze:music] Could not load music tracks.", error);
      state.loading = false;
      render();
    });
    addEventListener("pagehide", persistSession);
  }

  function loadManifest() {
    if (state.manifestPromise) return state.manifestPromise;
    state.manifestPromise = fetch("/assets/music/manifest.json")
      .then((response) => {
        if (!response.ok) throw new Error(`Music manifest request failed (${response.status}).`);
        return response.json();
      })
      .then((manifest) => {
        if (!manifest || !Array.isArray(manifest.tracks)) throw new TypeError("Music manifest has an invalid shape.");
        console.info("[radiant-blaze:music] Manifest loaded.", manifest.tracks.length);
        state.tracks = manifest.tracks.filter((track) =>
          track && typeof track.id === "string" && typeof track.src === "string" &&
          typeof track.title === "string" && typeof track.artist === "string" &&
          collections.some((collection) => collection.id === track.collection),
        );
        const restored = readSession();
        if (restored && restored.collection === state.collection) {
          const track = state.tracks.find((candidate) => candidate.id === restored.trackId);
          if (track) {
            console.info("[radiant-blaze:music] Track selected.", track.title);
            buildQueue(track.id);
            state.queueIndex = state.queue.indexOf(track.id);
            selectTrackMetadata(track);
            if (state.preferences.enabled) {
              void loadTrack(track, { position: 0, autoplay: true });
            }
            return;
          }
        }
        const selectedTrack = state.tracks.find((track) => track.collection === state.collection && !state.failed.has(track.id));
        if (selectedTrack) console.info("[radiant-blaze:music] Track selected.", selectedTrack.title);
        activateCollection(state.collection, { autoplay: state.preferences.enabled });
      });
    return state.manifestPromise;
  }

  function mountInterface() {
    if (document.getElementById("rb-music-root")) return;
    const root = document.createElement("div");
    root.id = "rb-music-root";
    root.className = "rb-music";
    root.innerHTML = `
      <div class="rb-music-dock">
        <button class="pixel-button rb-music-pill" type="button" data-music-action="open" aria-expanded="false" aria-controls="rb-music-player" aria-label="Open music player" title="Open music player">
          <span class="rb-music-visualizer" data-visualizer aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="rb-music-pill-copy"><strong data-track-title>Music loading</strong><small data-track-artist>Radiant Blaze radio</small></span>
          <span class="rb-music-status" data-play-status>READY</span>
        </button>
      </div>
      <section class="rb-music-player" id="rb-music-player" role="dialog" aria-label="Radiant Blaze music player" hidden>
        <div class="rb-music-player-head"><p data-collection-name>NO COLLECTION</p><button class="pixel-button rb-music-icon-button" type="button" data-music-action="close" aria-label="Close music player" title="Close"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
        <div class="rb-music-now">
          <div class="rb-music-art" data-album-art aria-hidden="true">♫</div>
          <div class="rb-music-now-copy"><strong data-player-title title="Choose a track">Choose a track</strong><span data-player-artist title="Unknown Artist">Unknown Artist</span></div>
        </div>
        <div class="rb-music-progress">
          <span data-current-time>0:00</span>
          <div class="rb-music-slider rb-music-seek-slider">
            <span class="rb-music-slider-rail" aria-hidden="true"><span data-slider-fill></span></span>
            <input class="page-loader-bar page-loader-bar--interactive page-loader-bar--seek" type="range" min="0" max="1000" value="0" data-music-seek aria-label="Seek through track" />
          </div>
          <span data-duration>0:00</span>
        </div>
        <div class="rb-music-controls">
          <button class="pixel-button rb-music-icon-button" type="button" data-music-action="previous" aria-label="Previous track" title="Previous track"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 5v14" /><path d="M19 6l-9 6 9 6z" fill="currentColor" stroke="none" /></svg></button>
          <button class="pixel-button rb-music-icon-button rb-music-play" type="button" data-music-action="toggle" aria-label="Play music" title="Play music"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path data-playback-icon d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></svg></button>
          <button class="pixel-button rb-music-icon-button" type="button" data-music-action="next" aria-label="Next track" title="Next track"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 5v14" /><path d="M5 6l9 6-9 6z" fill="currentColor" stroke="none" /></svg></button>
        </div>
        <div class="rb-music-secondary">
          <div class="rb-music-secondary-buttons" aria-label="Playback options">
            <button class="pixel-button rb-music-icon-button" type="button" data-music-action="shuffle" aria-pressed="true" aria-label="Shuffle" title="Shuffle"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h2.5c4.5 0 6.5 10 11 10H20M17 14l3 3-3 3M4 17h2.5c1.8 0 3-1.6 4.1-3.5M13.4 10.5C14.5 8.6 15.7 7 17.5 7H20M17 4l3 3-3 3" /></svg></button>
            <button class="pixel-button rb-music-icon-button rb-repeat-button" type="button" data-music-action="repeat" aria-pressed="false" aria-label="Repeat off" title="Repeat off"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 8V5l3 3-3 3V8H7a4 4 0 0 0-4 4M5 16v3l-3-3 3-3v3h12a4 4 0 0 0 4-4" /></svg><span data-repeat-badge aria-hidden="true" hidden>1</span></button>
          </div>
          <div class="rb-music-volume">
            <div class="rb-music-volume-slider">
              <button class="pixel-button rb-music-icon-button rb-music-speaker" type="button" data-music-action="mute" aria-label="Mute music" title="Mute music">
                <svg class="rb-speaker-icon rb-speaker-volume2" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M11 5 6 9H2v6h4l5 4V5z" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
                <svg class="rb-speaker-icon rb-speaker-volume-x" viewBox="0 0 24 24" aria-hidden="true" focusable="false" hidden>
                  <path d="M11 5 6 9H2v6h4l5 4V5z" />
                  <path d="m22 9-6 6" />
                  <path d="m16 9 6 6" />
                </svg>
              </button>
              <div class="rb-music-slider rb-music-volume-range">
                <span class="rb-music-slider-rail" aria-hidden="true"><span data-slider-fill></span></span>
                <input class="page-loader-bar page-loader-bar--interactive page-loader-bar--volume" type="range" min="0" max="1" step="0.01" data-music-volume aria-label="Music volume" />
              </div>
            </div>
          </div>
        </div>
        <details class="rb-jukebox">
          <summary><span class="rb-jukebox-heading">Music Playlist</span><span class="rb-jukebox-queue" data-queue-count></span></summary>
          <div class="rb-jukebox-content">
            <nav class="rb-collections" aria-label="Music collections" data-collections></nav>
            <div class="rb-track-list" data-track-list aria-label="Tracks in collection"></div>
            <div class="rb-jukebox-lower">
              <section><h4>UP NEXT</h4><ol data-queue-list></ol></section>
              <section><h4>RECENT</h4><ol data-recent-list></ol></section>
            </div>
          </div>
        </details>
      </section>
    `;
    document.body.append(root);
    for (const [index, collection] of collections.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pixel-button";
      button.dataset.collection = collection.id;
      button.textContent = `${String(index + 1).padStart(2, "0")} ${collection.label}`;
      root.querySelector("[data-collections]").append(button);
    }
  }

  function bindEvents() {
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches("[data-music-seek]")) {
        commitSeek(target);
      } else if (target.matches("[data-music-volume]")) {
        setVolumeFromSlider(Number(target.value));
        saveSettings();
        applyVolume();
        render();
      }
    });
    document.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches("[data-music-seek]")) {
        if (state.seekPointerId === null) {
          state.seeking = true;
          previewSeek(target);
        }
      } else if (target.matches("[data-music-volume]")) {
        setVolumeFromSlider(Number(target.value));
        applyVolume();
        updateVolumeUi();
        updateSpeakerUi();
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (!(event.target instanceof HTMLInputElement) || !event.target.matches("[data-music-seek]")) return;
      event.preventDefault();
      state.seeking = true;
      state.seekPointerId = event.pointerId;
      event.target.focus({ preventScroll: true });
      setSeekFromPointer(event.target, event.clientX);
    });
    document.addEventListener("pointermove", (event) => {
      if (event.pointerId !== state.seekPointerId) return;
      const slider = document.querySelector("#rb-music-root [data-music-seek]");
      if (slider) setSeekFromPointer(slider, event.clientX);
    });
    document.addEventListener("pointerup", (event) => {
      if (event.pointerId !== state.seekPointerId) return;
      const slider = document.querySelector("#rb-music-root [data-music-seek]");
      state.seekPointerId = null;
      if (slider) commitSeek(slider);
    });
    document.addEventListener("pointercancel", (event) => {
      if (event.pointerId !== state.seekPointerId) return;
      state.seekPointerId = null;
      state.seeking = false;
      updateProgress();
    });
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const collectionButton = target.closest("[data-collection]");
      if (collectionButton) {
        selectCollection(collectionButton.dataset.collection);
        return;
      }
      const trackButton = target.closest("[data-track-id]");
      if (trackButton) {
        const track = state.tracks.find((item) => item.id === trackButton.dataset.trackId);
        if (track) {
          state.preferences.enabled = true;
          saveSettings();
          if (track.collection !== state.collection) state.collection = track.collection;
          if (!state.queue.includes(track.id)) {
            state.queue.splice(state.queueIndex + 1, 0, track.id);
          }
          state.queueIndex = state.queue.indexOf(track.id);
          void loadTrack(track, { autoplay: true });
        }
        return;
      }
      const action = target.closest("[data-music-action]")?.dataset.musicAction;
      switch (action) {
        case "open": setPlayerOpen(true); break;
        case "close": setPlayerOpen(false); break;
        case "toggle":
          if (state.playing) {
            pausePlayback();
          } else {
            state.preferences.enabled = true;
            saveSettings();
            void startPlayback();
          }
          break;
        case "previous": previousTrack(); break;
        case "next": void nextTrack(); break;
        case "mute": toggleMute(); break;
        case "shuffle":
          state.preferences.shuffle = !state.preferences.shuffle;
          saveSettings();
          rebuildQueue();
          render();
          break;
        case "repeat":
          state.preferences.repeat = supportedRepeatModes[
            (supportedRepeatModes.indexOf(state.preferences.repeat) + 1) % supportedRepeatModes.length
          ];
          saveSettings();
          render();
          break;
        default: break;
      }
    });
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      if (
        event.altKey || event.ctrlKey || event.metaKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)))
      ) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (state.playing) {
          state.preferences.enabled = false;
          saveSettings();
          pausePlayback();
        } else {
          state.preferences.enabled = true;
          saveSettings();
          void startPlayback();
        }
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        void nextTrack();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        previousTrack();
      } else if (event.key.toLowerCase() === "m") {
        toggleMute();
      }
    });
    addEventListener("radiantblaze:contentchange", () => syncRoute());
    addEventListener("popstate", () => queueMicrotask(syncRoute));
    addEventListener("pageshow", retryAutomaticPlayback);
    document.addEventListener("visibilitychange", retryAutomaticPlayback);
    interceptHistoryRouteChanges();
    bindAutoplayGestureFallback();
    setupMediaSession();
    bindAudioEvents(audio);
  }

  function bindAutoplayGestureFallback() {
    const gestureStarts = new Map();
    let lastTouchPointerPlayback = -Infinity;
    const MIN_SWIPE_DISTANCE = 50;
    const activationDiagnostics = (type, event) => {
      if (!navigator.userActivation) return;
      console.debug("[radiant-blaze:music] Gesture activation.", {
        type,
        pointerType: event?.pointerType || event?.type || "",
        trusted: event?.isTrusted === true,
        userActivation: navigator.userActivation.isActive,
      });
    };
    const retryFromGesture = (event) => {
      if (event && event.isTrusted === false) return;
      if (!state.autoplayRequested || !audio.paused || !state.autoplayBlocked) return;
      state.autoplayBlocked = false;
      state.playbackState = PLAYBACK_STATES.READY;
      requestPlaybackWhenReady();
    };
    const beginPointerGesture = (event) => {
      if (event.isTrusted === false) return;
      gestureStarts.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    };
    const retryFromPointerDown = (event) => {
      beginPointerGesture(event);
      if (event.pointerType === "mouse" || event.pointerType === "pen" || event.pointerType === "") {
        activationDiagnostics("pointerdown", event);
        retryFromGesture(event);
      }
    };
    const retryFromTouchPointer = (event) => {
      if (event.isTrusted === false) return;
      const start = gestureStarts.get(event.pointerId);
      gestureStarts.delete(event.pointerId);
      if (!start) return;
      const diffX = event.clientX - start.x;
      const diffY = event.clientY - start.y;
      const isTap = Math.hypot(diffX, diffY) <= 12;
      const isSwipe = Math.max(Math.abs(diffX), Math.abs(diffY)) >= MIN_SWIPE_DISTANCE;
      if (!isTap && !isSwipe) return;
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        lastTouchPointerPlayback = performance.now();
        activationDiagnostics("pointerup", event);
        retryFromGesture(event);
      }
    };
    const retryFromClick = (event) => {
      if (event.isTrusted === false || event.pointerType === "touch") return;
      activationDiagnostics("click", event);
      retryFromGesture(event);
    };
    const rememberTouchStart = (event) => {
      if (event.isTrusted === false || event.changedTouches.length === 0) return;
      const touch = event.changedTouches[0];
      gestureStarts.set(`touch:${touch.identifier}`, {
        x: touch.clientX,
        y: touch.clientY,
      });
    };
    const retryFromTouchEnd = (event) => {
      if (event.isTrusted === false || event.changedTouches.length === 0) return;
      if ("PointerEvent" in window && performance.now() - lastTouchPointerPlayback < 750) return;
      const touch = event.changedTouches[0];
      const start = gestureStarts.get(`touch:${touch.identifier}`);
      gestureStarts.delete(`touch:${touch.identifier}`);
      if (start) {
        const horizontalDistance = Math.abs(touch.clientX - start.x);
        const verticalDistance = Math.abs(touch.clientY - start.y);
        if (Math.max(horizontalDistance, verticalDistance) > 12 &&
          Math.max(horizontalDistance, verticalDistance) < MIN_SWIPE_DISTANCE) return;
      }
      activationDiagnostics("touchend", event);
      retryFromGesture(event);
    };
    const retryFromKeyboard = (event) => {
      if (event.isTrusted === false) return;
      activationDiagnostics("keydown", event);
      retryFromGesture(event);
    };
    const cancelPointerGesture = (event) => {
      if (event.isTrusted === false) return;
      gestureStarts.delete(event.pointerId);
    };
    const cancelTouchGesture = (event) => {
      if (event.isTrusted === false || event.changedTouches.length === 0) return;
      const touch = event.changedTouches[0];
      gestureStarts.delete(`touch:${touch.identifier}`);
    };
    document.addEventListener("pointerdown", retryFromPointerDown, { passive: true });
    document.addEventListener("touchstart", rememberTouchStart, { passive: true });
    document.addEventListener("touchend", retryFromTouchEnd, { passive: true });
    document.addEventListener("touchcancel", cancelTouchGesture, { passive: true });
    document.addEventListener("click", retryFromClick, { passive: true });
    document.addEventListener("keydown", retryFromKeyboard);
    if ("PointerEvent" in window) {
      document.addEventListener("pointerup", retryFromTouchPointer, { passive: true });
      document.addEventListener("pointercancel", cancelPointerGesture, { passive: true });
    }
    removeAutoplayGestureFallback = () => {
      document.removeEventListener("pointerdown", retryFromPointerDown);
      document.removeEventListener("touchstart", rememberTouchStart);
      document.removeEventListener("touchend", retryFromTouchEnd);
      document.removeEventListener("touchcancel", cancelTouchGesture);
      document.removeEventListener("click", retryFromClick);
      document.removeEventListener("pointerup", retryFromTouchPointer);
      document.removeEventListener("keydown", retryFromKeyboard);
      document.removeEventListener("pointercancel", cancelPointerGesture);
      removeAutoplayGestureFallback = () => {};
    };
  }

  function interceptHistoryRouteChanges() {
    for (const method of ["pushState", "replaceState"]) {
      if (history[method].__radiantBlazeRouteInterceptor) continue;
      const original = history[method];
      const intercepted = function (...args) {
        const result = original.apply(this, args);
        queueMicrotask(syncRoute);
        return result;
      };
      intercepted.__radiantBlazeRouteInterceptor = true;
      history[method] = intercepted;
    }
  }

  function bindAudioEvents(element) {
    if (audioListeners.has(element)) return;
    audioListeners.add(element);
    element.addEventListener("loadedmetadata", () => {
      if (element !== audio) return;
      console.info("[radiant-blaze:music] Media metadata loaded.", state.current?.title || "");
      synchronizePlaybackState("metadata");
    });
    element.addEventListener("loadeddata", () => {
      if (element !== audio) return;
      console.info("[radiant-blaze:music] Audio loading completed.", state.current?.title || "");
      synchronizePlaybackState("data");
    });
    element.addEventListener("playing", () => {
      if (element !== audio) return;
      removeAutoplayGestureFallback();
      setPlaybackState(PLAYBACK_STATES.PLAYING);
      state.autoplayPrompt = false;
      state.autoplayBlocked = false;
      state.autoplayRetryCount = 0;
      state.autoplayRequested = false;
      console.info("[radiant-blaze:music] Playback started.", state.current?.title || "");
      startVisualizer();
      scheduleNextTrackPreload();
      render();
    });
    element.addEventListener("pause", () => {
      if (element !== audio) return;
      if (state.playbackState !== PLAYBACK_STATES.ERROR && state.playbackState !== PLAYBACK_STATES.BLOCKED) {
        setPlaybackState(PLAYBACK_STATES.PAUSED);
      }
      stopVisualizer();
      render();
    });
    element.addEventListener("waiting", () => {
      if (element !== audio) return;
      setPlaybackState(PLAYBACK_STATES.LOADING);
      render();
    });
    element.addEventListener("canplay", () => {
      if (element !== audio) return;
      setPlaybackState(PLAYBACK_STATES.READY);
      console.info("[radiant-blaze:music] canplay received.", state.current?.title || "");
      synchronizePlaybackState("canplay");
      render();
    });
    element.addEventListener("stalled", () => {
      if (element !== audio || state.playing) return;
      setPlaybackState(PLAYBACK_STATES.LOADING);
      render();
    });
    element.addEventListener("timeupdate", () => {
      if (element === audio) updateProgress();
    });
    element.addEventListener("durationchange", () => {
      if (element === audio) updateProgress();
    });
    element.addEventListener("ended", () => {
      if (element !== audio) return;
      if (state.preferences.repeat === "one") {
        audio.currentTime = 0;
        void startPlayback();
      } else {
        void nextTrack();
      }
    });
    element.addEventListener("error", () => {
      if (element !== audio) return;
      if (!state.current) return;
      setPlaybackState(PLAYBACK_STATES.ERROR);
      console.warn(`[radiant-blaze:music] Skipping unavailable track "${state.current.path}".`);
      state.failed.add(state.current.id);
      state.loading = false;
      void nextTrack({ skipFailed: true });
    });
  }

  function setPlaybackState(nextState) {
    state.playbackState = nextState;
    state.loading = [
      PLAYBACK_STATES.INITIALIZING,
      PLAYBACK_STATES.LOADING,
      PLAYBACK_STATES.ATTEMPTING,
    ].includes(nextState);
    state.playing = nextState === PLAYBACK_STATES.PLAYING;
    updateMediaSession();
  }

  function synchronizePlaybackState(source) {
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      setPlaybackState(audio.paused ? PLAYBACK_STATES.READY : PLAYBACK_STATES.PLAYING);
      requestPlaybackWhenReady();
    } else if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      setPlaybackState(PLAYBACK_STATES.LOADING);
    }
    if (source === "metadata" && state.autoplayRequested) requestPlaybackWhenReady();
    render();
  }

  function retryAutomaticPlayback() {
    if (!state.autoplayRequested || !state.preferences.enabled || document.hidden) return;
    if (state.autoplayRetryCount >= 3 || state.autoplayAttempting || !audio.paused) return;
    requestPlaybackWhenReady({ countRetry: true });
  }

  function requestPlaybackWhenReady({ countRetry = false } = {}) {
    if (!state.autoplayRequested || !state.preferences.enabled || document.hidden) return;
    if (state.autoplayBlocked && state.playbackState === PLAYBACK_STATES.BLOCKED) return;
    if (!audio.paused || state.autoplayAttempting) return;
    if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
    if (countRetry) {
      if (state.autoplayRetryCount >= 3) return;
      state.autoplayRetryCount += 1;
    }
    state.autoplayAttempting = true;
    const loadId = state.loadId;
    setPlaybackState(PLAYBACK_STATES.ATTEMPTING);
    console.info("[radiant-blaze:music] Playback attempt.", state.current?.title || "");
    try {
      state.loading = true;
      render();
      const playbackPromise = audio.play();
      void ensureAudioGraph().catch((error) => {
        console.warn("[radiant-blaze:music] Visualization audio could not be initialized.", error);
      });
      void playbackPromise.then(() => {
        if (loadId !== state.loadId) return;
        state.autoplayAttempting = false;
        if (!audio.paused) console.info("[radiant-blaze:music] Playback succeeded.", state.current?.title || "");
      }).catch((error) => {
        if (loadId !== state.loadId) return;
        state.autoplayAttempting = false;
        console.debug("[radiant-blaze:music] Playback rejected.", error?.name || error);
        handlePlayFailure(error);
      });
    } catch (error) {
      if (loadId !== state.loadId) return;
      handlePlayFailure(error);
    }
  }

  function setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => void startPlayback());
    navigator.mediaSession.setActionHandler("pause", () => pausePlayback());
    navigator.mediaSession.setActionHandler("previoustrack", () => previousTrack());
    navigator.mediaSession.setActionHandler("nexttrack", () => void nextTrack());
  }

  function updateMediaSession() {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = state.current && typeof MediaMetadata !== "undefined"
      ? new MediaMetadata({
          title: state.current.title,
          artist: state.current.artist,
          album: collections.find((item) => item.id === state.collection)?.label || state.collection,
        })
      : null;
    navigator.mediaSession.playbackState = state.playing ? "playing" : "paused";
  }

  function syncRoute() {
    const nextCollection = routeCollection();
    const routePath = location.pathname;
    if (lastSyncedRoute === routePath) return;
    lastSyncedRoute = routePath;
    // Once playback is active, navigation must not replace the track or interrupt
    // its position. The route can update again when playback is paused.
    if (state.playing || !audio.paused) return;
    if (nextCollection !== state.collection) {
      selectCollection(nextCollection, { autoplay: state.preferences.enabled });
    } else if (state.current) {
      if (state.preferences.enabled && audio.paused) {
        state.autoplayRequested = true;
        state.autoplayBlocked = false;
        state.autoplayRetryCount = 0;
      }
      retryAutomaticPlayback();
    }
  }

  function shuffled(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function collectionTracks(id = state.collection) {
    return state.tracks.filter((track) => track.collection === id && !state.failed.has(track.id));
  }

  function buildQueue(avoidId = state.current?.id) {
    const tracks = collectionTracks();
    state.queue = state.preferences.shuffle ? shuffled(tracks).map((track) => track.id) : tracks.map((track) => track.id);
    if (tracks.length > 1 && state.queue[0] === avoidId) {
      const alternative = 1 + Math.floor(Math.random() * (state.queue.length - 1));
      [state.queue[0], state.queue[alternative]] = [state.queue[alternative], state.queue[0]];
    }
    state.queueIndex = -1;
  }

  function rebuildQueue() {
    const currentId = state.current?.id;
    buildQueue(currentId);
    if (currentId) {
      state.queue = state.queue.filter((id) => id !== currentId);
      state.queue.unshift(currentId);
      state.queueIndex = 0;
    }
    if (state.playing) scheduleNextTrackPreload();
  }

  function activateCollection(id, { autoplay = state.preferences.enabled } = {}) {
    state.collection = collections.some((collection) => collection.id === id) ? id : collections[0].id;
    state.failed.clear();
    buildQueue(state.current?.id);
    const nextId = state.queue[0];
    if (!nextId) {
      state.current = null;
      audio.pause();
      state.loading = false;
      render();
      return;
    }
    state.queueIndex = 0;
    const track = state.tracks.find((item) => item.id === nextId);
    if (track) {
      selectTrackMetadata(track);
      if (autoplay) void loadTrack(track, { autoplay: true });
    }
  }

  function selectCollection(id, { autoplay = state.preferences.enabled } = {}) {
    if (id === state.collection || !collections.some((collection) => collection.id === id)) return;
    state.collection = id;
    activateCollection(id, { autoplay });
  }

  function appendHistory(track) {
    if (state.history[state.historyIndex]?.id === track.id) return;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(track);
    if (state.history.length > 30) state.history.shift();
    state.historyIndex = state.history.length - 1;
  }

  function selectTrackMetadata(track) {
    state.current = track;
    state.collection = track.collection;
    state.loading = false;
    render();
  }

  async function loadTrack(track, { position = 0, autoplay = state.preferences.enabled, record = true } = {}) {
    if (!track || state.failed.has(track.id)) return;
    const loadId = ++state.loadId;
    state.current = track;
    state.collection = track.collection;
    state.loading = true;
    setPlaybackState(PLAYBACK_STATES.LOADING);
    state.autoplayPrompt = false;
    state.autoplayRequested = Boolean(autoplay && state.preferences.enabled);
    state.autoplayBlocked = false;
    state.autoplayRetryCount = 0;
    state.autoplayAttempting = false;
    clearNextTrackPreload();
    console.info("[radiant-blaze:music] Track loading.", track.title);
    if (record) appendHistory(track);
    render();
    audio.dataset.trackId = track.id;
    audio.pause();
    audio.src = track.src;
    audio.load();
    audio.addEventListener("loadedmetadata", function restorePosition() {
      audio.removeEventListener("loadedmetadata", restorePosition);
      if (loadId !== state.loadId) return;
      const duration = getDuration();
      if (position > 0 && duration > 0) {
        audio.currentTime = Math.min(position, Math.max(0, duration - 0.25));
      }
      updateProgress();
      if (!autoplay || !state.preferences.enabled) {
        state.loading = false;
        render();
      }
      requestPlaybackWhenReady();
    });
    if (autoplay && state.preferences.enabled) {
      void ensureAudioGraph().catch((error) => {
        console.warn("[radiant-blaze:music] Visualization audio could not be initialized.", error);
      });
      requestPlaybackWhenReady();
    }
  }

  function clearNextTrackPreload() {
    state.preloadLink?.remove();
    state.preloadLink = null;
  }

  function scheduleNextTrackPreload() {
    clearNextTrackPreload();
    if (!state.playing || !state.current || state.preferences.repeat === "one") return;
    const next = getNextQueueTrack()?.track;
    if (!next || next.id === state.current.id || state.failed.has(next.id)) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "audio";
    link.fetchPriority = "low";
    link.href = next.src;
    link.dataset.radiantBlazeMusicPreload = next.id;
    document.head.append(link);
    state.preloadLink = link;
  }

  async function ensureAudioGraph() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      applyVolume();
      return;
    }
    if (!state.context) {
      state.context = new AudioContextConstructor();
    }
    if (!audioGraphs.has(audio)) {
      const mediaSource = state.context.createMediaElementSource(audio);
      const analyser = state.context.createAnalyser();
      analyser.fftSize = 64;
      const gain = state.context.createGain();
      mediaSource.connect(analyser);
      analyser.connect(gain);
      gain.connect(state.context.destination);
      audioGraphs.set(audio, { mediaSource, analyser, gain });
    }
    Object.assign(state, audioGraphs.get(audio));
    if (state.context.state === "suspended") {
      void state.context.resume().catch((error) => {
        console.warn("[radiant-blaze:music] Audio context could not resume.", error);
      });
    }
    if (!state.context.__radiantBlazeStateListener) {
      state.context.__radiantBlazeStateListener = true;
      state.context.addEventListener("statechange", () => {
        if (state.context.state === "running" && !audio.paused) return;
        if (state.context.state === "running" && state.autoplayPrompt) retryAutomaticPlayback();
      });
    }
    applyVolume();
  }

  async function startPlayback() {
    if (!state.preferences.enabled) return;
    if (!state.tracks.length) {
      try {
        await loadManifest();
      } catch (error) {
        console.warn("[radiant-blaze:music] Playback unavailable because the manifest could not be loaded.", error);
        return;
      }
    }
    if (!state.current) {
      const tracks = collectionTracks();
      if (!tracks.length) {
        render();
        return;
      }
      if (!state.queue.length) buildQueue(null);
      const first = state.tracks.find((track) => track.id === state.queue[0]) || tracks[0];
      state.queueIndex = Math.max(0, state.queue.indexOf(first.id));
      void loadTrack(first, { autoplay: true });
      return;
    }
    if (audio.dataset.trackId !== state.current.id || !audio.src) {
      void loadTrack(state.current, { autoplay: true });
      return;
    }
    try {
      state.loading = true;
      render();
      void ensureAudioGraph().catch((error) => {
        console.warn("[radiant-blaze:music] Visualization audio could not be initialized.", error);
      });
      state.autoplayRequested = true;
      state.autoplayBlocked = false;
      requestPlaybackWhenReady();
    } catch (error) {
      handlePlayFailure(error);
    }
  }

  function handlePlayFailure(error) {
    state.loading = false;
    state.playing = false;
    if (error?.name === "NotAllowedError") {
      state.autoplayPrompt = state.preferences.enabled;
      state.autoplayBlocked = true;
      console.warn("[radiant-blaze:music] Browser rejected playback; intent preserved.", error.message || error.name);
      setPlaybackState(PLAYBACK_STATES.BLOCKED);
    } else {
      if (error?.name !== "AbortError") {
        console.warn("[radiant-blaze:music] Playback could not start.", error);
      }
      state.autoplayPrompt = false;
      state.autoplayRequested = false;
      state.autoplayBlocked = false;
      setPlaybackState(error?.name === "AbortError" ? PLAYBACK_STATES.PAUSED : PLAYBACK_STATES.ERROR);
    }
    console.warn("[radiant-blaze:music] Playback failed.", error?.name || "UnknownError", error?.message || "");
    render();
  }

  function pausePlayback() {
    audio.pause();
    state.loading = false;
    state.playing = false;
    state.autoplayRequested = false;
    state.autoplayAttempting = false;
    state.autoplayPrompt = false;
    persistSession();
    render();
  }

  async function nextTrack({ skipFailed = false } = {}) {
    const tracks = collectionTracks();
    if (!tracks.length) {
      state.current = null;
      audio.pause();
      state.loading = false;
      render();
      return;
    }
    const next = getNextQueueTrack(skipFailed);
    const track = next?.track;
    if (!track) {
      state.current = null;
      state.loading = false;
      render();
      return;
    }
    state.queueIndex = next.index;
    await loadTrack(track, { autoplay: state.preferences.enabled });
  }

  function getNextQueueTrack(skipFailed = false) {
    if (!state.queue.length) buildQueue(state.current?.id);
    const playlist = state.queue.filter((id) => !state.failed.has(id));
    if (!playlist.length) return { index: -1, track: null };
    const currentId = state.current?.id;
    let currentIndex = playlist.indexOf(currentId);
    if (currentIndex < 0) currentIndex = Math.max(0, state.queueIndex);
    const nextIndexInPlaylist = (currentIndex + 1) % playlist.length;
    return {
      index: state.queue.indexOf(playlist[nextIndexInPlaylist]),
      track: state.tracks.find((item) => item.id === playlist[nextIndexInPlaylist]),
    };
  }

  function previousTrack() {
    if (!state.queue.length) buildQueue(state.current?.id);
    const playlist = state.queue.filter((id) => !state.failed.has(id));
    if (!playlist.length) return;
    const currentId = state.current?.id;
    let currentIndex = playlist.indexOf(currentId);
    if (currentIndex < 0) currentIndex = Math.max(0, state.queueIndex);
    const previousIndexInPlaylist = (currentIndex - 1 + playlist.length) % playlist.length;
    const track = state.tracks.find((item) => item.id === playlist[previousIndexInPlaylist]);
    if (!track) return;
    state.queueIndex = state.queue.indexOf(track.id);
    void loadTrack(track, { autoplay: state.preferences.enabled });
  }

  function toggleMute() {
    if (state.muted || state.preferences.volume === 0) {
      state.muted = false;
      if (state.preferences.volume === 0) {
        state.preferences.volume = state.previousVolume || defaults.volume;
      } else if (state.previousVolume !== null) {
        state.preferences.volume = state.previousVolume;
      }
      state.previousVolume = null;
    } else {
      state.previousVolume = state.preferences.volume;
      state.muted = true;
    }
    saveSettings();
    applyVolume();
    render();
  }

  function setVolumeFromSlider(volume) {
    if (volume === 0 && state.preferences.volume > 0) {
      state.previousVolume = state.preferences.volume;
    } else if (volume > 0) {
      state.previousVolume = null;
    }
    state.preferences.volume = volume;
    state.muted = false;
  }

  function applyVolume() {
    setOutputVolume(state.muted ? 0 : state.preferences.volume);
  }

  function setOutputVolume(volume, element = audio) {
    const graph = audioGraphs.get(element);
    if (graph && state.context) graph.gain.gain.setTargetAtTime(volume, state.context.currentTime, 0.025);
    else element.volume = volume;
  }

  function setPlayerOpen(open) {
    const player = document.getElementById("rb-music-player");
    if (!player) return;
    clearTimeout(state.playerCloseTimer);
    state.playerCloseTimer = 0;
    if (open) {
      player.hidden = false;
      player.classList.remove("is-closing");
    } else if (!player.hidden) {
      player.classList.add("is-closing");
      state.playerCloseTimer = window.setTimeout(() => {
        player.hidden = true;
        player.classList.remove("is-closing");
        state.playerCloseTimer = 0;
      }, 140);
    }
    document.querySelector('[data-music-action="open"]')?.setAttribute("aria-expanded", String(open));
    if (open) document.querySelector('[data-music-action="close"]')?.focus();
    else document.querySelector('[data-music-action="open"]')?.focus();
  }

  function startVisualizer() {
    stopVisualizer();
    const root = document.getElementById("rb-music-root");
    const bars = [...(root?.querySelectorAll("[data-visualizer] i") || [])];
    if (!bars.length) return;
    if (!state.analyser) {
      root.classList.add("rb-music--playing");
      return;
    }
    root.classList.add("rb-music--playing");
    const values = new Uint8Array(state.analyser.frequencyBinCount);
    const draw = () => {
      if (!state.playing) return;
      state.analyser.getByteFrequencyData(values);
      bars.forEach((bar, index) => {
        bar.style.setProperty("--bar-level", `${Math.max(3, values[index * 2] / 255 * 100)}%`);
      });
      state.visualizerFrame = requestAnimationFrame(draw);
    };
    state.visualizerFrame = requestAnimationFrame(draw);
  }

  function stopVisualizer() {
    if (state.visualizerFrame) cancelAnimationFrame(state.visualizerFrame);
    state.visualizerFrame = 0;
    document.getElementById("rb-music-root")?.classList.remove("rb-music--playing");
  }

  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) return "0:00";
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function updateProgress() {
    const root = document.getElementById("rb-music-root");
    if (!root) return;
    const seek = root.querySelector("[data-music-seek]");
    const duration = getDuration();
    if (seek && !state.seeking) {
      const progress = duration ? Math.min(100, audio.currentTime / duration * 100) : 0;
      seek.value = String(Math.round(progress * 10));
      seek.max = "1000";
      setSliderProgress(seek, progress);
      seek.setAttribute("aria-valuetext", `${formatTime(audio.currentTime)} of ${formatTime(duration)}`);
    }
    if (!state.seeking) root.querySelector("[data-current-time]").textContent = formatTime(audio.currentTime);
    root.querySelector("[data-duration]").textContent = formatTime(duration);
    const upcomingCount = state.queue.slice(state.queueIndex + 1).filter((id) => !state.failed.has(id)).length;
    root.querySelector("[data-queue-count]").textContent = upcomingCount ? `· ${upcomingCount} UP NEXT` : "";
  }

  function getDuration() {
    if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    return Number.isFinite(state.current?.duration) && state.current.duration > 0
      ? state.current.duration
      : 0;
  }

  function getSeekTime(slider) {
    const duration = getDuration();
    if (duration <= 0) return null;
    const maximum = Number(slider.max) || 1000;
    const progress = Math.min(1, Math.max(0, Number(slider.value) / maximum));
    return { duration, progress, time: progress * duration };
  }

  function previewSeek(slider) {
    const seek = getSeekTime(slider);
    if (!seek) return;
    setSliderProgress(slider, seek.progress * 100);
    slider.setAttribute("aria-valuetext", `${formatTime(seek.time)} of ${formatTime(seek.duration)}`);
    document.querySelector("#rb-music-root [data-current-time]").textContent = formatTime(seek.time);
  }

  function setSeekFromPointer(slider, clientX) {
    const bounds = slider.getBoundingClientRect();
    const thumbWidth = 12;
    const usableWidth = Math.max(1, bounds.width - thumbWidth);
    const progress = Math.min(1, Math.max(0, (clientX - bounds.left - thumbWidth / 2) / usableWidth));
    const minimum = Number(slider.min) || 0;
    const maximum = Number(slider.max) || 1000;
    slider.value = String(Math.round(minimum + progress * (maximum - minimum)));
    previewSeek(slider);
  }

  function setSliderProgress(slider, progress) {
    const fill = slider.parentElement?.querySelector("[data-slider-fill]");
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  }

  function commitSeek(slider) {
    const seek = getSeekTime(slider);
    state.seeking = false;
    if (seek) audio.currentTime = seek.time;
    updateProgress();
  }

  function updateVolumeUi() {
    const root = document.getElementById("rb-music-root");
    if (!root) return;
    const slider = root.querySelector("[data-music-volume]");
    if (slider) {
      slider.value = String(state.preferences.volume);
      setSliderProgress(slider, state.preferences.volume * 100);
    }
  }

  function updateSpeakerUi() {
    const speaker = document.querySelector("#rb-music-root [data-music-action='mute']");
    if (!speaker) return;
    const isMuted = state.muted || state.preferences.volume === 0;
    const volumeLabel = isMuted ? "Unmute music" : state.preferences.volume < 0.5 ? "Mute music, low volume" : "Mute music, high volume";
    speaker.setAttribute("aria-label", volumeLabel);
    speaker.setAttribute("aria-pressed", String(isMuted));
    speaker.title = volumeLabel;
    speaker.classList.toggle("is-active", isMuted);
    speaker.querySelector(".rb-speaker-volume2").toggleAttribute("hidden", isMuted);
    speaker.querySelector(".rb-speaker-volume-x").toggleAttribute("hidden", !isMuted);
  }

  function addTrackButtons(container, tracks, emptyText, className = "") {
    container.replaceChildren();
    if (!tracks.length) {
      const empty = document.createElement("p");
      empty.className = "rb-music-empty";
      empty.textContent = emptyText;
      container.append(empty);
      return;
    }
    for (const track of tracks) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.trackId = track.id;
      button.className = className;
      button.classList.toggle("is-current", track.id === state.current?.id);
      button.setAttribute("aria-current", track.id === state.current?.id ? "true" : "false");
      const title = document.createElement("strong");
      title.textContent = track.title;
      const artist = document.createElement("small");
      artist.textContent = track.artist;
      button.append(title, artist);
      container.append(button);
    }
  }

  function render() {
    const root = document.getElementById("rb-music-root");
    if (!root) return;
    root.classList.toggle("rb-music--loading", state.loading);
    const current = state.current;
    const title = current?.title || "No tracks found";
    const artist = current?.artist || "Add music to a collection";
    root.querySelector("[data-track-title]").textContent = title;
    root.querySelector("[data-track-artist]").textContent = artist;
    root.querySelector('[data-music-action="open"]').title = `${title} — ${artist}; open player`;
    root.querySelector("[data-player-title]").textContent = title;
    root.querySelector("[data-player-title]").title = current?.title || title;
    root.querySelector("[data-player-artist]").textContent = artist;
    root.querySelector("[data-player-artist]").title = artist;
    if (current?.id && state.renderedTrackId && current.id !== state.renderedTrackId) {
      const nowPlaying = root.querySelector(".rb-music-now");
      nowPlaying.classList.remove("is-changing");
      void nowPlaying.offsetWidth;
      nowPlaying.classList.add("is-changing");
      clearTimeout(state.trackChangeTimer);
      state.trackChangeTimer = window.setTimeout(() => nowPlaying.classList.remove("is-changing"), 350);
    }
    state.renderedTrackId = current?.id || "";
    updateMediaSession();
    const collection = collections.find((item) => item.id === state.collection);
    root.querySelector("[data-collection-name]").textContent = collection?.label.toUpperCase() || "NO COLLECTION";
    root.querySelector("[data-play-status]").textContent = state.loading
      ? "LOAD"
      : state.playing ? "PLAY" : current ? "PAUSED" : "EMPTY";
    root.querySelector("[data-playback-icon]").setAttribute(
      "d",
      state.playing ? "M7 5h4v14H7zM15 5h4v14h-4z" : "M8 5v14l11-7z"
    );
    const playbackButton = root.querySelector('[data-music-action="toggle"]');
    playbackButton.setAttribute("aria-label", state.playing ? "Pause music" : "Play music");
    playbackButton.title = state.playing ? "Pause music" : "Play music";
    playbackButton.classList.toggle("is-playing", state.playing);
    root.querySelector('[data-music-action="shuffle"]').setAttribute("aria-pressed", String(state.preferences.shuffle));
    root.querySelector('[data-music-action="shuffle"]').setAttribute("aria-label", `Shuffle ${state.preferences.shuffle ? "on" : "off"}`);
    root.querySelector('[data-music-action="shuffle"]').title = `Shuffle ${state.preferences.shuffle ? "on" : "off"}`;
    root.querySelector('[data-music-action="shuffle"]').classList.toggle("is-active", state.preferences.shuffle);
    const repeatButton = root.querySelector('[data-music-action="repeat"]');
    const repeatLabel = `Repeat ${state.preferences.repeat}`;
    repeatButton.setAttribute("aria-pressed", String(state.preferences.repeat !== "off"));
    repeatButton.setAttribute("aria-label", repeatLabel);
    repeatButton.title = repeatLabel;
    root.querySelector("[data-repeat-badge]").hidden = state.preferences.repeat !== "one";
    repeatButton.classList.toggle("is-active", state.preferences.repeat !== "off");
    updateSpeakerUi();
    root.querySelector("[data-album-art]").replaceChildren();
    if (current?.artwork) {
      const image = document.createElement("img");
      image.src = current.artwork;
      image.alt = "";
      root.querySelector("[data-album-art]").append(image);
    } else {
      root.querySelector("[data-album-art]").textContent = "♫";
    }
    root.querySelectorAll("[data-collection]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.collection === state.collection);
      button.setAttribute("aria-pressed", String(button.dataset.collection === state.collection));
    });
    addTrackButtons(
      root.querySelector("[data-track-list]"),
      collectionTracks(),
      "No tracks in this collection.",
      "rb-track-row",
    );
    const upcoming = state.queue.slice(state.queueIndex + 1)
      .map((id) => state.tracks.find((track) => track.id === id))
      .filter((track) => track && !state.failed.has(track.id))
      .slice(0, 5);
    addTrackButtons(root.querySelector("[data-queue-list]"), upcoming, "Queue is empty.", "rb-track-row");
    addTrackButtons(root.querySelector("[data-recent-list]"), state.history.slice(-5).reverse(), "Nothing played yet.", "rb-track-row");
    updateVolumeUi();
    updateProgress();
  }

  window[INSTANCE_KEY] = {
    get audio() { return audio; },
    get state() { return state; },
    syncRoute,
    next: () => nextTrack(),
    previous: previousTrack,
    selectCollection,
    selectTrack: (id) => {
      const track = state.tracks.find((item) => item.id === id);
      if (track) {
        state.preferences.enabled = true;
        saveSettings();
        if (!state.queue.includes(track.id)) state.queue.splice(state.queueIndex + 1, 0, track.id);
        state.queueIndex = state.queue.indexOf(track.id);
        void loadTrack(track, { autoplay: true });
      }
    },
  };
})();
