// Dark Mode Toggle Functionality

// Check for saved theme preference or default to light mode
function initializeDarkMode() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    enableDarkMode();
  } else {
    disableDarkMode();
  }
}

function enableDarkMode() {
  document.documentElement.classList.add('dark');
  localStorage.setItem('theme', 'dark');
  updateDarkModeIcon(true);
}

function disableDarkMode() {
  document.documentElement.classList.remove('dark');
  localStorage.setItem('theme', 'light');
  updateDarkModeIcon(false);
}

function updateDarkModeIcon(isDark) {
  const icon = document.getElementById('darkModeIcon');
  if (icon) {
    icon.textContent = isDark ? '☀️' : '🌙';
  }
}

function toggleDarkMode() {
  if (document.documentElement.classList.contains('dark')) {
    disableDarkMode();
  } else {
    enableDarkMode();
  }
}

// Initialize dark mode on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeDarkMode();

  // Add event listener to toggle button
  const toggleBtn = document.getElementById('darkModeToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleDarkMode);
  }

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    // Only auto-update if user hasn't manually set a preference
    if (!localStorage.getItem('theme')) {
      if (e.matches) {
        enableDarkMode();
      } else {
        disableDarkMode();
      }
    }
  });
});
