export type RawRow = Record<string, string>;

export interface ColumnMapping {
  emailColumn: string;
  nameColumn: string;
  companyColumn: string;
  variableColumns: Record<string, string>; // variableName -> excelColumnName
}

export type FilterReason = 'VALID' | 'INVALID_SYNTAX' | 'DUPLICATE' | 'OPT_OUT_EXCLUDED';

export interface ValidatedRecipient {
  rowIndex: number;
  email: string;
  name: string;
  company: string;
  variables: Record<string, string>;
  filterStatus: FilterReason;
  filterDetail?: string;
}

export interface OptOutEntry {
  email: string;
  reason: string;
  source: 'ONE_CLICK_RFC8058' | 'WEB_LINK' | 'ADMIN_MANUAL' | 'SYSTEM_SEED';
  unsubscribedAt: string;
  noticeSentAt: string;
}

export interface ComplianceConfig {
  isAd: boolean;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  senderPhone: string;
  senderAddress: string;
  unsubscribeBaseUrl: string;
  includeRfc8058Headers: boolean;
  enforceDkimSpfCheck: boolean;
}

export interface RateLimitConfig {
  minDelaySec: number;
  maxDelaySec: number;
  batchSize: number;
  batchRestSec: number;
}

export interface ProviderConfig {
  provider: 'dryrun' | 'resend' | 'smtp';
  resendApiKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  simulateBounceRate: number;
}

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

export interface CampaignStatusResponse {
  id: string;
  title: string;
  state: CampaignState;
  startedAt?: string;
  completedAt?: string;
  currentIndex: number;
  currentBatchNumber: number;
  sentInCurrentBatch: number;
  batchRestRemainingSec: number;
  nextSendDelayMs: number;
  rateLimit: RateLimitConfig;
  compliance: ComplianceConfig;
  providerConfig: {
    provider: 'dryrun' | 'resend' | 'smtp';
    simulateBounceRate?: number;
  };
  stats: {
    total: number;
    sent: number;
    failed: number;
    bounced: number;
    queued: number;
    cancelled: number;
    progressPercent: number;
  };
  tasks: RecipientTask[];
  logs: CampaignEventLog[];
}
