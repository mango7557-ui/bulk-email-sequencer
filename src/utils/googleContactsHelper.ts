import * as XLSX from 'xlsx';
import { RawRow } from '../types';

export interface GoogleContactItem {
  id: string;
  email: string;
  name: string;
  company: string;
  title: string;
  phone: string;
  label: string;
  discountRate: string;
  manager: string;
}

export const GMAIL_DEMO_CONTACTS: GoogleContactItem[] = [
  {
    id: 'gc-1',
    email: 'sungho.jung@gmail.com',
    name: '정성호',
    company: '넥스트커머스',
    title: '전략기획 이사',
    phone: '010-3421-8890',
    label: 'VIP 파트너',
    discountRate: '30%',
    manager: '박서연 프로',
  },
  {
    id: 'gc-2',
    email: 'minji.kwon@gmail.com',
    name: '권민지',
    company: '에이아이웍스',
    title: '데이터사이언스 리드',
    phone: '010-9812-4511',
    label: 'VIP 파트너',
    discountRate: '25%',
    manager: '최민준 팀장',
  },
  {
    id: 'gc-3',
    email: 'hyunwoo.seo@gmail.com',
    name: '서현우',
    company: '그린에너지솔루션',
    title: '사업개발 본부장',
    phone: '010-5520-1923',
    label: '기업 고객',
    discountRate: '20%',
    manager: '박서연 프로',
  },
  {
    id: 'gc-4',
    email: 'chaeyoung.moon@gmail.com',
    name: '문채영',
    company: '메디컬바이오랩',
    title: '마케팅 디렉터',
    phone: '010-7741-3309',
    label: '뉴스레터 구독자',
    discountRate: '25%',
    manager: '최민준 팀장',
  },
  {
    id: 'gc-5',
    email: 'dooyoung.hwang@gmail.com',
    name: '황두영',
    company: '스마트팩토리코리아',
    title: '수석엔지니어',
    phone: '010-2190-6654',
    label: '기업 고객',
    discountRate: '35%',
    manager: '박서연 프로',
  },
  {
    id: 'gc-6',
    email: 'yerin.oh@gmail.com',
    name: '오예린',
    company: '브랜드랩스튜디오',
    title: '크리에이티브 디렉터',
    phone: '010-6388-0012',
    label: '뉴스레터 구독자',
    discountRate: '20%',
    manager: '최민준 팀장',
  },
  {
    id: 'gc-7',
    email: 'junho.bae@gmail.com',
    name: '배준호',
    company: '클라우드브릿지',
    title: '클라우드 아키텍트',
    phone: '010-4901-7721',
    label: 'VIP 파트너',
    discountRate: '30%',
    manager: '박서연 프로',
  },
  {
    id: 'gc-8',
    email: 'arin.shin@gmail.com',
    name: '신아린',
    company: '글로벌로지스',
    title: '글로벌소싱 팀장',
    phone: '010-8114-2900',
    label: '기업 고객',
    discountRate: '25%',
    manager: '최민준 팀장',
  },
];

// GoogleContactItem 배열을 엑셀 매핑용 RawRow 배열로 변환
export function convertGoogleContactsToRows(contacts: GoogleContactItem[]): RawRow[] {
  return contacts.map((c) => ({
    이메일: c.email,
    수신자명: c.name,
    회사명: c.company,
    직급: c.title || '담당자',
    전화번호: c.phone || '',
    라벨: c.label || 'Gmail 주소록',
    맞춤할인율: c.discountRate || '20%',
    담당매니저: c.manager || '박서연 프로',
  }));
}

