import * as XLSX from 'xlsx';
import {
  ColumnMapping,
  OptOutEntry,
  RawRow,
  RecipientTask,
  ValidatedRecipient,
} from '../types';

const EMAIL_SYNTAX_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function isValidEmailSyntax(email: string): boolean {
  if (!email) return false;
  return EMAIL_SYNTAX_REGEX.test(email.trim());
}

export const SAMPLE_EXCEL_ROWS: RawRow[] = [
  {
    이메일: 'jihun.kim@samsung-partner.kr',
    수신자명: '김지훈',
    회사명: '삼성파트너스',
    직급: '마케팅 팀장',
    맞춤할인율: '25%',
    담당매니저: '박서연 프로',
  },
  {
    이메일: 'soyeon.lee@naver-cloud.co.kr',
    수신자명: '이소연',
    회사명: '클라우드이노베이션',
    직급: 'CTO',
    맞춤할인율: '30%',
    담당매니저: '최민준 팀장',
  },
  {
    이메일: 'minsu.park@kakao-ventures.io',
    수신자명: '박민수',
    회사명: '벤처스퀘어랩',
    직급: '대표이사',
    맞춤할인율: '20%',
    담당매니저: '박서연 프로',
  },
  {
    이메일: 'optout-user@example.com', // 수신거부 DB 등재 샘플 (자동 제외 확인용)
    수신자명: '정수빈(수신거부자)',
    회사명: '옵트아웃테스트',
    직급: '과장',
    맞춤할인율: '15%',
    담당매니저: '박서연 프로',
  },
  {
    이메일: 'jihun.kim@samsung-partner.kr', // 중복 이메일 샘플 (자동 중복 제거 확인용)
    수신자명: '김지훈(중복행)',
    회사명: '삼성파트너스',
    직급: '마케팅 팀장',
    맞춤할인율: '25%',
    담당매니저: '박서연 프로',
  },
  {
    이메일: 'invalid-email-syntax@@broken..com', // 문법 오류 이메일 샘플 (자동 필터링 확인용)
    수신자명: '오류계정',
    회사명: '테스트상사',
    직급: '사원',
    맞춤할인율: '10%',
    담당매니저: '최민준 팀장',
  },
  {
    이메일: 'hyunjin.choi@hyundai-auto.kr',
    수신자명: '최현진',
    회사명: '오토모빌리티',
    직급: '구매본부장',
    맞춤할인율: '35%',
    담당매니저: '최민준 팀장',
  },
  {
    이메일: 'yuna.kang@toss-fintech.kr',
    수신자명: '강유나',
    회사명: '핀테크코리아',
    직급: '그로스 리드',
    맞춤할인율: '25%',
    담당매니저: '박서연 프로',
  },
  {
    이메일: 'donghyun.lim@coupang-logistics.kr',
    수신자명: '임동현',
    회사명: '로지스틱스플러스',
    직급: '운영이사',
    맞춤할인율: '30%',
    담당매니저: '최민준 팀장',
  },
  {
    이메일: 'unsubscribed@company.co.kr', // 수신거부 DB 등재 샘플 2
    수신자명: '한지민(수신거부)',
    회사명: '컴퍼니코리아',
    직급: '대리',
    맞춤할인율: '15%',
    담당매니저: '박서연 프로',
  },
  {
    이메일: 'seojun.han@lg-cns-demo.kr',
    수신자명: '한서준',
    회사명: '디지털트랜스폼',
    직급: '수석컨설턴트',
    맞춤할인율: '20%',
    담당매니저: '박서연 프로',
  },
  {
    이메일: 'bounce-test@invalid-domain.org', // 하드 바운스 시뮬레이션 샘플
    수신자명: '조성우(반송테스트)',
    회사명: '바운스체크랩',
    직급: '매니저',
    맞춤할인율: '15%',
    담당매니저: '최민준 팀장',
  },
  {
    이메일: 'jiwon.song@woowahan-tech.kr',
    수신자명: '송지원',
    회사명: '우아한테크랩',
    직급: '프로덕트 오너',
    맞춤할인율: '25%',
    담당매니저: '박서연 프로',
  },
  {
    이메일: 'taeyang.yoon@krafton-studio.kr',
    수신자명: '윤태양',
    회사명: '크리에이티브스튜디오',
    직급: '아트디렉터',
    맞춤할인율: '20%',
    담당매니저: '최민준 팀장',
  },
  {
    이메일: 'haeun.baek@musinsa-partners.kr',
    수신자명: '백하은',
    회사명: '패션파트너스',
    직급: 'MD 팀장',
    맞춤할인율: '30%',
    담당매니저: '박서연 프로',
  },
];

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const findCol = (keywords: string[]) =>
    headers.find((h) => keywords.some((k) => h.toLowerCase().includes(k.toLowerCase()))) || '';

  const emailColumn = findCol(['email', 'e-mail', '이메일', '메일주소', '메일']) || headers[0] || '';
  const nameColumn = findCol(['name', '이름', '수신자명', '성명', '고객명']) || headers[1] || '';
  const companyColumn = findCol(['company', 'org', '회사', '회사명', '기업명', '소속']) || headers[2] || '';

  const variableColumns: Record<string, string> = {};
  headers.forEach((h) => {
    if (h === emailColumn) return;
    if (h === nameColumn) {
      variableColumns['name'] = h;
      return;
    }
    if (h === companyColumn) {
      variableColumns['company'] = h;
      return;
    }
    // 한글/영문 컬럼명을 치환 변수 키로 등록
    const cleanKey = h.trim().replace(/\s+/g, '_');
    if (cleanKey) {
      variableColumns[cleanKey] = h;
    }
  });

  if (nameColumn) variableColumns['name'] = nameColumn;
  if (companyColumn) variableColumns['company'] = companyColumn;

  return {
    emailColumn,
    nameColumn,
    companyColumn,
    variableColumns,
  };
}

