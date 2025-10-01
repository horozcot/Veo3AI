export async function generateNewCont(data) {
  console.log('[API Client NewCont] Calling /api/generate-new-cont with:', data);
  const payload = { ...data };
  if (payload.product !== undefined && String(payload.product).trim() === '') {
    delete payload.product;
  }
  const response = await fetch('/api/generate-new-cont', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to generate new continuation segments');
  }
  const result = await response.json();
  return result;
} 