export function naverCredentials(): { id: string; secret: string } {
  return {
    id: process.env.NAVER_CLIENT_ID?.trim() || process.env.NAVER_API_HUB_CLIENT_ID?.trim() || '',
    secret: process.env.NAVER_CLIENT_SECRET?.trim() || process.env.NAVER_API_HUB_CLIENT_SECRET?.trim() || ''
  };
}
