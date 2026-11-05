import React, { useEffect, useMemo, useState } from 'react';
import {
  Mail,
  FileSpreadsheet,
  ShieldCheck,
  Activity,
  CheckCircle2,
  Scale,
  Server,
} from 'lucide-react';
import {
  CampaignStatusResponse,
  ColumnMapping,
  ComplianceConfig,
  OptOutEntry,
  ProviderConfig,
  RateLimitConfig,
  RawRow,
} from './types';
import {
  SAMPLE_EXCEL_ROWS,
  autoDetectColumnMapping,
  parseExcelOrCsvFile,
  validateAndFilterRows,
} from './utils/excelHelper';
import {
  clientQueueEngine,
  loadClientOptOutList,
  saveClientOptOutList,
} from './utils/clientQueueEngine';
import { Step1UploadMapping } from './components/Step1UploadMapping';
import { Step2TemplateCompliance } from './components/Step2TemplateCompliance';
import { Step3QueueAndDashboard } from './components/Step3QueueAndDashboard';

const DEFAULT_HTML_TEMPLATE = `<div style="padding: 8px 0;">
  <h2 style="color: #1e293b; font-size: 20px; margin-bottom: 12px;">
    안녕하세요, <strong>{company}</strong> <strong>{name}</strong> ({직급})님!
  </h2>
  <p style="margin: 0 0 14px 0;">
    귀사의 비즈니스 성장을 지원하는 엔터프라이즈 클라우드 솔루션 파트너 <strong>(주)테크플로우 코리아</strong>입니다.
  </p>
  <div style="background: #eef2ff; border-left: 4px solid #4f46e5; padding: 14px 18px; border-radius: 6px; margin: 18px 0;">
    <p style="margin: 0; font-weight: 600; color: #312e81;">
      🎁 {company} 전용 특별 프로모션 안내
    </p>
    <p style="margin: 6px 0 0 0; font-size: 13px; color: #3730a3;">
      • 적용 우대 할인율: <strong>{맞춤할인율}</strong><br/>
      • 전담 컨설턴트: <strong>{담당매니저}</strong>
    </p>
  </div>
  <p style="margin: 0;">
    도입 상담이나 상세 견적이 필요하시면 언제든 본 메일에 회신해 주시기 바랍니다. 감사합니다.
  </p>
</div>`;

const DEFAULT_TEXT_TEMPLATE = `안녕하세요, {company} {name} ({직급})님!
귀사의 비즈니스 성장을 지원하는 (주)테크플로우 코리아입니다.

[{company} 전용 특별 프로모션 안내]
- 적용 우대 할인율: {맞춤할인율}
- 전담 컨설턴트: {담당매니저}

도입 상담이나 상세 견적이 필요하시면 언제든 회신해 주시기 바랍니다.`;

