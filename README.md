# MailFlow Pro — 엑셀 기반 대량 이메일 순차 발송 시스템

> 실제 발송 실행과 검증 범위는 [SENDING.md](SENDING.md)를 참고하세요.
> GitHub Pages 공유 링크는 정적 데모입니다. 실제 SMTP 발송에는 `npm start`로 실행한 서버와 계정 인증이 필요합니다.
> Firebase는 Hosting 설정만 있으며 실제 발송 서버 배포는 완료되지 않았습니다.

엑셀(`.xlsx`, `.csv`) 파일에서 수신자 이메일 목록과 개인화 가변 데이터를 불러와, 지정된 랜덤 딜레이 및 배치 휴식(Rate Limiting)으로 순차 발송하는 웹 애플리케이션입니다.
국내 **정보통신망법 제50조 광고성 정보 전송 규정**과 **Google / Yahoo 대량 발송자 기술 요건(RFC 8058 원클릭 수신거부 헤더)**을 준수하도록 설계되었습니다.

## 주요 기능

1. **파일 업로드 & 컬럼 매핑 (Step 1)**
   - `.xlsx` 및 `.csv` 드래그 앤 드롭 업로드 및 15건의 샘플 데이터 원클릭 로드
   - 이메일 주소(필수), 수신자 이름(`{name}`), 회사명(`{company}`) 및 사용자 정의 치환 변수 드롭다운 매핑
   - 이메일 정규식(Syntax) 검증, 중복 이메일 자동 제거, 수신거부(Opt-Out) 블랙리스트 DB 대조 자동 제외
2. **이메일 템플릿 & 법적 컴플라이언스 설정 (Step 2)**
   - HTML 및 Plain Text 템플릿 에디터 + 치환 변수 칩 삽입 + 수신자별 실시간 렌더링 미리보기
   - 정보통신망법 준수: 광고성 메일 선택 시 제목 시작 부분 `(광고)` 강제 삽입, 본문 하단 전송자 명칭·이메일·전화번호·사업장 주소 및 무로그인 즉시 수신거부 링크 자동 결합
   - Google/Yahoo 기술 요건: RFC 8058 `List-Unsubscribe` 및 `List-Unsubscribe-Post: List-Unsubscribe=One-Click` 헤더 자동 생성 및 SPF/DKIM(2048-bit)/DMARC 체크리스트 제공
3. **순차 발송 큐 엔진 & 실시간 대시보드 (Step 3)**
   - 건당 랜덤 딜레이(예: `0.8초 ~ 1.8초`) 및 배치 휴식(예: `5건 발송 후 6초 휴식` 또는 `50건 발송 후 60초 휴식`)
   - 실시간 시작(Start), 일시정지(Pause), 재개(Resume), 취소(Cancel), 초기화(Reset) 제어
   - 시뮬레이션(Dry-Run) 모드, Resend REST API, Amazon SES / SMTP 연동 지원
   - 실시간 진행률 프로그레스 바, 수신자별 상태(`QUEUED`, `SENT`, `BOUNCED`, `FAILED`), 이벤트 로그 콘솔, 발송 결과 `.xlsx` 다운로드

## 로컬 실행

```bash
npm install
npm run dev
# Frontend: http://localhost:5173
# Backend Queue API: http://localhost:4000
```

## Firebase Hosting 배포

1. `.firebaserc.example` 파일을 `.firebaserc`로 복사하고 본인의 Firebase 프로젝트 ID를 입력합니다.
2. 아래 명령으로 빌드 및 배포를 실행합니다:

```bash
npm run deploy:firebase
```