export function validateAndFilterRows(
  rows: RawRow[],
  mapping: ColumnMapping,
  optOutList: OptOutEntry[]
): ValidatedRecipient[] {
  const seenEmails = new Set<string>();
  const optOutSet = new Set(optOutList.map((o) => o.email.trim().toLowerCase()));

  return rows.map((row, idx) => {
    const rawEmail = (row[mapping.emailColumn] || '').toString().trim();
    const lowerEmail = rawEmail.toLowerCase();
    const name = mapping.nameColumn ? (row[mapping.nameColumn] || '').toString().trim() : '';
    const company = mapping.companyColumn ? (row[mapping.companyColumn] || '').toString().trim() : '';

    const variables: Record<string, string> = {
      name,
      company,
      email: rawEmail,
    };

    for (const [varKey, colName] of Object.entries(mapping.variableColumns)) {
      if (colName && row[colName] !== undefined) {
        variables[varKey] = String(row[colName]).trim();
      }
    }

    if (!isValidEmailSyntax(rawEmail)) {
      return {
        rowIndex: idx + 1,
        email: rawEmail || '(빈 이메일)',
        name,
        company,
        variables,
        filterStatus: 'INVALID_SYNTAX',
        filterDetail: '이메일 주소 형식(Syntax) 오류',
      };
    }

    if (seenEmails.has(lowerEmail)) {
      return {
        rowIndex: idx + 1,
        email: rawEmail,
        name,
        company,
        variables,
        filterStatus: 'DUPLICATE',
        filterDetail: '파일 내 중복된 이메일 주소 자동 제외',
      };
    }

    seenEmails.add(lowerEmail);

    if (optOutSet.has(lowerEmail)) {
      return {
        rowIndex: idx + 1,
        email: rawEmail,
        name,
        company,
        variables,
        filterStatus: 'OPT_OUT_EXCLUDED',
        filterDetail: '수신거부(Opt-Out) DB 등록 대상 자동 제외',
      };
    }

    return {
      rowIndex: idx + 1,
      email: rawEmail,
      name,
      company,
      variables,
      filterStatus: 'VALID',
      filterDetail: '발송 가능 (검증 통과)',
    };
  });
}

// UTF-8 바이트가 Latin-1(ISO-8859-1 / Windows-1252)로 잘못 해석된 문자열(Mojibake) 자동 복원
const WIN1252_EXTRA_MAP: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