export const App: React.FC = () => {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Step 1 상태: 엑셀 데이터 & 컬럼 매핑 & 수신거부 DB
  const sampleHeaders = Object.keys(SAMPLE_EXCEL_ROWS[0]);
  const [fileName, setFileName] = useState<string>('샘플_대량이메일_수신자목록.xlsx (기본 탑재)');
  const [headers, setHeaders] = useState<string[]>(sampleHeaders);
  const [rawRows, setRawRows] = useState<RawRow[]>(SAMPLE_EXCEL_ROWS);
  const [mapping, setMapping] = useState<ColumnMapping>(() =>
    autoDetectColumnMapping(sampleHeaders)
  );
  const [optOutList, setOptOutList] = useState<OptOutEntry[]>(() => loadClientOptOutList());
  const [useClientFallback, setUseClientFallback] = useState<boolean>(false);

  // Step 2 상태: 이메일 템플릿 & 법적 컴플라이언스
  const [campaignTitle, setCampaignTitle] = useState<string>(
    '2026년 11월 엔터프라이즈 맞춤 혜택 안내 캠페인'
  );
  const [subjectTemplate, setSubjectTemplate] = useState<string>(
    '{company} {name}님을 위한 엔터프라이즈 {맞춤할인율} 특별 혜택 안내'
  );
  const [bodyHtmlTemplate, setBodyHtmlTemplate] = useState<string>(DEFAULT_HTML_TEMPLATE);
  const [bodyTextTemplate, setBodyTextTemplate] = useState<string>(DEFAULT_TEXT_TEMPLATE);

  const [compliance, setCompliance] = useState<ComplianceConfig>({
    isAd: true,
    senderName: '(주)테크플로우 코리아',
    senderEmail: 'newsletter@techflow.kr',
    replyToEmail: 'support@techflow.kr',
    senderPhone: '02-1588-0000',
    senderAddress: '서울특별시 강남구 테헤란로 152 파이낸스센터 18층',
    unsubscribeBaseUrl: 'http://localhost:4000/api/unsubscribe',
    includeRfc8058Headers: true,
    enforceDkimSpfCheck: true,
  });

  // Step 3 상태: Rate Limiting & 이메일 API 프로바이더 & 실시간 캠페인 상태
  const [rateLimit, setRateLimit] = useState<RateLimitConfig>({
    minDelaySec: 0.8,
    maxDelaySec: 1.8,
    batchSize: 5,
    batchRestSec: 6,
  });

  const [providerConfig, setProviderConfig] = useState<ProviderConfig>({
    provider: 'dryrun',
    resendApiKey: '',
    smtpHost: 'email-smtp.ap-northeast-2.amazonaws.com',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpSecure: false,
    simulateBounceRate: 8,
  });

  const [campaignStatus, setCampaignStatus] = useState<CampaignStatusResponse | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // 수신거부 DB 로드
  const fetchOptOutList = async () => {
    try {
      const res = await fetch('/api/optout');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        setOptOutList(data.optOutList || []);
        setUseClientFallback(false);
        return;
      }
      throw new Error('Static hosting mode');
    } catch {
      setUseClientFallback(true);
      setOptOutList(loadClientOptOutList());
    }
  };

  // 캠페인 실시간 상태 폴링
  const fetchCampaignStatus = async () => {
    try {
      const res = await fetch('/api/campaign/status');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data: CampaignStatusResponse = await res.json();
        setCampaignStatus(data);
        setUseClientFallback(false);
        return;
      }
      throw new Error('Static hosting mode');
    } catch {
      setUseClientFallback(true);
      setCampaignStatus(clientQueueEngine.getStatus());
    }
  };

  useEffect(() => {
    fetchOptOutList();
    fetchCampaignStatus();
    const unsub = clientQueueEngine.subscribe(() => {
      setCampaignStatus(clientQueueEngine.getStatus());
    });
    const timer = setInterval(() => {
      fetchCampaignStatus();
    }, 800);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  // 수신자 목록 검증 및 필터링
  const validatedList = useMemo(
    () => validateAndFilterRows(rawRows, mapping, optOutList),
    [rawRows, mapping, optOutList]
  );

  const validRecipients = useMemo(
    () => validatedList.filter((r) => r.filterStatus === 'VALID'),
    [validatedList]
  );

  const excludedRecipients = useMemo(
    () => validatedList.filter((r) => r.filterStatus !== 'VALID'),
    [validatedList]
  );

  // 파일 업로드 처리
  const handleFileSelected = async (file: File) => {
    try {
      const parsed = await parseExcelOrCsvFile(file);
      if (parsed.headers.length === 0) {
        showToast('파일에 유효한 데이터 행이 없습니다.');
        return;
      }
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(autoDetectColumnMapping(parsed.headers));
      showToast(`${file.name} 로드 완료 (${parsed.rows.length}행 감지)`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '파일 파싱 중 오류가 발생했습니다.');
    }
  };

  // 샘플 데이터 로드
  const handleLoadSampleData = () => {
    const hdrs = Object.keys(SAMPLE_EXCEL_ROWS[0]);
    setFileName('샘플_대량이메일_수신자목록.xlsx (15건)');
    setHeaders(hdrs);
    setRawRows(SAMPLE_EXCEL_ROWS);
    setMapping(autoDetectColumnMapping(hdrs));
    showToast('샘플 수신자 데이터 15건이 로드되었습니다.');
  };

  // 수신거부 DB 추가/삭제
  const handleAddOptOut = async (email: string, reason: string) => {
    if (!useClientFallback) {
      try {
        const res = await fetch('/api/optout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, reason, source: 'ADMIN_MANUAL' }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (res.ok) {
            setOptOutList(data.optOutList);
            showToast(`${email} 계정이 수신거부(Opt-Out) DB에 등록되었습니다.`);
          } else {
            showToast(data.error || '수신거부 등록 실패');
          }
          return;
        }
      } catch {
        // fallback below
      }
    }

    const normalized = email.trim().toLowerCase();
    const current = loadClientOptOutList();
    if (current.some((item) => item.email.toLowerCase() === normalized)) {
      showToast('이미 수신거부 목록에 등록된 이메일입니다.');
      return;
    }
    const now = new Date().toISOString();
    const nextList: OptOutEntry[] = [
      {
        email: normalized,
        reason: reason || '관리자 수동 수신거부 등록',
        source: 'ADMIN_MANUAL',
        unsubscribedAt: now,
        noticeSentAt: now,
      },
      ...current,
    ];
    saveClientOptOutList(nextList);
    setOptOutList(nextList);
    showToast(`${email} 계정이 수신거부(Opt-Out) DB에 등록되었습니다.`);
  };

  const handleRemoveOptOut = async (email: string) => {
    if (!useClientFallback) {
      try {
        const res = await fetch(`/api/optout/${encodeURIComponent(email)}`, {
          method: 'DELETE',
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          setOptOutList(data.optOutList);
          showToast(`${email} 수신거부가 해제되었습니다.`);
          return;
        }
      } catch {
        // fallback below
      }
    }

    const target = email.trim().toLowerCase();
    const nextList = loadClientOptOutList().filter(
      (item) => item.email.toLowerCase() !== target
    );
    saveClientOptOutList(nextList);
    setOptOutList(nextList);
    showToast(`${email} 수신거부가 해제되었습니다.`);
  };

  // 캠페인 제어 액션
  const handleStartCampaign = async () => {
    const payload = {
      title: campaignTitle,
      subjectTemplate,
      bodyHtmlTemplate,
      bodyTextTemplate,
      compliance,
      rateLimit,
      providerConfig,
      recipients: validRecipients.map((r) => ({
        rowIndex: r.rowIndex,
        email: r.email,
        name: r.name,
        company: r.company,
        variables: r.variables,
      })),
    };

    if (!useClientFallback) {
      try {
        const res = await fetch('/api/campaign/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (res.ok) {
            showToast(`순차 발송 큐가 시작되었습니다. (총 ${validRecipients.length}건)`);
            fetchCampaignStatus();
          } else {
            showToast(data.error || '캠페인 시작 실패');
          }
          return;
        }
      } catch {
        // fallback below
      }
    }

    clientQueueEngine.start(payload);
    setCampaignStatus(clientQueueEngine.getStatus());
    showToast(`순차 발송 큐가 시작되었습니다. (총 ${validRecipients.length}건)`);
  };

  const handlePauseCampaign = async () => {
    if (!useClientFallback) {
      try {
        const res = await fetch('/api/campaign/pause', { method: 'POST' });
        if (res.ok) {
          showToast('발송 큐가 일시 정지되었습니다.');
          fetchCampaignStatus();
          return;
        }
      } catch {
        // fallback below
      }
    }
    clientQueueEngine.pause();
    setCampaignStatus(clientQueueEngine.getStatus());
    showToast('발송 큐가 일시 정지되었습니다.');
  };

  const handleResumeCampaign = async () => {
    if (!useClientFallback) {
      try {
        const res = await fetch('/api/campaign/resume', { method: 'POST' });
        if (res.ok) {
          showToast('발송 큐를 재개합니다.');
          fetchCampaignStatus();
          return;
        }
      } catch {
        // fallback below
      }
    }
    clientQueueEngine.resume();
    setCampaignStatus(clientQueueEngine.getStatus());
    showToast('발송 큐를 재개합니다.');
  };

  const handleCancelCampaign = async () => {
    if (!useClientFallback) {
      try {
        const res = await fetch('/api/campaign/cancel', { method: 'POST' });
        if (res.ok) {
          showToast('발송 큐가 취소되었습니다.');
          fetchCampaignStatus();
          return;
        }
      } catch {
        // fallback below
      }
    }
    clientQueueEngine.cancel();
    setCampaignStatus(clientQueueEngine.getStatus());
    showToast('발송 큐가 취소되었습니다.');
  };

  const handleResetCampaign = async () => {
    if (!useClientFallback) {
      try {
        const res = await fetch('/api/campaign/reset', { method: 'POST' });
        if (res.ok) {
          showToast('캠페인 상태가 초기화되었습니다.');
          fetchCampaignStatus();
          return;
        }
      } catch {
        // fallback below
      }
    }
    clientQueueEngine.reset();
    setCampaignStatus(clientQueueEngine.getStatus());
    showToast('캠페인 상태가 초기화되었습니다.');
  };

  const handleSimulateOneClickUnsubscribe = async (email: string) => {
    if (!useClientFallback) {
      try {
        const res = await fetch(`/api/unsubscribe?email=${encodeURIComponent(email)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'List-Unsubscribe=One-Click',
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          await fetchOptOutList();
          await fetchCampaignStatus();
          showToast(`[RFC 8058 One-Click] ${email} 원클릭 수신거부 처리 및 Opt-Out DB 반영 완료`);
          return;
        }
      } catch {
        // fallback below
      }
    }

    const normalized = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const current = loadClientOptOutList();
    if (!current.some((item) => item.email.toLowerCase() === normalized)) {
      const nextList: OptOutEntry[] = [
        {
          email: normalized,
          reason: 'RFC 8058 List-Unsubscribe=One-Click 자동 처리',
          source: 'ONE_CLICK_RFC8058',
          unsubscribedAt: now,
          noticeSentAt: now,
        },
        ...current,
      ];
      saveClientOptOutList(nextList);
      setOptOutList(nextList);
    }
    clientQueueEngine.addLog(
      'WARN',
      `[RFC 8058 원클릭 수신거부 접수] ${normalized} — 즉시 수신거부 DB 반영 및 처리결과 통지 완료`,
      { email: normalized, status: 'SYSTEM', code: 'RFC8058_ONE_CLICK' }
    );
    setCampaignStatus(clientQueueEngine.getStatus());
    showToast(`[RFC 8058 One-Click] ${email} 원클릭 수신거부 처리 및 Opt-Out DB 반영 완료`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 상단 글로벌 헤더 */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  MailFlow Pro
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  KISA 정보통신망법 & RFC 8058 준수
                </span>
              </div>
              <p className="text-xs text-slate-400">
                엑셀 기반 개인화 대량 이메일 순차 발송 & Rate Limiting 워크스페이스
              </p>
            </div>
          </div>

          {/* 컴플라이언스 상태 배지 바 */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <span>정보통신망법 (광고) 표기:</span>
              <strong className={compliance.isAd ? 'text-amber-300' : 'text-slate-400'}>
                {compliance.isAd ? '활성' : '비광고'}
              </strong>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>RFC 8058 One-Click 헤더:</span>
              <strong className="text-emerald-300">
                {compliance.includeRfc8058Headers ? '서명 포함' : '미포함'}
              </strong>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              <span>유효 발송 대상:</span>
              <strong className="text-indigo-300">{validRecipients.length}명</strong>
            </div>
          </div>
        </div>

        {/* 스텝 네비게이션 탭 */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveStep(1)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition ${
                activeStep === 1
                  ? 'border-indigo-500 bg-indigo-500/15 text-white'
                  : 'border-slate-800/80 bg-slate-900/50 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  activeStep === 1
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                1
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
                  엑셀 업로드 & 컬럼 매핑
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  유효 {validRecipients.length}건 · 제외 {excludedRecipients.length}건
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveStep(2)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition ${
                activeStep === 2
                  ? 'border-indigo-500 bg-indigo-500/15 text-white'
                  : 'border-slate-800/80 bg-slate-900/50 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  activeStep === 2
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                2
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  템플릿 에디터 & 컴플라이언스
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  (광고) 표기 · 전송자 명시 · RFC 8058
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition ${
                activeStep === 3
                  ? 'border-indigo-500 bg-indigo-500/15 text-white'
                  : 'border-slate-800/80 bg-slate-900/50 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  activeStep === 3
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                3
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  순차 발송 큐 & 실시간 대시보드
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {rateLimit.minDelaySec}~{rateLimit.maxDelaySec}초 딜레이 · 배치 {rateLimit.batchSize}건
                </div>
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* 알림 토스트 */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl bg-indigo-600 text-white text-xs font-semibold shadow-2xl border border-indigo-400/40 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 메인 워크스페이스 영역 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeStep === 1 && (
          <Step1UploadMapping
            fileName={fileName}
            headers={headers}
            rawRows={rawRows}
            mapping={mapping}
            validatedList={validatedList}
            optOutList={optOutList}
            onFileSelected={handleFileSelected}
            onLoadSampleData={handleLoadSampleData}
            onUpdateMapping={setMapping}
            onAddOptOut={handleAddOptOut}
            onRemoveOptOut={handleRemoveOptOut}
            onProceedNext={() => setActiveStep(2)}
          />
        )}

        {activeStep === 2 && (
          <Step2TemplateCompliance
            campaignTitle={campaignTitle}
            subjectTemplate={subjectTemplate}
            bodyHtmlTemplate={bodyHtmlTemplate}
            bodyTextTemplate={bodyTextTemplate}
            compliance={compliance}
            mapping={mapping}
            validRecipients={validRecipients}
            onChangeTitle={setCampaignTitle}
            onChangeSubject={setSubjectTemplate}
            onChangeHtml={setBodyHtmlTemplate}
            onChangeText={setBodyTextTemplate}
            onChangeCompliance={setCompliance}
            onBack={() => setActiveStep(1)}
            onProceedNext={() => setActiveStep(3)}
          />
        )}

        {activeStep === 3 && (
          <Step3QueueAndDashboard
            validRecipients={validRecipients}
            excludedRecipients={excludedRecipients}
            rateLimit={rateLimit}
            providerConfig={providerConfig}
            campaignStatus={campaignStatus}
            onChangeRateLimit={setRateLimit}
            onChangeProvider={setProviderConfig}
            onStartCampaign={handleStartCampaign}
            onPauseCampaign={handlePauseCampaign}
            onResumeCampaign={handleResumeCampaign}
            onCancelCampaign={handleCancelCampaign}
            onResetCampaign={handleResetCampaign}
            onSimulateOneClickUnsubscribe={handleSimulateOneClickUnsubscribe}
            onBack={() => setActiveStep(2)}
          />
        )}
      </main>
    </div>
  );
};

export default App;