// 브라우저에서 직접 Google People API 호출 (OAuth 2.0 Access Token 사용)
export async function fetchGoogleContactsFromPeopleApi(
  accessToken: string
): Promise<GoogleContactItem[]> {
  const url =
    'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,organizations,phoneNumbers,memberships&pageSize=200';
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken.trim()}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Google People API 인증 실패 (${res.status}). 유효한 OAuth Access Token인지 확인해 주세요.`);
  }

  const data = (await res.json()) as {
    connections?: Array<{
      resourceName?: string;
      names?: Array<{ displayName?: string }>;
      emailAddresses?: Array<{ value?: string }>;
      organizations?: Array<{ name?: string; title?: string }>;
      phoneNumbers?: Array<{ value?: string }>;
    }>;
  };

  const items: GoogleContactItem[] = [];
  (data.connections || []).forEach((person, idx) => {
    const email = person.emailAddresses?.[0]?.value?.trim() || '';
    if (!email) return;
    items.push({
      id: person.resourceName || `people-${idx + 1}`,
      email,
      name: person.names?.[0]?.displayName || email.split('@')[0],
      company: person.organizations?.[0]?.name || '',
      title: person.organizations?.[0]?.title || '담당자',
      phone: person.phoneNumbers?.[0]?.value || '',
      label: 'Gmail 실시간 연동',
      discountRate: '25%',
      manager: '박서연 프로',
    });
  });

  return items;
}

// Google OAuth 2.0 Implicit Popup (Google Identity Services) 실행기
export function launchGoogleOAuthPopup(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cleanClientId = clientId.trim();
    if (!cleanClientId) {
      reject(new Error('Google Cloud OAuth 2.0 Client ID를 입력해 주세요.'));
      return;
    }

    const redirectUri = window.location.origin + window.location.pathname;
    const scope = encodeURIComponent('https://www.googleapis.com/auth/contacts.readonly');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      cleanClientId
    )}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=token&scope=${scope}&include_granted_scopes=true&prompt=select_account`;

    const width = 520;
    const height = 640;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'google_contacts_oauth',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      reject(new Error('팝업 창이 차단되었습니다. 브라우저 팝업 차단을 해제해 주세요.'));
      return;
    }

    const timer = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(timer);
          reject(new Error('Google 로그인 창이 닫혔습니다.'));
          return;
        }
        if (popup.location.origin === window.location.origin) {
          const hash = popup.location.hash;
          if (hash && hash.includes('access_token=')) {
            clearInterval(timer);
            const params = new URLSearchParams(hash.replace(/^#/, ''));
            const token = params.get('access_token');
            popup.close();
            if (token) {
              resolve(token);
            } else {
              reject(new Error('Access Token을 가져오지 못했습니다.'));
            }
          }
        }
      } catch {
        // Cross-origin frame while on accounts.google.com — keep polling
      }
    }, 500);
  });
}

// Google Contacts 내보내기 CSV 또는 vCard(.vcf) 파일 파싱
export async function parseGoogleContactsExportFile(file: File): Promise<GoogleContactItem[]> {
  const fileName = file.name.toLowerCase();

  // 1) vCard (.vcf) 포맷 파싱
  if (fileName.endsWith('.vcf')) {
    const text = await file.text();
    const cards = text.split(/BEGIN:VCARD/i).slice(1);
    const results: GoogleContactItem[] = [];

    cards.forEach((card, idx) => {
      const fnMatch = card.match(/^FN(?:;[^:]*)?:(.+)$/im);
      const emailMatch = card.match(/^EMAIL(?:;[^:]*)?:(.+)$/im);
      const orgMatch = card.match(/^ORG(?:;[^:]*)?:(.+)$/im);
      const titleMatch = card.match(/^TITLE(?:;[^:]*)?:(.+)$/im);
      const telMatch = card.match(/^TEL(?:;[^:]*)?:(.+)$/im);

      const email = emailMatch ? emailMatch[1].trim() : '';
      if (!email) return;

      results.push({
        id: `vcf-${idx + 1}`,
        email,
        name: fnMatch ? fnMatch[1].trim() : email.split('@')[0],
        company: orgMatch ? orgMatch[1].split(';')[0].trim() : '',
        title: titleMatch ? titleMatch[1].trim() : '담당자',
        phone: telMatch ? telMatch[1].trim() : '',
        label: 'Google vCard (.vcf)',
        discountRate: '20%',
        manager: '박서연 프로',
      });
    });

    return results;
  }

  // 2) Google Contacts CSV / Outlook CSV 파싱
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const results: GoogleContactItem[] = [];
  rows.forEach((row, idx) => {
    const findVal = (keys: string[]) => {
      for (const k of Object.keys(row)) {
        if (keys.some((cand) => k.toLowerCase().includes(cand.toLowerCase()))) {
          const val = String(row[k] ?? '').trim();
          if (val) return val;
        }
      }
      return '';
    };

    const email = findVal([
      'e-mail 1 - value',
      'email 1 - value',
      'e-mail address',
      'email address',
      'email',
      '이메일',
      '전자 메일 주소',
    ]);
    if (!email) return;

    const fullName =
      findVal(['name', '이름', '수신자명', '성명']) ||
      `${findVal(['family name', 'last name', '성'])}${findVal(['given name', 'first name', '이름'])}`.trim() ||
      email.split('@')[0];

    const company = findVal([
      'organization 1 - name',
      'organization name',
      'company',
      '회사',
      '회사명',
      '소속',
    ]);

    const title = findVal([
      'organization 1 - title',
      'job title',
      'title',
      '직급',
      '직함',
    ]);

    const phone = findVal([
      'phone 1 - value',
      'mobile phone',
      'primary phone',
      'phone',
      '전화번호',
      '휴대전화',
    ]);

    const label =
      findVal(['group membership', 'labels', 'categories', '라벨', '그룹'])
        .replace(/\*\*\*|\s*:::\s*/g, ' ')
        .trim() || 'Google CSV 주소록';

    results.push({
      id: `gcsv-${idx + 1}`,
      email,
      name: fullName,
      company,
      title: title || '담당자',
      phone,
      label,
      discountRate: '25%',
      manager: '박서연 프로',
    });
  });

  return results;
}
