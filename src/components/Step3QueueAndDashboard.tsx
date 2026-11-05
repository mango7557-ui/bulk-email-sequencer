import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  Download,
  Clock,
  KeyRound,
  Activity,
  Terminal,
  CheckCircle2,
  AlertOctagon,
  Timer,
  Send,
  ArrowLeft,
  ShieldCheck,
  Zap,
  UserX,
} from 'lucide-react';
import {
  CampaignStatusResponse,
  ProviderConfig,
  RateLimitConfig,
  RecipientStatus,
  ValidatedRecipient,
} from '../types';
import { exportCampaignResultToExcel } from '../utils/excelHelper';

interface Step3Props {
  validRecipients: ValidatedRecipient[];
  excludedRecipients: ValidatedRecipient[];
  rateLimit: RateLimitConfig;
  providerConfig: ProviderConfig;
  campaignStatus: CampaignStatusResponse | null;
  onChangeRateLimit: (next: RateLimitConfig) => void;
  onChangeProvider: (next: ProviderConfig) => void;
  onStartCampaign: () => Promise<void>;
  onPauseCampaign: () => Promise<void>;
  onResumeCampaign: () => Promise<void>;
  onCancelCampaign: () => Promise<void>;
  onResetCampaign: () => Promise<void>;
  onSimulateOneClickUnsubscribe: (email: string) => Promise<void>;
  onBack: () => void;
}

