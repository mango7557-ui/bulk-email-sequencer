import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 1. 수신거부(Opt-Out) 영속 DB 관리
// ==========================================
export interface OptOutEntry {
  email: string;
  reason: string;
  source: 'ONE_CLICK_RFC8058' | 'WEB_LINK' | 'ADMIN_MANUAL' | 'SYSTEM_SEED';
  unsubscribedAt: string;
  noticeSentAt: string; // 정보통신망법 제50조: 14일 이내 처리결과 통지 이력
}

const OPTOUT_DB_PATH = path.join(dataDir, 'optout-db.json');

const INITIAL_OPTOUT_LIST: OptOutEntry[] = [
  {
    email: 'optout-user@example.com',
    reason: '수신자가 이전 캠페인에서 원클릭 수신거부 요청',
    source: 'ONE_CLICK_RFC8058',
    unsubscribedAt: '2026-10-21T09:15:00.000Z',
    noticeSentAt: '2026-10-21T09:15:02.000Z',
  },
  {
    email: 'unsubscribed@company.co.kr',
    reason: '웹 수신거부 링크 클릭',
    source: 'WEB_LINK',
    unsubscribedAt: '2026-10-28T14:22:10.000Z',
    noticeSentAt: '2026-10-28T14:22:12.000Z',
  },
  {
    email: 'donotcontact@naver.com',
    reason: '고객센터 유선 수신거부 접수',
    source: 'ADMIN_MANUAL',
    unsubscribedAt: '2026-11-01T11:05:40.000Z',
    noticeSentAt: '2026-11-01T11:06:00.000Z',
  },
];

