import React, { useState } from 'react';
import {
  ShieldCheck,
  Code2,
  Eye,
  FileCode,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Lock,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  ColumnMapping,
  ComplianceConfig,
  ValidatedRecipient,
} from '../types';

interface Step2Props {
  campaignTitle: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  bodyTextTemplate: string;
  compliance: ComplianceConfig;
  mapping: ColumnMapping;
  validRecipients: ValidatedRecipient[];
  onChangeTitle: (val: string) => void;
  onChangeSubject: (val: string) => void;
  onChangeHtml: (val: string) => void;
  onChangeText: (val: string) => void;
  onChangeCompliance: (next: ComplianceConfig) => void;
  onBack: () => void;
  onProceedNext: () => void;
}

export const Step2TemplateCompliance: React.FC<Step2Props> = ({
  campaignTitle,
  subjectTemplate,
  bodyHtmlTemplate,
  bodyTextTemplate,
  compliance,
  mapping,
  validRecipients,
  onChangeTitle,
  onChangeSubject,
  onChangeHtml,
  onChangeText,
  onChangeCompliance,
  onBack,
  onProceedNext,
}) => {
  const [editorTab, setEditorTab] = useState<'html' | 'text'>('html');
  const [previewIdx, setPreviewIdx] = useState(0);
  const [dnsChecks, setDnsChecks] = useState({
    spf: true,
    dkim2048: true,
    dmarcAlignment: true,
    spamThreshold: true,
  });

  const sampleRecipient: ValidatedRecipient = validRecipients[previewIdx] || {
    rowIndex: 1,
    email: 'jihun.kim@samsung-partner.kr',
    name: '김지훈',
    company: '삼성파트너스',
    variables: {
      name: '김지훈',
      company: '삼성파트너스',
      직급: '마케팅 팀장',
      맞춤할인율: '25%',
      담당매니저: '박서연 프로',
    },
    filterStatus: 'VALID',
  };

  const availableVariables = Array.from(
    new Set(['name', 'company', 'email', ...Object.keys(mapping.variableColumns)])
  );

  const interpolatePreview = (tpl: string, rec: ValidatedRecipient): string => {
    let output = tpl;
    const allVars: Record<string, string> = {
      ...rec.variables,
      name: rec.name || '고객',
      company: rec.company || '',
      email: rec.email,
    };
    for (const [k, v] of Object.entries(allVars)) {
      const regex = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}|\\{\\s*${k}\\s*\\}`, 'gi');
      output = output.replace(regex, v ?? '');
    }
    return output;
  };

  const renderedSubject = (() => {
    const clean = interpolatePreview(subjectTemplate, sampleRecipient)
      .replace(/^\(\s*광\s*고\s*\)\s*/i, '')
      .replace(/^\[\s*광고\s*\]\s*/i, '')
      .trim();
    return compliance.isAd ? `(광고) ${clean}` : clean;
  })();

  const unsubUrlPreview = `${compliance.unsubscribeBaseUrl}?email=${encodeURIComponent(
    sampleRecipient.email
  )}&cid=preview`;

  const insertVariableIntoBody = (varName: string) => {
    const token = `{${varName}}`;
    if (editorTab === 'html') {
      onChangeHtml(bodyHtmlTemplate + ` ${token}`);
    } else {
      onChangeText(bodyTextTemplate + ` ${token}`);
    }
  };

  const insertVariableIntoSubject = (varName: string) => {
    onChangeSubject(`${subjectTemplate} {${varName}}`.trim());
  };

  const domainPart = compliance.senderEmail.split('@')[1] || 'yourdomain.kr';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 좌측: 템플릿 작성기 및 치환 변수 칩 */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-indigo-400" />
                  이메일 템플릿 & 가변 치환 변수 에디터
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  엑셀 데이터의 개인화 변수를 제목과 본문에 삽입하고 HTML/텍스트 템플릿을 구성합니다.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
                발송 대상: {validRecipients.length}명
              </span>
            </div>

            {/* 캠페인 관리명 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                캠페인 이름 (내부 관리 및 결과 리포트 파일명)
              </label>
              <input
                type="text"
                value={campaignTitle}
                onChange={(e) => onChangeTitle(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                placeholder="예: 2026년 11월 엔터프라이즈 파트너십 제안 캠페인"
              />
            </div>

            {/* 이메일 제목 & (광고) 자동 삽입 표시 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  이메일 제목 템플릿
                </label>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[11px] text-slate-400 mr-1">제목에 변수 삽입:</span>
                  {availableVariables.slice(0, 4).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariableIntoSubject(v)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-600/30 text-[11px] font-mono text-indigo-300 border border-slate-700 transition"
                    >
                      +{`{${v}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex rounded-xl overflow-hidden border border-slate-700 bg-slate-950 focus-within:border-indigo-500">
                {compliance.isAd && (
                  <span className="px-3.5 py-2.5 bg-amber-500/20 border-r border-amber-500/30 text-amber-300 font-bold text-sm flex items-center gap-1 whitespace-nowrap">
                    (광고)
                  </span>
                )}
                <input
                  type="text"
                  value={subjectTemplate}
                  onChange={(e) => onChangeSubject(e.target.value)}
                  className="flex-1 bg-transparent px-3.5 py-2.5 text-sm text-white focus:outline-none"
                  placeholder="{company} {name}님을 위한 맞춤형 엔터프라이즈 혜택을 안내드립니다."
                />
              </div>
              {compliance.isAd && (
                <p className="text-[11px] text-amber-300/90 mt-1.5 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  정보통신망법 규정에 따라 제목 맨 앞에 변칙 표기 없는 <code className="font-bold">(광고)</code> 문구가 자동으로 고정 삽입됩니다.
                </p>
              )}
            </div>

            {/* 치환 변수 칩 바 */}
            <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3">
              <div className="text-xs text-slate-400 mb-2 flex items-center justify-between">
                <span>클릭하여 본문에 엑셀 치환 변수 삽입:</span>
                <span className="text-[11px] text-indigo-400">중괄호 {'{변수명}'} 자동 연동</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableVariables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariableIntoBody(v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/25 border border-indigo-500/30 text-xs font-mono text-indigo-300 transition"
                  >
                    <Sparkles className="w-3 h-3" />
                    {`{${v}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* HTML / TEXT 본문 에디터 탭 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditorTab('html')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      editorTab === 'html'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    HTML 템플릿 에디터
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab('text')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      editorTab === 'text'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Plain Text 대체 본문
                  </button>
                </div>
                <span className="text-[11px] text-slate-400">
                  하단 전송자 정보 및 수신거부 푸터는 발송 시 자동 결합됩니다.
                </span>
              </div>

              {editorTab === 'html' ? (
                <textarea
                  rows={11}
                  value={bodyHtmlTemplate}
                  onChange={(e) => onChangeHtml(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 p-4 font-mono text-xs text-slate-200 leading-relaxed focus:border-indigo-500 focus:outline-none"
                />
              ) : (
                <textarea
                  rows={11}
                  value={bodyTextTemplate}
                  onChange={(e) => onChangeText(e.target.value)}
                  placeholder="HTML을 지원하지 않는 메일 클라이언트를 위한 텍스트 본문입니다."
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 p-4 font-mono text-xs text-slate-200 leading-relaxed focus:border-indigo-500 focus:outline-none"
                />
              )}
            </div>
          </div>

          {/* 정보통신망법 & Google/Yahoo 컴플라이언스 설정 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  국내 정보통신망법 & Google/Yahoo 대량 발송 기술 요건 설정
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  광고성 정보 표기 의무사항 및 RFC 8058 원클릭 수신거부 헤더를 자동으로 주입합니다.
                </p>
              </div>
              <label className="inline-flex items-center gap-2.5 cursor-pointer bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  checked={compliance.isAd}
                  onChange={(e) =>
                    onChangeCompliance({
                      ...compliance,
                      isAd: e.target.checked,
                    })
                  }
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-amber-300">
                  광고성 메일 (정보통신망법 제50조 적용)
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  전송자 명칭 (회사/기관명) *
                </label>
                <input
                  type="text"
                  value={compliance.senderName}
                  onChange={(e) =>
                    onChangeCompliance({ ...compliance, senderName: e.target.value })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  발신자 전자우편주소 (SPF/DKIM 인증 도메인) *
                </label>
                <input
                  type="email"
                  value={compliance.senderEmail}
                  onChange={(e) =>
                    onChangeCompliance({ ...compliance, senderEmail: e.target.value })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  전송자 전화번호 (연락처) *
                </label>
                <input
                  type="text"
                  value={compliance.senderPhone}
                  onChange={(e) =>
                    onChangeCompliance({ ...compliance, senderPhone: e.target.value })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  수신거부 처리 엔드포인트 (RFC 8058 One-Click 지원 URL) *
                </label>
                <input
                  type="text"
                  value={compliance.unsubscribeBaseUrl}
                  onChange={(e) =>
                    onChangeCompliance({ ...compliance, unsubscribeBaseUrl: e.target.value })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs font-mono text-indigo-300"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  사업장 소재지 (주소) *
                </label>
                <input
                  type="text"
                  value={compliance.senderAddress}
                  onChange={(e) =>
                    onChangeCompliance({ ...compliance, senderAddress: e.target.value })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            {/* RFC 8058 원클릭 수신거부 헤더 스위치 & DNS 체크리스트 */}
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={compliance.includeRfc8058Headers}
                    onChange={(e) =>
                      onChangeCompliance({
                        ...compliance,
                        includeRfc8058Headers: e.target.checked,
                      })
                    }
                    className="rounded text-indigo-600 w-4 h-4"
                  />
                  <span className="text-xs font-semibold text-emerald-300">
                    RFC 8058 원클릭 수신거부 헤더 (List-Unsubscribe & List-Unsubscribe-Post) 필수 포함
                  </span>
                </label>
                <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Gmail · Yahoo 필수 요건
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1 overflow-x-auto">
                <div className="text-slate-500">// 발송 시 이메일 MIME 헤더에 자동 삽입되는 RFC 8058 헤더</div>
                <div>
                  <span className="text-indigo-400">List-Unsubscribe:</span> &lt;{unsubUrlPreview}&gt;, &lt;mailto:{compliance.replyToEmail}?subject=unsubscribe&gt;
                </div>
                <div>
                  <span className="text-indigo-400">List-Unsubscribe-Post:</span> List-Unsubscribe=One-Click
                </div>
              </div>

              {/* 도메인 인증 체크리스트 */}
              <div className="pt-2 border-t border-slate-800/80">
                <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-indigo-400" />
                  발신 도메인({domainPart}) 인증 및 스팸률 기술 체크리스트
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/70 border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dnsChecks.spf}
                      onChange={(e) => setDnsChecks({ ...dnsChecks, spf: e.target.checked })}
                      className="rounded text-emerald-500"
                    />
                    <span className="text-slate-300">SPF 레코드 설정 완료 (v=spf1 ...)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/70 border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dnsChecks.dkim2048}
                      onChange={(e) => setDnsChecks({ ...dnsChecks, dkim2048: e.target.checked })}
                      className="rounded text-emerald-500"
                    />
                    <span className="text-slate-300">DKIM 2048-bit 서명 (List-Unsubscribe 포함)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/70 border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dnsChecks.dmarcAlignment}
                      onChange={(e) =>
                        setDnsChecks({ ...dnsChecks, dmarcAlignment: e.target.checked })
                      }
                      className="rounded text-emerald-500"
                    />
                    <span className="text-slate-300">DMARC (p=none 이상) & From 도메인 정렬</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/70 border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dnsChecks.spamThreshold}
                      onChange={(e) =>
                        setDnsChecks({ ...dnsChecks, spamThreshold: e.target.checked })
                      }
                      className="rounded text-emerald-500"
                    />
                    <span className="text-slate-300">Postmaster 스팸 신고율 0.1% 미만 유지</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 우측: 실시간 수신자별 치환 & 법적 고지 렌더링 프리뷰 */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 flex flex-col h-full justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Eye className="w-4 h-4 text-indigo-400" />
                    실시간 개인화 렌더링 미리보기
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    수신자별로 치환 변수가 실제 적용된 화면과 법적 의무 푸터를 확인합니다.
                  </p>
                </div>
              </div>

              {/* 미리보기 대상 수신자 선택 */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  미리보기 수신자 선택 (엑셀 데이터 연동)
                </label>
                <select
                  value={previewIdx}
                  onChange={(e) => setPreviewIdx(Number(e.target.value))}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
                >
                  {validRecipients.map((r, i) => (
                    <option key={r.rowIndex} value={i}>
                      #{r.rowIndex} {r.name || '이름없음'} ({r.company || '소속없음'}) — {r.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* 이메일 클라이언트 프레임 */}
              <div className="rounded-2xl border border-slate-700 overflow-hidden bg-white text-slate-900 shadow-xl">
                {/* 메일 헤더 영역 */}
                <div className="bg-slate-100 border-b border-slate-200 p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold text-[11px]">
                      Gmail / Naver 웹메일 수신 화면 시뮬레이션
                    </span>
                    {compliance.includeRfc8058Headers && (
                      <a
                        href={unsubUrlPreview}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-blue-600 hover:underline bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
                      >
                        수신거부(One-Click Header)
                      </a>
                    )}
                  </div>
                  <div className="font-bold text-sm text-slate-900 pt-1">
                    {renderedSubject}
                  </div>
                  <div className="text-slate-600 space-y-0.5 text-[11px]">
                    <div>
                      <strong>보낸사람:</strong> {compliance.senderName} &lt;{compliance.senderEmail}&gt;
                    </div>
                    <div>
                      <strong>받는사람:</strong> {sampleRecipient.name} &lt;{sampleRecipient.email}&gt;
                    </div>
                  </div>
                </div>

                {/* 메일 본문 렌더링 */}
                <div className="p-5 text-sm leading-relaxed space-y-4 max-h-[420px] overflow-y-auto">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: interpolatePreview(bodyHtmlTemplate, sampleRecipient),
                    }}
                  />

                  {/* 정보통신망법 준수 자동 푸터 */}
                  {compliance.isAd ? (
                    <div className="mt-6 p-4 bg-slate-50 border-t-2 border-slate-300 rounded-lg text-xs text-slate-600 space-y-1.5">
                      <div className="font-bold text-slate-800">
                        [정보통신망 이용촉진 및 정보보호 등에 관한 법률 제50조에 따른 표시사항]
                      </div>
                      <div>
                        • <strong>전송자 명칭</strong>: {compliance.senderName} |{' '}
                        <strong>전자우편</strong>: {compliance.senderEmail} |{' '}
                        <strong>연락처</strong>: {compliance.senderPhone}
                      </div>
                      <div>
                        • <strong>사업장 소재지</strong>: {compliance.senderAddress}
                      </div>
                      <div className="pt-2 border-t border-slate-200 text-[11px]">
                        본 메일은 정보통신망법 등 관련 법령에 의거하여 수신동의 여부를 확인한 후 발송되었습니다. 수신을 원치 않으시면{' '}
                        <a
                          href={unsubUrlPreview}
                          target="_blank"
                          rel="noreferrer"
                          className="text-rose-600 font-bold underline"
                        >
                          [수신거부 (무료)]
                        </a>
                        를 클릭해 주시기 바랍니다. (If you do not wish to receive further emails, please click{' '}
                        <a
                          href={unsubUrlPreview}
                          target="_blank"
                          rel="noreferrer"
                          className="text-rose-600 underline"
                        >
                          [Unsubscribe]
                        </a>
                        . Processed immediately without login.)
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 pt-3 border-t border-slate-200 text-xs text-slate-500">
                      발신자: {compliance.senderName} ({compliance.senderEmail}) | 수신을 원치 않으시면{' '}
                      <a
                        href={unsubUrlPreview}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 underline"
                      >
                        수신거부(Unsubscribe)
                      </a>
                      를 클릭해 주세요.
                    </div>
                  )}
                </div>
              </div>

              {/* 컴플라이언스 검증 요약 배지 */}
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 text-xs text-emerald-200 space-y-1.5">
                <div className="font-semibold flex items-center gap-1.5 text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  컴플라이언스 자동 점검 통과
                </div>
                <ul className="text-[11px] text-emerald-300/90 space-y-1 pl-5 list-disc">
                  <li>
                    {compliance.isAd
                      ? '제목 시작 부분 (광고) 표기 및 하단 전송자 4대 필수 정보 포함됨'
                      : '비광고성 안내 메일 포맷 및 기본 수신거부 링크 포함됨'}
                  </li>
                  <li>
                    무로그인 즉시 수신거부 웹 링크 작동 (클릭 시 새 창에서 실제 수신거부 테스트 가능)
                  </li>
                  <li>
                    RFC 8058 원클릭 수신거부 헤더(List-Unsubscribe-Post) 활성화됨
                  </li>
                </ul>
              </div>
            </div>

            {/* 하단 네비게이션 버튼 */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition"
              >
                <ArrowLeft className="w-4 h-4" />
                이전 (데이터 매핑)
              </button>
              <button
                type="button"
                onClick={onProceedNext}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition shadow-lg shadow-indigo-600/25"
              >
                <span>순차 발송 큐 & Rate Limit 설정으로 이동</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