export function repairMojibakeString(str: string): string {
  if (!str) return '';
  // 이미 정상 한글이 포함되어 있으면 그대로 반환
  if (/[가-힣]/.test(str)) return str;
  // 전형적인 UTF-8 한글 3바이트(0xEA~0xED ...)가 Latin-1로 깨진 패턴 감지
  if (!/[\u00c0-\u00ff]/.test(str)) return str;

  try {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code <= 0xff) {
        bytes[i] = code;
      } else if (WIN1252_EXTRA_MAP[code] !== undefined) {
        bytes[i] = WIN1252_EXTRA_MAP[code];
      } else {
        return str;
      }
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded;
  } catch {
    return str;
  }
}

export function decodeBufferToTextSmart(buffer: ArrayBuffer): string {
  let text = '';
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    text = utf8Decoder.decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    try {
      const eucKrDecoder = new TextDecoder('euc-kr');
      text = eucKrDecoder.decode(buffer);
    } catch {
      text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
    }
  }
  return repairMojibakeString(text);
}

export async function parseExcelOrCsvFile(file: File): Promise<{ headers: string[]; rows: RawRow[] }> {
  const buffer = await file.arrayBuffer();
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv');
  const workbook = isCsv
    ? XLSX.read(decodeBufferToTextSmart(buffer), { type: 'string', raw: false })
    : XLSX.read(buffer, { type: 'array', codepage: 65001 });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

  if (jsonData.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = Object.keys(jsonData[0]);
  const headers = rawHeaders.map((h) => repairMojibakeString(h));
  const rows: RawRow[] = jsonData.map((item) => {
    const converted: RawRow = {};
    rawHeaders.forEach((rawKey, idx) => {
      const cleanHeader = headers[idx];
      const rawVal = item[rawKey] !== undefined && item[rawKey] !== null ? String(item[rawKey]) : '';
      converted[cleanHeader] = repairMojibakeString(rawVal);
    });
    return converted;
  });

  return { headers, rows };
}

export function downloadSampleExcelFile() {
  const worksheet = XLSX.utils.json_to_sheet(SAMPLE_EXCEL_ROWS);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '수신자목록');
  XLSX.writeFile(workbook, '샘플_대량이메일_수신자목록.xlsx');
}

export function exportCampaignResultToExcel(
  tasks: RecipientTask[],
  excludedRecipients: ValidatedRecipient[],
  campaignTitle: string
) {
  const sentAndQueuedRows = tasks.map((t) => ({
    행번호: t.rowIndex,
    이메일: t.email,
    수신자명: t.name,
    회사명: t.company,
    발송상태: t.status,
    응답코드: t.statusCode || '-',
    적용된제목: t.renderedSubject || '-',
    배치번호: t.batchNumber ? `Batch #${t.batchNumber}` : '-',
    적용딜레이_초: t.delayAppliedMs ? (t.delayAppliedMs / 1000).toFixed(2) : '0',
    발송시각: t.sentAt ? new Date(t.sentAt).toLocaleString('ko-KR') : '-',
    RFC8058_원클릭헤더: t.headersIncluded?.['List-Unsubscribe-Post'] ? '포함됨 (One-Click)' : '미포함',
    메시지ID: t.messageId || '-',
    오류상세: t.errorMessage || '',
  }));

  const excludedRows = excludedRecipients.map((r) => ({
    행번호: r.rowIndex,
    이메일: r.email,
    수신자명: r.name,
    회사명: r.company,
    발송상태: `사전제외 (${r.filterStatus})`,
    응답코드: r.filterStatus,
    적용된제목: '-',
    배치번호: '-',
    적용딜레이_초: '-',
    발송시각: '-',
    RFC8058_원클릭헤더: '-',
    메시지ID: '-',
    오류상세: r.filterDetail || '',
  }));

  const allReportRows = [...sentAndQueuedRows, ...excludedRows].sort((a, b) => a.행번호 - b.행번호);
  const worksheet = XLSX.utils.json_to_sheet(allReportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '발송결과리포트');

  const safeTitle = campaignTitle.replace(/[\\/:*?"<>|]/g, '_');
  XLSX.writeFile(workbook, `${safeTitle}_발송결과.xlsx`);
}
