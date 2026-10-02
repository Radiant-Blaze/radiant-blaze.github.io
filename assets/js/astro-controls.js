(() => {
  const THEME_KEY = "radiant-blaze-theme";
  const MUSIC_KEY = "radiant-blaze-music-enabled";
  const root = document.documentElement;
  let audioContext;
  let loopId;
  let isPlaying = false;

  const applyTheme = (theme) => {
    const light = theme === "light";
    root.classList.toggle("light-theme", light);
    root.classList.toggle("dark-theme", !light);
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const icon = button.querySelector(".theme-icon");
      if (icon) icon.textContent = light ? "\u263e" : "\u263c";
      button.setAttribute("aria-pressed", String(light));
      button.setAttribute("aria-label", `Switch to ${light ? "dark" : "light"} theme`);
    });
  };

  const updateAudioButtons = () => {
    document.querySelectorAll("[data-audio-toggle]").forEach((button) => {
      button.setAttribute("aria-pressed", String(isPlaying));
      button.setAttribute("aria-label", isPlaying ? "Pause music" : "Play music");
    });
  };

  const blip = (frequency, start, duration, type, volume) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  };

  const playBar = () => {
    const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46];
    const bass = [130.81, 130.81, 146.83, 146.83, 174.61, 174.61, 130.81, 130.81];
    const start = audioContext.currentTime + 0.03;
    melody.forEach((note, index) => {
      const time = start + index * 0.2;
      blip(note, time, 0.16, "square", 0.055);
      blip(bass[index], time, 0.18, "triangle", 0.075);
    });
  };

  applyTheme(localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark");

  addEventListener("DOMContentLoaded", () => {
    applyTheme(root.classList.contains("light-theme") ? "light" : "dark");
    updateAudioButtons();
    if (localStorage.getItem(MUSIC_KEY) !== "true") localStorage.setItem(MUSIC_KEY, "false");

    addEventListener("radiantblaze:contentchange", () => {
      applyTheme(root.classList.contains("light-theme") ? "light" : "dark");
      updateAudioButtons();
    });

    document.addEventListener("click", async (event) => {
      if (event.target.closest("[data-theme-toggle]")) {
        const next = root.classList.contains("light-theme") ? "dark" : "light";
        localStorage.setItem(THEME_KEY, next);
        applyTheme(next);
        return;
      }
      if (!event.target.closest("[data-audio-toggle]")) return;
      if (isPlaying) {
        window.clearInterval(loopId);
        isPlaying = false;
        localStorage.setItem(MUSIC_KEY, "false");
        updateAudioButtons();
        return;
      }
      if (!audioContext) audioContext = new AudioContext();
      if (audioContext.state === "suspended") await audioContext.resume();
      window.clearInterval(loopId);
      playBar();
      loopId = window.setInterval(playBar, 1600);
      isPlaying = true;
      localStorage.setItem(MUSIC_KEY, "true");
      updateAudioButtons();
    });
  });
})();