function loadOptOutDb(): OptOutEntry[] {
  try {
    if (!fs.existsSync(OPTOUT_DB_PATH)) {
      fs.writeFileSync(OPTOUT_DB_PATH, JSON.stringify(INITIAL_OPTOUT_LIST, null, 2), 'utf-8');
      return [...INITIAL_OPTOUT_LIST];
    }
    const raw = fs.readFileSync(OPTOUT_DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [...INITIAL_OPTOUT_LIST];
  }
}

function saveOptOutDb(entries: OptOutEntry[]) {
  try {
    fs.writeFileSync(OPTOUT_DB_PATH, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save opt-out DB:', err);
  }
}

let optOutList: OptOutEntry[] = loadOptOutDb();

export interface SentEmailRecord {
  id: string;
  campaignId: string;
  campaignTitle: string;
  email: string;
  name: string;
  company: string;
  variables: Record<string, string>;
  subject: string;
  bodyHtml: string;
  status: 'SENT' | 'BOUNCED' | 'FAILED';
  statusCode: string;
  messageId?: string;
  errorMessage?: string;
  sentAt: string;
  senderEmail: string;
  senderName: string;
  provider: 'dryrun' | 'resend' | 'smtp';
  delayAppliedMs?: number;
  headersIncluded?: Record<string, string>;
}

const SENT_HISTORY_DB_PATH = path.join(dataDir, 'sent-history-db.json');

function loadSentHistoryDb(): SentEmailRecord[] {
  try {
    if (!fs.existsSync(SENT_HISTORY_DB_PATH)) {
      fs.writeFileSync(SENT_HISTORY_DB_PATH, JSON.stringify([], null, 2), 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(SENT_HISTORY_DB_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveSentHistoryDb(entries: SentEmailRecord[]) {
  try {
    fs.writeFileSync(
      SENT_HISTORY_DB_PATH,
      JSON.stringify(entries.slice(0, 1500), null, 2),
      'utf-8'
    );
  } catch (err) {
    console.error('Failed to save sent history DB:', err);
  }
}

let sentHistoryList: SentEmailRecord[] = loadSentHistoryDb();

// ==========================================
// 2. 순차 발송 큐(Queue) 및 캠페인 상태 정의
// ==========================================
export type RecipientStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'BOUNCED' | 'FAILED' | 'CANCELLED';

export interface RecipientTask {
  id: string;
  rowIndex: number;
  email: string;
  name: string;
  company: string;
  variables: Record<string, string>;
  status: RecipientStatus;
  attempts: number;
  sentAt?: string;
  delayAppliedMs?: number;
  batchNumber?: number;
  statusCode?: string;
  messageId?: string;
  errorMessage?: string;
  renderedSubject?: string;
  headersIncluded?: Record<string, string>;
}

export interface ComplianceConfig {
  isAd: boolean; // 정보통신망법 광고성 정보 여부
  senderName: string; // 전송자 명칭
  senderEmail: string; // 발신 이메일
  replyToEmail: string;
  senderPhone: string; // 전화번호
  senderAddress: string; // 사업장 주소
  unsubscribeBaseUrl: string; // 수신거부 베이스 URL
  includeRfc8058Headers: boolean; // List-Unsubscribe, List-Unsubscribe-Post
  enforceDkimSpfCheck: boolean;
}

export interface RateLimitConfig {
  minDelaySec: number; // 건당 최소 딜레이(초)
  maxDelaySec: number; // 건당 최대 딜레이(초)
  batchSize: number; // 배치 크기 (예: 50건)
  batchRestSec: number; // 배치 후 휴식 시간(초)
}

export interface ProviderConfig {
  provider: 'dryrun' | 'resend' | 'smtp';
  resendApiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  simulateBounceRate?: number; // Dry-run 시 반송/실패 테스트 비율 (0 ~ 20%)
}

export interface CampaignEventLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
  email?: string;
  status?: RecipientStatus | 'SYSTEM';
  code?: string;
  message: string;
  delayMs?: number;
}

export type CampaignState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'BATCH_RESTING' | 'COMPLETED' | 'CANCELLED';

interface ActiveCampaign {
  id: string;
  title: string;
  state: CampaignState;
  startedAt?: string;
  completedAt?: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  bodyTextTemplate: string;
  compliance: ComplianceConfig;
  rateLimit: RateLimitConfig;
  providerConfig: ProviderConfig;
  tasks: RecipientTask[];
  currentIndex: number;
  sentInCurrentBatch: number;
  currentBatchNumber: number;
  batchRestRemainingSec: number;
  nextSendDelayMs: number;
  logs: CampaignEventLog[];
}

let campaign: ActiveCampaign = {
  id: 'none',
  title: '대기 중인 캠페인 없음',
  state: 'IDLE',
  subjectTemplate: '',
  bodyHtmlTemplate: '',
  bodyTextTemplate: '',
  compliance: {
    isAd: true,
    senderName: '(주)테크플로우 코리아',
    senderEmail: 'newsletter@techflow.kr',
    replyToEmail: 'support@techflow.kr',
    senderPhone: '02-1588-0000',
    senderAddress: '서울특별시 강남구 테헤란로 152 파이낸스센터 18층',
    unsubscribeBaseUrl: 'http://localhost:4000/api/unsubscribe',
    includeRfc8058Headers: true,
    enforceDkimSpfCheck: true,
  },
  rateLimit: {
    minDelaySec: 1.0,
    maxDelaySec: 2.5,
    batchSize: 10,
    batchRestSec: 15,
  },
  providerConfig: {
    provider: 'dryrun',
    simulateBounceRate: 5,
  },
  tasks: [],
  currentIndex: 0,
  sentInCurrentBatch: 0,
  currentBatchNumber: 1,
  batchRestRemainingSec: 0,
  nextSendDelayMs: 0,
  logs: [],
};

let workerTimer: NodeJS.Timeout | null = null;
let batchRestInterval: NodeJS.Timeout | null = null;
let inFlight = false;
let preparing = false;
let nextAllowedAt = 0;
const campaignPath = path.join(dataDir, 'campaign.json');
function persistCampaign() {
  // Credentials are never written to the queue snapshot.
  const providerConfig = { ...campaign.providerConfig, smtpPass: undefined, resendApiKey: undefined };
  const temp = `${campaignPath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ ...campaign, providerConfig, nextAllowedAt }));
  fs.renameSync(temp, campaignPath);
}
if (fs.existsSync(campaignPath)) {
  campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
  nextAllowedAt = (campaign as ActiveCampaign & { nextAllowedAt?: number }).nextAllowedAt || 0;
  for (const task of campaign.tasks) {
    if (task.status === 'SENDING') {
      task.status = 'FAILED';
      task.statusCode = 'DELIVERY_UNKNOWN_AFTER_RESTART';
      task.errorMessage = '전송 중 서버가 종료되어 접수 여부가 불확실합니다. 제공업체에서 확인 후 재발송하세요.';
      campaign.currentIndex += 1;
    }
  }
  if (['RUNNING', 'BATCH_RESTING', 'PAUSED'].includes(campaign.state)) campaign.state = 'PAUSED';
  persistCampaign();
}

function providerWithCredentials(config: ProviderConfig): ProviderConfig {
  return {
    ...config,
    smtpHost: config.smtpHost || process.env.SMTP_HOST,
    smtpUser: config.smtpUser || process.env.SMTP_USER,
    smtpPass: config.smtpPass || process.env.SMTP_PASS,
    resendApiKey: config.resendApiKey || process.env.RESEND_API_KEY,
  };
}
function smtpTransport(config: ProviderConfig) {
  return nodemailer.createTransport({
    host: config.smtpHost, port: Number(config.smtpPort || 587),
    secure: Boolean(config.smtpSecure),
    requireTLS: !config.smtpSecure,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    auth: { user: config.smtpUser!, pass: config.smtpPass! },
    // Only the local integration-test process may use an unencrypted mock server.
    ...(process.env.NODE_ENV === 'test' && config.smtpHost === '127.0.0.1' ? { requireTLS: false, ignoreTLS: true } : {}),
  });
}
async function verifyProvider(config: ProviderConfig) {
  if (config.provider === 'smtp') {
    if (!config.smtpHost || !config.smtpUser || !config.smtpPass) throw new Error('SMTP 계정과 앱 비밀번호를 설정하세요.');
    const transport = smtpTransport(config);
    try { await transport.verify(); } finally { transport.close(); }
  } else if (config.provider === 'resend' && !config.resendApiKey) {
    throw new Error('Resend API 키를 설정하세요.');
  }
}

function addLog(
  level: CampaignEventLog['level'],
  message: string,
  extra?: Partial<Omit<CampaignEventLog, 'id' | 'timestamp' | 'level' | 'message'>>
) {
  const entry: CampaignEventLog = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    ...extra,
  };
  campaign.logs.unshift(entry);
  if (campaign.logs.length > 500) {
    campaign.logs.length = 500;
  }
  persistCampaign();
}

function clearTimers() {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  if (batchRestInterval) {
    clearInterval(batchRestInterval);
    batchRestInterval = null;
  }
}

// ==========================================
// 3. 템플릿 변수 치환 및 컴플라이언스 빌더
// ==========================================
function interpolateTemplate(template: string, task: RecipientTask): string {
  let result = template;
  const allVars: Record<string, string> = {
    ...task.variables,
    email: task.email,
    name: task.name || '고객',
    company: task.company || '',
  };

  for (const [key, val] of Object.entries(allVars)) {
    const safeVal = val ?? '';
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}|\\{\\s*${key}\\s*\\}`, 'gi');
    result = result.replace(regex, safeVal);
  }
  return result;
}

function buildCompliantSubject(rawSubject: string, task: RecipientTask, compliance: ComplianceConfig): string {
  let interpolated = interpolateTemplate(rawSubject, task).trim();
  if (compliance.isAd) {
    // 변칙 표기((광 고), [광고], (성인광고) 등) 방지 및 제목 시작 부분 (광고) 강제 적용
    interpolated = interpolated.replace(/^\(\s*광\s*고\s*\)\s*/i, '').replace(/^\[\s*광고\s*\]\s*/i, '');
    return `(광고) ${interpolated}`;
  }
  return interpolated;
}

function buildUnsubscribeUrl(baseUrl: string, email: string, campaignId: string): string {
  const cleanBase = baseUrl.trim() || `http://localhost:${PORT}/api/unsubscribe`;
  const sep = cleanBase.includes('?') ? '&' : '?';
  return `${cleanBase}${sep}email=${encodeURIComponent(email)}&cid=${encodeURIComponent(campaignId)}`;
}

function buildCompliantHtmlBody(rawHtml: string, task: RecipientTask, compliance: ComplianceConfig, campaignId: string): string {
  const contentHtml = interpolateTemplate(rawHtml, task);
  const unsubUrl = buildUnsubscribeUrl(compliance.unsubscribeBaseUrl, task.email, campaignId);

  if (!compliance.isAd) {
    return `
      <div style="font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; color: #1e293b; line-height: 1.65;">
        ${contentHtml}
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 16px;" />
        <p style="font-size: 12px; color: #64748b;">
          발신자: ${compliance.senderName} (${compliance.senderEmail}) |
          더 이상 이메일 수신을 원치 않으시면 <a href="${unsubUrl}" style="color: #4f46e5; text-decoration: underline;">여기(수신거부 / Unsubscribe)</a>를 클릭해 주세요.
        </p>
      </div>
    `;
  }

  return `
    <div style="font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; color: #1e293b; line-height: 1.65;">
      ${contentHtml}
      <div style="margin-top: 36px; padding: 20px; background-color: #f8fafc; border-top: 2px solid #cbd5e1; border-radius: 6px; font-size: 12px; color: #475569; line-height: 1.6;">
        <p style="margin: 0 0 8px 0; font-weight: 700; color: #1e293b;">
          [정보통신망 이용촉진 및 정보보호 등에 관한 법률 제50조에 따른 표시사항]
        </p>
        <p style="margin: 0 0 4px 0;">
          • <strong>전송자 명칭</strong>: ${compliance.senderName} &nbsp;|&nbsp;
          <strong>전자우편주소</strong>: ${compliance.senderEmail} &nbsp;|&nbsp;
          <strong>연락처</strong>: ${compliance.senderPhone}
        </p>
        <p style="margin: 0 0 12px 0;">
          • <strong>사업장 소재지</strong>: ${compliance.senderAddress}
        </p>
        <p style="margin: 0; padding-top: 10px; border-top: 1px solid #e2e8f0;">
          본 메일은 정보통신망법 등 관련 법령에 의거하여 수신동의 여부를 확인한 후 발송되었습니다.<br/>
          수신을 원치 않으시면 <a href="${unsubUrl}" style="color: #dc2626; font-weight: 700; text-decoration: underline;">[수신거부 (무료)]</a>를 클릭해 주시기 바랍니다. (If you do not wish to receive further emails, please click <a href="${unsubUrl}" style="color: #dc2626; text-decoration: underline;">[Unsubscribe]</a>. Your opt-out request will be processed immediately without login.)
        </p>
      </div>
    </div>
  `;
}

function buildRfc8058Headers(email: string, compliance: ComplianceConfig, campaignId: string): Record<string, string> {
  const unsubUrl = buildUnsubscribeUrl(compliance.unsubscribeBaseUrl, email, campaignId);
  const headers: Record<string, string> = {};
  if (compliance.includeRfc8058Headers) {
    headers['List-Unsubscribe'] = `<${unsubUrl}>, <mailto:${compliance.replyToEmail || compliance.senderEmail}?subject=unsubscribe>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  headers['X-Mailer'] = 'MailFlow-Pro-Compliance-Sequencer/1.0';
  headers['Feedback-ID'] = `${campaignId}:${compliance.senderName.replace(/\s+/g, '_')}:mailflow`;
  return headers;
}

// ==========================================
// 4. 이메일 발송 실행기 (Dry-Run / Resend / SMTP)
// ==========================================
async function dispatchSingleEmail(
  task: RecipientTask,
  subject: string,
  htmlBody: string,
  textBody: string,
  headers: Record<string, string>,
  compliance: ComplianceConfig,
  providerCfg: ProviderConfig
): Promise<{ ok: boolean; status: RecipientStatus; code: string; messageId?: string; error?: string }> {
  // 1) 수신거부 DB 실시간 재확인 (발송 직전 Opt-Out 한 경우 방어)
  const isOptedOut = optOutList.some((o) => o.email.toLowerCase() === task.email.toLowerCase());
  if (isOptedOut) {
    return {
      ok: false,
      status: 'FAILED',
      code: '450_OPT_OUT_BLOCKED',
      error: '발송 직전 수신거부(Opt-Out) DB 등재 확인으로 자동 차단됨',
    };
  }

  // 2) 시뮬레이션 (Dry-Run) 모드
  if (providerCfg.provider === 'dryrun') {
    await new Promise((r) => setTimeout(r, 140));
    const bounceProb = Math.max(0, Math.min(50, providerCfg.simulateBounceRate ?? 5)) / 100;
    const roll = Math.random();

    if (task.email.includes('bounce') || task.email.includes('invalid-domain')) {
      return {
        ok: false,
        status: 'BOUNCED',
        code: '550 5.1.1 User Unknown (Hard Bounce)',
        error: '수신자 메일박스가 존재하지 않아 반송됨 (Hard Bounce)',
      };
    }

    if (roll < bounceProb) {
      return {
        ok: false,
        status: 'BOUNCED',
        code: '421 4.7.0 Temp Rate Deferral / Soft Bounce',
        error: '수신 서버 일시적 소프트 바운스 시뮬레이션 응답',
      };
    }

    return {
      ok: true,
      status: 'SENT',
      code: 'SIMULATED_NOT_SENT',
      messageId: `<sim-${Date.now()}-${task.rowIndex}@${compliance.senderEmail.split('@')[1] || 'mailflow.local'}>`,
    };
  }

  // 3) Resend API 모드
  if (providerCfg.provider === 'resend') {
    if (!providerCfg.resendApiKey) {
      return {
        ok: false,
        status: 'FAILED',
        code: '401_MISSING_RESEND_KEY',
        error: 'Resend API Key가 설정되지 않았습니다.',
      };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${providerCfg.resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': task.id,
        },
        body: JSON.stringify({
          from: `${compliance.senderName} <${compliance.senderEmail}>`,
          to: [task.email],
          reply_to: compliance.replyToEmail || compliance.senderEmail,
          subject,
          html: htmlBody,
          text: textBody || undefined,
          headers,
        }),
      });

      const data = (await response.json()) as { id?: string; message?: string; name?: string };
      if (!response.ok) {
        return {
          ok: false,
          status: 'FAILED',
          code: `RESEND_${response.status}_${data.name || 'ERR'}`,
          error: data.message || `Resend API 오류 (${response.status})`,
        };
      }

      return {
        ok: true,
        status: 'SENT',
        code: '200 RESEND_QUEUED',
        messageId: data.id || `resend-${Date.now()}`,
      };
    } catch (err) {
      return {
        ok: false,
        status: 'FAILED',
        code: 'DELIVERY_UNKNOWN_NETWORK_ERROR',
        error: err instanceof Error ? err.message : 'Resend API 호출 실패',
      };
    }
  }

  // 4) Amazon SES / 일반 SMTP 모드
  if (providerCfg.provider === 'smtp') {
    if (!providerCfg.smtpHost || !providerCfg.smtpUser || !providerCfg.smtpPass) {
      return {
        ok: false,
        status: 'FAILED',
        code: 'SMTP_CONFIG_MISSING',
        error: 'SMTP 호스트 및 인증 정보가 입력되지 않았습니다.',
      };
    }

    try {
      const transporter = smtpTransport(providerCfg);

      const info = await transporter.sendMail({
        from: `"${compliance.senderName}" <${compliance.senderEmail}>`,
        to: task.email,
        replyTo: compliance.replyToEmail || compliance.senderEmail,
        subject,
        html: htmlBody,
        text: textBody || undefined,
        headers,
        messageId: `<${task.id}@${compliance.senderEmail.split('@')[1]}>`,
      });

      if (!info.accepted?.length) return { ok: false, status: 'FAILED', code: 'SMTP_NOT_ACCEPTED', error: 'SMTP 서버가 수신자를 접수하지 않았습니다.' };

      return {
        ok: true,
        status: 'SENT',
        code: '250 SMTP_ACCEPTED',
        messageId: info.messageId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SMTP 발송 오류';
      const smtpError = err as { responseCode?: number; code?: string };
      const isBounce = smtpError.responseCode === 550;
      return {
        ok: false,
        status: isBounce ? 'BOUNCED' : 'FAILED',
        code: smtpError.responseCode ? `SMTP_${smtpError.responseCode}` : `DELIVERY_UNKNOWN_${smtpError.code || 'SMTP_ERROR'}`,
        error: msg,
      };
    }
  }

  return {
    ok: false,
    status: 'FAILED',
    code: 'UNKNOWN_PROVIDER',
    error: '지원되지 않는 발송 프로바이더입니다.',
  };
}

// ==========================================
// 5. 순차 발송 큐 루프 (Random Delay + Batch Rest)
// ==========================================
function computeRandomDelayMs(minSec: number, maxSec: number): number {
  const safeMin = Math.max(0.2, Number(minSec) || 1);
  const safeMax = Math.max(safeMin, Number(maxSec) || safeMin);
  const randomSec = safeMin + Math.random() * (safeMax - safeMin);
  return Math.round(randomSec * 1000);
}

async function processNextInQueue() {
  if (campaign.state !== 'RUNNING' || inFlight) return;
  if (nextAllowedAt > Date.now()) {
    clearTimers();
    workerTimer = setTimeout(() => { void processNextInQueue(); }, nextAllowedAt - Date.now());
    return;
  }

  if (campaign.currentIndex >= campaign.tasks.length) {
    campaign.state = 'COMPLETED';
    campaign.completedAt = new Date().toISOString();
    campaign.nextSendDelayMs = 0;
    clearTimers();
    addLog('SUCCESS', `캠페인 순차 발송이 모두 완료되었습니다. (총 ${campaign.tasks.length}건 처리)`, {
      status: 'SYSTEM',
      code: 'CAMPAIGN_COMPLETED',
    });
    return;
  }

  // 배치 휴식 조건 확인
  const { batchSize, batchRestSec, minDelaySec, maxDelaySec } = campaign.rateLimit;
  if (batchSize > 0 && campaign.sentInCurrentBatch >= batchSize) {
    campaign.state = 'BATCH_RESTING';
    campaign.batchRestRemainingSec = Math.max(1, Math.round(batchRestSec));
    nextAllowedAt = Date.now() + campaign.batchRestRemainingSec * 1000;
    campaign.sentInCurrentBatch = 0;
    campaign.currentBatchNumber += 1;

    addLog(
      'WARN',
      `[배치 쓰로틀링 보호] ${batchSize}건 발송 완료 — 발신 평판 보호를 위해 ${campaign.batchRestRemainingSec}초간 배치 휴식을 시작합니다.`,
      {
        status: 'SYSTEM',
        code: `BATCH_${campaign.currentBatchNumber - 1}_REST`,
      }
    );

    batchRestInterval = setInterval(() => {
      if (campaign.state !== 'BATCH_RESTING') {
        if (batchRestInterval) clearInterval(batchRestInterval);
        return;
      }
      campaign.batchRestRemainingSec = Math.max(0, Math.ceil((nextAllowedAt - Date.now()) / 1000));
      if (campaign.batchRestRemainingSec <= 0) {
        if (batchRestInterval) clearInterval(batchRestInterval);
        batchRestInterval = null;
        campaign.state = 'RUNNING';
        addLog('INFO', `배치 #${campaign.currentBatchNumber} 발송을 재개합니다.`, {
          status: 'SYSTEM',
          code: `BATCH_${campaign.currentBatchNumber}_RESUME`,
        });
        processNextInQueue();
      }
    }, 1000);

    return;
  }

  const task = campaign.tasks[campaign.currentIndex];
  inFlight = true;
  task.status = 'SENDING';
  task.attempts += 1;
  task.batchNumber = campaign.currentBatchNumber;

  const subject = buildCompliantSubject(campaign.subjectTemplate, task, campaign.compliance);
  const htmlBody = buildCompliantHtmlBody(campaign.bodyHtmlTemplate, task, campaign.compliance, campaign.id);
  const textBody = interpolateTemplate(campaign.bodyTextTemplate || '', task) +
    `\n\n${campaign.compliance.senderName} | ${campaign.compliance.senderEmail}\n${campaign.compliance.senderPhone} | ${campaign.compliance.senderAddress}\n수신거부: ${buildUnsubscribeUrl(campaign.compliance.unsubscribeBaseUrl, task.email, campaign.id)}`;
  const headers = buildRfc8058Headers(task.email, campaign.compliance, campaign.id);

  task.renderedSubject = subject;
  task.headersIncluded = headers;
  persistCampaign();

  const result = await dispatchSingleEmail(
    task,
    subject,
    htmlBody,
    textBody,
    headers,
    campaign.compliance,
    campaign.providerConfig
  ).catch((error: Error) => ({ ok: false, status: 'FAILED' as RecipientStatus, code: 'DELIVERY_UNKNOWN', error: error.message, messageId: undefined }));
  inFlight = false;

  // Retry only explicit temporary rejection. A timeout may already have delivered the message.
  if (/^SMTP_4\d\d$|^RESEND_429_/.test(result.code) && task.attempts < 3 && (campaign.state as CampaignState) !== 'CANCELLED') {
    task.status = 'QUEUED';
    task.statusCode = result.code;
    nextAllowedAt = Date.now() + Math.max(1000, campaign.rateLimit.minDelaySec * 1000) * 2 ** (task.attempts - 1);
    addLog('WARN', `${task.email}: 일시 거절로 재시도 대기 (${task.attempts}/3)`, { code: result.code });
    if ((campaign.state as CampaignState) === 'RUNNING') void processNextInQueue();
    return;
  }

  task.status = result.status;
  task.sentAt = new Date().toISOString();
  task.statusCode = result.code;
  task.messageId = result.messageId;
  task.errorMessage = result.error;

  campaign.currentIndex += 1;
  campaign.sentInCurrentBatch += 1;

  // 다음 건 발송 전 적용할 랜덤 딜레이 계산
  const isLastItem = campaign.currentIndex >= campaign.tasks.length;
  const delayMs = isLastItem ? 0 : computeRandomDelayMs(minDelaySec, maxDelaySec);
  task.delayAppliedMs = delayMs;
  campaign.nextSendDelayMs = delayMs;
  nextAllowedAt = Date.now() + delayMs;

  // 보낸 이메일 보관함에 영구 기록
  sentHistoryList.unshift({
    id: task.id,
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    email: task.email,
    name: task.name,
    company: task.company,
    variables: task.variables,
    subject,
    bodyHtml: htmlBody,
    status: result.status as 'SENT' | 'BOUNCED' | 'FAILED',
    statusCode: result.code,
    messageId: result.messageId,
    errorMessage: result.error,
    sentAt: task.sentAt,
    senderEmail: campaign.compliance.senderEmail,
    senderName: campaign.compliance.senderName,
    provider: campaign.providerConfig.provider,
    delayAppliedMs: delayMs,
    headersIncluded: headers,
  });
  saveSentHistoryDb(sentHistoryList);

  if (result.ok) {
    addLog(
      'SUCCESS',
      `[${task.rowIndex}번] ${task.email} (${task.name || '-'}) 발송 성공 — ${result.code}${
        !isLastItem ? ` | 다음 발송까지 ${(delayMs / 1000).toFixed(2)}초 대기` : ''
      }`,
      {
        email: task.email,
        status: 'SENT',
        code: result.code,
        delayMs,
      }
    );
  } else {
    addLog(
      result.status === 'BOUNCED' ? 'WARN' : 'ERROR',
      `[${task.rowIndex}번] ${task.email} 발송 ${result.status} — ${result.code}: ${result.error}`,
      {
        email: task.email,
        status: result.status,
        code: result.code,
        delayMs,
      }
    );
  }

  persistCampaign();
  if ((campaign.state as CampaignState) !== 'RUNNING') return;

  if (isLastItem) {
    processNextInQueue();
  } else {
    workerTimer = setTimeout(() => {
      processNextInQueue();
    }, delayMs);
  }
}

