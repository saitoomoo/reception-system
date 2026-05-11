// SHA-256 + reception_number をソルトにして PIN をハッシュ化 (R-003)
export const generatePinHash = async (pin: string, receptionNumber: string): Promise<string> => {
  const data = new TextEncoder().encode(pin + receptionNumber);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};
