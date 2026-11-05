import {
  CampaignEventLog,
  CampaignState,
  CampaignStatusResponse,
  ComplianceConfig,
  OptOutEntry,
  ProviderConfig,
  RateLimitConfig,
  RecipientStatus,
  RecipientTask,
} from '../types';

const OPTOUT_STORAGE_KEY = 'mailflow_pro_optout_db_v1';

const INITIAL_OPTOUT_SEED: OptOutEntry[] = [
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

export function loadClientOptOutList(): OptOutEntry[] {
  try {
    const raw = localStorage.getItem(OPTOUT_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(OPTOUT_STORAGE_KEY, JSON.stringify(INITIAL_OPTOUT_SEED));
      return [...INITIAL_OPTOUT_SEED];
    }
    return JSON.parse(raw);
  } catch {
    return [...INITIAL_OPTOUT_SEED];
  }
}

export function saveClientOptOutList(list: OptOutEntry[]): void {
  try {
    localStorage.setItem(OPTOUT_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore storage quota errors
  }
}

class ClientQueueEngine {
  private id = 'none';
  private title = '대기 중인 캠페인 없음';
  private state: CampaignState = 'IDLE';
  private startedAt?: string;
  private completedAt?: string;
  private subjectTemplate = '';
  private compliance: ComplianceConfig = {
    isAd: true,
    senderName: '(주)테크플로우 코리아',
    senderEmail: 'newsletter@techflow.kr',
    replyToEmail: 'support@techflow.kr',
    senderPhone: '02-1588-0000',
    senderAddress: '서울특별시 강남구 테헤란로 152 파이낸스센터 18층',
    unsubscribeBaseUrl: 'https://techflow.kr/unsubscribe',
    includeRfc8058Headers: true,
    enforceDkimSpfCheck: true,
  };
  private rateLimit: RateLimitConfig = {
    minDelaySec: 0.8,
    maxDelaySec: 1.8,
    batchSize: 5,
    batchRestSec: 6,
  };
  private providerConfig: ProviderConfig = {
    provider: 'dryrun',
    resendApiKey: '',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpSecure: false,
    simulateBounceRate: 8,
  };
  private tasks: RecipientTask[] = [];
  private currentIndex = 0;
  private sentInCurrentBatch = 0;
  private currentBatchNumber = 1;
  private batchRestRemainingSec = 0;
  private nextSendDelayMs = 0;
  private logs: CampaignEventLog[] = [];

  private workerTimer: ReturnType<typeof setTimeout> | null = null;
  private batchInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<() => void> = new Set();

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  private clearTimers() {
    if (this.workerTimer) {
      clearTimeout(this.workerTimer);
      this.workerTimer = null;
    }
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
  }

  addLog(
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
    this.logs.unshift(entry);
    if (this.logs.length > 300) {
      this.logs.length = 300;
    }
    this.notify();
  }

  private interpolate(template: string, task: RecipientTask): string {
    let result = template;
    const allVars: Record<string, string> = {
      ...task.variables,
      email: task.email,
      name: task.name || '고객',
      company: task.company || '',
    };
    for (const [k, v] of Object.entries(allVars)) {
      const regex = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}|\\{\\s*${k}\\s*\\}`, 'gi');
      result = result.replace(regex, v ?? '');
    }
    return result;
  }

  private buildCompliantSubject(task: RecipientTask): string {
    let interpolated = this.interpolate(this.subjectTemplate, task).trim();
    if (this.compliance.isAd) {
      interpolated = interpolated.replace(/^\(\s*광\s*고\s*\)\s*/i, '').replace(/^\[\s*광고\s*\]\s*/i, '');
      return `(광고) ${interpolated}`;
    }
    return interpolated;
  }

  private buildHeaders(email: string): Record<string, string> {
    const unsubUrl = `${this.compliance.unsubscribeBaseUrl}?email=${encodeURIComponent(email)}&cid=${this.id}`;
    const headers: Record<string, string> = {};
    if (this.compliance.includeRfc8058Headers) {
      headers['List-Unsubscribe'] = `<${unsubUrl}>, <mailto:${this.compliance.replyToEmail}?subject=unsubscribe>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    headers['X-Mailer'] = 'MailFlow-Pro-Compliance-Sequencer/1.0';
    return headers;
  }

  private computeDelayMs(): number {
    const min = Math.max(0.2, Number(this.rateLimit.minDelaySec) || 0.8);
    const max = Math.max(min, Number(this.rateLimit.maxDelaySec) || min);
    return Math.round((min + Math.random() * (max - min)) * 1000);
  }

  getStatus(): CampaignStatusResponse {
    const total = this.tasks.length;
    const sent = this.tasks.filter((t) => t.status === 'SENT').length;
    const failed = this.tasks.filter((t) => t.status === 'FAILED').length;
    const bounced = this.tasks.filter((t) => t.status === 'BOUNCED').length;
    const queued = this.tasks.filter((t) => t.status === 'QUEUED' || t.status === 'SENDING').length;
    const cancelled = this.tasks.filter((t) => t.status === 'CANCELLED').length;

    return {
      id: this.id,
      title: this.title,
      state: this.state,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      currentIndex: this.currentIndex,
      currentBatchNumber: this.currentBatchNumber,
      sentInCurrentBatch: this.sentInCurrentBatch,
      batchRestRemainingSec: this.batchRestRemainingSec,
      nextSendDelayMs: this.nextSendDelayMs,
      rateLimit: this.rateLimit,
      compliance: this.compliance,
      providerConfig: {
        provider: this.providerConfig.provider,
        simulateBounceRate: this.providerConfig.simulateBounceRate,
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
      tasks: [...this.tasks],
      logs: [...this.logs],
    };
  }

  start(params: {
    title: string;
    subjectTemplate: string;
    compliance: ComplianceConfig;
    rateLimit: RateLimitConfig;
    providerConfig: ProviderConfig;
    recipients: Array<{
      rowIndex: number;
      email: string;
      name: string;
      company: string;
      variables: Record<string, string>;
    }>;
  }) {
    this.clearTimers();
    const campaignId = `cmp-${Date.now().toString(36)}`;
    this.id = campaignId;
    this.title = params.title || '순차 발송 캠페인';
    this.state = 'RUNNING';
    this.startedAt = new Date().toISOString();
    this.completedAt = undefined;
    this.subjectTemplate = params.subjectTemplate;
    this.compliance = { ...params.compliance };
    this.rateLimit = { ...params.rateLimit };
    this.providerConfig = { ...params.providerConfig };
    this.currentIndex = 0;
    this.sentInCurrentBatch = 0;
    this.currentBatchNumber = 1;
    this.batchRestRemainingSec = 0;
    this.nextSendDelayMs = 0;
    this.logs = [];

    this.tasks = params.recipients.map((r, idx) => ({
      id: `${campaignId}-row-${r.rowIndex ?? idx + 1}`,
      rowIndex: r.rowIndex ?? idx + 1,
      email: r.email,
      name: r.name,
      company: r.company,
      variables: r.variables,
      status: 'QUEUED',
      attempts: 0,
    }));

    this.addLog(
      'INFO',
      `캠페인 [${this.title}] 시작 — 대상 ${this.tasks.length}건 | 딜레이 ${this.rateLimit.minDelaySec}s~${this.rateLimit.maxDelaySec}s | 배치 ${this.rateLimit.batchSize}건당 ${this.rateLimit.batchRestSec}s 휴식`,
      {
        status: 'SYSTEM',
        code: 'CAMPAIGN_START',
      }
    );

    this.processNext();
  }

  private async processNext() {
    if (this.state !== 'RUNNING') return;

    if (this.currentIndex >= this.tasks.length) {
      this.state = 'COMPLETED';
      this.completedAt = new Date().toISOString();
      this.nextSendDelayMs = 0;
      this.clearTimers();
      this.addLog(
        'SUCCESS',
        `캠페인 순차 발송이 모두 완료되었습니다. (총 ${this.tasks.length}건 처리)`,
        { status: 'SYSTEM', code: 'CAMPAIGN_COMPLETED' }
      );
      return;
    }

    const { batchSize, batchRestSec } = this.rateLimit;
    if (batchSize > 0 && this.sentInCurrentBatch >= batchSize) {
      this.state = 'BATCH_RESTING';
      this.batchRestRemainingSec = Math.max(1, Math.round(batchRestSec));
      this.sentInCurrentBatch = 0;
      this.currentBatchNumber += 1;

      this.addLog(
        'WARN',
        `[배치 쓰로틀링 보호] ${batchSize}건 발송 완료 — 발신 평판 보호를 위해 ${this.batchRestRemainingSec}초간 배치 휴식을 시작합니다.`,
        { status: 'SYSTEM', code: `BATCH_${this.currentBatchNumber - 1}_REST` }
      );

      this.batchInterval = setInterval(() => {
        if (this.state !== 'BATCH_RESTING') {
          if (this.batchInterval) clearInterval(this.batchInterval);
          return;
        }
        this.batchRestRemainingSec -= 1;
        this.notify();
        if (this.batchRestRemainingSec <= 0) {
          if (this.batchInterval) clearInterval(this.batchInterval);
          this.batchInterval = null;
          this.state = 'RUNNING';
          this.addLog('INFO', `배치 #${this.currentBatchNumber} 발송을 재개합니다.`, {
            status: 'SYSTEM',
            code: `BATCH_${this.currentBatchNumber}_RESUME`,
          });
          this.processNext();
        }
      }, 1000);
      return;
    }

    const task = this.tasks[this.currentIndex];
    task.status = 'SENDING';
    task.attempts += 1;
    task.batchNumber = this.currentBatchNumber;
    task.renderedSubject = this.buildCompliantSubject(task);
    task.headersIncluded = this.buildHeaders(task.email);
    this.notify();

    await new Promise((r) => setTimeout(r, 150));

    const currentState = this.state as CampaignState;
    if (currentState === 'CANCELLED' || currentState === 'PAUSED') return;

    const optOutList = loadClientOptOutList();
    const isOptedOut = optOutList.some((o) => o.email.toLowerCase() === task.email.toLowerCase());

    let ok = true;
    let status: RecipientStatus = 'SENT';
    let code = '250 2.0.0 OK (RFC8058 One-Click Signed)';
    let error: string | undefined;

    if (isOptedOut) {
      ok = false;
      status = 'FAILED';
      code = '450_OPT_OUT_BLOCKED';
      error = '발송 직전 수신거부(Opt-Out) DB 등재 확인으로 자동 차단됨';
    } else if (task.email.includes('bounce') || task.email.includes('invalid-domain')) {
      ok = false;
      status = 'BOUNCED';
      code = '550 5.1.1 User Unknown (Hard Bounce)';
      error = '수신자 메일박스가 존재하지 않아 반송됨 (Hard Bounce)';
    } else {
      const bounceProb = Math.max(0, Math.min(50, this.providerConfig.simulateBounceRate ?? 5)) / 100;
      if (Math.random() < bounceProb) {
        ok = false;
        status = 'BOUNCED';
        code = '421 4.7.0 Temp Rate Deferral / Soft Bounce';
        error = '수신 서버 일시적 소프트 바운스 시뮬레이션 응답';
      }
    }

    task.status = status;
    task.sentAt = new Date().toISOString();
    task.statusCode = code;
    task.messageId = `<sim-${Date.now()}-${task.rowIndex}@${this.compliance.senderEmail.split('@')[1] || 'mailflow.kr'}>`;
    task.errorMessage = error;

    this.currentIndex += 1;
    this.sentInCurrentBatch += 1;

    const isLast = this.currentIndex >= this.tasks.length;
    const delayMs = isLast ? 0 : this.computeDelayMs();
    task.delayAppliedMs = delayMs;
    this.nextSendDelayMs = delayMs;

    if (ok) {
      this.addLog(
        'SUCCESS',
        `[${task.rowIndex}번] ${task.email} (${task.name || '-'}) 발송 성공 — ${code}${
          !isLast ? ` | 다음 발송까지 ${(delayMs / 1000).toFixed(2)}초 대기` : ''
        }`,
        { email: task.email, status: 'SENT', code, delayMs }
      );
    } else {
      this.addLog(
        status === 'BOUNCED' ? 'WARN' : 'ERROR',
        `[${task.rowIndex}번] ${task.email} 발송 ${status} — ${code}: ${error}`,
        { email: task.email, status, code, delayMs }
      );
    }

    if (this.state !== 'RUNNING') return;

    if (isLast) {
      this.processNext();
    } else {
      this.workerTimer = setTimeout(() => {
        this.processNext();
      }, delayMs);
    }
  }

  pause() {
    if (this.state !== 'RUNNING' && this.state !== 'BATCH_RESTING') return;
    this.clearTimers();
    this.state = 'PAUSED';
    this.nextSendDelayMs = 0;
    this.addLog(
      'WARN',
      `사용자에 의해 발송 큐가 일시 정지(PAUSED)되었습니다. (진행: ${this.currentIndex}/${this.tasks.length}건)`,
      { status: 'SYSTEM', code: 'QUEUE_PAUSED' }
    );
  }

  resume() {
    if (this.state !== 'PAUSED') return;
    this.state = 'RUNNING';
    this.addLog(
      'INFO',
      `발송 큐가 재개(RESUMED)되었습니다. (${this.currentIndex + 1}번째 항목부터 순차 발송 계속)`,
      { status: 'SYSTEM', code: 'QUEUE_RESUMED' }
    );
    this.processNext();
  }

  cancel() {
    if (this.state === 'IDLE' || this.state === 'COMPLETED' || this.state === 'CANCELLED') return;
    this.clearTimers();
    this.state = 'CANCELLED';
    this.completedAt = new Date().toISOString();
    this.nextSendDelayMs = 0;

    let cancelledCount = 0;
    for (let i = this.currentIndex; i < this.tasks.length; i++) {
      if (this.tasks[i].status === 'QUEUED' || this.tasks[i].status === 'SENDING') {
        this.tasks[i].status = 'CANCELLED';
        this.tasks[i].statusCode = 'USER_CANCELLED';
        cancelledCount++;
      }
    }

    this.addLog(
      'ERROR',
      `발송 큐가 취소(CANCELLED)되었습니다. 미발송 대기 ${cancelledCount}건이 취소 처리되었습니다.`,
      { status: 'SYSTEM', code: 'QUEUE_CANCELLED' }
    );
  }

  reset() {
    this.clearTimers();
    this.state = 'IDLE';
    this.tasks = [];
    this.logs = [];
    this.currentIndex = 0;
    this.sentInCurrentBatch = 0;
    this.currentBatchNumber = 1;
    this.batchRestRemainingSec = 0;
    this.notify();
  }
}

export const clientQueueEngine = new ClientQueueEngine();
