# Student Activity to Observation (학생활동 → 교사관찰기록 변환)

학생활동 자료를 AI를 활용하여 교사관찰기록 문체로 변환하는 옵시디언 플러그인입니다.

## 주요 기능

- **AI 기반 문체 변환**: OpenAI GPT, Anthropic Claude, Google Gemini, xAI Grok을 사용하여 학생활동 내용을 교사관찰기록 문체로 변환
- **NEIS 기준 계산**: 글자 수 및 바이트 수를 나이스(NEIS) 기준에 맞춰 자동 계산
- **일괄 처리**: 여러 학생의 활동 내용을 한 번에 변환
- **테이블 형식 출력**: 구글 스프레드시트에 바로 붙여넣기 가능한 형식
- **구글 스프레드시트 복사 기능**: 생성된 결과를 TSV 형식으로 복사하여 스프레드시트에 열별로 분리되어 붙여넣기 가능

## 설치 방법

### 수동 설치

1. 릴리즈에서 `main.js`, `manifest.json`, `styles.css` 다운로드
2. Vault의 `.obsidian/plugins/student-activity-to-observation/` 폴더에 복사
3. 옵시디언 설정 → 커뮤니티 플러그인에서 활성화

## 사용 방법

### 1. API 설정

1. 옵시디언 설정 → 학생활동 → 교사관찰기록 변환
2. AI 제공자 선택 (OpenAI, Claude, Gemini, Grok)
3. API 키 입력
4. 기본 목표 글자 수 설정 (선택)

### 2. 데이터 변환

#### 방법 1: Modal 사용

1. 커맨드 팔레트 (`Cmd/Ctrl + P`) 열기
2. "학생활동 → 교사관찰기록 변환 (Modal)" 선택
3. 구글 스프레드시트에서 복사한 데이터 붙여넣기
   - 형식: `학번 [탭] 이름 [탭] 활동내용`
4. 목표 글자 수 조정 (선택)
5. "변환 시작" 클릭

#### 방법 2: 선택 영역에서 변환

1. 노트에서 변환할 데이터 선택
2. 커맨드 팔레트에서 "선택 영역에서 교사관찰기록 변환" 선택

### 3. 결과 확인

변환 완료 후 자동으로 새 노트가 생성됩니다:

- 테이블 형식으로 결과 표시 (학번, 성명, 학생활동기록, 교사관찰기록, 글자 수, 바이트 수)
- 통계 정보 포함

### 4. 구글 스프레드시트에 붙여넣기

생성된 노트 상단에 "📋 구글 스프레드시트용 복사 영역"이 있습니다:

1. 코드 블록 안의 내용을 전체 선택 (Ctrl+A 또는 Cmd+A)
2. 복사 (Ctrl+C 또는 Cmd+C)
3. 구글 스프레드시트에서 붙여넣기 (Ctrl+V 또는 Cmd+V)
4. 자동으로 학번, 성명, 학생활동기록, 교사관찰기록, 글자 수, 바이트 수가 각 열로 분리됩니다

## 입력 데이터 형식

구글 스프레드시트에서 복사한 TSV(탭 구분) 형식:

```
10101	김철수	프로젝트 활동에서 리더 역할을 맡아 팀원들을 이끌었음
10102	이영희	토론 수업에서 적극적으로 참여하여 다양한 의견을 제시함
```

## NEIS 글자수/바이트수 계산 기준

| 문자 유형 | 글자 수 | 바이트 수 |
|----------|--------|----------|
| 한글 | 1 | 3 |
| 한자 | 1 | 3 |
| 영문 | 1 | 1 |
| 숫자 | 1 | 1 |
| 특수문자 | 1 | 1 |
| 공백 | 1 | 1 |
| 줄바꿈 | 1 | 1 |

## 생성되는 교사관찰기록 문체

- 종결어미: "~함", "~보임", "~드러냄", "~보여줌", "~밝힘"
- 역량 표현: "탐구 역량", "문제 해결 능력", "협력과 소통 역량"
- 평가 표현: "깊이 있는", "우수한", "뛰어난", "인상적인", "돋보이는"

## 지원 AI 모델 (2025년 12월 기준)

### OpenAI (GPT)
- GPT-5 (Reasoning) - 최신 추론 모델
- GPT-5 Mini (Reasoning)
- GPT-5 Nano (Reasoning)
- GPT-4o
- GPT-4o Mini (기본값)
- GPT-4 Turbo
- GPT-4
- GPT-3.5 Turbo

### Anthropic (Claude)
- Claude Sonnet 4.5 (기본값, Recommended)
- Claude Opus 4.1 - 가장 강력한 모델
- Claude Opus 4
- Claude Sonnet 4
- Claude Haiku 4.5
- Claude 3.7 Sonnet
- Claude 3.5 Sonnet
- Claude 3.5 Haiku (Fastest)
- Claude 3 Opus
- Claude 3 Haiku

### Google (Gemini)
- Gemini 2.5 Flash (기본값, Stable)
- Gemini 2.5 Flash Lite
- Gemini 2.0 Flash
- Gemini 2.0 Flash (Image Gen)
- Gemini 1.5 Pro
- Gemini 1.5 Flash
- Gemini 1.5 Flash 8B

### xAI (Grok)
- Grok 4
- Grok 4.1 Fast (기본값, Recommended)
- Grok 4.1 Fast (Non-Reasoning)
- Grok 3
- Grok 3 Mini
- Grok Code Fast
- Grok 2 Vision
- Grok 2 Image

## 라이선스

MIT License

## 개발자

**잘생김프로쌤** - [GitHub](https://github.com/bluelion79)

## 문의

이슈나 기능 요청은 [GitHub Issues](https://github.com/bluelion79/obsidian-student-activity-to-observation/issues)를 이용해 주세요.