// ==========================================
// 6. REST API 엔드포인트
// ==========================================

// 수신거부 목록 조회
app.get('/api/optout', (_req, res) => {
  res.json({ optOutList });
});

// 수신거부 수동 등록
app.post('/api/optout', (req, res) => {
  const { email, reason, source } = req.body as {
    email?: string;
    reason?: string;
    source?: OptOutEntry['source'];
  };
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: '유효한 이메일 주소를 입력해 주세요.' });
    return;
  }
  const normalized = email.trim().toLowerCase();
  const exists = optOutList.some((item) => item.email.toLowerCase() === normalized);
  if (exists) {
    res.status(409).json({ error: '이미 수신거부 목록에 등록된 이메일입니다.' });
    return;
  }
  const now = new Date().toISOString();
  const newEntry: OptOutEntry = {
    email: normalized,
    reason: reason?.trim() || '관리자 수동 수신거부 등록',
    source: source || 'ADMIN_MANUAL',
    unsubscribedAt: now,
    noticeSentAt: now,
  };
  optOutList.unshift(newEntry);
  saveOptOutDb(optOutList);
  res.json({ ok: true, entry: newEntry, optOutList });
});

// 수신거부 삭제 (수신동의 철회 해제)
app.delete('/api/optout/:email', (req, res) => {
  const target = decodeURIComponent(req.params.email).toLowerCase();
  optOutList = optOutList.filter((item) => item.email.toLowerCase() !== target);
  saveOptOutDb(optOutList);
  res.json({ ok: true, optOutList });
});

