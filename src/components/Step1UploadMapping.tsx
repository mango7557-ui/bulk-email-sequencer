import React, { useRef, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Ban,
  Download,
  Sparkles,
  Plus,
  Trash2,
  ShieldAlert,
  ArrowRight,
  Table,
  Users,
} from 'lucide-react';
import {
  ColumnMapping,
  FilterReason,
  OptOutEntry,
  RawRow,
  ValidatedRecipient,
} from '../types';
import { downloadSampleExcelFile } from '../utils/excelHelper';
import { GmailContactsModal } from './GmailContactsModal';

interface Step1Props {
  fileName: string;
  headers: string[];
  rawRows: RawRow[];
  mapping: ColumnMapping;
  validatedList: ValidatedRecipient[];
  optOutList: OptOutEntry[];
  onFileSelected: (file: File) => void;
  onLoadSampleData: () => void;
  onImportGmailContacts: (rows: RawRow[], mode: 'merge' | 'replace', sourceLabel: string) => void;
  onUpdateMapping: (next: ColumnMapping) => void;
  onAddOptOut: (email: string, reason: string) => Promise<void>;
  onRemoveOptOut: (email: string) => Promise<void>;
  onProceedNext: () => void;
}

export const Step1UploadMapping: React.FC<Step1Props> = ({
  fileName,
  headers,
  rawRows,
  mapping,
  validatedList,
  optOutList,
  onFileSelected,
  onLoadSampleData,
  onImportGmailContacts,
  onUpdateMapping,
  onAddOptOut,
  onRemoveOptOut,
  onProceedNext,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | FilterReason>('ALL');
  const [newVarName, setNewVarName] = useState('');
  const [newVarCol, setNewVarCol] = useState('');
  const [newOptOutEmail, setNewOptOutEmail] = useState('');
  const [newOptOutReason, setNewOptOutReason] = useState('');
  const [showOptOutManager, setShowOptOutManager] = useState(false);
  const [showGmailModal, setShowGmailModal] = useState(false);

  const validCount = validatedList.filter((r) => r.filterStatus === 'VALID').length;
  const syntaxErrCount = validatedList.filter((r) => r.filterStatus === 'INVALID_SYNTAX').length;
  const duplicateCount = validatedList.filter((r) => r.filterStatus === 'DUPLICATE').length;
  const optOutCount = validatedList.filter((r) => r.filterStatus === 'OPT_OUT_EXCLUDED').length;

  const filteredRecipients =
    statusFilter === 'ALL'
      ? validatedList
      : validatedList.filter((r) => r.filterStatus === statusFilter);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const handleAddCustomVariable = () => {
    const cleanKey = newVarName.trim().replace(/[{}]/g, '').replace(/\s+/g, '_');
    if (!cleanKey || !newVarCol) return;
    onUpdateMapping({
      ...mapping,
      variableColumns: {
        ...mapping.variableColumns,
        [cleanKey]: newVarCol,
      },
    });
    setNewVarName('');
    setNewVarCol('');
  };

  const handleRemoveVariable = (key: string) => {
    const nextVars = { ...mapping.variableColumns };
    delete nextVars[key];
    onUpdateMapping({
      ...mapping,
      variableColumns: nextVars,
    });
  };

  const handleAddOptOutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOptOutEmail.trim()) return;
    await onAddOptOut(newOptOutEmail.trim(), newOptOutReason.trim() || '관리자 수동 수신거부 등록');
    setNewOptOutEmail('');
    setNewOptOutReason('');
  };

  return (
    <div className="space-y-6">
      {/* 상단 파일 업로드 & 샘플 데이터 로드 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`lg:col-span-2 cursor-pointer rounded-2xl border-2 border-dashed p-8 transition-all flex flex-col items-center justify-center text-center ${
            isDragging
              ? 'border-indigo-400 bg-indigo-950/40'
              : 'border-slate-700/80 bg-slate-900/70 hover:border-indigo-500/70 hover:bg-slate-900'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.vcf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
              e.target.value = '';
            }}
          />
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center mb-4 text-indigo-400">
            <Upload className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">
            엑셀(.xlsx) 또는 CSV(.csv) 파일을 드래그 앤 드롭하세요
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            이메일 주소, 수신자명, 회사명 및 개인화 치환 변수가 포함된 시트를 즉시 파싱합니다.
          </p>
          {fileName ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-medium">
              <FileSpreadsheet className="w-4 h-4" />
              <span>현재 로드된 데이터: {fileName}</span>
              <span className="text-xs text-emerald-400/80">({rawRows.length}행)</span>
            </div>
          ) : (
            <span className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition">
              컴퓨터에서 파일 선택하기
            </span>
          )}
        </div>

        {/* 빠른 테스트 도구 & 수신거부 DB 요약 카드 */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                Quick Start & Opt-Out DB
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300 border border-slate-700">
                SheetJS 엔진
              </span>
            </div>
            <h4 className="text-base font-semibold text-white mb-1">
              샘플 수신자 데이터 및 수신거부 필터
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              정상 이메일, 중복 행, 문법 오류, 수신거부(Opt-Out) 대상, 하드 바운스 테스트 계정이 포함된 15건의 샘플 데이터를 원클릭으로 불러올 수 있습니다.
            </p>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setShowGmailModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold transition shadow-lg shadow-blue-600/25"
            >
              <Users className="w-4 h-4" />
              Gmail 주소록 (Google Contacts) 연동
            </button>
            <button
              type="button"
              onClick={onLoadSampleData}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              샘플 엑셀 데이터(15건) 즉시 로드
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={downloadSampleExcelFile}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
              >
                <Download className="w-3.5 h-3.5" />
                샘플 .xlsx 다운로드
              </button>
              <button
                type="button"
                onClick={() => setShowOptOutManager((prev) => !prev)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-medium border border-rose-500/30 transition"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                수신거부 DB ({optOutList.length}건)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Gmail 주소록(Google Contacts) 연동 모달 */}
      <GmailContactsModal
        isOpen={showGmailModal}
        onClose={() => setShowGmailModal(false)}
        onImportContacts={onImportGmailContacts}
      />

      {/* 수신거부(Opt-Out) DB 관리 패널 */}
      {showOptOutManager && (
        <div className="rounded-2xl border border-rose-500/30 bg-slate-900/95 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
            <div>
              <h4 className="text-base font-semibold text-white flex items-center gap-2">
                <Ban className="w-4 h-4 text-rose-400" />
                수신거부(Opt-Out) 블랙리스트 데이터베이스 (정보통신망법 제50조 준수)
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                여기에 등록된 이메일은 엑셀 업로드 시 자동으로 발송 대상에서 제외되며, 수신거부 처리일시 및 14일 이내 처리결과 통지 이력이 기록됩니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowOptOutManager(false)}
              className="self-start sm:self-auto text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800"
            >
              닫기
            </button>
          </div>

          <form onSubmit={handleAddOptOutSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              required
              placeholder="수신거부 등록할 이메일 (예: user@domain.com)"
              value={newOptOutEmail}
              onChange={(e) => setNewOptOutEmail(e.target.value)}
              className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="수신거부 사유 (예: 고객센터 요청, 웹 수신거부)"
              value={newOptOutReason}
              onChange={(e) => setNewOptOutReason(e.target.value)}
              className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium transition whitespace-nowrap"
            >
              + 수신거부 추가
            </button>
          </form>

          <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/80">
            {optOutList.map((item) => (
              <div
                key={item.email}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 bg-slate-950/60 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-rose-300">{item.email}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {item.source}
                  </span>
                  <span className="text-slate-400">{item.reason}</span>
                </div>
                <div className="flex items-center gap-4 text-slate-400">
                  <span>처리결과 통지: {new Date(item.noticeSentAt).toLocaleDateString('ko-KR')} 완료</span>
                  <button
                    type="button"
                    onClick={() => onRemoveOptOut(item.email)}
                    className="text-slate-400 hover:text-rose-400 transition"
                    title="수신거부 해제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 컬럼 매핑 UI & 치환 변수 설정 */}
      {headers.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-semibold text-white">
                컬럼 매핑 (Column Mapping) 및 개인화 치환 변수 설정
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                엑셀 시트의 헤더 컬럼을 이메일 주소(필수), 수신자 이름, 회사명 및 본문 치환 변수와 연결합니다.
              </p>
            </div>
            <span className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 rounded-full">
              감지된 엑셀 컬럼: {headers.length}개
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                이메일 주소 컬럼 <span className="text-rose-400">* (필수)</span>
              </label>
              <select
                value={mapping.emailColumn}
                onChange={(e) =>
                  onUpdateMapping({
                    ...mapping,
                    emailColumn: e.target.value,
                  })
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">컬럼 선택...</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                수신자 이름 컬럼 <code className="text-indigo-400">{'{name}'}</code>
              </label>
              <select
                value={mapping.nameColumn}
                onChange={(e) =>
                  onUpdateMapping({
                    ...mapping,
                    nameColumn: e.target.value,
                    variableColumns: {
                      ...mapping.variableColumns,
                      name: e.target.value,
                    },
                  })
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">선택 안 함</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                회사/소속 컬럼 <code className="text-indigo-400">{'{company}'}</code>
              </label>
              <select
                value={mapping.companyColumn}
                onChange={(e) =>
                  onUpdateMapping({
                    ...mapping,
                    companyColumn: e.target.value,
                    variableColumns: {
                      ...mapping.variableColumns,
                      company: e.target.value,
                    },
                  })
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">선택 안 함</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 추가 가변 치환 변수 매핑 */}
          <div className="pt-2 border-t border-slate-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">
                사용 가능한 본문/제목 치환 변수 (템플릿에서 <code className="text-indigo-400">{'{변수명}'}</code> 형태로 자동 삽입)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="변수명 (예: discount)"
                  value={newVarName}
                  onChange={(e) => setNewVarName(e.target.value)}
                  className="w-36 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
                />
                <select
                  value={newVarCol}
                  onChange={(e) => setNewVarCol(e.target.value)}
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="">엑셀 컬럼 선택</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddCustomVariable}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-indigo-300 border border-slate-700"
                >
                  <Plus className="w-3.5 h-3.5" /> 변수 매핑 추가
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.entries(mapping.variableColumns).map(([varKey, colName]) => (
                <div
                  key={varKey}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                >
                  <code className="font-mono font-semibold text-indigo-400">{`{${varKey}}`}</code>
                  <span className="text-slate-500">←</span>
                  <span className="text-slate-200">{colName}</span>
                  {varKey !== 'name' && varKey !== 'company' && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVariable(varKey)}
                      className="text-slate-500 hover:text-rose-400 ml-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 데이터 검증 및 필터링 요약 카드 */}
      {validatedList.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`p-4 rounded-2xl border text-left transition ${
                statusFilter === 'ALL'
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
              }`}
            >
              <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                <span>전체 업로드 행</span>
                <Table className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold text-white">{validatedList.length}건</div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('VALID')}
              className={`p-4 rounded-2xl border text-left transition ${
                statusFilter === 'VALID'
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
              }`}
            >
              <div className="text-xs text-emerald-400 mb-1 flex items-center justify-between">
                <span>유효 발송 대상</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-300">{validCount}건</div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('OPT_OUT_EXCLUDED')}
              className={`p-4 rounded-2xl border text-left transition ${
                statusFilter === 'OPT_OUT_EXCLUDED'
                  ? 'border-rose-500 bg-rose-500/10'
                  : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
              }`}
            >
              <div className="text-xs text-rose-400 mb-1 flex items-center justify-between">
                <span>수신거부 자동제외</span>
                <Ban className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-2xl font-bold text-rose-300">{optOutCount}건</div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('DUPLICATE')}
              className={`p-4 rounded-2xl border text-left transition ${
                statusFilter === 'DUPLICATE'
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
              }`}
            >
              <div className="text-xs text-amber-400 mb-1 flex items-center justify-between">
                <span>중복 이메일 제거</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-amber-300">{duplicateCount}건</div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('INVALID_SYNTAX')}
              className={`p-4 rounded-2xl border text-left transition ${
                statusFilter === 'INVALID_SYNTAX'
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
              }`}
            >
              <div className="text-xs text-orange-400 mb-1 flex items-center justify-between">
                <span>이메일 문법 오류</span>
                <XCircle className="w-4 h-4 text-orange-400" />
              </div>
              <div className="text-2xl font-bold text-orange-300">{syntaxErrCount}건</div>
            </button>
          </div>

          {/* 수신자 검증 결과 테이블 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-white">
                  데이터 검증 및 사전 필터링 결과 ({filteredRecipients.length}건 표시 중)
                </h4>
                <p className="text-xs text-slate-400">
                  문법 오류, 중복 이메일, 수신거부(Opt-Out) DB 일치 항목은 발송 큐에서 자동으로 제외됩니다.
                </p>
              </div>
              <button
                type="button"
                disabled={validCount === 0}
                onClick={onProceedNext}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition shadow-lg shadow-indigo-600/25"
              >
                <span>검증 통과 {validCount}건으로 템플릿 설정 진행</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950/90 text-slate-400 sticky top-0 z-10 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-medium">행 번호</th>
                    <th className="py-3 px-4 font-medium">검증 상태</th>
                    <th className="py-3 px-4 font-medium">이메일 주소</th>
                    <th className="py-3 px-4 font-medium">수신자 이름 ({'{name}'})</th>
                    <th className="py-3 px-4 font-medium">회사명 ({'{company}'})</th>
                    <th className="py-3 px-4 font-medium">추가 치환 변수 미리보기</th>
                    <th className="py-3 px-4 font-medium">검증 사유</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredRecipients.map((item) => {
                    const badgeStyle =
                      item.filterStatus === 'VALID'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : item.filterStatus === 'OPT_OUT_EXCLUDED'
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        : item.filterStatus === 'DUPLICATE'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-orange-500/15 text-orange-300 border-orange-500/30';

                    const extraVars = Object.entries(item.variables).filter(
                      ([k]) => k !== 'name' && k !== 'company' && k !== 'email'
                    );

                    return (
                      <tr
                        key={item.rowIndex}
                        className={`hover:bg-slate-800/40 ${
                          item.filterStatus !== 'VALID' ? 'opacity-75 bg-slate-950/40' : ''
                        }`}
                      >
                        <td className="py-2.5 px-4 font-mono text-slate-400">#{item.rowIndex}</td>
                        <td className="py-2.5 px-4">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full border font-medium ${badgeStyle}`}>
                            {item.filterStatus === 'VALID' && '발송 대상'}
                            {item.filterStatus === 'OPT_OUT_EXCLUDED' && '수신거부 제외'}
                            {item.filterStatus === 'DUPLICATE' && '중복 제외'}
                            {item.filterStatus === 'INVALID_SYNTAX' && '문법 오류'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-200">{item.email}</td>
                        <td className="py-2.5 px-4 text-slate-200">{item.name || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-300">{item.company || '-'}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex flex-wrap gap-1">
                            {extraVars.slice(0, 3).map(([k, v]) => (
                              <span
                                key={k}
                                className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                              >
                                {k}: {v}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">{item.filterDetail}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