export const Step3QueueAndDashboard: React.FC<Step3Props> = ({
  validRecipients,
  excludedRecipients,
  rateLimit,
  providerConfig,
  campaignStatus,
  onChangeRateLimit,
  onChangeProvider,
  onStartCampaign,
  onPauseCampaign,
  onResumeCampaign,
  onCancelCampaign,
  onResetCampaign,
  onSimulateOneClickUnsubscribe,
  onBack,
}) => {
  const [statusTab, setStatusTab] = useState<'ALL' | RecipientStatus>('ALL');

  const state = campaignStatus?.state || 'IDLE';
  const isActive = state === 'RUNNING' || state === 'BATCH_RESTING';
  const isPaused = state === 'PAUSED';

  const stats = campaignStatus?.stats || {
    total: validRecipients.length,
    sent: 0,
    failed: 0,
    bounced: 0,
    queued: validRecipients.length,
    cancelled: 0,
    progressPercent: 0,
  };

  // 예상 소요시간 계산
  const avgDelaySec = (Number(rateLimit.minDelaySec) + Number(rateLimit.maxDelaySec)) / 2;
  const totalCount = validRecipients.length;
  const batchPauseCount =
    rateLimit.batchSize > 0 ? Math.max(0, Math.floor((totalCount - 1) / rateLimit.batchSize)) : 0;
  const estimatedTotalSec = Math.round(
    totalCount * avgDelaySec + batchPauseCount * Number(rateLimit.batchRestSec)
  );

  const tasks = campaignStatus?.tasks || [];
  const filteredTasks =
    statusTab === 'ALL' ? tasks : tasks.filter((t) => t.status === statusTab);

  const applyPreset = (minDelaySec: number, maxDelaySec: number, batchSize: number, batchRestSec: number) => {
    if (isActive || isPaused) return;
    onChangeRateLimit({ minDelaySec, maxDelaySec, batchSize, batchRestSec });
  };

  return (
    <div className="space-y-6">
      {/* 상단 설정 그리드: Rate Limiting & 이메일 API 설정 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 좌측: 순차 발송 큐 & Rate Limiting 설정 */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                순차 발송 큐(Queue) & Rate Limiting 설정
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                수신 서버(Gmail, Naver 등)의 스팸 차단을 방지하기 위해 건당 랜덤 딜레이와 배치 휴식을 적용합니다.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isActive || isPaused}
                onClick={() => applyPreset(0.8, 1.8, 5, 6)}
                className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium transition disabled:opacity-40"
              >
                빠른 시연 프리셋 (5건마다 6초 휴식)
              </button>
              <button
                type="button"
                disabled={isActive || isPaused}
                onClick={() => applyPreset(1.5, 4.0, 50, 60)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium transition disabled:opacity-40"
              >
                표준 안전 프리셋 (50건/1분)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                최소 간격 (초)
              </label>
              <input
                type="number"
                step="0.2"
                min="0.2"
                max="30"
                disabled={isActive || isPaused}
                value={rateLimit.minDelaySec}
                onChange={(e) =>
                  onChangeRateLimit({
                    ...rateLimit,
                    minDelaySec: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white font-mono disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                최대 간격 (초)
              </label>
              <input
                type="number"
                step="0.2"
                min="0.5"
                max="60"
                disabled={isActive || isPaused}
                value={rateLimit.maxDelaySec}
                onChange={(e) =>
                  onChangeRateLimit({
                    ...rateLimit,
                    maxDelaySec: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white font-mono disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                배치 크기 (건수)
              </label>
              <input
                type="number"
                min="1"
                max="500"
                disabled={isActive || isPaused}
                value={rateLimit.batchSize}
                onChange={(e) =>
                  onChangeRateLimit({
                    ...rateLimit,
                    batchSize: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white font-mono disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                배치 휴식 (초)
              </label>
              <input
                type="number"
                min="1"
                max="600"
                disabled={isActive || isPaused}
                value={rateLimit.batchRestSec}
                onChange={(e) =>
                  onChangeRateLimit({
                    ...rateLimit,
                    batchRestSec: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white font-mono disabled:opacity-50"
              />
            </div>
          </div>

          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Timer className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                건당 <strong>{rateLimit.minDelaySec}초 ~ {rateLimit.maxDelaySec}초</strong> 랜덤 딜레이 |{' '}
                <strong>{rateLimit.batchSize}건</strong> 발송마다 <strong>{rateLimit.batchRestSec}초</strong> 쿨다운 휴식
              </span>
            </div>
            <span className="text-indigo-300 font-mono">
              총 {totalCount}건 예상 소요: 약 {estimatedTotalSec}초
            </span>
          </div>
        </div>

        {/* 우측: 이메일 API 연동 인터페이스 */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-400" />
                이메일 API 연동 설정 (Resend / Amazon SES / 시뮬레이터)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                RFC 8058 원클릭 수신거부 헤더를 포함하여 발송할 API 프로바이더를 선택합니다.
              </p>
            </div>
          </div>

          {/* 프로바이더 탭 선택 */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={isActive || isPaused}
              onClick={() => onChangeProvider({ ...providerConfig, provider: 'dryrun' })}
              className={`p-3 rounded-xl border text-left transition ${
                providerConfig.provider === 'dryrun'
                  ? 'border-indigo-500 bg-indigo-500/15 text-white'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <div className="text-xs font-bold flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-indigo-400" />
                Dry-Run 시뮬레이션
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                API 키 없이 큐/딜레이 검증
              </div>
            </button>

            <button
              type="button"
              disabled={isActive || isPaused}
              onClick={() => onChangeProvider({ ...providerConfig, provider: 'resend' })}
              className={`p-3 rounded-xl border text-left transition ${
                providerConfig.provider === 'resend'
                  ? 'border-indigo-500 bg-indigo-500/15 text-white'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <div className="text-xs font-bold">Resend API</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                REST API + RFC 8058 헤더
              </div>
            </button>

            <button
              type="button"
              disabled={isActive || isPaused}
              onClick={() => onChangeProvider({ ...providerConfig, provider: 'smtp' })}
              className={`p-3 rounded-xl border text-left transition ${
                providerConfig.provider === 'smtp'
                  ? 'border-indigo-500 bg-indigo-500/15 text-white'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <div className="text-xs font-bold">Amazon SES / SMTP</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                SES SMTP 엔드포인트 연동
              </div>
            </button>
          </div>

          {providerConfig.provider === 'dryrun' && (
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  안전 시뮬레이션(Dry-Run) 모드 활성화됨
                </div>
                <p className="text-[11px] text-slate-400">
                  실제 외부 메일을 발송하지 않고 순차 딜레이, 배치 휴식, RFC 8058 헤더 서명, 소프트/하드 바운스(Bounce) 처리를 실시간 시뮬레이션합니다.
                </p>
              </div>
              <div className="shrink-0">
                <label className="block text-[11px] text-slate-400 mb-1">
                  바운스(반송) 발생 시뮬레이션율 (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  disabled={isActive || isPaused}
                  value={providerConfig.simulateBounceRate}
                  onChange={(e) =>
                    onChangeProvider({
                      ...providerConfig,
                      simulateBounceRate: Number(e.target.value),
                    })
                  }
                  className="w-28 rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>
          )}

          {providerConfig.provider === 'resend' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Resend API Key (<code className="text-indigo-400">re_...</code>)
                </label>
                <input
                  type="password"
                  placeholder="re_123456789_abcdefghijklmnop"
                  value={providerConfig.resendApiKey}
                  onChange={(e) =>
                    onChangeProvider({ ...providerConfig, resendApiKey: e.target.value })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2 text-xs text-white font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Resend 호출 시 <code className="text-indigo-300">headers.List-Unsubscribe</code> 및{' '}
                <code className="text-indigo-300">headers.List-Unsubscribe-Post</code>가 자동 포함됩니다.
              </p>
            </div>
          )}

          {providerConfig.provider === 'smtp' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="col-span-2">
                <label className="block text-[11px] text-slate-400 mb-1">
                  SMTP Host (예: email-smtp.ap-northeast-2.amazonaws.com)
                </label>
                <input
                  type="text"
                  value={providerConfig.smtpHost}
                  onChange={(e) =>
                    onChangeProvider({ ...providerConfig, smtpHost: e.target.value })
                  }
                  placeholder="email-smtp.ap-northeast-2.amazonaws.com"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Port</label>
                <input
                  type="number"
                  value={providerConfig.smtpPort}
                  onChange={(e) =>
                    onChangeProvider({ ...providerConfig, smtpPort: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">TLS/SSL</label>
                <select
                  value={providerConfig.smtpSecure ? 'true' : 'false'}
                  onChange={(e) =>
                    onChangeProvider({
                      ...providerConfig,
                      smtpSecure: e.target.value === 'true',
                    })
                  }
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="false">STARTTLS (587)</option>
                  <option value="true">SSL/TLS (465)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-slate-400 mb-1">SMTP Username (IAM Access Key)</label>
                <input
                  type="text"
                  value={providerConfig.smtpUser}
                  onChange={(e) =>
                    onChangeProvider({ ...providerConfig, smtpUser: e.target.value })
                  }
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-slate-400 mb-1">SMTP Password (IAM Secret)</label>
                <input
                  type="password"
                  value={providerConfig.smtpPass}
                  onChange={(e) =>
                    onChangeProvider({ ...providerConfig, smtpPass: e.target.value })
                  }
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 중앙: 발송 제어 콘솔 & 실시간 진행률 프로그레스 바 */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                실시간 순차 발송 컨트롤러 & 대시보드
              </h3>
              <span
                className={`px-3 py-0.5 rounded-full text-xs font-bold border ${
                  state === 'RUNNING'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                    : state === 'BATCH_RESTING'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                    : state === 'PAUSED'
                    ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                    : state === 'COMPLETED'
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    : state === 'CANCELLED'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {state === 'IDLE' && '대기 중 (IDLE)'}
                {state === 'RUNNING' && '순차 발송 중 (RUNNING)'}
                {state === 'BATCH_RESTING' &&
                  `배치 쿨다운 휴식 중 (${campaignStatus?.batchRestRemainingSec || 0}초 남음)`}
                {state === 'PAUSED' && '일시 정지됨 (PAUSED)'}
                {state === 'COMPLETED' && '발송 완료 (COMPLETED)'}
                {state === 'CANCELLED' && '발송 취소됨 (CANCELLED)'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {state === 'BATCH_RESTING'
                ? `발신 평판 보호를 위해 배치 #${(campaignStatus?.currentBatchNumber || 2) - 1} 완료 후 ${campaignStatus?.batchRestRemainingSec}초간 대기하고 있습니다.`
                : state === 'RUNNING'
                ? `현재 배치 #${campaignStatus?.currentBatchNumber || 1} 진행 중 | 건당 딜레이 ${(
                    (campaignStatus?.nextSendDelayMs || 0) / 1000
                  ).toFixed(2)}초 적용`
                : '발송 시작 버튼을 누르면 큐 엔진이 지정된 딜레이와 배치 주기에 따라 순차 발송을 시작합니다.'}
            </p>
          </div>

          {/* 제어 버튼 그룹 (Start / Pause / Resume / Cancel / Excel Export) */}
          <div className="flex flex-wrap items-center gap-2.5">
            {(state === 'IDLE' || state === 'COMPLETED' || state === 'CANCELLED') && (
              <button
                type="button"
                disabled={validRecipients.length === 0}
                onClick={onStartCampaign}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold transition shadow-lg shadow-emerald-600/25"
              >
                <Play className="w-4 h-4 fill-current" />
                순차 발송 시작 ({validRecipients.length}건)
              </button>
            )}

            {(state === 'RUNNING' || state === 'BATCH_RESTING') && (
              <button
                type="button"
                onClick={onPauseCampaign}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition"
              >
                <Pause className="w-4 h-4" />
                일시 정지 (Pause)
              </button>
            )}

            {state === 'PAUSED' && (
              <button
                type="button"
                onClick={onResumeCampaign}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition"
              >
                <Play className="w-4 h-4 fill-current" />
                발송 재개 (Resume)
              </button>
            )}

            {(state === 'RUNNING' || state === 'BATCH_RESTING' || state === 'PAUSED') && (
              <button
                type="button"
                onClick={onCancelCampaign}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition"
              >
                <Square className="w-4 h-4 fill-current" />
                발송 취소 (Cancel)
              </button>
            )}

            {(state === 'COMPLETED' || state === 'CANCELLED') && (
              <button
                type="button"
                onClick={onResetCampaign}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                초기화
              </button>
            )}

            <button
              type="button"
              disabled={tasks.length === 0}
              onClick={() =>
                exportCampaignResultToExcel(
                  tasks,
                  excludedRecipients,
                  campaignStatus?.title || '대량이메일_캠페인'
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition shadow-lg shadow-indigo-600/20"
            >
              <Download className="w-4 h-4" />
              발송 결과 엑셀(.xlsx) 다운로드
            </button>
          </div>
        </div>

        {/* 실시간 카운터 카드 5종 */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400 mb-1">전체 발송 큐</div>
            <div className="text-2xl font-bold text-white">{stats.total}건</div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <div className="text-xs text-emerald-400 mb-1 flex items-center justify-between">
              <span>발송 성공 (SENT)</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-emerald-300">{stats.sent}건</div>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div className="text-xs text-amber-400 mb-1 flex items-center justify-between">
              <span>반송됨 (BOUNCED)</span>
              <AlertOctagon className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-amber-300">{stats.bounced}건</div>
          </div>

          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
            <div className="text-xs text-rose-400 mb-1">실패/취소 (FAILED)</div>
            <div className="text-2xl font-bold text-rose-300">
              {stats.failed + stats.cancelled}건
            </div>
          </div>

          <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
            <div className="text-xs text-indigo-300 mb-1 flex items-center justify-between">
              <span>대기 중 (QUEUED)</span>
              <Send className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-indigo-200">{stats.queued}건</div>
          </div>
        </div>

        {/* 프로그레스 바 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium">
              전체 진행률: {stats.progressPercent}% ({stats.total - stats.queued} / {stats.total}건 처리됨)
            </span>
            <span className="text-slate-400 font-mono">
              배치 #{campaignStatus?.currentBatchNumber || 1} ({campaignStatus?.sentInCurrentBatch || 0}/
              {rateLimit.batchSize}건)
            </span>
          </div>
          <div className="w-full h-3.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden flex">
            <div
              style={{
                width: `${stats.total > 0 ? (stats.sent / stats.total) * 100 : 0}%`,
              }}
              className="bg-emerald-500 transition-all duration-300"
              title="발송 성공"
            />
            <div
              style={{
                width: `${stats.total > 0 ? (stats.bounced / stats.total) * 100 : 0}%`,
              }}
              className="bg-amber-500 transition-all duration-300"
              title="반송 (Bounced)"
            />
            <div
              style={{
                width: `${
                  stats.total > 0 ? ((stats.failed + stats.cancelled) / stats.total) * 100 : 0
                }%`,
              }}
              className="bg-rose-500 transition-all duration-300"
              title="실패 / 취소"
            />
          </div>
        </div>
      </div>

      {/* 하단 2단 레이아웃: 수신자별 실시간 상태 테이블 & 실시간 이벤트 로그 콘솔 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 좌측(7칸): 수신자별 발송 상태 테이블 */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-white">
                수신자별 발송 큐 상태 (QUEUED / SENT / BOUNCED / FAILED)
              </h4>
              <p className="text-xs text-slate-400">
                각 수신자의 응답 코드, 적용 딜레이, 원클릭 수신거부 시뮬레이션을 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {(['ALL', 'QUEUED', 'SENT', 'BOUNCED', 'FAILED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusTab(st)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                    statusTab === st
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                상단의 <strong>[순차 발송 시작]</strong> 버튼을 클릭하면 수신자별 발송 상태가 실시간으로 업데이트됩니다.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">순번</th>
                    <th className="py-2.5 px-3 font-medium">상태</th>
                    <th className="py-2.5 px-3 font-medium">수신자</th>
                    <th className="py-2.5 px-3 font-medium">딜레이</th>
                    <th className="py-2.5 px-3 font-medium">응답 코드 / 상세</th>
                    <th className="py-2.5 px-3 font-medium text-right">RFC 8058 테스트</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredTasks.map((t) => {
                    const badge =
                      t.status === 'SENT'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : t.status === 'SENDING'
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 animate-pulse'
                        : t.status === 'BOUNCED'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : t.status === 'FAILED' || t.status === 'CANCELLED'
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700';

                    return (
                      <tr key={t.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono text-slate-400">#{t.rowIndex}</td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full border font-semibold text-[11px] ${badge}`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono text-slate-200">{t.email}</div>
                          <div className="text-[11px] text-slate-400">
                            {t.name} {t.company ? `(${t.company})` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">
                          {t.delayAppliedMs ? `${(t.delayAppliedMs / 1000).toFixed(2)}s` : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono text-[11px] text-slate-200">
                            {t.statusCode || '대기 중'}
                          </div>
                          {t.errorMessage && (
                            <div className="text-[11px] text-rose-400">{t.errorMessage}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => onSimulateOneClickUnsubscribe(t.email)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 text-[11px] transition"
                            title="수신자가 메일 클라이언트에서 원클릭 수신거부를 누른 상황을 시뮬레이션합니다"
                          >
                            <UserX className="w-3 h-3" />
                            원클릭 거부
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 우측(5칸): 실시간 이벤트 로그 스트림 콘솔 */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-semibold text-white">실시간 발송 이벤트 로그</h4>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {campaignStatus?.logs.length || 0} events
            </span>
          </div>

          <div className="p-4 font-mono text-xs space-y-2.5 max-h-96 overflow-y-auto flex-1">
            {(!campaignStatus?.logs || campaignStatus.logs.length === 0) ? (
              <div className="text-slate-500 py-12 text-center">
                아직 기록된 발송 이벤트 로그가 없습니다.
              </div>
            ) : (
              campaignStatus.logs.map((log) => {
                const color =
                  log.level === 'SUCCESS'
                    ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5'
                    : log.level === 'WARN'
                    ? 'text-amber-300 border-amber-500/30 bg-amber-500/5'
                    : log.level === 'ERROR'
                    ? 'text-rose-300 border-rose-500/30 bg-rose-500/5'
                    : 'text-indigo-200 border-slate-800 bg-slate-900/70';

                return (
                  <div
                    key={log.id}
                    className={`p-2.5 rounded-xl border text-[11px] leading-relaxed ${color}`}
                  >
                    <div className="flex items-center justify-between text-[10px] opacity-75 mb-0.5">
                      <span>{new Date(log.timestamp).toLocaleTimeString('ko-KR')}</span>
                      <span>{log.code || log.level}</span>
                    </div>
                    <div>{log.message}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 하단 이전 단계 이동 버튼 */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition"
        >
          <ArrowLeft className="w-4 h-4" />
          이전 (템플릿 & 컴플라이언스 설정)
        </button>
      </div>
    </div>
  );
};
