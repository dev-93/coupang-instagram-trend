export const TELEGRAM_PREFIX = '[쿠팡]';

export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function telegramText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed === TELEGRAM_PREFIX) throw new Error('Telegram 메시지가 비어 있습니다.');
  const message = trimmed.startsWith(TELEGRAM_PREFIX) ? trimmed : `${TELEGRAM_PREFIX} ${trimmed}`;
  // UTF-16 길이를 사용해 이모지가 있어도 API 제한보다 보수적으로 제한한다.
  if (message.length > 3900) throw new Error('Telegram 메시지가 너무 깁니다. 3,900자 이내로 줄이세요.');
  return message;
}

export class TelegramSendError extends Error {
  constructor(message: string, readonly deliveryUncertain: boolean) { super(message); }
}

export async function sendTelegram(text: string, parseMode?: 'HTML'): Promise<number> {
  return telegramRequest('sendMessage', text, parseMode);
}

export async function editTelegram(messageId: number, text: string, parseMode?: 'HTML'): Promise<number> {
  if (!Number.isInteger(messageId) || messageId <= 0) throw new Error('수정할 Telegram 메시지 ID가 올바르지 않습니다.');
  return telegramRequest('editMessageText', text, parseMode, messageId);
}

async function telegramRequest(method: 'sendMessage' | 'editMessageText', text: string, parseMode?: 'HTML', messageId?: number): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID가 없습니다.');
  const message = telegramText(text);
  let response: Response;
  let body: { ok?: boolean; error_code?: number; result?: { message_id?: number } };
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(messageId === undefined ? {} : { message_id: messageId }),
        link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(20000)
    });
    body = await response.json() as typeof body;
  } catch {
    // 원래 예외에는 봇 토큰이 들어간 URL이 포함될 수 있으므로 그대로 출력하지 않는다.
    throw new TelegramSendError('Telegram 연결 실패 또는 응답 확인 실패. 중복을 피하려고 자동 재전송하지 않습니다.', true);
  }
  if (!response.ok || !body.ok) {
    const code = response.ok ? body.error_code ?? 0 : response.status;
    const hint = code === 401 ? '봇 토큰을 확인하세요.' : code === 403 ? '봇을 차단했는지 확인하세요.' : code === 400 ? '봇과 대화를 시작했는지, 채팅 ID가 맞는지 확인하세요.' : code === 429 ? '전송 제한입니다. 잠시 후 다시 시도하세요.' : '전송이 실패했습니다.';
    throw new TelegramSendError(`Telegram 오류 ${code}. ${hint}`, code >= 500 || code === 0);
  }
  if (!Number.isInteger(body.result?.message_id)) throw new TelegramSendError('Telegram 전송 결과 ID를 확인하지 못했습니다.', true);
  return body.result!.message_id!;
}
