// Shared music controller. The preference is retained between pages, while
// playback begins only after a user action to respect browser audio policies.
(() => {
  const KEY = "radiant-blaze-music-enabled";
  let audioContext;
  let loopId;
  let isPlaying = false;

  const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46];
  const bass = [130.81, 130.81, 146.83, 146.83, 174.61, 174.61, 130.81, 130.81];

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
    const start = audioContext.currentTime + 0.03;
    melody.forEach((note, index) => {
      const time = start + index * 0.2;
      blip(note, time, 0.16, "square", 0.055);
      blip(bass[index], time, 0.18, "triangle", 0.075);
    });
  };

  addEventListener("DOMContentLoaded", () => {
    const updateButtons = () => {
      document.querySelectorAll("[data-audio-toggle]").forEach((button) => {
        button.setAttribute("aria-pressed", String(isPlaying));
        button.setAttribute("aria-label", isPlaying ? "Pause music" : "Play music");
      });
    };

    addEventListener("radiantblaze:contentchange", updateButtons);

    document.addEventListener("click", async (event) => {
      if (!event.target.closest("[data-audio-toggle]")) return;
      if (isPlaying) {
        window.clearInterval(loopId);
        isPlaying = false;
        localStorage.setItem(KEY, "false");
        updateButtons();
        return;
      }

      if (!audioContext) audioContext = new AudioContext();
      if (audioContext.state === "suspended") await audioContext.resume();
      window.clearInterval(loopId);
      playBar();
      loopId = window.setInterval(playBar, 1600);
      isPlaying = true;
      localStorage.setItem(KEY, "true");
      updateButtons();
    });

    // Keep the saved preference without auto-playing after navigation.
    if (localStorage.getItem(KEY) !== "true") localStorage.setItem(KEY, "false");
    updateButtons();
  });
})();
