import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { codexEnvironment, scheduleLabel } from './scheduled-briefing.js';

const execute = promisify(execFile);
const project = resolve('.');
const directory = join(project, '.runtime');
const plist = join(homedir(), 'Library', 'LaunchAgents', `${scheduleLabel}.plist`);
const service = `gui/${process.getuid?.()}/${scheduleLabel}`;
const domain = `gui/${process.getuid?.()}`;

const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
async function findBinary(name: string): Promise<string> {
  for (const path of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(path, name);
    try { await access(candidate, 1); return candidate; } catch { /* 다음 경로 */ }
  }
  throw new Error(`${name} 실행 파일이 없습니다. 먼저 설치해 주세요.`);
}

async function main(): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('이 예약 등록 명령은 macOS용입니다.');
  process.umask(0o077);
  const command = process.argv[2];
  if (command === 'status') {
    try {
      const { stdout } = await execute('/bin/launchctl', ['print', service]);
      console.log(`예약 등록됨: ${scheduleLabel}\nMac 현지 시간 매일 18:00 (설치 시 Asia/Seoul 확인)`);
      console.log(stdout.split('\n').filter(line => /state =|runs =|last exit code =|"Hour" =>|"Minute" =>/.test(line)).join('\n'));
    } catch { console.log('예약 미등록'); }
    try { console.log(`최근 실행:\n${await readFile(join(directory, 'scheduler-status.json'), 'utf8')}`); }
    catch { console.log('아직 실행 기록이 없습니다.'); }
    return;
  }
  if (command === 'remove') {
    try { await execute('/bin/launchctl', ['bootout', service]); } catch { /* 이미 해제됐을 수 있음 */ }
    await rm(plist, { force: true });
    console.log('Mac 콘텐츠 해석·Telegram 예약을 해제했습니다. Railway 수집 일정은 별도입니다.');
    return;
  }
  if (command !== 'install') throw new Error('명령은 install, status, remove 중 하나여야 합니다.');
  if (new Intl.DateTimeFormat('en', { hour: 'numeric', timeZoneName: 'short' }).resolvedOptions().timeZone !== 'Asia/Seoul') {
    throw new Error('매일 한국시간 18:00 예약에는 Mac 시간대 Asia/Seoul이 필요합니다. 시스템 시간대를 확인해 주세요.');
  }
  const binary = await findBinary('codex');
  const login = await execute(binary, ['login', 'status'], { env: codexEnvironment(), timeout: 15000 });
  if (!/Logged in using ChatGPT/i.test(`${login.stdout}\n${login.stderr}`)) throw new Error('ChatGPT 계정으로 codex login을 먼저 진행해 주세요. API 키 인증은 사용하지 않습니다.');
  await access(join(project, 'node_modules', 'tsx'));
  await access(join(project, '.env'));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await mkdir(dirname(plist), { recursive: true });
  const path = [...new Set([dirname(process.execPath), dirname(binary), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(':');
  const argumentsList = ['/usr/bin/caffeinate', '-i', process.execPath, '--import', 'tsx', join(project, 'src', 'scheduled-briefing.ts')];
  const contents = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${scheduleLabel}</string>
<key>ProgramArguments</key><array>${argumentsList.map(item => `<string>${xml(item)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(project)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path)}</string><key>COUPANG_CODEX_BIN</key><string>${xml(binary)}</string><key>TZ</key><string>Asia/Seoul</string></dict>
<key>StartCalendarInterval</key><dict><key>Hour</key><integer>18</integer><key>Minute</key><integer>0</integer></dict>
<key>RunAtLoad</key><false/>
<key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(join(directory, 'scheduler.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(directory, 'scheduler-error.log'))}</string>
</dict></plist>\n`;
  await writeFile(plist, contents, { mode: 0o600 });
  await execute('/usr/bin/plutil', ['-lint', plist]);
  try { await execute('/bin/launchctl', ['bootout', service]); } catch { /* 처음 등록 */ }
  await execute('/bin/launchctl', ['enable', service]);
  await execute('/bin/launchctl', ['bootstrap', domain, plist]);
  await execute('/bin/launchctl', ['print', service]);
  console.log(`예약 등록·확인 완료: 매일 18:00 Asia/Seoul\n${plist}\nCodex 앱 실행은 필요 없습니다. ChatGPT 로그인과 켜져 있는 Mac이 필요합니다.`);
}

main().catch(() => {
  console.error('예약 관리에 실패했습니다. Mac 시간대·Codex ChatGPT 로그인·프로젝트 경로와 launchctl 상태를 확인해 주세요.');
  process.exitCode = 1;
});
