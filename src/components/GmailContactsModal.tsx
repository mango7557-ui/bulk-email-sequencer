import React, { useEffect, useRef, useState } from 'react';
import {
  Users,
  X,
  RefreshCw,
  KeyRound,
  FileUp,
  CheckSquare,
  Square,
  Search,
  Sparkles,
  UserPlus,
  Replace,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { RawRow } from '../types';
import {
  GMAIL_DEMO_CONTACTS,
  GoogleContactItem,
  convertGoogleContactsToRows,
  fetchGoogleContactsFromPeopleApi,
  launchGoogleOAuthPopup,
  parseGoogleContactsExportFile,
} from '../utils/googleContactsHelper';

interface GmailContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportContacts: (rows: RawRow[], mode: 'merge' | 'replace', sourceLabel: string) => void;
}

export const GmailContactsModal: React.FC<GmailContactsModalProps> = ({
  isOpen,
  onClose,
  onImportContacts,
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'oauth' | 'csv'>('list');
  const [contacts, setContacts] = useState<GoogleContactItem[]>(GMAIL_DEMO_CONTACTS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(GMAIL_DEMO_CONTACTS.map((c) => c.id))
  );
  const [labelFilter, setLabelFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  // OAuth / People API 상태
  const [oauthClientId, setOauthClientId] = useState<string>('');
  const [oauthAccessToken, setOauthAccessToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string>(
    'Gmail 주소록 연락처 8건이 준비되었습니다. 라벨별로 필터링하거나 Google People API / CSV·vCard로 실제 주소록을 불러올 수 있습니다.'
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 모달 열릴 때 서버에 연결된 Google Contacts 커넥터 확인
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const res = await fetch('/api/google-contacts/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '@' }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (Array.isArray(data.contacts) && data.contacts.length > 0) {
            const mapped: GoogleContactItem[] = data.contacts.map(
              (c: Record<string, string>, idx: number) => ({
                id: `srv-gc-${idx + 1}`,
                email: c.이메일,
                name: c.수신자명,
                company: c.회사명,
                title: c.직급 || '담당자',
                phone: c.전화번호 || '',
                label: c.라벨 || 'Gmail 연결 계정',
                discountRate: '25%',
                manager: '박서연 프로',
              })
            );
            setContacts(mapped);
            setSelectedIds(new Set(mapped.map((m) => m.id)));
            setStatusNotice(
              `연결된 Gmail 계정에서 실제 주소록 연락처 ${mapped.length}건을 불러왔습니다.`
            );
          }
        }
      } catch {
        // 정적 호스팅 모드에서는 기본 주소록 세트 유지
      }
    })();
  }, [isOpen]);

  if (!isOpen) return null;

  const allLabels = ['ALL', ...Array.from(new Set(contacts.map((c) => c.label)))];

  const filteredContacts = contacts.filter((c) => {
    const matchLabel = labelFilter === 'ALL' || c.label === labelFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchQuery =
      !q ||
      c.email.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q);
    return matchLabel && matchQuery;
  });

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
    const allSelected = filteredContacts.every((c) => selectedIds.has(c.id));
    const next = new Set(selectedIds);
    if (allSelected) {
      filteredContacts.forEach((c) => next.delete(c.id));
    } else {
      filteredContacts.forEach((c) => next.add(c.id));
    }
    setSelectedIds(next);
  };

  // Google People API (Access Token 직접 호출)
  const handleFetchWithToken = async () => {
    if (!oauthAccessToken.trim()) {
      setStatusNotice('Google OAuth 2.0 Access Token(ya29...)을 입력해 주세요.');
      return;
    }
    setIsLoading(true);
    try {
      const items = await fetchGoogleContactsFromPeopleApi(oauthAccessToken);
      if (items.length === 0) {
        setStatusNotice('해당 Google 계정의 주소록에 이메일이 포함된 연락처가 없습니다.');
      } else {
        setContacts(items);
        setSelectedIds(new Set(items.map((i) => i.id)));
        setLabelFilter('ALL');
        setActiveTab('list');
        setStatusNotice(`Google People API를 통해 실제 연락처 ${items.length}건을 성공적으로 불러왔습니다!`);
      }
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Google People API 호출 실패');
    } finally {
      setIsLoading(false);
    }
  };

  // Google OAuth 팝업 로그인
  const handleOAuthPopupLogin = async () => {
    setIsLoading(true);
    try {
      const token = await launchGoogleOAuthPopup(oauthClientId);
      setOauthAccessToken(token);
      const items = await fetchGoogleContactsFromPeopleApi(token);
      setContacts(items);
      setSelectedIds(new Set(items.map((i) => i.id)));
      setLabelFilter('ALL');
      setActiveTab('list');
      setStatusNotice(`Google 계정 인증 완료 — 연락처 ${items.length}건을 불러왔습니다!`);
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Google OAuth 로그인 실패');
    } finally {
      setIsLoading(false);
    }
  };

  // Google Contacts CSV / vCard(.vcf) 파일 업로드
  const handleContactsFileChange = async (file: File) => {
    setIsLoading(true);
    try {
      const items = await parseGoogleContactsExportFile(file);
      if (items.length === 0) {
        setStatusNotice('파일에서 이메일 주소가 포함된 연락처를 찾지 못했습니다.');
      } else {
        setContacts(items);
        setSelectedIds(new Set(items.map((i) => i.id)));
        setLabelFilter('ALL');
        setActiveTab('list');
        setStatusNotice(`${file.name}에서 Gmail 주소록 연락처 ${items.length}건을 불러왔습니다!`);
      }
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : '주소록 파일 파싱 오류');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImport = () => {
    const chosen = contacts.filter((c) => selectedIds.has(c.id));
    if (chosen.length === 0) return;
    const rows = convertGoogleContactsToRows(chosen);
    onImportContacts(rows, importMode, `Gmail 주소록 (${chosen.length}건)`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 모달 헤더 */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Gmail 주소록 (Google Contacts) 연동 센터
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  People API · CSV · vCard 지원
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Google 주소록의 연락처(이름, 이메일, 회사명, 직급, 라벨)를 가져와 개인화 치환 변수와 자동 매핑합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 연동 방식 선택 탭 */}
        <div className="px-6 pt-3 border-b border-slate-800 bg-slate-900/90 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-t-xl text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            1. Gmail 주소록 선택 & 라벨 필터 ({contacts.length}건)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('oauth')}
            className={`px-4 py-2 rounded-t-xl text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'oauth'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            2. Google OAuth 2.0 / People API 실시간 동기화
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('csv')}
            className={`px-4 py-2 rounded-t-xl text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'csv'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <FileUp className="w-3.5 h-3.5" />
            3. Google 주소록 파일(contacts.csv / .vcf) 업로드
          </button>
        </div>

        {/* 상태 안내 배너 */}
        <div className="px-6 py-2.5 bg-indigo-950/40 border-b border-indigo-500/20 flex items-center justify-between text-xs text-indigo-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>{statusNotice}</span>
          </div>
          {isLoading && (
            <span className="inline-flex items-center gap-1 text-indigo-300 font-semibold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 동기화 중...
            </span>
          )}
        </div>

        {/* 모달 본문 */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'list' && (
            <div className="space-y-4">
              {/* 라벨 필터 & 검색창 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {allLabels.map((lbl) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setLabelFilter(lbl)}
                      className={`px-3 py-1 rounded-xl text-xs font-medium transition ${
                        labelFilter === lbl
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {lbl === 'ALL' ? '전체 라벨' : lbl}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="이름, 이메일, 회사 검색..."
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setContacts(GMAIL_DEMO_CONTACTS);
                      setSelectedIds(new Set(GMAIL_DEMO_CONTACTS.map((c) => c.id)));
                      setStatusNotice('Gmail 샘플 주소록 8건을 다시 불러왔습니다.');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition"
                  >
                    샘플 주소록 복원
                  </button>
                </div>
              </div>

              {/* 주소록 테이블 */}
              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 w-10">
                          <button
                            type="button"
                            onClick={toggleSelectAllFiltered}
                            className="text-indigo-400 hover:text-indigo-300 flex items-center"
                          >
                            {filteredContacts.length > 0 &&
                            filteredContacts.every((c) => selectedIds.has(c.id)) ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </th>
                        <th className="py-2.5 px-3 font-medium">수신자명 ({'{name}'})</th>
                        <th className="py-2.5 px-3 font-medium">Gmail / 이메일</th>
                        <th className="py-2.5 px-3 font-medium">회사명 ({'{company}'})</th>
                        <th className="py-2.5 px-3 font-medium">직급 ({'{직급}'})</th>
                        <th className="py-2.5 px-3 font-medium">연락처</th>
                        <th className="py-2.5 px-3 font-medium">주소록 라벨</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {filteredContacts.map((item) => {
                        const checked = selectedIds.has(item.id);
                        return (
                          <tr
                            key={item.id}
                            onClick={() => toggleSelectOne(item.id)}
                            className={`cursor-pointer transition ${
                              checked ? 'bg-indigo-500/10 hover:bg-indigo-500/15' : 'hover:bg-slate-900'
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              {checked ? (
                                <CheckSquare className="w-4 h-4 text-indigo-400" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-600" />
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-white">{item.name}</td>
                            <td className="py-2.5 px-3 font-mono text-indigo-300">{item.email}</td>
                            <td className="py-2.5 px-3 text-slate-200">{item.company || '-'}</td>
                            <td className="py-2.5 px-3 text-slate-300">{item.title || '-'}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">{item.phone || '-'}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                                {item.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'oauth' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 방법 A: Google OAuth 2.0 Client ID 팝업 인증 */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                    방식 A · OAuth 2.0 팝업 로그인
                  </span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">
                    Google Cloud OAuth Client ID로 로그인
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Google Cloud Console에서 발급받은 웹 애플리케이션용 OAuth 2.0 클라이언트 ID를 입력하면 Google 계정 선택 팝업을 통해 주소록(`contacts.readonly`)을 즉시 가져옵니다.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Google OAuth 2.0 Client ID
                  </label>
                  <input
                    type="text"
                    value={oauthClientId}
                    onChange={(e) => setOauthClientId(e.target.value)}
                    placeholder="1234567890-abcdefg.apps.googleusercontent.com"
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-white font-mono"
                  />
                </div>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleOAuthPopupLogin}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  Google 계정으로 로그인하여 주소록 가져오기
                </button>
              </div>

              {/* 방법 B: Google People API Access Token 직접 입력 */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    방식 B · People API Access Token 즉시 조회
                  </span>
                  <KeyRound className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">
                    OAuth Access Token으로 즉시 동기화
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Google OAuth Playground 등에서 발급받은 <code className="text-indigo-300">contacts.readonly</code> 권한의 Access Token(<code className="text-indigo-300">ya29...</code>)을 입력하면 도메인 등록 없이 즉시 실제 연락처를 불러옵니다.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Google People API Access Token
                  </label>
                  <input
                    type="password"
                    value={oauthAccessToken}
                    onChange={(e) => setOauthAccessToken(e.target.value)}
                    placeholder="ya29.a0AfB_byC..."
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-white font-mono"
                  />
                </div>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleFetchWithToken}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
                >
                  <RefreshCw className="w-4 h-4" />
                  People API에서 내 Gmail 주소록 불러오기
                </button>
              </div>
            </div>
          )}

          {activeTab === 'csv' && (
            <div className="rounded-xl border-2 border-dashed border-slate-700 bg-slate-950/70 p-8 text-center space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.vcf,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleContactsFileChange(f);
                }}
              />
              <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center mx-auto text-blue-400">
                <FileUp className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">
                  Google 주소록(contacts.google.com)에서 내보낸 파일을 선택하세요
                </h4>
                <p className="text-xs text-slate-400 max-w-lg mx-auto">
                  Google 주소록 좌측 메뉴의 <strong>[내보내기]</strong>에서 생성한 <strong>Google CSV (`contacts.csv`)</strong>, <strong>Outlook CSV</strong> 또는 <strong>vCard (`.vcf` — iOS/macOS/Android 주소록)</strong> 파일을 모두 자동으로 인식하여 한글 컬럼으로 매핑합니다.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-lg shadow-indigo-600/20"
                >
                  contacts.csv 또는 .vcf 파일 업로드
                </button>
                <a
                  href="https://contacts.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Google 주소록 열기
                </a>
              </div>
            </div>
          )}
        </div>

        {/* 모달 푸터: 병합(Merge) vs 교체(Replace) 선택 및 적용 버튼 */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-1">반영 방식:</span>
            <button
              type="button"
              onClick={() => setImportMode('merge')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                importMode === 'merge'
                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                  : 'border-slate-800 bg-slate-900 text-slate-400'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              기존 엑셀 목록에 병합 추가 (중복 자동제거)
            </button>
            <button
              type="button"
              onClick={() => setImportMode('replace')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                importMode === 'replace'
                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                  : 'border-slate-800 bg-slate-900 text-slate-400'
              }`}
            >
              <Replace className="w-3.5 h-3.5" />
              선택한 Gmail 주소록으로 전체 교체
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              취소
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={handleConfirmImport}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/25"
            >
              선택한 연락처 {selectedIds.size}건 발송 목록에 적용하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
