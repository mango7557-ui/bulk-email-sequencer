import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  MailCheck,
  Search,
  Trash2,
  RotateCcw,
  Download,
  Eye,
  Send,
  CheckSquare,
  Square,
  CheckCircle2,
  AlertOctagon,
  XCircle,
  X,
  FolderKanban,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { RawRow, SentEmailRecord } from '../types';

interface Step4SentEmailManagerProps {
  sentHistory: SentEmailRecord[];
  onDeleteRecords: (ids: string[]) => Promise<void>;
  onClearAllHistory: () => Promise<void>;
  onResendToRecipients: (rows: RawRow[], label: string) => void;
}

export const Step4SentEmailManager: React.FC<Step4SentEmailManagerProps> = ({
  sentHistory,
  onDeleteRecords,
  onClearAllHistory,
  onResendToRecipients,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SENT' | 'BOUNCED' | 'FAILED'>('ALL');
  const [campaignFilter, setCampaignFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailRecord, setDetailRecord] = useState<SentEmailRecord | null>(null);

  const campaigns = useMemo(() => {
    const map = new Map<string, { id: string; title: string; count: number }>();
    sentHistory.forEach((item) => {
      const existing = map.get(item.campaignId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(item.campaignId, {
          id: item.campaignId,
          title: item.campaignTitle || item.campaignId,
          count: 1,
        });
      }
    });
    return Array.from(map.values());
  }, [sentHistory]);

  const totalCount = sentHistory.length;
  const sentCount = sentHistory.filter((r) => r.status === 'SENT').length;
  const bouncedCount = sentHistory.filter((r) => r.status === 'BOUNCED').length;
  const failedCount = sentHistory.filter((r) => r.status === 'FAILED').length;
  const deliveryRate = totalCount > 0 ? ((sentCount / totalCount) * 100).toFixed(1) : '0.0';

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sentHistory.filter((item) => {
      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchCampaign = campaignFilter === 'ALL' || item.campaignId === campaignFilter;
      const matchQuery =
        !q ||
        item.email.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.company.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.campaignTitle.toLowerCase().includes(q);
      return matchStatus && matchCampaign && matchQuery;
    });
  }, [sentHistory, statusFilter, campaignFilter, searchQuery]);

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAllFiltered = () => {
    const allChecked =
      filteredRecords.length > 0 && filteredRecords.every((r) => selectedIds.has(r.id));
    const next = new Set(selectedIds);
    if (allChecked) {
      filteredRecords.forEach((r) => next.delete(r.id));
    } else {
      filteredRecords.forEach((r) => next.add(r.id));
    }
    setSelectedIds(next);
  };

  const convertRecordsToRows = (records: SentEmailRecord[]): RawRow[] => {
    // 이메일 중복 제거 후 RawRow로 변환
    const seen = new Set<string>();
    const rows: RawRow[] = [];
    for (const r of records) {
      const lower = r.email.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      rows.push({
        이메일: r.email,
        수신자명: r.name,
        회사명: r.company,
        ...r.variables,
      });
    }
    return rows;
  };

  const handleResendSelected = () => {
    const chosen = sentHistory.filter((r) => selectedIds.has(r.id));
    if (chosen.length === 0) return;
    const rows = convertRecordsToRows(chosen);
    onResendToRecipients(rows, `보낸 이메일 선택 재발송 (${rows.length}건)`);
  };

  const handleResendFailedAndBounced = () => {
    const targets = sentHistory.filter((r) => r.status === 'BOUNCED' || r.status === 'FAILED');
    if (targets.length === 0) return;
    const rows = convertRecordsToRows(targets);
    onResendToRecipients(rows, `반송·실패 이메일 재발송 (${rows.length}건)`);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    await onDeleteRecords(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleExportHistoryExcel = () => {
    if (filteredRecords.length === 0) return;
    const sheetRows = filteredRecords.map((r, idx) => ({
      순번: idx + 1,
      캠페인명: r.campaignTitle,
      발송상태: r.status,
      수신자이메일: r.email,
      수신자명: r.name,
      회사명: r.company,
      발송제목: r.subject,
      발신자이메일: r.senderEmail,
      발송프로바이더: r.provider.toUpperCase(),
      응답코드: r.statusCode,
      발송일시: new Date(r.sentAt).toLocaleString('ko-KR'),
      적용딜레이_초: r.delayAppliedMs ? (r.delayAppliedMs / 1000).toFixed(2) : '0',
      메시지ID: r.messageId || '-',
      오류상세: r.errorMessage || '',
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '보낸이메일이력');
    XLSX.writeFile(wb, `보낸이메일_관리내역_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* 상단 통계 카드 4종 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`p-5 rounded-2xl border text-left transition ${
            statusFilter === 'ALL'
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
          }`}
        >
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>누적 보낸 이메일 총계</span>
            <MailCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white">{totalCount}건</div>
          <div className="text-[11px] text-slate-400 mt-1">
            총 {campaigns.length}개 캠페인 기록 보관 중
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('SENT')}
          className={`p-5 rounded-2xl border text-left transition ${
            statusFilter === 'SENT'
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
          }`}
        >
          <div className="text-xs text-emerald-400 mb-1 flex items-center justify-between">
            <span>발송 성공 (SENT)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-300">{sentCount}건</div>
          <div className="text-[11px] text-emerald-400/80 mt-1">
            접수/시뮬레이션 처리율 {deliveryRate}% (도달률 아님)
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('BOUNCED')}
          className={`p-5 rounded-2xl border text-left transition ${
            statusFilter === 'BOUNCED'
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
          }`}
        >
          <div className="text-xs text-amber-400 mb-1 flex items-center justify-between">
            <span>반송됨 (BOUNCED)</span>
            <AlertOctagon className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300">{bouncedCount}건</div>
          <div className="text-[11px] text-amber-400/80 mt-1">
            소프트/하드 바운스 기록
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('FAILED')}
          className={`p-5 rounded-2xl border text-left transition ${
            statusFilter === 'FAILED'
              ? 'border-rose-500 bg-rose-500/10'
              : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
          }`}
        >
          <div className="text-xs text-rose-400 mb-1 flex items-center justify-between">
            <span>발송 실패 (FAILED)</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-300">{failedCount}건</div>
          <div className="text-[11px] text-rose-400/80 mt-1">
            수신거부 차단 / API 오류
          </div>
        </button>
      </div>

      {/* 필터 & 액션 컨트롤 바 */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-indigo-400" />
              보낸 이메일 통합 관리 센터 (Sent Mail & Campaign Archive)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              발송된 이메일의 실제 제목·본문·RFC 8058 헤더를 열람하고, 반송/실패 건이나 특정 수신자를 선택하여 재발송하거나 내역을 초기화할 수 있습니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={handleResendSelected}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold transition"
            >
              <Send className="w-3.5 h-3.5" />
              선택 재발송 ({selectedIds.size}건)
            </button>

            <button
              type="button"
              disabled={bouncedCount + failedCount === 0}
              onClick={handleResendFailedAndBounced}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 text-amber-300 border border-amber-500/30 text-xs font-semibold transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              반송·실패건 일괄 재발송 ({bouncedCount + failedCount}건)
            </button>

            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={handleDeleteSelected}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 text-rose-300 border border-rose-500/30 text-xs font-semibold transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              선택 삭제 ({selectedIds.size})
            </button>

            <button
              type="button"
              disabled={sentHistory.length === 0}
              onClick={() => {
                onClearAllHistory();
                setSelectedIds(new Set());
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-rose-600/20 disabled:opacity-40 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs font-medium transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              보낸 내역 전체 초기화
            </button>

            <button
              type="button"
              disabled={filteredRecords.length === 0}
              onClick={handleExportHistoryExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              보낸 내역 엑셀(.xlsx) 추출
            </button>
          </div>
        </div>

        {/* 캠페인 필터 드롭다운 & 검색창 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="ALL">전체 캠페인 보기 ({sentHistory.length}건)</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.count}건)
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              {(['ALL', 'SENT', 'BOUNCED', 'FAILED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    statusFilter === st
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'ALL' && '전체'}
                  {st === 'SENT' && '성공'}
                  {st === 'BOUNCED' && '반송'}
                  {st === 'FAILED' && '실패'}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이메일, 수신자명, 회사명, 제목 검색..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* 보낸 이메일 목록 테이블 */}
        <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60">
          {filteredRecords.length === 0 ? (
            <div className="p-14 text-center space-y-2">
              <MailCheck className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-300">
                보관된 보낸 이메일 내역이 없습니다
              </div>
              <p className="text-xs text-slate-500">
                [3. 순차 발송 큐 & 실시간 대시보드] 탭에서 이메일을 발송하면 모든 발송 내역과 본문 원문이 이곳에 자동으로 기록됩니다.
              </p>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800 z-10">
                  <tr>
                    <th className="py-3 px-3 w-10">
                      <button
                        type="button"
                        onClick={toggleSelectAllFiltered}
                        className="text-indigo-400 hover:text-indigo-300 flex items-center"
                      >
                        {filteredRecords.length > 0 &&
                        filteredRecords.every((r) => selectedIds.has(r.id)) ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-3 font-medium">상태</th>
                    <th className="py-3 px-3 font-medium">발송 일시</th>
                    <th className="py-3 px-3 font-medium">수신자 (이메일 / 이름 / 소속)</th>
                    <th className="py-3 px-3 font-medium">발송된 제목 & 캠페인</th>
                    <th className="py-3 px-3 font-medium">응답 코드</th>
                    <th className="py-3 px-3 font-medium text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredRecords.map((rec) => {
                    const checked = selectedIds.has(rec.id);
                    const badge =
                      rec.status === 'SENT'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : rec.status === 'BOUNCED'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30';

                    return (
                      <tr
                        key={rec.id}
                        className={`hover:bg-slate-800/40 transition ${
                          checked ? 'bg-indigo-500/10' : ''
                        }`}
                      >
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => toggleSelectOne(rec.id)}
                            className="flex items-center"
                          >
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-indigo-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full border font-semibold text-[11px] ${badge}`}
                          >
                            {rec.status}
                          </span>
                          <div className="text-[11px] text-amber-300">{rec.provider === 'dryrun' ? '모의 발송 · 실제 전송 안 됨' : `${rec.provider} 접수 결과`}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                          {new Date(rec.sentAt).toLocaleString('ko-KR')}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono text-slate-200 font-medium">{rec.email}</div>
                          <div className="text-[11px] text-slate-400">
                            {rec.name || '-'} {rec.company ? `· ${rec.company}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 max-w-xs">
                          <div className="text-slate-100 font-medium truncate" title={rec.subject}>
                            {rec.subject}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            캠페인: {rec.campaignTitle}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono text-[11px] text-slate-300">
                            {rec.statusCode}
                          </div>
                          {rec.errorMessage && (
                            <div className="text-[11px] text-rose-400 truncate max-w-[200px]">
                              {rec.errorMessage}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailRecord(rec)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] transition"
                            >
                              <Eye className="w-3 h-3" />
                              원문 보기
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onResendToRecipients(
                                  convertRecordsToRows([rec]),
                                  `재발송 (${rec.email})`
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px] transition"
                            >
                              <Send className="w-3 h-3" />
                              재발송
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 보낸 이메일 상세 보기 모달 */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div>
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <MailCheck className="w-4 h-4 text-indigo-400" />
                  보낸 이메일 발송 원문 및 헤더 상세 정보
                </h4>
                <p className="text-xs text-slate-400">
                  캠페인: {detailRecord.campaignTitle} | 발송시각:{' '}
                  {new Date(detailRecord.sentAt).toLocaleString('ko-KR')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">{detailRecord.subject}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold">
                    {detailRecord.status} ({detailRecord.statusCode})
                  </span>
                </div>
                <div className="text-slate-400 space-y-1 pt-1 border-t border-slate-800">
                  <div>
                    <strong>보낸사람:</strong> {detailRecord.senderName} &lt;
                    {detailRecord.senderEmail}&gt;
                  </div>
                  <div>
                    <strong>받는사람:</strong> {detailRecord.name || '고객'} (
                    {detailRecord.company || '소속없음'}) &lt;{detailRecord.email}&gt;
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      딜레이: {((detailRecord.delayAppliedMs || 0) / 1000).toFixed(2)}초
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Message-ID: {detailRecord.messageId || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {detailRecord.headersIncluded && (
                <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 font-mono text-[11px] text-slate-300 space-y-1">
                  <div className="text-slate-500">// 포함된 RFC 8058 및 컴플라이언스 헤더</div>
                  {Object.entries(detailRecord.headersIncluded).map(([k, v]) => (
                    <div key={k} className="truncate">
                      <span className="text-indigo-400">{k}:</span> {v}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl bg-white text-slate-900 p-5 border border-slate-300 leading-relaxed text-sm">
                <iframe title="발송 본문" sandbox="" className="w-full h-80" srcDoc={detailRecord.bodyHtml || '<p>본문 없음</p>'} />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const row = convertRecordsToRows([detailRecord]);
                  setDetailRecord(null);
                  onResendToRecipients(row, `재발송 (${detailRecord.email})`);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
              >
                <Send className="w-3.5 h-3.5" />
                이 수신자에게 다시 발송하기
              </button>
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
