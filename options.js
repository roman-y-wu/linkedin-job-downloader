document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const aiModeSelect = document.getElementById('aiMode');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  // Load saved settings
  try {
    const result = await chrome.storage.local.get('geminiSettings');
    const settings = result?.geminiSettings || {};
    if (settings.apiKey) apiKeyInput.value = settings.apiKey;
    if (settings.mode) aiModeSelect.value = settings.mode;
  } catch (_error) {
    // Ignore load errors.
  }

  saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const mode = aiModeSelect.value;

    if (mode !== 'off' && !apiKey) {
      statusEl.textContent = 'Please enter an API key when AI mode is enabled.';
      statusEl.className = 'status error';
      return;
    }

    try {
      await chrome.storage.local.set({
        geminiSettings: { apiKey, mode }
      });
      statusEl.textContent = 'Settings saved.';
      statusEl.className = 'status';
    } catch (error) {
      statusEl.textContent = 'Failed to save: ' + (error?.message || 'Unknown error');
      statusEl.className = 'status error';
    }
  });
});