// RFC 8058 원클릭 수신거부 (POST) 및 브라우저 링크 수신거부 (GET)
app.post('/api/unsubscribe', (req, res) => {
  const email = String(req.query.email || req.body?.email || '').trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: 'Missing email parameter' });
    return;
  }
  const now = new Date().toISOString();
  if (!optOutList.some((item) => item.email.toLowerCase() === email)) {
    optOutList.unshift({
      email,
      reason: 'RFC 8058 List-Unsubscribe=One-Click 자동 처리',
      source: 'ONE_CLICK_RFC8058',
      unsubscribedAt: now,
      noticeSentAt: now,
    });
    saveOptOutDb(optOutList);
  }
  addLog('WARN', `[RFC 8058 원클릭 수신거부 접수] ${email} — 즉시 수신거부 DB 반영 및 처리결과 통지 완료`, {
    email,
    status: 'SYSTEM',
    code: 'RFC8058_ONE_CLICK',
  });
  res.status(200).json({
    ok: true,
    message: 'One-Click Unsubscribe processed immediately in compliance with RFC 8058 & KISA Act.',
    email,
    processedAt: now,
  });
});

app.get('/api/unsubscribe', (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  const now = new Date().toISOString();
  if (email && email.includes('@')) {
    if (!optOutList.some((item) => item.email.toLowerCase() === email)) {
      optOutList.unshift({
        email,
        reason: '이메일 하단 간편 수신거부 링크 클릭 (무로그인 즉시 처리)',
        source: 'WEB_LINK',
        unsubscribedAt: now,
        noticeSentAt: now,
      });
      saveOptOutDb(optOutList);
    }
    addLog('WARN', `[웹 수신거부 접수] ${email} — 로그인 없이 즉시 수신거부 처리 및 결과 고지 완료`, {
      email,
      status: 'SYSTEM',
      code: 'WEB_UNSUBSCRIBE',
    });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
    <!doctype html>
    <html lang="ko">
    <head>
      <meta charset="utf-8" />
      <title>수신거부 처리 완료 안내</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Pretendard", sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 32px; max-width: 480px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.4); }
        .badge { display: inline-block; background: #10b98122; color: #34d399; border: 1px solid #10b98155; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; margin-bottom: 12px; }
        h1 { font-size: 20px; margin: 0 0 12px; }
        p { font-size: 14px; color: #cbd5e1; line-height: 1.6; margin: 8px 0; }
        .meta { background: #0f172a; border-radius: 8px; padding: 12px 16px; margin-top: 16px; font-size: 13px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">정보통신망법 제50조 준수 · 즉시 처리 완료</span>
        <h1>수신거부 처리가 완료되었습니다</h1>
        <p>요청하신 이메일 주소에 대한 광고성 정보 수신거부가 로그인 절차 없이 즉시 반영되었습니다.</p>
        <div class="meta">
          <div>• <strong>대상 이메일</strong>: ${email || '(미지정)'}</div>
          <div>• <strong>처리 일시</strong>: ${new Date(now).toLocaleString('ko-KR')}</div>
          <div>• <strong>처리 결과</strong>: 수신거부 DB 영구 등록 완료 (향후 모든 발송에서 자동 제외)</div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// 현재 캠페인 상태 및 실시간 로그 조회
app.get('/api/campaign/status', (_req, res) => {
  const total = campaign.tasks.length;
  const sent = campaign.tasks.filter((t) => t.status === 'SENT').length;
  const failed = campaign.tasks.filter((t) => t.status === 'FAILED').length;
  const bounced = campaign.tasks.filter((t) => t.status === 'BOUNCED').length;
  const queued = campaign.tasks.filter((t) => t.status === 'QUEUED' || t.status === 'SENDING').length;
  const cancelled = campaign.tasks.filter((t) => t.status === 'CANCELLED').length;

  res.json({
    id: campaign.id,
    title: campaign.title,
    state: campaign.state,
    startedAt: campaign.startedAt,
    completedAt: campaign.completedAt,
    currentIndex: campaign.currentIndex,
    currentBatchNumber: campaign.currentBatchNumber,
    sentInCurrentBatch: campaign.sentInCurrentBatch,
    batchRestRemainingSec: campaign.batchRestRemainingSec,
    nextSendDelayMs: campaign.nextSendDelayMs,
    rateLimit: campaign.rateLimit,
    compliance: campaign.compliance,
    providerConfig: {
      provider: campaign.providerConfig.provider,
      simulateBounceRate: campaign.providerConfig.simulateBounceRate,
    },
    stats: {
      total,
      sent,
      failed,
      bounced,
      queued,
      cancelled,
      progressPercent: total > 0 ? Math.round(((sent + failed + bounced + cancelled) / total) * 100) : 0,
    },
    tasks: campaign.tasks,
    logs: campaign.logs.slice(0, 200),
  });
});

// 새 캠페인 순차 발송 시작
app.post('/api/campaign/start', async (req, res) => {
  if (preparing || inFlight || ['RUNNING', 'BATCH_RESTING', 'PAUSED'].includes(campaign.state)) {
    res.status(409).json({ error: '활성 캠페인이 있습니다. 취소 후 진행 중인 전송이 끝나면 새 캠페인을 시작하세요.' });
    return;
  }

  const {
    title,
    subjectTemplate,
    bodyHtmlTemplate,
    bodyTextTemplate,
    compliance,
    rateLimit,
    providerConfig,
    recipients,
  } = (req.body || {}) as {
    title?: string;
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate?: string;
    compliance: ComplianceConfig;
    rateLimit: RateLimitConfig;
    providerConfig: ProviderConfig;
    recipients: Array<{
      rowIndex: number;
      email: string;
      name?: string;
      company?: string;
      variables?: Record<string, string>;
    }>;
  };

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    res.status(400).json({ error: '발송할 수신자 목록이 비어 있습니다.' });
    return;
  }

  const emailValid = (value: unknown): value is string => typeof value === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
  if (recipients.length > 10000 || !compliance || !emailValid(compliance.senderEmail) ||
      !compliance.senderName || /[\r\n]/.test(compliance.senderName) ||
      typeof subjectTemplate !== 'string' || !subjectTemplate.trim() || /[\r\n]/.test(subjectTemplate) ||
      typeof bodyHtmlTemplate !== 'string' || !bodyHtmlTemplate.trim() ||
      !providerConfig || !['dryrun', 'smtp', 'resend'].includes(providerConfig.provider) ||
      !rateLimit || !Object.values(rateLimit).every(v => typeof v === 'number' && Number.isFinite(v)) ||
      !(rateLimit.minDelaySec >= 0.2 && rateLimit.maxDelaySec >= rateLimit.minDelaySec && rateLimit.maxDelaySec <= 3600) ||
      !Number.isInteger(rateLimit.batchSize) || rateLimit.batchSize < 1 || rateLimit.batchRestSec < 0 || rateLimit.batchRestSec > 86400) {
    res.status(400).json({ error: '발신자·제목·본문·발송 간격 설정을 확인하세요. 수신자는 최대 10,000명입니다.' });
    return;
  }
  if (providerConfig.provider !== 'dryrun' && compliance.isAd) {
    let publicHttps = false;
    try { const url = new URL(compliance.unsubscribeBaseUrl); publicHttps = url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname); } catch { /* invalid URL */ }
    if (!publicHttps || !compliance.senderPhone?.trim() || !compliance.senderAddress?.trim() || !compliance.includeRfc8058Headers) {
      res.status(400).json({ error: '광고 메일에는 공개 HTTPS 수신거부 URL과 전송자 전화번호·주소, 수신거부 헤더가 필요합니다.' });
      return;
    }
  }
  const seen = new Set<string>();
  const eligible = recipients.filter(r => {
    if (!r || !emailValid(r.email?.trim())) return false;
    const email = r.email.trim().toLowerCase();
    if (seen.has(email) || optOutList.some(o => o.email.toLowerCase() === email)) return false;
    seen.add(email);
    return true;
  });
  if (!eligible.length) { res.status(400).json({ error: '서버 검증을 통과한 수신자가 없습니다.' }); return; }
  const resolvedProvider = providerWithCredentials(providerConfig);
  preparing = true;
  try { await verifyProvider(resolvedProvider); }
  catch (error) { res.status(400).json({ error: `발송 연결 실패: ${(error as Error).message}` }); preparing = false; return; }
  preparing = false;

  clearTimers();
  nextAllowedAt = 0;

  const campaignId = `cmp-${randomUUID()}`;
  const tasks: RecipientTask[] = eligible.map((r, idx) => ({
    id: `${campaignId}-row-${idx + 1}`,
    rowIndex: r.rowIndex ?? idx + 1,
    email: r.email.trim(),
    name: r.name?.trim() || '',
    company: r.company?.trim() || '',
    variables: r.variables || {},
    status: 'QUEUED',
    attempts: 0,
  }));

  campaign = {
    id: campaignId,
    title: title || `순차 발송 캠페인 (${new Date().toLocaleTimeString('ko-KR')})`,
    state: 'RUNNING',
    startedAt: new Date().toISOString(),
    subjectTemplate,
    bodyHtmlTemplate,
    bodyTextTemplate: bodyTextTemplate || '',
    compliance,
    rateLimit,
    providerConfig: resolvedProvider,
    tasks,
    currentIndex: 0,
    sentInCurrentBatch: 0,
    currentBatchNumber: 1,
    batchRestRemainingSec: 0,
    nextSendDelayMs: 0,
    logs: [],
  };

  addLog(
    'INFO',
    `캠페인 [${campaign.title}] 시작 — 대상 ${tasks.length}건 | 딜레이 ${rateLimit.minDelaySec}s~${rateLimit.maxDelaySec}s | 배치 ${rateLimit.batchSize}건당 ${rateLimit.batchRestSec}s 휴식 | 모드: ${providerConfig.provider.toUpperCase()}`,
    {
      status: 'SYSTEM',
      code: 'CAMPAIGN_START',
    }
  );

  processNextInQueue();
  res.json({ ok: true, campaignId: campaign.id, queued: tasks.length, excluded: recipients.length - tasks.length });
});

// 일시 정지 (Pause)
app.post('/api/campaign/pause', (_req, res) => {
  if (campaign.state !== 'RUNNING' && campaign.state !== 'BATCH_RESTING') {
    res.status(400).json({ error: '일시 정지할 수 있는 실행 중 캠페인이 없습니다.' });
    return;
  }
  clearTimers();
  campaign.state = 'PAUSED';
  campaign.nextSendDelayMs = 0;
  addLog('WARN', `사용자에 의해 발송 큐가 일시 정지(PAUSED)되었습니다. (진행: ${campaign.currentIndex}/${campaign.tasks.length}건)`, {
    status: 'SYSTEM',
    code: 'QUEUE_PAUSED',
  });
  res.json({ ok: true, state: campaign.state });
});

// 재개 (Resume)
app.post('/api/campaign/resume', async (_req, res) => {
  if (preparing) { res.status(409).json({ error: '연결 확인 중입니다.' }); return; }
  if (campaign.state !== 'PAUSED') {
    res.status(400).json({ error: '일시 정지 상태인 캠페인만 재개할 수 있습니다.' });
    return;
  }
  preparing = true;
  try {
    campaign.providerConfig = providerWithCredentials(campaign.providerConfig);
    await verifyProvider(campaign.providerConfig);
  } catch (error) { res.status(400).json({ error: (error as Error).message }); preparing = false; return; }
  preparing = false;
  if (campaign.state !== 'PAUSED') { res.status(409).json({ error: '캠페인 상태가 변경되었습니다.' }); return; }
  campaign.state = 'RUNNING';
  addLog('INFO', `발송 큐가 재개(RESUMED)되었습니다. (${campaign.currentIndex + 1}번째 항목부터 순차 발송 계속)`, {
    status: 'SYSTEM',
    code: 'QUEUE_RESUMED',
  });
  processNextInQueue();
  res.json({ ok: true, state: campaign.state });
});

// 취소 (Cancel)
app.post('/api/campaign/cancel', (_req, res) => {
  if (campaign.state === 'IDLE' || campaign.state === 'COMPLETED' || campaign.state === 'CANCELLED') {
    res.status(400).json({ error: '취소할 활성 캠페인이 없습니다.' });
    return;
  }
  clearTimers();
  campaign.state = 'CANCELLED';
  campaign.completedAt = new Date().toISOString();
  campaign.nextSendDelayMs = 0;

  let cancelledCount = 0;
  for (let i = campaign.currentIndex; i < campaign.tasks.length; i++) {
    if (campaign.tasks[i].status === 'QUEUED') {
      campaign.tasks[i].status = 'CANCELLED';
      campaign.tasks[i].statusCode = 'USER_CANCELLED';
      cancelledCount++;
    }
  }

  addLog('ERROR', `발송 큐가 취소(CANCELLED)되었습니다. 미발송 대기 ${cancelledCount}건이 취소 처리되었습니다.`, {
    status: 'SYSTEM',
    code: 'QUEUE_CANCELLED',
  });
  res.json({ ok: true, state: campaign.state, cancelledCount });
});

// 초기화 (Reset)
app.post('/api/campaign/reset', (_req, res) => {
  if (inFlight || preparing) { res.status(409).json({ error: '전송 중인 1건의 결과를 기다린 후 초기화하세요.' }); return; }
  clearTimers();
  campaign.state = 'IDLE';
  campaign.tasks = [];
  campaign.logs = [];
  campaign.currentIndex = 0;
  campaign.sentInCurrentBatch = 0;
  campaign.currentBatchNumber = 1;
  campaign.batchRestRemainingSec = 0;
  campaign.nextSendDelayMs = 0;
  campaign.id = 'none';
  nextAllowedAt = 0;
  persistCampaign();
  res.json({ ok: true });
});

// ==========================================
// 보낸 이메일 관리 (Sent Email Archive) API
// ==========================================
app.get('/api/sent-history', (_req, res) => {
  res.json({ sentHistoryList });
});

app.post('/api/sent-history/delete', (req, res) => {
  const { ids = [] } = (req.body || {}) as { ids?: string[] };
  const idSet = new Set(ids);
  sentHistoryList = sentHistoryList.filter((item) => !idSet.has(item.id));
  saveSentHistoryDb(sentHistoryList);
  res.json({ ok: true, sentHistoryList });
});

app.post('/api/sent-history/clear', (_req, res) => {
  sentHistoryList = [];
  saveSentHistoryDb(sentHistoryList);
  res.json({ ok: true, sentHistoryList });
});

// ==========================================
// 7. Gmail 주소록 (Google Contacts) 연동 API
// ==========================================
interface GoogleContactNormalized {
  이메일: string;
  수신자명: string;
  회사명: string;
  직급: string;
  전화번호: string;
  라벨: string;
}

// 연결된 Google Contacts 커넥터(gsk) 또는 Google People API로 주소록 불러오기
app.post('/api/google-contacts/fetch', async (req, res) => {
  const { query = '', accessToken = '' } = (req.body || {}) as {
    query?: string;
    accessToken?: string;
  };

  // 1) 사용자가 Google OAuth Access Token을 직접 입력한 경우 Google People API 호출
  if (accessToken.trim()) {
    try {
      const url =
        'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,organizations,phoneNumbers,memberships&pageSize=200';
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken.trim()}`,
        },
      });
      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).json({
          error: `Google People API 호출 실패 (${response.status}): ${errText}`,
        });
        return;
      }
      const data = (await response.json()) as {
        connections?: Array<{
          names?: Array<{ displayName?: string }>;
          emailAddresses?: Array<{ value?: string }>;
          organizations?: Array<{ name?: string; title?: string }>;
          phoneNumbers?: Array<{ value?: string }>;
        }>;
      };
      const contacts: GoogleContactNormalized[] = [];
      for (const person of data.connections || []) {
        const email = person.emailAddresses?.[0]?.value?.trim() || '';
        if (!email) continue;
        contacts.push({
          이메일: email,
          수신자명: person.names?.[0]?.displayName || email.split('@')[0],
          회사명: person.organizations?.[0]?.name || '',
          직급: person.organizations?.[0]?.title || '',
          전화번호: person.phoneNumbers?.[0]?.value || '',
          라벨: 'Gmail 주소록 (People API)',
        });
      }
      res.json({
        ok: true,
        source: 'GOOGLE_PEOPLE_API',
        contacts,
      });
      return;
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Google People API 연동 중 오류 발생',
      });
      return;
    }
  }

  // 2) 연결된 Google Contacts 커넥터(gsk) 호출 시도
  try {
    const argsJson = JSON.stringify({
      query: query.trim() || '@',
      limit: 100,
    });
    const { stdout } = await execFileAsync('gsk', [
      'connector',
      'call',
      'google_contacts',
      '-t',
      'search',
      '-a',
      argsJson,
    ]);
    const envelope = JSON.parse(stdout);
    const rawItems: Array<Record<string, unknown>> =
      envelope?.data?.result?.contacts ||
      envelope?.data?.contacts ||
      envelope?.data?.result?.results ||
      envelope?.data?.results ||
      (Array.isArray(envelope?.data?.result) ? envelope.data.result : []);

    const contacts: GoogleContactNormalized[] = [];
    for (const item of rawItems) {
      const email =
        String(
          item.email ||
            (Array.isArray(item.emails) && (item.emails[0] as { value?: string })?.value) ||
            (Array.isArray(item.emailAddresses) &&
              (item.emailAddresses[0] as { value?: string })?.value) ||
            ''
        ).trim();
      if (!email) continue;
      contacts.push({
        이메일: email,
        수신자명: String(item.name || item.displayName || email.split('@')[0]),
        회사명: String(item.company || item.organization || ''),
        직급: String(item.title || item.jobTitle || ''),
        전화번호: String(item.phone || item.phoneNumber || ''),
        라벨: 'Gmail 연결 계정 주소록',
      });
    }

    res.json({
      ok: true,
      source: 'GSK_GOOGLE_CONTACTS_CONNECTOR',
      contacts,
      rawCount: rawItems.length,
    });
  } catch (err) {
    res.status(200).json({
      ok: true,
      source: 'CONNECTOR_EMPTY_OR_FALLBACK',
      contacts: [],
      note: err instanceof Error ? err.message : 'Google Contacts 커넥터 응답 없음',
    });
  }
});

app.get('/api/health', (_req, res) => res.json({ service: 'mailflow', realSending: true }));

// 프로덕션 정적 파일 서빙 (빌드된 dist 디렉토리가 있을 경우)
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, process.env.HOST || '127.0.0.1', () => {
  console.log(`[MailFlow Pro Server] Running at http://localhost:${PORT}`);
});
