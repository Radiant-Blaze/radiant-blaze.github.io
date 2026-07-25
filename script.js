const themeToggle = document.querySelector("#theme-toggle");
const audioToggle = document.querySelector("#audio-toggle");
const body = document.body;
const themeStorageKey = "radiant-blaze-theme";

if (localStorage.getItem(themeStorageKey) === "light") {
  body.classList.replace("dark-theme", "light-theme");
}

const initialIsDark = body.classList.contains("dark-theme");
themeToggle.setAttribute(
  "aria-label",
  `Switch to ${initialIsDark ? "light" : "dark"} theme`,
);
themeToggle.querySelector("span").textContent = initialIsDark ? "☼" : "☾";

document.querySelector("#year").textContent = new Date().getFullYear();

themeToggle.addEventListener("click", () => {
  const isDark = body.classList.toggle("dark-theme");
  body.classList.toggle("light-theme", !isDark);
  localStorage.setItem(themeStorageKey, isDark ? "dark" : "light");
  themeToggle.setAttribute(
    "aria-label",
    `Switch to ${isDark ? "light" : "dark"} theme`,
  );
  themeToggle.querySelector("span").textContent = isDark ? "☼" : "☾";
});

let audioContext;
let loopId;
let isPlaying = false;

// A short loop built from square waves: no audio asset or download required.
const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46];
const bass = [130.81, 130.81, 146.83, 146.83, 174.61, 174.61, 130.81, 130.81];

function blip(frequency, start, duration, type, volume) {
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
}

function playBar() {
  const start = audioContext.currentTime + 0.03;
  melody.forEach((note, index) => {
    const time = start + index * 0.2;
    blip(note, time, 0.16, "square", 0.055);
    blip(bass[index], time, 0.18, "triangle", 0.075);
  });
}

function updateAudioButton() {
  audioToggle.setAttribute("aria-pressed", isPlaying);
  audioToggle.innerHTML = isPlaying
    ? '<span class="audio-icon" aria-hidden="true">♫</span> PAUSE'
    : '<span class="audio-icon" aria-hidden="true">♫</span> PLAY';
}

audioToggle.addEventListener("click", async () => {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") await audioContext.resume();

  isPlaying = !isPlaying;
  if (isPlaying) {
    playBar();
    loopId = window.setInterval(playBar, 1600);
  } else {
    window.clearInterval(loopId);
  }
  updateAudioButton();
});
